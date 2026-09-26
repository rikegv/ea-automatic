import { describe, expect, it } from "vitest";
import { SHORTLIST_MINIMO_SUGERIDO, VAGA_STATUS_SEMENTE, shortlistCurta } from "@ea/shared-types";
import { ApiError } from "@/lib/api";
import {
  envioDeShortlistEditavel,
  exigeMotivoDeReenvio,
  proximoNumeroDeShortlist,
  rotuloDaShortlist,
  shortlistCurtaPrecisaCiencia,
} from "@/lib/as-shortlists";

/**
 * ─ AS RÉGUAS DA SHORTLIST DO LADO DA TELA (Frente E, pontos 10 e 11) ──────────────────────────
 *
 * As quatro coisas afirmadas aqui são as que, erradas, não quebram nada e mentem em silêncio:
 *   1. o NÚMERO do próximo envio, que é quem decide se o formulário cobra o motivo do reenvio;
 *   2. a leitura do 409 da lista curta, que precisa distinguir a PERGUNTA de um erro de verdade;
 *   3. o campo "Envio da shortlist" parar de ser digitável assim que a vaga é publicada;
 *   4. o mínimo sugerido vir do vocabulário compartilhado, e não de um número escrito na tela.
 */

function shortlist(numero: number) {
  return {
    id: `s${numero}`,
    vagaId: "v1",
    numero,
    enviadaEm: "2026-09-20",
    enviadaPorNome: "Alguém",
    motivoReenvioId: null,
    motivoReenvioNome: null,
    avisoCurtaAceito: false,
    itens: [],
  };
}

describe("o número do próximo envio", () => {
  it("é 1 quando a vaga nunca mandou nada", () => {
    expect(proximoNumeroDeShortlist([])).toBe(1);
  });

  it("é o MAIOR número já enviado mais um, e não a contagem de linhas", () => {
    // A contagem daria 2 aqui, e o servidor numeraria 4: a tela pediria motivo de reenvio com a
    // palavra errada no cabeçalho, ou deixaria de pedir.
    expect(proximoNumeroDeShortlist([shortlist(1), shortlist(3)])).toBe(4);
  });
});

describe("o motivo do reenvio", () => {
  it("não é pedido na primeira lista (o servidor RECUSA o campo ali)", () => {
    expect(exigeMotivoDeReenvio(1)).toBe(false);
  });

  it("é pedido do segundo envio em diante", () => {
    expect(exigeMotivoDeReenvio(2)).toBe(true);
    expect(exigeMotivoDeReenvio(7)).toBe(true);
  });
});

describe("o rótulo da lista", () => {
  it("distingue a primeira do reenvio", () => {
    expect(rotuloDaShortlist(1)).toBe("Shortlist 1");
    expect(rotuloDaShortlist(2)).toBe("Reenvio 2");
  });
});

describe("a pergunta da lista curta", () => {
  it("reconhece o 409 com o número dentro", () => {
    const err = new ApiError("curta", 409, {
      needsConfirmation: true,
      quantidade: 2,
      minimoSugerido: SHORTLIST_MINIMO_SUGERIDO,
      mensagem: "Esta primeira shortlist tem 2 candidatos.",
    });
    expect(shortlistCurtaPrecisaCiencia(err)?.quantidade).toBe(2);
  });

  it("NÃO confunde outro 409 com a pergunta", () => {
    // O caso real: a vaga saiu do processo entre a abertura do formulário e o clique. Lido como
    // "confirme para enviar assim mesmo", o reenvio com a ciência levaria a um segundo erro.
    const err = new ApiError("Esta vaga não recebe shortlist.", 409, { message: "..." });
    expect(shortlistCurtaPrecisaCiencia(err)).toBeNull();
  });

  it("ignora erro que não é 409", () => {
    expect(shortlistCurtaPrecisaCiencia(new ApiError("400", 400, {}))).toBeNull();
    expect(shortlistCurtaPrecisaCiencia(new Error("rede"))).toBeNull();
  });

  it("a régua do mínimo é a COMPARTILHADA, não um número desta camada", () => {
    // Se alguém trocar o 3 por 4 no vocabulário, a tela acompanha sem ser tocada.
    expect(shortlistCurta(1, SHORTLIST_MINIMO_SUGERIDO - 1)).toBe(true);
    expect(shortlistCurta(1, SHORTLIST_MINIMO_SUGERIDO)).toBe(false);
  });

  it("mede TODO envio, e não só o primeiro (decisão do diretor)", () => {
    // A RÉGUA ANTIGA DEIXAVA O REENVIO CURTO PASSAR CALADO, com o argumento de que "reenvio de dois
    // nomes depois de uma lista de seis é o cliente pedindo mais dois". O diretor decidiu o
    // contrário pela operação: depois de transferência e descarte, reenvio curto é o CASO NORMAL, e
    // é justamente a lista que encolheu porque a vaga perdeu gente que precisa da pergunta.
    expect(shortlistCurta(2, 1)).toBe(true);
    expect(shortlistCurta(7, SHORTLIST_MINIMO_SUGERIDO - 1)).toBe(true);
    // E continua não avisando quando a lista não é curta, em envio nenhum.
    expect(shortlistCurta(2, SHORTLIST_MINIMO_SUGERIDO)).toBe(false);
  });
});

describe("o campo Envio da shortlist na trilha", () => {
  it("é digitável no RASCUNHO, que é onde a trilha escreve", () => {
    expect(envioDeShortlistEditavel("RASCUNHO", VAGA_STATUS_SEMENTE)).toBe(true);
  });

  it("vira LEITURA na vaga publicada, porque ali quem escreve é o envio", () => {
    expect(envioDeShortlistEditavel("ABERTA", VAGA_STATUS_SEMENTE)).toBe(false);
    expect(envioDeShortlistEditavel("ENTREGUE", VAGA_STATUS_SEMENTE)).toBe(false);
  });

  it("é digitável na vaga que ainda não existe (abertura nova, clone)", () => {
    expect(envioDeShortlistEditavel(null, VAGA_STATUS_SEMENTE)).toBe(true);
    expect(envioDeShortlistEditavel(undefined, VAGA_STATUS_SEMENTE)).toBe(true);
  });
});
