import { eq } from "drizzle-orm";
import type { FarolGlobal } from "@ea/shared-types";
import type { Database } from "../db/client";
import { admissoes, frentesAdmissao } from "../db/schema";
import { deriveFarolGlobal } from "../domain/admissao";

/**
 * Recalcula e persiste o farol global AUTOMÁTICO de uma admissão (§A.3 / Fase 4 complemento), a
 * partir do estado das frentes e da data de admissão. Idempotente: só escreve quando muda. Estados
 * manuais (DECLINOU/RESCISAO/ADMISSAO_CONCLUIDA) são preservados pela `deriveFarolGlobal`.
 *
 * Chamado após qualquer evento que possa alterar a derivação: mudança de status de frente
 * (Esteira), conclusão automática da Auditoria (Fase 4 item 2) e edição da data de admissão
 * (Gerenciador). Sem PII (§A.6) — opera por ids e estado.
 */
export async function recomputeFarolGlobal(
  db: Database,
  admissaoId: string,
): Promise<FarolGlobal | null> {
  const adm = await db.query.admissoes.findFirst({ where: eq(admissoes.id, admissaoId) });
  if (!adm) return null;

  const frentes = await db
    .select({ tipo: frentesAdmissao.tipo, concluida: frentesAdmissao.concluida })
    .from(frentesAdmissao)
    .where(eq(frentesAdmissao.admissaoId, admissaoId));

  const novo = deriveFarolGlobal({
    atual: adm.farolGlobal,
    auditoriaConcluida: frentes.some((f) => f.tipo === "AUDITORIA" && f.concluida),
    exameApto: frentes.some((f) => f.tipo === "EXAME" && f.concluida),
    temDataAdmissao: Boolean(adm.dataAdmissao),
  });

  if (novo !== adm.farolGlobal) {
    await db
      .update(admissoes)
      .set({ farolGlobal: novo, atualizadoEm: new Date() })
      .where(eq(admissoes.id, admissaoId));
  }
  return novo;
}
