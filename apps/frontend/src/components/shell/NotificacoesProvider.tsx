"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { NotificacaoApi } from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { listarNotificacoesPendentes, darCiencia } from "@/lib/notificacoes";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * ALERTA GLOBAL DE NOTIFICAÇÕES (Parte 4). UM polling só, no topo da casca autenticada, busca as
 * notificações pendentes e sobe um modal insistente por cima de qualquer tela.
 *
 * ─ POR QUE NÃO HÁ SUPRESSÃO LOCAL, ao contrário do `LiberacaoAlerta` ───────────────────────────────
 *
 * O `LiberacaoAlerta` esconde o popup por 20 min após "Estou ciente", porque lá a pendência é da
 * FILA (ela continua lá, e reabrir o popup a cada 90s seria ruído). Aqui é o oposto, e é o ponto da
 * entrega: a baixa é SERVER-SIDE (`POST /notificacoes/:id/ciente`), então "Estou Ciente" remove a
 * notificação de verdade, e o que ainda não teve ciência DEVE voltar a aparecer no próximo acesso e no
 * próximo ciclo. Nada de `localStorage`: a única forma de o modal parar é dar ciência a todas.
 *
 * Disponível a QUALQUER usuário autenticado: guardado só pelo `token`, nunca por menu.
 */
const POLL_MS = 90_000;

export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [pendentes, setPendentes] = useState<NotificacaoApi[]>([]);
  const [baixando, setBaixando] = useState<string | null>(null);
  // Evita aplicar o resultado de uma busca que resolve após o unmount / troca de token.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const tick = useCallback(async () => {
    if (!token) return;
    // Aba em segundo plano não precisa buscar: o usuário não está vendo o modal.
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const lista = await listarNotificacoesPendentes(token);
      if (!montado.current) return;
      setPendentes(lista);
    } catch {
      /* notificação é auxiliar: falha de rede não quebra a navegação */
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setPendentes([]);
      return;
    }
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    // Ao voltar o foco da aba (o polling pausa escondido), rebusca na hora.
    const aoVoltar = () => {
      if (typeof document !== "undefined" && !document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [token, tick]);

  async function estouCiente(n: NotificacaoApi) {
    if (!token) return;
    setBaixando(n.id);
    try {
      await darCiencia(n.id, token);
      // Tira da lista na hora (otimista): quando a lista esvazia, o modal fecha. O servidor é a
      // fonte da verdade e a próxima leitura confirma, trazendo de volta o que ainda falta.
      setPendentes((atual) => atual.filter((x) => x.id !== n.id));
    } catch {
      /* se falhar, a próxima leitura traz de volta; o usuário tenta de novo */
    } finally {
      setBaixando(null);
    }
  }

  function fmtDataHora(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  return (
    <>
      {children}
      {pendentes.length > 0 && (
        <Modal
          /* Escape fecha a janela (a saída de teclado que a §A.41 exige), mas NÃO dá baixa: como
             nada foi reconhecido no servidor, a próxima leitura (foco da aba ou ciclo de 90s) traz
             tudo de volta e o modal reaparece. A baixa real é só pelo "Estou Ciente" de cada item,
             que é a saída de mouse. Sem supressão local, que é o ponto da entrega. */
          onClose={() => setPendentes([])}
          ariaLabel="Notificações"
          className="max-w-xl p-6"
        >
          <div className="mb-4">
            <div className="eyebrow !mb-1">Notificações</div>
            <h2 className="font-display text-xl font-bold">
              {pendentes.length === 1
                ? "Você tem uma notificação"
                : `Você tem ${pendentes.length} notificações`}
            </h2>
            <p className="mt-1 text-[13px] text-dim">
              Este aviso continua aparecendo a cada acesso até você clicar em Estou Ciente em cada
              notificação.
            </p>
          </div>

          <div className="ea-scroll max-h-[55vh] space-y-3 overflow-auto pr-1">
            {pendentes.map((n) => (
              <div
                key={n.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-text">{n.titulo}</h3>
                    <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-dim">
                      {n.corpo}
                    </p>
                    <p className="mt-2 text-[11.5px] text-faint tabular-nums">
                      {fmtDataHora(n.criadoEm)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    variant="secondary"
                    className="!px-3 !py-2 text-[13px]"
                    disabled={baixando === n.id}
                    onClick={() => void estouCiente(n)}
                  >
                    {baixando === n.id ? "Confirmando…" : "Estou Ciente"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
