import "dotenv/config";
import { createDb } from "./client";

/**
 * RUNNER ONE-TIME da recuperação do incidente da TRANSIÇÃO PÓS-ASO (31/07/2026).
 *
 * O QUE ACONTECEU. A transição que leva o EXAME a APTO quando a I.A valida o ASO tinha dois furos,
 * e os dois deixaram rastro no banco:
 *   (1) exame em `A_AGENDAR` não era tocado. A I.A validava (`admissoes.aso_validado = true`) e a
 *       frente ficava parada, porque a lista de estados aceitos não previa o caso mais comum da
 *       operação: o ASO chega da clínica sem que o agendamento tenha sido registrado no EA.
 *   (2) a frente `CADASTRO_CONTRATO` não nascia junto do APTO. A fila do Cadastro parte de
 *       `frentes_admissao` com INNER JOIN por tipo, então sem a linha a admissão não aparece na
 *       aba, mesmo com AUDITORIA e EXAME concluídas.
 *
 * O QUE ESTE RUNNER FAZ, nesta ordem (a etapa 2 depende do resultado da 1):
 *   ETAPA 1 — conclui em APTO o EXAME de quem tem ASO ENTREGUE e VALIDADO pela I.A e está num
 *     estado recuperável. Grava o evento em `frente_status_eventos` com `autor_id` NULO, que é a
 *     verdade: quem moveu foi o sistema, na recuperação, não uma pessoa.
 *   ETAPA 2 — cria a frente `CADASTRO_CONTRATO` (`A_CADASTRAR`) de toda admissão viva com o gate
 *     aberto (regra 3: AUDITORIA e EXAME concluídas) que não tem a frente.
 *   ETAPA 3 — recalcula o farol das admissões tocadas, exatamente como o serviço faz depois de
 *     concluir uma frente.
 *
 * LIMITES, iguais aos do código corrigido: não toca frente já concluída, nem `CANCELADO` (que é
 * encerramento humano do exame), nem admissão declinada/rescindida/em pré-admissão. ASO anexado mas
 * NÃO validado pela I.A continua parado, que é o comportamento correto: o gate é o veredito.
 *
 * Idempotente e transacional: rodar 2x não move nada na segunda vez (a primeira já concluiu as
 * frentes e criou os Cadastros, e as duas etapas filtram por isso). §A.6: opera por id e status,
 * sem CPF nem PII, e não imprime nome de candidato.
 *
 * Uso: tsx apps/backend/src/db/recupera-transicao-pos-aso.ts   (RECUPERA_DRY=1 para simular)
 */
const DRY = process.env.RECUPERA_DRY === "1";

/**
 * Estados do EXAME recuperáveis. Espelha `STATUS_EXAME_APTO_POR_ASO` (esteira.service.ts).
 *
 * `LIBERADO_SEM_ASO` entra junto, pelo mesmo motivo de lá: a admissão foi liberada porque o ASO não
 * existia, e quem já tem o ASO validado tem de concluir o Exame. Manter a lista espelhada é o que
 * impede o script de recuperação de deixar para trás justamente o caso que a OST criou.
 */
const RECUPERAVEIS = [
  "A_AGENDAR",
  "AGENDADO",
  "AGUARDANDO_ASO",
  "ASO_PENDENTE",
  "LIBERADO_SEM_ASO",
];

/** Faróis fora da esteira viva: declínio/rescisão e pré-admissão não são recuperados (§A.16). */
const FAROIS_FORA = ["DECLINOU", "RESCISAO", "AGUARDANDO_LIBERACAO", "LIBERACAO_RECUSADA"];

async function main() {
  const { sql } = createDb(process.env.DATABASE_URL!, 5);

  // ── DIAGNÓSTICO (roda sempre, inclusive em DRY) ────────────────────────────
  const alvoExame = await sql<{ id: string; status: string }[]>`
    SELECT f.id, f.status
    FROM frentes_admissao f
    JOIN admissoes a ON a.id = f.admissao_id
    JOIN documentos_admissao d ON d.admissao_id = a.id
    JOIN tipos_documento t ON t.id = d.tipo_documento_id AND t.codigo = 'ASO'
    WHERE f.tipo = 'EXAME'
      AND f.concluida = false
      AND f.status = ANY(${RECUPERAVEIS})
      AND d.estado = 'ENTREGUE'
      AND a.aso_validado = true
      AND a.farol_global <> ALL(${FAROIS_FORA})`;

  const alvoCadastro = await sql<{ id: string }[]>`
    SELECT a.id
    FROM admissoes a
    WHERE a.farol_global <> ALL(${FAROIS_FORA})
      AND EXISTS (SELECT 1 FROM frentes_admissao f
                  WHERE f.admissao_id = a.id AND f.tipo = 'AUDITORIA' AND f.concluida)
      AND EXISTS (SELECT 1 FROM frentes_admissao f
                  WHERE f.admissao_id = a.id AND f.tipo = 'EXAME' AND f.concluida)
      AND NOT EXISTS (SELECT 1 FROM frentes_admissao f
                      WHERE f.admissao_id = a.id AND f.tipo = 'CADASTRO_CONTRATO')`;

  const porStatus = alvoExame.reduce<Record<string, number>>((acc, f) => {
    acc[f.status] = (acc[f.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[recupera] exames a concluir em APTO: ${alvoExame.length} ` +
      `(${JSON.stringify(porStatus)})${DRY ? " (DRY-RUN)" : ""}`,
  );
  console.log(
    `[recupera] Cadastros a nascer (antes da etapa 1): ${alvoCadastro.length}${DRY ? " (DRY-RUN)" : ""}`,
  );

  if (DRY) {
    await sql.end();
    return;
  }

  // ── ETAPA 1 + 2, numa transação só ─────────────────────────────────────────
  const { exames, cadastros } = await sql.begin(async (sql) => {
    const exames = await sql<{ admissao_id: string }[]>`
      UPDATE frentes_admissao f
      SET status = 'APTO', concluida = true, data_conclusao = now(), atualizado_em = now()
      FROM admissoes a
      WHERE f.admissao_id = a.id
        AND f.tipo = 'EXAME'
        AND f.concluida = false
        AND f.status = ANY(${RECUPERAVEIS})
        AND a.aso_validado = true
        AND a.farol_global <> ALL(${FAROIS_FORA})
        AND EXISTS (SELECT 1 FROM documentos_admissao d
                    JOIN tipos_documento t ON t.id = d.tipo_documento_id AND t.codigo = 'ASO'
                    WHERE d.admissao_id = a.id AND d.estado = 'ENTREGUE')
      RETURNING f.admissao_id`;

    // Trilha do que a recuperação moveu. `de_status` sai da lista de alvos levantada acima (o UPDATE
    // já reescreveu a linha), casada por id da frente.
    const deStatusPorFrente = new Map(alvoExame.map((f) => [f.id, f.status]));
    const movidas = await sql<{ id: string; admissao_id: string }[]>`
      SELECT id, admissao_id FROM frentes_admissao
      WHERE admissao_id = ANY(${exames.map((e) => e.admissao_id)}) AND tipo = 'EXAME'`;
    for (const f of movidas) {
      await sql`
        INSERT INTO frente_status_eventos (admissao_id, frente_id, tipo, de_status, para_status, reversao, autor_id)
        VALUES (${f.admissao_id}, ${f.id}, 'EXAME', ${deStatusPorFrente.get(f.id) ?? "A_AGENDAR"},
                'APTO', false, NULL)`;
    }

    const cadastros = await sql<{ admissao_id: string }[]>`
      INSERT INTO frentes_admissao (admissao_id, tipo, status, concluida, data_inicio)
      SELECT a.id, 'CADASTRO_CONTRATO', 'A_CADASTRAR', false, now()
      FROM admissoes a
      WHERE a.farol_global <> ALL(${FAROIS_FORA})
        AND EXISTS (SELECT 1 FROM frentes_admissao f
                    WHERE f.admissao_id = a.id AND f.tipo = 'AUDITORIA' AND f.concluida)
        AND EXISTS (SELECT 1 FROM frentes_admissao f
                    WHERE f.admissao_id = a.id AND f.tipo = 'EXAME' AND f.concluida)
        AND NOT EXISTS (SELECT 1 FROM frentes_admissao f
                        WHERE f.admissao_id = a.id AND f.tipo = 'CADASTRO_CONTRATO')
      RETURNING admissao_id`;

    return { exames, cadastros };
  });

  // ── ETAPA 3: farol das tocadas ─────────────────────────────────────────────
  // Mesma derivação do `recomputeFarolGlobal`: com AUDITORIA e EXAME concluídos e SEM data de
  // admissão, o farol automático é BANCO_AGUARDAR; com data, segue EM_ADMISSAO. Os faróis manuais
  // (ADMISSAO_CONCLUIDA, DECLINOU, RESCISAO) são pegajosos e NÃO são sobrescritos (§A.3).
  const ids = [...new Set(exames.map((e) => e.admissao_id))];
  const farois = ids.length
    ? await sql<{ id: string }[]>`
        UPDATE admissoes a
        SET farol_global = 'BANCO_AGUARDAR', atualizado_em = now()
        WHERE a.id = ANY(${ids})
          AND a.farol_global = 'EM_ADMISSAO'
          AND a.data_admissao IS NULL
          AND EXISTS (SELECT 1 FROM frentes_admissao f
                      WHERE f.admissao_id = a.id AND f.tipo = 'AUDITORIA' AND f.concluida)
        RETURNING a.id`
    : [];

  console.log(`[recupera] exames concluídos em APTO: ${exames.length}`);
  console.log(`[recupera] frentes de Cadastro criadas: ${cadastros.length}`);
  console.log(`[recupera] faróis movidos para BANCO_AGUARDAR: ${farois.length}`);

  await sql.end();
}

main().catch((e) => {
  console.error("[recupera] ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
