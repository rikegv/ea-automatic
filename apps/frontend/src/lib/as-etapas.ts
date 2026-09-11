"use client";

import { useCallback, useEffect, useState } from "react";
import { ETAPA_TOM_PADRAO, type AsEtapaFunil, type EtapaTom } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import type { PillTone } from "@/components/ui/Pill";

/**
 * ─ O CATÁLOGO DE ETAPAS DO FUNIL, DO LADO DA TELA ───────────────────────────────────────────────
 *
 * A LISTA DE ETAPAS DEIXOU DE SER CONSTANTE E PASSOU A SER DADO DO DIRETOR (`as_etapas_funil`).
 * Este módulo é o único lugar do frontend que sabe buscá-la, e ele tem duas camadas de propósito:
 *
 *   1. FUNÇÕES PURAS que recebem o catálogo EXPLICITAMENTE (`rotuloDaEtapa(codigo, catalogo)`).
 *      Elas são a régua, e régua se testa sem rede, sem estado de módulo e sem montar árvore de
 *      React. É o padrão do `lib/` da casa, e é a forma que `as-etapas.spec.ts` fixou.
 *   2. UMA PROMESSA MEMOIZADA por carga de página em volta delas. O mesmo catálogo serve OITO telas
 *      (a lista, a ficha, o mover, o lote, o cadastro, o painel da vaga, os dois modais de vaga), e
 *      sem memória cada uma faria a sua requisição do mesmo dado de dez linhas.
 *
 * ┌─ POR QUE NÃO UM CONTEXTO REACT NOVO ───────────────────────────────────────────────────────┐
 * │ Um contexto exigiria um provider no `AppShell`, que é superfície compartilhada por TODA tela │
 * │ do sistema, inclusive as que não têm nada a ver com A&S (§A.14/§A.26: alcance grande para    │
 * │ resolver um problema pequeno). Um módulo com cache resolve o mesmo, é testável sem montar    │
 * │ árvore, e não faz nenhuma tela fora do A&S carregar código de A&S.                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A LEITURA É SEMPRE A COMPLETA (`?incluirInativas=1`), E ISSO É DELIBERADO ─────────────────┐
 * │ Uma etapa INATIVADA some dos seletores e CONTINUA no histórico de quem passou por ela. Se a  │
 * │ tela lesse só as ativas, a linha do tempo desse candidato mostraria uma pill sem rótulo.     │
 * │ Buscando a lista inteira, quem precisa só das ativas filtra com `etapasAtivas`, e quem       │
 * │ precisa resolver rótulo de histórico já tem o que precisa. UMA requisição para os dois usos. │
 * │                                                                                              │
 * │ E TEM UM SEGUNDO MOTIVO, MEDIDO: `PATCH /admin/as/etapas/ordem` exige a lista COMPLETA de    │
 * │ ids, INCLUINDO as inativas, e recusa a parcial. Uma tela que montasse a reordenação a partir │
 * │ da leitura padrão passaria a ter TODA reordenação recusada no dia em que a primeira etapa    │
 * │ fosse inativada, com um recado mandando recarregar a página que não resolveria nada.         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: catálogo de processo. Código, rótulo, ordem, cor e dois booleanos. Nenhum dado pessoal.
 */

// ── AS FUNÇÕES PURAS: a régua, testável sem rede ────────────────────────────

/**
 * A ORDEM DO FUNIL É A COLUNA `ordem`, e o desempate é o `id`.
 *
 * QUATRO TELAS ORDENAVAM POR `indexOf` DE UMA CONSTANTE que saiu, e nenhuma delas quebraria com
 * erro: elas passariam a ordenar ERRADO em silêncio, que é pior. Quem ordena, ordena por aqui.
 */
export function etapasOrdenadas(catalogo: readonly AsEtapaFunil[]): AsEtapaFunil[] {
  return [...catalogo].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

/** As que recebem gente nova. A inativa fica de fora daqui e continua resolvendo o histórico. */
export function etapasAtivas(catalogo: readonly AsEtapaFunil[]): AsEtapaFunil[] {
  return etapasOrdenadas(catalogo).filter((e) => e.ativa);
}

/** Só os códigos ativos, na ordem do funil: é o formato que `destinosDeEtapa` espera. */
export function codigosDeEtapaAtivos(catalogo: readonly AsEtapaFunil[]): string[] {
  return etapasAtivas(catalogo).map((e) => e.codigo);
}

/** A linha do catálogo, ativa ou não. `undefined` quando o código não está na lista recebida. */
export function etapaDoCodigo(
  codigo: string,
  catalogo: readonly AsEtapaFunil[],
): AsEtapaFunil | undefined {
  return catalogo.find((e) => e.codigo === codigo);
}

/**
 * O RÓTULO, E O FALLBACK É O PRÓPRIO CÓDIGO. Nunca vazio, nunca `undefined`.
 *
 * PILL VAZIA É PIOR QUE PILL FEIA: um retângulo colorido sem texto não diz onde a pessoa esteve e
 * nem parece um defeito, então some do olho de quem revisa. Mostrando `TRIAGEM_ANTIGA` cru, a tela
 * fica feia e continua informando, e quem vê sabe que falta cadastro.
 */
export function rotuloDaEtapa(codigo: string, catalogo: readonly AsEtapaFunil[]): string {
  return etapaDoCodigo(codigo, catalogo)?.rotulo ?? codigo;
}

/**
 * O TOM, E O FALLBACK É `ETAPA_TOM_PADRAO` (neutro).
 *
 * NUNCA O VERMELHO: pela §A.12 o `dg` é recusa, e a `StatusPill` põe o X vermelho nele. Etapa de
 * funil é POSIÇÃO, não julgamento, e o fallback é o lugar mais fácil de deixar isso escapar.
 */
export function tomDaEtapa(codigo: string, catalogo: readonly AsEtapaFunil[]): EtapaTom {
  return etapaDoCodigo(codigo, catalogo)?.tom ?? ETAPA_TOM_PADRAO;
}

/**
 * A COR DE UM TOM, na variável do tema. É o que faz o card de KPI e a pill da tabela mostrarem a
 * MESMA cor que o diretor escolheu no gerenciador de etapas, sem cada tela decidir a sua.
 *
 * O VERMELHO NÃO ESTÁ AQUI porque não está na paleta (`ETAPA_TONS`): no sistema ele é RECUSA
 * (§A.12), e etapa é POSIÇÃO no funil, não julgamento.
 */
/**
 * A COR DE CADA TOM, E A TABELA COBRE A PALETA INTEIRA DA `Pill`, não só a das etapas.
 *
 * POR QUE `dg` ESTÁ AQUI SE NENHUMA ETAPA PODE SER `dg`: porque esta função deixou de servir só ao
 * funil. O catálogo de STATUS DA VAGA usa a paleta completa (`VAGA_STATUS_TONS`), e precisa do
 * vermelho: "Cancelada" é vermelha em produção, e pela §A.12 recusa leva o X vermelho. Estreitar a
 * função à paleta das etapas obrigaria uma segunda função de cor, e duas tabelas de cor divergem no
 * primeiro tom que alguém acrescentar.
 *
 * A RÉGUA DE QUEM PODE USAR QUAL TOM CONTINUA NO CATÁLOGO, e é lá que ela pertence: o CHECK do banco
 * das etapas segue com cinco tons, o do status com seis. Esta função só PINTA o que já foi validado.
 */
const COR_DO_TOM: Record<PillTone, string> = {
  nt: "var(--dim)",
  in: "var(--accent)",
  wn: "var(--warn)",
  or: "var(--warn-2)",
  dg: "var(--danger)",
  ok: "var(--ok)",
};

export function corDoTom(tom: PillTone): string {
  return COR_DO_TOM[tom] ?? COR_DO_TOM[ETAPA_TOM_PADRAO];
}

/**
 * ONDE A CANDIDATURA NASCE, e ela tem UM dono só: a coluna `inicial`.
 *
 * NÃO INVENTA A PRIMEIRA DA LISTA quando nenhuma está marcada. Devolver a primeira faria a tela
 * discordar em silêncio do backend, que RECUSA o cadastro com a frase que manda marcar uma. Melhor
 * a tela dizer que falta escolher do que escolher sozinha e o cadastro falhar depois.
 */
export function etapaInicial(catalogo: readonly AsEtapaFunil[]): AsEtapaFunil | null {
  return catalogo.find((e) => e.inicial) ?? null;
}

/**
 * A POSIÇÃO DE UMA ETAPA NO FUNIL, para ordenar linha de tabela.
 *
 * ┌─ A ETAPA DESCONHECIDA VAI PARA O FIM, E NUNCA PARA O COMEÇO ────────────────────────────────┐
 * │ O `indexOf` que este helper substitui devolvia `-1` para quem não estava na lista, e `-1`    │
 * │ ordena ANTES da primeira etapa: uma etapa inativada, ou criada por outra sessão e ainda não  │
 * │ carregada aqui, apareceria no TOPO do funil, antes da Captação. Fim de lista é o lugar certo │
 * │ para o que não se sabe classificar, e é o mesmo lugar em que o `null` já caía.               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function ordemDaEtapa(
  codigo: string | null | undefined,
  catalogo: readonly AsEtapaFunil[],
): number {
  if (!codigo) return Number.MAX_SAFE_INTEGER;
  return etapaDoCodigo(codigo, catalogo)?.ordem ?? Number.MAX_SAFE_INTEGER;
}

// ── A REORDENAÇÃO DO FUNIL, e as duas armadilhas dela ──────────────────────

/**
 * A LISTA COMPLETA DE IDS NA ORDEM NOVA, com UMA etapa deslocada uma casa.
 *
 * ┌─ ARMADILHA 1: A LISTA TEM DE IR INTEIRA, COM AS INATIVAS DENTRO ────────────────────────────┐
 * │ `PATCH /admin/as/etapas/ordem` RECUSA a lista parcial ("a ordem enviada não corresponde às   │
 * │ etapas cadastradas"), e recusa com razão: reescrever só um pedaço deixaria as demais com a   │
 * │ numeração antiga. Uma tela que montasse a reordenação a partir das ATIVAS funcionaria        │
 * │ perfeitamente até a primeira etapa ser inativada, e daí em diante TODA reordenação passaria  │
 * │ a ser recusada, com um recado mandando recarregar a página que não conserta nada. É por isso │
 * │ que esta função recebe o catálogo COMPLETO e devolve TODOS os ids.                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ARMADILHA 2: A VIZINHA PODE SER UMA INATIVA ───────────────────────────────────────────────┐
 * │ Trocar de lugar com a inativa que está no meio da fila é MOVIMENTO NENHUM aos olhos de quem  │
 * │ opera: a tela mostra as duas linhas, a inativa esmaecida, e a ativa parece ter ficado parada │
 * │ depois do clique. Só que ela ANDOU, e o segundo clique a leva adiante. Isso é comportamento  │
 * │ correto e visível (a linha inativa está na tela, na ordem), e é diferente do caso silencioso │
 * │ da armadilha 1: aqui o usuário VÊ as duas linhas trocarem.                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Devolve a MESMA lista quando não há para onde ir (primeira subindo, última descendo), e quem
 * chama usa isso para nem disparar a requisição.
 */
export function moverNaOrdem(
  /**
   * ─ A ASSINATURA FOI ALARGADA, E O COMPORTAMENTO NÃO MUDOU (Onda C) ──────────────────────────
   *
   * Ela pedia `AsEtapaFunil[]` e passou a pedir a FORMA de que ela de fato precisa: um id e uma
   * ordem. A função nunca leu cor, nem "inicial", nem "ativa"; ela troca dois vizinhos numa lista
   * de ids e devolve a lista nova, e isso vale para qualquer catálogo ordenável do sistema.
   *
   * QUEM PEDIU FOI O CATÁLOGO DE LINHAS DE SERVIÇO, que reordena exatamente do mesmo jeito. A
   * alternativa era uma segunda cópia desta régua na outra tela, e duas cópias da mesma troca de
   * vizinhos divergem no primeiro ajuste. Alargar um parâmetro é compatível para trás: todos os
   * chamadores de antes continuam válidos, e nenhum teste muda de veredito.
   *
   * A ORDENAÇÃO CONTINUA SENDO A MESMA, `ordem` com desempate por `id`, e ela é feita aqui porque
   * `etapasOrdenadas` devolve etapas e esta função agora atende qualquer catálogo.
   */
  catalogo: readonly { id: number; ordem: number }[],
  id: number,
  direcao: "cima" | "baixo",
): number[] {
  const ids = [...catalogo].sort((a, b) => a.ordem - b.ordem || a.id - b.id).map((e) => e.id);
  const i = ids.indexOf(id);
  const j = direcao === "cima" ? i - 1 : i + 1;
  if (i === -1 || j < 0 || j >= ids.length) return ids;
  const novo = [...ids];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo;
}

/**
 * AS SETAS DE REORDENAR SÓ VALEM ENQUANTO A TABELA ESTÁ NA ORDEM DO FUNIL.
 *
 * §A.29 manda toda tabela ordenar por clique no cabeçalho, e nesta tela isso cria um conflito real:
 * ordenada por NOME, a linha de cima na tela não é a etapa anterior no funil, e a seta "subir"
 * escreveria uma ordem que ninguém pediu enquanto a tela mostra outra coisa. Não é hipótese: é o
 * mesmo tipo de erro silencioso que esta frente inteira existe para eliminar.
 *
 * A SAÍDA NÃO É TIRAR A ORDENAÇÃO, é reconhecer quando ela COINCIDE com o funil: sem coluna
 * escolhida (o padrão da tela) ou ordenada pela própria coluna Ordem, crescente. Nos dois casos a
 * linha de cima é mesmo a etapa anterior. Em qualquer outro, as setas ficam desabilitadas e a tela
 * diz por quê, e voltar é um clique no cabeçalho "Ordem".
 */
export function reordenacaoLiberada(
  ordem: { chave: string; dir: "asc" | "desc" } | null,
): boolean {
  return ordem === null || (ordem.chave === "ordem" && ordem.dir === "asc");
}

// ── A PROMESSA MEMOIZADA: uma requisição por carga de página ────────────────

let emVoo: Promise<AsEtapaFunil[]> | null = null;

/**
 * O CATÁLOGO INTEIRO (ativas + inativas), memoizado. N telas montando ao mesmo tempo compartilham
 * UMA requisição, porque o que se guarda é a PROMESSA e não o resultado.
 *
 * A FALHA NÃO FICA GRUDADA: no erro, a memória é limpa, senão a primeira requisição que caísse
 * (sessão renovando, rede oscilando) condenaria a página inteira a nunca mais ter etapa nenhuma até
 * alguém recarregar.
 */
export function carregarEtapas(): Promise<AsEtapaFunil[]> {
  if (!emVoo) {
    emVoo = apiFetch<AsEtapaFunil[]>("/as/etapas?incluirInativas=1").catch((e) => {
      emVoo = null;
      throw e;
    });
  }
  return emVoo;
}

/** Depois de escrever no catálogo (o gerenciador), a memória tem de morrer. */
export function invalidarCatalogoDeEtapas(): void {
  emVoo = null;
}

export interface CatalogoDeEtapas {
  /** TODAS, na ordem do funil, inativas incluídas. É esta lista que o `PATCH /ordem` exige. */
  etapas: AsEtapaFunil[];
  /** Só as que recebem gente nova. É esta que alimenta seletor, filtro e cards do mover. */
  ativas: AsEtapaFunil[];
  carregando: boolean;
  erro: string | null;
  /** Descarta a memória e busca de novo. Usado pelo gerenciador depois de cada escrita. */
  recarregar: () => Promise<void>;
}

/**
 * O GANCHO QUE AS TELAS USAM. Não é contexto: é `useState` em volta da promessa memoizada, então
 * cada tela tem o seu estado local e todas dividem a mesma requisição.
 */
export function useEtapas(): CatalogoDeEtapas {
  const [etapas, setEtapas] = useState<AsEtapaFunil[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(async (recarregando: boolean) => {
    if (recarregando) invalidarCatalogoDeEtapas();
    setCarregando(true);
    setErro(null);
    try {
      setEtapas(etapasOrdenadas(await carregarEtapas()));
    } catch {
      // A TELA NÃO MORRE POR FALTA DE CATÁLOGO: com a lista vazia, o fallback devolve o código cru
      // e o resto da tela (nome, vaga, situação) continua servindo. Etapa é uma coluna, não a tela.
      setErro("Não foi possível carregar as etapas do funil.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void buscar(false);
  }, [buscar]);

  const recarregar = useCallback(() => buscar(true), [buscar]);

  return {
    etapas,
    ativas: etapas.filter((e) => e.ativa),
    carregando,
    erro,
    recarregar,
  };
}
