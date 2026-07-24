"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/shell/AppShell";
import { menuDaRota } from "@/lib/menu-rotas";

/** Guarda de sessão + casca da aplicação para todas as rotas autenticadas. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, menus, isAdmin, temMenu } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // OST permissão de menu: a tela desta rota é governada por algum menu que o usuário NÃO tem?
  // Espera os menus carregarem (evita bloquear no piscar inicial). Admin nunca é bloqueado.
  const menuDaTela = menuDaRota(pathname);
  const bloqueadoPorMenu =
    !isAdmin && !!menuDaTela && !!menus && !temMenu(menuDaTela);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    // Bloqueio de senha temporária: usuário novo ou reset chega com a flag e é forçado à troca
    // antes de acessar qualquer tela do app.
    else if (user.senhaTemporaria) router.replace("/trocar-senha");
    // Digitou a URL de uma tela não liberada: volta ao início. O backend já barra as operações;
    // isto evita a pessoa cair numa tela morta.
    else if (bloqueadoPorMenu) router.replace("/");
  }, [loading, user, router, bloqueadoPorMenu]);

  if (loading || !user || user.senhaTemporaria || bloqueadoPorMenu) {
    return <main className="grid min-h-screen place-items-center text-dim">Carregando…</main>;
  }

  return <AppShell>{children}</AppShell>;
}
