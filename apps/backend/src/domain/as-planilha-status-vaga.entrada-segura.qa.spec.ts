import { describe, expect, it } from "vitest";
import {
  agregarStatusDaPlanilha,
  normalizarStatusDaPlanilha,
  vagaDaPlanilhaEntra,
} from "./as-planilha-status-vaga";

/**
 * ─ QA INDEPENDENTE (tester, §A.38): F2, O FILTRO DE ENTRADA SEGURO, NO NÍVEL DO DOMÍNIO ─────────
 *
 * Esta suíte NÃO é do autor da régua. Ela parte do REQUISITO do diretor (quem entra, quem não
 * entra) e prova que a função pura decide por ele, não pela implementação. A régua é compartilhada
 * entre o gate de ESCRITA (F2) e o filtro de LEITURA (F3), então acertá-la aqui vale para os dois.
 *
 * §A.6: status é ciclo de vida, não dado pessoal. §A.11: sem travessão.
 */

describe("QA F2 (domínio): quem a planilha deixa ENTRAR", () => {
  it("ABERTO e ENTREGUE ENTRAM (os dois únicos que entram), tolerando caixa, acento e gênero", () => {
    for (const bruto of ["ABERTO", "aberto", "Aberta", " aberto ", "ABERTA"]) {
      expect(vagaDaPlanilhaEntra(bruto), `"${bruto}" deveria entrar`).toBe(true);
    }
    for (const bruto of ["ENTREGUE", "entregue", "Entregue", "entrega", " ENTREGUE "]) {
      expect(vagaDaPlanilhaEntra(bruto), `"${bruto}" deveria entrar`).toBe(true);
    }
  });

  it("FECHADO e CANCELADO NÃO entram (o requisito literal do diretor)", () => {
    for (const bruto of ["FECHADO", "fechada", "Encerrado", "encerrada"]) {
      expect(vagaDaPlanilhaEntra(bruto), `"${bruto}" NÃO deveria entrar`).toBe(false);
      expect(normalizarStatusDaPlanilha(bruto)).toBe("FECHADO");
    }
    for (const bruto of ["CANCELADO", "cancelada", "Cancelamento"]) {
      expect(vagaDaPlanilhaEntra(bruto), `"${bruto}" NÃO deveria entrar`).toBe(false);
      expect(normalizarStatusDaPlanilha(bruto)).toBe("CANCELADO");
    }
  });

  it("AUSÊNCIA de status (null/undefined/vazio) NÃO entra: fail-closed, não adivinha", () => {
    for (const bruto of [null, undefined, "", "   "]) {
      expect(vagaDaPlanilhaEntra(bruto), `${JSON.stringify(bruto)} NÃO deveria entrar`).toBe(false);
      expect(normalizarStatusDaPlanilha(bruto)).toBeNull();
    }
  });

  it("status DESCONHECIDO (presente, mas fora do vocabulário) vira OUTRO e NÃO entra", () => {
    for (const bruto of ["stand by", "pausada", "em análise", "xyz"]) {
      expect(normalizarStatusDaPlanilha(bruto)).toBe("OUTRO");
      expect(vagaDaPlanilhaEntra(bruto), `"${bruto}" NÃO deveria entrar`).toBe(false);
    }
  });

  it("idempotência: o token canônico já gravado volta a entrar/não entrar igual ao texto cru", () => {
    // O gate lê o TOKEN do espelho; o teste puro passa o texto cru. A régua tem de concordar nos dois.
    expect(vagaDaPlanilhaEntra("ABERTO")).toBe(true);
    expect(vagaDaPlanilhaEntra(normalizarStatusDaPlanilha("Aberta")!)).toBe(true);
    expect(vagaDaPlanilhaEntra("FECHADO")).toBe(false);
    expect(vagaDaPlanilhaEntra(normalizarStatusDaPlanilha("Encerrada")!)).toBe(false);
  });
});

describe("QA F2 (domínio): agregação de linhas da planilha (uma vaga, N candidatos), fail-closed", () => {
  it("todas as linhas ENTRAM: a vaga entra, reportando ENTREGUE quando houver, senão ABERTO", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "aberto", "ABERTA"])).toBe("ABERTO");
    expect(agregarStatusDaPlanilha(["Aberto", "Entregue"])).toBe("ENTREGUE");
  });

  it("QUALQUER linha que NÃO entra derruba a vaga inteira (prefere CANCELADO a FECHADO a OUTRO)", () => {
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado"])).toBe("FECHADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Aberto", "Fechado", "Cancelada"])).toBe("CANCELADO");
    expect(agregarStatusDaPlanilha(["Entregue", "pausada"])).toBe("OUTRO");
    // E nenhum desses conjuntos conflitantes "entra" pela régua de agregação:
    for (const conj of [["Aberto", "Fechado"], ["Aberto", "Cancelada"], ["Entregue", "pausada"]]) {
      const token = agregarStatusDaPlanilha(conj);
      expect(vagaDaPlanilhaEntra(token), `${JSON.stringify(conj)} não deveria entrar`).toBe(false);
    }
  });

  it("nenhuma linha legível: devolve null (ausência), que também não entra", () => {
    expect(agregarStatusDaPlanilha([null, undefined, "", "  "])).toBeNull();
    expect(vagaDaPlanilhaEntra(agregarStatusDaPlanilha([]))).toBe(false);
  });
});
