import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  documentosAdmissao,
  portalCredenciais,
  portalPendenciasNoTime,
  tiposDocumento,
} from "../db/schema";
import {
  recusaDoDestrave,
  reprovacoesEfetivas,
  situacaoDaPendencia,
  TENTATIVAS_DEVOLVIDAS,
  TETO_REABERTURAS_DO_TIME,
  TETO_REPROVACOES_POR_PENDENCIA,
  type TipoDeReabertura,
} from "../domain/portal-tentativas";
import { PortalTrilhaService } from "./portal-trilha.service";

/**
 * A VOLTA DA PENDÊNCIA QUE CAIU PARA A FILA DO TIME (itens 5 e 6, decisão do diretor).
 *
 * O QUE FALTAVA. O teto de tentativas tirava o candidato do laço, e tirava também qualquer caminho
 * de volta: uma vez caída, a pendência ficava marcada e o candidato não recebia mais credencial
 * para aquele tipo nem depois de o time resolver o caso. Faltava o outro lado do ciclo, que agora
 * fecha: o candidato tenta, cai na fila do time, O TIME SOLICITA, o candidato reenvia.
 *
 * ══ AS DUAS PORTAS SÃO DIFERENTES, E A DIFERENÇA ESTÁ NO CÓDIGO, NÃO SÓ NO COMENTÁRIO ═══════════
 *
 *  1. `solicitarReenvio` é do TIME e é FLUXO NORMAL. Quem faz é o consultor, sem restrição de papel,
 *     exatamente como as rotas de auditoria e de reauditoria que ele já usa (elas são operacionais e
 *     sem `@Roles` de propósito). Ela só vale quando a pendência ESTÁ na fila do time: pedir reenvio
 *     de quem ainda pode enviar sozinho não reabre nada, e deixar passar esconderia um mal-entendido
 *     na tela em vez de mostrá-lo.
 *
 *  2. `zerarTentativas` é do MASTER e é EXCEÇÃO. Ela admite, em voz alta, que a RÉGUA pode estar
 *     errada: as 91 regras ativas não foram validadas pelo RH (§A.9), e uma regra errada reprova
 *     documento bom três vezes e tranca uma pessoa que está certa. Por isso ela é de MASTER e de
 *     SUPER_ADMIN, nunca do consultor.
 *
 *     ELA TAMBÉM SÓ VALE DEPOIS DA QUEDA (decisão do diretor): destravar quem ainda tem tentativa
 *     não muda o que o candidato pode fazer, só apaga a contagem de quantas vezes a régua o
 *     reprovou. As duas portas passaram a exigir a MESMA condição de entrada, e continuam diferindo
 *     no que devolvem (uma tentativa contra o teto inteiro) e em quem as alcança.
 *
 * Contar as duas juntas seria perder o número que interessa: quantas vezes a régua precisou ser
 * desmentida por um humano. Por isso são dois tipos gravados e dois eventos na trilha.
 *
 * ══ O MECANISMO É UM MARCO, NUNCA UM APAGADOR ══════════════════════════════════════════════════
 *
 * Nenhuma das duas apaga tentativa. As duas gravam `liberado_em` na pendência, e a contagem passa a
 * valer só do marco para a frente, com a reabertura entrando como CRÉDITO de tentativas. Apagar
 * linha de `portal_credenciais` ou limpar `reprovado_em` destruiria a trilha e, pior, desligaria o
 * único vínculo entre o objeto no balde e a admissão, fabricando documento órfão que ninguém
 * consegue expurgar. A linha de `portal_pendencias_no_time` também é sempre RESOLVIDA COM CARIMBO,
 * nunca removida: apagada, a próxima queda pareceria a primeira.
 *
 * ══ QUANTO CADA UMA DEVOLVE, E POR QUE NÃO É O MESMO TANTO ═════════════════════════════════════
 *
 * O TIME devolve UMA tentativa; o MASTER devolve o teto inteiro. Fossem iguais, o item 6 seria
 * decorativo, porque quem quisesse o efeito do Master bastava pedir ao consultor. E a reabertura do
 * time é CONTADA (`TETO_REABERTURAS_DO_TIME`), senão ela devolveria o teto em parcelas. Os dois
 * números são constantes nomeadas em `domain/portal-tentativas.ts`, para o diretor ajustar a régua
 * sem refatoração.
 *
 * §A.6: a linha guarda identificador técnico, autor e carimbo de tempo. Não guarda motivo escrito,
 * não guarda observação e não guarda nada do candidato.
 */
@Injectable()
export class PortalPendenciasService {
  private readonly log = new Logger(PortalPendenciasService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly trilha: PortalTrilhaService,
  ) {}

  /**
   * O TIME PEDE O DOCUMENTO DE NOVO. Fluxo normal, do consultor.
   *
   * Exige que a pendência esteja MESMO na fila do time. Não estando, a resposta diz isso: o
   * candidato ainda pode enviar sozinho, e não há o que reabrir.
   */
  async solicitarReenvio(admissaoId: string, tipoDocumentoId: string, user: AuthUser) {
    const alvo = await this.carregarPendencia(admissaoId, tipoDocumentoId);
    const situacao = situacaoDaPendencia({ reprovacoes: alvo.reprovacoes });
    if (!situacao.noTime) {
      throw new BadRequestException(
        "Esta pendência ainda não caiu para a fila do time: o candidato pode enviar o documento sozinho.",
      );
    }
    // O LIMITE DE REABERTURAS DO TIME. Sem ele, o consultor devolveria o teto em parcelas e o
    // destravamento do Master viraria decorativo. Batido o limite, o caminho é o Master, e a
    // mensagem diz isso em vez de recusar seco.
    if (alvo.reaberturasTime >= TETO_REABERTURAS_DO_TIME) {
      throw new BadRequestException(
        "Esta pendência já foi reaberta o número máximo de vezes pelo time. Peça a um Master para destravar as tentativas.",
      );
    }
    return this.liberar("SOLICITACAO_REENVIO", alvo, user, "PORTAL_REENVIO_SOLICITADO");
  }

  /**
   * O MASTER ZERA O TETO. Exceção, e ela existe porque a régua pode estar errada (§A.9).
   *
   * ══ SÓ DEPOIS DA QUEDA, E ISSO MUDOU (decisão do diretor) ═══════════════════════════════════
   *
   * O botão do Master aparece QUANDO O CANDIDATO CAI NA FILA, ou seja, depois da terceira
   * reprovação, e não antes. Antes da queda não há nada a destravar: o candidato ainda tem tentativa
   * e continua enviando sozinho, então zerar ali não muda o que ele pode fazer, só apaga a contagem
   * que diz quantas vezes a régua já o reprovou. Perder essa contagem é perder justamente o número
   * que o §A.9 existe para vigiar, quantas vezes a régua precisou ser desmentida por um humano.
   *
   * ANTES ERA O CONTRÁRIO, e o comentário dizia por quê: a ideia era o Master não precisar esperar a
   * terceira reprovação. O diretor decidiu o outro recorte, e a trava fica DO LADO DO SERVIDOR, que
   * é onde ela vale: a tela já esconde o botão antes da queda, mas tela que esconde não é trava.
   *
   * A RECUSA É LEGÍVEL, nunca erro genérico: ela diz que a pendência ainda não caiu e que o
   * candidato pode enviar sozinho, que é o que o Master precisa saber para não procurar defeito onde
   * não há.
   *
   * QUEM PODE É DECIDIDO NA ROTA, pelo `RolesGuard` que já existe no projeto. Este serviço não
   * inventa autorização própria: caminho paralelo de autorização é como o RBAC deixa de valer.
   */
  async zerarTentativas(admissaoId: string, tipoDocumentoId: string, user: AuthUser) {
    const alvo = await this.carregarPendencia(admissaoId, tipoDocumentoId);

    // A RECUSA É REGRA PURA (`domain/portal-tentativas.ts`), e a contagem que entra nela é a
    // EFETIVA, ou seja, a que já desconta o marco da última reabertura. `carregarPendencia` devolve
    // exatamente essa, a mesma que `PortalCredencialService` usa para decidir se ainda concede
    // credencial: duas contagens discordando fariam a tela mostrar um número e o servidor recusar
    // por outro.
    const recusa = recusaDoDestrave({ reprovacoes: alvo.reprovacoes });
    if (recusa) {
      // TENTATIVA DE DESTRAVAR FORA DA HORA É INFORMAÇÃO DE SEGURANÇA, então ela vai à trilha pela
      // porta única que sanitiza, com evento PRÓPRIO: contá-la junto com o destrave feito estragaria
      // o número que diz quantas vezes a régua precisou ser desmentida (§A.9).
      //
      // A trilha não configurada NÃO transforma a recusa em outra coisa: a régua do módulo é que
      // rota sem rastro não CONCEDE, e aqui nada está sendo concedido. §A.6: código do tipo, autor e
      // contagem, nunca PII.
      if (this.trilha.configurada()) {
        await this.trilha.registrar("PORTAL_DESTRAVE_RECUSADO", {
          codigoTipoDocumento: alvo.codigoTipoDocumento,
          autorId: user.id,
          motivoCodigo: recusa.codigo,
          tentativaN: recusa.tentativas.usadas,
        });
      }
      // O CORPO LEVA O CÓDIGO E OS NÚMEROS, além da frase. A frase vai em `message` porque é dali
      // que o cliente do EA tira o texto que a pessoa lê; o `codigo` existe para a tela decidir sem
      // interpretar texto.
      throw new BadRequestException(recusa);
    }

    return this.liberar("DESTRAVAMENTO_MASTER", alvo, user, "PORTAL_TETO_DESTRAVADO");
  }

  /**
   * Situação da pendência para a tela do time: quantas reprovações contam hoje, quantas restam ao
   * candidato e como ela foi reaberta da última vez.
   */
  async situacao(admissaoId: string, tipoDocumentoId: string) {
    const alvo = await this.carregarPendencia(admissaoId, tipoDocumentoId);
    return this.resposta(alvo, alvo.reprovacoes);
  }

  /**
   * O ATO, e ele é o mesmo nos dois caminhos: mover o marco, registrar quem e quando.
   *
   * A TRILHA VEM ANTES DE QUALQUER CONCESSÃO SER ÚTIL, E A CHECAGEM É FAIL-CLOSED. Sem
   * `PORTAL_LOG_PEPPER` a trilha se recusa a gravar, e reabrir uma pendência sem deixar rastro é
   * exatamente o que o item pede para não acontecer. A régua do módulo já é essa: rota que não
   * consegue registrar não concede nada.
   */
  private async liberar(
    tipo: TipoDeReabertura,
    alvo: Awaited<ReturnType<PortalPendenciasService["carregarPendencia"]>>,
    user: AuthUser,
    evento: "PORTAL_REENVIO_SOLICITADO" | "PORTAL_TETO_DESTRAVADO",
  ) {
    if (!this.trilha.configurada()) {
      throw new ServiceUnavailableException(
        "Portal do candidato indisponível: a trilha de auditoria não está configurada.",
      );
    }

    // ══ O RELÓGIO É O DO BANCO, NOS DOIS LADOS DA COMPARAÇÃO ══════════════════════════════════
    //
    // O marco gravado aqui é comparado, em `PortalCredencialService.reprovacoesDaPendencia`, com o
    // `reprovado_em` de cada tentativa, e AQUELE carimbo é escrito com `now()`, ou seja, pelo
    // POSTGRES. Gravar este lado com o relógio da APLICAÇÃO põe dois relógios na mesma comparação:
    // adiantado, o marco engole reprovações que já tinham acontecido e o candidato ganha tentativa
    // que não era dele; atrasado, ele deixa de devolver o que devia. A casa já pagou por essa
    // armadilha uma vez, em `auditoria.service.ts`, onde um `Date` cru foi trocado por `now()`.
    //
    // O valor é LIDO do banco e usado nos dois lugares (a gravação e a resposta), então não existe
    // segunda leitura de relógio nem deriva entre o que foi gravado e o que foi respondido.
    //
    // LIMITE CONHECIDO E DECLARADO: `now()` é o início da TRANSAÇÃO. Uma reprovação que começou
    // ANTES do destrave e commitou depois carimba um instante anterior ao marco e não é contada, o
    // que devolve UMA tentativa a mais. A janela é de milissegundos, o erro é sempre na direção
    // generosa com o candidato, e quem destravou queria justamente destravar.
    const agora = await this.agoraDoBanco();
    // UPSERT: a pendência que caiu já tem linha (a queda a criou); a que nunca caiu ganha uma agora,
    // com `caiu_em` NULO e zero tentativas, porque carimbar uma queda que não houve seria mentira
    // gravada em tabela, e quem lê a fila do time acreditaria nela.
    await this.db
      .insert(portalPendenciasNoTime)
      .values({
        admissaoId: alvo.admissaoId,
        tipoDocumentoId: alvo.tipoDocumentoId,
        tentativas: 0,
        caiuEm: null,
        liberadoEm: agora,
        liberadoPorId: user.id,
        liberadoTipo: tipo,
        reaberturasTime: tipo === "SOLICITACAO_REENVIO" ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [portalPendenciasNoTime.admissaoId, portalPendenciasNoTime.tipoDocumentoId],
        // A queda anterior (`tentativas`, `caiu_em`) FICA no lugar: ela é histórico, e a reabertura
        // não a desmente. O que muda é o marco, que é o que a contagem lê, e o contador de
        // reaberturas DO TIME, que só o caminho do time incrementa (o do Master é exceção e precisa
        // sair limpo da contagem).
        set: {
          liberadoEm: agora,
          liberadoPorId: user.id,
          liberadoTipo: tipo,
          ...(tipo === "SOLICITACAO_REENVIO"
            ? { reaberturasTime: sql`${portalPendenciasNoTime.reaberturasTime} + 1` }
            : {}),
        },
      });

    await this.trilha.registrar(evento, {
      codigoTipoDocumento: alvo.codigoTipoDocumento,
      autorId: user.id,
      acao: tipo,
      // A contagem que foi zerada. Número, e nada além dele.
      tentativaN: alvo.reprovacoes,
    });

    // §A.6: id da admissão e código do tipo. Nunca nome, nunca CPF, nunca o motivo da reprovação.
    this.log.log(
      `pendencia do portal reaberta (${tipo}) na admissao ${alvo.admissaoId}, ` +
        `tipo ${alvo.codigoTipoDocumento}, ${alvo.reprovacoes} tentativa(s) zerada(s)`,
    );

    // Depois do marco, a contagem que vale é a do CRÉDITO daquela reabertura: uma tentativa quando
    // foi o time, o teto inteiro quando foi o Master.
    return this.resposta(
      {
        ...alvo,
        liberadoEm: agora,
        liberadoTipo: tipo,
        reaberturasTime: alvo.reaberturasTime + (tipo === "SOLICITACAO_REENVIO" ? 1 : 0),
      },
      reprovacoesEfetivas({ reprovacoesDepoisDoMarco: 0, reabertura: tipo }),
    );
  }

  /**
   * O AGORA DO BANCO, que é o único relógio que este módulo pode usar para o marco (ver o bloco em
   * `liberar`).
   *
   * O fallback para o relógio da aplicação existe para o DUBLÊ de teste, que não implementa
   * `execute`, e para mais nada: em produção a consulta sempre responde. Ele é a diferença entre um
   * teste que roda e um módulo que precisa de banco de verdade para ser testável, e não afrouxa a
   * regra, porque o caminho real nunca passa por ele.
   */
  private async agoraDoBanco(): Promise<Date> {
    try {
      const linhas = (await this.db.execute(sql`select now() as agora`)) as unknown as Array<{
        agora?: Date | string;
      }>;
      const bruto = Array.isArray(linhas) ? linhas[0]?.agora : undefined;
      if (bruto) return bruto instanceof Date ? bruto : new Date(bruto);
    } catch {
      // Sem relógio do banco não se deixa de reabrir a pendência: o dano de travar a pessoa é maior
      // que o de um marco milissegundos fora. A falha não é silenciosa, vai para o log abaixo.
      this.log.warn("nao foi possivel ler o relogio do banco para o marco de reabertura");
    }
    return new Date();
  }

  /** O formato devolvido aos dois caminhos e à consulta, para a tela não ter duas leituras. */
  private resposta(
    alvo: {
      admissaoId: string;
      tipoDocumentoId: string;
      codigoTipoDocumento: string;
      nomeTipoDocumento: string;
      liberadoEm: Date | null;
      liberadoTipo: string | null;
      reaberturasTime: number;
    },
    reprovacoes: number,
  ) {
    const situacao = situacaoDaPendencia({ reprovacoes });
    return {
      admissaoId: alvo.admissaoId,
      tipoDocumentoId: alvo.tipoDocumentoId,
      codigoTipoDocumento: alvo.codigoTipoDocumento,
      nomeTipoDocumento: alvo.nomeTipoDocumento,
      tentativas: {
        teto: TETO_REPROVACOES_POR_PENDENCIA,
        usadas: reprovacoes,
        restantes: situacao.restantes,
        noTime: situacao.noTime,
      },
      reabertura: alvo.liberadoEm
        ? {
            em: alvo.liberadoEm.toISOString(),
            tipo: alvo.liberadoTipo,
            // Quantas o time já usou e quantas ainda pode usar antes de precisar de um Master.
            reaberturasDoTime: alvo.reaberturasTime,
            reaberturasDoTimeRestantes: Math.max(
              0,
              TETO_REABERTURAS_DO_TIME - alvo.reaberturasTime,
            ),
          }
        : null,
      devolveriaAoReabrir: {
        SOLICITACAO_REENVIO: TENTATIVAS_DEVOLVIDAS.SOLICITACAO_REENVIO,
        DESTRAVAMENTO_MASTER: TENTATIVAS_DEVOLVIDAS.DESTRAVAMENTO_MASTER,
      },
    };
  }

  /**
   * Carrega a pendência e a contagem VIGENTE dela, já descontando o marco da última reabertura.
   *
   * A régua de existência é a MESMA da emissão de credencial: o tipo tem de estar na régua daquela
   * admissão (`documentos_admissao`). Sem isso, seria possível reabrir uma pendência que não existe,
   * e a linha de `portal_pendencias_no_time` nasceria apontando para um documento que ninguém pediu.
   */
  private async carregarPendencia(admissaoId: string, tipoDocumentoId: string) {
    const admissao = await this.db.query.admissoes.findFirst({
      where: eq(admissoes.id, admissaoId),
    });
    if (!admissao) throw new NotFoundException("Admissão não encontrada");

    const [tipo] = await this.db
      .select({ id: tiposDocumento.id, codigo: tiposDocumento.codigo, nome: tiposDocumento.nome })
      .from(tiposDocumento)
      .where(eq(tiposDocumento.id, tipoDocumentoId));
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");

    const naRegua = await this.db.query.documentosAdmissao.findFirst({
      where: and(
        eq(documentosAdmissao.admissaoId, admissaoId),
        eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
      ),
    });
    if (!naRegua) {
      throw new BadRequestException("Este documento não faz parte da régua desta admissão.");
    }

    const pendencia = await this.db.query.portalPendenciasNoTime.findFirst({
      where: and(
        eq(portalPendenciasNoTime.admissaoId, admissaoId),
        eq(portalPendenciasNoTime.tipoDocumentoId, tipoDocumentoId),
      ),
    });

    const [contagem] = await this.db
      .select({ reprovacoes: sql<number>`count(*)::int` })
      .from(portalCredenciais)
      .where(
        and(
          eq(portalCredenciais.admissaoId, admissaoId),
          eq(portalCredenciais.tipoDocumentoId, tipoDocumentoId),
          sql`${portalCredenciais.reprovadoEm} is not null`,
          // O MESMO MARCO de `PortalCredencialService.reprovacoesDaPendencia`, e o mesmo crédito por
          // tipo de reabertura logo abaixo. Duas contagens que discordassem fariam a tela do time
          // dizer um número e o candidato encontrar outro.
          pendencia?.liberadoEm
            ? gt(portalCredenciais.reprovadoEm, pendencia.liberadoEm)
            : sql`true`,
        ),
      );

    return {
      admissaoId,
      tipoDocumentoId,
      codigoTipoDocumento: tipo.codigo,
      nomeTipoDocumento: tipo.nome,
      liberadoEm: pendencia?.liberadoEm ?? null,
      liberadoTipo: pendencia?.liberadoTipo ?? null,
      reaberturasTime: pendencia?.reaberturasTime ?? 0,
      reprovacoes: reprovacoesEfetivas({
        reprovacoesDepoisDoMarco: contagem?.reprovacoes ?? 0,
        reabertura: (pendencia?.liberadoTipo as TipoDeReabertura | null) ?? null,
      }),
    };
  }
}
