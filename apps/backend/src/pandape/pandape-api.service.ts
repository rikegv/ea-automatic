import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Um documento do pré-colaborador no Pandapé. A `url` é PÚBLICA e NÃO EXPIRA (§A.5) → trafega só em
 * memória, NUNCA é persistida nem logada (§A.6). O `label` identifica o tipo (mapeado ao catálogo).
 * Campos opcionais: o payload real é desconhecido até o token chegar.
 */
export interface PandapeDocument {
  label?: string;
  tipo?: string;
  url?: string;
}

/**
 * Pré-colaborador do Pandapé (GET /v3/precollaborators/{id}). Modelado DEFENSIVAMENTE: tudo opcional
 * porque o formato real só será confirmado quando o token chegar (OST §2 / §A.9). Os IDs alimentam
 * a IntegraçãoPandapé; os dados pessoais alimentam o candidato; `documents` alimenta o pull (F2).
 *
 * NOTA LGPD (§A.6): `cpf` é chave técnica — nunca é logado. As `documents[].url` nunca tocam banco/log.
 */
export interface PandaperPrecollaborator {
  idPreCollaborator: string;
  idMatch?: string;
  idVacancy?: string;
  /* a etapa pode vir como `etapa` ou `stage` dependendo do locale do payload */
  etapa?: string;
  stage?: string;
  nome?: string;
  cpf?: string;
  telefone?: string;
  email?: string;
  dataNascimento?: string;
  documents?: PandapeDocument[];
  /* TODO confirmar formato real quando o token chegar (OST §2) */
}

/**
 * Dados estruturados da vaga (GET /v3/vacancies/{id}) — INVESTIGAÇÃO (OST §2): tentativa de derivar
 * cliente (nome/CNPJ) e cargo da vaga. O mapeamento vaga→(cod_cliente, cargo) do EA depende de
 * insumo do diretor (§A.9) e SÓ será confirmado quando o token/payload real chegar. Se vier vazio,
 * a admissão não pode nascer (FK obrigatória) e a sync é adiada — NÃO se inventa cod_cliente.
 */
export interface PandapeVacancy {
  idVacancy: string;
  cargoNome?: string;
  clienteNome?: string;
  clienteCnpj?: string;
  /* TODO confirmar formato real e o de/para cliente/cargo quando o token chegar (OST §2 / §A.9) */
}

/**
 * Cliente HTTP da API do Pandapé (INT-1). Usa o `fetch` global do Node 20 (sem axios), Bearer no
 * header Authorization. **INERTE sem token**: se `PANDAPE_API_TOKEN` estiver ausente/vazio,
 * `estaAtivo()` é false e toda chamada externa vira no-op (loga UMA vez e retorna vazio) — o módulo
 * existe mas não toca a rede. NUNCA loga URLs de documento nem CPF (§A.6). Sem token hardcoded.
 */
@Injectable()
export class PandapeApiService {
  private readonly logger = new Logger("PandapeApiService");
  private readonly baseUrl: string;
  private readonly token: string;
  private avisouInerte = false;
  private static readonly TIMEOUT_MS = 30_000;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("PANDAPE_API_BASE_URL") ?? "https://api.pandape.com").replace(
      /\/+$/,
      "",
    );
    this.token = (config.get<string>("PANDAPE_API_TOKEN") ?? "").trim();
  }

  /** Token presente → integração ativa. Sem token, o módulo é inerte (no-op em tudo). */
  estaAtivo(): boolean {
    return this.token.length > 0;
  }

  /** Loga a inércia UMA única vez (flag anti-spam) e devolve true se está inerte. */
  private inerte(): boolean {
    if (this.estaAtivo()) return false;
    if (!this.avisouInerte) {
      this.logger.warn("Pandapé inerte: PANDAPE_API_TOKEN ausente");
      this.avisouInerte = true;
    }
    return true;
  }

  /** GET /v3/precollaborators/{id}. Inerte → undefined. NUNCA loga o id de forma sensível, CPF ou URL. */
  async getPrecollaborator(id: string): Promise<PandaperPrecollaborator | undefined> {
    if (this.inerte()) return undefined;
    return this.get<PandaperPrecollaborator>(`/v3/precollaborators/${encodeURIComponent(id)}`);
  }

  /**
   * Lista os idPreCollaborator com mudanças desde a última verificação. Contrato real DESCONHECIDO
   * até o token chegar — encapsulado para devolver sempre `string[]`. Inerte → []. O filtro `desde`
   * será confirmado com o token (provavelmente um query param ISO; deixado como TODO).
   */
  async listarMudancas(desde?: Date): Promise<string[]> {
    if (this.inerte()) return [];
    /* TODO confirmar endpoint, paginação e o parâmetro de filtro "desde" quando o token chegar (OST §2). */
    const qs = desde ? `?since=${encodeURIComponent(desde.toISOString())}` : "";
    const lista = await this.get<Array<{ idPreCollaborator?: string }>>(
      `/v3/precollaborators/changes${qs}`,
    );
    if (!Array.isArray(lista)) return [];
    return lista.map((c) => c.idPreCollaborator).filter((v): v is string => Boolean(v));
  }

  /**
   * GET /v3/vacancies/{id} — INVESTIGAÇÃO (OST §2): tenta puxar cliente/cargo estruturados da vaga.
   * Inerte → undefined. O de/para vaga→(cod_cliente, cargo) do EA depende de insumo do diretor
   * (§A.9): enquanto não chega, o consumidor trata "não resolvido" como pendência (não-bloqueio,
   * regra 5) e NÃO inventa cod_cliente.
   */
  async getVacancy(idVacancy: string): Promise<PandapeVacancy | undefined> {
    if (this.inerte()) return undefined;
    return this.get<PandapeVacancy>(`/v3/vacancies/${encodeURIComponent(idVacancy)}`);
  }

  /** GET genérico com Bearer + timeout. Erros só logam status + rota (nunca corpo/PII/URL — §A.6). */
  private async get<T>(path: string): Promise<T | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PandapeApiService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        // Só status — a rota pode conter um id, então logamos apenas o verbo/método (sem PII/URL).
        this.logger.error(`Pandapé respondeu HTTP ${res.status} em uma chamada GET`);
        return undefined;
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error("Chamada ao Pandapé excedeu o tempo limite");
      } else {
        this.logger.error(
          `Falha ao chamar o Pandapé: ${err instanceof Error ? err.message : "erro"}`,
        );
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
