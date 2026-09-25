import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { detectarSeparador, lerPlanilha, lerTexto, MAX_LINHAS_PLANILHA } from "./leitor";
import { CandidatosImportService } from "../as/candidatos/candidatos-import.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * REPRODUÇÃO DOS DEFEITOS ACHADOS PELA COBERTURA INDEPENDENTE DO LEITOR.
 *
 * ESTE ARQUIVO NASCE VERMELHO DE PROPÓSITO e NÃO deve ser commitado como está: ele é a prova dos
 * defeitos, para o autor colar de volta no repositório DEPOIS do conserto (aí ele fica verde e trava a
 * regressão). Cada `it` descreve o comportamento CERTO, não o atual.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

describe("D1: título de ERP COM VÍRGULA antes de um cabeçalho com ponto e vírgula", () => {
  it("o separador é o do CABEÇALHO, e não o da primeira linha que tem qualquer separador", () => {
    // A linha 1 é o título do relatório, com UMA vírgula. O cabeçalho embaixo tem DOIS pontos e vírgula.
    const conteudo = "Dados: Candidatos, 01/09/2026\nNome;Email;Cidade\nFulano;f@e.com;São Paulo\n";
    expect(detectarSeparador(conteudo)).toBe(";");

    const g = lerTexto(conteudo);
    expect(g.linhaCabecalho).toBe(2);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade"]);
    expect(g.linhas).toEqual([["Fulano", "f@e.com", "São Paulo"]]);
  });
});

describe("D2: título de DUAS células antes de um cabeçalho de TRÊS colunas", () => {
  it("o título não pode ser promovido a cabeçalho", () => {
    const g = lerTexto("Emitido em:;01/09/2026\nNome;Email;Cidade\nFulano;f@e.com;São Paulo\n");
    expect(g.linhaCabecalho).toBe(2);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade"]);
    expect(g.linhas).toEqual([["Fulano", "f@e.com", "São Paulo"]]);
  });
});

describe("D3: CSV de UMA coluna cujos valores têm vírgula", () => {
  it("uma coluna só continua sendo uma coluna, e ninguém se perde", () => {
    const g = lerTexto("NOME\nSILVA, JOSE DA\nSOUZA, MARIA\n");
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["NOME"]);
    expect(g.linhas).toEqual([["SILVA, JOSE DA"], ["SOUZA, MARIA"]]);
  });
});

describe("D4: UTF-8 legítimo com UM byte solto não pode virar mojibake inteiro", () => {
  it("os acentos UTF-8 sobrevivem a um 0x92 perdido no meio do arquivo", async () => {
    const buf = Buffer.concat([
      Buffer.from("Nome;Cidade\nJosé Antônio;São Paulo\nMari", "utf8"),
      Buffer.from([0x92]),
      Buffer.from("a;Santo André\n", "utf8"),
    ]);
    const g = await lerPlanilha(buf);
    expect(g.linhas[0]).toEqual(["José Antônio", "São Paulo"]);
    expect(JSON.stringify(g)).not.toContain("Ã");
  });
});

describe("D5: ODS (zip que o exceljs carrega com ZERO abas) cai no SheetJS", () => {
  it("lê o ODS, ou pelo menos não diz que a planilha está VAZIA quando ela tem dados", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Nome", "Email"], ["Fulano", "f@e.com"]]),
      "Plan1",
    );
    const buf = XLSX.write(wb, { bookType: "ods", type: "buffer" }) as Buffer;

    const g = await lerPlanilha(buf);
    expect(g.cabecalho).toEqual(["Nome", "Email"]);
    expect(g.linhas).toEqual([["Fulano", "f@e.com"]]);
  });
});

describe("D6: teto na importação de CANDIDATOS não pode ser perda silenciosa", () => {
  function montar() {
    const criar = vi.fn(async (dto: Record<string, unknown>) => ({ id: "x", nome: dto.nome }) as never);
    const service = new CandidatosImportService(
      { query: { vagas: { findFirst: async () => ({ id: "v", status: "ABERTA" }) } } } as never,
      { mapearColunasCandidato: vi.fn(async () => null) } as never,
      { criar, adicionarEmLote: vi.fn() } as never,
      { regua: async () => ({ recebeCandidato: () => true }) } as never,
    );
    return { service, criar };
  }

  function csvGigante(excedente: number): Buffer {
    const linhas = ["Nome", ...Array.from({ length: MAX_LINHAS_PLANILHA + excedente }, (_, i) => `Pessoa ${i}`)];
    return Buffer.from(linhas.join("\n"), "utf8");
  }

  it("a prévia DIZ que passou do teto (hoje ela mostra 2000 e cala as excedentes)", async () => {
    const { service } = montar();
    // O cast para `Record<string, unknown>` do repro original saiu porque o contrato passou a TER o
    // campo: agora o teste lê a propriedade tipada, o que é uma prova mais forte, não mais fraca.
    const previa = await service.previa(csvGigante(7));
    // Ou o total reflete o arquivo, ou existe um campo dizendo quantas ficaram de fora, como em Lojas.
    expect(previa.descartadasPorTeto ?? 0).toBe(7);
  });

  it("o aplicar RECUSA a planilha acima do teto, em vez de importar 2000 e descartar o resto calado", async () => {
    const { service, criar } = montar();
    await expect(
      service.aplicar(
        {
          arquivo: csvGigante(7),
          cenario: "SEM_VAGA",
          mapa: { nome: 0, cpf: null, email: null, telefone: null, nascimento: null, cidade: null, uf: null },
        },
        USER,
      ),
    ).rejects.toThrow(new RegExp(String(MAX_LINHAS_PLANILHA)));
    expect(criar).not.toHaveBeenCalled();
  });
});
