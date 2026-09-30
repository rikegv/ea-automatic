// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsVagaReabrirPrevia, VagaListItem } from "@ea/shared-types";

/**
 * ─ REABRIR A VAGA ENTREGUE: O PRAZO NOVO E O AVISO DO QUE VAI ACONTECER (30/09) ────────────────
 *
 * ┌─ POR QUE DE COMPONENTE, E NÃO DA FUNÇÃO PURA ──────────────────────────────────────────────┐
 * │ A régua da frase já tem teste próprio (`as-vaga-reabertura.spec.ts`), e a da SLA também      │
 * │ (`as-vaga-sla.spec.ts`). O que NENHUMA das duas pega é a FIAÇÃO, e é nela que esta peça se    │
 * │ perde: o campo de prazo novo existir mas não travar o botão, ou existir e NÃO VIAJAR no corpo │
 * │ do POST. Nos dois casos a tela parece certa, o clique "funciona", e a vaga volta contando     │
 * │ contra a previsão ANTIGA, que já passou. É um defeito que não quebra nada.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A AFIRMAÇÃO MAIS FORTE DO ARQUIVO É NA FRONTEIRA DA REDE: o teste preenche a data e confere o
 * CORPO que sai. É o único ponto em que "a tela mostra o campo e ninguém o manda" não se esconde.
 */

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

/* O CATÁLOGO DE ETAPAS É DUBLADO, e só ele: sem isso o gancho sairia pela rede dublada acima e o
   teste passaria a afirmar a ordem em que duas requisições resolvem, que não é o que ele mede. */
vi.mock("@/lib/as-etapas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-etapas")>("@/lib/as-etapas");
  return { ...real, useEtapas: () => ({ etapas: [], carregando: false, erro: null }) };
});

import { ReabrirVagaModal } from "./ReabrirVagaModal";

/**
 * A VAGA, NOS DOIS STATUS QUE IMPORTAM. O catálogo corrente do frontend nasce sendo a SEMENTE, em
 * que `ENTREGUE` tem papel `ENTREGA` e `CANCELADA` tem papel `CANCELAMENTO`, então a tela resolve o
 * caminho pelo PAPEL, sem precisar de catálogo dublado.
 */
function vaga(status: string): VagaListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    codigo: "PS-2026-001",
    nomeDivulgacao: "Operador De Caixa",
    status,
    dataLimite: "2026-08-20",
    dataFechamento: null,
  } as unknown as VagaListItem;
}

const PREVIA_VAZIA: AsVagaReabrirPrevia = {
  origem: "NINGUEM_DESCARTADO",
  candidaturas: [],
} as unknown as AsVagaReabrirPrevia;

function montar(status: string) {
  const onReaberta = vi.fn();
  render(
    <ReabrirVagaModal
      vaga={vaga(status)}
      token="t"
      podeReabrir
      onFechar={() => undefined}
      onReaberta={onReaberta}
    />,
  );
  return { onReaberta };
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (rota: string, opcoes?: { method?: string }) => {
    if (rota.endsWith("/reabrir-previa")) return PREVIA_VAZIA;
    if (opcoes?.method === "POST") return vaga("ABERTA");
    return null;
  });
});

afterEach(cleanup);

const campoDoPrazo = () => screen.queryByLabelText("Previsão de entrega nova");
const botaoReabrir = () => screen.getByRole("button", { name: "Reabrir vaga" });

describe("a vaga ENTREGUE pede previsão de entrega nova", () => {
  it("mostra o campo do prazo novo, e a vaga cancelada NÃO mostra", async () => {
    montar("ENTREGUE");
    await waitFor(() => expect(campoDoPrazo()).not.toBeNull());

    cleanup();
    montar("CANCELADA");
    /* A ESPERA É PELA LISTA CARREGADA, e não um `queryBy` imediato: sem ela, a ausência do campo
       seria "a prévia ainda não voltou" em vez de "este caminho não pede prazo". */
    await waitFor(() => expect(screen.getByText(/não encerrou o processo de ninguém/)).toBeTruthy());
    expect(campoDoPrazo()).toBeNull();
  });

  it("o botão fica travado enquanto o prazo novo não é informado", async () => {
    montar("ENTREGUE");
    await waitFor(() => expect(campoDoPrazo()).not.toBeNull());

    expect(botaoReabrir()).toHaveProperty("disabled", true);
    expect(screen.getByText("Informe a previsão de entrega nova para reabrir.")).toBeTruthy();

    fireEvent.change(campoDoPrazo() as HTMLInputElement, { target: { value: "2026-10-30" } });
    expect(botaoReabrir()).toHaveProperty("disabled", false);
  });

  it("o prazo novo VIAJA no corpo do POST, que é onde este defeito se esconderia", async () => {
    montar("ENTREGUE");
    await waitFor(() => expect(campoDoPrazo()).not.toBeNull());
    fireEvent.change(campoDoPrazo() as HTMLInputElement, { target: { value: "2026-10-30" } });
    fireEvent.click(botaoReabrir());

    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) => c[1]?.method === "POST");
      expect(post, "o POST do reabrir não saiu").toBeTruthy();
      expect(post?.[1].body).toEqual({ dataLimite: "2026-10-30" });
    });
  });

  it("a reabertura da vaga CANCELADA não manda prazo, porque ela não renegocia prazo", async () => {
    montar("CANCELADA");
    await waitFor(() => expect(screen.getByText(/não encerrou o processo de ninguém/)).toBeTruthy());
    fireEvent.click(botaoReabrir());

    await waitFor(() => {
      const post = apiFetch.mock.calls.find((c) => c[1]?.method === "POST");
      expect(post?.[1].body).toEqual({});
    });
  });
});

describe("a tela diz o que vai acontecer antes de alguém confirmar", () => {
  it("avisa que a vaga volta para Aberta e que os candidatos voltam para o começo do funil", async () => {
    montar("ENTREGUE");
    await waitFor(() =>
      expect(
        screen.getByText(/voltam para o começo do funil, que hoje é a Triagem/),
      ).toBeTruthy(),
    );
    expect(screen.getByText(/reprova a entrega/)).toBeTruthy();
  });

  it("não fala de cancelamento na vaga entregue, porque cancelamento não houve", async () => {
    montar("ENTREGUE");
    await waitFor(() => expect(campoDoPrazo()).not.toBeNull());
    expect(screen.queryByText(/cancelamento/i)).toBeNull();
  });

  it("explica o prazo novo em vez de prometer uma contagem zerada", async () => {
    montar("ENTREGUE");
    await waitFor(() => expect(campoDoPrazo()).not.toBeNull());
    const ajuda = screen.getByText(/contagem regressiva até a previsão de entrega/);
    expect(ajuda.textContent).toContain("não existe zerar a contagem");
    // A previsão que estava valendo aparece, para o prazo novo ser combinado contra algo.
    expect(ajuda.textContent).toContain("20/08/2026");
    expect(ajuda.textContent).not.toContain("—");
  });
});
