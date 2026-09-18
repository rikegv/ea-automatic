import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { RetencaoCandidatosService } from "./retencao-candidatos.service";
import {
  clausulaDaProtecao,
  clausulaDoExistePlano,
  clausulaDoRelogio,
  sqlDaVarredura,
  sqlExecutavel,
} from "./retencao-lgpd.tester-fake";
import {
  avaliarPredicado,
  avaliarQueda,
  blocoDaCicatrizacao,
  coalesceDaQueda,
  COLUNAS_PESSOAIS,
  linhaComSoONomeDeVolta,
  linhaJaLimpa,
  marcadorDoNome,
  marcadorNaGuarda,
  NOME_REAL_SINTETICO,
  HERDADAS_REVOGADAS,
  ladoEsquerdoDoRelogio,
  MUTANTES_SEM_CANDIDATURA,
  reguaDoAlvo,
  selectFinal,
  trechoDoWhere,
  SQL_REFERENCIA_SEM_CANDIDATURA,
  violacoesDaRetencaoSemCandidatura,
  zeraColuna,
} from "./retencao-sem-candidatura.tester-fake";

/**
 * ─ FURO 1 DE LGPD: QUEM ENTRA E NÃO CASA COM VAGA NENHUMA NUNCA EXPIRA ────────────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38) escrita a partir do REQUISITO
 * (`docs/MAPA-ALCANCE-FUNDACAO-PROD-E-2-FUROS.md`, PARTE 2, FURO 1) e ANTES da implementação
 * existir (§A.40, regra 2). Nada do que o `backend` vier a escrever é lido aqui como definição.
 *
 * ┌─ O DEFEITO, em uma linha ───────────────────────────────────────────────────────────────────┐
 * │ A régua exige `exists (select 1 from as_candidaturas ...)`. Quem entra e não casa com vaga   │
 * │ nenhuma NUNCA satisfaz essa cláusula: o prazo de 2 anos nunca começa a correr, e CPF,        │
 * │ e-mail, telefone e data de nascimento ficam retidos PARA SEMPRE. Hoje é teórico porque a     │
 * │ base de A&S de produção está vazia; deixa de ser no primeiro registro da INGESTÃO, que é     │
 * │ exatamente por isso que o furo se fecha ANTES dela.                                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A METADE QUE É FÁCIL DE ATROPELAR AO CORRIGIR ───────────────────────────────────────────┐
 * │ NINGUÉM PODE FICAR ELEGÍVEL MAIS CEDO do que ficaria antes da correção. A correção           │
 * │ ACRESCENTA uma população (quem não tem candidatura) e NÃO MEXE no relógio de quem tem. Errar │
 * │ para esse lado apaga gente antes da hora, e anonimização não tem volta.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O QUE É COMPORTAMENTO E O QUE É FORMA, dito sem meio-termo ──────────────────────────────────
 *
 * O filtro inteiro mora em SQL CRU e não há Postgres em memória nesta suíte (nem pglite nem pg-mem
 * nas dependências, conferido), então não existe aqui a asserção "esta pessoa foi anonimizada": um
 * banco fingido devolveria a linha que eu mandasse, com o filtro certo ou errado.
 *
 * O QUE SE AFIRMA É O SENTIDO, e o argumento central é de NULIDADE, que é semântica e não estilo:
 * `max()` sobre conjunto vazio devolve NULL, e `NULL <= now() - interval '2 years'` NÃO é
 * verdadeiro. É por isso que quem não tem candidatura escapa hoje, e é por isso que a correção só
 * existe de fato se houver um valor de queda que NÃO dependa de `as_candidaturas`. Toda a leitura é
 * feita sobre o SQL EXECUTÁVEL (comentário apagado antes), por cláusula de topo e, dentro do
 * relógio, por ARGUMENTO da chamada, para que a metade certa nunca cubra a metade destruída.
 *
 * E O CONTRATO USADO AQUI É EXERCITADO CONTRA 16 MUTANTES no último bloco deste arquivo: frouxá-lo
 * deixa o próprio arquivo vermelho.
 *
 * §A.6: nenhum CPF, nome ou e-mail. Só nome de coluna, situação e data sintética.
 */

const criar = (db: never) => new RetencaoCandidatosService(db);

async function consultaDeProducao(): Promise<string> {
  const { sql, quantasConsultas } = await sqlDaVarredura(criar);
  expect(
    quantasConsultas,
    "o expurgo tem de ser UMA instrução só: partido em buscar-depois-atualizar, os ids das pessoas a expurgar passam a circular pela memória do processo (§A.6).",
  ).toBe(1);
  return sql;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. O FURO: A RETENÇÃO DEIXA DE DEPENDER DE HAVER CANDIDATURA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("furo 1: o prazo passa a correr para quem NÃO tem candidatura nenhuma", () => {
  /**
   * A cláusula que trava tudo. Enquanto ela existir, não há correção nenhuma: ela é a definição do
   * defeito, e não um detalhe de escrita.
   */
  it("a régua NÃO exige mais `exists (select 1 from as_candidaturas ...)`", async () => {
    expect(
      clausulaDoExistePlano(await consultaDeProducao()),
      "enquanto esta cláusula existir, quem entra sem casar com vaga nenhuma nunca satisfaz a régua: o prazo NUNCA começa a correr e o dado pessoal fica retido para sempre.",
    ).toBe("");
  });

  /**
   * ─ A METADE QUE NINGUÉM VÊ, E É ELA QUE DECIDE SE A CORREÇÃO FUNCIONA ────────────────────────
   *
   * Apagar o `exists` SOZINHO não corrige NADA, e este é o ponto mais importante do arquivo. O
   * relógio é um `max()` sobre `as_candidaturas`; sobre conjunto vazio ele devolve NULL, e a
   * comparação com NULL não é verdadeira. A pessoa sem candidatura continuaria escapando, agora
   * sem nenhuma cláusula no `where` que denunciasse o motivo. Por isso o que se exige é uma QUEDA
   * que não leia `as_candidaturas`.
   */
  it("a data de referência CAI para um valor que não depende de `as_candidaturas`", async () => {
    const relogio = clausulaDoRelogio(await consultaDeProducao());
    expect(
      coalesceDaQueda(relogio),
      "sem uma queda que não leia `as_candidaturas`, o relógio devolve NULL para quem não tem candidatura (max de conjunto vazio), e `NULL <= now() - interval` não é verdadeiro: o furo continua inteiro, escondido na nulidade.",
    ).not.toBeNull();
  });

  it("a queda lê as datas do PRÓPRIO candidato", async () => {
    const queda = coalesceDaQueda(clausulaDoRelogio(await consultaDeProducao()));
    expect(queda, "a queda ainda não existe: ver o caso anterior.").not.toBeNull();
    expect(
      queda?.[queda.length - 1],
      "o prazo de quem não tem candidatura corre das datas do próprio candidato.",
    ).toMatch(/c\.(criado_em|atualizado_em)/);
  });

  /**
   * O ÚLTIMO MOVIMENTO, e não o primeiro: é a mesma régua que o ramo de quem TEM candidatura já
   * usa. Contando só do `criado_em`, alguém cadastrado há 2 anos e editado ontem nasceria com o
   * prazo JÁ VENCIDO e seria anonimizado na varredura da hora seguinte, sem carência nenhuma.
   */
  it("a queda usa o ÚLTIMO movimento do candidato, e não só a data de cadastro", async () => {
    const queda = coalesceDaQueda(clausulaDoRelogio(await consultaDeProducao()));
    expect(queda, "a queda ainda não existe: ver os casos anteriores.").not.toBeNull();
    const fallback = queda?.[queda.length - 1] ?? "";
    expect(fallback).toMatch(/\bc\.atualizado_em\b/);
    expect(
      fallback,
      "`least`/`min` puxam a data de referência para TRÁS, e ninguém pode ficar elegível mais cedo do que ficaria antes da correção.",
    ).not.toMatch(/\b(least|min)\s*\(/);
  });

  /** O contrato inteiro, que é o resumo executável do requisito. */
  it("a consulta cumpre o contrato inteiro do furo 1", async () => {
    expect(violacoesDaRetencaoSemCandidatura(await consultaDeProducao())).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. O QUE NÃO PODE MUDAR (estes ficam verdes hoje, e é essa a graça: eles travam o que já existe)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("furo 1: o que a correção NÃO pode atropelar", () => {
  /**
   * QUEM TEM CANDIDATURA MANTÉM EXATAMENTE O RELÓGIO DE HOJE. A correção acrescenta uma população,
   * e não reescreve a régua da outra: o ramo do `max` continua lendo `vagas.encerrada_em` (o
   * carimbo de SERVIDOR) e `k.atualizado_em` (a saída sem êxito).
   */
  it("o ramo de quem TEM candidatura continua sendo o `max` sobre as candidaturas", async () => {
    const esquerdo = ladoEsquerdoDoRelogio(clausulaDoRelogio(await consultaDeProducao()));
    expect(esquerdo).toMatch(/\bmax\s*\(/);
    expect(esquerdo).toContain("as_candidaturas");
    expect(
      esquerdo,
      "sem `vagas.encerrada_em`, encerrar uma vaga velha torna quem estava dentro dela elegível na hora, com zero carência.",
    ).toContain("encerrada_em");
    expect(esquerdo).toMatch(/\bk\.atualizado_em\b/);
    expect(
      esquerdo,
      "`data_fechamento` vem do CORPO da requisição, sem piso: como relógio, vira gatilho remoto de exclusão irreversível.",
    ).not.toContain("data_fechamento");
  });

  /**
   * CANDIDATO DE BANCO NÃO EXPIRA, com ou sem candidatura. A leitura é do SENTIDO da cláusula, e
   * nunca da presença do nome da coluna: as três maneiras de errar a troca (sinal invertido,
   * `is not null` numa coluna NOT NULL, e cláusula ausente) CITAM a coluna e nenhuma delas falha
   * sozinha. As três estão exercitadas como mutantes no bloco 3.
   */
  it("a proteção do banco de talentos continua de pé, e no sentido certo", async () => {
    const violacoes = violacoesDaRetencaoSemCandidatura(await consultaDeProducao());
    expect(violacoes.filter((v) => v.startsWith("RETENCAO_"))).toEqual([]);
  });

  it("a proteção de quem está VIVO em vaga NÃO encerrada continua inteira", async () => {
    const protecao = clausulaDaProtecao(await consultaDeProducao());
    expect(protecao).toContain("as_vaga_status");
    expect(protecao).toMatch(/\bencerra\b/);
    expect(
      protecao,
      "`recebe_candidato = false` inclui a vaga PAUSADA, que não terminou: ler este flag torna expurgável todo mundo numa vaga em Stand By.",
    ).not.toContain("recebe_candidato");
    expect(
      protecao,
      "o alcance da proteção é a PESSOA, entre vagas: basta UMA candidatura viva em vaga aberta.",
    ).toMatch(/candidato_id\s*=\s*c\.id/);
  });

  /**
   * QUEM ESTÁ EM VAGA COM PAPEL `ENTREGA` CONTINUA PROTEGIDO. O flag `encerra` é verdadeiro em
   * ENTREGA, FECHAMENTO e CANCELAMENTO: sem a exceção, quem FOI CONTRATADO é expurgado do lado de
   * A&S enquanto o CPF dele segue na ADMISSÃO, que é outro módulo com retenção própria. Destrói o
   * histórico da seleção e não minimiza dado nenhum.
   */
  it("quem está em vaga de papel ENTREGA continua protegido", async () => {
    const protecao = clausulaDaProtecao(await consultaDeProducao());
    expect(protecao).toMatch(/papel\s*(=|in)/);
    expect(protecao.toLowerCase()).toContain("entrega");
  });

  it("o prazo continua sendo o do diretor, 2 anos", async () => {
    expect((await consultaDeProducao()).toLowerCase()).toContain("interval '2 years'");
  });

  it("a varredura continua ignorando quem já foi anonimizado", async () => {
    expect((await consultaDeProducao()).toLowerCase()).toMatch(/c\.anonimizado_em\s+is\s+null/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O TESTE DO TESTE: O CONTRATO DISCRIMINA, OU ELE NÃO ESTÁ MEDINDO NADA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Este bloco NÃO olha a produção. Ele olha o próprio contrato, com uma consulta sabidamente correta
 * que ele tem de APROVAR e 16 quebras deliberadas que ele tem de REPROVAR, dizendo QUAL propriedade
 * caiu. Contrato que aprova tudo fica verde para sempre e ninguém percebe, porque teste verde não
 * se explica.
 */
describe("o contrato do furo 1 discrimina", () => {
  it("aprova uma consulta que cumpre o requisito", () => {
    expect(violacoesDaRetencaoSemCandidatura(SQL_REFERENCIA_SEM_CANDIDATURA)).toEqual([]);
  });

  it("reprova a consulta de HOJE, e pelo motivo certo", () => {
    const violacoes = violacoesDaRetencaoSemCandidatura(SQL_REFERENCIA_SEM_CANDIDATURA);
    expect(violacoes).toEqual([]);
    // A de hoje, montada a partir da referência: com o gate e sem a queda.
    const comOFuro = SQL_REFERENCIA_SEM_CANDIDATURA.replace(
      " and c.banco_talentos = false",
      " and c.banco_talentos = false and exists (select 1 from as_candidaturas k where k.candidato_id = c.id)",
    );
    expect(
      violacoesDaRetencaoSemCandidatura(comOFuro).map((v) => v.split(":")[0]),
    ).toContain("GATE_DE_CANDIDATURA_PRESENTE");
  });

  /**
   * O COMENTÁRIO NÃO CONTA, e este é o falso positivo que já mordeu esta fábrica: o comentário que
   * explica a regra usa as mesmas palavras da regra, então uma leitura do texto cru aprovaria uma
   * consulta com a cláusula REMOVIDA e a explicação no lugar dela.
   */
  it("uma consulta com a queda só no COMENTÁRIO é reprovada", () => {
    const comADescricaoNoLugarDaRegra =
      SQL_REFERENCIA_SEM_CANDIDATURA.replace("greatest(c.criado_em, c.atualizado_em)", "null") +
      "\n-- a queda usa greatest(c.criado_em, c.atualizado_em) quando não há candidatura nenhuma";
    // Pelo mesmo caminho da consulta de verdade: comentário fora ANTES de qualquer leitura.
    const soComentario = sqlExecutavel(sql.raw(comADescricaoNoLugarDaRegra));
    expect(
      violacoesDaRetencaoSemCandidatura(soComentario).map((v) => v.split(":")[0]),
    ).toContain("RELOGIO_NAO_ALCANCA_QUEM_NAO_TEM_CANDIDATURA");
  });

  /**
   * ─ O CASO MEDIDO CONTRA O BANCO PELO `seguranca`, CONGELADO COMO TESTE ───────────────────────
   *
   * Esta é a guarda que a implementação tinha quando o furo foi medido: ela lista os quatro campos
   * e NÃO lista o nome. A linha em que só o nome voltou não a satisfaz, então a passada nunca a
   * tocava, e a suíte ficava verde. É a prova de que os casos de produção acima medem alguma coisa.
   */
  it("a guarda que não olha o nome NÃO alcança a linha em que só o nome voltou", () => {
    const guardaDoFuro =
      "anonimizado_em is not null and (cpf is not null or email is not null " +
      "or telefone is not null or data_nascimento is not null)";
    expect(avaliarPredicado(guardaDoFuro, linhaComSoONomeDeVolta(NOME_REAL_SINTETICO))).toBe(false);
    // E a guarda de hoje, com o nome, alcança: mesma linha, respostas opostas.
    const guardaCorrigida =
      "anonimizado_em is not null and (nome is distinct from 'Candidato Expurgado' " +
      "or cpf is not null or email is not null or telefone is not null or data_nascimento is not null)";
    expect(avaliarPredicado(guardaCorrigida, linhaComSoONomeDeVolta(NOME_REAL_SINTETICO))).toBe(true);
  });

  for (const m of MUTANTES_SEM_CANDIDATURA) {
    it(`reprova o mutante ${m.nome}`, () => {
      const violacoes = violacoesDaRetencaoSemCandidatura(m.sql).map((v) => v.split(":")[0]);
      expect(violacoes, `dano em produção: ${m.dano}`).toContain(m.regraEsperada);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3B. A DEFESA DO `greatest`, MEDIDA (resolução do VETO B do `seguranca`)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ O QUE O `seguranca` VETOU, E O QUE A MEDIÇÃO CORRIGIU ───────────────────────────────────────
 *
 * O achado: contar do `criado_em` acelera um expurgo IRREVERSÍVEL, e o ramo novo é o único que pode
 * acelerar. A resposta do coordenador: acelerar exigiria recuar as DUAS datas, porque `greatest`
 * toma o MAIOR dos dois carimbos e `atualizado_em` tem `default now()` no insert. O `greatest` JÁ É
 * a defesa que o achado pede.
 *
 * E A RESOLUÇÃO DIZ A PARTE QUE ME CABE: essa defesa DEIXA DE SER ARGUMENTO E VIRA TESTE. Os dois
 * casos abaixo não leem texto, eles AVALIAM a expressão da queda sobre uma linha sintética.
 */
describe("furo 1: a defesa do `greatest` é medida, e não argumentada", () => {
  const AGORA = new Date("2026-09-18T12:00:00.000Z");
  const LIMITE = new Date("2024-09-18T12:00:00.000Z"); // now() - interval '2 years'
  /** A linha perigosa: cadastro velho, movimento recente. */
  const LINHA = {
    criadoEm: new Date("2021-01-01T00:00:00.000Z"),
    atualizadoEm: new Date("2026-09-17T00:00:00.000Z"),
  };

  it("linha com cadastro ANTIGO e movimento RECENTE não fica elegível", async () => {
    const queda = coalesceDaQueda(clausulaDoRelogio(reguaDoAlvo(await consultaDeProducao())));
    expect(queda, "a queda ainda não existe: ver o bloco 1.").not.toBeNull();
    const referencia = avaliarQueda(queda?.[queda.length - 1] ?? "", LINHA, AGORA);
    expect(
      referencia,
      "a expressão da queda não é avaliável: o interpretador reprova o que não conhece, porque o desconhecido tem de cair para o lado de NÃO apagar.",
    ).not.toBeNull();
    expect(referencia?.getTime()).toBe(LINHA.atualizadoEm.getTime());
    expect(
      (referencia?.getTime() ?? 0) > LIMITE.getTime(),
      "quem o time mexeu ontem não pode ser anonimizado por causa de um cadastro de 2021. Expurgo prematuro é irreversível.",
    ).toBe(true);
  });

  /**
   * A PROVA DE QUE O CASO ACIMA MEDE ALGUMA COISA: com a mutação que o `seguranca` teme, a MESMA
   * linha fica elegível. Sem esta segunda metade, o caso anterior poderia estar verde por acaso.
   */
  it("e ficaria elegível se alguém trocasse o `greatest` por `criado_em` sozinho", () => {
    const referencia = avaliarQueda("c.criado_em", LINHA, AGORA);
    expect(referencia?.getTime()).toBe(LINHA.criadoEm.getTime());
    expect(
      (referencia?.getTime() ?? 0) <= LIMITE.getTime(),
      "é isto que a mutação causa: a mesma pessoa, vista ontem, passa a ter o prazo já vencido.",
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3C. A SEGUNDA METADE DO FURO 2: A VARREDURA CICATRIZA (resolução do VETO C)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ POR QUE A RECUSA EM `editar` NÃO BASTA ──────────────────────────────────────────────────────
 *
 * Uma linha re-identificada fica com `anonimizado_em` PREENCHIDO e com o dado pessoal de volta, e a
 * régua do prazo nunca mais volta nela (`anonimizado_em is null`). O que escapar da recusa vira
 * PERMANENTE e SILENCIOSO. A varredura passa a reconsertar, no molde exato da CTE que já apaga a
 * identidade externa de quem está carimbado.
 */
describe("furo 2, segunda metade: a varredura CICATRIZA quem já está carimbado", () => {
  it("re-nula os quatro campos pessoais de quem já tem `anonimizado_em`", async () => {
    const cicatriz = blocoDaCicatrizacao(await consultaDeProducao());
    expect(
      cicatriz,
      "sem cicatrização, a re-identificação que escapar da recusa do `editar` fica para sempre, e em silêncio: a régua do prazo nunca volta a uma linha já carimbada.",
    ).not.toBe("");
    for (const coluna of COLUNAS_PESSOAIS) {
      expect(zeraColuna(cicatriz, coluna), `a cicatrização não zera ${coluna}.`).toBe(true);
    }
  });

  /**
   * ─ O NOME, E ELE É O CASO QUE MAIS IMPORTA ───────────────────────────────────────────────────
   *
   * O `seguranca` mediu contra o banco: linha carimbada, os quatro campos nulos e o nome real de
   * volta SAIU DA PASSADA COM O NOME INTACTO, e esta suíte ficou verde. A premissa falsa era minha
   * ("o nome vira marcador e fica de fora"): ela vale para quem acabou de passar pelo expurgo e é
   * falsa exatamente na população que a cicatrização repara, porque o `editar` grava o nome na
   * MESMA instrução em que grava o CPF, e quem reabre uma ficha expurgada digita o nome primeiro.
   */
  it("reescreve o NOME com o marcador do expurgo", async () => {
    const cicatriz = blocoDaCicatrizacao(await consultaDeProducao());
    expect(cicatriz).not.toBe("");
    expect(
      marcadorDoNome(cicatriz),
      "zerar os quatro campos e deixar o nome real é reparo que não repara: o nome é dado pessoal.",
    ).not.toBeNull();
  });

  /**
   * ─ E O ALCANCE, QUE É O QUE ESCAPAVA INTEIRO ─────────────────────────────────────────────────
   *
   * Não basta o `set` listar o nome: a guarda de "há o que cicatrizar" tem de OLHAR o nome, senão a
   * linha em que só o nome voltou não satisfaz o predicado e nunca é sequer tocada. Isto não se lê,
   * se AVALIA: a guarda de produção é interpretada sobre a linha sintética.
   */
  it("ALCANÇA a linha carimbada em que só o NOME voltou", async () => {
    const guarda = trechoDoWhere(blocoDaCicatrizacao(await consultaDeProducao()));
    expect(
      avaliarPredicado(guarda, linhaComSoONomeDeVolta(NOME_REAL_SINTETICO)),
      "é o caso mais provável de todos, e era o que escapava inteiro: a guarda não listava o nome, então a linha nunca era nem tocada.",
    ).toBe(true);
  });

  /**
   * E O OUTRO LADO, que é o custo: a linha JÁ LIMPA não pode satisfazer a guarda, senão a passada
   * reescreve a base inteira de anonimizados de hora em hora, e o custo cresce com a base em vez de
   * crescer com o defeito. É também o que denuncia um marcador divergente na guarda.
   */
  it("NÃO toca a linha que já está limpa", async () => {
    const cicatriz = blocoDaCicatrizacao(await consultaDeProducao());
    const marcador = marcadorDoNome(reguaDoAlvo(await consultaDeProducao())) ?? "";
    expect(marcador).not.toBe("");
    expect(avaliarPredicado(trechoDoWhere(cicatriz), linhaJaLimpa(marcador))).toBe(false);
  });

  /**
   * O MARCADOR É UMA CONSTANTE COMPARTILHADA, e a prova é que os três literais coincidem: o que o
   * expurgo grava, o que a cicatrização grava e o que a guarda confere. Divergindo, ou a base passa
   * a ter dois marcadores, ou a guarda nunca casa com o que a outra escrita gravou.
   */
  it("usa o MESMO marcador que a régua do prazo, nos três lugares", async () => {
    const consulta = await consultaDeProducao();
    const doAlvo = marcadorDoNome(reguaDoAlvo(consulta));
    const cicatriz = blocoDaCicatrizacao(consulta);
    expect(doAlvo).not.toBeNull();
    expect(marcadorDoNome(cicatriz)).toBe(doAlvo);
    const naGuarda = marcadorNaGuarda(cicatriz);
    // A guarda pode comparar por outra forma; comparando por literal, ele tem de ser o mesmo.
    if (naGuarda !== null) expect(naGuarda).toBe(doAlvo);
  });

  it("não escreve `atualizado_em`", async () => {
    const cicatriz = blocoDaCicatrizacao(await consultaDeProducao());
    const set = cicatriz.toLowerCase().split(" where ")[0];
    expect(
      set,
      "ela roda sobre toda linha carimbada em toda passada: o último movimento passaria a dizer `agora` para gente que ninguém toca há anos.",
    ).not.toMatch(/atualizado_em\s*=/);
  });

  /**
   * ELA NÃO PODE RECARIMBAR A DATA. Roda de hora em hora sobre todo mundo que já está carimbado:
   * reescrever `anonimizado_em` faria a data em que o dado pessoal SAIU virar sempre a de agora, e
   * a prova da retenção se perderia.
   */
  it("não reescreve a data da anonimização", async () => {
    const cicatriz = blocoDaCicatrizacao(await consultaDeProducao());
    expect(cicatriz).not.toBe("");
    const set = cicatriz.toLowerCase().split(" where ")[0];
    expect(set).not.toMatch(/anonimizado_em\s*=/);
  });

  /**
   * E NÃO PODE VIRAR CONTAGEM NOVA NO LOG. A cicatrização alcança todo mundo que já está carimbado,
   * em TODA passada: somá-la faria o log anunciar um expurgo por hora, para sempre, sem ninguém ter
   * sido expurgado.
   */
  it("não entra na contagem que vai ao log", async () => {
    const consulta = await consultaDeProducao();
    expect(violacoesDaRetencaoSemCandidatura(consulta).map((v) => v.split(":")[0])).not.toContain(
      "CONTAGEM_NAO_SAI_DO_ALVO",
    );
    // E a contagem continua existindo: o log informa QUANTAS pessoas foram expurgadas na passada.
    expect(selectFinal(consulta)).toMatch(/count\s*\(/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. A COLISÃO COM O CONTRATO VIZINHO, DECLARADA E NÃO ESCONDIDA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ─ UMA REGRA DO CONTRATO VIZINHO CODIFICA O DEFEITO, E QUEM IMPLEMENTAR TEM DE APAGÁ-LA ────────
 *
 * `violacoesDoContrato` (`retencao-lgpd.tester-fake.ts`) cobra a cláusula
 * `exists (select 1 from as_candidaturas ...)` sob o nome `REGRESSAO_SEM_PROCESSO_NAO_CONTA`. Ela
 * foi escrita quando "sem processo encerrado não há prazo a contar" era a régua, e a régua MUDOU
 * por decisão registrada no mapa de alcance. No dia em que a correção subir, aquele contrato vai
 * acusar uma regressão que é, na verdade, a correção, e o vizinho
 * `retencao-candidatos.lgpd.comportamental.spec.ts` fica vermelho.
 *
 * O `tester` NÃO APAGA a regra: editar o teste de outra frente para caber numa implementação futura
 * é o oposto do que este papel faz. O que ele faz é DECLARAR a colisão aqui, nomeada, para que ela
 * seja uma decisão consciente de quem implementa e não uma surpresa no gate.
 */
describe("a colisão com o contrato vizinho está declarada", () => {
  it("a regra revogada é UMA, e está nomeada", () => {
    expect(HERDADAS_REVOGADAS).toEqual(["REGRESSAO_SEM_PROCESSO_NAO_CONTA"]);
  });

  /**
   * A PROVA DE QUE A COLISÃO É REAL, e não uma suposição minha: a referência CORRETA do furo 1,
   * passada pelo contrato vizinho, é reprovada por essa regra e só por ela.
   */
  it("o contrato vizinho não reprova a correção por NENHUM outro motivo", async () => {
    const { violacoesDoContrato } = await import("./retencao-lgpd.tester-fake");
    const nomes = violacoesDoContrato(reguaDoAlvo(SQL_REFERENCIA_SEM_CANDIDATURA)).map(
      (v) => v.split(":")[0],
    );
    /*
     * A REGRA REVOGADA É A ÚNICA DIFERENÇA ADMITIDA, e o filtro é nos DOIS sentidos: enquanto ela
     * existir lá, ela aparece aqui e é ignorada; quando quem implementar a apagar, a lista fica
     * vazia e este caso continua verde. O que ele trava é o resto: a correção do furo 1 não pode
     * violar NENHUMA outra propriedade daquele contrato, que é a régua da correção anterior.
     */
    expect(nomes.filter((n) => !HERDADAS_REVOGADAS.includes(n))).toEqual([]);
  });
});
