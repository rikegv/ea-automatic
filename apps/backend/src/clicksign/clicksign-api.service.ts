import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Cliente JSON:API v3 da Clicksign (INT-4 / F9, §A.5). Usa o `fetch` global do Node 20 (sem axios).
 *
 * AUTENTICAÇÃO (confirmada): header `Authorization: <token>` — TOKEN CRU, sem "Bearer". Content-Type
 * e Accept `application/vnd.api+json`. Base em `CLICKSIGN_API_BASE_URL`. Token em `CLICKSIGN_API_TOKEN`.
 *
 * INERTE sem token (paridade com PandapeApiService): se `CLICKSIGN_API_TOKEN` estiver ausente/vazio,
 * `estaAtivo()` é false e toda chamada externa vira no-op (loga UMA vez, devolve undefined/[]) — o
 * módulo existe mas nunca toca a rede; `fetch` jamais é chamado.
 *
 * SEGURANÇA (§A.6): NUNCA loga o token, o CPF do signatário nem a URL de download do documento
 * assinado (S3 presigned, expira em ~5min). Erros logam só status + verbo da rota.
 *
 * ── SHAPES JSON:API CONFIRMADOS NO SANDBOX (chamadas reais, 2026-06-30) ──────────────────────────
 * Todo corpo é `{ data: { type, [id], attributes, [relationships] } }`. Todo retorno traz `data.id`.
 *
 *  1) criarEnvelope  → POST /envelopes
 *       body:  data.type="envelopes", attributes:{ name, locale:"pt-BR", auto_close:true,
 *              deadline_at:<ISO8601 com timezone>, remind_interval }
 *       resp 201: data.id, data.attributes.status="draft"
 *
 *  2) anexarDocumento → POST /envelopes/{id}/documents
 *       body:  data.type="documents", attributes:{ filename,
 *              content_base64:"data:application/pdf;base64,<b64>" }   (base64 INLINE — sem upload 2 etapas)
 *       resp 201: data.id
 *
 *  3) adicionarSigner → POST /envelopes/{id}/signers
 *       body:  data.type="signers", attributes:{ name, email, has_documentation:true,
 *              documentation:"000.000.000-00" }   (CPF FORMATADO obrigatório — pontuação, NÃO
 *              redação: os dígitos reais vão à Clicksign por exigência legal da assinatura; dígito
 *              verificador é validado; raw 11 dígitos → 400 "formato inválido". CPF nunca é logado.)
 *       resp 201: data.id
 *
 *  4) criarRequirement → POST /envelopes/{id}/requirements  (DOIS por signatário/documento):
 *       a) attributes:{ action:"agree", role:"sign" }            — qualifica o signatário para assinar
 *       b) attributes:{ action:"provide_evidence", auth:"email" } — método de autenticação
 *       ambos com relationships:{ document:{data:{type:"documents",id}}, signer:{data:{type:"signers",id}} }
 *       resp 201: data.id
 *
 *  5) ativarEnvelope → PATCH /envelopes/{id}
 *       body:  data.id (OBRIGATÓRIO no corpo), data.type="envelopes", attributes:{ status:"running" }
 *       resp 200: data.attributes.status="running"
 *       (PATCH só aceita status writable "draft"|"running" — ver cancelarEnvelope.)
 *
 *  6) consultarStatus → GET /envelopes/{id}
 *       resp 200: data.attributes.status ∈ {draft, running, closed, canceled}
 *
 *  7) obterUrlAssinado → GET /envelopes/{id}/documents
 *       resp 200: data[].links.files.original = URL S3 PRESIGNED (X-Amz-Expires=300 → ~5min).
 *       Após o envelope fechar (closed), `files.original` aponta o PDF finalizado/assinado. Baixar
 *       SÍNCRONO no mesmo ciclo; a URL NUNCA é persistida nem logada (§A.6).
 *
 *  8) cancelarEnvelope:
 *       - draft   → DELETE /envelopes/{id}                       (204; running → 403)
 *       - running → NÃO há cancelamento programático nesta conta/sandbox: PATCH status="canceled" é
 *         rejeitado (400 "status deve estar em: draft, running") e não existe /cancellation|/cancel
 *         (404). Tentamos o PATCH canônico (contas que o habilitem) e seguimos BEST-EFFORT em falha —
 *         o estado autoritativo do reenvio é o EA (clicksignStatus=CANCELADO) + a trilha de dupla
 *         correção (§A.5: "controle por responsabilização, não verificação técnica"). A baixa final
 *         do envelope errado se dá no histórico da Clicksign.
 */
@Injectable()
export class ClicksignApiService {
  private readonly logger = new Logger("ClicksignApiService");
  private readonly baseUrl: string;
  private readonly token: string;
  private avisouInerte = false;
  private static readonly TIMEOUT_MS = 60_000;
  private static readonly CT = "application/vnd.api+json";

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>("CLICKSIGN_API_BASE_URL") ?? "https://sandbox.clicksign.com/api/v3"
    ).replace(/\/+$/, "");
    this.token = (config.get<string>("CLICKSIGN_API_TOKEN") ?? "").trim();
  }

  /** Token presente → integração ativa. Sem token, o módulo é inerte (no-op em tudo). */
  estaAtivo(): boolean {
    return this.token.length > 0;
  }

  /** Loga a inércia UMA única vez (flag anti-spam) e devolve true se está inerte. */
  private inerte(): boolean {
    if (this.estaAtivo()) return false;
    if (!this.avisouInerte) {
      this.logger.warn("Clicksign inerte: CLICKSIGN_API_TOKEN ausente");
      this.avisouInerte = true;
    }
    return true;
  }

  /** (1) Cria um envelope em rascunho. Inerte → undefined. */
  async criarEnvelope(nome: string): Promise<{ id: string } | undefined> {
    if (this.inerte()) return undefined;
    // deadline_at 30 dias à frente (prazo de assinatura). remind_interval lembra o signatário.
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const data = await this.req<{ data?: { id?: string } }>("POST", "/envelopes", {
      data: {
        type: "envelopes",
        attributes: {
          name: nome,
          locale: "pt-BR",
          auto_close: true,
          deadline_at: deadline,
          remind_interval: 3,
        },
      },
    });
    const id = data?.data?.id;
    return id ? { id } : undefined;
  }

  /** (2) Anexa um documento (base64 inline). Inerte → undefined. O conteúdo nunca é logado. */
  async anexarDocumento(
    envId: string,
    arquivo: { filename: string; conteudo: Buffer },
  ): Promise<{ id: string } | undefined> {
    if (this.inerte()) return undefined;
    const b64 = arquivo.conteudo.toString("base64");
    const data = await this.req<{ data?: { id?: string } }>(
      "POST",
      `/envelopes/${enc(envId)}/documents`,
      {
        data: {
          type: "documents",
          attributes: {
            filename: arquivo.filename,
            content_base64: `data:application/pdf;base64,${b64}`,
          },
        },
      },
    );
    const id = data?.data?.id;
    return id ? { id } : undefined;
  }

  /**
   * (3) Adiciona um signatário. O CPF (`cpf`, 11 dígitos crus) é FORMATADO para "000.000.000-00"
   * (pontuação, não redação — exigência da API) e vai SÓ no corpo da requisição; NUNCA é logado
   * (§A.6). Inerte → undefined.
   */
  async adicionarSigner(
    envId: string,
    signer: { nome: string; email: string; cpf?: string },
  ): Promise<{ id: string } | undefined> {
    if (this.inerte()) return undefined;
    const attributes: Record<string, unknown> = { name: signer.nome, email: signer.email };
    const doc = mascararCpf(signer.cpf);
    if (doc) {
      attributes.has_documentation = true;
      attributes.documentation = doc;
    }
    const data = await this.req<{ data?: { id?: string } }>(
      "POST",
      `/envelopes/${enc(envId)}/signers`,
      { data: { type: "signers", attributes } },
    );
    const id = data?.data?.id;
    return id ? { id } : undefined;
  }

  /**
   * (4) Cria os DOIS requirements que habilitam a assinatura: qualificação (agree/sign) +
   * autenticação por e-mail (provide_evidence/email). Inerte → undefined.
   */
  async criarRequirement(
    envId: string,
    ref: { documentId: string; signerId: string },
  ): Promise<void> {
    if (this.inerte()) return;
    const rel = {
      document: { data: { type: "documents", id: ref.documentId } },
      signer: { data: { type: "signers", id: ref.signerId } },
    };
    await this.req("POST", `/envelopes/${enc(envId)}/requirements`, {
      data: { type: "requirements", attributes: { action: "agree", role: "sign" }, relationships: rel },
    });
    await this.req("POST", `/envelopes/${enc(envId)}/requirements`, {
      data: {
        type: "requirements",
        attributes: { action: "provide_evidence", auth: "email" },
        relationships: rel,
      },
    });
  }

  /** (5) Ativa o envelope (draft → running). Inerte → no-op. */
  async ativarEnvelope(envId: string): Promise<void> {
    if (this.inerte()) return;
    await this.req("PATCH", `/envelopes/${enc(envId)}`, {
      data: { id: envId, type: "envelopes", attributes: { status: "running" } },
    });
  }

  /**
   * (8) Cancela o envelope. draft → DELETE. running → best-effort PATCH status="canceled" (ver doc
   * da classe): tolerante a falha, pois o estado autoritativo do reenvio é o EA. Inerte → no-op.
   */
  async cancelarEnvelope(envId: string): Promise<void> {
    if (this.inerte()) return;
    try {
      await this.req("PATCH", `/envelopes/${enc(envId)}`, {
        data: { id: envId, type: "envelopes", attributes: { status: "canceled" } },
      });
    } catch {
      // Esperado em envelope running nesta conta (PATCH só aceita draft/running). O cancelamento
      // técnico no provedor é best-effort; a baixa autoritativa é o clicksignStatus=CANCELADO no EA.
      this.logger.warn(
        "Cancelamento programático do envelope não aceito pela Clicksign (segue best-effort).",
      );
    }
  }

  /** (6) Consulta o status do envelope. Inerte → undefined. */
  async consultarStatus(envId: string): Promise<{ status: string } | undefined> {
    if (this.inerte()) return undefined;
    const data = await this.req<{ data?: { attributes?: { status?: string } } }>(
      "GET",
      `/envelopes/${enc(envId)}`,
    );
    const status = data?.data?.attributes?.status;
    return status ? { status } : undefined;
  }

  /**
   * (7) Obtém a URL do documento assinado (S3 presigned, ~5min). Inerte → undefined. A URL é
   * RETORNADA para download imediato pelo chamador — NUNCA é logada nem persistida (§A.6).
   */
  async obterUrlAssinado(envId: string): Promise<string | undefined> {
    if (this.inerte()) return undefined;
    const data = await this.req<{
      data?: Array<{ links?: { files?: { signed?: string; original?: string } } }>;
    }>("GET", `/envelopes/${enc(envId)}/documents`);
    const docs = data?.data;
    if (!Array.isArray(docs) || docs.length === 0) return undefined;
    const files = docs[0]?.links?.files;
    // Prefere `signed` se a conta expuser; senão `original` (que, após o close, é o PDF finalizado).
    return files?.signed ?? files?.original ?? undefined;
  }

  /**
   * Requisição JSON:API genérica com timeout e Authorization cru. Em erro HTTP, loga SÓ status +
   * método + rota (a rota pode conter um id de envelope; nunca corpo/PII/URL — §A.6) e LANÇA, para
   * o backoff do BullMQ retentar. GET 404 também lança (deixa o backoff decidir).
   */
  private async req<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ClicksignApiService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.token, // token CRU, sem "Bearer"
          "Content-Type": ClicksignApiService.CT,
          Accept: ClicksignApiService.CT,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`Clicksign respondeu HTTP ${res.status} em ${method} (rota de envelope)`);
        throw new Error(`Clicksign HTTP ${res.status}`);
      }
      if (res.status === 204) return undefined;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error("Chamada à Clicksign excedeu o tempo limite");
        throw new Error("Clicksign timeout");
      }
      throw err instanceof Error ? err : new Error("Falha ao chamar a Clicksign");
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Encode seguro de segmento de path. */
function enc(s: string): string {
  return encodeURIComponent(s);
}

/** Mascarar CPF cru (11 dígitos) → "000.000.000-00". Entrada inválida → undefined (omite o campo). */
function mascararCpf(cpf: string | undefined): string | undefined {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return undefined;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
