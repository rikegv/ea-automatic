/**
 * ─ O VOCABULÁRIO DO SISTEMA: A DISPENSA QUE NÃO PODE VIRAR PORTA (§A.6, §A.38) ──────────────────
 *
 * ESCRITO PELO `tester`, que não escreveu o gate nem a correção (§A.38). São os dois testes que o
 * `seguranca` condicionou para liberar a captura, mais a conferência das duas afirmações do autor
 * que ninguém tinha validado.
 *
 * ┌─ O PROBLEMA QUE A CORREÇÃO RESOLVE, E O QUE ELA ARRISCA ─────────────────────────────────────┐
 * │ O gate recusava telas legítimas porque topônimo e razão social se confundem com nome de gente: │
 * │ "São Paulo", "Ferraz de Vasconcelos", o nome de uma loja. A correção foi o gate passar a        │
 * │ conhecer os catálogos, lidos do banco (cidade nova entra sozinha, como na denylist).            │
 * │                                                                                                │
 * │ TODA DISPENSA É UMA PORTA, e esta abre numa parede sensível: é o caminho do NOME, que é         │
 * │ justamente o que protege colega de time e candidato real. Por isso os dois testes abaixo não    │
 * │ medem se a dispensa FUNCIONA (isso o autor já mediu): medem se ela NÃO ALCANÇA o que não deve.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from "vitest";
import { montarNegadosDeEquipe, type LinhaPessoa } from "./lote";
import {
  auditarDom,
  auditarTexto,
  montarVocabularioDoSistema,
  type AllowlistArnes,
  type NegadosDeEquipe,
} from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Manual Do Sistema", "Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["manual@homolog.local", "mariana.alves@exemplo.invalid"],
};

/**
 * A COLEGA QUE DÁ NOME A UMA LOJA. O caso não é rebuscado: catálogo de cliente e de loja é cheio de
 * nome de gente ("Clinica Dr Joao Silva"), e o time tem sobrenome comum. É exatamente onde a
 * dispensa por catálogo e a proteção por denylist se encontram.
 */
const USUARIOS: LinhaPessoa[] = [
  { nome: "Manual Do Sistema", email: "manual@homolog.local" },
  { nome: "Barbara Santos", email: "barbara.santos@soulan.com.br" },
];

const CATALOGOS = [
  "Sao Paulo",
  "Ferraz de Vasconcelos",
  "Campinas Parque",
  "Loja Sao Pedro",
  "Maria Silva Comercio Ltda",
  "Barbara Santos", // a loja homônima da colega
  "Clinica Dr Joao Silva Ltda",
];

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (a) O FURO 1: CATÁLOGO NÃO PODE APAGAR GENTE DA DENYLIST
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("PONTA A PONTA: catálogo não apaga ninguém da denylist", () => {
  const negados = montarNegadosDeEquipe(USUARIOS, ALLOWLIST);
  const vocabulario = montarVocabularioDoSistema(CATALOGOS, negados);

  /**
   * ─ O FURO, DESCRITO PELO CAMINHO E NÃO PELA FUNÇÃO ────────────────────────────────────────────
   *
   * A forma óbvia de ensinar os catálogos ao gate seria somá-los a `allow.nomes`. Ela é a errada, e
   * o motivo não está no gate: está em `montarNegadosDeEquipe`, que SUBTRAI da denylist tudo o que o
   * arnês declarou. Catálogo dentro de `allow.nomes` é catálogo declarado, e o usuário homônimo sai
   * da proteção no ato de montá-la. Nenhuma função individual erra: o caminho inteiro é que perde a
   * pessoa, e por isso o teste tem de ser deste caminho.
   */
  it("o nome da colega continua na denylist, mesmo sendo entrada de catálogo", () => {
    expect(negados.nomes).toContain("Barbara Santos");
    expect(negados.emails).toContain("barbara.santos@soulan.com.br");
  });

  it("a tela que mostra o nome dela é RECUSADA, com o catálogo em pé", () => {
    const v = auditarTexto("Loja Barbara Santos", ALLOWLIST, negados, vocabulario);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });

  it("recusada também no `title`, onde o pixel não mostra e o tooltip revela", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<button title="Loja Barbara Santos">Ver</button>`;
    expect(auditarDom(raiz, ALLOWLIST, negados, vocabulario).aprovado).toBe(false);
  });

  /**
   * A SEGUNDA TRAVA, INDEPENDENTE DA PRIMEIRA: mesmo que alguém monte o vocabulário SEM subtrair (um
   * catálogo cru, vindo de outro lugar), a denylist ganha, porque ela é conferida ANTES e POR FORA
   * da dispensa. As duas travas existem porque uma depende de quem monta e a outra não.
   */
  it("com o catálogo CRU, sem subtração nenhuma, a denylist ainda ganha", () => {
    const cru = { valores: [...CATALOGOS] };
    const v = auditarTexto("Loja Barbara Santos", ALLOWLIST, negados, cru);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });

  /**
   * ─ O FURO PROVADO, PARA A ARQUITETURA NÃO PODER VOLTAR ATRÁS ──────────────────────────────────
   *
   * Aqui o catálogo é somado a `allow.nomes`, que é o desenho recusado, e a colega SOME da denylist.
   * Repare no que sobra: o e-mail continua lá. É isso que torna o furo silencioso, porque a tela que
   * mostra e-mail continuaria recusando, e só a tela que mostra SÓ O NOME (a maioria) passaria. Se
   * alguém um dia unificar catálogo e allowlist, é esta asserção que muda de significado e os testes
   * acima é que ficam vermelhos.
   */
  it("prova do desenho recusado: catálogo dentro de `allow.nomes` APAGA a colega da denylist", () => {
    const comCatalogoNaAllowlist: AllowlistArnes = {
      ...ALLOWLIST,
      nomes: [...ALLOWLIST.nomes, ...CATALOGOS],
    };
    const perdidos = montarNegadosDeEquipe(USUARIOS, comCatalogoNaAllowlist);
    expect(perdidos.nomes).not.toContain("Barbara Santos");
    expect(perdidos.emails).toContain("barbara.santos@soulan.com.br"); // o que esconderia o furo
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// (b) O FURO 2: DISPENSA PELO VALOR INTEIRO, NUNCA POR PEDAÇO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("PEDAÇO DE CATÁLOGO não é dispensado (a dispensa é pelo valor inteiro)", () => {
  const SEM_NEGADOS: NegadosDeEquipe = { nomes: [], emails: [] };
  const vocabulario = montarVocabularioDoSistema(CATALOGOS, SEM_NEGADOS);
  /**
   * ─ A MEDIÇÃO PASSOU PARA A CAMADA QUE FICOU (rodada 4, 28/09/2026) ───────────────────────────
   *
   * O detector genérico de nome por léxico foi DESLIGADO por ato do diretor (o manual é INTERNO; ver
   * `DETECTOR_GENERICO_DE_NOME` em `pii.ts`). A pergunta deste bloco, porém, não era sobre o léxico:
   * era "um valor de CATÁLOGO pode liberar uma PESSOA por contenção?", e ela vale igual para o colega
   * do time, que a DENYLIST procura literalmente e que o diretor NÃO liberou.
   *
   * Então as pessoas das fixtures entram na denylist, e o tipo esperado do achado muda de `NOME`
   * (inferência) para `NOME_DE_USUARIO` (busca literal). A propriedade medida é a mesma, e agora ela
   * é medida contra um caminho que roda.
   */
  const PESSOAS: NegadosDeEquipe = {
    nomes: ["Maria Silva", "Joao Silva", "Juliana Petrocelli", "Sao Pedro Alves"],
    emails: [],
  };
  /**
   * DOIS HELPERS, E A SEPARAÇÃO É O PONTO: a metade da DISPENSA roda SEM denylist (o valor de catálogo
   * sozinho tem de ser aprovado), e a metade do PEDAÇO roda COM o time na denylist (é lá que se prova
   * que o catálogo não libera uma pessoa). Um helper só para as duas metades mediria uma configuração
   * que a operação nunca tem, e uma das duas ficaria errada.
   */
  const achados = (t: string) => auditarTexto(t, ALLOWLIST, SEM_NEGADOS, vocabulario).achados;
  const achadosComTime = (t: string) => auditarTexto(t, ALLOWLIST, PESSOAS, vocabulario).achados;
  const ehNome = (a: { tipo: string }) => a.tipo === "NOME" || a.tipo === "NOME_DE_USUARIO";

  /**
   * O CAMINHO DA ALLOWLIST DO ARNÊS DISPENSA POR CONTENÇÃO, de propósito (a coluna estreita corta o
   * nome declarado). O catálogo NÃO pode herdar essa leniência: "MARIA SILVA COMERCIO LTDA" é razão
   * social, e liberar o pedaço "Maria Silva" liberaria o nome de uma pessoa de verdade. Catálogo
   * homônimo de gente é a regra no cadastro de clientes, não a exceção.
   */
  it("o valor INTEIRO é dispensado, e o PEDAÇO dele continua recusado", () => {
    expect(achados("Maria Silva Comercio Ltda")).toEqual([]);
    expect(achadosComTime("Candidata Maria Silva").some(ehNome)).toBe(true);
  });

  it("o pedaço continua recusado mesmo sendo o começo exato da entrada", () => {
    expect(achados("Clinica Dr Joao Silva Ltda")).toEqual([]);
    expect(achadosComTime("Joao Silva").some(ehNome)).toBe(true);
    expect(achadosComTime("Dr Joao Silva").some(ehNome)).toBe(true);
  });

  /**
   * ─ O QUE SOBRA DEPOIS DA SUBTRAÇÃO PASSA PELA MESMA RÉGUA, E É SÓ ISSO QUE MUDOU ──────────────
   *
   * Antes, a entrada contida num trecho maior não dispensava nada e a tela era recusada. Agora o
   * span do catálogo é subtraído e a régua de nome é reaplicada, IDÊNTICA, ao que sobra: de "Maria
   * Silva Comercio Ltda Matriz" sobra "Matriz", uma palavra só, que morre no mesmo
   * `relevantes.length < 2` que já existia. Não é uma exceção nova; é a régua antiga aplicada ao
   * resto.
   */
  it("o que sobra da subtração é reavaliado pela régua de sempre: uma palavra não é nome", () => {
    expect(achados("Maria Silva Comercio Ltda Matriz")).toEqual([]);
  });

  /**
   * O TESTE QUE PROVA QUE A SUBTRAÇÃO NÃO É UMA DISPENSA DISFARÇADA: o que sobra é o nome de uma
   * PESSOA, de duas palavras, e ele continua recusado. A loja é dispensada; a candidata ao lado dela
   * não é. Se a correção tivesse virado "achou catálogo no trecho, libera o trecho", esta asserção
   * seria a primeira a cair.
   */
  it("subtraiu a loja e sobrou GENTE: a pessoa ao lado continua recusada", () => {
    const r = achadosComTime("Loja Sao Pedro Juliana Petrocelli");
    expect(r.some(ehNome)).toBe(true);
    // A busca literal devolve o valor ACHATADO; o léxico devolvia o trecho como está na tela.
    expect(r.map((a) => a.valor.toLowerCase())).toContain("juliana petrocelli");
  });

  it("a dispensa ignora caixa e acento, que é do cadastro e não do dado", () => {
    expect(achados("MARIA SILVA COMERCIO LTDA")).toEqual([]);
    expect(achados("Ferraz De Vasconcelos")).toEqual([]);
    expect(achados("FERRAZ DE VASCONCELOS")).toEqual([]);
  });

  /**
   * ─ O LIMITE QUE EU MEDI FOI REMOVIDO, E ESTE BLOCO AGORA AFIRMA O CONTRÁRIO ───────────────────
   *
   * ┌─ O QUE ERA, E POR QUE MUDAR FOI CERTO ───────────────────────────────────────────────────────┐
   * │ Na rodada anterior eu medi que a dispensa era por TRECHO CAPITALIZADO INTEIRO, então uma        │
   * │ palavra capitalizada encostada a desfazia: "Sao Paulo" passava e "Unidade Sao Paulo" era        │
   * │ RECUSADA. Aquilo era o lado seguro do erro, e eu o registrei como limite em vez de defeito.    │
   * │ Mas recusa demais é o que faz o lote parar, e lote parado é o que gera pressão para afrouxar o │
   * │ gate, que é o extremo oposto e o pior dos dois (§A.6). Célula de tabela cola rótulo e valor    │
   * │ todo dia, então o limite ia aparecer em escala.                                               │
   * │                                                                                               │
   * │ O VETO À CONTENÇÃO CONTINUA VALENDO, E NÃO FOI ELE QUE CEDEU. A correção não é "achou o valor  │
   * │ dentro do trecho, libera o trecho": é COBERTURA DE SPAN, que subtrai do trecho exatamente o    │
   * │ pedaço onde o valor do catálogo aparece VERBATIM, naquele lugar do texto, e reaplica a régua de │
   * │ nome ao que sobra. A diferença é o que os dois testes acima medem: o resto é REAVALIADO, e      │
   * │ quando o resto é gente a tela continua recusada. Contenção liberaria o trecho inteiro.         │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("palavra capitalizada encostada NÃO desfaz mais a dispensa (o limite foi removido)", () => {
    expect(achados("Sao Paulo")).toEqual([]);
    expect(achados("Unidade Sao Paulo")).toEqual([]);
    expect(achados("Loja Sao Pedro")).toEqual([]);
    expect(achados("Loja Sao Pedro Matriz")).toEqual([]);
  });

  it("separador e minúscula NÃO desfazem a dispensa: o trecho capitalizado é o mesmo", () => {
    expect(achados("Cliente: Maria Silva Comercio Ltda")).toEqual([]);
    expect(achados("cliente Maria Silva Comercio Ltda")).toEqual([]);
    expect(achados("Sao Paulo - SP")).toEqual([]);
  });

  /**
   * O QUE O CATÁLOGO NÃO DISPENSA DE JEITO NENHUM: ele vale só para NOME. Cidade não tem CPF, e uma
   * dispensa estreita vira larga exatamente assim, quando alguém a transforma num saco de
   * "permitidos".
   */
  it("catálogo NÃO dispensa CPF, e-mail, telefone nem valor de rótulo sensível", () => {
    const comLixo = montarVocabularioDoSistema(
      [...CATALOGOS, "123.456.789-09", "joao.pereira@gmail.com", "(11) 98765-4321", "R$ 7.320,45"],
      SEM_NEGADOS,
    );
    const v = auditarTexto(
      "123.456.789-09 · joao.pereira@gmail.com · (11) 98765-4321 · Salário: R$ 7.320,45",
      ALLOWLIST,
      SEM_NEGADOS,
      comLixo,
    );
    const tipos = new Set(v.achados.map((a) => a.tipo));
    expect(tipos).toContain("CPF");
    expect(tipos).toContain("EMAIL");
    expect(tipos).toContain("TELEFONE");
    expect(v.aprovado).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// AS DUAS AFIRMAÇÕES DO AUTOR, CONFERIDAS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("AFIRMAÇÃO 1: a subtração por contenção existe, e a inversão de direção está certa", () => {
  const negados: NegadosDeEquipe = {
    nomes: ["Joao Silva Pereira", "Barbara Santos"],
    emails: ["joao.silva@soulan.com.br"],
  };

  it("CONFIRMADA: entrada de catálogo que CONTÉM nome da denylist é descartada na montagem", () => {
    const v = montarVocabularioDoSistema(CATALOGOS, negados);
    expect(v.valores).not.toContain("Clinica Dr Joao Silva Ltda");
    expect(v.valores).not.toContain("Barbara Santos");
  });

  /**
   * A INVERSÃO É O PONTO, e ela está certa: na DISPENSA, contenção é leniência (libera um pedaço),
   * então é proibida; na SUBTRAÇÃO, contenção é RIGOR (descarta mais), então é o que se usa. A mesma
   * palavra descreve as duas operações e elas puxam para lados opostos, que é o tipo de simetria
   * falsa que faz alguém "uniformizar" as duas e abrir a porta sem perceber.
   */
  it("CONFIRMADA a inversão: o descarte faz a tela voltar a ser RECUSADA, que é o certo", () => {
    const v = montarVocabularioDoSistema(CATALOGOS, negados);
    const r = auditarTexto("Cliente Clinica Dr Joao Silva Ltda", ALLOWLIST, negados, v);
    expect(r.aprovado).toBe(false);
  });

  it("o descarte é CIRÚRGICO: as outras entradas do catálogo continuam dispensando", () => {
    const v = montarVocabularioDoSistema(CATALOGOS, negados);
    expect(v.valores).toContain("Sao Paulo");
    expect(v.valores).toContain("Ferraz de Vasconcelos");
    expect(auditarTexto("Ferraz de Vasconcelos", ALLOWLIST, negados, v).aprovado).toBe(true);
  });

  it("sem ninguém na denylist, nada é descartado (a subtração não inventa recusa)", () => {
    const v = montarVocabularioDoSistema(CATALOGOS, { nomes: [], emails: [] });
    expect(v.valores).toHaveLength(CATALOGOS.length);
  });
});

describe("AFIRMAÇÃO 2: o exemplo do `seguranca`, conferido token a token", () => {
  const SEM_NEGADOS: NegadosDeEquipe = { nomes: [], emails: [] };

  /**
   * CONFIRMADO, e a correção do autor procede: "Candidata Campinas Parque contratada" é aprovado
   * COM e SEM catálogo, porque "Campinas" e "Parque" não estão no léxico de prenome nem de
   * sobrenome, então o detector de nome nunca dispara ali. O exemplo não provava o que se queria que
   * ele provasse.
   */
  it("CONFIRMADA: `Candidata Campinas Parque contratada` é aprovado com e sem catálogo", () => {
    expect(auditarTexto("Candidata Campinas Parque contratada", ALLOWLIST, SEM_NEGADOS).aprovado).toBe(
      true,
    );
    const v = montarVocabularioDoSistema(CATALOGOS, SEM_NEGADOS);
    expect(
      auditarTexto("Candidata Campinas Parque contratada", ALLOWLIST, SEM_NEGADOS, v).aprovado,
    ).toBe(true);
  });

  /**
   * CONFIRMADO: quem dispara na loja é "Pedro", que está no léxico. É este o caso em que a dispensa
   * por catálogo faz trabalho de verdade, e é ele, e não o de Campinas, que prova que a trava do
   * VALOR INTEIRO está segurando: a loja inteira é dispensada, e o pedaço com o prenome não é.
   */
  /**
   * ─ A PRIMEIRA METADE DESTA ASSERÇÃO FICOU DORMENTE, E A SEGUNDA É QUE IMPORTAVA ──────────────
   *
   * Quem disparava em `Loja Sao Pedro` era o prenome "Pedro", pelo léxico, e o léxico foi desligado
   * pelo diretor: a loja passa a ser aprovada por DOIS motivos (dispensa por catálogo e detector
   * desligado), e afirmar que ela dispara viraria afirmar um detector que não roda.
   *
   * A TRAVA DO VALOR INTEIRO, que é o que este teste existe para medir, continua medida na camada que
   * ficou: a pessoa cujo nome CONTÉM o pedaço do catálogo segue recusada pela denylist.
   */
  it("A TRAVA DO VALOR INTEIRO em pé: o catálogo dispensa a loja e NÃO a pessoa ao lado", () => {
    const v = montarVocabularioDoSistema(CATALOGOS, SEM_NEGADOS);
    /**
     * O COLEGA DA FIXTURE NÃO PODE TER VARIANTE IGUAL A UM VALOR DE CATÁLOGO, e isso é um achado em si:
     * com "Sao Pedro Alves" na denylist, a variante "Sao Pedro" casa dentro de "Loja Sao Pedro" e a
     * própria tela de catálogo é recusada. Não é defeito do teste, é o custo aceito da denylist (ela
     * procura variantes de duas palavras e o vocabulário não dispensa termo que PARECE gente, por
     * `ehTermoDoSistema`). Aqui a fixture evita a colisão para medir a trava do valor inteiro, que é o
     * assunto deste teste; a colisão em si está reportada ao coordenador.
     */
    const time: NegadosDeEquipe = { nomes: ["Pedro Alves Quintanilha"], emails: [] };
    expect(auditarTexto("Loja Sao Pedro", ALLOWLIST, time, v).achados).toEqual([]);
    expect(auditarTexto("Pedro Alves Quintanilha", ALLOWLIST, time, v).aprovado).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O CPF DENTRO DE TOKEN COM LETRA: A PROTEÇÃO DO `<script>` CONTINUA DE PÉ?
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ┌─ POR QUE ESTA MUDANÇA ENCOSTA NUM TESTE QUE EU TRAVEI DE PROPÓSITO ──────────────────────────┐
 * │ O falso positivo vinha do payload que o Next embute na página (`static/chunks/...js`), e a      │
 * │ saída óbvia seria parar de auditar `<script>`. Essa saída está FECHADA, porque é dentro do      │
 * │ script que o Next embute a RESPOSTA CRUA DA API, com nome e CPF de verdade, e é o indicador     │
 * │ mais forte de que a captura não é do arnês. Então a correção só podia mexer no reconhecimento   │
 * │ do que é um número APRESENTADO, e é isso que se confere aqui.                                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("CPF: o conserto do falso positivo não pode ter reaberto o script", () => {
  const SEM_NEGADOS: NegadosDeEquipe = { nomes: [], emails: [] };
  const tipos = (t: string) =>
    auditarTexto(t, ALLOWLIST, SEM_NEGADOS).achados.map((a) => a.tipo);

  it("A PROTEÇÃO DO `<script>` CONTINUA DE PÉ: payload com nome e CPF recusa", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<script type="application/json">{"nome":"Juliana Petrocelli Barbosa","cpf":"12345678909"}</script>`;
    // O NOME DO PAYLOAD É DE COLEGA, e não de candidato: é a camada que o diretor NÃO liberou, e é
    // ela que continua provando que o `<script>` segue sendo auditado. O CPF, que é forma, não mudou.
    const v = auditarDom(raiz, ALLOWLIST, { nomes: ["Juliana Petrocelli Barbosa"], emails: [] });
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "CPF")).toBe(true);
    expect(v.achados.some((a) => a.tipo === "NOME_DE_USUARIO")).toBe(true);
  });

  it("o hash de build deixou de ser lido como CPF (era o falso positivo)", () => {
    expect(tipos("static/chunks/9699-45b7d19899567558.js")).toEqual([]);
  });

  it("CONFIRMADA: a forma COM MÁSCARA colada a um rótulo continua recusando", () => {
    expect(tipos("CPF123.456.789-09")).toContain("CPF");
  });

  /**
   * ─ INVERTIDA NA RODADA 5, E A INVERSÃO É UM CONSERTO QUE O CONSTRUTOR FEZ ────────────────────
   *
   * Antes, QUALQUER run de 11 dígitos era lido como CPF, e por isso um pedaço de hash de build e um
   * TELEFONE de 11 dígitos recusavam a tela. A régua passou a exigir DÍGITO VERIFICADOR VÁLIDO, que é
   * a única propriedade que separa um CPF de onze dígitos quaisquer.
   *
   * O PAR É O QUE TORNA ISTO SEGURO: o run inválido passa, e o CPF de verdade continua sendo acusado,
   * inclusive colado a rótulo. Sem a segunda metade, esta asserção seria um afrouxamento.
   */
  it("run de 11 dígitos com dígito verificador INVÁLIDO não é CPF (hash, telefone)", () => {
    expect(tipos("hash 19899567558")).not.toContain("CPF");
    expect(tipos("telefone 11987654321")).not.toContain("CPF");
  });

  it("CONTROLE: CPF de verdade continua sendo acusado, com e sem rótulo", () => {
    expect(tipos("12345678909")).toContain("CPF");
    expect(tipos("CPF: 123.456.789-09")).toContain("CPF");
  });

  /**
   * ─ O CONTROLE MAIS DURO DO CONSERTO: O CPF **PARTIDO EM DOIS ELEMENTOS** ─────────────────────
   *
   * A tabela da casa quebra a célula em dois nós (`<span>123.456.</span><span>789-09</span>`), e é
   * para isso que `textoAuditavel` existe: ele CONCATENA, e o CPF só aparece depois da concatenação.
   * Exigir dígito verificador válido não pode ter mudado esse caminho, senão o conserto do falso
   * positivo teria aberto o vazamento que o gate foi escrito para pegar.
   */
  it("CONTROLE: CPF partido em dois elementos continua sendo acusado", () => {
    const raiz = document.createElement("div");
    raiz.innerHTML = `<span>123.456.</span><span>789-09</span>`;
    const v = auditarDom(raiz, ALLOWLIST, SEM_NEGADOS);
    expect(v.aprovado).toBe(false);
    expect(v.achados.some((a) => a.tipo === "CPF")).toBe(true);
  });

  /**
   * E O CPF SINTÉTICO DECLARADO CONTINUA PASSANDO, senão o conserto viraria um lote que não começa: a
   * família `999` é o que o arnês escreve, e o dígito dela é válido de propósito.
   */
  it("CONTROLE: o CPF sintético declarado pelo arnês continua passando", () => {
    expect(tipos("99900000191")).not.toContain("CPF");
  });

  /**
   * ─ O RESIDUAL, MEDIDO E ESCRITO PARA NÃO SER CONFUNDIDO COM COBERTURA ─────────────────────────
   *
   * Dígitos CRUS colados a uma letra passam, e é o preço declarado da correção. O caso realista
   * (payload JSON) tem aspas em volta e continua sendo pego, e por isso o preço é aceitável. Mas o
   * limite é este, e quem ler o teste acima não pode sair achando que "CPF colado a rótulo" está
   * coberto: a forma com máscara está, a crua não.
   */
  it("RESIDUAL DECLARADO: 11 dígitos crus colados a uma letra passam", () => {
    expect(tipos("cpf12345678909")).toEqual([]);
    // O mesmo dado, do jeito que ele realmente aparece no payload, continua sendo pego.
    expect(tipos(`"cpf":"12345678909"`)).toContain("CPF");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// O FILTRO DE UMA PALAVRA MORA EM `dispensa-por-span.tester.spec.ts` (consolidado)
// ────────────────────────────────────────────────────────────────────────────────────────────────

/*
 * A trava de uma palavra (entrada de catálogo de uma palavra não subtrai span, para não PICAR nome
 * de gente) estava medida AQUI e também em `dispensa-por-span.tester.spec.ts`, escrita por duas
 * sessões `tester` paralelas. Foi consolidada lá, que é o arquivo dedicado à dispensa por span, e a
 * cópia daqui foi removida.
 *
 * DUAS CÓPIAS DA MESMA REGRA DIVERGEM NO PRIMEIRO AJUSTE, e é o mesmo argumento que tirou `alvos` e
 * `preparo` do `Print`. Em teste de SEGURANÇA é pior que em conteúdo: as duas seguem VERDES medindo
 * coisas diferentes, e ninguém sabe mais qual é a régua. As três asserções que só existiam aqui
 * foram levadas inteiras: o PREÇO da trava (cidade de uma palavra nunca é dispensada) com a SAÍDA
 * certa ao lado (a forma composta no catálogo), o custo zero medido como veredito IDÊNTICO com e sem
 * catálogo, e o "sobrou GENTE no mesmo trecho", que é a asserção que cai primeiro se a cobertura de
 * span virar contenção.
 *
 * O QUE CONTINUA AQUI é o que este arquivo mede de outro ângulo: a FIAÇÃO do vocabulário (quem monta,
 * quem subtrai, quem ganha de quem) e as afirmações do autor conferidas uma a uma.
 */
