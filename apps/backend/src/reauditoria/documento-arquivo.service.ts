import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import {
  admissoes,
  candidatoAlteracoesLog,
  documentoArquivosColetados,
  documentosAdmissao,
  tiposDocumento,
} from "../db/schema";
import { precisaArquivarDrive } from "../auditoria/auditoria.service";
import { StagingService } from "../staging/staging.service";
import {
  mimeDeVisualizacao,
  ordenarParaVisualizacao,
  rotuloArquivo,
} from "../staging/staging-visualizacao";

/** Mensagem ÚNICA de indisponibilidade (decisão do diretor: não oferecer rebaixar do Pandapé). */
export const MSG_INDISPONIVEL =
  "Documento não está mais disponível para visualização. Verifique no Pandapé.";

/** Um arquivo do conjunto, como a TELA o enxerga: sem caminho, só índice e rótulo (§A.6). */
export interface ArquivoVisualizavel {
  indice: number;
  rotulo: string;
  mime: string;
  tamanhoBytes: number;
}

/**
 * VISUALIZAÇÃO e DESCARTE de documento de candidato (OST visualização/descarte, Blocos 2 e 3).
 *
 * POR QUE SERVE DA STAGING, e não do Drive. O Drive só recebe o arquivo quando a régua obrigatória
 * FECHA, e um documento reprovado é justamente o que impede a régua de fechar. Ou seja: na janela em
 * que o consultor precisa julgar o reprovado, o Drive ainda não tem nada. A staging tem. Fora dessa
 * janela (48h de TTL, ou régua fechada e staging expurgada) o arquivo simplesmente não existe mais
 * aqui, e a tela diz isso em vez de dar erro.
 *
 * §A.6, o requisito duro desta peça: a rota recebe (admissão, tipo, índice) e NUNCA um caminho vindo
 * do cliente. O caminho é resolvido no servidor, a partir da listagem da staging daquela admissão,
 * ordenada de forma determinística; ainda assim o resultado passa pela guarda de path traversal do
 * `StagingService` antes de virar stream. Nome de arquivo original nunca entra e nunca sai: o rótulo
 * exibido é montado do nome do TIPO.
 */
@Injectable()
export class DocumentoArquivoService {
  private readonly logger = new Logger("DocumentoArquivoService");

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly staging: StagingService,
  ) {}

  /** Tipo de documento pelo id, ou 404. */
  private async carregarTipo(tipoDocumentoId: string) {
    const tipo = await this.db.query.tiposDocumento.findFirst({
      where: eq(tiposDocumento.id, tipoDocumentoId),
    });
    if (!tipo) throw new NotFoundException("Tipo de documento não encontrado");
    return tipo;
  }

  /**
   * Arquivos daquele tipo que ainda estão na staging, JÁ ORDENADOS. É a única função que conhece
   * caminho; ninguém fora daqui recebe essa informação.
   *
   * O filtro replica a sanitização usada na gravação (`{codigoTipo}__{uuid}.{ext}`), senão um código
   * com caractere especial nunca casaria com o próprio arquivo.
   */
  private async arquivosDoTipo(admissaoId: string, codigoTipo: string) {
    const alvo = codigoTipo.replace(/[^a-zA-Z0-9_-]/g, "_");
    const doTipo = (await this.staging.listar(admissaoId)).filter((a) => a.codigoTipo === alvo);
    return ordenarParaVisualizacao(doTipo);
  }

  /**
   * BLOCO 2 — lista o que dá para visualizar deste documento. Devolve `disponivel: false` com lista
   * vazia (200, não erro) quando não há mais arquivo: indisponibilidade é estado NORMAL do fluxo
   * (TTL de 48h, ou régua fechada e staging expurgada), não falha.
   */
  async listarArquivos(
    admissaoId: string,
    tipoDocumentoId: string,
  ): Promise<{ disponivel: boolean; mensagem?: string; arquivos: ArquivoVisualizavel[] }> {
    const tipo = await this.carregarTipo(tipoDocumentoId);
    const arquivos = await this.arquivosDoTipo(admissaoId, tipo.codigo);

    const visualizaveis: ArquivoVisualizavel[] = [];
    for (const [i, a] of arquivos.entries()) {
      const mime = mimeDeVisualizacao(a.caminho);
      if (!mime) continue; // extensão fora da allowlist não é oferecida nem servida.
      let tamanhoBytes = 0;
      try {
        tamanhoBytes = (await stat(a.caminho)).size;
      } catch {
        continue; // expurgado entre o listar e o stat: segue com o que houver.
      }
      visualizaveis.push({
        indice: i,
        rotulo: rotuloArquivo(tipo.nome, i, arquivos.length),
        mime,
        tamanhoBytes,
      });
    }

    if (visualizaveis.length === 0) {
      return { disponivel: false, mensagem: MSG_INDISPONIVEL, arquivos: [] };
    }
    return { disponivel: true, arquivos: visualizaveis };
  }

  /**
   * BLOCO 2 — resolve UM arquivo para stream inline. Recebe ÍNDICE, nunca caminho. A guarda de path
   * traversal é reafirmada aqui mesmo o caminho tendo nascido no servidor: defesa em profundidade,
   * porque é esta função que abre o descritor.
   */
  async abrirArquivo(admissaoId: string, tipoDocumentoId: string, indice: number) {
    const tipo = await this.carregarTipo(tipoDocumentoId);
    const arquivos = await this.arquivosDoTipo(admissaoId, tipo.codigo);
    const alvo = arquivos[indice];
    if (!alvo) throw new NotFoundException(MSG_INDISPONIVEL);

    const mime = mimeDeVisualizacao(alvo.caminho);
    if (!mime) throw new NotFoundException(MSG_INDISPONIVEL);
    if (!this.staging.dentroDaRaiz(alvo.caminho)) {
      // Inalcançável pelo fluxo normal (o caminho vem da própria staging); existe para o dia em que
      // alguém mudar a origem da listagem sem lembrar do §A.6.
      throw new NotFoundException(MSG_INDISPONIVEL);
    }

    // §A.6: o log registra o TIPO e o índice, nunca o caminho, o nome original ou o CPF.
    this.logger.log(`Visualização de documento: tipo=${tipo.codigo}, arquivo=${indice + 1}.`);
    return {
      stream: createReadStream(alvo.caminho),
      mime,
      // Nome exibido no navegador: montado do TIPO, sem nome de arquivo original (§A.6).
      nomeExibicao: `${tipo.nome}${indice > 0 ? `-${indice + 1}` : ""}${extensaoDe(alvo.caminho)}`,
    };
  }

  /**
   * BLOCO 3 — DESCARTA o documento. Uma operação só, cobrindo as SEIS camadas do diagnóstico:
   *
   *  1. STAGING: apaga os arquivos daquele tipo.
   *  2. `documentos_admissao`: volta para PENDENTE e limpa a observação. A LINHA NÃO É APAGADA, a
   *     régua a exige (sem ela o documento sumiria do checklist em vez de voltar a ser cobrado).
   *  3. MARCA DE DEDUP: apaga as marcas de (admissão + tipo). É O PONTO CRÍTICO. Sem isto,
   *     `decidirColeta` vê "acervo idêntico ao já marcado" e PULA SEM BAIXAR: o candidato reenviaria
   *     o mesmo arquivo e nada aconteceria.
   *  4. VALIDAÇÃO HUMANA: limpa `validadoPorId`/`validadoEm`, senão a coleta automática e o lote
   *     continuam pulando o tipo por precedência humana.
   *  5. DRIVE: nada a fazer no caso normal (documento reprovado impede a régua de fechar, então o
   *     descarte acontece ANTES de qualquer upload). Quando já subiu, REPORTA a limitação em vez de
   *     fingir que removeu: o EA não usa a API de exclusão do Drive.
   *  6. TRILHA: quem descartou e quando, em `candidato_alteracoes_log` (mesmo padrão da reauditoria).
   *
   * ORDEM E ATOMICIDADE. As quatro camadas de banco (2, 3, 4 e 6) vão numa ÚNICA transação, então
   * nunca sobra meio estado no banco. A staging (1) é sistema de arquivos e não entra em transação;
   * roda DEPOIS do commit, de propósito. O motivo é qual metade é pior de perder: com o banco
   * commitado, o documento já voltou a ser cobrável e recoletável mesmo que um arquivo resista no
   * disco (onde o TTL de 48h o pega de qualquer jeito). Na ordem inversa, uma falha do banco deixaria
   * o arquivo apagado com a marca de dedup ainda de pé, que é exatamente o estado que trava o
   * reenvio. A remoção de arquivo é idempotente: repetir o descarte converge.
   */
  async descartar(admissaoId: string, tipoDocumentoId: string, user: AuthUser) {
    const tipo = await this.carregarTipo(tipoDocumentoId);

    const adm = await this.db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
    if (!adm) throw new NotFoundException("Admissão não encontrada");

    const antes = await this.db.query.documentosAdmissao.findFirst({
      where: and(
        eq(documentosAdmissao.admissaoId, admissaoId),
        eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
      ),
    });
    const estadoAntes = antes?.estado ?? "PENDENTE";

    // Camada 5, avaliada ANTES de mexer em qualquer coisa: o arquivo já foi para o Drive?
    // `drivePastaUrl` cobre o fechamento da régua; `driveAsoUrl` cobre o ASO, o único que sobe
    // sozinho (ao ser validado), que é o caso real em que isto acontece.
    const arquivadoNaPasta = !precisaArquivarDrive(adm.drivePastaUrl);
    const asoArquivado = tipo.codigo === "ASO" && !precisaArquivarDrive(adm.driveAsoUrl);
    const jaNoDrive = arquivadoNaPasta || asoArquivado;

    // Camadas 2, 3, 4 e 6, atômicas.
    await this.db.transaction(async (tx) => {
      const agora = new Date();
      await tx
        .update(documentosAdmissao)
        .set({
          estado: "PENDENTE",
          observacao: null,
          validadoPorId: null,
          validadoEm: null,
          atualizadoEm: agora,
        })
        .where(
          and(
            eq(documentosAdmissao.admissaoId, admissaoId),
            eq(documentosAdmissao.tipoDocumentoId, tipoDocumentoId),
          ),
        );

      await tx
        .delete(documentoArquivosColetados)
        .where(
          and(
            eq(documentoArquivosColetados.admissaoId, admissaoId),
            eq(documentoArquivosColetados.tipoDocumentoId, tipoDocumentoId),
          ),
        );

      await tx.insert(candidatoAlteracoesLog).values({
        admissaoId,
        campo: `descarte-documento:${tipo.codigo}`.slice(0, 60),
        valorAnterior: estadoAntes,
        valorNovo: "PENDENTE",
        autorId: user.id,
      });
    });

    // Camada 1, depois do commit (ver o comentário de ordem acima).
    const arquivos = await this.arquivosDoTipo(admissaoId, tipo.codigo);
    let removidos = 0;
    let falhasAoRemover = 0;
    for (const a of arquivos) {
      try {
        await this.staging.removerArquivo(a.caminho);
        removidos += 1;
      } catch {
        falhasAoRemover += 1;
      }
    }

    // §A.6: código do tipo e contagens. Sem caminho, sem nome de arquivo, sem CPF.
    this.logger.log(
      `Documento descartado: tipo=${tipo.codigo}, estado anterior=${estadoAntes}, arquivos removidos=${removidos}.`,
    );

    return {
      documento: { tipoDocumentoId, estado: "PENDENTE" as const },
      estadoAntes,
      arquivosRemovidos: removidos,
      ...(falhasAoRemover > 0 ? { falhasAoRemover } : {}),
      marcasDedupRemovidas: true,
      validacaoHumanaLimpa: true,
      driveJaArquivado: jaNoDrive,
      ...(jaNoDrive
        ? {
            avisoDrive:
              "Este documento já havia sido arquivado no Drive e NÃO foi removido de lá. O EA não exclui arquivos do Drive: remova manualmente, se for o caso.",
          }
        : {}),
    };
  }
}

/** Extensão em minúsculas, com ponto ("" quando não há). Só para montar o nome exibido. */
function extensaoDe(caminho: string): string {
  const i = caminho.lastIndexOf(".");
  return i === -1 ? "" : caminho.slice(i).toLowerCase();
}
