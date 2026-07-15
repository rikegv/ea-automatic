import type { Sql } from "postgres";

/**
 * REGRAS PERMANENTES DE IMPORTAÇÃO DA ESTEIRA (CLAUDE.md §A.16).
 *
 * Aplica, de forma IDEMPOTENTE e TRANSACIONAL, o estado-alvo de toda admissão importada, derivado
 * do seu `farol_global`. Deve ser chamada ao FINAL de qualquer rotina de importação (carga-*.ts),
 * depois de criadas as admissões e definido o farol.
 *
 *  REGRA 1: farol `ADMISSAO_CONCLUIDA` (origem ATIVO): admissão que já aconteceu na vida real entra
 *    com TUDO concluído. Auditoria `ANALISE_OK`, Exame `APTO`, Cadastro/Contrato `INTEGRACAO` (frente
 *    criada), todas `concluida=true`; documentos `ENTREGUE` (zero pendência); assinatura `ASSINADO`;
 *    sinalizador `OK`. Data de conclusão das frentes = coalesce(data_admissao, criado_em).
 *
 *  REGRA 2: farol `DECLINOU`/`RESCISAO` (origem DECLINOU/RESCISAO/CANCELADA): declínio ENCERRADO,
 *    nada ativo na esteira. Frentes em estado de declínio (Auditoria `DECLINOU`, Exame `CANCELADO`),
 *    `concluida=false` (não falsear êxito); NÃO cria Cadastro; assinatura `SEM_ENVELOPE`; documentos
 *    permanecem no estado real (`PENDENTE`, histórico). O declínio NUNCA entra em fila operacional
 *    nem conta como pendência em card algum: isso é garantido em CÓDIGO pelo filtro de farol em
 *    `esteira.listar` (filas + KPIs) e no KPI do gerenciador (`admissoes.service`), não por este
 *    script. Se a pessoa voltar no futuro, é processo novo do zero.
 *
 * Idempotente: só seta valores-alvo fixos; o INSERT do Cadastro usa ON CONFLICT. Rodar 2x não muda
 * nada. §A.6: nenhum CPF/PII (opera só por farol e status).
 */
export async function aplicarRegrasImportacao(sql: Sql): Promise<void> {
  await sql.begin(async (sql) => {
    // ─────────── REGRA 1: CONCLUÍDAS ───────────
    await sql`
      UPDATE frentes_admissao f
      SET status = 'ANALISE_OK', concluida = true,
          data_inicio = COALESCE(f.data_inicio, a.criado_em),
          data_conclusao = COALESCE(a.data_admissao::timestamptz, a.criado_em),
          atualizado_em = now()
      FROM admissoes a
      WHERE f.admissao_id = a.id AND a.farol_global = 'ADMISSAO_CONCLUIDA' AND f.tipo = 'AUDITORIA'`;

    await sql`
      UPDATE frentes_admissao f
      SET status = 'APTO', concluida = true,
          data_inicio = COALESCE(f.data_inicio, a.criado_em),
          data_conclusao = COALESCE(a.data_admissao::timestamptz, a.criado_em),
          atualizado_em = now()
      FROM admissoes a
      WHERE f.admissao_id = a.id AND a.farol_global = 'ADMISSAO_CONCLUIDA' AND f.tipo = 'EXAME'`;

    await sql`
      INSERT INTO frentes_admissao (admissao_id, tipo, status, concluida, data_inicio, data_conclusao)
      SELECT a.id, 'CADASTRO_CONTRATO', 'INTEGRACAO', true,
             a.criado_em, COALESCE(a.data_admissao::timestamptz, a.criado_em)
      FROM admissoes a
      WHERE a.farol_global = 'ADMISSAO_CONCLUIDA'
      ON CONFLICT (admissao_id, tipo) DO UPDATE
      SET status = 'INTEGRACAO', concluida = true,
          data_conclusao = COALESCE(frentes_admissao.data_conclusao, EXCLUDED.data_conclusao),
          atualizado_em = now()`;

    await sql`
      UPDATE documentos_admissao d
      SET estado = 'ENTREGUE', atualizado_em = now()
      FROM admissoes a
      WHERE d.admissao_id = a.id AND a.farol_global = 'ADMISSAO_CONCLUIDA' AND d.estado <> 'ENTREGUE'`;

    await sql`
      UPDATE admissoes
      SET clicksign_status = 'ASSINADO', sinalizador_preenchimento = 'OK', atualizado_em = now()
      WHERE farol_global = 'ADMISSAO_CONCLUIDA'`;

    // ─────────── REGRA 2: DECLÍNIOS ───────────
    await sql`
      UPDATE frentes_admissao f
      SET status = 'DECLINOU', concluida = false, atualizado_em = now()
      FROM admissoes a
      WHERE f.admissao_id = a.id AND a.farol_global IN ('DECLINOU', 'RESCISAO') AND f.tipo = 'AUDITORIA'`;

    await sql`
      UPDATE frentes_admissao f
      SET status = 'CANCELADO', concluida = false, atualizado_em = now()
      FROM admissoes a
      WHERE f.admissao_id = a.id AND a.farol_global IN ('DECLINOU', 'RESCISAO') AND f.tipo = 'EXAME'`;
  });
}
