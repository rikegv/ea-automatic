import { describe, expect, it } from "vitest";
import { ncSituacao, penalizaConsultor } from "./nao-conformidade";

describe("ncSituacao() — situação consolidada (status × liberação)", () => {
  it("liberação aprovada vence o estado de resolução", () => {
    expect(ncSituacao("ABERTA", "APROVADA")).toBe("LIBERADA_DIRETORIA");
    expect(ncSituacao("RESOLVIDA", "APROVADA")).toBe("LIBERADA_DIRETORIA");
  });

  it("liberação pendente aguarda supervisão", () => {
    expect(ncSituacao("ABERTA", "PENDENTE")).toBe("AGUARDA_SUPERVISAO");
  });

  it("sem liberação: resolvida vs aberta", () => {
    expect(ncSituacao("RESOLVIDA", "NENHUMA")).toBe("RESOLVIDA");
    expect(ncSituacao("ABERTA", "NENHUMA")).toBe("ABERTA");
  });

  it("reprovada volta a ser NC comum (aberta)", () => {
    expect(ncSituacao("ABERTA", "REPROVADA")).toBe("ABERTA");
  });
});

describe("penalizaConsultor() — contador de gestão (Via 1 × Via 2)", () => {
  it("penaliza em tudo, exceto liberação aprovada pela diretoria", () => {
    expect(penalizaConsultor("NENHUMA")).toBe(true);
    expect(penalizaConsultor("PENDENTE")).toBe(true);
    expect(penalizaConsultor("REPROVADA")).toBe(true);
    expect(penalizaConsultor("APROVADA")).toBe(false);
  });
});
