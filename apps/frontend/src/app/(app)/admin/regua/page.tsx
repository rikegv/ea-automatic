"use client";

import { useCallback, useEffect, useState } from "react";
import { EXIGENCIA_DOCUMENTO, type ExigenciaDocumento } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";

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
    <>
      <PageHead
        eyebrow="Cadastros"
        title="Régua documental"
        subtitle="Exigência de cada documento por (cliente + cargo). Muda o cargo, muda o checklist."
      />

      {semBase && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(201,138,18,0.12)] px-3 py-2 text-sm text-warn">
          Cadastre ao menos um cliente e um cargo para montar a régua.
        </p>
      )}

      <GlassCard className="mb-5 flex flex-wrap items-center gap-3 p-4">
        <select
          value={codCliente}
          onChange={(e) => setCodCliente(e.target.value)}
          className="ds-select w-auto"
        >
          <option value="">Selecione o cliente…</option>
          {clientes.map((c) => (
            <option key={c.codCliente} value={c.codCliente}>
              {c.codCliente} — {c.razaoSocial}
            </option>
          ))}
        </select>
        <select value={cargoId} onChange={(e) => setCargoId(e.target.value)} className="ds-select w-auto">
          <option value="">Selecione o cargo…</option>
          {cargos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <Button onClick={salvar} disabled={!podeEditar || saving} className="py-2.5">
          {saving ? "Salvando…" : "Salvar régua"}
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
      {savedMsg && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          {savedMsg}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <table className="ds-table">
          <thead>
            <tr>
              <th>Documento</th>
              <th>Exigência</th>
            </tr>
          </thead>
          <tbody>
            {tipos.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-faint">
                  Carregando tipos de documento…
                </td>
              </tr>
            ) : (
              tipos.map((t) => (
                <tr key={t.id}>
                  <td>{t.nome}</td>
                  <td>
                    <select
                      disabled={!podeEditar}
                      value={mapa[t.id] ?? "NAO_OBRIGATORIO"}
                      onChange={(e) => setMapa({ ...mapa, [t.id]: e.target.value as ExigenciaDocumento })}
                      className="ds-select w-auto py-1.5"
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
      </GlassCard>
    </>
  );
}
