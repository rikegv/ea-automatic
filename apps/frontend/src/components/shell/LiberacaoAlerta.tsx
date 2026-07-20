"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// Polling do contador (leve): 90s. Reaparição do popup insistente após "Estou ciente": 20 min
// (decisão do diretor). O contador segue vivo o tempo todo; só o popup é espaçado.
const POLL_MS = 90_000;
const REAPARICAO_MS = 20 * 60_000;

const CountContext = createContext<number>(0);
/** Contagem de admissões AGUARDANDO_LIBERACAO (para o badge do menu). 0 = esconde. */
export function useLiberacaoCount(): number {
  return useContext(CountContext);
}

const RefreshContext = createContext<() => void>(() => {});
/**
 * Força a rebusca IMEDIATA da contagem, sem esperar o ciclo de polling de 90s. Chamado pela tela de
 * Liberação logo após liberar / recusar / reativar, para o badge refletir a mudança na hora.
 */
export function useLiberacaoRefresh(): () => void {
  return useContext(RefreshContext);
}

/**
 * Alerta global de Liberação Admissional (Parte 3). UM polling só, no topo da casca autenticada,
 * alimenta o badge do menu (via contexto) E o popup insistente. Sem canal de push → polling do cliente.
 * O popup:
 *  - sobe quando aparece pendência (0 → >0), para TODOS os perfis;
 *  - "Estou ciente" fecha e agenda a reaparição em 20 min (se ainda houver pendência);
 *  - NÃO empilha (só um por vez); "Estou ciente" NÃO zera o contador (só liberar/recusar zera).
 */
export function LiberacaoAlertaProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();
  const [count, setCount] = useState(0);
  const [popupAberto, setPopupAberto] = useState(false);
  // Marca de tempo até quando o popup fica suprimido (após "Estou ciente"). Ref para não re-render.
  const suprimidoAte = useRef(0);
  const countRef = useRef(0);
  // Enquanto montado: evita aplicar contagem de uma busca que resolve após o unmount / troca de token.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Uma rebusca da contagem. Reusada pelo polling de fundo (90s) E pelo refresh imediato exposto no
  // contexto (chamado após liberar/recusar/reativar). A semântica do popup não muda.
  const tick = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiFetch<{ count: number }>("/admissoes/aguardando-liberacao/contagem", {
        token,
      });
      if (!montado.current) return;
      setCount(r.count);
      const antes = countRef.current;
      countRef.current = r.count;
      if (r.count > 0) {
        // Sobe o popup quando: acabou de aparecer pendência (0→>0), OU passou a janela de supressão.
        const janelaLiberada = Date.now() >= suprimidoAte.current;
        if (antes === 0 || janelaLiberada) setPopupAberto(true);
      } else {
        // Zerou (tudo liberado/recusado): fecha e limpa a supressão.
        setPopupAberto(false);
        suprimidoAte.current = 0;
      }
    } catch {
      /* contador é auxiliar; falha de rede não quebra a navegação */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(id);
  }, [token, tick]);

  function estouCiente() {
    setPopupAberto(false);
    suprimidoAte.current = Date.now() + REAPARICAO_MS;
  }
  function irParaLiberacao() {
    setPopupAberto(false);
    suprimidoAte.current = Date.now() + REAPARICAO_MS;
    router.push("/liberacao");
  }

  return (
    <CountContext.Provider value={count}>
      <RefreshContext.Provider value={() => void tick()}>{children}</RefreshContext.Provider>
      {popupAberto && count > 0 && (
        <Modal
          onClose={estouCiente}
          ariaLabel="Admissões aguardando liberação"
          className="max-w-[440px] p-6"
        >
          <div className="mb-4">
            <div className="eyebrow !mb-1">Liberação Admissional</div>
            <h2 className="font-display text-xl font-bold">
              {count} admissão{count === 1 ? "" : "ões"} aguardando liberação
            </h2>
            <p className="mt-1 text-[13px] text-dim">
              {count === 1 ? "Há uma pré-admissão" : `Há ${count} pré-admissões`} do Pandapé
              esperando cliente e cargo para entrar na esteira.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={estouCiente}>
              Estou ciente
            </Button>
            <Button onClick={irParaLiberacao}>Ver liberação</Button>
          </div>
        </Modal>
      )}
    </CountContext.Provider>
  );
}
