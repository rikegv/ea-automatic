import {
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ArquivamentoDrive, DriveSubpasta, ResultadoAuditoria } from "@ea/shared-types";

/** Payload de auditoria de UM documento. `candidato.cpf` vai SÓ para a IA — nunca é logado (§A.6). */
export interface AuditarDocumentoPayload {
  stagingPath: string;
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

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("AI_SERVICE_URL") ?? "http://localhost:8000").replace(
      /\/+$/,
      "",
    );
    this.token = config.get<string>("INTERNAL_TOKEN") ?? "";
  }

  /** Audita um documento contra as regras do tipo. Devolve o veredito (sem PII). */
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AiClientService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": this.token,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Só status + rota — nunca o corpo (pode espelhar PII enviada) (§A.6).
        this.logger.error(`ai-service ${path} respondeu HTTP ${res.status}`);
        // 422 é erro de ENTRADA acionável (ex.: PDF-mãe sem a página do candidato), não
        // indisponibilidade — propaga como 422 para o front exibir orientação ao consultor. O
        // corpo do ai-service NÃO é repassado (pode espelhar PII, §A.6); a mensagem é fixa.
        if (res.status === 422) {
          throw new UnprocessableEntityException(
            "Documento não pôde ser processado pelo motor de IA.",
          );
        }
        throw new ServiceUnavailableException(`Motor de IA indisponível (HTTP ${res.status})`);
      }
      return (await res.json()) as T;
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
}
