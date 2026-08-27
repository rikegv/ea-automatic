import "dotenv/config";
import { createDb } from "./client";

/**
 * BACKFILL DA FRENTE IFRACTAL PARA QUEM JÁ PASSOU DO GATE.
 *
 * POR QUE ELE EXISTE, e é o mesmo motivo do backfill da Integração. A frente do iFractal nasce no
 * INSTANTE em que o gate abre (Auditoria + Exame concluídas), pela porta única. Quem já atravessou
 * aquele instante antes desta OST nunca mais volta a atravessar: sem este script a aba só ganharia
 * gente quando uma admissão NOVA passasse pelo gate, e todo mundo que já está na esteira ficaria
 * fora do controle de ponto para sempre.
 *
 * O RISCO QUE ESTE BACKFILL **NÃO** TEM, ao contrário do da Integração. Lá, criar frente ABERTA numa
 * admissão concluída faria `admissaoConcluidaSql` deixar de contá-la, e por isso aquele alvo teve de
 * excluir o Cadastro já concluído. Aqui não: o iFractal foi desenhado FORA daquela expressão
 * (decisão do diretor), então frente de iFractal aberta não move Painel, Gerenciador nem Alto
 * Volume. É a consequência boa de tê-lo mantido fora de todo gate.
 *
 * O ALVO É DECISÃO DE NEGÓCIO, e por isso é PARÂMETRO e não escolha da fábrica:
 *   padrão      só admissões VIVAS (EM_ADMISSAO / BANCO_AGUARDAR) que já passaram do gate;
 *   IFRACTAL_TODAS=1  soma as ADMISSAO_CONCLUIDA, para o time de Ponto cadastrar também quem já entrou.
 *
 * FORA EM QUALQUER CASO: declínio e rescisão (§A.16, quem encerrou não deixa trabalho ativo) e
 * pré-admissão (não tem cliente nem frentes).
 *
 * SÓ INSERE LINHA EM `frentes_admissao`, no status inicial. Nenhum farol é tocado, nenhum status
 * muda, nenhuma frente existente é reescrita. IDEMPOTENTE (o `NOT EXISTS` mais o unique
 * `(admissao_id, tipo)`) e TRANSACIONAL.
 *
 * §A.6: só contagens e farol em log. Nenhum CPF, nenhum nome de candidato.
 *
 * Uso:  tsx apps/backend/src/db/backfill-ifractal.ts
 *       BACKFILL_DRY=1 ...      (só mostra o alvo, não grava)
 *       IFRACTAL_TODAS=1 ...    (inclui as admissões já concluídas)
 */
const DRY = process.env.BACKFILL_DRY === "1";
const TODAS = process.env.IFRACTAL_TODAS === "1";

const FAROIS = TODAS
  ? `('EM_ADMISSAO', 'BANCO_AGUARDAR', 'ADMISSAO_CONCLUIDA')`
  : `('EM_ADMISSAO', 'BANCO_AGUARDAR')`;

/** A condição do alvo, escrita UMA vez e reusada na prova e no insert. */
const ALVO = `
  a.farol_global IN ${FAROIS}
  AND EXISTS (
    SELECT 1 FROM frentes_admissao f
     WHERE f.admissao_id = a.id AND f.tipo = 'AUDITORIA' AND f.concluida = true
  )
  AND EXISTS (
    SELECT 1 FROM frentes_admissao f
     WHERE f.admissao_id = a.id AND f.tipo = 'EXAME' AND f.concluida = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM frentes_admissao f
     WHERE f.admissao_id = a.id AND f.tipo = 'IFRACTAL'
  )
`;

async function main(): Promise<void> {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);

  const antes = await sql<{ farol: string; qtd: number }[]>`
    SELECT a.farol_global AS farol, count(*)::int AS qtd
      FROM admissoes a
     WHERE ${sql.unsafe(ALVO)}
     GROUP BY 1
     ORDER BY 2 DESC`;
  const total = antes.reduce((s, l) => s + Number(l.qtd), 0);

  console.log(`ALVO (${TODAS ? "vivas + concluídas" : "só vivas"}): ${total} admissão(ões)`);
  for (const l of antes) console.log(`  ${l.farol}: ${l.qtd}`);

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

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO frentes_admissao (admissao_id, tipo, status, concluida, data_inicio)
      SELECT a.id, 'IFRACTAL', 'NAO_CADASTRADO', false, now()
        FROM admissoes a
       WHERE ${tx.unsafe(ALVO)}
      ON CONFLICT (admissao_id, tipo) DO NOTHING`;
  });

  const [{ restam }] = await sql<{ restam: number }[]>`
    SELECT count(*)::int AS restam FROM admissoes a WHERE ${sql.unsafe(ALVO)}`;
  console.log(`DEPOIS: ${restam} restante(s) no alvo (esperado 0). Criadas: ${total}.`);
  await sql.end();
}

void main();
