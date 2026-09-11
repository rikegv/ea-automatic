import { describe, expect, it } from "vitest";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { RetencaoCandidatosService } from "./retencao-candidatos.service";
import {
  clausulaDaProtecao,
  clausulaDoRelogio,
  LISTA_DAS_VIVAS,
  sqlDaVarredura,
  violacoesDoContrato,
} from "./retencao-lgpd.tester-fake";

/**
 * ─ O EXPURGO TEM DE ALCANÇAR QUEM FICOU VIVO NUMA VAGA ENCERRADA (§A.6, LGPD, opção B) ──────────
 *
 * ESTE ARQUIVO É DO `tester`, E NÃO DE QUEM CONSTRUIU (§A.38). Ele foi escrito ENQUANTO o backend
 * escrevia a correção (§A.40, regra 2), a partir do REQUISITO e não do código: nada do que a
 * implementação vier a fazer é lido aqui como definição.
 *
 * ┌─ O BURACO QUE A CORREÇÃO FECHA ────────────────────────────────────────────────────────────┐
 * │ O expurgo só anonimiza quem NÃO tem candidatura VIVA, e `SITUACOES_VIVAS` inclui `APROVADO`,│
 * │ `ALOCADO` e `ENVIADO_PARA_ADMISSAO`. Quem fica vivo numa vaga ENCERRADA nunca é alcançado:  │
 * │ o prazo de 2 anos NUNCA COMEÇA e o dado pessoal fica retido PARA SEMPRE. É retenção          │
 * │ indefinida, que é exatamente o que a LGPD proíbe.                                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A PROPRIEDADE QUE A CORREÇÃO NÃO PODE ATROPELAR, QUE É O ERRO FÁCIL ────────────────────┐
 * │ "Descartado numa vaga e ativo em outra não conta: o descarte é do PROCESSO, não da PESSOA." │
 * │ A correção estreita O QUE CONTA COMO VIVO, e NÃO o alcance da proteção ENTRE VAGAS. Pessoa  │
 * │ com `APROVADO` em vaga CANCELADA e `ATIVO` em vaga ABERTA NÃO pode ser expurgada. Errar     │
 * │ aqui apaga alguém EM PROCESSO, e é irreversível.                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O QUE É COMPORTAMENTO E O QUE É FORMA, DITO SEM MEIO-TERMO ───────────────────────────────────
 *
 * O filtro inteiro mora DENTRO de uma consulta em SQL CRU. Um banco fingido devolve as linhas que
 * quiser, com o filtro certo ou errado, então NÃO EXISTE, neste arquivo, asserção de comportamento
 * sobre quem é ou não anonimizado: o que ele afirma é a FORMA da consulta, cláusula por cláusula.
 *
 * ASSERÇÃO DE FORMA DÁ FALSO POSITIVO, e já deu nesta fábrica. As três defesas:
 *   1. o COMENTÁRIO é apagado antes de qualquer leitura (só o SQL executável é olhado);
 *   2. a leitura é POR CLÁUSULA de topo, não por substring do texto inteiro, então a metade certa
 *      nunca cobre a metade destruída;
 *   3. o contrato usado aqui é EXERCITADO CONTRA MUTANTES em
 *      `retencao-lgpd-contrato.comportamental.spec.ts`: frouxá-lo deixa AQUELE arquivo vermelho.
 *
 * O QUE É COMPORTAMENTO DE VERDADE nesta frente está em dois vizinhos, e de propósito:
 *   - `vagas.encerrada-em.comportamental.spec.ts`: o carimbo de servidor, no payload da gravação;
 *   - `retencao-candidatos.spec.ts`: a varredura que falha sem derrubar o processo.
 */

const criar = (db: never) => new RetencaoCandidatosService(db);

async function consulta(): Promise<string> {
  const { sql, quantasConsultas } = await sqlDaVarredura(criar);
  expect(
    quantasConsultas,
    "o expurgo tem de ser UM `update ... where` só: partido em buscar-depois-atualizar, os ids das pessoas a expurgar passam a circular pela memória do processo (§A.6).",
  ).toBe(1);
  return sql;
}

describe("expurgo: a régua passa a ser `viva em vaga NÃO ENCERRADA`", () => {
  /**
   * O CONTRATO INTEIRO, DE UMA VEZ. Ele é o resumo executável do requisito, e cada violação vem com
   * o dano que ela causa em produção escrito na mensagem. Os testes abaixo repetem pedaços dele
   * isoladamente para o vermelho apontar UMA propriedade, mas é esta afirmação que fecha a régua.
   */
  it("a consulta cumpre o contrato inteiro da correção", async () => {
    expect(violacoesDoContrato(await consulta())).toEqual([]);
  });

  it("a proteção consulta o CATÁLOGO de status da vaga, por join", async () => {
    const protecao = clausulaDaProtecao(await consulta());
    expect(
      protecao,
      "sem join com `as_vaga_status` não há como saber se a vaga ENCERROU, e a régua continua sendo a antiga: quem fica vivo em vaga encerrada retém CPF para sempre.",
    ).toContain("as_vaga_status");
  });

  /**
   * O FLAG É `encerra`, E NUNCA `recebe_candidato`, e este é o ponto em que a correção mais fácil de
   * escrever é a errada. Um status LIVRE do tipo "Stand By" tem `recebe_candidato = false` e
   * `encerra = false`: VAGA PAUSADA NÃO É VAGA TERMINADA.
   *
   * E O CHECK DO BANCO NÃO SALVA NINGUÉM DISSO, ao contrário: a migration 0102 garante
   * `encerra = false OR recebe_candidato = false`, ou seja, encerrada IMPLICA não recebe, e nunca o
   * contrário. `recebe_candidato = false` é um SUPERCONJUNTO de `encerra = true`, então ler o flag
   * errado só faz o expurgo alcançar MAIS gente, que é a direção do dano irreversível.
   */
  it("a proteção lê o flag `encerra`, e não `recebe_candidato`", async () => {
    const protecao = clausulaDaProtecao(await consulta());
    expect(protecao).toMatch(/\bencerra\b/);
    expect(
      protecao,
      "`recebe_candidato = false` inclui a vaga PAUSADA, que não terminou: ler este flag torna expurgável todo mundo numa vaga em Stand By.",
    ).not.toContain("recebe_candidato");
  });

  /**
   * A PROTEÇÃO ENTRE VAGAS, que é a propriedade mais fácil de destruir sem perceber. A pessoa com
   * `APROVADO` numa vaga CANCELADA e `ATIVO` numa vaga ABERTA continua protegida, porque o `not
   * exists` percorre TODAS as candidaturas dela (correlação pelo CANDIDATO) e basta UMA em vaga não
   * encerrada para o `not exists` ser falso.
   *
   * As duas afirmações abaixo são as duas metades disso: correlação pela PESSOA, e nenhuma redução a
   * uma candidatura só (nada de `order by ... limit 1`).
   */
  it("a proteção olha a PESSOA, entre vagas, e todas as candidaturas dela", async () => {
    const protecao = clausulaDaProtecao(await consulta());
    expect(
      protecao,
      "sem `k.candidato_id = c.id` a proteção deixa de ser da pessoa, e o descarte de um processo passa a valer como descarte da pessoa.",
    ).toMatch(/candidato_id\s*=\s*c\.id/);
    expect(protecao).not.toMatch(/\blimit\b/);
    expect(protecao).not.toMatch(/\border\s+by\b/);
  });

  /**
   * E A CONDIÇÃO DA VAGA É "NÃO ENCERRADA". Trocada por "encerrada", a proteção passa a olhar só a
   * candidatura da vaga que acabou: a pessoa em processo vivo numa vaga aberta deixa de ser
   * protegida e é apagada.
   */
  it("a proteção exige vaga NÃO encerrada, nunca o contrário", async () => {
    const protecao = clausulaDaProtecao(await consulta());
    expect(protecao).toMatch(/(encerra\s*(=|is)\s*false|not\s+[a-z_]*\.?encerra\b)/);
    expect(protecao).not.toMatch(/encerra\s*(=|is)\s*true/);
  });

  /**
   * A SITUAÇÃO NÃO É REESCRITA: quem foi aprovado continua `APROVADO` na trilha. O que muda é a
   * RÉGUA DO EXPURGO, e a lista das vivas continua DERIVADA de `SITUACOES_VIVAS`. Lista digitada à
   * mão concorda com o vocabulário por coincidência, e para de concordar no dia em que uma situação
   * nova nascer, que é o dia em que alguém em processo é anonimizado em silêncio.
   */
  it("a lista das vivas continua derivada do vocabulário, e nenhuma situação viva ficou de fora", async () => {
    const protecao = clausulaDaProtecao(await consulta());
    expect(protecao).toContain(LISTA_DAS_VIVAS);
    for (const s of SITUACOES_VIVAS) expect(protecao).toContain(`'${s.toLowerCase()}'`);
  });
});

describe("expurgo: o RELÓGIO da candidatura que só encerrou porque a vaga encerrou", () => {
  /**
   * O REQUISITO QUE MATA GENTE SE SAIR ERRADO. Para a candidatura que passa a contar como encerrada
   * SÓ PORQUE A VAGA ENCERROU, a data de referência é o ENCERRAMENTO DA VAGA, e não o
   * `atualizado_em` da candidatura.
   *
   * Sem isso, alguém aprovado em 03/2024 numa vaga cancelada HOJE fica elegível NA HORA,
   * retroativamente, e a varredura de 1 em 1 hora o anonimiza SEM NENHUMA CARÊNCIA. Irreversível.
   */
  it("o relógio lê o encerramento da VAGA (`encerrada_em`)", async () => {
    const relogio = clausulaDoRelogio(await consulta());
    expect(
      relogio,
      "sem `vagas.encerrada_em`, encerrar uma vaga velha torna quem estava dentro dela elegível na hora, com zero carência.",
    ).toContain("encerrada_em");
  });

  /**
   * O CARIMBO É DE SERVIDOR, E `data_fechamento` NÃO SERVE. Ele vem do CORPO da requisição
   * (`FecharVagaDto.dataFechamento` e `CancelarVagaDto.dataCancelamento`), é `@IsISO8601()` SEM
   * PISO, e o próprio DTO documenta que pode ser anterior ao clique (é o fato comercial). Um COMUM
   * cancelando com data de 2019 viraria GATILHO REMOTO DE EXCLUSÃO de dado pessoal.
   */
  it("o relógio NÃO lê `data_fechamento`, que vem do corpo da requisição", async () => {
    const relogio = clausulaDoRelogio(await consulta());
    expect(
      relogio,
      "`data_fechamento` é digitada por quem fecha a vaga: lê-la aqui deixa qualquer COMUM disparar o expurgo de terceiros pela data do formulário.",
    ).not.toContain("data_fechamento");
  });

  /**
   * QUEM SAIU SEM ÊXITO CONTINUA CONTANDO DO PRÓPRIO ENCERRAMENTO. A troca vale só para a
   * candidatura VIVA em vaga encerrada; o descartado continua com o relógio no `atualizado_em` dele,
   * senão a correção mudaria o prazo de todo mundo que já saiu, para mais ou para menos.
   */
  it("quem saiu sem êxito continua contando do `atualizado_em` da candidatura", async () => {
    expect(clausulaDoRelogio(await consulta())).toContain("atualizado_em");
  });

  /**
   * DUAS VAGAS ENCERRADAS: A MESMA PESSOA PODE, SIM, SER EXPURGADA, e o prazo corre do encerramento
   * MAIS RECENTE. É o `max` sobre TODAS as candidaturas da pessoa, e ele é a outra metade da regra
   * que já existia ("o prazo corre do último encerramento, não do primeiro"): quem o time viu
   * recentemente não é apagado por causa de um processo antigo.
   */
  it("o prazo corre do encerramento MAIS RECENTE, sobre todas as candidaturas da pessoa", async () => {
    const relogio = clausulaDoRelogio(await consulta());
    expect(relogio).toMatch(/\bmax\s*\(/);
    expect(relogio).not.toMatch(/\bmin\s*\(/);
    expect(relogio).toMatch(/candidato_id\s*=\s*c\.id/);
    expect(relogio).not.toMatch(/\blimit\b/);
  });

  /** O resto da regra que a correção não pode atropelar. */
  it("candidato de banco não expira, e o prazo continua sendo de 2 anos", async () => {
    const q = (await consulta()).toLowerCase();
    expect(q).toContain("c.origem <> 'banco_talentos'");
    expect(q).toContain("interval '2 years'");
  });
});

/**
 * ─ A BORDA QUE O REQUISITO NÃO RESOLVE, E ELA TEM DADO EM PRODUÇÃO ──────────────────────────────
 *
 * `vagas.encerrada_em` É COLUNA NOVA. Toda vaga JÁ ENCERRADA antes desta correção nasce com ela
 * NULA, e não há de onde tirar o instante do gesto: `data_fechamento` é do corpo (o requisito a
 * recusa, com razão) e o `atualizado_em` da vaga foi mexido por qualquer edição posterior.
 *
 * O PERIGO É QUE O NULO É SILENCIOSO NA DIREÇÃO ERRADA: `max()` IGNORA NULO. Numa consulta que
 * escreva `max(case when viva then v.encerrada_em else k.atualizado_em end)`, a candidatura viva em
 * vaga encerrada SEM CARIMBO simplesmente SOME da conta, e o relógio passa a ser ditado pelas outras
 * candidaturas da pessoa, que podem ser antigas. Resultado: a pessoa vira elegível SEM NENHUMA
 * CARÊNCIA, que é exatamente o dano que o item 3 do requisito existe para impedir, entrando pela
 * porta dos fundos.
 *
 * A DIREÇÃO SEGURA É FAIL-CLOSED, como toda a régua deste serviço: SEM CARIMBO, NÃO SE APAGA.
 *
 * ┌─ O TESTE NÃO ESCOLHE ONDE A DEFESA MORA, E ISSO É DELIBERADO ──────────────────────────────┐
 * │ Há duas formas legítimas de fechar isto, e as duas cumprem o requisito:                     │
 * │   a) na PROTEÇÃO, mantendo protegida a pessoa enquanto o carimbo faltar                     │
 * │      (`s.encerra = false or v.encerrada_em is null`);                                       │
 * │   b) no RELÓGIO, dando ao nulo uma data que não seja o passado                              │
 * │      (`coalesce(v.encerrada_em, now())`, `greatest(...)`).                                  │
 * │ Escolher uma delas no teste seria medir DESENHO. O que se afirma é a PROPRIEDADE: o nulo é  │
 * │ tratado em algum lugar, explicitamente. O que ele recusa é o SILÊNCIO.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("vaga encerrada ANTES da coluna existir não pode virar expurgo sem carência", () => {
  it("o carimbo NULO é tratado explicitamente, na proteção ou no relógio (fail-closed)", async () => {
    const q = await consulta();
    const protecao = clausulaDaProtecao(q);
    const relogio = clausulaDoRelogio(q);

    const protegeEnquantoFaltaOCarimbo = /encerrada_em\s+is\s+null/.test(protecao);
    const relogioNaoIgnoraONulo =
      /coalesce\s*\(/.test(relogio) || /greatest\s*\(/.test(relogio);

    expect(
      protegeEnquantoFaltaOCarimbo || relogioNaoIgnoraONulo,
      "`max()` IGNORA nulo: sem tratamento explícito, a candidatura viva numa vaga encerrada SEM carimbo some da conta do prazo e a pessoa fica elegível na hora, retroativamente. Fecha-se na proteção (`or v.encerrada_em is null`) ou no relógio (`coalesce`/`greatest`), mas não se deixa em silêncio.",
    ).toBe(true);
  });

  /**
   * E A OUTRA METADE DA MESMA BORDA, que é o erro simétrico: a proteção não pode EXIGIR o carimbo.
   * Vaga ABERTA tem `encerrada_em` nulo por definição, então um `v.encerrada_em is not null` dentro
   * do `not exists` desprotegeria exatamente quem está em processo vivo. O nulo aqui só pode
   * aparecer somando proteção (`or ... is null`), nunca tirando.
   */
  it("a proteção não EXIGE o carimbo: vaga aberta nunca tem `encerrada_em`", async () => {
    const protecao = clausulaDaProtecao(await consulta());
    expect(
      protecao,
      "vaga aberta tem `encerrada_em` nulo por definição: exigir o carimbo dentro da proteção desprotege quem está em processo vivo.",
    ).not.toMatch(/encerrada_em\s+is\s+not\s+null/);
    if (protecao.includes("encerrada_em")) {
      expect(
        protecao,
        "o carimbo só pode aparecer na proteção SOMANDO proteção, em disjunção com o flag do catálogo.",
      ).toMatch(/\bor\b[^)]*encerrada_em\s+is\s+null|encerrada_em\s+is\s+null[^)]*\bor\b/);
    }
  });
});
