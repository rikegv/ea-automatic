"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { caixaAlta } from "@/lib/nome";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/cn";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { DIRECAO_INICIAL, type Direcao, type Ordenacao } from "@/lib/ordenacao";

/**
 * BENEFÍCIOS (§A.17 etapa 4): a fila de quem tem benefício a cadastrar.
 *
 * A TELA RESPONDE UMA PERGUNTA SÓ: de quem já fechou o Cadastro, quem tem VT, VR, VA e AM. É tela de
 * gestão para o time lançar os benefícios nos sistemas, no mesmo conceito da fila da Integração.
 *
 * A FILA É QUEM TEM O CADASTRO CONCLUÍDO (etapa 1, decisão do diretor): a leitura traz também as que
 * já estavam cadastradas antes de a tela existir, e não só as futuras. Isso é feito por LEITURA, sem
 * escrever nada no banco, então nenhuma contagem de nenhuma outra tela se mexe.
 *
 * DUAS FONTES DE BENEFÍCIO NA MESMA TABELA, porque a base tem as duas: o pacote ESTRUTURADO das
 * admissões novas, que vira as quatro colunas de sim ou não mais o "+N", e o TEXTO das importadas,
 * que ocupa a faixa dos benefícios como célula única. É o mesmo convívio que a ficha da Integração
 * já resolve assim; mostrar só o estruturado deixaria a linha da importada vazia e mentirosa.
 *
 * PRÓXIMA ETAPA, já mapeada e NÃO construída aqui: o time editar o pacote pela tela (CRUD) e o
 * status por benefício (cadastrado, liberado, finalizado). O campo `status_cadastro_beneficio` já
 * existe no banco, dormente, esperando essa etapa.
 */

interface Linha {
  admissaoId: string;
  candidato: string;
  dataAdmissao: string | null;
  /** Matrícula da admissão, a mesma que a importação grava. Só leitura nesta tela. */
  matricula: string | null;
  codCliente: string | null;
  cliente: string | null;
  /**
   * CAMADA DE PAGAMENTO, vinda do cadastro do CLIENTE (§A.17 etapa 4). Leitura pura: nenhuma das
   * duas entra em régua, contagem ou farol.
   */
  periodicidade: "CADA_5_DIAS" | "CADA_15_DIAS" | "MENSAL" | null;
  /** Já calculada no backend (admissão + dias do cliente). A tela só formata. */
  primeiroCredito: string | null;
  entrouEm: string | null;
  /** Estágio do pacote: decide o botão da linha e a aba em que ela vive. */
  status: "AGUARDANDO_CALCULO" | "BENEFICIO_CALCULADO";
  principais: Record<string, boolean>;
  /** Valor cadastrado de cada um dos quatro principais. Nulo = tem o benefício, sem valor. */
  valores: Record<string, string | null>;
  outros: { nome: string; valor: string | null }[];
  /** O pacote com os ids do catálogo: é o que o modal de edição carrega e salva. */
  pacote: { beneficioId: string; nome: string; valor: string | null }[];
  /** Texto achatado da importada. Preenchido SÓ quando não há pacote estruturado. */
  textoImportado: string | null;
}

interface Resposta {
  items: Linha[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** As siglas das colunas fixas, na ordem que o backend manda. */
  principais: string[];
  clientes: { codCliente: string; nome: string }[];
  /** Os três números do topo, no MESMO recorte de busca e filtros, sem o filtro de aba. */
  kpis: { total: number; aguardando: number; calculados: number };
}

/**
 * O TEXTO DE CADA PERIODICIDADE. Só exibição: esta coluna é informativa e não alimenta cálculo
 * nenhum (decisão do diretor, que tirou o cálculo daqui de propósito). Quem calcula é a coluna do
 * primeiro crédito, a partir dos dias cadastrados no cliente.
 */
const ROTULO_PERIODICIDADE: Record<string, string> = {
  CADA_5_DIAS: "a cada 5 dias",
  CADA_15_DIAS: "a cada 15 dias",
  MENSAL: "uma vez por mês",
};

function fmtData(iso?: string | null): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Cliente sempre COM O CÓDIGO, que é a chave que a operação usa para falar do cliente (§A.3). */
function rotuloCliente(cod: string | null, nome: string | null): string {
  if (!cod && !nome) return "não informado";
  if (!nome) return cod!;
  return `${cod} · ${nome}`;
}

/**
 * Valor em reais, do jeito que o banco guarda (numeric como string). Sem valor devolve `null`, e
 * quem chama decide o que dizer: "não informado" na tabela, uma frase inteira no modal.
 */
function fmtValor(valor: string | null): string | null {
  if (valor === null || valor === "") return null;
  const n = Number(valor);
  if (Number.isNaN(n)) return valor;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A célula de sim ou não de um benefício principal.
 *
 * CHECK VERDE para quem tem, e um "não" apagado para quem não tem. O X vermelho fica de fora de
 * propósito: pela §A.12 ele significa RECUSADO, e não ter VA não é recusa, é o pacote da pessoa
 * sendo o que é. Vermelho ali faria a tela gritar problema onde não há.
 *
 * CLICÁVEL SÓ QUANDO TEM (decisão do diretor): o clique abre o valor cadastrado, e não há valor a
 * mostrar de quem não tem o benefício. Célula sem clique continua sendo texto, sem borda nem cursor
 * prometendo uma ação que não existe.
 */
function CelulaBeneficio({ tem, onVer }: { tem: boolean; onVer?: () => void }) {
  return (
    <td className="text-center">
      {tem ? (
        <button
          type="button"
          onClick={onVer}
          title="Ver o valor cadastrado"
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[13px] font-semibold text-ok transition hover:bg-[var(--surface-2)]"
        >
          <Icon name="check" className="h-4 w-4" />
          Sim
        </button>
      ) : (
        <span className="text-[13px] text-faint">Não</span>
      )}
    </td>
  );
}

/**
 * AS DUAS ABAS (decisão do diretor). A Fila de Trabalho é quem ainda aguarda cálculo e vive limpa:
 * marcar como calculado tira a pessoa dali e a manda para Finalizados. A aba É o status, sem
 * marcação extra. TODOS não é aba: é o destino do KPI do total, que mostra os dois estágios juntos.
 */
const ABAS = [
  { chave: "FILA" as const, rotulo: "Fila De Trabalho" },
  { chave: "FINALIZADOS" as const, rotulo: "Finalizados" },
];

/**
 * O FAROL DOS BENEFÍCIOS: a coluna STATUS diz o ESTADO, na mesma pill do Farol Admissional que o time
 * já lê todo dia (`StatusPill`, com o ícone dinâmico da §A.12). Vermelho é o que falta calcular,
 * verde é o que já está calculado. É informativa e não clica: quem age é a coluna de Ações.
 */
const STATUS_PILL: Record<string, { tom: "dg" | "ok"; rotulo: string }> = {
  AGUARDANDO_CALCULO: { tom: "dg", rotulo: "Benefício Não Calculado" },
  BENEFICIO_CALCULADO: { tom: "ok", rotulo: "Benefício Calculado" },
};

/**
 * A RÉGUA DA AÇÃO, que é um TOGGLE (decisão do diretor): são dois estágios, então o mesmo lugar marca
 * como calculado e reverte.
 *
 * O BOTÃO É ÍCONE, SEM TEXTO (correção do diretor). Ele dizia "Benefício Calculado" em vermelho, e
 * lido de relance parecia AFIRMAR que o benefício já estava calculado, quando era o botão PARA
 * calcular. Agora a divisão é limpa: a coluna Status diz o ESTADO (pill), a coluna Ações diz o que
 * FAZER (ícone), e o title escreve a ação por extenso.
 */
const ACAO: Record<
  string,
  { para: string; titulo: string; rotuloLote: string; cor: string; icone: "check" | "refresh" }
> = {
  AGUARDANDO_CALCULO: {
    para: "BENEFICIO_CALCULADO",
    titulo: "Marcar como calculado",
    rotuloLote: "Marcar Calculado De Todos",
    // Verde: o ícone é a ação de CONCLUIR o cálculo, e verde é o que o sistema usa para concluir.
    cor: "var(--ok)",
    icone: "check",
  },
  BENEFICIO_CALCULADO: {
    para: "AGUARDANDO_CALCULO",
    titulo: "Reverter para Benefício Não Calculado, trazendo de volta para a fila",
    rotuloLote: "Reverter Todos",
    cor: "var(--warn)",
    icone: "refresh",
  },
};

const STATUS_ROTULO: Record<string, string> = {
  AGUARDANDO_CALCULO: "Aguardando Cálculo",
  BENEFICIO_CALCULADO: "Benefício Calculado",
};

const PACOTE_OPCOES = [
  { value: "", label: "Todos" },
  { value: "ESTRUTURADO", label: "Com Pacote Estruturado" },
  { value: "IMPORTADO", label: "Só Texto Importado" },
];

export default function BeneficiosPage() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // FILTROS. `busca` é o que a pessoa digita; `q` é o que já foi para o servidor, atrasado pelo
  // debounce: sem essa separação, cada tecla vira uma consulta sobre 1.600 admissões.
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState("");
  const [codCliente, setCodCliente] = useState<string[]>([]);
  const [com, setCom] = useState<string[]>([]);
  const [sem, setSem] = useState<string[]>([]);
  const [pacote, setPacote] = useState("");
  const [page, setPage] = useState(1);
  /**
   * ORDENAÇÃO SERVIDA PELO BACKEND, não pela tela (decisão do diretor). A fila é paginada no servidor
   * (50 de 1.640): ordenar em memória ordenaria só a página aberta, e a primeira linha da tela não
   * seria a primeira da fila. O estado aqui é só a coluna e a direção escolhidas; quem ordena é a API.
   */
  const [ordem, setOrdem] = useState<{ chave: string; dir: Direcao } | null>(null);
  /** Célula clicada: abre o modal com o valor cadastrado daquele benefício. */
  const [detalhe, setDetalhe] = useState<{ linha: Linha; sigla: string | null } | null>(null);
  const [aba, setAba] = useState<"FILA" | "FINALIZADOS" | "TODOS">("FILA");
  /** Ids marcados. Vive por PÁGINA: trocar de página ou de filtro limpa, para o lote nunca surpreender. */
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [confirmarLote, setConfirmarLote] = useState<{ para: string; rotulo: string; n: number } | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  /** Linha em edição: abre o modal do pacote. */
  const [editando, setEditando] = useState<Linha | null>(null);
  /** Catálogo de benefícios ATIVOS, para o modal oferecer o que existe. Carregado uma vez. */
  const [catalogo, setCatalogo] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    apiFetch<{ id: string; nome: string }[]>("/catalogos/beneficios")
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQ(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  /** Mudar QUALQUER filtro volta para a primeira página: página 7 de um recorte novo não existe. */
  useEffect(() => {
    setPage(1);
  }, [q, codCliente, com, sem, pacote, ordem, aba]);

  /**
   * TROCAR DE PÁGINA, DE FILTRO OU DE ABA LIMPA A SELEÇÃO. Sem isso, "selecionar todos" na página 1 e
   * depois agir na página 3 aplicaria o lote a gente que a pessoa não está vendo, que é o pior jeito
   * de uma ação em massa errar.
   */
  useEffect(() => {
    setSelecao(new Set());
  }, [q, codCliente, com, sem, pacote, ordem, aba, page]);

  /**
   * O MESMO CABEÇALHO CLICÁVEL das demais tabelas, com a ordenação indo para a API.
   *
   * `ColunaOrdenavel` só precisa de `ordem` e `alternar`, então a tela entrega um objeto com a MESMA
   * forma do `useOrdenacao` e a seta, o title e o `aria-sort` vêm de graça, idênticos aos das outras
   * telas. `itens` vai vazio de propósito: quem ordena aqui é o banco, e ninguém lê essa lista.
   *
   * Os 3 modos continuam valendo, com a direção do primeiro clique saindo do MESMO `DIRECAO_INICIAL`
   * compartilhado: texto começa em A-Z, data na mais recente e número no maior.
   */
  const tipoDaColuna = (chave: string) =>
    chave === "matricula"
      ? "texto"
      : chave === "dataAdmissao" || chave === "primeiroCredito"
      ? "data"
      : chave === "outros"
        ? "numero"
        : // As quatro siglas e a coluna Status são presença/estado: ordenam por rank, não por texto.
          chave.length === 2 || chave === "status"
          ? "status"
          : "texto";
  const ord: Ordenacao<Linha> = {
    itens: [],
    ordem,
    alternar: (chave: string) =>
      setOrdem((cur) =>
        cur && cur.chave === chave
          ? { chave, dir: cur.dir === "asc" ? "desc" : "asc" }
          : { chave, dir: DIRECAO_INICIAL[tipoDaColuna(chave)] },
      ),
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (codCliente.length) p.set("codCliente", codCliente.join(","));
    if (com.length) p.set("com", com.join(","));
    if (sem.length) p.set("sem", sem.join(","));
    if (pacote) p.set("pacote", pacote);
    p.set("aba", aba);
    if (ordem) {
      p.set("ordenarPor", ordem.chave);
      p.set("direcao", ordem.dir);
    }
    p.set("page", String(page));
    try {
      setDados(await apiFetch<Resposta>(`/beneficios-fila?${p.toString()}`));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar a fila de benefícios.");
    } finally {
      setCarregando(false);
    }
  }, [q, codCliente, com, sem, pacote, ordem, aba, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);



  /**
   * AVANÇA O ESTÁGIO. O MESMO caminho serve o clique da linha (um id) e o lote (N ids), porque a
   * régua é a mesma e mora no backend: só anda quem está no estágio anterior.
   */
  async function avancar(ids: string[], para: string) {
    setAgindo(true);
    setErro(null);
    try {
      const r = await apiFetch<{ avancadas: number; ignoradas: number }>("/beneficios-fila/avancar", {
        method: "POST",
        body: { ids, para },
      });
      // A resposta diz quantas ANDARAM e quantas ficaram: sem isso o time acha que finalizou 10
      // quando finalizou 7, e é justamente no lote que essa diferença aparece.
      setFlash(
        r.ignoradas > 0
          ? `${r.avancadas} atualizada(s). ${r.ignoradas} já estava(m) em outro estágio.`
          : `${r.avancadas} atualizada(s).`,
      );
      setSelecao(new Set());
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao atualizar o estágio.");
    } finally {
      setAgindo(false);
      setConfirmarLote(null);
    }
  }

  function limparFiltros() {
    setCodCliente([]);
    setCom([]);
    setSem([]);
    setPacote("");
  }

  const siglas = dados?.principais ?? ["VT", "VR", "VA", "AM"];
  /** Seleção, Candidato, Data adm., Matrícula, Cliente, Status, Ações, as siglas e o "+N". */
  const colunas = 5 + siglas.length + 2;
  /** Todas as linhas da página são selecionáveis: os dois estágios têm ação (marcar ou reverter). */
  const selecionaveis = dados?.items ?? [];
  const filtrosAtivos = codCliente.length + com.length + sem.length + (pacote ? 1 : 0);

  // As opções do seletor de cliente vêm da fila INTEIRA (o backend as monta assim), então filtrar por
  // um cliente não some com os outros da lista.
  const opcoesCliente = useMemo(
    () =>
      (dados?.clientes ?? []).map((c) => ({
        value: c.codCliente,
        label: `${c.codCliente} · ${c.nome}`,
      })),
    [dados?.clientes],
  );
  const opcoesBeneficio = useMemo(() => siglas.map((s) => ({ value: s, label: s })), [siglas]);

  return (
    <>
      <PageHead
        eyebrow="Cadastro de benefícios"
        title="Benefícios"
        subtitle="Quem fechou o Cadastro e tem benefício a lançar, com o pacote de cada pessoa."
      />

      {/* KPIs CLICÁVEIS (decisão do diretor): os três números do topo são o resumo E o filtro. Eles
          contam o mesmo recorte de busca e filtros, sem o filtro de aba, então somam por construção:
          total = não calculados + calculados. Clicar troca a visão, e a selecionada fica destacada. */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            { chave: "TODOS" as const, rotulo: "Total Na Esteira De Benefícios", valor: dados?.kpis.total, cor: undefined },
            { chave: "FILA" as const, rotulo: `Não Calculados, ${STATUS_ROTULO.AGUARDANDO_CALCULO}`, valor: dados?.kpis.aguardando, cor: "var(--danger)" },
            { chave: "FINALIZADOS" as const, rotulo: `Calculados, ${STATUS_ROTULO.BENEFICIO_CALCULADO}`, valor: dados?.kpis.calculados, cor: "var(--ok)" },
          ]
        ).map((k) => (
          <button
            key={k.chave}
            type="button"
            onClick={() => setAba(k.chave)}
            aria-pressed={aba === k.chave}
            title="Clique para ver estes registros na tabela"
            className={cn(
              "flex min-h-[84px] flex-col justify-between rounded-xl border px-3.5 py-3 text-left transition",
              aba === k.chave
                ? "border-[var(--accent)] bg-[var(--surface-2)]"
                : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]",
            )}
          >
            <span className="text-xs leading-snug text-dim">{k.rotulo}</span>
            <span
              className="text-[30px] font-semibold leading-none tabular-nums"
              style={{ color: k.cor }}
            >
              {k.valor ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ABAS. A Fila de Trabalho é quem aguarda cálculo; Finalizados guarda quem já foi calculado. */}
      <div className="mb-4 flex items-center gap-2">
        {ABAS.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => setAba(a.chave)}
            className={cn(
              "rounded-xl border px-3.5 py-2 text-sm font-semibold transition",
              aba === a.chave
                ? "border-[var(--accent)] bg-[var(--surface-2)] text-text"
                : "border-[var(--border)] bg-[var(--surface)] text-dim hover:text-text",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {/* BUSCA E FILTROS na mesma faixa, no padrão das demais telas de gestão: o campo de texto ocupa
          a largura e o ícone de filtro fica na ponta, com o badge de filtros ativos. */}
      <div className="mb-4 flex items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome do candidato ou cliente"
          aria-label="Buscar por nome do candidato ou cliente"
          className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-sm text-text outline-none transition placeholder:text-faint focus:border-[var(--accent)]"
        />
        <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
          <FiltroCampo label="Cliente">
            <MultiSelect
              values={codCliente}
              onChange={setCodCliente}
              options={opcoesCliente}
              placeholder="Todos os clientes"
              ariaLabel="Filtrar por cliente"
            />
          </FiltroCampo>
          {/* COM e SEM separados, e não um sim ou não por benefício: é o que deixa pedir "tem VT e
              NÃO tem VR" de uma vez, que é como se acha quem ficou pela metade. */}
          <FiltroCampo label="Com o benefício">
            <MultiSelect
              values={com}
              onChange={setCom}
              options={opcoesBeneficio}
              placeholder="Qualquer um"
              ariaLabel="Filtrar quem tem o benefício"
            />
          </FiltroCampo>
          <FiltroCampo label="Sem o benefício">
            <MultiSelect
              values={sem}
              onChange={setSem}
              options={opcoesBeneficio}
              placeholder="Qualquer um"
              ariaLabel="Filtrar quem não tem o benefício"
            />
          </FiltroCampo>
          <FiltroCampo label="Pacote">
            <Select
              value={pacote}
              onChange={setPacote}
              options={PACOTE_OPCOES}
              placeholder="Todos"
              ariaLabel="Filtrar por tipo de pacote"
            />
          </FiltroCampo>
        </FiltroTrigger>
      </div>

      {/* AÇÃO EM MASSA. Só aparece com alguém marcado, e o rótulo diz EXATAMENTE o que foi marcado:
          a página filtrada, não a fila inteira. É a diferença entre finalizar 20 e finalizar 1.640. */}
      {selecao.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--accent)] bg-[var(--surface-2)] px-3 py-2.5">
          <span className="text-sm text-text">
            {selecao.size} selecionada(s) nesta página
          </span>
          {(["AGUARDANDO_CALCULO", "BENEFICIO_CALCULADO"] as const).map((de) => {
            const passo = ACAO[de];
            if (!passo) return null;
            const alvos = (dados?.items ?? []).filter(
              (l) => selecao.has(l.admissaoId) && l.status === de,
            );
            if (!alvos.length) return null;
            return (
              <Button
                key={de}
                onClick={() =>
                  setConfirmarLote({ para: passo.para, rotulo: passo.rotuloLote, n: alvos.length })
                }
                disabled={agindo}
                className="px-3 py-2 text-[13px]"
              >
                {passo.rotuloLote} ({alvos.length})
              </Button>
            );
          })}
          <button
            type="button"
            onClick={() => setSelecao(new Set())}
            className="ml-auto text-[13px] text-dim underline-offset-2 hover:text-text hover:underline"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {flash && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-ok">
          {flash}
        </p>
      )}

      {erro && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* Largura mínima para a tabela ROLAR em vez de espremer as colunas de texto (§A.20). As
              larguras somam 100%: o nome e o cliente ficam com a folga, porque são o que se lê.
              1000px é o teto que ainda CABE a 1366 com a barra lateral aberta (§A.20): acima disso a
              coluna Outros nascia fora da tela, e a fila é lida justamente por ela. */}
          {/* `w-full` com as larguras em PORCENTAGEM: a tabela ocupa o espaço disponível e as colunas
              crescem junto, em vez de sobrar faixa vazia à direita. O mínimo continua existindo para
              a tabela rolar em telas estreitas, em vez de espremer (§A.20). O mínimo subiu para 1340px
              com a entrada das colunas Status e Matrícula: é onde todos os títulos ainda cabem
              inteiros no cabeçalho. Abaixo disso a tabela ROLA, que é o comportamento pedido, em vez
              de truncar o título da coluna (§A.20). */}
          <table className="ds-table w-full min-w-[1620px] table-fixed">
            <thead>
              <tr>
                {/* SELEÇÃO. O "todos" marca a PÁGINA FILTRADA, e o title diz isso com todas as
                    letras: quem marca precisa saber que não marcou os 1.640. */}
                <th className="w-[3%]">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas as admissões desta página"
                    title="Seleciona as admissões desta página, não a fila inteira"
                    checked={selecionaveis.length > 0 && selecao.size === selecionaveis.length}
                    onChange={(e) =>
                      setSelecao(
                        e.target.checked ? new Set(selecionaveis.map((l) => l.admissaoId)) : new Set(),
                      )
                    }
                    disabled={selecionaveis.length === 0}
                  />
                </th>
                {/* MATRÍCULA ABRE A LINHA (decisão do diretor): é o número pelo qual a folha chama a
                    pessoa, e o time confere por ele antes do nome. É a mesma matrícula que a
                    importação da frente de Cadastro grava; aqui é só leitura. */}
                <ColunaOrdenavel as="th" ord={ord} chave="matricula" className="w-[8%]">
                  Matrícula
                </ColunaOrdenavel>
                {/* "NOME", e não "Candidato" (decisão do diretor): quem está nesta fila já foi
                    admitido, é funcionário. Vale para todo rótulo de coluna e campo do sistema. */}
                <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[11%]">
                  Nome
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="dataAdmissao" className="w-[8%]">
                  Data adm.
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[10%]">
                  Cliente
                </ColunaOrdenavel>
                {/* CAMADA DE PAGAMENTO, as duas juntas e logo depois do Cliente, porque as duas
                    SAEM do cadastro dele: a periodicidade é o texto cadastrado, e a data é a única
                    conta desta camada. Quem não tem regra cadastrada mostra "não informado" nas
                    duas, em vez de um traço ou de uma data chutada (§A.11). */}
                <ColunaOrdenavel as="th" ord={ord} chave="periodicidade" className="w-[9%]">
                  Periodicidade
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="primeiroCredito" className="w-[9%]">
                  1º crédito
                </ColunaOrdenavel>
                {/* STATUS junto das INFORMATIVAS (decisão do diretor), antes das ações: o consultor
                    bate o olho e vê o farol dos benefícios sem clicar em nada. Ordena pelo mesmo
                    enum que a pill mostra, então seta e etiqueta nunca discordam. */}
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[10%]">
                  Status
                </ColunaOrdenavel>
                {/* AÇÕES NO CENTRO (decisão do diretor): na ponta direita ficava escondida, e é a
                    coluna que a pessoa usa a cada linha. Vem logo depois do Cliente, que é onde o
                    olho já está quando decide agir. */}
                <th className="w-[6%]">Ações</th>
                {siglas.map((s) => (
                  <ColunaOrdenavel key={s} as="th" ord={ord} chave={s} className="w-[5%]">
                    {s}
                  </ColunaOrdenavel>
                ))}
                <ColunaOrdenavel as="th" ord={ord} chave="outros" className="w-[6%]">
                  Outros
                </ColunaOrdenavel>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={colunas} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : !dados || dados.items.length === 0 ? (
                <tr>
                  <td colSpan={colunas} className="py-8 text-center text-faint">
                    {filtrosAtivos > 0 || q.trim()
                      ? "Nenhuma admissão para esta busca."
                      : "Nenhuma admissão na fila. Elas entram aqui quando o Cadastro conclui."}
                  </td>
                </tr>
              ) : (
                dados.items.map((l) => {
                  return (
                    <Fragment key={l.admissaoId}>
                      <tr>
                        <td className="text-center">
                          {ACAO[l.status] ? (
                            <input
                              type="checkbox"
                              aria-label={`Selecionar ${l.candidato}`}
                              checked={selecao.has(l.admissaoId)}
                              onChange={(e) =>
                                setSelecao((atual) => {
                                  const proximo = new Set(atual);
                                  if (e.target.checked) proximo.add(l.admissaoId);
                                  else proximo.delete(l.admissaoId);
                                  return proximo;
                                })
                              }
                            />
                          ) : null}
                        </td>
                        <td className="text-center tabular-nums">
                          {l.matricula ?? <span className="text-faint">não informado</span>}
                        </td>
                        <td className="font-semibold">{caixaAlta(l.candidato)}</td>
                        <td className="text-center tabular-nums">{fmtData(l.dataAdmissao)}</td>
                        {/* CENTRALIZADO para casar com o cabeçalho (§A.12): a coluna era o único
                            ponto em que título e conteúdo apontavam para lados diferentes. */}
                        <td className="text-center">{rotuloCliente(l.codCliente, l.cliente)}</td>
                        <td className="text-center">
                          {l.periodicidade ? (
                            ROTULO_PERIODICIDADE[l.periodicidade]
                          ) : (
                            <span className="text-faint">não informado</span>
                          )}
                        </td>
                        <td
                          className="text-center tabular-nums"
                          title="Data de admissão mais os dias até o primeiro crédito cadastrados no cliente, contando o próprio dia da admissão"
                        >
                          {l.primeiroCredito ? (
                            fmtData(l.primeiroCredito)
                          ) : (
                            <span className="text-faint">não informado</span>
                          )}
                        </td>
                        <td className="overflow-hidden text-center">
                          <span className="inline-flex max-w-full justify-center">
                            <StatusPill
                              tone={STATUS_PILL[l.status].tom}
                              label={STATUS_PILL[l.status].rotulo}
                            />
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-1.5">
                            {ACAO[l.status] && (
                              <button
                                type="button"
                                onClick={() => avancar([l.admissaoId], ACAO[l.status].para)}
                                disabled={agindo}
                                title={ACAO[l.status].titulo}
                                aria-label={ACAO[l.status].titulo}
                                style={{ color: ACAO[l.status].cor, borderColor: ACAO[l.status].cor }}
                                className="grid h-8 w-8 flex-none place-items-center rounded-lg border transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                              >
                                <Icon name={ACAO[l.status].icone} className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditando(l)}
                              title="Editar os benefícios no cadastro do candidato"
                              aria-label="Editar os benefícios"
                              className="grid h-8 w-8 flex-none place-items-center rounded-lg border border-[var(--border)] text-dim transition hover:border-[var(--accent)] hover:text-text"
                            >
                              <Icon name="pen" className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                        {l.textoImportado ? (
                          /* IMPORTADA: o texto da planilha ocupa a faixa inteira dos benefícios, em
                             vez de fingir quatro colunas de sim ou não que ninguém apurou. */
                          <td
                            colSpan={siglas.length + 1}
                            className="text-[13px] text-dim"
                            title={l.textoImportado}
                          >
                            {l.textoImportado}
                          </td>
                        ) : (
                          <>
                            {siglas.map((s) => (
                              <CelulaBeneficio
                                key={s}
                                tem={Boolean(l.principais[s])}
                                onVer={() => setDetalhe({ linha: l, sigla: s })}
                              />
                            ))}
                            <td className="text-center">
                              {l.outros.length === 0 ? (
                                <span className="text-[13px] text-faint">Não</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDetalhe({ linha: l, sigla: null })}
                                  title="Ver os demais benefícios e seus valores"
                                  className="rounded-lg border border-[var(--border)] px-2 py-1 text-[13px] font-semibold text-dim transition hover:border-[var(--accent)] hover:text-text"
                                >
                                  +{l.outros.length}
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {dados && dados.total > 0 && (
          <div className="flex flex-wrap items-center gap-3 px-3 py-2">
            <span className="text-[12.5px] text-faint">
              {dados.total} {dados.total === 1 ? "admissão" : "admissões"} na fila · página{" "}
              {dados.page} de {dados.totalPages}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={dados.page <= 1}
                aria-label="Página anterior"
                className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:text-text disabled:opacity-40"
              >
                <Icon name="left" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(dados.totalPages, p + 1))}
                disabled={dados.page >= dados.totalPages}
                aria-label="Próxima página"
                className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:text-text disabled:opacity-40"
              >
                <Icon name="right" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* CONFIRMAÇÃO DO LOTE, com a CONTAGEM: ação em massa sem número é como assinar em branco. */}
      {confirmarLote && (
        <ConfirmDialog
          open
          title={confirmarLote.rotulo}
          message={`Esta ação vai atualizar ${confirmarLote.n} admissão(ões) selecionada(s) nesta página. As que já estiverem em outro estágio ficam como estão.`}
          confirmLabel={confirmarLote.rotulo}
          busy={agindo}
          onCancel={() => setConfirmarLote(null)}
          onConfirm={() =>
            avancar(
              (dados?.items ?? [])
                .filter(
                  (l) => selecao.has(l.admissaoId) && ACAO[l.status]?.para === confirmarLote.para,
                )
                .map((l) => l.admissaoId),
              confirmarLote.para,
            )
          }
        />
      )}

      {editando && (
        <ModalPacote
          linha={editando}
          catalogo={catalogo}
          onClose={() => setEditando(null)}
          onSalvo={async (msg) => {
            setEditando(null);
            setFlash(msg);
            await carregar();
          }}
        />
      )}

      {/* MODAL DO VALOR (decisão do diretor). Leitura sobre leitura: não busca nada, só recorta o que
          a linha já trouxe. Uma célula clicada mostra aquele benefício; o "+N" mostra os demais. */}
      {detalhe && (
        <Modal
          onClose={() => setDetalhe(null)}
          className="max-w-sm"
          ariaLabel={detalhe.sigla ? `Valor do ${detalhe.sigla}` : "Demais benefícios"}
        >
          <h2 className="mb-1 text-[17px] font-semibold text-text">
            {detalhe.sigla ? `Valor Do ${detalhe.sigla}` : "Demais Benefícios"}
          </h2>
          <p className="mb-4 text-sm text-dim">{caixaAlta(detalhe.linha.candidato)}</p>

          {detalhe.sigla ? (
            <ValorDoBeneficio sigla={detalhe.sigla} valor={detalhe.linha.valores?.[detalhe.sigla] ?? null} />
          ) : (
            <ul className="flex flex-col gap-2">
              {detalhe.linha.outros.map((b) => (
                <li
                  key={b.nome}
                  className="flex items-baseline justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <span className="text-sm text-text">{b.nome}</span>
                  <span className="text-sm font-semibold tabular-nums text-text">
                    {fmtValor(b.valor) ?? <span className="font-normal text-faint">sem valor</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}

/**
 * O valor de UM benefício, no modal.
 *
 * O VT TEM FRASE PRÓPRIA (decisão do diretor): ele existe no pacote da pessoa, mas o valor só nasce
 * quando o formulário de VT for ligado (§A.17). Dizer "sem valor" ali seria verdade pela metade e
 * mandaria alguém procurar um cadastro que ainda não existe; o lugar já está preparado para quando o
 * número chegar, sem tela nova.
 */
function ValorDoBeneficio({ sigla, valor }: { sigla: string; valor: string | null }) {
  const formatado = fmtValor(valor);
  if (formatado) {
    return (
      <p className="text-[30px] font-semibold leading-none tabular-nums text-text">{formatado}</p>
    );
  }
  return (
    <p className="text-sm text-dim">
      {sigla === "VT"
        ? "O valor do VT ainda não é cadastrado no sistema. Ele passa a vir do formulário de vale-transporte quando essa etapa for ligada."
        : "Este benefício está no pacote da pessoa, mas não tem valor cadastrado."}
    </p>
  );
}

/**
 * EDIÇÃO DO PACOTE, e ela grava NO CADASTRO DO CANDIDATO (`admissao_beneficio`), que é a fonte única.
 * A tela de Benefícios não vira fonte paralela: editar aqui é editar lá, e o backend regrava o
 * sinalizador na MESMA transação, para a coluna "Pendências Obrig." e o KPI não discordarem.
 *
 * O PAYLOAD É O PACOTE COMPLETO, não um delta: desmarcar é tão legítimo quanto marcar, e o backend
 * substitui o conjunto inteiro. Valor é opcional, porque benefício sem valor cadastrado é estado
 * real (o VT hoje é assim).
 */
function ModalPacote({
  linha,
  catalogo,
  onClose,
  onSalvo,
}: {
  linha: Linha;
  catalogo: { id: string; nome: string }[];
  onClose: () => void;
  onSalvo: (mensagem: string) => void | Promise<void>;
}) {
  const [itens, setItens] = useState<Record<string, { marcado: boolean; valor: string }>>(() => {
    const inicial: Record<string, { marcado: boolean; valor: string }> = {};
    for (const c of catalogo) {
      const atual = linha.pacote.find((p) => p.beneficioId === c.id);
      inicial[c.id] = { marcado: Boolean(atual), valor: atual?.valor ?? "" };
    }
    return inicial;
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const marcados = Object.values(itens).filter((i) => i.marcado).length;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const payload = Object.entries(itens)
        .filter(([, v]) => v.marcado)
        .map(([beneficioId, v]) => ({
          beneficioId,
          // Campo vazio vira null (benefício sem valor), e não zero: zero seria um valor cadastrado.
          valor: v.valor.trim() === "" ? null : Number(v.valor.replace(",", ".")),
        }));
      await apiFetch(`/beneficios-fila/${linha.admissaoId}/pacote`, {
        method: "PATCH",
        body: { itens: payload },
      });
      await onSalvo(`Benefícios de ${caixaAlta(linha.candidato)} atualizados no cadastro.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar os benefícios.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-lg" ariaLabel="Editar os benefícios">
      <h2 className="mb-1 text-[17px] font-semibold text-text">Editar Benefícios</h2>
      <p className="mb-1 text-sm text-dim">{caixaAlta(linha.candidato)}</p>
      <p className="mb-4 text-[12.5px] text-faint">
        o que for salvo aqui grava no cadastro do candidato, que é a fonte única
      </p>

      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="ea-scroll mb-4 flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto">
        {catalogo.map((c) => {
          const item = itens[c.id] ?? { marcado: false, valor: "" };
          return (
            <label
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
            >
              <input
                type="checkbox"
                checked={item.marcado}
                onChange={(e) =>
                  setItens((atual) => ({
                    ...atual,
                    [c.id]: { ...item, marcado: e.target.checked },
                  }))
                }
              />
              <span className="min-w-0 flex-1 truncate text-sm text-text">{c.nome}</span>
              <input
                type="text"
                inputMode="decimal"
                value={item.valor}
                onChange={(e) =>
                  setItens((atual) => ({ ...atual, [c.id]: { ...item, valor: e.target.value } }))
                }
                disabled={!item.marcado}
                placeholder="valor"
                aria-label={`Valor de ${c.nome}`}
                className="h-9 w-28 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-right text-sm text-text outline-none transition placeholder:text-faint focus:border-[var(--accent)] disabled:opacity-40"
              />
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-[12.5px] text-faint">{marcados} benefício(s) no pacote</span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-dim transition hover:text-text"
          >
            Cancelar
          </button>
          <Button onClick={salvar} disabled={salvando} className="px-4 py-2">
            {salvando ? "Salvando…" : "Salvar no cadastro"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
