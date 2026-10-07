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
  it("todas as linhas de vaga viva: token ENTREGUE quando houver, senão ABERTO, e a vaga aparece", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "aberto", "ABERTA"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Entregue"])).toBe("ENTREGUE");
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Aberto", "Entregue"]))).toBe(false);
  });

  it("QUALQUER linha fora de ABERTO/ENTREGUE domina o token (prefere CANCELADO a FECHADO a OUTRO)", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado"])).toBe("FECHADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado", "Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Entregue", "pausada"])).toBe("OUTRO");
  });

  it("pela Opção A, só o conflito que agrega em FECHADO/CANCELADO exclui a vaga", () => {
    for (const conj of [["Aberto", "Fechado"], ["Aberto", "Cancelada"]]) {
      const token = agregarStatusDaPlanilha(conj);
      expect(vagaDaPlanilhaSai(token), `${JSON.stringify(conj)} deveria sair`).toBe(true);
    }
    // Conflito que agrega em OUTRO continua VISÍVEL: ninguém afirmou encerramento.
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha(["Entregue", "pausada"]))).toBe(false);
  });

  it("nenhuma linha legível: devolve null (ausência), que não exclui a vaga", () => {
    expect(agregarStatusDaPlanilha([null, undefined, "", "  "])).toBeNull();
    expect(vagaDaPlanilhaSai(agregarStatusDaPlanilha([]))).toBe(false);
  });
});
