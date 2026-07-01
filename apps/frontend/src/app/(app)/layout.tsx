"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/shell/AppShell";

/** Guarda de sessão + casca da aplicação para todas as rotas autenticadas. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    // Bloqueio de senha temporária: usuário novo ou reset chega com a flag e é forçado à troca
    // antes de acessar qualquer tela do app.
    else if (user.senhaTemporaria) router.replace("/trocar-senha");
  }, [loading, user, router]);

  if (loading || !user || user.senhaTemporaria) {
    return <main className="grid min-h-screen place-items-center text-dim">Carregando…</main>;
  }

  return <AppShell>{children}</AppShell>;
}
