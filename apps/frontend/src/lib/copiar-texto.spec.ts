// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { AVISO_COPIA_FALHOU, copiarTexto } from "./copiar-texto";

/**
 * O DEFEITO MEDIDO: `navigator.clipboard` NÃO EXISTE fora de contexto seguro, e a homologação é
 * `http://10.18.117.235:3120`. O teste do caminho de reserva é o que impede a correção de sumir
 * numa refatoração e o botão voltar a não fazer nada em silêncio.
 */

function semApiModerna() {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: undefined,
    configurable: true,
  });
}

function comApiModerna(impl: (t: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText: impl },
    configurable: true,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  semApiModerna();
  // @ts-expect-error execCommand não existe no tipo de `document` do happy-dom
  delete document.execCommand;
});

describe("copiarTexto", () => {
  it("usa a API moderna quando ela existe", async () => {
    const escrito: string[] = [];
    comApiModerna(async (t) => {
      escrito.push(t);
    });
    expect(await copiarTexto("https://portal/abc")).toBe("copiado");
    expect(escrito).toEqual(["https://portal/abc"]);
  });

  it("SEM contexto seguro (o caso da 3120) cai na reserva e copia", async () => {
    semApiModerna();
    const chamadas: string[] = [];
    document.execCommand = (cmd: string) => {
      chamadas.push(cmd);
      return true;
    };
    expect(await copiarTexto("https://portal/abc")).toBe("copiado");
    expect(chamadas).toEqual(["copy"]);
  });

  it("a API moderna que ESTOURA ainda tenta a reserva", async () => {
    comApiModerna(async () => {
      throw new Error("permissão negada");
    });
    document.execCommand = () => true;
    expect(await copiarTexto("x")).toBe("copiado");
  });

  it("os dois caminhos falhando devolvem FALHOU, para a tela poder DIZER (nada de silêncio)", async () => {
    semApiModerna();
    document.execCommand = () => false;
    expect(await copiarTexto("x")).toBe("falhou");
  });

  it("execCommand que LANÇA não derruba a tela", async () => {
    semApiModerna();
    document.execCommand = () => {
      throw new Error("não suportado");
    };
    expect(await copiarTexto("x")).toBe("falhou");
  });

  it("o textarea da reserva NÃO fica órfão no documento (§A.6: ele carrega credencial)", async () => {
    semApiModerna();
    document.execCommand = () => true;
    await copiarTexto("https://portal/credencial");
    expect(document.querySelectorAll("textarea").length).toBe(0);
    expect(document.body.innerHTML).not.toContain("credencial");
  });

  it("o aviso de falha é honesto e não tem travessão (§A.11)", () => {
    expect(AVISO_COPIA_FALHOU).toContain("Ctrl+C");
    expect(AVISO_COPIA_FALHOU).not.toContain("—");
  });
});
