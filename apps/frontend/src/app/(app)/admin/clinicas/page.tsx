"use client";

/**
 * CADASTRO DE CLÍNICAS (OST Onda 2, item 4). Menu do GERENCIAL, no molde exato dos outros cadastros.
 *
 * Guarda SÓ O NOME, por decisão do diretor: nada de endereço, telefone ou contato. O agendamento do
 * exame passa a SELECIONAR desta lista em vez de aceitar texto livre, que era o que fazia a mesma
 * clínica aparecer escrita de várias formas.
 *
 * Inativar é EXCLUSÃO LÓGICA: a clínica sai das opções do agendamento e o histórico continua legível.
 */

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

/**
 * CADASTRO DE ESCALAS (OST produção, Bloco 4).
 *
 * Mesma máscara dos demais cadastros (§A.12): formulário no topo que serve para criar e para editar,
 * filtros por status com contador, busca em tempo real, tabela com ordenação clicável e inativação
 * por modal de confirmação. Inativar é EXCLUSÃO LÓGICA: a clínica sai das opções selecionáveis e o
 * vínculo das admissões que já a usam continua intacto.
 *
 * O que esta tela alimenta: o seletor de clínica do modal de Agendamento do Exame, que lê
 * `/catalogos/clínicas` (só as ATIVAS). Antes daqui, clínica só nascia por caminho lateral.
 */
interface Clinica {
  id: string;
  nome: string;
  endereco: string | null;
  /** Fornecedor da clínica: o agendamento DERIVA daqui, por endereço. */
  fornecedor: string | null;
  ativo: boolean;
}

type Filtro = "ativos" | "inativos" | "todos";

export default function ClinicasPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Clinica[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [endereco, setEndereco] = useState("");
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [busca, setBusca] = useState("");
  // id em edição (null = modo criação).
  const [editando, setEditando] = useState<string | null>(null);
  // clínica pendente de confirmação de inativação (null = modal fechado) + estado de "processando".
  const [confirmar, setConfirmar] = useState<Clinica | null>(null);
  const [inativando, setInativando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<Clinica[]>("/admin/clinicas", { token }));
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

  // Filtro por status + busca em tempo real por nome (E lógico). A lista já vem alfabética do
  // backend; o filtro preserva a ordem.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((c) => {
      if (filtro === "ativos" && !c.ativo) return false;
      if (filtro === "inativos" && c.ativo) return false;
      if (q && !c.nome.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filtro, busca]);

  // Ordenação clicável (§A.12). Status por RANK (ativo primeiro), não alfabética. A coluna de ações
  // não entra: é controle, não dado.
  const colunas = useMemo<ColOrd<Clinica>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (c) => c.nome },
      { chave: "status", tipo: "status", valor: (c) => (c.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, visiveis);

  const nAtivos = useMemo(() => rows.filter((c) => c.ativo).length, [rows]);
  const nInativos = rows.length - nAtivos;

  function iniciarEdicao(c: Clinica) {
    setEditando(c.id);
    setNome(c.nome);
    setFornecedor(c.fornecedor ?? "");
    setEndereco(c.endereco ?? "");
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditando(null);
    setNome("");
    setFornecedor("");
    setEndereco("");
    setError(null);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editando) {
        await apiFetch(`/admin/clinicas/${encodeURIComponent(editando)}`, {
          method: "PATCH",
          token,
          body: { nome, fornecedor, endereco },
        });
      } else {
        await apiFetch("/admin/clinicas", { method: "POST", token, body: { nome, fornecedor, endereco } });
      }
      setEditando(null);
      setNome("");
      setFornecedor("");
      setEndereco("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // Inativação pelo modal premium do sistema (ConfirmDialog): soft-delete no backend, reversível.
  async function confirmarInativacao() {
    const c = confirmar;
    if (!c) return;
    setInativando(true);
    setError(null);
    try {
      await apiFetch(`/admin/clinicas/${encodeURIComponent(c.id)}`, { method: "DELETE", token });
      if (editando === c.id) cancelarEdicao();
      setConfirmar(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao inativar");
    } finally {
      setInativando(false);
    }
  }

  async function reativar(c: Clinica) {
    try {
      await apiFetch(`/admin/clinicas/${encodeURIComponent(c.id)}/reativar`, {
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
        title="Clínicas"
        subtitle="Catálogo de clínicas do exame admissional. Alimenta o seletor de clínica no agendamento. Inativar preserva os vínculos e o histórico."
      />

      <GlassCard as="form" onSubmit={salvar} className="mb-5 flex flex-wrap gap-3 p-4">
        {editando && (
          <p className="w-full text-sm text-accent">Editando uma clínica, ajuste o nome e salve.</p>
        )}
        <input
          required
          placeholder={editando ? "Nome da clínica *" : "Nova clínica *"}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="ds-input flex-1"
        />
        {/* FORNECEDOR da clínica (OST do fornecedor por clínica): o agendamento não pergunta mais,
            ele deriva daqui. Texto livre de propósito, para cadastrar fornecedor novo sem migração. */}
        <input
          required
          placeholder="Fornecedor *"
          value={fornecedor}
          onChange={(e) => setFornecedor(e.target.value)}
          className="ds-input w-[200px]"
        />
        {/* ENDEREÇO (item 6): opcional, o agendamento do exame puxa daqui quando existe. */}
        <input
          placeholder="Endereço da clínica"
          value={endereco}
          onChange={(e) => setEndereco(e.target.value)}
          className="ds-input flex-1"
        />
        <Button type="submit" disabled={saving} className="shrink-0 py-2.5">
          {saving ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar"}
        </Button>
        {editando && (
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
      </GlassCard>

      {/* Filtros da lista: status (com contador do catálogo) + busca em tempo real por nome. */}
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

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar clínica por nome"
          aria-label="Buscar clínica por nome"
          className="ds-input h-auto w-auto min-w-[16rem] py-1.5"
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
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[480px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="nome">
                  Clínica
                </ColunaOrdenavel>
                <th className="w-48 text-center">Fornecedor</th>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-32">
                  Status
                </ColunaOrdenavel>
                <th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-faint">
                    Nenhuma clínica neste filtro.
                  </td>
                </tr>
              ) : (
                ord.itens.map((c) => (
                  <tr key={c.id} className={c.ativo ? "" : "opacity-60"}>
                    <td className="font-semibold">{c.nome}</td>
                    <td className="text-center">{c.fornecedor || "não informado"}</td>
                    <td className="text-center">
                      {/* Padrão único §A.12: ícone dinâmico de status, mesmo StatusPill do sistema. */}
                      <span className="inline-flex justify-center">
                        <StatusPill
                          tone={c.ativo ? "ok" : "nt"}
                          label={c.ativo ? "Ativo" : "Inativo"}
                        />
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <button
                        onClick={() => iniciarEdicao(c)}
                        className="text-accent hover:underline"
                      >
                        editar
                      </button>
                      <span className="px-2 text-faint">·</span>
                      {c.ativo ? (
                        <button
                          onClick={() => setConfirmar(c)}
                          className="text-danger hover:underline"
                        >
                          inativar
                        </button>
                      ) : (
                        <button onClick={() => reativar(c)} className="text-accent hover:underline">
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

      {/* Modal premium do sistema (§A.12) para confirmar a inativação. Exclusão lógica: preserva os
          vínculos e o histórico, sem exclusão física, reversível pela reativação. */}
      <ConfirmDialog
        open={Boolean(confirmar)}
        title="Inativar Clínica"
        message={
          confirmar
            ? `Inativar a clínica "${confirmar.nome}"? Ela sai das opções selecionáveis, mas não é excluída: as admissões que já a usam preservam o vínculo e você pode reativar quando quiser.`
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
