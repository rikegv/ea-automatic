import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FuncionarioSelecao } from "../domain/portal-dados-gi";

/**
 * CLIENTE HTTP DO G.I (Portal→GI, peça 3), com a AUTH DE DUAS ETAPAS confirmada contra a produção do
 * GI (grade GET-only, 25/09/2026):
 *   etapa 1: POST `Conexao/VerificaConexao {IDClienteWeb, ChaveAcesso}` -> `value` (token1);
 *   etapa 2: POST `Login/Login` (header `Authorization: Bearer <token1>`, corpo `{login, senha}`)
 *            -> `value` (token2, ~2h).
 * O token2 vale ~2h e é cacheado SÓ EM MEMÓRIA, renovado antes de expirar. Todo request leva um
 * `User-Agent` de navegador (sem ele o Cloudflare devolve 403 1010) e `Accept: application/json`.
 *
 * NASCE FECHADO (fail-closed), no molde do `PandapeApiService`: sem a URL e os QUATRO campos da
 * credencial (`GI_ID_CLIENTE_WEB`, `GI_CHAVE_ACESSO`, `GI_LOGIN`, `GI_SENHA`), `configurado()` diz não
 * e nenhuma chamada toca a rede. Não há segredo hardcoded, não há token em arquivo fora do padrão do
 * backend: tudo vem do `ConfigService`/env.
 *
 * §A.6: credencial e token NUNCA são logados nem persistidos; os erros logam só status HTTP + verbo,
 * nunca o corpo (que pode conter detalhe da credencial) nem PII. A URL/host do GI não é logada.
 *
 * ⚠️ ESTA PEÇA NÃO DISPARA A CRIAÇÃO NESTA ENTREGA. `criarFuncionarioSelecao` está construído e
 * testado (com `fetch` mockado), mas o único chamador real (`EnviarParaGiService`) o mantém atrás da
 * flag `GI_DISPARO_ARMADO` DESLIGADA. Nenhum `POST FuncionarioSelecao/Add` é feito de verdade aqui.
 */

/**
 * Resultado fechado de uma tentativa de criação, sem PII e sem eco do corpo do GI.
 *
 * `ok: true` significa **CRIADO DE VERDADE**: HTTP 2xx **E** `sucess: true` no corpo `MsgReturn`. É
 * esse desfecho que o chamador usa para carimbar idempotência, então ele não pode ser otimista: um
 * `200 {sucess:false}` reportado como criado carimbaria um envio que não aconteceu (família da §A.33).
 *
 * Os motivos de recusa:
 *  - `INERTE`/`SEM_TOKEN`: nem saiu daqui;
 *  - `HTTP`: status fora do 2xx (no 400 o corpo é `MsgReturn400` e os CAMPOS reprovados vão ao log);
 *  - `RECUSADO`: 2xx com `sucess: false`, ou seja, o GI recebeu e NÃO criou;
 *  - `RESPOSTA_INESPERADA`: 2xx cujo corpo não traz `sucess` booleano, logo não confirma a criação
 *    (fail-closed: sem confirmação não se carimba criação);
 *  - `REDE`/`TIMEOUT`: não há desfecho conhecido.
 */
export type GiCriacaoResultado =
  | { ok: true; funcionarioSelecaoId: string | null }
  | {
      ok: false;
      motivo:
        | "INERTE"
        | "SEM_TOKEN"
        | "HTTP"
        | "RECUSADO"
        | "RESPOSTA_INESPERADA"
        | "REDE"
        | "TIMEOUT";
      status?: number;
    };

/**
 * O corpo do `POST FuncionarioSelecao/Add` no sucesso, schema `MsgReturn` do contrato do GI. Os nomes
 * estão grafados como o GI os escreve: **`sucess` com UM "c"** e **`mensage` sem o "s"**. Não são
 * erros de digitação daqui, são as chaves do fornecedor, medidas contra a produção em 01/10/2026:
 * `{"sucess": true, "idRetorno": "18", "mensage": "Cadastro Efetuado Com Sucesso!", "campoErro": null}`.
 */
interface GiMsgReturn {
  sucess?: unknown;
  idRetorno?: unknown;
  mensage?: unknown;
  campoErro?: unknown;
  obs?: unknown;
}

/** O corpo do 400, schema `MsgReturn400`: `errors` é mapa de CAMPO para lista de mensagens. */
interface GiMsgReturn400 {
  errors?: unknown;
}

@Injectable()
export class GiApiService {
  private readonly logger = new Logger("GiApiService");
  private readonly baseUrl: string;
  private readonly idClienteWeb: string;
  private readonly chaveAcesso: string;
  private readonly login: string;
  private readonly senha: string;
  /** Caminho do endpoint de criação. Configurável para corrigir o verbo exato sem tocar código. */
  private readonly pathCriacao: string;
  private avisouInerte = false;

  /** Cache do token2 (só memória). `expiraEm` = epoch ms já com a margem descontada. */
  private token?: string;
  private expiraEm = 0;
  /** Uma única emissão em voo, compartilhada, para várias chamadas não abrirem N logins. */
  private tokenEmVoo?: Promise<string | undefined>;

  private static readonly TIMEOUT_MS = 30_000;
  /** O token2 dura ~2h; renovamos 5 min antes por segurança. */
  private static readonly VALIDADE_MS = 2 * 60 * 60 * 1000;
  private static readonly MARGEM_MS = 5 * 60 * 1000;
  /** UA de navegador: o Cloudflare do GI barra cliente sem UA com 403 1010. */
  private static readonly USER_AGENT =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>("GI_API_URL") ?? "https://apigeral.gi.app.br/api/v1").replace(
      /\/+$/,
      "",
    );
    this.idClienteWeb = (config.get<string>("GI_ID_CLIENTE_WEB") ?? "").trim();
    this.chaveAcesso = (config.get<string>("GI_CHAVE_ACESSO") ?? "").trim();
    this.login = (config.get<string>("GI_LOGIN") ?? "").trim();
    this.senha = (config.get<string>("GI_SENHA") ?? "").trim();
    this.pathCriacao = (config.get<string>("GI_FUNCIONARIO_SELECAO_PATH") ?? "/FuncionarioSelecao/Add")
      .trim()
      .replace(/^([^/])/, "/$1");
  }

  /** Configurado = URL + os quatro campos da credencial de 2 etapas. Sem o conjunto, é inerte. */
  configurado(): boolean {
    return (
      this.baseUrl.length > 0 &&
      this.idClienteWeb.length > 0 &&
      this.chaveAcesso.length > 0 &&
      this.login.length > 0 &&
      this.senha.length > 0
    );
  }

  private inerte(): boolean {
    if (this.configurado()) return false;
    if (!this.avisouInerte) {
      this.logger.warn(
        "GI inerte: GI_ID_CLIENTE_WEB/GI_CHAVE_ACESSO/GI_LOGIN/GI_SENHA ausentes (rota fechada)",
      );
      this.avisouInerte = true;
    }
    return true;
  }

  private cabecalhoBase(): Record<string, string> {
    return {
      "User-Agent": GiApiService.USER_AGENT,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  // ── AUTH de 2 etapas ────────────────────────────────────────────────────────
  /** Token2 válido, cacheado. Renova antes de expirar; compartilha uma emissão em voo. */
  async obterToken(): Promise<string | undefined> {
    if (this.inerte()) return undefined;
    if (this.token && Date.now() < this.expiraEm) return this.token;
    if (this.tokenEmVoo) return this.tokenEmVoo;
    this.tokenEmVoo = this.autenticar().finally(() => {
      this.tokenEmVoo = undefined;
    });
    return this.tokenEmVoo;
  }

  /** Executa as duas etapas e cacheia o token2. Erro em qualquer etapa: undefined, só status logado. */
  private async autenticar(): Promise<string | undefined> {
    const token1 = await this.verificaConexao();
    if (!token1) return undefined;
    const token2 = await this.efetuarLogin(token1);
    if (!token2) return undefined;
    this.token = token2;
    this.expiraEm = Date.now() + GiApiService.VALIDADE_MS - GiApiService.MARGEM_MS;
    return token2;
  }

  /** Etapa 1: POST Conexao/VerificaConexao {IDClienteWeb, ChaveAcesso} -> `value`. */
  private async verificaConexao(): Promise<string | undefined> {
    const r = await this.postJson<{ value?: string }>(
      "/Conexao/VerificaConexao",
      { IDClienteWeb: this.idClienteWeb, ChaveAcesso: this.chaveAcesso },
      this.cabecalhoBase(),
      "VerificaConexao",
    );
    return typeof r?.value === "string" && r.value.length > 0 ? r.value : undefined;
  }

  /** Etapa 2: POST Login/Login (Bearer token1) {login, senha} -> `value`. */
  private async efetuarLogin(token1: string): Promise<string | undefined> {
    const r = await this.postJson<{ value?: string }>(
      "/Login/Login",
      { login: this.login, senha: this.senha },
      { ...this.cabecalhoBase(), Authorization: `Bearer ${token1}` },
      "Login",
    );
    return typeof r?.value === "string" && r.value.length > 0 ? r.value : undefined;
  }

  // ── Criação da pré-admissão (CONSTRUÍDA, NÃO DISPARADA NESTA ENTREGA) ─────────
  /**
   * POST FuncionarioSelecao/Add com o payload SÓ-de-pessoa, autenticado pelo token2.
   *
   * ⚠️ É CHAMADO, e por UM PONTO SÓ: `EnviarParaGiService.enviarComGuardas`, que é privado e serve os
   * DOIS gatilhos (o automático do fechamento da auditoria e o botão manual). Atrás da flag
   * `GI_DISPARO_ARMADO`: com ela desligada, a cadeia monta o payload e para antes daqui.
   * (Até 05/10/2026 este método não era chamado por caminho nenhum, e o automático era um no-op
   * estrutural. O diretor decidiu o contrário, e o automático passou a ser o caminho principal.)
   *
   * O DESFECHO SE LÊ NO CORPO, não só no status (contrato `MsgReturn`, medido contra a produção em
   * 01/10/2026): 2xx com `sucess: false` é RECUSADO, e o id do registro vem em `idRetorno`.
   *
   * §A.6: o payload é PII e trafega só em memória; o retorno some daqui devolvendo apenas o id (se o
   * GI o der) e o desfecho. O log leva status, verbo e, no 400, só os NOMES dos campos reprovados,
   * nunca o corpo, nunca a mensagem do GI (que ecoa valor), nunca credencial, token ou URL.
   */
  async criarFuncionarioSelecao(payload: FuncionarioSelecao): Promise<GiCriacaoResultado> {
    if (this.inerte()) return { ok: false, motivo: "INERTE" };
    const token = await this.obterToken();
    if (!token) return { ok: false, motivo: "SEM_TOKEN" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GiApiService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${this.pathCriacao}`, {
        method: "POST",
        headers: { ...this.cabecalhoBase(), Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        // No 400 o corpo é `MsgReturn400` e as CHAVES de `errors` são os campos reprovados pela
        // validação do GI. §A.6: só as CHAVES entram no log; o valor do campo é PII e nunca sai.
        const campos =
          res.status === 400
            ? camposReprovados((await res.json().catch(() => ({}))) as GiMsgReturn400)
            : [];
        if (campos.length > 0) {
          this.logger.error(
            `GI reprovou a validacao (HTTP 400) ao criar FuncionarioSelecao. Campos reprovados: ${campos.join(", ")}`,
          );
        } else {
          this.logger.error(
            res.status === 400
              ? "GI reprovou a validacao (HTTP 400) ao criar FuncionarioSelecao, sem campo identificado no corpo"
              : `GI respondeu HTTP ${res.status} ao criar FuncionarioSelecao`,
          );
        }
        return { ok: false, motivo: "HTTP", status: res.status };
      }

      // 2xx NÃO basta: o `Add` do GI responde `MsgReturn`, e um `sucess: false` é um envio RECEBIDO e
      // NÃO CRIADO. Tratar isso como sucesso faria o chamador carimbar idempotência de algo que não
      // existe no GI (família da §A.33: o irreversível silencioso).
      const json = (await res.json().catch(() => ({}))) as GiMsgReturn;
      if (json.sucess !== true) {
        if (typeof json.sucess === "boolean") {
          // §A.6: `mensage`/`campoErro` podem ecoar valor de campo, então só o campo (quando ele
          // tem cara de nome de propriedade) entra no log; a mensagem do GI, nunca.
          const campo = nomeDeCampo(json.campoErro);
          this.logger.error(
            campo
              ? `GI recebeu e NAO criou o FuncionarioSelecao (sucess=false). Campo apontado: ${campo}`
              : "GI recebeu e NAO criou o FuncionarioSelecao (sucess=false)",
          );
          return { ok: false, motivo: "RECUSADO", status: res.status };
        }
        this.logger.error(
          `GI respondeu HTTP ${res.status} sem o campo 'sucess' do contrato MsgReturn: criacao NAO confirmada`,
        );
        return { ok: false, motivo: "RESPOSTA_INESPERADA", status: res.status };
      }

      const id = extrairId(json);
      if (id == null) {
        // Criou e não devolveu a chave: `gi_funcionario_selecao_id` nasce nulo e não há como
        // localizar o registro no GI (nem para conferir, nem para pedir a remoção). É ERRO porque é
        // um estado que o diretor precisa ver, não um detalhe.
        this.logger.error(
          "GI criou o FuncionarioSelecao mas NAO devolveu 'idRetorno': sem chave de localizacao do registro",
        );
      }
      return { ok: true, funcionarioSelecaoId: id };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error("Criação no GI excedeu o tempo limite");
        return { ok: false, motivo: "TIMEOUT" };
      }
      this.logger.error("Falha de rede ao criar FuncionarioSelecao no GI");
      return { ok: false, motivo: "REDE" };
    } finally {
      clearTimeout(timer);
    }
  }

  // ── POST genérico (JSON + timeout + fail-closed no log) ──────────────────────
  private async postJson<T>(
    path: string,
    body: unknown,
    headers: Record<string, string>,
    rotulo: string,
  ): Promise<T | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GiApiService.TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.error(`GI respondeu HTTP ${res.status} na etapa ${rotulo}`);
        return undefined;
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        this.logger.error(`Etapa ${rotulo} do GI excedeu o tempo limite`);
      } else {
        this.logger.error(`Falha de rede na etapa ${rotulo} do GI`);
      }
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * O id do registro criado vem em **`idRetorno`** (`MsgReturn`), e não em `value`/`id`: essas duas
 * chaves NÃO EXISTEM no contrato do `Add` (eram leitura errada, copiada das etapas de login, e por
 * isso `gi_funcionario_selecao_id` nascia sempre nulo). Normaliza para string; ausente vira null.
 */
function extrairId(json: GiMsgReturn): string | null {
  const bruto = json.idRetorno;
  if (typeof bruto === "string" && bruto.trim().length > 0) return bruto.trim();
  if (typeof bruto === "number" && Number.isFinite(bruto)) return String(bruto);
  return null;
}

/**
 * As CHAVES de `errors` do `MsgReturn400`, ou seja, os campos que a validação do GI reprovou. §A.6:
 * devolve só os NOMES, nunca as mensagens (que ecoam o valor enviado, logo PII). Nome é filtrado por
 * formato de identificador, para nenhum conteúdo de dado escapar por uma chave inesperada.
 */
function camposReprovados(json: GiMsgReturn400): string[] {
  const errors = json?.errors;
  if (errors == null || typeof errors !== "object" || Array.isArray(errors)) return [];
  const nomes: string[] = [];
  for (const chave of Object.keys(errors as Record<string, unknown>)) {
    const nome = nomeDeCampo(chave);
    if (nome) nomes.push(nome);
  }
  return nomes.slice(0, 60);
}

/**
 * Aceita um texto só quando ele tem FORMATO DE NOME DE CAMPO (identificador curto, sem espaço nem
 * acento). §A.6: é o filtro que impede um valor de pessoa de entrar no log por uma chave que o GI
 * tenha preenchido com conteúdo em vez de nome de propriedade.
 */
function nomeDeCampo(bruto: unknown): string | null {
  const t = typeof bruto === "string" ? bruto.trim() : "";
  return /^[A-Za-z_$][A-Za-z0-9_$.[\]]{0,39}$/.test(t) ? t : null;
}
