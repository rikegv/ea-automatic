import { describe, expect, it } from "vitest";
import {
  mimeDeVisualizacao,
  ordenarParaVisualizacao,
  rotuloArquivo,
} from "./staging-visualizacao";

describe("visualização de documento (Bloco 2) — regras puras", () => {
  it("serve só os tipos que o navegador abre inline", () => {
    expect(mimeDeVisualizacao("/s/adm/RG__a.pdf")).toBe("application/pdf");
    expect(mimeDeVisualizacao("/s/adm/RG__a.JPG")).toBe("image/jpeg");
    expect(mimeDeVisualizacao("/s/adm/RG__a.jpeg")).toBe("image/jpeg");
    expect(mimeDeVisualizacao("/s/adm/RG__a.png")).toBe("image/png");
  });

  it("extensão fora da allowlist NÃO é servida (nada sai como octet-stream)", () => {
    expect(mimeDeVisualizacao("/s/adm/RG__a.exe")).toBeUndefined();
    expect(mimeDeVisualizacao("/s/adm/RG__a.html")).toBeUndefined();
    expect(mimeDeVisualizacao("/s/adm/RG__a")).toBeUndefined();
  });

  it("ordem é determinística: o índice pedido pela tela aponta sempre para o mesmo arquivo", () => {
    const bagunca = [
      { caminho: "/s/adm/CTPS__c.jpg" },
      { caminho: "/s/adm/CTPS__a.jpg" },
      { caminho: "/s/adm/CTPS__b.jpg" },
    ];
    const um = ordenarParaVisualizacao(bagunca).map((a) => a.caminho);
    const dois = ordenarParaVisualizacao([...bagunca].reverse()).map((a) => a.caminho);
    expect(um).toEqual(dois);
    expect(um[0]).toContain("CTPS__a");
  });

  it("não muta a lista recebida", () => {
    const orig = [{ caminho: "/s/b" }, { caminho: "/s/a" }];
    ordenarParaVisualizacao(orig);
    expect(orig[0].caminho).toBe("/s/b");
  });

  it("rótulo é montado do nome do TIPO, nunca do nome do arquivo (§A.6)", () => {
    expect(rotuloArquivo("RG", 0, 1)).toBe("RG");
    expect(rotuloArquivo("CTPS", 0, 4)).toBe("CTPS (1 de 4)");
    expect(rotuloArquivo("CTPS", 3, 4)).toBe("CTPS (4 de 4)");
  });
});
