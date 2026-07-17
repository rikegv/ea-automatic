"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EXIGENCIA_DOCUMENTO, type ExigenciaDocumento } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
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
  ativo: boolean;
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

/** Ordenação da lista: obrigatórios primeiro, na mesma ordem do seletor de exigência. */
const PESO_EXIGENCIA: Record<ExigenciaDocumento, number> = {
  OBRIGATORIO: 0,
  NAO_OBRIGATORIO: 1,
  FACULTATIVO: 2,
};

type FiltroDocs = "ativos" | "inativos";

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
  // CRUD do catálogo de documentos (criar/renomear/inativar/reativar) na própria tela da régua.
  const [filtroDocs, setFiltroDocs] = useState<FiltroDocs>("ativos");
  const [nomeDoc, setNomeDoc] = useState("");
  const [editandoDoc, setEditandoDoc] = useState<string | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [inativarDoc, setInativarDoc] = useState<TipoDocumento | null>(null);
  const [inativandoDoc, setInativandoDoc] = useState(false);
  // Exigência congelada no último load/save. A ordenação lê DAQUI, não do `mapa` vivo, senão a linha
  // pularia de grupo no meio da edição, embaixo do cursor do usuário.
  const [ordemMapa, setOrdemMapa] = useState<Record<string, ExigenciaDocumento>>({});

  // Catálogo de documentos: a tela de gestão precisa dos inativos também (filtro "inativos"), por
  // isso a rota de admin e não `/catalogos/tipos-documento` (essa serve a Esteira e traz todos).
  const loadTipos = useCallback(async () => {
    if (!token) return;
    try {
      setTipos(await apiFetch<TipoDocumento[]>("/admin/tipos-documento", { token }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar os documentos");
    }
  }, [token]);

  // Carrega referências (clientes, cargos).
  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch<Cliente[]>("/admin/clientes", { token }),
      apiFetch<Cargo[]>("/admin/cargos", { token }),
    ])
      .then(([cli, car]) => {
        setClientes(cli);
        setCargos(car);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar referências"));
  }, [token]);

  useEffect(() => {
    void loadTipos();
  }, [loadTipos]);

  const tiposAtivos = useMemo(() => tipos.filter((t) => t.ativo), [tipos]);
  const tiposInativos = useMemo(() => tipos.filter((t) => !t.ativo), [tipos]);

  // Ordem da lista de ativos: obrigatórios primeiro, alfabético dentro de cada grupo.
  const tiposOrdenados = useMemo(() => {
    return [...tiposAtivos].sort((a, b) => {
      const pa = PESO_EXIGENCIA[ordemMapa[a.id] ?? "NAO_OBRIGATORIO"];
      const pb = PESO_EXIGENCIA[ordemMapa[b.id] ?? "NAO_OBRIGATORIO"];
      return pa !== pb ? pa - pb : a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [tiposAtivos, ordemMapa]);

  const inativosOrdenados = useMemo(
    () => [...tiposInativos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    [tiposInativos],
  );

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
      // O mapa cobre só os documentos ATIVOS: são os que a tela edita e salva. Régua de documento
      // inativado permanece intacta no banco (inativar não reescreve régua já cadastrada).
      const ativos = new Set(tipos.filter((t) => t.ativo).map((t) => t.id));
      const base: Record<string, ExigenciaDocumento> = {};
      for (const id of ativos) base[id] = "NAO_OBRIGATORIO";
      for (const r of rows)
        if (ativos.has(r.tipoDocumentoId)) base[r.tipoDocumentoId] = r.exigencia;
      setMapa(base);
      setOrdemMapa(base);
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
          // Só os ATIVOS: enviar um documento inativado rebaixaria a exigência dele na régua já
          // salva, mudando o que a auditoria cobra. Inativar não mexe em régua existente.
          itens: tiposAtivos.map((t) => ({
            tipoDocumentoId: t.id,
            exigencia: mapa[t.id] ?? "NAO_OBRIGATORIO",
          })),
        },
      });
      setSavedMsg("Régua salva.");
      setOrdemMapa(mapa);
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

  // ── CRUD do catálogo de documentos ────────────────────────────────────────
  // O formulário pede só o NOME. A exigência não é atributo do documento: ela vive por
  // (cliente + cargo) na régua, e é definida no seletor da própria linha, como já era.

  function iniciarEdicaoDoc(t: TipoDocumento) {
    setEditandoDoc(t.id);
    setNomeDoc(t.nome);
    setError(null);
  }

  function cancelarEdicaoDoc() {
    setEditandoDoc(null);
    setNomeDoc("");
    setError(null);
  }

  async function salvarDoc(e: FormEvent) {
    e.preventDefault();
    const nome = nomeDoc.trim();
    if (!nome) return;
    setSavingDoc(true);
    setError(null);
    setSavedMsg(null);
    try {
      if (editandoDoc) {
        await apiFetch(`/admin/tipos-documento/${encodeURIComponent(editandoDoc)}`, {
          method: "PATCH",
          token,
          body: { nome },
        });
        setSavedMsg(`Documento renomeado para "${nome}".`);
      } else {
        await apiFetch("/admin/tipos-documento", { method: "POST", token, body: { nome } });
        setSavedMsg(`Documento "${nome}" criado e disponível na régua.`);
      }
      setEditandoDoc(null);
      setNomeDoc("");
      setFiltroDocs("ativos");
      await loadTipos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar o documento");
    } finally {
      setSavingDoc(false);
    }
  }

  async function confirmarInativarDoc() {
    const t = inativarDoc;
    if (!t) return;
    setInativandoDoc(true);
    setError(null);
    try {
      await apiFetch(`/admin/tipos-documento/${encodeURIComponent(t.id)}`, {
        method: "DELETE",
        token,
      });
      if (editandoDoc === t.id) cancelarEdicaoDoc();
      setInativarDoc(null);
      setSavedMsg(`Documento "${t.nome}" inativado.`);
      await loadTipos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao inativar o documento");
    } finally {
      setInativandoDoc(false);
    }
  }

  async function reativarDoc(t: TipoDocumento) {
    setError(null);
    try {
      await apiFetch(`/admin/tipos-documento/${encodeURIComponent(t.id)}/reativar`, {
        method: "PATCH",
        token,
      });
      setSavedMsg(`Documento "${t.nome}" reativado.`);
      await loadTipos();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reativar o documento");
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

      {/* Catálogo de documentos da régua: criar e renomear. Só o NOME: a exigência não é atributo
          do documento, ela vive por (cliente + cargo) no seletor de cada linha da tabela. */}
      <GlassCard as="form" onSubmit={salvarDoc} className="mb-5 p-4">
        <div className="eyebrow !mb-0">Documentos da régua</div>
        <p className="mt-1 mb-3 text-[12.5px] text-dim">
          {editandoDoc
            ? "Renomeando um documento. Ajuste o nome e salve."
            : "Cadastre um documento novo. Ele entra na lista de ativos e passa a ser oferecido em todas as réguas; a exigência é definida por cliente e cargo, no seletor da linha."}
        </p>
        <div className="flex flex-wrap gap-3">
          <input
            required
            placeholder={editandoDoc ? "Nome do documento *" : "Novo documento *"}
            aria-label={editandoDoc ? "Nome do documento" : "Novo documento"}
            value={nomeDoc}
            onChange={(e) => setNomeDoc(e.target.value)}
            className="ds-input flex-1"
          />
          <Button type="submit" disabled={savingDoc} className="shrink-0 py-2.5">
            {savingDoc ? "Salvando…" : editandoDoc ? "Salvar alterações" : "Adicionar documento"}
          </Button>
          {editandoDoc && (
            <Button
              type="button"
              variant="secondary"
              onClick={cancelarEdicaoDoc}
              disabled={savingDoc}
              className="shrink-0 py-2.5"
            >
              Cancelar
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Ativos é o padrão da tela; inativado sai daqui e fica consultável no filtro "Inativos". */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["ativos", "inativos"] as FiltroDocs[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltroDocs(f)}
            className={cn(
              "rounded-full border px-3 py-1 transition",
              filtroDocs === f
                ? "border-accent bg-[var(--surface-2)] text-accent"
                : "border-[var(--border)] text-dim hover:text-text",
            )}
          >
            {f === "ativos"
              ? `Ativos (${tiposAtivos.length})`
              : `Inativos (${tiposInativos.length})`}
          </button>
        ))}
      </div>

      <GlassCard className="overflow-hidden p-2">
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[620px]">
            <thead>
              <tr>
                <th>Documento</th>
                <th className="w-[230px]">{filtroDocs === "ativos" ? "Exigência" : "Status"}</th>
                <th className="w-[160px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtroDocs === "ativos" ? (
                tiposOrdenados.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-faint">
                      Nenhum documento ativo. Cadastre o primeiro no campo acima.
                    </td>
                  </tr>
                ) : (
                  tiposOrdenados.map((t) => (
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
                      <td className="whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => iniciarEdicaoDoc(t)}
                          className="text-accent hover:underline"
                        >
                          editar
                        </button>
                        <span className="px-2 text-faint">·</span>
                        <button
                          type="button"
                          onClick={() => setInativarDoc(t)}
                          className="text-danger hover:underline"
                        >
                          inativar
                        </button>
                      </td>
                    </tr>
                  ))
                )
              ) : inativosOrdenados.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-faint">
                    Nenhum documento inativo.
                  </td>
                </tr>
              ) : (
                inativosOrdenados.map((t) => (
                  <tr key={t.id} className="opacity-60">
                    <td>{t.nome}</td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill tone="nt" label="Inativo" />
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => void reativarDoc(t)}
                        className="text-accent hover:underline"
                      >
                        reativar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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

      {/* Inativação do DOCUMENTO (não confundir com inativar a régua de um cliente, acima). Soft
          delete: preserva as réguas já cadastradas e o histórico de documentos das admissões. */}
      <ConfirmDialog
        open={Boolean(inativarDoc)}
        title="Inativar documento"
        message={
          inativarDoc
            ? `Inativar o documento "${inativarDoc.nome}"? Ele sai da lista de ativos e deixa de ser oferecido no cadastro das réguas. Atenção: as réguas já salvas que exigem este documento não são alteradas, então as admissões em andamento seguem cobrando ele. Você pode reativar quando quiser.`
            : ""
        }
        confirmLabel="Inativar"
        tone="danger"
        busy={inativandoDoc}
        onConfirm={confirmarInativarDoc}
        onCancel={() => setInativarDoc(null)}
      />
    </>
  );
}
