import { describe, expect, it } from "vitest";
import {
  VAGA_STATUS_PAPEIS,
  VAGA_STATUS_PAPEIS_LIBERADAS,
  papelDeVagaLiberada,
  type VagaStatusPapel,
} from "./index";

/**
 * ─ A FONTE ÚNICA DO QUE É "VAGA JÁ LIBERADA" (decisão do diretor, 05/10/2026) ───────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38): `VAGA_STATUS_PAPEIS_LIBERADAS` é a lista que o backend (a rota da
 * Central) e o frontend (cards e filtro de status) leem para não divergirem sobre o que aparece na
 * Central de Vagas. O frontend filtra os cards com `papelDeVagaLiberada(st.papel)` (medido em
 * `apps/frontend/src/app/(app)/as/vagas/page.tsx`), então esta prova cobre também o predicado do
 * card reduzido: não há um helper puro separado no frontend, é esta mesma função.
 */

describe("VAGA_STATUS_PAPEIS_LIBERADAS: o recorte da Central de Vagas", () => {
  it("são exatamente os quatro papéis de vaga já liberada", () => {
    expect([...VAGA_STATUS_PAPEIS_LIBERADAS].sort()).toEqual(
      ["ABERTURA", "CANCELAMENTO", "ENTREGA", "FECHAMENTO"].sort(),
    );
  });

  it("não contém REVISAO, RASCUNHO nem LIVRE", () => {
    expect(VAGA_STATUS_PAPEIS_LIBERADAS).not.toContain("REVISAO");
    expect(VAGA_STATUS_PAPEIS_LIBERADAS).not.toContain("RASCUNHO");
    expect(VAGA_STATUS_PAPEIS_LIBERADAS).not.toContain("LIVRE");
  });

  it("todo papel da lista é um papel de verdade do catálogo", () => {
    for (const papel of VAGA_STATUS_PAPEIS_LIBERADAS) {
      expect(VAGA_STATUS_PAPEIS).toContain(papel);
    }
  });
});

describe("papelDeVagaLiberada concorda com a lista, papel a papel", () => {
  it("libera só os quatro, e recusa REVISAO, RASCUNHO e LIVRE", () => {
    const esperado: Record<VagaStatusPapel, boolean> = {
      ABERTURA: true,
      ENTREGA: true,
      FECHAMENTO: true,
      CANCELAMENTO: true,
      REVISAO: false,
      RASCUNHO: false,
      LIVRE: false,
    };

    for (const papel of VAGA_STATUS_PAPEIS) {
      expect(papelDeVagaLiberada(papel), `papel ${papel}`).toBe(esperado[papel]);
    }
  });

  it("concorda com a lista para TODO papel declarado (sem papel esquecido)", () => {
    for (const papel of VAGA_STATUS_PAPEIS) {
      expect(papelDeVagaLiberada(papel)).toBe(VAGA_STATUS_PAPEIS_LIBERADAS.includes(papel));
    }
  });
});
