import { describe, expect, it } from "vitest";
import { bloqueioLiberacaoSemAso, mensagemBloqueioLiberacao } from "./exame-liberacao";

/**
 * A TRAVA DA DATA do "Liberado Para Cadastro Sem ASO" (regra dura do diretor).
 *
 * A regra tem um sentido, e é ele que os testes travam: liberar sem ASO existe para quem COMEÇA A
 * TRABALHAR antes de o documento ficar pronto. Previsão anterior (ou no mesmo dia) não tem janela a
 * cobrir, e sem previsão não há comparação possível.
 */
describe("Trava da liberação sem ASO", () => {
  it("PERMITE quando a previsão do ASO é posterior à data de admissão", () => {
    // O exemplo do diretor: admissão 01/09, ASO previsto 04/09.
    expect(
      bloqueioLiberacaoSemAso({ dataAdmissao: "2026-09-01", previsaoAso: "2026-09-04" }),
    ).toBeUndefined();
  });

  it("BLOQUEIA quando a previsão é ANTERIOR à data de admissão", () => {
    // O outro exemplo: admissão 01/09, ASO previsto 28/08. O documento chega antes de ela começar.
    expect(bloqueioLiberacaoSemAso({ dataAdmissao: "2026-09-01", previsaoAso: "2026-08-28" })).toBe(
      "PREVISAO_NAO_POSTERIOR",
    );
  });

  it("BLOQUEIA quando a previsão é no MESMO dia (a regra é estritamente posterior)", () => {
    expect(bloqueioLiberacaoSemAso({ dataAdmissao: "2026-09-01", previsaoAso: "2026-09-01" })).toBe(
      "PREVISAO_NAO_POSTERIOR",
    );
  });

  it("BLOQUEIA sem previsão do ASO preenchida", () => {
    // Caso mais comum da base: a previsão é opcional no agendamento, então a maior parte da fila
    // não a tem. Sem ela não há como comparar, e liberar sem comparar seria liberar sem a regra.
    expect(bloqueioLiberacaoSemAso({ dataAdmissao: "2026-09-01", previsaoAso: null })).toBe(
      "SEM_PREVISAO_ASO",
    );
  });

  it("BLOQUEIA sem data de admissão", () => {
    expect(bloqueioLiberacaoSemAso({ dataAdmissao: null, previsaoAso: "2026-09-04" })).toBe(
      "SEM_DATA_ADMISSAO",
    );
  });

  it("vira o ano sem se confundir (dezembro para janeiro)", () => {
    // A comparação é de string ISO, e é justamente aqui que uma comparação por dia/mês erraria.
    expect(
      bloqueioLiberacaoSemAso({ dataAdmissao: "2026-12-28", previsaoAso: "2027-01-05" }),
    ).toBeUndefined();
    expect(bloqueioLiberacaoSemAso({ dataAdmissao: "2027-01-05", previsaoAso: "2026-12-28" })).toBe(
      "PREVISAO_NAO_POSTERIOR",
    );
  });

  it("aceita Date além de string, sem virar '[object Ob'", () => {
    // O driver devolve string para `date`, mas um harness ou uma consulta crua entregam Date.
    expect(
      bloqueioLiberacaoSemAso({
        dataAdmissao: new Date("2026-09-01T00:00:00Z"),
        previsaoAso: new Date("2026-09-04T00:00:00Z"),
      } as never),
    ).toBeUndefined();
  });

  it("o recado diz QUAL das três situações barrou, com as datas legíveis", () => {
    const e = { dataAdmissao: "2026-09-01", previsaoAso: "2026-08-28" };
    const msg = mensagemBloqueioLiberacao("PREVISAO_NAO_POSTERIOR", e);
    expect(msg).toContain("28/08/2026");
    expect(msg).toContain("01/09/2026");
    expect(mensagemBloqueioLiberacao("SEM_PREVISAO_ASO", e)).toContain("previsão do ASO");
    expect(mensagemBloqueioLiberacao("SEM_DATA_ADMISSAO", e)).toContain("data de admissão");
  });

  it("§A.11: nenhum recado usa travessão", () => {
    const e = { dataAdmissao: "2026-09-01", previsaoAso: "2026-08-28" };
    for (const m of ["SEM_DATA_ADMISSAO", "SEM_PREVISAO_ASO", "PREVISAO_NAO_POSTERIOR"] as const) {
      expect(mensagemBloqueioLiberacao(m, e)).not.toContain("—");
    }
  });
});
