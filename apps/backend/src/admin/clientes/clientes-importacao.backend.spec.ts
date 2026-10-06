import { describe, expect, it } from "vitest";
import {
  avaliarImportacao,
  mapearColunas,
  type GradeParaImportacao,
  type MapaColunasCliente,
} from "./clientes-importacao";

/**
 * ─ TESTE DE AUTOR da importação em massa de clientes (domínio puro) ──────────────────────────────
 *
 * Cobre `mapearColunas` (variações de rótulo, com e sem acento/caixa) e `avaliarImportacao` (os seis
 * motivos de recusa, na ordem da régua, mais a tolerância e o colapso de duplicata). NÃO cobre o
 * CNPJ em si (o tester escreve `cnpj.tester.spec.ts`) nem o RBAC (tester). Aqui o foco é a régua por
 * linha, que é o coração da frente.
 *
 * CNPJs usados: 11.222.333/0001-81 e 45.448.325/0001-92 são válidos (DV conferido); os com DV errado
 * estão marcados no teste.
 */

const CNPJ_VALIDO_1 = "11.222.333/0001-81";
const CNPJ_VALIDO_2 = "45448325000170";

const MAPA_PADRAO: MapaColunasCliente = {
  colCodigo: 0,
  colCnpj: 1,
  colRazao: 2,
  colOperacao: 3,
};

function grade(linhas: string[][]): GradeParaImportacao {
  return { cabecalho: ["codigo", "cnpj", "razao social", "nome operacao"], linhas };
}

describe("mapearColunas", () => {
  it("casa os quatro rótulos canônicos", () => {
    const mapa = mapearColunas(["Código do Cliente", "CNPJ", "Razão Social", "Nome da Operação"]);
    expect(mapa).toEqual({ colCodigo: 0, colCnpj: 1, colRazao: 2, colOperacao: 3 });
  });

  it("casa variações sem acento, em caixa diferente e com outra ordem", () => {
    const mapa = mapearColunas(["RAZAO", "cod cliente", "nome operacao", "cnpj"]);
    expect(mapa).toEqual({ colCodigo: 1, colCnpj: 3, colRazao: 0, colOperacao: 2 });
  });

  it("deixa null a coluna que não existe (opcionais ausentes)", () => {
    const mapa = mapearColunas(["Codigo", "Razao Social"]);
    expect(mapa.colCodigo).toBe(0);
    expect(mapa.colRazao).toBe(1);
    expect(mapa.colCnpj).toBeNull();
    expect(mapa.colOperacao).toBeNull();
  });

  it("casa codigo e razao por variações alternativas", () => {
    expect(mapearColunas(["codigo cliente"]).colCodigo).toBe(0);
    expect(mapearColunas(["razaosocial"]).colRazao).toBe(0);
    expect(mapearColunas(["operacao"]).colOperacao).toBe(0);
    expect(mapearColunas(["nome de operacao"]).colOperacao).toBe(0);
  });
});

describe("avaliarImportacao: régua por linha", () => {
  it("aceita linha completa e também linha com CNPJ e operação vazios (colunas opcionais)", () => {
    const r = avaliarImportacao(
      grade([
        ["C1", CNPJ_VALIDO_1, "Alfa Ltda", "Operação Alfa"],
        ["C2", "", "Beta Ltda", ""],
      ]),
      MAPA_PADRAO,
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(2);
    expect(r.recusadas).toHaveLength(0);
    expect(r.aEntrar[0]).toEqual({
      linha: 2,
      codCliente: "C1",
      cnpj: CNPJ_VALIDO_1,
      razaoSocial: "Alfa Ltda",
      nomeOperacao: "Operação Alfa",
    });
    // CNPJ e operação vazios viram null, não "".
    expect(r.aEntrar[1].cnpj).toBeNull();
    expect(r.aEntrar[1].nomeOperacao).toBeNull();
  });

  it("recusa código vazio", () => {
    const r = avaliarImportacao(grade([["   ", "", "Alfa Ltda", ""]]), MAPA_PADRAO, new Set());
    expect(r.aEntrar).toHaveLength(0);
    expect(r.recusadas[0]).toEqual({ linha: 2, codCliente: null, motivo: "Código vazio" });
  });

  it("recusa código acima de 40 caracteres", () => {
    const longo = "X".repeat(41);
    const r = avaliarImportacao(grade([[longo, "", "Alfa Ltda", ""]]), MAPA_PADRAO, new Set());
    expect(r.recusadas[0]).toEqual({ linha: 2, codCliente: longo, motivo: "Código inválido" });
  });

  it("recusa razão social vazia", () => {
    const r = avaliarImportacao(grade([["C1", "", "   ", ""]]), MAPA_PADRAO, new Set());
    expect(r.recusadas[0]).toEqual({ linha: 2, codCliente: "C1", motivo: "Razão social vazia" });
  });

  it("recusa CNPJ com dígito inválido, mas aceita CNPJ vazio", () => {
    const r = avaliarImportacao(
      grade([
        ["C1", "11.222.333/0001-00", "Alfa Ltda", ""],
        ["C2", "", "Beta Ltda", ""],
      ]),
      MAPA_PADRAO,
      new Set(),
    );
    expect(r.recusadas).toEqual([{ linha: 2, codCliente: "C1", motivo: "CNPJ inválido" }]);
    expect(r.aEntrar.map((l) => l.codCliente)).toEqual(["C2"]);
  });

  it("recusa a 2ª ocorrência de um código repetido dentro da planilha (colapso)", () => {
    const r = avaliarImportacao(
      grade([
        ["C1", CNPJ_VALIDO_1, "Alfa Ltda", ""],
        ["C1", CNPJ_VALIDO_2, "Alfa Duplicada", ""],
      ]),
      MAPA_PADRAO,
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(1);
    expect(r.aEntrar[0].razaoSocial).toBe("Alfa Ltda");
    expect(r.recusadas).toEqual([
      { linha: 3, codCliente: "C1", motivo: "Código repetido na planilha" },
    ]);
  });

  it("recusa código já cadastrado e o lista em jaCadastrados", () => {
    const r = avaliarImportacao(
      grade([
        ["C1", "", "Alfa Ltda", ""],
        ["C2", "", "Beta Ltda", ""],
      ]),
      MAPA_PADRAO,
      new Set(["C1"]),
    );
    expect(r.aEntrar.map((l) => l.codCliente)).toEqual(["C2"]);
    expect(r.recusadas).toEqual([{ linha: 2, codCliente: "C1", motivo: "Código já cadastrado" }]);
    expect(r.jaCadastrados).toEqual(["C1"]);
  });

  it("aplica as regras NA ORDEM: código vazio antes de razão, razão antes de CNPJ", () => {
    // Linha sem código E sem razão: o motivo é o PRIMEIRO da ordem (Código vazio).
    const semCodigo = avaliarImportacao(grade([["", "", "", ""]]), MAPA_PADRAO, new Set());
    expect(semCodigo.recusadas[0].motivo).toBe("Código vazio");
    // Linha com código, sem razão E com CNPJ inválido: a razão (regra anterior) ganha do CNPJ.
    const semRazao = avaliarImportacao(
      grade([["C1", "11.222.333/0001-00", "", ""]]),
      MAPA_PADRAO,
      new Set(),
    );
    expect(semRazao.recusadas[0].motivo).toBe("Razão social vazia");
  });

  it("é tolerante: processa a planilha inteira, misturando aceitas e recusadas, e fecha o resumo", () => {
    const r = avaliarImportacao(
      grade([
        ["C1", CNPJ_VALIDO_1, "Alfa Ltda", "Op A"],
        ["", "", "Sem Codigo", ""],
        ["C2", "", "Beta Ltda", ""],
        ["C1", "", "Repetido", ""],
        ["C9", "00.000.000/0000-00", "Cnpj Ruim", ""],
      ]),
      MAPA_PADRAO,
      new Set(),
    );
    expect(r.resumo).toEqual({ total: 5, aEntrar: 2, recusadas: 3 });
    expect(r.aEntrar.map((l) => l.codCliente)).toEqual(["C1", "C2"]);
    expect(r.recusadas.map((x) => x.motivo)).toEqual([
      "Código vazio",
      "Código repetido na planilha",
      "CNPJ inválido",
    ]);
  });

  it("respeita o numeroDaLinha informado (cabeçalho fora da linha 1)", () => {
    const r = avaliarImportacao(
      grade([["", "", "", ""]]),
      MAPA_PADRAO,
      new Set(),
      (i) => i + 5,
    );
    expect(r.recusadas[0].linha).toBe(5);
  });

  it("colunas opcionais null na grade não quebram a avaliação", () => {
    const r = avaliarImportacao(
      { cabecalho: ["codigo", "razao social"], linhas: [["C1", "Alfa Ltda"]] },
      { colCodigo: 0, colCnpj: null, colRazao: 1, colOperacao: null },
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(1);
    expect(r.aEntrar[0].cnpj).toBeNull();
    expect(r.aEntrar[0].nomeOperacao).toBeNull();
  });
});
