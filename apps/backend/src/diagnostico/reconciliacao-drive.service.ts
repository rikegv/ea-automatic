import { Inject, Injectable, Logger } from "@nestjs/common";
import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { admissoes } from "../db/schema";
import type { AuthUser } from "../auth/auth.types";
import { AiClientService } from "../ai/ai-client.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { idDaPastaUrl, montarNomePasta } from "../ai/drive-routing";
import { csvIds, duplicatasAcesas, listaIds } from "../ai/drive-duplicatas";

/**
 * RECONCILIAÇÃO AUTOMÁTICA DO DIAGNÓSTICO (decisão do diretor: o sistema trabalha PARA o diretor).
 *
 * O PRINCÍPIO. Botão que empurra a resolução para a pessoa é falha de desenho. Pendência que o
 * sistema TEM COMO conferir sozinho não pode ficar esperando alguém clicar. Esta varredura confere o
 * estado REAL no Drive e apaga o que já está resolvido, sem intervenção.
 *
 * O QUE ELA RESOLVE, e por que cada caso existia:
 *
 *  1. **Pasta duplicada já apagada.** O diretor apaga as pastas extras à mão (o módulo do Drive não
 *     apaga, §A.6), e o aviso continuava aceso porque nada reconferia. Agora cada id listado é
 *     verificado; some do aviso o que não existe mais, e o aviso inteiro sai quando não sobra nada.
 *     A varredura RESPEITA a baixa manual do sinal: duplicata que o diretor baixou no Diagnóstico
 *     não reacende aqui enquanto a pasta existir, senão a varredura desfaria a decisão dele.
 *
 *  2. **Prontuário que existe e o EA não sabe.** Quando o envio caía no meio (o timeout de upload que
 *     travou quatro admissões reais), a pasta ficava criada no Drive e a URL nunca era gravada: a
 *     admissão aparecia "sem pasta" tendo pasta. Agora o sistema PROCURA a pasta pelo nome, e
 *     achando, liga a admissão a ela e apaga a pendência. É a mesma régua do arquivamento (as duas
 *     convenções de nome, a mais completa vence).
 *
 * NADA É CRIADO NEM APAGADO NO DRIVE por esta rotina: ela só lê e conserta o que o EA sabe. §A.6:
 * loga contagens e ids de pasta, nunca nome de pessoa.
 */
@Injectable()
export class ReconciliacaoDriveService {
  private readonly logger = new Logger("ReconciliacaoDrive");
  /** Última execução, para não repetir a varredura a cada abertura da tela. */
  private ultimaEm = 0;
  private emCurso: Promise<ResultadoReconciliacao> | null = null;
  /** Intervalo mínimo entre varreduras automáticas. */
  private static readonly INTERVALO_MS = 5 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
    private readonly drivePastaPai: DrivePastaPaiService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Roda a varredura no máximo uma vez a cada 5 minutos, e nunca duas ao mesmo tempo. Chamada no
   * carregamento do Diagnóstico: abrir a tela já é o gatilho, então o diretor encontra o card certo
   * sem apertar nada. Falha aqui NUNCA derruba o snapshot (a tela é mais importante que a varredura).
   */
  async reconciliarSeVencido(): Promise<void> {
    const agora = Date.now();
    if (this.emCurso) return;
    if (agora - this.ultimaEm < ReconciliacaoDriveService.INTERVALO_MS) return;
    this.ultimaEm = agora;
    this.emCurso = this.reconciliar().catch((e) => {
      this.logger.warn(`Reconciliação falhou: ${e instanceof Error ? e.name : "erro"}`);
      return { duplicatasLimpas: 0, pastasLigadas: 0, avisosLimpos: 0 };
    });
    try {
      const r = await this.emCurso;
      if (r.duplicatasLimpas || r.pastasLigadas || r.avisosLimpos) {
        this.logger.log(
          `Reconciliação: ${r.duplicatasLimpas} aviso(s) de duplicata limpo(s), ` +
            `${r.pastasLigadas} pasta(s) ligada(s), ${r.avisosLimpos} pendência(s) de arquivamento zerada(s).`,
        );
      }
    } finally {
      this.emCurso = null;
    }
  }

  /** A varredura em si. Pública para poder ser disparada por runner, e testável. */
  async reconciliar(): Promise<ResultadoReconciliacao> {
    return {
      duplicatasLimpas: await this.limparDuplicatasQueSumiram(),
      ...(await this.ligarPastasQueJaExistem()),
    };
  }

  /**
   * Confere no Drive cada pasta listada como duplicata e tira do aviso o que já foi apagado. O aviso
   * some inteiro quando nenhuma extra sobrevive, que é o caso depois de o diretor limpar o acervo.
   *
   * A LISTA DE BAIXADAS PASSA PELA MESMA PENEIRA. Ela é a memória de "não acenda isto de novo", e só
   * faz sentido enquanto a pasta existe: apagada a pasta, o id sai da memória junto. Sem essa poda a
   * lista cresceria para sempre e continuaria calando um aviso que não existe mais.
   */
  private async limparDuplicatasQueSumiram(): Promise<number> {
    const linhas = await this.db
      .select({
        id: admissoes.id,
        duplicatas: admissoes.driveDuplicatas,
        baixadas: admissoes.driveDuplicatasBaixadas,
      })
      .from(admissoes)
      .where(
        or(
          and(isNotNull(admissoes.driveDuplicatas), ne(admissoes.driveDuplicatas, "")),
          and(isNotNull(admissoes.driveDuplicatasBaixadas), ne(admissoes.driveDuplicatasBaixadas, "")),
        ),
      );

    let limpas = 0;
    for (const linha of linhas) {
      const ids = listaIds(linha.duplicatas);
      const baixadas = listaIds(linha.baixadas);
      const sobreviventes: string[] = [];
      for (const id of ids) {
        const { valido } = await this.ai.validarPastaDrive(id);
        if (valido) sobreviventes.push(id);
      }
      const baixadasVivas: string[] = [];
      for (const id of baixadas) {
        const { valido } = await this.ai.validarPastaDrive(id);
        if (valido) baixadasVivas.push(id);
      }
      if (sobreviventes.length === ids.length && baixadasVivas.length === baixadas.length) continue;
      await this.db
        .update(admissoes)
        .set({
          driveDuplicatas: csvIds(sobreviventes),
          driveDuplicatasBaixadas: csvIds(baixadasVivas),
          atualizadoEm: new Date(),
        })
        .where(eq(admissoes.id, linha.id));
      if (sobreviventes.length !== ids.length) limpas++;
    }
    return limpas;
  }

  /**
   * Para toda admissão com pendência de arquivamento ou sem link, PROCURA a pasta no Drive. Achando,
   * liga a admissão e zera a pendência: o prontuário existe, então não há o que pedir a ninguém.
   */
  private async ligarPastasQueJaExistem(): Promise<{ pastasLigadas: number; avisosLimpos: number }> {
    // RECORTE: só quem está DE FATO num sinal. Ou tem pendência de arquivamento gravada, ou é o
    // card "Régua Fechada Sem Pasta" (régua obrigatória completa e nenhum link).
    //
    // Este recorte é a lição de um erro real: a primeira versão pegava toda admissão viva sem link, e
    // ligou 34 admissões com a régua AINDA ABERTA. Gravar o link nelas é pior do que não fazer nada,
    // porque `precisaArquivarDrive` passa a devolver false e o arquivamento nunca roda quando a régua
    // fechar. Foram revertidas na hora, e a condição abaixo impede que se repita.
    const alvos = (await this.db.execute(sql`
      WITH obrig AS (
        SELECT a.id,
          COUNT(*) FILTER (WHERE COALESCE(d.estado::text,'PENDENTE') <> 'ENTREGUE'
            AND NOT (t.codigo='RESERVISTA' AND c.sexo IS DISTINCT FROM 'MASCULINO')) AS faltando
        FROM admissoes a
        JOIN candidatos c ON c.cpf = a.candidato_cpf
        JOIN regua_documental r ON r.cod_cliente=a.cod_cliente AND r.cargo_id=a.cargo_id AND r.exigencia='OBRIGATORIO'
        JOIN tipos_documento t ON t.id = r.tipo_documento_id
        LEFT JOIN documentos_admissao d ON d.admissao_id=a.id AND d.tipo_documento_id=r.tipo_documento_id
        WHERE a.farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR')
        GROUP BY a.id
      )
      SELECT a.id, a.tipo_contrato, a.cod_cliente, a.drive_pasta_url, a.drive_falha_motivo,
             a.drive_duplicatas_baixadas,
             c.nome AS candidato_nome, cl.nome_operacao AS cliente_operacao
        FROM admissoes a
        JOIN candidatos c ON c.cpf = a.candidato_cpf
        JOIN clientes cl ON cl.cod_cliente = a.cod_cliente
        LEFT JOIN obrig o ON o.id = a.id
       WHERE a.farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR')
         AND (
           a.drive_falha_motivo IS NOT NULL
           OR (a.drive_pasta_url IS NULL AND o.faltando = 0)
         )
    `)) as unknown as Array<{
      id: string;
      tipo_contrato: string | null;
      cod_cliente: string | null;
      drive_pasta_url: string | null;
      drive_falha_motivo: string | null;
      drive_duplicatas_baixadas: string | null;
      candidato_nome: string;
      cliente_operacao: string | null;
    }>;

    let pastasLigadas = 0;
    let avisosLimpos = 0;
    for (const adm of alvos) {
      // Já tem link válido e a pasta existe? Então a pendência é obsoleta: zera e segue.
      const ancora = idDaPastaUrl(adm.drive_pasta_url);
      if (ancora) {
        const { valido } = await this.ai.validarPastaDrive(ancora);
        if (valido && adm.drive_falha_motivo) {
          await this.zerar(adm.id, null);
          avisosLimpos++;
        }
        continue;
      }

      const pastaPaiId = await this.drivePastaPai.resolver(adm.tipo_contrato, adm.cod_cliente);
      if (!pastaPaiId) continue; // sem pasta-pai não há onde procurar; o sinal do Fopag cobre isso.
      const achada = await this.ai.localizarPastaDrive(
        pastaPaiId,
        montarNomePasta(adm.candidato_nome, adm.cliente_operacao),
      );
      // PASTA VAZIA NÃO É PRONTUÁRIO. Ligar a admissão a uma pasta sem nenhum arquivo faria
      // `precisaArquivarDrive` devolver false e o arquivamento NUNCA rodaria: os documentos ficariam
      // de fora para sempre. Sem pasta (ou com pasta vazia), o sistema ARQUIVA, que é a outra metade
      // da ordem do diretor: "se a pasta existe, liga; se não existe, cria". Ninguém clica nada.
      if (!achada.encontrada || !achada.pastaUrl || (achada.arquivos ?? 0) === 0) {
        await this.arquivarSozinho(adm.id);
        continue;
      }

      // As duplicatas que o diretor já baixou não voltam a acender: a pasta continua no Drive, ele
      // assumiu a remoção manual, e regravar o id aqui desfaria a decisão dele na varredura seguinte.
      await this.zerar(
        adm.id,
        achada.pastaUrl,
        duplicatasAcesas(achada.duplicatas, adm.drive_duplicatas_baixadas),
      );
      pastasLigadas++;
      if (adm.drive_falha_motivo) avisosLimpos++;
      this.logger.log(
        `Reconciliação ligou a admissão ${adm.id} à pasta que já existia no Drive ` +
          `(${achada.arquivos ?? 0} arquivo[s]).`,
      );
    }
    return { pastasLigadas, avisosLimpos };
  }

  /**
   * Dispara o arquivamento pelo caminho REAL de produção (`aplicarPosVeredito`), como se um documento
   * tivesse mudado de estado. É o que faltava para a pendência se resolver sozinha: a régua fechou,
   * ninguém mais vai mexer naquela admissão, e sem um evento de documento o arquivamento nunca era
   * chamado de novo. Falha aqui não derruba a varredura: a próxima tenta outra vez.
   */
  private async arquivarSozinho(admissaoId: string): Promise<void> {
    try {
      await this.auditoria.aplicarPosVeredito(admissaoId, ReconciliacaoDriveService.USUARIO_SISTEMA);
      this.logger.log(`Reconciliação disparou o arquivamento da admissão ${admissaoId}.`);
    } catch (e) {
      this.logger.warn(
        `Reconciliação não conseguiu arquivar a admissão ${admissaoId}: ${e instanceof Error ? e.name : "erro"}`,
      );
    }
  }

  /** Autor das ações automáticas (mesmo usuário dos runners de sistema). */
  private static readonly USUARIO_SISTEMA: AuthUser = {
    id: "00000000-0000-0000-0000-000000000000",
    email: "sistema@ea.local",
    papel: "SUPER_ADMIN",
    senhaTemporaria: false,
  };

  /** Grava o link (quando há) e apaga a pendência. Não toca em documento nem em veredito. */
  private async zerar(admissaoId: string, pastaUrl: string | null, duplicatas?: string[]) {
    await this.db
      .update(admissoes)
      .set({
        ...(pastaUrl ? { drivePastaUrl: pastaUrl } : {}),
        driveFalhaMotivo: null,
        driveFalhaEm: null,
        ...(duplicatas?.length ? { driveDuplicatas: csvIds(duplicatas) } : {}),
        atualizadoEm: new Date(),
      })
      .where(eq(admissoes.id, admissaoId));
  }
}

export interface ResultadoReconciliacao {
  duplicatasLimpas: number;
  pastasLigadas: number;
  avisosLimpos: number;
}
