import { describe, expect, it } from "vitest";
import { CARD_SEM_VAGA, CARD_TOTAL, filtroDeCard } from "./as-candidatos";

/**
 * ─ QA ADVERSARIAL (§A.38): `filtroDeCard`, o pivo do conserto, estava SEM cobertura ────────────
 *
 * NAO escrito pelo autor. `filtroDeCard` e a ponte entre o card clicado e os DOIS filtros que o
 * servidor passou a aceitar (`filtroCardEtapa` x `filtroCardSituacao`). Se ele mandar o filtro
 * ERRADO (etapa onde era situacao, ou vice-versa), o backend nao casa ninguem e a lista vem vazia
 * embora o card mostre um numero: exatamente o defeito que a frente existe para matar. Ele tinha
 * ZERO teste. Estes casos travam a decisao que o requisito "card = filtro" depende.
 */

const ETAPAS = ["CAPTACAO", "TRIAGEM", "ENTREVISTA_SOULAN", "APROVACAO", "DINAMICA_DE_GRUPO"];

describe("filtroDeCard: manda o filtro CERTO conforme o card e de etapa ou de situacao", () => {
  it("card de ETAPA vira filtroCardEtapa, e nada de situacao", () => {
    expect(filtroDeCard("ENTREVISTA_SOULAN", ETAPAS)).toEqual({
      filtroCardEtapa: "ENTREVISTA_SOULAN",
    });
    expect(filtroDeCard("CAPTACAO", ETAPAS)).toEqual({ filtroCardEtapa: "CAPTACAO" });
  });

  it("card de SITUACAO (desfecho) vira filtroCardSituacao, e nunca etapa", () => {
    for (const s of ["APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO", "DESCARTADO", "DESISTIU"]) {
      expect(filtroDeCard(s, ETAPAS)).toEqual({ filtroCardSituacao: s });
    }
  });

  it("o Total e o Sem Vaga NAO mandam filtro nenhum (a base inteira / ausencia de candidatura)", () => {
    expect(filtroDeCard(CARD_TOTAL, ETAPAS)).toEqual({});
    expect(filtroDeCard(CARD_SEM_VAGA, ETAPAS)).toEqual({});
  });

  it("etapa NOVA do diretor (no catalogo) ja entra como filtro de ETAPA, sem tocar o codigo", () => {
    // DINAMICA_DE_GRUPO so e etapa porque esta em `codigosDeEtapa`: e a prova de que a decisao vem
    // do CATALOGO, nao de uma lista escrita a mao. Tira-la do catalogo a faria virar situacao.
    expect(filtroDeCard("DINAMICA_DE_GRUPO", ETAPAS)).toEqual({
      filtroCardEtapa: "DINAMICA_DE_GRUPO",
    });
    expect(filtroDeCard("DINAMICA_DE_GRUPO", ETAPAS).filtroCardSituacao).toBeUndefined();
  });

  it("um codigo que NAO esta no catalogo de etapas cai como situacao (a outra metade da regua)", () => {
    // Se a etapa sair do catalogo mas ainda houver gente nela (card inativo com gente), clicar passa
    // a mandar como SITUACAO e o backend nao casa: documenta a dependencia do catalogo completo.
    expect(filtroDeCard("ETAPA_FORA_DO_CATALOGO", ETAPAS)).toEqual({
      filtroCardSituacao: "ETAPA_FORA_DO_CATALOGO",
    });
  });
});
