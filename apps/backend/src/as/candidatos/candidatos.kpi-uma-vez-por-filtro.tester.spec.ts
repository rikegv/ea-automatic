import { describe, expect, it } from "vitest";
import { bancoDaCentral, type CandidatoFingido, type CandidaturaFingida } from "./central-candidatos-conserto.tester-fake";

/**
 * ─ O KPI VEM UMA VEZ POR FILTRO, E O TOTAL VEM EM TODA PAGINA (paginacao no servidor, 07/10/2026) ─
 *
 * COBERTURA INDEPENDENTE (§A.38/§A.40): escrita pelo `tester` ANTES do codigo, a partir do REQUISITO
 * do mapa (`docs/MAPA-ALCANCE-PAGINACAO-SERVIDOR-CANDIDATOS-VAGAS.md`, secao 1.3), SEM ler a nova
 * implementacao. O backend a fara passar.
 *
 * ┌─ A REGRA, E POR QUE ELA MUDA O QUE JA EXISTIA ────────────────────────────────────────────────┐
 * │ O KPI (porEtapa/porSituacao) ja e contado sobre a base filtrada inteira (conserto de 06/10).   │
 * │ O QUE ESTA FRENTE ACRESCENTA e o GATE POR OFFSET: a agregacao pesada (dois group-by sobre a     │
 * │ base inteira) so faz sentido quando o filtro MUDA, e filtro novo = `offset === 0`. Paginar      │
 * │ (`offset > 0`) e a MESMA base, entao refazer o group-by a cada "carregar mais" e trabalho        │
 * │ jogado fora sobre dezenas de milhares de linhas. A tela guarda o KPI da primeira pagina do       │
 * │ filtro e o servidor devolve `kpis` UNDEFINED nas paginas seguintes.                             │
 * │                                                                                                 │
 * │ O `total`, ao contrario, vem em TODA pagina: ele e `count(*) over ()`, barato, e a tela precisa  │
 * │ dele para dizer "mostrando 400 de 83 mil" em qualquer ponto da rolagem.                         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ORACULO E ESTRUTURAL: `offset === 0` => `kpis` definido; `offset > 0` => `kpis` undefined; `total`
 * presente nos dois. Hoje o `buscar` calcula `kpis` sem olhar o offset, entao o caso do `offset > 0`
 * FALHA ate o gate existir.
 */

function base(n: number, fn: (i: number) => { cand: CandidatoFingido; c: CandidaturaFingida }) {
  const candidatos: CandidatoFingido[] = [];
  const candidaturas: CandidaturaFingida[] = [];
  for (let i = 0; i < n; i++) {
    const { cand, c } = fn(i);
    candidatos.push(cand);
    candidaturas.push(c);
  }
  return { candidatos, candidaturas };
}

/** 5 pessoas, uma candidatura cada: 3 CAPTACAO / 2 TRIAGEM, todas ATIVO. */
function cinco() {
  const { candidatos, candidaturas } = base(5, (i) => ({
    cand: { id: `p${i}`, nome: `Pessoa ${i}`, origem: "PANDAPE" },
    c: {
      id: `c${i}`,
      candidatoId: `p${i}`,
      vagaId: `v${i % 2}`,
      etapa: i < 3 ? "CAPTACAO" : "TRIAGEM",
      situacao: "ATIVO",
    },
  }));
  return bancoDaCentral({ candidatos, candidaturas });
}

describe("o KPI vem na PRIMEIRA pagina do filtro (offset 0) e o total vem sempre", () => {
  it("com offset 0, `kpis` vem definido e `total` e o numero real da base", async () => {
    const pagina = await cinco().service.buscar({ limite: 2, offset: 0 });

    expect(pagina.total, "o total e o numero REAL, nao o tamanho da pagina").toBe(5);
    expect(pagina.itens).toHaveLength(2);
    expect(
      pagina.kpis,
      "na primeira pagina do filtro o KPI precisa vir: e dele que a tela monta os cards.",
    ).toBeDefined();
    expect(pagina.kpis!.porEtapa).toEqual({ CAPTACAO: 3, TRIAGEM: 2 });
  });
});

describe("o KPI NAO volta a ser calculado nas paginas seguintes (offset > 0)", () => {
  it("com offset > 0, `kpis` e UNDEFINED, mas `total` continua vindo", async () => {
    const pagina = await cinco().service.buscar({ limite: 2, offset: 2 });

    // A pagina trouxe linhas (esta dentro do intervalo), entao o total foi lido de verdade.
    expect(pagina.itens.length).toBeGreaterThan(0);
    expect(pagina.total, "o total vem em TODA pagina: e `count(*) over ()`, barato").toBe(5);

    expect(
      pagina.kpis,
      "paginar e a MESMA base: refazer o group-by sobre dezenas de milhares de linhas a cada 'carregar mais' e trabalho jogado fora. O KPI so vem em offset 0.",
    ).toBeUndefined();
  });

  it("a agregacao pesada NEM VAI AO BANCO quando offset > 0", async () => {
    const banco = cinco();
    await banco.service.buscar({ limite: 2, offset: 2 });

    expect(
      banco.agregacoes,
      "o gate e de desempenho: com offset > 0 nenhuma consulta de group-by pode ser montada.",
    ).toHaveLength(0);
  });

  it("e com offset 0 as duas agregacoes (porEtapa e porSituacao) rodam", async () => {
    const banco = cinco();
    await banco.service.buscar({ limite: 2, offset: 0 });
    expect(banco.agregacoes).toHaveLength(2);
  });
});
