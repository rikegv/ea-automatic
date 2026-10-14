import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { AltoVolumeAnaliseService } from "./alto-volume-analise.service";

/**
 * COBERTURA INDEPENDENTE (§A.38) — A DASH DE PROJETO NÃO DEPENDE DA SEÇÃO "GRUPOS DE ENTRADA".
 *
 * Escrita a partir do REQUISITO: a remoção do quadro "Grupos De Entrada" (a leva/turma por data,
 * `projeto_grupo_entrada`) NÃO pode alterar os totais do projeto. Os baldes (`totais`), o quadro por
 * cargo (`porCargo`), o quadro por loja (`porLoja`) e a matriz cargo x loja (`matriz`) têm de ser
 * IDÊNTICOS com ou sem turma.
 *
 * A PROVA É DIFERENCIAL: roda a análise com um conjunto de turmas e depois com NENHUMA, mantendo tudo
 * o mais igual, e exige que as quatro saídas de projeto sejam byte a byte iguais. Se o cálculo do
 * projeto lesse a seção de turma por tabela, variar só a turma mudaria algum total, e este teste
 * quebraria apontando exatamente qual.
 *
 * Nota de manutenção: o fake espelha a ORDEM atual das leituras do serviço (projeto, vagas, status,
 * declínios, grupos, loja, lojaDeclinios, lojaMeta, matriz, matrizDeclinios). Quando a seção de turma
 * for de fato removida do serviço, a leitura de `grupos` sai do meio e este fake precisa acompanhar;
 * o que o teste AFIRMA — projeto independe da turma — continua valendo.
 */

const PROJETO = "22222222-2222-4222-8222-222222222222";
const HOJE = new Date("2026-09-05T12:00:00Z");

type Row = Record<string, unknown>;

const PROJETO_OK: Row = {
  id: PROJETO,
  nome: "BIENAL DOS LIVROS",
  codCliente: "57269",
  clienteRazaoSocial: "EDITORA SCHWARCZ S.A.",
  clienteNomeOperacao: "CIA DAS LETRAS",
  dataInicio: "2026-09-01",
  dataFim: "2026-09-13",
  ativo: true,
};

interface Cenario {
  grupos?: Row[];
}

/** A base do projeto, igual nos dois lados da prova diferencial. Só `grupos` (turma) varia. */
function baseFila(cen: Cenario): unknown[][] {
  return [
    [PROJETO_OK],
    // vagas por cargo
    [
      { cargoId: "c1", cargoNome: "Vendedor I", vagas: 66 },
      { cargoId: "c2", cargoNome: "Caixa", vagas: 15 },
    ],
    // status dos vinculados
    [
      { cargoId: "c1", cargoNome: "Vendedor I", vinculadas: 50, concluidas: 40, cadastradas: 45, emAndamento: 7, pausadas: 2, emBanco: 3 },
      { cargoId: "c2", cargoNome: "Caixa", vinculadas: 15, concluidas: 15, cadastradas: 15, emAndamento: 0, pausadas: 0, emBanco: 0 },
    ],
    // declínios do cliente no período
    [{ cargoId: "c1", cargoNome: "Vendedor I", declinios: 7 }],
    // grupos (turma por data) — a ÚNICA coisa que varia entre os dois cenários
    cen.grupos ?? [],
    // loja
    [
      { loja: "LOJA CENTRO", total: 40, vagas: 30, concluidas: 25, emAndamento: 5, pausadas: 0, emBanco: 2 },
      { loja: "LOJA SUL", total: 20, vagas: 15, concluidas: 10, emAndamento: 2, pausadas: 0, emBanco: 1 },
    ],
    // lojaDeclinios
    [{ loja: "LOJA CENTRO", declinios: 3 }],
    // lojaMeta
    [{ loja: "LOJA CENTRO", meta: 30 }],
    // matriz
    [
      { cargoId: "c1", cargoNome: "Vendedor I", loja: "LOJA CENTRO", total: 30, vagas: 25, concluidas: 20, emAndamento: 3, pausadas: 0, emBanco: 0 },
      { cargoId: "c2", cargoNome: "Caixa", loja: "LOJA SUL", total: 15, vagas: 12, concluidas: 10, emAndamento: 1, pausadas: 0, emBanco: 0 },
    ],
    // matrizDeclinios
    [{ cargoId: "c1", cargoNome: "Vendedor I", loja: "LOJA CENTRO", declinios: 2 }],
  ];
}

function montar(cen: Cenario) {
  const fila = baseFila(cen);
  let i = 0;
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy"]) {
    chain[m] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve(fila[Math.min(i++, fila.length - 1)]);
  const db = { select: vi.fn(() => chain) };
  return new AltoVolumeAnaliseService(db as never);
}

describe("dash de projeto: os totais independem da seção de turma", () => {
  const TURMAS: Row[] = [
    { id: "g1", rotulo: "Grupo 1", dataEntrada: "2026-09-01", vagas: 10, vinculadas: 10, concluidas: 6, entrou: true },
    { id: "g2", rotulo: "Grupo 2", dataEntrada: "2026-09-20", vagas: 5, vinculadas: 4, concluidas: 0, entrou: false },
  ];

  it("totais, porCargo, porLoja e matriz são IDÊNTICOS com e sem turma", async () => {
    const comTurma = await montar({ grupos: TURMAS }).analise(PROJETO, HOJE);
    const semTurma = await montar({ grupos: [] }).analise(PROJETO, HOJE);

    expect(semTurma.totais).toEqual(comTurma.totais);
    expect(semTurma.porCargo).toEqual(comTurma.porCargo);
    expect(semTurma.porLoja).toEqual(comTurma.porLoja);
    expect(semTurma.matriz).toEqual(comTurma.matriz);
  });

  it("a ÚNICA diferença entre os dois é a própria lista de turmas", async () => {
    const comTurma = await montar({ grupos: TURMAS }).analise(PROJETO, HOJE);
    const semTurma = await montar({ grupos: [] }).analise(PROJETO, HOJE);

    // Com turma a seção existe; sem turma ela é vazia. É o único efeito de mexer na turma.
    expect(comTurma.grupos.length).toBeGreaterThan(0);
    expect(semTurma.grupos).toEqual([]);
  });

  it("o termômetro (prazo) também não depende da turma", async () => {
    const comTurma = await montar({ grupos: TURMAS }).analise(PROJETO, HOJE);
    const semTurma = await montar({ grupos: [] }).analise(PROJETO, HOJE);
    expect(semTurma.termometro).toEqual(comTurma.termometro);
  });
});
