import { describe, expect, it } from "vitest";
import { dataParaExibicao, dataParaCanonico } from "./portal-data-br";

/**
 * TESTER INDEPENDENTE (§A.38), escrito A PARTIR DO REQUISITO, em paralelo à construção.
 *
 * AJUSTE 1 do Portal MUDOU DE CAMADA (veto do `seguranca`): a data em `DD/MM/AAAA` é DISPLAY-ONLY,
 * vive no FRONTEND. O backend guarda e emite ISO cru. Estas duas funções são as pontas:
 *
 *  - `dataParaExibicao(iso)`  -> o que o candidato VÊ: `2015-03-14` vira `14/03/2015`.
 *  - `dataParaCanonico(br)`   -> o que é SUBMETIDO/persistido: `14/03/2015` vira `2015-03-14`.
 *
 * As duas são CONSERVADORAS: o que não casa o formato esperado volta INTACTO, byte a byte. É essa
 * régua que garante que o G.I nunca receba `DD/MM/AAAA` e que um RG, um CPF ou um nome nunca sejam
 * remexidos por engano.
 *
 * Quem escreve o módulo é outro agente; este arquivo não o cria. Rodado antes dele, FALHA por
 * módulo inexistente, e é o esperado. §A.11: sem travessão.
 */

describe("dataParaExibicao: ISO vira o padrão brasileiro para o candidato ver", () => {
  it("2015-03-14 (ISO com hífen) vira 14/03/2015", () => {
    expect(dataParaExibicao("2015-03-14")).toBe("14/03/2015");
  });

  it("2015/03/14 (ISO com barra) vira 14/03/2015", () => {
    expect(dataParaExibicao("2015/03/14")).toBe("14/03/2015");
  });

  it("preserva zeros à esquerda: 2001-01-05 vira 05/01/2001", () => {
    expect(dataParaExibicao("2001-01-05")).toBe("05/01/2001");
  });

  const intactos: Array<[string, string]> = [
    ["um nome", "Maria Simulada"],
    ["um RG pontuado", "12.345.678-9"],
    ["um CPF pontuado", "000.000.001-91"],
    ["um CPF cru", "00000000191"],
    ["texto qualquer", "Rua das Flores, 100"],
  ];
  for (const [rotulo, valor] of intactos) {
    it(`${rotulo} volta intacto`, () => {
      expect(dataParaExibicao(valor)).toBe(valor);
    });
  }

  it("vazio volta vazio, sem quebrar", () => {
    expect(dataParaExibicao("")).toBe("");
  });

  const invalidas = ["2015-13-40", "2015-00-10", "2015-12-00", "2015-12-40"];
  for (const valor of invalidas) {
    it(`data fora de 1..12 / 1..31 (${valor}) volta intacta, nunca vira BR`, () => {
      const saida = dataParaExibicao(valor);
      expect(saida).toBe(valor);
      expect(saida).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });
  }

  it("idempotência: uma data já em BR volta em BR (não casa o ISO)", () => {
    expect(dataParaExibicao("14/03/2015")).toBe("14/03/2015");
  });
});

describe("dataParaCanonico: o BR do candidato vira ISO para submeter/persistir", () => {
  it("14/03/2015 vira 2015-03-14", () => {
    expect(dataParaCanonico("14/03/2015")).toBe("2015-03-14");
  });

  it("preserva zeros à esquerda: 05/01/2001 vira 2001-01-05", () => {
    expect(dataParaCanonico("05/01/2001")).toBe("2001-01-05");
  });

  it("o que já é ISO NÃO é BR: volta intacto (não é dupla conversão)", () => {
    expect(dataParaCanonico("2015-03-14")).toBe("2015-03-14");
  });

  const intactos: Array<[string, string]> = [
    ["um nome", "Maria Simulada"],
    ["um RG pontuado", "12.345.678-9"],
    ["um CPF cru", "00000000191"],
  ];
  for (const [rotulo, valor] of intactos) {
    it(`${rotulo} volta intacto`, () => {
      expect(dataParaCanonico(valor)).toBe(valor);
    });
  }

  it("vazio volta vazio, sem quebrar", () => {
    expect(dataParaCanonico("")).toBe("");
  });

  const invalidas = ["40/13/2015", "00/10/2015", "10/00/2015", "32/01/2015"];
  for (const valor of invalidas) {
    it(`BR fora de 1..31 / 1..12 (${valor}) volta intacto, nunca vira ISO`, () => {
      const saida = dataParaCanonico(valor);
      expect(saida).toBe(valor);
      expect(saida).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  }
});

describe("as duas pontas fecham o ciclo (round-trip)", () => {
  it("canonico(exibicao(iso)) devolve o ISO original, byte a byte", () => {
    const iso = "2015-03-14";
    expect(dataParaCanonico(dataParaExibicao(iso))).toBe(iso);
  });

  it("exibicao(canonico(br)) devolve o BR original", () => {
    const br = "14/03/2015";
    expect(dataParaExibicao(dataParaCanonico(br))).toBe(br);
  });

  it("o que NÃO é data atravessa as duas pontas sem mudar", () => {
    const nome = "Maria Simulada";
    expect(dataParaCanonico(dataParaExibicao(nome))).toBe(nome);
    expect(dataParaExibicao(dataParaCanonico(nome))).toBe(nome);
  });
});
