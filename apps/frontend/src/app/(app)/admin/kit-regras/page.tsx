"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface KitTipo {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
  documentos: number;
}
interface KitDoc {
  id: string;
  kitTipoId: string;
  titulo: string;
  ordem: number;
  ativo: boolean;
}

/** Alça de arrastar (6 pontos). Inline para não depender de novo ícone no set. */
function GripIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="5" cy="4" r="1.4" />
      <circle cx="11" cy="4" r="1.4" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="11" cy="8" r="1.4" />
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="11" cy="12" r="1.4" />
    </svg>
  );
}

function AtivoToggle({
  ativo,
  onClick,
  title,
}: {
  ativo: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition",
        ativo
          ? "border-[rgba(46,158,99,0.4)] text-ok hover:bg-[rgba(46,158,99,0.1)]"
          : "border-[var(--border)] text-dim hover:bg-[var(--surface-2)]",
      )}
    >
      <Icon name={ativo ? "check" : "x"} className="h-3.5 w-3.5" />
      {ativo ? "Ativo" : "Inativo"}
    </button>
  );
}

export default function KitRegrasPage() {
  const { token } = useAuth();

  // ── Kits ────────────────────────────────────────────────────────────────
  const [kits, setKits] = useState<KitTipo[]>([]);
  const [kitsLoading, setKitsLoading] = useState(true);
  const [selKitId, setSelKitId] = useState<string | null>(null);
  const [novoKit, setNovoKit] = useState("");
  const [criandoKit, setCriandoKit] = useState(false);
  const [editKitId, setEditKitId] = useState<string | null>(null);
  const [editKitNome, setEditKitNome] = useState("");
  const [delKit, setDelKit] = useState<KitTipo | null>(null);

  // ── Documentos do kit selecionado ─────────────────────────────────────────
  const [docs, setDocs] = useState<KitDoc[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editDocTitulo, setEditDocTitulo] = useState("");
  const [delDoc, setDelDoc] = useState<KitDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Drag-and-drop (HTML5 nativo)
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const selKit = kits.find((k) => k.id === selKitId) ?? null;

  const loadKits = useCallback(
    async (manterSel = true) => {
      if (!token) return;
      setKitsLoading(true);
      try {
        const rows = await apiFetch<KitTipo[]>("/admin/kit-tipos", { token });
        setKits(rows);
        setSelKitId((cur) => {
          if (manterSel && cur && rows.some((k) => k.id === cur)) return cur;
          return rows[0]?.id ?? null;
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Falha ao carregar os kits.");
      } finally {
        setKitsLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void loadKits();
  }, [loadKits]);

  const loadDocs = useCallback(async () => {
    if (!token || !selKitId) {
      setDocs([]);
      return;
    }
    setDocsLoading(true);
    try {
      const rows = await apiFetch<KitDoc[]>(`/admin/kit-regras?kitTipoId=${selKitId}`, { token });
      setDocs(rows);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao carregar os documentos do kit.");
    } finally {
      setDocsLoading(false);
    }
  }, [token, selKitId]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  // ── Ações de kit ──────────────────────────────────────────────────────────
  async function criarKit() {
    const nome = novoKit.trim();
    if (!nome) return;
    setCriandoKit(true);
    setError(null);
    try {
      const kit = await apiFetch<KitTipo>("/admin/kit-tipos", {
        method: "POST",
        token,
        body: { nome },
      });
      setNovoKit("");
      setFlash(`Kit "${kit.nome}" criado.`);
      await loadKits();
      setSelKitId(kit.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao criar o kit.");
    } finally {
      setCriandoKit(false);
    }
  }

  async function salvarNomeKit(id: string) {
    const nome = editKitNome.trim();
    if (!nome) return;
    setError(null);
    try {
      await apiFetch(`/admin/kit-tipos/${id}`, { method: "PATCH", token, body: { nome } });
      setEditKitId(null);
      setFlash("Kit renomeado.");
      await loadKits();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao renomear o kit.");
    }
  }

  async function alternarAtivoKit(k: KitTipo) {
    setError(null);
    setKits((cur) => cur.map((x) => (x.id === k.id ? { ...x, ativo: !x.ativo } : x)));
    try {
      await apiFetch(`/admin/kit-tipos/${k.id}`, {
        method: "PATCH",
        token,
        body: { ativo: !k.ativo },
      });
    } catch (e) {
      setKits((cur) => cur.map((x) => (x.id === k.id ? { ...x, ativo: k.ativo } : x)));
      setError(e instanceof ApiError ? e.message : "Falha ao alternar o kit.");
    }
  }

  async function confirmarExcluirKit() {
    if (!delKit) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/kit-tipos/${delKit.id}`, { method: "DELETE", token });
      setFlash(`Kit "${delKit.nome}" removido.`);
      setDelKit(null);
      if (selKitId === delKit.id) setSelKitId(null);
      await loadKits(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao remover o kit.");
    } finally {
      setBusy(false);
    }
  }

  // ── Ações de documento ────────────────────────────────────────────────────
  async function adicionarDoc() {
    const titulo = novoTitulo.trim();
    if (!titulo || !selKitId) return;
    setAddingDoc(true);
    setError(null);
    try {
      await apiFetch("/admin/kit-regras", {
        method: "POST",
        token,
        body: { kitTipoId: selKitId, titulo },
      });
      setNovoTitulo("");
      setFlash("Documento adicionado ao kit.");
      await loadDocs();
      await loadKits();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao adicionar o documento.");
    } finally {
      setAddingDoc(false);
    }
  }

  async function salvarDoc(id: string) {
    const titulo = editDocTitulo.trim();
    if (!titulo) return;
    setError(null);
    try {
      await apiFetch(`/admin/kit-regras/${id}`, { method: "PATCH", token, body: { titulo } });
      setEditDocId(null);
      setFlash("Documento atualizado.");
      await loadDocs();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao salvar o documento.");
    }
  }

  async function alternarAtivoDoc(d: KitDoc) {
    setError(null);
    setDocs((cur) => cur.map((x) => (x.id === d.id ? { ...x, ativo: !x.ativo } : x)));
    try {
      await apiFetch(`/admin/kit-regras/${d.id}`, {
        method: "PATCH",
        token,
        body: { ativo: !d.ativo },
      });
    } catch (e) {
      setDocs((cur) => cur.map((x) => (x.id === d.id ? { ...x, ativo: d.ativo } : x)));
      setError(e instanceof ApiError ? e.message : "Falha ao alternar o documento.");
    }
  }

  async function confirmarExcluirDoc() {
    if (!delDoc) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/kit-regras/${delDoc.id}`, { method: "DELETE", token });
      setFlash(`Documento "${delDoc.titulo}" removido.`);
      setDelDoc(null);
      await loadDocs();
      await loadKits();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao remover o documento.");
    } finally {
      setBusy(false);
    }
  }

  // ── Drag-and-drop dos documentos ──────────────────────────────────────────
  function reordenarLocal(fromId: string, toId: string): KitDoc[] {
    const from = docs.findIndex((x) => x.id === fromId);
    const to = docs.findIndex((x) => x.id === toId);
    if (from < 0 || to < 0 || from === to) return docs;
    const next = [...docs];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next.map((x, i) => ({ ...x, ordem: i + 1 }));
  }

  async function soltar(toId: string) {
    if (!dragId || dragId === toId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const next = reordenarLocal(dragId, toId);
    setDocs(next);
    setDragId(null);
    setOverId(null);
    setError(null);
    try {
      await apiFetch("/admin/kit-regras/ordem", {
        method: "PUT",
        token,
        body: { ids: next.map((x) => x.id) },
      });
      setFlash("Ordem dos documentos atualizada.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao salvar a nova ordem.");
      await loadDocs();
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Cadastros"
        title="Regras do gerador de kit"
        subtitle="Um kit por tipo de vínculo. Cada kit tem seu dicionário de títulos e a ordem em que o motor monta o kit consolidado do funcionário. Arraste para reordenar."
      />

      {error && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
      {flash && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4" /> {flash}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* ── Coluna esquerda: kits ─────────────────────────────────────── */}
        <GlassCard className="h-max p-4">
          <div className="eyebrow !mb-2">Kits ({kits.length})</div>
          <div className="mb-3 flex items-end gap-2">
            <input
              className="ds-input !py-2"
              placeholder="Novo kit (ex.: KIT TEMPORÁRIO)"
              value={novoKit}
              onChange={(e) => setNovoKit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void criarKit();
              }}
            />
            <Button
              onClick={criarKit}
              disabled={!novoKit.trim() || criandoKit}
              className="!px-3 py-2"
            >
              <Icon name="plus" className="h-4 w-4" />
            </Button>
          </div>

          {kitsLoading ? (
            <p className="py-6 text-center text-sm text-faint">Carregando…</p>
          ) : kits.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">
              Nenhum kit. Crie o primeiro acima.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {kits.map((k) => {
                const sel = k.id === selKitId;
                const emEdicao = editKitId === k.id;
                return (
                  <div
                    key={k.id}
                    className={cn(
                      "rounded-xl border px-3 py-2.5 transition",
                      sel
                        ? "border-[var(--accent)] bg-[var(--surface-2)] ring-1 ring-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
                      !k.ativo && "opacity-70",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {emEdicao ? (
                        <input
                          className="ds-input flex-1 !py-1.5"
                          autoFocus
                          value={editKitNome}
                          onChange={(e) => setEditKitNome(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void salvarNomeKit(k.id);
                            if (e.key === "Escape") setEditKitId(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setSelKitId(k.id)}
                          title="Ver documentos deste kit"
                        >
                          <span className="block truncate text-[14px] font-semibold text-text">
                            {k.nome}
                          </span>
                          <span className="text-[11.5px] text-dim">
                            {k.documentos} documento{k.documentos === 1 ? "" : "s"}
                          </span>
                        </button>
                      )}
                      {emEdicao ? (
                        <span className="flex flex-none items-center gap-1">
                          <button
                            type="button"
                            className="grid h-7 w-7 place-items-center rounded-lg text-ok transition hover:bg-[rgba(46,158,99,0.12)] disabled:opacity-50"
                            title="Salvar"
                            disabled={!editKitNome.trim()}
                            onClick={() => void salvarNomeKit(k.id)}
                          >
                            <Icon name="check" className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)]"
                            title="Cancelar"
                            onClick={() => setEditKitId(null)}
                          >
                            <Icon name="x" className="h-4 w-4" />
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="grid h-7 w-7 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                          title="Renomear kit"
                          onClick={() => {
                            setEditKitId(k.id);
                            setEditKitNome(k.nome);
                          }}
                        >
                          <Icon name="pen" className="h-[15px] w-[15px]" />
                        </button>
                      )}
                    </div>
                    {!emEdicao && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <AtivoToggle
                          ativo={k.ativo}
                          onClick={() => void alternarAtivoKit(k)}
                          title={k.ativo ? "Desativar o kit" : "Ativar o kit"}
                        />
                        <button
                          type="button"
                          className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-[rgba(214,69,69,0.12)] hover:text-danger"
                          title="Remover kit (apaga também seus documentos)"
                          onClick={() => setDelKit(k)}
                        >
                          <Icon name="trash" className="h-[15px] w-[15px]" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* ── Coluna direita: documentos do kit selecionado ─────────────── */}
        <GlassCard className="p-4">
          {!selKit ? (
            <p className="py-10 text-center text-sm text-faint">
              Selecione um kit à esquerda para ver e organizar seus documentos.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="eyebrow !mb-0">
                  {selKit.nome} · {docs.length} documento{docs.length === 1 ? "" : "s"}
                </div>
                <span className="text-[12px] text-dim">
                  A ordem abaixo é a ordem dentro do kit consolidado do funcionário.
                </span>
              </div>

              <div className="mb-3 flex items-end gap-2">
                <input
                  className="ds-input"
                  placeholder="Novo título (ex.: REGISTRO DE EMPREGADO)"
                  value={novoTitulo}
                  onChange={(e) => setNovoTitulo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void adicionarDoc();
                  }}
                />
                <Button
                  onClick={adicionarDoc}
                  disabled={!novoTitulo.trim() || addingDoc}
                  className="py-2.5"
                >
                  {addingDoc ? "Adicionando…" : "Adicionar"}
                </Button>
              </div>

              {docsLoading ? (
                <p className="py-8 text-center text-sm text-faint">Carregando…</p>
              ) : docs.length === 0 ? (
                <p className="py-8 text-center text-sm text-faint">
                  Nenhum documento neste kit ainda. Adicione o primeiro acima.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {docs.map((d, i) => {
                    const emEdicao = editDocId === d.id;
                    const arrastando = dragId === d.id;
                    const alvo = overId === d.id && dragId !== null && dragId !== d.id;
                    return (
                      <div
                        key={d.id}
                        draggable={!emEdicao}
                        onDragStart={() => setDragId(d.id)}
                        onDragEnter={() => setOverId(d.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => void soltar(d.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverId(null);
                        }}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 transition",
                          !emEdicao && "cursor-grab active:cursor-grabbing",
                          arrastando && "opacity-50",
                          alvo && "border-[var(--accent)] ring-1 ring-[var(--accent)]",
                          !d.ativo && "opacity-70",
                        )}
                      >
                        <GripIcon className="h-4 w-4 flex-none text-faint" />
                        <span className="grid h-6 w-6 flex-none place-items-center rounded-md bg-[var(--surface-2)] text-[12px] font-semibold text-dim">
                          {i + 1}
                        </span>

                        {emEdicao ? (
                          <input
                            className="ds-input flex-1 !py-2"
                            value={editDocTitulo}
                            autoFocus
                            onChange={(e) => setEditDocTitulo(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void salvarDoc(d.id);
                              if (e.key === "Escape") setEditDocId(null);
                            }}
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text">
                            {d.titulo}
                          </span>
                        )}

                        <AtivoToggle
                          ativo={d.ativo}
                          onClick={() => void alternarAtivoDoc(d)}
                          title={d.ativo ? "Desativar (o motor ignora)" : "Ativar"}
                        />

                        {emEdicao ? (
                          <span className="flex flex-none items-center gap-1">
                            <button
                              type="button"
                              className="grid h-8 w-8 place-items-center rounded-lg text-ok transition hover:bg-[rgba(46,158,99,0.12)] disabled:opacity-50"
                              title="Salvar"
                              disabled={!editDocTitulo.trim()}
                              onClick={() => void salvarDoc(d.id)}
                            >
                              <Icon name="check" className="h-[17px] w-[17px]" />
                            </button>
                            <button
                              type="button"
                              className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)]"
                              title="Cancelar"
                              onClick={() => setEditDocId(null)}
                            >
                              <Icon name="x" className="h-[17px] w-[17px]" />
                            </button>
                          </span>
                        ) : (
                          <span className="flex flex-none items-center gap-1">
                            <button
                              type="button"
                              className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                              title="Editar título"
                              onClick={() => {
                                setEditDocId(d.id);
                                setEditDocTitulo(d.titulo);
                              }}
                            >
                              <Icon name="pen" className="h-[16px] w-[16px]" />
                            </button>
                            <button
                              type="button"
                              className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[rgba(214,69,69,0.12)] hover:text-danger"
                              title="Remover documento"
                              onClick={() => setDelDoc(d)}
                            >
                              <Icon name="trash" className="h-[16px] w-[16px]" />
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </GlassCard>
      </div>

      <ConfirmDialog
        open={Boolean(delKit)}
        title="Remover kit"
        message={
          delKit
            ? `Remover o kit "${delKit.nome}"? Apaga também todos os ${delKit.documentos} documento(s) dele. Esta ação não pode ser desfeita.`
            : ""
        }
        confirmLabel="Remover kit"
        tone="danger"
        busy={busy}
        onConfirm={confirmarExcluirKit}
        onCancel={() => setDelKit(null)}
      />
      <ConfirmDialog
        open={Boolean(delDoc)}
        title="Remover documento do kit"
        message={
          delDoc ? `Remover "${delDoc.titulo}" deste kit? O motor deixa de reconhecê-lo.` : ""
        }
        confirmLabel="Remover"
        tone="danger"
        busy={busy}
        onConfirm={confirmarExcluirDoc}
        onCancel={() => setDelDoc(null)}
      />
    </>
  );
}
