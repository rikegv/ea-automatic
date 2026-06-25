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
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <main className="grid min-h-screen place-items-center text-dim">Carregando…</main>;
  }

  return <AppShell>{children}</AppShell>;
}
