import { describe, expect, it } from "vitest";
import {
  montarFuncionarioSelecao,
  montarPessoaParaGi,
  type DeParaGi,
  type PessoaParaGi,
} from "./portal-dados-gi";

/**
 * PORTAL→GI, PEÇA 3: o mapeamento do payload (`FuncionarioSelecao`) e a junção da pessoa
 * (`montarPessoaParaGi`). Contrato confirmado 25/09/2026: chave `pis` (não `pisNit`), sexo M/F,
 * de/para de cidade/banco (nulo quando não resolve), tipoLogradouro concatenado no enderecoResid.
 * §A.6: só dado de pessoa atravessa; PII de teste é sintética.
 */

const CPF = "39053344705";

describe("montarFuncionarioSelecao: chave do PIS e do sexo", () => {
  it("emite a chave `pis` (nao `pisNit`)", () => {
    const f = montarFuncionarioSelecao({ pis: "12345678901" });
    expect(f.pis).toBe("12345678901");
    expect(f).not.toHaveProperty("pisNit");
  });

  it("PIS opcional: ausente vira null, nao quebra", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF });
    expect(f.pis).toBeNull();
  });

  it("sexo MASCULINO/FEMININO viram M/F; desconhecido vira null", () => {
    expect(montarFuncionarioSelecao({ sexo: "MASCULINO" }).sexo).toBe("M");
    expect(montarFuncionarioSelecao({ sexo: "FEMININO" }).sexo).toBe("F");
    expect(montarFuncionarioSelecao({ sexo: "M" }).sexo).toBe("M");
    expect(montarFuncionarioSelecao({ sexo: "OUTRO" }).sexo).toBeNull();
    expect(montarFuncionarioSelecao({ sexo: null }).sexo).toBeNull();
  });
});

describe("montarFuncionarioSelecao: formatos e telefone", () => {
  it("cpf sai so com digitos", () => {
    expect(montarFuncionarioSelecao({ cpf: "390.533.447-05" }).cpf).toBe(CPF);
  });

  it("telefone unico vira DDD + numero separados", () => {
    const f = montarFuncionarioSelecao({ telefone: "(11) 98888-7777" });
    expect(f.smsdddCel).toBe("11");
    expect(f.smsNroCel).toBe("988887777");
  });

  it("endereco: logradouro vai inteiro em enderecoResid (tipo concatenado por construcao)", () => {
    const f = montarFuncionarioSelecao({ logradouro: "Rua das Flores", numero: "100", uf: "SP" });
    expect(f.enderecoResid).toBe("Rua das Flores");
    expect(f.nroEndereco).toBe(100);
    expect(f.ufResid).toBe("SP");
  });
});

describe("montarFuncionarioSelecao: de/para de codigo (nunca inventa)", () => {
  const dePara: DeParaGi = {
    codigoCidade: (nome, uf) => (nome === "Sao Paulo" && uf === "SP" ? "7107" : null),
  };

  it("sem de/para: nome preenchido, codigo nulo", () => {
    const f = montarFuncionarioSelecao({ cidade: "Sao Paulo", uf: "SP", banco: "NUBANK" });
    expect(f.cidadeResid).toBe("Sao Paulo");
    expect(f.codigoCidadeResid).toBeNull();
  });

  it("com de/para que resolve: preenche o codigo da cidade", () => {
    const f = montarFuncionarioSelecao({ cidade: "Sao Paulo", uf: "SP" }, dePara);
    expect(f.codigoCidadeResid).toBe("7107");
  });

  it("de/para que NAO resolve: codigo fica nulo (nao inventa)", () => {
    const f = montarFuncionarioSelecao({ cidade: "Santos", uf: "SP" }, dePara);
    expect(f.codigoCidadeResid).toBeNull();
  });

  /**
   * O BANCO DA EMPRESA SAIU DO ENVIO (decisão do diretor, 01/10/2026): `codigoBcoFolha` e
   * `codigoBcoPagar` referenciam a conta pagadora da empresa (`TB_Banco`), quem cadastra é a folha.
   * Aqui se trava a AUSÊNCIA, para que ninguém os reintroduza sem decisão: o banco do funcionário
   * continua indo só por `agencia`/`contaCorrente`.
   */
  it("NAO emite codigoBcoFolha nem codigoBcoPagar; agencia e conta continuam", () => {
    const f = montarFuncionarioSelecao({ banco: "NUBANK", agencia: "0001", conta: "12345-6" });
    expect(f).not.toHaveProperty("codigoBcoFolha");
    expect(f).not.toHaveProperty("codigoBcoPagar");
    expect(f.agencia).toBe("0001");
    expect(f.contaCorrente).toBe("12345-6");
  });
});

/**
 * NORMALIZAÇÃO NUMÉRICA, as DUAS réguas opostas (01/10/2026). Campo de CONTAGEM perde o zero à
 * esquerda (o padrão do GI o proíbe e `"0012" === "12"` como inteiro); DOCUMENTO preserva todos os
 * dígitos, porque tirar o zero do CPF apagaria um dígito e produziria outro número.
 */
describe("montarFuncionarioSelecao: zero a esquerda, contagem x documento", () => {
  it("CPF iniciado em zero PRESERVA os 11 digitos", () => {
    expect(montarFuncionarioSelecao({ cpf: "09988877766" }).cpf).toBe("09988877766");
    expect(montarFuncionarioSelecao({ cpf: "099.888.777-66" }).cpf).toBe("09988877766");
  });

  it("PIS iniciado em zero PRESERVA os digitos, e a mascara sai", () => {
    expect(montarFuncionarioSelecao({ pis: "01234567890" }).pis).toBe("01234567890");
    expect(montarFuncionarioSelecao({ pis: "012.34567.89-0" }).pis).toBe("01234567890");
  });

  it("zona e secao do titulo saem sem zero a esquerda", () => {
    const f = montarFuncionarioSelecao({ tituloZona: "007", tituloSecao: "0012" });
    expect(f.titEleZona).toBe("7");
    expect(f.titEleSecao).toBe("12");
  });

  it("zona/secao sem digito nenhum: null (campo anulavel)", () => {
    const f = montarFuncionarioSelecao({ tituloZona: "", tituloSecao: "abc" });
    expect(f.titEleZona).toBeNull();
    expect(f.titEleSecao).toBeNull();
  });

  it("codigo de cidade do de/para sai sem zero a esquerda", () => {
    const f = montarFuncionarioSelecao({ cidade: "Santos", uf: "SP" }, {
      codigoCidade: () => "0712",
    });
    expect(f.codigoCidadeResid).toBe("712");
  });

  it("telefone com o ZERO DE OPERADORA: DDD sai 11, nao 01", () => {
    const f = montarFuncionarioSelecao({ telefone: "011999990000" });
    expect(f.smsdddCel).toBe("11");
    expect(f.smsNroCel).toBe("999990000");
  });
});

describe("montarPessoaParaGi: junta candidatos + admissao_dados_gi, so dado de pessoa", () => {
  it("candidato + dados coletados viram um PessoaParaGi achatado", () => {
    const pessoa = montarPessoaParaGi(
      {
        nome: "Maria Simulada",
        cpf: "11144477735",
        dataNascimento: "1990-03-14",
        sexo: "FEMININO",
        telefone: "11988887777",
        banco: "NUBANK",
        agencia: "0001",
        conta: "12345-6",
      },
      {
        rgNumero: "12.345.678-9",
        rgOrgaoEmissor: "SSP",
        rgUf: "SP",
        pis: "12345678901",
        filiacaoNomeMae: "Maria Das Dores",
        endCep: "01001000",
        endLogradouro: "Praca da Se",
        endCidade: "Sao Paulo",
        endUf: "SP",
      },
    );
    expect(pessoa.nome).toBe("Maria Simulada");
    expect(pessoa.rg).toBe("12.345.678-9");
    expect(pessoa.rgOrgao).toBe("SSP");
    expect(pessoa.pis).toBe("12345678901");
    expect(pessoa.nomeMae).toBe("Maria Das Dores");
    expect(pessoa.cidade).toBe("Sao Paulo");
    expect(pessoa.logradouro).toBe("Praca da Se");
  });

  it("dados_gi ausente (candidato so): nao quebra, campos coletados ficam nulos", () => {
    const pessoa = montarPessoaParaGi({ nome: "So Candidato", cpf: CPF }, null);
    expect(pessoa.nome).toBe("So Candidato");
    expect(pessoa.rg).toBeNull();
    expect(pessoa.cidade).toBeNull();
  });

  it("a junção end-to-end alimenta o montador (Maria: RG/PIS/endereco)", () => {
    const pessoa: PessoaParaGi = montarPessoaParaGi(
      { nome: "Maria Simulada", cpf: "11144477735", sexo: "FEMININO" },
      { rgNumero: "123", pis: "999", endCidade: "Sao Paulo", endUf: "SP" },
    );
    const f = montarFuncionarioSelecao(pessoa);
    expect(f.sexo).toBe("F");
    expect(f.rg).toBe("123");
    expect(f.pis).toBe("999");
    expect(f.cidadeResid).toBe("Sao Paulo");
  });
});

/**
 * Os QUATRO nomes de campo corrigidos contra o contrato real do GI (`openapi/v1.json`, lido em
 * 29/09/2026). Antes disso o envio carregava `ufCTPS`, `numeroResid`, `complementoResid` e
 * `bancoNome`, que NAO existem no contrato: o GI os ignorava em silencio, e foi por isso que numero e
 * complemento do endereco nunca apareceram no registro gravado.
 */
describe("montarFuncionarioSelecao: nomes de campo do contrato real do GI", () => {
  it("usa ufExpedicao, nroEndereco e cplEndereco, e nao emite os nomes antigos", () => {
    const f = montarFuncionarioSelecao({
      ctpsUf: "SP",
      numero: "1000",
      complemento: "CONJ 101",
      banco: "ITAU",
    });
    expect(f.ufExpedicao).toBe("SP");
    expect(f.nroEndereco).toBe(1000);
    expect(f.cplEndereco).toBe("CONJ 101");

    const chaves = Object.keys(f);
    expect(chaves).not.toContain("ufCTPS");
    expect(chaves).not.toContain("numeroResid");
    expect(chaves).not.toContain("complementoResid");
    expect(chaves).not.toContain("bancoNome");
  });

  it("nroEndereco e INTEIRO nao-anulavel: ausente vira 0, nunca null", () => {
    expect(montarFuncionarioSelecao({}).nroEndereco).toBe(0);
    expect(montarFuncionarioSelecao({ numero: "" }).nroEndereco).toBe(0);
    expect(montarFuncionarioSelecao({ numero: "S/N" }).nroEndereco).toBe(0);
  });

  it("nroEndereco fica so com os digitos (o campo do GI e int32, com padrao de digitos)", () => {
    expect(montarFuncionarioSelecao({ numero: "100-A" }).nroEndereco).toBe(100);
    expect(montarFuncionarioSelecao({ numero: " 42 " }).nroEndereco).toBe(42);
  });
});

/**
 * A guarda de tamanho do `cplEndereco` (maximo 30 no contrato do GI). Sem ela, complemento longo
 * derruba o envio INTEIRO com HTTP 400, e a admissao nao entra. Decisao do diretor: cortar.
 */
describe("montarFuncionarioSelecao: guarda de tamanho do cplEndereco", () => {
  it("corta em 30 caracteres", () => {
    const longo = "APARTAMENTO 1204 BLOCO B TORRE NORTE FUNDOS";
    expect(longo.length).toBeGreaterThan(30);
    const f = montarFuncionarioSelecao({ complemento: longo });
    expect(f.cplEndereco).toBe("APARTAMENTO 1204 BLOCO B TORRE");
    expect(f.cplEndereco).toHaveLength(30);
  });

  it("nao mexe no que cabe, e preserva o nulo", () => {
    expect(montarFuncionarioSelecao({ complemento: "CONJ 101" }).cplEndereco).toBe("CONJ 101");
    expect(montarFuncionarioSelecao({ complemento: "x".repeat(30) }).cplEndereco).toHaveLength(30);
    expect(montarFuncionarioSelecao({}).cplEndereco).toBeNull();
  });
});
