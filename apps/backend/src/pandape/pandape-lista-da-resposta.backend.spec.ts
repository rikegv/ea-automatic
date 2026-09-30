import { describe, expect, it } from "vitest";
import { listaDaResposta } from "./pandape-api.service";

/**
 * O CONTRATO REAL DAS TRES LISTAGENS DA VARREDURA, medido contra a API do Pandape em 30/09/2026.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e ele e a lapide de um defeito que nenhum teste pegava ────────┐
 * │ `listaDaResposta` lia `data` e o array cru. As TRES listagens da varredura chamam `/v2`       │
 * │ (`/v2/vacancies`, `/v2/vacancy-folders`, `/v2/matches`), e a v2 devolve `items`, nunca `data`. │
 * │ Resultado medido: 471 vagas ativas viravam 0 e 50 inscricoes viravam 0, em SILENCIO, porque    │
 * │ lista vazia e a direcao fail-closed desta frente.                                             │
 * │                                                                                               │
 * │ A SUITE INTEIRA ESTAVA VERDE, e continuaria: os dubles devolviam `{ data: [...] }`, o formato  │
 * │ que ninguem tinha medido. Por isso as assercoes daqui usam o ENVELOPE REAL, com os campos      │
 * │ `totalPages`, `totalItems`, `items` e `links` na ordem em que a API os manda.                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("listaDaResposta, os tres envelopes da API do Pandape", () => {
  it("le o envelope `items` da v2, que era o que faltava e derrubava a varredura para zero", () => {
    // Forma real de `/v2/vacancies?VacancyStatus=2`, com dois itens em vez de 471.
    const v2 = {
      totalPages: 1,
      totalItems: 2,
      items: [{ idVacancy: 391657 }, { idVacancy: 391658 }],
      links: [],
    };
    expect(listaDaResposta(v2)).toHaveLength(2);
    expect(listaDaResposta(v2)[0]).toEqual({ idVacancy: 391657 });
  });

  it("le o array cru da v1, que e o formato de `/v1/Vacancy/List`", () => {
    expect(listaDaResposta([{ idVacancy: 1 }, { idVacancy: 2 }])).toHaveLength(2);
  });

  it("le o envelope `data`, para nao quebrar quem ja dependia dele", () => {
    expect(listaDaResposta({ data: [{ idVacancy: 1 }] })).toHaveLength(1);
  });

  it("CONTINUA fail-closed: envelope desconhecido vira lista vazia, nao excecao", () => {
    expect(listaDaResposta({ resultado: [{ idVacancy: 1 }] })).toEqual([]);
    expect(listaDaResposta({ items: "nao e lista" })).toEqual([]);
    expect(listaDaResposta(undefined)).toEqual([]);
    expect(listaDaResposta(null)).toEqual([]);
    expect(listaDaResposta("texto")).toEqual([]);
  });

  it("descarta o que nao e objeto dentro da lista, em qualquer um dos tres envelopes", () => {
    expect(listaDaResposta({ items: [null, 7, "x", { idVacancy: 1 }] })).toEqual([{ idVacancy: 1 }]);
    expect(listaDaResposta({ data: [null, { a: 1 }] })).toEqual([{ a: 1 }]);
    expect(listaDaResposta([null, { a: 1 }])).toEqual([{ a: 1 }]);
  });

  it("`data` tem precedencia sobre `items` quando os dois vierem, e nunca vem os dois", () => {
    expect(listaDaResposta({ data: [{ de: "data" }], items: [{ de: "items" }] })).toEqual([
      { de: "data" },
    ]);
  });
});
