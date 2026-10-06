import { describe, expect, it } from "vitest";
import { avaliarImportacao, mapearColunas } from "./clientes-importacao";

/**
 * TESTE INDEPENDENTE (§A.38): escrito a partir dos REQUISITOS do diretor, não do código.
 *
 * Contrato sob teste (assinatura dada no briefing):
 *   avaliarImportacao(grade, mapa, codigosExistentes: Set<string>)
 *     grade = { cabecalho: string[]; linhas: string[][]; linhaCabecalho: number }
 *     mapa  = { colCodigo, colCnpj, colRazao, colOperacao: number | null }
 *   => { aEntrar, recusadas: {linha, codCliente, motivo}[], jaCadastrados: string[], resumo }
 *
 * MOTIVOS EXATOS exigidos pelo diretor:
 *   "Código vazio", "Código inválido", "Razão social vazia", "CNPJ inválido",
 *   "Código repetido na planilha", "Código já cadastrado".
 *
 * REGRA DE OURO (lote tolerante): uma linha ruim NÃO derruba as boas.
 */

// Mapa fixo das 4 colunas na ordem [código, cnpj, razão, operação].
const MAPA = { colCodigo: 0, colCnpj: 1, colRazao: 2, colOperacao: 3 };

/** Monta a grade a partir de linhas de dados, com o cabeçalho na linha 0. */
function grade(linhas: string[][]) {
  return {
    cabecalho: ["codigo", "cnpj", "razao", "operacao"],
    linhas,
    linhaCabecalho: 0,
  };
}

/** CNPJ válido conhecido (conferido à mão em cnpj.tester.spec.ts). */
const CNPJ_OK = "11.222.333/0001-81";
const CNPJ_RUIM = "11.222.333/0001-82"; // DV2 trocado

function motivos(r: ReturnType<typeof avaliarImportacao>): string[] {
  return r.recusadas.map((x) => x.motivo);
}

describe("avaliarImportacao: motivos exatos de recusa", () => {
  it("código vazio => 'Código vazio'", () => {
    const r = avaliarImportacao(grade([["", CNPJ_OK, "Razao Social Ltda", "OP"]]), MAPA, new Set());
    expect(r.aEntrar).toHaveLength(0);
    expect(motivos(r)).toContain("Código vazio");
  });

  it("código com mais de 40 caracteres => 'Código inválido'", () => {
    const longo = "X".repeat(41);
    const r = avaliarImportacao(grade([[longo, CNPJ_OK, "Razao Social Ltda", "OP"]]), MAPA, new Set());
    expect(r.aEntrar).toHaveLength(0);
    expect(motivos(r)).toContain("Código inválido");
  });

  it("código com exatamente 40 caracteres é ACEITO (limite inclusivo)", () => {
    const limite = "X".repeat(40);
    const r = avaliarImportacao(grade([[limite, CNPJ_OK, "Razao Social Ltda", "OP"]]), MAPA, new Set());
    expect(r.aEntrar).toHaveLength(1);
    expect(r.recusadas).toHaveLength(0);
  });

  it("razão social vazia => 'Razão social vazia'", () => {
    const r = avaliarImportacao(grade([["C1", CNPJ_OK, "", "OP"]]), MAPA, new Set());
    expect(r.aEntrar).toHaveLength(0);
    expect(motivos(r)).toContain("Razão social vazia");
  });

  it("CNPJ com dígito verificador errado => 'CNPJ inválido'", () => {
    const r = avaliarImportacao(grade([["C1", CNPJ_RUIM, "Razao Social Ltda", "OP"]]), MAPA, new Set());
    expect(r.aEntrar).toHaveLength(0);
    expect(motivos(r)).toContain("CNPJ inválido");
  });

  it("CNPJ VAZIO é PERMITIDO: a linha ENTRA, sem recusa de CNPJ", () => {
    const r = avaliarImportacao(grade([["C1", "", "Razao Social Ltda", "OP"]]), MAPA, new Set());
    expect(r.aEntrar).toHaveLength(1);
    expect(motivos(r)).not.toContain("CNPJ inválido");
    expect(r.recusadas).toHaveLength(0);
  });
});

describe("avaliarImportacao: duplicidade dentro da planilha e contra a base", () => {
  it("código repetido na planilha: 1ª entra, 2ª recusa 'Código repetido na planilha'", () => {
    const r = avaliarImportacao(
      grade([
        ["DUP", CNPJ_OK, "Primeira Ltda", "OP"],
        ["DUP", CNPJ_OK, "Segunda Ltda", "OP"],
      ]),
      MAPA,
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(1);
    expect(r.recusadas).toHaveLength(1);
    expect(r.recusadas[0]?.motivo).toBe("Código repetido na planilha");
    expect(r.recusadas[0]?.codCliente).toBe("DUP");
  });

  it("código já existente na base => 'Código já cadastrado' E aparece em jaCadastrados", () => {
    const r = avaliarImportacao(
      grade([["JA", CNPJ_OK, "Ja Existe Ltda", "OP"]]),
      MAPA,
      new Set(["JA"]),
    );
    expect(r.aEntrar).toHaveLength(0);
    expect(motivos(r)).toContain("Código já cadastrado");
    expect(r.jaCadastrados).toContain("JA");
  });
});

describe("avaliarImportacao: lote TOLERANTE e resumo", () => {
  it("mix de boas e ruins: as boas entram, as ruins são recusadas, nenhuma derruba a outra", () => {
    const r = avaliarImportacao(
      grade([
        ["BOA1", CNPJ_OK, "Boa Um Ltda", "OP"], // ok
        ["", CNPJ_OK, "Sem Codigo Ltda", "OP"], // Código vazio
        ["BOA2", "", "Boa Dois Ltda", "OP"], // ok (cnpj vazio permitido)
        ["RUIM", CNPJ_RUIM, "Cnpj Ruim Ltda", "OP"], // CNPJ inválido
        ["BOA3", CNPJ_OK, "", "OP"], // Razão social vazia
      ]),
      MAPA,
      new Set(),
    );
    expect(r.aEntrar).toHaveLength(2); // BOA1, BOA2
    expect(r.recusadas).toHaveLength(3);
    expect(motivos(r).sort()).toEqual(["CNPJ inválido", "Código vazio", "Razão social vazia"].sort());
  });

  it("partição: TODA linha de dado cai em aEntrar OU recusadas, nunca nas duas nem em nenhuma", () => {
    const linhas = [
      ["BOA1", CNPJ_OK, "Boa Um Ltda", "OP"],
      ["", CNPJ_OK, "Sem Codigo Ltda", "OP"],
      ["JA", CNPJ_OK, "Ja Existe Ltda", "OP"],
    ];
    const r = avaliarImportacao(grade(linhas), MAPA, new Set(["JA"]));
    expect(r.aEntrar.length + r.recusadas.length).toBe(linhas.length);
  });

  it("resumo bate: total = aEntrar + recusadas", () => {
    const linhas = [
      ["BOA1", CNPJ_OK, "Boa Um Ltda", "OP"],
      ["RUIM", CNPJ_RUIM, "Cnpj Ruim Ltda", "OP"],
      ["BOA2", "", "Boa Dois Ltda", "OP"],
    ];
    const r = avaliarImportacao(grade(linhas), MAPA, new Set());
    expect(r.resumo).toBeDefined();
    expect(r.resumo.total).toBe(r.aEntrar.length + r.recusadas.length);
    expect(r.resumo.total).toBe(linhas.length);
  });
});

describe("mapearColunas: cabeçalho -> índices das 4 colunas", () => {
  it("reconhece as quatro colunas por nome e devolve os índices", () => {
    const m = mapearColunas(["Código", "CNPJ", "Razão Social", "Nome Operação"]);
    expect(m.colCodigo).toBe(0);
    expect(m.colCnpj).toBe(1);
    expect(m.colRazao).toBe(2);
    expect(m.colOperacao).toBe(3);
  });

  it("operação ausente é opcional: colOperacao fica null, as demais resolvem", () => {
    const m = mapearColunas(["Código", "CNPJ", "Razão Social"]);
    expect(m.colCodigo).toBe(0);
    expect(m.colCnpj).toBe(1);
    expect(m.colRazao).toBe(2);
    expect(m.colOperacao).toBeNull();
  });
});
