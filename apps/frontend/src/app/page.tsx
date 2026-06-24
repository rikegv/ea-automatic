"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export default function DashboardPage() {
  const { user, loading, isAdmin, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return <main className="grid min-h-screen place-items-center text-slate-500">Carregando…</main>;
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">EA AUTOMATIC</h1>
          <p className="text-sm text-slate-500">
            {user.email} · <span className="font-medium">{user.papel}</span>
          </p>
        </div>
        <button
          onClick={() => logout().then(() => router.replace("/login"))}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100"
        >
          Sair
        </button>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Esteira admissional</h2>
        <p className="mt-1 text-sm text-slate-600">
          Visão coletiva: todo consultor enxerga todas as frentes (auditoria, exame, cadastro).
          As telas da esteira chegam nas próximas fases.
        </p>
      </section>

      {isAdmin && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Administração</h2>
          <p className="mt-1 text-sm text-slate-600">Cadastros-base (restrito à administração).</p>
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Abrir administração de cadastros →
          </Link>
        </section>
      )}
    </main>
  );
}
