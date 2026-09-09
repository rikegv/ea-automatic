import { describe, expect, it } from "vitest";
import type { FecharVagaRecusa } from "@ea/shared-types";
import { ApiError } from "./api";
import { fechamentoRecusadoPorPosicoes, fraseDoFechamentoForcado } from "./as-vaga-fechamento";

/**
 * O QUE ESTE TESTE PROTEGE: a única recusa da tela que NÃO PODE virar uma frase solta.
 *
 * Antes desta etapa o 409 do fechamento por posição oficial aberta caía no tratamento genérico, e o
 * consultor lia o que quer que o `respostaOuErro` conseguisse montar. O corpo estruturado existe para
 * a tela dizer o número real e oferecer o forçamento a quem pode; um parser que deixe de reconhecer o
 * corpo devolve a tela ao estado anterior SEM NADA FALHAR, e é isso que quebra aqui.
 *
 * O SEGUNDO PONTO PROTEGIDO É O TEMPO VERBAL DA TRILHA. `faltavam` é congelado no instante do
 * forçamento, e a frase precisa dizer isso: no presente, ela afirmaria sobre uma vaga que continuou
 * andando depois do registro.
 */

const RECUSA: FecharVagaRecusa = {
  motivo: "POSICOES_OFICIAIS_ABERTAS",
  faltam: 2,
  posicoesOficiais: 5,
  finalizadasOficial: 3,
  podeForcar: true,
  message: "Esta vaga tem 5 posições oficiais e 2 ainda não foram preenchidas.",
};

describe("fechamentoRecusadoPorPosicoes (casa por `motivo`, nunca por texto)", () => {
  it("reconhece o 409 estruturado e devolve os números que a tela escreve", () => {
    const lido = fechamentoRecusadoPorPosicoes(new ApiError("Conflict", 409, RECUSA));
    expect(lido).not.toBeNull();
    expect(lido?.faltam).toBe(2);
    expect(lido?.posicoesOficiais).toBe(5);
    expect(lido?.finalizadasOficial).toBe(3);
    expect(lido?.podeForcar).toBe(true);
  });

  it("o COMUM é reconhecido igual, com `podeForcar` falso: a recusa é a mesma, o gesto é que não", () => {
    const lido = fechamentoRecusadoPorPosicoes(
      new ApiError("Conflict", 409, { ...RECUSA, podeForcar: false }),
    );
    expect(lido?.podeForcar).toBe(false);
  });

  it("NÃO confunde com o outro 409 do fechamento, o dos candidatos pendentes", () => {
    const outro = new ApiError("Conflict", 409, { reason: "candidatosPendentes", pendentes: [] });
    expect(fechamentoRecusadoPorPosicoes(outro)).toBeNull();
  });

  it("não casa por status nem por frase: 403 e 500 com o mesmo texto não são esta recusa", () => {
    expect(fechamentoRecusadoPorPosicoes(new ApiError("Conflict", 403, RECUSA))).toBeNull();
    expect(fechamentoRecusadoPorPosicoes(new ApiError("Conflict", 500, RECUSA))).toBeNull();
    expect(fechamentoRecusadoPorPosicoes(new Error(RECUSA.message))).toBeNull();
    expect(fechamentoRecusadoPorPosicoes(null)).toBeNull();
  });

  it("corpo PELA METADE não passa: sem `faltam` a tela escreveria 'faltam undefined'", () => {
    const semNumero = new ApiError("Conflict", 409, {
      motivo: "POSICOES_OFICIAIS_ABERTAS",
      podeForcar: true,
    });
    expect(fechamentoRecusadoPorPosicoes(semNumero)).toBeNull();

    const semPapel = new ApiError("Conflict", 409, {
      motivo: "POSICOES_OFICIAIS_ABERTAS",
      faltam: 2,
    });
    expect(fechamentoRecusadoPorPosicoes(semPapel)).toBeNull();
  });
});

describe("fraseDoFechamentoForcado (o número é do PASSADO, e a frase diz isso)", () => {
  it("fala no passado e nomeia quem forçou", () => {
    const frase = fraseDoFechamentoForcado(
      { porNome: "Ana Master", quandoIso: "2026-09-08T12:00:00.000Z", faltavam: 3 },
      "08/09/2026 09:00",
    );
    expect(frase).toContain("Ana Master");
    expect(frase).toContain("08/09/2026 09:00");
    expect(frase).toContain("Naquele momento");
    expect(frase).toContain("3 posições oficiais estavam abertas");
  });

  it("concorda no singular: uma posição não vira 'posições'", () => {
    const frase = fraseDoFechamentoForcado(
      { porNome: "Ana", quandoIso: "2026-09-08T12:00:00.000Z", faltavam: 1 },
      "08/09/2026 09:00",
    );
    expect(frase).toContain("1 posição oficial estava aberta");
  });

  it("autor removido não apaga a trilha: diz 'não informado' (§A.11) e mantém a frase", () => {
    const frase = fraseDoFechamentoForcado(
      { porNome: null, quandoIso: "2026-09-08T12:00:00.000Z", faltavam: 2 },
      "08/09/2026 09:00",
    );
    expect(frase).toContain("não informado");
    expect(frase).toContain("2 posições oficiais estavam abertas");
  });

  it("§A.11: nenhuma frase daqui usa travessão", () => {
    const frase = fraseDoFechamentoForcado(
      { porNome: "Ana", quandoIso: "2026-09-08T12:00:00.000Z", faltavam: 4 },
      "08/09/2026 09:00",
    );
    expect(frase).not.toContain("—");
  });
});
