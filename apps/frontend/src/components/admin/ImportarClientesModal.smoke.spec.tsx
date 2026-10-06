// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * RENDER SMOKE: o modal abre com o que o time precisa ANTES de subir arquivo nenhum, os dois botões
 * de modelo e a saída por Cancelar (§A.41, modal de preenchimento fecha por Cancelar ou Confirmar).
 * Nada de rede é tocado no mount: os helpers só disparam no clique.
 */

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ token: "tok-de-teste" }),
}));

import { ImportarClientesModal } from "./ImportarClientesModal";

afterEach(cleanup);

describe("ImportarClientesModal", () => {
  it("abre com os botões de modelo e a saída por Cancelar", () => {
    render(<ImportarClientesModal onClose={() => {}} onConcluido={() => {}} />);
    expect(screen.getByRole("heading", { name: "Importar Clientes" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Baixar Modelo (xlsx)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Baixar Modelo (csv)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    // O Confirmar nasce desabilitado: sem prévia não há o que gravar.
    const confirmar = screen.getByRole("button", { name: "Confirmar Importação" });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
  });
});
