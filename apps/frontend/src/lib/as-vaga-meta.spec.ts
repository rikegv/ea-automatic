import { describe, expect, it } from "vitest";
import type { VagaMetaReducao } from "@ea/shared-types";
import {
  avisoDeReducaoDeMeta,
  fraseDaReducaoDeMeta,
  houveReducaoDeMeta,
  ladosReduzidos,
} from "./as-vaga-meta";

/**
 * O QUE ESTE TESTE PROTEGE: o aviso que existe por causa de um contorno REAL de gate.
 *
 * O consultor baixava a meta oficial até o número já entregue e a vaga fechava pela porta normal,
 * sem Master e sem trilha. A decisão do diretor foi rastro, não trava, então a peça que sobra é o
 * TEXTO: um aviso que deixe de aparecer na redução devolve a tela ao estado silencioso SEM NADA
 * FALHAR, e um aviso que apareça no aumento treina o time a fechar o diálogo sem ler.
 *
 * O terceiro ponto protegido é o TEMPO VERBAL e o LADO CITADO na trilha: os quatro números são
 * congelados, e o lado que não mexeu chega com `de` igual a `para`.
 */

const REDUCAO: VagaMetaReducao = {
  deOficiais: 5,
  paraOficiais: 1,
  deBanco: 3,
  paraBanco: 0,
  porNome: "Ana Souza",
  quandoIso: "2026-09-09T14:22:00.000Z",
};

describe("ladosReduzidos (os dois lados conferidos separadamente, nunca pela soma)", () => {
  it("pega a redução do oficial mesmo com a SOMA intacta, que é o contorno do gate", () => {
    // 5 + 0 = 5 e 1 + 4 = 5: a soma não mexeu, e o gate do fechamento lê só o oficial.
    const l = ladosReduzidos({ oficiais: 5, banco: 0 }, { oficiais: 1, banco: 4 });
    expect(l.oficiais).toBe(true);
    expect(l.banco).toBe(false);
    expect(houveReducaoDeMeta({ oficiais: 5, banco: 0 }, { oficiais: 1, banco: 4 })).toBe(true);
  });

  it("pega a redução só do banco", () => {
    expect(ladosReduzidos({ oficiais: 3, banco: 4 }, { oficiais: 3, banco: 1 })).toEqual({
      oficiais: false,
      banco: true,
    });
  });

  it("AUMENTAR não é redução, nos dois lados: o aviso não pode aparecer no caso inofensivo", () => {
    expect(houveReducaoDeMeta({ oficiais: 2, banco: 0 }, { oficiais: 5, banco: 3 })).toBe(false);
  });

  it("manter os dois números não é redução", () => {
    expect(houveReducaoDeMeta({ oficiais: 5, banco: 3 }, { oficiais: 5, banco: 3 })).toBe(false);
  });

  it("RASCUNHO sem meta oficial não reduz: não há de onde descer", () => {
    expect(ladosReduzidos({ oficiais: null, banco: 0 }, { oficiais: 3, banco: 0 })).toEqual({
      oficiais: false,
      banco: false,
    });
  });
});

describe("avisoDeReducaoDeMeta (o de/para concreto, e o nulo que decide se o diálogo abre)", () => {
  it("é NULO quando não houve redução: a tela pergunta pelo aviso, não pela conta", () => {
    expect(avisoDeReducaoDeMeta({ oficiais: 2, banco: 1 }, { oficiais: 4, banco: 2 })).toBeNull();
  });

  it("diz o de/para dos DOIS lados quando os dois encolheram", () => {
    const aviso = avisoDeReducaoDeMeta({ oficiais: 5, banco: 3 }, { oficiais: 1, banco: 0 });
    expect(aviso).toContain("A meta oficial cai de 5 para 1.");
    expect(aviso).toContain("A meta de banco cai de 3 para 0.");
  });

  it("cita SÓ o lado que encolheu quando o outro aumentou", () => {
    const aviso = avisoDeReducaoDeMeta({ oficiais: 5, banco: 0 }, { oficiais: 1, banco: 4 });
    expect(aviso).toContain("A meta oficial cai de 5 para 1.");
    expect(aviso).not.toContain("banco cai");
  });

  it("informa o registro sem acusar, e sem travessão (§A.11)", () => {
    const aviso = avisoDeReducaoDeMeta({ oficiais: 5, banco: 0 }, { oficiais: 1, banco: 0 }) ?? "";
    expect(aviso).toContain("continua sendo uma decisão sua");
    expect(aviso).toContain("fica registrada na vaga, com o seu nome e a data");
    expect(aviso).not.toContain("—");
  });
});

describe("fraseDaReducaoDeMeta (a trilha, no passado e só do lado que mexeu)", () => {
  it("escreve autor, data e os dois lados", () => {
    expect(fraseDaReducaoDeMeta(REDUCAO, "09/09/2026 11:22")).toBe(
      "Reduzida por Ana Souza em 09/09/2026 11:22: a meta oficial caiu de 5 para 1 e a meta de banco caiu de 3 para 0.",
    );
  });

  it("omite o lado que NÃO mexeu, que chega com `de` igual a `para`", () => {
    const soBanco = { ...REDUCAO, deOficiais: 5, paraOficiais: 5 };
    expect(fraseDaReducaoDeMeta(soBanco, "09/09/2026 11:22")).toBe(
      "Reduzida por Ana Souza em 09/09/2026 11:22: a meta de banco caiu de 3 para 0.",
    );
  });

  it("autor removido vira \"não informado\" (§A.11), e a linha continua aparecendo", () => {
    const semAutor = { ...REDUCAO, porNome: null };
    expect(fraseDaReducaoDeMeta(semAutor, "09/09/2026 11:22")).toContain(
      "Reduzida por não informado em",
    );
  });

  it("linha sem lado nenhum ainda sai legível, sem dois-pontos pendurado", () => {
    const nada = { ...REDUCAO, deOficiais: 2, paraOficiais: 2, deBanco: 0, paraBanco: 0 };
    expect(fraseDaReducaoDeMeta(nada, "09/09/2026 11:22")).toBe(
      "Reduzida por Ana Souza em 09/09/2026 11:22.",
    );
  });
});
