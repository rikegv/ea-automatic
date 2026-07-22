"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface Tarifa {
  id: string;
  cidade: string;
  tipoTransporte: string;
  valor: number;
  observacao: string | null;
  ativo: boolean;
}

type Filtro = "ativas" | "inativas" | "todas";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Exibe o valor em R$ (gratuidade aparece como R$ 0,00, que é a tarifa real). */
function formatarValor(v: number): string {
  return BRL.format(v);
}

/** Aceita "6,10" e "6.10"; devolve null quando não é um valor monetário válido. Zero é válido. */
function parseValor(entrada: string): number | null {
  const n = Number(entrada.trim().replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export default function TarifasPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Tarifa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("ativas");
  const [busca, setBusca] = useState("");
  // Campos do formulário (criação e edição usam o mesmo).
  const [cidade, setCidade] = useState("");
  const [tipoTransporte, setTipoTransporte] = useState("");
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  // id em edição (null = modo criação).
  const [editando, setEditando] = useState<string | null>(null);
  // tarifa pendente de confirmação de inativação (null = modal fechado) + estado de "processando".
  const [confirmar, setConfirmar] = useState<Tarifa | null>(null);
  const [inativando, setInativando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<Tarifa[]>("/admin/tarifas", { token }));
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

  // Filtro por status + busca em tempo real por cidade ou transporte (E lógico). A lista já vem
  // ordenada por cidade e transporte do backend; o filtro preserva a ordem.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((t) => {
      if (filtro === "ativas" && !t.ativo) return false;
      if (filtro === "inativas" && t.ativo) return false;
      if (q && !`${t.cidade} ${t.tipoTransporte}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filtro, busca]);

  // Ordenação clicável (OST visual, leva das 11 tabelas). Valor é NÚMERO (ordena pela grandeza, não
  // pelo texto formatado em BRL) e Status é RANK (ativa primeiro). Ações fica de fora: é controle.
  const colunas = useMemo<ColOrd<Tarifa>[]>(
    () => [
      { chave: "cidade", tipo: "texto", valor: (t) => t.cidade },
      { chave: "transporte", tipo: "texto", valor: (t) => t.tipoTransporte },
      { chave: "valor", tipo: "numero", valor: (t) => t.valor },
      { chave: "observacao", tipo: "texto", valor: (t) => t.observacao },
      { chave: "status", tipo: "status", valor: (t) => (t.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, visiveis);

  const nAtivas = useMemo(() => rows.filter((t) => t.ativo).length, [rows]);
  const nInativas = rows.length - nAtivas;

  function limparForm() {
    setEditando(null);
    setCidade("");
    setTipoTransporte("");
    setValor("");
    setObservacao("");
    setError(null);
  }

  function iniciarEdicao(t: Tarifa) {
    setEditando(t.id);
    setCidade(t.cidade);
    setTipoTransporte(t.tipoTransporte);
    setValor(t.valor.toFixed(2).replace(".", ","));
    setObservacao(t.observacao ?? "");
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    if (v === null) {
      setError(
        "Valor inválido. Informe um valor em reais, por exemplo 6,10. Use 0,00 para gratuidade.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = { cidade, tipoTransporte, valor: v, observacao };
      if (editando) {
        await apiFetch(`/admin/tarifas/${encodeURIComponent(editando)}`, {
          method: "PATCH",
          token,
          body,
        });
      } else {
        await apiFetch("/admin/tarifas", { method: "POST", token, body });
      }
      limparForm();
      await load();
    } catch (e) {
      // O 409 do backend ("Já existe tarifa para essa cidade e transporte") chega aqui e aparece
      // com a mensagem do servidor, sem precisar de tradução na tela.
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // Confirmação de inativação pelo modal premium do sistema (ConfirmDialog). `confirmar` guarda a
  // tarifa alvo; esta função executa a inativação (soft-delete no backend) ao confirmar.
  async function confirmarInativacao() {
    const t = confirmar;
    if (!t) return;
    setInativando(true);
    setError(null);
    try {
      await apiFetch(`/admin/tarifas/${encodeURIComponent(t.id)}`, { method: "DELETE", token });
      if (editando === t.id) limparForm();
      setConfirmar(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao inativar");
    } finally {
      setInativando(false);
    }
  }

  async function reativar(t: Tarifa) {
    try {
      await apiFetch(`/admin/tarifas/${encodeURIComponent(t.id)}/reativar`, {
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
        title="Tarifas de transporte"
        subtitle="Tabela de tarifas vigentes por cidade e transporte. O formulário de VT sugere estes valores ao candidato. Inativar preserva o histórico."
      />

      <GlassCard as="form" onSubmit={salvar} className="mb-5 flex flex-wrap gap-3 p-4">
        {editando && (
          <p className="w-full text-sm text-accent">
            Editando uma tarifa, ajuste os campos e salve.
          </p>
        )}
        <input
          required
          placeholder="Cidade *"
          value={cidade}
          onChange={(e) => setCidade(e.target.value)}
          className="ds-input min-w-[12rem] flex-1"
        />
        <input
          required
          placeholder="Tipo de transporte *"
          value={tipoTransporte}
          onChange={(e) => setTipoTransporte(e.target.value)}
          className="ds-input min-w-[12rem] flex-1"
        />
        <input
          required
          inputMode="decimal"
          placeholder="Valor R$ *"
          aria-label="Valor da tarifa em reais"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="ds-input w-32"
        />
        <input
          placeholder="Observação"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className="ds-input min-w-[12rem] flex-1"
        />
        <Button type="submit" disabled={saving} className="shrink-0 py-2.5">
          {saving ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar"}
        </Button>
        {editando && (
          <Button
            type="button"
            variant="secondary"
            onClick={limparForm}
            disabled={saving}
            className="shrink-0 py-2.5"
          >
            Cancelar
          </Button>
        )}
      </GlassCard>

      {/* Filtros da lista: status (com contador da tabela) + busca em tempo real por cidade ou
          transporte. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["ativas", "inativas", "todas"] as Filtro[]).map((f) => (
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
            {f === "ativas"
              ? ` (${nAtivas})`
              : f === "inativas"
                ? ` (${nInativas})`
                : ` (${rows.length})`}
          </button>
        ))}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cidade ou transporte"
          aria-label="Buscar por cidade ou transporte"
          className="ds-input h-auto w-auto min-w-[18rem] rounded-full py-1.5"
        />
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
        <div className="ea-scroll overflow-x-auto">
          <table className="ds-table min-w-[860px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="cidade">
                  Cidade
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="transporte">
                  Transporte
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="valor" className="w-32">
                  Valor
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="observacao">
                  Observação
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-32">
                  Status
                </ColunaOrdenavel>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-faint">
                    Nenhuma tarifa neste filtro.
                  </td>
                </tr>
              ) : (
                ord.itens.map((t) => (
                  <tr key={t.id} className={t.ativo ? "" : "opacity-60"}>
                    <td className="font-semibold">{t.cidade}</td>
                    <td>{t.tipoTransporte}</td>
                    <td className="whitespace-nowrap text-right tabular-nums font-semibold">
                      {formatarValor(t.valor)}
                    </td>
                    <td className="text-dim">{t.observacao || "não informado"}</td>
                    <td className="text-center">
                      {/* Padrão único §A.12: ícone dinâmico de status (check verde = ativa,
                          neutro = inativa), via o mesmo StatusPill do Gerenciador/Esteira. */}
                      <span className="inline-flex justify-center">
                        <StatusPill
                          tone={t.ativo ? "ok" : "nt"}
                          label={t.ativo ? "Ativa" : "Inativa"}
                        />
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        onClick={() => iniciarEdicao(t)}
                        className="text-accent hover:underline"
                      >
                        editar
                      </button>
                      <span className="px-2 text-faint">·</span>
                      {t.ativo ? (
                        <button
                          onClick={() => setConfirmar(t)}
                          className="text-danger hover:underline"
                        >
                          inativar
                        </button>
                      ) : (
                        <button onClick={() => reativar(t)} className="text-accent hover:underline">
                          reativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Modal premium do sistema (§A.12) para confirmar a inativação. Soft-delete: a tarifa sai das
          sugestões do formulário de VT, mas não é excluída e o histórico é preservado. Reversível. */}
      <ConfirmDialog
        open={Boolean(confirmar)}
        title="Inativar tarifa"
        message={
          confirmar
            ? `Inativar a tarifa de ${confirmar.tipoTransporte} em ${confirmar.cidade}? Ela deixa de ser sugerida no formulário de VT, mas não é excluída: o histórico é preservado e você pode reativar quando quiser.`
            : ""
        }
        confirmLabel="Inativar"
        tone="danger"
        busy={inativando}
        onConfirm={confirmarInativacao}
        onCancel={() => setConfirmar(null)}
      />
    </>
  );
}
