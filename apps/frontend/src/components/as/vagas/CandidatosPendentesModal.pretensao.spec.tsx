// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsCandidaturaPendente } from "@ea/shared-types";

/**
 * ─ O ENCERRAMENTO DA VAGA NÃO OFERECE OS MOTIVOS QUE PEDEM A PRETENSÃO SALARIAL ───────────────
 *
 * ┌─ O DEFEITO QUE ISTO EVITA É DE RUNTIME, E ELE AINDA NÃO ACONTECEU ──────────────────────────┐
 * │ `registrarSaida` RECUSA com 400 o motivo marcado `pedePretensao` que chega sem o valor       │
 * │ (`exigirPretensaoQuandoOMotivoPede`, no service), e ESTE modal não tem onde pedir o valor:   │
 * │ ele chama a rota individual com `motivo` e mais nada. Hoje NENHUM motivo nasce marcado, então │
 * │ o caminho está inerte; no dia em que o diretor marcar o primeiro, escolhê-lo aqui falharia em │
 * │ CADA candidato, no meio do encerramento da vaga.                                              │
 * │                                                                                              │
 * │ É POR ISSO QUE O TESTE IMPORTA MESMO COM A MARCA DORMENTE: ele afirma a régua ANTES de ela   │
 * │ poder quebrar, e o dublê marca um motivo justamente porque a produção ainda não marca nenhum. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * COLETAR A PRETENSÃO AQUI SERIA FUNCIONALIDADE NOVA, e o diretor não pediu (§A.31). Quem precisa
 * registrar a saída com o valor usa a ficha do candidato, que é a tela desenhada para isso.
 *
 * QUEM FILTRA É A MARCA, NUNCA O NOME: os dois motivos do dublê têm nomes igualmente plausíveis de
 * propósito, e só diferem no booleano. O catálogo é gerenciável e o diretor renomeia.
 */

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

/** O catálogo de etapas não é o assunto aqui: sem o dublê, a pill sairia de uma requisição. */
vi.mock("@/lib/as-etapas", async () => {
  const real = await vi.importActual<typeof import("@/lib/as-etapas")>("@/lib/as-etapas");
  return {
    ...real,
    useEtapas: () => ({
      etapas: [],
      ativas: [],
      carregando: false,
      erro: null,
      recarregar: async () => {},
    }),
  };
});

import { CandidatosPendentesModal } from "./CandidatosPendentesModal";

const PENDENTE: AsCandidaturaPendente = {
  candidaturaId: "cand-1",
  candidatoId: "pessoa-1",
  candidatoNome: "Fulano De Tal",
  etapa: "TRIAGEM",
};

function abrirDescarte() {
  render(
    <CandidatosPendentesModal
      vagaRotulo="PS-2026-001"
      pendentes={[PENDENTE]}
      token="t"
      fechando={false}
      onClose={() => {}}
      onTratou={() => {}}
      onFecharVaga={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
  fireEvent.click(screen.getByRole("button", { name: "Motivo do descarte" }));
}

afterEach(cleanup);

describe("o motivo do descarte no encerramento da vaga", () => {
  it("NÃO oferece o motivo marcado com a pretensão salarial, e oferece os demais", () => {
    abrirDescarte();

    expect(screen.getByRole("option", { name: SEM_MARCA })).toBeTruthy();
    expect(screen.queryByRole("option", { name: COM_MARCA })).toBeNull();
  });

  it("diz que a lista está recortada, para ninguém procurar defeito na administração", () => {
    // A AUSÊNCIA MUDA É PIOR QUE A AUSÊNCIA EXPLICADA: quem cadastrou o motivo e não o encontra
    // conclui que o catálogo quebrou.
    abrirDescarte();
    expect(screen.getByText(/pedem a pretensão salarial/)).toBeTruthy();
  });
});
