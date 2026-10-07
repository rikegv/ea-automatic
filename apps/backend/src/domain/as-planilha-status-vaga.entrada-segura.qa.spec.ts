import { describe, expect, it } from "vitest";
import {
  agregarStatusDaPlanilha,
  normalizarStatusDaPlanilha,
  vagaDaPlanilhaSai,
} from "./as-planilha-status-vaga";

/**
 * ─ QA INDEPENDENTE (tester, §A.38): F2, A RÉGUA DE EXCLUSÃO (OPÇÃO A), NO NÍVEL DO DOMÍNIO ──────
 *
 * Esta suíte NÃO é do autor da régua. Ela parte do REQUISITO do diretor e prova que a função pura
 * decide por ele, não pela implementação. O requisito MUDOU em 07/10/2026: antes era "só ABERTO e
 * ENTREGUE entram", agora é "a vaga aparece por padrão, e só FECHADO ou CANCELADO a exclui". O
 * fundamento é não perder vaga real de vista enquanto o time não lançou o código na planilha.
 *
 * O requisito da AGREGAÇÃO mudou em 07/10/2026 pelo mesmo fundamento: a operação reaproveitava código
 * de vaga, então código com linha aberta e linha fechada é código reusado, com uma vaga fechada e
 * outra ABERTA. Havendo linha aberta, há trabalho, e a vaga tem de aparecer.
 *
 * A régua é compartilhada entre o gate de ESCRITA (F2) e o filtro de LEITURA (F3), então acertá-la
 * aqui vale para os dois.
 *
 * §A.6: status é ciclo de vida, não dado pessoal. §A.11: sem travessão.
 */

describe("QA F2 (domínio): quem a planilha EXCLUI", () => {
  it("FECHADO e CANCELADO SAEM (os dois únicos que saem), tolerando caixa, acento e gênero", () => {
    for (const bruto of ["FECHADO", "fechada", "Encerrado", "encerrada"]) {
      expect(vagaDaPlanilhaSai(bruto), `"${bruto}" deveria sair`).toBe(true);
      expect(normalizarStatusDaPlanilha(bruto)).toBe("FECHADO");
    }
    for (const bruto of ["CANCELADO", "cancelada", "Cancelamento"]) {
      expect(vagaDaPlanilhaSai(bruto), `"${bruto}" deveria sair`).toBe(true);
      expect(normalizarStatusDaPlanilha(bruto)).toBe("CANCELADO");
    }
  });

  it("ABERTO e ENTREGUE APARECEM (não saem), tolerando caixa, acento e gênero", () => {
    for (const bruto of ["ABERTO", "aberto", "Aberta", " aberto ", "ABERTA"]) {
      expect(vagaDaPlanilhaSai(bruto), `"${bruto}" NÃO deveria sair`).toBe(false);
    }
    for (const bruto of ["ENTREGUE", "entregue", "Entregue", "entrega", " ENTREGUE "]) {
      expect(vagaDaPlanilhaSai(bruto), `"${bruto}" NÃO deveria sair`).toBe(false);
    }
  });

  it("AUSÊNCIA de status (null/undefined/vazio) APARECE: a planilha não disse que fechou", () => {
    for (const bruto of [null, undefined, "", "   "]) {
      expect(vagaDaPlanilhaSai(bruto), `${JSON.stringify(bruto)} NÃO deveria sair`).toBe(false);
      expect(normalizarStatusDaPlanilha(bruto)).toBeNull();
    }
  });

  it("status DESCONHECIDO (presente, mas fora do vocabulário) vira OUTRO e APARECE", () => {
    for (const bruto of ["stand by", "pausada", "em análise", "xyz"]) {
      expect(normalizarStatusDaPlanilha(bruto)).toBe("OUTRO");
      expect(vagaDaPlanilhaSai(bruto), `"${bruto}" NÃO deveria sair`).toBe(false);
    }
  });

  it("idempotência: o token canônico já gravado decide igual ao texto cru", () => {
    // O gate lê o TOKEN do espelho; o teste puro passa o texto cru. A régua tem de concordar nos dois.
    expect(vagaDaPlanilhaSai("FECHADO")).toBe(true);
    expect(vagaDaPlanilhaSai(normalizarStatusDaPlanilha("Encerrada")!)).toBe(true);
    expect(vagaDaPlanilhaSai("ABERTO")).toBe(false);
    expect(vagaDaPlanilhaSai(normalizarStatusDaPlanilha("Aberta")!)).toBe(false);
  });
});

describe("QA F2 (domínio): agregação de linhas da planilha (uma vaga, N candidatos)", () => {
  it("todas as linhas de vaga viva: ABERTO quando houver linha aberta, senão ENTREGUE", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "aberto", "ABERTA"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Entregue"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Entregue", "entregue"])).toBe("ENTREGUE");
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Aberto", "Entregue"]))).toBe(false);
  });

  it("QUALQUER linha de vaga VIVA domina o token: código misto é código REUSADO, e tem vaga aberta", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Cancelada"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado", "Cancelada"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Entregue", "Fechado"])).toBe("ENTREGUE");
    expect(agregarStatusDaPlanilha(["Entregue", "pausada"])).toBe("ENTREGUE");
  });

  it("SEM linha viva, o encerramento decide, e CANCELADO vem antes de FECHADO", () => {
    expect(agregarStatusDaPlanilha(["Fechado"])).toBe("FECHADO");
    expect(agregarStatusDaPlanilha(["Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Fechado", "Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["pausada"])).toBe("OUTRO");
    expect(agregarStatusDaPlanilha(["pausada", "Fechado"])).toBe("FECHADO");
  });

  it("REQUISITO DO DIRETOR: havendo linha ABERTA, a vaga NÃO pode sair da fila", () => {
    for (const conj of [
      ["Aberto", "Fechado"],
      ["Aberto", "Cancelada"],
      ["Aberto", "Fechado", "Cancelada"],
      ["Entregue", "Fechado"],
    ]) {
      const token = agregarStatusDaPlanilha(conj);
      expect(vagaDaPlanilhaSai(token), `${JSON.stringify(conj)} NÃO deveria sair`).toBe(false);
    }
    // O encerramento sem nenhuma linha viva continua excluindo: a régua não foi afrouxada.
    for (const conj of [["Fechado"], ["Cancelada"], ["Fechado", "Cancelada"], ["pausada", "Fechado"]]) {
      const token = agregarStatusDaPlanilha(conj);
      expect(vagaDaPlanilhaSai(token), `${JSON.stringify(conj)} deveria sair`).toBe(true);
    }
  });

  it("nenhuma linha legível: devolve null (ausência), que não exclui a vaga", () => {
    expect(agregarStatusDaPlanilha([null, undefined, "", "  "])).toBeNull();
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha([]))).toBe(false);
  });
});
