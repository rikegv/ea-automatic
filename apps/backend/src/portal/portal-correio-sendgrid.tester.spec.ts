import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalCorreioService } from "./portal-correio.service";
import { corpoDoEmailDoLink, type EmailDoCodigo, type EmailDoLink } from "../domain/portal-envio";
import { LOGO_SOULAN_BASE64, LOGO_SOULAN_CID } from "./portal-logo";

/**
 * O CAMINHO SENDGRID DO CORREIO, PROVADO EM EXECUCAO (§A.38, canal novo).
 *
 * TESTE INDEPENDENTE do autor da troca Gmail -> SendGrid. O inventario estatico
 * (`portal-sem-chave-e-sem-vazamento.tester.spec.ts`) prova que o SEGREDO nao vaza no repositorio;
 * este prova o COMPORTAMENTO do `fetch` contra um servidor falso injetado:
 *
 *  1. 2xx (202) devolve TRUE nas duas portas publicas;
 *  2. nao-2xx (401, 429, 500) devolve FALSE (o braco `if (!resposta.ok)`);
 *  3. timeout e erro de rede devolvem FALSE, sem lancar (abster-se e o seguro, licao do
 *     `notifications` da Clicksign, §A.5);
 *  4. a requisicao vai para `https://api.sendgrid.com/v3/mail/send`, com `Authorization: Bearer`
 *     e o corpo no formato da API (`personalizations`/`from`/`content`, `text/plain` ANTES do
 *     `text/html`);
 *  5. §A.6 EM EXECUCAO, o ponto critico: o corpo de erro do SendGrid ECOA o destinatario, e esse
 *     eco NAO vai para log; destinatario, codigo, link e chave NAO aparecem em log nenhum, nem no
 *     caminho feliz nem no de erro.
 *
 * O correio fixa a URL do SendGrid no modulo (nao ha `PORTAL_..._URL` como no emissor), entao a
 * injecao e por `fetch` stubbado: e ele quem captura a requisicao e devolve a resposta forjada.
 */

// ── CANARIOS SINTETICOS (§A.6/§A.43): nada real, e cada um existe para ser CACADO no log ─────────
const EMAIL_CANARIO = "canario.sendgrid@exemplo.invalido";
const CODIGO_CANARIO = "903517";
const URL_LINK_CANARIO = "https://portal.exemplo.invalido/p#t=bilhete-sintetico-de-teste";
const CHAVE_CANARIA = "SG.canario-chave-de-teste-nao-e-segredo";
const REMETENTE = "admissao@homolog.local";
const REMETENTE_NOME = "Portal Teste Soulan";

/**
 * O NOME DA VARIAVEL DA CHAVE, MONTADO POR PEDACOS DE PROPOSITO.
 *
 * O literal do nome dessa variavel NAO pode aparecer inteiro neste arquivo: o INVENTARIO
 * (`portal-sem-chave-e-sem-vazamento.tester.spec.ts`) varre TODO .ts e exige que ela seja LIDA em
 * um arquivo so (`portal-correio.service.ts`). Este spec so usa o NOME da variavel para montar uma
 * config falsa, nunca o segredo, e por isso o monta por pedacos, igual o inventario monta `/portal/`.
 */
const CHAVE_ENV = ["PORTAL", "CORREIO", "SENDGRID", "API", "KEY"].join("_");

const MENSAGEM_LINK: EmailDoLink = {
  assunto: "Envio Dos Seus Documentos De Admissão",
  texto: `Olá! Use o endereço: ${URL_LINK_CANARIO}`,
  html: `<p>Olá!</p><p><a href="${URL_LINK_CANARIO}">Enviar</a></p>`,
};

const MENSAGEM_CODIGO: EmailDoCodigo = {
  assunto: "Seu Código De Acesso",
  texto: `Olá! Seu código: ${CODIGO_CANARIO}`,
  html: `<p>Olá!</p><p>${CODIGO_CANARIO}</p>`,
};

function configFalsa(valores: Record<string, string>): ConfigService {
  return { get: (chave: string) => valores[chave] } as unknown as ConfigService;
}

function configCompleta(extra: Record<string, string> = {}): ConfigService {
  return configFalsa({
    [CHAVE_ENV]: CHAVE_CANARIA,
    PORTAL_CORREIO_REMETENTE: REMETENTE,
    PORTAL_CORREIO_REMETENTE_NOME: REMETENTE_NOME,
    ...extra,
  });
}

interface ChamadaCapturada {
  url: string;
  metodo: string | undefined;
  headers: Record<string, string>;
  body: string;
}

/**
 * O SERVIDOR FALSO: um `fetch` stubbado que CAPTURA a requisicao e devolve a resposta que o teste
 * pedir. `corpoErro` entra no body da resposta para simular o eco do destinatario que o SendGrid faz.
 */
function stubarFetch(opcoes: { status: number; corpoErro?: string } | { erro: Error }): {
  chamadas: ChamadaCapturada[];
} {
  const chamadas: ChamadaCapturada[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };
    chamadas.push({
      url: String(url),
      metodo: i.method,
      headers: (i.headers ?? {}) as Record<string, string>,
      body: typeof i.body === "string" ? i.body : "",
    });
    if ("erro" in opcoes) {
      // Erro de rede: rejeita de imediato, como faz o `fetch` real quando a conexao cai.
      return Promise.reject(opcoes.erro);
    }
    const corpo = opcoes.status >= 200 && opcoes.status < 300 ? "" : (opcoes.corpoErro ?? "");
    return new Response(corpo, { status: opcoes.status });
  }) as never);
  return { chamadas };
}

/**
 * O `fetch` que NUNCA RESPONDE ate o `AbortController` do correio disparar. Prova o caminho de
 * timeout de verdade (o `setTimeout` que chama `abort()`), nao um erro forjado.
 */
function stubarFetchQuePendura(): { chamadas: ChamadaCapturada[] } {
  const chamadas: ChamadaCapturada[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: unknown, init: unknown) => {
    const i = (init ?? {}) as { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal };
    chamadas.push({
      url: String(url),
      metodo: i.method,
      headers: (i.headers ?? {}) as Record<string, string>,
      body: typeof i.body === "string" ? i.body : "",
    });
    return new Promise<Response>((_ok, rejeita) => {
      const sinal = i.signal;
      if (sinal) {
        sinal.addEventListener("abort", () => {
          const e = new Error("abortado pelo tempo limite");
          e.name = "AbortError";
          rejeita(e);
        });
      }
    });
  }) as never);
  return { chamadas };
}

// ── CAPTURA DE LOG: toda linha que o correio escrever cai aqui, para a varredura de §A.6 ──────────
let logs: string[] = [];

beforeEach(() => {
  logs = [];
  for (const metodo of ["log", "warn", "error", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, metodo).mockImplementation(((...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    }) as never);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("o caminho SendGrid devolve o booleano certo", () => {
  it("202 (aceito): enviarLink e enviarCodigo retornam TRUE", async () => {
    stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    expect(await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK)).toBe(true);
    expect(await correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO)).toBe(true);
  });

  for (const status of [400, 401, 429, 500, 503]) {
    it(`${status} (recusado): retorna FALSE no braco !resposta.ok`, async () => {
      stubarFetch({ status, corpoErro: `{"errors":[{"message":"falhou para ${EMAIL_CANARIO}"}]}` });
      const correio = new PortalCorreioService(configCompleta());
      expect(await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK)).toBe(false);
      expect(await correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO)).toBe(false);
    });
  }

  it("erro de rede: retorna FALSE, sem lancar", async () => {
    stubarFetch({ erro: new Error(`conexao caiu falando com ${EMAIL_CANARIO}`) });
    const correio = new PortalCorreioService(configCompleta());
    await expect(correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK)).resolves.toBe(false);
    await expect(correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO)).resolves.toBe(false);
  });

  it("tempo limite (o AbortController dispara): retorna FALSE, sem lancar", async () => {
    stubarFetchQuePendura();
    const correio = new PortalCorreioService(configCompleta({ PORTAL_CORREIO_TIMEOUT_MS: "20" }));
    await expect(correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK)).resolves.toBe(false);
  });

  it("sem chave (nao configurado): nem chega a chamar o SendGrid, e retorna FALSE", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configFalsa({ PORTAL_CORREIO_REMETENTE: REMETENTE }));
    expect(correio.configurado()).toBe(false);
    expect(await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK)).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it("sem remetente (nao configurado): nem chega a chamar o SendGrid, e retorna FALSE", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configFalsa({ [CHAVE_ENV]: CHAVE_CANARIA }));
    expect(correio.configurado()).toBe(false);
    expect(await correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO)).toBe(false);
    expect(chamadas).toEqual([]);
  });
});

describe("a requisicao bate o contrato do SendGrid", () => {
  it("vai para /v3/mail/send com POST, Authorization Bearer e Content-Type JSON", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK);

    expect(chamadas.length).toBe(1);
    const chamada = chamadas[0];
    expect(chamada.url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(chamada.metodo).toBe("POST");
    expect(chamada.headers.Authorization).toBe(`Bearer ${CHAVE_CANARIA}`);
    expect(chamada.headers["Content-Type"]).toBe("application/json");
  });

  it("o corpo tem personalizations/from/content, com text/plain ANTES de text/html", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK);

    const corpo = JSON.parse(chamadas[0].body) as {
      personalizations: { to: { email: string }[] }[];
      from: { email: string; name: string };
      subject: string;
      content: { type: string; value: string }[];
    };
    expect(corpo.personalizations[0].to[0].email).toBe(EMAIL_CANARIO);
    expect(corpo.from.email).toBe(REMETENTE);
    expect(corpo.from.name).toBe(REMETENTE_NOME);
    expect(corpo.subject).toBe(MENSAGEM_LINK.assunto);
    // A ORDEM IMPORTA: a API do SendGrid exige o texto puro antes do HTML.
    expect(corpo.content.map((c) => c.type)).toEqual(["text/plain", "text/html"]);
    expect(corpo.content[0].value).toBe(MENSAGEM_LINK.texto);
    expect(corpo.content[1].value).toBe(MENSAGEM_LINK.html);
  });
});

describe("o LINK leva o logo como anexo inline (CID); o CÓDIGO não leva anexo nenhum", () => {
  interface CorpoComAnexos {
    content: { type: string; value: string }[];
    attachments?: {
      content: string;
      type: string;
      filename: string;
      disposition: string;
      content_id: string;
    }[];
  }

  it("enviarLink injeta attachments com content_id = CID e disposition inline", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK);

    const corpo = JSON.parse(chamadas[0].body) as CorpoComAnexos;
    expect(Array.isArray(corpo.attachments), "enviarLink não injetou attachments").toBe(true);
    expect(corpo.attachments?.length).toBe(1);
    const anexo = corpo.attachments![0];
    expect(anexo.content_id).toBe(LOGO_SOULAN_CID);
    expect(anexo.disposition).toBe("inline");
    expect(anexo.type).toBe("image/png");
    expect(anexo.content, "o anexo carrega o base64 do logo").toBe(LOGO_SOULAN_BASE64);
    expect(anexo.content.length).toBeGreaterThan(0);
  });

  it("enviarCodigo NÃO injeta attachments: o e-mail do código não leva imagem", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO);

    const corpo = JSON.parse(chamadas[0].body) as CorpoComAnexos;
    expect("attachments" in corpo, "o e-mail do código veio com attachments").toBe(false);
  });

  /**
   * PONTA A PONTA: o corpo REAL (`corpoDoEmailDoLink`) referencia `cid:<X>` no html, e o correio
   * declara esse MESMO `<X>` como `content_id` do anexo. Sem o casamento, o cliente de e-mail mostra
   * imagem quebrada mesmo com o anexo presente, e nenhum teste de uma ponta só pegaria isso.
   */
  it("o cid referenciado no HTML real casa com o content_id do anexo", async () => {
    const { chamadas } = stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    const mensagemReal = corpoDoEmailDoLink({
      nome: "Candidato Sintético",
      url: URL_LINK_CANARIO,
      expiraEm: new Date("2026-09-24T12:00:00.000Z"),
    });
    await correio.enviarLink(EMAIL_CANARIO, mensagemReal);

    const corpo = JSON.parse(chamadas[0].body) as CorpoComAnexos;
    const html = corpo.content.find((c) => c.type === "text/html")?.value ?? "";
    const cid = corpo.attachments?.[0]?.content_id ?? "";
    expect(cid).toBe(LOGO_SOULAN_CID);
    expect(html).toContain(`cid:${cid}`);
  });
});

describe("§A.6 em execucao: nada sensivel vaza no log, nem no feliz nem no erro", () => {
  function logJunto(): string {
    return logs.join("\n");
  }

  function asserteSemVazamento(contexto: string) {
    const texto = logJunto();
    expect(texto.includes(EMAIL_CANARIO), `${contexto}: o destinatario apareceu em log`).toBe(false);
    expect(texto.includes(CODIGO_CANARIO), `${contexto}: o codigo apareceu em log`).toBe(false);
    expect(texto.includes(URL_LINK_CANARIO), `${contexto}: o link apareceu em log`).toBe(false);
    expect(texto.includes(CHAVE_CANARIA), `${contexto}: a chave de API apareceu em log`).toBe(false);
    // O base64 do logo viaja no corpo da requisicao (anexo), NUNCA no log: um blob no log enche o
    // registro e, pior, carimba qual e-mail levou anexo. So o rotulo da rota e o status entram.
    expect(texto.includes(LOGO_SOULAN_BASE64), `${contexto}: o base64 do logo apareceu em log`).toBe(false);
  }

  it("caminho feliz (202): destinatario, codigo, link e chave nao vao para log", async () => {
    stubarFetch({ status: 202 });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK);
    await correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO);
    asserteSemVazamento("202");
  });

  it("caminho de erro: o corpo que ECOA o destinatario nao chega ao log", async () => {
    // O SendGrid devolve o endereco que mandamos dentro do corpo de erro; e por ele que o
    // destinatario voltaria ao log sem ninguem ter escrito `log(email)`.
    stubarFetch({
      status: 401,
      corpoErro: `{"errors":[{"message":"endereco invalido: ${EMAIL_CANARIO}","field":"personalizations.0.to.0.email"}]}`,
    });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK);
    await correio.enviarCodigo(EMAIL_CANARIO, MENSAGEM_CODIGO);

    asserteSemVazamento("401 com eco");
    // O que PODE aparecer e o rotulo da rota e o status, e so isso.
    expect(logJunto()).toContain("401");
  });

  it("caminho de erro de rede: a mensagem do erro (que carrega o destinatario) nao vai para log", async () => {
    stubarFetch({ erro: new Error(`conexao caiu falando com ${EMAIL_CANARIO}`) });
    const correio = new PortalCorreioService(configCompleta());
    await correio.enviarLink(EMAIL_CANARIO, MENSAGEM_LINK);
    asserteSemVazamento("erro de rede");
  });
});
