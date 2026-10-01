import { describe, expect, it } from "vitest";
import {
  CONTRATACAO_GI_VAZIA,
  mapearVinculoGi,
  montarContratacaoGi,
  montarFuncionarioSelecao,
  montarPessoaParaGi,
  prazoContratoGi,
  recusaDaContratacaoGi,
  resolverEmpresaFilialGi,
  type ContratacaoGi,
  type DeParaGi,
  type PessoaParaGi,
  type VinculoEmpresaFilial,
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


// ════════════════════════════════════════════════════════════════════════════════════════════════
// OS SEIS CAMPOS DE CONTRATAÇÃO (allowlist 2, autorizada pelo diretor em 01/10/2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Empresa 1 / filial 4 é o par REAL mais comum da base (165 clientes) e existe no fornecedor. Salário
 * sintético e redondo de propósito: nenhuma remuneração real entra em teste, e nenhum teste imprime
 * valor de salário (§A.6).
 */
const VINCULOS: VinculoEmpresaFilial[] = [
  { tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true },
  { tipoServico: "FOPAG", empresaCodigo: "2", filial: "4", ativo: true },
];

describe("vinculo: o de/para REUSA tipoServicoDeContrato, nao tem tabela propria de grafias", () => {
  it("os seis tipos de servico viram os codigos autorizados pelo diretor", () => {
    expect(mapearVinculoGi("Temporário")).toBe("4");
    expect(mapearVinculoGi("Terceirizado")).toBe("1");
    expect(mapearVinculoGi("Interno")).toBe("1");
    expect(mapearVinculoGi("Fopag")).toBe("1");
    expect(mapearVinculoGi("Estágio")).toBe("J");
    expect(mapearVinculoGi("Jovem Aprendiz")).toBe("H");
  });

  it("as grafias de CARGA casam porque a tabela reusada ja as conhece (nao foram recopiadas aqui)", () => {
    expect(mapearVinculoGi("TEMP.")).toBe("4");
    expect(mapearVinculoGi("TERC.")).toBe("1");
    expect(mapearVinculoGi("APREN.")).toBe("H");
    expect(mapearVinculoGi("FOPAG")).toBe("1");
  });

  it("`ESTA. FOPAG` sai NULO: ambiguo, e o que um casamento aproximado erraria calado", () => {
    // 5 admissões na produção. `includes("FOPAG")` devolveria `1` (CLT) para quem talvez seja estagiário.
    expect(mapearVinculoGi("ESTA. FOPAG")).toBeNull();
  });

  it("vazio, nulo e desconhecido saem NULOS, nunca adivinhados", () => {
    for (const v of ["", "   ", null, undefined, "PJ", "Cooperado", "CLT"]) {
      expect(mapearVinculoGi(v as string | null | undefined), `entrada ${JSON.stringify(v)}`).toBeNull();
    }
  });

  it("espaco INTERNO em excesso e colapsado AQUI, sem alargar o norm() compartilhado", () => {
    expect(mapearVinculoGi("Jovem   Aprendiz")).toBe("H");
  });
});

describe("prazo do contrato no GI (`D`/`I`): DERIVADO do vinculo, nunca contraditorio", () => {
  it("o invariante: `1` obriga `I` e `7` obriga `D`", () => {
    expect(prazoContratoGi("1")).toBe("I");
    expect(prazoContratoGi("7")).toBe("D");
  });

  it("nunca emite o PRAZO CONTRARIO ao vinculo, em nenhum dos 18 codigos do contrato", () => {
    // É esta a contradição que o campo `tipoContrato` (default `I` no GI) criaria se fosse coletado em
    // separado em vez de derivado: vinculo 7 com prazo indeterminado ao lado, e nada falhando.
    const CODIGOS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
    for (const v of CODIGOS) {
      const prazo = prazoContratoGi(v);
      if (v === "1") expect(prazo).not.toBe("D");
      if (v === "7") expect(prazo).not.toBe("I");
      expect(prazo === null || prazo === "D" || prazo === "I", `vinculo ${v}`).toBe(true);
    }
  });

  it("4, J e H saem com prazo NULO: regra de folha pendente, e o GI aplica o default dele", () => {
    // Nulo preserva EXATAMENTE o comportamento de hoje (o EA nunca emitiu este campo). A fábrica não
    // inventa regra de folha: isso é pergunta ao diretor.
    expect(prazoContratoGi("4")).toBeNull();
    expect(prazoContratoGi("J")).toBeNull();
    expect(prazoContratoGi("H")).toBeNull();
  });

  it("o acoplamento vale no payload montado, nao so na funcao", () => {
    const c = montarContratacaoGi({ tipoContrato: "Terceirizado", vinculos: VINCULOS, salario: "1800.00" });
    expect(c.vinculo).toBe("1");
    expect(c.tipoContrato).toBe("I");
  });
});

describe("empresa+filial: vem de cliente_vinculos por (cliente + tipo), e `0` nao e resolucao", () => {
  it("resolve pelo tipo de servico do contrato da admissao", () => {
    expect(resolverEmpresaFilialGi(VINCULOS, "Temporário")).toEqual({ empresa: 1, filial: 4 });
    expect(resolverEmpresaFilialGi(VINCULOS, "Fopag")).toEqual({ empresa: 2, filial: 4 });
  });

  it("NAO aplica o atalho do `< 2` vinculos: UM vinculo so tambem resolve", () => {
    // `vinculoDaAdmissao` devolveria null aqui de propósito (regra de ouro da tela). Reusar aquele
    // caminho zeraria ~90% das resoluções, porque 233 de 234 clientes têm um vínculo só.
    const umSo = [VINCULOS[0]];
    expect(resolverEmpresaFilialGi(umSo, "Temporário")).toEqual({ empresa: 1, filial: 4 });
  });

  it("tipo que nao casa com vinculo nenhum: NULO, nunca o primeiro da lista", () => {
    expect(resolverEmpresaFilialGi(VINCULOS, "Estágio")).toBeNull();
  });

  it("vinculo INATIVO nao resolve", () => {
    const inativo = [{ ...VINCULOS[0], ativo: false }];
    expect(resolverEmpresaFilialGi(inativo, "Temporário")).toBeNull();
  });

  it("tipo de contrato vazio ou irreconhecivel: NULO", () => {
    expect(resolverEmpresaFilialGi(VINCULOS, "")).toBeNull();
    expect(resolverEmpresaFilialGi(VINCULOS, "ESTA. FOPAG")).toBeNull();
    expect(resolverEmpresaFilialGi([], "Temporário")).toBeNull();
    expect(resolverEmpresaFilialGi(null, "Temporário")).toBeNull();
  });

  it("empresa/filial com valor INVALIDO para int16 NAO resolve (varchar livre indo para short)", () => {
    const casos: Array<[string | null, string | null]> = [
      ["MATRIZ", "4"], // texto
      ["1", ""], // filial vazia
      ["1", null], // filial ausente (1 vinculo da base nao tem)
      ["04", "4"], // zero a esquerda viola o pattern do GI
      ["1.5", "4"], // decimal
      ["99999", "4"], // estoura o int16
      ["-1", "4"], // sinal
    ];
    for (const [empresa, filial] of casos) {
      const v = [{ tipoServico: "TEMPORARIO", empresaCodigo: empresa, filial, ativo: true }];
      expect(resolverEmpresaFilialGi(v, "Temporário"), `${empresa}/${filial}`).toBeNull();
    }
  });

  it("empresa `0` NAO resolve: empresa 0 nao existe em nenhum dos 127 pares do GI", () => {
    const zerados = [{ tipoServico: "TEMPORARIO", empresaCodigo: "0", filial: "0", ativo: true }];
    expect(resolverEmpresaFilialGi(zerados, "Temporário")).toBeNull();
  });

  it("filial `0` RESOLVE: e estabelecimento real, existe para todas as 47 empresas do GI", () => {
    // Medido em 01/10/2026 contra `Empresa/GetAll`. O EA tem 2 vinculos assim (`43/0` e `44/0`), e os
    // dois casam com pares reais: recusa-los seria falso negativo em admissao legitima.
    const comZero = [{ tipoServico: "TEMPORARIO", empresaCodigo: "43", filial: "0", ativo: true }];
    expect(resolverEmpresaFilialGi(comZero, "Temporário")).toEqual({ empresa: 43, filial: 0 });
  });
});

describe("salario: ausente, zero e negativo nao passam (o default do campo no GI e 0)", () => {
  function comSalario(salario: string | number | null | undefined): ContratacaoGi {
    return montarContratacaoGi({ salario, tipoContrato: "Temporário", vinculos: VINCULOS });
  }

  it("numeric do Drizzle (string) vira NUMERO", () => {
    expect(comSalario("1800.00").salario).toBe(1800);
    expect(comSalario("2500.55").salario).toBe(2500.55);
    expect(comSalario(1800).salario).toBe(1800);
  });

  it("ausente, vazio, zero, negativo e texto viram NULO, que o chamador trata como RECUSA", () => {
    for (const v of [null, undefined, "", "   ", "0", "0.00", 0, "-100.00", -1, "mil reais"]) {
      expect(comSalario(v as string | number | null).salario, `entrada ${JSON.stringify(v)}`).toBeNull();
    }
  });
});

describe("recusaDaContratacaoGi: as duas guardas duras, e a ordem delas", () => {
  const OK: ContratacaoGi = {
    salario: 2000,
    dataAdmissao: "2026-11-03",
    vinculo: "4",
    tipoContrato: null,
    codigoEmpresa: 1,
    codigoFilial: 4,
  };
  const payload = (c: ContratacaoGi) => montarFuncionarioSelecao({ cpf: CPF }, undefined, c);

  /**
   * A lista autoritativa SINTÉTICA, com os pares que a produção tem de verdade, inclusive **`1|0`**:
   * filial 0 é estabelecimento REAL no GI (existe para todas as 47 empresas) e dois vínculos do EA a usam.
   */
  const PARES_CONHECIDOS = new Set(["1|4", "2|4", "1|2", "1|5", "1|0", "44|0", "43|0"]);
  const parConhecido = (e: number, f: number) => PARES_CONHECIDOS.has(`${e}|${f}`);
  const recusa = (c: ContratacaoGi) => recusaDaContratacaoGi(payload(c), parConhecido);

  it("contratacao completa: NAO recusa", () => {
    expect(recusa(OK)).toBeNull();
  });

  it("filial 0 RESOLVIDA passa: e estabelecimento real, nao ausencia", () => {
    expect(recusa({ ...OK, codigoEmpresa: 1, codigoFilial: 0 })).toBeNull();
  });

  it("o PAR tem de existir na lista do GI: `1/37` e valido campo a campo e inexistente la", () => {
    expect(recusa({ ...OK, codigoEmpresa: 1, codigoFilial: 37 })).toBe(
      "GI_PAR_EMPRESA_FILIAL_DESCONHECIDO",
    );
  });

  it("SEM lista configurada, NENHUM par e conhecido e tudo recusa (fail-closed)", () => {
    expect(recusaDaContratacaoGi(payload(OK))).toBe("GI_PAR_EMPRESA_FILIAL_DESCONHECIDO");
  });

  it("empresa, filial ou os dois faltando: GI_SEM_EMPRESA_FILIAL", () => {
    expect(recusa({ ...OK, codigoEmpresa: null })).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(recusa({ ...OK, codigoFilial: null })).toBe("GI_SEM_EMPRESA_FILIAL");
    // Empresa 0 recusa pelo VALOR (não existe no GI); a filial 0 ao lado é irrelevante aqui.
    expect(recusa({ ...OK, codigoEmpresa: 0, codigoFilial: 0 })).toBe("GI_SEM_EMPRESA_FILIAL");
  });

  it("salario ausente, zero ou negativo: GI_SALARIO_INVALIDO", () => {
    expect(recusa({ ...OK, salario: null })).toBe("GI_SALARIO_INVALIDO");
    expect(recusa({ ...OK, salario: 0 })).toBe("GI_SALARIO_INVALIDO");
    expect(recusa({ ...OK, salario: -1 })).toBe("GI_SALARIO_INVALIDO");
  });

  it("a contratacao VAZIA (o default) recusa: tudo nulo nao vai para a folha", () => {
    expect(recusa(CONTRATACAO_GI_VAZIA)).toBe("GI_SEM_EMPRESA_FILIAL");
    expect(recusaDaContratacaoGi(montarFuncionarioSelecao({ cpf: CPF }), parConhecido)).toBe(
      "GI_SEM_EMPRESA_FILIAL",
    );
  });
});

describe("montarFuncionarioSelecao: a contratacao entra SO pelo terceiro parametro nomeado", () => {
  const CONTRATACAO: ContratacaoGi = {
    salario: 2000,
    dataAdmissao: "2026-11-03",
    vinculo: "4",
    tipoContrato: null,
    codigoEmpresa: 1,
    codigoFilial: 4,
  };

  it("os seis campos saem no payload", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF }, undefined, CONTRATACAO);
    expect(f.salario).toBe(2000);
    expect(f.dataAdmissao).toBe("2026-11-03");
    expect(f.vinculo).toBe("4");
    expect(f.tipoContrato).toBeNull();
    expect(f.codigoEmpresa).toBe(1);
    expect(f.codigoFilial).toBe(4);
  });

  it("sem o terceiro parametro os seis saem NULOS (o comportamento de antes desta rodada)", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF });
    expect(f.salario).toBeNull();
    expect(f.dataAdmissao).toBeNull();
    expect(f.vinculo).toBeNull();
    expect(f.tipoContrato).toBeNull();
    expect(f.codigoEmpresa).toBeNull();
    expect(f.codigoFilial).toBeNull();
  });

  it("a porta da PESSOA continua hermetica: salario dentro dela NAO atravessa", () => {
    // É este o invariante que as DUAS allowlists preservam, e que uma interface alargada perderia.
    const pessoaContaminada = { cpf: CPF, salario: "9999.99", centroCusto: "CC-1" };
    const f = montarFuncionarioSelecao(pessoaContaminada as never);
    expect(JSON.stringify(f)).not.toContain("9999.99");
    expect(JSON.stringify(f)).not.toContain("CC-1");
    expect(f.salario).toBeNull();
  });
});

/**
 * A GUARDA DA PRÓPRIA TABELA: o de/para do vínculo nunca pode produzir um código fora dos 18 valores do
 * contrato do GI. É este teste que permite ao `vinculoGiValido` DERIVAR o conjunto permitido da tabela,
 * em vez de recopiá-lo: a tabela é a fonte única, e aqui se prova que ela não sai do contrato.
 */
describe("vinculo: a tabela de de/para nunca produz codigo fora dos 18 do contrato", () => {
  const DO_CONTRATO = new Set([
    "1", "2", "3", "4", "5", "6", "7", "8", "9",
    "C", "D", "E", "F", "G", "H", "I", "J", "K",
  ]);

  it("todos os seis tipos de servico produzem codigo do contrato, com 1 caractere", () => {
    for (const tipo of ["Temporário", "Terceirizado", "Interno", "Fopag", "Estágio", "Jovem Aprendiz"]) {
      const v = mapearVinculoGi(tipo);
      expect(v, tipo).not.toBeNull();
      expect(v as string, tipo).toHaveLength(1);
      expect(DO_CONTRATO.has(v as string), `${tipo} -> ${v}`).toBe(true);
    }
  });
});

/**
 * AS DUAS REDES DE RUNTIME (achado do `tester`): o TIPO não protege estes dois campos, porque
 * `ContratacaoGi.vinculo` é `string | null`, união ABERTA, e o `Add` do GI grava folha aceitando a letra
 * em silêncio (família da §A.33).
 */
describe("redes de runtime: vinculo e prazo fora da lista fechada saem NULOS, nunca repassados", () => {
  function comContratacao(over: Partial<ContratacaoGi>) {
    return montarFuncionarioSelecao({ cpf: CPF }, undefined, { ...CONTRATACAO_GI_VAZIA, ...over });
  }

  it("o nosso tipo_contrato por extenso NAO atravessa como vinculo (campo de 1 caractere)", () => {
    // Isto atravessava SEM CAST e sem o compilador reclamar, porque a uniao do tipo e aberta.
    expect(comContratacao({ vinculo: "Temporário" }).vinculo).toBeNull();
    expect(comContratacao({ vinculo: "TEMP." }).vinculo).toBeNull();
  });

  it("codigo do CONTRATO que a tabela nao produz tambem sai nulo (o conjunto e derivado da tabela)", () => {
    // `7` e `K` existem no GI e NAO estao autorizados: ninguem os emite hoje, e o dia em que o diretor
    // autorizar o `7` a mudanca e na TABELA, que e a fonte unica deste conjunto.
    expect(comContratacao({ vinculo: "7" }).vinculo).toBeNull();
    expect(comContratacao({ vinculo: "K" }).vinculo).toBeNull();
  });

  it("codigo autorizado atravessa intacto", () => {
    for (const v of ["4", "1", "J", "H"]) {
      expect(comContratacao({ vinculo: v }).vinculo, v).toBe(v);
    }
  });

  it("o prazo fora de {D, I} sai NULO (o campo do GI tem lista de dois valores)", () => {
    expect(comContratacao({ tipoContrato: "Temporário" as never }).tipoContrato).toBeNull();
    expect(comContratacao({ tipoContrato: "d" as never }).tipoContrato).toBeNull();
    expect(comContratacao({ tipoContrato: "D" }).tipoContrato).toBe("D");
    expect(comContratacao({ tipoContrato: "I" }).tipoContrato).toBe("I");
  });
});
