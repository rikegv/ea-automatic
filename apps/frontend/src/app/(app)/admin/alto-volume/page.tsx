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
import { Modal } from "@/components/ui/Modal";
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

/**
 * VÍNCULO já feito (onda 3): quem conta neste projeto, e a trilha de como o vínculo nasceu.
 * `origem` é o que diz se veio do flag da Liberação ou de conserto posterior.
 */
interface Vinculo {
  id: string;
  admissaoId: string;
  candidatoNome: string;
  /** Cliente da admissão, sempre exibido com o código na frente (design system). */
  codCliente: string | null;
  clienteRazaoSocial: string | null;
  clienteNomeOperacao: string | null;
  cargoNome: string | null;
  dataAdmissao: string | null;
  grupoId: string | null;
  /**
   * Campos que a API CONTINUA devolvendo e a tela NÃO mostra mais (decisão do diretor: farol,
   * origem e trilha do vínculo são bastidor). Ficam declarados porque o dado existe e é auditável;
   * quem precisar deles lê o banco ou a rota, não esta tabela.
   */
  farolGlobal: string;
  grupoRotulo: string | null;
  origem: "LIBERACAO" | "CORRECAO";
  vinculadoEm: string;
  vinculadoPorNome: string | null;
}

/** ADMISSÃO SEM PROJETO: do cliente do projeto, dentro do período dele, e sem vínculo nenhum. */
interface Orfao {
  admissaoId: string;
  candidatoNome: string;
  codCliente: string | null;
  clienteRazaoSocial: string | null;
  clienteNomeOperacao: string | null;
  cargoNome: string | null;
  dataAdmissao: string | null;
  farolGlobal: string;
  tipoContrato: string | null;
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

/**
 * O mesmo rótulo para as linhas de admissão, onde os três campos podem vir nulos: a admissão de
 * pré-liberação nasce sem cliente. Sem cliente, "não informado" (§A.11), nunca um código solto.
 */
function rotuloClienteDaLinha(linha: {
  codCliente: string | null;
  clienteNomeOperacao: string | null;
  clienteRazaoSocial: string | null;
}): string {
  if (!linha.codCliente) return "não informado";
  return rotuloCliente(
    linha.codCliente,
    linha.clienteNomeOperacao,
    linha.clienteRazaoSocial ?? linha.codCliente,
  );
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
  /**
   * Grupos de entrada são OPCIONAIS e a maioria dos projetos não usa. A seção some quando o projeto
   * não tem nenhum, e este estado é a porta de volta: sem ele, o primeiro grupo nunca poderia ser
   * cadastrado, porque o formulário mora dentro da seção escondida.
   */
  const [usarGrupos, setUsarGrupos] = useState(false);
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

  // VÍNCULOS (onda 3): quem já está no projeto e as admissões do período que ficaram sem projeto.
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [orfaos, setOrfaos] = useState<Orfao[]>([]);
  const [carregandoElos, setCarregandoElos] = useState(false);
  const [erroElos, setErroElos] = useState<string | null>(null);
  /** Grupo aplicado ao adicionar. Fica FORA da linha: escolhe-se uma vez e adiciona vários. */
  const [grupoParaVincular, setGrupoParaVincular] = useState("");
  const [agindoEm, setAgindoEm] = useState<string | null>(null);
  const [confirmarDesvinculo, setConfirmarDesvinculo] = useState<Vinculo | null>(null);
  /** Seleção múltipla da lista "Admissões Sem Projeto" (adicionar em lote). */
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [adicionandoLote, setAdicionandoLote] = useState(false);
  /** Filtro por cliente da lista "Admissões Sem Projeto". Vazio = todos. */
  const [filtroClienteOrfaos, setFiltroClienteOrfaos] = useState("");

  // Modal da TROCA de projeto/grupo de um vínculo existente.
  const [trocando, setTrocando] = useState<Vinculo | null>(null);
  const [trocaProjetoId, setTrocaProjetoId] = useState("");
  const [trocaGrupoId, setTrocaGrupoId] = useState("");
  const [trocaGrupos, setTrocaGrupos] = useState<Grupo[]>([]);
  const [salvandoTroca, setSalvandoTroca] = useState(false);
  const [erroTroca, setErroTroca] = useState<string | null>(null);

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

  /**
   * As duas listas de vínculo do projeto aberto, buscadas JUNTAS: elas são as duas metades da mesma
   * pergunta (quem está dentro, quem ficou de fora) e ver uma sem a outra levaria a conclusão errada.
   */
  const carregarElos = useCallback(
    async (id: string) => {
      setCarregandoElos(true);
      setErroElos(null);
      try {
        const [v, o] = await Promise.all([
          apiFetch<Vinculo[]>(`/admin/alto-volume/${encodeURIComponent(id)}/vinculos`, { token }),
          apiFetch<Orfao[]>(`/admin/alto-volume/${encodeURIComponent(id)}/orfaos`, { token }),
        ]);
        setVinculos(v);
        setOrfaos(o);
        // A seleção morre a cada recarga de propósito: quem já entrou no projeto saiu da lista, e
        // manter o id marcado faria o próximo lote pedir de novo alguém que já está lá.
        setSelecionadas([]);
      } catch (e) {
        setErroElos(e instanceof Error ? e.message : "Erro ao carregar os vínculos");
      } finally {
        setCarregandoElos(false);
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
      limparElos();
      return;
    }
    setAbertoId(p.id);
    setDetalhe(null);
    limparFormularioGrupo();
    limparFormularioVaga();
    limparElos();
    setUsarGrupos(false);
    await Promise.all([carregarDetalhe(p.id), carregarElos(p.id)]);
  }

  function limparElos() {
    setVinculos([]);
    setOrfaos([]);
    setErroElos(null);
    setGrupoParaVincular("");
    setSelecionadas([]);
    setFiltroClienteOrfaos("");
  }

  // ── Grupos de entrada ─────────────────────────────────────────────────────

  /** A seção de grupos aparece se o projeto JÁ usa turmas, ou se pediram para passar a usar. */
  const mostrarGrupos = (detalhe?.grupos.length ?? 0) > 0 || usarGrupos;

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

  // ── Vínculos: adicionar ao projeto, trocar de projeto, desvincular (onda 3) ─

  /**
   * ADICIONA a admissão ao projeto. Grava com origem `CORRECAO`, que é o que distingue o conserto do
   * flag da Liberação na trilha. A admissão não é tocada: só nasce a linha de vínculo.
   */
  async function vincularOrfao(o: Orfao) {
    if (!abertoId) return;
    setAgindoEm(o.admissaoId);
    setErroElos(null);
    try {
      await apiFetch(`/admin/alto-volume/${encodeURIComponent(abertoId)}/vinculos`, {
        method: "POST",
        token,
        body: { admissaoId: o.admissaoId, grupoId: grupoParaVincular || undefined },
      });
      await carregarElos(abertoId);
    } catch (e) {
      setErroElos(e instanceof Error ? e.message : "Erro ao adicionar a admissão ao projeto");
    } finally {
      setAgindoEm(null);
    }
  }

  /**
   * ADICIONA as selecionadas de uma vez. Uma chamada só para as N: o backend valida projeto e grupo
   * uma vez e devolve quem entrou e quem falhou, para a tela dizer o resultado sem adivinhar.
   */
  async function adicionarSelecionadas() {
    if (!abertoId || selecionadas.length === 0) return;
    setAdicionandoLote(true);
    setErroElos(null);
    try {
      const r = await apiFetch<{ adicionadas: number; falhas: { motivo: string }[] }>(
        `/admin/alto-volume/${encodeURIComponent(abertoId)}/vinculos/lote`,
        {
          method: "POST",
          token,
          body: { admissaoIds: selecionadas, grupoId: grupoParaVincular || undefined },
        },
      );
      await carregarElos(abertoId);
      // As falhas viram aviso, não erro silencioso: quem não entrou continua na lista de baixo.
      if (r.falhas.length > 0) {
        setErroElos(
          `${r.adicionadas} adicionada(s). ${r.falhas.length} não entrou(entraram): ${r.falhas[0].motivo}`,
        );
      }
    } catch (e) {
      setErroElos(e instanceof Error ? e.message : "Erro ao adicionar as admissões ao projeto");
    } finally {
      setAdicionandoLote(false);
    }
  }

  async function desvincular() {
    const v = confirmarDesvinculo;
    if (!v || !abertoId) return;
    setAgindoEm(v.id);
    setErroElos(null);
    try {
      await apiFetch(`/admin/alto-volume/vinculos/${encodeURIComponent(v.id)}`, {
        method: "DELETE",
        token,
      });
      setConfirmarDesvinculo(null);
      await carregarElos(abertoId);
    } catch (e) {
      setConfirmarDesvinculo(null);
      setErroElos(e instanceof Error ? e.message : "Erro ao desvincular");
    } finally {
      setAgindoEm(null);
    }
  }

  function abrirTroca(v: Vinculo) {
    setTrocando(v);
    setErroTroca(null);
    setTrocaProjetoId(abertoId ?? "");
    setTrocaGrupos(detalhe?.grupos ?? []);
    setTrocaGrupoId(v.grupoId ?? "");
  }

  /**
   * Trocar o projeto troca também a lista de grupos: grupo é do projeto, e oferecer os grupos do
   * projeto de origem levaria direto à recusa do backend ("o grupo não pertence a este projeto").
   */
  async function escolherProjetoDaTroca(id: string) {
    setTrocaProjetoId(id);
    setTrocaGrupoId("");
    if (id === abertoId) {
      setTrocaGrupos(detalhe?.grupos ?? []);
      return;
    }
    try {
      const d = await apiFetch<Detalhe>(`/admin/alto-volume/${encodeURIComponent(id)}`, { token });
      setTrocaGrupos(d.grupos);
    } catch {
      setTrocaGrupos([]);
    }
  }

  async function salvarTroca() {
    const v = trocando;
    if (!v || !abertoId) return;
    setSalvandoTroca(true);
    setErroTroca(null);
    try {
      await apiFetch(`/admin/alto-volume/vinculos/${encodeURIComponent(v.id)}`, {
        method: "PATCH",
        token,
        // `null` é o "tira do grupo" explícito. Mandar ausente manteria o grupo atual.
        body: { projetoId: trocaProjetoId, grupoId: trocaGrupoId || null },
      });
      setTrocando(null);
      await carregarElos(abertoId);
    } catch (e) {
      setErroTroca(e instanceof Error ? e.message : "Erro ao trocar o vínculo");
    } finally {
      setSalvandoTroca(false);
    }
  }

  const podeSalvarProjeto = Boolean(
    (editando || codCliente) && nome.trim() && dataInicio && dataFim,
  );
  const projetoAberto = useMemo(
    () => rows.find((p) => p.id === abertoId) ?? null,
    [rows, abertoId],
  );
  /** Projeto inativo não recebe nem perde vínculo: a tela esconde as ações e explica o caminho. */
  const projetoAtivo = projetoAberto?.ativo ?? false;
  /** Destinos possíveis da troca: os projetos ATIVOS do MESMO cliente (a regra do backend). */
  const projetosDoCliente = useMemo(
    () => rows.filter((p) => p.ativo && p.codCliente === projetoAberto?.codCliente),
    [rows, projetoAberto],
  );

  /**
   * Clientes presentes na lista "Admissões Sem Projeto", para o filtro. Sai da própria lista e não
   * do catálogo inteiro: filtro que oferece cliente sem nenhuma linha é filtro que só devolve vazio.
   */
  const clientesDosOrfaos = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const o of orfaos) {
      if (o.codCliente && !mapa.has(o.codCliente)) {
        mapa.set(o.codCliente, rotuloClienteDaLinha(o));
      }
    }
    return [...mapa].map(([value, label]) => ({ value, label }));
  }, [orfaos]);

  const orfaosVisiveis = useMemo(
    () => (filtroClienteOrfaos ? orfaos.filter((o) => o.codCliente === filtroClienteOrfaos) : orfaos),
    [orfaos, filtroClienteOrfaos],
  );

  // "Selecionar todos" opera sobre o que está À VISTA (o filtro), nunca sobre a lista inteira: marcar
  // em silêncio linha que a pessoa não está vendo é a receita do lote errado.
  const idsVisiveis = useMemo(() => orfaosVisiveis.map((o) => o.admissaoId), [orfaosVisiveis]);
  const todosVisiveisMarcados =
    idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionadas.includes(id));

  function alternarSelecao(admissaoId: string) {
    setSelecionadas((atual) =>
      atual.includes(admissaoId)
        ? atual.filter((id) => id !== admissaoId)
        : [...atual, admissaoId],
    );
  }

  function alternarTodos() {
    setSelecionadas((atual) =>
      todosVisiveisMarcados
        ? atual.filter((id) => !idsVisiveis.includes(id))
        : [...new Set([...atual, ...idsVisiveis])],
    );
  }
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
            {/* O subtítulo acompanha o que a tela realmente mostra: anunciar "Grupos De Entrada"
                com a seção escondida seria mandar procurar o que não está lá. */}
            <span className="text-sm text-dim">
              {mostrarGrupos
                ? "Grupos De Entrada, Vagas Por Cargo E Admissões"
                : "Vagas Por Cargo E Admissões Do Projeto"}
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
            <>
            <div className={`grid gap-5 ${mostrarGrupos ? "lg:grid-cols-2" : ""}`}>
              {/* ── GRUPOS DE ENTRADA (só quando o projeto usa turmas) ───────
                  A maioria dos projetos entra de uma vez só, e para esses a seção inteira era
                  bastidor ocupando metade do painel (decisão do diretor). Ela some quando não há
                  grupo cadastrado, e volta pelo link "usar grupos de entrada", que é o ÚNICO caminho
                  para cadastrar o primeiro: escondê-la sem uma porta de volta deixaria o recurso
                  inalcançável para quem um dia precisar dele. */}
              {mostrarGrupos && (
              <section>
                <h3 className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Grupos De Entrada
                  {detalhe.grupos.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setUsarGrupos(false)}
                      className="normal-case text-accent hover:underline"
                    >
                      não usar grupos
                    </button>
                  )}
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
              )}

              {/* ── VAGAS POR CARGO ───────────────────────────────────────── */}
              <section>
                <h3 className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Vagas Por Cargo
                  <span className="normal-case text-dim">
                    total: <span className="font-semibold tabular-nums text-text">{totalVagas}</span>
                  </span>
                  {!mostrarGrupos && (
                    <button
                      type="button"
                      onClick={() => setUsarGrupos(true)}
                      className="ml-auto normal-case text-accent hover:underline"
                    >
                      usar grupos de entrada
                    </button>
                  )}
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
                  {/* O seletor de cota só aparece quando existe grupo: sem turma cadastrada ele
                      teria uma opção só ("Projeto Inteiro"), que é o padrão, e escolher entre uma
                      opção não é escolha, é ruído (decisão do diretor). */}
                  {detalhe.grupos.length > 0 && (
                    <div className="min-w-[170px] flex-1">
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
                  )}
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
                        {/* A COTA só faz sentido havendo grupo: sem turma, toda vaga é do projeto
                            inteiro e a coluna repetiria a mesma pill em todas as linhas. */}
                        {mostrarGrupos && <th className="w-[150px]">Cota</th>}
                        <th className="w-[110px]">Vagas</th>
                        <th className="w-[110px]">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.vagas.length === 0 ? (
                        <tr>
                          <td colSpan={mostrarGrupos ? 4 : 3} className="py-6 text-center text-faint">
                            Sem vaga cadastrada. Acrescente os cargos e a quantidade de cada um.
                          </td>
                        </tr>
                      ) : (
                        detalhe.vagas.map((v) => (
                          <tr key={v.id}>
                            <td className="font-semibold">{v.cargoNome}</td>
                            {mostrarGrupos && (
                            <td className="text-center">
                              {/* COTA é CLASSIFICAÇÃO, não status, então usa a `Pill` neutra e NÃO a
                                  `StatusPill`. O ícone dinâmico da §A.12 existe para dizer se algo
                                  está ok, pendente ou recusado; pendurar um triângulo de alerta em
                                  "Grupo 1" faria a tela gritar problema onde só há categoria. */}
                              <span className="inline-flex justify-center">
                                <Pill tone={v.grupoId ? "in" : "nt"}>{rotuloGrupo(v.grupoId)}</Pill>
                              </span>
                            </td>
                            )}
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

            {/* ── VÍNCULOS (onda 3): quem conta, e quem deveria contar ─────────
                As duas tabelas ficam EMPILHADAS e em largura cheia, não lado a lado como grupos e
                vagas: elas têm muitas colunas (candidato, cargo, data, grupo, farol, trilha) e em
                meia tela nenhuma delas caberia sem esmagar (§A.20). */}
            <section className="mt-6 border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-[13px] font-semibold uppercase tracking-wide text-faint">
                  Vínculos Do Projeto
                </h3>
                <span className="text-sm text-dim">
                  quem já está neste projeto, e as admissões do período que ficaram sem projeto
                </span>
                <button
                  type="button"
                  onClick={() => abertoId && void carregarElos(abertoId)}
                  disabled={carregandoElos}
                  className="ml-auto text-sm text-accent hover:underline disabled:opacity-50"
                >
                  {carregandoElos ? "atualizando…" : "atualizar"}
                </button>
              </div>

              {erroElos && (
                <p
                  className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
                  role="alert"
                >
                  {erroElos}
                </p>
              )}

              {!projetoAtivo && (
                <p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-dim">
                  Projeto inativo: os vínculos ficam só de leitura. Reative o projeto para corrigir
                  quem entra e quem sai dele.
                </p>
              )}

              {/* ── ADMISSÕES JÁ NO PROJETO ──────────────────────────────── */}
              <h4 className="mb-2 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-text">
                Admissões No Projeto
                <span className="font-normal text-dim">
                  total: <span className="font-semibold tabular-nums text-text">{vinculos.length}</span>
                </span>
              </h4>
              <div className="mb-6 overflow-x-auto rounded-xl border border-[var(--border)]">
                {/* §A.20: as fixas somam menos que a largura útil de propósito, para o nome do
                    candidato (a coluna que mais varia) ficar com a sobra em vez de quebrar em três
                    linhas. Abaixo do mínimo a tabela ROLA, nunca esmaga. */}
                {/* CINCO COLUNAS, e o que saiu daqui é decisão do diretor: farol, origem, trilha do
                    vínculo e grupo eram BASTIDOR nesta tela. Quem abre este painel quer ligar
                    candidato ao projeto do cliente, não administrar frente. Os dados continuam
                    GRAVADOS e consultáveis (a trilha existe para auditoria), só não ocupam a tela. */}
                <table className="ds-table w-full min-w-[820px] table-fixed">
                  <thead>
                    <tr>
                      <th className="w-[250px]">Candidato</th>
                      <th className="w-[250px]">Cliente</th>
                      <th className="w-[200px]">Cargo</th>
                      <th className="w-[130px]">Data Adm.</th>
                      <th className="w-[190px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carregandoElos && vinculos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-faint">
                          Carregando…
                        </td>
                      </tr>
                    ) : vinculos.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-faint">
                          Nenhuma admissão neste projeto ainda. Use a lista de baixo para adicionar.
                        </td>
                      </tr>
                    ) : (
                      vinculos.map((v) => {
                        return (
                          <tr key={v.id}>
                            <td className="font-semibold">{v.candidatoNome}</td>
                            <td>{rotuloClienteDaLinha(v)}</td>
                            <td>{v.cargoNome ?? "não informado"}</td>
                            <td className="text-center tabular-nums">{fmtData(v.dataAdmissao)}</td>
                            <td className="whitespace-nowrap text-right">
                              {projetoAtivo ? (
                                <>
                                  <button
                                    onClick={() => abrirTroca(v)}
                                    className="text-accent hover:underline"
                                  >
                                    trocar
                                  </button>
                                  <span className="px-2 text-faint">·</span>
                                  <button
                                    onClick={() => setConfirmarDesvinculo(v)}
                                    disabled={agindoEm === v.id}
                                    className="text-danger hover:underline disabled:opacity-50"
                                  >
                                    desvincular
                                  </button>
                                </>
                              ) : (
                                <span className="text-faint">projeto inativo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── ADMISSÕES SEM PROJETO ────────────────────────────────────
                  O nome da seção é o do OPERACIONAL, não o do banco: quem olha a tela pensa em
                  "admissão que ficou sem projeto", não em órfão de um join (decisão do diretor). */}
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h4 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-text">
                  Admissões Sem Projeto
                  <span className="font-normal text-dim">
                    total: <span className="font-semibold tabular-nums text-text">{orfaos.length}</span>
                  </span>
                </h4>
                {projetoAtivo && detalhe.grupos.length > 0 && (
                  <label className="ml-auto flex items-center gap-2 text-sm text-dim">
                    <span className="whitespace-nowrap">Adicionar ao grupo</span>
                    <div className="min-w-[190px]">
                      <Select
                        value={grupoParaVincular}
                        onChange={setGrupoParaVincular}
                        placeholder="Projeto Inteiro"
                        ariaLabel="Grupo de entrada do vínculo"
                        menuFit
                        options={[
                          { value: "", label: "Projeto Inteiro" },
                          ...detalhe.grupos.map((g) => ({ value: g.id, label: g.rotulo })),
                        ]}
                      />
                    </div>
                  </label>
                )}
              </div>
              <p className="mb-2 text-sm text-dim">
                São admissões deste cliente que começam dentro do período do projeto e ainda não
                entraram em projeto nenhum. Quem já está em outro projeto não aparece aqui: nesse
                caso, use trocar na linha da pessoa, dentro do projeto em que ela está.
              </p>

              {/* BARRA DE SELEÇÃO: o filtro por cliente e a ação em lote ficam JUNTOS, logo acima da
                  tabela, porque um governa o outro. "Selecionar todos" marca só o que o filtro deixa
                  à vista, e o contador diz exatamente quantas vão entrar. */}
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <label className="flex items-center gap-2 text-sm text-dim">
                  <span className="whitespace-nowrap">Cliente</span>
                  <div className="min-w-[260px]">
                    <Select
                      value={filtroClienteOrfaos}
                      onChange={setFiltroClienteOrfaos}
                      placeholder="Todos Os Clientes"
                      ariaLabel="Filtrar por cliente"
                      searchable
                      menuFit
                      options={[
                        { value: "", label: "Todos Os Clientes" },
                        ...clientesDosOrfaos,
                      ]}
                    />
                  </div>
                </label>
                {projetoAtivo && (
                  <>
                    <span className="text-sm text-dim">
                      selecionadas:{" "}
                      <span className="font-semibold tabular-nums text-text">
                        {selecionadas.length}
                      </span>
                    </span>
                    <Button
                      onClick={() => void adicionarSelecionadas()}
                      disabled={adicionandoLote || selecionadas.length === 0}
                      className="ml-auto shrink-0 py-2"
                    >
                      {adicionandoLote
                        ? "Adicionando…"
                        : `Adicionar selecionadas ao projeto (${selecionadas.length})`}
                    </Button>
                  </>
                )}
              </div>

              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                {/* As MESMAS cinco colunas da lista de cima, mais a caixa de seleção: as duas listas
                    mostram a mesma pessoa em dois estados, e colunas diferentes fariam a leitura
                    pular de uma para a outra. */}
                <table className="ds-table w-full min-w-[880px] table-fixed">
                  <thead>
                    <tr>
                      <th className="w-[54px]">
                        {projetoAtivo ? (
                          <input
                            type="checkbox"
                            checked={todosVisiveisMarcados}
                            onChange={alternarTodos}
                            disabled={idsVisiveis.length === 0}
                            className="h-4 w-4 accent-[var(--accent)]"
                            aria-label="Selecionar todos"
                            title="Selecionar todos"
                          />
                        ) : null}
                      </th>
                      <th className="w-[240px]">Candidato</th>
                      <th className="w-[240px]">Cliente</th>
                      <th className="w-[190px]">Cargo</th>
                      <th className="w-[130px]">Data Adm.</th>
                      <th className="w-[230px]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carregandoElos && orfaos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-faint">
                          Carregando…
                        </td>
                      </tr>
                    ) : orfaosVisiveis.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-faint">
                          {filtroClienteOrfaos
                            ? "Nenhuma admissão sem projeto neste cliente."
                            : "Nenhuma admissão sem projeto neste período: todo mundo deste cliente que começa entre as datas do projeto já está em algum projeto."}
                        </td>
                      </tr>
                    ) : (
                      orfaosVisiveis.map((o) => {
                        const marcada = selecionadas.includes(o.admissaoId);
                        return (
                          <tr key={o.admissaoId} className={marcada ? "bg-[var(--surface)]" : ""}>
                            <td className="text-center">
                              {projetoAtivo ? (
                                <input
                                  type="checkbox"
                                  checked={marcada}
                                  onChange={() => alternarSelecao(o.admissaoId)}
                                  className="h-4 w-4 accent-[var(--accent)]"
                                  aria-label={`Selecionar ${o.candidatoNome}`}
                                />
                              ) : null}
                            </td>
                            <td className="font-semibold">{o.candidatoNome}</td>
                            <td>{rotuloClienteDaLinha(o)}</td>
                            <td>{o.cargoNome ?? "não informado"}</td>
                            <td className="text-center tabular-nums">{fmtData(o.dataAdmissao)}</td>
                            <td className="whitespace-nowrap text-right">
                              {projetoAtivo ? (
                                <button
                                  onClick={() => void vincularOrfao(o)}
                                  disabled={agindoEm === o.admissaoId}
                                  className="text-accent hover:underline disabled:opacity-50"
                                >
                                  {agindoEm === o.admissaoId
                                    ? "adicionando…"
                                    : "adicionar adm ao projeto"}
                                </button>
                              ) : (
                                <span className="text-faint">projeto inativo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            </>
          ) : null}
        </GlassCard>
      )}

      {/* TROCA de projeto/grupo de um vínculo. Modal, e não edição em linha, porque a troca precisa
          de dois seletores dependentes (o grupo depende do projeto escolhido). */}
      {trocando && (
        <Modal onClose={() => setTrocando(null)} ariaLabel="Trocar o projeto do vínculo" className="max-w-lg p-5">
          <h2 className="mb-1 text-[17px] font-semibold text-text">Trocar Projeto Do Vínculo</h2>
          <p className="mb-4 text-sm text-dim">
            {trocando.candidatoNome}. A admissão não muda de lugar na esteira: muda só o projeto em
            que ela conta.
          </p>

          {erroTroca && (
            <p
              className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erroTroca}
            </p>
          )}

          <div className="mb-3">
            <span className="mb-1 block text-sm text-dim">Projeto</span>
            <Select
              value={trocaProjetoId}
              onChange={(v) => void escolherProjetoDaTroca(v)}
              placeholder="Projeto"
              ariaLabel="Projeto de destino"
              searchable
              menuFit
              options={projetosDoCliente.map((p) => ({ value: p.id, label: p.nome }))}
            />
            <p className="mt-1 text-xs text-faint">
              Só projetos ativos do mesmo cliente. Projeto de outro cliente é recusado.
            </p>
          </div>

          {/* Grupo só entra no modal quando o projeto de destino tem turmas: no projeto sem grupo o
              campo teria uma opção só e a troca é apenas de projeto. */}
          {trocaGrupos.length > 0 && (
            <div className="mb-5">
              <span className="mb-1 block text-sm text-dim">Grupo de entrada</span>
              <Select
                value={trocaGrupoId}
                onChange={setTrocaGrupoId}
                placeholder="Projeto Inteiro"
                ariaLabel="Grupo de entrada do vínculo"
                menuFit
                options={[
                  { value: "", label: "Projeto Inteiro" },
                  ...trocaGrupos.map((g) => ({ value: g.id, label: g.rotulo })),
                ]}
              />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setTrocando(null)} disabled={salvandoTroca}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarTroca()} disabled={salvandoTroca || !trocaProjetoId}>
              {salvandoTroca ? "Salvando…" : "Salvar troca"}
            </Button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={Boolean(confirmarDesvinculo)}
        title="Desvincular Do Projeto"
        message={
          confirmarDesvinculo
            ? `Tirar ${confirmarDesvinculo.candidatoNome} do projeto? A admissão continua exatamente como está na esteira: ela só deixa de contar neste projeto e volta para a lista Admissões Sem Projeto.`
            : ""
        }
        confirmLabel="Desvincular"
        tone="danger"
        busy={Boolean(agindoEm)}
        onConfirm={desvincular}
        onCancel={() => setConfirmarDesvinculo(null)}
      />

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
