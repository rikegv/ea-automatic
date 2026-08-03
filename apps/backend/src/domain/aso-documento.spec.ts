import { describe, expect, it } from "vitest";
import { asoFoiAnexado, asoFoiReprovado } from "./aso-documento";
import { calcularProgressoRegua, type DocReguaEstado } from "./regua";

/**
 * O ASO REPROVADO (OST do motivo real do ASO). Dois efeitos, testados aqui porque os dois são
 * lógica pura e os dois eram invisíveis antes:
 *
 *  1. a tela consegue separar "anexado" de "aprovado" (era um `Set` de ENTREGUE, e um ASO reprovado
 *     saía dele, sumindo da tela como se nunca tivesse sido enviado);
 *  2. a régua obrigatória NÃO fecha com um ASO recusado dentro, então a Auditoria não conclui
 *     sozinha e o prontuário não sobe ao Drive com um exame que a I.A recusou.
 */

describe("leitura do ASO como documento", () => {
  it("ENTREGUE e INCONFORME são ambos ANEXADOS: reprovado não é o mesmo que ausente", () => {
    expect(asoFoiAnexado({ estado: "ENTREGUE", observacao: "Apto." })).toBe(true);
    expect(asoFoiAnexado({ estado: "INCONFORME", observacao: "Vencido." })).toBe(true);
    expect(asoFoiAnexado({ estado: "AGUARDANDO_AUDITORIA", observacao: "ASO anexado." })).toBe(true);
  });

  it("PENDENTE sem motivo é a linha que a régua cria ao nascer: nada foi anexado", () => {
    expect(asoFoiAnexado({ estado: "PENDENTE", observacao: null })).toBe(false);
    expect(asoFoiAnexado({ estado: "PENDENTE", observacao: "   " })).toBe(false);
    expect(asoFoiAnexado({ estado: null, observacao: null })).toBe(false);
    expect(asoFoiAnexado(undefined)).toBe(false);
  });

  it("PENDENTE COM motivo foi auditado (a I.A não conseguiu decidir), logo está anexado", () => {
    expect(asoFoiAnexado({ estado: "PENDENTE", observacao: "Documento ilegível." })).toBe(true);
  });

  it("só INCONFORME é reprovação", () => {
    expect(asoFoiReprovado({ estado: "INCONFORME", observacao: "Vencido." })).toBe(true);
    expect(asoFoiReprovado({ estado: "ENTREGUE", observacao: "Apto." })).toBe(false);
    expect(asoFoiReprovado({ estado: "AGUARDANDO_AUDITORIA", observacao: null })).toBe(false);
    expect(asoFoiReprovado(undefined)).toBe(false);
  });
});

describe("ASO reprovado x completude da régua (o gate do arquivamento)", () => {
  const regua = (estadoAso: string): DocReguaEstado[] => [
    { nome: "RG", exigencia: "OBRIGATORIO", estado: "ENTREGUE" },
    { nome: "ASO", exigencia: "OBRIGATORIO", estado: estadoAso as DocReguaEstado["estado"] },
  ];

  it("ASO INCONFORME NÃO fecha a régua: nada é concluído nem arquivado por engano", () => {
    const p = calcularProgressoRegua(regua("INCONFORME"));
    expect(p.completa).toBe(false);
    expect(p.faltantes).toContain("ASO");
  });

  it("ASO sem veredito (I.A fora do ar) também não fecha a régua", () => {
    expect(calcularProgressoRegua(regua("AGUARDANDO_AUDITORIA")).completa).toBe(false);
  });

  it("ASO VALIDADO fecha a régua igual a antes: o fluxo aprovado não muda", () => {
    const p = calcularProgressoRegua(regua("ENTREGUE"));
    expect(p.completa).toBe(true);
    expect(p.faltantes).toHaveLength(0);
  });
});
