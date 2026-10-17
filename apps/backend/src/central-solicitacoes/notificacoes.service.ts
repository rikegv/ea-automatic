import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { NotificacaoApi } from "@ea/shared-types";
import type { AuthUser } from "../auth/auth.types";
import type { Database } from "../db/client";
import { DRIZZLE } from "../db/drizzle.module";
import { notificacoes } from "../db/schema";

/**
 * NOTIFICAÇÕES NA PLATAFORMA (OST Central de Solicitações).
 *
 * Qualquer usuário autenticado lê as SUAS pendentes (sem ciência). O sininho pinga a cada acesso e
 * só para quando o usuário clica "Estou Ciente", que persiste `cienteEm` (baixa no servidor, não
 * supressão local). O backend nunca devolve notificação de outro usuário.
 */
@Injectable()
export class NotificacoesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** As notificações pendentes (sem ciência) do usuário, mais recentes primeiro. */
  async pendentes(user: AuthUser): Promise<NotificacaoApi[]> {
    const linhas = await this.db
      .select({
        id: notificacoes.id,
        titulo: notificacoes.titulo,
        corpo: notificacoes.corpo,
        rota: notificacoes.rota,
        criadoEm: notificacoes.criadoEm,
      })
      .from(notificacoes)
      .where(and(eq(notificacoes.usuarioId, user.id), isNull(notificacoes.cienteEm)))
      .orderBy(desc(notificacoes.criadoEm));

    return linhas.map((l) => ({
      id: l.id,
      titulo: l.titulo,
      corpo: l.corpo,
      rota: l.rota,
      criadoEm: l.criadoEm.toISOString(),
    }));
  }

  /** Quantas notificações pendentes o usuário tem (para o badge do sininho). */
  async contagem(user: AuthUser): Promise<{ count: number }> {
    const [linha] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificacoes)
      .where(and(eq(notificacoes.usuarioId, user.id), isNull(notificacoes.cienteEm)));
    return { count: linha?.count ?? 0 };
  }

  /**
   * Dá ciência numa notificação. Só baixa se a notificação for DO usuário (senão 404, não revela a
   * existência de notificação alheia). Idempotente: dar ciência de novo não altera o carimbo.
   */
  async marcarCiente(id: string, user: AuthUser): Promise<{ ok: true }> {
    const [atualizada] = await this.db
      .update(notificacoes)
      .set({ cienteEm: new Date() })
      .where(
        and(
          eq(notificacoes.id, id),
          eq(notificacoes.usuarioId, user.id),
          isNull(notificacoes.cienteEm),
        ),
      )
      .returning({ id: notificacoes.id });

    if (!atualizada) {
      // Ou a notificação não existe, ou não é do usuário, ou já tinha ciência. Confirma a existência
      // dela PARA ESTE usuário antes de decidir entre "ok idempotente" e 404.
      const [existe] = await this.db
        .select({ id: notificacoes.id })
        .from(notificacoes)
        .where(and(eq(notificacoes.id, id), eq(notificacoes.usuarioId, user.id)))
        .limit(1);
      if (!existe) throw new NotFoundException("Notificação não encontrada.");
    }
    return { ok: true };
  }
}
