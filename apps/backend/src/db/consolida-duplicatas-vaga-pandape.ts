import "dotenv/config";
import type { Sql } from "postgres";
import { candidaturaViva, type CandidaturaSituacao } from "@ea/shared-types";
import { createDb } from "./client";

/**
 * CIRURGIA ONE-TIME: consolida as 24 vagas DUPLICADAS pela varredura do Pandape (Central de Vagas,
 * item 2). O item 1 (liberar a vaga parou de zerar `vagas.id_vacancy_pandape`) ja esta em producao
 * e impede NOVAS duplicatas; este runner limpa o estrago anterior.
 *
 * O ESTRAGO (medido em producao, usado como verdade, nao remedido aqui): 24 pares 1:1, cada par com
 * o MESMO `vagas.codigo`:
 *   Row A = a vaga CORRETA, liberada: status 'ABERTA', id_vacancy_pandape IS NULL. MANTER.
 *   Row B = a duplicata da varredura: status 'PENDENTE_REVISAO', id_vacancy_pandape setado. APAGAR.
 *
 * ORDEM FIXA, UMA TRANSACAO POR PAR (condicao do seguranca, Q5). Cada par e independente (codigo,
 * vaga e linha de varredura distintos), entao falhar em um faz rollback SO dele e os demais seguem;
 * re-rodar retoma de onde parou. Dentro da transacao do par:
 *  (a) RESTAURA A IDENTIDADE de Row A (grava nela o id_vacancy_pandape de B). Sem isso a varredura
 *      nao reconhece Row A e DUPLICA DE NOVO (o item 1 so impede zerar dali pra frente, nao
 *      restaura). `vagas.id_vacancy_pandape` tem indice NAO-unico (`idx_vagas_id_vacancy_pandape`),
 *      entao A e B partilharem o id dentro da transacao, antes do DELETE de B, NAO colide.
 *  (b) REPONTA A MATRICULA: `as_varredura_vagas.vaga_id` de B para A. (a) e (b) andam JUNTOS, ambos
 *      ou nenhum (Q4): a restauracao da identidade e a matricula sao um so fato. A PK da varredura e
 *      o id_vacancy_pandape (1 linha por id) e o unique em vaga_id nao colide porque Row A nunca teve
 *      linha de varredura (medido: A tem 0, B tem 24).
 *  (c) CANDIDATURAS, sem perder candidato e sem violar `uq_as_candidaturas_viva`
 *      (UNIQUE (candidato_id, vaga_id) WHERE situacao NOT IN ('DESCARTADO','DESISTIU')). A REDUNDANCIA
 *      e SEMPRE ESCOPADA AO PAR (Q1): "o candidato ja tem candidatura na vaga A DAQUELE par", nunca
 *      presenca global (presenca global apagaria como redundante quem e unico no par e sumiria com a
 *      pessoa). Os passos, nesta ordem:
 *        c1. UNICA (candidato sem candidatura na Row A deste par): MOVE todas as dele para A.
 *        c2. RESGATE (candidato redundante, A sem viva e B com viva): MOVE a viva de B para A.
 *        c3. PROMOCAO (candidato redundante, A com viva e B com viva MAIS AVANCADA): PROMOVE a
 *            candidatura MANTIDA (a de A) para a situacao de B (e os campos que a acompanham,
 *            admissao_id), ANTES de apagar B. Correcao do VETO Q2: apagar B cego regrediria a esteira
 *            (caso real medido: B=ENVIADO_PARA_ADMISSAO, A=ATIVO). A ordem de avanco vem do dominio
 *            (ver `rankAvanco`), nao e inventada. Mortas nunca ganham de vivas.
 *        c4. DELETE do que sobrou em B: tudo que sobra e redundante (A ja tem a boa, possivelmente ja
 *            promovida) ou morta ja resgatada. Nenhuma viva se perde.
 *  (d) APAGA Row B por ULTIMO. O cascade limpa o resto de B (as_vaga_status_eventos, vaga_beneficio,
 *      vaga_cliente_correcoes, vaga_consultor_transferencias, vaga_meta_reducoes,
 *      as_ingestao_divergencias e a linha ja-repontada de as_varredura_vagas, que agora aponta A).
 *      as_candidatura_etapas.vaga_de / vaga_para que ainda apontassem B viram NULL (SET NULL),
 *      comportamento esperado. Filhas de as_candidaturas referenciam por candidatura_id e ACOMPANHAM
 *      o move / somem no delete por CASCADE, nao por vaga_id (medido: as 4.850 redundantes tem 0
 *      filhos, nenhum historico so-em-B se perde).
 *
 * DEFESA FAIL-CLOSED: antes de apagar Row B, confere que NENHUMA as_shortlists aponta para B
 * (RESTRICT; medido 0, mas se houver, o par e RECUSADO e a transacao DAQUELE par faz rollback).
 *
 * IDEMPOTENTE por construcao: a consulta de pares exige Row A com id_vacancy_pandape NULL e Row B
 * PENDENTE_REVISAO com id setado, mesmo codigo. Apos consolidar, Row A passa a ter id (some da
 * query) e Row B deixa de existir. Rodar 2x = 0 pares = no-op. Falha num par = rollback DELE =
 * estado anterior intacto, re-roda limpo.
 *
 * DRY-RUN POR PADRAO: sem EXECUTAR=1 (ou flag --executar) nada e escrito. O dry-run SO imprime as
 * contagens do que FARIA e NAO abre transacao de escrita.
 *
 * Uso:
 *   DRY-RUN (padrao):  DATABASE_URL=... tsx apps/backend/src/db/consolida-duplicatas-vaga-pandape.ts
 *   EXECUCAO REAL:     DATABASE_URL=... EXECUTAR=1 tsx apps/backend/src/db/consolida-duplicatas-vaga-pandape.ts
 *
 * §A.6 (Q6): NENHUM CPF, nome, e-mail ou situacao ligada a nome entra em log; so ids tecnicos (uuid
 * de vaga, uuid de candidatura, codigo de vaga, id do Pandape) e contagens.
 */

const EXECUTAR = process.env.EXECUTAR === "1" || process.argv.includes("--executar");

const SITUACOES_MORTAS = ["DESCARTADO", "DESISTIU"] as const;

/**
 * ORDEM DE AVANCO DA ESTEIRA, DERIVADA dos helpers do dominio (shared-types), NAO inventada:
 *   ATIVO                  viva, `!consomePosicao` (em selecao, nao reserva posicao)
 *   APROVADO               `consomePosicao` e `!finalizaPosicao` (reserva, ainda nao entregou)
 *   ALOCADO                `finalizaPosicao` (entregue, enche o cilindro)
 *   ENVIADO_PARA_ADMISSAO  `finalizaPosicao` e "o que vem DEPOIS de ALOCADO" (dominio: "entrega e
 *                          ALOCADO e o que vem depois dela"); foi para a esteira admissional
 * As MORTAS (`ehSaidaSemExito`: DESCARTADO/DESISTIU) ficam abaixo de toda viva: rank -1. O guard em
 * `rankAvanco` recusa (fail-closed) uma situacao VIVA nova que nao esteja listada, para ela nao ser
 * confundida com morta em silencio.
 */
const ORDEM_AVANCO_VIVAS: CandidaturaSituacao[] = [
  "ATIVO",
  "APROVADO",
  "ALOCADO",
  "ENVIADO_PARA_ADMISSAO",
];

function rankAvanco(s: CandidaturaSituacao): number {
  if (!candidaturaViva(s)) return -1;
  const r = ORDEM_AVANCO_VIVAS.indexOf(s);
  if (r < 0) {
    throw new Error(`situacao viva sem ordem de avanco definida: ${s} (atualize ORDEM_AVANCO_VIVAS)`);
  }
  return r;
}

interface Par {
  codigo: string;
  rowA: string;
  rowB: string;
  idv: string;
}

/**
 * Os pares 1:1, pela MESMA regra medida: A = ABERTA + id nulo; B = PENDENTE_REVISAO + id setado;
 * mesmo `codigo`. Codigo com mais de um A ou mais de um B e EXCLUIDO (nao e par 1:1): nao se adivinha.
 */
async function encontrarPares(sql: Sql): Promise<Par[]> {
  return sql<Par[]>`
    WITH a AS (
      SELECT codigo, id AS "rowA"
      FROM vagas
      WHERE status = 'ABERTA' AND id_vacancy_pandape IS NULL AND codigo IS NOT NULL
    ),
    b AS (
      SELECT codigo, id AS "rowB", id_vacancy_pandape AS idv
      FROM vagas
      WHERE status = 'PENDENTE_REVISAO' AND id_vacancy_pandape IS NOT NULL AND codigo IS NOT NULL
    ),
    ca AS (SELECT codigo, count(*) AS n, min("rowA"::text) AS "rowA" FROM a GROUP BY codigo),
    cb AS (SELECT codigo, count(*) AS n, min("rowB"::text) AS "rowB", min(idv) AS idv FROM b GROUP BY codigo)
    SELECT ca.codigo, ca."rowA", cb."rowB", cb.idv
    FROM ca JOIN cb USING (codigo)
    WHERE ca.n = 1 AND cb.n = 1
    ORDER BY ca.codigo`;
}

/** Codigos que PARECEM par mas tem A ou B ambiguo (n > 1). So para relatar; NAO sao tocados. */
async function codigosAmbiguos(sql: Sql): Promise<{ codigo: string; nA: number; nB: number }[]> {
  return sql`
    WITH a AS (
      SELECT codigo FROM vagas
      WHERE status = 'ABERTA' AND id_vacancy_pandape IS NULL AND codigo IS NOT NULL
    ),
    b AS (
      SELECT codigo FROM vagas
      WHERE status = 'PENDENTE_REVISAO' AND id_vacancy_pandape IS NOT NULL AND codigo IS NOT NULL
    ),
    ca AS (SELECT codigo, count(*) AS n FROM a GROUP BY codigo),
    cb AS (SELECT codigo, count(*) AS n FROM b GROUP BY codigo)
    SELECT ca.codigo, ca.n AS "nA", cb.n AS "nB"
    FROM ca JOIN cb USING (codigo)
    WHERE ca.n > 1 OR cb.n > 1
    ORDER BY ca.codigo`;
}

async function contarUm(query: Promise<{ n: number }[]>): Promise<number> {
  const [{ n }] = await query;
  return n;
}

/**
 * Candidatos redundantes (no par) com VIVA em A e VIVA em B. Usado para o passo c3 (promocao). A
 * decisao "promover?" usa `rankAvanco` (dominio), nao SQL, para a ordem nao divergir da fonte unica.
 */
interface ParViva {
  candA: string;
  sitA: CandidaturaSituacao;
  candB: string;
  sitB: CandidaturaSituacao;
  admB: string | null;
}

function vivasRedundantesQuery(sql: Sql, p: Par): Promise<ParViva[]> {
  return sql<ParViva[]>`
    SELECT a.id AS "candA", a.situacao AS "sitA", b.id AS "candB", b.situacao AS "sitB",
           b.admissao_id AS "admB"
    FROM as_candidaturas a
    JOIN as_candidaturas b ON b.candidato_id = a.candidato_id
    WHERE a.vaga_id = ${p.rowA} AND b.vaga_id = ${p.rowB}
      AND a.situacao NOT IN ${sql(SITUACOES_MORTAS)}
      AND b.situacao NOT IN ${sql(SITUACOES_MORTAS)}`;
}

/** Contagens de um par, SEM escrever. Mesmas predicadas dos UPDATE/DELETE reais. */
async function planejarPar(sql: Sql, p: Par) {
  const totalB = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_candidaturas WHERE vaga_id = ${p.rowB}`,
  );
  const unica = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_candidaturas c
        WHERE c.vaga_id = ${p.rowB}
          AND NOT EXISTS (SELECT 1 FROM as_candidaturas d
                          WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id)`,
  );
  const resgate = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_candidaturas c
        WHERE c.vaga_id = ${p.rowB}
          AND c.situacao NOT IN ${sql(SITUACOES_MORTAS)}
          AND EXISTS (SELECT 1 FROM as_candidaturas d
                      WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id)
          AND NOT EXISTS (SELECT 1 FROM as_candidaturas d
                          WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id
                            AND d.situacao NOT IN ${sql(SITUACOES_MORTAS)})`,
  );
  // REDUNDANTE (contagem independente): rows em B cujo candidato TEM candidatura na Row A do par.
  const redundante = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_candidaturas c
        WHERE c.vaga_id = ${p.rowB}
          AND EXISTS (SELECT 1 FROM as_candidaturas d
                      WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id)`,
  );
  const matricula = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_varredura_vagas
        WHERE id_vacancy_pandape = ${p.idv} AND vaga_id = ${p.rowB}`,
  );
  const shortlists = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_shortlists WHERE vaga_id = ${p.rowB}`,
  );
  const candidatosEmB = await contarUm(
    sql`SELECT count(DISTINCT candidato_id)::int AS n FROM as_candidaturas WHERE vaga_id = ${p.rowB}`,
  );
  // Promocao (c3): candidatos redundantes com viva em A e viva em B, onde B avanca mais que A.
  const vivas = await vivasRedundantesQuery(sql, p);
  const promoveEfetiva = vivas.filter((v) => rankAvanco(v.sitB) > rankAvanco(v.sitA)).length;
  // Redundantes apagadas = redundantes (direto) menos as vivas resgatadas (subconjunto das redundantes).
  const redundantesApagadas = redundante - resgate;
  // Invariante real (nao tautologica): todo row de B e UNICA ou REDUNDANTE.
  const invarianteOk = unica + redundante === totalB;
  return {
    totalB,
    unica,
    redundante,
    resgate,
    promoveEfetiva,
    redundantesApagadas,
    invarianteOk,
    matricula,
    shortlists,
    candidatosEmB,
  };
}

/** Aplica um par DENTRO da transacao do proprio par. Retorna as contagens reais dos comandos. */
async function aplicarPar(sql: Sql, p: Par) {
  const shortlists = await contarUm(
    sql`SELECT count(*)::int AS n FROM as_shortlists WHERE vaga_id = ${p.rowB}`,
  );
  if (shortlists > 0) {
    throw new Error(
      `par codigo=${p.codigo} rowB=${p.rowB} tem ${shortlists} shortlist(s); recusado (RESTRICT, rollback do par)`,
    );
  }

  // (a) restaura a identidade de Row A (guard IS NULL = idempotente) + (b) reaponta a matricula.
  const restaurada = (
    await sql`UPDATE vagas SET id_vacancy_pandape = ${p.idv}, atualizado_em = now()
              WHERE id = ${p.rowA} AND id_vacancy_pandape IS NULL`
  ).count;
  const matricula = (
    await sql`UPDATE as_varredura_vagas SET vaga_id = ${p.rowA}, atualizado_em = now()
              WHERE id_vacancy_pandape = ${p.idv} AND vaga_id = ${p.rowB}`
  ).count;

  // c1. UNICA: candidato sem candidatura em A (deste par) -> move TODAS as dele para A.
  const unica = (
    await sql`UPDATE as_candidaturas c SET vaga_id = ${p.rowA}, atualizado_em = now()
              WHERE c.vaga_id = ${p.rowB}
                AND NOT EXISTS (SELECT 1 FROM as_candidaturas d
                                WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id)`
  ).count;

  // c2. RESGATE: redundante, A sem viva e B com viva -> move a viva de B para A.
  const resgate = (
    await sql`UPDATE as_candidaturas c SET vaga_id = ${p.rowA}, atualizado_em = now()
              WHERE c.vaga_id = ${p.rowB}
                AND c.situacao NOT IN ${sql(SITUACOES_MORTAS)}
                AND EXISTS (SELECT 1 FROM as_candidaturas d
                            WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id)
                AND NOT EXISTS (SELECT 1 FROM as_candidaturas d
                                WHERE d.vaga_id = ${p.rowA} AND d.candidato_id = c.candidato_id
                                  AND d.situacao NOT IN ${sql(SITUACOES_MORTAS)})`
  ).count;

  // c3. PROMOCAO (VETO Q2): redundante com viva em A e viva em B; se B avanca mais, promove A antes
  // de apagar B. Decisao pelo `rankAvanco` do dominio. §A.6: loga so uuid de candidatura e os codigos
  // de situacao (enum, nao PII), nunca nome.
  const vivas = await vivasRedundantesQuery(sql, p);
  let promovidas = 0;
  for (const v of vivas) {
    if (rankAvanco(v.sitB) > rankAvanco(v.sitA)) {
      await sql`
        UPDATE as_candidaturas
        SET situacao = ${v.sitB}, admissao_id = COALESCE(${v.admB}, admissao_id), atualizado_em = now()
        WHERE id = ${v.candA}`;
      promovidas += 1;
      console.log(
        `    promovida candidaturaA=${v.candA} de ${v.sitA} para ${v.sitB} (candidaturaB=${v.candB})`,
      );
    }
  }

  // c4. DELETE do que sobrou em B (redundante ja representado em A, ou morta ja resgatada).
  const redundantesApagadas = (
    await sql`DELETE FROM as_candidaturas WHERE vaga_id = ${p.rowB}`
  ).count;

  // (d) apaga Row B por ultimo (cascade limpa o resto; matricula aponta A; nenhuma candidatura em B).
  const vagaB = (await sql`DELETE FROM vagas WHERE id = ${p.rowB}`).count;

  return { restaurada, matricula, unica, resgate, promovidas, redundantesApagadas, vagaB };
}

async function main() {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);
  const marca = EXECUTAR ? "EXECUCAO REAL" : "DRY-RUN";
  console.log(`[consolida-dup] modo: ${marca}`);

  const pares = await encontrarPares(sql);
  const ambiguos = await codigosAmbiguos(sql);
  console.log(`[consolida-dup] pares 1:1 encontrados: ${pares.length}`);
  if (ambiguos.length > 0) {
    console.log(`[consolida-dup] ATENCAO ${ambiguos.length} codigo(s) AMBIGUO(s) (nao tocados):`);
    for (const a of ambiguos) console.log(`  codigo=${a.codigo} nA=${a.nA} nB=${a.nB}`);
  }

  if (pares.length === 0) {
    console.log("[consolida-dup] nada a consolidar (no-op).");
    await sql.end();
    return;
  }

  if (!EXECUTAR) {
    // DRY-RUN: so conta, nenhuma escrita, nenhuma transacao de escrita aberta.
    let tUnica = 0;
    let tResgate = 0;
    let tPromove = 0;
    let tRedundantes = 0;
    let tMatricula = 0;
    let tTotalB = 0;
    let tCandidatosB = 0;
    let shortlistAlerta = 0;
    let invarianteFalha = 0;
    for (const p of pares) {
      const c = await planejarPar(sql, p);
      tUnica += c.unica;
      tResgate += c.resgate;
      tPromove += c.promoveEfetiva;
      tRedundantes += c.redundantesApagadas;
      tMatricula += c.matricula;
      tTotalB += c.totalB;
      tCandidatosB += c.candidatosEmB;
      if (c.shortlists > 0) {
        shortlistAlerta += 1;
        console.log(`  [ALERTA] codigo=${p.codigo} rowB=${p.rowB} tem ${c.shortlists} shortlist(s): par seria RECUSADO`);
      }
      if (!c.invarianteOk) {
        invarianteFalha += 1;
        console.log(`  [ALERTA] codigo=${p.codigo} rowB=${p.rowB}: unica(${c.unica})+redundante(${c.redundante}) != candB(${c.totalB})`);
      }
      console.log(
        `  codigo=${p.codigo} rowA=${p.rowA} rowB=${p.rowB} idv=${p.idv} | ` +
          `candB=${c.totalB} unicaMove=${c.unica} resgateViva=${c.resgate} ` +
          `promove=${c.promoveEfetiva} redundApaga=${c.redundantesApagadas} matricula=${c.matricula}`,
      );
    }
    console.log("[consolida-dup] ---- TOTAIS (DRY-RUN, nada escrito) ----");
    console.log(`  rowA restauradas (id setado):   ${pares.length}`);
    console.log(`  matriculas repontadas:          ${tMatricula}`);
    console.log(`  candidaturas em B (total):       ${tTotalB}`);
    console.log(`  candidaturas UNICA movidas:      ${tUnica}`);
    console.log(`  candidaturas VIVAS resgatadas:   ${tResgate}`);
    console.log(`  candidaturas A promovidas (c3):  ${tPromove}`);
    console.log(`  candidaturas REDUNDANTES apaga:  ${tRedundantes}`);
    console.log(`  rowB (vagas) apagadas:           ${pares.length}`);
    console.log(`  candidatos distintos em B:       ${tCandidatosB} (todos preservados em A)`);
    console.log(`  soma movidas+apagadas:           ${tUnica + tResgate + tRedundantes} (deve == candB ${tTotalB})`);
    console.log(`  invariante unica+redundante=B:   ${invarianteFalha === 0 ? "OK em todos os pares" : `FALHOU em ${invarianteFalha} par(es)`}`);
    if (shortlistAlerta > 0) {
      console.log(`  [ALERTA] ${shortlistAlerta} par(es) com shortlist em B seriam RECUSADOS na execucao real`);
    }
    await sql.end();
    return;
  }

  // EXECUCAO REAL: uma transacao POR PAR (Q5).
  const totais = {
    restaurada: 0,
    matricula: 0,
    unica: 0,
    resgate: 0,
    promovidas: 0,
    redundantesApagadas: 0,
    vagaB: 0,
  };
  let falhas = 0;
  for (const p of pares) {
    try {
      const r = await sql.begin((tx) => aplicarPar(tx as unknown as Sql, p));
      totais.restaurada += r.restaurada;
      totais.matricula += r.matricula;
      totais.unica += r.unica;
      totais.resgate += r.resgate;
      totais.promovidas += r.promovidas;
      totais.redundantesApagadas += r.redundantesApagadas;
      totais.vagaB += r.vagaB;
      console.log(
        `  OK codigo=${p.codigo} rowB=${p.rowB}: restaurada=${r.restaurada} matricula=${r.matricula} ` +
          `unicaMove=${r.unica} resgateViva=${r.resgate} promove=${r.promovidas} ` +
          `redundApaga=${r.redundantesApagadas} vagaB=${r.vagaB}`,
      );
    } catch (e) {
      falhas += 1;
      console.error(`  FALHA codigo=${p.codigo} rowB=${p.rowB} (rollback do par): ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("[consolida-dup] ---- TOTAIS (EXECUCAO REAL, commitado por par) ----");
  console.log(`  rowA restauradas:               ${totais.restaurada}`);
  console.log(`  matriculas repontadas:          ${totais.matricula}`);
  console.log(`  candidaturas UNICA movidas:      ${totais.unica}`);
  console.log(`  candidaturas VIVAS resgatadas:   ${totais.resgate}`);
  console.log(`  candidaturas A promovidas (c3):  ${totais.promovidas}`);
  console.log(`  candidaturas REDUNDANTES apaga:  ${totais.redundantesApagadas}`);
  console.log(`  rowB (vagas) apagadas:           ${totais.vagaB}`);
  console.log(`  pares com FALHA (rollback):     ${falhas}`);

  const restantes = await encontrarPares(sql);
  console.log(`[consolida-dup] verificacao pos-commit: pares restantes = ${restantes.length} (esperado 0 se 0 falhas)`);
  await sql.end();
}

main().catch((e) => {
  console.error("[consolida-dup] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
