import { describe, expect, it } from "vitest";
import {
  FRASE_PARA_O_CANDIDATO,
  motivoParaOCandidato,
} from "./portal-motivo-candidato";

/**
 * A CLASSIFICAÇÃO DO MOTIVO EM CATEGORIA, testada no NÍVEL DO DOMÍNIO (§A.40 regra 2), sem a fixture
 * do serviço. O que se prova aqui é o casamento por TERMOS e, principalmente, a ORDEM da prioridade:
 * a frase pode ser clara, legível e ERRADA se a categoria escolhida for a errada.
 *
 * Foco desta suíte: a categoria nova `FOTO_ASSINATURA`, para o motivo "Foto e/ou assinatura do
 * titular não identificáveis", que antes caía no `GENERICO` (vago) por nenhum termo casar. E a
 * regressão das categorias que já existiam, com atenção ao caso em que a mesma frase menciona `foto`
 * mas o defeito real é validade: tem de continuar `VENCIDO`.
 */

const reprovado = (motivo: string) => motivoParaOCandidato({ status: "INCONFORME", motivo });

describe("FOTO_ASSINATURA: o motivo específico chega ao candidato, não o genérico", () => {
  const casos = [
    "Foto e/ou assinatura do titular não identificáveis",
    "Foto e/ou assinatura do titular nao identificaveis",
    "Assinatura não identificável no documento",
    "Foto do titular não identificável",
    "Assinatura ausente no documento",
    "Documento sem assinatura do titular",
    "A assinatura não aparece no documento enviado",
  ];

  for (const motivo of casos) {
    it(`"${motivo}" vira FOTO_ASSINATURA, não GENERICO`, () => {
      const r = reprovado(motivo);
      expect(r.codigo).toBe("FOTO_ASSINATURA");
      expect(r.mensagem).toBe(FRASE_PARA_O_CANDIDATO.FOTO_ASSINATURA);
      expect(r.codigo).not.toBe("GENERICO");
    });
  }

  it("a frase da categoria não tem travessão (§A.11)", () => {
    expect(FRASE_PARA_O_CANDIDATO.FOTO_ASSINATURA).not.toContain("—");
  });

  it("a frase orienta o que corrigir: foto nítida com rosto e assinatura", () => {
    expect(FRASE_PARA_O_CANDIDATO.FOTO_ASSINATURA).toMatch(/foto|assinatura/i);
  });
});

describe("regressão: FOTO_ASSINATURA não rouba VENCIDO, ILEGIVEL, NAO_CONFERE nem DOCUMENTO_ERRADO", () => {
  it("VENCIDO continua VENCIDO mesmo mencionando a foto e o titular", () => {
    // O caso pega a colisão de propósito: o motivo cita `foto` e `titular` (termo de NAO_CONFERE),
    // mas o defeito real é validade. VENCIDO vem antes de FOTO_ASSINATURA na ordem, então vence.
    const r = reprovado("A foto do documento do titular mostra que a validade já expirou.");
    expect(r.codigo).toBe("VENCIDO");
  });

  it("ILEGIVEL continua ILEGIVEL mesmo quando a foto não é identificável por borrão", () => {
    // Legibilidade decide antes: o reenvio útil é o da foto nítida, não a orientação de assinatura.
    const r = reprovado("Documento ilegível: a foto está borrada e não identificável.");
    expect(r.codigo).toBe("ILEGIVEL");
  });

  it("NAO_CONFERE continua NAO_CONFERE quando o defeito é divergência com o cadastro", () => {
    const r = reprovado("Os dados do documento não conferem com o cadastro do titular.");
    expect(r.codigo).toBe("NAO_CONFERE");
  });

  it("DOCUMENTO_ERRADO continua DOCUMENTO_ERRADO", () => {
    const r = reprovado("O arquivo não é um RG, trata-se de outro documento.");
    expect(r.codigo).toBe("DOCUMENTO_ERRADO");
  });

  it("INCOMPLETO continua INCOMPLETO quando falta o verso", () => {
    const r = reprovado("Envio incompleto: falta o verso do documento.");
    expect(r.codigo).toBe("INCOMPLETO");
  });

  it("VENCIDO por vencimento puro segue VENCIDO", () => {
    const r = reprovado("O documento está vencido desde 2024.");
    expect(r.codigo).toBe("VENCIDO");
  });
});

describe("status e fallback inalterados", () => {
  it("VALIDADO vira ACEITO", () => {
    const r = motivoParaOCandidato({ status: "VALIDADO", motivo: "Documento legível e conferido." });
    expect(r.codigo).toBe("ACEITO");
    expect(r.mensagem).toBe(FRASE_PARA_O_CANDIDATO.ACEITO);
  });

  it("PENDENTE sem termo casável cai em ILEGIVEL (palpite útil da leitura)", () => {
    const r = motivoParaOCandidato({ status: "PENDENTE", motivo: "validação manual necessária" });
    expect(r.codigo).toBe("ILEGIVEL");
  });

  it("motivo vazio em reprovação cai no GENERICO", () => {
    const r = motivoParaOCandidato({ status: "INCONFORME", motivo: "" });
    expect(r.codigo).toBe("GENERICO");
  });

  it("motivo desconhecido em reprovação cai no GENERICO", () => {
    const r = reprovado("Motivo inesperado que nenhum termo cobre.");
    expect(r.codigo).toBe("GENERICO");
  });
});
