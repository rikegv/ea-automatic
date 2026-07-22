import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Um documento do pré-colaborador no Pandapé (GET /v1/PreCollaborator/Get → `documents[]`). O `link`
 * é a URL PÚBLICA e NÃO EXPIRA (§A.5) → trafega só em memória, NUNCA é persistida nem logada (§A.6).
 *
 * Campos reais (camelCase, confirmados contra o swagger v1): `name`, `link`, `extension`.
 * Campos legados (`label`/`tipo`/`url`) são mantidos opcionais só para o sync compilar enquanto o
 * remap completo (link↔url, name↔label) é follow-up — ver TODO no pandape-sync.service.ts.
 */
export interface PandapeDocument {
  /* reais (v1) */
  name?: string;
  link?: string;
  extension?: string;
  /* legado/compat do sync (remap follow-up) */
  label?: string;
  tipo?: string;
  url?: string;
}

/**
 * Formulário do processo admissional do Pandapé (GET /v3/precollaborators/{id} → `forms[]`).
 *
 * O `name` do FORMULÁRIO é o que identifica o TIPO do documento ("Comprovante de Residência",
 * "CTPS (Carteira de Trabalho e Previdência Social)"). É a entrada do `resolverTipoDocumento`.
 *
 * Por que a v3 e não a v1/v2: nelas os documentos vêm soltos em `documents[]` na raiz, e o único
 * rótulo disponível é o **nome do arquivo** ("IMG-<numeros>.jpg"), que não diz o tipo e ainda carrega
 * PII (já foi visto CPF no nome do arquivo). A v3 é a única versão que entrega a associação
 * tipo → documentos. Confirmado ao vivo contra a API real.
 */
export interface PandapeFormulario {
  name?: string;
  documents?: PandapeDocument[];
}

/**
 * Pré-colaborador na v3 — GET /v3/precollaborators/{id}. Usado SÓ para documentos: a identidade
 * (idMatch, nome, e-mail, vaga) continua vindo da v1, que é o que o resto do sync já consome.
 * A v3 não devolve `answers` nem `documents` na raiz.
 */
export interface PandapePrecollaboratorV3 {
  idPreCollaborator?: string;
  forms?: PandapeFormulario[];
}

/**
 * Pré-colaborador do Pandapé — GET /v1/PreCollaborator/Get?idPreCollaborator={id}. JSON é camelCase
 * (confirmado contra a API real + swagger v1). **NÃO traz CPF** (nem telefone/nascimento): esses
 * dados pessoais vêm de `getMatch(idMatch)` (MatchModel). O `vacancyJob` é o cargo como string; a
 * resolução vaga→(cod_cliente, cargo) do EA é follow-up (de/para pendente, §A.9).
 *
 * NOTA LGPD (§A.6): nenhum campo desta entidade é logado de forma sensível; `documents[].link` nunca
 * toca banco/log.
 *
 * NOTA DE REMAP (follow-up): os campos `nome`/`cpf`/`telefone`/`dataNascimento`/`etapa`/`stage` NÃO
 * são retornados por este endpoint. Ficam opcionais aqui apenas para o sync compilar; o
 * enriquecimento real (CPF/telefone/nascimento via `getMatch`, etapa via webhook) é follow-up.
 */
export interface PandaperPrecollaborator {
  /* reais (v1, camelCase) */
  idPreCollaborator: string;
  idMatch?: string;
  idVacancy?: string;
  name?: string;
  surname?: string;
  email?: string;
  admissionDate?: string;
  fillDate?: string;
  currentFolderName?: string;
  vacancyJob?: string;
  vacancyReference?: string;
  answers?: unknown[];
  documents?: PandapeDocument[];
  /* enriquecimento — NÃO vem deste endpoint (remap follow-up): */
  nome?: string;
  cpf?: string;
  telefone?: string;
  dataNascimento?: string;
  etapa?: string;
  stage?: string;
}

/**
 * Match do Pandapé — GET /v1/Match/Get?idMatch={id} (MatchModel, camelCase). **É AQUI que vem o CPF**
 * + telefone + data de nascimento + endereço. §A.6: `cpf` é chave técnica — NUNCA logado.
 */
export interface PandapeMatch {
  idMatch?: number | string;
  idCandidate?: number | string;
  idVacancy?: number | string;
  cpf?: string;
  name?: string;
  surname?: string;
  email?: string;
  phone?: string;
  /** Vem como datetime completo ("1990-01-15T00:00:00"), não data pura — fatiar para YYYY-MM-DD. */
  birthDate?: string;
  /**
   * Sexo pelo dicionário OFICIAL do Pandapé (GET /v1/Dictionary/Sex, confirmado ao vivo em 17/07):
   * **1=Masculino, 2=Feminino, 0=Não Especificado**. O EA usa para a régua do Reservista, então
   * inverter isto cobraria Reservista de quem não deve: mapear só pelo dicionário, nunca por palpite.
   */
  idSex?: number | string;
  cep?: string;
  address?: string;
}

/**
 * Cliente do Pandapé — GET /v1/Client/List (e Client/Get?idClient). `cif` é o CNPJ (14 dígitos) usado
 * no de/para com `cliente.cnpj` do EA. NÃO confundir com o `Cliente` do domínio EA.
 */
export interface PandapeClient {
  idClient?: number | string;
  name?: string;
  businessName?: string;
  cif?: string;
  description?: string;
}

/**
 * Vaga do Pandapé — GET /v1/Vacancy/List (camelCase). Campos reais: `idVacancy`, `job` (cargo como
 * string), `city`, `description`, `status`, `tags[]`. **A API v1 NÃO tem Vacancy/Get por id** e a vaga
 * **NÃO traz cliente/CNPJ** — o de/para vaga→(cod_cliente, cargo) é follow-up (§A.9). Os campos
 * `cargoNome`/`clienteCnpj` ficam opcionais só para o consumidor (sync) compilar até o remap.
 */
export interface PandapeVacancy {
  idVacancy: number | string;
  job?: string;
  city?: string;
  description?: string;
  status?: string;
  tags?: string[];
  /* de/para EA (remap follow-up) — NÃO vêm da vaga real */
  cargoNome?: string;
  clienteCnpj?: string;
}

/**
 * Cliente HTTP da API do Pandapé (INT-1) com **OAuth2 client_credentials** (IdentityServer). O token
 * fixo (Bearer estático) foi substituído por um gerenciador que emite e cacheia o `access_token` no
 * `/connect/token` e o renova antes de expirar.
 *
 * **INERTE sem credenciais**: se `PANDAPE_CLIENT_ID`/`PANDAPE_CLIENT_SECRET` faltarem, `estaAtivo()`
 * é false e toda chamada externa vira no-op (loga UMA vez e retorna vazio) — o módulo existe mas não
 * toca a rede, nem o endpoint de token.
 *
 * §A.6: NUNCA loga nem persiste `client_secret` ou `access_token`; nunca loga URL de documento nem
 * CPF. Erros de rede/HTTP logam só status + verbo. Sem segredo hardcoded.
 */
@Injectable()
export class PandapeApiService {
  private readonly logger = new Logger("PandapeApiService");
  private readonly baseUrl: string;
  private readonly tokenUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private avisouInerte = false;

  /** Cache do access_token (só memória). `expiraEm` = epoch ms já com a margem de 60s descontada. */
  private accessToken?: string;
  private expiraEm = 0;
  /** Uma única emissão de token em voo, compartilhada, para evitar corrida (várias chamadas → 1 fetch). */
  private tokenEmVoo?: Promise<string | undefined>;

  private static readonly TIMEOUT_MS = 30_000;
  private static readonly MARGEM_MS = 60_000; // renova 60s antes do expires_in real.

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>("PANDAPE_API_BASE_URL") ?? "https://api.pandape.com.br"
    ).replace(/\/+$/, "");
    this.tokenUrl = (
      config.get<string>("PANDAPE_TOKEN_URL") ?? "https://login.pandape.com.br/connect/token"
    ).trim();
    this.clientId = (config.get<string>("PANDAPE_CLIENT_ID") ?? "").trim();
    this.clientSecret = (config.get<string>("PANDAPE_CLIENT_SECRET") ?? "").trim();
  }

  /** Credenciais OAuth presentes → integração ativa. Sem elas, o módulo é inerte (no-op em tudo). */
  estaAtivo(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  /** Loga a inércia UMA única vez (flag anti-spam) e devolve true se está inerte. */
  private inerte(): boolean {
    if (this.estaAtivo()) return false;
    if (!this.avisouInerte) {
      this.logger.warn("Pandapé inerte: PANDAPE_CLIENT_ID/PANDAPE_CLIENT_SECRET ausentes");
      this.avisouInerte = true;
    }
    return true;
  }

  // ── OAuth client_credentials ────────────────────────────────────────────────
  /**
   * Devolve um `access_token` válido, cacheado. Reusa enquanto não expira; renova automaticamente.
   * Compartilha UMA promise em voo (se já há emissão em andamento, aguarda-a) para evitar corrida.
   * Em erro, loga só o status HTTP (NUNCA o corpo, NUNCA o secret/token) e retorna undefined.
   */
  private async getAccessToken(): Promise<string | undefined> {
    if (this.accessToken && Date.now() < this.expiraEm) return this.accessToken;
    if (this.tokenEmVoo) return this.tokenEmVoo;
    this.tokenEmVoo = this.emitirToken().finally(() => {
      this.tokenEmVoo = undefined;
    });
    return this.tokenEmVoo;
  }

  /** POST /connect/token (application/x-www-form-urlencoded). Cacheia token + instante de expiração. */
  private async emitirToken(): Promise<string | undefined> {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      scope: "PandapeApi",
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PandapeApiService.TIMEOUT_MS);
    try {
      const res = await fetch(this.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Só status — o corpo pode conter detalhe do erro de credencial; NUNCA logamos corpo/secret.
        this.logger.error(`Pandapé OAuth respondeu HTTP ${res.status} ao emitir token`);
        return undefined;
      }
      const json = (await res.json()) as { access_token?: string; expires_in?: number };
      if (!json.access_token) {
        this.logger.error("Pandapé OAuth não retornou access_token");
        return undefined;
      }
      const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
      this.accessToken = json.access_token;
      this.expiraEm = Date.now() + expiresIn * 1000 - PandapeApiService.MARGEM_MS;
      return this.accessToken;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error("Emissão de token do Pandapé excedeu o tempo limite");
      } else {
        // Nunca logar o segredo/corpo — só uma mensagem genérica.
        this.logger.error("Falha ao emitir token OAuth do Pandapé");
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Endpoints (v1) ──────────────────────────────────────────────────────────
  /**
   * GET /v1/PreCollaborator/Get?idPreCollaborator={id}. Inerte → undefined. NUNCA loga o id/CPF/URL.
   * ATENÇÃO: este endpoint **NÃO traz CPF** — use `getMatch(idMatch)` para CPF/telefone/nascimento.
   */
  async getPrecollaborator(id: string): Promise<PandaperPrecollaborator | undefined> {
    if (this.inerte()) return undefined;
    return this.get<PandaperPrecollaborator>(
      `/v1/PreCollaborator/Get?idPreCollaborator=${encodeURIComponent(id)}`,
    );
  }

  /**
   * GET /v3/precollaborators/{id} → `forms[]` com os documentos AGRUPADOS POR FORMULÁRIO. **Fonte do
   * TIPO do documento** (o `name` do formulário). Inerte → []. Id/URL/nome de arquivo NUNCA logados.
   *
   * Endpoint separado do `getPrecollaborator` (v1) de propósito: a identidade segue na v1, que é o
   * que o resto do sync consome; a v3 entra só onde ela é melhor, que é o tipo do documento.
   */
  async getFormulariosDocumentos(id: string): Promise<PandapeFormulario[]> {
    if (this.inerte()) return [];
    const pc = await this.get<PandapePrecollaboratorV3>(
      `/v3/precollaborators/${encodeURIComponent(id)}`,
    );
    return Array.isArray(pc?.forms) ? pc.forms : [];
  }

  /**
   * GET /v1/Match/Get?idMatch={id}. **Fonte do CPF** (+ phone + birthDate + endereço). Inerte →
   * undefined. §A.6: o CPF retornado NUNCA é logado pelo chamador.
   */
  async getMatch(idMatch: string): Promise<PandapeMatch | undefined> {
    if (this.inerte()) return undefined;
    return this.get<PandapeMatch>(`/v1/Match/Get?idMatch=${encodeURIComponent(idMatch)}`);
  }

  /**
   * GET /v1/Vacancy/List → todas as vagas. Inerte → []. A API v1 não pagina por filtro aqui de forma
   * confiável; os query params `vacancyStatus`/`isInternalRecruitment` vão vazios (todas as vagas).
   */
  async listarVagas(): Promise<PandapeVacancy[]> {
    if (this.inerte()) return [];
    const lista = await this.get<PandapeVacancy[]>(
      `/v1/Vacancy/List?vacancyStatus=&isInternalRecruitment=`,
    );
    return Array.isArray(lista) ? lista : [];
  }

  /**
   * "Get por id" da vaga. LIMITAÇÃO: a API v1 **NÃO tem** `Vacancy/Get?idVacancy` — listamos via
   * `listarVagas()` e filtramos por `idVacancy` em memória. Inerte → undefined. A vaga NÃO traz
   * cliente/CNPJ; o de/para vaga→(cod_cliente, cargo) é follow-up (§A.9).
   */
  async getVacancy(idVacancy: string): Promise<PandapeVacancy | undefined> {
    if (this.inerte()) return undefined;
    const lista = await this.listarVagas();
    return lista.find((v) => String(v.idVacancy) === String(idVacancy));
  }

  /**
   * GET /v1/Client/List → clientes do Pandapé (para o de/para por CNPJ: `cif` ↔ `cliente.cnpj` do EA).
   * Inerte → [].
   */
  async listarClientes(): Promise<PandapeClient[]> {
    if (this.inerte()) return [];
    const lista = await this.get<PandapeClient[]>(`/v1/Client/List`);
    return Array.isArray(lista) ? lista : [];
  }

  /**
   * "Mudanças desde a última verificação". Inerte → []. A API v1 **NÃO tem endpoint de
   * listagem/discovery de pré-colaboradores** (só `Get` por id) → retornamos [] sempre.
   *
   * TODO (reportado ao diretor): o discovery de novos pré-colaboradores não existe na API v1 — depende
   * de webhook (push, INT-1) ou de um id já conhecido; é uma decisão de arquitetura pendente. NÃO
   * inventar endpoint.
   */
  async listarMudancas(_desde?: Date): Promise<string[]> {
    if (this.inerte()) return [];
    return [];
  }

  // ── GET genérico (Bearer OAuth + timeout) ───────────────────────────────────
  /**
   * GET genérico com `Authorization: Bearer <access_token>` + timeout. Token indisponível → no-op
   * (undefined). Erros só logam status + verbo (NUNCA corpo/PII/URL/token — §A.6).
   */
  private async get<T>(path: string): Promise<T | undefined> {
    const token = await this.getAccessToken();
    if (!token) {
      this.logger.error("Pandapé sem access_token válido — chamada GET abortada.");
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PandapeApiService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
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
