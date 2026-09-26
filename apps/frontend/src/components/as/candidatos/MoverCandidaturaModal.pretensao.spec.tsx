// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaItem } from "@ea/shared-types";

/**
 * ─ A PRETENSÃO SALARIAL DO DESFECHO (Frente E, ponto 9) ───────────────────────────────────────
 *
 * ┌─ A REGRA QUE ESTE ARQUIVO PROTEGE É DE §A.6, E NÃO DE USABILIDADE ──────────────────────────┐
 * │ O VALOR SÓ PODE VIAJAR QUANDO O MOTIVO PEDE. O servidor recusa a pretensão mandada com um    │
 * │ motivo não marcado, e recusa de propósito: sem essa metade, o campo seria uma gaveta de      │
 * │ salário aberta em QUALQUER desfecho, coletando dado financeiro de pessoa que ninguém mandou  │
 * │ coletar. Uma tela que mandasse sempre não quebraria nada hoje (o valor é opcional no DTO),   │
 * │ e passaria a dar 400 em todo descarte, ou pior, a coletar o que não devia.                   │
 * │                                                                                              │
 * │ E QUEM DECIDE É A MARCA `pedePretensao` DA LINHA DO CATÁLOGO, nunca o NOME do motivo: o      │
 * │ diretor renomeia pela tela de administração, e comparação por nome para de funcionar em      │
 * │ silêncio na primeira correção de grafia. É por isso que os dois motivos deste teste têm      │
 * │ nomes igualmente plausíveis e só diferem na MARCA.                                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * HOJE NENHUM MOTIVO NASCE MARCADO (a migration não marca nenhum: a escolha é vocabulário do
 * diretor), então o campo nasce INERTE em produção. É o que o primeiro caso afirma, e é por isso
 * que ele importa: a régua tem de continuar certa no dia em que ele marcar o primeiro.
 */

const { registrarSaida } = vi.hoisted(() => ({ registrarSaida: vi.fn(async () => ({})) }));

vi.mock("@/lib/as-candidatos", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-candidatos")>("@/lib/as-candidatos");
  return { ...real, registrarSaida, aprovarCandidatura: vi.fn(), moverEtapa: vi.fn() };
});

/** O catálogo de etapas com entrevista não é o assunto aqui: sem ele, a seção nem aparece. */
vi.mock("@/lib/as-entrevistas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-entrevistas")>("@/lib/as-entrevistas");
  return {
    ...real,
    useEtapasComEntrevista: () => ({ codigos: [], carregando: false, erro: null }),
    useEntrevistas: () => ({
      entrevistas: [],
      carregando: false,
      erro: null,
      substituir: () => {},
    }),
  };
});

const SEM_MARCA = "Perfil não aderente";
const COM_MARCA = "Fora da faixa salarial";
vi.mock("@/lib/as-motivos-descarte", () => ({
  listarMotivosDescarteAtivos: vi.fn(async () => []),
  useMotivosDescarte: (_token: string | null, ativo: boolean) => ({
    motivos: ativo
      ? [
          { id: "m1", nome: SEM_MARCA, ativo: true, pedePretensao: false },
          { id: "m2", nome: COM_MARCA, ativo: true, pedePretensao: true },
        ]
      : [],
    carregando: false,
    erro: null,
  }),
}));

import { MoverCandidaturaModal } from "./MoverCandidaturaModal";

const EM_SELECAO: AsCandidaturaItem = {
  id: "cand-1",
  candidatoId: "pessoa-1",
  candidatoNome: "Fulano De Tal",
  vagaId: "vaga-1",
  vagaCodigo: "PS-2026-001",
  vagaNome: "Vaga de teste",
  etapa: "TRIAGEM",
  situacao: "ATIVO",
  posicaoLado: null,
  motivoDescarte: null,
  alocadoEm: "2026-09-01T12:00:00.000Z",
  alocadoPorNome: "Ana",
  atualizadoEm: "2026-09-01T12:00:00.000Z",
  ultimoContatoEm: null,
  pretensaoSalarial: null,
};

function abrirDescarte() {
  render(
    <MoverCandidaturaModal
      candidatura={EM_SELECAO}
      token="t"
      onClose={() => {}}
      onFeito={() => {}}
    />,
  );
  fireEvent.click(screen.getByText("Descartado Pela Seleção"));
}

function escolherMotivo(nome: string) {
  fireEvent.click(screen.getByRole("button", { name: "Motivo do descarte" }));
  fireEvent.click(screen.getByRole("option", { name: nome }));
}

function confirmar() {
  const painel = screen.getByRole("dialog", { name: "Mover a candidatura" });
  fireEvent.click(within(painel).getByRole("button", { name: "Desvincular da vaga" }));
  const dialogo = screen.getByRole("dialog", { name: "Desvincular Da Vaga?" });
  fireEvent.click(within(dialogo).getByRole("button", { name: "Desvincular da vaga" }));
}

afterEach(() => {
  cleanup();
  registrarSaida.mockClear();
});

describe("o motivo NÃO marcado", () => {
  it("não mostra o campo, e o corpo sai sem valor nenhum", async () => {
    abrirDescarte();
    escolherMotivo(SEM_MARCA);

    expect(screen.queryByLabelText("Pretensão salarial")).toBeNull();

    confirmar();
    await waitFor(() => expect(registrarSaida).toHaveBeenCalledTimes(1));
    // A ASSINATURA DE SEMPRE, sem quinto argumento: o desfecho comum não passa a carregar um
    // objeto vazio só porque a pretensão existe para outro motivo.
    expect(registrarSaida).toHaveBeenCalledWith("cand-1", "DESCARTADO", SEM_MARCA, "t");
  });
});

describe("o motivo MARCADO", () => {
  it("pede o valor, trava o botão sem ele e manda a pretensão junto", async () => {
    abrirDescarte();
    escolherMotivo(COM_MARCA);

    const campo = screen.getByLabelText("Pretensão salarial");
    const painel = screen.getByRole("dialog", { name: "Mover a candidatura" });
    const botao = within(painel).getByRole("button", {
      name: "Desvincular da vaga",
    }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);

    // A MÁSCARA É A DOS SALÁRIOS DO SISTEMA: o servidor normaliza "2.500,00" e "2500" igual.
    fireEvent.change(campo, { target: { value: "250000" } });
    expect((campo as HTMLInputElement).value).toBe("2.500,00");
    expect(botao.disabled).toBe(false);

    confirmar();
    await waitFor(() => expect(registrarSaida).toHaveBeenCalledTimes(1));
    expect(registrarSaida).toHaveBeenCalledWith("cand-1", "DESCARTADO", COM_MARCA, "t", {
      pretensaoSalarial: "2.500,00",
    });
  });

  it("trocar de motivo LIMPA o valor digitado, e o campo some com ele", () => {
    abrirDescarte();
    escolherMotivo(COM_MARCA);
    fireEvent.change(screen.getByLabelText("Pretensão salarial"), { target: { value: "250000" } });

    // Sem a limpeza, o valor pedido por um motivo viajaria carimbado com o outro, ou seria
    // mandado para um motivo que não o pediu, que é o que o servidor recusa.
    escolherMotivo(SEM_MARCA);
    expect(screen.queryByLabelText("Pretensão salarial")).toBeNull();

    escolherMotivo(COM_MARCA);
    expect((screen.getByLabelText("Pretensão salarial") as HTMLInputElement).value).toBe("");
  });
});
