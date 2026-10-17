"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { TIPO_MARCACAO_LABEL } from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { useSegmentos } from "@/lib/as-segmentos";
import { useComerciais } from "@/lib/as-comerciais";
import { casaBuscaCliente } from "@/lib/clientes-busca";
import { ImportarClientesModal } from "@/components/admin/ImportarClientesModal";
import { ClienteModal } from "@/components/admin/ClienteModal";
import type { Cliente, VinculoOpcao } from "@/components/admin/cliente-tipos";
import { LojasDoCliente } from "@/components/admin/LojasDoCliente";
import { GrupoDoCliente } from "@/components/admin/GrupoDoCliente";
import { GruposClienteLivreto } from "@/components/admin/GruposClienteLivreto";

// `Cliente` e `VinculoOpcao` moram em `components/admin/cliente-tipos` (compartilhados com o
// `ClienteModal`), para a página e o modal lerem a MESMA forma sem duplicar a interface.

interface AdmissaoAfetada {
  id: string;
  candidato: string;
  farol: string;
}

/** Os rótulos da periodicidade, os mesmos que a tela de Benefícios exibe. */
const OPCOES_PERIODICIDADE = [
  { valor: "CADA_5_DIAS", rotulo: "a cada 5 dias" },
  { valor: "CADA_15_DIAS", rotulo: "a cada 15 dias" },
  { valor: "MENSAL", rotulo: "uma vez por mês" },
];
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
  // Aviso de sucesso (ex.: contrato adicionado a um cliente que já existia). Some ao reabrir o modal.
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  // Filtros adicionais da lista (client-side, combinados em E lógico com o filtro de status).
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [soPendencia, setSoPendencia] = useState(false);
  // Modal de cadastro/edição: aberto sim/não + o cliente em edição (null = cadastrar).
  const [modalAberto, setModalAberto] = useState(false);
  const [clienteEmEdicao, setClienteEmEdicao] = useState<Cliente | null>(null);
  // codCliente com a ficha (linha) expandida.
  const [expandido, setExpandido] = useState<string | null>(null);
  /* O livreto dos GRUPOS (cenário 2). Vive DENTRO da tela de Clientes, e não num menu novo: quem
     administra cliente administra grupo (decisão do diretor), e um menu novo nasceria invisível
     para todo mundo até ser liberado um a um (§A.23). */
  const [gruposAberto, setGruposAberto] = useState(false);
  // Modal de cadastro em massa por planilha (ao lado de "Cadastrar Grupos").
  const [importarAberto, setImportarAberto] = useState(false);
  // Opções de vínculo (contrato), buscadas uma vez e repassadas ao modal.
  const [opcoesVinculo, setOpcoesVinculo] = useState<VinculoOpcao[]>([]);
  /* OS DOIS CATÁLOGOS DA ONDA E. Cada gancho é `useState` em volta de uma promessa memoizada por
     carga de página, então abrir esta tela custa UMA requisição por catálogo, e não uma por linha.
     A falha deles não derruba a tela: o seletor fica vazio e o resto do cadastro continua servindo,
     porque os dois campos são opcionais. */
  const catSegmentos = useSegmentos(token);
  const catComerciais = useComerciais(token);

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
    // A BUSCA CASA TODAS AS COLUNAS QUE A TABELA MOSTRA (pedido do diretor): código, razão social,
    // CNPJ, nome de operação, empresa (Soulan), CNPJ do vínculo, tipo de serviço e o rótulo de
    // status. Antes casava só razão social, código e nome de operação. A régua vive em
    // `casaBuscaCliente` (função pura, régua `normBusca` da Esteira), então o teste do tester guarda
    // o match de verdade em vez de uma réplica.
    return rows.filter((c) => {
      if (filtro === "ativos" && !c.ativo) return false;
      if (filtro === "inativos" && c.ativo) return false;
      if (filtroTipo && c.tipoServico !== filtroTipo) return false;
      if (!casaBuscaCliente(c, busca)) return false;
      if (soPendencia && !temPendencia(c)) return false;
      return true;
    });
  }, [rows, filtro, filtroTipo, busca, soPendencia]);

  // Ordenação clicável (OST visual, leva das 11 tabelas). Os campos opcionais entram como texto e o
  // vazio cai para o fim nas duas direções, então cliente sem CNPJ/operação/vínculo não ocupa o topo
  // só por inverter a seta. Tipo de serviço ordena pelo RÓTULO exibido, não pelo código cru.
  // A coluna do expansor e a de ações não entram: são controle, não dado.
  const colunas = useMemo<ColOrd<Cliente>[]>(
    () => [
      { chave: "codigo", tipo: "texto", valor: (c) => c.codCliente },
      { chave: "razao", tipo: "texto", valor: (c) => c.razaoSocial },
      { chave: "cnpj", tipo: "texto", valor: (c) => c.cnpj },
      { chave: "operacao", tipo: "texto", valor: (c) => c.nomeOperacao },
      { chave: "empresa", tipo: "texto", valor: (c) => c.empresaVinculo },
      { chave: "cnpjVinculo", tipo: "texto", valor: (c) => c.cnpjVinculo },
      { chave: "tipoServico", tipo: "texto", valor: (c) => c.tipoServicoRotulo },
      { chave: "status", tipo: "status", valor: (c) => (c.ativo ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, visiveis);

  // As opções de Segmento e Comercial (lista = ativos + o escolhido, mesmo inativo, para salvar não
  // apagar o dado) vivem agora dentro do `ClienteModal`, que recebe os catálogos por props.

  const nAtivos = useMemo(() => rows.filter((c) => c.ativo).length, [rows]);
  const nInativos = rows.length - nAtivos;

  // Abre o modal para CADASTRAR (sem cliente) ou EDITAR (com o cliente da linha). O envio e a
  // montagem do corpo (incluindo o CRUD completo e o contrato) vivem no `ClienteModal`.
  function abrirCadastro() {
    setClienteEmEdicao(null);
    setAviso(null);
    setError(null);
    setModalAberto(true);
  }

  function abrirEdicao(c: Cliente) {
    setClienteEmEdicao(c);
    setAviso(null);
    setError(null);
    setModalAberto(true);
  }

  function fecharModal() {
    setModalAberto(false);
    setClienteEmEdicao(null);
  }

  // Salvou (criou, editou ou somou um contrato): fecha, mostra o aviso quando houver e recarrega.
  function aposSalvar(mensagem?: string) {
    fecharModal();
    setAviso(mensagem ?? null);
    void load();
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
    const avisoAfetadas =
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
          avisoAfetadas,
      )
    )
      return;
    try {
      await apiFetch(`/admin/clientes/${encodeURIComponent(c.codCliente)}`, {
        method: "DELETE",
        token,
      });
      // Se o modal estava editando justamente este cliente, fecha para não ficar em cima do inativo.
      if (modalAberto && clienteEmEdicao?.codCliente === c.codCliente) fecharModal();
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

      {/* Filtros da lista: status (ativos/inativos/todos) + tipo, busca e pendência (E lógico). */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {/* CADASTRAR CLIENTE: abre o modal de cadastro (o mesmo modal da edição, em modo novo). O
            formulário inline que ficava no topo saiu daqui: agora é modal, como o resto do sistema. */}
        <Button onClick={abrirCadastro} className="px-4 py-1.5 text-[13px]">
          Cadastrar Cliente
        </Button>
        {/* CADASTRAR GRUPOS: o cenário 2 mora aqui, ao lado dos filtros de cliente, porque o grupo é
            uma camada por cima dos clientes que esta tela já administra. */}
        <Button
          variant="secondary"
          onClick={() => setGruposAberto(true)}
          className="px-4 py-1.5 text-[13px]"
        >
          Cadastrar Grupos
        </Button>
        {/* IMPORTAR PLANILHA: cadastro em massa de clientes por planilha, ao lado de Cadastrar
            Grupos. O modal lê o arquivo (prévia), mostra o que entra e o que é recusado por linha,
            e só grava no "Confirmar Importação". Recarrega a lista ao concluir. */}
        <Button
          variant="secondary"
          onClick={() => setImportarAberto(true)}
          className="px-4 py-1.5 text-[13px]"
        >
          Importar Planilha
        </Button>
        <span aria-hidden className="mx-1 h-5 w-px bg-[var(--border)]" />
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

        {/* ─ §A.35/§A.36: o QUARTO nativo, e o único dos quatro que não era uma troca direta ─────
            Ele é um filtro INLINE, e vivia com `h-auto w-auto py-1.5` justamente para encolher até a
            altura dos chips de status ao lado. O `Select` do design system tem a altura do
            formulário (o `.ds-select` é `padding: 12px 14px`), e posto aqui cru ele ficaria uma
            cabeça acima da linha inteira: os chips, a busca e a caixa de seleção deixariam de se
            alinhar, que é o esmagamento ao contrário da §A.20.
            A saída é dar ao GATILHO a mesma medida que o nativo tinha, e só a ele: o popover, a
            busca e o tema continuam sendo os do design system. A largura é fixa porque `w-auto` num
            botão de seletor encolheria para o rótulo selecionado, e a caixa mudaria de tamanho a
            cada escolha.
            MEDIDO no browser, nesta barra: os chips de status têm 30px, a busca ao lado tem 34px, o
            nativo tinha 33px e um `.ds-select` cru tem 46px. Com `py-1.5` e `text-[13.5px]` o
            gatilho fica em 34px, a mesma altura da busca vizinha. A largura, 9,5rem, cobre o rótulo
            mais longo ("Todos os tipos") e fica na casa dos 147px que o nativo ocupava. */}
        <Select
          className="w-[9.5rem] [&>button]:!px-3 [&>button]:!py-1.5 [&>button]:!text-[13.5px]"
          value={filtroTipo}
          onChange={setFiltroTipo}
          ariaLabel="Filtrar por tipo de serviço"
          placeholder="Todos os tipos"
          options={[
            { value: "", label: "Todos os tipos" },
            ...TIPOS_SERVICO.map((t) => ({ value: t.valor, label: t.rotulo })),
          ]}
        />

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar em todas as colunas"
          aria-label="Buscar cliente em todas as colunas"
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

      {/* Aviso de sucesso (ex.: "o cliente já existia, o contrato foi adicionado"). Tom positivo,
          some ao reabrir o modal ou ao fechar no X do próprio aviso. */}
      {aviso && (
        <p
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-[rgba(120,190,60,0.12)] px-3 py-2 text-sm text-[var(--ok)]"
          role="status"
        >
          <span>{aviso}</span>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Fechar aviso"
            className="shrink-0 text-dim hover:text-text"
          >
            ✕
          </button>
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        {/* Tabela larga → scroll horizontal contido, sem estourar o body. */}
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[960px]">
            <thead>
              <tr>
                <th className="w-8" />
                <ColunaOrdenavel as="th" ord={ord} chave="codigo">
                  Código
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="razao">
                  Razão social
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cnpj">
                  CNPJ
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="operacao">
                  Nome Operação
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="empresa">
                  Empresa (Soulan)
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cnpjVinculo">
                  CNPJ vínculo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="tipoServico">
                  Tipo de serviço
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status">
                  Status
                </ColunaOrdenavel>
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
                ord.itens.map((c) => {
                  const aberto = expandido === c.codCliente;
                  return (
                    <FragmentRow
                      key={c.codCliente}
                      c={c}
                      aberto={aberto}
                      onToggle={() => setExpandido(aberto ? null : c.codCliente)}
                      onEditar={() => abrirEdicao(c)}
                      onInativar={() => inativar(c)}
                      onReativar={() => reativar(c)}
                      onAbrirGrupos={() => setGruposAberto(true)}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {modalAberto && (
        <ClienteModal
          cliente={clienteEmEdicao}
          opcoesVinculo={opcoesVinculo}
          segmentos={catSegmentos.segmentos}
          segmentosErro={catSegmentos.erro}
          comerciais={catComerciais.comerciais}
          comerciaisErro={catComerciais.erro}
          token={token}
          onClose={fecharModal}
          onSalvo={aposSalvar}
        />
      )}
      {gruposAberto && <GruposClienteLivreto onFechar={() => setGruposAberto(false)} />}
      {importarAberto && (
        <ImportarClientesModal
          onClose={() => setImportarAberto(false)}
          onConcluido={() => {
            setImportarAberto(false);
            void load();
          }}
        />
      )}
    </>
  );
}

/** Rótulo da periodicidade para LEITURA, derivado da mesma lista que a edição usa. */
const ROTULO_PERIODICIDADE: Record<string, string> = Object.fromEntries(
  OPCOES_PERIODICIDADE.map((o) => [o.valor, o.rotulo]),
);

const NAO_INFORMADO = <span className="text-faint">não informado</span>;

/**
 * Camada de pagamento do benefício em LEITURA (§A.17 etapa 4). Cliente sem regra cadastrada mostra
 * "não informado", a mesma régua da coluna da tela de Benefícios. Zero é valor válido em
 * `diasPrimeiroCredito` (crédito no mesmo dia), então o teste é contra null/undefined e nunca falsy.
 */
function periodicidadeLeitura(c: Cliente) {
  if (!c.periodicidadeBeneficio) return NAO_INFORMADO;
  return ROTULO_PERIODICIDADE[c.periodicidadeBeneficio] ?? c.periodicidadeBeneficio;
}

function diaPagamentoLeitura(c: Cliente) {
  if (c.diaPagamentoBeneficio == null) return NAO_INFORMADO;
  return `dia ${c.diaPagamentoBeneficio}`;
}

function diasPrimeiroCreditoLeitura(c: Cliente) {
  if (c.diasPrimeiroCredito == null) return NAO_INFORMADO;
  return c.diasPrimeiroCredito === 1 ? "1 dia" : `${c.diasPrimeiroCredito} dias`;
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
  onAbrirGrupos,
}: {
  c: Cliente;
  aberto: boolean;
  onToggle: () => void;
  onEditar: () => void;
  onInativar: () => void;
  onReativar: () => void;
  /** Abre o livreto de grupos a partir da ficha, para não existir um segundo lugar de edição. */
  onAbrirGrupos: () => void;
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
                {/* Camada de pagamento do benefício, VISÍVEL sem entrar em editar: é o que está
                    cadastrado para o cliente, só leitura. A edição continua no formulário do topo. */}
                <Ficha rotulo="Periodicidade do benefício">{periodicidadeLeitura(c)}</Ficha>
                <Ficha rotulo="Dia do pagamento">{diaPagamentoLeitura(c)}</Ficha>
                <Ficha rotulo="Dias até o 1º crédito">{diasPrimeiroCreditoLeitura(c)}</Ficha>
                {/* Tipo de marcação do iFractal, VISÍVEL na expansão pelo mesmo motivo dos três
                    campos de benefício acima: é consulta rápida, e obrigar a abrir o editar para
                    ver um valor de leitura é clique a mais sem ganho. A edição segue no formulário
                    do topo. NOT NULL no banco, então nunca cai no "não informado". */}
                <Ficha rotulo="Tipo de marcação">
                  {TIPO_MARCACAO_LABEL[c.tipoMarcacao] ?? c.tipoMarcacao}
                </Ficha>
              </div>
              {/* CATÁLOGO DE LOJAS do cliente (cenário 1, etapa 1). Fica na ficha, e não em tela
                  própria, porque a loja não existe fora do cliente. Carrega sob demanda: só quando
                  esta ficha abre. */}
              <LojasDoCliente codCliente={c.codCliente} />
              {/* O GRUPO do cenário 2, em leitura. Cenário 1 (lojas) e cenário 2 (grupo) convivem na
                  mesma ficha e respondem perguntas diferentes: a loja diz em qual unidade DESTE
                  cliente a pessoa trabalha, o grupo diz de qual regional este CNPJ faz parte. */}
              <GrupoDoCliente codCliente={c.codCliente} onAbrirGrupos={onAbrirGrupos} />
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
