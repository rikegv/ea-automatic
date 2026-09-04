import { describe, expect, it } from "vitest";
import { LOJA_ALOCAR, LOJA_MATRIZ, opcoesDeLoja, rotuloDaLoja, type LojaCatalogo } from "./loja";

/**
 * O QUE ESTE TESTE PROTEGE: que "sem loja" continue sendo DOIS desfechos, e não um vazio só.
 *
 * MATRIZ (o cliente não usa loja, o normal) e ALOCAR LOJA (o cliente usa e ninguém escolheu, uma
 * pendência) nascem do MESMO `lojaNome` nulo. Qualquer simplificação futura que troque os dois por um
 * "não informado" apaga a distinção que a coluna existe para mostrar, e quebra aqui antes de chegar
 * na tela.
 */
describe("rótulo da coluna Loja", () => {
  it("com loja escolhida, mostra o nome dela", () => {
    expect(rotuloDaLoja("KOP SP FARIA LIMA", true)).toBe("KOP SP FARIA LIMA");
  });

  it("cliente SEM lojas cadastradas é MATRIZ, e não pendência", () => {
    expect(rotuloDaLoja(null, false)).toBe("MATRIZ");
    // `undefined` (campo ausente na resposta) cai no mesmo lado seguro: quem não tem catálogo de
    // lojas não pode ser cobrado por não ter escolhido uma.
    expect(rotuloDaLoja(null, undefined)).toBe("MATRIZ");
  });

  it("cliente COM lojas e admissão sem loja é ALOCAR LOJA, a pendência", () => {
    expect(rotuloDaLoja(null, true)).toBe("ALOCAR LOJA");
  });

  it("o nome da loja ganha do resto: quem já foi alocado não é pendência nem matriz", () => {
    expect(rotuloDaLoja("LOJA CENTRO", false)).toBe("LOJA CENTRO");
  });
});

describe("opções do filtro de Loja", () => {
  const lojas: LojaCatalogo[] = [
    { id: "b", nome: "ZONA SUL", codCliente: "1", clienteNome: "Cliente A" },
    { id: "a", nome: "CENTRO", codCliente: "2", clienteNome: "Cliente B" },
  ];

  it("MATRIZ e ALOCAR LOJA vêm primeiro, nessa ordem", () => {
    const opts = opcoesDeLoja(lojas);
    expect(opts[0]).toEqual({ value: LOJA_MATRIZ, label: "MATRIZ" });
    expect(opts[1]).toEqual({ value: LOJA_ALOCAR, label: "ALOCAR LOJA" });
  });

  it("as lojas vêm depois, em ordem alfabética e com o cliente no rótulo", () => {
    const opts = opcoesDeLoja(lojas).slice(2);
    // O cliente entra no rótulo porque nome de loja só é único DENTRO do cliente, e o rótulo também
    // é o que a busca do MultiSelect casa.
    expect(opts.map((o) => o.label)).toEqual(["CENTRO (Cliente B)", "ZONA SUL (Cliente A)"]);
    expect(opts.map((o) => o.value)).toEqual(["a", "b"]);
  });

  it("sem lojas cadastradas em lugar nenhum, os dois casos especiais continuam de pé", () => {
    expect(opcoesDeLoja([]).map((o) => o.value)).toEqual([LOJA_MATRIZ, LOJA_ALOCAR]);
  });
});
