// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ O LIVRO DA AGENDA DE ENTREVISTAS: a navegação de ponta a ponta ───────────────────────────────
 *
 * Prova o fluxo que a OST pede, sem rede: página 1 (consultor) -> página 2 (mês com a bolinha de
 * TOTAL de pessoas) -> página 3 (horários com a QUANTIDADE de pessoas) -> modal (as pessoas, a vaga
 * de cada uma e o rastreio de quem atribuiu) -> abrir o candidato. As três leituras são dubladas.
 */

const { carregarAgendaDoMes, carregarDiaDoConsultor } = vi.hoisted(() => ({
  carregarAgendaDoMes: vi.fn(),
  carregarDiaDoConsultor: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ token: "t" }) }));

vi.mock("@/lib/as-agenda-entrevistas", () => ({
  carregarAgendaDoMes,
  carregarDiaDoConsultor,
  useConsultoresDaAgenda: () => ({
    consultores: [
      { id: "consultor-1", nome: "Maria Consultora" },
      { id: "consultor-2", nome: "João Consultor" },
    ],
    carregando: false,
    erro: null,
  }),
}));

// A ficha do candidato é dublada: o que importa aqui é que o clique no nome a ABRE, com o id certo.
vi.mock("@/components/as/candidatos/FichaCandidatoModal", () => ({
  FichaCandidatoModal: ({ candidatoId }: { candidatoId: string }) => (
    <div data-testid="ficha-aberta">ficha:{candidatoId}</div>
  ),
}));

import AgendaDeEntrevistasPage from "./page";

/** O dia 15 do mês CORRENTE: a página abre no mês atual, e a célula mapeia por número do dia. */
function dia15DoMesCorrente(): string {
  const a = new Date();
  return `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}-15`;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("o livro da Agenda de Entrevistas", () => {
  it("vai de consultor a mês a horários a modal, com as pessoas, a vaga e o rastreio, e abre o candidato", async () => {
    carregarAgendaDoMes.mockResolvedValue([{ data: dia15DoMesCorrente(), pessoas: 3 }]);
    carregarDiaDoConsultor.mockResolvedValue([
      {
        instante: "2026-10-15T13:00:00.000Z",
        hora: "10:00",
        pessoas: [
          {
            candidaturaId: "cand-a",
            candidatoId: "pessoa-a",
            candidatoNome: "Candidato Alfa",
            vagaId: "vaga-1",
            vagaNome: "Operador De Caixa",
            vagaCodigo: "PS-1",
            atribuidoPorNome: "Quem Agendou",
            atribuidoEm: "2026-10-12T12:00:00.000Z",
          },
        ],
      },
    ]);

    render(<AgendaDeEntrevistasPage />);

    // PÁGINA 1: escolher o consultor.
    fireEvent.click(screen.getByRole("button", { name: "Maria Consultora" }));

    // PÁGINA 2: a agenda do mês carrega e o dia 15 mostra a bolinha com o TOTAL de pessoas (3).
    await waitFor(() => expect(carregarAgendaDoMes).toHaveBeenCalled());
    const celulaDia = await screen.findByRole("button", { name: /Dia 15, 3 pessoas/i });
    expect(celulaDia).toBeTruthy();

    // Vira para a PÁGINA 3 (horários do dia).
    fireEvent.click(celulaDia);
    await waitFor(() => expect(carregarDiaDoConsultor).toHaveBeenCalled());
    const horario = await screen.findByRole("button", { name: /10:00/ });
    expect(horario.textContent).toMatch(/1 pessoa/);

    // MODAL: as pessoas do horário, com a vaga e o rastreio de quem atribuiu.
    fireEvent.click(horario);
    expect(await screen.findByText("Candidato Alfa")).toBeTruthy();
    expect(screen.getByText(/Operador De Caixa/)).toBeTruthy();
    expect(screen.getByText(/Atribuída por Quem Agendou/)).toBeTruthy();

    // ATALHO: clicar no nome abre o candidato (a ficha), com o id certo.
    fireEvent.click(screen.getByText("Candidato Alfa"));
    expect(screen.getByTestId("ficha-aberta").textContent).toBe("ficha:pessoa-a");
  });

  it("volta da página de horários para a agenda do mês", async () => {
    carregarAgendaDoMes.mockResolvedValue([{ data: dia15DoMesCorrente(), pessoas: 1 }]);
    carregarDiaDoConsultor.mockResolvedValue([
      {
        instante: "2026-10-15T13:00:00.000Z",
        hora: "10:00",
        pessoas: [
          {
            candidaturaId: "cand-a",
            candidatoId: "pessoa-a",
            candidatoNome: "Candidato Alfa",
            vagaId: "vaga-1",
            vagaNome: "Operador De Caixa",
            vagaCodigo: "PS-1",
            atribuidoPorNome: null,
            atribuidoEm: "2026-10-12T12:00:00.000Z",
          },
        ],
      },
    ]);

    render(<AgendaDeEntrevistasPage />);
    fireEvent.click(screen.getByRole("button", { name: "Maria Consultora" }));
    const celulaDia = await screen.findByRole("button", { name: /Dia 15, 1 pessoa/i });
    fireEvent.click(celulaDia);
    await screen.findByRole("button", { name: /10:00/ });

    fireEvent.click(screen.getByRole("button", { name: /Voltar à agenda do mês/i }));
    // De volta ao mês: a célula do dia 15 volta a aparecer.
    expect(await screen.findByRole("button", { name: /Dia 15, 1 pessoa/i })).toBeTruthy();
  });
});
