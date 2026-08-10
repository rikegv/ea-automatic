"use client";

/**
 * ALTO VOLUME (onda 1): cadastro dos projetos sazonais, seus grupos de entrada e as vagas por cargo.
 *
 * O CASO REAL: um cliente abre uma operação de tiro curto, 30 dias, com muitas vagas por cargo
 * (Atendente 20, Caixa 15), em levas que entram em datas diferentes. Esta tela é o CADASTRO dessa
 * estrutura. Ela não mede preenchimento e não conta admissão: a ligação admissão -> projeto nasce na
 * Liberação (onda 2) e a análise (cilindros, termômetro, alerta por grupo) vem na onda 4.
 *
 * CADASTRO ANINHADO EM TRÊS NÍVEIS, e o aninhamento é a razão da tela existir. O projeto é criado
 * primeiro, com o que se sabe no dia zero (cliente, nome, período); grupos e vagas entram depois,
 * conforme o projeto anda, pelo painel que abre em "gerir". Nada aqui obriga a cadastrar tudo de uma
 * vez, que é o requisito do diretor.
 *
 * §A.12 / §A.20: máscara única de tabela (`ds-table` já entrega cabeçalho centralizado e divisória
 * entre colunas), larguras que aproveitam o espaço, rolagem horizontal em vez de coluna espremida.
 * §A.24: título e tag em title case; botão é AÇÃO e segue escrita normal. §A.11: sem travessão.
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { Pill } from "@/components/ui/Pill";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { Icon } from "@/components/ui/Icon";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface Projeto {
  id: string;
  codCliente: string;
  clienteRazaoSocial: string;
  clienteNomeOperacao: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  ativo: boolean;
  /** Resumo do CADASTRO (o que já foi cadastrado), não do preenchimento (que é da onda 4). */
  grupos: number;
  cargos: number;
  vagas: number;
}

interface Grupo {
  id: string;
  rotulo: string;
  dataEntrada: string;
}

interface Vaga {
  id: string;
  cargoId: string;
  cargoNome: string;
  /** Nulo = cota do projeto inteiro; preenchido = cota daquele grupo de entrada. */
  grupoId: string | null;
  quantidade: number;
}

interface Detalhe {
  id: string;
  nome: string;
  codCliente: string;
  grupos: Grupo[];
  vagas: Vaga[];
}

interface Cliente {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
}

interface Cargo {
  id: string;
  nome: string;
}

type Filtro = "ativos" | "inativos" | "todos";

/** Data ISO (AAAA-MM-DD) para o formato do time. Vazia vira "não informado" (§A.11). */
function fmtData(iso?: string | null): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Rótulo do cliente: "código · nome operacional", a mesma leitura da Liberação e do wizard. O código
 * vem na frente porque é por ele que o time reconhece o cliente (decisão do diretor). Sem nome
 * operacional, cai para a razão social.
 *
 * Recebe os três campos SOLTOS de propósito: o catálogo devolve `nomeOperacao`/`razaoSocial` e a
 * lista de projetos devolve os mesmos dados com prefixo (`clienteNomeOperacao`). Um parâmetro de
 * objeto obrigaria a adaptar um dos dois lados só para agradar o tipo.
 */
function rotuloCliente(
  codCliente: string,
  nomeOperacao: string | null,
  razaoSocial: string,
): string {
  return `${codCliente} · ${nomeOperacao ?? razaoSocial}`;
}

export default function AltoVolumePage() {
  const { token } = useAuth();

  const [rows, setRows] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Formulário do PROJETO (o mesmo serve para criar e para editar, padrão dos demais cadastros).
  const [codCliente, setCodCliente] = useState("");
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [busca, setBusca] = useState("");

  const [confirmar, setConfirmar] = useState<Projeto | null>(null);
  const [inativando, setInativando] = useState(false);

  // PAINEL ANINHADO: o projeto aberto e o seu conteúdo (grupos + vagas).
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [erroDetalhe, setErroDetalhe] = useState<string | null>(null);

  // Formulário do GRUPO de entrada.
  const [grupoRotulo, setGrupoRotulo] = useState("");
  const [grupoData, setGrupoData] = useState("");
  const [grupoEditando, setGrupoEditando] = useState<string | null>(null);
  const [salvandoGrupo, setSalvandoGrupo] = useState(false);
  const [confirmarGrupo, setConfirmarGrupo] = useState<Grupo | null>(null);

  // Formulário da VAGA por cargo.
  const [vagaCargoId, setVagaCargoId] = useState("");
  const [vagaGrupoId, setVagaGrupoId] = useState("");
  const [vagaQtd, setVagaQtd] = useState("");
  const [salvandoVaga, setSalvandoVaga] = useState(false);
  const [confirmarVaga, setConfirmarVaga] = useState<Vaga | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch<Projeto[]>("/admin/alto-volume", { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Catálogos de cliente e cargo: leitura aberta, as mesmas rotas do wizard e da Liberação.
  const loadCatalogos = useCallback(async () => {
    try {
      const [cs, cgs] = await Promise.all([
        apiFetch<Cliente[]>("/catalogos/clientes", { token }),
        apiFetch<Cargo[]>("/catalogos/cargos", { token }),
      ]);
      setClientes(cs);
      setCargos(cgs);
    } catch {
      /* Catálogo indisponível não derruba a tela: a lista de projetos continua legível. */
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      void load();
      void loadCatalogos();
    }
  }, [token, load, loadCatalogos]);

  const carregarDetalhe = useCallback(
    async (id: string) => {
      setCarregandoDetalhe(true);
      setErroDetalhe(null);
      try {
        setDetalhe(await apiFetch<Detalhe>(`/admin/alto-volume/${encodeURIComponent(id)}`, { token }));
      } catch (e) {
        setErroDetalhe(e instanceof Error ? e.message : "Erro ao carregar o projeto");
      } finally {
        setCarregandoDetalhe(false);
      }
    },
    [token],
  );

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter((p) => {
      if (filtro === "ativos" && !p.ativo) return false;
      if (filtro === "inativos" && p.ativo) return false;
      if (q) {
        const alvo =
          `${p.nome} ${p.codCliente} ${p.clienteNomeOperacao ?? ""} ${p.clienteRazaoSocial}`.toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filtro, busca]);

  // Ordenação clicável (§A.12). Status por RANK (ativo primeiro), datas por texto ISO (que já
  // ordena cronologicamente sem converter nada).
  const colunas = useMemo<ColOrd<Projeto>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (p) => p.nome },
      {
        chave: "cliente",
        tipo: "texto",
        valor: (p) => rotuloCliente(p.codCliente, p.clienteNomeOperacao, p.clienteRazaoSocial),
      },
      { chave: "inicio", tipo: "texto", valor: (p) => p.dataInicio },
      { chave: "vagas", tipo: "numero", valor: (p) => p.vagas },
      { chave: "status", tipo: "status", valor: (p) => (p.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, visiveis);

  const nAtivos = useMemo(() => rows.filter((p) => p.ativo).length, [rows]);
  const nInativos = rows.length - nAtivos;

  function limparFormulario() {
    setEditando(null);
    setCodCliente("");
    setNome("");
    setDataInicio("");
    setDataFim("");
  }

  function iniciarEdicao(p: Projeto) {
    setEditando(p.id);
    setCodCliente(p.codCliente);
    setNome(p.nome);
    setDataInicio(p.dataInicio.slice(0, 10));
    setDataFim(p.dataFim.slice(0, 10));
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function salvarProjeto(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editando) {
        // O CLIENTE não vai no corpo da edição de propósito: trocar o cliente de um projeto
        // transformaria as vagas de um cliente nas vagas de outro (ver o DTO no backend).
        await apiFetch(`/admin/alto-volume/${encodeURIComponent(editando)}`, {
          method: "PATCH",
          token,
          body: { nome, dataInicio, dataFim },
        });
      } else {
        await apiFetch("/admin/alto-volume", {
          method: "POST",
          token,
          body: { codCliente, nome, dataInicio, dataFim },
        });
      }
      limparFormulario();
      await load();
      if (abertoId) await carregarDetalhe(abertoId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function confirmarInativacao() {
    const p = confirmar;
    if (!p) return;
    setInativando(true);
    setError(null);
    try {
      await apiFetch(`/admin/alto-volume/${encodeURIComponent(p.id)}`, { method: "DELETE", token });
      if (editando === p.id) limparFormulario();
      setConfirmar(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao inativar");
    } finally {
      setInativando(false);
    }
  }

  async function reativar(p: Projeto) {
    try {
      await apiFetch(`/admin/alto-volume/${encodeURIComponent(p.id)}/reativar`, {
        method: "PATCH",
        token,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao reativar");
    }
  }

  /** Abre e fecha o painel aninhado do projeto. Abrir outro troca o conteúdo, sem empilhar painel. */
  async function alternarPainel(p: Projeto) {
    if (abertoId === p.id) {
      setAbertoId(null);
      setDetalhe(null);
      return;
    }
    setAbertoId(p.id);
    setDetalhe(null);
    limparFormularioGrupo();
    limparFormularioVaga();
    await carregarDetalhe(p.id);
  }

  // ── Grupos de entrada ─────────────────────────────────────────────────────

  function limparFormularioGrupo() {
    setGrupoEditando(null);
    setGrupoRotulo("");
    setGrupoData("");
  }

  function iniciarEdicaoGrupo(g: Grupo) {
    setGrupoEditando(g.id);
    setGrupoRotulo(g.rotulo);
    setGrupoData(g.dataEntrada.slice(0, 10));
    setErroDetalhe(null);
  }

  async function salvarGrupo(e: FormEvent) {
    e.preventDefault();
    if (!abertoId) return;
    setSalvandoGrupo(true);
    setErroDetalhe(null);
    try {
      if (grupoEditando) {
        await apiFetch(`/admin/alto-volume/grupos/${encodeURIComponent(grupoEditando)}`, {
          method: "PATCH",
          token,
          body: { rotulo: grupoRotulo, dataEntrada: grupoData },
        });
      } else {
        await apiFetch(`/admin/alto-volume/${encodeURIComponent(abertoId)}/grupos`, {
          method: "POST",
          token,
          body: { rotulo: grupoRotulo, dataEntrada: grupoData },
        });
      }
      limparFormularioGrupo();
      await carregarDetalhe(abertoId);
      await load();
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : "Erro ao salvar o grupo");
    } finally {
      setSalvandoGrupo(false);
    }
  }

  async function removerGrupo() {
    const g = confirmarGrupo;
    if (!g || !abertoId) return;
    setSalvandoGrupo(true);
    setErroDetalhe(null);
    try {
      await apiFetch(`/admin/alto-volume/grupos/${encodeURIComponent(g.id)}`, {
        method: "DELETE",
        token,
      });
      if (grupoEditando === g.id) limparFormularioGrupo();
      setConfirmarGrupo(null);
      await carregarDetalhe(abertoId);
      await load();
    } catch (e) {
      setConfirmarGrupo(null);
      setErroDetalhe(e instanceof Error ? e.message : "Erro ao remover o grupo");
    } finally {
      setSalvandoGrupo(false);
    }
  }

  // ── Vagas por cargo ───────────────────────────────────────────────────────

  function limparFormularioVaga() {
    setVagaCargoId("");
    setVagaGrupoId("");
    setVagaQtd("");
  }

  async function criarVaga(e: FormEvent) {
    e.preventDefault();
    if (!abertoId) return;
    setSalvandoVaga(true);
    setErroDetalhe(null);
    try {
      await apiFetch(`/admin/alto-volume/${encodeURIComponent(abertoId)}/vagas`, {
        method: "POST",
        token,
        body: {
          cargoId: vagaCargoId,
          // Vazio = cota do projeto inteiro. O backend guarda nulo, que é o modo padrão.
          grupoId: vagaGrupoId || undefined,
          quantidade: Number(vagaQtd),
        },
      });
      limparFormularioVaga();
      await carregarDetalhe(abertoId);
      await load();
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : "Erro ao salvar as vagas");
    } finally {
      setSalvandoVaga(false);
    }
  }

  /** Edição em linha da quantidade: sai do campo com valor novo e válido, salva. */
  async function salvarQuantidade(v: Vaga, valor: string) {
    const n = Number(valor);
    if (!Number.isInteger(n) || n < 1 || n === v.quantidade) return;
    if (!abertoId) return;
    setErroDetalhe(null);
    try {
      await apiFetch(`/admin/alto-volume/vagas/${encodeURIComponent(v.id)}`, {
        method: "PATCH",
        token,
        body: { quantidade: n },
      });
      await carregarDetalhe(abertoId);
      await load();
    } catch (e) {
      setErroDetalhe(e instanceof Error ? e.message : "Erro ao salvar a quantidade");
    }
  }

  async function removerVaga() {
    const v = confirmarVaga;
    if (!v || !abertoId) return;
    setSalvandoVaga(true);
    setErroDetalhe(null);
    try {
      await apiFetch(`/admin/alto-volume/vagas/${encodeURIComponent(v.id)}`, {
        method: "DELETE",
        token,
      });
      setConfirmarVaga(null);
      await carregarDetalhe(abertoId);
      await load();
    } catch (e) {
      setConfirmarVaga(null);
      setErroDetalhe(e instanceof Error ? e.message : "Erro ao remover as vagas");
    } finally {
      setSalvandoVaga(false);
    }
  }

  const podeSalvarProjeto = Boolean(
    (editando || codCliente) && nome.trim() && dataInicio && dataFim,
  );
  const rotuloGrupo = (id: string | null) =>
    detalhe?.grupos.find((g) => g.id === id)?.rotulo ?? "Projeto Inteiro";
  const totalVagas = detalhe?.vagas.reduce((s, v) => s + v.quantidade, 0) ?? 0;

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Alto Volume"
        subtitle="Projetos sazonais de tiro curto: um cliente, um período e as vagas por cargo. Grupos de entrada e vagas podem ser acrescentados conforme o projeto anda."
      />

      {/* Formulário do projeto: o mesmo cria e edita, padrão dos demais cadastros. */}
      <GlassCard as="form" onSubmit={salvarProjeto} className="mb-5 flex flex-wrap gap-3 p-4">
        {editando && (
          <p className="w-full text-sm text-accent">
            Editando um projeto, ajuste os campos e salve. O cliente não muda: projeto no cliente
            errado se inativa e se cria de novo.
          </p>
        )}
        <div className="min-w-[260px] flex-1">
          <Select
            value={codCliente}
            onChange={setCodCliente}
            placeholder="Cliente *"
            ariaLabel="Cliente do projeto"
            searchable
            menuFit
            disabled={Boolean(editando)}
            options={clientes.map((c) => ({
              value: c.codCliente,
              label: rotuloCliente(c.codCliente, c.nomeOperacao, c.razaoSocial),
            }))}
          />
        </div>
        <input
          required
          placeholder={editando ? "Nome do projeto *" : "Novo projeto *"}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="ds-input min-w-[220px] flex-1"
        />
        <label className="flex items-center gap-2 text-sm text-dim">
          <span className="whitespace-nowrap">Início</span>
          <input
            required
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="ds-input w-[170px]"
            aria-label="Início do projeto"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-dim">
          <span className="whitespace-nowrap">Fim</span>
          <input
            required
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="ds-input w-[170px]"
            aria-label="Fim do projeto"
          />
        </label>
        <Button type="submit" disabled={saving || !podeSalvarProjeto} className="shrink-0 py-2.5">
          {saving ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar"}
        </Button>
        {editando && (
          <Button
            type="button"
            variant="secondary"
            onClick={limparFormulario}
            disabled={saving}
            className="shrink-0 py-2.5"
          >
            Cancelar
          </Button>
        )}
      </GlassCard>

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
            {f === "ativos" ? ` (${nAtivos})` : f === "inativos" ? ` (${nInativos})` : ` (${rows.length})`}
          </button>
        ))}
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar projeto ou cliente"
          aria-label="Buscar projeto ou cliente"
          className="ds-input h-auto w-auto min-w-[18rem] py-1.5"
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
          {/* §A.20: larguras que aproveitam o espaço. As colunas de contagem são estreitas e
              centralizadas; nome do projeto e cliente ficam com o que sobra, e a tabela ROLA na
              horizontal em vez de espremer qualquer uma delas. */}
          <table className="ds-table min-w-[1080px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="nome">
                  Projeto
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="inicio" className="w-[210px]">
                  Período
                </ColunaOrdenavel>
                <th className="w-[90px]">Grupos</th>
                <th className="w-[90px]">Cargos</th>
                <ColunaOrdenavel as="th" ord={ord} chave="vagas" className="w-[90px]">
                  Vagas
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[120px]">
                  Status
                </ColunaOrdenavel>
                <th className="w-[250px]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Nenhum projeto neste filtro.
                  </td>
                </tr>
              ) : (
                ord.itens.map((p) => (
                  <tr
                    key={p.id}
                    className={`${p.ativo ? "" : "opacity-60"} ${
                      abertoId === p.id ? "bg-[var(--surface)]" : ""
                    }`}
                  >
                    <td className="font-semibold">{p.nome}</td>
                    <td>{rotuloCliente(p.codCliente, p.clienteNomeOperacao, p.clienteRazaoSocial)}</td>
                    <td className="whitespace-nowrap text-center tabular-nums">
                      {fmtData(p.dataInicio)} a {fmtData(p.dataFim)}
                    </td>
                    <td className="text-center tabular-nums">{p.grupos}</td>
                    <td className="text-center tabular-nums">{p.cargos}</td>
                    <td className="text-center font-semibold tabular-nums">{p.vagas}</td>
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
                        onClick={() => void alternarPainel(p)}
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        <Icon
                          name={abertoId === p.id ? "left" : "right"}
                          className="h-3.5 w-3.5"
                        />
                        {abertoId === p.id ? "fechar" : "grupos e vagas"}
                      </button>
                      <span className="px-2 text-faint">·</span>
                      <button onClick={() => iniciarEdicao(p)} className="text-accent hover:underline">
                        editar
                      </button>
                      <span className="px-2 text-faint">·</span>
                      {p.ativo ? (
                        <button
                          onClick={() => setConfirmar(p)}
                          className="text-danger hover:underline"
                        >
                          inativar
                        </button>
                      ) : (
                        <button onClick={() => void reativar(p)} className="text-accent hover:underline">
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

      {/* PAINEL ANINHADO do projeto aberto: grupos de entrada e vagas por cargo. Fica ABAIXO da
          lista, e não num modal, porque o cadastro é incremental: o time volta várias vezes ao
          mesmo projeto e precisa continuar vendo onde está. */}
      {abertoId && (
        <GlassCard className="mt-5 p-4">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold text-text">
              {detalhe ? detalhe.nome : "Carregando…"}
            </h2>
            <span className="text-sm text-dim">
              Grupos De Entrada E Vagas Por Cargo
            </span>
            <button
              type="button"
              onClick={() => {
                setAbertoId(null);
                setDetalhe(null);
              }}
              className="ml-auto text-sm text-dim hover:text-text"
            >
              fechar painel
            </button>
          </div>

          {erroDetalhe && (
            <p
              className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erroDetalhe}
            </p>
          )}

          {carregandoDetalhe && !detalhe ? (
            <p className="py-6 text-center text-faint">Carregando o projeto…</p>
          ) : detalhe ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* ── GRUPOS DE ENTRADA ─────────────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Grupos De Entrada
                </h3>
                <form onSubmit={salvarGrupo} className="mb-3 flex flex-wrap gap-2">
                  <input
                    required
                    placeholder="Rótulo do grupo *"
                    value={grupoRotulo}
                    onChange={(e) => setGrupoRotulo(e.target.value)}
                    className="ds-input min-w-[160px] flex-1"
                    aria-label="Rótulo do grupo"
                  />
                  <input
                    required
                    type="date"
                    value={grupoData}
                    onChange={(e) => setGrupoData(e.target.value)}
                    className="ds-input w-[170px]"
                    aria-label="Data de entrada do grupo"
                  />
                  <Button type="submit" disabled={salvandoGrupo} className="shrink-0 py-2">
                    {grupoEditando ? "Salvar" : "Adicionar"}
                  </Button>
                  {grupoEditando && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={limparFormularioGrupo}
                      disabled={salvandoGrupo}
                      className="shrink-0 py-2"
                    >
                      Cancelar
                    </Button>
                  )}
                </form>

                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="ds-table min-w-[420px]">
                    <thead>
                      <tr>
                        <th>Grupo</th>
                        <th className="w-[150px]">Entrada</th>
                        <th className="w-[150px]">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.grupos.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-faint">
                            Sem grupo cadastrado. As vagas ficam na cota do projeto inteiro.
                          </td>
                        </tr>
                      ) : (
                        detalhe.grupos.map((g) => (
                          <tr key={g.id}>
                            <td className="font-semibold">{g.rotulo}</td>
                            <td className="text-center tabular-nums">{fmtData(g.dataEntrada)}</td>
                            <td className="whitespace-nowrap text-right">
                              <button
                                onClick={() => iniciarEdicaoGrupo(g)}
                                className="text-accent hover:underline"
                              >
                                editar
                              </button>
                              <span className="px-2 text-faint">·</span>
                              <button
                                onClick={() => setConfirmarGrupo(g)}
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
              </section>

              {/* ── VAGAS POR CARGO ───────────────────────────────────────── */}
              <section>
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Vagas Por Cargo
                  <span className="normal-case text-dim">
                    total: <span className="font-semibold tabular-nums text-text">{totalVagas}</span>
                  </span>
                </h3>
                <form onSubmit={criarVaga} className="mb-3 flex flex-wrap gap-2">
                  <div className="min-w-[170px] flex-1">
                    <Select
                      value={vagaCargoId}
                      onChange={setVagaCargoId}
                      placeholder="Cargo *"
                      ariaLabel="Cargo das vagas"
                      searchable
                      menuFit
                      options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
                    />
                  </div>
                  <div className="min-w-[170px] flex-1">
                    {/* Vazio = cota do PROJETO INTEIRO, que é o modo padrão. Escolher um grupo
                        transforma a linha na cota daquela leva. */}
                    <Select
                      value={vagaGrupoId}
                      onChange={setVagaGrupoId}
                      placeholder="Projeto Inteiro"
                      ariaLabel="Grupo de entrada das vagas"
                      menuFit
                      options={[
                        { value: "", label: "Projeto Inteiro" },
                        ...detalhe.grupos.map((g) => ({ value: g.id, label: g.rotulo })),
                      ]}
                    />
                  </div>
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Vagas *"
                    value={vagaQtd}
                    onChange={(e) => setVagaQtd(e.target.value)}
                    className="ds-input w-[110px]"
                    aria-label="Quantidade de vagas"
                  />
                  <Button
                    type="submit"
                    disabled={salvandoVaga || !vagaCargoId || !vagaQtd}
                    className="shrink-0 py-2"
                  >
                    Adicionar
                  </Button>
                </form>

                <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="ds-table min-w-[460px]">
                    <thead>
                      <tr>
                        <th>Cargo</th>
                        <th className="w-[150px]">Cota</th>
                        <th className="w-[110px]">Vagas</th>
                        <th className="w-[110px]">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.vagas.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-faint">
                            Sem vaga cadastrada. Acrescente os cargos e a quantidade de cada um.
                          </td>
                        </tr>
                      ) : (
                        detalhe.vagas.map((v) => (
                          <tr key={v.id}>
                            <td className="font-semibold">{v.cargoNome}</td>
                            <td className="text-center">
                              {/* COTA é CLASSIFICAÇÃO, não status, então usa a `Pill` neutra e NÃO a
                                  `StatusPill`. O ícone dinâmico da §A.12 existe para dizer se algo
                                  está ok, pendente ou recusado; pendurar um triângulo de alerta em
                                  "Grupo 1" faria a tela gritar problema onde só há categoria. */}
                              <span className="inline-flex justify-center">
                                <Pill tone={v.grupoId ? "in" : "nt"}>{rotuloGrupo(v.grupoId)}</Pill>
                              </span>
                            </td>
                            <td className="text-center">
                              {/* Edição EM LINHA da quantidade: é o campo que mais muda enquanto o
                                  projeto anda, e mandar o time abrir um formulário para trocar de 20
                                  para 15 seria atrito puro. */}
                              <input
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={v.quantidade}
                                onBlur={(e) => void salvarQuantidade(v, e.target.value)}
                                className="ds-input w-[80px] py-1 text-center tabular-nums"
                                aria-label={`Vagas de ${v.cargoNome}`}
                              />
                            </td>
                            <td className="whitespace-nowrap text-right">
                              <button
                                onClick={() => setConfirmarVaga(v)}
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
              </section>
            </div>
          ) : null}
        </GlassCard>
      )}

      <ConfirmDialog
        open={Boolean(confirmar)}
        title="Inativar Projeto"
        message={
          confirmar
            ? `Inativar o projeto "${confirmar.nome}"? Ele sai das opções selecionáveis, mas não é excluído: grupos, vagas e os vínculos já feitos continuam intactos e você pode reativar quando quiser.`
            : ""
        }
        confirmLabel="Inativar"
        tone="danger"
        busy={inativando}
        onConfirm={confirmarInativacao}
        onCancel={() => setConfirmar(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmarGrupo)}
        title="Remover Grupo De Entrada"
        message={
          confirmarGrupo
            ? `Remover o grupo "${confirmarGrupo.rotulo}"? As vagas cadastradas na cota deste grupo saem junto. Grupo com admissão já vinculada não é removido.`
            : ""
        }
        confirmLabel="Remover"
        tone="danger"
        busy={salvandoGrupo}
        onConfirm={removerGrupo}
        onCancel={() => setConfirmarGrupo(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmarVaga)}
        title="Remover Vagas Do Cargo"
        message={
          confirmarVaga
            ? `Remover as ${confirmarVaga.quantidade} vagas de "${confirmarVaga.cargoNome}"? Isto apaga a meta do cargo, não desliga ninguém do projeto.`
            : ""
        }
        confirmLabel="Remover"
        tone="danger"
        busy={salvandoVaga}
        onConfirm={removerVaga}
        onCancel={() => setConfirmarVaga(null)}
      />
    </>
  );
}
