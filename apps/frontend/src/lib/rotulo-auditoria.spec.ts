import { describe, expect, it } from "vitest";
import { rotuloDaAuditoria, type ProgressoObrigatorios } from "./rotulo-auditoria";

/**
 * Rótulo da coluna de status da Auditoria (OST do status real).
 *
 * O caso que originou a frente: duas admissões, uma sem NADA recebido e outra com quase tudo
 * aprovado, exibiam o mesmo "Análise pendente" estático.
 */
function p(over: Partial<ProgressoObrigatorios> = {}): ProgressoObrigatorios {
  return { entregues: 0, total: 6, inconformes: 0, recebidos: 0, ...over };
}

describe("rotuloDaAuditoria", () => {
  it("nada recebido → Entrega pendente (a ação é cobrar o candidato)", () => {
    expect(rotuloDaAuditoria(p())).toBe("Entrega pendente");
  });

  it("entrega começou mas nem todos aprovados → Análise em andamento", () => {
    expect(rotuloDaAuditoria(p({ entregues: 4, recebidos: 4 }))).toBe("Análise em andamento");
  });

  it("todos os obrigatórios aprovados → Análise finalizada", () => {
    expect(rotuloDaAuditoria(p({ entregues: 6, recebidos: 6 }))).toBe("Análise finalizada");
  });

  it("REGRA DO DIRETOR: havendo REPROVADO nunca é Análise finalizada", () => {
    // 5 aprovados + 1 reprovado = 6 recebidos de 6, mas NÃO está finalizada.
    expect(rotuloDaAuditoria(p({ entregues: 5, inconformes: 1, recebidos: 6 }))).toBe(
      "Análise em andamento",
    );
    // Guarda extra: nem mesmo com a contagem de aprovados batendo o total por inconsistência de dado.
    expect(rotuloDaAuditoria(p({ entregues: 6, inconformes: 1, recebidos: 6 }))).toBe(
      "Análise em andamento",
    );
  });

  it("documento que CHEGOU e espera a IA não deixa a admissão como Entrega pendente", () => {
    // Nenhum aprovado ainda, mas 2 chegaram (aguardando auditoria): a entrega ACONTECEU.
    expect(rotuloDaAuditoria(p({ entregues: 0, recebidos: 2 }))).toBe("Análise em andamento");
  });

  it("documento reprovado também conta como recebido (o candidato mandou)", () => {
    expect(rotuloDaAuditoria(p({ entregues: 0, inconformes: 3, recebidos: 3 }))).toBe(
      "Análise em andamento",
    );
  });

  it("régua sem obrigatórios não vira Análise finalizada por vacuidade", () => {
    expect(rotuloDaAuditoria(p({ total: 0, entregues: 0, recebidos: 0 }))).toBe("Entrega pendente");
  });
});
