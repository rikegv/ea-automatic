"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

/**
 * PASTAS-PAI DO DRIVE por cliente/contrato (Administração, restrito a Master/Super Admin).
 *
 * O que resolve: hoje o mapeamento "de qual pasta-pai do Drive cada contrato/Fopag arquiva" vive no
 * .env, então um cliente Fopag novo trava o arquivamento até alguém editar o .env e reiniciar. Esta
 * tela move esse mapa para o banco, com CRUD e pré-validação da pasta no próprio Drive.
 *
 * Duas dimensões (escopo):
 *  - CONTRATO: `chave` é um dos 5 tipos de contrato (temporario, terceirizado, estagio, interno,
 *    "jovem aprendiz").
 *  - FOPAG: `chave` é um cod_cliente (texto, ex.: "54925").
 *
 * Fluxo do formulário: o usuário COLA a URL da barra do Drive
 * (https://drive.google.com/drive/folders/<ID>) ou o ID puro no campo, clica em Validar (o backend
 * extrai o ID e confere se a pasta existe/é acessível) e então Salvar. O backend re-valida no PUT: se
 * a pasta for inválida responde 400 com o motivo, que a tela mostra sem fechar o formulário.
 */
interface PastaDrive {
  id: string;
  escopo: "CONTRATO" | "FOPAG";
  chave: string;
  rotulo: string;
  folderId: string;
  ativo: boolean;
}

interface ResultadoValidacao {
  valido: boolean;
  folderId?: string;
  motivo?: string;
}

type Escopo = "CONTRATO" | "FOPAG";

/** Os 5 tipos de contrato do escopo CONTRATO. O `valor` é a chave salva; o `rotulo` é o que se lê. */
const TIPOS_CONTRATO: { valor: string; rotulo: string }[] = [
  { valor: "temporario", rotulo: "Temporário" },
  { valor: "terceirizado", rotulo: "Terceirizado" },
  { valor: "estagio", rotulo: "Estágio" },
  { valor: "interno", rotulo: "Interno" },
  { valor: "jovem aprendiz", rotulo: "Jovem Aprendiz" },
];

const ROTULO_ESCOPO: Record<Escopo, string> = { CONTRATO: "Contrato", FOPAG: "Fopag" };

export default function PastasDrivePage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PastaDrive[]>([]);

  // Ordenação clicável (§A.12). O ID da pasta e as ações ficam de fora: um é identificador opaco do
  // Google, o outro é controle. Ativo é RANK (ativa primeiro), não texto.
  const colunasOrd = useMemo<ColOrd<PastaDrive>[]>(
    () => [
      { chave: "escopo", tipo: "texto", valor: (p) => p.escopo },
      { chave: "chave", tipo: "texto", valor: (p) => p.chave },
      { chave: "rotulo", tipo: "texto", valor: (p) => p.rotulo },
      { chave: "ativo", tipo: "status", valor: (p) => (p.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunasOrd, rows);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulário (serve para criar e para editar; a identidade é escopo + chave, o backend faz upsert).
  const [escopo, setEscopo] = useState<Escopo>("CONTRATO");
  const [chave, setChave] = useState<string>(TIPOS_CONTRATO[0].valor);
  const [folderRef, setFolderRef] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [validacao, setValidacao] = useState<ResultadoValidacao | null>(null);
  const [validando, setValidando] = useState(false);
  const [saving, setSaving] = useState(false);

  // Remoção por modal de confirmação.
  const [confirmar, setConfirmar] = useState<PastaDrive | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<PastaDrive[]>("/admin/pastas-drive", { token }));
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

  // Atalho do card do Diagnóstico: /admin/pastas-drive?fopag=<cod> abre o formulário já no escopo
  // Fopag com a chave preenchida. Lido de window.location para não depender de useSearchParams
  // (evita a exigência de Suspense do Next e mantém o padrão simples das demais telas admin).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cod = new URLSearchParams(window.location.search).get("fopag");
    if (cod) {
      setEscopo("FOPAG");
      setChave(cod);
      setFolderRef("");
      setValidacao(null);
      setEditandoId(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  function trocarEscopo(novo: Escopo) {
    if (novo === escopo) return;
    setEscopo(novo);
    // Ao trocar de dimensão a chave muda de natureza: no Contrato é um dos 5 tipos, no Fopag é texto
    // livre. Reinicia a chave para o padrão do escopo, evitando salvar um valor da outra dimensão.
    setChave(novo === "CONTRATO" ? TIPOS_CONTRATO[0].valor : "");
    setValidacao(null);
  }

  function atualizarFolderRef(v: string) {
    setFolderRef(v);
    // A validação anterior deixa de valer assim que a referência muda.
    setValidacao(null);
  }

  function iniciarEdicao(p: PastaDrive) {
    setEditandoId(p.id);
    setEscopo(p.escopo);
    setChave(p.chave);
    // O folderId salvo é uma referência válida: pré-preenche o campo para reaproveitar ou trocar.
    setFolderRef(p.folderId);
    setValidacao(null);
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setEscopo("CONTRATO");
    setChave(TIPOS_CONTRATO[0].valor);
    setFolderRef("");
    setValidacao(null);
    setError(null);
  }

  async function validar() {
    if (!folderRef.trim()) return;
    setValidando(true);
    setError(null);
    try {
      const r = await apiFetch<ResultadoValidacao>("/admin/pastas-drive/validar", {
        method: "POST",
        token,
        body: { folderRef: folderRef.trim() },
      });
      setValidacao(r);
    } catch (e) {
      setValidacao(null);
      setError(e instanceof ApiError ? e.message : "Falha ao validar a pasta.");
    } finally {
      setValidando(false);
    }
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // O backend re-valida a pasta no PUT: se for inválida responde 400 com o motivo. Aqui só
      // refletimos o erro e mantemos o formulário aberto.
      await apiFetch("/admin/pastas-drive", {
        method: "PUT",
        token,
        body: { escopo, chave: chave.trim(), folderRef: folderRef.trim() },
      });
      cancelarEdicao();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarRemocao() {
    const p = confirmar;
    if (!p) return;
    setRemovendo(true);
    setError(null);
    try {
      await apiFetch(`/admin/pastas-drive/${encodeURIComponent(p.id)}`, { method: "DELETE", token });
      if (editandoId === p.id) cancelarEdicao();
      setConfirmar(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover");
    } finally {
      setRemovendo(false);
    }
  }

  const chaveValida = chave.trim().length > 0;
  const podeSalvar = chaveValida && folderRef.trim().length > 0 && !saving;

  const rotuloChaveAtual = useMemo(() => {
    if (escopo === "CONTRATO") {
      return TIPOS_CONTRATO.find((t) => t.valor === chave)?.rotulo ?? chave;
    }
    return chave;
  }, [escopo, chave]);

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Pastas Do Drive"
        subtitle="Mapa da pasta-pai do Drive por tipo de contrato e por cliente Fopag. Cole a URL da pasta do Drive, valide e salve. Tira o mapeamento do arquivo de ambiente e destrava clientes Fopag novos."
      />

      <GlassCard as="form" onSubmit={salvar} className="mb-5 flex flex-col gap-3 p-4">
        {editandoId && (
          <p className="text-sm text-accent">
            Editando o mapeamento de {ROTULO_ESCOPO[escopo]} {rotuloChaveAtual}. Ajuste a pasta e
            salve.
          </p>
        )}

        {/* Seletor de escopo: Contrato ou Fopag. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-dim">Escopo:</span>
          {(["CONTRATO", "FOPAG"] as Escopo[]).map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => trocarEscopo(op)}
              className={`rounded-full border px-3 py-1 text-sm transition ${
                escopo === op
                  ? "border-accent bg-[var(--surface-2)] text-accent"
                  : "border-[var(--border)] text-dim hover:text-text"
              }`}
            >
              {ROTULO_ESCOPO[op]}
            </button>
          ))}
        </div>

        {/* Chave: dropdown dos 5 tipos no Contrato, input de cod_cliente no Fopag. */}
        <div className="flex flex-wrap gap-3">
          {escopo === "CONTRATO" ? (
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-faint">Tipo de contrato</span>
              <select
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                className="ds-input"
                aria-label="Tipo de contrato"
              >
                {TIPOS_CONTRATO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs text-faint">Código do cliente (Fopag)</span>
              <input
                required
                placeholder="Código do cliente, ex.: 54925"
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                className="ds-input"
                aria-label="Código do cliente"
              />
            </label>
          )}
        </div>

        {/* Referência da pasta: URL colada da barra do Drive ou ID puro. */}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-faint">URL ou ID da pasta do Drive</span>
          <div className="flex flex-wrap gap-3">
            <input
              required
              placeholder="Cole a URL, https://drive.google.com/drive/folders/ID, ou só o ID"
              value={folderRef}
              onChange={(e) => atualizarFolderRef(e.target.value)}
              className="ds-input flex-1 min-w-[18rem]"
              aria-label="URL ou ID da pasta do Drive"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => void validar()}
              disabled={validando || !folderRef.trim()}
              className="shrink-0 py-2.5"
            >
              {validando ? "Validando…" : "Validar"}
            </Button>
          </div>
        </div>

        {/* Resultado da pré-validação: ID extraído + válida ou o motivo da falha. */}
        {validacao && (
          <div
            className={`rounded-xl border px-3 py-2 text-sm ${
              validacao.valido
                ? "border-[rgba(46,158,99,0.35)] bg-[rgba(46,158,99,0.1)] text-ok"
                : "border-[rgba(214,69,69,0.35)] bg-[rgba(214,69,69,0.1)] text-danger"
            }`}
          >
            {validacao.valido ? (
              <>
                Pasta válida. ID extraído: <span className="font-semibold">{validacao.folderId}</span>
              </>
            ) : (
              <>Pasta inválida: {validacao.motivo ?? "não foi possível validar a pasta."}</>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!podeSalvar} className="shrink-0 py-2.5">
            {saving ? "Salvando…" : editandoId ? "Salvar alterações" : "Salvar"}
          </Button>
          {editandoId && (
            <Button
              type="button"
              variant="secondary"
              onClick={cancelarEdicao}
              disabled={saving}
              className="shrink-0 py-2.5"
            >
              Cancelar
            </Button>
          )}
        </div>
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
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[720px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="escopo" className="w-28">
                  Escopo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="chave" className="w-40">
                  Chave
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="rotulo">
                  Rótulo
                </ColunaOrdenavel>
                <th className="w-56">ID da pasta</th>
                <ColunaOrdenavel as="th" ord={ord} chave="ativo" className="w-28">
                  Ativo
                </ColunaOrdenavel>
                <th className="w-40">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-faint">
                    Nenhuma pasta mapeada ainda. Cadastre a primeira acima.
                  </td>
                </tr>
              ) : (
                ord.itens.map((p) => (
                  <tr key={p.id} className={p.ativo ? "" : "opacity-60"}>
                    <td className="text-center">{ROTULO_ESCOPO[p.escopo]}</td>
                    <td className="font-semibold">
                      {p.escopo === "CONTRATO"
                        ? TIPOS_CONTRATO.find((t) => t.valor === p.chave)?.rotulo ?? p.chave
                        : p.chave}
                    </td>
                    <td>{p.rotulo || "não informado"}</td>
                    <td className="break-all font-mono text-[12px] text-dim">{p.folderId}</td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <StatusPill
                          tone={p.ativo ? "ok" : "nt"}
                          label={p.ativo ? "Ativo" : "Inativo"}
                        />
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        onClick={() => iniciarEdicao(p)}
                        className="text-accent hover:underline"
                      >
                        editar
                      </button>
                      <span className="px-2 text-faint">·</span>
                      <button
                        onClick={() => setConfirmar(p)}
                        className="text-danger hover:underline"
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
      </GlassCard>

      <ConfirmDialog
        open={Boolean(confirmar)}
        title="Remover Mapeamento De Pasta"
        message={
          confirmar
            ? `Remover a pasta-pai de ${ROTULO_ESCOPO[confirmar.escopo]} "${
                confirmar.escopo === "CONTRATO"
                  ? TIPOS_CONTRATO.find((t) => t.valor === confirmar.chave)?.rotulo ?? confirmar.chave
                  : confirmar.chave
              }"? O arquivamento desse contrato/cliente volta a ficar sem pasta-pai até um novo mapeamento.`
            : ""
        }
        confirmLabel="Remover"
        tone="danger"
        busy={removendo}
        onConfirm={confirmarRemocao}
        onCancel={() => setConfirmar(null)}
      />
    </>
  );
}
