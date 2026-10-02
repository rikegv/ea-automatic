import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTRATACAO_GI_VAZIA,
  INVALIDACAO_DO_SELO_DO_SALARIO,
  SALARIO_UNIDADES_EA,
  TETO_FISICO_JORNADA,
  comDeclaracaoDaUnidadeDoSalario,
  comSalarioInvalidandoSelo,
  declaracaoDaUnidadeDoSalario,
  mapearVinculoGi,
  montarContratacaoGi,
  montarFuncionarioSelecao,
  montarPessoaParaGi,
  prazoContratoGi,
  recusaDaContratacaoGi,
  resolverEmpresaFilialGi,
  tipoSalarioGi,
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
    // De/para IBGE VAZIO: este bloco mede só o código de RESIDÊNCIA, e os dois mapas são separados.
    codigoMunicipioIbge: () => null,
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
      codigoMunicipioIbge: () => null,
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

  it("`D` TEM QUATRO ORIGENS (4, 7, J, H), e `I` so uma (1)", () => {
    /**
     * ⚠️ EXPECTATIVA REESCRITA EM 01/10/2026, por decisão do diretor. NÃO é teste afrouxado: a lista
     * continua FECHADA, só está completa.
     *
     * ANTES, `4` (Temporário), `J` (Estagiário) e `H` (Menor Aprendiz) saíam NULOS, e a justificativa
     * escrita era "nulo preserva o comportamento de hoje". Isso é verdade sobre o EA e **FALSO sobre a
     * folha**: o campo tem `default 'I'` no GI, então nulo não deixa o campo vazio, **faz o fornecedor
     * gravar `I` (Indeterminado)**. Os três são contratos COM PRAZO (Lei 6.019, Lei 11.788, Lei
     * 10.097), logo o silêncio do EA produzia o prazo ERRADO para os três, calado. Não decidir não era
     * neutro: era decidir pelo default do fornecedor.
     */
    expect(prazoContratoGi("4")).toBe("D");
    expect(prazoContratoGi("7")).toBe("D");
    expect(prazoContratoGi("J")).toBe("D");
    expect(prazoContratoGi("H")).toBe("D");
    expect(prazoContratoGi("1")).toBe("I");
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

  it("os vinculos FORA da tabela continuam saindo NULOS, e a lista segue FECHADA", () => {
    // A trava que importa não é "quem sai nulo", é que ninguém MAIS sai com prazo. Os cinco vínculos
    // da tabela (1, 4, 7, J, H) são os únicos que o diretor decidiu; os outros 13 do contrato do GI
    // seguem nulos, porque não há regra de folha para eles.
    for (const v of ["2", "3", "5", "6", "8", "9", "C", "D", "E", "F", "G", "I", "K"]) {
      expect(prazoContratoGi(v), `vinculo ${v}`).toBeNull();
    }
    expect(prazoContratoGi(null)).toBeNull();
    expect(prazoContratoGi(undefined)).toBeNull();
    expect(prazoContratoGi("")).toBeNull();
  });

  it("o PRAZO sai do vinculo pelo caminho REAL, para os quatro regimes a prazo", () => {
    // Pelo caminho da produção: texto livre do EA -> vínculo -> prazo. Prova que a decisão do diretor
    // chega ao payload, e não só à função.
    for (const tipo of ["Temporário", "Estágio", "Jovem Aprendiz"]) {
      const c = montarContratacaoGi({ tipoContrato: tipo, vinculos: VINCULOS, salario: "1800.00" });
      expect(c.tipoContrato, tipo).toBe("D");
    }
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

describe("tipoSalario: a UNIDADE do salario e DECLARADA, nunca deduzida do valor", () => {
  /**
   * O BLOQUEIO QUE ESTE BLOCO GUARDA, medido na produção em 01/10/2026: há **7 admissões VIVAS com
   * salário `9,34` (2) e `10,90` (5)**, que são valores de HORA, e o `tipoSalario` do GI tem
   * **`default 'M'` (Mês)**. Sem a unidade declarada, aquelas 7 entram na folha como salário MENSAL de
   * R$ 9,34, passando por todas as outras guardas (§A.33). Os valores usados aqui são SINTÉTICOS.
   */
  it("as SETE unidades do fornecedor traduzem, e NAO so duas", () => {
    /**
     * A VERSÃO DE DOIS VALORES ERA PIOR QUE NÃO TER COLUNA, e é isso que este teste trava. Sem `DIA` e
     * sem `QUINZENAL`, o diarista e o quinzenalista não tinham onde se declarar: diante de duas opções
     * erradas o time marca `MENSAL`, e aí o valor errado passa a carregar **um selo dizendo que alguém
     * conferiu**. Selo sobre dado errado desliga a desconfiança de quem lê depois, então é pior que selo
     * nenhum. Os sete são os da `description` de `TB_FuncionarioSelecaoAPI`, conferida em 01/10/2026.
     */
    expect(tipoSalarioGi("AULA")).toBe("A");
    expect(tipoSalarioGi("COMISSAO")).toBe("C");
    expect(tipoSalarioGi("DIA")).toBe("D");
    expect(tipoSalarioGi("HORA")).toBe("H");
    expect(tipoSalarioGi("MENSAL")).toBe("M");
    expect(tipoSalarioGi("QUINZENAL")).toBe("Q");
    expect(tipoSalarioGi("TAREFA")).toBe("T");
  });

  it("a lista exportada e a do de/para batem, e sao SETE: a tela e o CHECK leem a mesma coisa", () => {
    // `SALARIO_UNIDADES_EA` é o que a tela oferece e o que o CHECK da 0140 espelha. Divergir dela do
    // de/para faria a tela ofertar unidade que sai NULA no envio, calada.
    expect([...SALARIO_UNIDADES_EA]).toEqual([
      "AULA",
      "COMISSAO",
      "DIA",
      "HORA",
      "MENSAL",
      "QUINZENAL",
      "TAREFA",
    ]);
    for (const u of SALARIO_UNIDADES_EA) expect(tipoSalarioGi(u), u).not.toBeNull();
  });

  it("tolera caixa e espaco de borda, e NADA MAIS", () => {
    expect(tipoSalarioGi(" hora ")).toBe("H");
    expect(tipoSalarioGi("Mensal")).toBe("M");
  });

  it("ausente, vazio e desconhecido saem NULOS: nunca o default do fornecedor", () => {
    // ⚠️ O desfecho seguro NÃO é `M`. `M` é o default do GI, e é exatamente ele o dano: nulo aqui faz o
    // envio ser RECUSADO, e o time declarar. Deduzir pela faixa do valor está VETADO.
    for (const v of [null, undefined, "", "   ", "MES", "M", "H", "HORISTA", "por hora", "SEMANAL"]) {
      expect(tipoSalarioGi(v as string | null), `entrada ${JSON.stringify(v)}`).toBeNull();
    }
  });

  it("a letra do FORNECEDOR nao e aceita como entrada: a coluna guarda o vocabulario do EA", () => {
    // Guardar `H`/`M` no nosso banco amarraria a coluna ao contrato do GI. A tradução é de saída, e
    // aceitar a letra de volta aqui abriria a porta para ela ser persistida sem ninguém notar.
    expect(tipoSalarioGi("H")).toBeNull();
    expect(tipoSalarioGi("M")).toBeNull();
  });

  it("o montador traduz a coluna do banco, e a ausencia nao vira `M`", () => {
    const base = { tipoContrato: "Temporário", vinculos: VINCULOS, salario: "1800.00" };
    expect(montarContratacaoGi({ ...base, salarioUnidade: "MENSAL" }).tipoSalario).toBe("M");
    expect(montarContratacaoGi({ ...base, salarioUnidade: "HORA" }).tipoSalario).toBe("H");
    expect(montarContratacaoGi(base).tipoSalario).toBeNull();
    expect(montarContratacaoGi({ ...base, salarioUnidade: null }).tipoSalario).toBeNull();
  });

  it("REDE DE RUNTIME: valor fora dos SETE no payload sai NULO, nunca repassado", () => {
    // Mesmo padrão de `vinculoGiValido`/`prazoGiValido`: o campo do GI tem 1 caractere e lista fechada,
    // e um `as` descuidado faria o vocabulário do EA ("MENSAL") atravessar para ele.
    const f = (t: unknown) =>
      montarFuncionarioSelecao({ cpf: CPF }, undefined, {
        ...CONTRATACAO_GI_VAZIA,
        tipoSalario: t as "H" | "M" | null,
      }).tipoSalario;
    expect(f("MENSAL")).toBeNull();
    expect(f("HORA")).toBeNull();
    expect(f("m")).toBeNull();
    // Os SETE passam (a lista é DERIVADA do de/para, não recopiada); o resto cai para nulo.
    for (const t of ["A", "C", "D", "H", "M", "Q", "T"]) expect(f(t), t).toBe(t);
    for (const t of ["X", "m", "MENSAL", "HORA", "", " H ", 1, true]) expect(f(t), String(t)).toBeNull();
  });
});

describe("recusaDaContratacaoGi: as guardas duras, e a ordem delas", () => {
  const OK: ContratacaoGi = {
    salario: 2000,
    tipoSalario: "M",
    // Jornada NULA no fixture de propósito: `M` não a exige, e é isso que o bloco do horista prova.
    qtdeHorasMes: null,
    qtdeHorasSem: null,
    dataAdmissao: "2026-11-03",
    vinculo: "4",
    tipoContrato: null,
    codigoEmpresa: 1,
    codigoFilial: 4,
    // CLIENTE FINAL resolvido na fixture (0141/02-10): a recusa do cliente é a ÚLTIMA da ordem, e sem
    // ele TODO cenário de par válido deste bloco voltaria `GI_CLIENTE_NAO_RESOLVIDO` em vez da régua que
    // esta casa mede. ⚠️ Não confundir com `codigoEmpresa`: este é o TOMADOR.
    codigoCliente: 4321,
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

  it("unidade NAO declarada: GI_SALARIO_SEM_UNIDADE, e NUNCA o default `M` do fornecedor", () => {
    // É a guarda do bloqueio das 7 horistas. O valor é válido, a empresa e a filial resolvem, o par é
    // conhecido: a ÚNICA coisa que impede R$ 9,34 de entrar como salário mensal é esta linha.
    expect(recusa({ ...OK, tipoSalario: null })).toBe("GI_SALARIO_SEM_UNIDADE");
    expect(recusa({ ...OK, tipoSalario: "MENSAL" as never })).toBe("GI_SALARIO_SEM_UNIDADE");
  });

  it("declarada HORA sem jornada: GI_SALARIO_HORISTA_SEM_JORNADA, e o motivo diz O QUE FALTA", () => {
    /**
     * Emitir `tipoSalario = 'H'` NÃO conserta o salário sozinho, erra de outro jeito: ao lado de
     * `salario`/`tipoSalario` o GI tem `salarioHora`, `qtdeHorasMes` e `qtdeHorasSem`, **todos com
     * default `0`**, e o EA emite só os campos nomeados da allowlist. Então `H` sem jornada gravaria
     * "R$ 9,34 por hora vezes 0 horas", a MESMA falha de `default 0` que o `salarioGi` recusa no valor.
     *
     * ⚠️ O QUE MUDOU COM A 0140: isto deixou de ser recusa PERPÉTUA. Antes, o EA não tinha jornada em
     * lugar nenhum, e **uma admissão que o time auditou e que o sistema recusa para sempre é
     * indistinguível de uma admissão quebrada**. Agora o código NOMEIA a jornada, e informar a jornada
     * destrava (ver o teste seguinte).
     */
    expect(recusa({ ...OK, tipoSalario: "H" })).toBe("GI_SALARIO_HORISTA_SEM_JORNADA");
  });

  it("HORA com jornada COMPLETA: ENVIA, e a pendencia deixou de ser beco", () => {
    expect(recusa({ ...OK, tipoSalario: "H", qtdeHorasMes: 220, qtdeHorasSem: 44 })).toBeNull();
  });

  it("HORA com jornada PELA METADE recusa: 220h/mes com ZERO h/semana e contradicao, nao campo vazio", () => {
    // Os dois campos têm `default 0` no fornecedor, então mandar um só grava a contradição lá dentro.
    expect(recusa({ ...OK, tipoSalario: "H", qtdeHorasMes: 220, qtdeHorasSem: null })).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
    expect(recusa({ ...OK, tipoSalario: "H", qtdeHorasMes: null, qtdeHorasSem: 44 })).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
    // ZERO não é "informado como zero": é o default do fornecedor, que é o dano.
    expect(recusa({ ...OK, tipoSalario: "H", qtdeHorasMes: 0, qtdeHorasSem: 0 })).toBe(
      "GI_SALARIO_HORISTA_SEM_JORNADA",
    );
  });

  it("a jornada e exigida SO do horista: as outras SEIS unidades enviam sem ela", () => {
    // `M`, `D`, `Q`, `A`, `C` e `T` dizem o período inteiro no próprio par valor+unidade. Exigir jornada
    // delas seria inventar obrigação que o contrato não pede, e viraria recusa sem saída de novo.
    for (const t of ["A", "C", "D", "M", "Q", "T"] as const) {
      expect(recusa({ ...OK, tipoSalario: t }), t).toBeNull();
    }
  });

  it("o montador NAO deriva jornada, e zero/fora de faixa/texto caem para NULO", () => {
    /**
     * Derivar 220 h/mês de 44 h/semana usa o fator 30/7 e o DSR: é CONVENÇÃO DE FOLHA, varia por acordo
     * coletivo, e é o mesmo "casamento aproximado sobre remuneração" vetado para a unidade. O teto é
     * FÍSICO (744 = 31×24, 168 = 7×24), espelhando o CHECK da 0140, nunca trabalhista.
     */
    const base = { tipoContrato: "Temporário", vinculos: VINCULOS, salario: "1800.00" };
    const j = (mes: unknown, sem: unknown) =>
      montarContratacaoGi({
        ...base,
        jornadaHorasMes: mes as string | number | null,
        jornadaHorasSem: sem as string | number | null,
      });
    // STRING do `numeric` do Drizzle, que é como a coluna chega.
    expect(j("220.00", "44.00").qtdeHorasMes).toBe(220);
    expect(j("220.00", "44.00").qtdeHorasSem).toBe(44);
    // Informar só uma NÃO completa a outra: nada é derivado.
    expect(j("220.00", null).qtdeHorasSem).toBeNull();
    expect(j(null, "44.00").qtdeHorasMes).toBeNull();
    // Zero, negativo, texto, vazio e acima do teto FÍSICO: nulos nos dois campos.
    for (const v of [0, "0", "0.00", -1, "abc", "", "   ", null, undefined, 745, 2200]) {
      expect(j(v, 44).qtdeHorasMes, `mes ${JSON.stringify(v)}`).toBeNull();
    }
    for (const v of [0, "0", -1, "abc", 169, 440]) {
      expect(j(220, v).qtdeHorasSem, `sem ${JSON.stringify(v)}`).toBeNull();
    }
  });

  it("a ORDEM: valor invalido vence a unidade, e a unidade declarada vence a falta de jornada", () => {
    // Mandar o time declarar a unidade de um salário zero seria mandá-lo declarar antes de ter o que
    // declarar; e distinguir "não declarou" de "declarou horista" é o que faz a tela dizer a coisa certa.
    expect(recusa({ ...OK, salario: 0, tipoSalario: null })).toBe("GI_SALARIO_INVALIDO");
    expect(recusa({ ...OK, salario: 0, tipoSalario: "H" })).toBe("GI_SALARIO_INVALIDO");
    // E as duas recusas de empresa/filial continuam vencendo as três do salário.
    expect(recusa({ ...OK, codigoEmpresa: null, tipoSalario: null })).toBe("GI_SEM_EMPRESA_FILIAL");
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
    tipoSalario: "M",
    qtdeHorasMes: null,
    qtdeHorasSem: null,
    dataAdmissao: "2026-11-03",
    // `4` (Temporário) agora SAI com prazo `D`, por decisão do diretor de 01/10/2026.
    vinculo: "4",
    tipoContrato: "D",
    codigoEmpresa: 1,
    codigoFilial: 4,
    // O CLIENTE FINAL (0141/02-10). ⚠️ NÃO é `codigoEmpresa` (empresa do Grupo Soulan): é o TOMADOR,
    // vindo de `admissoes.cod_cliente` por de/para direto. A fixture o traz RESOLVIDO porque toda esta
    // casa mede OUTRAS réguas, e sem ele a recusa do cliente chegaria antes delas.
    codigoCliente: 4321,
  };

  it("os sete campos saem no payload", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF }, undefined, CONTRATACAO);
    expect(f.salario).toBe(2000);
    expect(f.tipoSalario).toBe("M");
    expect(f.dataAdmissao).toBe("2026-11-03");
    expect(f.vinculo).toBe("4");
    expect(f.tipoContrato).toBe("D");
    expect(f.codigoEmpresa).toBe(1);
    expect(f.codigoFilial).toBe(4);
  });

  it("sem o terceiro parametro os sete saem NULOS (o comportamento de antes desta rodada)", () => {
    const f = montarFuncionarioSelecao({ cpf: CPF });
    expect(f.salario).toBeNull();
    expect(f.tipoSalario).toBeNull();
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

describe("DECLARACAO DA UNIDADE DO SALARIO: o ATO DE AUDITORIA, e quando ele carimba", () => {
  /**
   * ═══ A REGRA ═══
   *
   * Regra permanente do diretor: **nenhum salário é gravado na folha sem auditoria do time.** Declarar a
   * unidade É esse ato, então a unidade e os dois carimbos (`salario_auditado_em`, `salario_auditado_por`)
   * são UMA COISA SÓ: um gesto, três colunas escritas juntas, mais a jornada quando houver.
   *
   * ═══ O DEFEITO QUE ESTE BLOCO EXISTE PARA PEGAR ═══
   *
   * O lápis do Gerenciador PRÉ-PREENCHE a unidade e a devolve em TODO salvamento. Carimbar a cada
   * salvamento faria a data do selo avançar sozinha e o autor virar quem só trocou o centro de custo:
   * uma auditoria que ninguém fez, assinada por quem não a fez. É a MESMA distinção que o `undefined` do
   * `comSalarioInvalidandoSelo` faz do outro lado, e aqui ela depende do estado ANTERIOR.
   *
   * §A.6: nenhum caso abaixo carrega valor de remuneração, CPF ou nome.
   */
  const AUTOR = "11111111-1111-1111-1111-111111111111";
  const AGORA = new Date("2026-10-01T12:00:00.000Z");

  it("unidade AUSENTE ou vazia nao declara nada (o selo fica zerado pela escrita do valor)", () => {
    expect(declaracaoDaUnidadeDoSalario({}, null, AUTOR, AGORA)).toBeUndefined();
    expect(declaracaoDaUnidadeDoSalario({ salarioUnidade: "" }, null, AUTOR, AGORA)).toBeUndefined();
    expect(declaracaoDaUnidadeDoSalario({ salarioUnidade: "   " }, null, AUTOR, AGORA)).toBeUndefined();
    expect(declaracaoDaUnidadeDoSalario({ salarioUnidade: null }, null, AUTOR, AGORA)).toBeUndefined();
    // Jornada SEM unidade é ignorada: jornada é parte da declaração, não campo solto.
    expect(
      declaracaoDaUnidadeDoSalario({ jornadaHorasMes: 220, jornadaHorasSem: 44 }, null, AUTOR, AGORA),
    ).toBeUndefined();
  });

  it("unidade declarada carimba autor e data, e normaliza a caixa", () => {
    expect(declaracaoDaUnidadeDoSalario({ salarioUnidade: "mensal" }, null, AUTOR, AGORA)).toEqual({
      salarioUnidade: "MENSAL",
      jornadaHorasMes: null,
      jornadaHorasSem: null,
      salarioAuditadoEm: AGORA,
      salarioAuditadoPor: AUTOR,
    });
  });

  it("HORA com jornada grava as horas na forma canonica do `numeric(6,2)`", () => {
    /** O Drizzle quer STRING num `numeric`; a tela manda número depois do DTO normalizar o pt-BR. */
    expect(
      declaracaoDaUnidadeDoSalario(
        { salarioUnidade: "HORA", jornadaHorasMes: 220, jornadaHorasSem: 44 },
        null,
        AUTOR,
        AGORA,
      ),
    ).toEqual({
      salarioUnidade: "HORA",
      jornadaHorasMes: "220.00",
      jornadaHorasSem: "44.00",
      salarioAuditadoEm: AGORA,
      salarioAuditadoPor: AUTOR,
    });
  });

  it("ZERO vira null, e NAO vira zero gravado: zero e o default do fornecedor", () => {
    const d = declaracaoDaUnidadeDoSalario(
      { salarioUnidade: "HORA", jornadaHorasMes: 0, jornadaHorasSem: 0 },
      null,
      AUTOR,
      AGORA,
    );
    expect(d?.jornadaHorasMes).toBeNull();
    expect(d?.jornadaHorasSem).toBeNull();
  });

  it("⚠️ a MESMA unidade e a MESMA jornada NAO recarimbam: o selo de ontem permanece", () => {
    /**
     * O CASO DO LÁPIS, e o ponto inteiro do `anterior`. Quem salvou trocando só o centro de custo mandou
     * a unidade de volta porque a tela a pré-preencheu, e isso NÃO é uma declaração nova.
     */
    const anterior = { salarioUnidade: "HORA", jornadaHorasMes: "220.00", jornadaHorasSem: "44.00" };
    expect(
      declaracaoDaUnidadeDoSalario(
        { salarioUnidade: "HORA", jornadaHorasMes: 220, jornadaHorasSem: 44 },
        anterior,
        AUTOR,
        AGORA,
      ),
    ).toBeUndefined();
    // Caixa e forma do número diferentes continuam sendo a MESMA declaração: a comparação é canônica,
    // e o `numeric(6,2)` volta do banco como "220.00" enquanto a tela manda 220.
    expect(
      declaracaoDaUnidadeDoSalario(
        { salarioUnidade: "hora", jornadaHorasMes: "220", jornadaHorasSem: 44 },
        anterior,
        AUTOR,
        AGORA,
      ),
    ).toBeUndefined();
  });

  it("MUDAR a unidade ou a jornada carimba de novo, com o autor de AGORA", () => {
    const anterior = { salarioUnidade: "HORA", jornadaHorasMes: "220.00", jornadaHorasSem: "44.00" };
    const OUTRO = "22222222-2222-2222-2222-222222222222";

    // Unidade trocada: a jornada de horista é LIMPA junto, senão fica pendurada numa unidade mensal.
    expect(
      declaracaoDaUnidadeDoSalario({ salarioUnidade: "MENSAL" }, anterior, OUTRO, AGORA),
    ).toEqual({
      salarioUnidade: "MENSAL",
      jornadaHorasMes: null,
      jornadaHorasSem: null,
      salarioAuditadoEm: AGORA,
      salarioAuditadoPor: OUTRO,
    });

    // Só a jornada mudou: segue sendo declaração nova (o que vai para a folha mudou).
    expect(
      declaracaoDaUnidadeDoSalario(
        { salarioUnidade: "HORA", jornadaHorasMes: 180, jornadaHorasSem: 44 },
        anterior,
        OUTRO,
        AGORA,
      )?.jornadaHorasMes,
    ).toBe("180.00");
  });

  it("sem autor (caminho automatico) a unidade ainda grava, com autor NULO e visivel", () => {
    /** Ingestão automática nunca declara unidade; se um dia declarar, o nulo é a prova de que foi ela. */
    expect(declaracaoDaUnidadeDoSalario({ salarioUnidade: "DIA" }, null, undefined, AGORA)).toEqual({
      salarioUnidade: "DIA",
      jornadaHorasMes: null,
      jornadaHorasSem: null,
      salarioAuditadoEm: AGORA,
      salarioAuditadoPor: null,
    });
  });

  it("A COMPOSICAO: a declaracao SOBRESCREVE a invalidacao, nesta ordem", () => {
    /**
     * A ordem documentada no helper. Escrever o valor zera o selo; declarar a unidade no MESMO gesto
     * carimba por cima, porque ali houve declaração de verdade. O inverso lavaria a edição.
     */
    const declaracao = declaracaoDaUnidadeDoSalario({ salarioUnidade: "HORA", jornadaHorasMes: 220, jornadaHorasSem: 44 }, null, AUTOR, AGORA);
    const patch = comDeclaracaoDaUnidadeDoSalario(
      comSalarioInvalidandoSelo({ escala: "12x36" }, "9.34"),
      declaracao,
    );
    expect(patch).toEqual({
      escala: "12x36",
      salario: "9.34",
      salarioUnidade: "HORA",
      jornadaHorasMes: "220.00",
      jornadaHorasSem: "44.00",
      salarioAuditadoEm: AGORA,
      salarioAuditadoPor: AUTOR,
    });
  });

  it("SEM declaracao, a composicao devolve o patch INTACTO (selo zerado pela invalidacao)", () => {
    const patch = comDeclaracaoDaUnidadeDoSalario(
      comSalarioInvalidandoSelo({ escala: "12x36" }, "2000.00"),
      declaracaoDaUnidadeDoSalario({}, null, AUTOR, AGORA),
    );
    expect(patch).toEqual({
      escala: "12x36",
      salario: "2000.00",
      salarioUnidade: null,
      salarioAuditadoEm: null,
      salarioAuditadoPor: null,
    });
  });

  it("SEM declaracao e SEM escrita de salario, nada e tocado (as chaves ficam AUSENTES)", () => {
    /** A edição que não mexeu em salário nem em unidade não pode apagar a auditoria de ninguém. */
    const patch = comDeclaracaoDaUnidadeDoSalario(
      comSalarioInvalidandoSelo({ escala: "12x36" }, undefined),
      declaracaoDaUnidadeDoSalario({ salarioUnidade: "HORA" }, { salarioUnidade: "HORA" }, AUTOR, AGORA),
    );
    expect("salarioUnidade" in patch).toBe(false);
    expect("salarioAuditadoEm" in patch).toBe(false);
    expect("salarioAuditadoPor" in patch).toBe(false);
    expect("jornadaHorasMes" in patch).toBe(false);
  });

  it("a unidade declarada e SEMPRE uma da lista fechada que o CHECK do banco espelha", () => {
    // Canário de contrato: a lista do domínio é a autoridade, e o DTO valida contra ela.
    for (const u of SALARIO_UNIDADES_EA) {
      expect(declaracaoDaUnidadeDoSalario({ salarioUnidade: u }, null, AUTOR, AGORA)?.salarioUnidade).toBe(u);
    }
  });
});

describe("INVALIDACAO DO SELO DO SALARIO: o helper, e a VARREDURA dos escritores", () => {
  /**
   * ═══ A REGRA ═══
   *
   * **Toda escrita em `dados_vaga_folha.salario` zera `salario_unidade`, `salario_auditado_em` e
   * `salario_auditado_por`.** Autorizado pelo diretor em 01/10/2026, inclusive em código já validado.
   *
   * O QUE ELA IMPEDE: sem a invalidação, o lápis troca R$ 9,34 por R$ 2.000 e o carimbo de ontem continua
   * lá. O selo passa a certificar um valor que ninguém olhou, e **a EDIÇÃO sai LAVADA pela auditoria
   * anterior**, que é o oposto exato da regra do diretor ("nenhum salário vai para a folha sem auditoria
   * do time"). Pior que não ter selo: o selo desliga a desconfiança de quem lê depois, e a guarda do
   * envio (`GI_SALARIO_SEM_UNIDADE`) deixa de morder justamente no caso em que deveria.
   *
   * ═══ POR QUE ESTE BLOCO VARRE O FONTE EM VEZ DE SÓ TESTAR O HELPER ═══
   *
   * Invalidação repetida à mão em N escritores é invalidação que o escritor **N+1 esquece**, e o
   * esquecimento é **CALADO**: nada falha, nenhum teste fica vermelho, o selo antigo simplesmente
   * permanece. Testar só o helper provaria que o helper funciona e não que alguém o chamou.
   *
   * O DESENHO MAIS FORTE SERIA UM TRIGGER DE BANCO, e ele foi considerado e RECUSADO: não existe UM
   * trigger nas 140 migrations deste repositório, e não existe caminho de teste contra Postgres real
   * (`docs/FRENTE-REGISTRADA-TESTE-POSTGRES-REAL.md`). O trigger seria a única guarda, em convenção nova,
   * sem nenhum teste capaz de executá-la: é o padrão exato do incidente de 18/09/2026, em que 3.680
   * testes verdes conviveram com a instrução central da frente sendo incapaz de rodar. Fica registrado
   * como o desenho certo para quando a frente do Postgres real existir.
   *
   * ⚠️ A ARMADILHA DA VARREDURA DE FONTE (memória da fábrica): **comentário casa com a busca**. Três
   * falsos vermelhos já saíram disso numa frente só. Por isso o texto é despido de comentário ANTES de
   * qualquer asserção, abaixo.
   *
   * ═══ ⚠️ O QUE **NÃO** É PROVA DE QUE O SELO É INBURLÁVEL (registro do `seguranca`, 01/10/2026) ═══
   *
   * Os **5 mutantes que o `tester` matou** nesta frente exercitam o **MONTADOR e as GUARDAS do envio**
   * (`tipoSalarioGi`, `GI_SALARIO_SEM_UNIDADE`, os tetos de jornada), e **NÃO** a cobertura ESTRUTURAL
   * desta varredura. "Mutante morto" ali **não diz nada** sobre haver um caminho de escrita que passa por
   * fora do helper, que é uma pergunta de COBERTURA DE ESCRITORES, não de comportamento de função pura.
   *
   * **NÃO SOMAR AS DUAS PROVAS COMO SE FOSSEM A MESMA.** Foi exatamente essa soma que deixou a primeira
   * versão deste bloco parecer fechada enquanto CINCO formas de burla ficavam verdes. A prova de que a
   * varredura morde é outra, e está no `describe` do fim deste bloco: cada burla escrita em BUFFER, com a
   * régua REPROVANDO.
   */

  /**
   * Lê o fonte com os COMENTÁRIOS FORA (bloco e linha). Despir o texto antes de asserir é obrigatório:
   * comentário casa com a busca, e três falsos vermelhos de uma frente só nasceram exatamente disso.
   */
  function fonteSemComentario(rel: string): string {
    // `__dirname` é o padrão da casa para spec que lê fonte (`portal-ritmo.spec.ts:509`,
    // `portal-documentos.spec.ts:243`). `import.meta.url` NÃO serve: o tsconfig do backend é
    // `module: commonjs`, e ali `import.meta` é TS1343, erro de typecheck.
    const bruto = readFileSync(join(__dirname, "..", rel), "utf8");
    return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  }

  it("o helper zera as TRES colunas quando o salario e escrito", () => {
    const patch = comSalarioInvalidandoSelo({ escala: "12x36" }, "2000.00");
    expect(patch).toEqual({
      escala: "12x36",
      salario: "2000.00",
      salarioUnidade: null,
      salarioAuditadoEm: null,
      salarioAuditadoPor: null,
    });
    // Apagar o salário também é escrever nele: o selo cai igual.
    expect(comSalarioInvalidandoSelo({}, null)).toEqual({
      salario: null,
      ...INVALIDACAO_DO_SELO_DO_SALARIO,
    });
  });

  it("`undefined` NAO derruba o selo: edicao que nao mexeu no salario preserva a auditoria", () => {
    /**
     * O CASO DO LÁPIS. No Drizzle, `undefined` em `.set()` é "não toque nesta coluna" e `null` é "grave
     * NULL". Quando a edição não mexeu no salário não houve escrita, então não há selo a invalidar, e
     * derrubá-lo apagaria a auditoria de quem só trocou o centro de custo. A distinção é "o valor
     * mudou", não "o formulário passou por aqui".
     *
     * AS TRÊS CHAVES FICAM AUSENTES, não nulas: ausente é "não toque", nulo seria "apague".
     */
    const patch = comSalarioInvalidandoSelo({ escala: "12x36" }, undefined);
    expect(patch).toEqual({ escala: "12x36", salario: undefined });
    expect("salarioUnidade" in patch).toBe(false);
    expect("salarioAuditadoEm" in patch).toBe(false);
    expect("salarioAuditadoPor" in patch).toBe(false);
  });

  it("a constante tem EXATAMENTE as tres colunas do selo, e todas nulas", () => {
    // Coluna de selo nova que não entre aqui nasceria fora da invalidação, calada.
    expect(INVALIDACAO_DO_SELO_DO_SALARIO).toEqual({
      salarioUnidade: null,
      salarioAuditadoEm: null,
      salarioAuditadoPor: null,
    });
  });

  /**
   * TODO `.ts` DE PRODUÇÃO DO BACKEND, POR CAMINHADA DE DIRETÓRIO (endurecimento 2, 01/10/2026).
   *
   * ⚠️ A VERSÃO ANTERIOR DESTA VARREDURA OLHAVA DOIS ARQUIVOS ESCOLHIDOS À MÃO, e esse era o furo maior
   * do mecanismo: escritor novo em arquivo novo simplesmente **não existia** para o teste. Já havia
   * precedente real, `as/ingestao-pandape/arnes-seed-manual.ts`, que escreve `salario` em
   * `dados_vaga_folha` por `tx.unsafe` e não era coberto por varredura nenhuma. Enumerar por caminhada
   * é o que faz o escritor N+1 nascer coberto **em qualquer arquivo**, que é a promessa inteira do selo.
   *
   * `.spec.ts` fica FORA: spec não roda em produção, e este próprio arquivo carrega os buffers de burla
   * (abaixo), que fariam a varredura reprovar a si mesma.
   */
  function arquivosDeProducaoDoBackend(): string[] {
    const raiz = join(__dirname, "..");
    const achados: string[] = [];
    const andar = (dir: string): void => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, entrada.name);
        if (entrada.isDirectory()) andar(caminho);
        else if (entrada.name.endsWith(".ts") && !/\.(?:spec|d)\.ts$/.test(entrada.name)) {
          achados.push(relative(raiz, caminho));
        }
      }
    };
    andar(raiz);
    return achados.sort();
  }

  /**
   * A STATEMENT INTEIRA de toda escrita Drizzle em `dados_vaga_folha`: do `.insert(dadosVagaFolha)` /
   * `.update(dadosVagaFolha)` até o `;` de profundidade zero.
   *
   * ⚠️ POR QUE A STATEMENT INTEIRA E NÃO O PRIMEIRO BLOCO `{...}`: a versão anterior recortava só o
   * objeto do primeiro `.values(`/`.set(`, e a auditoria de 01/10/2026 mostrou que isso deixava passar
   * `salario` dentro do `set:` de um `onConflictDoUpdate()` encadeado DEPOIS, 100% verde. A statement
   * inteira enxerga todos os objetos do encadeamento.
   *
   * ⚠️ E POR QUE NÃO UMA BUSCA SIMPLES POR `salario:` NO ARQUIVO: ela não distingue ESCRITA de LEITURA, e
   * `admissoes.service.ts` tem OITO leituras legítimas (projeções de `select`, o objeto da régua de
   * pendências, o `efetivoVf` do sinalizador). A primeira versão deste teste fez isso e ficou vermelha
   * nas oito, **apontando leitura como se fosse escrita**. O recorte é ESTRUTURAL, e o endurecimento NÃO
   * pode desfazer isso: nada aqui busca `salario` fora de uma statement de escrita delimitada.
   */
  function statementsDeEscritaEmVagaFolha(fonte: string): string[] {
    const statements: string[] = [];
    const re = /\.(?:insert|update)\(\s*dadosVagaFolha\s*\)/g;
    for (let m = re.exec(fonte); m !== null; m = re.exec(fonte)) {
      const resto = fonte.slice(m.index + m[0].length);
      let prof = 0;
      for (let i = 0; i < resto.length; i += 1) {
        const c = resto[i];
        if (c === "(" || c === "{" || c === "[") prof += 1;
        else if (c === ")" || c === "}" || c === "]") prof -= 1;
        else if (c === ";" && prof === 0) {
          statements.push(resto.slice(0, i));
          break;
        }
      }
    }
    return statements;
  }

  const ALVO = "comSalarioInvalidandoSelo(";

  /** Remove a chamada do helper (parênteses balanceados) do texto, para ver o que SOBRA. */
  function semAChamadaDoHelper(texto: string): string {
    let r = texto;
    for (let i = r.indexOf(ALVO); i >= 0; i = r.indexOf(ALVO)) {
      let prof = 0;
      let j = i + ALVO.length - 1;
      for (; j < r.length; j += 1) {
        if (r[j] === "(") prof += 1;
        else if (r[j] === ")") {
          prof -= 1;
          if (prof === 0) {
            j += 1;
            break;
          }
        }
      }
      r = r.slice(0, i) + r.slice(j);
    }
    return r;
  }

  /**
   * A RÉGUA, em função pura, para que os BUFFERS DE BURLA abaixo rodem exatamente o que os arquivos
   * reais rodam. Devolve a lista de violações (vazia = conforme).
   */
  function violacoesDeEscritaTs(fonte: string, arquivo: string): string[] {
    const violacoes: string[] = [];
    for (const st of statementsDeEscritaEmVagaFolha(fonte)) {
      const recorte = st.replace(/\s+/g, " ").slice(0, 160);

      // (1) O ARGUMENTO DE `.values()`/`.set()` TEM DE SER OBJETO LITERAL. Patch montado fora do bloco
      //     (`const patch = { salario: novo }; ... .set(patch)`) é invisível para qualquer varredura de
      //     statement, então ele é recusado pela FORMA, não pelo conteúdo.
      const reArg = /\.(?:values|set)\(\s*/g;
      for (let m = reArg.exec(st); m !== null; m = reArg.exec(st)) {
        const depois = st.slice(m.index + m[0].length);
        if (!depois.startsWith("{") && !depois.startsWith("[") && !depois.startsWith(ALVO)) {
          violacoes.push(
            `${arquivo}: argumento de .values()/.set() não é objeto literal (patch montado fora do bloco não é auditável): ${recorte}`,
          );
        }
      }

      if (!/\bsalario\b/.test(st)) continue;

      // (2) TOCOU SALÁRIO, PASSOU PELO HELPER.
      if (!st.includes(ALVO)) {
        violacoes.push(`${arquivo}: escrita de salario SEM comSalarioInvalidandoSelo(): ${recorte}`);
        continue;
      }

      // (3) ⚠️ O ENDURECIMENTO QUE MATA A PIOR BURLA: depois de remover o texto da chamada do helper,
      //     NÃO PODE SOBRAR `salario:` na statement. Sem isto,
      //     `.set({ ...comSalarioInvalidandoSelo({}, undefined), salario: novo })` fica 100% VERDE e
      //     grava salário com o selo INTACTO, que é o dano exato que a guarda existe para impedir: o
      //     texto do helper está no bloco, então um `toContain()` passa.
      const sobra = semAChamadaDoHelper(st);
      if (/\bsalario\s*:/.test(sobra)) {
        violacoes.push(
          `${arquivo}: \`salario:\` escrito FORA do helper na mesma statement (override do selo): ${recorte}`,
        );
      }

      // (4) Nenhum escritor declara as colunas do selo À MÃO: a invalidação mora num lugar só.
      if (/salarioAuditadoEm\s*:/.test(sobra)) {
        violacoes.push(`${arquivo}: selo declarado a mao em vez do helper: ${recorte}`);
      }
    }
    return violacoes;
  }

  /**
   * A régua do SQL CRU (endurecimento 3), também em função pura para os buffers de burla.
   *
   * SÓ O `UPDATE` É PROIBIDO, e a distinção não é descuido: `INSERT` de linha nova nasce com as três
   * colunas do selo NULAS por construção (a 0140 não dá `default`), então insert cru não pode deixar
   * selo velho certificando salário novo. `UPDATE ... set ... salario` em SQL cru, sim: ele reescreve
   * uma linha que PODE ter selo, e passa por fora do helper e por fora do Drizzle.
   */
  function violacoesDeSqlCru(fonte: string, arquivo: string): string[] {
    const re =
      /\bupdate\s+(?:only\s+)?"?dados_vaga_folha"?[\s\S]{0,400}?\bset\b[\s\S]{0,400}?\bsalario\b/i;
    const m = re.exec(fonte);
    return m
      ? [
          `${arquivo}: UPDATE de salario em dados_vaga_folha por SQL CRU, por fora do helper: ${m[0]
            .replace(/\s+/g, " ")
            .slice(0, 160)}`,
        ]
      : [];
  }

  it("VARREDURA: nenhuma escrita TS de `dados_vaga_folha` grava `salario` fora do helper", () => {
    /**
     * É este o teste que faz o SÉTIMO escritor nascer coberto: statement nova que grave salário sem o
     * helper, OU que escreva `salario:` por cima do helper no mesmo bloco, fica vermelha aqui.
     *
     * OS ESCRITORES MEDIDOS (01/10/2026, por caminhada): SETE statements Drizzle, em DOIS arquivos.
     *  - `admissoes.service.ts`, SEIS, das quais QUATRO tocam salário: `create`,
     *    `criarPreAdmissaoDoFunil` (a ponte do funil de A&S, **sem humano nenhum**, que copia o snapshot
     *    da vaga), `aplicarLiberacao` e `editar` (o lápis de Gerenciador e Esteira). NÃO tocam: o
     *    `criarPreAdmissao` do Pandapé (insere só `admissaoId`) e o UPDATE de uniforme;
     *  - `expurgo.service.ts`, UMA, que só apaga o CPF/nome do substituído por TTL.
     * SQL cru fica no teste seguinte.
     */
    const violacoes: string[] = [];
    let statements = 0;
    let comSalario = 0;
    for (const arquivo of arquivosDeProducaoDoBackend()) {
      const fonte = fonteSemComentario(arquivo);
      const sts = statementsDeEscritaEmVagaFolha(fonte);
      statements += sts.length;
      comSalario += sts.filter((s) => /\bsalario\b/.test(s)).length;
      violacoes.push(...violacoesDeEscritaTs(fonte, arquivo));
    }
    expect(violacoes).toEqual([]);

    // CANÁRIO DO PRÓPRIO RECORTE: zero statement seria verde mentindo (regex que parou de casar, arquivo
    // renomeado, encadeamento reescrito). Os números são os medidos, e mexer neles é decisão consciente.
    expect(statements, "statements de escrita Drizzle em dados_vaga_folha, no backend todo").toBe(7);
    expect(comSalario, "statements de escrita que tocam salario").toBe(4);
  });

  it("ENUMERACAO: os arquivos que escrevem em `dados_vaga_folha` sao EXATAMENTE os medidos", () => {
    /**
     * O conjunto é fechado de propósito. Arquivo novo escrevendo na tabela fica vermelho AQUI, e quem o
     * acrescentar é obrigado a olhar o selo antes de incluí-lo na lista. É o par da caminhada: a
     * caminhada acha, a igualdade exige decisão consciente.
     */
    const drizzle: string[] = [];
    const sqlCru: string[] = [];
    const alias: string[] = [];
    for (const arquivo of arquivosDeProducaoDoBackend()) {
      const fonte = fonteSemComentario(arquivo);
      if (/\.(?:insert|update)\(\s*dadosVagaFolha\s*\)/.test(fonte)) drizzle.push(arquivo);
      if (/\b(?:insert\s+into|update)\s+(?:only\s+)?"?dados_vaga_folha"?/i.test(fonte)) {
        sqlCru.push(arquivo);
      }
      // ALIAS DA TABELA: `const t = dadosVagaFolha` (ou `import { dadosVagaFolha as t }`) esconderia a
      // escrita do recorte estrutural, porque a regex procura o identificador. Ninguém renomeia o
      // objeto da tabela hoje, e quem precisar renomear tem de passar por aqui.
      if (
        /(?:const|let|var)\s+\w+\s*(?::[^=\n]*)?=\s*dadosVagaFolha\s*[;,)\n]/.test(fonte) ||
        /dadosVagaFolha\s+as\s+\w+/.test(fonte)
      ) {
        alias.push(arquivo);
      }
    }
    expect(drizzle).toEqual(["admissoes/admissoes.service.ts", "admissoes/expurgo.service.ts"]);
    expect(sqlCru).toEqual([
      "as/ingestao-pandape/arnes-seed-manual.ts",
      "db/carga-provisorio.ts",
    ]);
    expect(alias, "ninguem apelida `dadosVagaFolha` (apelido esconde a escrita da varredura)").toEqual(
      [],
    );
  });

  it("VARREDURA: nenhum SQL CRU do backend faz `update dados_vaga_folha set ... salario`", () => {
    /**
     * Endurecimento 3. O `tx.execute(sql\`update dados_vaga_folha set salario = ...\`)` passa por fora do
     * Drizzle, por fora do helper e por fora do recorte de statement, e era a quinta burla que a
     * auditoria de 01/10/2026 reproduziu verde. Aqui ele é proibido no backend inteiro.
     */
    const violacoes: string[] = [];
    for (const arquivo of arquivosDeProducaoDoBackend()) {
      violacoes.push(...violacoesDeSqlCru(fonteSemComentario(arquivo), arquivo));
    }
    expect(violacoes).toEqual([]);
  });

  it("VARREDURA: a carga em SQL cru zera o selo na lista de colunas, e NUNCA faz UPDATE", () => {
    /**
     * `db/carga-provisorio.ts` traz salário de PLANILHA, sem ninguém do time olhar o valor, então o selo
     * não pode nascer preenchido. Não dá para usar o helper em SQL cru, então as três colunas vão na
     * lista do INSERT como NULL, que é a mesma afirmação escrita à mão.
     *
     * ⚠️ E É **INSERT DE LINHA NOVA, NUNCA UPDATE**, que é o ponto do risco de lote: a carga não reescreve
     * as 2.595 linhas que já têm salário. Nenhuma admissão existente perde selo porque a carga rodou.
     *
     * O OUTRO ESCRITOR DE SQL CRU, `as/ingestao-pandape/arnes-seed-manual.ts`, escreve `salario` SEM as
     * colunas do selo, e é seguro por construção: é `insert ... on conflict do nothing` de arnês de
     * homologação, linha NOVA, em que o selo nasce nulo (a 0140 não dá `default`). Ele agora é
     * ENUMERADO pela caminhada e coberto pela proibição de UPDATE cru, o que antes não acontecia.
     */
    const fonte = fonteSemComentario("db/carga-provisorio.ts");
    const insert = /INSERT INTO dados_vaga_folha \(([^)]*)\)/.exec(fonte);
    expect(insert, "a carga insere em dados_vaga_folha").not.toBeNull();
    const colunas = (insert?.[1] ?? "").replace(/\s+/g, " ");
    for (const c of ["salario_unidade", "salario_auditado_em", "salario_auditado_por"]) {
      expect(colunas, `a carga declara ${c} na lista de colunas`).toContain(c);
    }
    // Nenhum UPDATE de `dados_vaga_folha` nesta rotina de lote.
    expect(/UPDATE\s+dados_vaga_folha/i.test(fonte), "a carga NAO faz UPDATE em dados_vaga_folha").toBe(
      false,
    );
  });

  describe("O ENDURECIMENTO MORDE: as cinco burlas que ficavam VERDES, provadas em BUFFER", () => {
    /**
     * ⚠️ TESTE DE GUARDA QUE NÃO SE PROVA CONTRA A BURLA É O QUE ACABOU DE FALHAR AQUI. A auditoria de
     * 01/10/2026 reproduziu o extrator anterior e rodou CINCO formas de escrever salário por fora do
     * helper: **as cinco ficaram verdes**. Cada caso abaixo é uma delas, escrita num BUFFER (nunca num
     * arquivo), e o teste exige que a régua ACUSE. Molde do `'TAREFA'` → `'XX'` já usado na casa: a
     * prova do mecanismo é ele reprovando, não ele passando.
     */
    const ok = `await tx.insert(dadosVagaFolha).values({ ...comSalarioInvalidandoSelo({}, vf.salario ?? null), escala: vf.escala });`;

    it("o CONTROLE: a forma correta continua passando (senao a prova abaixo nao vale nada)", () => {
      expect(violacoesDeEscritaTs(ok, "buffer.ts")).toEqual([]);
      expect(violacoesDeSqlCru(ok, "buffer.ts")).toEqual([]);
    });

    it("B) OVERRIDE NO MESMO BLOCO, a pior: o texto do helper esta la, e o salario e escrito por cima", () => {
      const burla = `await tx.update(dadosVagaFolha).set({ ...comSalarioInvalidandoSelo({}, undefined), salario: novo });`;
      const v = violacoesDeEscritaTs(burla, "buffer.ts");
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("escrito FORA do helper");
    });

    it("A) `salario` no `set:` do `onConflictDoUpdate`, que o recorte antigo nao enxergava", () => {
      const burla = `await tx.insert(dadosVagaFolha).values({ admissaoId }).onConflictDoUpdate({ target: dadosVagaFolha.admissaoId, set: { salario: novo } });`;
      const v = violacoesDeEscritaTs(burla, "buffer.ts");
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("SEM comSalarioInvalidandoSelo()");
    });

    it("E) PATCH MONTADO FORA DO BLOCO: recusado pela FORMA do argumento", () => {
      const burla = `const patch = { salario: novo }; await tx.update(dadosVagaFolha).set(patch);`;
      const v = violacoesDeEscritaTs(burla, "buffer.ts");
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("não é objeto literal");
    });

    it("D) SQL CRU por `tx.execute`: proibido no backend inteiro", () => {
      const burla = "await tx.execute(sql`update dados_vaga_folha set salario = ${novo} where admissao_id = ${id}`);";
      const v = violacoesDeSqlCru(burla, "buffer.ts");
      expect(v).toHaveLength(1);
      expect(v[0]).toContain("SQL CRU");
      // E a forma com aspas e `only` também, que é a mesma escrita com outro vestido.
      expect(violacoesDeSqlCru('`UPDATE ONLY "dados_vaga_folha" SET "salario" = $1`', "b.ts")).toHaveLength(1);
    });

    it("C) ALIAS DA TABELA: o apelido e proibido, porque esconderia a escrita do recorte", () => {
      /**
       * Esta é a única das cinco cuja guarda NÃO é por statement: um apelido faz a escrita desaparecer do
       * recorte estrutural, então a régua é a PROIBIÇÃO do apelido, verificada pela enumeração acima
       * sobre os arquivos reais. Aqui se prova que a regex do apelido ACUSA as duas formas.
       */
      const apelido = (f: string): boolean =>
        /(?:const|let|var)\s+\w+\s*(?::[^=\n]*)?=\s*dadosVagaFolha\s*[;,)\n]/.test(f) ||
        /dadosVagaFolha\s+as\s+\w+/.test(f);
      expect(apelido("const t = dadosVagaFolha;\n")).toBe(true);
      expect(apelido("import { dadosVagaFolha as t } from './schema';")).toBe(true);
      // E NÃO acusa o uso normal, que é o que mantém a varredura utilizável.
      expect(apelido("await tx.update(dadosVagaFolha).set({ escala: null });")).toBe(false);
      expect(apelido("eq(dadosVagaFolha.admissaoId, id)")).toBe(false);
    });
  });
});

describe("A MIGRATION 0140 e o CODIGO dizem a MESMA coisa, provado contra o .sql", () => {
  /**
   * ═══ POR QUE ESTE BLOCO EXISTE, e por que ele é mais necessário aqui que no normal ═══
   *
   * Há DUAS listas do mesmo dado: o `CHECK` da migration, no banco, e `SALARIO_UNIDADES_EA`, no código.
   * Duas listas do mesmo dado divergem no primeiro ajuste, e divergem **CALADAS**: a tela ofertaria uma
   * unidade que o `INSERT` recusa (erro de banco na cara do time), ou o CHECK aceitaria um valor que
   * `tipoSalarioGi` não traduz (sai NULO no envio, e a admissão é recusada sem ninguém entender por quê).
   *
   * E AQUI NÃO HÁ A REDE DE SEGURANÇA DE SEMPRE: **a 0140 não está aplicada em NENHUM dos dois bancos**
   * (produção nem homologação, conferido em 01/10/2026). Então a divergência não apareceria usando o
   * sistema, porque a coluna ainda não existe em lugar nenhum. Quando ela existir, o primeiro a descobrir
   * seria o time, no meio de um cadastro. Este teste é a única coisa que olha os dois lados hoje.
   *
   * ⚠️ OS COMENTÁRIOS DO `.sql` SÃO REMOVIDOS ANTES DE QUALQUER ASSERÇÃO, e isso não é zelo: a 0140 é
   * quase toda comentário, e os comentários CITAM os sete valores, as letras do fornecedor e os números
   * 744 e 168. Asserir sobre o texto cru daria verde lendo a prosa em vez do `CHECK`, que é o falso
   * VERDE, o pior dos dois. (Memória da fábrica: varredura de fonte casa comentário.)
   */
  const SQL = (() => {
    const bruto = readFileSync(
      join(__dirname, "..", "..", "drizzle", "0140_dados_vaga_folha_salario_unidade.sql"),
      "utf8",
    );
    return bruto
      .split("\n")
      .map((l) => l.replace(/--.*$/, ""))
      .join("\n");
  })();

  it("o CHECK da unidade tem EXATAMENTE as unidades do codigo, na mesma ordem", () => {
    const m = /ck_dados_vaga_folha_salario_unidade[\s\S]*?IN \(([^)]*)\)/.exec(SQL);
    expect(m, "o CHECK da unidade existe na 0140 (fora dos comentarios)").not.toBeNull();
    const doBanco = (m?.[1] ?? "").split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    expect(doBanco).toEqual([...SALARIO_UNIDADES_EA]);
  });

  it("o CHECK da unidade aceita NULO, que e o unico valor honesto para as 2.595 linhas existentes", () => {
    // `NOT NULL DEFAULT 'MENSAL'` falsearia auditoria que ninguém fez nas 7 horistas medidas.
    expect(/ck_dados_vaga_folha_salario_unidade[\s\S]*?IS NULL OR/.test(SQL)).toBe(true);
    expect(/"salario_unidade"\s+varchar\(10\)(?!\s+not null)/i.test(SQL)).toBe(true);
  });

  it("os tetos de jornada do CHECK sao os MESMOS do codigo, e sao FISICOS", () => {
    // 744 = 31×24 e 168 = 7×24. O teto da CLT (220/44) NÃO entra: jornada acima dele é legítima em
    // regime próprio, e CHECK trabalhista viraria erro de banco anos depois.
    expect(TETO_FISICO_JORNADA).toEqual({ mes: 744, sem: 168 });
    const teto = (coluna: string): number | null => {
      const m = new RegExp(`"${coluna}"\\s*<=\\s*(\\d+)`).exec(SQL);
      return m ? Number(m[1]) : null;
    };
    expect(teto("jornada_horas_mes")).toBe(TETO_FISICO_JORNADA.mes);
    expect(teto("jornada_horas_sem")).toBe(TETO_FISICO_JORNADA.sem);
    // E o ZERO é recusado nos dois, porque zero aqui é o `default 0` do fornecedor, que é o dano.
    expect(/"jornada_horas_mes"\s*>\s*0/.test(SQL)).toBe(true);
    expect(/"jornada_horas_sem"\s*>\s*0/.test(SQL)).toBe(true);
  });

  it("as colunas que a 0140 cria sao as que o schema declara, e nenhuma nasce NOT NULL", () => {
    // Coluna nova com `NOT NULL DEFAULT` reescreveria as 2.595 linhas com salário e, pior que o custo,
    // falsearia auditoria que ninguém fez (§A.16 preserva o histórico da carga).
    for (const c of [
      "salario_unidade",
      "salario_auditado_em",
      "salario_auditado_por",
      "jornada_horas_mes",
      "jornada_horas_sem",
    ]) {
      expect(SQL, `a 0140 cria ${c}`).toContain(`ADD COLUMN IF NOT EXISTS "${c}"`);
    }
    expect(/ADD COLUMN IF NOT EXISTS "[^"]+" [^;]*not null/i.test(SQL)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// OS CINCO CAMPOS QUE FALTARAM na conferência dos três registros do GI (02/10/2026)
// Medição e de/para: `docs/MAPA-GI-CLIENTE-E-CIDADES.md`.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("as TRES cidades da pessoa: cada uma do SEU documento, e nenhuma trocada", () => {
  /**
   * ⚠️ O RISCO DESTE BLOCO NÃO É O CAMPO FALTAR, É ELE IR NO LUGAR DO VIZINHO. O contrato do GI não traz
   * `description` nestes campos, então o de/para veio da POSIÇÃO no schema, e a frente JÁ PAGOU uma
   * colisão de nome igual (o `tipoContrato` do GI, que é o PRAZO `D`/`I` e não o nosso `tipo_contrato`).
   * Cidade do RG gravada como cidade da CTPS é documento de identidade errado na folha, sem erro nenhum.
   *
   * Os três valores são DISTINTOS de propósito: valor igual nos três faria a troca passar.
   */
  const PESSOA: PessoaParaGi = {
    cidadeNascimento: "Recife",
    naturalidade: "PE",
    rgCidade: "Campinas",
    rgUf: "SP",
    ctpsCidade: "Santos",
    ctpsUf: "SP",
  };

  it("cada cidade sai no SEU campo do GI, sem troca entre RG, CTPS e nascimento", () => {
    const f = montarFuncionarioSelecao(PESSOA);
    expect(f.cidadeNascimento).toBe("Recife");
    expect(f.cidadeRG).toBe("Campinas");
    expect(f.cidadeExpedicao).toBe("Santos");
    // E as UFs seguem nos campos delas: `naturalidade` é a UF de NASCIMENTO (maxLength 2), não a cidade.
    expect(f.naturalidade).toBe("PE");
    expect(f.ufrg).toBe("SP");
    expect(f.ufExpedicao).toBe("SP");
  });

  it("as chaves EXISTEM mesmo sem dado, e saem nulas (payload de formato fixo)", () => {
    const f = montarFuncionarioSelecao({});
    for (const chave of ["cidadeNascimento", "cidadeRG", "cidadeExpedicao", "codMunicipioNascto"]) {
      expect(Object.keys(f), chave).toContain(chave);
    }
    expect(f.cidadeNascimento).toBeNull();
    expect(f.cidadeRG).toBeNull();
    expect(f.cidadeExpedicao).toBeNull();
  });

  it("TRUNCA em 30, NAO anula: municipio de 32 caracteres existe de verdade", () => {
    /**
     * ESTE É O TESTE QUE TRAVA O HELPER CERTO. `cortarTexto` trunca; `codigoCurto` ANULA o que não cabe.
     * "Vila Bela da Santíssima Trindade" tem **32 caracteres**, e por `codigoCurto` chegaria ao GI como
     * NULO: o MESMO nada de antes desta frente, calado, depois de toda a coleta ter sido construída para
     * trazer a cidade. Cidade é TEXTO, não código: truncar perde o final do nome, anular perde a cidade.
     */
    const LONGO = "Vila Bela da Santissima Trindade";
    expect(LONGO.length).toBe(32);
    const f = montarFuncionarioSelecao({ cidadeNascimento: LONGO, rgCidade: LONGO, ctpsCidade: LONGO });
    for (const v of [f.cidadeNascimento, f.cidadeRG, f.cidadeExpedicao]) {
      expect(v).not.toBeNull();
      expect(v).toHaveLength(30);
      expect(v).toBe(LONGO.slice(0, 30));
    }
  });

  it("montarPessoaParaGi traz as tres colunas novas de `admissao_dados_gi`", () => {
    const p = montarPessoaParaGi(
      { nome: "Candidato Sintetico" },
      { cidadeNascimento: "Recife", rgCidade: "Campinas", ctpsCidade: "Santos" },
    );
    expect(p.cidadeNascimento).toBe("Recife");
    expect(p.rgCidade).toBe("Campinas");
    expect(p.ctpsCidade).toBe("Santos");
  });
});

describe("codMunicipioNascto: DOIS de/para SEPARADOS, um por espaco de codigo", () => {
  /**
   * ⚠️ ESTE BLOCO MEDIA O CONTRARIO ATE 02/10/2026 ("UM de/para serve os DOIS codigos"), e a separacao
   * e decisao do diretor. `codMunicipioNascto` e IBGE (PROVADO: o GI guardou `3509502`, Campinas, no
   * registro 27 da rodada 4) e `codigoCidadeResid` e o catalogo interno do GI, de espaco DESCONHECIDO e
   * hoje inmedivel. Com um mapa so, preencher o IBGE mandaria a cidade de RESIDENCIA num codigo de
   * outro espaco, calado, para a folha de um terceiro. Os testes abaixo travam a separacao: cada campo
   * le o SEU resolvedor, e o do outro nao o alcanca.
   */
  const DEPARA: DeParaGi = {
    /** Catalogo do GI (residencia): so conhece Sao Paulo, e com um codigo de OUTRO espaco. */
    codigoCidade: (nome, uf) => (nome === "Sao Paulo" && uf === "SP" ? "7107" : null),
    /** IBGE (nascimento): so conhece Recife. */
    codigoMunicipioIbge: (nome, uf) => (nome === "Recife" && uf === "PE" ? "2611606" : null),
  };

  it("sai do de/para IBGE, com a UF vinda da `naturalidade`", () => {
    const f = montarFuncionarioSelecao(
      { cidadeNascimento: "Recife", naturalidade: "PE", cidade: "Sao Paulo", uf: "SP" },
      DEPARA,
    );
    expect(f.codMunicipioNascto).toBe("2611606");
    // E a residencia resolve pelo OUTRO mapa, no mesmo payload: dois campos, DOIS de/para.
    expect(f.codigoCidadeResid).toBe("7107");
  });

  it("O MAPA DE CIDADES DO GI NAO ALCANCA O NASCIMENTO (e vice-versa)", () => {
    // A regressao que este teste pega: alguem volta a apontar `codMunicipioNascto` para `codigoCidade`.
    const soCatalogoGi: DeParaGi = { codigoCidade: () => "7107", codigoMunicipioIbge: () => null };
    const soIbge: DeParaGi = { codigoCidade: () => null, codigoMunicipioIbge: () => "2611606" };
    const a = montarFuncionarioSelecao(
      { cidadeNascimento: "Recife", naturalidade: "PE", cidade: "Recife", uf: "PE" },
      soCatalogoGi,
    );
    expect(a.codMunicipioNascto).toBeNull();
    expect(a.codigoCidadeResid).toBe("7107");
    const b = montarFuncionarioSelecao(
      { cidadeNascimento: "Recife", naturalidade: "PE", cidade: "Recife", uf: "PE" },
      soIbge,
    );
    expect(b.codMunicipioNascto).toBe("2611606");
    expect(b.codigoCidadeResid).toBeNull();
  });

  it("de/para VAZIO (o estado de hoje): os DOIS codigos saem NULOS, nunca inventados", () => {
    const f = montarFuncionarioSelecao({
      cidadeNascimento: "Recife",
      naturalidade: "PE",
      cidade: "Sao Paulo",
      uf: "SP",
    });
    expect(f.codMunicipioNascto).toBeNull();
    expect(f.codigoCidadeResid).toBeNull();
  });

  it("cidade de nascimento sem a UF nao resolve codigo (nao se chuta o municipio)", () => {
    const f = montarFuncionarioSelecao({ cidadeNascimento: "Recife" }, DEPARA);
    expect(f.cidadeNascimento).toBe("Recife");
    expect(f.codMunicipioNascto).toBeNull();
  });

  it("o codigo sai SEM zero a esquerda (campo de contagem, padrao inteiro do contrato)", () => {
    const f = montarFuncionarioSelecao(
      { cidadeNascimento: "X", naturalidade: "SP" },
      { codigoCidade: () => null, codigoMunicipioIbge: () => "0355030" },
    );
    expect(f.codMunicipioNascto).toBe("355030");
  });
});

describe("codigoCliente: o CLIENTE FINAL, de/para DIRETO, e `0` NUNCA sai", () => {
  const BASE = { salario: "1500.50", tipoContrato: "Temporário" } as const;

  it("`cod_cliente` numerico vira `codigoCliente` DIRETO, sem tabela de de/para", () => {
    expect(montarContratacaoGi({ ...BASE, codCliente: "26360" }).codigoCliente).toBe(26360);
    expect(montarContratacaoGi({ ...BASE, codCliente: 4321 }).codigoCliente).toBe(4321);
    // Espaço em volta é do `varchar` do EA, não do dado.
    expect(montarContratacaoGi({ ...BASE, codCliente: " 777 " }).codigoCliente).toBe(777);
  });

  it("`0`, vazio, ausente e NAO NUMERICO resolvem para NULO", () => {
    // ⚠️ `12A` e `ABC` seguem recusando: NÃO são sufixo de contrato (ver o describe do sufixo abaixo),
    // são lixo. O sufixo de contrato é `<numero>-<algo>`, e só ele é normalizado na saída.
    for (const cru of ["0", "00", "000", "", "   ", "ABC", "12A", "1.5", "-1", "+1", null, undefined]) {
      expect(montarContratacaoGi({ ...BASE, codCliente: cru }).codigoCliente, String(cru)).toBeNull();
    }
  });

  it("ZERO A ESQUERDA e ABSORVIDO, nao recusado: `00123` e o MESMO cliente que `123`", () => {
    /**
     * A régua aqui é a do `inteiroGi` (campo de CONTAGEM), **não** a do `inteiroNaFaixaInt16` (que recusa
     * `"04"` em empresa/filial): o campo do outro lado é `int32`, e recusar por formatação reprovaria
     * admissão LEGÍTIMA por um zero que não muda o número. Oposto de `documentoNumerico` (CPF/PIS), onde
     * o zero é dígito do documento.
     *
     * MEDIDO em 02/10/2026: nenhum dos 251 clientes e nenhuma das 3.021 admissões tem zero à esquerda, e
     * o maior código é 57460. A tolerância é defesa contra digitação futura, não remendo de dado atual.
     */
    expect(montarContratacaoGi({ ...BASE, codCliente: "00123" }).codigoCliente).toBe(123);
    expect(montarContratacaoGi({ ...BASE, codCliente: "0057460" }).codigoCliente).toBe(57460);
    // E o que NÃO tem dígito significativo continua recusando: `0` é o default do fornecedor.
    expect(montarContratacaoGi({ ...BASE, codCliente: "000" }).codigoCliente).toBeNull();
  });

  it("acima do teto do `int32` resolve para NULO (o GI recusaria o envio inteiro)", () => {
    expect(montarContratacaoGi({ ...BASE, codCliente: "2147483647" }).codigoCliente).toBe(2147483647);
    expect(montarContratacaoGi({ ...BASE, codCliente: "2147483648" }).codigoCliente).toBeNull();
  });

  it("NAO e a empresa do grupo: cliente final e empresa/filial sao campos INDEPENDENTES", () => {
    const c = montarContratacaoGi({
      ...BASE,
      codCliente: "4321",
      vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "4", ativo: true }],
    });
    expect(c.codigoCliente).toBe(4321);
    expect(c.codigoEmpresa).toBe(1);
    expect(c.codigoFilial).toBe(4);
  });

  it("REDE DE RUNTIME no payload: `0`, string e decimal vindos de fora caem para NULO", () => {
    const forcado = (v: unknown) =>
      montarFuncionarioSelecao({}, undefined, {
        ...CONTRATACAO_GI_VAZIA,
        codigoCliente: v as number | null,
      }).codigoCliente;
    expect(forcado(4321)).toBe(4321);
    for (const v of [0, -1, 1.5, "4321", "0", null, undefined, true]) {
      expect(forcado(v), String(v)).toBeNull();
    }
  });

  it("cliente NAO resolvido RECUSA o envio, e o motivo e o do CLIENTE, nao o da empresa", () => {
    const PAR = (e: number, f: number) => e === 1 && f === 4;
    const completo: ContratacaoGi = {
      salario: 2000,
      tipoSalario: "M",
      qtdeHorasMes: null,
      qtdeHorasSem: null,
      dataAdmissao: "2026-11-03",
      vinculo: "4",
      tipoContrato: "D",
      codigoEmpresa: 1,
      codigoFilial: 4,
      codigoCliente: 4321,
    };
    const recusa = (c: ContratacaoGi) =>
      recusaDaContratacaoGi(montarFuncionarioSelecao({}, undefined, c), PAR);
    expect(recusa(completo)).toBeNull();
    expect(recusa({ ...completo, codigoCliente: null })).toBe("GI_CLIENTE_NAO_RESOLVIDO");
    // `0` é o DEFAULT do campo no GI: referência a cliente inexistente, não campo vazio.
    expect(recusa({ ...completo, codigoCliente: 0 })).toBe("GI_CLIENTE_NAO_RESOLVIDO");
    // E a ORDEM: a recusa do cliente é a ÚLTIMA, para não trocar o motivo que o time já conhece.
    expect(recusa({ ...completo, codigoCliente: null, codigoEmpresa: null })).toBe(
      "GI_SEM_EMPRESA_FILIAL",
    );
    expect(recusa({ ...completo, codigoCliente: null, salario: 0 })).toBe("GI_SALARIO_INVALIDO");
    expect(recusa({ ...completo, codigoCliente: null, tipoSalario: null })).toBe(
      "GI_SALARIO_SEM_UNIDADE",
    );
  });
});

describe("SUFIXO DE CONTRATO no `cod_cliente`: sai na SAIDA, e a colisao da base RECUSA", () => {
  /**
   * O SUFIXO É REGRA DE NEGÓCIO DO DIRETOR: na plataforma, `51525` e `51525-TEMP.` são o MESMO cliente
   * com CONTRATOS diferentes, e o EA guarda o código INTACTO. O `codigoCliente` do GI é `int32`, então o
   * código cru **recusava o envio**; tirar o sufixo é seguro porque o par empresa/filial, que vai no
   * MESMO payload, separa os dois cadastros do outro lado.
   *
   * MEDIDO na produção em 02/10/2026: `51525` é `2/4` TERCEIRO e `51525-TEMP.` é `1/4` TEMPORARIO.
   */
  const TEMPORARIO = (empresa: string, filial: string) => ({
    tipoServico: "TEMPORARIO",
    empresaCodigo: empresa,
    filial,
    ativo: true,
  });
  const BASE = { salario: "1500.50", tipoContrato: "Temporário" } as const;
  /** Mesmo idioma dos demais testes de recusa: o payload é montado, e o par é conhecido. */
  const recusaDe = (c: ContratacaoGi) =>
    recusaDaContratacaoGi(montarFuncionarioSelecao({}, undefined, c), () => true);

  it("`51525-TEMP.` vira `51525` no envio, e empresa/filial continuam as DELE", () => {
    const c = montarContratacaoGi({
      ...BASE,
      codCliente: "51525-TEMP.",
      vinculos: [TEMPORARIO("1", "4")],
      // O irmão `51525` cai em OUTRA empresa: é isso que torna seguro tirar o sufixo.
      vinculosDeOutrosClientesDaMesmaBase: [
        { tipoServico: "TERCEIRO", empresaCodigo: "2", filial: "4", ativo: true },
      ],
    });
    expect(c.codigoCliente).toBe(51525);
    expect(c.codigoEmpresa).toBe(1);
    expect(c.codigoFilial).toBe(4);
  });

  it("outras formas de sufixo (`-T`) e espaco de borda tambem resolvem", () => {
    const com = (cod: string) =>
      montarContratacaoGi({ ...BASE, codCliente: cod, vinculos: [TEMPORARIO("1", "4")] }).codigoCliente;
    expect(com("56702-T")).toBe(56702);
    expect(com("  55642-TEMP.  ")).toBe(55642);
    // O zero à esquerda da base é absorvido aqui pela mesma régua do código numérico.
    expect(com("0056085-TEMP.")).toBe(56085);
  });

  it("COLISAO DA BASE no MESMO par empresa/filial RECUSA (o caso `57315`, pela regua e nao por lista)", () => {
    /**
     * `57315-T` e `57315-TEMP.` são AMBOS `1/4` TEMPORARIO. Sem o sufixo ficariam idênticos em cliente,
     * empresa e filial, e o GI não teria como separá-los: recusa. Não há nenhum `cod_cliente` escrito no
     * produto, então o caso seguinte nasce coberto.
     */
    const c = montarContratacaoGi({
      ...BASE,
      codCliente: "57315-TEMP.",
      vinculos: [TEMPORARIO("1", "4")],
      vinculosDeOutrosClientesDaMesmaBase: [
        { tipoServico: "TERCEIRO", empresaCodigo: "2", filial: "4", ativo: true }, // o `57315` base
        TEMPORARIO("1", "4"), // o `57315-T`: MESMO par, aqui está a colisão
      ],
    });
    expect(c.codigoCliente).toBeNull();
    expect(c.codigoCliente).not.toBe(0);
    expect(recusaDe({ ...c, salario: 2000, tipoSalario: "M" })).toBe("GI_CLIENTE_NAO_RESOLVIDO");
  });

  it("vinculo INATIVO do irmao NAO colide: aquele cadastro nao chega a ser enviado", () => {
    const c = montarContratacaoGi({
      ...BASE,
      codCliente: "57315-TEMP.",
      vinculos: [TEMPORARIO("1", "4")],
      vinculosDeOutrosClientesDaMesmaBase: [{ ...TEMPORARIO("1", "4"), ativo: false }],
    });
    expect(c.codigoCliente).toBe(57315);
  });

  it("SEM par empresa/filial resolvido, RECUSA: nao ha como provar que a base nao colide", () => {
    // É o `56702-T` da base, que não tem vínculo nenhum. O motivo que a tela mostra continua sendo o da
    // empresa, porque `recusaDaContratacaoGi` confere empresa/filial ANTES do cliente.
    const c = montarContratacaoGi({ ...BASE, codCliente: "56702-T", vinculos: [] });
    expect(c.codigoCliente).toBeNull();
    expect(c.codigoEmpresa).toBeNull();
    expect(recusaDe({ ...c, salario: 2000, tipoSalario: "M" })).toBe("GI_SEM_EMPRESA_FILIAL");
  });

  it("o que NAO e sufixo de contrato continua recusando, e `0` NUNCA sai", () => {
    const com = (cod: string) =>
      montarContratacaoGi({ ...BASE, codCliente: cod, vinculos: [TEMPORARIO("1", "4")] }).codigoCliente;
    for (const cru of ["ABC", "12A", "-TEMP.", "0-TEMP.", "000-T", "1.5-T", "51525-", "51525 TEMP."]) {
      expect(com(cru), String(cru)).toBeNull();
    }
  });

  it("codigo NUMERICO nao passa pela regra do sufixo (o caminho de sempre, intacto)", () => {
    // Mesmo com irmãos no MESMO par, o numérico resolve direto: a colisão só existe para quem normaliza.
    const c = montarContratacaoGi({
      ...BASE,
      codCliente: "51525",
      vinculos: [TEMPORARIO("1", "4")],
      vinculosDeOutrosClientesDaMesmaBase: [TEMPORARIO("1", "4")],
    });
    expect(c.codigoCliente).toBe(51525);
  });
});
