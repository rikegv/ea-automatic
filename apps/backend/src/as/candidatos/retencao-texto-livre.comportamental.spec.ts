import { describe, expect, it } from "vitest";
import { RetencaoCandidatosService } from "./retencao-candidatos.service";
import { sqlDaVarredura } from "./retencao-lgpd.tester-fake";
import {
  avaliarPredicado,
  ctesDaConsulta,
  marcadorDoNome,
  reguaDoAlvo,
  selectFinal,
  violacoesDaRetencaoSemCandidatura,
} from "./retencao-sem-candidatura.tester-fake";
import {
  MUTANTES_DO_TEXTO_LIVRE,
  SQL_REFERENCIA_RENOMEADA,
  SQL_REFERENCIA_REORDENADA,
  SQL_REFERENCIA_TEXTO_LIVRE,
  alcanceDaEscrita,
  cteQueEscreveEm,
  guardaDaEscrita,
  linhaComMotivo,
  linhaComMotivoNoHistorico,
  linhaComResumoJaExpurgado,
  linhaComTextoLivre,
  linhaSemMotivo,
  linhaSemMotivoNoHistorico,
  literalGravado,
  literalNaGuarda,
  nulaColuna,
  setDaEscrita,
  tocaColuna,
  violacoesDoTextoLivre,
} from "./retencao-texto-livre.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE DO FURO 3: O TEXTO LIVRE SOBREVIVIA À ANONIMIZAÇÃO (§A.38) ───────────
 *
 * ESCRITO PELO `tester`, QUE NÃO ESCREVEU O CÓDIGO. As duas CTEs (`contatos_expurgados` e
 * `motivos_expurgados`) nasceram sem cobertura, e o `backend` declarou isso ao entregar.
 *
 * ┌─ O BURACO ERA REAL, E FOI MEDIDO ANTES DE UMA LINHA DESTE ARQUIVO EXISTIR ─────────────────┐
 * │ Apagadas as duas CTEs do arquivo de produção, a suíte de retenção inteira (91 testes, quatro │
 * │ arquivos) continuou VERDE. O motivo é estrutural: todo o contrato que protege o expurgo      │
 * │ ancora no `update as_candidatos` do `alvo` e afirma sobre as cláusulas do `where` DELE, e as │
 * │ duas CTEs novas escrevem em OUTRAS TABELAS. O terceiro furo de LGPD podia ser reaberto por   │
 * │ refatoração, com o gate inteiro verde.                                                       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE PARTE DISTO É LEITURA DE SQL, e o que se faz contra o falso positivo ──────────────┐
 * │ O expurgo inteiro mora dentro de UMA consulta em SQL CRU, e não há Postgres em memória nesta │
 * │ suíte (nem pglite nem pg-mem nas dependências). Um banco fingido devolve as linhas que        │
 * │ quiser, com a CTE certa ou errada. O que se mede, então, é o SENTIDO, e nunca a presença de   │
 * │ uma palavra no texto:                                                                        │
 * │   1. o comentário é APAGADO antes de qualquer leitura (só o SQL executável é olhado), e este  │
 * │      arquivo de produção é quase todo comentário: procurar `resumo` no texto cru ficaria      │
 * │      verde com a CTE removida, porque o comentário que a explica cita a palavra;              │
 * │   2. cada CTE é achada pelo que ELA FAZ (a tabela em que escreve), nunca pela posição;        │
 * │   3. as guardas são AVALIADAS sobre linhas sintéticas pelo interpretador de predicado que já  │
 * │      existe (`avaliarPredicado`), e não lidas;                                                │
 * │   4. o contrato é exercitado contra MUTANTES, então contrato frouxo fica vermelho por si.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado pessoal aqui. Nomes de coluna, marcadores e frases sintéticas sem dono.
 */

const criar = (db: never) => new RetencaoCandidatosService(db);

/** O SQL que a varredura de PRODUÇÃO monta hoje, sem comentário e em caixa baixa. */
async function consultaDeProducao(): Promise<string> {
  const { sql, quantasConsultas } = await sqlDaVarredura(criar);
  expect(quantasConsultas).toBe(1);
  return sql.toLowerCase();
}

async function cteDoResumo(): Promise<{ nome: string; corpo: string }> {
  const cte = cteQueEscreveEm(await consultaDeProducao(), "as_contatos");
  expect(cte, "a varredura não escreve em `as_contatos`").not.toBeNull();
  return cte as { nome: string; corpo: string };
}

async function cteDoMotivo(): Promise<{ nome: string; corpo: string }> {
  const cte = cteQueEscreveEm(await consultaDeProducao(), "as_candidaturas");
  expect(cte, "a varredura não escreve em `as_candidaturas`").not.toBeNull();
  return cte as { nome: string; corpo: string };
}

async function cteDoHistorico(): Promise<{ nome: string; corpo: string }> {
  const cte = cteQueEscreveEm(await consultaDeProducao(), "as_candidatura_etapas");
  expect(cte, "a varredura não escreve em `as_candidatura_etapas`").not.toBeNull();
  return cte as { nome: string; corpo: string };
}

// ── 1. O EXPURGO ALCANÇA O TEXTO LIVRE ──────────────────────────────────────

describe("furo 3: o expurgo alcança o RESUMO do contato", () => {
  it("a varredura escreve em `as_contatos` numa CTE da MESMA instrução", async () => {
    const consulta = await consultaDeProducao();
    const cte = cteQueEscreveEm(consulta, "as_contatos");
    expect(cte).not.toBeNull();
    // A mesma instrução, e não uma segunda escrita: com escritas separadas, a falha da segunda
    // deixa o candidato carimbado com o telefone digitado no resumo intacto, e a varredura nunca
    // mais volta àquela linha.
    expect(ctesDaConsulta(consulta).map((c) => c.nome)).toContain(cte?.nome);
  });

  it("SUBSTITUI o texto por um marcador, e NÃO nula a coluna NOT NULL", async () => {
    const { corpo } = await cteDoResumo();
    expect(
      nulaColuna(corpo, "resumo"),
      "`as_contatos.resumo` é NOT NULL: nular derruba a varredura inteira",
    ).toBe(false);
    expect(literalGravado(corpo, "resumo")).toBeTruthy();
  });

  it("PRESERVA a linha do contato: o fato do processo continua de pé", async () => {
    const consulta = await consultaDeProducao();
    // O `tipo`, o `ocorrido_em` e o `registrado_por_id` são fato de PROCESSO (houve ligação naquele
    // dia, feita por aquele consultor). Só o `resumo` é dado pessoal.
    expect(/delete\s+from\s+as_contatos/.test(consulta)).toBe(false);
    const { corpo } = await cteDoResumo();
    expect(tocaColuna(corpo, "tipo")).toBe(false);
    expect(tocaColuna(corpo, "ocorrido_em")).toBe(false);
    expect(tocaColuna(corpo, "registrado_por_id")).toBe(false);
  });

  it("alcança o `alvo` DESTA passada", async () => {
    expect(alcanceDaEscrita((await cteDoResumo()).corpo)).toMatch(/\balvo\b/);
  });

  it("alcança TAMBÉM quem JÁ tem `anonimizado_em`, que é a população esquecida", async () => {
    // A varredura nunca volta a uma linha carimbada: contato registrado DEPOIS da anonimização
    // ficaria retido para sempre, e em silêncio.
    const alcance = alcanceDaEscrita((await cteDoResumo()).corpo);
    expect(
      /\bja_anonimizados\b/.test(alcance) || /anonimizado_em\s+is\s+not\s+null/.test(alcance),
    ).toBe(true);
  });

  it("a guarda ALCANÇA o contato que ainda tem a frase digitada", async () => {
    const guarda = guardaDaEscrita((await cteDoResumo()).corpo);
    expect(guarda).toBeTruthy();
    expect(avaliarPredicado(guarda, linhaComTextoLivre())).toBe(true);
  });

  it("a guarda NÃO alcança o contato que já foi expurgado", async () => {
    const { corpo } = await cteDoResumo();
    const marcador = literalGravado(corpo, "resumo") ?? "";
    expect(avaliarPredicado(guardaDaEscrita(corpo), linhaComResumoJaExpurgado(marcador))).toBe(
      false,
    );
  });
});

describe("furo 3: o expurgo alcança o MOTIVO DE DESCARTE", () => {
  it("a varredura escreve em `as_candidaturas` numa CTE da MESMA instrução", async () => {
    expect(cteQueEscreveEm(await consultaDeProducao(), "as_candidaturas")).not.toBeNull();
  });

  it("vai a NULO, e não a um marcador", async () => {
    const { corpo } = await cteDoMotivo();
    expect(nulaColuna(corpo, "motivo_descarte")).toBe(true);
    expect(
      literalGravado(corpo, "motivo_descarte"),
      "marcador aqui inventa um terceiro estado numa coluna cujo nulo já tem significado",
    ).toBeNull();
  });

  it("alcança o `alvo` DESTA passada", async () => {
    expect(alcanceDaEscrita((await cteDoMotivo()).corpo)).toMatch(/\balvo\b/);
  });

  it("alcança TAMBÉM quem JÁ tem `anonimizado_em`", async () => {
    const alcance = alcanceDaEscrita((await cteDoMotivo()).corpo);
    expect(
      /\bja_anonimizados\b/.test(alcance) || /anonimizado_em\s+is\s+not\s+null/.test(alcance),
    ).toBe(true);
  });

  it("a guarda ALCANÇA a candidatura que ainda tem o motivo digitado", async () => {
    const guarda = guardaDaEscrita((await cteDoMotivo()).corpo);
    expect(guarda).toBeTruthy();
    expect(avaliarPredicado(guarda, linhaComMotivo())).toBe(true);
  });

  it("a guarda NÃO alcança a candidatura que já saiu sem motivo registrado", async () => {
    expect(avaliarPredicado(guardaDaEscrita((await cteDoMotivo()).corpo), linhaSemMotivo())).toBe(
      false,
    );
  });
});

// ── 2. AS DUAS CONSTANTES SÃO SEPARADAS, E ISSO É REQUISITO ─────────────────

describe("furo 3: o marcador do RESUMO é separado do marcador do NOME", () => {
  it("os dois marcadores existem e são DIFERENTES", async () => {
    const consulta = await consultaDeProducao();
    const doNome = marcadorDoNome(reguaDoAlvo(consulta));
    const doResumo = literalGravado((await cteDoResumo()).corpo, "resumo");
    expect(doNome).toBeTruthy();
    expect(doResumo).toBeTruthy();
    // São campos de naturezas diferentes, lidos em TELAS diferentes: o nome de uma pessoa na lista
    // e o resumo de uma ligação no histórico. Um marcador só faria a linha do histórico dizer o
    // marcador do nome, e quem lesse concluiria que o campo foi preenchido errado.
    expect(doResumo).not.toBe(doNome?.toLowerCase());
  });

  it("o marcador GRAVADO no resumo é o mesmo que a guarda CONFERE", async () => {
    const { corpo } = await cteDoResumo();
    const conferido = literalNaGuarda(corpo, "resumo");
    expect(conferido).toBeTruthy();
    expect(conferido).toBe(literalGravado(corpo, "resumo"));
  });
});

describe("furo 3: o expurgo alcança a CÓPIA do motivo no HISTÓRICO", () => {
  /*
   * `gravarSaidaDaCandidatura` (`encerrar-candidatura.ts`) escreve a MESMA string em
   * `as_candidaturas.motivo_descarte` e em `as_candidatura_etapas.motivo`, na MESMA transação, e o
   * schema diz que a repetição é PROPOSITAL. Nular uma e deixar a cópia é minimização APARENTE, que
   * é o defeito que esta frente inteira existe para fechar.
   */
  it("a varredura escreve em `as_candidatura_etapas` na MESMA instrução", async () => {
    expect(cteQueEscreveEm(await consultaDeProducao(), "as_candidatura_etapas")).not.toBeNull();
  });

  it("vai a NULO, e não a um marcador", async () => {
    const { corpo } = await cteDoHistorico();
    expect(nulaColuna(corpo, "motivo")).toBe(true);
    expect(literalGravado(corpo, "motivo")).toBeNull();
  });

  it("alcança o `alvo` DESTA passada", async () => {
    expect(alcanceDaEscrita((await cteDoHistorico()).corpo)).toMatch(/\balvo\b/);
  });

  it("alcança TAMBÉM quem JÁ tem `anonimizado_em`", async () => {
    const alcance = alcanceDaEscrita((await cteDoHistorico()).corpo);
    expect(
      /\bja_anonimizados\b/.test(alcance) || /anonimizado_em\s+is\s+not\s+null/.test(alcance),
    ).toBe(true);
  });

  it("a guarda ALCANÇA o evento que ainda tem o motivo digitado", async () => {
    const guarda = guardaDaEscrita((await cteDoHistorico()).corpo);
    expect(guarda).toBeTruthy();
    expect(avaliarPredicado(guarda, linhaComMotivoNoHistorico())).toBe(true);
  });

  it("a guarda NÃO alcança o evento que já está sem motivo", async () => {
    expect(
      avaliarPredicado(guardaDaEscrita((await cteDoHistorico()).corpo), linhaSemMotivoNoHistorico()),
    ).toBe(false);
  });
});

describe("a TRILHA DO ACEITE é permanente, e o expurgo NÃO a toca (§A.6)", () => {
  /*
   * ─ A LINHA QUE PREOCUPA MAIS DO QUE A PRÓPRIA CTE ────────────────────────────────────────────
   *
   * `aceite` e `aceite_numero` moram na MESMA tabela que o `motivo`, a três colunas de distância, e
   * são a trilha do aceite de passagem (§A.3 regra 8), que a §A.6 exige PERMANENTE E CONSULTÁVEL.
   * Elas não são dado pessoal: um nome de guarda, um lado e um número, com o autor saindo de
   * `por_id`, que é usuário INTERNO.
   *
   * O ERRO É APAGÁ-LAS JUNTO POR SIMETRIA, e ele é o oposto de uma limpeza: destrói a prova de que
   * alguém passou por cima de um aviso, que é a decisão mais cara de desfazer do módulo, e não
   * minimiza dado nenhum, porque ali não há dado pessoal para minimizar.
   */
  it("a CTE do histórico NÃO toca `aceite`", async () => {
    expect(tocaColuna((await cteDoHistorico()).corpo, "aceite")).toBe(false);
  });

  it("a CTE do histórico NÃO toca `aceite_numero`", async () => {
    expect(tocaColuna((await cteDoHistorico()).corpo, "aceite_numero")).toBe(false);
  });

  it("a varredura INTEIRA não menciona o aceite em nenhuma escrita", async () => {
    // Não só na CTE do histórico: nenhuma das quatro escritas pode alcançar a trilha, e uma CTE
    // futura que a alcançasse não estaria coberta pela asserção acima.
    const consulta = await consultaDeProducao();
    for (const cte of ctesDaConsulta(consulta)) {
      expect(setDaEscrita(cte.corpo)).not.toMatch(/\baceite\b/);
      expect(setDaEscrita(cte.corpo)).not.toMatch(/\baceite_numero\b/);
    }
    expect(consulta).not.toMatch(/delete\s+from\s+as_candidatura_etapas/);
  });

  it("o histórico preserva o fato do processo: só o `motivo` sai", async () => {
    // `situacao`, `etapa_para`, `posicao_lado`, `por_id` e `ocorrido_em` são fato de PROCESSO, e é
    // deles que a linha do tempo da vaga é lida depois que a pessoa vira anônima.
    const set = setDaEscrita((await cteDoHistorico()).corpo);
    for (const coluna of [
      "situacao",
      "etapa_para",
      "etapa_de",
      "posicao_lado",
      "por_id",
      "ocorrido_em",
      "criado_em",
    ]) {
      expect(set, `a CTE do histórico não pode tocar \`${coluna}\``).not.toMatch(
        new RegExp(`\\b${coluna}\\s*=`),
      );
    }
  });
});

// ── 3. O QUE AS CTEs NOVAS NÃO PODEM DERRUBAR DE LADO ───────────────────────

describe("furo 3: o que a correção NÃO pode mudar", () => {
  it("a contagem do log continua saindo da CTE do PRAZO", async () => {
    const consulta = await consultaDeProducao();
    const prazo = ctesDaConsulta(consulta).find(
      (c) =>
        /\bupdate\s+as_candidatos\b/.test(c.corpo) &&
        /anonimizado_em\s+is\s+null/.test(c.corpo) &&
        !/anonimizado_em\s+is\s+not\s+null/.test(c.corpo),
    );
    expect(prazo).toBeTruthy();
    expect(selectFinal(consulta)).toMatch(new RegExp(`from\\s+${prazo?.nome}\\b`));
  });

  it("as linhas cicatrizadas NÃO entram na contagem", async () => {
    const consulta = await consultaDeProducao();
    const final = selectFinal(consulta);
    const doResumo = (await cteDoResumo()).nome;
    const doMotivo = (await cteDoMotivo()).nome;
    const doHistorico = (await cteDoHistorico()).nome;
    // Elas alcançam todo mundo que já está carimbado, em TODA passada: somá-las faria o log
    // anunciar um expurgo por hora, para sempre, sem ninguém ter sido expurgado.
    expect(final).not.toMatch(new RegExp(`from\\s+${doResumo}\\b`));
    expect(final).not.toMatch(new RegExp(`from\\s+${doMotivo}\\b`));
    expect(final).not.toMatch(new RegExp(`from\\s+${doHistorico}\\b`));
  });

  it("a CTE do motivo NÃO toca `atualizado_em`, que é insumo do relógio do expurgo", async () => {
    const { corpo } = await cteDoMotivo();
    expect(
      tocaColuna(corpo, "atualizado_em"),
      "empurrar esse carimbo mexeria no PRAZO de gente por efeito colateral de uma faxina",
    ).toBe(false);
    expect(setDaEscrita(corpo)).not.toMatch(/\batualizado_em\b/);
  });

  it("a CTE do resumo não escreve nenhuma coluna de carimbo", async () => {
    const set = setDaEscrita((await cteDoResumo()).corpo);
    expect(set).not.toMatch(/\bcriado_em\b/);
    expect(set).not.toMatch(/\bocorrido_em\b/);
  });

  it("a consulta de produção cumpre o contrato do furo 3 INTEIRO", async () => {
    expect(violacoesDoTextoLivre(await consultaDeProducao())).toEqual([]);
  });

  it("e continua cumprindo o contrato vizinho, sem regressão nos furos 1 e 2", async () => {
    expect(violacoesDaRetencaoSemCandidatura(await consultaDeProducao())).toEqual([]);
  });
});

// ── 4. O CONTRATO NÃO DEPENDE DE POSIÇÃO NEM DE NOME ────────────────────────

describe("a bomba de ordenação: quatro escritas na mesma instrução", () => {
  /*
   * A ORDEM DAS CTEs É ESCOLHA DE QUEM CONSTRÓI, NUNCA REQUISITO. Contrato que lê "a terceira CTE"
   * ou "o segundo update" reprova implementação CORRETA no dia em que alguém reordenar, e é assim
   * que um acusador vira ruído que o time aprende a ignorar, justamente no arquivo mais perigoso da
   * base. Estes três testes são a prova de que isso não acontece aqui.
   */
  it("aprova a referência na ordem natural", () => {
    expect(violacoesDoTextoLivre(SQL_REFERENCIA_TEXTO_LIVRE)).toEqual([]);
  });

  it("aprova a MESMA referência com as CTEs REORDENADAS", () => {
    expect(violacoesDoTextoLivre(SQL_REFERENCIA_REORDENADA)).toEqual([]);
  });

  it("aprova a MESMA referência com as CTEs RENOMEADAS", () => {
    expect(violacoesDoTextoLivre(SQL_REFERENCIA_RENOMEADA)).toEqual([]);
  });

  it("acha cada escrita pela TABELA em que ela escreve, em qualquer ordem", () => {
    for (const consulta of [
      SQL_REFERENCIA_TEXTO_LIVRE,
      SQL_REFERENCIA_REORDENADA,
      SQL_REFERENCIA_RENOMEADA,
    ]) {
      expect(setDaEscrita(cteQueEscreveEm(consulta, "as_contatos")?.corpo ?? "")).toMatch(
        /\bresumo\s*=/,
      );
      expect(setDaEscrita(cteQueEscreveEm(consulta, "as_candidaturas")?.corpo ?? "")).toMatch(
        /\bmotivo_descarte\s*=/,
      );
      expect(setDaEscrita(cteQueEscreveEm(consulta, "as_candidatura_etapas")?.corpo ?? "")).toMatch(
        /\bmotivo\s*=/,
      );
    }
  });

  it("não confunde a tabela LIDA pelo relógio com a tabela ESCRITA pelo motivo", () => {
    // `as_candidaturas` é lida pelas subconsultas do `alvo` e do relógio. Procurar o nome dela
    // devolveria a CTE do prazo, e toda afirmação seguinte cairia sobre o bloco errado.
    const cte = cteQueEscreveEm(SQL_REFERENCIA_TEXTO_LIVRE, "as_candidaturas");
    expect(cte?.corpo).toMatch(/\bupdate\s+as_candidaturas\b/);
    expect(cte?.corpo).not.toMatch(/\bupdate\s+as_candidatos\b/);
  });
});

// ── 5. O CONTRATO DISCRIMINA: OS MUTANTES ──────────────────────────────────

describe("o contrato do furo 3 discrimina", () => {
  it("reprova a varredura SEM as duas CTEs, e pelos dois motivos certos", () => {
    // É exatamente o estado medido antes deste arquivo existir: as duas CTEs fora, e a suíte
    // inteira verde. Aqui ele fica vermelho.
    const semAsDuas =
      "with alvo as ( update as_candidatos c set nome = 'Candidato Expurgado', cpf = null, " +
      "email = null, telefone = null, data_nascimento = null, anonimizado_em = now(), " +
      "atualizado_em = now() where c.anonimizado_em is null returning c.id ), " +
      "ja_anonimizados as ( select id from as_candidatos where anonimizado_em is not null ) " +
      "select count(*)::int as n from alvo";
    const regras = violacoesDoTextoLivre(semAsDuas).map((v) => v.split(":")[0]);
    expect(regras).toContain("SEM_EXPURGO_DO_RESUMO");
    expect(regras).toContain("SEM_EXPURGO_DO_MOTIVO");
    expect(regras).toContain("SEM_EXPURGO_DO_MOTIVO_DO_HISTORICO");
  });

  it("uma varredura com as CTEs só no COMENTÁRIO é reprovada", () => {
    // O arquivo de produção é quase todo comentário, e o comentário que explica as CTEs cita
    // `as_contatos`, `resumo` e `motivo_descarte`. Um contrato que lesse o texto cru ficaria verde
    // com a correção inteira apagada. Este lê só o SQL executável.
    const soComentario =
      "with alvo as ( update as_candidatos c set cpf = null where c.anonimizado_em is null " +
      "returning c.id ) select count(*)::int as n from alvo " +
      "-- update as_contatos set resumo = 'Resumo Expurgado' " +
      "-- update as_candidaturas set motivo_descarte = null";
    const regras = violacoesDoTextoLivre(soComentario).map((v) => v.split(":")[0]);
    expect(regras).toContain("SEM_EXPURGO_DO_RESUMO");
    expect(regras).toContain("SEM_EXPURGO_DO_MOTIVO");
    expect(regras).toContain("SEM_EXPURGO_DO_MOTIVO_DO_HISTORICO");
  });

  for (const m of MUTANTES_DO_TEXTO_LIVRE) {
    it(`reprova o mutante ${m.nome}`, () => {
      const violacoes = violacoesDoTextoLivre(m.sql).map((v) => v.split(":")[0]);
      expect(
        violacoes,
        `O mutante "${m.nome}" passou. Dano em produção: ${m.dano}`,
      ).toContain(m.regraEsperada);
    });
  }

  it("todo mutante muda a consulta de verdade", () => {
    // Um mutante que não mudou nada é um teste que mede o próprio texto da referência, e ficaria
    // vermelho sem nenhuma relação com o defeito que ele diz cobrir.
    for (const m of MUTANTES_DO_TEXTO_LIVRE) {
      expect(m.sql, `o mutante "${m.nome}" não alterou a referência`).not.toBe(
        SQL_REFERENCIA_TEXTO_LIVRE,
      );
    }
  });

  it("cada regra do contrato é acusada por ao menos um mutante", () => {
    // Regra sem mutante é regra que ninguém provou que dispara: ela pode estar morta desde o dia em
    // que foi escrita, e ninguém saberia.
    const cobertas = new Set(MUTANTES_DO_TEXTO_LIVRE.map((m) => m.regraEsperada));
    for (const regra of [
      "SEM_EXPURGO_DO_RESUMO",
      "SEM_EXPURGO_DO_MOTIVO",
      "RESUMO_NULADO_EM_COLUNA_NOT_NULL",
      "MARCADOR_DO_RESUMO_CONFUNDIDO_COM_O_DO_NOME",
      "MARCADOR_DO_RESUMO_DIVERGENTE",
      "RESUMO_NAO_ALCANCA_O_ALVO",
      "RESUMO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
      "RESUMO_NAO_ALCANCA_O_TEXTO_LIVRE",
      "RESUMO_REESCREVE_A_BASE_INTEIRA",
      "MOTIVO_COM_MARCADOR_EM_VEZ_DE_NULO",
      "MOTIVO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
      "MOTIVO_REESCREVE_A_BASE_INTEIRA",
      "MOTIVO_TOCA_O_RELOGIO_DO_EXPURGO",
      "CONTAGEM_NAO_SAI_DO_ALVO",
      "CONTATO_APAGADO_EM_VEZ_DE_EXPURGADO",
      "SEM_EXPURGO_DO_MOTIVO_DO_HISTORICO",
      "HISTORICO_COM_MARCADOR_EM_VEZ_DE_NULO",
      "HISTORICO_NAO_ALCANCA_O_ALVO",
      "HISTORICO_NAO_ALCANCA_OS_JA_ANONIMIZADOS",
      "HISTORICO_REESCREVE_A_BASE_INTEIRA",
      "HISTORICO_TOCA_O_CARIMBO_DO_EVENTO",
      "HISTORICO_APAGADO_EM_VEZ_DE_EXPURGADO",
      "ACEITE_EXPURGADO",
    ]) {
      expect(cobertas, `a regra ${regra} não tem mutante`).toContain(regra);
    }
  });
});
