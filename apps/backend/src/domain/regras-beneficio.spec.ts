import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CHAVES_REGRA_BENEFICIO,
  PRINCIPAIS_BENEFICIO,
  ROTULO_REGRA_BENEFICIO,
  ehChaveRegraBeneficio,
} from "./regras-beneficio";
import { menuDaOperacao } from "./menus";

describe("regras de benefício por cliente", () => {
  it("as chaves são as quatro siglas mais OUTROS e GERAL, nesta ordem", () => {
    expect([...CHAVES_REGRA_BENEFICIO]).toEqual(["VT", "VR", "VA", "AM", "OUTROS", "GERAL"]);
  });

  it("todo grupo tem rótulo, então a tela nunca mostra a chave crua", () => {
    for (const c of CHAVES_REGRA_BENEFICIO) {
      expect(ROTULO_REGRA_BENEFICIO[c], c).toBeTruthy();
    }
  });

  it("só aceita chave conhecida", () => {
    expect(ehChaveRegraBeneficio("VT")).toBe(true);
    expect(ehChaveRegraBeneficio("GERAL")).toBe(true);
    expect(ehChaveRegraBeneficio("VALE_QUALQUER")).toBe(false);
  });

  /**
   * O ACORDO COM A FILA. As duas listas de siglas são declaradas em arquivos diferentes de propósito
   * (§A.26: não editei a constante já validada da fila só para esta frente ler). O preço disso é que
   * elas podem divergir em silêncio, e é exatamente isso que este teste impede: mudar os principais
   * da fila sem mudar os grupos do modal quebra aqui, e não na tela do time.
   */
  it("as siglas batem com as PRINCIPAIS da fila de benefícios", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "beneficios", "beneficios-fila.service.ts"),
      "utf8",
    );
    const m = /PRINCIPAIS\s*=\s*\[([^\]]*)\]/.exec(fonte);
    expect(m, "constante PRINCIPAIS não encontrada na fila").toBeTruthy();
    const daFila = [...m![1].matchAll(/"([A-Z]+)"/g)].map((x) => x[1]);
    expect(daFila).toEqual([...PRINCIPAIS_BENEFICIO]);
  });

  /** §A.23: as duas operações nascem governadas pelo menu do time, e não abertas. */
  it("leitura e escrita das regras são reivindicadas pelo menu beneficios-fila", () => {
    expect(menuDaOperacao("RegrasBeneficioController", "listar")).toBe("beneficios-fila");
    expect(menuDaOperacao("RegrasBeneficioController", "salvar")).toBe("beneficios-fila");
  });
});
