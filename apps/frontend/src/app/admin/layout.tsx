"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

const NAV = [
  { href: "/admin/clientes", label: "Clientes" },
  { href: "/admin/cargos", label: "Cargos" },
  { href: "/admin/regua", label: "Régua documental" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading, isAdmin, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <main className="grid min-h-screen place-items-center text-slate-500">Carregando…</main>;
  }

  if (!isAdmin) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="text-center">
          <p className="text-lg font-semibold">Acesso restrito</p>
          <p className="mt-1 text-sm text-slate-500">
            A administração de cadastros é exclusiva de Master / Super Admin.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm underline">
            Voltar ao início
          </Link>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <Link href="/" className="block text-lg font-bold">
          EA AUTOMATIC
        </Link>
        <p className="mb-4 text-xs text-slate-500">Administração de cadastros</p>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname === n.href ? "bg-slate-900 text-white" : "hover:bg-slate-100"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">
            {user.email} · {user.papel}
          </span>
          <button
            onClick={() => logout().then(() => router.replace("/login"))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
          >
            Sair
          </button>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
