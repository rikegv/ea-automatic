import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { AiClientService } from "../ai/ai-client.service";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes, candidatos, cargos, clientes, vtColeta } from "../db/schema";
import { STATUS_SEM_CASAR } from "../domain/scheduler-vt-coleta";
import { VtColetaService } from "./vt-coleta.service";

/**
 * VT ÓRFÃO: o formulário chegou ao bucket e não casou com admissão nenhuma.
 *
 * O QUE ESTE SERVIÇO CONSERTA. O sinal de diagnóstico mostrava um prefixo de md5 e a frase "sem
 * admissão viva para o CPF". Com isso ninguém consegue agir: não dá para saber DE QUEM é o
 * formulário, nem POR QUE ele não casou, e "sem admissão viva" cobre três situações que se resolvem
 * de maneiras diferentes.
 *
 * §A.6, e é a decisão mais delicada desta frente. Nome e CPF do órfão são LIDOS DO BUCKET NA HORA e
 * NUNCA persistidos. Guardá-los criaria cadastro de alguém que o sistema não conhece, que é
 * exatamente o oposto da minimização. Mostrá-los numa tela autenticada de quem já opera o bucket não
 * acrescenta exposição, e é o que transforma um digest inútil em algo tratável. Nada aqui é logado.
 */
@Injectable()
export class OrfaoVtService {
  private readonly logger = new Logger(OrfaoVtService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
    private readonly coleta: VtColetaService,
  ) {}

  /**
   * Os órfãos, com dono, hora de chegada e o MOTIVO exato de cada um.
   *
   * OS MOTIVOS SÃO TRÊS, e separá-los é o que torna a tela acionável:
   *  - `RESOLVE_SOZINHO`: a pessoa existe e tem admissão que o VT aceita. É o caso de quem enviou
   *    quando a admissão já estava concluída, que a régua nova passou a aceitar. NÃO precisa de
   *    ação: o próximo ciclo casa. Deixar este caso pedindo intervenção faria o time trabalhar à
   *    toa e desconfiar da fila.
   *  - `SEM_CANDIDATO`: nenhum candidato com aquele CPF. Ou a pessoa não está na base, ou o CPF foi
   *    digitado diferente do cadastro. É o caso do casamento manual.
   *  - `ADMISSAO_ENCERRADA`: a pessoa existe, mas as admissões dela declinaram, foram rescindidas ou
   *    estão pausadas. Casar à mão aqui é decisão de gente, não de automático.
   */
  async listar() {
    const linhas = await this.db
      .select({ md5: vtColeta.md5, status: vtColeta.status, vistoEm: vtColeta.criadoEm })
      .from(vtColeta)
      // DISPENSADO SAI DA LISTA, e é o que faz o "Resolver sinal" resolver de verdade: a varredura
      // reavalia os mesmos registros a cada ciclo, então sem este filtro o alerta voltaria sozinho.
      .where(
        and(inArray(vtColeta.status, [...STATUS_SEM_CASAR]), isNull(vtColeta.sinalDispensadoEm)),
      );
    if (linhas.length === 0) return [];

    const bucket = this.coleta.bucketColetivo();
    if (!bucket) return [];

    // LEITURA TRANSIENTE do bucket: dono e hora de chegada. Não persiste nada.
    const { arquivos } = await this.ai.orfaosColetaVt(bucket);
    const porMd5 = new Map(arquivos.filter((a) => a.md5).map((a) => [a.md5 as string, a]));

    const saida = [];
    for (const l of linhas) {
      const obj = porMd5.get(l.md5);
      // No ledger mas fora do bucket: alguém removeu o objeto. Vale mostrar, porque é o único
      // registro de que aquele formulário existiu, mas não há o que casar.
      if (!obj) {
        saida.push({
          md5: l.md5,
          objetoId: null,
          nome: null,
          cpf: null,
          chegouEm: null,
          motivo: "ARQUIVO_SUMIU" as const,
          explicacao:
            "O arquivo não está mais no bucket. Ele pode ter sido removido depois de processado.",
          admissoesCandidatas: [],
        });
        continue;
      }

      const cpf = (obj.cpf ?? "").replace(/\D/g, "");
      const base = {
        md5: l.md5,
        objetoId: obj.id,
        nome: obj.nome ?? null,
        cpf: cpf || null,
        chegouEm: obj.criadoEm ?? null,
      };

      if (l.status === "NOME_FORA_PADRAO" || cpf.length !== 11) {
        saida.push({
          ...base,
          motivo: "CPF_NAO_IDENTIFICADO" as const,
          explicacao:
            "O nome do arquivo não segue o padrão e o CPF não pôde ser lido. Case manualmente com a pessoa certa.",
          admissoesCandidatas: [],
        });
        continue;
      }

      const doCpf = await this.admissoesDoCpf(cpf);
      if (doCpf.length === 0) {
        saida.push({
          ...base,
          motivo: "SEM_CANDIDATO" as const,
          explicacao:
            "Não existe ninguém na base com esse CPF. Ou a pessoa não foi cadastrada, ou o CPF foi digitado diferente do cadastro.",
          admissoesCandidatas: [],
        });
        continue;
      }

      const aceitavel = doCpf.find((a) => a.aceitaVt);
      if (aceitavel) {
        saida.push({
          ...base,
          motivo: "RESOLVE_SOZINHO" as const,
          explicacao:
            "A pessoa tem admissão que aceita VT. O próximo ciclo da coleta casa sozinho, sem ação sua.",
          admissoesCandidatas: doCpf,
        });
        continue;
      }

      saida.push({
        ...base,
        motivo: "ADMISSAO_ENCERRADA" as const,
        explicacao:
          "A pessoa existe, mas a admissão dela está encerrada (declínio ou rescisão) ou pausada. Casar aqui é decisão sua.",
        admissoesCandidatas: doCpf,
      });
    }
    return saida;
  }

  /**
   * CASA À MÃO um formulário órfão com a admissão que o diretor escolher.
   *
   * REUSA `processarMatch`, o MESMO caminho do automático, e isso não é economia de código: é o que
   * garante que o manual obedeça às mesmas regras. Em particular a regra da onda 2, que só dá baixa
   * na régua quando a admissão está VIVA. Uma rotina paralela aqui poderia dar baixa numa admissão
   * concluída e reabrir a Auditoria pelo pós-veredito, que é exatamente o risco que a onda 2 fechou.
   *
   * NÃO EXIGE que a admissão aceite VT pela régua automática: o ponto do casamento manual é
   * justamente resolver o que o automático recusou. Quem decide é o diretor, com a tela dizendo o
   * que vai acontecer antes de ele confirmar.
   */
  async casarManual(md5: string, admissaoId: string) {
    const bucket = this.coleta.bucketColetivo();
    if (!bucket) {
      throw new BadRequestException("A coleta de VT não está configurada (bucket ausente).");
    }

    const { arquivos } = await this.ai.orfaosColetaVt(bucket);
    const obj = arquivos.find((a) => a.md5 === md5);
    if (!obj) {
      throw new NotFoundException(
        "O arquivo não está mais no bucket. Ele pode ter sido removido ou já processado.",
      );
    }

    const [adm] = await this.db
      .select({
        id: admissoes.id,
        codCliente: admissoes.codCliente,
        cargoId: admissoes.cargoId,
        tipoContrato: admissoes.tipoContrato,
        candidatoNome: candidatos.nome,
        clienteOperacao: clientes.nomeOperacao,
        farolGlobal: admissoes.farolGlobal,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .where(eq(admissoes.id, admissaoId));
    if (!adm) throw new NotFoundException("Admissão não encontrada.");

    const resultado = await this.coleta.processarMatch(
      { id: obj.id, md5, mimeType: "application/pdf", cpf: obj.cpf ?? null, ehPdf: true },
      adm,
    );
    // §A.6: id de admissão e prefixo do digest, nunca nome nem CPF.
    this.logger.log(
      `VT órfão casado à mão (admissão ${admissaoId}, arquivo ${md5.slice(0, 12)}, ` +
        `farol ${adm.farolGlobal}).`,
    );
    return resultado;
  }

  /**
   * Busca admissões por CPF PARCIAL ou nome, para a tela oferecer o alvo do casamento manual.
   *
   * BUSCA POR NOME também, e é o que resolve o caso mais comum: CPF digitado diferente. Se o número
   * não bate com ninguém, procurar pelo nome que a pessoa preencheu no formulário é o único caminho
   * que sobra.
   */
  async buscarAdmissoes(termo: string) {
    const t = (termo ?? "").trim();
    if (t.length < 3) return [];
    const soDigitos = t.replace(/\D/g, "");
    const alvo = soDigitos.length >= 3 ? soDigitos : t;

    return this.db
      .select({
        id: admissoes.id,
        nome: candidatos.nome,
        cpf: candidatos.cpf,
        farolGlobal: admissoes.farolGlobal,
        cliente: clientes.nomeOperacao,
        cargo: cargos.nome,
        dataAdmissao: admissoes.dataAdmissao,
      })
      .from(admissoes)
      .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(
        soDigitos.length >= 3
          ? sql`${candidatos.cpf} like ${`%${alvo}%`}`
          : sql`unaccent(lower(${candidatos.nome})) like unaccent(lower(${`%${alvo}%`}))`,
      )
      .limit(15);
  }

  /**
   * DISPENSA o alerta de um órfão. Não trata nada: só tira o sinal da tela, para sempre.
   *
   * O QUE ISTO NÃO FAZ, e a tela diz antes de confirmar: não apaga o arquivo do bucket, não mexe no
   * formulário, não muda o status do ledger. Quem quer tratar de verdade usa o casamento manual.
   *
   * POR QUE EXISTE: alguns órfãos nunca serão tratados (arquivo de teste, pessoa que não foi
   * cadastrada, envio duplicado). Sem dispensar, o alerta apita para sempre, e um painel que apita
   * para sempre vira um painel que o time aprende a ignorar, inclusive quando ele aponta algo real.
   *
   * IDEMPOTENTE: dispensar de novo o que já está dispensado não muda quem decidiu nem quando. A
   * primeira decisão é a que fica registrada.
   */
  async dispensarSinal(md5: string, user: AuthUser) {
    const agora = new Date();
    const [linha] = await this.db
      .update(vtColeta)
      .set({ sinalDispensadoEm: agora, sinalDispensadoPorId: user.id, atualizadoEm: agora })
      .where(and(eq(vtColeta.md5, md5), isNull(vtColeta.sinalDispensadoEm)))
      .returning({ id: vtColeta.id });

    // §A.6: prefixo do digest, que não é dado pessoal. Nome e CPF nunca entram no log.
    this.logger.log(
      linha
        ? `Sinal de VT órfão dispensado (arquivo ${md5.slice(0, 12)}, por ${user.id}).`
        : `Sinal de VT órfão já estava dispensado (arquivo ${md5.slice(0, 12)}).`,
    );
    return { ok: true, jaEstava: !linha };
  }

  /** As admissões daquele CPF, com a marca de quais o VT aceita hoje. */
  private async admissoesDoCpf(cpf: string) {
    const linhas = await this.db
      .select({
        id: admissoes.id,
        farolGlobal: admissoes.farolGlobal,
        pausada: admissoes.pausadaEm,
        cliente: clientes.nomeOperacao,
        cargo: cargos.nome,
        dataAdmissao: admissoes.dataAdmissao,
      })
      .from(admissoes)
      .leftJoin(clientes, eq(clientes.codCliente, admissoes.codCliente))
      .leftJoin(cargos, eq(cargos.id, admissoes.cargoId))
      .where(eq(admissoes.candidatoCpf, cpf));

    return linhas.map((l) => ({
      id: l.id,
      farolGlobal: l.farolGlobal,
      cliente: l.cliente,
      cargo: l.cargo,
      dataAdmissao: l.dataAdmissao,
      // Espelha a régua local do VT (`FAROIS_ACEITOS_VT` mais "não pausada"). A tela usa isto para
      // dizer se o caso se resolve sozinho ou pede a mão do diretor.
      aceitaVt:
        !l.pausada &&
        ["EM_ADMISSAO", "BANCO_AGUARDAR", "ADMISSAO_CONCLUIDA"].includes(l.farolGlobal),
    }));
  }
}
