// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem } from "@ea/shared-types";

/**
 * ─ O CONTROLE DA ENTREVISTA: quem o oferece é o CATÁLOGO (Frente E, ponto 8) ──────────────────
 *
 * ┌─ A REGRA QUE ESTE ARQUIVO PROTEGE ──────────────────────────────────────────────────────────┐
 * │ A tela NÃO decide em que etapa cabe entrevista: quem decide é `as_etapas_funil.tem_entrevista`│
 * │ lido por `GET /as/etapas/com-entrevista`. Uma comparação com `"ENTREVISTA_SOULAN"` escrita na │
 * │ tela funcionaria hoje e pararia em silêncio no dia em que o diretor renomear a etapa ou       │
 * │ marcar a segunda. Por isso os códigos deste teste são inventados: nenhum deles é privilegiado.│
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A SEGUNDA REGRA: O QUE JÁ FOI MARCADO APARECE MESMO QUANDO A ETAPA ATUAL NÃO OFERECE O
 * CONTROLE. O time marca a entrevista do cliente enquanto a pessoa ainda está na etapa Soulan, e
 * esconder o agendamento faria a tela parecer tê-lo perdido.
 */

const { marcarEntrevista } = vi.hoisted(() => ({ marcarEntrevista: vi.fn() }));

const CATALOGO = { codigos: ["ETAPA_COM"], carregando: false, erro: null };
let ENTREVISTAS: unknown[] = [];

vi.mock("@/lib/as-entrevistas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-entrevistas")>("@/lib/as-entrevistas");
  // AS RÉGUAS SÃO AS DE VERDADE (`etapaAceitaEntrevista`, as conversões de instante): só a rede é
  // dublada, senão o teste afirmaria o dublê no lugar da régua.
  return {
    ...real,
    marcarEntrevista,
    useEtapasComEntrevista: () => CATALOGO,
    useEntrevistas: () => ({
      entrevistas: ENTREVISTAS,
      carregando: false,
      erro: null,
      substituir: () => {},
    }),
  };
});

import { EntrevistaDaCandidatura } from "./EntrevistaDaCandidatura";

function candidatura(etapa: string): AsCandidaturaItem {
  return {
    id: "cand-1",
    candidatoId: "p1",
    candidatoNome: "Fulano De Tal",
    vagaId: "vaga-1",
    vagaCodigo: "PS-2026-001",
    vagaNome: "Vaga de teste",
    etapa,
    situacao: "ATIVO",
    posicaoLado: null,
    motivoDescarte: null,
    alocadoEm: "2026-09-01T12:00:00.000Z",
    alocadoPorNome: "Ana",
    atualizadoEm: "2026-09-01T12:00:00.000Z",
    ultimoContatoEm: null,
    pretensaoSalarial: null,
  };
}

afterEach(() => {
  cleanup();
  marcarEntrevista.mockReset();
  ENTREVISTAS = [];
});

describe("quem oferece o controle é o catálogo", () => {
  it("oferece na etapa que o catálogo marcou", () => {
    render(<EntrevistaDaCandidatura candidatura={candidatura("ETAPA_COM")} token="t" />);
    expect(screen.getByLabelText("Data e horário da entrevista")).toBeTruthy();
  });

  it("não oferece na etapa que o catálogo NÃO marcou, e não some da tela em silêncio", () => {
    render(<EntrevistaDaCandidatura candidatura={candidatura("ETAPA_SEM")} token="t" />);
    // Sem entrevista marcada e sem controle, o componente não desenha seção nenhuma: nada de
    // caixa vazia para quem não usa o recurso.
    expect(screen.queryByLabelText("Data e horário da entrevista")).toBeNull();
    expect(screen.queryByText("Entrevista")).toBeNull();
  });

  it("mostra o que JÁ está marcado mesmo na etapa que não oferece o controle", () => {
    ENTREVISTAS = [
      {
        id: "e1",
        candidaturaId: "cand-1",
        etapa: "ETAPA_COM",
        agendadaEm: "2026-09-26T17:30:00.000Z",
        agendadaPorNome: "Ana",
        atualizadoEm: "2026-09-26T17:30:00.000Z",
      },
    ];
    render(<EntrevistaDaCandidatura candidatura={candidatura("ETAPA_SEM")} token="t" />);
    expect(screen.getByText("Entrevista")).toBeTruthy();
    expect(screen.getByText(/marcada por Ana/)).toBeTruthy();
  });
});

describe("marcar e remarcar", () => {
  it("manda a etapa ATUAL e o instante, e o botão não libera sem data", async () => {
    render(<EntrevistaDaCandidatura candidatura={candidatura("ETAPA_COM")} token="t" />);
    const botao = screen.getByRole("button", { name: /Marcar entrevista/ }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Data e horário da entrevista"), {
      target: { value: "2026-09-26T14:30" },
    });
    expect(botao.disabled).toBe(false);

    marcarEntrevista.mockResolvedValueOnce([]);
    fireEvent.click(botao);
    await waitFor(() => expect(marcarEntrevista).toHaveBeenCalledTimes(1));
    const [id, corpo] = marcarEntrevista.mock.calls[0];
    expect(id).toBe("cand-1");
    expect(corpo.etapa).toBe("ETAPA_COM");
    // O INSTANTE, e não a string do campo: é o que o `@IsISO8601` do servidor espera.
    expect(new Date(corpo.agendadaEm).getTime()).toBe(new Date("2026-09-26T14:30").getTime());
  });

  it("com a etapa já marcada, o botão vira REMARCAR e o campo abre preenchido", () => {
    const agendadaEm = new Date("2026-09-26T14:30").toISOString();
    ENTREVISTAS = [
      {
        id: "e1",
        candidaturaId: "cand-1",
        etapa: "ETAPA_COM",
        agendadaEm,
        agendadaPorNome: "Ana",
        atualizadoEm: agendadaEm,
      },
    ];
    render(<EntrevistaDaCandidatura candidatura={candidatura("ETAPA_COM")} token="t" />);

    // Abrir em branco obrigaria a redigitar o dia inteiro para mudar a hora, que é o caso mais
    // comum do remarcar.
    expect(
      (screen.getByLabelText("Data e horário da entrevista") as HTMLInputElement).value,
    ).toBe("2026-09-26T14:30");
    expect(screen.getByRole("button", { name: /Remarcar entrevista/ })).toBeTruthy();
  });
});
