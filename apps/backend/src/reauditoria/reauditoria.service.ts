import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  candidatoAlteracoesLog,
  documentosAdmissao,
  integracaoPandape,
  tiposDocumento,
} from "../db/schema";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { StagingService } from "../staging/staging.service";
import { PandapeSyncService } from "../pandape/pandape-sync.service";
import { hashArquivo } from "../pandape/dedup-arquivo";
import { ValidacaoHumanaService } from "./validacao-humana.service";

/** Um arquivo do conjunto, já com a marca calculada. */
interface ArquivoComHash {
  buffer: Buffer;
  originalname: string;
  hash: string;
}

/**
 * REAUDITORIA POR DOCUMENTO (OST A / Bloco 5).
 *
 * Para quando a IA errou, ou quando a CAUSA do erro foi corrigida fora do documento (o caso real: o
 * cadastro do candidato tinha um token duplicado no nome e derrubou seis documentos bons por "nome
 * não confere"). O consultor pede nova análise DAQUELE documento, individualmente, e o conjunto do
 * tipo volta inteiro para a IA.
 *
 * ORIGEM DOS ARQUIVOS, nesta ordem:
 *  1. STAGING local, se os arquivos ainda estiverem lá (nada é baixado de novo, nada trafega na rede);
 *  2. PANDAPÉ, buscando só os anexos daquele tipo, quando a staging já foi expurgada.
 *
 * A DEDUP POR HASH NÃO BLOQUEIA A REAUDITORIA, e isso é deliberado. A dedup mora no pull automático
 * (`puxarDocumentos`), que decide se vale a pena baixar/auditar de novo sozinho. A reauditoria NÃO
 * passa por lá: ela chama `auditarConjunto` diretamente, então a marca de arquivo é irrelevante para
 * a decisão de rodar. O hash continua sendo usado, mas para outra coisa: (a) deduplicar cópias
 * repetidas do MESMO arquivo dentro da staging, evitando que cada reauditoria dobre o conjunto, e
 * (b) manter a tabela de marcas em dia depois do novo veredito.
 *
 * MÓDULO PRÓPRIO por dependência: `PandapeModule` já importa `AuditoriaModule`, então pendurar isto
 * em qualquer um dos dois criaria ciclo. Este módulo importa os dois e não é importado por nenhum.
 *
 * §A.6: sem CPF, sem nome de candidato, sem nome de arquivo e sem URL em log. A trilha guarda código
 * do tipo e estados, que não são PII.
 */
@Injectable()
export class ReauditoriaService {
  private readonly logger = new Logger("ReauditoriaService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly auditoria: AuditoriaService,
    private readonly staging: StagingService,
    private readonly pandape: PandapeSyncService,
    private readonly validacaoHumana: ValidacaoHumanaService,
  ) {}

  /**
   * Reaudita UM documento (o conjunto inteiro daquele tipo) e devolve o mesmo payload da auditoria
   * normal, acrescido de `origemArquivos`. Vale para QUALQUER estado, inclusive ENTREGUE: quem decide
   * que precisa reanalisar é o humano.
   */
  async reauditar(
    admissaoId: string,
    tipoDocumentoId: string,
    user: AuthUser,
    opts: { confirmarSobrescritaHumana?: boolean } = {},
  ) {
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");

    // OST B1 / Bloco 4 — PRECEDÊNCIA DA VALIDAÇÃO HUMANA. Documento assumido por uma pessoa não é
    // sobrescrito pela IA em silêncio. Aqui, que é ação MANUAL, o caminho existe, mas só com aceite
    // explícito de quem clicou; o erro leva o NOME do validador para a tela poder perguntar. Na
    // coleta automática e no lote não há caminho nenhum (ver `pandape-sync.service`).
    const validador = await this.validacaoHumana.validadorDe(admissaoId, tipoDocumentoId);
    if (validador && !opts.confirmarSobrescritaHumana) {
      throw ValidacaoHumanaService.conflitoValidacaoHumana(validador.nome);
    }

    const antes = await this.db.query.documentosAdmissao.findFirst({
      where: and(
        eq(documentosAdmissao.admissaoId, admissaoId),
        eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
      ),
    });
    const estadoAntes = antes?.estado ?? "PENDENTE";

    let origemArquivos: "STAGING" | "PANDAPE" = "STAGING";
    let arquivos = await this.lerDaStaging(admissaoId, tipo.codigo);
    if (arquivos.length === 0) {
      origemArquivos = "PANDAPE";
      arquivos = await this.baixarDoPandape(admissaoId, tipo.codigo);
    }
    if (arquivos.length === 0) {
      throw new BadRequestException(
        "Não há arquivo disponível para reauditar este documento. Anexe o arquivo novamente.",
      );
    }

    this.logger.log(
      `Reauditoria solicitada: tipo=${tipo.codigo}, arquivos=${arquivos.length}, origem=${origemArquivos}.`,
    );

    const resultado = await this.auditoria.auditarConjunto(
      admissaoId,
      tipoDocumentoId,
      arquivos.map(({ buffer, originalname }) => ({ buffer, originalname })),
      user,
    );

    // Mantém as marcas de arquivo em dia: depois desta reauditoria, o conjunto passou pelo fluxo
    // atual e a varredura automática não precisa refazê-lo.
    await this.pandape.registrarArquivosColetados(
      admissaoId,
      tipoDocumentoId,
      arquivos.map((a) => a.hash),
      arquivos.map((a) => a.buffer.length),
    );

    // Reauditoria CONFIRMADA sobre documento validado à mão: a marca humana é LIMPA, porque o
    // veredito volta a ser da IA. Deixá-la valendo faria a tela dizer "validado por Fulano" ao lado
    // de um veredito que Fulano não deu.
    if (validador) {
      await this.db
        .update(documentosAdmissao)
        .set({ validadoPorId: null, validadoEm: null })
        .where(
          and(
            eq(documentosAdmissao.admissaoId, admissaoId),
            eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
          ),
        );
    }

    const estadoDepois = resultado.documento.estado;
    await this.registrarTrilha(admissaoId, tipo.codigo, estadoAntes, estadoDepois, user);

    return {
      ...resultado,
      reauditoria: {
        estadoAntes,
        estadoDepois,
        origemArquivos,
        ...(validador ? { sobrescreveuValidacaoHumanaDe: validador.nome } : {}),
      },
    };
  }

  /**
   * Lê os arquivos daquele tipo que ainda estão na staging efêmera, DEDUPLICADOS por conteúdo. A
   * dedup aqui é o que impede o conjunto de crescer a cada reauditoria: `auditarConjunto` grava novas
   * cópias na staging, e sem isto a segunda reauditoria mandaria o dobro de arquivos para a IA.
   */
  private async lerDaStaging(admissaoId: string, codigoTipo: string): Promise<ArquivoComHash[]> {
    const alvo = codigoTipo.replace(/[^a-zA-Z0-9_-]/g, "_");
    const naStaging = (await this.staging.listar(admissaoId)).filter((a) => a.codigoTipo === alvo);
    const vistos = new Set<string>();
    const arquivos: ArquivoComHash[] = [];
    for (const item of naStaging) {
      let buffer: Buffer;
      try {
        buffer = await readFile(item.caminho);
      } catch {
        continue; // arquivo expurgado entre o listar e o ler: segue com o que houver.
      }
      const hash = hashArquivo(buffer);
      if (vistos.has(hash)) continue;
      vistos.add(hash);
      arquivos.push({ buffer, originalname: basename(item.caminho), hash });
    }
    return arquivos;
  }

  /** Busca de novo no Pandapé, só os anexos daquele tipo. [] quando a admissão não veio do Pandapé. */
  private async baixarDoPandape(
    admissaoId: string,
    codigoTipo: string,
  ): Promise<ArquivoComHash[]> {
    const integracao = await this.db.query.integracaoPandape.findFirst({
      where: eq(integracaoPandape.admissaoId, admissaoId),
    });
    const id = integracao?.idPrecollaborator;
    if (!id) return [];
    const baixados = await this.pandape.baixarArquivosDoTipo(id, codigoTipo);
    const vistos = new Set<string>();
    const arquivos: ArquivoComHash[] = [];
    for (const a of baixados) {
      const hash = hashArquivo(a.buffer);
      if (vistos.has(hash)) continue;
      vistos.add(hash);
      arquivos.push({ ...a, hash });
    }
    return arquivos;
  }

  /**
   * Trilha da reauditoria: QUEM pediu, QUANDO e o que mudou. Reusa `candidato_alteracoes_log`, que já
   * é a trilha de "quem mudou o quê" com autor e data. §A.6: `campo` guarda o CÓDIGO do tipo e os
   * valores são ESTADOS de documento; nenhum dado pessoal entra aqui.
   */
  private async registrarTrilha(
    admissaoId: string,
    codigoTipo: string,
    estadoAntes: string,
    estadoDepois: string,
    user: AuthUser,
  ): Promise<void> {
    await this.db.insert(candidatoAlteracoesLog).values({
      admissaoId,
      campo: `reauditoria:${codigoTipo}`.slice(0, 60),
      valorAnterior: estadoAntes,
      valorNovo: estadoDepois,
      autorId: user.id,
    });
  }
}
