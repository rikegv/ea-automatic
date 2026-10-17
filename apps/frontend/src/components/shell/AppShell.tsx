import type { ReactNode } from "react";
import { Aurora } from "@/components/ui/Aurora";
import { Sidebar } from "./Sidebar";
import { LiberacaoAlertaProvider } from "./LiberacaoAlerta";
import { DiagnosticoAlertaProvider } from "./DiagnosticoAlerta";
import { RevisaoAlertaProvider } from "./RevisaoAlerta";
import { NotificacoesProvider } from "./NotificacoesProvider";

/** Casca da aplicação: aurora de fundo + sidebar fixa + área principal rolável. Os providers de alerta
 *  (Parte 3) fazem UM polling cada e sobem o popup global sobre qualquer tela. O de notificações
 *  (Parte 4) é insistente: reaparece a cada ciclo até o usuário dar ciência a todas. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <LiberacaoAlertaProvider>
      <DiagnosticoAlertaProvider>
      <RevisaoAlertaProvider>
      <NotificacoesProvider>
      <Aurora />
      <div className="relative z-[1] flex min-h-screen">
        <Sidebar />
        <main className="relative z-[1] max-h-screen flex-1 overflow-y-auto px-8 pb-10 pt-7">
          {children}
        </main>
      </div>
      </NotificacoesProvider>
      </RevisaoAlertaProvider>
      </DiagnosticoAlertaProvider>
    </LiberacaoAlertaProvider>
  );
}
