// @vitest-environment happy-dom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// O hook lê o token da sessão via useAuth e o repassa ao fetcher. Mockamos para não exigir um
// <AuthProvider> (que faz fetch no mount) e para afirmar que o token chega ao fetcher.
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "TOKEN-TESTE" }),
}));

import {
  usePaginacaoServidor,
  type PaginaDeResultado,
  type ParametrosDeBusca,
} from "./usePaginacaoServidor";

type Filtro = { q: string };
type Linha = { id: string };
type Kpis = { ativos: number };

describe("usePaginacaoServidor", () => {
  it("itens são SÓ a página atual, nunca acumulam entre páginas", async () => {
    const fetcher = vi.fn(
      async (params: ParametrosDeBusca<Filtro>): Promise<PaginaDeResultado<Linha, Kpis>> => ({
        itens: params.offset === 0 ? [{ id: "p1" }] : [{ id: "p2" }],
        total: 250,
        truncado: false,
        kpis: params.offset === 0 ? { ativos: 5 } : undefined,
      }),
    );

    const { result } = renderHook(() =>
      usePaginacaoServidor<Linha, Filtro, Kpis>({
        buscarPagina: fetcher,
        filtroInicial: { q: "" },
      }),
    );

    await waitFor(() => expect(result.current.itens).toEqual([{ id: "p1" }]));
    expect(result.current.totalPaginas).toBe(3); // 250 / 100
    expect(result.current.total).toBe(250);

    act(() => result.current.proxima());

    await waitFor(() => expect(result.current.pagina).toBe(2));
    await waitFor(() => expect(result.current.itens).toEqual([{ id: "p2" }]));
    // não acumulou: continua só a página atual, com uma linha
    expect(result.current.itens).toHaveLength(1);
  });

  it("o fetcher recebe offset/limite corretos e o token da sessão", async () => {
    const fetcher = vi.fn(
      async (): Promise<PaginaDeResultado<Linha, Kpis>> => ({
        itens: [],
        total: 500,
        truncado: false,
        kpis: { ativos: 1 },
      }),
    );

    const { result } = renderHook(() =>
      usePaginacaoServidor<Linha, Filtro, Kpis>({
        buscarPagina: fetcher,
        filtroInicial: { q: "" },
        limitePadrao: 100,
      }),
    );

    await waitFor(() => expect(result.current.total).toBe(500)); // 1ª resposta já processada
    expect(fetcher).toHaveBeenLastCalledWith(
      { filtro: { q: "" }, ordenarPor: undefined, direcao: undefined, offset: 0, limite: 100 },
      "TOKEN-TESTE",
    );
    expect(result.current.totalPaginas).toBe(5); // 500 / 100

    act(() => result.current.irParaPagina(3));
    await waitFor(() => expect(result.current.pagina).toBe(3));
    expect(fetcher).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 200, limite: 100 }),
      "TOKEN-TESTE",
    );
  });

  it("KPI é cacheado entre páginas e trocado no setFiltro", async () => {
    const fetcher = vi.fn(
      async (params: ParametrosDeBusca<Filtro>): Promise<PaginaDeResultado<Linha, Kpis>> => {
        if (params.offset > 0) {
          // página seguinte: o backend não recomputa o group-by pesado
          return { itens: [{ id: "p2" }], total: 250, truncado: false };
        }
        return {
          itens: [{ id: "p1" }],
          total: 250,
          truncado: false,
          kpis: { ativos: params.filtro.q === "x" ? 9 : 5 },
        };
      },
    );

    const { result } = renderHook(() =>
      usePaginacaoServidor<Linha, Filtro, Kpis>({
        buscarPagina: fetcher,
        filtroInicial: { q: "" },
      }),
    );

    await waitFor(() => expect(result.current.kpis).toEqual({ ativos: 5 }));

    // página 2 volta sem kpis: o hook mantém o anterior
    act(() => result.current.proxima());
    await waitFor(() => expect(result.current.pagina).toBe(2));
    await waitFor(() => expect(result.current.itens).toEqual([{ id: "p2" }]));
    expect(result.current.kpis).toEqual({ ativos: 5 });

    // trocar o filtro reseta para a página 1 e traz o KPI novo no offset 0
    act(() => result.current.setFiltro({ q: "x" }));
    await waitFor(() => expect(result.current.kpis).toEqual({ ativos: 9 }));
    expect(result.current.pagina).toBe(1);
  });

  it("ignora resposta fora de ordem (filtro trocado no meio do voo)", async () => {
    const resolvers: Array<(v: PaginaDeResultado<Linha, Kpis>) => void> = [];
    const fetcher = vi.fn(
      () => new Promise<PaginaDeResultado<Linha, Kpis>>((resolve) => resolvers.push(resolve)),
    );

    const { result } = renderHook(() =>
      usePaginacaoServidor<Linha, Filtro, Kpis>({
        buscarPagina: fetcher,
        filtroInicial: { q: "" },
      }),
    );

    // resolvers[0] = busca do mount (filtro "")
    await waitFor(() => expect(resolvers).toHaveLength(1));

    act(() => result.current.setFiltro({ q: "a" })); // resolvers[1]
    await waitFor(() => expect(resolvers).toHaveLength(2));
    act(() => result.current.setFiltro({ q: "b" })); // resolvers[2]
    await waitFor(() => expect(resolvers).toHaveLength(3));

    // resolve a MAIS NOVA primeiro (filtro "b")
    await act(async () => {
      resolvers[2]({ itens: [{ id: "B" }], total: 1, truncado: false, kpis: { ativos: 2 } });
    });
    expect(result.current.itens).toEqual([{ id: "B" }]);

    // agora as velhas resolvem tarde: NÃO podem sobrescrever
    await act(async () => {
      resolvers[1]({ itens: [{ id: "A" }], total: 1, truncado: false, kpis: { ativos: 1 } });
      resolvers[0]({ itens: [{ id: "INIT" }], total: 1, truncado: false, kpis: { ativos: 0 } });
    });
    expect(result.current.itens).toEqual([{ id: "B" }]);
    expect(result.current.kpis).toEqual({ ativos: 2 });
  });

  it("setOrdenacao alterna asc/desc na mesma coluna, reinicia em asc na troca e volta à página 1", async () => {
    const fetcher = vi.fn(
      async (): Promise<PaginaDeResultado<Linha, Kpis>> => ({
        itens: [],
        total: 250,
        truncado: false,
        kpis: { ativos: 5 },
      }),
    );

    const { result } = renderHook(() =>
      usePaginacaoServidor<Linha, Filtro, Kpis>({
        buscarPagina: fetcher,
        filtroInicial: { q: "" },
      }),
    );
    await waitFor(() => expect(fetcher).toHaveBeenCalled());

    act(() => result.current.irParaPagina(2));
    await waitFor(() => expect(result.current.pagina).toBe(2));

    act(() => result.current.setOrdenacao("candidato"));
    await waitFor(() => expect(result.current.ordenarPor).toBe("candidato"));
    expect(result.current.direcao).toBe("asc");
    expect(result.current.pagina).toBe(1); // voltou à página 1

    act(() => result.current.setOrdenacao("candidato"));
    await waitFor(() => expect(result.current.direcao).toBe("desc"));

    act(() => result.current.setOrdenacao("vaga"));
    await waitFor(() => expect(result.current.ordenarPor).toBe("vaga"));
    expect(result.current.direcao).toBe("asc"); // troca de coluna reinicia em asc
  });
});
