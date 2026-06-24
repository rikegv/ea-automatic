"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Cargo {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function CargosPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<Cargo[]>("/admin/cargos", { token }));
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
      await apiFetch("/admin/cargos", { method: "POST", token, body: { nome } });
      setNome("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Remover o cargo "${label}"?`)) return;
    try {
      await apiFetch(`/admin/cargos/${id}`, { method: "DELETE", token });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Cargos</h1>

      <form onSubmit={create} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <input
          required
          placeholder="Nome do cargo *"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {saving ? "Adicionando…" : "Adicionar"}
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
              <th className="px-4 py-2 font-medium">Cargo</th>
              <th className="px-4 py-2 font-medium">Ativo</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Carregando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                  Nenhum cargo cadastrado.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{c.nome}</td>
                  <td className="px-4 py-2">{c.ativo ? "sim" : "não"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => remove(c.id, c.nome)}
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
