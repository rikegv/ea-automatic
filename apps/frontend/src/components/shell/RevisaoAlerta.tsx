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
import { useAuth } from "@/lib/auth-context";
import { contarPendentesDeRevisao } from "@/lib/as-vagas-revisao";

/**
 * BADGE DE "LIBERAR VAGA" (Atração e Seleção). MESMO molde do contador da Liberação Admissional
 * (`LiberacaoAlerta`): um polling leve no topo da casca autenticada alimenta o badge vermelho do
 * menu `as-vagas-revisao` com o número de vagas em PENDENTE_REVISAO.
 *
 * DUAS DIFERENÇAS DELIBERADAS em relação ao alerta de Liberação, e as duas por escopo (§A.14):
 *  - SEM POPUP. O diretor pediu a TAG VERMELHA com o CONTADOR, no molde do badge de Liberar
 *    Admissão; o popup insistente é outra peça e não foi pedido aqui.
 *  - SÓ POLLA QUEM TEM O MENU. A rota `/as/vagas/pendentes-revisao/contagem` é guardada pelo menu
 *    `as-vagas-revisao`; sem ele a chamada tomaria 403. Quem não tem o menu não vê o item nem o
 *    badge, então também não precisa contar.
 */
const POLL_MS = 90_000;

const CountContext = createContext<number>(0);
/** Contagem de vagas PENDENTE_REVISAO (para o badge do menu). 0 = esconde. */
export function useRevisaoCount(): number {
  return useContext(CountContext);
}

export function RevisaoAlertaProvider({ children }: { children: ReactNode }) {
  const { token, temMenu } = useAuth();
  const podeVer = temMenu("as-vagas-revisao");
  const [count, setCount] = useState(0);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const tick = useCallback(async () => {
    if (!token || !podeVer) return;
    try {
      const n = await contarPendentesDeRevisao(token);
      if (montado.current) setCount(n);
    } catch {
      /* contador é auxiliar; falha de rede não quebra a navegação */
    }
  }, [token, podeVer]);

  useEffect(() => {
    if (!token || !podeVer) {
      setCount(0);
      return;
    }
    void tick();
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void tick();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [token, podeVer, tick]);

  return <CountContext.Provider value={count}>{children}</CountContext.Provider>;
}
