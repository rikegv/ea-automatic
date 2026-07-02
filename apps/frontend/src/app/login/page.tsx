"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Tela de login (OST-EA-TELA-LOGIN). Identidade visual premium portada 1:1 do HTML de
 * referência aprovado pelo diretor — glassmorphism em duas colunas, aurora de orbes e
 * logo com halo. Tela de marca dedicada: renderiza sempre no tema escuro (paleta fixa
 * do design system: azul #22B0DB + verde #AAD12F), independente do [data-theme] do app.
 *
 * A lógica de autenticação é a REAL já existente: POST /auth/login via useAuth().login
 * (JWT + refresh em cookie + OriginGuard). A troca obrigatória de senha temporária e o
 * RBAC seguem intactos — o (app)/layout redireciona para /trocar-senha quando aplicável.
 */
export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      setError(err instanceof Error ? err.message : "E-mail ou senha incorretos.");
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 p-4 text-white antialiased">
      {/* AMBIENT GLOW — 3 orbes de fundo, paleta EA (azul + verde discreto) + grid sutil */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-orb-pulse absolute -left-40 -top-40 h-[640px] w-[640px] rounded-full bg-[#22B0DB]/25 blur-[140px]" />
        <div className="animate-orb-pulse absolute -bottom-48 -right-48 h-[680px] w-[680px] rounded-full bg-blue-900/25 blur-[140px] [animation-delay:2.5s]" />
        <div className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#AAD12F]/[0.06] blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07] mix-blend-screen"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* CARD GLASSMORPHISM */}
      <main className="animate-fade-in-up relative z-10 w-full max-w-5xl">
        <div className="grid overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl md:grid-cols-2">
          {/* ESQUERDA — identidade visual / logo */}
          <section className="relative flex flex-col justify-center border-b border-white/10 bg-gradient-to-br from-[#22B0DB]/[0.10] via-transparent to-transparent p-8 md:border-b-0 md:border-r md:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-[#22B0DB]/20 blur-3xl"
            />
            <div className="relative">
              {/* Logo estático em public/, dimensionado por altura (w-auto); <img> puro é fiel à referência. */}
              <img
                src="/logo-ea.png"
                alt="Logo EA Automatic"
                className="mb-8 h-44 w-auto animate-float object-contain [filter:drop-shadow(0_0_32px_rgba(34,176,219,0.45))_drop-shadow(0_12px_24px_rgba(0,0,0,0.5))] md:h-64"
              />
              <h1 className="font-display text-3xl font-extrabold leading-[1.05] tracking-tight text-white md:text-[2.6rem]">
                Bem-vindo ao
                <br />
                <span className="bg-gradient-to-r from-[#22B0DB] via-[#22B0DB] to-[#AAD12F] bg-clip-text text-transparent">
                  EA Automatic
                </span>
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/55">
                Gestão inteligente da esteira admissional: cadastro, auditoria documental por IA,
                assinatura eletrônica e arquivamento, tudo em um só painel.
              </p>
            </div>
          </section>

          {/* DIREITA — formulário e-mail/senha (sem Google — auth própria do EA) */}
          <section className="flex flex-col justify-center p-8 md:p-12">
            <header className="mb-8">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[#22B0DB]">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                Acesso Restrito
              </p>
              <h2 className="font-display text-2xl font-bold text-white md:text-3xl">
                Faça seu login
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-white/45">
                Entre com seu e-mail e senha corporativos.
              </p>
            </header>

            <form onSubmit={onSubmit} className="mb-6 flex flex-col gap-4" noValidate>
              <div>
                <label
                  htmlFor="input-email"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/60"
                >
                  E-mail
                </label>
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 5L2 7" />
                  </svg>
                  <input
                    id="input-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    disabled={submitting}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu.email@soulan.com.br"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-11 pr-4 text-sm text-white outline-none transition-all placeholder:text-white/25 focus:border-[#22B0DB] focus:bg-white/[0.08] focus:ring-2 focus:ring-[#22B0DB]/30 disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="input-senha"
                  className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/60"
                >
                  Senha
                </label>
                <div className="relative">
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/30"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                  </svg>
                  <input
                    id="input-senha"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    disabled={submitting}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-11 pr-12 text-sm text-white outline-none transition-all placeholder:text-white/25 focus:border-[#22B0DB] focus:bg-white/[0.08] focus:ring-2 focus:ring-[#22B0DB]/30 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="Mostrar ou ocultar senha"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-[#22B0DB]"
                  >
                    {showPassword ? (
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 7 11 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 1 12s4 7 11 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <path d="m2 2 20 20" />
                      </svg>
                    ) : (
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#22B0DB] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#22B0DB]/20 outline-none transition-all hover:bg-[#22B0DB]/90 hover:shadow-[0_0_0_1px_rgba(34,176,219,0.5),0_0_32px_rgba(34,176,219,0.45),0_12px_32px_rgba(0,0,0,0.4)] focus-visible:ring-2 focus-visible:ring-[#22B0DB]/60 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && (
                  <svg className="h-4 w-4 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-90"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                )}
                <span>{submitting ? "Entrando…" : "Entrar"}</span>
              </button>
            </form>

            {/* Erro / Acesso Negado — sem layout shift (bloco abaixo do formulário) */}
            {error && (
              <div
                role="alert"
                className="animate-fade-in-up mb-6 mt-2 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-[11px] font-bold text-red-200"
              >
                <svg
                  className="mt-0.5 h-[18px] w-[18px] shrink-0 text-red-300"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="uppercase tracking-[0.2em]">Acesso Negado</span>
                  <span className="normal-case font-medium leading-relaxed text-red-200/80">
                    {error}
                  </span>
                </div>
              </div>
            )}

            {/* Loading state */}
            {submitting && (
              <div className="mb-6 mt-2">
                <div className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-[#22B0DB]/90">
                  <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-[#22B0DB]" />
                  <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-[#22B0DB] [animation-delay:0.15s]" />
                  <span className="block h-1.5 w-1.5 animate-bounce rounded-full bg-[#22B0DB] [animation-delay:0.3s]" />
                  <span className="ml-2 text-white/60">Autenticando…</span>
                </div>
              </div>
            )}

            {/* Selo de segurança */}
            <div className="my-8 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-white/25">
              <span className="h-px flex-1 bg-white/10" />
              <span>Acesso Seguro</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="flex items-start gap-3 text-[11px] leading-relaxed text-white/40">
              <svg
                className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[#22B0DB]/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>
                Acesso restrito à rede interna Soulan. Sessão protegida por autenticação com token
                seguro.
              </span>
            </div>
          </section>
        </div>

        <p className="mt-8 text-center text-xs font-medium text-slate-400">
          &copy; 2026 EA Automatic · Todos os direitos reservados. By Grupo Soulan · V.1 2026
        </p>
      </main>
    </div>
  );
}
