/**
 * ─ A RÉGUA POR FONTE DE COLUNA: ASSERÇÃO, DENYLIST, LIBERADA (OST do desbloqueio, 28/09/2026) ────
 *
 * ESCRITO PELO `tester` CONTRA O REQUISITO (§A.38), em paralelo com quem constrói (§A.40 regra 2).
 * Nenhuma asserção aqui consulta o banco: as linhas são INJETADAS. Um teste que lesse a homologação
 * ficaria verde POR SORTE (verde hoje porque a base está anonimizada, mudo no dia do re-clone, que é
 * justamente o dia em que ele tinha de gritar).
 *
 * ┌─ O QUE A DECISÃO DO DIRETOR MUDOU, E O QUE ELA DELIBERADAMENTE NÃO MUDOU ────────────────────┐
 * │ MUDOU: quatro fontes deixaram de BARRAR o lote. Três por serem dado de candidato/processo       │
 * │ (`dados_vaga_folha.motivo`, `sala_espera`, `as_candidatos`), e uma por ser PII de TERCEIRO que    │
 * │ tem de continuar protegida sem travar a captura (`dados_vaga_folha.gestor_bp`).                 │
 * │ NÃO MUDOU: `candidatos` continua na régua estrita de população, e o gestor continua com proteção  │
 * │ (é o que o diretor mandou MANTER). O INSTRUMENTO dela, porém, mudou duas vezes em 28/09/2026: saiu │
 * │ da DENYLIST para a régua `ROTULO` (rodada 3) e VOLTOU à DENYLIST na rodada 4, agora como uma de    │
 * │ DUAS camadas, ao lado da regra de rótulo com `exigeFormaDeNome`. Este arquivo segue a ÁRVORE, e a  │
 * │ cobertura das duas camadas juntas é medida em `regra-de-rotulo-do-gestor.tester.spec.ts`.          │
 * │                                                                                                │
 * │ A distinção que este arquivo existe para travar é a do MEIO: "não reprova", "não é lida" e "não   │
 * │ é protegida" são TRÊS coisas diferentes, e confundi-las é o defeito provável. Para um lado,       │
 * │ desliga-se a proteção do gestor achando que se afrouxou a asserção; para o outro, um nome de      │
 * │ candidato entra na denylist e arrasta um colega homônimo para fora dela.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhuma fixture aqui é dado de pessoa real. Nome inventado, CPF da faixa `999` com dígito
 * válido, e-mail em `.invalid`.
 */
import { describe, expect, it, vi } from "vitest";
import {
  COLUNAS_DE_PESSOA,
  type ColunaDePessoa,
  conferirBaseAntesDoLote,
  type DependenciasLote,
  type LinhaPessoa,
  montarNegadosDeEquipe,
  nomeExibidoDoEmail,
  REGUA_DAS_COLUNAS_DE_PESSOA,
  type ReguaDaColunaDePessoa,
  type TabelaDePessoas,
} from "./lote";
import type { AllowlistArnes } from "./pii";

/** O que o ARNÊS declarou ter criado. É a única fonte legítima de "pode aparecer". */
const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["mariana.alves@exemplo.invalid"],
};

const CANDIDATOS_SINTETICOS: LinhaPessoa[] = [
  { nome: "Mariana Alves Ribeiro", cpf: "99900000191", email: "mariana.alves@exemplo.invalid" },
];

/** A conta de captura, declarada pelo arnês: ela aparece em toda tela e não é de ninguém. */
const USUARIOS: LinhaPessoa[] = [{ nome: "Mariana Alves Ribeiro", email: "mariana.alves@exemplo.invalid" }];

/**
 * A LINHA SUJA, uma só, e é isso que basta: a régua de asserção é de POPULAÇÃO, então uma linha fora
 * do padrão sintético reprova o lote inteiro. Nome inventado, sem CPF e sem e-mail: o que reprova é a
 * FORMA DE NOME DE PESSOA, que é o que a coluna de pessoa carrega no mundo real.
 */
const LINHA_SUJA: LinhaPessoa = {
  nome: "Juliana Petrocelli Barbosa",
  /**
   * ─ O E-MAIL ENTROU NA FIXTURE NA RODADA 4, E O MOTIVO É DE CONTRATO, NÃO DE CONVENIÊNCIA ──────
   *
   * A linha "suja" era suja só pelo NOME, e quem a reprovava era o detector genérico de nome por
   * léxico, DESLIGADO por ato do diretor (o manual é interno; ver `DETECTOR_GENERICO_DE_NOME`). Sem
   * o e-mail, a fixture passaria a ser LIMPA e todos os testes de ASSERÇÃO ficariam verdes por
   * vacuidade, medindo uma trava de população que não travaria mais nada.
   *
   * O e-mail é de domínio RESERVADO para documentação (`example`), fora da família `.invalid` que o
   * gate dispensa: ele não é de ninguém (§A.6) e é recusado por FORMA, que é camada que o ato do
   * diretor não tocou. A trava de população continua medida, com o instrumento que sobreviveu.
   */
  email: "juliana.barbosa@empresa.example",
};

/** O gestor do cliente: PII de TERCEIRO. Nome mais e-mail, como as 94 linhas medidas na homologação. */
const GESTOR: LinhaPessoa = {
  nome: "Ademar Quintanilha Fonseca",
  email: "ademar.quintanilha@exemplo.invalid",
};

type Amostras = Partial<Record<ColunaDePessoa, LinhaPessoa[]>>;

/**
 * O ESPIÃO DA LEITURA VEM DE FÁBRICA, e não é enfeite: metade do requisito desta OST é sobre a fonte
 * que NÃO deve ser sequer consultada, e isso não se mede pelo veredito, só pela chamada.
 */
function montar(amostras: Amostras = {}, over: Partial<DependenciasLote> = {}) {
  const amostrarColunaDePessoa = vi.fn(async (fonte: ColunaDePessoa) => amostras[fonte] ?? []);
  const deps: DependenciasLote = {
    allowlist: ALLOWLIST,
    amostrarColunaDePessoa,
    amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
      t === "candidatos" ? CANDIDATOS_SINTETICOS : USUARIOS,
    ),
    reguaDeUsuarios: "DETECCAO_POR_IMAGEM",
    ...over,
  };
  return { deps, amostrarColunaDePessoa };
}

const comRegua = (r: ReguaDaColunaDePessoa) =>
  COLUNAS_DE_PESSOA.filter((f) => REGUA_DAS_COLUNAS_DE_PESSOA[f] === r);

describe("REGUA_DAS_COLUNAS_DE_PESSOA: a declaração, fonte por fonte", () => {
  /**
   * O CONTRATO ESCRITO, LITERAL. Trocar a régua de uma fonte é decisão do diretor, com medição, e não
   * ajuste de implementação: por isso ele está afirmado valor a valor, e não derivado de conjuntos.
   */
  it("declara exatamente a régua que o diretor decidiu em 28/09/2026", () => {
    expect(REGUA_DAS_COLUNAS_DE_PESSOA).toEqual({
      /**
       * ─ ESTE VALOR MUDOU DUAS VEZES EM UMA TARDE, E O QUE ESTÁ AQUI É O QUE A ÁRVORE DIZ ────────
       *
       * Rodada 3 tirou o gestor da `DENYLIST` e o pôs em `ROTULO` (a denylist era inerte para os 41
       * valores de UMA palavra, custava centenas de segundos por roteiro e recusava tela por falso
       * positivo). Rodada 4 o DEVOLVEU à `DENYLIST` e, no mesmo ato, pôs `exigeFormaDeNome` na regra
       * de rótulo, passando a tratar as duas como CAMADAS que se cobrem.
       *
       * O `tester` segue a ÁRVORE, medida em 28/09/2026 13:37, e não a briefing de nenhuma das duas
       * rodadas: o que protege a operação é o que está no código. A pergunta que sobra é do
       * coordenador, e ela está no relatório: as duas camadas juntas NÃO cobrem o valor de uma palavra
       * nem o nome que o léxico não conhece, e isso está provado em
       * `regra-de-rotulo-do-gestor.tester.spec.ts`.
       */
      "dados_vaga_folha.gestor_bp": "DENYLIST",
      "dados_vaga_folha.motivo": "LIBERADA",
      "sala_espera": "LIBERADA",
      "as_candidatos": "LIBERADA",
      "dados_vaga_folha.substituido": "ASSERCAO",
      "assinante_empresa": "ASSERCAO",
      "admissao_dados_gi.filiacao": "ASSERCAO",
      "vagas.solicitante": "ASSERCAO",
    });
  });

  /**
   * ─ O ANTI-ESQUECIMENTO, E O QUE O TYPECHECK **NÃO** PEGA ────────────────────────────────────
   *
   * Um `Record<ColunaDePessoa, ...>` cobra a chave que FALTA, e é por isso que o mapa é um `Record`.
   * Ele não cobra a chave a MAIS: fonte removida da união e esquecida no mapa continua compilando, e
   * o mapa passa a descrever uma proteção que não existe mais. Pior, o próximo a ler o mapa acredita
   * nele. Os dois conjuntos têm de ter as MESMAS chaves, nas duas direções.
   */
  it("os dois conjuntos têm as MESMAS chaves: nenhuma fonte sem régua, nenhuma régua órfã", () => {
    const declaradas = [...COLUNAS_DE_PESSOA].sort();
    const comRegraEscrita = Object.keys(REGUA_DAS_COLUNAS_DE_PESSOA).sort();
    expect(comRegraEscrita).toEqual(declaradas);
  });

  it("toda régua é um dos QUATRO ramos, e não um quinto inventado", () => {
    for (const fonte of COLUNAS_DE_PESSOA) {
      expect(["ASSERCAO", "DENYLIST", "ROTULO", "LIBERADA"]).toContain(
        REGUA_DAS_COLUNAS_DE_PESSOA[fonte],
      );
    }
  });

  /**
   * ─ NENHUMA COLUNA ESTÁ EM `DENYLIST` HOJE, E O RAMO CONTINUA EXISTINDO ──────────────────────
   *
   * A afirmação é DELIBERADA e não é curiosidade: sem ela, os testes de comportamento de `DENYLIST`
   * abaixo passariam a varrer um conjunto VAZIO e ficariam verdes sem exercitar nada. Quem devolver
   * uma coluna para a denylist quebra esta linha e é obrigado a olhar os testes daquele ramo.
   *
   * O ramo PERMANECE porque é o que as TABELAS de gente (`usuarios`, `comerciais`) usam: lá a
   * denylist é o instrumento certo, porque a população é conhecida, pequena e tem forma de nome.
   */
  it("quem está em cada ramo, hoje, afirmado de propósito", () => {
    expect(comRegua("DENYLIST")).toEqual(["dados_vaga_folha.gestor_bp"]);
    expect(comRegua("ROTULO")).toEqual([]);
  });
});

describe("conferirBaseAntesDoLote: um caso por régua, com a linha propositalmente suja", () => {
  it("ASSERCAO: linha fora do padrão REPROVA o lote e nomeia a coluna", async () => {
    for (const fonte of comRegua("ASSERCAO")) {
      const { deps } = montar({ [fonte]: [LINHA_SUJA] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} é ASSERCAO e tem de reprovar`).toBe(false);
      expect(v.colunas ?? []).toContain(fonte);
      expect(v.totalForaDoPadrao).toBeGreaterThan(0);
    }
  });

  /**
   * DENYLIST continua sendo o meio-termo PARA QUEM ESTIVER NELE: a fonte é LIDA, o valor vira o que o
   * gate PROCURA em cada imagem, e o veredito da base não é tocado. Hoje nenhuma COLUNA está neste
   * ramo (ver a asserção acima, que é o que impede este laço de ficar verde por vacuidade); o teste
   * fica escrito para o dia em que uma entrar, e é ele que cobra o comportamento nesse dia.
   */
  it("DENYLIST: não reprova, não entra em `colunas`, não soma em `totalForaDoPadrao`, MAS entra em `negados`", async () => {
    for (const fonte of comRegua("DENYLIST")) {
      const { deps } = montar({ [fonte]: [LINHA_SUJA, GESTOR] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} é DENYLIST e não pode barrar o lote`).toBe(true);
      expect(v.colunas ?? []).not.toContain(fonte);
      expect(v.totalForaDoPadrao).toBe(0);
      /**
       * O VALOR DE COLUNA VAI PARA `nomesDeColuna`, E NÃO PARA `nomes`. A separação é do desenho da
       * rodada 4 e é load-bearing: os dois conjuntos são PROCURADOS na imagem, mas só `nomes` PODA o
       * catálogo. Somar o gestor em `nomes` reabriria o falso positivo medido (`raful - cozinha`
       * recusando `/admin/integracao-clientes`), que é o defeito que derrubou a primeira tentativa.
       */
      expect([...(v.negados.nomesDeColuna ?? []), ...v.negados.nomes]).toContain(LINHA_SUJA.nome);
      expect(v.negados.nomes).not.toContain(LINHA_SUJA.nome);
    }
  });

  /**
   * ─ `ROTULO`: NÃO REPROVA, NÃO É LIDA, E **NÃO** ALIMENTA A DENYLIST ─────────────────────────
   *
   * ┌─ A ASSERÇÃO FOI TROCADA, E NÃO ENFRAQUECIDA (rodada 3) ───────────────────────────────────┐
   * │ Até a rodada 2 este teste exigia o gestor DENTRO de `v.negados.nomes`. Agora ele exige o        │
   * │ contrário, de propósito, e o motivo é que a denylist foi MEDIDA e reprovada como instrumento:   │
   * │   . 41 dos 431 valores têm UMA palavra, e `variantesDeNomeDeUsuario` devolve `[]` para uma      │
   * │     palavra: a denylist era INERTE para eles (36 passavam o gate inteiro);                      │
   * │   . inflada de 44 para 475 nomes, ela levava `montarVocabularioDoSistema` a centenas de         │
   * │     segundos POR ROTEIRO;                                                                      │
   * │   . e ela RECUSAVA tela por falso positivo (`raful - cozinha`, que é operação de cliente).      │
   * │                                                                                                │
   * │ A proteção não sumiu, MUDOU DE LUGAR: quem protege é a regra de rótulo `GESTOR` do gate, que    │
   * │ recusa a imagem que DESENHA o campo, qualquer que seja o valor. Ela é provada em                │
   * │ `regra-de-rotulo-do-gestor.tester.spec.ts`, e é lá que a cobertura de 431 de 431 é afirmada.    │
   * │ Se aquele arquivo sumir, este teste vira "o gestor não é protegido por nada", que é o cenário   │
   * │ que o par de arquivos existe para impedir.                                                     │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("ROTULO: não reprova, não é lida, e o valor NÃO vai para `negados`", async () => {
    for (const fonte of comRegua("ROTULO")) {
      const { deps } = montar({ [fonte]: [LINHA_SUJA, GESTOR] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} é ROTULO e não pode barrar o lote`).toBe(true);
      expect(v.colunas ?? []).not.toContain(fonte);
      expect(v.totalForaDoPadrao).toBe(0);
      const todosOsNomes = [...v.negados.nomes, ...(v.negados.nomesDeColuna ?? [])];
      expect(todosOsNomes).not.toContain(GESTOR.nome);
      expect(todosOsNomes).not.toContain(LINHA_SUJA.nome);
      expect(v.negados.emails).not.toContain(GESTOR.email);
    }
  });

  it("LIBERADA: não reprova E não alimenta a denylist", async () => {
    for (const fonte of comRegua("LIBERADA")) {
      const { deps } = montar({ [fonte]: [LINHA_SUJA, GESTOR] });
      const v = await conferirBaseAntesDoLote(deps);
      expect(v.aprovado, `${fonte} é LIBERADA e não pode barrar o lote`).toBe(true);
      expect(v.colunas ?? []).not.toContain(fonte);
      expect(v.totalForaDoPadrao).toBe(0);
      const todosOsNomes = [...v.negados.nomes, ...(v.negados.nomesDeColuna ?? [])];
      expect(
        todosOsNomes,
        `valor de ${fonte} na denylist tiraria um colega homônimo da proteção`,
      ).not.toContain(LINHA_SUJA.nome);
      expect(todosOsNomes).not.toContain(GESTOR.nome);
      expect(v.negados.emails).not.toContain(GESTOR.email);
    }
  });

  /**
   * AS TRÊS LIBERADAS JUNTAS, SUJAS, e a base ainda APROVA. É a medição de 28/09/2026 transformada em
   * asserção: eram 42 + 53 + 13 linhas barrando o lote, e é exatamente isso que a OST desbloqueia.
   */
  it("as três fontes liberadas, todas sujas ao mesmo tempo, APROVAM a base", async () => {
    const amostras: Amostras = {};
    for (const fonte of comRegua("LIBERADA")) amostras[fonte] = [LINHA_SUJA, GESTOR, LINHA_SUJA];
    const { deps } = montar(amostras);
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(true);
    expect(v.totalForaDoPadrao).toBe(0);
  });
});

describe("o gestor, na régua que está na árvore: LIDO e PROTEGIDO pela denylist", () => {
  /**
   * ─ O QUE ESTE BLOCO AFIRMA, E O QUE ELE **NÃO** PODE AFIRMAR ────────────────────────────────
   *
   * Ele afirma a camada da DENYLIST: a fonte é lida, o valor entra em `negados` nas três formas, e a
   * base não é reprovada por ela. Isso é o contrato da árvore em 28/09/2026 13:37.
   *
   * Ele NÃO afirma que o gestor está protegido, e essa distinção é o ponto: "está na denylist" e
   * "está protegido" deixaram de ser a mesma frase quando se mediu que `variantesDeNomeDeUsuario`
   * devolve `[]` para nome de UMA palavra. A prova de COBERTURA vive no arquivo da regra de rótulo, e
   * lá ela está VERMELHA.
   */
  it("`gestor_bp` é LIDO e não reprova a base", async () => {
    const { deps, amostrarColunaDePessoa } = montar({ "dados_vaga_folha.gestor_bp": [GESTOR] });
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(true);
    expect(v.colunas ?? []).not.toContain("dados_vaga_folha.gestor_bp");
    expect(
      amostrarColunaDePessoa.mock.calls.map(([f]) => f),
      "tirar a fonte da LEITURA desligaria a denylist do gestor em silêncio, com sintoma ZERO",
    ).toContain("dados_vaga_folha.gestor_bp");
  });

  /**
   * AS TRÊS FORMAS, uma a uma: o `nome` do cadastro, o e-mail, e o nome DERIVADO do e-mail, que é a
   * forma mais onipresente na interface (barra lateral, saudação) e pode nem coincidir com o cadastro.
   */
  it("o valor entra em `nomesDeColuna` com nome, e-mail e o nome derivado do e-mail", async () => {
    const { deps } = montar({ "dados_vaga_folha.gestor_bp": [GESTOR] });
    const v = await conferirBaseAntesDoLote(deps);
    const deColuna = v.negados.nomesDeColuna ?? [];
    expect(deColuna).toContain(GESTOR.nome);
    expect(v.negados.emails).toContain(GESTOR.email);
    const derivado = nomeExibidoDoEmail(GESTOR.email as string);
    expect(derivado).toBe("Ademar Quintanilha");
    expect(deColuna).toContain(derivado);
  });

  /**
   * ─ O GESTOR NÃO PODE ESCORREGAR PARA `nomes`, E ESTA É A ASSERÇÃO QUE GUARDA O CONSERTO ────────
   *
   * Os dois conjuntos são procurados na imagem, então trocar um pelo outro não muda o veredito e
   * passa despercebido. O que muda é a PODA do catálogo, que só `nomes` faz: com o gestor ali, valor
   * de catálogo que contenha o nome dele sai do vocabulário, e foi assim que `raful - cozinha`
   * recusou `/admin/integracao-clientes`. É regressão invisível por teste de veredito.
   */
  it("o valor do gestor NÃO entra em `negados.nomes` (é `nomes` que poda o catálogo)", async () => {
    const { deps } = montar({ "dados_vaga_folha.gestor_bp": [GESTOR] });
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.negados.nomes).not.toContain(GESTOR.nome);
    expect(v.negados.nomes).not.toContain(nomeExibidoDoEmail(GESTOR.email as string));
  });

  it("a denylist do gestor SOMA na das tabelas de gente, nunca a substitui", async () => {
    const colega: LinhaPessoa = {
      nome: "Rosangela Petrocelli Barbosa",
      email: "rosangela.barbosa@homolog.invalid",
    };
    const { deps } = montar(
      { "dados_vaga_folha.gestor_bp": [GESTOR] },
      {
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "candidatos" ? CANDIDATOS_SINTETICOS : [...USUARIOS, colega],
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.negados.nomes).toContain(colega.nome);
    expect(v.negados.nomesDeColuna ?? []).toContain(GESTOR.nome);
  });
});

describe("a fonte LIBERADA não é SEQUER CONSULTADA", () => {
  /**
   * ─ POR QUE O VEREDITO NÃO BASTA, E ESTA É A ASSERÇÃO MAIS IMPORTANTE DO ARQUIVO ─────────────
   *
   * "Ler só por garantia, e ignorar o resultado" passa em todo teste de veredito e é a porta pela
   * qual um nome de candidato entra na denylist: basta a linha seguinte, escrita meses depois por
   * quem lê `linhas` no escopo e assume que ele existe para ser usado. Se o array nunca é criado, o
   * descuido não tem matéria-prima.
   */
  it("nenhuma chamada a `amostrarColunaDePessoa` para as fontes liberadas", async () => {
    const { deps, amostrarColunaDePessoa } = montar();
    await conferirBaseAntesDoLote(deps);
    const pedidas = amostrarColunaDePessoa.mock.calls.map(([f]) => f);
    for (const fonte of comRegua("LIBERADA")) expect(pedidas).not.toContain(fonte);
  });

  /**
   * `ROTULO` TAMBÉM NÃO É LIDA, e a razão é OUTRA, o que faz a asserção valer separado: `LIBERADA` não
   * é lida porque o dado pode aparecer (ato do diretor); `ROTULO` não é lida porque LER O VALOR não é
   * mais o jeito de protegê-lo. O efeito colateral é o mesmo e é bem-vindo: valor que não é lido não
   * tem como escorregar para dentro da denylist na próxima linha que alguém escrever ali.
   */
  it("nenhuma chamada a `amostrarColunaDePessoa` para as fontes de régua ROTULO", async () => {
    const { deps, amostrarColunaDePessoa } = montar();
    await conferirBaseAntesDoLote(deps);
    const pedidas = amostrarColunaDePessoa.mock.calls.map(([f]) => f);
    for (const fonte of comRegua("ROTULO")) expect(pedidas).not.toContain(fonte);
  });

  it("as fontes de ASSERCAO e de DENYLIST CONTINUAM sendo lidas, todas elas", async () => {
    const { deps, amostrarColunaDePessoa } = montar();
    await conferirBaseAntesDoLote(deps);
    const pedidas = amostrarColunaDePessoa.mock.calls.map(([f]) => f);
    for (const fonte of [...comRegua("ASSERCAO"), ...comRegua("DENYLIST")]) {
      expect(pedidas, `${fonte} precisa continuar sendo lida`).toContain(fonte);
    }
  });
});

describe("allowlist e denylist são conjuntos SEPARADOS, e é da declaração do arnês que se subtrai", () => {
  /**
   * ─ O FURO QUE MAIS CARA SAI SE ABRIR ────────────────────────────────────────────────────────
   *
   * `montarNegadosDeEquipe` SUBTRAI o que a allowlist declara. Se um dia a allowlist usada para
   * montar a denylist passar a conter valor vindo de FONTE DE DADO (candidato, sala de espera,
   * `as_candidatos`), um colega do time com nome igual ao de um candidato SAI da proteção, sem
   * nenhum sintoma: o print sai com o nome dele e o gate aprova.
   */
  it("subtrai o que o arnês declarou, e só isso", () => {
    const declarada: AllowlistArnes = { nomes: ["Mariana Alves Ribeiro"], cpfs: [], emails: [] };
    const equipe: LinhaPessoa[] = [
      { nome: "Mariana Alves Ribeiro", email: "mariana.alves@exemplo.invalid" },
      { nome: "Rosangela Petrocelli Barbosa", email: "rosangela.barbosa@homolog.invalid" },
    ];
    const negados = montarNegadosDeEquipe(equipe, declarada);
    expect(negados.nomes).not.toContain("Mariana Alves Ribeiro");
    expect(negados.nomes).toContain("Rosangela Petrocelli Barbosa");
  });

  it("nome vindo de FONTE DE DADO não tira o colega HOMÔNIMO da denylist", async () => {
    const HOMONIMO = "Rosangela Petrocelli Barbosa";
    const { deps } = montar(
      // A mesma pessoa, de nome, aparece numa fonte LIBERADA (sala de espera) e no time.
      { sala_espera: [{ nome: HOMONIMO, cpf: "99900000191" }], as_candidatos: [{ nome: HOMONIMO }] },
      {
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "candidatos"
            ? CANDIDATOS_SINTETICOS
            : [...USUARIOS, { nome: HOMONIMO, email: "rosangela.barbosa@homolog.invalid" }],
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(true);
    expect(
      v.negados.nomes,
      "o colega homônimo tem de continuar sendo procurado em cada imagem",
    ).toContain(HOMONIMO);
  });

  it("allowlist sem nome declarado: TODO o time entra na denylist", async () => {
    const { deps } = montar(
      {},
      {
        allowlist: { nomes: [], cpfs: ["99900000191"], emails: ["mariana.alves@exemplo.invalid"] },
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "candidatos" ? CANDIDATOS_SINTETICOS : [{ nome: "Rosangela Petrocelli Barbosa" }],
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.negados.nomes).toContain("Rosangela Petrocelli Barbosa");
  });
});

describe("a régua de `candidatos` NÃO afrouxou (regressão que a OST não pede)", () => {
  /**
   * SERIA FÁCIL DE CAUSAR DE LADO: o laço das colunas e o laço das tabelas dividem `total` e
   * `prefixos`, e a liberação das colunas passa perto do ramo de população. Candidato real não precisa
   * existir na homologação para o manual funcionar, e ele aparece em quase toda tela.
   */
  it("UMA linha de `candidatos` fora do padrão continua reprovando o lote inteiro", async () => {
    const { deps } = montar(
      {},
      {
        amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
          t === "candidatos" ? [...CANDIDATOS_SINTETICOS, LINHA_SUJA] : USUARIOS,
        ),
      },
    );
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(false);
    expect(v.tabelas).toContain("candidatos");
  });

  it("reprova `candidatos` MESMO com as três fontes liberadas sujas e o gestor sujo", async () => {
    const amostras: Amostras = { "dados_vaga_folha.gestor_bp": [GESTOR] };
    for (const fonte of comRegua("LIBERADA")) amostras[fonte] = [LINHA_SUJA];
    const { deps } = montar(amostras, {
      amostrarPessoas: vi.fn(async (t: TabelaDePessoas) =>
        t === "candidatos" ? [LINHA_SUJA] : USUARIOS,
      ),
    });
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(false);
    expect(v.tabelas).toContain("candidatos");
    // E o motivo continua sem PII (§A.6): ele vai para o log do CI, que é onde o dado sobrevive.
    const motivo = String(v.motivo ?? "");
    expect(motivo).not.toContain("Juliana");
    expect(motivo).not.toContain("Ademar");
  });

  it("amostra VAZIA de tabela continua reprovando: consulta torta não é base limpa", async () => {
    const { deps } = montar({}, { amostrarPessoas: vi.fn(async () => []) });
    const v = await conferirBaseAntesDoLote(deps);
    expect(v.aprovado).toBe(false);
  });
});
