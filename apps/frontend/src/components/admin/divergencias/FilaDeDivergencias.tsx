"use client";

/**
 * ─ FILA DE REVISÃO DE DIVERGÊNCIAS DA INGESTÃO ─────────────────────────────────────────────────
 *
 * A fila de trabalho de quem resolve diferença entre o EA e o Pandapé. É LISTA DE TAREFA, não
 * relatório: cada linha é uma decisão que falta ser tomada, e resolvida ela sai da fila.
 *
 * ┌─ O QUE A TELA PRESSUPÕE, e é o que faz ela ser calma em vez de urgente ─────────────────────┐
 * │ O EA SEMPRE VENCEU. Nenhum valor do Pandapé foi aplicado, nada do time foi sobrescrito em     │
 * │ silêncio: a diferença virou linha aqui exatamente para NÃO ter sido aplicada. Por isso não há  │
 * │ "desfazer" nesta tela, e por isso "Manter o EA" é um clique seco (não escreve no dado),        │
 * │ enquanto "Adotar o Pandapé" pede confirmação (escreve).                                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OCORRÊNCIAS é coluna e não detalhe: a mesma divergência voltando 40 vezes não é 40 linhas (o
 * backend incrementa o contador), e o número alto é o que distingue "aconteceu uma vez" de "o
 * de/para está errado e a ingestão insiste". É essa leitura que o KPI "Reincidentes" atalha.
 *
 * §A.11 (sem travessão, vazio é "não informado"), §A.12 (máscara única: `ds-table`, títulos
 * centralizados, divisória por hairline, ícone dinâmico por status, KPI clicável como filtro),
 * §A.20 (larguras somando 100% e rolagem horizontal em vez de coluna esmagada), §A.24 (title case
 * em título e tag, botão é ação), §A.28/§A.37 (todo filtro é multiselect, opção vinda do endpoint),
 * §A.29 (ordenação clicável pelo `useOrdenacao` que já existe), §A.35 (nenhum `select` cru),
 * §A.41 (o modal não fecha ao clicar fora e tem saída visível).
 *
 * §A.6: nada aqui é dado pessoal além do nome exibido, que não é persistido nem logado, e nenhuma
 * URL desta tela carrega dado de pessoa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DivergenciaDaIngestaoItem } from "@ea/shared-types";
import { CAMPOS_DE_DIVERGENCIA, ESCOPOS_DE_DIVERGENCIA } from "@ea/shared-types";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { dataHoraBr } from "@/lib/as-candidatos";
import { cn } from "@/lib/cn";
import {
  ESCOPO_DE_DIVERGENCIA_LABEL,
  FILTROS_VAZIOS,
  KPIS_ZERADOS,
  NAO_INFORMADO,
  SITUACAO_DE_DIVERGENCIA_LABEL,
  SITUACOES_DE_DIVERGENCIA,
  adotarOAts,
  alternarValor,
  avisoDoCaminhoManual,
  contarFiltrosAtivos,
  filtrarDivergencias,
  listarDivergenciasDaIngestao,
  listarOpcoesDeDivergencia,
  manterOEa,
  ordemPadrao,
  podeAdotar,
  resumoDoCaminhoManual,
  rotuloDaDecisao,
  rotuloDoCampo,
  situacaoDaLinha,
  toneDaSituacao,
  valorExibido,
  type FiltrosDeDivergencia,
  type OpcoesDeDivergencia,
} from "@/lib/divergencias-ingestao";
import { AdotarDivergenciaModal } from "./AdotarDivergenciaModal";

/** Opções dos filtros que vêm do CONTRATO (enum), não das linhas carregadas (§A.37). */
const OPCOES_CAMPO = CAMPOS_DE_DIVERGENCIA.map((c) => ({ value: c, label: rotuloDoCampo(c) }));
const OPCOES_ESCOPO = ESCOPOS_DE_DIVERGENCIA.map((e) => ({
  value: e,
  label: ESCOPO_DE_DIVERGENCIA_LABEL[e],
}));
const OPCOES_SITUACAO = SITUACOES_DE_DIVERGENCIA.map((s) => ({
  value: s,
  label: SITUACAO_DE_DIVERGENCIA_LABEL[s],
}));

export function FilaDeDivergencias() {
  const { token } = useAuth();
  const [itens, setItens] = useState<DivergenciaDaIngestaoItem[]>([]);
  /** OS KPIS VÊM DO SERVIDOR, contados sem filtro (§A.12). A tela não os recalcula. */
  const [kpis, setKpis] = useState(KPIS_ZERADOS);
  const [opcoes, setOpcoes] = useState<OpcoesDeDivergencia>({ clientes: [], vagas: [] });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<FiltrosDeDivergencia>(FILTROS_VAZIOS);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aAdotar, setAAdotar] = useState<DivergenciaDaIngestaoItem | null>(null);

  /**
   * OS CINCO FILTROS QUE VÃO À REDE, isolados em um objeto próprio: escopo, campo, cliente, vaga e o
   * estado de resolução. Mexer em qualquer um dos cinco RECARREGA a fila, e é obrigatório que
   * recarregue: a consulta tem `limit 500`, então recortar cliente ou vaga na tela esconderia, em
   * silêncio, o que ficou fora do teto. Só `soReincidentes` fica fora daqui, porque é derivado de
   * `ocorrencias` e já chega em cada linha.
   */
  const filtrosDoServidor = useMemo<FiltrosDeDivergencia>(
    () => ({
      ...FILTROS_VAZIOS,
      escopos: filtros.escopos,
      campos: filtros.campos,
      clientes: filtros.clientes,
      vagas: filtros.vagas,
      situacoes: filtros.situacoes,
    }),
    [filtros.escopos, filtros.campos, filtros.clientes, filtros.vagas, filtros.situacoes],
  );

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      const pagina = await listarDivergenciasDaIngestao(token, filtrosDoServidor);
      setItens(ordemPadrao(pagina.itens));
      setKpis(pagina.kpis);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar a fila de divergências.");
    } finally {
      setCarregando(false);
    }
  }, [token, filtrosDoServidor]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * O CATÁLOGO DOS FILTROS vem em chamada PRÓPRIA e não morre com a lista: se ele falhar, a fila
   * continua utilizável (só os dois filtros de dado ficam vazios), porque perder o filtro não pode
   * custar a tela.
   */
  useEffect(() => {
    if (!token) return;
    let vivo = true;
    void listarOpcoesDeDivergencia(token)
      .then((o) => {
        if (vivo) setOpcoes(o);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [token]);

  const recorte = useMemo(() => filtrarDivergencias(itens, filtros), [itens, filtros]);

  /** §A.29, pelo `useOrdenacao` que já existe. Ocorrências é número; detecção é data. */
  const colunas = useMemo<ColOrd<DivergenciaDaIngestaoItem>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (i) => i.candidatoNome ?? "" },
      { chave: "cliente", tipo: "texto", valor: (i) => i.clienteNome ?? "" },
      { chave: "vaga", tipo: "texto", valor: (i) => i.vagaNome ?? "" },
      { chave: "campo", tipo: "texto", valor: (i) => i.campoRotulo },
      { chave: "valorEa", tipo: "texto", valor: (i) => i.valorEa ?? "" },
      { chave: "valorAts", tipo: "texto", valor: (i) => i.valorAts ?? "" },
      { chave: "ocorrencias", tipo: "numero", valor: (i) => i.ocorrencias },
      { chave: "detectadoEm", tipo: "data", valor: (i) => i.ultimaEm },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, recorte);

  const totalFiltros = contarFiltrosAtivos(filtros);

  /**
   * AS DUAS DECISÕES SÃO DUAS ROTAS, com verbo próprio, e a diferença entre elas é de PROCEDÊNCIA:
   * manter não escreve no dado, adotar escreve pelo caminho humano normal, com autor e trilha.
   */
  async function resolver(item: DivergenciaDaIngestaoItem, decisao: "MANTIDO_EA" | "ADOTADO_ATS") {
    if (!token) return;
    setOcupado(item.id);
    setErro(null);
    setAviso(null);
    try {
      if (decisao === "MANTIDO_EA") await manterOEa(token, item.id);
      else await adotarOAts(token, item.id);
      setAviso(
        decisao === "MANTIDO_EA"
          ? "Divergência fechada com o valor do EA. Nada foi alterado no dado."
          : "Valor do Pandapé aplicado, com o seu nome como autor e registro na trilha.",
      );
      setAAdotar(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao registrar a decisão.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      {/* KPIs CLICÁVEIS COMO FILTRO (§A.12), cada um alternando o seu (toggle, não seleção única). */}
      <div className="mb-[18px] grid grid-cols-1 gap-[12px] sm:grid-cols-3">
        <CardKpi
          icon="alert"
          label="Pendentes"
          value={kpis.abertas}
          tone="var(--wn)"
          ativo={filtros.situacoes.includes("PENDENTE")}
          onClick={() =>
            setFiltros((f) => ({ ...f, situacoes: alternarValor(f.situacoes, "PENDENTE") }))
          }
        />
        <CardKpi
          icon="check"
          label="Resolvidas"
          value={kpis.resolvidas}
          tone="var(--ok)"
          ativo={filtros.situacoes.includes("RESOLVIDA")}
          onClick={() =>
            setFiltros((f) => ({ ...f, situacoes: alternarValor(f.situacoes, "RESOLVIDA") }))
          }
        />
        <CardKpi
          icon="refresh"
          label="Reincidentes"
          value={kpis.reincidentes}
          tone="var(--accent)"
          ativo={filtros.soReincidentes}
          onClick={() => setFiltros((f) => ({ ...f, soReincidentes: !f.soReincidentes }))}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-dim">
          {carregando
            ? "Carregando…"
            : `${recorte.length} divergência${recorte.length === 1 ? "" : "s"} na lista`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            title="Atualizar a fila"
            aria-label="Atualizar a fila"
            className="grid h-11 w-11 flex-none place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text disabled:opacity-40"
          >
            <Icon name="refresh" className={cn("h-[19px] w-[19px]", carregando && "animate-spin")} />
          </button>
          {/* TODOS multiselect, pelo componente compartilhado (§A.28/§A.35). Nenhum marcado = todos. */}
          <FiltroTrigger count={totalFiltros} onLimpar={() => setFiltros(FILTROS_VAZIOS)}>
            <FiltroCampo label="Campo">
              <MultiSelect
                ariaLabel="Filtrar por campo"
                values={filtros.campos}
                onChange={(v) => setFiltros((f) => ({ ...f, campos: v }))}
                options={OPCOES_CAMPO}
                placeholder="Todos os campos"
              />
            </FiltroCampo>
            <FiltroCampo label="Escopo">
              <MultiSelect
                ariaLabel="Filtrar por escopo"
                values={filtros.escopos}
                onChange={(v) => setFiltros((f) => ({ ...f, escopos: v }))}
                options={OPCOES_ESCOPO}
                placeholder="Todos os escopos"
              />
            </FiltroCampo>
            <FiltroCampo label="Cliente">
              <MultiSelect
                ariaLabel="Filtrar por cliente"
                values={filtros.clientes}
                onChange={(v) => setFiltros((f) => ({ ...f, clientes: v }))}
                options={opcoes.clientes}
                placeholder="Todos os clientes"
              />
            </FiltroCampo>
            <FiltroCampo label="Vaga">
              <MultiSelect
                ariaLabel="Filtrar por vaga"
                values={filtros.vagas}
                onChange={(v) => setFiltros((f) => ({ ...f, vagas: v }))}
                options={opcoes.vagas}
                placeholder="Todas as vagas"
              />
            </FiltroCampo>
            <FiltroCampo label="Situação">
              <MultiSelect
                ariaLabel="Filtrar por situação"
                values={filtros.situacoes}
                onChange={(v) => setFiltros((f) => ({ ...f, situacoes: v }))}
                options={OPCOES_SITUACAO}
                placeholder="Todas as situações"
              />
            </FiltroCampo>
          </FiltroTrigger>
        </div>
      </div>

      {aviso && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-ok">
          {aviso}
        </p>
      )}
      {erro && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* A largura mínima existe para a tabela ROLAR na horizontal em vez de espremer as colunas
              de texto (§A.20). As nove larguras somam 100%, e Ações leva 12% porque
              nela cabe o aviso do caminho manual dos campos que não são adotáveis. */}
          <table className="ds-table min-w-[1380px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[14%]">
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[11%]">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="w-[12%]">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="campo" className="w-[12%]">
                  Campo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="valorEa" className="w-[11%]">
                  Valor No EA
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="valorAts" className="w-[11%]">
                  Valor No Pandapé
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="ocorrencias" className="w-[7%]">
                  Ocorrências
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="detectadoEm" className="w-[10%]">
                  Detectado Em
                </ColunaOrdenavel>
                <th className="w-[12%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint">
                    {totalFiltros
                      ? "Nenhuma divergência com estes filtros."
                      : "Nenhuma divergência para revisar. O que o Pandapé trouxe concorda com o EA."}
                  </td>
                </tr>
              ) : (
                ord.itens.map((i) => {
                  const situacao = situacaoDaLinha(i);
                  const tone = toneDaSituacao(situacao);
                  const rodando = ocupado === i.id;
                  const pendente = situacao === "PENDENTE";
                  return (
                    <tr key={i.id}>
                      <td>
                        <span
                          className={cn(
                            "block font-semibold",
                            !i.candidatoNome && "font-normal text-faint",
                          )}
                        >
                          {i.candidatoNome ?? NAO_INFORMADO}
                        </span>
                      </td>
                      <td className="text-center text-dim">{i.clienteNome ?? NAO_INFORMADO}</td>
                      <td className="text-center text-dim">{i.vagaNome ?? NAO_INFORMADO}</td>
                      <td className="text-center">
                        {/* ÍCONE DINÂMICO da §A.12, no `StatusPill` que já deriva ícone do tom:
                            pendente = exclamação amarela, resolvida = check verde. A situação é
                            derivada do carimbo de resolução, e não uma coluna a mais. */}
                        <StatusPill
                          tone={tone}
                          label={i.campoRotulo}
                          title={
                            pendente
                              ? `${i.campoRotulo}, pendente de decisão. Escopo: ${ESCOPO_DE_DIVERGENCIA_LABEL[i.escopo]}.`
                              : `${i.campoRotulo}, resolvida como ${rotuloDaDecisao(i.decisao)} por ${i.resolvidoPorNome ?? NAO_INFORMADO}.`
                          }
                        />
                      </td>
                      <td className="text-center font-semibold">{valorExibido(i.valorEa)}</td>
                      <td className="text-center text-dim">{valorExibido(i.valorAts)}</td>
                      <td className="text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 tabular-nums",
                            i.ocorrencias > 1 && "font-semibold text-accent",
                          )}
                          title={
                            i.ocorrencias > 1
                              ? `A ingestão trouxe esta mesma divergência ${i.ocorrencias} vezes.`
                              : "A ingestão trouxe esta divergência uma vez."
                          }
                        >
                          {i.ocorrencias}
                        </span>
                      </td>
                      <td className="text-center text-dim tabular-nums">
                        <span title={`Primeira vez: ${dataHoraBr(i.primeiraEm)}`}>
                          {dataHoraBr(i.ultimaEm)}
                        </span>
                      </td>
                      <td>
                        {pendente ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void resolver(i, "MANTIDO_EA")}
                              disabled={rodando}
                              title="Manter o EA: fecha a divergência sem alterar o dado"
                              aria-label="Manter o EA"
                              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:border-[var(--ok)] hover:text-ok disabled:opacity-40"
                            >
                              <Icon name="check" className="h-4 w-4" />
                            </button>
                            {/* ADOTAR SÓ APARECE ONDE ELE É POSSÍVEL. Nos outros cinco campos o
                                servidor devolve 409 de propósito (não existe caminho humano para o
                                estado em que a divergência nasce), então a tela recusa ANTES do
                                clique e diz onde a correção se faz à mão. Oferecer o botão para
                                depois explicar o erro seria transformar recusa conhecida em falha. */}
                            {podeAdotar(i.campo) ? (
                              <button
                                type="button"
                                onClick={() => setAAdotar(i)}
                                disabled={rodando}
                                title="Adotar o Pandapé: aplica o valor do Pandapé, com autor e trilha"
                                aria-label="Adotar o Pandapé"
                                className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:border-[var(--accent)] hover:text-accent disabled:opacity-40"
                              >
                                <Icon name="undo" className="h-4 w-4" />
                              </button>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 text-[12px] leading-tight text-faint"
                                title={avisoDoCaminhoManual(i.campo)}
                              >
                                <Icon name="lock" className="h-3.5 w-3.5 flex-none" />
                                {resumoDoCaminhoManual(i.campo)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <StatusPill
                              tone="ok"
                              label={rotuloDaDecisao(i.decisao)}
                              title={`Resolvida em ${dataHoraBr(i.resolvidoEm)} por ${i.resolvidoPorNome ?? NAO_INFORMADO}.`}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {aAdotar && (
        <AdotarDivergenciaModal
          item={aAdotar}
          ocupado={ocupado === aAdotar.id}
          onCancelar={() => setAAdotar(null)}
          onConfirmar={() => void resolver(aAdotar, "ADOTADO_ATS")}
        />
      )}
    </>
  );
}

/** Card de indicador CLICÁVEL como filtro (§A.12), no molde do Gerenciador. */
function CardKpi({
  icon,
  label,
  value,
  tone,
  ativo,
  onClick,
}: {
  icon: IconName;
  label: string;
  value: number;
  tone: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <GlassCard
      as="button"
      className={cn(
        "fk !px-4 !py-3.5 text-left transition hover:bg-[var(--surface-2)]",
        ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
      )}
      onClick={onClick}
      aria-pressed={ativo}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <Icon name={icon} className="h-4 w-4 opacity-70" style={{ color: tone }} />
        {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
      </div>
      <div className="num" style={{ color: tone }}>
        {value}
      </div>
      <div className="lbl">{label}</div>
    </GlassCard>
  );
}
