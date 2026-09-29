/**
 * ─ O DETECTOR GENÉRICO DE NOME, DESLIGADO POR ATO DO DIRETOR (rodada 4, 28/09/2026) ──────────────
 *
 * ESCRITO PELO `tester` (§A.38), contra o requisito, com texto INJETADO.
 *
 * ┌─ O FUNDAMENTO É DE NEGÓCIO E ESTÁ TOMADO, E ESTE ARQUIVO NÃO O REABRE ───────────────────────┐
 * │ O manual é INTERNO; quem o lê já acessa o sistema, está coberto por confidencialidade assinada   │
 * │ (LGPD) e JÁ MANIPULA o dado do candidato NA FONTE. O print não mostra a essa pessoa nada que ela  │
 * │ não veja, com mais detalhe, na tela de trabalho dela. A decisão é do diretor.                     │
 * │                                                                                                │
 * │ A PERGUNTA DO `tester` É OUTRA, e é a única que ele tem de responder: o desligamento derruba      │
 * │ junto alguma proteção que o diretor mandou MANTER? Este arquivo mede uma camada por asserção.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O LIMITE DO QUE FOI LIBERADO, ESCRITO AQUI PARA NÃO SER ALARGADO POR ANALOGIA ──────────────┐
 * │ Liberou-se a INFERÊNCIA POR LÉXICO sobre texto solto: "isto tem cara de nome de gente?". Não se   │
 * │ liberou o dado do TIME (denylist de equipe), nem o do GESTOR (dado de terceiro, denylist de       │
 * │ coluna mais a regra de rótulo), nem CPF, e-mail, telefone ou CEP, nem qualquer valor de rótulo.   │
 * │ Cada um desses tem um teste abaixo, e cada teste diz de qual camada ele é.                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FUNÇÃO MEDIDA MUDOU NA RODADA 5, E A MUDANÇA É O VETO DO `seguranca` ──────────────────────┐
 * │ A primeira versão do desligamento era uma CHAVE GLOBAL dentro de `auditarTexto`, que tem QUATRO   │
 * │ consumidores: ela atravessou para `linhaForaDoPadrao` (`lote.ts`) e desligou a dimensão NOME da    │
 * │ ASSERÇÃO DE POPULAÇÃO, que decide se o lote começa. O conserto separou as duas superfícies:        │
 * │   . `auditarTelaDoManual` -> o gate DA IMAGEM, o único lugar onde a chave do diretor vale;         │
 * │   . `auditarTexto`        -> a régua COMPLETA, que a população usa e que continua acusando NOME.   │
 * │ Este arquivo passou a medir a PRIMEIRA, e o bloco 5 mede a SEPARAÇÃO, que é o controle que faltava.│
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes inventados, CPF da faixa `999` com dígito válido para o que é sintético, e-mail
 * `.invalid` ou domínio reservado de documentação. Nenhum dado de pessoa real.
 */
import { describe, expect, it } from "vitest";
import {
  auditarTelaDoManual,
  auditarTexto,
  type AllowlistArnes,
  type NegadosDeEquipe,
} from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["mariana.alves@exemplo.invalid"],
};

const SEM_DENYLIST: NegadosDeEquipe = { nomes: [], emails: [] };

/**
 * OS TEXTOS QUE O LÉXICO PEGAVA, e é por eles que o desligamento se mede: nome de pessoa em prosa, em
 * célula de tabela e em rótulo de botão de linha, que é o padrão de 8 telas do sistema.
 */
const NOME_EM_TELA = [
  "Joaquim Petrocelli Barbosa",
  "Candidato Joaquim Petrocelli Barbosa aprovado na etapa de auditoria",
  "Ver ficha de Joaquim Petrocelli Barbosa",
  "Selecionar Rosangela Petrocelli Barbosa",
];

describe("1. O DESLIGAMENTO FAZ O QUE DIZ", () => {
  it.each(NOME_EM_TELA)("o texto %s é APROVADO no gate DA IMAGEM", (texto) => {
    expect(auditarTelaDoManual(texto, ALLOWLIST).aprovado).toBe(true);
  });

  /**
   * NENHUM ACHADO DE TIPO `NOME`, EM CASO NENHUM. A asserção é sobre o TIPO e não sobre o veredito,
   * porque a tela pode ser recusada por outra camada (foi medido: a tela do gestor recusa por
   * `GESTOR`, não por `NOME`), e um teste de veredito não distinguiria as duas coisas.
   */
  it("`auditarTelaDoManual` não emite achado de tipo NOME em nenhum dos casos medidos", () => {
    const textos = [
      ...NOME_EM_TELA,
      "Gestor BP\nJoaquim Petrocelli Barbosa\nSalário",
      "Rosangela Petrocelli Barbosa",
    ];
    for (const texto of textos) {
      const v = auditarTelaDoManual(texto, ALLOWLIST, {
        nomes: ["Rosangela Petrocelli Barbosa"],
        emails: [],
      });
      expect(v.achados.map((a) => a.tipo), texto).not.toContain("NOME");
    }
  });
});

describe("2. AS PROTEÇÕES QUE FICAM, uma asserção por camada", () => {
  /**
   * ─ CAMADA 1: A DENYLIST DE EQUIPE ───────────────────────────────────────────────────────────
   *
   * O diretor liberou o dado do CANDIDATO, e não o do TIME. A denylist é busca LITERAL, lida das
   * tabelas `usuarios` e `as_comerciais`, e não depende de léxico nenhum: é por isso que ela atravessa
   * o desligamento intacta. Se ela caísse junto, o colega do time voltaria a sair em print, que é
   * exatamente o furo que ela foi criada para fechar.
   */
  it("a denylist de EQUIPE continua recusando o NOME de colega", () => {
    const negados: NegadosDeEquipe = { nomes: ["Rosangela Petrocelli Barbosa"], emails: [] };
    const v = auditarTelaDoManual("Responsável: Rosangela Petrocelli Barbosa", ALLOWLIST, negados);
    expect(v.aprovado).toBe(false);
    expect(v.achados.map((a) => a.tipo)).toContain("NOME_DE_USUARIO");
  });

  it("a denylist de EQUIPE continua recusando o E-MAIL de colega", () => {
    const negados: NegadosDeEquipe = { nomes: [], emails: ["rosangela.barbosa@homolog.invalid"] };
    const v = auditarTelaDoManual("criado por rosangela.barbosa@homolog.invalid", ALLOWLIST, negados);
    expect(v.aprovado).toBe(false);
    expect(v.achados.map((a) => a.tipo)).toContain("EMAIL_DE_USUARIO");
  });

  /**
   * ─ CAMADA 2: A DENYLIST DE COLUNA (o gestor) ────────────────────────────────────────────────
   *
   * Dado de TERCEIRO: o gestor do cliente não assinou confidencialidade nenhuma e não é usuário do
   * sistema, então o fundamento que liberou o candidato NÃO o alcança. Ele fica, e fica num balde
   * próprio (`nomesDeColuna`), porque só `nomes` poda o catálogo.
   */
  it("a denylist de COLUNA continua recusando o valor do gestor", () => {
    const negados: NegadosDeEquipe = { nomes: [], emails: [], nomesDeColuna: ["Ademar Quintanilha"] };
    const v = auditarTelaDoManual("Gestor BP\nAdemar Quintanilha\nSalário", ALLOWLIST, negados);
    expect(v.aprovado).toBe(false);
  });

  /**
   * ─ CAMADA 3: A REGRA DE RÓTULO `GESTOR` ─────────────────────────────────────────────────────
   *
   * Ela usa `pareceNomeDePessoa`, que é o MESMO léxico, por outra porta. Este par de asserções é o que
   * prova que o desligamento foi da CHAMADA genérica e não do léxico: se alguém apagasse
   * `pareceNomeDePessoa` "porque não é mais usado", o primeiro teste cairia.
   */
  it("a regra GESTOR continua recusando gente de verdade ao lado do rótulo", () => {
    const v = auditarTelaDoManual("Gestor / BP\nJoaquim Petrocelli Barbosa\nMotivo", ALLOWLIST, SEM_DENYLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.map((a) => a.tipo)).toContain("GESTOR");
  });

  it.each([
    ["Gestor / BP *\nTempo de contrato\n90 dias", "Tempo de contrato"],
    ["Gestor BP\nUniforme\nSim", "Uniforme"],
  ])("a regra GESTOR continua dispensando o rótulo de campo (%s)", (texto) => {
    expect(auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST).achados).toEqual([]);
  });

  /**
   * ─ CAMADA 4: AS RÉGUAS DE FORMA, E É AQUI QUE O EFEITO COLATERAL SERIA MAIS CARO ────────────
   *
   * CPF, e-mail, telefone e CEP não são inferência: são FORMA, e não passam perto do léxico. Uma tela
   * que era recusada por CPF passar a ser aprovada seria o desligamento tendo alcançado o que ninguém
   * pediu, e o sintoma seria zero, porque a tela simplesmente gravaria.
   */
  it.each([
    ["CPF 123.456.789-09", "CPF"],
    ["contato joao.inventado@empresa.example", "EMAIL"],
    ["telefone (11) 98765-4321", "TELEFONE"],
    ["CEP 01310-100", "CEP"],
  ])("%s continua sendo recusado (%s)", (texto, tipo) => {
    const v = auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.map((a) => a.tipo)).toContain(tipo);
  });

  /**
   * ─ CAMADA 5: `ehTermoDoSistema`, DO LADO DA **DISPENSA** ────────────────────────────────────
   *
   * ┌─ POR QUE ESTE É O TESTE MENOS ÓBVIO DO ARQUIVO ──────────────────────────────────────────────┐
   * │ O léxico tem DOIS usos opostos. Do lado da ACUSAÇÃO ("isto parece gente, recuse") ele foi        │
   * │ desligado. Do lado da DISPENSA ele FICA, e ali ele protege: é o que impede um valor de CATÁLOGO  │
   * │ de liberar uma PESSOA por contenção. O cliente "MARIA SILVA COMERCIO LTDA" contém a colega       │
   * │ "Maria Silva", e sem essa trava a dispensa por vocabulário a tiraria da denylist, em silêncio.   │
   * │ É vazamento MEDIDO, fechado nesta mesma semana, e ele NÃO é alcançado pelo desligamento.        │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("valor de catálogo que CONTÉM uma colega não a dispensa da denylist", () => {
    const negados: NegadosDeEquipe = { nomes: ["Maria Silva"], emails: [] };
    const vocabulario = { valores: ["MARIA SILVA COMERCIO LTDA"] };
    expect(auditarTelaDoManual("Responsável: Maria Silva", ALLOWLIST, negados, vocabulario).aprovado).toBe(false);
    // E nem quando o texto traz o valor do catálogo INTEIRO, que é a forma exata do vazamento medido.
    expect(auditarTelaDoManual("Cliente MARIA SILVA COMERCIO LTDA", ALLOWLIST, negados, vocabulario).aprovado).toBe(false);
  });

  /**
   * ─ CAMADA 6: AS TRÊS RECUSAS DE AMBIENTE ────────────────────────────────────────────────────
   *
   * Elas parecem excesso e são o contrário: tela sem texto é captura que aconteceu antes de a tela
   * carregar, e allowlist vazia é o dia em que o arnês falhou. Falhar ABERTO nesses dois dias é o pior
   * momento possível, e nenhum deles tem relação com léxico.
   */
  it("TELA_VAZIA continua recusando", () => {
    expect(auditarTelaDoManual("", ALLOWLIST, SEM_DENYLIST).achados.map((a) => a.tipo)).toContain("TELA_VAZIA");
  });

  it("ALLOWLIST_VAZIA continua recusando", () => {
    const v = auditarTelaDoManual("qualquer texto de tela", { nomes: [], cpfs: [], emails: [] }, SEM_DENYLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.map((a) => a.tipo)).toContain("ALLOWLIST_VAZIA");
  });
});

describe("3. A REGRA `ENDERECO`: o falso positivo e o seu controle", () => {
  /**
   * O CASO MEDIDO É PROSA DE INTERFACE, e não endereço: `ImportarLojasModal.tsx:219` explica o que a
   * importação faz, o rótulo casa na palavra "endereço" no meio da frase, e o resto da frase era
   * colhido como se fosse o valor do campo. Não havia endereço nenhum na tela.
   */
  it("a frase da janela de importação NÃO vira achado", () => {
    const texto =
      "A leitura entende quais colunas são o nome, o endereço e o código, e você confere e " +
      "corrige antes de gravar. Nada é gravado sem o seu aceite.";
    expect(auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST).achados).toEqual([]);
  });

  /**
   * O CONTROLE, e é ele que separa "consertar o falso positivo" de "desligar a regra": endereço de
   * verdade ao lado do rótulo continua recusando. Três formas, porque a régua tem três sinais (tipo de
   * logradouro, CEP e número depois da vírgula) e uma correção futura pode derrubar um deles sozinho.
   */
  it.each([
    "Endereço: Rua Inventada, 100 - Sao Paulo",
    "Endereço: Avenida Um, 250, sala 4",
    "Logradouro: Rua Sem Numero",
  ])("o endereço de verdade %s continua sendo recusado", (texto) => {
    const v = auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST);
    expect(v.aprovado).toBe(false);
    expect(v.achados.map((a) => a.tipo)).toContain("ENDERECO");
  });

  /**
   * O RESIDUAL, AFIRMADO EM VEZ DE ESCONDIDO: valor sem tipo de logradouro, sem CEP e sem número
   * depois da vírgula não é colhido. É o preço da régua estreita, e está declarado no próprio
   * `pii.ts`. Este teste existe para que o dia em que isso DOER seja uma decisão, e não uma descoberta.
   */
  /**
   * ─ A CLASSE, E NÃO O CASO: RÓTULO SEGUIDO DE PROSA ──────────────────────────────────────────
   *
   * A frase da janela de importação foi o caso MEDIDO, e consertar o caso deixa a classe aberta: toda
   * tela que explica o que faz escreve "endereço" no meio de uma frase, e a próxima delas produziria o
   * mesmo falso positivo com outro texto. Três variantes de prosa, nenhuma delas com endereço nenhum
   * dentro.
   *
   * ┌─ A SEGUNDA VARIANTE FICOU VERMELHA POR UMA RODADA, E O CONSERTO ENTROU ──────────────────────┐
   * │ "O bairro é preenchido automaticamente pelo CEP informado pelo candidato." virava                 │
   * │ `ENDERECO: é preenchido automaticamente pelo CEP informado pelo candidato.`                      │
   * │                                                                                                │
   * │ CAUSA, conferida no código e não deduzida: `RE_TIPO_DE_LOGRADOURO` incluía a palavra SOLTA `cep`,  │
   * │ então a PALAVRA "CEP" no meio de uma frase era sinal de endereço; e `pareceEndereco` aceitava     │
   * │ QUALQUER dígito no trecho. Prosa com a palavra CEP, ou com um número qualquer, depois de um       │
   * │ rótulo de endereço, era colhida. Dói onde importa: a tela que EXPLICA o preenchimento por CEP é a  │
   * │ de importação de lojas e a de cadastro, que o manual precisa fotografar.                          │
   * │                                                                                                │
   * │ Medido em 28/09/2026, depois do conserto: as três variantes de prosa passam, e o CEP como VALOR   │
   * │ do campo continua sendo colhido (ver o controle logo abaixo, que é o que separa conserto de       │
   * │ desligamento).                                                                                  │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it.each([
    "Confira o endereço e o telefone antes de gravar, por favor.",
    "O bairro é preenchido automaticamente pelo CEP informado pelo candidato.",
    "Preencha o logradouro e siga para a etapa seguinte.",
  ])("prosa de interface com rótulo de endereço não vira achado: %s", (texto) => {
    const tipos = auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST).achados.map((a) => a.tipo);
    expect(tipos).not.toContain("ENDERECO");
  });

  /**
   * O CONTROLE DO CONSERTO DO `cep`: tirar a palavra do sinal não pode ter tirado o CEP de verdade. O
   * número do CEP como VALOR do campo continua sendo endereço, com e sem a palavra na frente, e o CEP
   * continua sendo acusado pela régua de forma, que é outra camada e não podia ser alcançada.
   */
  it("CONTROLE: o CEP como VALOR do campo continua sendo colhido", () => {
    for (const texto of ["Endereço: 01310-100", "Endereço: CEP 01310-100"]) {
      const tipos = auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST).achados.map((a) => a.tipo);
      expect(tipos, texto).toContain("ENDERECO");
      expect(tipos, texto).toContain("CEP");
    }
    // E o complemento, que é endereço sem logradouro e sem CEP, segue colhido pelo dígito.
    expect(
      auditarTelaDoManual("Complemento: apto 12", ALLOWLIST, SEM_DENYLIST).achados.map((a) => a.tipo),
    ).toContain("ENDERECO");
  });

  it("RESIDUAL DECLARADO: `Bairro: Centro` não é colhido", () => {
    expect(auditarTelaDoManual("Bairro: Centro", ALLOWLIST, SEM_DENYLIST).achados).toEqual([]);
  });
});

describe("4. ANTI-RESSURREIÇÃO: religar o detector por descuido tem de ACUSAR", () => {
  /**
   * ─ A ASSERÇÃO É DE COMPORTAMENTO, E ESSA É A ESCOLHA ────────────────────────────────────────
   *
   * Um teste de FONTE (procurar a constante `"DESLIGADO"` em `pii.ts`) amarraria a cobertura à forma
   * de escrever a chave, e morreria numa renomeação legítima. O teste de comportamento não: ele diz
   * que texto com nome de pessoa é APROVADO, e qualquer caminho que volte a acusar nome por léxico o
   * derruba, tenha vindo da chave, de uma composição nova em `auditarTexto` ou de uma regra copiada.
   *
   * É o oposto do teste que "continua verde": este é o teste que o religamento QUEBRA, e o motivo da
   * quebra está escrito no nome dele, para quem o encontrar vermelho saber que mexeu numa decisão do
   * diretor, e não num detalhe.
   */
  it("nenhum texto com nome de pessoa é recusado por INFERÊNCIA (só por camada declarada)", () => {
    for (const texto of NOME_EM_TELA) {
      const v = auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST);
      expect(
        v.aprovado,
        `"${texto}" foi recusado: o detector genérico de nome está LIGADO de novo, e isso desfaz um ato do diretor`,
      ).toBe(true);
    }
  });

  /**
   * A SEGUNDA METADE DO MESMO REQUISITO: o desligamento não pode ter levado junto o léxico, senão as
   * duas camadas que dependem dele (`GESTOR` e a dispensa por catálogo) cairiam sem ninguém perceber.
   * Aqui isso é medido pelo efeito, e não pela existência da função.
   */
  it("o LÉXICO continua vivo nas duas camadas que ficaram", () => {
    expect(
      auditarTelaDoManual("Gestor BP\nJoaquim Petrocelli Barbosa\nSalário", ALLOWLIST, SEM_DENYLIST).aprovado,
      "o léxico morreu junto: a regra GESTOR deixou de reconhecer gente",
    ).toBe(false);
    expect(
      auditarTelaDoManual(
        "Responsável: Maria Silva",
        ALLOWLIST,
        { nomes: ["Maria Silva"], emails: [] },
        { valores: ["MARIA SILVA COMERCIO LTDA"] },
      ).aprovado,
      "o léxico morreu junto: o catálogo voltou a dispensar uma pessoa",
    ).toBe(false);
  });
});

describe("5. A SEPARAÇÃO DAS DUAS SUPERFÍCIES (o conserto do veto do `seguranca`)", () => {
  /**
   * ─ ESTE BLOCO É O CONTROLE QUE FALTAVA, E A FALHA DE ALCANCE FOI MINHA ──────────────────────
   *
   * A chave do diretor vale para a IMAGEM do manual. Ela NÃO pode valer para a ASSERÇÃO DE POPULAÇÃO,
   * que roda sobre `candidatos` e sobre as quatro fontes de dado de TERCEIRO, e que existe para o dia
   * do RE-CLONE. As duas superfícies são a MESMA régua menos uma camada, e é justamente por serem
   * quase iguais que uma passa pela outra sem ninguém notar.
   *
   * O TESTE É O MESMO TEXTO NAS DUAS FUNÇÕES, no mesmo `it`: é a forma mais curta de provar que a
   * separação existe, e a que fica vermelha se alguém unificar as duas "para simplificar".
   */
  it("o MESMO texto: aprovado no gate da IMAGEM, recusado na régua COMPLETA", () => {
    const texto = "Candidato: Joaquim Petrocelli Barbosa";
    expect(auditarTelaDoManual(texto, ALLOWLIST).aprovado, "imagem: liberado pelo diretor").toBe(true);
    expect(
      auditarTexto(texto, ALLOWLIST).aprovado,
      "população: a chave do diretor NÃO alcança a trava que decide se o lote começa",
    ).toBe(false);
  });

  it("a régua COMPLETA acusa o tipo NOME, que é a camada que a população não podia perder", () => {
    const v = auditarTexto("Juliana Petrocelli Barbosa", ALLOWLIST);
    expect(v.achados.map((a) => a.tipo)).toContain("NOME");
  });

  /**
   * AS DUAS CONCORDAM EM TUDO O MAIS, e esta asserção existe para impedir a leitura errada de que
   * `auditarTelaDoManual` é "o gate fraco": ele é o gate completo MENOS a inferência por léxico.
   */
  it("fora do léxico, as duas funções dão o MESMO veredito", () => {
    const casos = [
      "CPF 123.456.789-09",
      "contato joao.inventado@empresa.example",
      "telefone (11) 98765-4321",
      "CEP 01310-100",
      "Gestor / BP\nJoaquim Petrocelli Barbosa\nMotivo",
      "Endereço: Rua Inventada, 100",
      "Mariana Alves Ribeiro",
    ];
    for (const texto of casos) {
      const imagem = auditarTelaDoManual(texto, ALLOWLIST, SEM_DENYLIST);
      const completa = auditarTexto(texto, ALLOWLIST, SEM_DENYLIST);
      const so = (v: { achados: { tipo: string }[] }) =>
        [...new Set(v.achados.map((a) => a.tipo))].filter((t) => t !== "NOME").sort();
      expect(so(imagem), texto).toEqual(so(completa));
    }
  });

  /**
   * E A DENYLIST DE EQUIPE VALE NAS DUAS, porque ela não é léxico: é busca literal, e o diretor não a
   * liberou. Se um dia ela sobrar só na régua completa, o print do manual volta a levar colega.
   */
  it("a denylist de equipe recusa nas DUAS superfícies", () => {
    const negados: NegadosDeEquipe = { nomes: ["Rosangela Petrocelli Barbosa"], emails: [] };
    const texto = "Responsável: Rosangela Petrocelli Barbosa";
    expect(auditarTelaDoManual(texto, ALLOWLIST, negados).aprovado).toBe(false);
    expect(auditarTexto(texto, ALLOWLIST, negados).aprovado).toBe(false);
  });
});
