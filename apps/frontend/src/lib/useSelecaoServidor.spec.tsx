// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSelecaoServidor, type AcaoEmMassa } from "./useSelecaoServidor";

type Filtro = { aba: string };

describe("useSelecaoServidor", () => {
  it("todosDoFiltro reporta quantidadeSelecionada = total", () => {
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 2509 }),
    );

    expect(result.current.quantidadeSelecionada).toBe(0);
    act(() => result.current.selecionarTodosDoFiltro());
    expect(result.current.todosDoFiltro).toBe(true);
    expect(result.current.quantidadeSelecionada).toBe(2509);
  });

  it("modo-todos: aplicar chama a ação injetada com { modo: 'filtro', filtro } e limpa no sucesso", async () => {
    const acao: AcaoEmMassa<Filtro> = vi.fn(async () => ({ afetados: 2509, falharam: 0 }));
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 2509 }),
    );

    act(() => result.current.selecionarTodosDoFiltro());
    await act(async () => {
      await result.current.aplicar(acao);
    });

    expect(acao).toHaveBeenCalledWith({ modo: "filtro", filtro: { aba: "ativas" } });
    expect(result.current.resultado).toEqual({ afetados: 2509, falharam: 0 });
    expect(result.current.processando).toBe(false);
    // limpou a seleção no sucesso
    expect(result.current.todosDoFiltro).toBe(false);
    expect(result.current.quantidadeSelecionada).toBe(0);
  });

  it("modo-manual: aplicar chama a ação injetada com { modo: 'ids', ids }", async () => {
    const acao: AcaoEmMassa<Filtro> = vi.fn(async () => ({ afetados: 2, falharam: 0 }));
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 100 }),
    );

    act(() => result.current.alternar("id-1"));
    act(() => result.current.alternar("id-2"));
    expect(result.current.quantidadeSelecionada).toBe(2);
    expect(result.current.todosDoFiltro).toBe(false);

    await act(async () => {
      await result.current.aplicar(acao);
    });

    expect(acao).toHaveBeenCalledWith({ modo: "ids", ids: ["id-1", "id-2"] });
    expect(result.current.resultado).toEqual({ afetados: 2, falharam: 0 });
    expect(result.current.selecionados.size).toBe(0); // limpou
  });

  it("alternar desmarca e sai do modo todos-do-filtro", () => {
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 50 }),
    );

    act(() => result.current.alternar("id-1"));
    act(() => result.current.alternar("id-2"));
    act(() => result.current.alternar("id-1")); // desmarca id-1
    expect([...result.current.selecionados]).toEqual(["id-2"]);

    act(() => result.current.selecionarTodosDoFiltro());
    expect(result.current.todosDoFiltro).toBe(true);
    act(() => result.current.alternar("id-3"));
    expect(result.current.todosDoFiltro).toBe(false);
  });

  it("falha parcial: resultado carrega afetados e falharam", async () => {
    const acao: AcaoEmMassa<Filtro> = vi.fn(async () => ({ afetados: 2400, falharam: 109 }));
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 2509 }),
    );

    act(() => result.current.selecionarTodosDoFiltro());
    await act(async () => {
      await result.current.aplicar(acao);
    });

    expect(result.current.resultado).toEqual({ afetados: 2400, falharam: 109 });
    expect(result.current.erro).toBeNull();
  });

  it("processando é true enquanto a ação roda e false ao terminar", async () => {
    let resolver: ((r: { afetados: number; falharam: number }) => void) | undefined;
    const acao: AcaoEmMassa<Filtro> = vi.fn(
      () =>
        new Promise<{ afetados: number; falharam: number }>((resolve) => {
          resolver = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 10 }),
    );

    act(() => result.current.selecionarTodosDoFiltro());

    let promessa: Promise<unknown> | undefined;
    act(() => {
      promessa = result.current.aplicar(acao);
    });
    expect(result.current.processando).toBe(true);

    await act(async () => {
      resolver?.({ afetados: 10, falharam: 0 });
      await promessa;
    });
    expect(result.current.processando).toBe(false);
    expect(result.current.resultado).toEqual({ afetados: 10, falharam: 0 });
  });

  it("falha TOTAL (ação lança): erro preenchido, seleção preservada para retentar", async () => {
    const acao: AcaoEmMassa<Filtro> = vi.fn(async () => {
      throw new Error("rede caiu");
    });
    const { result } = renderHook(() =>
      useSelecaoServidor<Filtro>({ filtro: { aba: "ativas" }, total: 10 }),
    );

    act(() => result.current.alternar("id-1"));
    await act(async () => {
      await result.current.aplicar(acao);
    });

    expect(result.current.erro).toBe("rede caiu");
    expect(result.current.resultado).toBeNull();
    expect(result.current.processando).toBe(false);
    expect(result.current.selecionados.size).toBe(1); // preservada
  });
});
