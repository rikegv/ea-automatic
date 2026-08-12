import { describe, expect, it } from "vitest";
import { diasUteisEntre, domingoDePascoa, ehDiaUtil, feriadosNacionais } from "./dias-uteis";

describe("Páscoa (Meeus/Jones/Butcher): datas conferidas contra o calendário", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
  ])("Páscoa de %i cai em %s", (ano, esperado) => {
    expect(domingoDePascoa(ano).toISOString().slice(0, 10)).toBe(esperado);
  });
});

describe("feriados nacionais", () => {
  it("2026 traz as oito datas fixas, a Consciência Negra e a Sexta-feira Santa", () => {
    const f = feriadosNacionais(2026);
    for (const d of [
      "2026-01-01",
      "2026-04-21",
      "2026-05-01",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-12-25",
    ]) {
      expect(f.has(d), d).toBe(true);
    }
    expect(f.has("2026-11-20"), "Consciência Negra (Lei 14.759/2023)").toBe(true);
    // Páscoa 2026 é 05/04, então a Sexta-feira Santa é 03/04.
    expect(f.has("2026-04-03"), "Sexta-feira Santa").toBe(true);
  });

  /** A lei é de 2023 e vale a partir de 2024: antes disso o dia era feriado só em parte do país. */
  it("Consciência Negra NÃO conta antes de 2024", () => {
    expect(feriadosNacionais(2023).has("2023-11-20")).toBe(false);
    expect(feriadosNacionais(2024).has("2024-11-20")).toBe(true);
  });

  /**
   * Carnaval e Corpus Christi são PONTO FACULTATIVO federal, não feriado nacional, e ficam fora por
   * padrão. Se alguém os promover a feriado sem o diretor mandar, este teste quebra.
   */
  it("Carnaval e Corpus Christi NÃO entram como feriado nacional", () => {
    const f = feriadosNacionais(2026);
    expect(f.has("2026-02-17"), "terça de Carnaval de 2026").toBe(false);
    expect(f.has("2026-06-04"), "Corpus Christi de 2026").toBe(false);
  });
});

describe("dia útil", () => {
  it("sábado e domingo não são dias úteis", () => {
    expect(ehDiaUtil(new Date("2026-09-05T00:00:00Z")), "sábado").toBe(false);
    expect(ehDiaUtil(new Date("2026-09-06T00:00:00Z")), "domingo").toBe(false);
  });

  it("feriado nacional em dia de semana não é dia útil", () => {
    // 07/09/2026 é uma segunda-feira.
    expect(ehDiaUtil(new Date("2026-09-07T00:00:00Z"))).toBe(false);
  });

  it("dia de semana comum é dia útil", () => {
    expect(ehDiaUtil(new Date("2026-09-08T00:00:00Z"))).toBe(true);
  });

  it("com ponto facultativo LIGADO, a terça de Carnaval deixa de ser dia útil", () => {
    expect(ehDiaUtil(new Date("2026-02-17T00:00:00Z"), false)).toBe(true);
    expect(ehDiaUtil(new Date("2026-02-17T00:00:00Z"), true)).toBe(false);
  });
});

describe("dias úteis entre duas datas", () => {
  /**
   * O caso REAL do projeto que originou a regra: a Bienal vai de 01/09 a 13/09/2026, treze dias
   * corridos. 01/09 é uma terça, então entram 01 a 04 (quatro dias), cai fora o fim de semana de 05
   * e 06, o dia 07 é o feriado da Independência numa segunda, entram 08 a 11 (mais quatro) e o fim
   * de semana de 12 e 13 fecha o período. Treze dias corridos, OITO dias úteis.
   */
  it("Bienal 2026 (01/09 a 13/09): 13 dias corridos viram 8 dias úteis", () => {
    expect(diasUteisEntre("2026-09-01", "2026-09-13")).toBe(8);
  });

  it("inclui as duas pontas quando são dias úteis", () => {
    // Terça a quinta da mesma semana: três dias.
    expect(diasUteisEntre("2026-09-08", "2026-09-10")).toBe(3);
  });

  it("um único dia útil devolve 1, e um único fim de semana devolve 0", () => {
    expect(diasUteisEntre("2026-09-08", "2026-09-08")).toBe(1);
    expect(diasUteisEntre("2026-09-05", "2026-09-06")).toBe(0);
  });

  /**
   * NÚMERO CONFERIDO PELO DIRETOR: de 11/08/2026 (uma terça) até a véspera do início da Bienal
   * (01/09/2026), contando o dia de hoje, são 15 dias úteis. Agosto de 2026 não tem feriado nacional,
   * então o que sai são só os três fins de semana cheios do meio do mês.
   */
  it("de 11/08/2026 até a véspera do início (31/08), contando hoje, são 15 dias úteis", () => {
    expect(diasUteisEntre("2026-08-11", "2026-08-31")).toBe(15);
  });

  it("fim anterior ao início devolve 0, nunca negativo", () => {
    expect(diasUteisEntre("2026-09-13", "2026-09-01")).toBe(0);
  });

  it("aceita data ISO com hora, usando só a parte da data", () => {
    expect(diasUteisEntre("2026-09-08T23:00:00.000Z", "2026-09-10T01:00:00.000Z")).toBe(3);
  });
});
