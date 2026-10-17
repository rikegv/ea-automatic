/**
 * CAMADA DE DADOS das notificações na plataforma (Parte 4). apiFetch puro, sem react-query.
 *
 * O backend só devolve as PENDENTES (sem ciência). A baixa é server-side: quando o usuário clica
 * "Estou Ciente", a notificação some da próxima leitura, e por isso o popup pode voltar a aparecer no
 * próximo acesso ou ciclo até TODAS terem ciência (não há supressão local, de propósito).
 */
import type { NotificacaoApi } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/** As notificações ainda sem ciência deste usuário. */
export function listarNotificacoesPendentes(
  token: string | null,
): Promise<NotificacaoApi[]> {
  return apiFetch<NotificacaoApi[]>("/notificacoes/pendentes", { token });
}

/** Quantas notificações pendentes há (leve, para badge/polling). */
export function contarNotificacoes(token: string | null): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/notificacoes/contagem", { token });
}

/** Dá ciência a uma notificação. A baixa é persistida no servidor. */
export function darCiencia(id: string, token: string | null): Promise<void> {
  return apiFetch<void>(`/notificacoes/${id}/ciente`, { method: "POST", token });
}
