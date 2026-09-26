// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem, VagaListItem } from "@ea/shared-types";

/**
 * ─ A ABA "CANDIDATOS DISPONÍVEIS": AS DUAS POPULAÇÕES, E O GESTO CERTO EM CADA UMA ─────────────
 *
 * ┌─ POR QUE ESTE TESTE É DE COMPONENTE ────────────────────────────────────────────────────────┐
 * │ A régua desta aba mora no JSX: qual das duas ações a linha oferece depende de a linha ter ou │
 * │ não uma candidatura, e é isso que separa VINCULAR (a pessoa está solta) de TRANSFERIR (a     │
 * │ candidatura está em outra vaga). Oferecer o gesto errado não quebra nada e não falha teste    │
 * │ nenhum: ele simplesmente move o processo errado, ou abre um processo novo para quem já tinha  │
 * │ um, que é a diferença que o `TrocarVagaModal` existe para preservar.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A SEGUNDA RÉGUA: a aba lê pelas DUAS rotas certas (a busca com `semCandidatura` e a rota dos
 * transferíveis), e não pelo painel de cada vaga com filtro na tela. Uma régua de recorte copiada
 * aqui divergiria da do backend no primeiro ajuste, e divergiria justamente em quem pode ser movido.
 */

const { buscarCandidatos, transferiveisParaVaga } = vi.hoisted(() => ({
  buscarCandidatos: vi.fn(),
  transferiveisParaVaga: vi.fn(),
}));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, buscarCandidatos, transferiveisParaVaga };
});

/** O catálogo de etapas vem da rede; sem o dublê a pill da etapa nasceria sem rótulo no teste. */
vi.mock("@/lib/as-etapas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-etapas")>("@/lib/as-etapas");
  const { ETAPAS_FUNIL_SEMENTE } = await vi.importActual<typeof import("@ea/shared-types")>(
    "@ea/shared-types",
  );
  const catalogo = ETAPAS_FUNIL_SEMENTE.map((e, i) => ({
    id: i + 1,
    codigo: e.codigo,
    rotulo: e.rotulo,
    ordem: e.ordem,
    tom: e.tom,
    inicial: e.ordem === 1,
    ativa: true,
  }));
  return {
    ...real,
    useEtapas: () => ({
      etapas: catalogo,
      ativas: catalogo,
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

import { CandidatosDisponiveisDaVaga } from "./CandidatosDisponiveisDaVaga";

const VAGA = {
  id: "vaga-destino",
  codigo: "PS-2026-009",
  nomeDivulgacao: "Operador de Loja",
  clienteNome: "Cliente X",
  status: "ABERTA",
} as unknown as VagaListItem;

const SOLTO = {
  id: "pessoa-1",
  nome: "Fulano De Tal",
  origem: "MANUAL",
  cidade: "São Paulo",
  uf: "SP",
  temCpf: true,
  candidaturasAtivas: 0,
  bancoTalentos: false,
  criadoEm: "2026-09-01T12:00:00.000Z",
};

const EM_OUTRA_VAGA: AsCandidaturaItem = {
  id: "cand-9",
  candidatoId: "pessoa-2",
  candidatoNome: "Beltrana De Tal",
  vagaId: "vaga-origem",
  vagaCodigo: "PS-2026-002",
  vagaNome: "Vaga De Origem",
  etapa: "TRIAGEM",
  situacao: "ATIVO",
  posicaoLado: null,
  motivoDescarte: null,
  alocadoEm: "2026-09-01T12:00:00.000Z",
  alocadoPorNome: "Ana",
  atualizadoEm: "2026-09-01T12:00:00.000Z",
  ultimoContatoEm: null,
  // A PRETENSÃO SALARIAL entrou em `AsCandidaturaItem` na Frente E (ponto 9). NULA é o normal:
  // só quem foi descartado por um motivo marcado `pedePretensao` no catálogo tem valor.
  pretensaoSalarial: null,
};

function montar(recebeCandidato = true) {
  buscarCandidatos.mockResolvedValue({
    itens: [SOLTO],
    total: 1,
    limite: 200,
    offset: 0,
    truncado: false,
  });
  transferiveisParaVaga.mockResolvedValue([EM_OUTRA_VAGA]);
  render(
    <CandidatosDisponiveisDaVaga
      vaga={VAGA}
      token="t"
      recebeCandidato={recebeCandidato}
      onMudou={() => {}}
      onModalAberto={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  buscarCandidatos.mockReset();
  transferiveisParaVaga.mockReset();
});

describe("a aba de candidatos disponíveis", () => {
  it("lê as duas populações pelas rotas próprias, e não varrendo as vagas", async () => {
    montar();
    await waitFor(() => expect(buscarCandidatos).toHaveBeenCalledTimes(1));

    // (a) quem está solto na base: é o MESMO filtro do "Adicionar à vaga".
    expect(buscarCandidatos.mock.calls[0][0]).toEqual({ semCandidatura: true });
    // (b) quem pode ser transferido: a rota do backend, que já exclui esta vaga e quem tem processo
    // vivo nela. O recorte NÃO é refeito na tela.
    expect(transferiveisParaVaga).toHaveBeenCalledWith("vaga-destino", "t");
  });

  it("mostra de qual vaga vem quem já tem vaga, e marca quem não tem nenhuma", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Beltrana De Tal")).toBeTruthy());

    expect(screen.getByText("Vaga De Origem")).toBeTruthy();
    // §A.24: é tag, então title case.
    expect(screen.getByText("Sem Vaga Alocada")).toBeTruthy();
  });

  it("oferece VINCULAR a quem está solto e TRANSFERIR a quem está em outra vaga", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Fulano De Tal")).toBeTruthy());

    expect(screen.getByRole("button", { name: "Vincular" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transferir" })).toBeTruthy();
  });

  it("avisa que transferir devolve a posição à vaga de origem", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Fulano De Tal")).toBeTruthy());
    expect(screen.getByText(/volta a ter aquela posição livre/i)).toBeTruthy();
  });

  it("a busca por nome recorta a lista sem ir à rede de novo", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Fulano De Tal")).toBeTruthy());

    fireEvent.change(screen.getByLabelText(/procurar candidato pelo nome/i), {
      target: { value: "beltrana" },
    });

    expect(screen.queryByText("Fulano De Tal")).toBeNull();
    expect(screen.getByText("Beltrana De Tal")).toBeTruthy();
    expect(buscarCandidatos).toHaveBeenCalledTimes(1);
  });

  /**
   * O QUE BARRA O GESTO É O STATUS DA VAGA, NUNCA O PAPEL DE QUEM OLHA: a transferência passou a ser
   * de qualquer consultor (decisão do diretor), então nada aqui é escondido por papel.
   */
  it("a vaga que não recebe candidato mostra a lista e desabilita os dois gestos", async () => {
    montar(false);
    await waitFor(() => expect(screen.getByText("Fulano De Tal")).toBeTruthy());

    expect((screen.getByRole("button", { name: "Vincular" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Transferir" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
