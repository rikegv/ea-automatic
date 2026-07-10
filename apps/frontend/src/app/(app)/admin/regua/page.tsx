"use client";

import { useCallback, useEffect, useState } from "react";
import { EXIGENCIA_DOCUMENTO, type ExigenciaDocumento } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

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
  // Item 1: clientes sem NENHUMA régua cadastrada (a admissão trava o cargo até cadastrarem aqui).
  const [semRegua, setSemRegua] = useState<
    { codCliente: string; razaoSocial: string; nomeOperacao: string | null }[]
  >([]);
  // §A.12 item 4a: busca no painel "sem régua" (filtro client-side sobre a lista carregada).
  const [semReguaQ, setSemReguaQ] = useState("");
  // §A.12 item 4b: painel "Clientes COM régua cadastrada" (listar/buscar/editar/inativar).
  const [comRegua, setComRegua] = useState<
    { codCliente: string; razaoSocial: string; nomeOperacao: string | null; cargos: number }[]
  >([]);
  const [comReguaQ, setComReguaQ] = useState("");
  const [inativar, setInativar] = useState<{ codCliente: string; nome: string } | null>(null);
  const [inativando, setInativando] = useState(false);
  // Detalhamento de cargos por cliente (item 4): cliente expandido + seus cargos com régua.
  const [expandido, setExpandido] = useState<string | null>(null);
  const [cargosExp, setCargosExp] = useState<{ id: string; nome: string }[]>([]);
  const [loadingCargosExp, setLoadingCargosExp] = useState(false);

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

  // Item 1: lista de clientes sem régua (recarrega após salvar, para o cliente sair da lista).
  const loadSemRegua = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiFetch<
        { codCliente: string; razaoSocial: string; nomeOperacao: string | null }[]
      >("/catalogos/clientes-sem-regua", { token });
      setSemRegua(r);
    } catch {
      /* lista auxiliar; falha não bloqueia a tela */
    }
  }, [token]);
  useEffect(() => {
    void loadSemRegua();
  }, [loadSemRegua]);

  // §A.12 item 4b: clientes COM régua (busca no servidor, debounce ~300ms).
  const loadComRegua = useCallback(
    async (q: string) => {
      if (!token) return;
      try {
        const term = q.trim();
        const suffix = term ? `?q=${encodeURIComponent(term)}` : "";
        const r = await apiFetch<
          { codCliente: string; razaoSocial: string; nomeOperacao: string | null; cargos: number }[]
        >(`/catalogos/clientes-com-regua${suffix}`, { token });
        setComRegua(r);
      } catch {
        /* lista auxiliar; falha não bloqueia a tela */
      }
    },
    [token],
  );
  useEffect(() => {
    const h = setTimeout(() => void loadComRegua(comReguaQ), 300);
    return () => clearTimeout(h);
  }, [loadComRegua, comReguaQ]);

  // Recarrega os dois painéis (após salvar/inativar): um cliente migra de uma lista para a outra.
  const recarregarPaineis = useCallback(() => {
    void loadSemRegua();
    void loadComRegua(comReguaQ);
  }, [loadSemRegua, loadComRegua, comReguaQ]);

  async function confirmarInativar() {
    if (!inativar) return;
    setInativando(true);
    try {
      await apiFetch(`/admin/regua/cliente?codCliente=${encodeURIComponent(inativar.codCliente)}`, {
        method: "DELETE",
        token,
      });
      setSavedMsg(`Régua de ${inativar.nome} inativada.`);
      if (codCliente === inativar.codCliente) setMapa({});
      setInativar(null);
      recarregarPaineis();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao inativar a régua");
    } finally {
      setInativando(false);
    }
  }

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
      recarregarPaineis();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const semBase = clientes.length === 0 || cargos.length === 0;
  const podeEditar = Boolean(codCliente && cargoId);

  // §A.12 item 4a: filtro client-side do painel "sem régua".
  const semReguaFiltrado = semRegua.filter((c) => {
    const t = semReguaQ.trim().toLowerCase();
    if (!t) return true;
    return (
      c.codCliente.toLowerCase().includes(t) ||
      c.razaoSocial.toLowerCase().includes(t) ||
      (c.nomeOperacao ?? "").toLowerCase().includes(t)
    );
  });

  // Seleciona o cliente para edição e leva o foco ao editor da régua (topo do formulário).
  function editarRegua(cod: string, cargo?: string) {
    setCodCliente(cod);
    setCargoId(cargo ?? "");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // §A.12 item 4: detalhamento de um cliente com régua, mostra QUAIS cargos têm checklist. Clicar
  // no cliente expande/recolhe; cada cargo tem botão de editar (carrega a régua daquele cargo).
  async function toggleExpandir(cod: string) {
    if (expandido === cod) {
      setExpandido(null);
      setCargosExp([]);
      return;
    }
    setExpandido(cod);
    setCargosExp([]);
    setLoadingCargosExp(true);
    try {
      const r = await apiFetch<{ temRegua: boolean; cargos: { id: string; nome: string }[] }>(
        `/catalogos/cargos-por-cliente?codCliente=${encodeURIComponent(cod)}`,
        { token },
      );
      setCargosExp(r.cargos);
    } catch {
      setCargosExp([]);
    } finally {
      setLoadingCargosExp(false);
    }
  }

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

      {/* Item 1: clientes sem régua, visível para o diretor. Clicar seleciona o cliente acima. */}
      <GlassCard className="mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow !mb-0">Clientes sem régua cadastrada</div>
          {semRegua.length > 0 && (
            <input
              className="ds-input max-w-[260px]"
              placeholder="Buscar cliente…"
              value={semReguaQ}
              onChange={(e) => setSemReguaQ(e.target.value)}
              aria-label="Buscar cliente sem régua"
            />
          )}
        </div>
        <p className="mt-1 text-[12.5px] text-dim">
          {semRegua.length === 0
            ? "Todos os clientes têm régua cadastrada. Nada pendente."
            : `${semRegua.length} cliente(s) sem régua. Sem régua, a Nova Admissão trava a seleção de cargo (a I.A audita pela régua). Clique para cadastrar.`}
        </p>
        {semRegua.length > 0 && (
          <div className="mt-3 grid max-h-[280px] gap-1.5 overflow-y-auto sm:grid-cols-2">
            {semReguaFiltrado.length === 0 ? (
              <p className="col-span-full py-3 text-center text-[12.5px] text-faint">
                Nenhum cliente sem régua para "{semReguaQ}".
              </p>
            ) : (
              semReguaFiltrado.map((c) => (
                <button
                  key={c.codCliente}
                  onClick={() => editarRegua(c.codCliente)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0 truncate text-[13px]">
                    <span className="font-mono text-dim">{c.codCliente}</span> ·{" "}
                    {c.nomeOperacao ?? c.razaoSocial}
                  </span>
                  <span className="flex-none text-[11.5px] font-semibold text-accent">
                    Cadastrar régua
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </GlassCard>

      {/* §A.12 item 4b: clientes COM régua cadastrada (listar, buscar, editar, inativar). */}
      <GlassCard className="mb-5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="eyebrow !mb-0">Clientes com régua cadastrada</div>
          <input
            className="ds-input max-w-[260px]"
            placeholder="Buscar cliente…"
            value={comReguaQ}
            onChange={(e) => setComReguaQ(e.target.value)}
            aria-label="Buscar cliente com régua"
          />
        </div>
        <p className="mt-1 text-[12.5px] text-dim">
          {comRegua.length === 0
            ? comReguaQ.trim()
              ? `Nenhum cliente com régua para "${comReguaQ}".`
              : "Nenhum cliente com régua cadastrada ainda."
            : `${comRegua.length} cliente(s) com régua. Clique no cliente para ver os cargos cadastrados e editar por cargo; inativar remove toda a régua do cliente.`}
        </p>
        {comRegua.length > 0 && (
          <div className="mt-3 grid max-h-[360px] gap-1.5 overflow-y-auto">
            {comRegua.map((c) => {
              const nome = c.nomeOperacao ?? c.razaoSocial;
              const aberto = expandido === c.codCliente;
              return (
                <div
                  key={c.codCliente}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)]"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => void toggleExpandir(c.codCliente)}
                      aria-expanded={aberto}
                      title="Ver cargos cadastrados na régua"
                    >
                      <Icon
                        name="right"
                        className={cn(
                          "h-4 w-4 flex-none text-faint transition-transform",
                          aberto && "rotate-90",
                        )}
                      />
                      <span className="min-w-0 truncate text-[13px]">
                        <span className="font-mono text-dim">{c.codCliente}</span> · {nome}
                        <span className="ml-1 text-[11.5px] text-faint">
                          ({c.cargos} cargo{c.cargos === 1 ? "" : "s"})
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[rgba(214,69,69,0.12)] hover:text-danger"
                      title="Inativar régua (remove toda a régua do cliente)"
                      aria-label={`Inativar régua de ${nome}`}
                      onClick={() => setInativar({ codCliente: c.codCliente, nome })}
                    >
                      <Icon name="trash" className="h-[16px] w-[16px]" />
                    </button>
                  </div>
                  {aberto && (
                    <div className="border-t border-[var(--border)] px-3 py-2">
                      {loadingCargosExp ? (
                        <p className="py-1 text-[12.5px] text-faint">Carregando cargos…</p>
                      ) : cargosExp.length === 0 ? (
                        <p className="py-1 text-[12.5px] text-faint">
                          Nenhum cargo com régua para este cliente.
                        </p>
                      ) : (
                        <div className="grid gap-1">
                          {cargosExp.map((cg) => (
                            <div
                              key={cg.id}
                              className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition hover:bg-[var(--surface-2)]"
                            >
                              <span className="min-w-0 truncate text-[13px]">{cg.nome}</span>
                              <button
                                type="button"
                                className="inline-flex flex-none items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-semibold text-accent transition hover:bg-[var(--surface-2)]"
                                title={`Editar régua de ${cg.nome}`}
                                onClick={() => editarRegua(c.codCliente, cg.id)}
                              >
                                <Icon name="pen" className="h-[14px] w-[14px]" />
                                Editar
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <GlassCard className="mb-5 flex flex-wrap items-end gap-3 p-4">
        <Select
          className="min-w-[260px]"
          value={codCliente}
          onChange={setCodCliente}
          placeholder="Selecione o cliente…"
          ariaLabel="Cliente"
          options={clientes.map((c) => ({
            value: c.codCliente,
            label: `${c.codCliente} · ${c.razaoSocial}`,
          }))}
        />
        <Select
          className="min-w-[220px]"
          value={cargoId}
          onChange={setCargoId}
          placeholder="Selecione o cargo…"
          ariaLabel="Cargo"
          options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
        />
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
                    <Select
                      className="min-w-[180px]"
                      disabled={!podeEditar}
                      value={mapa[t.id] ?? "NAO_OBRIGATORIO"}
                      onChange={(v) => setMapa({ ...mapa, [t.id]: v as ExigenciaDocumento })}
                      ariaLabel={`Exigência de ${t.nome}`}
                      options={EXIGENCIA_DOCUMENTO.map((ex) => ({
                        value: ex,
                        label: ROTULO_EXIGENCIA[ex],
                      }))}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>

      <ConfirmDialog
        open={Boolean(inativar)}
        title="Inativar régua do cliente"
        message={
          inativar
            ? `Remover toda a régua de ${inativar.nome}? O cliente volta para a lista "sem régua" e a Nova Admissão trava a seleção de cargo até recadastrar. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Inativar régua"
        tone="danger"
        busy={inativando}
        onConfirm={confirmarInativar}
        onCancel={() => setInativar(null)}
      />
    </>
  );
}
