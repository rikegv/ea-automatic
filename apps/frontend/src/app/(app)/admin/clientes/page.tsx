"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Pill, type PillTone } from "@/components/ui/Pill";

interface Cliente {
  codCliente: string;
  cnpj: string | null;
  razaoSocial: string;
  nomeOperacao: string | null;
  ativo: boolean;
  // Vínculo cliente ↔ entidade Soulan empregadora (resolvido no backend).
  empresaVinculo?: string | null;
  cnpjVinculo?: string | null;
  tipoServico?: string | null;
  tipoServicoRotulo?: string | null;
  // Opção de vínculo atual (id do catálogo) para pré-selecionar o select na edição.
  vinculoOpcaoId?: string | null;
}

// Opção de vínculo (empresa Soulan/tipo/filial) para o select da edição.
interface VinculoOpcao {
  id: string;
  label: string;
  tipoServico: string;
}

interface AdmissaoAfetada {
  id: string;
  candidato: string;
  farol: string;
}

const EMPTY = { codCliente: "", cnpj: "", razaoSocial: "", nomeOperacao: "" };
type Filtro = "ativos" | "inativos" | "todos";

// Tipos de serviço para o filtro (rótulos exibidos ↔ valor cru de `tipoServico`).
const TIPOS_SERVICO: { valor: string; rotulo: string }[] = [
  { valor: "TEMPORARIO", rotulo: "Temporário" },
  { valor: "TERCEIRO", rotulo: "Terceiro" },
  { valor: "ESTAGIO", rotulo: "Estágio" },
  { valor: "INTERNO", rotulo: "Interno" },
  { valor: "FOPAG", rotulo: "FOPAG" },
];

// Pendência = algum campo obrigatório vazio em alguma coluna exibida.
function temPendencia(c: Cliente): boolean {
  return !c.cnpj || !c.empresaVinculo || !c.cnpjVinculo || !c.tipoServico;
}

// Tom da pill por tipo de serviço (empregador Soulan). Neutro quando desconhecido.
const TIPO_TONE: Record<string, PillTone> = {
  FOPAG: "in",
  INTERNO: "ok",
  TEMPORARIO: "or",
  TERCEIRO: "nt",
  ESTAGIO: "wn",
};
function tipoTone(t: string | null | undefined): PillTone {
  return (t && TIPO_TONE[t]) || "nt";
}

export default function ClientesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  // Filtros adicionais da lista (client-side, combinados em E lógico com o filtro de status).
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [soPendencia, setSoPendencia] = useState(false);
  // codCliente em edição (null = modo criação). O código é a chave: imutável na edição.
  const [editando, setEditando] = useState<string | null>(null);
  // codCliente com a ficha (linha) expandida.
  const [expandido, setExpandido] = useState<string | null>(null);
  // Opções de vínculo (cacheadas no mount) e a opção escolhida no select da edição.
  const [opcoesVinculo, setOpcoesVinculo] = useState<VinculoOpcao[]>([]);
  const [vinculoSel, setVinculoSel] = useState<string>("");
  // vinculoOpcaoId original do cliente em edição (para detectar mudança ao salvar).
  const [vinculoOriginal, setVinculoOriginal] = useState<string | null>(null);

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

  // Opções de vínculo: buscadas uma vez e cacheadas em estado.
  useEffect(() => {
    if (!token) return;
    apiFetch<VinculoOpcao[]>("/admin/clientes/vinculo-opcoes", { token })
      .then(setOpcoesVinculo)
      .catch(() => {
        /* select fica vazio se falhar; não bloqueia a tela */
      });
  }, [token]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((c) => {
      if (filtro === "ativos" && !c.ativo) return false;
      if (filtro === "inativos" && c.ativo) return false;
      if (filtroTipo && c.tipoServico !== filtroTipo) return false;
      if (q && !(c.razaoSocial.toLowerCase().includes(q) || c.codCliente.toLowerCase().includes(q)))
        return false;
      if (soPendencia && !temPendencia(c)) return false;
      return true;
    });
  }, [rows, filtro, filtroTipo, busca, soPendencia]);
  const nAtivos = useMemo(() => rows.filter((c) => c.ativo).length, [rows]);
  const nInativos = rows.length - nAtivos;

  function iniciarEdicao(c: Cliente) {
    setEditando(c.codCliente);
    setForm({
      codCliente: c.codCliente,
      cnpj: c.cnpj ?? "",
      razaoSocial: c.razaoSocial,
      nomeOperacao: c.nomeOperacao ?? "",
    });
    setVinculoOriginal(c.vinculoOpcaoId ?? null);
    setVinculoSel(c.vinculoOpcaoId ?? "");
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditando(null);
    setForm(EMPTY);
    setVinculoOriginal(null);
    setVinculoSel("");
    setError(null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editando) {
        // EDITAR: o codCliente (chave) não muda; envia só os campos editáveis.
        await apiFetch(`/admin/clientes/${encodeURIComponent(editando)}`, {
          method: "PATCH",
          token,
          body: {
            razaoSocial: form.razaoSocial,
            cnpj: form.cnpj || undefined,
            nomeOperacao: form.nomeOperacao || undefined,
          },
        });
        // TROCA de vínculo (adicional) só quando o usuário mudou a opção selecionada.
        if (vinculoSel && vinculoSel !== (vinculoOriginal ?? "")) {
          await apiFetch(`/admin/clientes/${encodeURIComponent(editando)}/vinculo`, {
            method: "PATCH",
            token,
            body: { opcaoId: vinculoSel },
          });
        }
      } else {
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
      }
      setEditando(null);
      setForm(EMPTY);
      setVinculoOriginal(null);
      setVinculoSel("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function inativar(c: Cliente) {
    // AVISA antes: busca as admissões em andamento afetadas (não bloqueia).
    let afetadas: AdmissaoAfetada[] = [];
    try {
      afetadas = await apiFetch<AdmissaoAfetada[]>(
        `/admin/clientes/${encodeURIComponent(c.codCliente)}/dependencias`,
        { token },
      );
    } catch {
      /* segue sem a prévia se falhar */
    }
    const aviso =
      afetadas.length > 0
        ? `\n\n⚠ ${afetadas.length} admissão(ões) em andamento continuam (histórico preservado):\n` +
          afetadas
            .slice(0, 8)
            .map((a) => `• ${a.candidato} (${a.farol})`)
            .join("\n") +
          (afetadas.length > 8 ? `\n… +${afetadas.length - 8}` : "")
        : "\n\nSem admissões em andamento.";
    if (
      !window.confirm(
        `Inativar o cliente ${c.codCliente} (${c.razaoSocial})?\n` +
          `Ele sai das opções selecionáveis (vaga/esteira). Não é exclusão: dá para reativar.` +
          aviso,
      )
    )
      return;
    try {
      await apiFetch(`/admin/clientes/${encodeURIComponent(c.codCliente)}`, {
        method: "DELETE",
        token,
      });
      if (editando === c.codCliente) cancelarEdicao();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao inativar");
    }
  }

  async function reativar(c: Cliente) {
    try {
      await apiFetch(`/admin/clientes/${encodeURIComponent(c.codCliente)}/reativar`, {
        method: "PATCH",
        token,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reativar");
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Cadastros"
        title="Clientes"
        subtitle="Código, razão social, CNPJ e nome operação, com o vínculo à empresa empregadora do Grupo Soulan. Inativar preserva o histórico."
      />

      <GlassCard as="form" onSubmit={salvar} className="mb-5 grid gap-3 p-4 sm:grid-cols-5">
        {editando && (
          <p className="text-sm text-accent sm:col-span-5">
            Editando o cliente <span className="font-mono font-semibold">{editando}</span>, o código
            é a chave e não muda.
          </p>
        )}
        <input
          required
          placeholder="Cód. cliente *"
          value={form.codCliente}
          onChange={(e) => setForm({ ...form, codCliente: e.target.value })}
          disabled={editando !== null}
          className="ds-input disabled:cursor-not-allowed disabled:opacity-60"
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
          placeholder="Nome Operação"
          value={form.nomeOperacao}
          onChange={(e) => setForm({ ...form, nomeOperacao: e.target.value })}
          className="ds-input"
        />
        {editando && (
          <label className="grid gap-1 sm:col-span-5">
            <span className="ds-label">Vínculo (empresa Soulan / tipo)</span>
            <select
              value={vinculoSel}
              onChange={(e) => setVinculoSel(e.target.value)}
              className="ds-input"
            >
              <option value="">Selecione o vínculo</option>
              {opcoesVinculo.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-5">
          <Button type="submit" disabled={saving} className="py-2.5 sm:w-fit">
            {saving ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar cliente"}
          </Button>
          {editando && (
            <Button
              type="button"
              variant="secondary"
              onClick={cancelarEdicao}
              disabled={saving}
              className="py-2.5 sm:w-fit"
            >
              Cancelar
            </Button>
          )}
        </div>
      </GlassCard>

      {/* Filtros da lista: status (ativos/inativos/todos) + tipo, busca e pendência (E lógico). */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["ativos", "inativos", "todos"] as Filtro[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-full border px-3 py-1 capitalize transition ${
              filtro === f
                ? "border-accent bg-[var(--surface-2)] text-accent"
                : "border-[var(--border)] text-dim hover:text-text"
            }`}
          >
            {f}
            {f === "ativos"
              ? ` (${nAtivos})`
              : f === "inativos"
                ? ` (${nInativos})`
                : ` (${rows.length})`}
          </button>
        ))}

        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          aria-label="Filtrar por tipo de serviço"
          className="ds-input h-auto w-auto py-1.5"
        >
          <option value="">Todos os tipos</option>
          {TIPOS_SERVICO.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por razão social ou código"
          aria-label="Buscar cliente por razão social ou código"
          className="ds-input h-auto w-auto min-w-[16rem] py-1.5"
        />

        <label className="flex cursor-pointer items-center gap-2 text-dim">
          <input
            type="checkbox"
            checked={soPendencia}
            onChange={(e) => setSoPendencia(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Só com pendência
        </label>
      </div>

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        {/* Tabela larga → scroll horizontal contido, sem estourar o body. */}
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[960px]">
            <thead>
              <tr>
                <th className="w-8" />
                <th>Código</th>
                <th>Razão social</th>
                <th>CNPJ</th>
                <th>Nome Operação</th>
                <th>Empresa (Soulan)</th>
                <th>CNPJ vínculo</th>
                <th>Tipo de serviço</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-faint">
                    Nenhum cliente neste filtro.
                  </td>
                </tr>
              ) : (
                visiveis.map((c) => {
                  const aberto = expandido === c.codCliente;
                  return (
                    <FragmentRow
                      key={c.codCliente}
                      c={c}
                      aberto={aberto}
                      onToggle={() => setExpandido(aberto ? null : c.codCliente)}
                      onEditar={() => iniciarEdicao(c)}
                      onInativar={() => inativar(c)}
                      onReativar={() => reativar(c)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </>
  );
}

function cnpjVinculoLabel(c: Cliente) {
  if (c.cnpjVinculo) return <span className="font-mono">{c.cnpjVinculo}</span>;
  return <span className="text-faint">pendente</span>;
}

function tipoServicoPill(c: Cliente) {
  if (!c.tipoServicoRotulo) return <span className="text-faint">não informado</span>;
  return <Pill tone={tipoTone(c.tipoServico)}>{c.tipoServicoRotulo}</Pill>;
}

function FragmentRow({
  c,
  aberto,
  onToggle,
  onEditar,
  onInativar,
  onReativar,
}: {
  c: Cliente;
  aberto: boolean;
  onToggle: () => void;
  onEditar: () => void;
  onInativar: () => void;
  onReativar: () => void;
}) {
  return (
    <>
      <tr className={c.ativo ? "" : "opacity-60"}>
        <td>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={aberto}
            aria-label={aberto ? "Fechar ficha" : "Ver ficha"}
            className="grid h-6 w-6 place-items-center rounded text-dim transition hover:text-text"
          >
            <span className={`transition-transform ${aberto ? "rotate-90" : ""}`}>›</span>
          </button>
        </td>
        <td className="font-mono">{c.codCliente}</td>
        <td className="text-dim">{c.razaoSocial}</td>
        <td>{c.cnpj ?? "não informado"}</td>
        <td className="font-semibold">{c.nomeOperacao ?? c.razaoSocial}</td>
        <td>{c.empresaVinculo ?? <span className="text-faint">não informado</span>}</td>
        <td>{cnpjVinculoLabel(c)}</td>
        <td>{tipoServicoPill(c)}</td>
        <td>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              c.ativo
                ? "bg-[rgba(120,190,60,0.15)] text-[var(--ok)]"
                : "bg-[var(--surface-2)] text-faint"
            }`}
          >
            {c.ativo ? "Ativo" : "Inativo"}
          </span>
        </td>
        <td className="whitespace-nowrap text-right">
          <button onClick={onEditar} className="text-accent hover:underline">
            editar
          </button>
          <span className="px-2 text-faint">·</span>
          {c.ativo ? (
            <button onClick={onInativar} className="text-danger hover:underline">
              inativar
            </button>
          ) : (
            <button onClick={onReativar} className="text-accent hover:underline">
              reativar
            </button>
          )}
        </td>
      </tr>
      {aberto && (
        <tr>
          <td colSpan={10} className="p-0">
            <div className="m-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Ficha rotulo="Empregador (Soulan)">
                  {c.empresaVinculo ?? <span className="text-faint">não informado</span>}
                </Ficha>
                <Ficha rotulo="CNPJ do vínculo">{cnpjVinculoLabel(c)}</Ficha>
                <Ficha rotulo="Tipo de serviço">{tipoServicoPill(c)}</Ficha>
                <Ficha rotulo="Código do cliente">
                  <span className="font-mono">{c.codCliente}</span>
                </Ficha>
                <Ficha rotulo="Razão social">{c.razaoSocial}</Ficha>
                <Ficha rotulo="CNPJ do cliente">
                  {c.cnpj ? (
                    <span className="font-mono">{c.cnpj}</span>
                  ) : (
                    <span className="text-faint">não informado</span>
                  )}
                </Ficha>
                <Ficha rotulo="Nome Operação">
                  {c.nomeOperacao ?? <span className="text-faint">não informado</span>}
                </Ficha>
                <Ficha rotulo="Status">{c.ativo ? "Ativo" : "Inativo"}</Ficha>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Ficha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="ds-label">{rotulo}</span>
      <div className="mt-0.5 text-sm text-text">{children}</div>
    </div>
  );
}
