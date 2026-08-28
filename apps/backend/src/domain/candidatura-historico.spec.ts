import { describe, expect, it } from "vitest";
import {
  etapasPercorridas,
  eventoEncerra,
  ordenarLinhaDoTempo,
  tipoDoEvento,
} from "./candidatura-historico";

/**
 * O HISTÓRICO DE ETAPAS (bug 1 da validação do diretor).
 *
 * O QUE ESTES TESTES TRAVAM, e é o que o bug 1 comprou: a etapa sai da leitura viva do funil quando
 * a candidatura encerra, e em troca o CAMINHO fica registrado. Se a derivação do tipo do evento
 * quebrar, a linha do tempo passa a mentir sobre o que aconteceu, e não há como perceber olhando a
 * tela: um desfecho classificado como movimento simplesmente some da leitura.
 */

const em = (iso: string) => new Date(iso);

describe("tipoDoEvento", () => {
  it("ENTRADA: nasceu na etapa, sem origem e sem desfecho", () => {
    expect(tipoDoEvento({ etapaDe: null, etapaPara: "CAPTACAO", situacao: null })).toBe("ENTRADA");
  });

  it("MOVIMENTO: veio de uma etapa e continua no processo", () => {
    expect(tipoDoEvento({ etapaDe: "CAPTACAO", etapaPara: "TRIAGEM", situacao: null })).toBe(
      "MOVIMENTO",
    );
  });

  it("DESFECHO: a situação preenchida é o que encerra", () => {
    expect(tipoDoEvento({ etapaDe: null, etapaPara: "TRIAGEM", situacao: "DESCARTADO" })).toBe(
      "DESFECHO",
    );
  });

  /**
   * A ORDEM DOS TESTES DENTRO DA FUNÇÃO É A REGRA, e é isto que este caso trava: um evento que tem
   * origem E situação é DESFECHO, não movimento. Testar `etapaDe` primeiro classificaria a saída
   * como movimento e ela sumiria da leitura da linha do tempo, em silêncio.
   */
  it("situação vence a origem: movido e encerrado no mesmo gesto é DESFECHO", () => {
    expect(tipoDoEvento({ etapaDe: "CAPTACAO", etapaPara: "TRIAGEM", situacao: "DESISTIU" })).toBe(
      "DESFECHO",
    );
  });

  /**
   * A TROCA DE VAGA É O QUARTO TIPO, e este caso trava a ORDEM da derivação, que é o ponto fino.
   *
   * A troca NÃO MEXE NA ETAPA (é a garantia central da operação), então ela grava `etapaDe` nula,
   * exatamente como a ENTRADA. Se a entrada fosse testada primeiro, toda troca apareceria na ficha
   * como "nasceu aqui", dizendo o oposto do que aconteceu, e o rastro que o diretor pediu seria
   * pior que rastro nenhum: seria um rastro errado.
   */
  it("TROCA_VAGA: vagaPara preenchida vence a etapa nula da entrada", () => {
    expect(
      tipoDoEvento({
        etapaDe: null,
        etapaPara: "ENTREVISTA_CLIENTE",
        situacao: null,
        vagaDe: "v1",
        vagaPara: "v2",
      }),
    ).toBe("TROCA_VAGA");
  });

  it("sem vaga nenhuma, etapa nula continua sendo ENTRADA", () => {
    expect(
      tipoDoEvento({ etapaDe: null, etapaPara: "CAPTACAO", situacao: null, vagaPara: null }),
    ).toBe("ENTRADA");
  });

  it("a troca NÃO encerra o processo", () => {
    expect(
      eventoEncerra({
        etapaDe: null,
        etapaPara: "TRIAGEM",
        situacao: null,
        vagaDe: "v1",
        vagaPara: "v2",
      }),
    ).toBe(false);
  });

  it("só o desfecho encerra", () => {
    expect(eventoEncerra({ etapaDe: null, etapaPara: "CAPTACAO", situacao: null })).toBe(false);
    expect(eventoEncerra({ etapaDe: "CAPTACAO", etapaPara: "TRIAGEM", situacao: null })).toBe(false);
    expect(
      eventoEncerra({ etapaDe: null, etapaPara: "APROVACAO", situacao: "CONTRATADO" }),
    ).toBe(true);
  });
});

describe("ordenarLinhaDoTempo", () => {
  it("do mais antigo para o mais novo, que é como se lê um caminho", () => {
    const fora = [
      { etapaDe: "CAPTACAO" as const, etapaPara: "TRIAGEM" as const, situacao: null, ocorridoEm: em("2026-03-02T10:00:00Z") },
      { etapaDe: null, etapaPara: "CAPTACAO" as const, situacao: null, ocorridoEm: em("2026-03-01T10:00:00Z") },
    ];
    expect(ordenarLinhaDoTempo(fora).map((e) => e.etapaPara)).toEqual(["CAPTACAO", "TRIAGEM"]);
  });

  /**
   * O EMPATE É O CASO REAL, e não um capricho: a semente do backfill grava o `alocado_em` da
   * candidatura, então alocar e sair no mesmo instante é exatamente o que a base tem. Sem o
   * desempate, a saída apareceria antes da entrada em metade das vezes, e a ficha leria como se a
   * pessoa tivesse saído antes de entrar.
   */
  it("no mesmo instante, a entrada vem antes do desfecho", () => {
    const mesmo = em("2026-03-01T10:00:00Z");
    const fora = [
      { etapaDe: null, etapaPara: "CAPTACAO" as const, situacao: "DESCARTADO" as const, ocorridoEm: mesmo },
      { etapaDe: null, etapaPara: "CAPTACAO" as const, situacao: null, ocorridoEm: mesmo },
    ];
    expect(ordenarLinhaDoTempo(fora).map((e) => tipoDoEvento(e))).toEqual(["ENTRADA", "DESFECHO"]);
  });

  it("não altera o array que recebeu", () => {
    const entrada = [
      { etapaDe: null, etapaPara: "TRIAGEM" as const, situacao: null, ocorridoEm: em("2026-03-02T10:00:00Z") },
      { etapaDe: null, etapaPara: "CAPTACAO" as const, situacao: null, ocorridoEm: em("2026-03-01T10:00:00Z") },
    ];
    ordenarLinhaDoTempo(entrada);
    expect(entrada[0].etapaPara).toBe("TRIAGEM");
  });
});

describe("etapasPercorridas", () => {
  /**
   * ESTA É A PERGUNTA DO DIRETOR, em uma asserção: "por onde ele passou". A resposta sai do
   * histórico, e não da coluna `etapa` da candidatura, que guarda só o retrato final.
   */
  it("devolve o caminho na ordem, sem repetir", () => {
    const eventos = [
      { etapaDe: null, etapaPara: "CAPTACAO" as const, situacao: null, ocorridoEm: em("2026-03-01T10:00:00Z") },
      { etapaDe: "CAPTACAO" as const, etapaPara: "TRIAGEM" as const, situacao: null, ocorridoEm: em("2026-03-02T10:00:00Z") },
      { etapaDe: "TRIAGEM" as const, etapaPara: "CAPTACAO" as const, situacao: null, ocorridoEm: em("2026-03-03T10:00:00Z") },
      { etapaDe: "CAPTACAO" as const, etapaPara: "ENTREVISTA_CLIENTE" as const, situacao: null, ocorridoEm: em("2026-03-04T10:00:00Z") },
    ];
    expect(etapasPercorridas(eventos)).toEqual(["CAPTACAO", "TRIAGEM", "ENTREVISTA_CLIENTE"]);
  });

  /**
   * "DESCARTADO NA TRIAGEM": a etapa em que a decisão foi tomada CONTA no caminho, mesmo que a
   * pessoa tenha sido descartada assim que chegou nela. É o que dá sentido à frase da ficha depois
   * de a etapa sumir da listagem (peça P1).
   */
  it("o desfecho entra no caminho com a etapa em que aconteceu", () => {
    const eventos = [
      { etapaDe: null, etapaPara: "CAPTACAO" as const, situacao: null, ocorridoEm: em("2026-03-01T10:00:00Z") },
      { etapaDe: null, etapaPara: "TRIAGEM" as const, situacao: "DESCARTADO" as const, ocorridoEm: em("2026-03-05T10:00:00Z") },
    ];
    expect(etapasPercorridas(eventos)).toEqual(["CAPTACAO", "TRIAGEM"]);
  });

  it("sem eventos, caminho vazio: é o estado da candidatura que nunca se moveu", () => {
    expect(etapasPercorridas([])).toEqual([]);
  });
});
