"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Ordenação clicável de tabela, reutilizável em TODAS as tabelas do sistema.
 *
 * O sistema não tem componente de tabela compartilhado: cada tela monta a própria marcação sobre uma
 * das duas convenções de CSS (`.list-head`/`.row` em grid, ou `<table class="ds-table">`). Esta peça
 * é o denominador comum que faltava: a LÓGICA de ordenação mora aqui, a marcação continua de cada
 * tela, e ligar uma tabela nova é declarar as colunas e trocar o `<span>`/`<th>` do cabeçalho por
 * `<ColunaOrdenavel>`. Nenhuma reescrita de tela.
 *
 * LIMITE IMPORTANTE (registrado no diário): a ordenação é CLIENT-SIDE. Só é honesta em tabela que
 * carrega o conjunto inteiro. Numa tabela PAGINADA no servidor ela ordenaria apenas a página
 * visível, mostrando ordem falsa; nesse caso a ordenação tem de ir para a API (`orderBy`), não para
 * cá. É por isso que o Gerenciador (20 de 2282 por página) ficou de fora.
 */

export type TipoOrdenacao = "texto" | "data" | "numero" | "status";
export type Direcao = "asc" | "desc";

/** Valor comparável extraído de um item. `null`/`undefined`/"" contam como vazio. */
export type ValorOrdenacao = string | number | Date | null | undefined;

export interface ColunaOrdenavel<T> {
  /** Identificador estável da coluna (usado no clique e no indicador visual). */
  chave: string;
  tipo: TipoOrdenacao;
  /** Extrai do item o valor que a coluna ordena. Para "status", devolva o RANK numérico. */
  valor: (item: T) => ValorOrdenacao;
}

export interface OrdenacaoAtual {
  chave: string;
  dir: Direcao;
}

/**
 * Direção do PRIMEIRO clique, por tipo (decisão do diretor):
 *  - texto: A-Z, o segundo clique inverte para Z-A.
 *  - data: mais recente primeiro, o segundo clique inverte para mais antiga.
 *  - numero: maior primeiro (o número que interessa numa fila é sempre o maior: dias parado,
 *    documentos pendentes), o segundo clique inverte.
 *  - status: ordem do catálogo, do início do fluxo para o fim, o segundo clique inverte.
 */
export const DIRECAO_INICIAL: Record<TipoOrdenacao, Direcao> = {
  texto: "asc",
  data: "desc",
  numero: "desc",
  status: "asc",
};

function vazio(v: ValorOrdenacao): boolean {
  return v === null || v === undefined || v === "";
}

function paraNumero(v: ValorOrdenacao): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? Number.NaN : t;
}

/** Compara dois valores NÃO vazios. Sempre crescente; a direção é aplicada por quem chama. */
function comparar(tipo: TipoOrdenacao, a: ValorOrdenacao, b: ValorOrdenacao): number {
  if (tipo === "texto") {
    // pt-BR + sensitivity "base": acento e caixa não separam nomes (LUÍSA junto de Luisa).
    // numeric: "Cargo 2" antes de "Cargo 10".
    return String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
  }
  const na = paraNumero(a);
  const nb = paraNumero(b);
  // Data ilegível não deve embaralhar a lista: cai para o fim, como vazio.
  if (Number.isNaN(na) || Number.isNaN(nb)) {
    if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
    return Number.isNaN(na) ? 1 : -1;
  }
  return na === nb ? 0 : na < nb ? -1 : 1;
}

export interface Ordenacao<T> {
  /** Itens já ordenados. Sem coluna escolhida, devolve a lista recebida INTACTA. */
  itens: T[];
  ordem: OrdenacaoAtual | null;
  /** Clique no cabeçalho: escolhe a coluna ou inverte a direção se já for a ativa. */
  alternar: (chave: string) => void;
}

/**
 * Ordena `itens` pela coluna escolhida no cabeçalho.
 *
 * Enquanto o usuário não clica em nada, a lista sai EXATAMENTE como entrou: a ordenação padrão de
 * cada tela (no Farol, mais recente primeiro) é preservada, e a ordenação clicável é sobreposição
 * por ação do usuário. Pelo mesmo motivo o desempate é a posição original, então linhas de valor
 * igual mantêm a ordem padrão da tela em vez de embaralhar a cada clique.
 *
 * Vazio ("não informado") vai SEMPRE para o fim, nas duas direções: quem não tem o dado não deve
 * ocupar o topo da fila só por inverter a seta.
 */
export function useOrdenacao<T>(colunas: ColunaOrdenavel<T>[], itens: T[]): Ordenacao<T> {
  const [ordem, setOrdem] = useState<OrdenacaoAtual | null>(null);

  const mapa = useMemo(() => new Map(colunas.map((c) => [c.chave, c])), [colunas]);

  const alternar = useCallback(
    (chave: string) => {
      const col = mapa.get(chave);
      if (!col) return;
      setOrdem((cur) =>
        cur && cur.chave === chave
          ? { chave, dir: cur.dir === "asc" ? "desc" : "asc" }
          : { chave, dir: DIRECAO_INICIAL[col.tipo] },
      );
    },
    [mapa],
  );

  const ordenados = useMemo(() => {
    const col = ordem ? mapa.get(ordem.chave) : undefined;
    if (!ordem || !col) return itens;
    const sinal = ordem.dir === "asc" ? 1 : -1;
    return itens
      .map((it, i) => ({ it, i }))
      .sort((a, b) => {
        const va = col.valor(a.it);
        const vb = col.valor(b.it);
        const ea = vazio(va);
        const eb = vazio(vb);
        if (ea !== eb) return ea ? 1 : -1; // vazio por último, independente da direção
        if (ea) return a.i - b.i;
        const c = comparar(col.tipo, va, vb);
        return c !== 0 ? c * sinal : a.i - b.i;
      })
      .map((x) => x.it);
  }, [itens, ordem, mapa]);

  return { itens: ordenados, ordem, alternar };
}
