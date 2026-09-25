import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTIVO_POR_RECUSA, PortalLeitorService } from "./portal-leitor.service";

/**
 * O CLIENTE DO LEITOR: ISOLAMENTO E INÉRCIA.
 *
 * O teste que importa aqui é o do ISOLAMENTO (exigência 3): o leitor do portal é uma SEGUNDA
 * instância do `ai-service`, e reaproveitar a URL e o token da instância da operação desfaria metade
 * do isolamento. Um token que vale nas duas faz de quem comprometer a instância que abre arquivo
 * hostil um cliente legítimo da instância que carrega a credencial do banco e a do Drive.
 */

const config = (valores: Record<string, string>) =>
  ({ get: (chave: string) => valores[chave] }) as never;

const CONFIGURADO = {
  PORTAL_LEITOR_URL: "http://127.0.0.1:8020",
  PORTAL_LEITOR_TOKEN: "token-do-portal",
};

const PEDIDO = {
  bucket: "ea-portal-entrada",
  objeto: "a1b2c3/RG__uuid.pdf",
  tipoDocumentoCodigo: "RG",
  tipoDocumentoNome: "Documento de identidade",
  candidato: { nome: "Fulano De Tal", cpf: "52998224725" },
  regras: [{ descricaoRegra: "O documento deve estar legível." }],
};

afterEach(() => vi.unstubAllGlobals());

describe("Nasce INERTE: sem configuracao, nao chama ninguem e nao quebra o boot", () => {
  it("sem URL e sem token, `configurado()` diz nao", () => {
    expect(new PortalLeitorService(config({})).configurado()).toBe(false);
  });

  it("URL sem token nao basta, e token sem URL tambem nao", () => {
    expect(new PortalLeitorService(config({ PORTAL_LEITOR_URL: "http://x" })).configurado()).toBe(false);
    expect(new PortalLeitorService(config({ PORTAL_LEITOR_TOKEN: "t" })).configurado()).toBe(false);
  });

  it("`ler` LANCA quando nao configurado, e o caminho ja sabe tratar isso", async () => {
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await expect(new PortalLeitorService(config({})).ler(PEDIDO)).rejects.toThrow(/nao configurado/);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("Exigencia 3: o leitor NAO compartilha credencial com o ai-service da operacao", () => {
  it("as variaveis do ai-service da operacao NAO ligam o leitor do portal", () => {
    const servico = new PortalLeitorService(
      config({ AI_SERVICE_URL: "http://127.0.0.1:8000", AI_SERVICE_TOKEN: "token-da-operacao" }),
    );
    expect(servico.configurado()).toBe(false);
  });

  it("usa a instancia dedicada e o token PROPRIO na chamada", async () => {
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      json: async () => ({ aceito: true, chegada: { tamanhoBytes: 10 } }),
    }));
    vi.stubGlobal("fetch", fetchFalso);

    await new PortalLeitorService(config({ ...CONFIGURADO, AI_SERVICE_TOKEN: "token-da-operacao" })).ler(PEDIDO);

    const [url, opcoes] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8020/portal/ler");
    expect((opcoes.headers as Record<string, string>)["X-Internal-Token"]).toBe("token-do-portal");
    expect(JSON.stringify(opcoes.headers)).not.toContain("token-da-operacao");
  });

  it("monta o corpo no contrato do leitor (camelCase, bucket e objeto escolhidos por nos)", async () => {
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      json: async () => ({ aceito: true, chegada: { tamanhoBytes: 10 } }),
    }));
    vi.stubGlobal("fetch", fetchFalso);

    await new PortalLeitorService(config(CONFIGURADO)).ler(PEDIDO);

    const corpo = JSON.parse(((fetchFalso.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(corpo).toEqual(PEDIDO);
    expect(Object.keys(corpo)).toContain("tipoDocumentoCodigo");
  });
});

describe("Erro do leitor nao vira detalhe no nosso lado (§A.6)", () => {
  it("HTTP de erro lanca citando so o status, nunca o corpo devolvido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        json: async () => ({ detail: "Fulano De Tal, CPF 529.982.247-25" }),
      })),
    );
    await expect(new PortalLeitorService(config(CONFIGURADO)).ler(PEDIDO)).rejects.toThrow(
      /respondeu 503/,
    );
    await expect(new PortalLeitorService(config(CONFIGURADO)).ler(PEDIDO)).rejects.not.toThrow(
      /Fulano/,
    );
  });
});

describe("A recusa do leitor cai no vocabulario FECHADO da trilha", () => {
  it("os rotulos de recusa viram codigo de motivo conhecido", () => {
    for (const recusa of ["TEMPO", "PAGINAS", "DIMENSAO", "CONTEUDO_ATIVO", "SENHA"]) {
      expect(MOTIVO_POR_RECUSA[recusa]).toBeTruthy();
    }
    expect(MOTIVO_POR_RECUSA.SENHA).toBe("PROTEGIDO_SENHA");
  });
});
