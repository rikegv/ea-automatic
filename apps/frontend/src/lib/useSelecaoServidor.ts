"use client";

import { useCallback, useState } from "react";

/**
 * SELEÇÃO sobre uma lista PAGINADA no servidor, com AÇÃO EM MASSA SEM TETO (decisão do diretor,
 * §3.3 do mapa de alcance: agir sobre TODOS os candidatos do filtro de uma vez, sem o teto de 200).
 *
 * O hook é genérico sobre `TFiltro` e NÃO conhece o endpoint: a ação concreta (mover etapa, mudar
 * situação, descartar, vincular) é INJETADA pela tela e recebe o alvo já resolvido. O hook só
 * ORQUESTRA os dois modos:
 *  - "APLICAR A TODOS DO FILTRO" (`todosDoFiltro`): a ação recebe `{ modo: 'filtro', filtro }` e o
 *    servidor age sobre o conjunto inteiro, SEM teto. O hook NÃO baixa linhas nem materializa ids;
 *  - "IDS MARCADOS" (subconjunto manual): a ação recebe `{ modo: 'ids', ids: [...] }`.
 *
 * O TEXTO DE UI (aviso de volume, confirmação, §A.11/§A.24) mora na TELA, nunca aqui: o hook só
 * expõe os números (`quantidadeSelecionada`, `resultado`) e os estados (`processando`, `erro`) e a
 * tela decide a cópia. Assim o cuidado pedido no §3.4 (avisar do tempo, animar, confirmar quantos
 * foram afetados) é da camada visual, e o hook permanece reutilizável.
 */

export type AlvoDaAcao<TFiltro> =
  | { modo: "filtro"; filtro: TFiltro }
  | { modo: "ids"; ids: string[] };

export interface ResultadoDaAcao {
  afetados: number;
  /** 0 em sucesso pleno; > 0 em falha parcial (lote por lote, §3.3). Nunca deixa metade em silêncio. */
  falharam: number;
}

export type AcaoEmMassa<TFiltro> = (alvo: AlvoDaAcao<TFiltro>) => Promise<ResultadoDaAcao>;

export interface OpcoesSelecaoServidor<TFiltro> {
  /** Filtro corrente da lista paginada (vem do `usePaginacaoServidor`). */
  filtro: TFiltro;
  /** Total do filtro (vem do `usePaginacaoServidor`): é a quantidade quando `todosDoFiltro`. */
  total: number;
}

export interface SelecaoServidor<TFiltro> {
  /** Ids marcados manualmente na página. */
  selecionados: Set<string>;
  /** Modo "aplicar a todos do filtro" ligado. */
  todosDoFiltro: boolean;
  /** `total` do filtro quando `todosDoFiltro`; senão o tamanho da seleção manual. */
  quantidadeSelecionada: number;
  /** Enquanto a ação em massa roda (a tela mostra a animação). */
  processando: boolean;
  /** Contagem ao fim: afetados + falharam (falha parcial). `null` antes de aplicar. */
  resultado: ResultadoDaAcao | null;
  erro: string | null;
  /** Marca/desmarca um id. Sai do modo "todos do filtro" (seleção manual tem precedência). */
  alternar: (id: string) => void;
  /** LIGA o modo "todos do filtro". NÃO baixa linhas, NÃO materializa ids. */
  selecionarTodosDoFiltro: () => void;
  limpar: () => void;
  /** Dispara a ação injetada com o alvo do modo corrente. */
  aplicar: (acao: AcaoEmMassa<TFiltro>) => Promise<ResultadoDaAcao | null>;
}

function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useSelecaoServidor<TFiltro>(
  opcoes: OpcoesSelecaoServidor<TFiltro>,
): SelecaoServidor<TFiltro> {
  const { filtro, total } = opcoes;

  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [todosDoFiltro, setTodosDoFiltro] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoDaAcao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const quantidadeSelecionada = todosDoFiltro ? total : selecionados.size;

  const alternar = useCallback((id: string) => {
    // Pôr a mão num id é escolha manual: sai do modo "todos do filtro".
    setTodosDoFiltro(false);
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }, []);

  const selecionarTodosDoFiltro = useCallback(() => {
    setTodosDoFiltro(true);
  }, []);

  const limpar = useCallback(() => {
    setSelecionados(new Set());
    setTodosDoFiltro(false);
    setResultado(null);
    setErro(null);
  }, []);

  const aplicar = useCallback(
    async (acao: AcaoEmMassa<TFiltro>): Promise<ResultadoDaAcao | null> => {
      setProcessando(true);
      setErro(null);
      setResultado(null);
      const alvo: AlvoDaAcao<TFiltro> = todosDoFiltro
        ? { modo: "filtro", filtro }
        : { modo: "ids", ids: [...selecionados] };
      try {
        const res = await acao(alvo);
        setResultado(res);
        // A ação foi aplicada (inclusive com falha parcial reportada): limpa a seleção.
        setSelecionados(new Set());
        setTodosDoFiltro(false);
        return res;
      } catch (e) {
        // Falha TOTAL (a ação nem completou): preserva a seleção para o time poder retentar.
        setErro(mensagemDeErro(e));
        return null;
      } finally {
        setProcessando(false);
      }
    },
    [todosDoFiltro, filtro, selecionados],
  );

  return {
    selecionados,
    todosDoFiltro,
    quantidadeSelecionada,
    processando,
    resultado,
    erro,
    alternar,
    selecionarTodosDoFiltro,
    limpar,
    aplicar,
  };
}
