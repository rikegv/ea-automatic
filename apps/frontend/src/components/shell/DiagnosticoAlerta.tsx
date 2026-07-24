"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

// Mesmo padrão do alerta de Liberação: contador (badge) por polling + popup insistente a cada 20 min.
const POLL_MS = 90_000;
const REAPARICAO_MS = 20 * 60 * 1000;

interface AlertaResumo {
  aceso: boolean;
  total: number;
  motivos: string[];
}

const AlertaContext = createContext<AlertaResumo>({ aceso: false, total: 0, motivos: [] });
/** Contador de problemas do diagnóstico (0 = tudo ok). Só admin recebe valor > 0. */
export function useDiagnosticoAlerta(): AlertaResumo {
  return useContext(AlertaContext);
}

/**
 * Alerta global do DIAGNÓSTICO (Bloco 7): badge na sidebar + popup a cada 20 min quando há problema.
 * Só roda para MASTER/SUPER_ADMIN (a rota é admin-only). "Problema" é o que o backend decidiu em
 * `calcularAlerta`: sinal do Bloco 1/2 acima de zero ou dependência externa fora do ar.
 */
export function DiagnosticoAlertaProvider({ children }: { children: ReactNode }) {
  const { token, isAdmin } = useAuth();
  const router = useRouter();
  const [resumo, setResumo] = useState<AlertaResumo>({ aceso: false, total: 0, motivos: [] });
  const [popupAberto, setPopupAberto] = useState(false);
  const suprimidoAte = useRef(0);
  const acesoAntes = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const tick = useCallback(async () => {
    if (!token || !isAdmin) return;
    try {
      const r = await apiFetch<AlertaResumo>("/diagnostico/alerta", { token });
      if (!montado.current) return;
      setResumo(r);
      const antes = acesoAntes.current;
      acesoAntes.current = r.aceso;
      if (r.aceso) {
        const janelaLiberada = Date.now() >= suprimidoAte.current;
        if (!antes || janelaLiberada) setPopupAberto(true);
      } else {
        setPopupAberto(false);
        suprimidoAte.current = 0;
      }
    } catch {
      /* auxiliar: falha de rede não quebra a navegação */
    }
  }, [token, isAdmin]);

  useEffect(() => {
    if (!token || !isAdmin) return;
    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => clearInterval(id);
  }, [token, isAdmin, tick]);

  function estouCiente() {
    setPopupAberto(false);
    suprimidoAte.current = Date.now() + REAPARICAO_MS;
  }
  function irParaDiagnostico() {
    setPopupAberto(false);
    suprimidoAte.current = Date.now() + REAPARICAO_MS;
    router.push("/admin/diagnostico");
  }

  return (
    <AlertaContext.Provider value={resumo}>
      {children}
      {popupAberto && resumo.aceso && (
        <Modal onClose={estouCiente} ariaLabel="Diagnóstico do sistema" className="max-w-[460px] p-6">
          <div className="mb-4">
            <div className="eyebrow !mb-1">Diagnóstico do sistema</div>
            <h2 className="font-display text-xl font-bold">
              {resumo.total} problema{resumo.total === 1 ? "" : "s"} detectado{resumo.total === 1 ? "" : "s"}
            </h2>
            <ul className="mt-2 space-y-1 text-[13px] text-dim">
              {resumo.motivos.slice(0, 6).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={estouCiente}>
              Estou ciente
            </Button>
            <Button onClick={irParaDiagnostico}>Ver diagnóstico</Button>
          </div>
        </Modal>
      )}
    </AlertaContext.Provider>
  );
}
