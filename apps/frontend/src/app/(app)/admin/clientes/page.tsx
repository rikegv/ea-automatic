"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

interface Cliente {
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
  ativo: boolean;
}

const EMPTY = { codCliente: "", cnpj: "", razaoSocial: "", nomeOperacao: "" };

export default function ClientesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<Cliente[]>("/admin/clientes", { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) void load();
  }, [token, load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/clientes", {
        method: "POST",
        token,
        body: {
          codCliente: form.codCliente,
          razaoSocial: form.razaoSocial,
          cnpj: form.cnpj || undefined,
          nomeOperacao: form.nomeOperacao || undefined,
        },
      });
      setForm(EMPTY);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(cod: string) {
    if (!window.confirm(`Remover o cliente ${cod}?`)) return;
    try {
      await apiFetch(`/admin/clientes/${encodeURIComponent(cod)}`, { method: "DELETE", token });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Cadastros"
        title="Clientes"
        subtitle="Código, razão social, CNPJ e nome de operação."
      />

      <GlassCard as="form" onSubmit={create} className="mb-5 grid gap-3 p-4 sm:grid-cols-5">
        <input
          required
          placeholder="Cód. cliente *"
          value={form.codCliente}
          onChange={(e) => setForm({ ...form, codCliente: e.target.value })}
          className="ds-input"
        />
        <input
          required
          placeholder="Razão social *"
          value={form.razaoSocial}
          onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
          className="ds-input sm:col-span-2"
        />
        <input
          placeholder="CNPJ"
          value={form.cnpj}
          onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
          className="ds-input"
        />
        <input
          placeholder="Operação"
          value={form.nomeOperacao}
          onChange={(e) => setForm({ ...form, nomeOperacao: e.target.value })}
          className="ds-input"
        />
        <Button type="submit" disabled={saving} className="py-2.5 sm:col-span-5 sm:w-fit">
          {saving ? "Adicionando…" : "Adicionar cliente"}
        </Button>
      </GlassCard>

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <table className="ds-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Razão social</th>
              <th>CNPJ</th>
              <th>Operação</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-faint">
                  Carregando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-faint">
                  Nenhum cliente cadastrado. Pronto para a carga das bases (Fase 1B).
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.codCliente}>
                  <td className="font-mono">{c.codCliente}</td>
                  <td>{c.razaoSocial}</td>
                  <td>{c.cnpj ?? "—"}</td>
                  <td>{c.nomeOperacao ?? "—"}</td>
                  <td className="text-right">
                    <button onClick={() => remove(c.codCliente)} className="text-danger hover:underline">
                      remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>
    </>
  );
}
