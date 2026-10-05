// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsVagaExclusaoPrevia, VagaListItem } from "@ea/shared-types";

/**
 * O MODAL DE EXCLUSÃO: lê a prévia antes de oferecer o botão, explica quando a vaga tem gente e
 * não pode sair, avisa quando ela pode renascer pela varredura, e só então chama o DELETE.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

import { ExcluirVagaModal } from "./ExcluirVagaModal";

const VAGA = { id: "vaga-1", codigo: "PS-1", nomeDivulgacao: "Operador" } as unknown as VagaListItem;

function rede(previa: AsVagaExclusaoPrevia) {
  apiFetch.mockImplementation(async (path: string, opts?: { method?: string }) => {
    if (path.endsWith("/exclusao-previa")) return previa;
    if (path === "/as/vagas/vaga-1" && opts?.method === "DELETE") return null;
    throw new Error(`rota inesperada: ${path}`);
  });
}

function montar() {
  const onFechar = vi.fn();
  const onExcluida = vi.fn();
  render(<ExcluirVagaModal vaga={VAGA} token="t" onFechar={onFechar} onExcluida={onExcluida} />);
  return { onFechar, onExcluida };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ExcluirVagaModal", () => {
  it("vaga com gente: explica as contagens, só oferece Fechar e nunca chama o DELETE", async () => {
    rede({ vagaId: "vaga-1", podeExcluir: false, candidaturas: 4, shortlists: 1, voltaPelaVarredura: false });
    const { onFechar } = montar();

    expect(await screen.findByText(/tem 4 candidaturas e 1 shortlist/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Excluir Vaga" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Excluir vaga" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalled();
    expect(apiFetch.mock.calls.some(([, o]) => (o as { method?: string })?.method === "DELETE")).toBe(false);
  });

  it("vaga do Pandapé: avisa que a varredura pode recriá-la, e confirmar chama o DELETE", async () => {
    rede({ vagaId: "vaga-1", podeExcluir: true, candidaturas: 0, shortlists: 0, voltaPelaVarredura: true });
    const { onExcluida } = montar();

    expect(
      await screen.findByText(
        "Esta vaga veio do Pandapé. Se ela ainda estiver ativa lá, a varredura a recria na fila de revisão em até 30 minutos.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Excluir vaga" }));
    await waitFor(() => expect(onExcluida).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith("/as/vagas/vaga-1", expect.objectContaining({ method: "DELETE" }));
  });

  it("vaga criada à mão: sem o aviso da varredura", async () => {
    rede({ vagaId: "vaga-1", podeExcluir: true, candidaturas: 0, shortlists: 0, voltaPelaVarredura: false });
    montar();
    await screen.findByRole("button", { name: "Excluir vaga" });
    expect(screen.queryByText(/veio do Pandapé/)).toBeNull();
  });
});
