// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CANDIDATURA_SITUACOES, type AsCandidaturaItem, type CandidaturaSituacao } from "@ea/shared-types";

/**
 * ─ VOLTAR PARA A SELEÇÃO: o botão que a rota de reverter não tinha ──────────────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────────────────────────┐
 * │ A REVERSÃO NASCEU SEM CONSUMIDOR DE TELA. O backend estava pronto, auditado e testado, e      │
 * │ `grep -ri reverter apps/frontend/src` não devolvia NADA: para quem opera, a funcionalidade    │
 * │ não existia. Um teste de backend verde não pega esse tipo de buraco, porque a peça que falta  │
 * │ não é a que ele mede.                                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE TESTE PROTEGE, e são três coisas que erram em silêncio:
 *  1. O botão SÓ EXISTE para quem está enviado. Oferecido a qualquer outra situação, ele vira um
 *     gesto que só sabe devolver 409, e o consultor aprende a desconfiar da tela.
 *  2. Ele NÃO DISPARA NO CLIQUE. É o desfazer de uma decisão registrada, e o modal inteiro tem essa
 *     régua: o botão pergunta, o diálogo executa.
 *  3. A RECUSA DO SERVIDOR APARECE, e aparece FORA do overlay. Mensagem escondida atrás do diálogo
 *     é a mesma coisa que mensagem nenhuma.
 */

const { reverterEnvioParaAdmissao } = vi.hoisted(() => ({
  reverterEnvioParaAdmissao: vi.fn(async () => ({})),
}));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return {
    ...real,
    reverterEnvioParaAdmissao,
    registrarSaida: vi.fn(),
    aprovarCandidatura: vi.fn(),
    moverEtapa: vi.fn(),
  };
});

import { MoverCandidaturaModal } from "./MoverCandidaturaModal";

/**
 * A PESSOA ENVIADA POR ENGANO, que é o caso inteiro desta frente.
 *
 * ELA CARREGA O `motivoDescarte` DO ENVIO, de propósito: é o campo que a reversão LIMPA da linha
 * viva, e a fixture precisa tê-lo preenchido para o teste poder falar sobre ele.
 */
const ENVIADO: AsCandidaturaItem = {
  id: "cand-1",
  candidatoId: "pessoa-1",
  candidatoNome: "Fulano De Tal",
  vagaId: "vaga-1",
  vagaCodigo: "PS-2026-001",
  vagaNome: "Vaga de teste",
  etapa: "APROVACAO",
  situacao: "ENVIADO_PARA_ADMISSAO",
  posicaoLado: "OFICIAL",
  motivoDescarte: "Fechou com o cliente",
  alocadoEm: "2026-09-01T12:00:00.000Z",
  alocadoPorNome: "Ana",
  atualizadoEm: "2026-09-01T12:00:00.000Z",
  ultimoContatoEm: null,
};

function abrir(over: Partial<AsCandidaturaItem> = {}) {
  const onFeito = vi.fn();
  render(
    <MoverCandidaturaModal
      candidatura={{ ...ENVIADO, ...over }}
      token="t"
      onClose={() => {}}
      onFeito={onFeito}
    />,
  );
  return { onFeito };
}

/** O botão que está no CORPO do modal (o diálogo tem outro com o mesmo rótulo). */
function botaoDoCorpo(rotulo: string) {
  const painel = screen.getByRole("dialog", { name: "Mover a candidatura" });
  return within(painel).getByRole("button", { name: rotulo });
}

const DIALOGO = "Voltar Para A Seleção?";

afterEach(() => {
  cleanup();
  reverterEnvioParaAdmissao.mockClear();
  reverterEnvioParaAdmissao.mockImplementation(async () => ({}));
});

describe("o botão só existe para quem está ENVIADO PARA A ADMISSÃO", () => {
  it("quem está enviado recebe a seção e o botão", () => {
    abrir();
    expect(screen.getByText("Voltar Para A Seleção")).toBeTruthy();
    expect(botaoDoCorpo("Voltar para a seleção")).toBeTruthy();
  });

  /**
   * NENHUMA OUTRA SITUAÇÃO O VÊ, e a lista é DERIVADA do catálogo em vez de escrita à mão: situação
   * nova nasce coberta por este teste, e não fora dele.
   *
   * O ALOCADO É O CASO CARO. Ele finaliza posição igual ao enviado, então a régua errada (a escrita
   * com `finalizaPosicao`) o incluiria, e a tela ofereceria um jeito de desfazer alocação sem
   * motivo, sem ciência e sem passar por lugar nenhum que conte posição.
   */
  const OUTRAS = CANDIDATURA_SITUACOES.filter(
    (s): s is Exclude<CandidaturaSituacao, "ENVIADO_PARA_ADMISSAO"> =>
      s !== "ENVIADO_PARA_ADMISSAO",
  );

  for (const situacao of OUTRAS) {
    it(`${situacao} não recebe o gesto: ali ele só saberia dar 409`, () => {
      abrir({ situacao, motivoDescarte: null });
      expect(screen.queryByText("Voltar Para A Seleção")).toBeNull();
      expect(screen.queryByRole("button", { name: "Voltar para a seleção" })).toBeNull();
    });
  }
});

describe("a confirmação diz o que muda, e o clique sozinho não reverte nada", () => {
  it("clicar no botão PERGUNTA, e nada é enviado antes da confirmação", () => {
    abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));

    expect(reverterEnvioParaAdmissao).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: DIALOGO })).toBeTruthy();
  });

  it("o diálogo diz as TRÊS coisas que mudam: a etapa, a posição e o motivo", () => {
    abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));
    const dialogo = screen.getByRole("dialog", { name: DIALOGO });

    // A ETAPA em que a pessoa volta a ficar. Sem catálogo carregado o rótulo cai no código cru, que
    // é o fallback declarado de `rotuloDaEtapa`; o que este teste afirma é que a etapa é DITA.
    expect(within(dialogo).getByText(/na etapa APROVACAO/i)).toBeTruthy();
    // A POSIÇÃO, que é o efeito na vaga e a razão operacional de a reversão existir.
    expect(within(dialogo).getByText(/posição que ela ocupava fica livre/i)).toBeTruthy();
    // O MOTIVO, que sai da ficha. Sem esta frase, ele sumiria sem ninguém ter sido avisado.
    expect(within(dialogo).getByText(/motivo do envio sai da ficha/i)).toBeTruthy();
    expect(within(dialogo).getByText(/continua registrado no histórico/i)).toBeTruthy();
  });

  it("confirmar chama a rota UMA vez, com a candidatura e o token, e sem corpo nenhum", async () => {
    const { onFeito } = abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));
    const dialogo = screen.getByRole("dialog", { name: DIALOGO });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Voltar para a seleção" }));

    await waitFor(() => expect(reverterEnvioParaAdmissao).toHaveBeenCalledTimes(1));
    expect(reverterEnvioParaAdmissao).toHaveBeenCalledWith("cand-1", "t");
    // O `onFeito` é o que RECARREGA: a ocupação da vaga mudou (uma posição livre a mais e uma pessoa
    // a mais em seleção), e isso não cabe na linha que a rota devolve.
    await waitFor(() => expect(onFeito).toHaveBeenCalledTimes(1));
  });

  it("cancelar não reverte ninguém", async () => {
    const { onFeito } = abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));
    const dialogo = screen.getByRole("dialog", { name: DIALOGO });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: DIALOGO })).toBeNull());
    expect(reverterEnvioParaAdmissao).not.toHaveBeenCalled();
    expect(onFeito).not.toHaveBeenCalled();
  });
});

describe("a recusa do servidor aparece LEGÍVEL e FORA do overlay", () => {
  it("o 409 fecha o diálogo e mostra a frase do backend no corpo do modal", async () => {
    const recusa =
      "Esta candidatura não está enviada para admissão, então não há envio a reverter. Recarregue a página para ver a situação atual.";
    reverterEnvioParaAdmissao.mockRejectedValueOnce(new Error(recusa));

    const { onFeito } = abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: DIALOGO })).getByRole("button", {
        name: "Voltar para a seleção",
      }),
    );

    // A MENSAGEM É A DO BACKEND, e não uma reescrita da tela: ela já diz o que aconteceu (a tela
    // pode estar desatualizada) e o que fazer (recarregar).
    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain("não há envio a reverter");
    // FORA DO OVERLAY: o diálogo saiu da frente, senão a frase ficaria escondida atrás dele.
    expect(screen.queryByRole("dialog", { name: DIALOGO })).toBeNull();
    // NADA DE RECARREGAR o que não mudou: a lista continua como está.
    expect(onFeito).not.toHaveBeenCalled();
  });

  it("falha sem mensagem cai numa frase que nomeia a operação certa", async () => {
    reverterEnvioParaAdmissao.mockRejectedValueOnce({});

    abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: DIALOGO })).getByRole("button", {
        name: "Voltar para a seleção",
      }),
    );

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toContain("Falha ao voltar o candidato para a seleção.");
  });
});

describe("§A.11 e §A.24 no texto que esta seção acrescentou", () => {
  it("nenhum travessão entra pela tela nova", () => {
    abrir();
    fireEvent.click(botaoDoCorpo("Voltar para a seleção"));
    const dialogo = screen.getByRole("dialog", { name: DIALOGO });
    expect(dialogo.textContent).not.toContain("—");
    expect(screen.getByRole("dialog", { name: "Mover a candidatura" }).textContent).not.toContain(
      "—",
    );
  });

  it("o TÍTULO vai em title case e o BOTÃO em escrita normal, porque botão é comando", () => {
    abrir();
    expect(screen.getByText("Voltar Para A Seleção")).toBeTruthy();
    expect(botaoDoCorpo("Voltar para a seleção").textContent).toBe("Voltar para a seleção");
  });
});
