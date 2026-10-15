import { describe, expect, it } from "vitest";
import {
  montarFuncionarioSelecao,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * NORMALIZAÇÕES DO PAYLOAD do G.I, provadas pela FRONTEIRA real (`montarFuncionarioSelecao`), que é o
 * único ponto por onde um valor de pessoa chega ao fornecedor. Duas normalizações, decisão do diretor
 * (15/10/2026):
 *
 *  1. TELEFONE: o número significativo BR é DDD(2) + 8 (fixo) ou 9 (celular). Código do país (`55`) e
 *     prefixos a mais são descartados, e `smsNroCel` NUNCA passa de 9 dígitos, porque a coluna do G.I
 *     rejeitava 11 com "Out of range value for column 'SMSNroCel'" e a admissão não entrava.
 *  2. MAIÚSCULA: campos de NOME e de LUGAR sobem em CAIXA ALTA; código, documento, data, e-mail e
 *     número NÃO sobem a caixa; `null` continua `null` (não se inventa texto).
 *
 * §A.6: toda entrada é SINTÉTICA (CPF de faixa reservada 999, nome fora do léxico real, domínio de
 * homologação, telefone que não fecha verificador). §A.11: sem travessão.
 */

const CPF_SINTETICO = "99988877766";

describe("normalizacao de TELEFONE via montarFuncionarioSelecao (smsNroCel nunca passa de 9)", () => {
  it("codigo do pais com 13 digitos (55 + DDD + 9): DDD 2 digitos, numero 9 digitos", () => {
    const f = montarFuncionarioSelecao({ telefone: "5511987654321" });
    expect(f.smsdddCel).toBe("11");
    expect(f.smsNroCel).toBe("987654321");
    expect(f.smsNroCel).toHaveLength(9);
  });

  it("15 digitos (prefixo/lixo a mais): fica com os ULTIMOS 11, numero com no maximo 9", () => {
    const f = montarFuncionarioSelecao({ telefone: "551234567890123" });
    expect(f.smsNroCel).not.toBeNull();
    // Os ultimos 11 digitos de "551234567890123" sao "34567890123": DDD "34" + numero "567890123".
    expect(f.smsdddCel).toBe("34");
    expect(f.smsNroCel).toBe("567890123");
    expect((f.smsNroCel ?? "").length).toBeLessThanOrEqual(9);
  });

  it("celular BR normal de 11 digitos: numero de 9", () => {
    const f = montarFuncionarioSelecao({ telefone: "11987654321" });
    expect(f.smsdddCel).toBe("11");
    expect(f.smsNroCel).toBe("987654321");
    expect(f.smsNroCel).toHaveLength(9);
  });

  it("fixo BR de 10 digitos: numero de 8", () => {
    const f = montarFuncionarioSelecao({ telefone: "1133334444" });
    expect(f.smsdddCel).toBe("11");
    expect(f.smsNroCel).toBe("33334444");
    expect(f.smsNroCel).toHaveLength(8);
  });

  it("zero de operadora e descartado antes da separacao (011... vira DDD 11)", () => {
    const f = montarFuncionarioSelecao({ telefone: "011987654321" });
    expect(f.smsdddCel).toBe("11");
    expect(f.smsNroCel).toBe("987654321");
    expect(f.smsNroCel).toHaveLength(9);
  });

  it("curto (menos de 10 digitos): DDD nulo, numero com o que houver, sem lancar", () => {
    const f = montarFuncionarioSelecao({ telefone: "123" });
    expect(f.smsdddCel).toBeNull();
    expect(f.smsNroCel).toBe("123");
  });

  it("vazio/ausente: DDD e numero nulos, sem lancar", () => {
    expect(() => montarFuncionarioSelecao({ telefone: "" })).not.toThrow();
    const vazio = montarFuncionarioSelecao({ telefone: "" });
    expect(vazio.smsdddCel).toBeNull();
    expect(vazio.smsNroCel).toBeNull();
    const ausente = montarFuncionarioSelecao({});
    expect(ausente.smsdddCel).toBeNull();
    expect(ausente.smsNroCel).toBeNull();
  });
});

describe("normalizacao de MAIUSCULA via montarFuncionarioSelecao (nome e lugar em CAIXA ALTA)", () => {
  /** Tudo minusculo e curto o bastante para nao esbarrar no truncamento: aqui se mede a CAIXA, so ela. */
  const PESSOA: PessoaParaGi = {
    nome: "zarolina trevisanto",
    cpf: CPF_SINTETICO,
    email: "zarolina@homolog.local",
    sexo: "feminino",
    raca: "x",
    uf: "sp",
    nomeMae: "quembe sintetica",
    nomePai: "trevisanto sintetico",
    cidadeNascimento: "recife sintetica",
    rgCidade: "campinas sintetica",
    ctpsCidade: "santos sintetica",
    rgOrgao: "ssp",
    logradouro: "rua das flores",
    complemento: "apto 12 bloco b",
    bairro: "centro sintetico",
    cidade: "sao paulo sint",
  };

  it("nome, filiacao, cidades, orgaoRG, endereco, complemento e bairro sobem em CAIXA ALTA", () => {
    const f = montarFuncionarioSelecao(PESSOA);
    expect(f.nome).toBe("ZAROLINA TREVISANTO");
    expect(f.filiacaoNomeMae).toBe("QUEMBE SINTETICA");
    expect(f.filiacaoNomePai).toBe("TREVISANTO SINTETICO");
    expect(f.cidadeNascimento).toBe("RECIFE SINTETICA");
    expect(f.cidadeRG).toBe("CAMPINAS SINTETICA");
    expect(f.cidadeExpedicao).toBe("SANTOS SINTETICA");
    expect(f.orgaoRG).toBe("SSP");
    expect(f.enderecoResid).toBe("RUA DAS FLORES");
    expect(f.cplEndereco).toBe("APTO 12 BLOCO B");
    expect(f.bairroResid).toBe("CENTRO SINTETICO");
    expect(f.cidadeResid).toBe("SAO PAULO SINT");
  });

  it("e-mail e codigo (sexo/uf/raca) NAO sobem a caixa", () => {
    const f = montarFuncionarioSelecao(PESSOA);
    // E-mail minusculo permanece minusculo: nao e campo de LUGAR.
    expect(f.email).toBe("zarolina@homolog.local");
    // Codigos: sexo vira a letra canonica, uf e raca minusculos NAO sao forcados a maiuscula pela regra
    // de lugar (passam por codigoCurto/mapearSexo, nao por `maiuscula`).
    expect(f.sexo).toBe("F");
    expect(f.ufResid).toBe("sp");
    expect(f.raca).toBe("x");
  });

  it("acento sobe junto (toUpperCase trata ã->Ã, ç->Ç)", () => {
    const f = montarFuncionarioSelecao({ nome: "joão gonçalves", cidade: "brasília" });
    expect(f.nome).toBe("JOÃO GONÇALVES");
    expect(f.cidadeResid).toBe("BRASÍLIA");
  });

  it("null continua null: maiuscula nao inventa texto", () => {
    const f = montarFuncionarioSelecao({});
    expect(f.nome).toBeNull();
    expect(f.filiacaoNomeMae).toBeNull();
    expect(f.filiacaoNomePai).toBeNull();
    expect(f.cidadeNascimento).toBeNull();
    expect(f.cidadeRG).toBeNull();
    expect(f.cidadeExpedicao).toBeNull();
    expect(f.orgaoRG).toBeNull();
    expect(f.enderecoResid).toBeNull();
    expect(f.cplEndereco).toBeNull();
    expect(f.bairroResid).toBeNull();
    expect(f.cidadeResid).toBeNull();
  });
});
