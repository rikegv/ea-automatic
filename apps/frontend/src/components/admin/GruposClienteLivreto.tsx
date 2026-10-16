"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

/**
 * O LIVRETO DOS GRUPOS DE CLIENTE (cenário 2, etapa 1).
 *
 * O FORMATO É O DA SALA DE ESPERA, e por um motivo prático: são duas listas que só fazem sentido
 * lado a lado. À esquerda o grupo (o nome, ex "CAGC Corifeu"); à direita todos os CNPJs, com busca,
 * para TICAR quais entram. A lombada no meio é o elo.
 *
 * POR QUE ESTA TELA EXISTE. A Raia tem 98 códigos de cliente com a MESMA razão social, e o
 * agrupamento administrativo vive escrito à mão no apelido, em nove grafias. Montar o Corifeu é
 * ticar 53 códigos de uma vez; fazer isso abrindo 53 fichas de cliente seria a tarefa errada.
 *
 * A MARCAÇÃO É A VERDADE FINAL. O que está ticado fica no grupo, o que foi desticado sai dele. Por
 * isso a gravação passa por uma PRÉVIA do servidor: ela diz, antes, quem entra, quem SAI de outro
 * grupo e quem deixa de ter grupo. As admissões antigas nunca se mexem, e a tela diz isso em texto,
 * porque é a parte contraintuitiva.
 *
 * §A.11: sem travessão. §A.24: títulos e tags em Title Case. §A.35: nenhum seletor nativo.
 */

interface GrupoResumo {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  membros: number;
  admissoesCarimbadas: number;
  /**
   * META do grupo: a quantidade de vagas a fechar. OBRIGATÓRIA na criação (sem "sem meta"), então o
   * backend sempre a devolve para grupo novo. Grupo legado, criado antes desta frente, pode vir com
   * meta nula até alguém definir aqui, e a lista mostra "não informado" nesse caso (§A.11).
   */
  meta: number | null;
}

interface ClienteDoCatalogo {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  cnpj: string | null;
  grupoId: string | null;
  grupoNome: string | null;
}

interface Efeito {
  codCliente: string;
  /** Quantas admissões deste CNPJ o salvar vai carimbar (ou descarimbar). */
  admissoes: number;
  efeito: "ENTRA" | "TROCA" | "JA_ESTA" | "SAI";
  deGrupoNome?: string;
  razaoSocial?: string;
  nomeOperacao?: string | null;
}

interface Previa {
  grupo: { id: string; nome: string };
  resumo: {
    entram: number;
    trocam: number;
    saem: number;
    jaEstao: number;
    /** O ALCANCE REAL do clique: "entra 1 CNPJ" e "entram 164 admissões" são frases diferentes. */
    admissoesACarimbar: number;
    admissoesADescarimbar: number;
  };
  efeitos: Efeito[];
}

const rotulo = (c: { codCliente: string; nomeOperacao: string | null; razaoSocial: string }) =>
  `${c.codCliente} · ${c.nomeOperacao?.trim() || c.razaoSocial}`;

/** Um cargo do catálogo (`admin/cargos`), do jeito que a meta por cargo precisa. */
interface CargoCatalogo {
  id: string;
  nome: string;
  ativo: boolean;
}

/** A meta de um cargo num grupo (ajuste 5). */
interface MetaCargo {
  cargoId: string;
  cargoNome: string;
  meta: number;
}

/**
 * MODAL "VAGAS POR CARGO" (ajuste 5): a meta de cada cargo no grupo. O Total do grupo passa a ser a
 * SOMA das metas por cargo cadastradas aqui (decisão do diretor). Lista o catálogo de cargos com
 * busca (§A.35), cada um com um campo de meta; vazio é "sem meta" para aquele cargo, e salvar é no
 * blur quando o valor mudou. Não fecha ao clicar fora (§A.41); sai pelo "Concluir".
 */
function MetasPorCargoModal({
  grupoId,
  grupoNome,
  cargos,
  metasIniciais,
  onFechar,
}: {
  grupoId: string;
  grupoNome: string;
  cargos: CargoCatalogo[];
  metasIniciais: MetaCargo[];
  onFechar: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(metasIniciais.map((m) => [m.cargoId, String(m.meta)])),
  );
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const ativos = useMemo(() => cargos.filter((c) => c.ativo), [cargos]);
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? ativos.filter((c) => c.nome.toLowerCase().includes(q)) : ativos;
  }, [ativos, busca]);

  // A soma só conta valores válidos (inteiro >= 1). É o total do grupo que o painel vai mostrar.
  const soma = useMemo(
    () =>
      Object.values(draft).reduce((acc, v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 1 ? acc + n : acc;
      }, 0),
    [draft],
  );
  const qtdComMeta = useMemo(
    () => Object.values(draft).filter((v) => Number.isInteger(Number(v)) && Number(v) >= 1).length,
    [draft],
  );

  /**
   * Salva a meta de um cargo no blur, só quando mudou. Vazio remove (meta nula); valor presente tem
   * de ser inteiro >= 1. Valor inválido não grava e não polui a soma (ela já ignora inválido).
   */
  async function salvar(cargoId: string, valor: string) {
    const bruto = valor.trim();
    const inicial = metasIniciais.find((m) => m.cargoId === cargoId)?.meta ?? null;
    const n = bruto === "" ? null : Number(bruto);
    if (n !== null && (!Number.isInteger(n) || n < 1)) {
      setErro("A meta de um cargo precisa ser um número inteiro de pelo menos 1.");
      return;
    }
    if (n === inicial) return;
    setSalvando(cargoId);
    setErro(null);
    try {
      await apiFetch(`/admin/grupos-cliente/${grupoId}/metas-cargo/${cargoId}`, {
        method: "PUT",
        body: { meta: n },
      });
      // Reflete o salvo na lista inicial em memória, para o "mudou" do próximo blur comparar certo.
      const idx = metasIniciais.findIndex((m) => m.cargoId === cargoId);
      if (n === null) {
        if (idx >= 0) metasIniciais.splice(idx, 1);
      } else if (idx >= 0) metasIniciais[idx].meta = n;
      else metasIniciais.push({ cargoId, cargoNome: "", meta: n });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a meta do cargo.");
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Modal onClose={onFechar} ariaLabel="Vagas por cargo do grupo" className="max-w-lg p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold text-text">Vagas Por Cargo</h2>
        <span className="text-[12px] text-faint">{grupoNome}</span>
      </div>
      <p className="mb-3 mt-1 text-[12.5px] text-dim">
        A meta de cada cargo. O total do grupo passa a ser a soma das metas por cargo. Cargo sem valor
        fica sem meta.
      </p>

      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger" role="alert">
          {erro}
        </p>
      )}

      <div className="mb-3 flex items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cargo"
          aria-label="Buscar cargo"
          className="ds-input min-w-0 flex-1 py-1.5"
        />
        <span className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-dim">
          Total{" "}
          <span className="font-semibold tabular-nums text-text">{soma}</span>{" "}
          <span className="text-faint">
            em {qtdComMeta} {qtdComMeta === 1 ? "cargo" : "cargos"}
          </span>
        </span>
      </div>

      <div className="max-h-[52vh] overflow-auto rounded-xl border border-[var(--border)]">
        {visiveis.length === 0 ? (
          <p className="py-8 text-center text-faint">Nenhum cargo nesta busca.</p>
        ) : (
          visiveis.map((c) => {
            const valor = draft[c.id] ?? "";
            const temMeta = Number.isInteger(Number(valor)) && Number(valor) >= 1;
            return (
              <div
                key={c.id}
                className={
                  "flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 transition last:border-b-0 " +
                  (temMeta ? "bg-[rgba(45,138,86,0.06)]" : "")
                }
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-text" title={c.nome}>
                  {c.nome}
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={valor}
                  onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))}
                  onBlur={(e) => void salvar(c.id, e.target.value)}
                  disabled={salvando === c.id}
                  placeholder="Vagas"
                  aria-label={`Meta de vagas do cargo ${c.nome}`}
                  className="ds-input w-[92px] py-1 tabular-nums"
                />
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={onFechar}>Concluir</Button>
      </div>
    </Modal>
  );
}

export function GruposClienteLivreto({ onFechar }: { onFechar: () => void }) {
  const [grupos, setGrupos] = useState<GrupoResumo[]>([]);
  const [catalogo, setCatalogo] = useState<ClienteDoCatalogo[]>([]);
  const [grupoId, setGrupoId] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [soMarcados, setSoMarcados] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  /** Meta do grupo novo. String no estado porque o input é texto, convertida para número ao criar. */
  const [novaMeta, setNovaMeta] = useState("");
  /** Edição da meta do grupo selecionado. Guarda o valor em digitação, salvo no blur. */
  const [metaEditada, setMetaEditada] = useState("");
  const [salvandoMeta, setSalvandoMeta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // AJUSTE 5: catálogo de cargos (uma vez) e as metas por cargo do grupo escolhido.
  const [cargosCatalogo, setCargosCatalogo] = useState<CargoCatalogo[]>([]);
  const [metasCargo, setMetasCargo] = useState<MetaCargo[]>([]);
  const [metasModalAberto, setMetasModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    const [gs, cs, cg] = await Promise.all([
      apiFetch<GrupoResumo[]>("/admin/grupos-cliente"),
      apiFetch<ClienteDoCatalogo[]>("/admin/grupos-cliente/clientes"),
      apiFetch<CargoCatalogo[]>("/admin/cargos"),
    ]);
    setGrupos(gs);
    setCatalogo(cs);
    setCargosCatalogo(cg);
  }, []);

  const carregarMetasCargo = useCallback(async (id: string) => {
    try {
      setMetasCargo(await apiFetch<MetaCargo[]>(`/admin/grupos-cliente/${id}/metas-cargo`));
    } catch {
      setMetasCargo([]);
    }
  }, []);

  useEffect(() => {
    void carregar().catch(() => setErro("Não foi possível carregar os grupos."));
  }, [carregar]);

  // As metas por cargo acompanham o grupo escolhido: abrir outro grupo traz as metas dele.
  useEffect(() => {
    if (!grupoId) return setMetasCargo([]);
    void carregarMetasCargo(grupoId);
  }, [grupoId, carregarMetasCargo]);

  // Trocar de grupo recarrega a marcação a partir do catálogo, que já sabe de quem é cada CNPJ.
  useEffect(() => {
    if (!grupoId) return setMarcados(new Set());
    setMarcados(new Set(catalogo.filter((c) => c.grupoId === grupoId).map((c) => c.codCliente)));
  }, [grupoId, catalogo]);

  const grupo = grupos.find((g) => g.id === grupoId) ?? null;

  // A meta em edição acompanha o grupo escolhido: abrir outro grupo mostra a meta dele, não a do
  // anterior. Meta nula (grupo legado) começa em branco, para o campo convidar a definir.
  useEffect(() => {
    setMetaEditada(grupo?.meta != null ? String(grupo.meta) : "");
  }, [grupo]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return catalogo.filter((c) => {
      if (soMarcados && !marcados.has(c.codCliente)) return false;
      if (!q) return true;
      // A busca casa os três, porque a pessoa procura pelo que tem na cabeça, e nem sempre é o mesmo:
      // o código que veio na planilha, a razão social, ou o apelido da operação.
      return `${c.codCliente} ${c.razaoSocial} ${c.nomeOperacao ?? ""}`.toLowerCase().includes(q);
    });
  }, [catalogo, busca, soMarcados, marcados]);

  function alternar(cod: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(cod)) novo.delete(cod);
      else novo.add(cod);
      return novo;
    });
  }

  /** Marca TODOS os que a busca deixou à vista. Nunca a lista inteira: marcar o que não se vê é o erro. */
  function marcarVisiveis() {
    setMarcados((atual) => new Set([...atual, ...visiveis.map((c) => c.codCliente)]));
  }

  /** A meta só é válida como inteiro >= 1: sem opção de "sem meta" (decisão do diretor). */
  const metaNova = Number(novaMeta);
  const metaNovaValida = Number.isInteger(metaNova) && metaNova >= 1;

  async function criarGrupo() {
    if (!novoNome.trim() || !metaNovaValida) return;
    setOcupado(true);
    setErro(null);
    try {
      const g = await apiFetch<GrupoResumo>("/admin/grupos-cliente", {
        method: "POST",
        body: { nome: novoNome.trim(), meta: metaNova },
      });
      setNovoNome("");
      setNovaMeta("");
      await carregar();
      setGrupoId(g.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar o grupo.");
    } finally {
      setOcupado(false);
    }
  }

  /**
   * Salva a meta do grupo escolhido. Chamada no blur do campo, e só quando o valor mudou e é inteiro
   * >= 1: digitar e sair sem alterar não dispara chamada, e valor inválido não grava.
   */
  async function salvarMeta() {
    if (!grupo) return;
    const n = Number(metaEditada);
    if (!Number.isInteger(n) || n < 1 || n === grupo.meta) return;
    setSalvandoMeta(true);
    setErro(null);
    try {
      await apiFetch(`/admin/grupos-cliente/${grupo.id}`, {
        method: "PATCH",
        body: { meta: n },
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar a meta.");
    } finally {
      setSalvandoMeta(false);
    }
  }

  async function alternarAtivo() {
    if (!grupo) return;
    setOcupado(true);
    try {
      await apiFetch(`/admin/grupos-cliente/${grupo.id}`, {
        method: "PATCH",
        body: { ativo: !grupo.ativo },
      });
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível mudar o grupo.");
    } finally {
      setOcupado(false);
    }
  }

  /** Pede ao SERVIDOR o que vai acontecer. O grupo de cada CNPJ pode ter mudado com a tela aberta. */
  async function pedirPrevia() {
    if (!grupoId) return;
    setOcupado(true);
    setErro(null);
    try {
      setPrevia(
        await apiFetch<Previa>(`/admin/grupos-cliente/${grupoId}/membros/previa`, {
          method: "POST",
          body: { codClientes: [...marcados] },
        }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível calcular a prévia.");
    } finally {
      setOcupado(false);
    }
  }

  async function gravar() {
    if (!grupoId) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await apiFetch<{
        entram: number;
        trocam: number;
        saem: number;
        total: number;
        admissoesACarimbar: number;
        admissoesADescarimbar: number;
      }>(
        `/admin/grupos-cliente/${grupoId}/membros`,
        { method: "POST", body: { codClientes: [...marcados] } },
      );
      setPrevia(null);
      await carregar();
      // O aviso diz o que ACONTECEU com as admissões, e não só com os CNPJs: é o número que a
      // pessoa vai procurar no painel um segundo depois.
      setAviso(
        `Grupo salvo com ${r.total} CNPJ${r.total === 1 ? "" : "s"}.` +
          (r.trocam > 0 ? ` ${r.trocam} veio(vieram) de outro grupo.` : "") +
          (r.saem > 0 ? ` ${r.saem} saiu(saíram) do grupo.` : "") +
          (r.admissoesACarimbar > 0
            ? ` ${r.admissoesACarimbar} admissão(ões) entrou(entraram) no grupo.`
            : "") +
          (r.admissoesADescarimbar > 0
            ? ` ${r.admissoesADescarimbar} ficou(ficaram) sem grupo.`
            : ""),
      );
    } catch (e) {
      setPrevia(null);
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o grupo.");
    } finally {
      setOcupado(false);
    }
  }

  const mudou =
    grupoId !== null &&
    (marcados.size !== (grupo?.membros ?? 0) ||
      catalogo.some((c) => (c.grupoId === grupoId) !== marcados.has(c.codCliente)));

  return (
    <Modal onClose={onFechar} ariaLabel="Cadastrar grupos de cliente" className="max-w-6xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-4">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Clientes</div>
          <h2 className="font-display text-xl font-bold">Cadastrar Grupos</h2>
        </div>
        <span className="shrink-0 text-[11.5px] text-faint">
          o grupo junta CNPJs num nome só, para filtrar e analisar
        </span>
      </div>

      {erro && (
        <p className="mx-6 mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mx-6 mt-4 rounded-xl border border-[var(--ok)] bg-[rgba(120,190,60,0.10)] px-3 py-2 text-sm text-[var(--ok)]">
          {aviso}
        </p>
      )}

      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_auto_1.15fr]">
        {/* ── PÁGINA ESQUERDA: o grupo ──────────────────────────────────────── */}
        <div className="px-6 py-5">
          <div className="eyebrow !mb-2">O Grupo</div>

          <div className="mb-1 flex gap-2">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void criarGrupo()}
              placeholder="Nome do grupo novo, ex: RAIA CAGC CORIFEU"
              aria-label="Nome do grupo novo"
              className="ds-input min-w-0 flex-1 py-1.5"
            />
            {/* META OBRIGATÓRIA: a quantidade de vagas que o grupo precisa fechar. Sem opção de "sem
                meta" (decisão do diretor), por isso o inteiro mínimo é 1 e o botão só libera com ela
                preenchida. Campo numérico do design system (`ds-input`); §A.35 vale para seletor de
                opção, e meta é digitação livre. */}
            <input
              type="number"
              min={1}
              step={1}
              value={novaMeta}
              onChange={(e) => setNovaMeta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void criarGrupo()}
              placeholder="Meta"
              aria-label="Meta de vagas do grupo novo"
              className="ds-input w-[96px] py-1.5 tabular-nums"
            />
            {/* AÇÃO PRINCIPAL do lado esquerdo, em tamanho cheio e com o gradiente do design system:
                criar o grupo é o primeiro passo do livreto e não pode competir de igual para igual
                com um campo de texto. */}
            <Button
              onClick={() => void criarGrupo()}
              disabled={ocupado || !novoNome.trim() || !metaNovaValida}
              className="shrink-0 px-5"
            >
              Criar Grupo
            </Button>
          </div>
          <p className="mb-3 text-[11.5px] text-faint">
            A meta é a quantidade de vagas que o grupo precisa fechar, e é obrigatória.
          </p>

          {grupos.length === 0 ? (
            <p className="py-6 text-center text-faint">
              Nenhum grupo ainda. Crie o primeiro acima, depois tique os CNPJs dele ao lado.
            </p>
          ) : (
            <div className="max-h-[360px] overflow-auto rounded-2xl border border-[var(--border)]">
              {grupos.map((g) => {
                const aberto = g.id === grupoId;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGrupoId(aberto ? null : g.id)}
                    className={
                      "block w-full border-b border-[var(--border)] px-4 py-3 text-left transition last:border-b-0 " +
                      (aberto ? "bg-[rgba(45,138,86,0.07)]" : "hover:bg-[var(--surface-2)]")
                    }
                  >
                    <div className="flex items-baseline gap-2">
                      <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${g.ativo ? "text-text" : "text-faint"}`}>
                        {g.nome}
                      </span>
                      {!g.ativo && (
                        <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-semibold text-faint">
                          Inativo
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-dim">
                      {/* META à frente, porque é o dado que a dash de Alto Volume por grupo consome:
                          mostrar aqui é o espelho da coluna pedida. "não informado" no grupo legado
                          sem meta (§A.11), nunca zero, que diria meta definida como nada. */}
                      Meta{" "}
                      <span className="font-semibold tabular-nums text-text">
                        {g.meta != null ? g.meta : "não informado"}
                      </span>{" "}
                      · {g.membros} CNPJ{g.membros === 1 ? "" : "s"} ·{" "}
                      {g.admissoesCarimbadas}{" "}
                      {g.admissoesCarimbadas === 1 ? "admissão" : "admissões"} no histórico
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {grupo && (
            <div className="mt-3 flex flex-col gap-3 text-[12px] text-dim">
              {/* EDIÇÃO DA META do grupo escolhido, no mesmo bloco que já edita o estado (ativo): é o
                  "fluxo que edita o grupo" ganhando a meta. Salva no blur quando o valor mudou e é
                  inteiro >= 1. Grupo legado sem meta começa em branco, convidando a definir.

                  AJUSTE 5: quando o grupo tem meta POR CARGO, o total único deixa de ser digitado e
                  passa a MOSTRAR a soma das metas por cargo (só leitura), para não haver dois totais
                  divergentes. A edição do total, aí, é por cargo, no botão abaixo. */}
              <label className="flex flex-wrap items-center gap-2">
                <span className="whitespace-nowrap font-semibold text-text">Meta De Vagas</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={metasCargo.length > 0 ? String(grupo.meta ?? "") : metaEditada}
                  onChange={(e) => setMetaEditada(e.target.value)}
                  onBlur={() => void salvarMeta()}
                  readOnly={metasCargo.length > 0}
                  disabled={ocupado || salvandoMeta || metasCargo.length > 0}
                  aria-label={`Meta de vagas do grupo ${grupo.nome}`}
                  className="ds-input w-[96px] py-1 tabular-nums"
                />
                <span className="text-faint">
                  {metasCargo.length > 0
                    ? "soma das vagas por cargo"
                    : salvandoMeta
                      ? "salvando…"
                      : grupo.meta == null
                        ? "defina a meta deste grupo, obrigatória"
                        : "quantidade de vagas a fechar"}
                </span>
              </label>
              {/* O EDITOR DE VAGAS POR CARGO (ajuste 5), no mesmo bloco de edição do grupo. */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setMetasModalAberto(true)}
                  disabled={ocupado}
                  className="px-3.5 py-1.5 text-[12.5px] text-accent"
                >
                  Vagas Por Cargo
                </Button>
                <span className="text-faint">
                  {metasCargo.length > 0
                    ? `${metasCargo.length} ${metasCargo.length === 1 ? "cargo" : "cargos"} com meta`
                    : "defina a meta de cada cargo deste grupo"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => void alternarAtivo()}
                  disabled={ocupado}
                  className={`px-3.5 py-1.5 text-[12.5px] ${grupo.ativo ? "text-danger" : "text-accent"}`}
                >
                  {grupo.ativo ? "Inativar Grupo" : "Reativar Grupo"}
                </Button>
                {/* O que a inativação faz, dito na hora: some das escolhas, fica no histórico. */}
                <span className="text-faint">
                  grupo inativo some dos filtros, e continua no histórico já carimbado
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── LOMBADA ───────────────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-center px-2 py-2 md:px-0 md:py-6">
          <div
            className="absolute inset-x-6 top-1/2 h-px md:inset-x-auto md:inset-y-6 md:left-1/2 md:h-auto md:w-px"
            style={{ background: "linear-gradient(90deg, transparent, var(--border), transparent)" }}
          />
          <div
            className={
              "relative grid h-9 w-9 place-items-center rounded-full border transition duration-300 " +
              (grupoId
                ? "border-[rgba(45,138,86,0.5)] bg-[rgba(45,138,86,0.14)] text-ok"
                : "border-[var(--border)] bg-[var(--surface)] text-faint")
            }
          >
            <Icon name={grupoId ? "check" : "right"} className="h-4 w-4" />
          </div>
        </div>

        {/* ── PÁGINA DIREITA: os CNPJs ──────────────────────────────────────── */}
        <div className="px-6 py-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="eyebrow !mb-0">Quais CNPJs Entram</div>
            <span className="text-[11.5px] text-faint">
              {visiveis.length} de {catalogo.length}
            </span>
          </div>

          {!grupoId ? (
            <p className="py-10 text-center text-faint">
              Escolha um grupo ao lado para ticar os CNPJs dele.
            </p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por código, razão social ou apelido"
                  aria-label="Buscar cliente"
                  className="ds-input min-w-0 flex-1 py-1.5"
                />
                {/* AÇÃO, não link: ticar dezenas de CNPJs de uma vez é o gesto que esta tela
                    existe para oferecer, e um texto sublinhado o esconde no meio do formulário. */}
                <Button
                  variant="secondary"
                  onClick={marcarVisiveis}
                  disabled={visiveis.length === 0}
                  className="shrink-0 whitespace-nowrap px-4 py-2 text-accent"
                >
                  Ticar Os {visiveis.length} À Vista
                </Button>
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-3 text-[12px] text-dim">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={soMarcados}
                    onChange={(e) => setSoMarcados(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  ver só os ticados
                </label>
                <span className="ml-auto">
                  ticados: <span className="font-semibold tabular-nums text-text">{marcados.size}</span>
                </span>
              </div>

              <div className="max-h-[300px] overflow-auto rounded-2xl border border-[var(--border)]">
                {visiveis.length === 0 ? (
                  <p className="py-8 text-center text-faint">Nenhum cliente nesta busca.</p>
                ) : (
                  visiveis.map((c) => {
                    const marcado = marcados.has(c.codCliente);
                    const deOutro = c.grupoId !== null && c.grupoId !== grupoId;
                    return (
                      <label
                        key={c.codCliente}
                        className={
                          "flex cursor-pointer items-start gap-2.5 border-b border-[var(--border)] px-3 py-2.5 transition last:border-b-0 " +
                          (marcado ? "bg-[rgba(45,138,86,0.07)]" : "hover:bg-[var(--surface-2)]")
                        }
                      >
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(c.codCliente)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                          aria-label={`Ticar ${rotulo(c)}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-semibold text-text">
                            {rotulo(c)}
                          </span>
                          <span className="block truncate text-[11.5px] text-dim">
                            {c.cnpj ?? "CNPJ não informado"}
                            {c.nomeOperacao?.trim() ? ` · ${c.razaoSocial}` : ""}
                          </span>
                          {/* O AVISO NA PRÓPRIA LINHA, e não só na confirmação: quem tica precisa ver
                              na hora que aquele CNPJ está saindo de outro lugar. */}
                          {deOutro && (
                            <span
                              className={
                                "mt-1 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold " +
                                (marcado
                                  ? "bg-[rgba(214,140,40,0.15)] text-[var(--warn,#b8860b)]"
                                  : "bg-[var(--surface-2)] text-faint")
                              }
                            >
                              {marcado ? `Sai De ${c.grupoNome}` : `Hoje Em ${c.grupoNome}`}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
        <span className="mr-auto text-[12px] text-faint">
          Salvar mexe só no agrupamento. As admissões já carimbadas não mudam de grupo.
        </span>
        <Button variant="secondary" onClick={onFechar} disabled={ocupado}>
          Fechar
        </Button>
        {/* A AÇÃO PRINCIPAL do livreto inteiro: mais larga que o Fechar ao lado, para a hierarquia
            ser visível antes de ler os rótulos. */}
        <Button onClick={() => void pedirPrevia()} disabled={ocupado || !grupoId || !mudou} className="px-7">
          Salvar Grupo
        </Button>
      </div>

      {/* A CONFIRMAÇÃO, com o que vai acontecer linha a linha. Ação definitiva pede confirmação, e
          esta mexe no agrupamento de dezenas de CNPJs de uma vez. */}
      {previa && (
        <Modal
          onClose={() => setPrevia(null)}
          ariaLabel="Confirmar o grupo"
          className="max-w-lg p-5"
        >
          <h2 className="mb-1 text-[17px] font-semibold text-text">Confirmar {previa.grupo.nome}</h2>
          <p className="mb-2 text-sm text-dim">
            {previa.resumo.entram} entra(m), {previa.resumo.trocam} vem(vêm) de outro grupo,{" "}
            {previa.resumo.saem} sai(saem) e fica(m) sem grupo, {previa.resumo.jaEstao} já estava(m).
          </p>
          {/* O ALCANCE EM ADMISSÕES, em destaque: é o número que muda no painel e no Gerenciador
              assim que o Salvar for clicado. */}
          {(previa.resumo.admissoesACarimbar > 0 || previa.resumo.admissoesADescarimbar > 0) && (
            <p className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px] text-text">
              {previa.resumo.admissoesACarimbar > 0 && (
                <>
                  <span className="font-semibold">{previa.resumo.admissoesACarimbar}</span> admissão(ões)
                  entra(m) no grupo {previa.grupo.nome}.
                </>
              )}
              {previa.resumo.admissoesACarimbar > 0 && previa.resumo.admissoesADescarimbar > 0 && " "}
              {previa.resumo.admissoesADescarimbar > 0 && (
                <>
                  <span className="font-semibold">{previa.resumo.admissoesADescarimbar}</span>{" "}
                  admissão(ões) fica(m) sem grupo.
                </>
              )}
            </p>
          )}

          {previa.efeitos.filter((e) => e.efeito !== "JA_ESTA").length > 0 && (
            <div className="mb-4 max-h-[260px] overflow-auto rounded-xl border border-[var(--border)]">
              {previa.efeitos
                .filter((e) => e.efeito !== "JA_ESTA")
                .map((e) => (
                  <div
                    key={e.codCliente}
                    className="border-b border-[var(--border)] px-3 py-2 text-[12.5px] last:border-b-0"
                  >
                    <span className="font-semibold text-text">
                      {e.codCliente} · {e.nomeOperacao?.trim() || e.razaoSocial}
                    </span>
                    <span className="ml-2 text-dim">
                      {e.efeito === "ENTRA" && "entra no grupo"}
                      {e.efeito === "TROCA" && `SAI de ${e.deGrupoNome} e entra em ${previa.grupo.nome}`}
                      {e.efeito === "SAI" && "sai do grupo e fica sem grupo"}
                      {e.admissoes > 0 && `, com ${e.admissoes} admissão(ões)`}
                    </span>
                  </div>
                ))}
            </div>
          )}

          <p className="mb-4 text-[12px] text-faint">
            Salvar carimba as admissões dos CNPJs acima, as concluídas junto com as vivas, e elas
            aparecem no grupo na hora, no Controle Gerencial e no Gerenciador. O nome de operação de
            cada um passa a ser {previa.grupo.nome}, que é o que padroniza as grafias. Quem sai fica
            sem grupo e mantém o nome que está, para você ajustar no editar do cliente. Nenhuma
            rotina automática mexe nisso depois: só muda quando alguém altera o agrupamento aqui.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPrevia(null)} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={ocupado} className="px-6">
              {ocupado ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </Modal>
      )}

      {/* AJUSTE 5: o editor de vagas por cargo. Ao fechar, recarrega a lista (o total único do grupo
          já foi sincronizado com a soma no backend) e as metas por cargo. */}
      {metasModalAberto && grupo && (
        <MetasPorCargoModal
          grupoId={grupo.id}
          grupoNome={grupo.nome}
          cargos={cargosCatalogo}
          metasIniciais={metasCargo.map((m) => ({ ...m }))}
          onFechar={() => {
            setMetasModalAberto(false);
            void carregar().catch(() => setErro("Não foi possível recarregar os grupos."));
            void carregarMetasCargo(grupo.id);
          }}
        />
      )}
    </Modal>
  );
}
