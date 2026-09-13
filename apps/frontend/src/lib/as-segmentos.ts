"use client";

/**
 * ─ O CATÁLOGO DE SEGMENTOS, DO LADO DA TELA (Onda E, peça 1) ──────────────────────────────────
 *
 * SEGMENTO AQUI É O RAMO DO CLIENTE: Varejo, Saúde, Indústria. Ele classifica o CLIENTE, e a vaga
 * o herda dele.
 *
 * ┌─ TRÊS HOMÔNIMOS NO REPOSITÓRIO, E O TERCEIRO É PERIGOSO ───────────────────────────────────┐
 * │ 1. "segmento de rota" (`auditoria`, `exame`), no `esteira.service`: pedaço de URL.          │
 * │ 2. `LinhaSegmento`, no `gerencial.service`: quebra de relatório.                             │
 * │ 3. "segmentação de ÁREA" (`docs/ARQUITETURA-SEGMENTACAO-AREA.md`): o teto de RBAC por área,  │
 * │    um mecanismo de PERMISSÃO. Confundir este módulo com aquele é confundir "de que ramo é o  │
 * │    cliente" com "o que este usuário pode ver", e o engano não dá erro: ele dá acesso.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * É por isso que a tabela, a rota e o menu nascem com o prefixo do módulo (`as_segmentos`,
 * `/as/segmentos`, `as-segmentos`), como já fazem as linhas de serviço e as etapas do funil.
 *
 * MOLDE DE `as-linhas-servico`, linha a linha: funções puras que recebem o catálogo
 * explicitamente, uma promessa memoizada por carga de página, e um gancho em volta dela.
 *
 * §A.6: catálogo de processo. Id, código, rótulo, ordem e um booleano. Nenhum dado pessoal.
 * §A.11 (sem travessão), §A.24 (o rótulo vem do diretor já escrito).
 */

import { useCallback, useEffect, useState } from "react";
import type { AsSegmento } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/**
 * O TIPO É O DO `shared-types` (`AsSegmento`), escrito lá pelo COORDENADOR, que é o dono único
 * daquele arquivo nesta frente (§A.39). Este módulo o consome e reexporta, para quem importa o
 * catálogo não precisar importar de dois lugares.
 */
export type { AsSegmento };

/**
 * A LEITURA, aberta a qualquer autenticado: o rótulo do segmento aparece na ficha do cliente e no
 * seletor do cadastro, e quem só cadastra cliente precisa dele.
 * `incluirInativos=1` porque o cliente antigo pode apontar para um segmento que saiu de circulação,
 * e sem ele a ficha mostraria o código cru no lugar do nome.
 */
/* ┌─ O NOME DO PARÂMETRO PRECISA BATER COM O DO BACKEND, E O ERRO AQUI É SILENCIOSO ─────────┐
   │ O molde (`as-linhas-servico`, `as-etapas`) usa `incluirInativas`, no feminino, porque lá o │
   │ substantivo é "linha" e "etapa". Aqui é `incluirInativos`, no masculino. Errando o nome, o │
   │ backend NÃO devolve erro: ele ignora o parâmetro desconhecido e manda só os ATIVOS, e a    │
   │ tela passa a mostrar vazio no lugar do segmento que saiu de circulação, sem nada falhar.   │
   └────────────────────────────────────────────────────────────────────────────────────────────┘ */
export const ROTA_LEITURA = "/as/segmentos?incluirInativos=1";
/** A ESCRITA, de SUPER_ADMIN, na camada `/admin` como todo catálogo gerenciável. */
export const ROTA_ADMIN = "/admin/as/segmentos";

/** NA ORDEM DO DIRETOR, e o desempate é o id: dois segmentos com a mesma ordem não podem dançar. */
export function segmentosOrdenados(catalogo: readonly AsSegmento[]): AsSegmento[] {
  return [...catalogo].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

/** Só os que podem ser ESCOLHIDOS num cliente. */
export function segmentosAtivos(catalogo: readonly AsSegmento[]): AsSegmento[] {
  return segmentosOrdenados(catalogo).filter((s) => s.ativo);
}

/**
 * O RÓTULO PELO ID DO CATÁLOGO, que é como o CLIENTE guarda o segmento.
 *
 * A QUEDA É PARA NULO, e não para o número: "12" não diz nada a quem lê a ficha, e a célula tem uma
 * resposta melhor para a ausência, que é o "não informado" (§A.11) que ela já escreve.
 */
export function rotuloDoSegmentoPorId(
  id: number | string | null | undefined,
  catalogo: readonly AsSegmento[],
): string | null {
  if (id === null || id === undefined || String(id).trim() === "") return null;
  const alvo = Number(id);
  return catalogo.find((s) => s.id === alvo)?.rotulo ?? null;
}

// ── A PROMESSA MEMOIZADA: uma requisição por carga de página ────────────────

let emVoo: Promise<AsSegmento[]> | null = null;

export function carregarSegmentos(token?: string | null): Promise<AsSegmento[]> {
  if (!emVoo) {
    emVoo = apiFetch<AsSegmento[]>(ROTA_LEITURA, { token }).catch((e) => {
      // A FALHA NÃO FICA GRUDADA: uma requisição que caia com a sessão renovando condenaria a
      // página inteira a nunca mais ter catálogo até alguém recarregar.
      emVoo = null;
      throw e;
    });
  }
  return emVoo;
}

/** Depois de escrever no catálogo (a tela de administração), a memória tem de morrer. */
export function invalidarCatalogoDeSegmentos(): void {
  emVoo = null;
}

export interface CatalogoDeSegmentos {
  /** TODOS, na ordem, inativos incluídos. É esta lista que o `PATCH /ordem` exige. */
  segmentos: AsSegmento[];
  /** Só os escolhíveis. É esta que alimenta o seletor do cadastro de cliente. */
  ativos: AsSegmento[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useSegmentos(token?: string | null): CatalogoDeSegmentos {
  const [segmentos, setSegmentos] = useState<AsSegmento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(
    async (recarregando: boolean) => {
      if (recarregando) invalidarCatalogoDeSegmentos();
      setCarregando(true);
      setErro(null);
      try {
        setSegmentos(segmentosOrdenados(await carregarSegmentos(token)));
      } catch {
        /* A TELA NÃO MORRE POR FALTA DE CATÁLOGO. Com a lista vazia, o seletor fica vazio e diz o
           motivo, e o resto do cadastro de cliente continua servindo. O segmento é opcional. */
        setErro("Não foi possível carregar os segmentos.");
      } finally {
        setCarregando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void buscar(false);
  }, [buscar]);

  const recarregar = useCallback(() => buscar(true), [buscar]);

  return { segmentos, ativos: segmentos.filter((s) => s.ativo), carregando, erro, recarregar };
}
