"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

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
    <>
      <PageHead eyebrow="Cadastros" title="Cargos" subtitle="Catálogo de cargos da admissão." />

      <GlassCard as="form" onSubmit={create} className="mb-5 flex flex-wrap gap-3 p-4">
        <input
          required
          placeholder="Nome do cargo *"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="ds-input flex-1"
        />
        <Button type="submit" disabled={saving} className="shrink-0 py-2.5">
          {saving ? "Adicionando…" : "Adicionar"}
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
              <th>Cargo</th>
              <th>Ativo</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-faint">
                  Carregando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-faint">
                  Nenhum cargo cadastrado.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.nome}</td>
                  <td>{c.ativo ? "sim" : "não"}</td>
                  <td className="text-right">
                    <button onClick={() => remove(c.id, c.nome)} className="text-danger hover:underline">
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
