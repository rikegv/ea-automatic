import { describe, expect, it } from "vitest";
import type { AsCandidaturaEntrevista } from "@ea/shared-types";
import {
  campoDoInstante,
  entrevistaDaEtapa,
  entrevistasEmOrdem,
  etapaAceitaEntrevista,
  instanteDoCampo,
} from "@/lib/as-entrevistas";

/**
 * ─ AS RÉGUAS DA ENTREVISTA DO LADO DA TELA (Frente E, ponto 8) ────────────────────────────────
 *
 * DUAS DELAS SÃO O PONTO INTEIRO DA FRENTE:
 *   1. QUAIS ETAPAS OFERECEM O CONTROLE vem do CATÁLOGO, e a tela nunca compara com um código
 *      escrito à mão. Este arquivo prova isso do jeito que dá numa função pura: a MESMA etapa é
 *      aceita ou recusada conforme a lista que o catálogo devolveu, e nada mais.
 *   2. O CAMPO E O INSTANTE SÃO INVERSOS UM DO OUTRO. Separados, um lado passa a truncar e o outro
 *      não, e "remarcar" abre com o minuto errado.
 */

function entrevista(etapa: string, agendadaEm: string, id = etapa): AsCandidaturaEntrevista {
  return {
    id,
    candidaturaId: "c1",
    etapa,
    agendadaEm,
    agendadaPorNome: "Alguém",
    atualizadoEm: agendadaEm,
  };
}

describe("quais etapas oferecem o controle", () => {
  it("responde pela lista do catálogo, seja qual for o código", () => {
    // Nenhum código é privilegiado pela tela: o diretor marca a etapa que ele quiser.
    expect(etapaAceitaEntrevista("UMA_ETAPA_QUALQUER", ["UMA_ETAPA_QUALQUER"])).toBe(true);
    expect(etapaAceitaEntrevista("OUTRA", ["UMA_ETAPA_QUALQUER"])).toBe(false);
  });

  it("diz NÃO com a lista vazia, que é o estado de quem não marcou nada e o de quem não leu", () => {
    // Oferecer um campo que o servidor vai recusar gasta o clique e ensina a ignorar a tela.
    expect(etapaAceitaEntrevista("QUALQUER", [])).toBe(false);
  });

  it("diz NÃO sem etapa nenhuma", () => {
    expect(etapaAceitaEntrevista(null, ["X"])).toBe(false);
    expect(etapaAceitaEntrevista(undefined, ["X"])).toBe(false);
  });
});

describe("a entrevista da etapa", () => {
  const lista = [
    entrevista("ETAPA_A", "2026-09-20T13:00:00.000Z"),
    entrevista("ETAPA_B", "2026-09-18T13:00:00.000Z"),
  ];

  it("acha a da etapa pedida, que é o que faz Marcar virar Remarcar", () => {
    expect(entrevistaDaEtapa(lista, "ETAPA_B")?.id).toBe("ETAPA_B");
  });

  it("devolve nulo quando aquela etapa não tem nada marcado", () => {
    expect(entrevistaDaEtapa(lista, "ETAPA_C")).toBeNull();
    expect(entrevistaDaEtapa(lista, null)).toBeNull();
  });

  it("lista na ordem da agenda, e não na ordem em que o banco devolveu", () => {
    expect(entrevistasEmOrdem(lista).map((e) => e.etapa)).toEqual(["ETAPA_B", "ETAPA_A"]);
  });
});

describe("o campo e o instante", () => {
  it("são inversos um do outro, no fuso de quem digita", () => {
    const campo = "2026-09-26T14:30";
    const iso = instanteDoCampo(campo);
    expect(iso).not.toBeNull();
    expect(campoDoInstante(iso)).toBe(campo);
  });

  it("campo vazio não vira instante, e o envio nem sai", () => {
    expect(instanteDoCampo("")).toBeNull();
    expect(instanteDoCampo("   ")).toBeNull();
    expect(instanteDoCampo("não é data")).toBeNull();
  });

  it("instante ausente devolve campo vazio, e não a palavra Invalid Date", () => {
    expect(campoDoInstante(null)).toBe("");
    expect(campoDoInstante(undefined)).toBe("");
    expect(campoDoInstante("qualquer coisa")).toBe("");
  });
});
