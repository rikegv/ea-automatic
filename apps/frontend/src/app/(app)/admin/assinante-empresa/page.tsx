"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";

/**
 * ASSINANTE DA EMPRESA (INT-4, Administração, restrito a Master/Super Admin).
 *
 * O que a tela gerencia é o CONJUNTO que assina por um cliente, não pessoas soltas. Um cadastro por
 * escopo (o PADRÃO, ou um cliente específico) e, dentro dele, todas as pessoas de uma vez, cada uma
 * com a sua POSIÇÃO.
 *
 * A POSIÇÃO é o que a tela precisa deixar óbvio: pessoas na MESMA posição assinam JUNTAS (paralelo);
 * posições diferentes viram sequência, e quem está na posição seguinte só é notificado quando a
 * anterior terminar. Por isso o editor AGRUPA visualmente por posição, em vez de mostrar uma coluna
 * de número solta, que era o que obrigava a cadastrar de um em um.
 *
 * O motor não mudou: o funcionário é sempre o grupo 1 na Clicksign, e a posição N vira o grupo N+1.
 *
 * §A.6: o CPF é obrigatório e volta MASCARADO do backend. Ao editar alguém já gravado, deixar o CPF
 * em branco mantém o que está no banco; digitar substitui.
 */
interface Assinante {
  id: string;
  /** `null` = é o PADRÃO. */
  codCliente: string | null;
  clienteNome: string | null;
  nome: string;
  email: string;
  cpfMascarado: string;
  ordem: number;
  ativo: boolean;
}

interface ClienteOpcao {
  codCliente: string;
  nomeOperacao: string | null;
}

/** Uma pessoa dentro do editor. `id` ausente = pessoa nova. */
interface PessoaEdit {
  chave: string;
  id?: string;
  nome: string;
  email: string;
  /** Vazio numa pessoa já gravada = manter o CPF atual. */
  cpf: string;
  cpfMascarado?: string;
  ordem: number;
}

/** Um escopo já cadastrado, com as suas pessoas. */
interface Escopo {
  codCliente: string | null;
  clienteNome: string | null;
  pessoas: Assinante[];
}

/** Formata o CPF enquanto digita, sem impedir apagar. */
function mascaraCpf(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

let seq = 0;
function novaPessoa(ordem: number): PessoaEdit {
  seq += 1;
  return { chave: `p${seq}`, nome: "", email: "", cpf: "", ordem };
}

/** Resumo da ordem para a linha da lista contar a sequência sem precisar abrir o editor. */
function resumo(pessoas: Assinante[]): string {
  const posicoes = [...new Set(pessoas.map((p) => p.ordem))].sort((a, b) => a - b);
  return posicoes
    .map((o) => {
      const nomes = pessoas.filter((p) => p.ordem === o).map((p) => p.nome);
      return nomes.length > 1 ? `${o}. ${nomes.join(" e ")} (juntos)` : `${o}. ${nomes[0]}`;
    })
    .join("  >  ");
}

export default function AssinanteEmpresaPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Assinante[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Editor do conjunto. `aberto` guarda o escopo em edição (null = fechado).
  const [aberto, setAberto] = useState<{ novo: boolean } | null>(null);
  const [pessoas, setPessoas] = useState<PessoaEdit[]>([]);
  const [codClienteEdit, setCodClienteEdit] = useState("");
  const [alvoRemover, setAlvoRemover] = useState<Escopo | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [lista, cats] = await Promise.all([
        apiFetch<Assinante[]>("/admin/assinante-empresa", { token }),
        apiFetch<ClienteOpcao[]>("/admin/clientes", { token }).catch(() => [] as ClienteOpcao[]),
      ]);
      setRows(lista ?? []);
      setClientes(Array.isArray(cats) ? cats : []);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao carregar os assinantes.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Agrupa as linhas por escopo: é assim que a operação enxerga o cadastro. */
  const escopos = useMemo<Escopo[]>(() => {
    const mapa = new Map<string, Escopo>();
    for (const r of rows) {
      const chave = r.codCliente ?? "__padrao__";
      if (!mapa.has(chave)) {
        mapa.set(chave, { codCliente: r.codCliente, clienteNome: r.clienteNome, pessoas: [] });
      }
      mapa.get(chave)!.pessoas.push(r);
    }
    for (const e of mapa.values()) {
      e.pessoas.sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
    }
    return [...mapa.values()].sort((a, b) => {
      if (a.codCliente === null) return -1;
      if (b.codCliente === null) return 1;
      return a.codCliente.localeCompare(b.codCliente);
    });
  }, [rows]);

  const opcoesCliente = useMemo(
    () => [
      { value: "", label: "Padrão, todos os contratos" },
      ...clientes.map((c) => ({
        value: c.codCliente,
        label: `${c.codCliente}${c.nomeOperacao ? `, ${c.nomeOperacao}` : ""}`,
      })),
    ],
    [clientes],
  );

  const temPadrao = escopos.some((e) => e.codCliente === null);

  function abrirNovo() {
    setAberto({ novo: true });
    setCodClienteEdit("");
    setPessoas([novaPessoa(1)]);
    setError(null);
    setFlash(null);
  }

  function abrirEdicao(e: Escopo) {
    setAberto({ novo: false });
    setCodClienteEdit(e.codCliente ?? "");
    setPessoas(
      e.pessoas.map((p) => {
        seq += 1;
        return {
          chave: `p${seq}`,
          id: p.id,
          nome: p.nome,
          email: p.email,
          cpf: "",
          cpfMascarado: p.cpfMascarado,
          ordem: p.ordem,
        };
      }),
    );
    setError(null);
    setFlash(null);
  }

  function alterar(chave: string, campo: keyof PessoaEdit, valor: string | number) {
    setPessoas((ps) => ps.map((p) => (p.chave === chave ? { ...p, [campo]: valor } : p)));
  }

  /** Posições distintas em uso, para o editor desenhar um bloco por posição, na ordem. */
  const posicoes = useMemo(
    () => [...new Set(pessoas.map((p) => p.ordem))].sort((a, b) => a - b),
    [pessoas],
  );

  const salvar = useCallback(async () => {
    if (!aberto || !token) return;
    setSaving(true);
    setError(null);
    try {
      const itens = pessoas.map((p) => ({
        id: p.id,
        nome: p.nome.trim(),
        email: p.email.trim(),
        cpf: p.cpf.replace(/\D/g, ""),
        ordem: p.ordem,
      }));
      await apiFetch("/admin/assinante-empresa/conjunto", {
        method: "PUT",
        token,
        body: { codCliente: codClienteEdit.trim() || undefined, itens },
      });
      setFlash(
        codClienteEdit.trim()
          ? `Conjunto do cliente ${codClienteEdit.trim()} salvo com ${itens.length} pessoa(s).`
          : `Conjunto padrão salvo com ${itens.length} pessoa(s).`,
      );
      setAberto(null);
      await carregar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao salvar o grupo.");
    } finally {
      setSaving(false);
    }
  }, [aberto, token, pessoas, codClienteEdit, carregar]);

  const removerEscopo = useCallback(async () => {
    if (!alvoRemover || !token) return;
    setSaving(true);
    try {
      await apiFetch("/admin/assinante-empresa/conjunto", {
        method: "PUT",
        token,
        body: { codCliente: alvoRemover.codCliente ?? undefined, itens: [] },
      });
      setFlash(
        alvoRemover.codCliente
          ? `Grupo do cliente ${alvoRemover.codCliente} removido. Ele volta a usar o padrão.`
          : "Grupo padrão removido.",
      );
      setAlvoRemover(null);
      await carregar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao remover o grupo.");
      setAlvoRemover(null);
    } finally {
      setSaving(false);
    }
  }, [alvoRemover, token, carregar]);

  return (
    <>
      <PageHead
        eyebrow="Assinatura de contrato"
        title="Assinante Da Empresa"
        subtitle="Quem assina o contrato pela empresa. Um grupo padrão e grupos próprios por cliente."
      />

      {!loading && !temPadrao && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          Nenhum grupo padrão cadastrado. Enquanto não houver, cliente sem grupo próprio não dispara
          envelope nenhum.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button onClick={abrirNovo} className="px-4 py-2.5">
          <Icon name="plus" className="h-4 w-4" />
          Adicionar Grupo De Assinatura
        </Button>
        <span className="text-[12.5px] text-dim">
          Cada grupo é um cliente (ou o padrão) com todas as pessoas que assinam por ele.
        </span>
      </div>

      {flash && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-ok">
          {flash}
        </p>
      )}
      {error && !aberto && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          <table className="ds-table min-w-[900px]">
            <thead>
              <tr>
                <th className="w-[22%]">Aplica-se A</th>
                <th className="w-[10%]">Pessoas</th>
                <th className="w-[50%]">Ordem De Assinatura</th>
                <th className="w-[18%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : escopos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-faint">
                    Nenhum grupo de assinatura cadastrado.
                  </td>
                </tr>
              ) : (
                escopos.map((e) => (
                  <tr key={e.codCliente ?? "padrao"}>
                    <td>
                      {e.codCliente === null ? (
                        <StatusPill tone="ok" label="Padrão" />
                      ) : (
                        <span>
                          {e.codCliente}
                          {e.clienteNome ? `, ${e.clienteNome}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="text-center font-semibold">{e.pessoas.length}</td>
                    <td className="text-[12.5px] text-dim">{resumo(e.pessoas)}</td>
                    <td>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          title="Editar o grupo de assinatura"
                          aria-label="Editar o grupo de assinatura"
                          onClick={() => abrirEdicao(e)}
                          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                        >
                          <Icon name="pen" className="h-[17px] w-[17px]" />
                        </button>
                        <button
                          type="button"
                          title="Remover o grupo inteiro"
                          aria-label="Remover o grupo inteiro"
                          onClick={() => setAlvoRemover(e)}
                          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-danger"
                        >
                          <Icon name="trash" className="h-[17px] w-[17px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* EDITOR: todas as pessoas do escopo de uma vez, agrupadas por POSIÇÃO. */}
      {aberto && (
        <Modal onClose={() => setAberto(null)} className="max-w-3xl" ariaLabel="Grupo de assinatura">
          <h3>{aberto.novo ? "Novo Grupo De Assinatura" : "Editar Grupo De Assinatura"}</h3>
          <p className="psub mt-1">
            Pessoas na MESMA posição assinam juntas. A posição seguinte só assina depois da anterior.
          </p>

          <label className="mt-4 block text-[12.5px] text-dim">
            Aplica-se a
            <Select
              className="mt-1"
              value={codClienteEdit}
              onChange={setCodClienteEdit}
              searchable
              disabled={!aberto.novo}
              ariaLabel="Cliente do grupo"
              placeholder="Padrão, todos os contratos"
              options={opcoesCliente}
            />
            {!aberto.novo && (
              <span className="mt-1 block text-[11.5px] text-faint">
                O cliente não muda na edição. Para mover, remova este grupo e crie outro.
              </span>
            )}
          </label>

          <div className="mt-5 space-y-4">
            {posicoes.map((pos, idx) => {
              const doGrupo = pessoas.filter((p) => p.ordem === pos);
              return (
                <div
                  key={pos}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold text-text">
                      Posição {pos}
                      {doGrupo.length > 1 && (
                        <span className="ml-2 font-normal text-ok">
                          assinam juntos ({doGrupo.length} pessoas)
                        </span>
                      )}
                      {idx > 0 && (
                        <span className="ml-2 font-normal text-faint">
                          só depois da posição {posicoes[idx - 1]}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPessoas((ps) => [...ps, novaPessoa(pos)])}
                      className="text-[12px] font-semibold text-accent transition hover:underline"
                    >
                      Adicionar pessoa nesta posição
                    </button>
                  </div>

                  {doGrupo.map((p) => (
                    <div
                      key={p.chave}
                      className="mb-2 grid gap-2 md:grid-cols-[1.3fr_1.5fr_1fr_auto]"
                    >
                      <input
                        value={p.nome}
                        onChange={(e) => alterar(p.chave, "nome", e.target.value)}
                        className="ds-input"
                        placeholder="Nome e sobrenome"
                        aria-label="Nome do representante"
                      />
                      <input
                        type="email"
                        value={p.email}
                        onChange={(e) => alterar(p.chave, "email", e.target.value)}
                        className="ds-input"
                        placeholder="email@soulan.com.br"
                        aria-label="E-mail do representante"
                      />
                      <input
                        value={p.cpf}
                        onChange={(e) => alterar(p.chave, "cpf", mascaraCpf(e.target.value))}
                        className="ds-input"
                        placeholder={p.cpfMascarado ?? "000.000.000-00"}
                        inputMode="numeric"
                        aria-label="CPF do representante"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          value={String(p.ordem)}
                          onChange={(e) =>
                            alterar(p.chave, "ordem", Number(e.target.value.replace(/\D/g, "")) || 1)
                          }
                          className="ds-input w-14 text-center"
                          inputMode="numeric"
                          aria-label="Posição de assinatura"
                          title="Posição: quem está na mesma assina junto"
                        />
                        <button
                          type="button"
                          onClick={() => setPessoas((ps) => ps.filter((x) => x.chave !== p.chave))}
                          title="Remover esta pessoa do grupo"
                          aria-label="Remover esta pessoa do grupo"
                          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-danger"
                        >
                          <Icon name="trash" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              setPessoas((ps) => [...ps, novaPessoa(Math.max(0, ...ps.map((p) => p.ordem)) + 1)])
            }
            className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-accent transition hover:underline"
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            Adicionar pessoa em nova posição
          </button>

          <p className="mt-4 text-[11.5px] text-faint">
            O CPF é obrigatório. Ao editar alguém já gravado, deixe o CPF em branco para manter o
            atual.
          </p>

          {error && (
            <p className="mt-3 text-[12.5px] text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAberto(null)} className="px-4 py-2.5">
              Cancelar
            </Button>
            <Button
              onClick={() => void salvar()}
              disabled={saving || pessoas.length === 0}
              className="px-4 py-2.5"
            >
              {saving ? "Salvando…" : "Salvar grupo"}
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(alvoRemover)}
        tone="danger"
        title="Remover O Grupo?"
        message={
          alvoRemover?.codCliente
            ? "Todas as pessoas deste cliente saem, e ele volta a usar o grupo padrão."
            : "Sem grupo padrão, cliente que não tenha o seu não dispara envelope nenhum."
        }
        confirmLabel="Remover grupo"
        cancelLabel="Voltar"
        busy={saving}
        onConfirm={() => void removerEscopo()}
        onCancel={() => setAlvoRemover(null)}
      />
    </>
  );
}
