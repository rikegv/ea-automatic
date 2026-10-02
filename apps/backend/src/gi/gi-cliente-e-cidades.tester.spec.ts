import { describe, expect, it } from "vitest";
import {
  DE_PARA_GI_VAZIO,
  montarContratacaoGi,
  montarFuncionarioSelecao,
  recusaDaContratacaoGi,
  type ContratacaoGi,
  type DeParaGi,
  type FuncionarioSelecao,
  type ParEmpresaFilialConhecido,
  type PessoaParaGi,
} from "../domain/portal-dados-gi";

/**
 * O CLIENTE FINAL e AS TRÊS CIDADES: as duas réguas que a frente de 02/10/2026 trouxe, e que o resto
 * da suíte não faz porque mede outra pergunta.
 *
 * ESCRITO PELO `tester`, independente de quem construiu (§A.38). Ele mede DUAS coisas que são,
 * cada uma, uma troca silenciosa de dado:
 *
 *  1. **TRÊS CÓDIGOS DIFERENTES NO MESMO PAYLOAD.** `codigoEmpresa` e `codigoFilial` são a empresa do
 *     Grupo Soulan que EMPREGA; `codigoCliente` é o TOMADOR. Emitir um no lugar do outro não falha em
 *     lugar nenhum: os três são inteiros, o GI aceita calado (não valida a chave estrangeira, medido no
 *     `codigoBcoFolha`), e o registro nasce na folha apontando para a pessoa jurídica errada. É a mesma
 *     família da colisão que a frente JÁ PAGOU com o `tipoContrato` do GI, que não é o nosso.
 *  2. **CIDADE SE TRUNCA, NÃO SE ANULA.** O arquivo do montador tem dois helpers de nomes parecidos e
 *     comportamento OPOSTO (`cortarTexto` trunca, `codigoCurto` anula), e as três cidades passam pelo
 *     primeiro. Pelo segundo, "Vila Bela da Santíssima Trindade" (32 caracteres, município real de MT)
 *     chegaria ao GI como NULO, depois de toda a frente ter sido construída para trazê-la.
 *
 * §A.6: toda entrada é SINTÉTICA. CPF de faixa reservada (999), nomes inventados, domínio de
 * homologação, nenhum dado de pessoa real e nenhum valor de pessoa asserido em mensagem de falha.
 */

const CPF_SINTETICO = "99988877766";

const PESSOA: PessoaParaGi = {
  nome: "Zarolina Trevisanto Quembe",
  cpf: CPF_SINTETICO,
  email: "zarolina@homolog.local",
};

/**
 * OS TRÊS VALORES SÃO DISTINTOS E ESCOLHIDOS, e a escolha é o experimento:
 *
 *  - `1` / `4` é um par REAL do fornecedor (`Empresa/GetAll`, 127 pares), e é `int16`;
 *  - `57460` é o MAIOR `cod_cliente` da produção do EA (medido em 02/10/2026) e é `int32`.
 *
 * O cliente ter sido escolhido ACIMA DO TETO DO `int16` (32767) não é capricho: é o que faz a troca de
 * caminho aparecer sozinha. Se alguém emitir `codigoCliente` pelo resolvedor de empresa/filial, 57460
 * não cabe no `int16` e sai NULO; se emitir empresa pelo caminho do cliente, o `"04"` do teste de
 * formato abaixo deixa de recusar. Os dois erros viram vermelho em vez de virar folha errada.
 */
const EMPRESA = 1;
const FILIAL = 4;
const CLIENTE = 57460;

/** O par `1/4`, real, injetado como o produto o recebe. */
const PAR_CONHECIDO: ParEmpresaFilialConhecido = (empresa, filial) =>
  empresa === EMPRESA && filial === FILIAL;

/** A contratação COMPLETA no vocabulário do EA: tudo passa nas guardas, e só a variável medida muda. */
function contratacao(over: Record<string, unknown> = {}): ContratacaoGi {
  return montarContratacaoGi({
    salario: "1500.50",
    salarioUnidade: "MENSAL",
    dataAdmissao: "2026-11-03",
    tipoContrato: "Temporário",
    vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: String(EMPRESA), filial: String(FILIAL), ativo: true }],
    codCliente: String(CLIENTE),
    ...over,
  });
}

function payloadDe(c: ContratacaoGi, pessoa: PessoaParaGi = PESSOA, depara?: DeParaGi): FuncionarioSelecao {
  return montarFuncionarioSelecao(pessoa, depara ?? DE_PARA_GI_VAZIO, c);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1. OS TRÊS CÓDIGOS: nenhum é emitido no lugar do outro
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("EMPRESA, FILIAL e CLIENTE sao TRES codigos diferentes, e nenhum sai no lugar do outro", () => {
  it("os tres chegam ao payload com o valor DELES, e os tres valores sao distintos", () => {
    const f = payloadDe(contratacao());
    expect(f.codigoEmpresa).toBe(EMPRESA);
    expect(f.codigoFilial).toBe(FILIAL);
    expect(f.codigoCliente).toBe(CLIENTE);
    // A asserção que mata a troca: os três são diferentes entre si NO PAYLOAD. Com valores iguais na
    // fixture, emitir um pelo outro passaria verde, que é exatamente como esta classe de erro sobrevive.
    expect(new Set([f.codigoEmpresa, f.codigoFilial, f.codigoCliente]).size).toBe(3);
  });

  it("MEXER NO CLIENTE nao mexe em empresa nem em filial", () => {
    // Isolamento de entrada: é ele que prova que as fontes são independentes, e não só que os três
    // valores saíram certos uma vez.
    const f = payloadDe(contratacao({ codCliente: "999" }));
    expect(f.codigoCliente).toBe(999);
    expect(f.codigoEmpresa).toBe(EMPRESA);
    expect(f.codigoFilial).toBe(FILIAL);
  });

  it("MEXER NO VINCULO (empresa e filial) nao mexe no cliente", () => {
    const f = payloadDe(
      contratacao({
        vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "43", filial: "0", ativo: true }],
      }),
    );
    expect(f.codigoEmpresa).toBe(43);
    expect(f.codigoFilial).toBe(0);
    expect(f.codigoCliente, "o cliente mudou junto com o vinculo: as fontes estao cruzadas").toBe(CLIENTE);
  });

  it("CLIENTE sem vinculo: o cliente resolve e empresa/filial ficam NULAS (nunca o cliente no lugar)", () => {
    const f = payloadDe(contratacao({ vinculos: null }));
    expect(f.codigoCliente).toBe(CLIENTE);
    expect(f.codigoEmpresa).toBeNull();
    expect(f.codigoFilial).toBeNull();
  });

  it("VINCULO sem cliente: empresa/filial resolvem e o cliente fica NULO (nunca a empresa no lugar)", () => {
    const f = payloadDe(contratacao({ codCliente: null }));
    expect(f.codigoEmpresa).toBe(EMPRESA);
    expect(f.codigoFilial).toBe(FILIAL);
    expect(f.codigoCliente).toBeNull();
    // E o nulo do cliente não é `0`: `0` é o default do campo no GI, isto é, o valor que a omissão
    // produz, e seria referência a cliente INEXISTENTE.
    expect(f.codigoCliente).not.toBe(0);
  });

  it("o CLIENTE e int32: 57460 atravessa, e NAO e medido pelo teto do int16 de empresa/filial", () => {
    // É esta a prova de que o caminho é OUTRO, e não só de que o valor saiu certo: 57460 estoura o
    // `int16`. Emitido pelo resolvedor de empresa/filial, sairia nulo.
    expect(payloadDe(contratacao({ codCliente: "57460" })).codigoCliente).toBe(57460);
    expect(payloadDe(contratacao({ codCliente: "2147483647" })).codigoCliente).toBe(2147483647);
    // E o teto do `int32` é respeitado: acima dele, nulo, nunca um número truncado.
    expect(payloadDe(contratacao({ codCliente: "2147483648" })).codigoCliente).toBeNull();
  });

  it("a RECUSA de cliente e a de empresa/filial sao MOTIVOS diferentes, e cada uma manda a outra acao", () => {
    // Um mesmo motivo para os dois faria o time cadastrar vínculo quando o que falta é o cliente.
    expect(recusaDaContratacaoGi(payloadDe(contratacao({ codCliente: null })), PAR_CONHECIDO)).toBe(
      "GI_CLIENTE_NAO_RESOLVIDO",
    );
    expect(recusaDaContratacaoGi(payloadDe(contratacao({ vinculos: null })), PAR_CONHECIDO)).toBe(
      "GI_SEM_EMPRESA_FILIAL",
    );
    // Com os três resolvidos, nada recusa.
    expect(recusaDaContratacaoGi(payloadDe(contratacao()), PAR_CONHECIDO)).toBeNull();
  });

  it("o CLIENTE e a ULTIMA da ordem: faltando as duas coisas, o motivo reportado e o do VINCULO", () => {
    /**
     * A ORDEM É INFORMAÇÃO, e aqui ela foi escolhida: as recusas anteriores são as que o time JÁ sabe
     * destravar, e pôr a do cliente à frente delas trocaria o motivo que a tela mostra hoje em TODA
     * admissão incompleta. Inverter a ordem passaria verde em qualquer teste que olhasse um motivo só.
     */
    const semNada = payloadDe(contratacao({ vinculos: null, codCliente: null }));
    expect(recusaDaContratacaoGi(semNada, PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
    // Par desconhecido também vem antes do cliente.
    const parRuim = payloadDe(
      contratacao({
        vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "1", filial: "37", ativo: true }],
        codCliente: null,
      }),
    );
    expect(recusaDaContratacaoGi(parRuim, PAR_CONHECIDO)).toBe("GI_PAR_EMPRESA_FILIAL_DESCONHECIDO");
    // E o salário, também. O cliente só aparece quando TODO o resto passou.
    const semUnidade = payloadDe(contratacao({ salarioUnidade: null, codCliente: null }));
    expect(recusaDaContratacaoGi(semUnidade, PAR_CONHECIDO)).toBe("GI_SALARIO_SEM_UNIDADE");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2. O ZERO À ESQUERDA: o cliente ABSORVE, empresa e filial RECUSAM. A diferença é o teste.
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("ZERO A ESQUERDA: ABSORVIDO no cliente (int32) e RECUSADO em empresa/filial (int16, pattern)", () => {
  /**
   * ⚠️ AS DUAS RÉGUAS SÃO OPOSTAS DE PROPÓSITO, E ESTE DESCRIBE EXISTE PARA QUE NINGUÉM AS
   * "UNIFORMIZE" NO FUTURO. Uniformizar quebra uma das duas, e quebra calado:
   *
   *  - **CLIENTE: absorve.** `"00123"` e `"123"` são o MESMO cliente, o campo do outro lado é `int32`, e
   *    recusar por formatação reprovaria admissão LEGÍTIMA por um zero que não muda o número.
   *  - **EMPRESA/FILIAL: recusa.** `"04"` não casa com o `pattern` do GI e derruba o envio INTEIRO com
   *    400, então um valor assim não pode nem sair.
   *
   * E NENHUMA DAS DUAS ACEITA `"0"`: no cliente porque `0` é o default do campo (referência a cliente
   * inexistente), na empresa porque empresa 0 não existe em nenhum dos 127 pares do fornecedor.
   */
  it("CLIENTE: o zero a esquerda e ABSORVIDO, porque int32 nao distingue 00123 de 123", () => {
    expect(payloadDe(contratacao({ codCliente: "00123" })).codigoCliente).toBe(123);
    expect(payloadDe(contratacao({ codCliente: "000000123" })).codigoCliente).toBe(123);
    expect(payloadDe(contratacao({ codCliente: "123" })).codigoCliente).toBe(123);
    expect(payloadDe(contratacao({ codCliente: "  00123  " })).codigoCliente).toBe(123);
    // Numérico cru também: o `cod_cliente` do EA é `varchar`, mas o dado chega dos dois jeitos.
    expect(payloadDe(contratacao({ codCliente: 123 })).codigoCliente).toBe(123);
  });

  it("EMPRESA e FILIAL: o MESMO zero a esquerda RECUSA, e e a regua OPOSTA, nao uma inconsistencia", () => {
    const f = payloadDe(
      contratacao({ vinculos: [{ tipoServico: "TEMPORARIO", empresaCodigo: "04", filial: "04", ativo: true }] }),
    );
    expect(f.codigoEmpresa).toBeNull();
    expect(f.codigoFilial).toBeNull();
    expect(recusaDaContratacaoGi(f, PAR_CONHECIDO)).toBe("GI_SEM_EMPRESA_FILIAL");
    // E, no mesmo payload, o cliente com zero à esquerda PASSOU. As duas réguas convivem.
    expect(payloadDe(contratacao({ codCliente: "0057460" })).codigoCliente).toBe(57460);
  });

  const CLIENTES_RUINS: ReadonlyArray<{ valor: unknown; porque: string }> = [
    { valor: "0", porque: "0 e o default do campo no GI, nao um cliente" },
    { valor: "000", porque: "zeros sem digito significativo seguem valendo 0" },
    { valor: "", porque: "vazio" },
    { valor: "   ", porque: "so espaco" },
    { valor: null, porque: "nulo" },
    { valor: undefined, porque: "ausente" },
    { valor: "abc", porque: "nao numerico (sao 7 na base, e caem aqui por desenho)" },
    { valor: "123A", porque: "numero com letra" },
    { valor: "-1", porque: "sinal negativo" },
    { valor: "-0", porque: "zero com sinal" },
    { valor: "12.5", porque: "decimal" },
    { valor: "12,5", porque: "decimal com virgula" },
    { valor: "1 2 3", porque: "numero com espaco no meio" },
  ];

  for (const c of CLIENTES_RUINS) {
    it(`CLIENTE ${JSON.stringify(c.valor)} nao resolve e RECUSA :: ${c.porque}`, () => {
      const f = payloadDe(contratacao({ codCliente: c.valor }));
      expect(f.codigoCliente, "cliente invalido atravessou").toBeNull();
      // E, acima de tudo, NÃO virou `0`: mandar `0` é pior que não mandar, porque nada falha.
      expect(f.codigoCliente).not.toBe(0);
      expect(recusaDaContratacaoGi(f, PAR_CONHECIDO)).toBe("GI_CLIENTE_NAO_RESOLVIDO");
    });
  }

  it("REDE DE RUNTIME: cliente montado POR FORA do montador tambem nao atravessa como 0 nem como texto", () => {
    // `ContratacaoGi` montada à mão (sem `montarContratacaoGi`) é o único outro caminho até o payload.
    for (const valor of [0, -1, 1.5, "123", null, undefined, "0"]) {
      const f = montarFuncionarioSelecao(PESSOA, DE_PARA_GI_VAZIO, {
        ...contratacao(),
        codigoCliente: valor as never,
      });
      expect(f.codigoCliente, `cliente ${JSON.stringify(valor)} atravessou a rede de runtime`).toBeNull();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3. AS TRÊS CIDADES: TRUNCAM em 30 e NUNCA viram nulas
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("as TRES cidades TRUNCAM em 30 e NUNCA ficam nulas: o caso e Vila Bela da Santissima Trindade", () => {
  /**
   * O CASO É REAL E TEM 32 CARACTERES: **"Vila Bela da Santíssima Trindade"**, município de Mato Grosso.
   * Os três campos do GI (`cidadeNascimento`, `cidadeRG`, `cidadeExpedicao`) têm `maxLength` 30, e o
   * arquivo do montador tem DOIS helpers de nome parecido e comportamento OPOSTO:
   *
   *  - `cortarTexto` TRUNCA (o certo aqui: perder o final do nome ainda deixa o MESMO dado, mais curto);
   *  - `codigoCurto` ANULA (certo em tabela fechada, onde "Casado" cortado em 1 viraria outro código).
   *
   * Pelo helper errado, esta cidade chegaria ao GI como NULO, ou seja, com o MESMO resultado de não ter
   * sido coletada, depois de a frente inteira ter sido construída para trazê-la. E ninguém veria: o
   * campo é anulável no contrato, nada falharia.
   */
  const CIDADE_LONGA = "Vila Bela da Santíssima Trindade";
  const TRINTA = "Vila Bela da Santíssima Trinda";

  it("a fixture e o caso real: 32 caracteres, 2 acima do maxLength do GI", () => {
    // Guarda da própria fixture: um nome com menos de 31 caracteres faria todo este describe passar
    // verde sem medir nada.
    expect(CIDADE_LONGA).toHaveLength(32);
    expect(TRINTA).toHaveLength(30);
    expect(CIDADE_LONGA.startsWith(TRINTA)).toBe(true);
  });

  it("as TRES saem com 30 caracteres, NAO NULAS, e truncadas no comeco do nome", () => {
    const f = payloadDe(contratacao(), {
      ...PESSOA,
      cidadeNascimento: CIDADE_LONGA,
      rgCidade: CIDADE_LONGA,
      ctpsCidade: CIDADE_LONGA,
    });
    for (const [campo, valor] of [
      ["cidadeNascimento", f.cidadeNascimento],
      ["cidadeRG", f.cidadeRG],
      ["cidadeExpedicao", f.cidadeExpedicao],
    ] as const) {
      expect(valor, `${campo} veio NULO: passou por codigoCurto em vez de cortarTexto`).not.toBeNull();
      expect(valor, `${campo} nao foi truncado em 30: o GI derruba o envio inteiro com 400`).toHaveLength(30);
      expect(valor, `${campo} truncado no lugar errado`).toBe(TRINTA);
    }
  });

  it("CADA UMA das tres sozinha: o helper errado em UMA delas nao se esconde atras das outras duas", () => {
    // Medir as três juntas deixaria passar o caso em que só uma usa o helper errado, porque a asserção
    // agregada ainda falharia "por alguma". Uma a uma, a falha NOMEIA o campo.
    expect(payloadDe(contratacao(), { ...PESSOA, cidadeNascimento: CIDADE_LONGA }).cidadeNascimento).toBe(TRINTA);
    expect(payloadDe(contratacao(), { ...PESSOA, rgCidade: CIDADE_LONGA }).cidadeRG).toBe(TRINTA);
    expect(payloadDe(contratacao(), { ...PESSOA, ctpsCidade: CIDADE_LONGA }).cidadeExpedicao).toBe(TRINTA);
  });

  it("cidade que JA CABE atravessa inteira, sem corte e sem nulo", () => {
    const f = payloadDe(contratacao(), {
      ...PESSOA,
      cidadeNascimento: "Sao Paulo",
      rgCidade: "Cuiabá",
      ctpsCidade: "Várzea Grande",
    });
    expect(f.cidadeNascimento).toBe("Sao Paulo");
    expect(f.cidadeRG).toBe("Cuiabá");
    expect(f.cidadeExpedicao).toBe("Várzea Grande");
  });

  it("cidade de EXATAMENTE 30 atravessa inteira (a fronteira, nao o meio da faixa)", () => {
    const trinta = "A".repeat(30);
    const f = payloadDe(contratacao(), {
      ...PESSOA,
      cidadeNascimento: trinta,
      rgCidade: trinta,
      ctpsCidade: trinta,
    });
    expect(f.cidadeNascimento).toBe(trinta);
    expect(f.cidadeRG).toBe(trinta);
    expect(f.cidadeExpedicao).toBe(trinta);
  });

  it("cidade AUSENTE segue nula: truncar nao e inventar", () => {
    const f = payloadDe(contratacao(), { ...PESSOA });
    expect(f.cidadeNascimento).toBeNull();
    expect(f.cidadeRG).toBeNull();
    expect(f.cidadeExpedicao).toBeNull();
    // Nulo é VISIVELMENTE pendente; `""` viraria o default do GI e esconderia a lacuna.
    expect(f.cidadeNascimento).not.toBe("");
  });

  it("a CIDADE de nascimento nao e a NATURALIDADE: campos diferentes, 30 contra 2", () => {
    // `naturalidade` é a SIGLA DA UF (`maxLength` 2, lista fechada de 27 no contrato) e passa por
    // `codigoCurto`, que ANULA quando não cabe. Os dois convivem, e confundi-los é a outra metade da
    // colisão: a cidade indo para a UF seria anulada, e a UF indo para a cidade escreveria "SP" como
    // nome de município.
    const f = payloadDe(contratacao(), {
      ...PESSOA,
      cidadeNascimento: CIDADE_LONGA,
      naturalidade: "MT",
    });
    expect(f.cidadeNascimento).toBe(TRINTA);
    expect(f.naturalidade).toBe("MT");
    // E a UF por extenso NÃO é cortada em 2: seria inventar outro código.
    expect(payloadDe(contratacao(), { ...PESSOA, naturalidade: "Mato Grosso" }).naturalidade).toBeNull();
  });
});

describe("codMunicipioNascto: CODIGO pelo de/para, nulo quando nao resolve, nunca inventado", () => {
  /**
   * O de/para injetado. ⚠️ O NASCIMENTO SAI DO MAPA **IBGE** (`codigoMunicipioIbge`), separado do mapa
   * de cidades do GI em 02/10/2026: são dois espaços de código, e aqui o de residência fica vazio de
   * propósito, para provar que ele não alcança `codMunicipioNascto`.
   */
  const DE_PARA_MT: DeParaGi = {
    codigoCidade: () => null,
    codigoMunicipioIbge: (nome) => (nome?.startsWith("Vila Bela") ? "5105150" : null),
  };

  it("resolve pelo de/para a partir da cidade de nascimento, e NAO pela de residencia", () => {
    const f = payloadDe(
      contratacao(),
      { ...PESSOA, cidadeNascimento: "Vila Bela da Santíssima Trindade", naturalidade: "MT", cidade: "Sao Paulo" },
      DE_PARA_MT,
    );
    expect(f.codMunicipioNascto).toBe("5105150");
    // E a cidade de RESIDÊNCIA não resolve neste de/para: o código de nascimento não pode vir dela.
    expect(f.codigoCidadeResid).toBeNull();
  });

  it("O CODIGO E A CIDADE SAO CAMPOS DIFERENTES: o codigo nao substitui o nome truncado", () => {
    const f = payloadDe(
      contratacao(),
      { ...PESSOA, cidadeNascimento: "Vila Bela da Santíssima Trindade", naturalidade: "MT" },
      DE_PARA_MT,
    );
    expect(f.codMunicipioNascto).toBe("5105150");
    expect(f.cidadeNascimento).toBe("Vila Bela da Santíssima Trinda");
  });

  it("DE/PARA VAZIO (o estado de hoje): o codigo sai NULO, nunca 0 nem chutado", () => {
    const f = payloadDe(contratacao(), { ...PESSOA, cidadeNascimento: "Sao Paulo", naturalidade: "SP" });
    expect(f.codMunicipioNascto).toBeNull();
    expect(f.codMunicipioNascto).not.toBe("0");
  });
});
