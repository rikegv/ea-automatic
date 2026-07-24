import {
  ConflictException,
  GatewayTimeoutException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ArquivamentoDrive, DriveSubpasta, ResultadoAuditoria } from "@ea/shared-types";
import {
  familiaPorStatus,
  MOTIVO_FALHA_IA,
  type FamiliaFalhaIa,
} from "../domain/falha-auditoria";

/** Payload de auditoria de UM documento. `candidato.cpf` vai SÓ para a IA — nunca é logado (§A.6). */
export interface AuditarDocumentoPayload {
  /** Auditoria por CONJUNTO: 1 ou mais arquivos do MESMO documento (frente e verso, páginas). */
  stagingPaths: string[];
  tipoDocumentoCodigo: string;
  tipoDocumentoNome: string;
  candidato: { nome: string; cpf: string };
  regras: Array<{ descricaoRegra: string }>;
}

/** Um arquivo a arquivar no Drive: caminho na staging, nome final e subpasta de destino. */
export interface ArquivoDrive {
  stagingPath: string;
  nomeFinal: string;
  subpasta: DriveSubpasta;
}

export interface ArquivarDrivePayload {
  parentFolderId: string;
  pastaNome: string;
  arquivos: ArquivoDrive[];
}

export interface GerarKitPayload {
  stagingPath: string;
  nomeCandidato: string;
}

/** Uma linha do itinerário no documento de VT, já pronta para a tabela do PDF. */
export interface ConducaoVtPayload {
  sentido: "IDA" | "VOLTA";
  /** Coluna "Meio de transporte": tipo + cidade (ex.: "Ônibus municipal - São Paulo"). */
  meioTransporte: string;
  /** Coluna "Cartão/tipo": o cartão que o candidato declarou usar. */
  cartao: string;
  valor: number;
}

/** Dados do documento de VT (optante ou recusa). Tudo já resolvido pelo backend. */
export interface DocumentoVtPayload {
  tipo: "OPTANTE" | "NAO_OPTANTE";
  nome: string;
  cpf: string;
  dataNascimento: string | null;
  endereco: string;
  cidadeUf: string;
  conducoes: ConducaoVtPayload[];
  totalIda: number;
  totalVolta: number;
  totalDia: number;
}

/** Motor de extração do kit (OST etapa 3). Job assíncrono: inicia e acompanha por polling. */
export interface ExtrairKitPayload {
  kitTipoId: string;
  documentos: Array<{ stagingPath: string; arquivo: string }>;
}
/** Reimportação de PDFs para um funcionário do resultado. Devolve o resultado atualizado. */
export interface ReimportarKitResposta {
  resultado: unknown;
  anexados: string[];
}
export interface KitJobStart {
  jobId: string;
  totalLotes: number;
}
/** `resultado` (quando status==="concluido") já vem em camelCase, pronto para a tela. */
export interface KitJobStatus {
  status: "processando" | "concluido" | "erro";
  loteAtual: number;
  totalLotes: number;
  mensagem: string;
  retries: number;
  resultado: unknown | null;
  erro: string | null;
}

/** Download binário (Etapa 4): o PDF/ZIP consolidado + os cabeçalhos que o front repassa ao browser. */
export interface KitBinario {
  buffer: Buffer;
  contentType: string;
  contentDisposition: string;
}

/**
 * FALHA DA AUDITORIA COM FAMÍLIA (OST motivo verdadeiro, Blocos 1 e 2).
 *
 * Antes existia UMA exceção especial, a de quota, e todo o resto virava `ServiceUnavailableException`
 * genérica. Duas consequências ruins: o chamador só sabia reescrever o motivo do caso de quota, e o
 * 415 (arquivo que não serve) era rotulado "Motor de IA indisponível", afirmação FALSA que mandava o
 * consultor esperar por um sistema que estava no ar.
 *
 * Agora toda falha da auditoria carrega a `familia` (ver `domain/falha-auditoria`), e é a família que
 * decide as três coisas que importam: o texto exibido, se o documento vira INCONFORME ou fica
 * coletado, e se pode ser retentado.
 */
export class FalhaAuditoriaIaException extends HttpException {
  constructor(
    readonly familia: FamiliaFalhaIa,
    mensagem: string,
    status: number,
  ) {
    super(mensagem, status);
  }
}

/**
 * QUOTA da IA esgotada. Mantida como subclasse por ser o caso com nome próprio no código e nos
 * testes desde a OST B1; hoje é só a família `QUOTA` da hierarquia acima. O documento não tem nada de
 * errado, o limite de uso do Vertex é que foi atingido. O ai-service já retentou com backoff antes de
 * chegar aqui.
 */
export class MotorIaSemQuotaException extends FalhaAuditoriaIaException {
  constructor() {
    super(
      "QUOTA",
      "Limite de uso da IA atingido (quota). O documento segue coletado e será reanalisado.",
      429,
    );
  }
}

/**
 * Motivo persistido quando a auditoria parou por quota. Alias do texto da família, para não existirem
 * dois textos concorrentes dizendo a mesma coisa.
 */
export const MOTIVO_QUOTA_IA = MOTIVO_FALHA_IA.QUOTA;

/**
 * Família de QUALQUER erro que chegue do caminho da auditoria. Ponto único de leitura, para o
 * chamador nunca precisar de `instanceof` encadeado:
 *  - exceção já classificada  → usa a família que ela carrega;
 *  - outra `HttpException`    → classifica pelo status (cobre exceções levantadas fora deste client);
 *  - qualquer outra coisa     → `DESCONHECIDA`, que tem texto próprio e não retenta.
 * Nunca devolve `undefined`: falha sem família seria falha sem motivo exibido, que é o defeito que
 * esta OST veio corrigir.
 */
export function familiaDaFalha(err: unknown): FamiliaFalhaIa {
  if (err instanceof FalhaAuditoriaIaException) return err.familia;
  if (err instanceof HttpException) return familiaPorStatus(err.getStatus());
  return "DESCONHECIDA";
}

/**
 * Wrapper HTTP para o `ai-service` (FastAPI / Vertex AI — INT-3). Usa o `fetch` global do Node 20
 * (sem axios). Autentica com `X-Internal-Token`. NUNCA loga CPF, nome ou payload (§A.6) — só status
 * e rota em caso de erro. Timeout por AbortController (operações de IA podem ser lentas).
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger("AiClientService");
  private readonly baseUrl: string;
  private readonly token: string;
  private static readonly TIMEOUT_MS = 120_000;
  private static readonly DOWNLOAD_TIMEOUT_MS = 300_000;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("AI_SERVICE_URL") ?? "http://localhost:8000").replace(
      /\/+$/,
      "",
    );
    this.token = config.get<string>("INTERNAL_TOKEN") ?? "";
  }

  /** Audita um documento contra as regras do tipo. Devolve o veredito (sem PII). */
  /**
   * READINESS do Vertex pelo CAMINHO REAL (tela de diagnóstico, Bloco 3): o ai-service faz uma
   * geração mínima (1 token) e diz se o modelo respondeu. NÃO é o /health (que mente: já respondeu
   * 200 com a auditoria em 503). Timeout curto: um readiness lento é ele próprio um sinal. Nunca
   * lança: erro de rede vira `{ok:false}`.
   */
  async readinessVertex(): Promise<{ ok: boolean; detalhe: string; erro?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(`${this.baseUrl}/readiness`, {
        method: "GET",
        headers: { "X-Internal-Token": this.token },
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, detalhe: `ai-service /readiness HTTP ${res.status}` };
      return (await res.json()) as { ok: boolean; detalhe: string; erro?: string };
    } catch (err) {
      return {
        ok: false,
        detalhe: "ai-service inalcançável",
        erro: err instanceof Error ? err.name : "erro",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** READINESS do Drive pelo caminho real (about.get com a credencial em uso). Nunca lança. */
  async readinessDrive(): Promise<{ ok: boolean; detalhe: string; identidade?: string; erro?: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${this.baseUrl}/readiness/drive`, {
        method: "GET",
        headers: { "X-Internal-Token": this.token },
        signal: controller.signal,
      });
      if (!res.ok) return { ok: false, detalhe: `ai-service /readiness/drive HTTP ${res.status}` };
      return (await res.json()) as { ok: boolean; detalhe: string; identidade?: string; erro?: string };
    } catch (err) {
      return { ok: false, detalhe: "ai-service inalcançável", erro: err instanceof Error ? err.name : "erro" };
    } finally {
      clearTimeout(timer);
    }
  }

  auditarDocumento(payload: AuditarDocumentoPayload): Promise<ResultadoAuditoria> {
    return this.post<ResultadoAuditoria>("/auditoria/documento", payload);
  }

  /** Arquiva os documentos no Drive ao fechar a régua obrigatória. */
  arquivarDrive(payload: ArquivarDrivePayload): Promise<ArquivamentoDrive> {
    return this.post<ArquivamentoDrive>("/drive/arquivar", payload);
  }

  /** Gera o kit (desmembra o PDF-mãe) e devolve o caminho do kit na staging. */
  gerarKit(payload: GerarKitPayload): Promise<{ stagingPathKit: string }> {
    return this.post<{ stagingPathKit: string }>("/kit/gerar", payload);
  }

  /** Inicia o job de extração do kit e devolve o id + total de lotes (OST etapa 3). */
  extrairKit(payload: ExtrairKitPayload): Promise<KitJobStart> {
    return this.post<KitJobStart>("/kit/extrair", payload);
  }

  /** Progresso/estado do job de extração (polling). */
  extrairKitStatus(jobId: string): Promise<KitJobStatus> {
    return this.get<KitJobStatus>(`/kit/extrair/status/${encodeURIComponent(jobId)}`);
  }

  /**
   * Reimporta PDFs para UM funcionário do resultado (anexa os documentos que faltavam). Devolve o
   * resultado atualizado. Mensagens de erro FIXAS aqui (nunca o corpo do ai-service, §A.6): 404
   * resultado expirado, 409 PDF de outra pessoa, 422 nada reconhecido, 503 IA indisponível.
   */
  async reimportarKit(
    jobId: string,
    indice: number,
    documentos: Array<{ stagingPath: string; arquivo: string }>,
  ): Promise<ReimportarKitResposta> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AiClientService.TIMEOUT_MS);
    const path = `/kit/reimportar/${encodeURIComponent(jobId)}/funcionario/${indice}`;
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": this.token },
        body: JSON.stringify({ documentos }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`ai-service ${path} respondeu HTTP ${res.status}`);
        if (res.status === 404) {
          throw new NotFoundException("Resultado expirado. Reprocesse o kit para reimportar.");
        }
        if (res.status === 409) {
          throw new ConflictException(
            "O PDF enviado parece ser de outra pessoa. Nada foi anexado; confira o arquivo.",
          );
        }
        if (res.status === 422) {
          throw new UnprocessableEntityException(
            "Nenhum documento deste funcionário foi reconhecido no PDF enviado.",
          );
        }
        throw new ServiceUnavailableException("Motor de IA indisponível para reimportar.");
      }
      return (await res.json()) as ReimportarKitResposta;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error(`ai-service ${path} excedeu o tempo limite`);
        throw new GatewayTimeoutException("Motor de IA não respondeu no tempo limite");
      }
      this.logger.error(
        `Falha ao chamar ai-service ${path}: ${err instanceof Error ? err.message : "erro"}`,
      );
      throw new ServiceUnavailableException("Motor de IA indisponível");
    } finally {
      clearTimeout(timer);
    }
  }

  /** PDF consolidado de UM funcionário do job (Etapa 4). */
  baixarKitFuncionario(jobId: string, indice: number): Promise<KitBinario> {
    return this.baixarBinario(`/kit/download/${encodeURIComponent(jobId)}/funcionario/${indice}`);
  }

  /** ZIP com um PDF por funcionário do job (Etapa 4). */
  baixarKitZip(jobId: string): Promise<KitBinario> {
    return this.baixarBinario(`/kit/download/${encodeURIComponent(jobId)}/zip`);
  }

  /**
   * Documento do formulário de VT (§A.17 etapa 2), optante ou não-optante. O ai-service compõe o
   * PDF com reportlab e devolve os bytes; nada é gravado em disco de nenhum dos dois lados.
   * O payload leva PII (nome, CPF, endereço) porque o documento oficial exige: vai só no corpo do
   * POST, nunca em log (§A.6).
   */
  gerarDocumentoVt(payload: DocumentoVtPayload): Promise<KitBinario> {
    return this.postBinario("/vt/documento", payload);
  }

  /**
   * GET binário no ai-service (PDF/ZIP do kit). Devolve o corpo + Content-Type/Disposition para o
   * controller repassar ao browser. 404 (job/funcionário inexistente) e 410 (origem expirada por
   * TTL) viram exceções acionáveis; nada de PII em log (§A.6). Timeout folgado (ZIP de muitos kits).
   */
  private async baixarBinario(path: string): Promise<KitBinario> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AiClientService.DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: { "X-Internal-Token": this.token },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`ai-service ${path} respondeu HTTP ${res.status}`);
        if (res.status === 404) throw new NotFoundException("Kit não disponível para download.");
        if (res.status === 410) {
          throw new GoneException("Os PDFs de origem expiraram. Reprocesse o kit para baixar.");
        }
        throw new ServiceUnavailableException(`Motor de IA indisponível (HTTP ${res.status})`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      return {
        buffer,
        contentType: res.headers.get("content-type") ?? "application/octet-stream",
        contentDisposition: res.headers.get("content-disposition") ?? "attachment",
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error(`ai-service ${path} excedeu o tempo limite`);
        throw new GatewayTimeoutException("Motor de IA não respondeu no tempo limite");
      }
      this.logger.error(
        `Falha ao chamar ai-service ${path}: ${err instanceof Error ? err.message : "erro"}`,
      );
      throw new ServiceUnavailableException("Motor de IA indisponível");
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * POST com corpo JSON que RESPONDE binário (PDF). Espelha o baixarBinario, mas para os casos em
   * que o documento é composto a partir de dados, não recortado de um arquivo existente.
   * O corpo do POST nunca é logado: leva PII (§A.6).
   */
  private async postBinario(path: string, body: unknown): Promise<KitBinario> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AiClientService.DOWNLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": this.token },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`ai-service ${path} respondeu HTTP ${res.status}`);
        throw new ServiceUnavailableException(`Motor de documentos indisponível (HTTP ${res.status})`);
      }
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") ?? "application/pdf",
        contentDisposition: res.headers.get("content-disposition") ?? "attachment",
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error(`ai-service ${path} excedeu o tempo limite`);
        throw new GatewayTimeoutException("Motor de documentos não respondeu no tempo limite");
      }
      this.logger.error(
        `Falha ao chamar ai-service ${path}: ${err instanceof Error ? err.message : "erro"}`,
      );
      throw new ServiceUnavailableException("Motor de documentos indisponível");
    } finally {
      clearTimeout(timer);
    }
  }

  private get<T>(path: string): Promise<T> {
    return this.requisitar<T>("GET", path);
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.requisitar<T>("POST", path, body);
  }

  /**
   * Mensagem exibida para uma falha classificada. A FAMÍLIA é sempre a mesma régua, mas o TEXTO
   * depende de quem chamou: os motivos de `MOTIVO_FALHA_IA` falam de documento auditado e de pedir
   * reenvio ao candidato, o que só faz sentido na auditoria. Kit, Drive e VT usam o mesmo motor e
   * ficam com o texto genérico de antes, para não passarem a instruir o consultor a pedir reenvio de
   * um documento que nem está em jogo ali.
   */
  private static mensagemDeFalha(path: string, familia: FamiliaFalhaIa, status: number): string {
    if (path === "/auditoria/documento") return MOTIVO_FALHA_IA[familia];
    if (familia === "ENTRADA") return "Documento não pôde ser processado pelo motor de IA.";
    return `Motor de IA indisponível (HTTP ${status})`;
  }

  private async requisitar<T>(metodo: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AiClientService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": this.token,
        },
        body: metodo === "POST" ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        // Só status + rota — nunca o corpo (pode espelhar PII enviada) (§A.6).
        this.logger.error(`ai-service ${path} respondeu HTTP ${res.status}`);
        // OST motivo verdadeiro / Bloco 2: TODA falha sai classificada por família, e é a família
        // que carrega a verdade. O 415 vinha daqui rotulado "Motor de IA indisponível", que é falso:
        // o motor RESPONDEU, e respondeu que o arquivo é que não serve. O corpo do ai-service segue
        // sem ser repassado (pode espelhar PII, §A.6); a mensagem vem da tabela fixa da família.
        const familia = familiaPorStatus(res.status);
        this.logger.warn(`ai-service ${path}: falha de família ${familia} (HTTP ${res.status})`);
        if (familia === "QUOTA") throw new MotorIaSemQuotaException();
        throw new FalhaAuditoriaIaException(
          familia,
          AiClientService.mensagemDeFalha(path, familia, res.status),
          res.status,
        );
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        // Timeout é INDISPONIBILIDADE: o motor não respondeu a tempo, o documento não tem culpa.
        this.logger.error(`ai-service ${path} excedeu o tempo limite`);
        throw new FalhaAuditoriaIaException(
          "INDISPONIBILIDADE",
          MOTIVO_FALHA_IA.INDISPONIBILIDADE,
          504,
        );
      }
      // Rede caiu, DNS, conexão recusada: o motor está fora, mesma família do timeout.
      this.logger.error(
        `Falha ao chamar ai-service ${path}: ${err instanceof Error ? err.message : "erro"}`,
      );
      throw new FalhaAuditoriaIaException(
        "INDISPONIBILIDADE",
        MOTIVO_FALHA_IA.INDISPONIBILIDADE,
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
