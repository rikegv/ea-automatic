import { describe, expect, it } from "vitest";
import { CAMPOS_GI, filtrarCamposGi } from "./dados-gi-campos";

/**
 * A ALLOWLIST FECHADA de `admissao_dados_gi`: só as chaves catalogadas viram coluna, e o valor é
 * validado por tipo. §A.6: nenhum valor é lido para nada além de validar formato.
 */
describe("filtrarCamposGi: allowlist fechada", () => {
  it("chave FORA do catálogo é descartada (não vira coluna nem rótulo)", () => {
    const r = filtrarCamposGi({ rgNumero: "12345", papel: "SUPER_ADMIN", cpf: "52998224725" });
    expect(r.update).toEqual({ rgNumero: "12345" });
    expect(r.rotulos).toEqual(["Número do RG"]);
    // O CPF NÃO tem coluna aqui (mora em `candidatos`), então nem entra.
    expect(Object.keys(r.update)).not.toContain("cpf");
  });

  it("valor não-string é descartado", () => {
    const r = filtrarCamposGi({ rgNumero: 12345 as unknown as string, pis: "12345678901" });
    expect(r.update).toEqual({ pis: "12345678901" });
  });

  it("valor vazio (após trim) é descartado", () => {
    const r = filtrarCamposGi({ rgNumero: "   ", pis: "12345678901" });
    expect(r.update).toEqual({ pis: "12345678901" });
  });

  it("valor longo demais é descartado (trava contra texto vazando pelo campo)", () => {
    const r = filtrarCamposGi({ nomeMae: "x".repeat(300) });
    expect(r.update).toEqual({});
  });

  it("data em formato inválido é descartada; data ISO passa", () => {
    expect(filtrarCamposGi({ rgDataEmissao: "14/03/1990" }).update).toEqual({});
    expect(filtrarCamposGi({ rgDataEmissao: "1990-03-14" }).update).toEqual({
      rgDataEmissao: "1990-03-14",
    });
  });

  it("UF é normalizada para 2 letras maiúsculas; UF inválida é descartada", () => {
    expect(filtrarCamposGi({ rgUf: "sp" }).update).toEqual({ rgUf: "SP" });
    expect(filtrarCamposGi({ rgUf: "S" }).update).toEqual({});
  });

  it("mapeia as chaves da extração para as colunas certas (RG, CTPS, CNH, endereço)", () => {
    const r = filtrarCamposGi({
      nomeMae: "Maria",
      nomePai: "Jose",
      cnhRegistro: "999",
      cep: "01001000",
      numeroEndereco: "10",
    });
    expect(r.update).toEqual({
      filiacaoNomeMae: "Maria",
      filiacaoNomePai: "Jose",
      cnhNumero: "999",
      endCep: "01001000",
      endNumero: "10",
    });
  });

  it("nenhuma coluna do catálogo escreve em `candidatos` (nome, cpf, sexo, banco)", () => {
    const colunas = Object.values(CAMPOS_GI).map((d) => d.coluna);
    for (const proibida of ["nome", "cpf", "sexo", "banco", "agencia", "conta"]) {
      expect(colunas).not.toContain(proibida);
    }
  });

  it("nacionalidade e codigo3: so 3 digitos passam, o resto e DESCARTADO", () => {
    // A regra fecha a porta PÚBLICA do candidato (`POST /portal/dados-gi`): seletor de tela não é
    // allowlist, e sem isto seguia gravável texto arbitrário numa coluna de PII retida. Exigência do
    // `seguranca` (G7, 01/10/2026). Sem este teste a regra sumiria numa refatoração sem o gate falar.
    expect(filtrarCamposGi({ nacionalidade: "010" }).update.nacionalidade).toBe("010");
    expect(filtrarCamposGi({ nacionalidade: "0 1 0" }).update.nacionalidade).toBe("010");
    for (const invalido of ["Brasileira", "01", "0100", "", "BRA", "abc"]) {
      expect(filtrarCamposGi({ nacionalidade: invalido }).update.nacionalidade).toBeUndefined();
    }
  });
});

describe("as TRES chaves de CIDADE (0141): a allowlist e o unico gate por NOME", () => {
  /**
   * ⚠️ SEM ESTAS TRÊS CHAVES AQUI, O VALOR MORRE EM SILÊNCIO. O caminho foi conferido ponta a ponta: o
   * schema do Gemini monta o enum dinamicamente, o Pydantic de saída é genérico, o leitor do backend
   * repassa a lista inteira e o frontend renderiza por rótulo. **O único lugar que filtra por nome de
   * chave é o `CAMPOS_GI`.** É o modo de falha exato do `ctpsDataExpedicao`: o candidato vê o campo,
   * confirma, e o `POST /portal/dados-gi` descarta sem ninguém ver.
   *
   * Os nomes são os que a extração emite, **exatamente**: `cidadeNascimento`, `cidadeRg`, `cidadeCtps`.
   */
  it("as tres chaves da extracao atravessam para a COLUNA certa, sem troca", () => {
    const r = filtrarCamposGi({
      cidadeNascimento: "Recife",
      cidadeRg: "Campinas",
      cidadeCtps: "Santos",
    });
    expect(r.update).toEqual({
      cidadeNascimento: "Recife",
      rgCidade: "Campinas",
      ctpsCidade: "Santos",
    });
  });

  it("cidade e TEXTO, nao UF: nome de municipio inteiro atravessa (nao e cortado em 2)", () => {
    // Se o tipo fosse `uf`, "Recife" viraria "RE". A `naturalidade` é que é a sigla; a cidade é texto.
    expect(filtrarCamposGi({ cidadeNascimento: "Vila Bela da Santissima Trindade" }).update)
      .toEqual({ cidadeNascimento: "Vila Bela da Santissima Trindade" });
    expect(CAMPOS_GI.cidadeNascimento.tipo).toBe("texto");
    expect(CAMPOS_GI.cidadeRg.tipo).toBe("texto");
    expect(CAMPOS_GI.cidadeCtps.tipo).toBe("texto");
    // E a `naturalidade` NÃO foi alargada: ela continua sendo a UF, com as duas coisas convivendo.
    expect(CAMPOS_GI.naturalidade.tipo).toBe("uf");
  });

  it("os ROTULOS da trilha distinguem as tres (§A.6: rotulo, nunca valor)", () => {
    const r = filtrarCamposGi({ cidadeNascimento: "Recife", cidadeRg: "X", cidadeCtps: "Y" });
    expect(new Set(r.rotulos).size).toBe(3);
    expect(r.rotulos).toContain("Cidade de nascimento");
  });
});
