/**
 * ─ A DISPENSA POR COBERTURA DE SPAN: O QUE ELA TEM DE LIBERAR, E O QUE NÃO PODE SOLTAR ──────────
 *
 * ESCRITO PELO `tester`, QUE NÃO ESCREVEU A CORREÇÃO (§A.38, §A.40). O `seguranca` exigiu
 * expressamente que quem trava isto em teste não seja quem constrói, e por um motivo que vale
 * repetir: teste do autor pega REGRESSÃO bem e MAL-ENTENDIDO DE REQUISITO mal, porque codifica a
 * mesma suposição que gerou o código.
 *
 * ┌─ ARQUIVO CONSOLIDADO: DUAS SESSÕES `tester` COBRIAM ESTA MESMA REGRA ────────────────────────┐
 * │ A dispensa por catálogo estava medida em DOIS arquivos, aqui e em                              │
 * │ `vocabulario-do-sistema.tester.spec.ts`, por duas sessões paralelas. Foi consolidado aqui, que  │
 * │ é o arquivo dedicado ao assunto, e a cópia foi removida de lá.                                  │
 * │                                                                                                │
 * │ O MOTIVO É O MESMO QUE TIROU `alvos` E `preparo` do `Print`: duas cópias da mesma regra          │
 * │ divergem no primeiro ajuste. Em teste de SEGURANÇA a divergência é pior que em conteúdo, porque  │
 * │ as duas continuam VERDES enquanto medem coisas diferentes, e aí ninguém sabe mais qual é a       │
 * │ régua: a que recusa, a que dispensa, ou as duas ao mesmo tempo em telas diferentes.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O DEFEITO QUE A CORREÇÃO RESOLVE, MEDIDO PELO `seguranca` ──────────────────────────────────┐
 * │ A dispensa por catálogo é por IGUALDADE INTEIRA, e o detector de nome devolve um PREFIXO do     │
 * │ trecho. Os dois não casam, então tela de CLIENTE, escolhida justamente por não ter pessoa       │
 * │ nenhuma, era recusada:                                                                         │
 * │   . `REDE D'OR SAO LUIZ S.A.` vira o achado `REDE D'OR SAO LUIZ S` (o ponto não está na classe  │
 * │     do `RE_CAPITALIZADO`), e `has("rede d'or sao luiz s")` falha;                               │
 * │   . `Selecionar ALCOOL FERREIRA S A` chega com o VERBO colado, de um `aria-label` da própria     │
 * │     aplicação, e o trecho inteiro deixa de ser igual à entrada do catálogo.                     │
 * │ Medido: 205 valores de cliente, 47 segmentos recusados. Remendar o `RE_CAPITALIZADO` resolveria  │
 * │ 24 e deixaria 23, por causas diferentes.                                                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CORREÇÃO AUTORIZADA, E O QUE ESTE ARQUIVO MEDE ──────────────────────────────────────────┐
 * │ Dentro de `nomesRecusados`, para cada segmento recortado, SUBTRAEM-SE os trechos cobertos por   │
 * │ uma ocorrência VERBATIM de valor de catálogo NO PRÓPRIO TEXTO AUDITADO, e os FRAGMENTOS que     │
 * │ sobram passam pelo MESMO teste de nome que já existe (`relevantes.length >= 2` mais léxico).    │
 * │ `textoAuditavel` e `RE_CAPITALIZADO` não são tocados.                                          │
 * │                                                                                                │
 * │ ESTE ARQUIVO NÃO MEDE SE A DISPENSA FUNCIONA (isso o autor mede). Ele mede O QUE ELA NÃO PODE   │
 * │ ALCANÇAR, e mede a PROPRIEDADE que dispensa a lista de verbos, porque é a propriedade, e não o   │
 * │ caso, que sobrevive à próxima sessão.                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import {
  auditarDom,
  auditarTelaDoManual,
  auditarTexto as auditarTextoCompleto,
  montarVocabularioDoSistema,
  type AllowlistArnes,
  type NegadosDeEquipe,
} from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Manual Do Sistema", "Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["manual@homolog.local"],
};

const SEM_NEGADOS: NegadosDeEquipe = { nomes: [], emails: [] };

/**
 * OS VALORES DE CATÁLOGO SÃO OS REAIS DA MEDIÇÃO, letra por letra, e isso importa: `S.A.` com ponto
 * e `S A` com espaço são as duas formas que a base tem, e é a diferença entre elas que produziu as
 * duas causas distintas dos 47 segmentos.
 */
const CATALOGO = [
  "REDE D'OR SAO LUIZ S.A.",
  "ALCOOL FERREIRA S A",
  "ADVANCE BIONICS",
  "ANA SOUZA PEREIRA COMERCIO LTDA", // razão social HOMÔNIMA de gente, que é a regra e não a exceção
  "Ferraz de Vasconcelos",
  "São Paulo",
  "Loja Sao Pedro",
];

const VOCABULARIO = montarVocabularioDoSistema(CATALOGO, SEM_NEGADOS);

/**
 * ─ A MEDIÇÃO MUDOU DE CAMADA (rodada 4, 28/09/2026), E A PROPRIEDADE MEDIDA É A MESMA ───────────
 *
 * ┌─ O QUE ACONTECEU, E POR QUE ESTE ARQUIVO NÃO FOI ENFRAQUECIDO ───────────────────────────────┐
 * │ O diretor DESLIGOU o detector genérico de nome por léxico (`DETECTOR_GENERICO_DE_NOME`,          │
 * │ `pii.ts`): o manual é interno, quem o lê já manipula o dado do candidato na FONTE. Com ele        │
 * │ desligado, `auditarTexto` não emite mais achado de tipo `NOME`, e TODA asserção de "FLAGRA" deste  │
 * │ arquivo ficaria verde por VACUIDADE, medindo um detector que não roda mais. Teste assim é pior    │
 * │ que teste nenhum, porque carimba proteção que não existe.                                        │
 * │                                                                                                │
 * │ A PROPRIEDADE, PORÉM, CONTINUA VIVA, na camada que o diretor NÃO liberou: a DENYLIST DE EQUIPE.   │
 * │ A pergunta deste arquivo sempre foi "um valor de CATÁLOGO pode dispensar uma PESSOA por           │
 * │ contenção?", e ela vale igual para o colega do time, cujo nome o gate procura literalmente. Então  │
 * │ as pessoas das fixtures passam a estar na DENYLIST, e o que se mede é o mesmo: o que a subtração   │
 * │ por span pode liberar, e o que ela não pode soltar.                                              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TIPO DO ACHADO É O QUE MUDA, e por isso o filtro aceita os dois: era `NOME` (inferência por
 * léxico), passa a ser `NOME_DE_USUARIO` (busca literal). Aceitar os dois mantém o arquivo correto se
 * o diretor um dia religar o detector.
 */
const PESSOAS_NA_DENYLIST = [
  "Ana Souza Pereira",
  "Joao Pereira",
  "Maria Aparecida Dos Santos",
  "Ana Barbosa Cardoso",
  "Ana Santos Cardoso",
  "Juliana Petrocelli",
  // AS TRÊS DO BLOCO DA TRAVA DE UMA PALAVRA: elas eram pegas pelo léxico, e passam a ser pegas pela
  // camada que ficou. A propriedade medida é a mesma: entrada de catálogo de UMA palavra não pode
  // subtrair o span e liberar a pessoa formada por essas palavras.
  "Santos Oliveira",
  "Cristina Cardoso",
  "Ana Barbosa",
];
const NEGADOS: NegadosDeEquipe = { nomes: PESSOAS_NA_DENYLIST, emails: [] };

/**
 * ─ A FUNÇÃO MEDIDA É `auditarTelaDoManual`, E ISSO PASSOU A IMPORTAR NA RODADA 5 ────────────────
 *
 * O veto do `seguranca` separou as duas superfícies: `auditarTelaDoManual` é o gate DA IMAGEM (onde a
 * chave do diretor vale) e `auditarTexto` é a régua COMPLETA, que a asserção de POPULAÇÃO usa e que
 * continua acusando nome por léxico. Este arquivo é sobre o print do manual, então ele mede a
 * primeira, que é também para onde `auditarDom` aponta. Medi-lo pela régua completa diria que o
 * detector está ligado, e não é isso que decide se o PNG grava.
 */

const achados = (t: string) => auditarTelaDoManual(t, ALLOWLIST, NEGADOS, VOCABULARIO).achados;
const nomes = (t: string) =>
  achados(t).filter((a) => a.tipo === "NOME" || a.tipo === "NOME_DE_USUARIO");
const dispensa = (t: string) => nomes(t).length === 0;

// ────────────────────────────────────────────────────────────────────────────────────────────────
// AS CINCO LINHAS QUE O `seguranca` EXIGIU TRAVADAS, com as linhas INJETADAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * AS LINHAS SÃO INJETADAS, NUNCA LIDAS DO BANCO, e é isso que faz este arquivo valer alguma coisa:
 * um teste que consultasse a homologação ficaria verde POR SORTE (verde porque hoje o catálogo tem
 * aquelas 205 entradas) e mudo no dia do re-clone, que é o dia em que ele tinha de gritar.
 */
describe("AS CINCO LINHAS: o que a dispensa por span libera, e o que ela FLAGRA", () => {
  it("1. célula com o valor INTEIRO do cliente: DISPENSA (era a recusa das telas sem pessoa)", () => {
    // O trecho que o detector recorta é `REDE D'OR SAO LUIZ S`, um PREFIXO, e é por isso que a
    // igualdade inteira não fechava. Coberto pela ocorrência verbatim, não sobra fragmento nenhum.
    expect(nomes("REDE D'OR SAO LUIZ S.A.")).toEqual([]);
    expect(nomes("ALCOOL FERREIRA S A")).toEqual([]);
    expect(nomes("Cliente: REDE D'OR SAO LUIZ S.A.")).toEqual([]);
  });

  it("2. `aria-label` com o VERBO colado: DISPENSA (o verbo sobra como UMA palavra e morre)", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<button aria-label="Selecionar ALCOOL FERREIRA S A">Selecionar</button>`;
    const v = auditarDom(raiz, ALLOWLIST, NEGADOS, VOCABULARIO);
    expect(v.achados.filter((a) => a.tipo === "NOME")).toEqual([]);
    // E em texto puro, que é como o gate realmente recebe o atributo depois do `textoAuditavel`.
    expect(nomes("Selecionar ALCOOL FERREIRA S A")).toEqual([]);
    expect(nomes("Editar REDE D'OR SAO LUIZ S.A.")).toEqual([]);
  });

  /**
   * ─ 3. O CASO QUE A TRAVA DO VALOR INTEIRO JÁ PROTEGIA, E QUE NÃO PODE CAIR NA TROCA ───────────
   *
   * A pessoa está na tela; o catálogo tem um cliente HOMÔNIMO dela, e esse valor NÃO aparece no
   * texto auditado. Não havendo ocorrência verbatim, não há span a subtrair, o segmento inteiro vai
   * ao teste de nome e a tela é RECUSADA. É aqui que morre a implementação por CONTENÇÃO ("o trecho
   * está contido numa entrada do catálogo"), que é a saída fácil e a que abre a porta.
   */
  it("3. pessoa na tela, com cliente HOMÔNIMO só no catálogo: FLAGRA", () => {
    expect(VOCABULARIO.valores).toContain("ANA SOUZA PEREIRA COMERCIO LTDA");
    const v = nomes("Candidata Ana Souza Pereira");
    expect(v.length).toBeGreaterThan(0);
    expect(dispensa("Ana Souza Pereira")).toBe(false);
  });

  /**
   * ─ 4. A PESSOA COLADA NUM VALOR DE CATÁLOGO ───────────────────────────────────────────────────
   *
   * Este é o par do caso 2, e é ele que separa a correção certa da errada: nos DOIS o texto tem o
   * valor de catálogo mais palavras de fora. A diferença está no que SOBRA depois da subtração, e
   * só isso. Uma implementação que dispense "o segmento que contém um valor de catálogo" passa no
   * caso 2 e vaza aqui, sem nada falhar.
   */
  it("4. pessoa COLADA num valor de catálogo: FLAGRA (o que sobra é nome de gente)", () => {
    expect(nomes("Joao Pereira ALCOOL FERREIRA S A").length).toBeGreaterThan(0);
    // E do outro lado do valor, porque um fragmento pode sobrar à direita tanto quanto à esquerda.
    expect(nomes("ALCOOL FERREIRA S A Joao Pereira").length).toBeGreaterThan(0);
    // E com o verbo na frente E a pessoa atrás, que é a forma que a tela realmente desenha no
    // `aria-label` de uma linha de tabela.
    expect(nomes("Selecionar ALCOOL FERREIRA S A Ana Souza Pereira").length).toBeGreaterThan(0);
  });

  it("5. `Selecionar Ana Souza Pereira`, o padrão de 8 telas do sistema: FLAGRA", () => {
    // NENHUM valor de catálogo ocorre aqui, então não há span a subtrair e o segmento inteiro vale.
    expect(nomes("Selecionar Ana Souza Pereira").length).toBeGreaterThan(0);
    expect(nomes("Abrir a ficha de Maria Aparecida Dos Santos").length).toBeGreaterThan(0);
    const raiz = document.createElement("div");
    raiz.innerHTML = `<button aria-label="Selecionar Ana Souza Pereira">Selecionar</button>`;
    expect(auditarDom(raiz, ALLOWLIST, NEGADOS, VOCABULARIO).aprovado).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A PROPRIEDADE, QUE É O QUE O `seguranca` PEDIU PARA PROVAR: NENHUMA LISTA DE VERBOS É NECESSÁRIA
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ┌─ POR QUE A PROPRIEDADE VALE MAIS QUE OS CASOS ACIMA ─────────────────────────────────────────┐
 * │ A saída fácil para o verbo colado é uma LISTA DE VERBOS ("Selecionar", "Editar", "Ver"...),     │
 * │ removida do trecho antes de comparar. Ela conserta a tela de hoje e envelhece no primeiro       │
 * │ `aria-label` novo, e pior: ela remove palavra por LISTA, então no dia em que alguém puser        │
 * │ "Ver" na lista, `Ver Ana Souza` deixa de ser medido pelo que sobra e passa a depender do que a   │
 * │ lista conhece.                                                                                 │
 * │                                                                                                │
 * │ O `seguranca` observou que a lista é DESNECESSÁRIA, porque o verbo sobra como UMA palavra e      │
 * │ morre no `relevantes.length < 2` que já existe. Esta seção prova a observação com verbos que o   │
 * │ código não tem como conhecer, inclusive um inventado.                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("PROPRIEDADE: o verbo colado morre por SOBRAR SOZINHO, não por estar numa lista", () => {
  const VERBOS = [
    "Selecionar",
    "Editar",
    "Abrir",
    "Excluir",
    "Duplicar",
    "Reenviar",
    "Configurar",
    "Inativar",
    "Zunflar", // inventado de propósito: nenhuma lista poderia conhecê-lo
  ];

  for (const verbo of VERBOS) {
    it(`"${verbo} <cliente>" é dispensado sem o código conhecer "${verbo}"`, () => {
      expect(nomes(`${verbo} ALCOOL FERREIRA S A`)).toEqual([]);
      expect(nomes(`${verbo} REDE D'OR SAO LUIZ S.A.`)).toEqual([]);
    });
  }

  /**
   * O OUTRO LADO DA MESMA PROPRIEDADE, e é ele que prova que a dispensa não virou "ignore a primeira
   * palavra": com DUAS palavras sobrando e o léxico batendo, o mesmo verbo não salva nada.
   */
  for (const verbo of VERBOS) {
    it(`"${verbo} <pessoa>" continua FLAGRADO, com o mesmo verbo`, () => {
      expect(nomes(`${verbo} Ana Souza Pereira`).length).toBeGreaterThan(0);
    });
  }

  it("a fronteira é o NÚMERO de palavras que sobra, medida nos dois lados", () => {
    // UMA palavra sobrando: dispensa (é o verbo, o rótulo, o "Cliente", o que for).
    expect(nomes("Cliente ADVANCE BIONICS")).toEqual([]);
    expect(nomes("Unidade São Paulo")).toEqual([]);
    expect(nomes("Matriz Ferraz de Vasconcelos")).toEqual([]);
    // DUAS palavras sobrando, com léxico: FLAGRA, e é isso que impede a dispensa de virar geral.
    expect(nomes("Matriz Ana Souza São Paulo").length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O QUE A SUBTRAÇÃO NÃO PODE ALCANÇAR
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("O LIMITE DA SUBTRAÇÃO: ela é POSICIONAL, e o catálogo não a torna global", () => {
  /**
   * ─ O FURO MAIS PROVÁVEL DESTA CORREÇÃO ────────────────────────────────────────────────────────
   *
   * A implementação barata é "o valor de catálogo aparece EM ALGUM LUGAR do texto, então o segmento
   * está dispensado". Ela passa em quase tudo e vaza aqui: o print de uma tela de cliente mostra o
   * cliente NUMA célula e a pessoa em OUTRA, e as duas estão no mesmo texto auditado. Por isso a
   * subtração é de SPAN (posição), nunca de presença.
   */
  it("valor de catálogo numa célula NÃO dispensa a pessoa de outra célula", () => {
    const texto = "ALCOOL FERREIRA S A · Ana Souza Pereira";
    const v = nomes(texto);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((a) => /Ana Souza Pereira/i.test(a.valor))).toBe(true);
  });

  it("recusa também em linhas separadas, que é como a tabela real desenha", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML =
      `<div class="list">` +
      `<div class="row"><div>ALCOOL FERREIRA S A</div><div>Ana Souza Pereira</div></div>` +
      `</div>`;
    expect(auditarDom(raiz, ALLOWLIST, NEGADOS, VOCABULARIO).aprovado).toBe(false);
  });

  /**
   * ─ O SEGUNDO FURO, E ESTE NASCE COM A CORREÇÃO (não existia na igualdade inteira) ─────────────
   *
   * O catálogo TEM entradas de UMA palavra: `as_cidades` traz "Barbosa", "Cardoso" e "Tarumã"
   * (cidades reais de SP, com sobrenome brasileiro por nome), e razão social de uma palavra é comum.
   * Se uma entrada de uma palavra puder subtrair span, ela PICA o nome de uma pessoa: subtraindo
   * "Barbosa" e "Cardoso" de "Ana Barbosa Cardoso" sobra "Ana", uma palavra só, que morre no
   * `relevantes.length < 2` e DISPENSA o nome de gente. O gate teria trocado um falso positivo por
   * um vazamento.
   *
   * A TRAVA É NÃO SUBTRAIR ENTRADA DE UMA PALAVRA, e ela é de graça: `montarVocabularioDoSistema` já
   * documenta que entrada de uma palavra nunca é consultada, porque o léxico não dispara com uma
   * palavra só. O que era inofensivo na igualdade inteira passa a ser ativo na subtração.
   */
  it("FURO NOVO DA CORREÇÃO: entrada de catálogo de UMA palavra não pode subtrair span", () => {
    const comUmaPalavra = montarVocabularioDoSistema(
      [...CATALOGO, "Barbosa", "Cardoso", "Pereira", "Souza"],
      SEM_NEGADOS,
    );
    const nomesCom = (t: string) =>
      auditarTelaDoManual(t, ALLOWLIST, NEGADOS, comUmaPalavra).achados.filter(
        (a) => a.tipo === "NOME" || a.tipo === "NOME_DE_USUARIO",
      );
    expect(nomesCom("Ana Barbosa Cardoso").length).toBeGreaterThan(0);
    expect(nomesCom("Candidata Ana Souza Pereira").length).toBeGreaterThan(0);
    // E o que a entrada de uma palavra tinha de continuar fazendo (nada) segue igual: a tela de
    // catálogo com a cidade sozinha nunca disparou o léxico e continua passando.
    expect(nomesCom("Barbosa")).toEqual([]);
  });

  it("a subtração não alcança CPF, e-mail, telefone nem valor de rótulo sensível", () => {
    const comLixo = montarVocabularioDoSistema(
      [...CATALOGO, "123.456.789-09", "joao.pereira@gmail.com", "(11) 98765-4321"],
      SEM_NEGADOS,
    );
    const v = auditarTelaDoManual(
      "Selecionar ALCOOL FERREIRA S A 123.456.789-09 joao.pereira@gmail.com (11) 98765-4321",
      ALLOWLIST,
      SEM_NEGADOS,
      comLixo,
    );
    const tipos = new Set(v.achados.map((a) => a.tipo));
    expect(tipos).toContain("CPF");
    expect(tipos).toContain("EMAIL");
    expect(tipos).toContain("TELEFONE");
  });

  /**
   * A DENYLIST CONTINUA GANHANDO DE TUDO, e agora por um caminho novo: com a subtração por span, o
   * nome de um colega COLADO a um valor de catálogo é exatamente a forma que uma dispensa mal feita
   * apagaria. `negadosEncontrados` roda antes e por fora, então ele não tem como ser apagado, e é
   * isto que se confere.
   */
  it("nome de colega COLADO a valor de catálogo continua recusando a imagem", () => {
    const negados: NegadosDeEquipe = {
      nomes: ["Barbara Santos"],
      emails: ["barbara.santos@soulan.com.br"],
    };
    const v = auditarTelaDoManual(
      "Selecionar ALCOOL FERREIRA S A Barbara Santos",
      ALLOWLIST,
      negados,
      montarVocabularioDoSistema(CATALOGO, negados),
    );
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O QUE A TRAVA DE UMA PALAVRA CUSTA, E QUAL É A SAÍDA CERTA
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ┌─ POR QUE O CUSTO DE UMA TRAVA PRECISA DE TESTE, E NÃO SÓ O BENEFÍCIO ────────────────────────┐
 * │ A trava de uma palavra fecha o vazamento (bloco acima) e cobra um preço: a cidade de uma        │
 * │ palavra NUNCA pode ser dispensada, então uma tela legítima continua recusada e o catálogo, pelo │
 * │ caminho normal, não resolve. Quem topar nessa recusa amanhã vai querer afrouxar o filtro, porque │
 * │ é a explicação mais próxima da mão, e aí o vazamento medido volta inteiro.                      │
 * │                                                                                                │
 * │ Então o custo fica escrito, COM A SAÍDA CERTA TRAVADA AO LADO: acrescentar ao catálogo a forma   │
 * │ COMPOSTA que a tela realmente mostra, que tem duas palavras e por isso entra no índice. É o teste │
 * │ que responde "e agora?" para quem chegou aqui com uma tela recusada na mão.                      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("O PREÇO DA TRAVA DE UMA PALAVRA, e a saída que não a afrouxa", () => {
  const UMA_PALAVRA = ["Barbosa", "Cardoso", "Santos", "Oliveira", "Cristina", "Taruma"];
  const comUmaPalavra = montarVocabularioDoSistema([...CATALOGO, ...UMA_PALAVRA], SEM_NEGADOS);
  const nomesCom = (t: string, v = comUmaPalavra) =>
    auditarTelaDoManual(t, ALLOWLIST, NEGADOS, v).achados.filter(
      (a) => a.tipo === "NOME" || a.tipo === "NOME_DE_USUARIO",
    );

  /**
   * CUSTO ZERO MEDIDO COMO VEREDITO IDÊNTICO, que é mais duro que "não recusou nada": para a entrada
   * de uma palavra, o resultado COM catálogo é igual ao resultado SEM catálogo, achado por achado.
   * Ela não dispensava antes e não dispensa agora; o que mudou é que agora ela também não SUBTRAI.
   */
  it("custo zero: para entrada de uma palavra, o veredito é IDÊNTICO com e sem catálogo", () => {
    for (const t of ["Barbosa", "Santos", "Cidade de Barbosa", "Cidade Barbosa", "Ana Barbosa"]) {
      const com = nomesCom(t).map((a) => `${a.tipo}:${a.valor}`);
      // A COMPARAÇÃO É ENTRE IGUAIS: a mesma denylist dos dois lados, e o mesmo filtro de tipo. O que
      // se mede é o efeito do CATÁLOGO, e não a diferença entre duas configurações do gate.
      const sem = auditarTelaDoManual(t, ALLOWLIST, NEGADOS)
        .achados.filter((a) => a.tipo === "NOME" || a.tipo === "NOME_DE_USUARIO")
        .map((a) => `${a.tipo}:${a.valor}`);
      expect(com, `"${t}" tem de valer o mesmo com e sem catálogo`).toEqual(sem);
    }
  });

  /**
   * O PREÇO, ACEITO E MEDIDO: a alternativa era 192 de 192 nomes de duas palavras e 864 de 864 de
   * três palavras sendo dispensados. Falso positivo para o lote é VISTO e conserta-se no roteiro
   * (recorte, outro estado, outra tela); vazamento grava PNG e o git guarda para sempre (§A.6,
   * §A.33). Entre os dois, recusar a cidade é o lado certo do erro.
   */
  /**
   * ─ ESTE PREÇO DEIXOU DE SER COBRADO, PORQUE O DETECTOR FOI DESLIGADO (rodada 4) ──────────────
   *
   * "Cidade Barbosa" não é pessoa e não está em denylist nenhuma: quem a recusava era a INFERÊNCIA
   * por léxico, e ela saiu por ato do diretor. A asserção passa a medir a DORMÊNCIA, com o motivo
   * escrito, em vez de medir um detector que não roda: assim ela não fica verde por vacuidade, e
   * quem religar o detector a encontra vermelha e sabe que mexeu numa decisão.
   */
  it("DORMENTE: a cidade colada a outra capitalizada não é mais recusada (detector desligado)", () => {
    expect(nomesCom("Cidade Barbosa")).toEqual([]);
  });

  it("A SAÍDA CERTA: a forma COMPOSTA no catálogo resolve a tela, sem tocar o filtro", () => {
    const comForma = montarVocabularioDoSistema(
      [...CATALOGO, ...UMA_PALAVRA, "Cidade Barbosa"],
      SEM_NEGADOS,
    );
    expect(nomesCom("Cidade Barbosa", comForma)).toEqual([]);
    // (a primeira linha é dupla-verdade hoje: a forma composta dispensa E o detector está desligado)
    // E sem reabrir o vazamento: o nome de gente com a MESMA palavra segue recusado.
    expect(nomesCom("Ana Barbosa Cardoso", comForma).length).toBeGreaterThan(0);
  });

  /**
   * ─ A ASSERÇÃO QUE CAI PRIMEIRO SE A SUBTRAÇÃO VIRAR CONTENÇÃO ─────────────────────────────────
   *
   * O veto do `seguranca` à contenção continua valendo, e esta é a linha que o mede em vez de o
   * repetir: a loja é dispensada e a pessoa colada nela NÃO é. Se alguém trocar cobertura de span por
   * "achou o valor dentro do trecho, libera o trecho", este teste é o primeiro a ficar vermelho, e é
   * por isso que ele existe separado do bloco posicional: ali o catálogo e a pessoa estão em células
   * diferentes; aqui estão NO MESMO trecho capitalizado, que é o caso em que a contenção é tentadora.
   */
  /**
   * O NOME DE DUAS PALAVRAS É O NÚMERO DE MANCHETE DA MEDIÇÃO (192 de 192 dispensados sem a trava), e
   * ele não está coberto pelo bloco acima, que mede os de três. Aqui as DUAS palavras são entrada de
   * catálogo, então sem a trava não sobraria nada e o nome viraria dispensa total.
   */
  it("nome de DUAS palavras, ambas entradas de uma palavra no catálogo, continua recusado", () => {
    expect(nomesCom("Santos Oliveira").length).toBeGreaterThan(0);
    expect(nomesCom("Cristina Cardoso").length).toBeGreaterThan(0);
    expect(nomesCom("Ana Barbosa").length).toBeGreaterThan(0);
  });

  /**
   * A TRAVA É CIRÚRGICA, e esta é a contrapartida que impede "resolver" o vazamento filtrando demais:
   * a entrada de DUAS palavras continua subtraindo, inclusive quando uma das suas palavras também
   * existe solta no catálogo. Fechar o vazamento não podia custar a correção que o `seguranca`
   * autorizou.
   */
  it("entrada de DUAS palavras continua dispensando ao lado das de uma palavra", () => {
    const comColisao = montarVocabularioDoSistema(
      ["Santos", "Cardoso", "Loja Santos Dumont"],
      SEM_NEGADOS,
    );
    expect(nomesCom("Loja Santos Dumont", comColisao)).toEqual([]);
    // E, no MESMO vocabulário, o nome de gente formado pelas palavras soltas segue recusado.
    expect(nomesCom("Ana Santos Cardoso", comColisao).length).toBeGreaterThan(0);
  });

  it("subtraiu a loja e sobrou GENTE no MESMO trecho: a pessoa continua recusada", () => {
    const v = nomesCom("Loja Sao Pedro Juliana Petrocelli");
    expect(v.length).toBeGreaterThan(0);
    // A BUSCA LITERAL DEVOLVE O VALOR ACHATADO (minúsculas, sem acento), e o léxico devolvia o trecho
    // como está na tela. A comparação passa a ser indiferente à caixa, que é o que sempre importou.
    expect(v.map((a) => a.valor.toLowerCase())).toContain("juliana petrocelli");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// A NORMALIZAÇÃO DA OCORRÊNCIA VERBATIM: onde a implementação ingênua quebra
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ┌─ POR QUE ISTO É UM TESTE E NÃO UM DETALHE ───────────────────────────────────────────────────┐
 * │ A dispensa por igualdade que existe hoje compara `achatar(trecho)` com `achatar(entrada)`, e     │
 * │ portanto já ignora CAIXA e ACENTO (a suíte existente cobra isso: `FERRAZ DE VASCONCELOS` é       │
 * │ dispensado com o catálogo escrito `Ferraz de Vasconcelos`). Uma subtração por span feita com     │
 * │ `indexOf` no texto CRU perde esses casos em silêncio, e uma feita no texto ACHATADO perde a      │
 * │ POSIÇÃO, porque `achatar` remove acento (muda o comprimento) e colapsa espaço.                   │
 * │                                                                                                │
 * │ É o ponto mais provável de defeito da correção, e por isso ele é medido no caso composto (verbo  │
 * │ colado MAIS acento MAIS caixa diferente), que é o único que exige a subtração de verdade.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("A ocorrência é VERBATIM, mas indiferente a CAIXA e ACENTO (como o resto do gate)", () => {
  it("caixa diferente, com verbo colado", () => {
    expect(nomes("Selecionar alcool ferreira s a")).toEqual([]);
    expect(nomes("Editar Ferraz De Vasconcelos")).toEqual([]);
    expect(nomes("Editar FERRAZ DE VASCONCELOS")).toEqual([]);
  });

  it("ACENTO diferente do cadastro, com verbo colado (é aqui que o `indexOf` cru quebra)", () => {
    // Catálogo com acento, tela sem acento.
    expect(nomes("Unidade Sao Paulo")).toEqual([]);
    // Catálogo sem acento (`Loja Sao Pedro`), tela com acento.
    expect(nomes("Selecionar Loja São Pedro")).toEqual([]);
  });

  it("espaço a mais na tela não desfaz a dispensa (a tabela quebra a célula em dois nós)", () => {
    expect(nomes("Selecionar  ALCOOL   FERREIRA S A")).toEqual([]);
  });

  /**
   * O LADO SEGURO, MEDIDO E DECLARADO: pontuação DIFERENTE da cadastrada não é ocorrência verbatim,
   * então nada é subtraído e a tela é RECUSADA. Isto é recusa A MAIS (print a menos, que se refaz),
   * e está escrito para ninguém "consertar" por semelhança: comparar por aproximação é o caminho
   * que faz `ANA SOUZA PEREIRA COMERCIO LTDA` liberar `Ana Souza Pereira`.
   */
  /**
   * O LIMITE CONTINUA VALENDO, e o que mudou é quem o TORNA VISÍVEL: a pontuação diferente segue não
   * sendo ocorrência verbatim, então nada é subtraído. Antes isso aparecia como recusa por léxico;
   * com o detector desligado, aparece quando há PESSOA DA DENYLIST no mesmo trecho, que é o caso em
   * que a subtração indevida custaria caro de verdade.
   */
  it("LIMITE DECLARADO: pontuação diferente da cadastrada não dispensa (lado seguro)", () => {
    // Só o valor de catálogo com pontuação diferente: nada mais recusa, porque não há pessoa ali.
    expect(nomes("Selecionar ALCOOL FERREIRA S.A.")).toEqual([]);
    // Com uma pessoa da denylist colada, a não-dispensa fica visível: ela continua sendo achada.
    expect(nomes("Selecionar ALCOOL FERREIRA S.A. Ana Souza Pereira").length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O QUE NÃO PODE TER REGREDIDO: `textoAuditavel` e `RE_CAPITALIZADO` NÃO FORAM TOCADOS
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A correção foi autorizada DENTRO de `nomesRecusados`, e as duas peças de fora ficaram de pé de
 * propósito. `RE_CAPITALIZADO` não atravessa quebra de linha (senão fabrica nome juntando duas
 * células), e `textoAuditavel` lê valor de campo e nunca lê senha. Mexer nelas para "resolver o
 * prefixo" é o remendo que o `seguranca` mediu e descartou (resolveria 24 dos 47), e é este bloco
 * que acusa se alguém tentar por ali.
 */
describe("AS DUAS PEÇAS QUE NÃO PODEM TER SIDO TOCADAS", () => {
  /**
   * ─ A FRONTEIRA DA QUEBRA DE LINHA: ACHADO DA RODADA 4, CONSERTADO NA RODADA 5 ────────────────
   *
   * A propriedade é a mesma de sempre: duas CÉLULAS que nada têm a ver uma com a outra não podem
   * virar um nome. `textoAuditavel` separa elemento de bloco por `\n`, então a quebra de linha É a
   * fronteira entre células, e atravessá-la é FABRICAR um nome que a tela não mostra.
   *
   * ┌─ A HISTÓRIA FICA ESCRITA, PORQUE ELA É O MOTIVO DE O TESTE SER ASSIM ────────────────────────┐
   * │ O `RE_CAPITALIZADO` do detector de nome respeitava a quebra de linha. Quando o diretor desligou  │
   * │ aquele detector, a DENYLIST ficou sendo a camada que procura nome, e ela normalizava o espaço em  │
   * │ branco: "Joao" numa célula mais "Pereira" na de baixo casavam com o colega "Joao Pereira". Falso  │
   * │ positivo do MESMO tipo do `raful - cozinha`, e o custo não é um print a menos, é a pressão futura  │
   * │ para afrouxar a denylist, que é a proteção que o diretor mandou MANTER.                          │
   * │                                                                                                │
   * │ Este teste ficou VERMELHO por uma rodada, de propósito. Ao reapontar o arquivo para o gate da     │
   * │ imagem (rodada 5) ele virou verde SEM o defeito ter sido consertado, o que é pior que teste       │
   * │ nenhum, porque afirma que está resolvido. Reportado assim ao coordenador, e o conserto entrou:    │
   * │ fronteira dura no `\n` para os TRÊS baldes. Medido em 28/09/2026, nas duas superfícies.          │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * AGORA ELE COBRE OS TRÊS BALDES, e não só o que tinha o defeito: `nomes` (equipe), `nomesDeColuna`
   * (gestor) e `emails`. O conserto foi de uma linha para os três, então o teste que vigia um só
   * deixaria os outros dois livres para regredir na próxima refatoração.
   */
  it("a denylist NÃO atravessa quebra de linha, nos TRÊS baldes e nas DUAS superfícies", () => {
    const balde = (n: NegadosDeEquipe, texto: string) => [
      auditarTelaDoManual(texto, ALLOWLIST, n).achados,
      auditarTextoCompleto(texto, ALLOWLIST, n).achados.filter((a) => a.tipo !== "NOME"),
    ];
    const casos: Array<[string, NegadosDeEquipe, string]> = [
      ["equipe", { nomes: ["Joao Pereira"], emails: [] }, "Joao\nPereira"],
      ["equipe com espaço depois da quebra", { nomes: ["Joao Pereira"], emails: [] }, "Joao\n Pereira"],
      ["coluna (gestor)", { nomes: [], emails: [], nomesDeColuna: ["Ademar Quintanilha"] }, "Ademar\nQuintanilha"],
      ["e-mail", { nomes: [], emails: ["joao.pereira@exemplo.invalid"] }, "joao.pereira@\nexemplo.invalid"],
    ];
    for (const [qual, negados, texto] of casos) {
      for (const achados of balde(negados, texto)) {
        expect(achados, `o balde ${qual} fabricou um achado atravessando a quebra de linha`).toEqual([]);
      }
    }
  });

  /**
   * O CONTROLE, e sem ele o conserto acima poderia ser a denylist DESLIGADA: o mesmo valor, numa
   * célula só, continua sendo achado nos três baldes. A fronteira é a quebra de linha, e não a busca.
   */
  it("CONTROLE: o mesmo valor em UMA célula continua sendo achado nos três baldes", () => {
    expect(
      auditarTelaDoManual("Joao Pereira", ALLOWLIST, { nomes: ["Joao Pereira"], emails: [] }).aprovado,
    ).toBe(false);
    expect(
      auditarTelaDoManual("Gestor BP Ademar Quintanilha", ALLOWLIST, {
        nomes: [],
        emails: [],
        nomesDeColuna: ["Ademar Quintanilha"],
      }).aprovado,
    ).toBe(false);
    expect(
      auditarTelaDoManual("joao.pereira@exemplo.invalid", ALLOWLIST, {
        nomes: [],
        emails: ["joao.pereira@exemplo.invalid"],
      }).aprovado,
    ).toBe(false);
  });

  it("o gate continua lendo valor de campo e NUNCA a senha", () => {
    const raiz = document.createElement("div");
    const campo = document.createElement("input");
    campo.value = "Ana Souza Pereira";
    const senha = document.createElement("input");
    senha.setAttribute("type", "password");
    senha.value = "Ana Souza Pereira";
    raiz.append(campo);
    const v = auditarDom(raiz, ALLOWLIST, NEGADOS, VOCABULARIO);
    expect(v.aprovado).toBe(false);

    const soSenha = document.createElement("div");
    soSenha.append(document.createTextNode("Login"), senha);
    const s = auditarDom(soSenha, ALLOWLIST, SEM_NEGADOS, VOCABULARIO);
    expect(s.achados.some((a) => a.valor.includes("Ana"))).toBe(false);
  });

  it("o payload do `<script>` continua sendo auditado (é onde o dado cru da API mora)", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML =
      `<script type="application/json">{"cliente":"ALCOOL FERREIRA S A","nome":"Ana Souza Pereira"}</script>`;
    const v = auditarDom(raiz, ALLOWLIST, NEGADOS, VOCABULARIO);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME" || a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });
});
