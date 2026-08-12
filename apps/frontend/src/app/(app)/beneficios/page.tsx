"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { caixaAlta } from "@/lib/nome";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { Modal } from "@/components/ui/Modal";
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
  codCliente: string | null;
  cliente: string | null;
  entrouEm: string | null;
  principais: Record<string, boolean>;
  /** Valor cadastrado de cada um dos quatro principais. Nulo = tem o benefício, sem valor. */
  valores: Record<string, string | null>;
  outros: { nome: string; valor: string | null }[];
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
}

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

  useEffect(() => {
    const t = setTimeout(() => setQ(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  /** Mudar QUALQUER filtro volta para a primeira página: página 7 de um recorte novo não existe. */
  useEffect(() => {
    setPage(1);
  }, [q, codCliente, com, sem, pacote, ordem]);

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
    chave === "dataAdmissao" ? "data" : chave === "outros" ? "numero" : chave.length === 2 ? "status" : "texto";
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
  }, [q, codCliente, com, sem, pacote, ordem, page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);



  function limparFiltros() {
    setCodCliente([]);
    setCom([]);
    setSem([]);
    setPacote("");
  }

  const siglas = dados?.principais ?? ["VT", "VR", "VA", "AM"];
  /** Candidato, Data adm., Cliente, as quatro siglas e a coluna do "+N". */
  const colunas = 3 + siglas.length + 1;
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
          <table className="ds-table min-w-[1000px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[24%]">
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="dataAdmissao" className="w-[11%]">
                  Data adm.
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[25%]">
                  Cliente
                </ColunaOrdenavel>
                {siglas.map((s) => (
                  <ColunaOrdenavel key={s} as="th" ord={ord} chave={s} className="w-[8%]">
                    {s}
                  </ColunaOrdenavel>
                ))}
                <ColunaOrdenavel as="th" ord={ord} chave="outros" className="w-[8%]">
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
                        <td className="font-semibold">{caixaAlta(l.candidato)}</td>
                        <td className="text-center tabular-nums">{fmtData(l.dataAdmissao)}</td>
                        <td>{rotuloCliente(l.codCliente, l.cliente)}</td>
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
