"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Papel } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
}

const PAPEL_ROTULO: Record<Papel, string> = {
  SUPER_ADMIN: "Super Admin",
  MASTER: "Master",
  COMUM: "Comum",
};

// Rank do papel para a ordenação clicável: hierarquia real, do mais poderoso para o menos. Ordenar
// "Comum/Master/Super Admin" por alfabética não diz nada sobre o nível de acesso.
const PAPEL_RANK: Record<Papel, number> = { SUPER_ADMIN: 0, MASTER: 1, COMUM: 2 };

const PAPEL_OPTIONS = [
  { value: "COMUM", label: "Comum" },
  { value: "MASTER", label: "Master" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];

const EMPTY = { nome: "", email: "", papel: "COMUM" as Papel };

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "não informado" : dt.toLocaleDateString("pt-BR");
}

/**
 * Bloco copiável da senha temporária: aparece após criar usuário ou resetar senha. A senha só é
 * exibida uma vez (o backend não a persiste em claro): o admin a entrega por fora do sistema.
 */
function SenhaTemporaria({ senha, onFechar }: { senha: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard indisponível, o admin pode selecionar o texto manualmente */
    }
  }
  return (
    <GlassCard className="mb-5 border-2 border-accent p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-text">Senha temporária gerada</h3>
          <p className="mt-0.5 text-[12.5px] text-dim">
            Entregue esta senha por fora do sistema; ela não será exibida de novo. No primeiro
            acesso, o usuário será obrigado a trocá-la.
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[15px] tracking-wide text-text">
          {senha}
        </code>
        <Button onClick={copiar} className="flex-none gap-1.5 py-2.5">
          <Icon name={copiado ? "check" : "doc"} className="h-4 w-4" />
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </GlassCard>
  );
}

/**
 * Admin: Gestão de usuários (OST-EA-GESTAO-USUARIOS). Criação com senha temporária, edição de
 * dados/papel, ativar/desativar (soft delete = bloqueio de login, preserva histórico) e reset de
 * senha. Restrito a Master / Super Admin (gating herdado do AdminLayout).
 */
export default function UsuariosPage() {
  const { token, user: atual } = useAuth();
  const [rows, setRows] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Criação
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  // Senha temporária a exibir (criação ou reset)
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

  // Edição inline
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", email: "", papel: "COMUM" as Papel });
  const [busyId, setBusyId] = useState<string | null>(null);

  // ConfirmDialogs
  const [toggleAlvo, setToggleAlvo] = useState<Usuario | null>(null);
  const [resetAlvo, setResetAlvo] = useState<Usuario | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows(await apiFetch<Usuario[]>("/admin/usuarios", { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ordenação clicável (OST visual, leva das 11 tabelas). Papel e Status ordenam por RANK, não
  // alfabética. A coluna de ações não entra: é controle, não dado.
  const colunas = useMemo<ColOrd<Usuario>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (u) => u.nome },
      { chave: "email", tipo: "texto", valor: (u) => u.email },
      { chave: "papel", tipo: "status", valor: (u) => PAPEL_RANK[u.papel] },
      { chave: "status", tipo: "status", valor: (u) => (u.ativo ? 0 : 1) },
      { chave: "criadoEm", tipo: "data", valor: (u) => u.criadoEm },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, rows);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!form.nome.trim() || !form.email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await apiFetch<{ usuario: Usuario; senhaTemporaria: string }>("/admin/usuarios", {
        method: "POST",
        token,
        body: { nome: form.nome.trim(), email: form.email.trim(), papel: form.papel },
      });
      setForm(EMPTY);
      setSenhaGerada(r.senhaTemporaria);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao criar usuário.");
    } finally {
      setSaving(false);
    }
  }

  function iniciarEdicao(u: Usuario) {
    setEditId(u.id);
    setEditForm({ nome: u.nome, email: u.email, papel: u.papel });
  }

  async function salvarEdicao(id: string) {
    if (!editForm.nome.trim() || !editForm.email.trim()) return;
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/admin/usuarios/${id}`, {
        method: "PATCH",
        token,
        body: { nome: editForm.nome.trim(), email: editForm.email.trim(), papel: editForm.papel },
      });
      setEditId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar usuário.");
    } finally {
      setBusyId(null);
    }
  }

  async function confirmarToggle() {
    if (!toggleAlvo) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/usuarios/${toggleAlvo.id}`, {
        method: "PATCH",
        token,
        body: { ativo: !toggleAlvo.ativo },
      });
      setToggleAlvo(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao alterar o status do usuário.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmarReset() {
    if (!resetAlvo) return;
    setConfirmBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ senhaTemporaria: string }>(
        `/admin/usuarios/${resetAlvo.id}/reset-senha`,
        { method: "POST", token },
      );
      setResetAlvo(null);
      setSenhaGerada(r.senhaTemporaria);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao resetar a senha.");
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Usuários"
        subtitle="Cadastro, papéis e acesso: senha temporária na criação e no reset; desativar bloqueia o login sem apagar o histórico."
      />

      {/* ── Criar usuário ──────────────────────────────────────────────── */}
      <GlassCard
        as="form"
        onSubmit={criar}
        className="mb-5 grid gap-3 p-4 md:grid-cols-[1fr_1fr_200px_auto] md:items-end"
      >
        <div>
          <span className="ds-label">Nome</span>
          <input
            required
            placeholder="Nome completo"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="ds-input"
          />
        </div>
        <div>
          <span className="ds-label">E-mail</span>
          <input
            required
            type="email"
            placeholder="voce@empresa.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="ds-input"
          />
        </div>
        <div>
          <span className="ds-label">Papel</span>
          <Select
            value={form.papel}
            onChange={(v) => setForm({ ...form, papel: v as Papel })}
            ariaLabel="Papel do novo usuário"
            options={PAPEL_OPTIONS}
          />
        </div>
        <Button
          type="submit"
          disabled={saving || !form.nome.trim() || !form.email.trim()}
          className="py-2.5"
        >
          {saving ? "Criando…" : "Criar usuário"}
        </Button>
      </GlassCard>

      {senhaGerada && <SenhaTemporaria senha={senhaGerada} onFechar={() => setSenhaGerada(null)} />}

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* ── Lista de usuários ──────────────────────────────────────────── */}
      <GlassCard className="overflow-hidden p-2">
        <table className="ds-table">
          <thead>
            <tr>
              <ColunaOrdenavel as="th" ord={ord} chave="nome">
                Nome
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="email">
                E-mail
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="papel" className="w-[170px]">
                Papel
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[120px]">
                Status
              </ColunaOrdenavel>
              <ColunaOrdenavel as="th" ord={ord} chave="criadoEm" className="w-[135px]">
                Criado em
              </ColunaOrdenavel>
              <th className="w-[180px]" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-faint">
                  Carregando usuários…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-faint">
                  Nenhum usuário cadastrado.
                </td>
              </tr>
            ) : (
              ord.itens.map((u) => {
                const editando = editId === u.id;
                const busy = busyId === u.id;
                const ehAtual = atual?.id === u.id;
                return (
                  <tr key={u.id}>
                    <td className="align-top">
                      {editando ? (
                        <input
                          className="ds-input !py-2"
                          value={editForm.nome}
                          onChange={(e) => setEditForm({ ...editForm, nome: e.target.value })}
                          aria-label="Nome"
                        />
                      ) : (
                        <span className="text-text">{u.nome}</span>
                      )}
                    </td>
                    <td className="align-top">
                      {editando ? (
                        <input
                          type="email"
                          className="ds-input !py-2"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          aria-label="E-mail"
                        />
                      ) : (
                        <span className="text-dim">{u.email}</span>
                      )}
                    </td>
                    <td className="align-top">
                      {editando ? (
                        <Select
                          value={editForm.papel}
                          onChange={(v) => setEditForm({ ...editForm, papel: v as Papel })}
                          ariaLabel="Papel"
                          options={PAPEL_OPTIONS}
                        />
                      ) : (
                        <span className="text-[13.5px] text-text">{PAPEL_ROTULO[u.papel]}</span>
                      )}
                    </td>
                    <td className="align-top">
                      <Pill tone={u.ativo ? "ok" : "nt"}>{u.ativo ? "Ativo" : "Inativo"}</Pill>
                    </td>
                    <td className="align-top text-[13px] text-dim">{fmtData(u.criadoEm)}</td>
                    <td className="align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {editando ? (
                          <>
                            <button
                              type="button"
                              disabled={busy || !editForm.nome.trim() || !editForm.email.trim()}
                              onClick={() => salvarEdicao(u.id)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-ok transition hover:bg-[var(--surface-2)] disabled:opacity-50"
                              title="Salvar"
                              aria-label="Salvar usuário"
                            >
                              <Icon name="check" className="h-[18px] w-[18px]" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setEditId(null)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)]"
                              title="Cancelar"
                              aria-label="Cancelar edição"
                            >
                              <Icon name="x" className="h-[18px] w-[18px]" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => iniciarEdicao(u)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                              title="Editar"
                              aria-label="Editar usuário"
                            >
                              <Icon name="pen" className="h-[17px] w-[17px]" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setResetAlvo(u)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                              title="Resetar senha"
                              aria-label="Resetar senha"
                            >
                              <Icon name="clock" className="h-[17px] w-[17px]" />
                            </button>
                            <button
                              type="button"
                              disabled={ehAtual}
                              onClick={() => setToggleAlvo(u)}
                              className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                              title={
                                ehAtual
                                  ? "Você não pode desativar a própria conta"
                                  : u.ativo
                                    ? "Desativar (bloquear login)"
                                    : "Reativar"
                              }
                              aria-label={u.ativo ? "Desativar usuário" : "Reativar usuário"}
                            >
                              <Icon
                                name={u.ativo ? "logout" : "check"}
                                className="h-[17px] w-[17px]"
                              />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </GlassCard>

      {/* Ativar / desativar (soft delete = bloqueio de login, preserva histórico) */}
      <ConfirmDialog
        open={Boolean(toggleAlvo)}
        title={toggleAlvo?.ativo ? "Desativar usuário" : "Reativar usuário"}
        message={
          toggleAlvo?.ativo
            ? `Desativar "${toggleAlvo?.nome}"? O login fica bloqueado, mas o histórico é preservado (não é exclusão). Pode reativar depois.`
            : `Reativar "${toggleAlvo?.nome}"? O usuário volta a poder entrar no sistema.`
        }
        confirmLabel={toggleAlvo?.ativo ? "Desativar" : "Reativar"}
        tone={toggleAlvo?.ativo ? "danger" : "default"}
        busy={confirmBusy}
        onConfirm={confirmarToggle}
        onCancel={() => setToggleAlvo(null)}
      />

      {/* Reset de senha */}
      <ConfirmDialog
        open={Boolean(resetAlvo)}
        title="Resetar senha"
        message={`Gerar uma nova senha temporária para "${resetAlvo?.nome}"? A senha atual deixa de valer e o usuário terá de trocá-la no próximo acesso.`}
        confirmLabel="Gerar nova senha"
        busy={confirmBusy}
        onConfirm={confirmarReset}
        onCancel={() => setResetAlvo(null)}
      />
    </>
  );
}
