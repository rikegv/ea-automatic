import { describe, expect, it } from "vitest";
import {
  consolidarTotaisGrupos,
  projetosDoCliente,
  sugerirProjetoPorPeriodo,
  type ProjetoDoSeletor,
  type TotaisGrupoConsolidavel,
} from "./alto-volume";

const proj = (over: Partial<ProjetoDoSeletor> & { id: string }): ProjetoDoSeletor => ({
  codCliente: "51947",
  nome: "Temporada De Setembro 2026",
  dataInicio: "2026-09-01",
  dataFim: "2026-09-30",
  ativo: true,
  ...over,
});

describe("projetosDoCliente", () => {
  it("fica com os ativos daquele cliente", () => {
    const lista = [
      proj({ id: "a" }),
      proj({ id: "b", codCliente: "99999" }),
      proj({ id: "c", ativo: false }),
    ];
    expect(projetosDoCliente(lista, "51947").map((p) => p.id)).toEqual(["a"]);
  });

  it("cliente sem projeto devolve vazio, que é o que some com o bloco na tela", () => {
    expect(projetosDoCliente([proj({ id: "a" })], "00000")).toEqual([]);
  });

  it("sem cliente escolhido não oferece nada", () => {
    expect(projetosDoCliente([proj({ id: "a" })], "")).toEqual([]);
  });
});

describe("sugerirProjetoPorPeriodo", () => {
  const lista = [
    proj({ id: "set", dataInicio: "2026-09-01", dataFim: "2026-09-30" }),
    proj({ id: "out", dataInicio: "2026-10-01", dataFim: "2026-10-31" }),
  ];

  it("sugere o projeto cujo período cobre a data", () => {
    expect(sugerirProjetoPorPeriodo(lista, "2026-09-15")).toBe("set");
    expect(sugerirProjetoPorPeriodo(lista, "2026-10-02")).toBe("out");
  });

  it("as bordas do período contam (início e fim inclusivos)", () => {
    expect(sugerirProjetoPorPeriodo(lista, "2026-09-01")).toBe("set");
    expect(sugerirProjetoPorPeriodo(lista, "2026-09-30")).toBe("set");
  });

  it("data fora de qualquer período não sugere nada", () => {
    expect(sugerirProjetoPorPeriodo(lista, "2026-08-31")).toBe("");
    expect(sugerirProjetoPorPeriodo(lista, "2026-12-25")).toBe("");
  });

  it("sem data não sugere nada, que é o estado normal do modal recém-aberto", () => {
    expect(sugerirProjetoPorPeriodo(lista, "")).toBe("");
    expect(sugerirProjetoPorPeriodo(lista, null)).toBe("");
    expect(sugerirProjetoPorPeriodo(lista, undefined)).toBe("");
  });

  it("dois projetos cobrindo a mesma data: vence o de início mais antigo", () => {
    const sobrepostos = [
      proj({ id: "novo", dataInicio: "2026-09-10", dataFim: "2026-09-20" }),
      proj({ id: "antigo", dataInicio: "2026-09-01", dataFim: "2026-09-30" }),
    ];
    expect(sugerirProjetoPorPeriodo(sobrepostos, "2026-09-15")).toBe("antigo");
  });

  it("lista vazia não quebra", () => {
    expect(sugerirProjetoPorPeriodo([], "2026-09-15")).toBe("");
  });
});

describe("consolidarTotaisGrupos", () => {
  const tg = (over: Partial<TotaisGrupoConsolidavel>): TotaisGrupoConsolidavel => ({
    meta: 50,
    naEsteira: 0,
    ativos: 0,
    emBanco: 0,
    concluidas: 0,
    emAndamento: 0,
    pausadas: 0,
    declinios: 0,
    ...over,
  });

  it("soma dois grupos na esteira: é a prova do diretor (ex. 40 + 24 = 64)", () => {
    const r = consolidarTotaisGrupos([
      tg({ meta: 129, naEsteira: 40, concluidas: 10, emAndamento: 30, emBanco: 2, declinios: 5 }),
      tg({ meta: 33, naEsteira: 24, concluidas: 24, emAndamento: 0, emBanco: 1, declinios: 3 }),
    ]);
    expect(r.naEsteira).toBe(64);
    expect(r.meta).toBe(162);
    expect(r.concluidas).toBe(34);
    expect(r.emAndamento).toBe(30);
    expect(r.emBanco).toBe(3);
    expect(r.declinios).toBe(8);
    expect(r.faltam).toBe(162 - 64);
    expect(r.percentual).toBe(Math.round((64 / 162) * 100));
    expect(r.gruposComMeta).toBe(2);
    expect(r.gruposSemMeta).toBe(0);
  });

  it("grupo sem meta não quebra a soma: entra com as contagens e fica fora do alvo", () => {
    const r = consolidarTotaisGrupos([
      tg({ meta: 100, naEsteira: 60 }),
      tg({ meta: null, naEsteira: 20, concluidas: 5 }),
    ]);
    expect(r.meta).toBe(100);
    expect(r.naEsteira).toBe(80);
    expect(r.concluidas).toBe(5);
    expect(r.faltam).toBe(100 - 80);
    expect(r.gruposComMeta).toBe(1);
    expect(r.gruposSemMeta).toBe(1);
  });

  it("nenhum grupo com meta: meta, faltam e percentual ficam nulos, nunca zero", () => {
    const r = consolidarTotaisGrupos([
      tg({ meta: null, naEsteira: 10 }),
      tg({ meta: null, naEsteira: 5 }),
    ]);
    expect(r.meta).toBeNull();
    expect(r.faltam).toBeNull();
    expect(r.percentual).toBeNull();
    expect(r.naEsteira).toBe(15);
    expect(r.gruposComMeta).toBe(0);
    expect(r.gruposSemMeta).toBe(2);
  });

  it("lista vazia não quebra e não inventa alvo", () => {
    const r = consolidarTotaisGrupos([]);
    expect(r.naEsteira).toBe(0);
    expect(r.meta).toBeNull();
    expect(r.faltam).toBeNull();
    expect(r.percentual).toBeNull();
  });

  it("meta existente mas zerada não vira divisão por zero no percentual", () => {
    const r = consolidarTotaisGrupos([tg({ meta: 0, naEsteira: 3 })]);
    expect(r.meta).toBe(0);
    expect(r.percentual).toBeNull();
    expect(r.faltam).toBe(-3);
  });
});
