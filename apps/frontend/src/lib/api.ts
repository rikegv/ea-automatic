const BASE = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** Corpo bruto da resposta de erro (ex.: { needsConfirmation, reason } do 409). */
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
}

/**
 * Bloqueio de senha temporária (OST-EA-GESTAO-USUARIOS): o backend responde 403 com código
 * `SENHA_TEMPORARIA` em qualquer rota enquanto o usuário não trocar a senha. Redirecionamos para
 * a tela de troca: reforço ao guard do (app)/layout para chamadas disparadas fora do fluxo de
 * navegação. Evita loop quando já estamos em /trocar-senha ou /login.
 */
function isSenhaTemporaria(status: number, data: unknown): boolean {
  if (status !== 403 || typeof data !== "object" || data === null) return false;
  const d = data as { code?: unknown; message?: unknown; error?: unknown };
  return (
    d.code === "SENHA_TEMPORARIA" ||
    d.message === "SENHA_TEMPORARIA" ||
    d.error === "SENHA_TEMPORARIA"
  );
}

function redirecionarSenhaTemporaria(): void {
  if (typeof window === "undefined") return;
  const p = window.location.pathname;
  if (p === "/trocar-senha" || p === "/login") return;
  window.location.assign("/trocar-senha");
}

/** Cliente HTTP same-origin: o browser fala com /api (proxy do Next → backend). */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    credentials: "include",
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (isSenhaTemporaria(res.status, data)) redirecionarSenhaTemporaria();
    const raw = data?.message ?? data?.error ?? res.statusText;
    const message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

/**
 * Upload multipart same-origin (Fase 4, auditoria documental / kit). Não fixa Content-Type:
 * o browser injeta o boundary do FormData. Resposta sempre JSON (o binário de documento é efêmero
 * no backend; o front nunca o recebe de volta aqui). Para baixar arquivo, ver `apiDownload`.
 */
export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: formData,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (isSenhaTemporaria(res.status, data)) redirecionarSenhaTemporaria();
    const raw = data?.message ?? data?.error ?? res.statusText;
    const message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    throw new ApiError(message, res.status, data);
  }
  return data as T;
}

/**
 * Baixa um arquivo binário (ex.: kit gerado, F9) e dispara o "save as" no browser. O token de
 * download é de uso único/curto (gerado pelo backend); aqui só transformamos o blob em download.
 */
export async function apiDownload(
  path: string,
  fallbackName: string,
  token?: string | null,
): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = res.statusText;
    try {
      const j = text ? JSON.parse(text) : null;
      const raw = j?.message ?? j?.error;
      if (raw) message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    } catch {
      /* corpo não-JSON, mantém statusText */
    }
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Extrai o filename de um header Content-Disposition (aspas opcionais, RFC5987 filename*). */
function nomeDoContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  // filename*=UTF-8''nome.csv  (tem prioridade e vem URL-encoded)
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^["']|["']$/g, ""));
    } catch {
      /* cai para o filename simples abaixo */
    }
  }
  const plain = /filename=("?)([^";]+)\1/i.exec(header);
  return plain?.[2]?.trim() || fallback;
}

/**
 * POST com corpo JSON cuja resposta é um arquivo (ex.: relatório da clínica em CSV, Esteira/Exame).
 * Diferente do `apiDownload` (GET, sem corpo): aqui enviamos `admissaoIds` e baixamos o blob,
 * honrando o filename do header Content-Disposition (fallback quando ausente).
 */
export async function apiDownloadPost(
  path: string,
  body: unknown,
  fallbackName: string,
  token?: string | null,
): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = res.statusText;
    try {
      const j = text ? JSON.parse(text) : null;
      const raw = j?.message ?? j?.error;
      if (raw) message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    } catch {
      /* corpo não-JSON, mantém statusText */
    }
    throw new ApiError(message, res.status);
  }

  const name = nomeDoContentDisposition(res.headers.get("Content-Disposition"), fallbackName);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Abre um arquivo binário autenticado numa nova aba (ex.: pré-visualização inline do kit, F9).
 * Como o endpoint exige Authorization Bearer, não dá para apontar a aba direto na URL: busca-se o
 * blob com o token e abre-se um object URL. Mesmo padrão de auth do `apiDownload`.
 */
export async function apiOpenInline(path: string, token?: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = res.statusText;
    try {
      const j = text ? JSON.parse(text) : null;
      const raw = j?.message ?? j?.error;
      if (raw) message = Array.isArray(raw) ? raw.join(", ") : String(raw);
    } catch {
      /* corpo não-JSON, mantém statusText */
    }
    throw new ApiError(message, res.status);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Revoga depois de um intervalo: a nova aba precisa do URL vivo enquanto carrega o PDF.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
