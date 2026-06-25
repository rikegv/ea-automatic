"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { Aurora } from "@/components/ui/Aurora";
import { GlassCard } from "@/components/ui/GlassCard";
import { Brand } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Aurora />
      <div className="absolute right-5 top-5 z-[2]">
        <ThemeToggle />
      </div>
      <main className="relative z-[1] flex min-h-screen items-center justify-center p-6">
        <GlassCard as="form" onSubmit={onSubmit} className="w-full max-w-[400px] p-[40px_36px]">
          <Brand className="mb-2" />
          <p className="mb-[26px] mt-[18px] text-sm text-dim">
            Gestão da esteira admissional. Entre para continuar.
          </p>

          <div className="mb-4">
            <label className="ds-label" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ds-input"
              placeholder="voce@empresa.com"
            />
          </div>

          <div className="mb-4">
            <label className="ds-label" htmlFor="senha">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ds-input"
              placeholder="••••••••••"
            />
          </div>

          {error && (
            <p
              className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button type="submit" disabled={submitting} className="w-full py-[13px]">
            {submitting ? "Entrando…" : "Entrar"}
          </Button>
        </GlassCard>
      </main>
    </>
  );
}
