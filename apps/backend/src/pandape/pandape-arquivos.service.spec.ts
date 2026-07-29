import { afterEach, describe, expect, it, vi } from "vitest";
import { abortoDaResposta, PandapeArquivosService } from "./pandape-arquivos.service";
import type { PandapeApiService } from "./pandape-api.service";

/**
 * RE-BAIXA DE ANEXOS POR TIPO (OST re-baixar do Pandapé) — travas de cota e do 429.
 *
 * A cota do Pandapé é COMPARTILHADA com o webhook que alimenta a esteira (§A.5): excesso daqui
 * atrasa a entrada de admissão viva. Por isso o contrato deste service é estreito e testado:
 * UMA chamada de formulários por admissão, downloads SEQUENCIAIS, e 429 abortando na hora.
 */

const URL_RG = "https://arquivos.pandape.com/rg.jpg";
const URL_RG_VERSO = "https://arquivos.pandape.com/rg-verso.jpg";
const URL_CPF = "https://arquivos.pandape.com/cpf.pdf";

/** JPEG de verdade nos magic bytes, para a extensão resolver sem depender do header. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function makeApi(
  formularios: unknown,
  extras: Partial<{ status: number; falha: "TIMEOUT" | "REDE" | "SEM_TOKEN" | "INERTE" }> = {},
) {
  return {
    getFormulariosDocumentosComStatus: vi.fn().mockResolvedValue({
      ...(formularios ? { dados: formularios } : {}),
      ...("status" in extras ? { status: extras.status } : { status: 200 }),
      ...(extras.falha ? { falha: extras.falha } : {}),
    }),
  } as unknown as PandapeApiService & { getFormulariosDocumentosComStatus: ReturnType<typeof vi.fn> };
}

/** fetch que responde por URL; `429` marca a URL que devolve o limite de cota. */
function fetchPorUrl(mapa: Record<string, "ok" | 429 | 404>) {
  const chamadas: string[] = [];
  const spy = vi.fn(async (url: string) => {
    chamadas.push(url);
    const resposta = mapa[url] ?? "ok";
    if (resposta === "ok") {
      return {
        ok: true,
        status: 200,
        headers: { get: (): string | null => "image/jpeg" },
        arrayBuffer: async () => JPEG.buffer.slice(JPEG.byteOffset, JPEG.byteOffset + JPEG.length),
      };
    }
    return { ok: false, status: resposta, headers: { get: (): string | null => null } };
  });
  return { spy, chamadas };
}

const FORMS_RG_CPF = [
  { name: "RG", documents: [{ link: URL_RG }, { link: URL_RG_VERSO }] },
  { name: "CPF", documents: [{ link: URL_CPF }] },
  // Formulário de um tipo que NÃO foi pedido: não pode ser baixado.
  { name: "Currículo", documents: [{ link: "https://arquivos.pandape.com/cv.pdf" }] },
];

afterEach(() => vi.restoreAllMocks());

describe("PandapeArquivosService — travas de cota", () => {
  it("UMA chamada de formulários, quantos tipos forem pedidos", async () => {
    const api = makeApi(FORMS_RG_CPF);
    const { spy } = fetchPorUrl({});
    vi.stubGlobal("fetch", spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["RG", "CPF"]);

    expect(api.getFormulariosDocumentosComStatus).toHaveBeenCalledTimes(1);
    expect(r.chamadasApi).toBe(1);
    expect(r.arquivos).toHaveLength(3); // 2 do RG (frente e verso) + 1 do CPF
    expect(r.semRetorno).toEqual([]);
  });

  it("baixa SÓ os tipos pedidos: o que não foi pedido nem é tocado", async () => {
    const api = makeApi(FORMS_RG_CPF);
    const { spy, chamadas } = fetchPorUrl({});
    vi.stubGlobal("fetch", spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["CPF"]);

    expect(chamadas).toEqual([URL_CPF]);
    expect(r.arquivos.map((a) => a.codigoTipo)).toEqual(["CPF"]);
  });

  it("lista de tipos vazia não gasta chamada nenhuma", async () => {
    const api = makeApi(FORMS_RG_CPF);
    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", []);

    expect(api.getFormulariosDocumentosComStatus).not.toHaveBeenCalled();
    expect(r.chamadasApi).toBe(0);
  });

  it("o originalname é o CÓDIGO do tipo, nunca o nome real do arquivo (§A.6)", async () => {
    const api = makeApi(FORMS_RG_CPF);
    vi.stubGlobal("fetch", fetchPorUrl({}).spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["CPF"]);

    expect(r.arquivos[0].originalname).toBe("CPF.jpg");
  });
});

describe("PandapeArquivosService — 429 aborta na hora e não insiste", () => {
  it("429 no meio do laço interrompe tudo e devolve o que já tinha baixado", async () => {
    const api = makeApi(FORMS_RG_CPF);
    // O primeiro anexo do RG vem; o segundo devolve 429. O CPF nem chega a ser tentado.
    const { spy, chamadas } = fetchPorUrl({ [URL_RG_VERSO]: 429 });
    vi.stubGlobal("fetch", spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["RG", "CPF"]);

    expect(r.abortadoPor).toBe("QUOTA");
    expect(chamadas).toEqual([URL_RG, URL_RG_VERSO]); // parou ali, não tentou o CPF
    expect(r.arquivos).toHaveLength(1);
    expect(r.semRetorno).toEqual(["CPF"]);
  });

  it("429 na chamada de formulários aborta antes de qualquer download", async () => {
    const api = makeApi(undefined, { status: 429 });
    const { spy, chamadas } = fetchPorUrl({});
    vi.stubGlobal("fetch", spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["RG"]);

    expect(r.abortadoPor).toBe("QUOTA");
    expect(chamadas).toEqual([]);
    expect(r.semRetorno).toEqual(["RG"]);
  });

  it("anexo com erro comum (404) NÃO derruba os demais: só aquele é pulado", async () => {
    const api = makeApi(FORMS_RG_CPF);
    const { spy } = fetchPorUrl({ [URL_RG_VERSO]: 404 });
    vi.stubGlobal("fetch", spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["RG", "CPF"]);

    expect(r.abortadoPor).toBeUndefined();
    expect(r.arquivos.map((a) => a.codigoTipo)).toEqual(["RG", "CPF"]);
  });

  it("tipo que o Pandapé não tem entra em semRetorno (vira motivo gravado do lado de cá)", async () => {
    const api = makeApi([{ name: "RG", documents: [{ link: URL_RG }] }]);
    vi.stubGlobal("fetch", fetchPorUrl({}).spy);

    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["RG", "CTPS"]);

    expect(r.semRetorno).toEqual(["CTPS"]);
  });

  it("integração inerte não gasta nem conta chamada", async () => {
    const api = makeApi(undefined, { falha: "INERTE" });
    const r = await new PandapeArquivosService(api).baixarArquivosDosTipos("PC-1", ["RG"]);

    expect(r.abortadoPor).toBe("INERTE");
    expect(r.chamadasApi).toBe(0);
  });
});

describe("abortoDaResposta — a tradução de desfecho em aborto", () => {
  it("200 segue o fluxo", () => {
    expect(abortoDaResposta(200, undefined)).toBeUndefined();
  });
  it("429 é QUOTA", () => {
    expect(abortoDaResposta(429, undefined)).toBe("QUOTA");
  });
  it("timeout é TIMEOUT", () => {
    expect(abortoDaResposta(undefined, "TIMEOUT")).toBe("TIMEOUT");
  });
  it("rede e falta de token caem em API_FORA", () => {
    expect(abortoDaResposta(undefined, "REDE")).toBe("API_FORA");
    expect(abortoDaResposta(undefined, "SEM_TOKEN")).toBe("API_FORA");
  });
  it("500 é API_FORA", () => {
    expect(abortoDaResposta(500, undefined)).toBe("API_FORA");
  });
  it("inerte é INERTE (ambiente sem credencial, não é queda)", () => {
    expect(abortoDaResposta(undefined, "INERTE")).toBe("INERTE");
  });
});
