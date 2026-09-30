// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ─ A DATA DE REALINHAMENTO DA VAGA (30/09) ──────────────────────────────────────────────────────
 *
 * ┌─ POR QUE ESTE TESTE EXISTE, E É UM MODO DE FALHA MEDIDO NESTE MESMO ARQUIVO ────────────────┐
 * │ Um campo novo da trilha precisa entrar em TRÊS lugares: o estado vazio (`FORM_VAZIO`), o      │
 * │ CARREGAMENTO da vaga existente e o ENVIO. Esquecer qualquer um dos três NÃO QUEBRA NADA: o    │
 * │ campo aparece na tela, aceita digitação, e o valor simplesmente não nasce ou não é salvo. Sem │
 * │ os três verificados, a pessoa preenche a data, salva, reabre e encontra o campo em branco,    │
 * │ sem nenhuma mensagem de erro em lugar nenhum.                                                 │
 * │                                                                                              │
 * │ ENTÃO O ARQUIVO AFIRMA OS TRÊS, cada um pela ponta em que ele se manifesta: o vazio (vaga     │
 * │ nova nasce em branco), o carregamento (rascunho volta com o que tinha) e a fronteira da rede  │
 * │ (o corpo que sai leva a data).                                                                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O REALINHAMENTO NÃO SOBRESCREVE O ALINHAMENTO, e isso também é afirmado: são as duas pontas, e é
 * delas que sai a pergunta "quanto tempo depois o cliente pediu outro perfil". Recarimbar o campo de
 * cima apagaria para sempre o marco original, que é perda irreversível.
 */

import type { VagaDetalhe } from "@ea/shared-types";
import type { AsVagaStatus } from "@/lib/as-status-vaga";
import type { CatalogosDaTrilha } from "./TrilhaDaVaga";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn(async () => ({ id: "vaga-1" })) }));

vi.mock("@/lib/api", async () => {
  const real = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...real, apiFetch };
});

vi.mock("@/lib/as-cidades", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-cidades")>("@/lib/as-cidades");
  return { ...real, useCidades: () => ({ cidades: [], carregando: false, erro: null }) };
});

import { TrilhaDaVaga } from "./TrilhaDaVaga";

const STATUS_ABERTA: AsVagaStatus = {
  id: 1,
  codigo: "ABERTA",
  rotulo: "Aberta",
  ordem: 1,
  tom: "ok",
  daTrilha: true,
  encerra: false,
  recebeCandidato: true,
  papel: "ABERTURA",
  ativo: true,
} as unknown as AsVagaStatus;

const CATALOGOS: CatalogosDaTrilha = {
  opcoes: {
    cargos: [{ id: "c1", nome: "Operador" }],
    clientes: [],
    beneficios: [],
    motivos: ["Aumento de quadro"],
    consultores: [],
    escalas: ["12x36"],
    comerciais: [],
  },
  contexto: { papelAs: "CONSULTOR", nome: "Fulano", contraparte: [] },
  segmentos: [],
  optClientes: [{ value: "1", label: "Cliente Um" }],
  optCargos: [{ value: "c1", label: "Operador" }],
  statusVaga: [STATUS_ABERTA],
  linhasAtivas: [],
  carregandoLinhas: false,
} as unknown as CatalogosDaTrilha;

/** O rascunho que volta para a trilha, com as DUAS datas do alinhamento já preenchidas. */
const RASCUNHO = {
  id: "vaga-1",
  codigo: "PS-2026-001",
  status: "RASCUNHO",
  nomeDivulgacao: "Operador De Caixa",
  posicoesOficiais: 1,
  posicoesBanco: 0,
  beneficios: [],
  dataAlinhamento: "2026-08-03",
  dataRealinhamento: "2026-09-14",
  /* AS LISTAS PRECISAM EXISTIR, e não é detalhe do teste: `estadoInicial` as percorre na montagem, e
     o rascunho real sempre as traz (vazias quando ninguém escolheu nada). */
  idiomasExigidos: [],
  etapasPs: [],
  genero: [],
  testes: [],
} as unknown as VagaDetalhe;

function montar(modo: "nova" | "rascunho") {
  render(
    <TrilhaDaVaga
      modo={modo === "nova" ? { tipo: "nova" } : { tipo: "rascunho", vaga: RASCUNHO }}
      catalogos={CATALOGOS}
      token="t"
      onFechar={vi.fn()}
      onGravada={vi.fn()}
    />,
  );
  // O passo "Quem Pediu", onde moram as datas, é o segundo da trilha.
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
}

const campo = (rotulo: string) => screen.getByLabelText(rotulo) as HTMLInputElement;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a data de realinhamento na trilha da vaga", () => {
  it("existe ao lado da data de alinhamento, e é um campo de data", () => {
    montar("nova");
    const realinhamento = campo("Data de realinhamento da vaga");
    expect(realinhamento.type).toBe("date");
    // O vizinho continua onde estava: o campo novo entrou AO LADO, e não no lugar dele.
    expect(campo("Data de alinhamento da vaga").type).toBe("date");
  });

  /* LUGAR 1, O ESTADO VAZIO: vaga nova nasce em branco. Sem a entrada no `FORM_VAZIO`, o `value` do
     input controlado seria `undefined` e o React trataria o campo como não controlado. */
  it("nasce em branco na vaga nova", () => {
    montar("nova");
    expect(campo("Data de realinhamento da vaga").value).toBe("");
  });

  /* LUGAR 2, O CARREGAMENTO: o rascunho volta com o que tinha. É o esquecimento mais silencioso dos
     três, porque a tela funciona e o campo só aparece vazio para quem já havia preenchido. */
  it("volta preenchida quando o rascunho já tinha realinhamento", () => {
    montar("rascunho");
    expect(campo("Data de realinhamento da vaga").value).toBe("2026-09-14");
    expect(campo("Data de alinhamento da vaga").value).toBe("2026-08-03");
  });

  /* LUGAR 3, O ENVIO: sem ele, tudo na tela funciona e nada é salvo. */
  it("viaja no corpo que vai ao servidor, junto da data de alinhamento e sem substituí-la", async () => {
    montar("nova");
    fireEvent.change(campo("Data de alinhamento da vaga"), { target: { value: "2026-08-03" } });
    fireEvent.change(campo("Data de realinhamento da vaga"), { target: { value: "2026-09-14" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar Rascunho" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, opcoes] = apiFetch.mock.calls[0] as unknown as [
      string,
      { body?: { dataAlinhamento?: string; dataRealinhamento?: string } },
    ];
    expect(opcoes.body?.dataRealinhamento).toBe("2026-09-14");
    expect(opcoes.body?.dataAlinhamento).toBe("2026-08-03");
  });

  /** Campo vazio é AUSÊNCIA: não viaja como string vazia, e a coluna fica nula. */
  it("não manda campo nenhum quando ninguém preencheu", async () => {
    montar("nova");
    fireEvent.click(screen.getByRole("button", { name: "Salvar Rascunho" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, opcoes] = apiFetch.mock.calls[0] as unknown as [
      string,
      { body?: { dataRealinhamento?: string } },
    ];
    expect(opcoes.body?.dataRealinhamento).toBeUndefined();
  });
});
