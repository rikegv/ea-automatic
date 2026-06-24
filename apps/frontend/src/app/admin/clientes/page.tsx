"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Clientes</h1>

      <form
        onSubmit={create}
        className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-5"
      >
        <input
          required
          placeholder="Cód. cliente *"
          value={form.codCliente}
          onChange={(e) => setForm({ ...form, codCliente: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Razão social *"
          value={form.razaoSocial}
          onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          placeholder="CNPJ"
          value={form.cnpj}
          onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          placeholder="Operação"
          value={form.nomeOperacao}
          onChange={(e) => setForm({ ...form, nomeOperacao: e.target.value })}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 sm:col-span-5 sm:w-fit"
        >
          {saving ? "Adicionando…" : "Adicionar cliente"}
        </button>
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Razão social</th>
              <th className="px-4 py-2 font-medium">CNPJ</th>
              <th className="px-4 py-2 font-medium">Operação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhum cliente cadastrado. Pronto para a carga das bases (Fase 1B).
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.codCliente} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono">{c.codCliente}</td>
                  <td className="px-4 py-2">{c.razaoSocial}</td>
                  <td className="px-4 py-2">{c.cnpj ?? "—"}</td>
                  <td className="px-4 py-2">{c.nomeOperacao ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove(c.codCliente)}
                      className="text-red-600 hover:underline"
                    >
                      remover
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
