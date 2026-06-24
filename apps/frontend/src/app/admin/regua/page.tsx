"use client";

import { useCallback, useEffect, useState } from "react";
import { EXIGENCIA_DOCUMENTO, type ExigenciaDocumento } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface Cliente {
  codCliente: string;
  razaoSocial: string;
}
interface Cargo {
  id: string;
  nome: string;
}
interface TipoDocumento {
  id: string;
  codigo: string;
  nome: string;
}
interface ReguaRow {
  tipoDocumentoId: string;
  exigencia: ExigenciaDocumento;
}

const ROTULO_EXIGENCIA: Record<ExigenciaDocumento, string> = {
  OBRIGATORIO: "Obrigatório",
  NAO_OBRIGATORIO: "Não obrigatório",
  FACULTATIVO: "Facultativo",
};

export default function ReguaPage() {
  const { token } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [codCliente, setCodCliente] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [mapa, setMapa] = useState<Record<string, ExigenciaDocumento>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Carrega referências (clientes, cargos, 21 tipos de documento).
  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch<Cliente[]>("/admin/clientes", { token }),
      apiFetch<Cargo[]>("/admin/cargos", { token }),
      apiFetch<TipoDocumento[]>("/catalogos/tipos-documento", { token }),
    ])
      .then(([cli, car, tip]) => {
        setClientes(cli);
        setCargos(car);
        setTipos(tip);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar referências"));
  }, [token]);

  // Ao escolher cliente + cargo, carrega a régua atual e monta o mapa (default: não obrigatório).
  const loadRegua = useCallback(async () => {
    if (!token || !codCliente || !cargoId) return;
    setSavedMsg(null);
    try {
      const rows = await apiFetch<ReguaRow[]>(
        `/admin/regua?codCliente=${encodeURIComponent(codCliente)}&cargoId=${cargoId}`,
        { token },
      );
      const base: Record<string, ExigenciaDocumento> = {};
      for (const t of tipos) base[t.id] = "NAO_OBRIGATORIO";
      for (const r of rows) base[r.tipoDocumentoId] = r.exigencia;
      setMapa(base);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar régua");
    }
  }, [token, codCliente, cargoId, tipos]);

  useEffect(() => {
    void loadRegua();
  }, [loadRegua]);

  async function salvar() {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      await apiFetch("/admin/regua", {
        method: "PUT",
        token,
        body: {
          codCliente,
          cargoId,
          itens: tipos.map((t) => ({
            tipoDocumentoId: t.id,
            exigencia: mapa[t.id] ?? "NAO_OBRIGATORIO",
          })),
        },
      });
      setSavedMsg("Régua salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const semBase = clientes.length === 0 || cargos.length === 0;
  const podeEditar = Boolean(codCliente && cargoId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Régua documental</h1>
        <p className="text-sm text-slate-500">
          Exigência de cada documento por (cliente + cargo). Muda o cargo, muda o checklist.
        </p>
      </div>

      {semBase && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Cadastre ao menos um cliente e um cargo para montar a régua.
        </p>
      )}

      <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <select
          value={codCliente}
          onChange={(e) => setCodCliente(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Selecione o cliente…</option>
          {clientes.map((c) => (
            <option key={c.codCliente} value={c.codCliente}>
              {c.codCliente} — {c.razaoSocial}
            </option>
          ))}
        </select>
        <select
          value={cargoId}
          onChange={(e) => setCargoId(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Selecione o cargo…</option>
          {cargos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          onClick={salvar}
          disabled={!podeEditar || saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar régua"}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      {savedMsg && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{savedMsg}</p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Documento</th>
              <th className="px-4 py-2 font-medium">Exigência</th>
            </tr>
          </thead>
          <tbody>
            {tipos.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                  Carregando tipos de documento…
                </td>
              </tr>
            ) : (
              tipos.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{t.nome}</td>
                  <td className="px-4 py-2">
                    <select
                      disabled={!podeEditar}
                      value={mapa[t.id] ?? "NAO_OBRIGATORIO"}
                      onChange={(e) =>
                        setMapa({ ...mapa, [t.id]: e.target.value as ExigenciaDocumento })
                      }
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {EXIGENCIA_DOCUMENTO.map((ex) => (
                        <option key={ex} value={ex}>
                          {ROTULO_EXIGENCIA[ex]}
                        </option>
                      ))}
                    </select>
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
