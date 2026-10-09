import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  CAMPOS_ESCALARES_CURRICULO,
  CONFIANCA_IMPORT,
  isValidCpf,
  normalizeCpf,
  UFS,
  type AplicarImportCurriculo,
  type CandidatoCurriculo,
  type ConfiancaCamposCurriculo,
  type ConfiancaImport,
  type ItemPreviaCurriculo,
  type PreviaImportCurriculo,
  type ResultadoImportCurriculo,
  type StatusLinhaImportCandidato,
} from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { vagas } from "../../db/schema";
import { AiClientService } from "../../ai/ai-client.service";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import { VagaStatusService } from "../vaga-status/vaga-status.service";
import { MAX_BYTES_PLANILHA } from "../../planilha/leitor";

/** UM arquivo do lote, como o `FilesInterceptor` entrega. Só o que o serviço lê. */
export interface ArquivoCurriculo {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}

/**
 * IMPORTAÇÃO DE CANDIDATOS POR CURRÍCULO (.pdf e .docx) COM EXTRAÇÃO DE VALOR POR IA.
 *
 * IRMÃO do `CandidatosImportService` (planilha), e pela mesma razão de existir separado: reusa os
 * caminhos de escrita que já existem (`CandidatosService.criar` + `adicionarEmLote`) sem acrescentar
 * argumento de construtor àquele serviço nem às specs dele (§A.26). A diferença da planilha: currículo
 * NÃO tem colunas, então a IA extrai VALOR (campo → valor lido), e o telefone é LISTA.
 *
 * §A.6, E ELE MOLDA O DESENHO:
 *  - o binário é STAGING EFÊMERA: vive só no Buffer do multipart, NUNCA em banco nem em disco, e é
 *    EXPURGADO (buffer.fill(0)) assim que o arquivo é enviado à IA, dê certo ou não;
 *  - o leitor de planilha (`planilha/leitor.ts`) é DESVIADO por completo: currículo não é tabela;
 *  - NENHUM log de conteúdo (este serviço não tem `Logger`): nome, CPF, telefone e bytes não vazam;
 *  - o relatório por currículo carrega o NOME (para o time achar o arquivo) e NUNCA o CPF/telefone.
 */
@Injectable()
export class CandidatosImportCurriculoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly ai: AiClientService,
    private readonly candidatos: CandidatosService,
    private readonly statusVaga: VagaStatusService,
  ) {}

  /** O conjunto das 27 UFs, para descartar em silêncio um valor que não caberia na coluna `uf(2)`. */
  private static readonly UFS_VALIDAS = new Set(UFS.map((u) => u.uf));

  /**
   * ALÇADA DE FORMATO: só .pdf e .docx. O `leitor.ts` confundiria um `.docx` (ZIP/PK) com `.xlsx`,
   * então currículo não passa por ele, e qualquer outro formato é recusado AQUI, por arquivo. A chave
   * é o par (extensão, mime): nenhum dos dois sozinho basta.
   */
  private static readonly FORMATOS = [
    { ext: ".pdf", mime: "application/pdf" },
    {
      ext: ".docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  ] as const;

  /** A concorrência do lote: alguns de cada vez, para um lote grande não martelar o ai-service. */
  private static readonly CONCORRENCIA = 4;

  /** Candidato vazio: o item recusado/sem leitura segue editável, com os campos em branco (§A.6). */
  private static candidatoVazio(): CandidatoCurriculo {
    return { nome: "", cpf: "", email: "", telefones: [], nascimento: "", cidade: "", uf: "" };
  }

  /**
   * PRÉVIA DO LOTE: para cada arquivo, confere formato e teto, manda à IA (concorrência limitada) e
   * devolve o que foi lido + a confiança por campo. NÃO GRAVA NADA. Arquivo recusado ou IA fora do ar
   * viram `erroLeitura` daquele item, com candidato vazio, SEM derrubar o lote.
   */
  async previa(arquivos: ArquivoCurriculo[]): Promise<PreviaImportCurriculo> {
    if (!arquivos || arquivos.length === 0) {
      throw new BadRequestException("Envie ao menos um currículo (.pdf ou .docx).");
    }

    const itens: ItemPreviaCurriculo[] = new Array(arquivos.length);
    let proximo = 0;

    const trabalhador = async (): Promise<void> => {
      for (;;) {
        const indice = proximo;
        proximo += 1;
        if (indice >= arquivos.length) return;
        itens[indice] = await this.processarArquivo(indice, arquivos[indice]);
      }
    };

    const quantos = Math.min(CandidatosImportCurriculoService.CONCORRENCIA, arquivos.length);
    await Promise.all(Array.from({ length: quantos }, () => trabalhador()));

    return { itens };
  }

  /**
   * UM arquivo da prévia, do começo ao fim: alçada, teto, chamada à IA e EXPURGO do buffer. O
   * `buffer.fill(0)` fica no `finally`, de propósito, para zerar os bytes mesmo quando a IA lança.
   */
  private async processarArquivo(
    indice: number,
    arquivo: ArquivoCurriculo,
  ): Promise<ItemPreviaCurriculo> {
    const nomeArquivo = (arquivo?.originalname ?? "").slice(0, 255) || `curriculo-${indice + 1}`;
    try {
      const recusa = this.recusarFormatoOuTeto(arquivo);
      if (recusa) {
        return {
          indice,
          arquivo: nomeArquivo,
          candidato: CandidatosImportCurriculoService.candidatoVazio(),
          confianca: {},
          erroLeitura: recusa,
        };
      }

      try {
        const bruto = await this.ai.extrairCurriculo(arquivo.buffer, nomeArquivo);
        return {
          indice,
          arquivo: nomeArquivo,
          candidato: this.mapearCandidato(bruto.candidato),
          confianca: this.mapearConfianca(bruto.confianca),
        };
      } catch {
        // §A.6: mensagem FIXA, nunca o erro cru (pode espelhar conteúdo). IA fora/sem quota/recusa de
        // formato pela IA caem aqui: o item segue editável, em branco, e o lote continua.
        return {
          indice,
          arquivo: nomeArquivo,
          candidato: CandidatosImportCurriculoService.candidatoVazio(),
          confianca: {},
          erroLeitura: "Não foi possível ler este currículo. Preencha os campos na mão ou tente de novo.",
        };
      }
    } finally {
      // EXPURGO DA STAGING (§A.6): o binário é zerado assim que não é mais necessário.
      arquivo?.buffer?.fill(0);
    }
  }

  /** `null` quando o arquivo é aceitável; a mensagem de recusa (vira `erroLeitura`) quando não é. */
  private recusarFormatoOuTeto(arquivo: ArquivoCurriculo): string | null {
    if (!arquivo?.buffer?.length) return "Arquivo vazio.";
    // TETO POR ARQUIVO (§A.6 e disponibilidade): o mesmo dos 10 MB da planilha. O multer já aborta o
    // absurdo; esta conferência devolve a mensagem acionável para o arquivo pouco acima do teto.
    if (arquivo.buffer.length > MAX_BYTES_PLANILHA) {
      return `Arquivo acima de ${MAX_BYTES_PLANILHA / (1024 * 1024)} MB. Envie um currículo menor.`;
    }
    const nome = (arquivo.originalname ?? "").toLowerCase();
    const mime = (arquivo.mimetype ?? "").toLowerCase();
    const casa = CandidatosImportCurriculoService.FORMATOS.some(
      (f) => nome.endsWith(f.ext) && mime === f.mime,
    );
    if (!casa) return "Formato não aceito. Envie o currículo em PDF (.pdf) ou Word (.docx).";
    return null;
  }

  /** Mapeia o `candidato` cru do ai-service para `CandidatoCurriculo`, sanitizando tipo por campo. */
  private mapearCandidato(bruto: Record<string, unknown>): CandidatoCurriculo {
    const str = (v: unknown): string => (typeof v === "string" ? v : "");
    const telefones = Array.isArray(bruto?.telefones)
      ? (bruto.telefones as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [];
    return {
      nome: str(bruto?.nome),
      cpf: str(bruto?.cpf),
      email: str(bruto?.email),
      telefones,
      nascimento: str(bruto?.nascimento),
      cidade: str(bruto?.cidade),
      uf: str(bruto?.uf),
    };
  }

  /** Mapeia a `confianca` crua: só as chaves conhecidas, só os valores do vocabulário fechado. */
  private mapearConfianca(bruto: Record<string, unknown>): ConfiancaCamposCurriculo {
    const saida: ConfiancaCamposCurriculo = {};
    const chaves: Array<keyof ConfiancaCamposCurriculo> = [
      ...CAMPOS_ESCALARES_CURRICULO,
      "telefones",
    ];
    for (const chave of chaves) {
      const valor = bruto?.[chave];
      if (typeof valor === "string" && (CONFIANCA_IMPORT as readonly string[]).includes(valor)) {
        saida[chave] = valor as ConfiancaImport;
      }
    }
    return saida;
  }

  /**
   * APLICA: com os candidatos JÁ revisados pela tela, cria/reaproveita (dedup por CPF) e, no cenário
   * COM_VAGA, vincula à vaga na etapa CAPTACAO pela MESMA vinculação em lote da planilha. Tolerante a
   * falha POR CURRÍCULO, keyed por `indice`. §A.6: o relatório carrega só o nome.
   */
  async aplicar(entrada: AplicarImportCurriculo, autor: AuthUser): Promise<ResultadoImportCurriculo> {
    const { cenario, vagaId, candidatos } = entrada;
    if (!Array.isArray(candidatos) || candidatos.length === 0) {
      throw new BadRequestException("Nenhum candidato para importar.");
    }

    // COM_VAGA: a vaga é conferida UMA VEZ, antes de criar ninguém, para não deixar candidato órfão
    // quando a vaga nem recebe gente. A vinculação real (por linha) reconfere a vaga lá dentro.
    if (cenario === "COM_VAGA") {
      if (!vagaId) throw new BadRequestException("Escolha a vaga para vincular os candidatos.");
      await this.exigirVagaQueRecebe(vagaId);
    }

    const relatorio: ResultadoImportCurriculo["linhas"] = [];
    const idsParaVincular: string[] = [];
    let novos = 0;
    let semCpf = 0;
    let duplicadosCpf = 0;
    let invalidos = 0;

    for (let indice = 0; indice < candidatos.length; indice += 1) {
      const bruto = candidatos[indice];
      const nome = (bruto?.nome ?? "").trim().slice(0, 200);
      if (!nome) {
        invalidos += 1;
        relatorio.push({ indice, nome: "", status: "INVALIDO", motivo: "Currículo sem nome." });
        continue;
      }

      const cpf = this.cpfValidoOuUndefined(bruto.cpf);
      const dto = {
        nome,
        cpf,
        email: this.limitarOuUndefined(bruto.email, 180),
        telefones: this.telefonesLimpos(bruto.telefones),
        dataNascimento: this.dataOuUndefined(bruto.nascimento),
        cidade: this.limitarOuUndefined(bruto.cidade, 120),
        uf: this.ufOuUndefined(bruto.uf),
        origem: "IMPORTACAO" as const,
      };

      try {
        const ficha = await this.candidatos.criar(dto, autor);
        idsParaVincular.push(ficha.id);
        const status: StatusLinhaImportCandidato = cpf ? "IMPORTADO" : "SEM_CPF";
        if (cpf) novos += 1;
        else semCpf += 1;
        relatorio.push({ indice, nome, status });
      } catch (err) {
        const reaproveitadoId = this.idDoConflitoDeCpf(err);
        if (reaproveitadoId !== null) {
          // CPF já existe: REAPROVEITA. `criar` lança ANTES de inserir, então nada foi criado.
          duplicadosCpf += 1;
          if (reaproveitadoId) idsParaVincular.push(reaproveitadoId);
          relatorio.push({ indice, nome, status: "REAPROVEITADO" });
        } else {
          // §A.6: motivo FIXO, nunca `err.message` (pode espelhar dado do candidato).
          invalidos += 1;
          relatorio.push({
            indice,
            nome,
            status: "INVALIDO",
            motivo: "Não foi possível importar este currículo.",
          });
        }
      }
    }

    let vinculados = 0;
    if (cenario === "COM_VAGA" && vagaId && idsParaVincular.length > 0) {
      // DEDUPE antes de vincular: o mesmo CPF reaproveitado duas vezes no lote geraria um "já está na
      // vaga" que é ruído, não resultado.
      const unicos = [...new Set(idsParaVincular)];
      const resultado = await this.candidatos.adicionarEmLote(vagaId, { candidatoIds: unicos }, autor);
      vinculados = resultado.aplicadas;
    }

    const importados = novos + semCpf;
    return {
      contagem: { total: candidatos.length, novos, duplicadosCpf, semCpf, invalidos },
      importados,
      reaproveitados: duplicadosCpf,
      vinculados,
      ignorados: invalidos,
      linhas: relatorio,
    };
  }

  /** A vaga existe e recebe candidato? A régua vem do catálogo, a mesma que a planilha usa. */
  private async exigirVagaQueRecebe(vagaId: string): Promise<void> {
    const vaga = await this.db.query.vagas.findFirst({ where: eq(vagas.id, vagaId) });
    if (!vaga) throw new NotFoundException("Vaga não encontrada.");
    const regua = await this.statusVaga.regua();
    if (!regua.recebeCandidato(vaga.status)) {
      throw new ConflictException("Esta vaga está Fechada e não recebe candidato novo.");
    }
  }

  /**
   * O id do candidato já existente quando `criar` recusa por CPF duplicado, ou `null` quando o erro é
   * outro. Mesma leitura do serviço da planilha: o 409 embute o `candidatoId`, e a corrida do unique
   * devolve um 409 SEM id (string vazia: marca REAPROVEITADO sem tentar vincular um id que não temos).
   */
  private idDoConflitoDeCpf(err: unknown): string | null {
    if (!(err instanceof ConflictException)) return null;
    const corpo = err.getResponse();
    if (corpo && typeof corpo === "object" && "candidatoId" in corpo) {
      const id = (corpo as { candidatoId?: unknown }).candidatoId;
      return typeof id === "string" ? id : "";
    }
    return "";
  }

  /** A lista de telefones aparada, sem vazios e cortada no tamanho da coluna. O `criar` deriva o par. */
  private telefonesLimpos(lista: string[] | undefined): string[] {
    if (!Array.isArray(lista)) return [];
    const saida: string[] = [];
    for (const bruto of lista) {
      const t = (bruto ?? "").trim().slice(0, 40);
      if (t) saida.push(t);
    }
    return saida;
  }

  /** CPF normalizado e VÁLIDO, ou `undefined`. Vazio e inválido caem no mesmo lugar: importa sem CPF. */
  private cpfValidoOuUndefined(bruto: string): string | undefined {
    const cpf = normalizeCpf(bruto ?? "");
    return cpf && isValidCpf(cpf) ? cpf : undefined;
  }

  /** Texto aparado e limitado ao tamanho da coluna, ou `undefined` quando vazio. */
  private limitarOuUndefined(bruto: string, max: number): string | undefined {
    const t = (bruto ?? "").trim();
    return t ? t.slice(0, max) : undefined;
  }

  /** A UF em maiúsculas se for uma das 27, senão `undefined`: valor fora da lista não entra no `uf(2)`. */
  private ufOuUndefined(bruto: string): string | undefined {
    const uf = (bruto ?? "").trim().toUpperCase();
    return CandidatosImportCurriculoService.UFS_VALIDAS.has(uf) ? uf : undefined;
  }

  /**
   * A data como `YYYY-MM-DD`, ou `undefined` quando não é uma data de calendário válida. Aceita ISO e
   * `DD/MM/AAAA` (a IA devolve ISO, mas um valor editado na tela pode vir em BR), e faz round-trip
   * para recusar 31/02 antes de o Postgres recusar: data ruim não derruba a linha, importa sem ela.
   */
  private dataOuUndefined(bruto: string): string | undefined {
    const t = (bruto ?? "").trim();
    if (!t) return undefined;

    let ano: number, mes: number, dia: number;
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t);
    if (iso) {
      ano = Number(iso[1]);
      mes = Number(iso[2]);
      dia = Number(iso[3]);
    } else if (br) {
      dia = Number(br[1]);
      mes = Number(br[2]);
      ano = Number(br[3]);
      if (br[3].length === 2) ano += ano > 50 ? 1900 : 2000;
    } else {
      return undefined;
    }

    const d = new Date(Date.UTC(ano, mes - 1, dia));
    const valida =
      d.getUTCFullYear() === ano && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
    if (!valida) return undefined;
    return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  }
}
