/**
 * ─ FILA DE REVISÃO DE DIVERGÊNCIAS DA INGESTÃO: o vocabulário da TELA ──────────────────────────
 *
 * A fila de trabalho de quem resolve diferença entre o EA e o Pandapé. É FILA DE TAREFA, não
 * relatório: a régua decidida pelo diretor é que **o EA sempre vence**, então nada foi sobrescrito
 * em silêncio, e a diferença fica aqui esperando alguém olhar e decidir. Resolvida, sai da fila.
 *
 * ESTE ARQUIVO É TRADUÇÃO, RECORTE E IO. A régua de verdade (o que é divergência, como ela nasce,
 * como a reincidência incrementa o contador em vez de criar linha nova, e o que "adotar" escreve no
 * dado) mora no BACKEND. Nada disso é reimplementado aqui.
 *
 * ┌─ ONDE CADA FILTRO É APLICADO, e por que QUASE TODOS são do servidor ────────────────────────┐
 * │ O SERVIDOR filtra `escopo`, `campo`, `cliente`, `vaga` e `estado` (multi por vírgula; o padrão   │
 * │ do estado é `ABERTAS`, que é a fila de trabalho). Mudar qualquer um dos cinco RECARREGA.        │
 * │                                                                                             │
 * │ CLIENTE E VAGA NÃO PODEM SER RECORTE DE TELA, e a razão é medida: a consulta da fila tem        │
 * │ `limit 500`. Filtrar na tela só seria honesto sobre a lista COMPLETA; acima da linha 501 as     │
 * │ divergências daquele cliente que ficaram fora do teto não apareceriam, sem nada indicar isso,   │
 * │ e a tela pareceria estar filtrando certo. É o "filtro que mente" da §A.28 um degrau mais        │
 * │ escondido do que o de uma cláusula esquecida, porque o número na tela continua plausível.      │
 * │                                                                                             │
 * │ SÓ REINCIDENTES FICA NA TELA: ele é derivado de `ocorrencias`, que já vem em cada linha, e não  │
 * │ recorta população que o teto poderia ter cortado de forma diferente.                           │
 * │                                                                                             │
 * │ OS KPIs VÊM DO SERVIDOR, e não são contados aqui: eles são contados SEM os filtros, que é o     │
 * │ que a §A.12 exige de um card que É o filtro (card que conta o próprio filtro sempre mostraria   │
 * │ o total de si mesmo). O CATÁLOGO das opções também vem do endpoint (§A.37): derivá-lo das       │
 * │ linhas carregadas encolhe a lista assim que o primeiro valor é escolhido.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum campo desta fila é dado pessoal. `valorEa` e `valorAts` são código de etapa, código
 * de situação, código de vaga, rótulo de divulgação, cidade ou número de posições. O
 * `candidatoNome` é EXIBIDO para o time reconhecer a linha, não é persistido nem logado aqui, e
 * nenhum CPF trafega nesta tela.
 */

import type {
  CampoDeDivergencia,
  DecisaoDeDivergencia,
  DivergenciaDaIngestaoItem,
  DivergenciasDaIngestaoPagina,
  EscopoDeDivergencia,
  KpisDeDivergencias,
  OpcoesDeFiltroDeDivergencias,
} from "@ea/shared-types";
import { CAMPO_DE_DIVERGENCIA_LABEL, DECISAO_DE_DIVERGENCIA_LABEL } from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";
import { apiFetch } from "@/lib/api";

/** Ausência de dado é sempre esta palavra, nunca o glifo (§A.11). */
export const NAO_INFORMADO = "não informado";

/**
 * A SITUAÇÃO DA LINHA é DERIVADA, e de propósito não existe como coluna no contrato: uma linha está
 * resolvida quando tem `resolvidoEm`, e pendente quando não tem. Guardar um terceiro estado seria
 * abrir espaço para ele discordar do carimbo, que é a divergência que a §A.19 eliminou.
 */
export const SITUACOES_DE_DIVERGENCIA = ["PENDENTE", "RESOLVIDA"] as const;
export type SituacaoDeDivergencia = (typeof SITUACOES_DE_DIVERGENCIA)[number];

/** §A.24: title case, porque é TAG de status. */
export const SITUACAO_DE_DIVERGENCIA_LABEL: Record<SituacaoDeDivergencia, string> = {
  PENDENTE: "Pendente",
  RESOLVIDA: "Resolvida",
};

export function situacaoDaLinha(item: DivergenciaDaIngestaoItem): SituacaoDeDivergencia {
  return item.resolvidoEm ? "RESOLVIDA" : "PENDENTE";
}

/**
 * O TOM, de onde sai o ÍCONE DINÂMICO da §A.12 (quem desenha é o `StatusPill`, que já deriva ícone
 * de tom no sistema inteiro): pendente = exclamação amarela, resolvida = check verde. A tela não
 * escolhe ícone à mão, senão seria a segunda máscara.
 */
export function toneDaSituacao(s: SituacaoDeDivergencia): PillTone {
  return s === "RESOLVIDA" ? "ok" : "wn";
}

/** Rótulo do escopo, em title case (§A.24). `Record` fechado: escopo novo quebra o typecheck. */
export const ESCOPO_DE_DIVERGENCIA_LABEL: Record<EscopoDeDivergencia, string> = {
  CANDIDATURA: "Candidatura",
  VAGA: "Vaga",
};

/** Rótulo do campo. O item já traz `campoRotulo` pronto; isto serve ao FILTRO, que não tem item. */
export function rotuloDoCampo(campo: CampoDeDivergencia): string {
  return CAMPO_DE_DIVERGENCIA_LABEL[campo] ?? String(campo);
}

export function rotuloDaDecisao(d: DecisaoDeDivergencia | null): string {
  return d ? (DECISAO_DE_DIVERGENCIA_LABEL[d] ?? String(d)) : NAO_INFORMADO;
}

/** Valor de comparação ausente é "não informado", nunca vazio nem travessão (§A.11). */
export function valorExibido(v: string | null): string {
  return v === null || v.trim() === "" ? NAO_INFORMADO : v;
}

/**
 * O CATÁLOGO DOS FILTROS que depende de dado vem do endpoint (§A.37) e o TIPO vem do contrato
 * (`OpcoesDeFiltroDeDivergencias`): `clientes` por NOME, que é o que a linha carrega (o contrato não
 * traz `clienteId`), e `vagas` por id com o nome como rótulo.
 */
export type OpcoesDeDivergencia = OpcoesDeFiltroDeDivergencias;

/** O estado dos filtros da tela. Lista vazia significa TODOS, sem caso especial a inventar. */
export interface FiltrosDeDivergencia {
  campos: string[];
  escopos: string[];
  clientes: string[];
  vagas: string[];
  situacoes: string[];
  /** KPI "Reincidentes": só as linhas que a ingestão já trouxe mais de uma vez. */
  soReincidentes: boolean;
}

export const FILTROS_VAZIOS: FiltrosDeDivergencia = {
  campos: [],
  escopos: [],
  clientes: [],
  vagas: [],
  situacoes: [],
  soReincidentes: false,
};

/** Quantos filtros estão ativos, para o badge do `FiltroTrigger`. */
export function contarFiltrosAtivos(f: FiltrosDeDivergencia): number {
  return (
    (f.campos.length ? 1 : 0) +
    (f.escopos.length ? 1 : 0) +
    (f.clientes.length ? 1 : 0) +
    (f.vagas.length ? 1 : 0) +
    (f.situacoes.length ? 1 : 0) +
    (f.soReincidentes ? 1 : 0)
  );
}

/** Alterna UM valor dentro de um filtro múltiplo: é o que faz o KPI SOMAR em vez de trocar. */
export function alternarValor(valores: string[], valor: string): string[] {
  return valores.includes(valor) ? valores.filter((v) => v !== valor) : [...valores, valor];
}

/**
 * O ÚNICO RECORTE QUE FICA NA TELA: reincidentes, que é derivado de `ocorrencias` e não custa rede.
 *
 * `escopo`, `campo`, `cliente`, `vaga` e `estado` NÃO são refeitos aqui: eles já vieram filtrados do
 * servidor, que é o único lugar onde o filtro é honesto (a consulta tem `limit 500`, então recorte de
 * tela esconderia o que ficou fora do teto). Uma segunda régua para o mesmo recorte divergiria da
 * primeira no primeiro ajuste, e divergiria justamente em quem aparece na fila.
 */
export function filtrarDivergencias(
  itens: DivergenciaDaIngestaoItem[],
  f: FiltrosDeDivergencia,
): DivergenciaDaIngestaoItem[] {
  return f.soReincidentes ? itens.filter((i) => i.ocorrencias > 1) : itens;
}

/**
 * OS KPIS SÃO DO SERVIDOR, e este é o zero de partida enquanto a primeira resposta não chega.
 *
 * Contar aqui seria contar o RECORTE, e o card é o próprio filtro: ele responde "quanto trabalho
 * existe", não "quanto sobrou do que eu já filtrei". O backend conta sem filtro nenhum, e
 * `reincidentes` são as ABERTAS com ocorrências maior que 1 (a definição está no contrato).
 */
export const KPIS_ZERADOS: KpisDeDivergencias = { abertas: 0, resolvidas: 0, reincidentes: 0 };

/**
 * A ORDEM PADRÃO da fila, antes de qualquer clique no cabeçalho: PENDENTE primeiro (é o trabalho),
 * e dentro de cada grupo a detecção mais recente no topo. O `useOrdenacao` preserva a ordem de
 * entrada até alguém clicar, então esta é a ordem que a pessoa encontra ao abrir a tela.
 */
export function ordemPadrao(itens: DivergenciaDaIngestaoItem[]): DivergenciaDaIngestaoItem[] {
  return [...itens].sort((a, b) => {
    const pa = a.resolvidoEm ? 1 : 0;
    const pb = b.resolvidoEm ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return Date.parse(b.ultimaEm) - Date.parse(a.ultimaEm);
  });
}

/** A raiz das rotas da fila, em um lugar só. */
const BASE = "/as/ingestao/divergencias";

/**
 * O `estado` QUE VAI AO SERVIDOR, traduzido do filtro de Situação da tela.
 *
 * O vocabulário da rota tem TRÊS valores para o que na tela são DUAS caixas, e a tradução é o que
 * faz o multiselect continuar sendo multiselect: marcar as duas é `TODAS`, e é por isso que ligar o
 * card de Resolvidas junto com o de Pendentes SOMA as duas populações em vez de trocar uma pela
 * outra. Nenhuma marcada é `ABERTAS`, o padrão do servidor, porque a tela é fila de trabalho.
 */
export function estadoDoFiltro(situacoes: string[]): "ABERTAS" | "RESOLVIDAS" | "TODAS" {
  const pendente = situacoes.includes("PENDENTE");
  const resolvida = situacoes.includes("RESOLVIDA");
  if (pendente && resolvida) return "TODAS";
  if (resolvida) return "RESOLVIDAS";
  return "ABERTAS";
}

/**
 * A URL DA FILA, com os CINCO filtros do servidor. Cada um vai como lista separada por vírgula, que
 * é o formato que o `parseMulti` do backend já lê na Esteira.
 *
 * `escopo` e `campo` são vocabulário fechado (valor de fora volta 400 de propósito), então só sai
 * daqui o que veio do enum do contrato. `cliente` viaja como NOME, que é o que a célula mostra e o
 * que o `/opcoes` devolve como `value` (o servidor casa contra a MESMA expressão do rótulo,
 * `coalesce(nome_operacao, razao_social)`), e `vaga` viaja como ID, cuja forma o servidor confere
 * antes da consulta. O `soReincidentes` NÃO vai: ele é recorte de tela.
 */
export function urlDaFila(f: FiltrosDeDivergencia): string {
  const q = new URLSearchParams();
  if (f.escopos.length) q.set("escopo", f.escopos.join(","));
  if (f.campos.length) q.set("campo", f.campos.join(","));
  if (f.clientes.length) q.set("cliente", f.clientes.join(","));
  if (f.vagas.length) q.set("vaga", f.vagas.join(","));
  q.set("estado", estadoDoFiltro(f.situacoes));
  return `${BASE}?${q.toString()}`;
}

/** A fila, no ENVELOPE do contrato: itens já recortados pelo servidor, KPIs do conjunto inteiro. */
export function listarDivergenciasDaIngestao(
  token: string,
  filtros: FiltrosDeDivergencia,
): Promise<DivergenciasDaIngestaoPagina> {
  return apiFetch<DivergenciasDaIngestaoPagina>(urlDaFila(filtros), { token });
}

/** O catálogo dos filtros que dependem de dado (cliente e vaga), do endpoint (§A.37). */
export function listarOpcoesDeDivergencia(token: string): Promise<OpcoesDeDivergencia> {
  return apiFetch<OpcoesDeDivergencia>(`${BASE}/opcoes`, { token });
}

/**
 * AS DUAS DECISÕES SÃO DUAS ROTAS, com verbo próprio, e não uma rota com a decisão no corpo.
 *
 * `manter-ea` fecha a linha e não escreve nada no dado. `adotar-ats` aplica o valor do Pandapé pelo
 * CAMINHO HUMANO NORMAL no backend (o mesmo `moverEtapa`, a mesma edição de posições, a mesma TROCA
 * de vaga), com autor e com trilha. A tela não escreve coluna nenhuma: ela registra a decisão.
 *
 * A VAGA DO CANDIDATO É TROCADA, E NÃO ALOCADA DE NOVO: alocar criava uma SEGUNDA candidatura viva,
 * recriando a duplicata que esta fila existe para matar. A rota é a mesma, então a tela não muda de
 * gesto; o que muda é o que a confirmação promete, e é por isso que ela fala em mover, nunca em abrir
 * um processo novo.
 */
export function manterOEa(token: string, id: string): Promise<DivergenciaDaIngestaoItem> {
  return apiFetch<DivergenciaDaIngestaoItem>(`${BASE}/${id}/manter-ea`, { method: "POST", token });
}

export function adotarOAts(token: string, id: string): Promise<DivergenciaDaIngestaoItem> {
  return apiFetch<DivergenciaDaIngestaoItem>(`${BASE}/${id}/adotar-ats`, { method: "POST", token });
}

/**
 * ─ ADOTAR SÓ EXISTE EM TRÊS DOS OITO CAMPOS, e a tela recusa ANTES do clique ───────────────────
 *
 * ┌─ POR QUE A LISTA É FECHADA, e por que ela é REPETIDA aqui ──────────────────────────────────┐
 * │ Adotar aplica o valor pelo caminho HUMANO. Nos três campos abaixo existe uma chamada humana    │
 * │ que aceita o estado em que a divergência nasce; nos outros QUATRO não existe, e o servidor      │
 * │ devolve 409 de propósito (a `situacao` exigiria motivo do CATÁLOGO, e o ATS traz frase          │
 * │ genérica; os campos de abertura de vaga só são editáveis com a vaga em revisão, e a            │
 * │ divergência de vaga só nasce DEPOIS que ela saiu da revisão).                                  │
 * │                                                                                             │
 * │ SÃO QUATRO E NÃO CINCO porque `motivo_descarte` SAIU do catálogo de campos (veto do            │
 * │ `seguranca`, 30/09/2026): o valor dele é PROSA do consultor, que a rotina de expurgo NULA, e a  │
 * │ fila guardaria uma CÓPIA em claro, fora do alcance daquele expurgo. A trava dele continua       │
 * │ inteira no backend; o que saiu foi a linha de fila.                                            │
 * │                                                                                             │
 * │ A tela repete a lista para NÃO OFERECER o botão que só pode dar 409: deixar clicar e explicar  │
 * │ depois transforma uma recusa conhecida em erro de tela. A autoridade continua sendo o backend,  │
 * │ que recusa de novo se alguém chamar a rota na mão; isto é UX, não permissão.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const CAMPOS_ADOTAVEIS: readonly CampoDeDivergencia[] = [
  "etapa",
  "vaga_posicoes_oficiais",
  "vaga_do_candidato",
];

export function podeAdotar(campo: CampoDeDivergencia): boolean {
  return CAMPOS_ADOTAVEIS.includes(campo);
}

/**
 * O caminho real, curto, para caber na célula. Frase normal: é apoio, não tag (§A.24).
 *
 * SÃO DUAS FAMÍLIAS entre os quatro não adotáveis: a `situacao`, que se resolve na ficha do
 * candidato, e os três campos de abertura de vaga, que se resolvem pela revisão da vaga.
 */
export function resumoDoCaminhoManual(campo: CampoDeDivergencia): string {
  return campo === "situacao" ? "Resolva na ficha do candidato" : "Resolva em Editar vaga";
}

/** A frase inteira, para o `title`. É a mesma régua que o 409 do servidor explica. */
export function avisoDoCaminhoManual(campo: CampoDeDivergencia): string {
  return campo === "situacao"
    ? "Este campo não é adotado por aqui: quem sai do funil sai pela ficha do candidato, escolhendo o motivo do catálogo. Concordando com o Pandapé, registre a saída na ficha e depois feche esta linha com Manter o EA."
    : "Este campo não é adotado por aqui. O nome e a cidade se corrigem em Editar vaga, na Central de Vagas, enquanto a vaga estiver aberta ou entregue; o código é a identidade da vaga no Pandapé e não se edita. Depois feche esta linha com Manter o EA.";
}
