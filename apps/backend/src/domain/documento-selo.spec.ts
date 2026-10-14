import { describe, expect, it } from "vitest";
import { OBSERVACAO_COLETADO_AGUARDANDO } from "./auditoria";
import { MOTIVO_FALHA_IA } from "./falha-auditoria";
import {
  documentoReprovadoNaAuditoria,
  PREFIXO_OBSERVACAO_ASO_COLETADO,
} from "./documento-selo";

describe("documentoReprovadoNaAuditoria (selo REPROVADO no card da Auditoria)", () => {
  it("REPROVA: AGUARDANDO_AUDITORIA com motivo de veredito gravado (caminho do Portal)", () => {
    // O caso real do bug: o Portal grava o motivo e não rebaixa o estado.
    expect(
      documentoReprovadoNaAuditoria({
        estado: "AGUARDANDO_AUDITORIA",
        observacao: "Comprovante emitido há mais de 90 dias.",
      }),
    ).toBe(true);
    expect(
      documentoReprovadoNaAuditoria({
        estado: "AGUARDANDO_AUDITORIA",
        observacao: "Nome do titular da conta bancária não encontrado no documento.",
        conferirAutenticidade: false,
      }),
    ).toBe(true);
  });

  it("NÃO reprova: coletado e ainda não auditado (texto de espera da régua)", () => {
    expect(
      documentoReprovadoNaAuditoria({
        estado: "AGUARDANDO_AUDITORIA",
        observacao: OBSERVACAO_COLETADO_AGUARDANDO,
      }),
    ).toBe(false);
  });

  it("NÃO reprova: ASO anexado, aguardando análise (texto de espera parametrizado por bytes)", () => {
    expect(
      documentoReprovadoNaAuditoria({
        estado: "AGUARDANDO_AUDITORIA",
        observacao: `${PREFIXO_OBSERVACAO_ASO_COLETADO} (12345 bytes), aguardando a análise por I.A.`,
      }),
    ).toBe(false);
  });

  it("NÃO reprova: parada de sistema (toda família de MOTIVO_FALHA_IA que fica em AGUARDANDO)", () => {
    for (const motivo of Object.values(MOTIVO_FALHA_IA)) {
      expect(
        documentoReprovadoNaAuditoria({ estado: "AGUARDANDO_AUDITORIA", observacao: motivo }),
      ).toBe(false);
    }
  });

  it("NÃO reprova: suspeita de autenticidade é documento VALIDADO à espera de humano (§A.38)", () => {
    // Mesmo com motivo gravado, a marca de autenticidade significa aprovado-aguardando-conferência,
    // nunca recusa. Precedência humana sobre a IA.
    expect(
      documentoReprovadoNaAuditoria({
        estado: "AGUARDANDO_AUDITORIA",
        observacao: "Documento validado. Suspeita De Autenticidade. Conferir a via oficial antes de aceitar.",
        conferirAutenticidade: true,
      }),
    ).toBe(false);
  });

  it("NÃO reprova: AGUARDANDO_AUDITORIA sem motivo nenhum (aguardando de verdade)", () => {
    expect(documentoReprovadoNaAuditoria({ estado: "AGUARDANDO_AUDITORIA", observacao: null })).toBe(
      false,
    );
    expect(documentoReprovadoNaAuditoria({ estado: "AGUARDANDO_AUDITORIA", observacao: "   " })).toBe(
      false,
    );
  });

  it("NÃO reprova por aqui: INCONFORME tem estado e selo próprios, fora desta régua", () => {
    // A reprovação de upload manual já é INCONFORME e exibe "Inconforme"; não entra no selo novo.
    expect(
      documentoReprovadoNaAuditoria({
        estado: "INCONFORME",
        observacao: "Comprovante emitido há mais de 90 dias.",
      }),
    ).toBe(false);
  });

  it("NÃO reprova: estados que não são AGUARDANDO_AUDITORIA", () => {
    for (const estado of ["PENDENTE", "ENTREGUE", null, undefined]) {
      expect(
        documentoReprovadoNaAuditoria({ estado, observacao: "qualquer motivo de veredito" }),
      ).toBe(false);
    }
  });
});
