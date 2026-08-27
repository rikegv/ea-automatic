"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TIPO_MARCACAO, TIPO_MARCACAO_LABEL, type TipoMarcacao } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

/**
 * MENU GERENCIAL DO IFRACTAL: uma tabela só, no padrão do sistema.
 *
 * DUAS CORREÇÕES DE DESENHO ESTÃO REGISTRADAS AQUI, ambas do diretor ao validar:
 *
 * 1. A primeira versão listava ADMISSÕES, virando cópia da aba da Esteira. Tela de gestão que
 *    repete a fila de trabalho é duplicata, e duplicata diverge no primeiro ajuste de um lado só.
 *    Esta tela configura a frente: quem é o funcionário vive na Esteira, e só lá.
 *
 * 2. A segunda tinha CARDS de distribuição por tipo e a lista de status EMPILHADA no fim da página.
 *    Os cards saíram: esta é tela de gestão, não de análise, e clicar num indicador para disparar
 *    ação mistura duas coisas. A lista de status saiu do rodapé para um MODAL, atrás do botão
 *    "Gerenciar Status" no topo: escondida embaixo de 238 clientes, ninguém a achava sem rolar.
 */
interface StatusCat {
  id: number;
  codigo: string;
  rotulo: string;
  ordem: number;
  conclui: boolean;
}

interface ClienteLinha {
  codCliente: string;
  cliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  tipoMarcacao: TipoMarcacao;
  ativo: boolean;
  admissoesNaFrente: number;
}

export default function IfractalPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<ClienteLinha[]>([]);
  const [catalogo, setCatalogo] = useState<StatusCat[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  /** Filtros MÚLTIPLOS (§A.28) das colunas escolhidas como filtro (§A.30). */
  const [fClientes, setFClientes] = useState<string[]>([]);
  const [fTipos, setFTipos] = useState<string[]>([]);
  const [fSituacao, setFSituacao] = useState<string[]>([]);
  const [busca, setBusca] = useState("");

  /** O LÁPIS: a linha em edição e o rascunho dela. Uma linha por vez, como na tela de Clientes. */
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<{ tipoMarcacao: TipoMarcacao; ativo: boolean } | null>(
    null,
  );

  /** O modal da lista de status, aberto pelo botão do topo. */
  const [statusAberto, setStatusAberto] = useState(false);
  const [novoStatus, setNovoStatus] = useState("");
  const [editStatusId, setEditStatusId] = useState<number | null>(null);
  const [editStatusRotulo, setEditStatusRotulo] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [c, s] = await Promise.all([
        apiFetch<{ items: ClienteLinha[]; total: number }>("/ifractal/clientes", { token }),
        apiFetch<StatusCat[]>("/ifractal/status", { token }),
      ]);
      setItems(c.items);
      setCatalogo(s);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setSalvando(true);
    setErro(null);
    try {
      await fn();
      setFlash(msg);
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha na operação.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(i: ClienteLinha) {
    setEditando(i.codCliente);
    setRascunho({ tipoMarcacao: i.tipoMarcacao, ativo: i.ativo });
  }

  async function salvarLinha(i: ClienteLinha) {
    if (!rascunho) return;
    // Só manda o que MUDOU: campo ausente é campo não mexido no backend, e é isso que evita
    // reescrever a situação do cliente sem querer ao trocar só o tipo de marcação.
    const corpo: Record<string, unknown> = {};
    if (rascunho.tipoMarcacao !== i.tipoMarcacao) corpo.tipoMarcacao = rascunho.tipoMarcacao;
    if (rascunho.ativo !== i.ativo) corpo.ativo = rascunho.ativo;
    if (Object.keys(corpo).length === 0) {
      setEditando(null);
      return;
    }
    const ok = await acao(
      () => apiFetch(`/ifractal/clientes/${i.codCliente}`, { method: "PATCH", token, body: corpo }),
      `${i.cliente} atualizado.`,
    );
    if (ok) setEditando(null);
  }

  const clientesOpcoes = useMemo(
    () => items.map((i) => ({ value: i.codCliente, label: i.cliente })),
    [items],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return items.filter(
      (i) =>
        (fClientes.length === 0 || fClientes.includes(i.codCliente)) &&
        (fTipos.length === 0 || fTipos.includes(i.tipoMarcacao)) &&
        (fSituacao.length === 0 || fSituacao.includes(i.ativo ? "ATIVO" : "INATIVO")) &&
        (q === "" ||
          i.cliente.toLowerCase().includes(q) ||
          i.codCliente.toLowerCase().includes(q) ||
          i.razaoSocial.toLowerCase().includes(q)),
    );
  }, [items, fClientes, fTipos, fSituacao, busca]);

  // §A.29: toda tabela ordena por clique, pelo componente que já existe.
  const colunas = useMemo<ColOrd<ClienteLinha>[]>(
    () => [
      { chave: "codigo", tipo: "texto", valor: (i) => i.codCliente },
      { chave: "cliente", tipo: "texto", valor: (i) => i.cliente },
      { chave: "marcacao", tipo: "texto", valor: (i) => TIPO_MARCACAO_LABEL[i.tipoMarcacao] },
      { chave: "admissoes", tipo: "status", valor: (i) => i.admissoesNaFrente },
      { chave: "situacao", tipo: "texto", valor: (i) => (i.ativo ? "Ativo" : "Inativo") },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, filtrados);

  // §A.12/§A.20: larguras que cabem o conteúdo mais longo ("Reconhecimento Facial") e o cabeçalho
  // com a seta de ordenação, sem sobrar vazio de um lado e espremer do outro.
  const GRID = "120px minmax(260px,1.6fr) minmax(240px,1fr) 120px 130px 96px";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <PageHead
          title="iFractal"
          subtitle="Tipo de marcação por cliente e a lista de status da frente."
        />
        {/* GERENCIAR STATUS no TOPO (decisão do diretor). Antes a lista vivia no rodapé, embaixo de
            238 clientes: quem precisava dela tinha de rolar a página inteira para achar. */}
        <Button
          variant="secondary"
          className="inline-flex items-center gap-2 px-4 py-2.5"
          onClick={() => setStatusAberto(true)}
        >
          <Icon name="cog" className="h-4 w-4" />
          Gerenciar Status
        </Button>
      </div>

      {flash && (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] px-3 py-2 text-[13px]">
          {flash}
        </div>
      )}
      {erro && (
        <p className="mb-3 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <MultiSelect
          ariaLabel="Filtrar por cliente"
          placeholder="Cliente"
          options={clientesOpcoes}
          values={fClientes}
          onChange={setFClientes}
          className="min-w-[230px]"
        />
        <MultiSelect
          ariaLabel="Filtrar por tipo de marcação"
          placeholder="Tipo De Marcação"
          options={TIPO_MARCACAO.map((t) => ({ value: t, label: TIPO_MARCACAO_LABEL[t] }))}
          values={fTipos}
          onChange={setFTipos}
          className="min-w-[200px]"
        />
        <MultiSelect
          ariaLabel="Filtrar por situação"
          placeholder="Status"
          options={[
            { value: "ATIVO", label: "Ativo" },
            { value: "INATIVO", label: "Inativo" },
          ]}
          values={fSituacao}
          onChange={setFSituacao}
          className="min-w-[150px]"
        />
        <input
          className="ds-input h-9 min-w-[240px] flex-1"
          placeholder="Buscar por código, nome de operação ou razão social"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Button variant="secondary" className="h-9 px-3" onClick={() => void carregar()}>
          <Icon name="refresh" className="h-4 w-4" />
        </Button>
      </div>

      <div className="ea-scroll overflow-x-auto">
        <div className="min-w-[960px]">
          <div className="list-head" style={{ gridTemplateColumns: GRID }}>
            {/* "CÓDIGO", e não "Matrícula": no contexto de CLIENTE o identificador é o código do
                cliente (`cod_cliente`). Matrícula é do funcionário, na folha, e vive na Esteira. */}
            <ColunaOrdenavel ord={ord} chave="codigo">
              Código
            </ColunaOrdenavel>
            <ColunaOrdenavel ord={ord} chave="cliente">
              Cliente
            </ColunaOrdenavel>
            <ColunaOrdenavel ord={ord} chave="marcacao">
              Tipo De Marcação
            </ColunaOrdenavel>
            {/* Quantas admissões deste cliente já estão na frente. Fica porque dá o TAMANHO do que a
                troca de tipo alcança: o tipo é herdado, então mudar aqui vale para todas elas. */}
            <ColunaOrdenavel ord={ord} chave="admissoes">
              Admissões
            </ColunaOrdenavel>
            <ColunaOrdenavel ord={ord} chave="situacao">
              Status
            </ColunaOrdenavel>
            <span className="col-fix">Ações</span>
          </div>

          {carregando ? (
            <p className="psub p-4">Carregando...</p>
          ) : ord.itens.length === 0 ? (
            <p className="psub p-4">Nenhum cliente nesta visão.</p>
          ) : (
            ord.itens.map((i) => {
              const emEdicao = editando === i.codCliente && rascunho !== null;
              return (
                <div key={i.codCliente} className="row" style={{ gridTemplateColumns: GRID }}>
                  <div className="meta truncate text-center font-mono" title={i.codCliente}>
                    {i.codCliente}
                  </div>
                  <div className="nm truncate text-left" title={i.razaoSocial}>
                    {i.cliente}
                  </div>

                  {/* EDIÇÃO NA LINHA: fora do modo de edição a célula é texto, e o lápis é o que
                      abre os controles. Seletor aberto direto na linha convidava a trocar sem
                      querer, e trocar aqui alcança todas as admissões do cliente por herança. */}
                  <div className="flex min-w-0 items-center justify-center">
                    {emEdicao ? (
                      <Select
                        className="w-full"
                        menuFit
                        ariaLabel={`Tipo de marcação de ${i.cliente}`}
                        value={rascunho.tipoMarcacao}
                        onChange={(v) =>
                          setRascunho({ ...rascunho, tipoMarcacao: v as TipoMarcacao })
                        }
                        options={TIPO_MARCACAO.map((t) => ({
                          value: t,
                          label: TIPO_MARCACAO_LABEL[t],
                        }))}
                      />
                    ) : (
                      <span className="meta truncate">{TIPO_MARCACAO_LABEL[i.tipoMarcacao]}</span>
                    )}
                  </div>

                  <div className="meta text-center tabular-nums">{i.admissoesNaFrente}</div>

                  <div className="flex min-w-0 items-center justify-center">
                    {emEdicao ? (
                      <Select
                        className="w-full"
                        menuFit
                        ariaLabel={`Situação de ${i.cliente}`}
                        value={rascunho.ativo ? "ATIVO" : "INATIVO"}
                        onChange={(v) => setRascunho({ ...rascunho, ativo: v === "ATIVO" })}
                        options={[
                          { value: "ATIVO", label: "Ativo" },
                          { value: "INATIVO", label: "Inativo" },
                        ]}
                      />
                    ) : (
                      <span className={`meta ${i.ativo ? "" : "text-faint"}`}>
                        {i.ativo ? "Ativo" : "Inativo"}
                      </span>
                    )}
                  </div>

                  <div className="col-fix flex items-center justify-center gap-0.5">
                    {emEdicao ? (
                      <>
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-accent transition hover:bg-[var(--surface-2)] disabled:opacity-40"
                          title="Salvar"
                          aria-label={`Salvar ${i.cliente}`}
                          disabled={salvando}
                          onClick={() => void salvarLinha(i)}
                        >
                          <Icon name="check" className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)]"
                          title="Cancelar"
                          aria-label={`Cancelar edição de ${i.cliente}`}
                          onClick={() => setEditando(null)}
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
                        title="Editar tipo de marcação e status"
                        aria-label={`Editar ${i.cliente}`}
                        onClick={() => abrirEdicao(i)}
                      >
                        <Icon name="pen" className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {statusAberto && (
        <Modal
          onClose={() => setStatusAberto(false)}
          className="max-w-2xl"
          ariaLabel="Gerenciar Status"
        >
          <h3 className="text-[17px] font-extrabold">Gerenciar Status</h3>
          <p className="psub !mb-0 mt-1">
            Renomeie e acrescente status da frente do iFractal. O sistema sempre sabe qual deles
            conclui a frente, e é o marcado abaixo. O nome muda; o registro interno de cada admissão
            não se move, então renomear não desloca ninguém.
          </p>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
            {catalogo.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 last:border-b-0"
              >
                {editStatusId === c.id ? (
                  <>
                    <input
                      className="ds-input h-8 flex-1"
                      value={editStatusRotulo}
                      onChange={(e) => setEditStatusRotulo(e.target.value)}
                      autoFocus
                    />
                    <Button
                      className="h-8 px-3 text-[13px]"
                      disabled={salvando}
                      onClick={() =>
                        void acao(
                          () =>
                            apiFetch(`/ifractal/status/${c.id}`, {
                              method: "PATCH",
                              token,
                              body: { rotulo: editStatusRotulo },
                            }),
                          "Status renomeado.",
                        ).then((ok) => ok && setEditStatusId(null))
                      }
                    >
                      Salvar
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-[13px]"
                      onClick={() => setEditStatusId(null)}
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[14px] font-semibold">{c.rotulo}</span>
                    {c.conclui ? (
                      <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-[12px] font-bold">
                        Conclui A Frente
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-[12px] text-dim underline-offset-2 hover:underline"
                        disabled={salvando}
                        onClick={() =>
                          void acao(
                            () =>
                              apiFetch(`/ifractal/status/${c.id}/concluinte`, {
                                method: "PATCH",
                                token,
                              }),
                            `"${c.rotulo}" passou a ser o status que conclui a frente.`,
                          )
                        }
                      >
                        marcar como concluinte
                      </button>
                    )}
                    <Button
                      variant="secondary"
                      className="h-8 px-2.5 text-[13px]"
                      onClick={() => {
                        setEditStatusId(c.id);
                        setEditStatusRotulo(c.rotulo);
                      }}
                    >
                      Renomear
                    </Button>
                    {/* Remover é BARRADO pelo backend quando há admissão no status, com o recado
                        dizendo quantas são. A trava vive lá, e não aqui, para valer por qualquer
                        caminho que chame a rota. */}
                    <Button
                      variant="secondary"
                      className="h-8 px-2.5 text-[13px]"
                      disabled={salvando}
                      onClick={() =>
                        void acao(
                          () => apiFetch(`/ifractal/status/${c.id}`, { method: "DELETE", token }),
                          "Status removido.",
                        )
                      }
                    >
                      Remover
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              className="ds-input h-9 flex-1"
              placeholder="Nome do novo status"
              value={novoStatus}
              onChange={(e) => setNovoStatus(e.target.value)}
            />
            <Button
              className="h-9 px-4"
              disabled={salvando || !novoStatus.trim()}
              onClick={() =>
                void acao(
                  () =>
                    apiFetch("/ifractal/status", {
                      method: "POST",
                      token,
                      body: { rotulo: novoStatus.trim() },
                    }),
                  "Status criado.",
                ).then((ok) => ok && setNovoStatus(""))
              }
            >
              Acrescentar
            </Button>
          </div>

          <div className="mt-5 flex justify-end">
            <Button variant="secondary" className="px-4 py-2.5" onClick={() => setStatusAberto(false)}>
              Fechar
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
