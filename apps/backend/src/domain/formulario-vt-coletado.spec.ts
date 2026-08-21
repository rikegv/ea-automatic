import { describe, expect, it } from "vitest";
import { interpretarFormularioVt, rotuloCartao } from "./formulario-vt-coletado";

/**
 * O JSON IRMÃO vem de FORA (outro deploy, outra linguagem, outro time), e é o único ponto desta
 * frente onde o dado pode chegar torto. Estes testes fixam as duas posturas que a função tem:
 *
 *  1. OU ENTRA INTEIRO, OU NÃO ENTRA. Falta de campo obrigatório devolve `null`, e o PDF é
 *     arquivado do mesmo jeito. Gravar meia linha faria a tela mostrar "Ida R$ 0,00", que se lê como
 *     "o candidato não gasta nada" quando a verdade é "ainda não sei".
 *  2. CONDUÇÃO TORTA CAI SOZINHA. Perder uma linha do itinerário é menos grave que perder o
 *     endereço e o aceite inteiros.
 */

const BASE = {
  optante: true,
  cep: "01310-100",
  logradouro: "Avenida Paulista",
  numero: "1000",
  bairro: "Bela Vista",
  cidade: "São Paulo",
  uf: "sp",
  cienteEm: "2026-08-20T18:00:00.000Z",
  totalIda: 99,
  totalVolta: 99,
  totalDia: 99,
  conducoes: [
    { sentido: "IDA", ordem: 1, cidade: "São Paulo", tipoTransporte: "Metrô", cartao: "BILHETE_UNICO", valor: 4.7 },
    { sentido: "VOLTA", ordem: 1, cidade: "São Paulo", tipoTransporte: "Metrô", cartao: "BILHETE_UNICO", valor: 4.7 },
  ],
};

describe("interpretarFormularioVt", () => {
  it("converte o payload completo e NORMALIZA a UF", () => {
    const r = interpretarFormularioVt(BASE)!;
    expect(r.optante).toBe(true);
    expect(r.cep).toBe("01310100"); // pontuação some: a coluna tem 8 posições
    expect(r.uf).toBe("SP");
    expect(r.conducoes).toHaveLength(2);
  });

  it("RECALCULA os totais a partir das conduções, ignorando o que veio no payload", () => {
    // O payload mandou 99 nos três; o certo é 4,70 + 4,70 = 9,40.
    const r = interpretarFormularioVt(BASE)!;
    expect(r.totalIda).toBe("4.70");
    expect(r.totalVolta).toBe("4.70");
    expect(r.totalDia).toBe("9.40");
  });

  it("NÃO-OPTANTE (sem condução) usa os totais do payload, que são zero", () => {
    const r = interpretarFormularioVt({
      ...BASE,
      optante: false,
      conducoes: [],
      totalIda: 0,
      totalVolta: 0,
      totalDia: 0,
    })!;
    expect(r.optante).toBe(false);
    expect(r.totalDia).toBe("0.00");
    expect(r.conducoes).toEqual([]);
  });

  it.each([
    ["sem optante", { optante: undefined }],
    ["sem cep válido", { cep: "123" }],
    ["sem logradouro", { logradouro: "   " }],
    ["sem aceite (cienteEm)", { cienteEm: undefined }],
    ["com aceite inválido", { cienteEm: "ontem" }],
  ])("recusa payload %s, para não gravar meia linha", (_rotulo, patch) => {
    expect(interpretarFormularioVt({ ...BASE, ...patch })).toBeNull();
  });

  it("recusa o que nem é objeto", () => {
    expect(interpretarFormularioVt(null)).toBeNull();
    expect(interpretarFormularioVt([1, 2])).toBeNull();
    expect(interpretarFormularioVt("texto")).toBeNull();
  });

  it("condução com cartão desconhecido cai sozinha, o resto do formulário entra", () => {
    const r = interpretarFormularioVt({
      ...BASE,
      conducoes: [BASE.conducoes[0], { ...BASE.conducoes[1], cartao: "VALE_MAGICO" }],
    })!;
    expect(r.conducoes).toHaveLength(1);
    // E o total acompanha o que SOBROU, senão a soma não bateria com as linhas exibidas.
    expect(r.totalVolta).toBe("0.00");
    expect(r.totalDia).toBe("4.70");
  });

  it("cartaoOutro só sobrevive no cartão OUTRO", () => {
    const r = interpretarFormularioVt({
      ...BASE,
      conducoes: [
        { ...BASE.conducoes[0], cartao: "OUTRO", cartaoOutro: "Vale Fretado" },
        { ...BASE.conducoes[1], cartaoOutro: "ruído" },
      ],
    })!;
    expect(r.conducoes[0].cartaoOutro).toBe("Vale Fretado");
    expect(r.conducoes[1].cartaoOutro).toBeNull();
  });
});

describe("rotuloCartao", () => {
  const c = (cartao: string, cartaoOutro: string | null = null) =>
    ({ cartao, cartaoOutro }) as never;

  it("um cartão só: mostra o nome dele", () => {
    expect(rotuloCartao([c("BILHETE_UNICO"), c("BILHETE_UNICO")])).toBe("Bilhete Único");
  });

  it("cartão OUTRO usa o que o candidato escreveu", () => {
    expect(rotuloCartao([c("OUTRO", "Vale Fretado")])).toBe("Vale Fretado");
  });

  it("mais de um cartão NÃO escolhe um: diz quantos são", () => {
    expect(rotuloCartao([c("BILHETE_UNICO"), c("CARTAO_TOP")])).toBe("2 cartões");
  });

  it("sem condução, não há cartão a mostrar", () => {
    expect(rotuloCartao([])).toBeNull();
  });
});
