import type { Sql } from "postgres";

/**
 * REGRA 3 DA IMPORTAÇÃO: os estados de esteira VIVOS (carga da base de 03-08-2026).
 *
 * A §A.16 cobre dois destinos, a admissão concluída (Regra 1) e o declínio (Regra 2), ambos
 * derivados do `farol_global`. Os estados intermediários da planilha não são farol, são estado de
 * FRENTE, e por isso não cabem naquele arquivo: "CADASTRAR" e "DOC OK - AGUARDANDO ASO" têm o mesmo
 * `farol_global = EM_ADMISSAO` e se distinguem só pelo estado das frentes. Esta é a Regra 3.
 *
 * MORA EM ARQUIVO PRÓPRIO DE PROPÓSITO (§A.26). O `regras-esteira-import.ts` é código validado,
 * chamado por toda rotina de carga, e a sua função opera GLOBALMENTE por farol. Acrescentar a Regra 3
 * lá dentro alcançaria admissões que já estão na plataforma. Aqui a aplicação é ESCOPADA por lista
 * de ids, então só toca o que esta carga acabou de criar.
 *
 *  CADASTRAR: auditoria e exame concluídos, esperando o cadastro. Auditoria `ANALISE_OK`, Exame
 *    `APTO`, ambas `concluida = true`, e a frente CADASTRO_CONTRATO criada em `A_CADASTRAR` (não
 *    concluída). É o gate do Cadastro (§A.3 regra 3) satisfeito de forma legítima: ele só abre com
 *    Auditoria E Exame concluídas, que é exatamente o que este estado descreve.
 *
 *  DOC_OK: auditoria completa, exame EM ABERTO. Auditoria `ANALISE_OK` concluída; o Exame NÃO é
 *    concluído e NÃO recebe `AGUARDANDO_ASO`/`ASO_PENDENTE`, que são derivados pelo scheduler
 *    (shared-types, `STATUS_EXAME_ESPERA_ASO`). Quando a linha trouxe clínica, data e hora, o runner
 *    já gravou o `exame_agendamento` e aqui a frente vai para `AGENDADO`; sem agendamento, fica em
 *    `A_AGENDAR`. O scheduler deriva a espera do ASO depois, sozinho, como faz para as demais.
 *
 * Nos dois casos os documentos vão a `ENTREGUE`: auditoria concluída significa régua obrigatória
 * completa (§A.3, automação da Auditoria), então deixar documento em PENDENTE contradiria a própria
 * frente e faria a admissão aparecer com pendência documental que não existe.
 *
 * `data_conclusao` das frentes = `criado_em` da admissão. A planilha não diz QUANDO cada frente
 * fechou, e inventar data seria pior do que carimbar o momento da importação, que é verdadeiro e
 * rastreável.
 *
 * Idempotente e transacional: só grava valores-alvo fixos e o INSERT do Cadastro usa ON CONFLICT.
 * §A.6: opera por id e status, sem PII.
 */
export async function aplicarRegrasVivas(
  sql: Sql,
  ids: { cadastrar: string[]; docOk: string[] },
): Promise<void> {
  const { cadastrar, docOk } = ids;
  if (cadastrar.length === 0 && docOk.length === 0) return;

  await sql.begin(async (sql) => {
    // ─────────── CADASTRAR: auditoria e exame concluídos, esperando cadastro ───────────
    if (cadastrar.length > 0) {
      await sql`
        UPDATE frentes_admissao f
        SET status = 'ANALISE_OK', concluida = true,
            data_inicio = COALESCE(f.data_inicio, a.criado_em),
            data_conclusao = COALESCE(f.data_conclusao, a.criado_em),
            atualizado_em = now()
        FROM admissoes a
        WHERE f.admissao_id = a.id AND f.tipo = 'AUDITORIA' AND a.id = ANY(${cadastrar}::uuid[])`;

      await sql`
        UPDATE frentes_admissao f
        SET status = 'APTO', concluida = true,
            data_inicio = COALESCE(f.data_inicio, a.criado_em),
            data_conclusao = COALESCE(f.data_conclusao, a.criado_em),
            atualizado_em = now()
        FROM admissoes a
        WHERE f.admissao_id = a.id AND f.tipo = 'EXAME' AND a.id = ANY(${cadastrar}::uuid[])`;

      // O gate do Cadastro (§A.3 regra 3) está satisfeito: as duas frentes acima estão concluídas.
      await sql`
        INSERT INTO frentes_admissao (admissao_id, tipo, status, concluida, data_inicio)
        SELECT a.id, 'CADASTRO_CONTRATO', 'A_CADASTRAR', false, a.criado_em
        FROM admissoes a
        WHERE a.id = ANY(${cadastrar}::uuid[])
        ON CONFLICT (admissao_id, tipo) DO NOTHING`;
    }

    // ─────────── DOC_OK: auditoria completa, exame em aberto ───────────
    if (docOk.length > 0) {
      await sql`
        UPDATE frentes_admissao f
        SET status = 'ANALISE_OK', concluida = true,
            data_inicio = COALESCE(f.data_inicio, a.criado_em),
            data_conclusao = COALESCE(f.data_conclusao, a.criado_em),
            atualizado_em = now()
        FROM admissoes a
        WHERE f.admissao_id = a.id AND f.tipo = 'AUDITORIA' AND a.id = ANY(${docOk}::uuid[])`;

      // Exame segue EM ABERTO. Só sai de A_AGENDAR quando a linha trouxe agendamento de verdade.
      await sql`
        UPDATE frentes_admissao f
        SET status = 'AGENDADO', atualizado_em = now()
        FROM exame_agendamento e
        WHERE f.admissao_id = e.admissao_id AND f.tipo = 'EXAME'
          AND e.data IS NOT NULL AND f.concluida = false
          AND f.admissao_id = ANY(${docOk}::uuid[])`;
    }

    // ─────────── documentos das duas: auditoria concluída = régua completa ───────────
    const todos = [...cadastrar, ...docOk];
    await sql`
      UPDATE documentos_admissao
      SET estado = 'ENTREGUE', atualizado_em = now()
      WHERE admissao_id = ANY(${todos}::uuid[]) AND estado <> 'ENTREGUE'`;
  });
}
