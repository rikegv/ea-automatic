import { Logger } from "@nestjs/common";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verificarBilhete, type DadosBilhete } from "./portal-bilhete";
import {
  EMISSOR_TIMEOUT_MS_PADRAO,
  PortalEmissorService,
  urlDeEscritaConfere,
} from "./portal-emissor.service";

/**
 * O CLIENTE DO EMISSOR: INÉRCIA, TEMPO LIMITE, RECUSA E SILÊNCIO.
 *
 * O teste que mais importa aqui é o do SILÊNCIO (§A.6). O bilhete é credencial, a URL é credencial e
 * o nome do objeto identifica o envio de uma pessoa: nenhum dos três pode aparecer em log, nem no
 * caminho feliz, nem no erro do emissor, nem na falha de rede. É por isso que todo teste deste
 * arquivo captura o logger e varre o que foi escrito.
 */

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLICA_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIVADA_B64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
).toString("base64");

const config = (valores: Record<string, string>) =>
  ({ get: (chave: string) => valores[chave] }) as never;

const LIGADO = {
  PORTAL_EMISSOR_URL: "http://127.0.0.1:8030/",
  PORTAL_EMISSOR_BILHETE_PRIVATE_KEY: PRIVADA_B64,
};

const OBJETO = "a1b2c3d4e5f6/RG__11111111-2222-3333-4444-555555555555.pdf";
const URL_ASSINADA = `https://storage.googleapis.com/ea-portal-entrada/${OBJETO}?X-Goog-Signature=deadbeef`;

/** A URL que um emissor comprometido devolveria: mesmos cabeçalhos, outro destino. */
const URL_DE_TERCEIRO = `https://balde-de-terceiro.exemplo.com/${OBJETO}?X-Goog-Signature=deadbeef`;

const CABECALHOS = {
  "content-type": "application/pdf",
  "x-goog-content-length-range": "0,1048576",
  "x-goog-if-generation-match": "0",
};

const PEDIDO: DadosBilhete = {
  destino: "assinar-escrita",
  bucket: "ea-portal-entrada",
  objeto: OBJETO,
  metodo: "PUT",
  cabecalhos: CABECALHOS,
  ttlSegundos: 600,
  absEpoch: Math.floor(Date.now() / 1000) + 600,
};

/** Tudo o que o serviço escreveu em log, de qualquer nível, numa string só. */
let escritoEmLog: string[] = [];

beforeEach(() => {
  escritoEmLog = [];
  for (const nivel of ["log", "error", "warn", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, nivel).mockImplementation(((...args: unknown[]) => {
      escritoEmLog.push(args.map((a) => String(a)).join(" "));
    }) as never);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const logInteiro = () => escritoEmLog.join("\n");

describe("Nasce INERTE: sem endereço ou sem chave, nada sai e nada lança", () => {
  it("ambiente vazio: não configurado", () => {
    expect(new PortalEmissorService(config({})).configurado()).toBe(false);
  });

  it("endereço sem chave não basta, e chave sem endereço também não", () => {
    expect(
      new PortalEmissorService(config({ PORTAL_EMISSOR_URL: "http://x" })).configurado(),
    ).toBe(false);
    expect(
      new PortalEmissorService(
        config({ PORTAL_EMISSOR_BILHETE_PRIVATE_KEY: PRIVADA_B64 }),
      ).configurado(),
    ).toBe(false);
  });

  it("chave presente e ilegível NÃO derruba o serviço, só deixa inerte", () => {
    const servico = new PortalEmissorService(
      config({ PORTAL_EMISSOR_URL: "http://x", PORTAL_EMISSOR_BILHETE_PRIVATE_KEY: "lixo" }),
    );
    expect(servico.configurado()).toBe(false);
  });

  it("sem configuração NÃO chama ninguém e devolve nulo (recusa, nunca tentativa)", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const servico = new PortalEmissorService(config({}));

    expect(await servico.assinarEscrita(PEDIDO)).toBeNull();
    expect(await servico.consultarMetadado({ ...PEDIDO, destino: "metadado" })).toBeNull();
    expect(await servico.corrigirTipo({ ...PEDIDO, destino: "corrigir-tipo" })).toBe(false);
    expect(await servico.apagar({ ...PEDIDO, destino: "apagar" })).toBe(false);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("não existe endereço padrão: nenhum host aparece em lugar nenhum sem a env", () => {
    expect(new PortalEmissorService(config({})).descrever()).toEqual({
      configurado: false,
      timeoutMs: EMISSOR_TIMEOUT_MS_PADRAO,
    });
  });
});

describe("O bilhete que sai é o contrato, e o destino é a rota", () => {
  it("cunha um bilhete verificável, com método, objeto e cabeçalhos DENTRO dele (B1)", async () => {
    let corpo = "";
    let endereco = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        endereco = url;
        corpo = init.body;
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: URL_ASSINADA, cabecalhos: CABECALHOS, expiraEm: new Date().toISOString() }),
        };
      }),
    );

    const assinada = await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO);
    expect(assinada?.url).toBe(URL_ASSINADA);
    // A barra do fim do endereço configurado é aparada, e o destino vira a rota.
    expect(endereco).toBe("http://127.0.0.1:8030/assinar-escrita");

    const { bilhete } = JSON.parse(corpo) as { bilhete: string };
    const claims = verificarBilhete(bilhete, PUBLICA_PEM);
    expect(claims.dst).toBe("assinar-escrita");
    expect(claims.mtd).toBe("PUT");
    expect(claims.obj).toBe(OBJETO);
    expect(claims.hdr).toEqual(CABECALHOS);
    expect(claims.ttl).toBe(600);
    expect(claims.abs).toBe(PEDIDO.absEpoch);
  });

  it("cada destino bate numa rota própria, porque do outro lado é outra identidade (B2 e B3)", async () => {
    const enderecos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        enderecos.push(url);
        return { ok: true, status: 200, json: async () => ({ ok: true, existe: true, objeto: OBJETO }) };
      }),
    );
    const servico = new PortalEmissorService(config(LIGADO));

    await servico.consultarMetadado({ ...PEDIDO, destino: "metadado", metodo: "HEAD", cabecalhos: {} });
    await servico.corrigirTipo({ ...PEDIDO, destino: "corrigir-tipo" });
    await servico.apagar({ ...PEDIDO, destino: "apagar", metodo: "DELETE", cabecalhos: {} });

    expect(enderecos).toEqual([
      "http://127.0.0.1:8030/metadado",
      "http://127.0.0.1:8030/corrigir-tipo",
      "http://127.0.0.1:8030/apagar",
    ]);
  });

  it("o `kid` vai no cabeçalho do bilhete quando configurado (rotação, risco R8)", async () => {
    let corpo = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        corpo = init.body;
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }),
    );
    await new PortalEmissorService(
      config({ ...LIGADO, PORTAL_EMISSOR_KID: "chave-2" }),
    ).apagar({ ...PEDIDO, destino: "apagar" });

    const { bilhete } = JSON.parse(corpo) as { bilhete: string };
    const cabecalho = JSON.parse(Buffer.from(bilhete.split(".")[0], "base64url").toString("utf8"));
    expect(cabecalho.kid).toBe("chave-2");
  });
});

describe("Erro do emissor vira RECUSA, nunca sucesso inventado", () => {
  it("resposta de erro devolve nulo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("falha de rede devolve nulo, sem lançar em cima do candidato", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("corpo sem URL devolve nulo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("corpo ilegível devolve nulo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      })),
    );
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("curadoria: nada de `ok` verdadeiro devolve falso", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) })));
    const servico = new PortalEmissorService(config(LIGADO));
    expect(await servico.corrigirTipo({ ...PEDIDO, destino: "corrigir-tipo" })).toBe(false);
    expect(await servico.apagar({ ...PEDIDO, destino: "apagar" })).toBe(false);
  });

  it("CONDIÇÃO B1: cabeçalho acrescentado, removido ou trocado pelo emissor é RECUSA", async () => {
    const respostaCom = (cabecalhos: Record<string, string>) =>
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ url: URL_ASSINADA, cabecalhos, expiraEm: new Date().toISOString() }),
      }));
    const servico = new PortalEmissorService(config(LIGADO));

    // Acrescentou.
    vi.stubGlobal("fetch", respostaCom({ ...CABECALHOS, "x-goog-acl": "public-read" }));
    expect(await servico.assinarEscrita(PEDIDO)).toBeNull();

    // Removeu justamente o teto de tamanho, que é o cabeçalho que cai no vão.
    vi.stubGlobal(
      "fetch",
      respostaCom({
        "content-type": "application/pdf",
        "x-goog-if-generation-match": "0",
      }),
    );
    expect(await servico.assinarEscrita(PEDIDO)).toBeNull();

    // Trocou o valor: 50 GB em vez de 1 MB.
    vi.stubGlobal("fetch", respostaCom({ ...CABECALHOS, "x-goog-content-length-range": "0,53687091200" }));
    expect(await servico.assinarEscrita(PEDIDO)).toBeNull();

    // Devolveu os mesmos: passa.
    vi.stubGlobal("fetch", respostaCom({ ...CABECALHOS }));
    expect((await servico.assinarEscrita(PEDIDO))?.url).toBe(URL_ASSINADA);
  });
});

describe("Tempo limite próprio: o candidato está na tela (risco R3)", () => {
  it("aborta e devolve nulo quando o emissor não responde", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolver, rejeitar) => {
            init.signal.addEventListener("abort", () => rejeitar(new Error("AbortError")));
          }),
      ),
    );
    const servico = new PortalEmissorService(
      config({ ...LIGADO, PORTAL_EMISSOR_TIMEOUT_MS: "20" }),
    );
    expect(await servico.assinarEscrita(PEDIDO)).toBeNull();
  });

  it("o tempo limite é configurável, e valor inválido cai no padrão curto", () => {
    expect(new PortalEmissorService(config({ ...LIGADO, PORTAL_EMISSOR_TIMEOUT_MS: "2500" })).descrever().timeoutMs).toBe(2500);
    expect(new PortalEmissorService(config({ ...LIGADO, PORTAL_EMISSOR_TIMEOUT_MS: "abc" })).descrever().timeoutMs).toBe(EMISSOR_TIMEOUT_MS_PADRAO);
    expect(new PortalEmissorService(config({ ...LIGADO, PORTAL_EMISSOR_TIMEOUT_MS: "-1" })).descrever().timeoutMs).toBe(EMISSOR_TIMEOUT_MS_PADRAO);
  });
});

describe("§A.6: nem a URL, nem o bilhete, nem o nome do objeto aparecem em log", () => {
  it("no caminho feliz o log não carrega nada disso", async () => {
    let bilheteEnviado = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        bilheteEnviado = (JSON.parse(init.body) as { bilhete: string }).bilhete;
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: URL_ASSINADA, cabecalhos: CABECALHOS, expiraEm: new Date().toISOString() }),
        };
      }),
    );

    await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO);

    expect(logInteiro()).not.toContain(URL_ASSINADA);
    expect(logInteiro()).not.toContain(bilheteEnviado);
    expect(logInteiro()).not.toContain(OBJETO);
    expect(logInteiro()).not.toContain("a1b2c3d4e5f6");
  });

  it("quando o emissor recusa, o log tem o destino e o status, e mais nada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO);

    expect(logInteiro()).toContain("403");
    expect(logInteiro()).toContain("assinar-escrita");
    expect(logInteiro()).not.toContain(OBJETO);
    expect(logInteiro()).not.toContain("127.0.0.1:8030");
  });

  it("quando a rede falha, o log tem só a classe do erro, nunca a mensagem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError(`fetch failed para ${URL_ASSINADA}`);
      }),
    );
    await new PortalEmissorService(config(LIGADO)).apagar({ ...PEDIDO, destino: "apagar" });

    expect(logInteiro()).toContain("TypeError");
    expect(logInteiro()).not.toContain(URL_ASSINADA);
    expect(logInteiro()).not.toContain(OBJETO);
  });

  it("na divergência de cabeçalho o log não expõe valor nenhum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ url: URL_ASSINADA, cabecalhos: {}, expiraEm: new Date().toISOString() }),
      })),
    );
    await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO);

    expect(logInteiro()).toContain("cabecalhos");
    expect(logInteiro()).not.toContain(URL_ASSINADA);
    expect(logInteiro()).not.toContain("x-goog-content-length-range");
  });
});

describe("VETO V6: a URL devolvida é conferida, porque é ela que decide para onde vão os bytes", () => {
  const respostaComUrl = (url: string) =>
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ url, cabecalhos: CABECALHOS, expiraEm: new Date().toISOString() }),
    }));

  it("URL de OUTRO DOMÍNIO é recusada, mesmo com os cabeçalhos corretos", async () => {
    vi.stubGlobal("fetch", respostaComUrl(URL_DE_TERCEIRO));
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("URL do balde de OUTRA PESSOA no mesmo armazenamento é recusada", async () => {
    vi.stubGlobal(
      "fetch",
      respostaComUrl(`https://storage.googleapis.com/balde-alheio/${OBJETO}?X-Goog-Signature=x`),
    );
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("URL do nosso balde com OUTRO OBJETO é recusada", async () => {
    vi.stubGlobal(
      "fetch",
      respostaComUrl("https://storage.googleapis.com/ea-portal-entrada/outra-pasta/RG__x.pdf?X-Goog-Signature=x"),
    );
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("URL em `http` é recusada, ainda que balde e objeto batam", async () => {
    vi.stubGlobal(
      "fetch",
      respostaComUrl(`http://storage.googleapis.com/ea-portal-entrada/${OBJETO}?X-Goog-Signature=x`),
    );
    expect(await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO)).toBeNull();
  });

  it("a recusa não põe a URL nem o objeto em log", async () => {
    vi.stubGlobal("fetch", respostaComUrl(URL_DE_TERCEIRO));
    await new PortalEmissorService(config(LIGADO)).assinarEscrita(PEDIDO);

    expect(logInteiro()).not.toContain(URL_DE_TERCEIRO);
    expect(logInteiro()).not.toContain(OBJETO);
    expect(logInteiro()).not.toContain("ea-portal-entrada");
  });

  it("a URL do nosso balde e do nosso objeto passa, nas DUAS formas do armazenamento", async () => {
    const servico = new PortalEmissorService(config(LIGADO));

    vi.stubGlobal("fetch", respostaComUrl(URL_ASSINADA));
    expect((await servico.assinarEscrita(PEDIDO))?.url).toBe(URL_ASSINADA);

    const virtual = `https://ea-portal-entrada.storage.googleapis.com/${OBJETO}?X-Goog-Signature=x`;
    vi.stubGlobal("fetch", respostaComUrl(virtual));
    expect((await servico.assinarEscrita(PEDIDO))?.url).toBe(virtual);
  });

  it("a régua da URL, em isolado: só o nosso balde, o nosso objeto e `https`", () => {
    expect(urlDeEscritaConfere(URL_ASSINADA, "ea-portal-entrada", OBJETO)).toBe(true);
    expect(urlDeEscritaConfere(URL_DE_TERCEIRO, "ea-portal-entrada", OBJETO)).toBe(false);
    expect(urlDeEscritaConfere("nao e uma url", "ea-portal-entrada", OBJETO)).toBe(false);
    expect(urlDeEscritaConfere("", "ea-portal-entrada", OBJETO)).toBe(false);
    // "Contém o nome" não basta: o nosso objeto viajando num parâmetro de outro domínio.
    expect(
      urlDeEscritaConfere(`https://mal.exemplo.com/subir?destino=${OBJETO}`, "ea-portal-entrada", OBJETO),
    ).toBe(false);
    // Sósia de domínio.
    expect(
      urlDeEscritaConfere(`https://storage.googleapis.com.mal.exemplo.com/ea-portal-entrada/${OBJETO}`, "ea-portal-entrada", OBJETO),
    ).toBe(false);
  });
});

describe("O endereço do emissor exige `https`: o bilhete é credencial e não viaja em claro", () => {
  it("endereço em `http` para fora vira NÃO CONFIGURADO, e nada sai", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    const servico = new PortalEmissorService(
      config({ ...LIGADO, PORTAL_EMISSOR_URL: "http://emissor.exemplo.com" }),
    );
    expect(servico.configurado()).toBe(false);
    expect(await servico.assinarEscrita(PEDIDO)).toBeNull();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("endereço em `https` liga", () => {
    expect(
      new PortalEmissorService(
        config({ ...LIGADO, PORTAL_EMISSOR_URL: "https://emissor.exemplo.com" }),
      ).configurado(),
    ).toBe(true);
  });

  it("endereço ilegível vira NÃO CONFIGURADO, sem lançar", () => {
    expect(
      new PortalEmissorService(config({ ...LIGADO, PORTAL_EMISSOR_URL: "nao-e-um-endereco" })).configurado(),
    ).toBe(false);
  });

  it("o loopback literal continua valendo em `http`, e é a única exceção", () => {
    for (const endereco of ["http://127.0.0.1:8030", "http://localhost:8030"]) {
      expect(new PortalEmissorService(config({ ...LIGADO, PORTAL_EMISSOR_URL: endereco })).configurado()).toBe(true);
    }
    // Um nome que só PARECE loopback não passa.
    expect(
      new PortalEmissorService(
        config({ ...LIGADO, PORTAL_EMISSOR_URL: "http://localhost.mal.exemplo.com" }),
      ).configurado(),
    ).toBe(false);
  });
});

describe("O metadado ECOA o objeto consultado, e sem o eco é recusa", () => {
  const respostaMetadado = (corpo: Record<string, unknown>) =>
    vi.fn(async () => ({ ok: true, status: 200, json: async () => corpo }));

  const PEDIDO_METADADO = { ...PEDIDO, destino: "metadado" as const, metodo: "HEAD", cabecalhos: {} };

  it("eco igual ao pedido atravessa", async () => {
    vi.stubGlobal("fetch", respostaMetadado({ objeto: OBJETO, existe: true, bytes: 1024 }));
    const resposta = await new PortalEmissorService(config(LIGADO)).consultarMetadado(PEDIDO_METADADO);
    expect(resposta?.bytes).toBe(1024);
  });

  it("eco de OUTRO objeto é recusa: senão a conferência de divergência vira tautologia", async () => {
    vi.stubGlobal(
      "fetch",
      respostaMetadado({ objeto: "outra-pasta/RG__x.pdf", existe: true, bytes: 1024 }),
    );
    expect(await new PortalEmissorService(config(LIGADO)).consultarMetadado(PEDIDO_METADADO)).toBeNull();
  });

  it("eco AUSENTE é recusa, não é tolerância", async () => {
    vi.stubGlobal("fetch", respostaMetadado({ existe: true, bytes: 1024 }));
    expect(await new PortalEmissorService(config(LIGADO)).consultarMetadado(PEDIDO_METADADO)).toBeNull();
  });

  it("a recusa do eco não põe nome de objeto em log", async () => {
    vi.stubGlobal("fetch", respostaMetadado({ existe: true, bytes: 1024 }));
    await new PortalEmissorService(config(LIGADO)).consultarMetadado(PEDIDO_METADADO);
    expect(logInteiro()).not.toContain(OBJETO);
  });
});
