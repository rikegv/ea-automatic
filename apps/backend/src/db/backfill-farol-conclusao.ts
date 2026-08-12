import "dotenv/config";
import { createDb } from "./client";

/**
 * BACKFILL DO FAROL DE CONCLUSÃO: quem terminou a esteira e ficou com o farol atrasado.
 *
 * POR QUE ELE EXISTE (causa raiz apurada, com hora). O carimbo de `ADMISSAO_CONCLUIDA` morava só na
 * transição da frente INTEGRAÇÃO. Quando a integração de um cliente é desmarcada, a frente deixa de
 * nascer e o carimbo nunca acontece: a admissão fecha o Cadastro, termina a esteira e o farol fica
 * preso em EM_ADMISSAO para sempre. Foi o que ocorreu em 11/08/2026 às 20:42, e os Cadastros
 * fechados a partir das 21:09 saíram com o farol defasado. A correção da origem vive em
 * `esteira.service` (conclusão sem integração carimba o farol); este script conserta o passado, que
 * a correção não alcança porque ela age no INSTANTE da transição.
 *
 * O ALVO, e só ele: admissão com o Cadastro CONCLUÍDO, SEM integração pendente, farol ainda em
 * EM_ADMISSAO/BANCO_AGUARDAR e NÃO pausada. É exatamente a mesma condição que fazia a admissão
 * aparecer ao mesmo tempo em "Em Andamento" e em "Concluídas" nos cards.
 *
 * DECLÍNIO E RESCISÃO FICAM DE FORA, de propósito (desvio consciente do "56+3" do enunciado). As 3
 * admissões que hoje contam em Concluídas e em Declínios têm farol DECLINOU/RESCISAO, que é desfecho
 * TERMINAL e pegajoso (§A.3/§A.16): carimbar "concluída" por cima apagaria o que de fato aconteceu
 * com aquela pessoa, e trocaria um erro de contagem por um erro de verdade. Elas continuam
 * divergentes e estão reportadas ao diretor como decisão à parte.
 *
 * PAUSADA FICA DE FORA pelo mesmo princípio: pausa é decisão viva sobre a admissão, e o script não
 * decide por ela.
 *
 * SÓ TOCA `farol_global` (e o `atualizado_em` que todo update carrega). Nenhuma frente é reescrita,
 * nenhum status muda, nenhuma data de admissão é inventada. IDEMPOTENTE: o próprio filtro exclui
 * quem já está carimbado, então rodar 2x não muda nada na segunda vez. TRANSACIONAL: ou carimba
 * todas, ou nenhuma.
 *
 * §A.6: só contagens e códigos de cliente em log. Nenhum CPF, nenhum nome de candidato.
 *
 * Uso:  DATABASE_URL=... tsx apps/backend/src/db/backfill-farol-conclusao.ts
 *       BACKFILL_DRY=1 ... (só mostra o antes, não grava)
 */
const DRY = process.env.BACKFILL_DRY === "1";

/**
 * A CONDIÇÃO DO ALVO, escrita UMA vez e reusada na prova e no update. Duas cópias divergiriam na
 * primeira edição, e a prova passaria a medir um conjunto diferente do que o update grava.
 */
const ALVO = `
  a.farol_global IN ('EM_ADMISSAO', 'BANCO_AGUARDAR')
  AND a.pausada_em IS NULL
  AND EXISTS (
    SELECT 1 FROM frentes_admissao f
     WHERE f.admissao_id = a.id AND f.tipo = 'CADASTRO_CONTRATO' AND f.concluida = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM frentes_admissao i
     WHERE i.admissao_id = a.id AND i.tipo = 'INTEGRACAO' AND i.concluida = false
  )
`;

async function main() {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);

  const antes = await sql<{ cod_cliente: string; qtd: number; farol: string }[]>`
    SELECT a.cod_cliente, a.farol_global AS farol, count(*)::int AS qtd
      FROM admissoes a
     WHERE ${sql.unsafe(ALVO)}
     GROUP BY 1, 2
     ORDER BY 3 DESC`;
  const total = antes.reduce((s, l) => s + Number(l.qtd), 0);

  console.log(`ANTES: ${total} admissão(ões) com o farol atrasado`);
  for (const l of antes) console.log(`  cliente ${l.cod_cliente}: ${l.qtd} em ${l.farol}`);

  if (DRY) {
    console.log("BACKFILL_DRY=1: nada foi gravado.");
    await sql.end();
    return;
  }
  if (total === 0) {
    console.log("Nada a fazer.");
    await sql.end();
    return;
  }

  const atualizados = await sql<{ id: string }[]>`
    UPDATE admissoes a
       SET farol_global = 'ADMISSAO_CONCLUIDA', atualizado_em = now()
     WHERE ${sql.unsafe(ALVO)}
    RETURNING a.id`;

  const restantes = await sql<{ qtd: number }[]>`
    SELECT count(*)::int AS qtd FROM admissoes a WHERE ${sql.unsafe(ALVO)}`;

  console.log(`DEPOIS: ${atualizados.length} carimbada(s) como ADMISSAO_CONCLUIDA`);
  console.log(`Restantes com farol atrasado: ${restantes[0]?.qtd ?? 0} (esperado 0)`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
