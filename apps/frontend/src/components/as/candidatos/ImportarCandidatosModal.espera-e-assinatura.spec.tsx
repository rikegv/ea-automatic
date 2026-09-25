// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviaImportCandidato, ResultadoImportCandidato } from "@ea/shared-types";

/**
 * ─ A ESPERA DECLARADA E A ASSINATURA ECOADA, as duas coisas que só existem dentro do JSX ────────
 *
 * POR QUE É TESTE DE COMPONENTE: nenhuma das duas é função exportada que se possa chamar.
 *
 * 1. A ESPERA. Ler a planilha e chamar a IA leva cerca de dez segundos na base real, e sem sinal na
 *    tela isso é lido como TRAVADO: quem espera anexa de novo ou desiste. O bloco de carregamento
 *    aparece ENQUANTO a prévia está pendente, e é o `carregando` do componente que o comanda. Some
 *    o bloco numa refatoração e nada fica vermelho, a não ser aqui.
 *
 * 2. A ASSINATURA DO CABEÇALHO. O mapa é conferido contra UM cabeçalho; o backend recalcula a
 *    assinatura da aba que recebeu e recusa quando diverge. A guarda inteira depende de a tela
 *    ECOAR o campo no aplicar: se o envio sumir, o backend não tem o que comparar e a porta do
 *    "mapa da aba A aplicado na aba B" reabre em silêncio, com o teste do backend continuando verde.
 */

const { apiUpload } = vi.hoisted(() => ({ apiUpload: vi.fn() }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiUpload };
});

import { ImportarCandidatosModal } from "./ImportarCandidatosModal";

const PREVIA: PreviaImportCandidato = {
  cabecalho: ["Nome", "CPF"],
  amostra: [["Fulano De Tal", "111"]],
  totalLinhas: 1,
  sugestao: {
    mapa: {
      nome: 0,
      cpf: 1,
      email: null,
      telefone: null,
      nascimento: null,
      cidade: null,
      uf: null,
    },
    confianca: "ALTA",
    observacao: "",
  },
  abaUsada: "Planilha1",
  abasDisponiveis: ["Planilha1"],
  linhaCabecalho: 1,
  descartadasPorTeto: 0,
  assinaturaCabecalho: "assinatura-da-aba-conferida",
};

const RESULTADO: ResultadoImportCandidato = {
  contagem: { total: 1, novos: 1, duplicadosCpf: 0, semCpf: 0, invalidos: 0 },
  importados: 1,
  reaproveitados: 0,
  vinculados: 0,
  ignorados: 0,
  linhas: [{ linha: 2, nome: "Fulano De Tal", status: "IMPORTADO" }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function abrirNoUpload() {
  render(
    <ImportarCandidatosModal
      vagasAbertas={[]}
      token="tok"
      onClose={() => {}}
      onImportado={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Sem Vaga/ }));
  fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
  return screen.getByLabelText("Planilha de candidatos") as HTMLInputElement;
}

function anexar(input: HTMLInputElement) {
  const arquivo = new File(["nome;cpf"], "base.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [arquivo] } });
}

describe("ImportarCandidatosModal, a espera na tela", () => {
  it("mostra o carregamento enquanto a prévia não volta, e o tira quando ela volta", async () => {
    let liberar: (p: PreviaImportCandidato) => void = () => {};
    apiUpload.mockReturnValueOnce(
      new Promise<PreviaImportCandidato>((resolve) => {
        liberar = resolve;
      }),
    );

    const input = abrirNoUpload();
    anexar(input);

    // ENQUANTO a leitura está pendente: o bloco anuncia o que está acontecendo, e o campo de
    // arquivo não aceita um segundo anexo que atropelaria a resposta do primeiro.
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Lendo A Planilha");
    expect(input.disabled).toBe(true);

    liberar(PREVIA);

    // DEPOIS: a espera some e a tela avança para a conferência do de/para.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByText("Colunas Da Planilha")).toBeTruthy();
  });
});

describe("ImportarCandidatosModal, a assinatura do cabeçalho", () => {
  it("ecoa no aplicar a assinatura que veio na prévia", async () => {
    apiUpload.mockResolvedValueOnce(PREVIA).mockResolvedValueOnce(RESULTADO);

    anexar(abrirNoUpload());
    await screen.findByText("Colunas Da Planilha");

    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Importar/ }));

    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(2));
    const [rota, form] = apiUpload.mock.calls[1] as [string, FormData];
    expect(rota).toBe("/as/candidatos/importar/aplicar");
    expect(form.get("assinaturaCabecalho")).toBe("assinatura-da-aba-conferida");
    // A aba conferida continua indo junto: assinatura sem aba não diria de QUAL leitura ela veio.
    expect(form.get("aba")).toBe("Planilha1");
  });

  it("não manda o campo quando a prévia não o traz, e a gravação segue", async () => {
    const { assinaturaCabecalho: _fora, ...previaAntiga } = PREVIA;
    apiUpload.mockResolvedValueOnce(previaAntiga).mockResolvedValueOnce(RESULTADO);

    anexar(abrirNoUpload());
    await screen.findByText("Colunas Da Planilha");

    fireEvent.click(screen.getByRole("button", { name: "Avançar" }));
    fireEvent.click(screen.getByRole("button", { name: /^Importar/ }));

    await waitFor(() => expect(apiUpload).toHaveBeenCalledTimes(2));
    const [, form] = apiUpload.mock.calls[1] as [string, FormData];
    expect(form.has("assinaturaCabecalho")).toBe(false);
  });
});
