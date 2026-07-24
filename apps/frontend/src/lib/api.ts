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

// ── Sessão: token corrente + renovação automática ───────────────────────────
/**
 * O QUE ISTO CONSERTA. O access token vive **15 minutos** e o relógio começa no CARREGAMENTO DA
 * PÁGINA, não na última atividade. Não havia renovação nenhuma depois do mount do `AuthProvider`, e
 * o cliente HTTP não tratava 401: o erro cru do guard ia para a tela. Quem passasse 15 minutos
 * preenchendo um formulário (o caso real: modal do lote com 9 admissões) perdia a operação, e a
 * única saída era recarregar a página, que destrói o preenchimento. O refresh token vive **7 dias**
 * em cookie httpOnly, ou seja, o material para renovar sempre esteve lá e ninguém usava.
 *
 * §A.6: o token circula só em memória e nos headers. NUNCA é logado nem persistido aqui.
 */
let tokenDaSessao: string | null = null;
let aoRenovarToken: ((token: string, user?: unknown) => void) | null = null;
let aoExpirarSessao: (() => void) | null = null;

/** O `AuthProvider` espelha aqui o token corrente, para o cliente HTTP renovar sozinho. */
export function definirTokenDaSessao(token: string | null): void {
  tokenDaSessao = token;
}

/** Ganchos do `AuthProvider`: token renovado (atualiza o estado) e sessão encerrada (vai ao login). */
export function registrarGanchosDeSessao(ganchos: {
  aoRenovar?: (token: string, user?: unknown) => void;
  aoExpirar?: () => void;
}): void {
  aoRenovarToken = ganchos.aoRenovar ?? null;
  aoExpirarSessao = ganchos.aoExpirar ?? null;
}

/** Renovação EM VOO COMPARTILHADA: N requisições que tomem 401 juntas disparam UM único refresh. */
let refreshEmVoo: Promise<string | null> | null = null;

/**
 * Troca o refresh token (cookie httpOnly) por um access token novo. Devolve `null` quando a sessão
 * acabou de verdade (refresh expirado ou ausente), e aí quem chama para de tentar: é a guarda
 * anti-loop. Rota `@Public`, então não leva Authorization.
 */
export async function renovarSessao(): Promise<string | null> {
  if (refreshEmVoo) return refreshEmVoo;
  refreshEmVoo = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "include" });
      if (!res.ok) return null;
      const texto = await res.text();
      const dados = texto ? JSON.parse(texto) : null;
      const novo: string | null = dados?.accessToken ?? null;
      if (!novo) return null;
      tokenDaSessao = novo;
      aoRenovarToken?.(novo, dados?.user);
      return novo;
    } catch {
      return null; // rede fora: trata como não renovado, sem derrubar a sessão em loop.
    } finally {
      refreshEmVoo = null;
    }
  })();
  return refreshEmVoo;
}

/** Sessão encerrada de verdade: o `AuthProvider` limpa o estado e leva ao login. */
function sessaoExpirou(): void {
  tokenDaSessao = null;
  aoExpirarSessao?.();
}

/** Mensagem ACIONÁVEL no lugar do texto cru do guard ("Token de acesso inválido ou expirado"). */
const MSG_SESSAO_EXPIRADA =
  "Sua sessão expirou. Entre novamente para continuar; o que você preencheu segue nesta tela.";

/** As rotas de sessão não entram no ciclo de renovação (401 nelas é o fim da linha, não um retry). */
function ehRotaDeSessao(path: string): boolean {
  return path.startsWith("/auth/");
}

/**
 * Executa a requisição autenticada e, em 401, RENOVA e REENVIA UMA única vez com o mesmo corpo.
 *
 * POR QUE REENVIAR É SEGURO, inclusive em POST/PATCH/PUT/DELETE: o 401 nasce no `JwtAuthGuard`,
 * ANTES do handler. O handler não executou, nada foi gravado, não há efeito colateral a repetir. Não
 * é o caso perigoso de "reenviar algo que talvez já tenha sido aplicado".
 *
 * `montarInit` recebe o token vigente e devolve o init COMPLETO, então o corpo (JSON ou FormData) é
 * remontado igual no reenvio, íntegro.
 */
async function fetchComRenovacao(
  path: string,
  montarInit: (token: string | null) => RequestInit,
  tokenExplicito?: string | null,
): Promise<Response> {
  const primeiro = tokenExplicito ?? tokenDaSessao;
  const res = await fetch(`${BASE}${path}`, montarInit(primeiro));
  if (res.status !== 401 || ehRotaDeSessao(path)) return res;

  const novo = await renovarSessao();
  if (!novo) {
    sessaoExpirou();
    return res;
  }
  const segundo = await fetch(`${BASE}${path}`, montarInit(novo));
  // Anti-loop: UMA tentativa. 401 de novo com token recém-emitido = sessão encerrada, sem terceira.
  if (segundo.status === 401) sessaoExpirou();
  return segundo;
}

/** Lê o corpo e converte o não-ok em `ApiError`, com a mensagem de sessão trocada pela acionável. */
async function respostaOuErro<T>(res: Response): Promise<T> {
  const texto = await res.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    if (isSenhaTemporaria(res.status, dados)) redirecionarSenhaTemporaria();
    if (res.status === 401) throw new ApiError(MSG_SESSAO_EXPIRADA, 401, dados);
    const bruto = dados?.message ?? dados?.error ?? res.statusText;
    const mensagem = Array.isArray(bruto) ? bruto.join(", ") : String(bruto);
    throw new ApiError(mensagem, res.status, dados);
  }
  return dados as T;
}

/** Igual ao `respostaOuErro`, para respostas BINÁRIAS (o corpo de erro ainda é JSON). */
async function erroDeRespostaBinaria(res: Response): Promise<ApiError> {
  if (res.status === 401) return new ApiError(MSG_SESSAO_EXPIRADA, 401);
  const texto = await res.text().catch(() => "");
  let mensagem = res.statusText;
  try {
    const j = texto ? JSON.parse(texto) : null;
    const bruto = j?.message ?? j?.error;
    if (bruto) mensagem = Array.isArray(bruto) ? bruto.join(", ") : String(bruto);
  } catch {
    /* corpo não-JSON, mantém statusText */
  }
  return new ApiError(mensagem, res.status);
}

/** Cliente HTTP same-origin: o browser fala com /api (proxy do Next → backend). */
export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  // O corpo é serializado UMA vez e reusado no reenvio pós-renovação: o que o usuário preencheu vai
  // íntegro na segunda tentativa (o caso real é o modal do lote com 9 admissões).
  const corpo = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  const res = await fetchComRenovacao(
    path,
    (token) => {
      const headers: Record<string, string> = {};
      if (corpo !== undefined) headers["Content-Type"] = "application/json";
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return { method: opts.method ?? "GET", headers, credentials: "include", body: corpo };
    },
    opts.token,
  );
  return respostaOuErro<T>(res);
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
  // O MESMO FormData é reenviado na segunda tentativa (o objeto é reutilizável pelo fetch).
  const res = await fetchComRenovacao(
    path,
    (t) => {
      const headers: Record<string, string> = {};
      if (t) headers["Authorization"] = `Bearer ${t}`;
      return { method: "POST", headers, credentials: "include", body: formData };
    },
    token,
  );
  return respostaOuErro<T>(res);
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
  const res = await fetchComRenovacao(
    path,
    (t) => {
      const headers: Record<string, string> = {};
      if (t) headers["Authorization"] = `Bearer ${t}`;
      return { headers, credentials: "include" };
    },
    token,
  );
  if (!res.ok) throw await erroDeRespostaBinaria(res);

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
  const corpo = JSON.stringify(body);
  const res = await fetchComRenovacao(
    path,
    (t) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (t) headers["Authorization"] = `Bearer ${t}`;
      return { method: "POST", headers, credentials: "include", body: corpo };
    },
    token,
  );
  if (!res.ok) throw await erroDeRespostaBinaria(res);

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
  const res = await fetchComRenovacao(
    path,
    (t) => {
      const headers: Record<string, string> = {};
      if (t) headers["Authorization"] = `Bearer ${t}`;
      return { headers, credentials: "include" };
    },
    token,
  );
  if (!res.ok) throw await erroDeRespostaBinaria(res);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Revoga depois de um intervalo: a nova aba precisa do URL vivo enquanto carrega o PDF.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
