import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CampoExtraidoPortal,
  VereditoDoDocumento as VereditoDaTela,
} from "@ea/shared-types";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatos,
  documentosAdmissao,
  portalConferencia,
  portalCredenciais,
  portalLinks,
  portalPendenciasNoTime,
  regrasAuditoria,
  tiposDocumento,
} from "../db/schema";
import {
  executarCaminhoDoArquivo,
  RecusaDoLeitorErro,
  type PortasCaminhoDoArquivo,
  type VereditoDoDocumento,
} from "../domain/portal-caminho-arquivo";
import {
  emitirCredencialEscrita,
  LIMITES_PORTAL,
  type EstadoEmissaoLink,
} from "../domain/portal-credencial";
import type { MetadadoObjeto } from "../domain/portal-chegada";
import { estadoDaLinha, type MotivoDoLinkMorto } from "../domain/portal-identidade";
import { COLUNAS_DO_LINK } from "./portal-link-colunas";
import {
  AVISO_ARQUIVO_UNICO,
  cabeOutroArquivo,
  MOTIVO_ARQUIVO_UNICO,
} from "../domain/portal-arquivo-unico";
import {
  acabouDeCairParaOTime,
  AVISO_PENDENCIA_NO_TIME,
  queimaTentativa,
  reprovacoesEfetivas,
  situacaoDaPendencia,
  TETO_REPROVACOES_POR_PENDENCIA,
  type Desfecho,
  type TipoDeReabertura,
} from "../domain/portal-tentativas";
import { motivoParaOCandidato, recusaParaOCandidato } from "../domain/portal-motivo-candidato";
import { ESTADO_AGUARDANDO_AUDITORIA, limitarMotivo } from "../domain/auditoria";
import { PortalArmazenamentoService } from "./portal-armazenamento.service";
import { MOTIVO_POR_RECUSA, PortalLeitorService } from "./portal-leitor.service";
import { admissaoOpaca } from "./portal-objeto";
import { PortalTrilhaService } from "./portal-trilha.service";

/** O que a tela precisa para falar de tentativa numa pendência. Números e um aviso fixo (§A.6). */
export interface SituacaoDaTela {
  teto: number;
  usadas: number;
  restantes: number;
  noTime: boolean;
  aviso: string | null;
}

/**
 * O CAMINHO DO ARQUIVO, lado do EA. Duas operações: emitir a credencial e confirmar a chegada.
 *
 * A plataforma principal aparece em três pontos, NENHUM deles com o arquivo: ela identifica (outra
 * frente), assina a credencial e guarda status. O binário vai do navegador do candidato direto para
 * o armazenamento do Google e nunca atravessa este processo.
 *
 * ONDE A CONTAGEM DA EMISSÃO SOBREVIVE A REINÍCIO (exigência 2): na tabela `portal_credenciais`,
 * uma linha por credencial EMITIDA, indexada por `jti_link`. O estado que a régua pura consome é
 * REMONTADO do banco a cada pedido, em `estadoDoLink`, e nunca guardado em memória de processo.
 * Fosse em memória, 26 credenciais pedidas sobreviveriam a um `restart` do serviço, o teto do
 * diretor viraria teatro e o teste unitário continuaria verde mentindo. O `ThrottlerStorage`, que é
 * o molde do limite por CPF do VT, foi DESCARTADO aqui exatamente por isso: ele vive no Redis com
 * expiração e serve a ritmo, não a cota acumulada de um link que dura 72 horas.
 */
/**
 * TTL da conferência persistida (§A.6): 48h, mesmo princípio da staging efêmera. O EA não guarda o
 * que a IA leu além do necessário para o candidato conferir; o sweep de `ExpurgoService` varre por
 * `expurgar_em` vencido.
 */
const TTL_CONFERENCIA_MS = 48 * 60 * 60 * 1000;

@Injectable()
export class PortalCredencialService {
  private readonly log = new Logger(PortalCredencialService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly armazenamento: PortalArmazenamentoService,
    private readonly leitor: PortalLeitorService,
    private readonly trilha: PortalTrilhaService,
  ) {}

  /**
   * Pepper do identificador opaco da admissão. Obrigatório pelo mesmo motivo do pepper da trilha: o
   * nome do objeto atravessa o log do armazenamento do Google, que é um terceiro, e sem pepper o
   * "hash" do id seria calculável por quem tivesse a lista de admissões.
   */
  private pepperObjeto(): string {
    const pepper = (this.config.get<string>("PORTAL_LOG_PEPPER") ?? "").trim();
    if (!pepper) {
      throw new ServiceUnavailableException("Envio de documentos indisponível");
    }
    return pepper;
  }

  /**
   * Remonta o consumo do link a partir do banco. É esta função que torna a exigência 2 durável.
   *
   * RECEBE O HANDLE DE LEITURA em vez de usar `this.db`, e isso é o conserto da corrida, não
   * estilo: ela precisa ler DENTRO da mesma transação que vai gravar. Lendo do pool, a leitura e a
   * escrita são dois atos separados, e entre eles cabe outro pedido inteiro.
   *
   * `extracoes` entra no mesmo lugar porque a leitura é chamada PAGA ao nosso motor, no mesmo
   * projeto do Google que atende a esteira de admissão: quem esgota o teto de extração está tirando
   * a vez de quem está sendo admitido, não só enchendo um bucket.
   */
  private async estadoDoLink(
    leitor: Pick<Database, "select">,
    jtiLink: string,
  ): Promise<EstadoEmissaoLink> {
    const [totais] = await leitor
      .select({
        emitidas: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${portalCredenciais.bytesConcedidos}), 0)::int`,
        extracoes: sql<number>`coalesce(sum(${portalCredenciais.extracoes}), 0)::int`,
      })
      .from(portalCredenciais)
      .where(eq(portalCredenciais.jtiLink, jtiLink));

    // Só os carimbos dentro da janela do ritmo. Trazer a lista inteira de um link de 72 horas para
    // contar dez seria carregar o histórico para responder uma pergunta sobre o último minuto.
    const desde = new Date(Date.now() - LIMITES_PORTAL.JANELA_RITMO_MS);
    const recentes = await leitor
      .select({ criadoEm: portalCredenciais.criadoEm })
      .from(portalCredenciais)
      .where(and(eq(portalCredenciais.jtiLink, jtiLink), gt(portalCredenciais.criadoEm, desde)));

    return {
      emitidas: totais?.emitidas ?? 0,
      bytesConcedidos: totais?.bytes ?? 0,
      extracoes: totais?.extracoes ?? 0,
      emissoesMs: recentes.map((r) => r.criadoEm.getTime()),
    };
  }

  /**
   * QUANTAS REPROVAÇÕES esta PENDÊNCIA já teve. A pendência é a dupla (admissão, tipo de documento),
   * e a chave é essa justamente para o teto sobreviver a link novo, credencial nova e troca de
   * aparelho: fosse por credencial ou por `jti`, pedir outro link zeraria o teto e ele viraria
   * teatro.
   *
   * RECEBE O HANDLE DE LEITURA, pelo mesmo motivo de `estadoDoLink` (o conserto da corrida que já
   * está no módulo): a contagem precisa ser lida DENTRO da transação que grava, senão dois envios
   * simultâneos leem "2", os dois concluem que ainda cabe e os dois passam.
   *
   * O NÚMERO VEM DO BANCO, sempre. Nada de claim no bilhete, de cookie ou de memória de processo:
   * contador que o cliente carrega é contador que o cliente forja, e contador em memória morre no
   * primeiro `restart`.
   */
  private async reprovacoesDaPendencia(
    leitor: Pick<Database, "select">,
    admissaoId: string,
    tipoDocumentoId: string,
  ): Promise<number> {
    // ══ O MARCO DA REABERTURA (itens 5 e 6) ═══════════════════════════════════════════════════
    //
    // A REABERTURA NÃO APAGA TENTATIVA, ELA MOVE UM MARCO. Solicitar o reenvio (o time) e zerar o
    // teto (o Master) gravam `liberado_em` na pendência, e a contagem passa a valer só para o que
    // veio DEPOIS dele. Apagar linha de `portal_credenciais` ou limpar `reprovado_em` destruiria a
    // trilha e desligaria o único vínculo entre o objeto no balde e a admissão, fabricando documento
    // órfão que ninguém consegue expurgar.
    //
    // AS DUAS LEITURAS SÃO FEITAS PELO MESMO HANDLE, então dentro da transação elas herdam a trava
    // por link que fecha a corrida: não existe janela entre ler o marco e contar.
    const [pendencia] = await leitor
      .select({
        liberadoEm: portalPendenciasNoTime.liberadoEm,
        liberadoTipo: portalPendenciasNoTime.liberadoTipo,
      })
      .from(portalPendenciasNoTime)
      .where(
        and(
          eq(portalPendenciasNoTime.admissaoId, admissaoId),
          eq(portalPendenciasNoTime.tipoDocumentoId, tipoDocumentoId),
        ),
      );

    const [linha] = await leitor
      .select({ reprovacoes: sql<number>`count(*)::int` })
      .from(portalCredenciais)
      .where(
        and(
          eq(portalCredenciais.admissaoId, admissaoId),
          eq(portalCredenciais.tipoDocumentoId, tipoDocumentoId),
          sql`${portalCredenciais.reprovadoEm} is not null`,
          pendencia?.liberadoEm
            ? gt(portalCredenciais.reprovadoEm, pendencia.liberadoEm)
            : sql`true`,
        ),
      );

    // QUANTO CADA REABERTURA DEVOLVE É REGRA DE DOMÍNIO, e ela é assimétrica de propósito: o time
    // devolve UMA tentativa, o Master devolve o teto inteiro. Ver `domain/portal-tentativas.ts`.
    return reprovacoesEfetivas({
      reprovacoesDepoisDoMarco: linha?.reprovacoes ?? 0,
      reabertura: (pendencia?.liberadoTipo as TipoDeReabertura | null) ?? null,
    });
  }

  /**
   * QUANTOS ENVIOS DAQUELE TIPO ESTÃO EM ABERTO. É a régua de UM ARQUIVO POR TIPO DE DOCUMENTO, e o
   * porquê dela (o dano do "sistema fica só com o verso") está inteiro em
   * `domain/portal-arquivo-unico.ts`.
   *
   * "EM ABERTO" é a credencial CONFIRMADA (o arquivo chegou de verdade, conferido por metadado do
   * nosso lado) e ainda NÃO REPROVADA. Emitida e nunca usada não conta, senão a rede ruim do
   * candidato o trancaria; reprovada não conta, porque mandar de novo é o fluxo que o teto governa.
   *
   * O MARCO DA REABERTURA VALE AQUI TAMBÉM, e pelo mesmo motivo de `reprovacoesDaPendencia`: o
   * arquivo anterior ao marco é o que o time já viu e mandou refazer. Não descontá-lo deixaria a
   * pendência reaberta barrada pelo envio velho, e a reabertura viraria teatro.
   *
   * RECEBE O HANDLE DE LEITURA pelo mesmo motivo das outras duas contagens deste arquivo: ela é lida
   * DENTRO da transação que grava, sob a trava por link, senão dois pedidos simultâneos leem "zero
   * em aberto" os dois e os dois passam.
   */
  private async enviosEmAbertoDaPendencia(
    leitor: Pick<Database, "select">,
    admissaoId: string,
    tipoDocumentoId: string,
    marco: Date | null,
  ): Promise<number> {
    const [linha] = await leitor
      .select({ emAberto: sql<number>`count(*)::int` })
      .from(portalCredenciais)
      .where(
        and(
          eq(portalCredenciais.admissaoId, admissaoId),
          eq(portalCredenciais.tipoDocumentoId, tipoDocumentoId),
          sql`${portalCredenciais.confirmadoEm} is not null`,
          sql`${portalCredenciais.reprovadoEm} is null`,
          marco ? gt(portalCredenciais.confirmadoEm, marco) : sql`true`,
        ),
      );
    return linha?.emAberto ?? 0;
  }

  /** O marco da última reabertura desta pendência, ou nulo. Lido pelo handle de quem chama. */
  private async marcoDaReabertura(
    leitor: Pick<Database, "select">,
    admissaoId: string,
    tipoDocumentoId: string,
  ): Promise<Date | null> {
    const [pendencia] = await leitor
      .select({ liberadoEm: portalPendenciasNoTime.liberadoEm })
      .from(portalPendenciasNoTime)
      .where(
        and(
          eq(portalPendenciasNoTime.admissaoId, admissaoId),
          eq(portalPendenciasNoTime.tipoDocumentoId, tipoDocumentoId),
        ),
      );
    return pendencia?.liberadoEm ?? null;
  }

  /**
   * Emite a credencial de escrita de UM arquivo.
   *
   * A ORDEM É: decidir, GRAVAR A LINHA, assinar, registrar. Gravar antes de responder é o que torna
   * a cota durável mesmo quando a resposta se perde no 4G do candidato.
   *
   * CONSEQUÊNCIA CONHECIDA, E ELA É DECISÃO DO DIRETOR, NÃO DA FÁBRICA: a cota NÃO volta quando o
   * envio falha. É o preço coerente de contar na emissão, e o efeito real é que um candidato em
   * rede ruim que repete o envio seis vezes queima os 60 MB e trava o próprio link. O ponto de
   * extensão para o dia em que o diretor decidir devolver a cota é `estadoDoLink`: basta a consulta
   * passar a descontar as linhas com `confirmado_em` nulo e já expiradas, sem que nada mais no
   * caminho mude de forma.
   */
  async emitir(entrada: {
    admissaoId: string;
    jtiLink: string;
    codigoTipoDocumento: string;
    contentType: string;
    bytes: number;
    ip?: string | null;
    userAgent?: string | null;
  }) {
    const comum = {
      jtiLink: entrada.jtiLink,
      codigoTipoDocumento: entrada.codigoTipoDocumento,
      tipoPermitido: entrada.contentType,
      bytesMax: entrada.bytes,
      ip: entrada.ip ?? undefined,
      userAgent: entrada.userAgent ?? undefined,
    };

    // NASCE INERTE. Sem bucket, sem conta de serviço ou sem pepper, a rota se recusa a conceder,
    // como o webhook do Pandapé se recusa sem token (§A.5). Conceder "no melhor esforço" aqui seria
    // devolver uma URL que não escreve em lugar nenhum e um documento que nunca chega.
    if (!this.trilha.configurada() || !this.armazenamento.podeEmitir()) {
      this.log.warn("pedido de credencial recusado: portal ainda nao configurado");
      throw new ServiceUnavailableException("Envio de documentos indisponível");
    }

    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: and(eq(tiposDocumento.codigo, entrada.codigoTipoDocumento), eq(tiposDocumento.ativo, true)),
    });
    // O tipo tem de estar na RÉGUA daquela admissão, não só no catálogo: a régua resolve por
    // (cliente + cargo) (§A.3 regra 4), e aceitar qualquer código do catálogo deixaria o candidato
    // escolher enviar documento que ninguém pediu, que é cota gasta e leitura paga à toa.
    const naRegua = tipo
      ? await this.db.query.documentosAdmissao.findFirst({
          where: and(
            eq(documentosAdmissao.admissaoId, entrada.admissaoId),
            eq(documentosAdmissao.tipoDocumentoId, tipo.id),
          ),
        })
      : undefined;

    if (!tipo || !naRegua) {
      await this.trilha.registrar(
        "PORTAL_CREDENCIAL_RECUSADA",
        { ...comum, motivoCodigo: "TIPO_FORA_DA_REGUA" },
        entrada.ip,
      );
      throw new BadRequestException("Este documento não faz parte da sua lista.");
    }

    // ══ O ATO ATÔMICO: DECIDIR E GRAVAR SEM JANELA NO MEIO ══════════════════════════════════════
    //
    // O FURO QUE ISTO FECHA, e ele era real: ler o consumo do link e inserir a credencial eram dois
    // atos separados, sem transação e sem trava. Dois pedidos simultâneos com 24 emitidas liam 24 os
    // dois, os dois concluíam "cabe mais uma" e os dois gravavam, e o link terminava com 26. A
    // contagem era DURÁVEL (sobrevivia a restart, isso estava provado) e mesmo assim VIOLÁVEL, que
    // são coisas diferentes. Vale igual para os 60 MB somados, para o ritmo e para as extrações,
    // porque os quatro saem da MESMA leitura.
    //
    // A TRAVA É `pg_advisory_xact_lock`, E A ESCOLHA TEM MOTIVO. Ela vive no SERVIDOR Postgres, não
    // no processo Node, então ela serializa duas INSTÂNCIAS do backend e não só duas requisições do
    // mesmo processo, que é o caso que a auditoria pediu para cobrir. É `xact`, então o Postgres a
    // solta sozinho no commit ou no rollback: não existe caminho de erro que deixe um link travado.
    // A chave é o `jti` do link, então dois candidatos diferentes nunca esperam um pelo outro.
    //
    // POR QUE NÃO UMA TABELA DE COTA COM `CHECK`: um `CHECK` não conta linhas, então o teto agregado
    // (25 arquivos, 60 MB) exigiria uma segunda tabela somando o que `portal_credenciais` já sabe.
    // Seria um segundo lugar para estar errado, e a divergência entre os dois só apareceria no dia
    // em que o número estivesse errado. O teto POR ARQUIVO, esse sim cabe num `CHECK` de linha, e
    // está na migration 0116 como defesa em profundidade.
    const decisao = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${entrada.jtiLink}, 0))`);

      // A LINHA DO LINK, CONFERIDA AQUI DENTRO (ver `motivoDoLinkMorto`). Vem ANTES de tudo,
      // inclusive do teto de tentativas: quem está com um link revogado não tem o que ouvir sobre
      // a pendência dele, e o único desfecho é "este link não vale mais".
      const linkMorto = await this.motivoDoLinkMorto(tx, entrada.jtiLink);
      if (linkMorto) {
        /*
         * ┌─ DUAS COISAS DIFERENTES, E ELAS SE SEPARARAM AQUI (achado S33) ─────────────────────┐
         * │ AO CANDIDATO vai `EXPIRADA`, e nada muda para ele: é o código que escolhe a frase    │
         * │ ("este link não é mais válido, procure o RH") e o 400, e é ele que mantém revogado,  │
         * │ vencido, bloqueado e suspenso INDISTINGUÍVEIS de fora (itens F9 e L6). Dar ao        │
         * │ candidato o motivo real seria o oráculo que a mensagem única existe para não ser.    │
         * │                                                                                       │
         * │ À TRILHA vai o motivo REAL, que é o conserto: as outras duas portas do portal já     │
         * │ gravavam o estado verdadeiro (`PortalLinkVivoService`, achado S28) e estas duas       │
         * │ gravavam `EXPIRADA` fixo, então O MESMO link bloqueado chegava à Sala De Segurança    │
         * │ como duas coisas conforme a porta que o recusou. O dado sempre esteve na mão: a       │
         * │ leitura já calculava `estadoDaLinha`, e o motivo era descartado com o `.vivo`.        │
         * └───────────────────────────────────────────────────────────────────────────────────────┘
         */
        return { ok: false as const, motivoCodigo: "EXPIRADA" as const, motivoDaTrilha: linkMorto };
      }

      // A leitura acontece DENTRO da trava, e é a mesma régua pura de sempre: a janela deslizante
      // do ritmo, os motivos exatos e as mensagens boas continuam vindo do domínio.
      const estado = await this.estadoDoLink(tx, entrada.jtiLink);

      // O TETO DE TENTATIVAS DO CANDIDATO, LIDO NA MESMA TRAVA. Ele é avaliado ANTES da régua de
      // cota e separado dela de propósito (ver `domain/portal-tentativas.ts`): a cota protege o
      // sistema contra abuso e conta por LINK; isto protege o candidato de um laço e conta por
      // PENDÊNCIA. Vindo primeiro, quem já caiu para o time ouve "a equipe vai analisar", que é
      // verdade e é acionável, em vez de "o arquivo passa do tamanho", que o mandaria tentar de novo
      // um envio que não vai mais acontecer.
      const pendencia = situacaoDaPendencia({
        reprovacoes: await this.reprovacoesDaPendencia(tx, entrada.admissaoId, tipo.id),
      });
      if (pendencia.noTime) {
        return { ok: false as const, motivoCodigo: "TENTATIVAS_ESGOTADAS" as const, motivoDaTrilha: null };
      }

      // ── UM ARQUIVO POR TIPO DE DOCUMENTO (decisão do diretor) ────────────────────────────────
      //
      // O candidato manda frente e verso NO MESMO ARQUIVO. A régua e o dano que ela evita estão em
      // `domain/portal-arquivo-unico.ts`: dois arquivos do mesmo tipo produzem dois objetos e UMA
      // linha em `documentos_admissao`, então o segundo apaga o veredito do primeiro e o sistema
      // fica só com o verso, sem nada falhar.
      //
      // VEM DEPOIS DO TETO de propósito: quem já caiu para a fila do time precisa ouvir "a equipe
      // vai analisar", que é a informação acionável, e não "você já enviou este documento".
      //
      // LIDO SOB A MESMA TRAVA das outras contagens: fora dela, dois toques simultâneos leem "zero
      // em aberto" os dois e os dois sobem arquivo.
      const emAberto = await this.enviosEmAbertoDaPendencia(
        tx,
        entrada.admissaoId,
        tipo.id,
        await this.marcoDaReabertura(tx, entrada.admissaoId, tipo.id),
      );
      if (!cabeOutroArquivo({ enviosEmAberto: emAberto })) {
        return { ok: false as const, motivoCodigo: MOTIVO_ARQUIVO_UNICO, motivoDaTrilha: null };
      }

      const veredito = emitirCredencialEscrita({
        estado,
        admissaoIdOpaco: admissaoOpaca(entrada.admissaoId, this.pepperObjeto()),
        codigoTipoDocumento: tipo.codigo,
        contentType: entrada.contentType,
        bytes: entrada.bytes,
        agoraMs: Date.now(),
      });

      if (!veredito.ok) {
        return { ok: false as const, motivoCodigo: veredito.motivoCodigo, motivoDaTrilha: null };
      }

      // A LINHA VEM ANTES DA URL, e agora ela vem dentro da mesma trava. Ela é a cota; a URL é só
      // transporte.
      const [linha] = await tx
        .insert(portalCredenciais)
        .values({
          jtiLink: entrada.jtiLink,
          admissaoId: entrada.admissaoId,
          tipoDocumentoId: tipo.id,
          objeto: veredito.credencial.objeto,
          contentType: veredito.credencial.tipoAssinado,
          bytesConcedidos: veredito.credencial.bytesMax,
          expiraEm: new Date(veredito.credencial.expiraEm),
        })
        .returning({ id: portalCredenciais.id });

      return { ok: true as const, credencial: veredito.credencial, linhaId: linha.id };
    });

    // A TRILHA FICA FORA DA TRANSAÇÃO, de propósito: evento é registro do que aconteceu, e um
    // rollback não pode apagar o registro de uma tentativa. Fora dela a trava também é solta antes,
    // então nenhum candidato espera a gravação do log de outro.
    if (!decisao.ok) {
      const veredito = decisao;
      // O MOTIVO DA TRILHA É O REAL QUANDO EXISTE, e o do candidato quando não (achado S33). Só o
      // link morto tem os dois; nas demais recusas (ritmo, tamanho, tentativas) o código é um só,
      // e o `??` é o que mantém essas inalteradas.
      const motivoRegistrado = veredito.motivoDaTrilha ?? veredito.motivoCodigo;
      await this.trilha.registrar(
        "PORTAL_CREDENCIAL_RECUSADA",
        { ...comum, motivoCodigo: motivoRegistrado },
        entrada.ip,
      );
      await this.trilha.registrar(
        "PORTAL_LIMITE_ATINGIDO",
        { ...comum, regra: motivoRegistrado, janela: LIMITES_PORTAL.JANELA_RITMO_MS },
        entrada.ip,
      );
      throw new HttpException(
        this.mensagemDeRecusa(veredito.motivoCodigo),
        veredito.motivoCodigo === "RITMO" ? HttpStatus.TOO_MANY_REQUESTS : HttpStatus.BAD_REQUEST,
      );
    }

    const credencial = decisao.credencial;
    const linha = { id: decisao.linhaId };

    // A ASSINATURA VIROU UMA CONVERSA DE REDE, e por isso ela é aguardada. A chave que assinava
    // saiu do EA: quem assina agora é o emissor, no nosso projeto do Google, a partir do BILHETE que
    // leva o método, o objeto e os cabeçalhos escolhidos aqui (condição B1). Nulo continua
    // significando a mesma coisa de sempre, "não deu para emitir", e a rota se recusa.
    const assinada = await this.armazenamento.assinarEscrita(
      credencial.objeto,
      credencial.cabecalhosAssinados,
      // O prazo absoluto que viaja no bilhete é o MESMO que acabou de ser gravado na linha, e não
      // uma segunda leitura do relógio (condição B4, sem deriva entre o banco e o bilhete).
      credencial.expiraEm,
    );
    if (!assinada) {
      // VETO V7: A COTA JÁ FOI DEBITADA, ENTÃO O DANO NÃO PODE SER INVISÍVEL.
      //
      // A linha de `portal_credenciais` foi gravada dentro da transação, antes desta chamada, e ela
      // NÃO é desfeita de propósito: se o emissor tiver assinado e a resposta se perdido na volta, o
      // rollback deixaria objeto no balde SEM a linha que é o único caminho de volta dele para a
      // admissão, ou seja, documento órfão que ninguém consegue expurgar. O comportamento fica.
      //
      // O que muda é que ele deixa de ser silencioso. Sem este evento, a cota é debitada, o
      // candidato é barrado mais tarde por QUANTIDADE, e a Sala De Segurança não tem uma linha
      // explicando por quê. §A.6: sem PII, no padrão dos demais eventos.
      await this.trilha.registrar(
        "PORTAL_EMISSOR_INDISPONIVEL",
        { ...comum, motivoCodigo: "NAO_CONFIGURADO" },
        entrada.ip,
      );
      throw new ServiceUnavailableException("Envio de documentos indisponível");
    }

    await this.trilha.registrar(
      "PORTAL_CREDENCIAL_EMITIDA",
      { ...comum, exp: credencial.expiraEm },
      entrada.ip,
    );

    // §A.6: a URL assinada É credencial. Ela sai daqui para o navegador e NÃO é persistida nem
    // logada, em campo nenhum, no mesmo regime da URL do Pandapé e da do assinado da Clicksign.
    return {
      credencialId: linha.id,
      url: assinada.url,
      // Exatamente os cabeçalhos que o navegador é obrigado a reproduzir. Faltou um, o Google
      // recusa por assinatura inválida, e é essa recusa que faz o teto valer.
      cabecalhos: credencial.cabecalhosAssinados,
      metodo: credencial.metodo,
      expiraEm: new Date(credencial.expiraEm).toISOString(),
      bytesMax: credencial.bytesMax,
    };
  }

  /** Mensagens ao candidato. §A.11: sem travessão, e sem dizer qual teto interno ele encostou. */
  private mensagemDeRecusa(motivo: string): string {
    switch (motivo) {
      case "TAMANHO":
        return "Este arquivo passa do tamanho permitido. Envie um arquivo de até 10 MB.";
      case "QUANTIDADE":
        return "Você já enviou o número máximo de arquivos por este link.";
      case "SOMA":
        return "Você já enviou o volume máximo de arquivos por este link.";
      case "RITMO":
        return "Muitos envios seguidos. Aguarde um minuto e tente de novo.";
      case "FORMATO":
        return "Envie o documento em PDF, JPG ou PNG.";
      case "TENTATIVAS_ESGOTADAS":
        // NUNCA um erro seco. O candidato precisa saber que alguém assumiu o documento dele e que
        // ele não tem mais nada a fazer com aquela pendência.
        return AVISO_PENDENCIA_NO_TIME;
      case MOTIVO_ARQUIVO_UNICO:
        // NUNCA um erro seco: o candidato precisa saber que o envio dele chegou, que frente e verso
        // vão no mesmo arquivo, e a quem recorrer se mandou o arquivo errado.
        return AVISO_ARQUIVO_UNICO;
      case "EXPIRADA":
        // O LINK MORREU NO MEIO DO ENVIO: revogado pelo time, vencido ou suspenso. O candidato não
        // resolve isso sozinho e não adianta ele tentar de novo, então a frase manda ao RH em vez
        // de sugerir uma nova tentativa.
        return "Este link não é mais válido. Procure o RH para receber um link novo.";
      case "EXTRACOES_ESGOTADAS":
        // Antes caía na mensagem genérica, e o candidato ficava sem saber o que fazer. Ele não pode
        // resolver isto sozinho: a leitura automática acabou, e o caminho é falar com o consultor.
        return "A leitura automática deste link acabou. Fale com o seu consultor para continuar.";
      default:
        return "Não foi possível preparar o envio agora.";
    }
  }

  /**
   * Confirma a chegada pelo lado do SERVIDOR e dispara a leitura, nesta ordem (itens G3 e V11).
   *
   * `avisoDoNavegador` chega e não decide nada. Ele existe no contrato para que a ausência de efeito
   * seja testável, e a prova está em `domain/portal-caminho-arquivo.tester.spec.ts`.
   */
  async confirmar(entrada: {
    admissaoId: string;
    jtiLink: string;
    credencialId: string;
    avisoDoNavegador: boolean;
    ip?: string | null;
  }) {
    const linha = await this.db.query.portalCredenciais.findFirst({
      where: and(
        eq(portalCredenciais.id, entrada.credencialId),
        // A admissão vem da SESSÃO, nunca do corpo: o candidato não confirma o envio de outro.
        eq(portalCredenciais.admissaoId, entrada.admissaoId),
      ),
    });
    if (!linha) throw new NotFoundException("Envio não encontrado.");

    // A MESMA CONFERÊNCIA DA EMISSÃO, e ela precisa estar NOS DOIS (auditoria da frente da
    // IDENTIDADE). A confirmação é o ato que dispara a leitura paga pela IA e que ESCREVE o estado
    // do documento: deixá-la de fora significaria que uma sessão de 13h59 continua alterando o
    // prontuário depois da revogação das 14h00, mesmo sem conseguir pedir credencial nova.
    //
    // 404, E A MESMA FRASE DO ENVIO INEXISTENTE, de propósito: o candidato com link morto não
    // precisa descobrir se o `credencialId` que ele tem em mãos existe no nosso banco.
    const linkMorto = await this.motivoDoLinkMorto(this.db, entrada.jtiLink);
    if (linkMorto) {
      // O MOTIVO REAL VAI PARA A TRILHA (achado S33), e a RESPOSTA não muda: continua o mesmo 404
      // com a mesma frase do envio inexistente. Ver o bloco em `emitir`: a indistinção é para
      // fora, a fidelidade é para dentro.
      await this.trilha.registrar(
        "PORTAL_CREDENCIAL_RECUSADA",
        { jtiLink: entrada.jtiLink, motivoCodigo: linkMorto },
        entrada.ip,
      );
      throw new NotFoundException("Envio não encontrado.");
    }

    // Idempotente: repetir a confirmação do que já foi confirmado não reprocessa nem regrava nada.
    // O candidato em rede ruim clica duas vezes, e isso não pode virar segunda leitura paga.
    //
    // O VEREDITO VOLTA NULO AQUI, e isso é consequência direta da §A.6, não esquecimento: o motivo
    // escrito pela IA não é persistido em lugar nenhum, então não há o que reexibir. A contagem de
    // tentativas, essa sim, é durável e volta sempre, porque é dela que a tela tira quantas
    // tentativas ainda restam.
    if (linha.confirmadoEm) {
      return {
        entregue: true,
        sugestao: null,
        jaConfirmado: true,
        veredito: null,
        recusa: null,
        tentativas: await this.situacaoParaATela(linha.admissaoId, linha.tipoDocumentoId),
      };
    }

    const [tipo] = await this.db
      .select({ codigo: tiposDocumento.codigo, nome: tiposDocumento.nome })
      .from(tiposDocumento)
      .where(eq(tiposDocumento.id, linha.tipoDocumentoId));

    const portas = this.portas(
      { id: linha.id, admissaoId: linha.admissaoId, tipoDocumentoId: linha.tipoDocumentoId },
      { codigo: tipo?.codigo ?? "", nome: tipo?.nome ?? "" },
      entrada,
    );
    const resultado = await executarCaminhoDoArquivo(portas, {
      credencial: {
        objeto: linha.objeto,
        tipoAssinado: linha.contentType,
        bytesMax: linha.bytesConcedidos,
      },
      codigoTipoDocumento: tipo?.codigo ?? "",
      avisoDoNavegador: entrada.avisoDoNavegador,
    });

    // PERSISTE o resultado da IA (bugs 4/5/6): os campos que ela leu e o veredito redigido deixam de
    // ser efêmeros, e a trilha passa a devolvê-los para a tela reidratar "conferir" / "ajustar" /
    // "aceito" ao navegar e ao recarregar. DISPLAY-ONLY: não entra em contagem de teto, gate nem no
    // caminho do GI (C4/C5/C10). Só grava quando há o que mostrar (campos lidos ou um veredito),
    // nunca no ramo idempotente (`confirmadoEm`), que retorna antes.
    // §A.6 [C7]: nenhum log daqui imprime `campos`/`valor`; a persistência é a única saída deles, e
    // é para a tela, com TTL 48h e anulação na confirmação do GI.
    const camposDaConferencia = resultado.sugestao?.campos ?? [];
    if (camposDaConferencia.length > 0 || resultado.veredito) {
      await this.persistirConferencia(
        linha.admissaoId,
        linha.tipoDocumentoId,
        camposDaConferencia,
        resultado.veredito as VereditoDaTela | null,
      );
    }

    // A CONTAGEM É LIDA DO BANCO DEPOIS DO CAMINHO, e não montada a partir do que aconteceu na
    // memória deste pedido: quem queima tentativa é `registrarDesfecho`, que já gravou, e reler é o
    // que garante que a tela mostre o mesmo número que o próximo pedido de credencial vai usar.
    return {
      ...resultado,
      jaConfirmado: false,
      tentativas: await this.situacaoParaATela(linha.admissaoId, linha.tipoDocumentoId),
    };
  }

  /**
   * UPSERT da conferência por (admissão + tipo). É o que torna DURÁVEL o resultado que a IA leu, e
   * o veto V12 fica de pé: isto é SUGESTÃO, marcada `confirmado_em=null`, anulada na confirmação do
   * GI. `expurgar_em` nasce com TTL 48h (minimização, §A.6).
   *
   * §A.6: nenhum log aqui, e nenhum valor sai daqui a não ser pela trilha (no-store, private). O
   * `veredito` é o REDIGIDO (lista fechada do EA), nunca o motivo cru do modelo (C8), porque quem o
   * monta é `motivoParaOCandidato`, no caminho do arquivo.
   */
  private async persistirConferencia(
    admissaoId: string,
    tipoDocumentoId: string,
    campos: CampoExtraidoPortal[],
    veredito: VereditoDaTela | null,
  ): Promise<void> {
    const expurgarEm = new Date(Date.now() + TTL_CONFERENCIA_MS);
    await this.db
      .insert(portalConferencia)
      .values({ admissaoId, tipoDocumentoId, campos, veredito, confirmadoEm: null, expurgarEm })
      .onConflictDoUpdate({
        target: [portalConferencia.admissaoId, portalConferencia.tipoDocumentoId],
        set: { campos, veredito, confirmadoEm: null, expurgarEm, atualizadoEm: sql`now()` },
      });
  }

  /**
   * O QUE A TELA PRECISA PARA FALAR DE TENTATIVA: quantas restam e se a pendência já é do time.
   *
   * §A.6: números e um aviso de texto FIXO. Nada daqui é dado pessoal, e nada daqui é o motivo da
   * reprovação, que é texto livre e viaja só no veredito.
   *
   * PÚBLICO, e a mudança foi SÓ a visibilidade (§A.26). Quem passou a consumi-lo é a trilha da tela
   * do candidato (`PortalDocumentosService`), que precisa exatamente deste formato por pendência.
   * A alternativa era ele recontar as reprovações por conta própria, e aí seriam TRÊS leitores
   * independentes do número que TRANCA a pessoa fora do documento, cada um livre para divergir.
   */
  /**
   * POR QUE ESTE LINK MORREU, OU NULO SE ELE ESTÁ VIVO. A pergunta que faltava, e a falta era um
   * furo de 30 minutos.
   *
   * ┌─ ELE DEVOLVIA UM BOOLEANO, E O MOTIVO IA PARA O LIXO (achado S33) ──────────────────────────┐
   * │ `estadoDaLinha` já calcula QUAL dos quatro estados matou o link, e esta leitura ficava só   │
   * │ com o `.vivo`. As duas portas daqui então gravavam `EXPIRADA` fixo, enquanto as duas de     │
   * │ `PortalLinkVivoService` (corrigidas no S28) gravavam o estado real: sobre O MESMO link      │
   * │ bloqueado, a Sala De Segurança lia duas histórias conforme a porta. Devolver o motivo custa │
   * │ zero, porque o dado já estava na mão.                                                        │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ┌─ O QUE ISTO FECHA, achado pela auditoria da frente da IDENTIDADE ───────────────────────────┐
   * │ A sessão do candidato vale 30 minutos e, até aqui, NINGUÉM reconsultava a linha do link      │
   * │ depois de a sessão nascer. O consultor revogava o link às 14h00 porque ele tinha vazado, e   │
   * │ quem estivesse com uma sessão das 13h59 continuava pedindo credencial e ESCREVENDO no nosso  │
   * │ armazenamento até 14h29. A revogação parecia imediata na tela do time e não era.             │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * É UMA LEITURA DE UMA LINHA POR `jti`, por chave primária, DENTRO da transação que já tomou o
   * `pg_advisory_xact_lock` daquele mesmo link. Custo desprezível ali, e é o único lugar onde ela
   * não corre com uma revogação concorrente.
   *
   * A RÉGUA É A MESMA DA IDENTIFICAÇÃO (`estadoDaLinha`), e não uma segunda cópia: revogado,
   * vencido e suspenso matam o link nos dois lugares, e o NOME de cada um sai da mesma
   * `motivoDoLinkMorto`. Régua repetida diverge no primeiro ajuste, e a divergência aqui seria "a
   * identificação recusa e a emissão aceita".
   *
   * LINHA AUSENTE É LINK MORTO. Enquanto a tabela `portal_links` não existir no ambiente, isso
   * FECHARIA o portal inteiro, e por isso a chamada é feita só quando há tabela para consultar: um
   * erro de consulta vira link morto, que é a direção segura, e não exceção solta no fluxo.
   */
  private async motivoDoLinkMorto(
    leitor: Pick<Database, "select">,
    jtiLink: string,
  ): Promise<MotivoDoLinkMorto | null> {
    const [linha] = await leitor
      // A PROJEÇÃO DO ESTADO VEM DE UM LUGAR SÓ (`COLUNAS_DO_LINK`): coluna esquecida aqui vira
      // "sem restrição" dentro de `estadoDaLinha`, e esta porta é a que ESCREVE no armazenamento.
      .select({ ...COLUNAS_DO_LINK })
      .from(portalLinks)
      // SEM `.limit(1)`: a busca é por CHAVE PRIMÁRIA, então o limite não economiza nada e a
      // forma fica idêntica à das outras leituras deste arquivo.
      .where(eq(portalLinks.id, jtiLink));
    // NULO É LINK VIVO, e o valor nunca é inventado: quem nomeia é `motivoDoLinkMorto`, a função
    // pura do domínio que `estadoDaLinha` já chama, com a precedência REVOGADO > BLOQUEADO >
    // SUSPENSO > VENCIDO provada lá. Sem `?? "EXPIRADA"` de propósito: um valor de segurança aqui
    // reintroduziria, para um caso inalcançável, a mentira que este conserto tirou.
    return estadoDaLinha(linha, Date.now()).motivoCodigo;
  }

  async situacaoParaATela(admissaoId: string, tipoDocumentoId: string) {
    const usadas = await this.reprovacoesDaPendencia(this.db, admissaoId, tipoDocumentoId);
    return this.montarSituacao(usadas);
  }

  /**
   * A MESMA SITUAÇÃO, DE TODAS AS PENDÊNCIAS DA ADMISSÃO, EM DUAS CONSULTAS.
   *
   * ┌─ POR QUE ELA EXISTE ────────────────────────────────────────────────────────────────────────┐
   * │ `PortalDocumentosService.passos` chamava a versão unitária DENTRO do laço, uma vez por       │
   * │ documento, e cada chamada dela são DUAS consultas (o marco e a contagem). A régua média tem  │
   * │ 11 documentos e a maior tem 32: a tela que o candidato abre no 4G custava até 64 idas ao     │
   * │ banco, todas com a mesma forma, para responder à mesma pergunta em lote.                     │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O UNITÁRIO VIROU CASO PARTICULAR DESTA, e não o contrário: os dois passam pela MESMA régua de
   * domínio (`reprovacoesEfetivas` e `situacaoDaPendencia`) e pelo MESMO montador
   * (`montarSituacao`). Quem duplica a régua para "otimizar o lote" cria a segunda verdade sobre o
   * número que TRANCA a pessoa fora do documento, e a divergência só aparece no dia em que ele
   * estiver errado.
   *
   * O CAMINHO DE ESCRITA NÃO PASSA POR AQUI, de propósito: `emitir` continua lendo o unitário
   * DENTRO da transação, com o handle da `tx`, sob o `pg_advisory_xact_lock`. Esta versão lê do
   * pool porque responde a uma TELA, onde não há nada a serializar.
   *
   * §A.6: números e um aviso de texto FIXO, por tipo de documento. Nada aqui é dado pessoal.
   */
  async situacoesParaATela(admissaoId: string) {
    const marcos = await this.db
      .select({
        tipoDocumentoId: portalPendenciasNoTime.tipoDocumentoId,
        liberadoEm: portalPendenciasNoTime.liberadoEm,
        liberadoTipo: portalPendenciasNoTime.liberadoTipo,
      })
      .from(portalPendenciasNoTime)
      .where(eq(portalPendenciasNoTime.admissaoId, admissaoId));

    // A CONTAGEM VEM AGRUPADA, e o marco é aplicado NO SQL, por tipo: o `case` abaixo é a tradução
    // exata do `gt(reprovadoEm, liberadoEm)` do unitário. Trazer todas as linhas e filtrar em
    // JavaScript daria o mesmo número e traria para a memória do processo uma lista que cresce com
    // o histórico de envios da admissão.
    const contagens = await this.db
      .select({
        tipoDocumentoId: portalCredenciais.tipoDocumentoId,
        reprovacoes: sql<number>`count(*)::int`,
      })
      .from(portalCredenciais)
      .leftJoin(
        portalPendenciasNoTime,
        and(
          eq(portalPendenciasNoTime.admissaoId, portalCredenciais.admissaoId),
          eq(portalPendenciasNoTime.tipoDocumentoId, portalCredenciais.tipoDocumentoId),
        ),
      )
      .where(
        and(
          eq(portalCredenciais.admissaoId, admissaoId),
          sql`${portalCredenciais.reprovadoEm} is not null`,
          sql`(${portalPendenciasNoTime.liberadoEm} is null or ${portalCredenciais.reprovadoEm} > ${portalPendenciasNoTime.liberadoEm})`,
        ),
      )
      .groupBy(portalCredenciais.tipoDocumentoId);

    const reaberturaPorTipo = new Map<string, TipoDeReabertura | null>(
      marcos.map((m) => [m.tipoDocumentoId, (m.liberadoTipo as TipoDeReabertura | null) ?? null]),
    );
    const depoisDoMarcoPorTipo = new Map<string, number>(
      contagens.map((c) => [c.tipoDocumentoId, c.reprovacoes]),
    );

    // TODO TIPO QUE APARECE EM QUALQUER DAS DUAS CONSULTAS ENTRA NO MAPA. Quem não aparecer em
    // nenhuma é pendência sem histórico, e o chamador resolve com `situacaoDe`, que devolve a
    // situação de zero reprovação sem precisar de linha nenhuma.
    const tipos = new Set<string>([...reaberturaPorTipo.keys(), ...depoisDoMarcoPorTipo.keys()]);
    const mapa = new Map<string, SituacaoDaTela>();
    for (const tipoDocumentoId of tipos) {
      const usadas = reprovacoesEfetivas({
        reprovacoesDepoisDoMarco: depoisDoMarcoPorTipo.get(tipoDocumentoId) ?? 0,
        reabertura: reaberturaPorTipo.get(tipoDocumentoId) ?? null,
      });
      mapa.set(tipoDocumentoId, this.montarSituacao(usadas));
    }
    return mapa;
  }

  /**
   * A SITUAÇÃO DE UM TIPO, A PARTIR DO LOTE. Caso particular explícito, para o chamador não ter de
   * decidir sozinho o que significa "tipo ausente do mapa" (é zero reprovação, não é erro).
   */
  situacaoDe(mapa: Map<string, SituacaoDaTela>, tipoDocumentoId: string): SituacaoDaTela {
    return mapa.get(tipoDocumentoId) ?? this.montarSituacao(0);
  }

  /** O formato que a tela consome. UM lugar só, para o lote e o unitário nunca divergirem. */
  private montarSituacao(usadas: number): SituacaoDaTela {
    const situacao = situacaoDaPendencia({ reprovacoes: usadas });
    return {
      teto: TETO_REPROVACOES_POR_PENDENCIA,
      usadas,
      restantes: situacao.restantes,
      noTime: situacao.noTime,
      // O aviso só existe quando ele é verdade. Mandar a frase sempre treinaria a tela a exibi-la
      // fora de hora, e ela diz que alguém assumiu o documento.
      aviso: situacao.noTime ? AVISO_PENDENCIA_NO_TIME : null,
    };
  }

  /**
   * CABE OUTRO ARQUIVO NESTA PENDÊNCIA? O MESMO NÚMERO DA EMISSÃO, LIDO PELA TELA.
   *
   * LEITURA PURA, e NADA de comportamento novo: ela compõe as duas leituras que a emissão já faz
   * (`marcoDaReabertura` e `enviosEmAbertoDaPendencia`) e as entrega à MESMA régua de domínio
   * (`cabeOutroArquivo`). Não existe segunda definição de "envio em aberto" nascendo aqui.
   *
   * POR QUE ELA PRECISOU EXISTIR (veto D-2, a tela promete e a emissão nega): a casa do candidato
   * era decidida só por `documentos_admissao.estado` mais o teto, e o estado NÃO sabe de envio em
   * aberto. O caminho provado: o candidato envia, a credencial fica confirmada e não reprovada, a
   * AUDITORIA escreve `INCONFORME` (estado que o portal nunca escreve) sem tocar `reprovado_em` nem
   * `liberado_em`. A casa saía `AJUSTAR`, com botão de envio, e a emissão recusava com
   * `ARQUIVO_JA_ENVIADO`. Recontar do outro lado criaria a segunda verdade sobre o número; por isso
   * o dono continua sendo este serviço, e a trilha PERGUNTA.
   *
   * O CAMINHO DE ESCRITA NÃO PASSA POR AQUI, de propósito: `emitir` continua lendo DENTRO da
   * transação, com o handle da `tx`, sob o `pg_advisory_xact_lock`. Esta versão lê do pool porque
   * responde a uma TELA, onde não há nada a serializar: no pior caso ela mostra a casa de um
   * instante atrás, e quem decide de verdade continua sendo a emissão, sob a trava.
   *
   * §A.6: devolve um booleano. Nada aqui é dado pessoal.
   */
  async cabeOutroArquivoNaPendencia(admissaoId: string, tipoDocumentoId: string): Promise<boolean> {
    const marco = await this.marcoDaReabertura(this.db, admissaoId, tipoDocumentoId);
    const emAberto = await this.enviosEmAbertoDaPendencia(
      this.db,
      admissaoId,
      tipoDocumentoId,
      marco,
    );
    return cabeOutroArquivo({ enviosEmAberto: emAberto });
  }

  /**
   * As portas concretas do caminho. Ficam juntas de propósito: é o único lugar onde o orquestrador
   * puro encosta em banco, rede e trilha, e vê-las lado a lado é o que permite conferir que nenhuma
   * delas grava campo lido pela IA.
   *
   * QUEM CONFIRMA A CHEGADA É O BACKEND, ANTES DE CHAMAR O LEITOR, e essa ordem é decisão do
   * coordenador, não detalhe de implementação. A confirmação é o veto V11: é ela que decide o
   * ESTADO DO DOCUMENTO, e não pode depender da resposta de um serviço que existe justamente para
   * abrir arquivo hostil. Se o leitor cair, for comprometido ou simplesmente mentir, o estado do
   * documento já foi decidido por uma consulta nossa, direto ao armazenamento.
   *
   * O metadado que o LEITOR devolve não substitui o nosso: ele é CONFRONTADO com o nosso, e
   * divergência de tamanho ou de geração é evento de segurança registrado, nunca empate ignorado.
   * Divergir significa que o objeto mudou entre a nossa conferência e a leitura dele, o que só
   * acontece por sobrescrita, e sobrescrita é exatamente o que a credencial proíbe.
   */
  /**
   * REGISTRA O DESFECHO DE UMA TENTATIVA, e é o único lugar que queima tentativa do candidato.
   *
   * QUEM INCREMENTA É O SERVIDOR, no mesmo ato em que o veredito é conhecido, e nunca algo que o
   * cliente reporte. O carimbo vai na LINHA da credencial (`reprovado_em`), que é durável, e a
   * contagem é sempre relida do banco: não existe contador em memória nem no bilhete.
   *
   * A gravação é IDEMPOTENTE (só carimba linha ainda sem carimbo), então uma confirmação repetida
   * não queima duas tentativas. `confirmar` já é idempotente por fora, e esta é a segunda rede.
   *
   * O REGISTRO DA QUEDA PARA A FILA DO TIME é de BORDA: acontece uma vez, na tentativa que ATINGE o
   * teto, por cima de um `unique` por pendência. Assim o carimbo guardado é o da queda, e não o do
   * último clique de quem insistiu.
   *
   * §A.6: guarda NÚMERO e CARIMBO DE TEMPO. Não guarda o nome do objeto, não guarda o motivo escrito
   * pela IA (texto livre é por onde a PII volta ao log) e não guarda histórico de arquivo.
   */
  private async registrarDesfecho(
    desfecho: Desfecho,
    credencial: { id: string; admissaoId: string; tipoDocumentoId: string },
    codigoTipoDocumento: string,
    registrar: (tipo: string, dados?: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    // FALHA AQUI NÃO PODE SER MUDA, e ela era. Este método roda DENTRO de `lerComIa`, cujo `catch`
    // em `executarCaminhoDoArquivo` engole qualquer exceção para não devolver erro a quem acabou de
    // subir um documento que chegou de verdade. O efeito colateral era o pior tipo de silêncio: a
    // tentativa já queimada pelo `update`, e a linha da queda e o evento `PORTAL_LIMITE_ATINGIDO`
    // se perdendo sem rastro nenhum. Foi assim que um defeito desta frente ficou invisível.
    //
    // Mesmo padrão da INT-4 (§A.5): falhar ao notificar não derruba o envelope, vira ERRO no log.
    // §A.6: a mensagem leva o tipo do desfecho e o código do tipo de documento, nunca PII.
    try {
      await this.registrarDesfechoOuFalhar(desfecho, credencial, codigoTipoDocumento, registrar);
    } catch (erro) {
      this.log.error(
        `falha ao registrar o desfecho da tentativa (desfecho=${desfecho.tipo}, ` +
          `tipo=${codigoTipoDocumento}): a contagem do teto pode ter ficado para tras`,
        erro as Error,
      );
    }
  }

  private async registrarDesfechoOuFalhar(
    desfecho: Desfecho,
    credencial: { id: string; admissaoId: string; tipoDocumentoId: string },
    codigoTipoDocumento: string,
    registrar: (tipo: string, dados?: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    if (!queimaTentativa(desfecho)) return;

    const carimbadas = await this.db
      .update(portalCredenciais)
      .set({ reprovadoEm: sql`now()` })
      .where(
        and(
          eq(portalCredenciais.id, credencial.id),
          sql`${portalCredenciais.reprovadoEm} is null`,
        ),
      )
      .returning({ id: portalCredenciais.id });
    if (carimbadas.length === 0) return; // já contava: nada a recontar.

    const reprovacoes = await this.reprovacoesDaPendencia(
      this.db,
      credencial.admissaoId,
      credencial.tipoDocumentoId,
    );
    await registrar("PORTAL_UPLOAD_RECUSADO", {
      codigoTipoDocumento,
      motivoCodigo: "REPROVADO",
      tentativaN: reprovacoes,
    });

    if (!acabouDeCairParaOTime(reprovacoes)) return;

    // A PENDÊNCIA VIROU TRABALHO DO TIME. A linha responde "quantas tentativas houve" e "quando
    // caiu"; o evento leva a mesma informação à trilha, pela porta única que sanitiza.
    //
    // O CAMINHO DE VOLTA EXISTE DESDE OS ITENS 5 E 6 (decisão do diretor), e ele está em
    // `PortalPendenciasService`: o TIME solicita o reenvio (fluxo normal) e o MASTER zera o teto
    // (exceção, que admite que a régua pode estar errada, §A.9). Os dois gravam `liberado_em`, e a
    // contagem acima passa a valer só do marco para a frente.
    //
    // POR ISSO O `onConflictDoNothing` VIROU UPSERT CONDICIONAL: a pendência reaberta pode cair de
    // novo, e a linha precisa carimbar a NOVA queda. O `setWhere` preserva a idempotência original,
    // que é o que importa: pendência que caiu e NUNCA foi reaberta não reescreve a data da queda
    // quando alguém insiste. Só a que foi reaberta é recarimbada, e o carimbo é o da queda nova.
    //
    // `liberado_em` NÃO é limpado aqui, de propósito: ele é o marco da contagem, não um sinalizador
    // de estado. Limpá-lo faria as reprovações antigas voltarem a contar de uma vez.
    await this.db
      .insert(portalPendenciasNoTime)
      .values({
        admissaoId: credencial.admissaoId,
        tipoDocumentoId: credencial.tipoDocumentoId,
        tentativas: reprovacoes,
        caiuEm: new Date(),
      })
      .onConflictDoUpdate({
        target: [portalPendenciasNoTime.admissaoId, portalPendenciasNoTime.tipoDocumentoId],
        set: { tentativas: reprovacoes, caiuEm: sql`now()` },
        setWhere: sql`${portalPendenciasNoTime.liberadoEm} is not null`,
      });
    await registrar("PORTAL_LIMITE_ATINGIDO", {
      codigoTipoDocumento,
      motivoCodigo: "TENTATIVAS_ESGOTADAS",
      regra: "TENTATIVAS_ESGOTADAS",
      tentativaN: reprovacoes,
    });
    this.log.log(
      `pendencia do portal foi para a fila do time apos ${TETO_REPROVACOES_POR_PENDENCIA} reprovacoes ` +
        `(tipo ${codigoTipoDocumento})`,
    );
  }

  private portas(
    credencial: { id: string; admissaoId: string; tipoDocumentoId: string },
    tipoDocumento: { codigo: string; nome: string },
    entrada: { jtiLink: string; ip?: string | null },
  ): PortasCaminhoDoArquivo {
    // O metadado que NÓS confirmamos, guardado para o confronto com o do leitor. Vive no fecho da
    // função porque o contrato do orquestrador não passa metadado adiante, e não deve mesmo: quem
    // lê não precisa saber o que a confirmação viu, senão a conferência vira uma cópia da outra.
    let nossoMetadado: MetadadoObjeto | null = null;
    // Quantos campos a IA REALMENTE leu. Fica no fecho porque o evento da trilha é disparado pelo
    // orquestrador, que só sabe quantas entradas o catálogo tinha, e a pergunta da Camada L é outra:
    // quanto o auto-preenchimento de fato aproveitou. §A.6: um NÚMERO, nunca os valores.
    let camposLidos = 0;

    const registrar = async (tipo: string, dados?: Record<string, unknown>) => {
      await this.trilha.registrar(
        tipo as Parameters<PortalTrilhaService["registrar"]>[0],
        { ...(dados ?? {}), jtiLink: entrada.jtiLink, ip: entrada.ip ?? undefined },
        entrada.ip,
      );
    };

    return {
      consultarMetadado: async (objeto) => {
        nossoMetadado = await this.armazenamento.consultarMetadado(objeto);
        return nossoMetadado;
      },

      lerComIa: async (contexto) => {
        // Inerte enquanto o leitor não estiver configurado. Lançar aqui faz o caminho seguir pelo
        // ramo já testado: documento confirmado, objeto intacto, sugestão nula, candidato digita.
        if (!this.leitor.configurado()) throw new Error("leitor do portal nao configurado");

        // O nome e o CPF vêm da NOSSA base, nunca do documento e nunca do cliente: é com eles que a
        // régua confere o que está escrito no papel (§A.6, item G5). Transitam em memória e não são
        // logados em lugar nenhum deste caminho.
        const [pessoa] = await this.db
          .select({ nome: candidatos.nome, cpf: candidatos.cpf })
          .from(admissoes)
          .innerJoin(candidatos, eq(admissoes.candidatoCpf, candidatos.cpf))
          .where(eq(admissoes.id, credencial.admissaoId));
        if (!pessoa) throw new Error("candidato da admissao nao encontrado");

        const regras = await this.db
          .select({ descricaoRegra: regrasAuditoria.descricaoRegra })
          .from(regrasAuditoria)
          .where(
            and(
              eq(regrasAuditoria.tipoDocumentoId, credencial.tipoDocumentoId),
              eq(regrasAuditoria.ativo, true),
            ),
          );

        const resposta = await this.leitor.ler({
          bucket: this.armazenamento.nomeDoBucket(),
          objeto: contexto.credencial.objeto,
          tipoDocumentoCodigo: tipoDocumento.codigo,
          tipoDocumentoNome: tipoDocumento.nome,
          candidato: { nome: pessoa.nome, cpf: pessoa.cpf },
          regras,
        });

        // ── O CONFRONTO. Duas conferências independentes do MESMO objeto têm de concordar. ──
        const chegada = resposta.chegada;
        if (nossoMetadado && chegada) {
          if (typeof chegada.tamanhoBytes === "number" && chegada.tamanhoBytes !== nossoMetadado.bytes) {
            await registrar("PORTAL_UPLOAD_RECUSADO", {
              codigoTipoDocumento: tipoDocumento.codigo,
              motivoCodigo: "TAMANHO",
              bytes: chegada.tamanhoBytes,
            });
          }
          if (
            typeof chegada.geracao === "number" &&
            typeof nossoMetadado.geracao === "number" &&
            chegada.geracao !== nossoMetadado.geracao
          ) {
            await registrar("PORTAL_UPLOAD_RECUSADO", {
              codigoTipoDocumento: tipoDocumento.codigo,
              motivoCodigo: "OBJETO_DIVERGENTE",
            });
          }
        }

        // ── EXIGÊNCIA 10: O TIPO CORRIGIDO POR NÓS, DEPOIS DA LEITURA. ──
        // A fonte da verdade é o `mimeDetectado`, dos magic bytes, e NUNCA o que o cliente declarou
        // ao subir. Cliente engana: o iPhone manda HEIC dizendo JPEG. A correção usa a conta de
        // LEITURA, nunca a credencial do candidato, que é PUT de objeto novo e não pode tocar
        // objeto existente.
        const detectado = (chegada?.mimeDetectado ?? "").trim().toLowerCase();
        if (detectado && detectado !== contexto.credencial.tipoAssinado) {
          await registrar("PORTAL_UPLOAD_RECUSADO", {
            codigoTipoDocumento: tipoDocumento.codigo,
            motivoCodigo: "FORMATO",
            formato: detectado,
            tipoPermitido: contexto.credencial.tipoAssinado,
          });
          await this.armazenamento.corrigirContentType(contexto.credencial.objeto, detectado);
        }

        // Recusa do LEITOR é resposta normal, não erro: arquivo com senha, com conteúdo ativo, com
        // página ou dimensão demais. Vira evento com o motivo preciso, que é o valor da trilha, e
        // então lança para o caminho tratar como leitura sem sugestão.
        //
        // O OBJETO RECUSADO PELO LEITOR CONTINUA NÃO SENDO APAGADO, E O MOTIVO MUDOU. Não é mais
        // falta de permissão: a curadoria apaga desde o modelo híbrido. É que `marcarEntregue` já
        // rodou ANTES desta leitura, então apagar aqui deixaria o documento em AGUARDANDO_AUDITORIA
        // apontando para um objeto que não existe mais, e o auditor abriria o vazio. Resolver exige
        // devolver o documento a PENDENTE, e `documentos_admissao` é lido pela Auditoria, pelo
        // Gerenciador, pela Esteira e pelos KPIs de pendência: é alcance de §A.26 e é decisão do
        // diretor, não da fábrica. Enquanto isso, este objeto fica para a rede de proteção do ciclo
        // de vida do balde.
        if (!resposta.aceito) {
          const codigoRecusa = MOTIVO_POR_RECUSA[(resposta.recusa ?? "").toUpperCase()] ?? "FORMATO";
          await registrar("PORTAL_UPLOAD_RECUSADO", {
            codigoTipoDocumento: tipoDocumento.codigo,
            motivoCodigo: codigoRecusa,
          });
          // A MAIORIA DAS RECUSAS DO LEITOR NÃO QUEIMA TENTATIVA. Tamanho, páginas, dimensão,
          // formato e tempo são o ARQUIVO que não coube, não o DOCUMENTO que não serve, e contá-los
          // derrubaria o candidato com uma foto grande de celular em três toques. A régua fechada
          // do que queima vive em `domain/portal-tentativas.ts`.
          await this.registrarDesfecho(
            { tipo: "RECUSA_DO_LEITOR", codigo: codigoRecusa },
            credencial,
            tipoDocumento.codigo,
            registrar,
          );
          // O MOTIVO DO LEITOR VIAJA DE VOLTA (item 4). Antes este ramo lançava um erro genérico e o
          // candidato ouvia "não deu para ler": quem mandou PDF com senha nunca soube que bastava
          // mandar a via sem senha. O texto é o do leitor, fixo, sem PII e sem conteúdo do arquivo;
          // ele NÃO é gravado em lugar nenhum, só devolvido na resposta.
          // A FRASE É NOSSA, ESCOLHIDA PELO CÓDIGO. O texto que o leitor mandou junto não atravessa,
          // pela mesma régua do motivo da IA: quem escreve o que o candidato lê é o EA, num lugar só.
          const paraOCandidato = recusaParaOCandidato(codigoRecusa);
          throw new RecusaDoLeitorErro({
            codigo: codigoRecusa,
            codigoMensagem: paraOCandidato.codigo,
            mensagem: paraOCandidato.mensagem,
          });
        }

        // ── O VEREDITO DA AUDITORIA, E O TETO DE TENTATIVAS DO CANDIDATO. ──
        // Reprovado (INCONFORME) e não decidido por ilegibilidade (PENDENTE) chegam aqui com
        // `valido: false`, e é isso que queima uma das três tentativas daquela pendência.
        //
        // A CONDIÇÃO OLHA `regras.length`, E NÃO A PRESENÇA DO BLOCO. Medido contra o serviço de IA
        // real (`ai-service/app/routers/portal.py`, o ramo de "sem regra ativa"): quando o tipo não
        // tem regra cadastrada, o leitor devolve um bloco de auditoria PRESENTE, com `valido=false`
        // e `status="PENDENTE"`, cujo motivo é "validação manual necessária". Isso é ESCALADA ao
        // humano (§A.9: sem regra, a IA nem é chamada), e NÃO é reprovação do candidato. Guardar só
        // por `if (resposta.auditoria)` fazia um tipo sem regra queimar as três tentativas e derrubar
        // a pessoa para a fila do time sem uma única reprovação de verdade, que é exatamente o
        // "contar envio em vez de reprovação" entrando pela porta menos óbvia.
        //
        // A LISTA DE REGRAS É A PROVA, e ela é a MESMA que foi enviada ao leitor, montada poucas
        // linhas acima: lista vazia significa que ninguém tinha critério para julgar.
        //
        // ISTO NÃO MUDA O ESTADO DO DOCUMENTO, de propósito: quem escreve `documentos_admissao` no
        // Portal é `marcarEntregue`, e ele já rodou, deixando o documento em AGUARDANDO_AUDITORIA.
        // A fila do time é essa, a que sempre existiu no modal da aba Auditoria da Esteira. Nenhuma
        // fila nova nasce do teto.
        if (resposta.auditoria && regras.length > 0) {
          await this.registrarDesfecho(
            { tipo: "VEREDITO", valido: resposta.auditoria.valido === true },
            credencial,
            tipoDocumento.codigo,
            registrar,
          );

          // ══ O MOTIVO COMPLETO FICA PARA QUEM OPERA, E A RÉGUA É "COMPLETO PARA O TIME,
          //    RECORTADO PARA O CANDIDATO" ═══════════════════════════════════════════════════════
          //
          // O documento do Portal chegava à fila do time SEM MOTIVO NENHUM: `marcarEntregue` grava
          // só o estado, e nada no módulo escrevia `observacao`. O time recebia a pendência e não
          // tinha o que dizer ao candidato ao solicitar o reenvio (item 5), que é justamente a
          // conversa que aquele item existe para viabilizar. Na esteira o motivo sempre foi gravado
          // aqui; no Portal, não era, e o comentário que dizia o contrário era instrução errada para
          // quem viesse depois.
          //
          // O QUE VAI PARA CADA LADO: aqui vai o motivo INTEIRO da IA, como na esteira, porque quem
          // lê é consultor com crachá. Para o candidato vai a frase de lista fechada, redigida pelo
          // EA (`motivoParaOCandidato`), justamente porque o texto do modelo pode carregar PII de
          // terceiro e copia o critério interno da regra.
          //
          // O ESTADO NÃO MUDA, de propósito: continua `AGUARDANDO_AUDITORIA`. Quem decide o estado
          // do documento do Portal é a confirmação por metadado, e ela prova só que existe objeto do
          // tamanho declarado (ver `marcarEntregue`). As duas guardas do `where` são as mesmas de
          // sempre: nunca por cima de veredito humano, nunca por cima de documento já resolvido.
          await this.db
            .update(documentosAdmissao)
            .set({ observacao: limitarMotivo(resposta.auditoria.motivo) })
            .where(
              and(
                eq(documentosAdmissao.admissaoId, credencial.admissaoId),
                eq(documentosAdmissao.tipoDocumentoId, credencial.tipoDocumentoId),
                eq(documentosAdmissao.estado, ESTADO_AGUARDANDO_AUDITORIA),
                sql`${documentosAdmissao.validadoPorId} is null`,
              ),
            );
        }

        // ── O AUTO-PREENCHIMENTO, que é a segunda metade da resposta do leitor. ──
        //
        // §A.6, E ESTE É O PONTO MAIS SENSÍVEL DESTE ARQUIVO: `valor` é PII PURA (nome, nome da mãe,
        // data de nascimento, número de documento). Ele pode viajar na RESPOSTA, porque é para isso
        // que existe, e vai direto para a tela do candidato conferir. Ele NÃO é persistido em lugar
        // nenhum deste caminho, NÃO entra em evento da trilha (a allowlist de
        // `domain/portal-evento.ts` descarta `campos` e `valores`), NÃO entra em `marcarEntregue` e
        // NÃO entra em mensagem de erro: as exceções daqui carregam rótulo fixo, nunca conteúdo.
        //
        // VETO V12, E A GUARDA É ATIVA, NÃO CONFIANÇA: se o leitor algum dia parar de afirmar que a
        // sugestão exige confirmação humana, as sugestões são DESCARTADAS inteiras. Abster-se é o
        // comportamento seguro; tratar como conferido o que ninguém conferiu é o dano da §A.33
        // aplicado a dado pessoal.
        const bloco = resposta.sugestoes ?? null;
        const sugestoesValidas =
          bloco && bloco.exigeConfirmacaoHumana === true && bloco.origem === "IA_SUGESTAO";
        if (bloco && !sugestoesValidas) {
          // Sem valor nenhum na mensagem, de propósito.
          this.log.error("sugestoes do leitor descartadas: bloco sem marca de confirmacao humana");
        }

        // LISTA, alinhada ao `SugestaoExtraida`/`CampoExtraidoPortal` do `shared-types` (item 5).
        // Antes era um mapa `campo -> {...}`; agora é a lista que o `ai-service` já produz e que a
        // tela do candidato consome. SÓ os campos de EXTRAÇÃO do leitor entram aqui (nome, RG,
        // nascimento, filiação, etc.), que são os preenchíveis pela pessoa. Os rótulos de
        // AUDITORIA (`camposConferidos`: Legibilidade, Foto, Assinatura, Tipo de documento) NÃO
        // entram: eles chegavam como itens vazios ("não consegui ler este campo") e poluíam a tela
        // de conferência com campos que o candidato não tem como preencher.
        const campos: CampoExtraidoPortal[] = [];
        for (const campo of sugestoesValidas ? bloco.campos : []) {
          // A tela precisa das entradas NÃO LIDAS também: é assim que ela sabe o que ainda tem de
          // perguntar ao candidato. Por isso o catálogo inteiro atravessa, e não só o que foi lido.
          campos.push({
            campo: campo.campo,
            rotulo: campo.rotulo,
            valor: campo.lido ? campo.valor : "",
            confianca: campo.lido ? campo.confianca : 0,
            lido: campo.lido === true,
          });
          if (campo.lido) camposLidos += 1;
        }

        // ── O VEREDITO VOLTA PARA QUEM ENVIOU (item 4, decisão do diretor). ──
        //
        // Ele era DESCARTADO aqui: o documento ia a AGUARDANDO_AUDITORIA e a reprovação nunca
        // chegava ao candidato, então o time voltava a caçar a pessoa, que é o custo que o Portal
        // existe para eliminar. Agora ele atravessa, com o MOTIVO, dizendo o que corrigir.
        //
        // A CONDIÇÃO É A MESMA DO TETO, `regras.length > 0`, e isso é deliberado: tipo SEM regra
        // ativa recebe do leitor um bloco com `valido=false` e `status=PENDENTE` cujo motivo é
        // "validação manual necessária". Isso é ESCALADA ao humano (§A.9), não reprovação do
        // candidato, e mostrá-lo como veredito diria à pessoa que o documento dela está errado
        // quando ninguém tinha critério para julgar. Mesma régua nos dois lugares, por construção.
        //
        // §A.6: `motivo` é texto livre da IA, endereçado à TELA. Ele não é persistido, não entra na
        // trilha e não entra em log, aqui nem em lugar nenhum deste caminho.
        // A REDAÇÃO ACONTECE AQUI, E O TEXTO DO MODELO MORRE AQUI. `motivoParaOCandidato` LÊ o motivo
        // para escolher a categoria e devolve uma frase de lista fechada, escrita por nós. O motivo
        // cru não é copiado para campo nenhum do retorno: não há onde ele caiba.
        const veredito: VereditoDoDocumento | null =
          resposta.auditoria && regras.length > 0
            ? (() => {
                const redigido = motivoParaOCandidato({
                  status: resposta.auditoria.status,
                  motivo: resposta.auditoria.motivo,
                });
                return {
                  status: resposta.auditoria.status,
                  valido: resposta.auditoria.valido === true,
                  codigo: redigido.codigo,
                  mensagem: redigido.mensagem,
                };
              })()
            : null;

        // `origem: "IA"` mais `confirmadoPorHumano: false` são postos pelo orquestrador
        // (`domain/portal-caminho-arquivo.ts`) e é o que marca isto como sugestão para quem consome.
        return { campos, origem: "IA" as const, veredito };
      },

      marcarEntregue: async ({ bytes, formato }) => {
        await this.db
          .update(portalCredenciais)
          .set({ confirmadoEm: sql`now()`, bytesConfirmados: bytes })
          .where(eq(portalCredenciais.id, credencial.id));

        // §A.26, e este é o ponto de maior ALCANCE desta entrega: `documentos_admissao` é lido pela
        // Auditoria, pelo Gerenciador, pela Esteira e pelos KPIs de pendência.
        //
        // O ESTADO ESCRITO É `AGUARDANDO_AUDITORIA`, E NÃO `ENTREGUE`. Medido em
        // `regua/regua-completude.service.ts`: `ENTREGUE` é o estado que zera a pendência
        // obrigatória, e régua obrigatória completa fecha a frente AUDITORIA SOZINHA (§A.3 regra 2
        // complemento), o que abriria o gate do Cadastro. A confirmação por metadado prova que
        // existe objeto com o tamanho e o TIPO QUE O PRÓPRIO CLIENTE DECLAROU, e nada mais: um
        // compactado renomeado passaria. Carimbar `ENTREGUE` com essa prova fecharia a auditoria de
        // uma admissão inteira sem ninguém ter olhado o documento.
        // `AGUARDANDO_AUDITORIA` já existe e significa exatamente "chegou e ainda não foi
        // auditado", que é o estado real. O veto V11 fica cumprido do mesmo jeito: o documento só
        // sai de PENDENTE depois da confirmação do lado do servidor.
        // Se o diretor decidir que a confirmação por metadado basta para ENTREGUE, é esta linha que
        // muda, e mais nenhuma.
        await this.db
          .update(documentosAdmissao)
          .set({ estado: "AGUARDANDO_AUDITORIA" })
          .where(
            and(
              eq(documentosAdmissao.admissaoId, credencial.admissaoId),
              eq(documentosAdmissao.tipoDocumentoId, credencial.tipoDocumentoId),
              // NUNCA por cima de veredito HUMANO nem de documento já resolvido. A precedência da
              // validação humana sobre a automação é regra da casa (ver `documentos_admissao`).
              eq(documentosAdmissao.estado, "PENDENTE"),
              sql`${documentosAdmissao.validadoPorId} is null`,
            ),
          );

        this.log.log(`documento do portal confirmado (${formato}, ${bytes} bytes)`);
      },

      // O RESULTADO É PROPAGADO, e é isso que permite ao caminho registrar o objeto que ficou para
      // trás em vez de supor que a remoção deu certo (condição B6).
      apagarObjeto: async (objeto) => this.armazenamento.apagarObjeto(objeto),

      registrarEvento: async (tipo, dados) => {
        // O orquestrador conta as ENTRADAS do catálogo; aqui se sabe quantas foram de fato LIDAS,
        // que é a pergunta da L15. Sobrescrever é deliberado, e o que vai ao banco continua sendo só
        // um número: a allowlist de `montarEventoPortal` já descartaria qualquer valor.
        const enriquecido =
          tipo === "PORTAL_EXTRACAO_IA" ? { ...(dados ?? {}), camposExtraidosN: camposLidos } : dados;
        await registrar(tipo, enriquecido);
        // A EXTRAÇÃO CONTA NO LINK, e conta aqui porque é aqui que ela de fato aconteceu. O teto de
        // extrações existe porque cada leitura é chamada paga ao motor que atende a esteira, então
        // releitura do mesmo arquivo não pode ser de graça.
        if (tipo === "PORTAL_EXTRACAO_IA") {
          await this.db
            .update(portalCredenciais)
            .set({ extracoes: sql`${portalCredenciais.extracoes} + 1` })
            .where(eq(portalCredenciais.id, credencial.id));
        }
      },
    };
  }
}
