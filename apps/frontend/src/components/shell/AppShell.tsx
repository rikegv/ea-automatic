import type { ReactNode } from "react";
import { Aurora } from "@/components/ui/Aurora";
import { Sidebar } from "./Sidebar";
import { LiberacaoAlertaProvider } from "./LiberacaoAlerta";

/** Casca da aplicação: aurora de fundo + sidebar fixa + área principal rolável. O provider de alerta
 *  (Parte 3) faz UM polling do contador de Liberação e sobe o popup global sobre qualquer tela. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LiberacaoAlertaProvider>
      <Aurora />
      <div className="relative z-[1] flex min-h-screen">
        <Sidebar />
        <main className="relative z-[1] max-h-screen flex-1 overflow-y-auto px-8 pb-10 pt-7">
          {children}
        </main>
      </div>
    </LiberacaoAlertaProvider>
  );
}
