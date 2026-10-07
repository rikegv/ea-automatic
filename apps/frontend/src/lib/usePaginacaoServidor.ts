"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * PAGINACAO NO SERVIDOR, genérica e compartilhada (frente de paginação da Central de Candidatos e
 * da aba Ver Candidatos das Vagas). O hook NÃO conhece Candidato nem Vaga: o fetcher, o tipo da
 * linha (`TLinha`), o tipo do filtro (`TFiltro`) e o tipo do KPI (`TKpis`) são INJETADOS. Isso serve
 * as duas telas sem que nenhuma herde a peculiaridade da outra (§2 e §3.3/§3.4 do mapa de alcance).
 *
 * O QUE O HOOK GARANTE, e que a ordenação client-side (`useOrdenacao`) não garantia em tabela
 * paginada:
 *  - `itens` é SÓ a página atual, NUNCA acumula entre páginas (o navegador nunca segura as 83 mil);
 *  - `kpis` é cacheado: só troca quando o FILTRO muda. A página seguinte volta com `kpis` undefined
 *    (o backend só computa o group-by pesado no offset 0) e o hook MANTÉM o KPI anterior;
 *  - resposta FORA DE ORDEM é ignorada: trocar o filtro rápido não deixa a resposta velha
 *    sobrescrever a nova (guarda por id monotônico de requisição).
 *
 * O `token` da sessão é lido daqui e repassado ao fetcher: o fetcher da tela recebe
 * `(params, token)` e decide o que fazer com ele (o cliente HTTP já injeta o Bearer do módulo, mas o
 * contrato explícito mantém o hook honesto sobre a sessão corrente).
 */

export type DirecaoPaginacao = "asc" | "desc";

export interface ParametrosDeBusca<TFiltro> {
  filtro: TFiltro;
  ordenarPor?: string;
  direcao?: DirecaoPaginacao;
  offset: number;
  limite: number;
}

export interface PaginaDeResultado<TLinha, TKpis> {
  itens: TLinha[];
  total: number;
  truncado: boolean;
  /**
   * Presente só quando o filtro mudou (offset 0). Página seguinte volta `undefined` e o hook mantém
   * o KPI anterior. Nunca confundir "sem KPI nesta resposta" com "KPI zerado".
   */
  kpis?: TKpis;
}

export type BuscadorDePagina<TLinha, TFiltro, TKpis> = (
  params: ParametrosDeBusca<TFiltro>,
  token: string | null,
) => Promise<PaginaDeResultado<TLinha, TKpis>>;

export interface OpcoesPaginacaoServidor<TLinha, TFiltro, TKpis> {
  buscarPagina: BuscadorDePagina<TLinha, TFiltro, TKpis>;
  filtroInicial: TFiltro;
  /** Tamanho da página. Default 100. */
  limitePadrao?: number;
}

export interface PaginacaoServidor<TLinha, TFiltro, TKpis> {
  /** SÓ a página atual. Nunca o acumulado. */
  itens: TLinha[];
  /** 1-based. */
  pagina: number;
  totalPaginas: number;
  total: number;
  truncado: boolean;
  /** Cacheado: só troca quando o filtro muda. `null` antes da primeira resposta. */
  kpis: TKpis | null;
  filtro: TFiltro;
  ordenarPor?: string;
  direcao?: DirecaoPaginacao;
  carregando: boolean;
  erro: string | null;
  irParaPagina: (n: number) => void;
  proxima: () => void;
  anterior: () => void;
  /** Merge no filtro, RESETA para a página 1; o KPI novo vem no offset 0. */
  setFiltro: (parcial: Partial<TFiltro>) => void;
  /**
   * Alterna asc/desc na mesma coluna; trocar a coluna reinicia em asc. RESETA para a página 1 e NÃO
   * reseta o filtro. A ordenação não muda o conjunto, então o KPI cacheado segue válido.
   */
  setOrdenacao: (coluna: string) => void;
}

function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function usePaginacaoServidor<TLinha, TFiltro, TKpis>(
  opcoes: OpcoesPaginacaoServidor<TLinha, TFiltro, TKpis>,
): PaginacaoServidor<TLinha, TFiltro, TKpis> {
  const { token } = useAuth();
  const limite = opcoes.limitePadrao ?? 100;

  const [itens, setItens] = useState<TLinha[]>([]);
  const [total, setTotal] = useState(0);
  const [truncado, setTruncado] = useState(false);
  const [kpis, setKpis] = useState<TKpis | null>(null);
  const [pagina, setPagina] = useState(1);
  const [filtro, setFiltroState] = useState<TFiltro>(() => opcoes.filtroInicial);
  const [ordenarPor, setOrdenarPor] = useState<string | undefined>(undefined);
  const [direcao, setDirecao] = useState<DirecaoPaginacao | undefined>(undefined);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O fetcher e o token moram em ref: assim um fetcher inline (identidade instável) da tela NÃO
  // dispara refetch, e a renovação silenciosa do token não recarrega a página. A busca é keyed só
  // pelos PARÂMETROS (página, filtro, ordenação), que é o que de fato muda o resultado.
  const buscarRef = useRef(opcoes.buscarPagina);
  buscarRef.current = opcoes.buscarPagina;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Id monotônico: a última requisição emitida é a única cujo id bate com o ref. Resposta de uma
  // requisição anterior (filtro trocado no meio do voo) chega com id defasado e é descartada.
  const requisicaoRef = useRef(0);

  useEffect(() => {
    const id = (requisicaoRef.current += 1);
    setCarregando(true);
    setErro(null);
    const offset = (pagina - 1) * limite;
    buscarRef
      .current({ filtro, ordenarPor, direcao, offset, limite }, tokenRef.current)
      .then((resp) => {
        if (id !== requisicaoRef.current) return; // resposta fora de ordem: ignora
        setItens(resp.itens);
        setTotal(resp.total);
        setTruncado(resp.truncado);
        if (resp.kpis !== undefined) setKpis(resp.kpis); // undefined = mantém o KPI cacheado
        setCarregando(false);
      })
      .catch((e) => {
        if (id !== requisicaoRef.current) return;
        setErro(mensagemDeErro(e));
        setCarregando(false);
      });
    // Na troca de deps (e no unmount) invalida a requisição em voo, para ela não escrever tarde.
    return () => {
      requisicaoRef.current += 1;
    };
  }, [pagina, filtro, ordenarPor, direcao, limite]);

  const totalPaginas = Math.max(1, Math.ceil(total / limite));

  const irParaPagina = useCallback(
    (n: number) => {
      setPagina((_atual) => Math.min(Math.max(1, Math.trunc(n)), Math.max(1, totalPaginas)));
    },
    [totalPaginas],
  );

  const proxima = useCallback(() => {
    setPagina((atual) => Math.min(atual + 1, Math.max(1, totalPaginas)));
  }, [totalPaginas]);

  const anterior = useCallback(() => {
    setPagina((atual) => Math.max(1, atual - 1));
  }, []);

  const setFiltro = useCallback((parcial: Partial<TFiltro>) => {
    setFiltroState((atual) => ({ ...atual, ...parcial }));
    setPagina(1);
  }, []);

  const setOrdenacao = useCallback((coluna: string) => {
    setOrdenarPor((colAtual) => {
      if (colAtual === coluna) {
        setDirecao((d) => (d === "asc" ? "desc" : "asc"));
        return colAtual;
      }
      setDirecao("asc");
      return coluna;
    });
    setPagina(1);
  }, []);

  return {
    itens,
    pagina,
    totalPaginas,
    total,
    truncado,
    kpis,
    filtro,
    ordenarPor,
    direcao,
    carregando,
    erro,
    irParaPagina,
    proxima,
    anterior,
    setFiltro,
    setOrdenacao,
  };
}
