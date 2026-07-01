"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Aurora } from "@/components/ui/Aurora";
import { GlassCard } from "@/components/ui/GlassCard";
import { Brand } from "@/components/ui/Brand";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

/**
 * Troca obrigatória de senha temporária (fora do grupo (app), sem sidebar — como /login).
 * Chega aqui todo usuário com `senhaTemporaria === true` (cadastro novo ou reset pelo admin).
 * O bloqueio de acesso ao app está no (app)/layout.tsx; aqui só resolvemos a troca.
 */
export default function TrocarSenhaPage() {
  const { user, loading, trocarSenha } = useAuth();
  const router = useRouter();
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sem sessão → login. Já sem senha temporária → não há o que trocar, volta à home.
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!user.senhaTemporaria) router.replace("/");
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (novaSenha.length < 8) {
      setError("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }
    if (novaSenha === senhaAtual) {
      setError("A nova senha deve ser diferente da senha temporária.");
      return;
    }
    setSubmitting(true);
    try {
      await trocarSenha(senhaAtual, novaSenha);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Falha ao trocar a senha.");
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
            Sua senha atual é temporária. Defina uma nova senha para continuar.
          </p>

          <div className="mb-4">
            <label className="ds-label" htmlFor="senha-atual">
              Senha temporária
            </label>
            <input
              id="senha-atual"
              type="password"
              required
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="ds-input"
              placeholder="••••••••••"
            />
          </div>

          <div className="mb-4">
            <label className="ds-label" htmlFor="nova-senha">
              Nova senha
            </label>
            <input
              id="nova-senha"
              type="password"
              required
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="ds-input"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          <div className="mb-4">
            <label className="ds-label" htmlFor="confirmar-senha">
              Confirmar nova senha
            </label>
            <input
              id="confirmar-senha"
              type="password"
              required
              autoComplete="new-password"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
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
            {submitting ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </GlassCard>
      </main>
    </>
  );
}
