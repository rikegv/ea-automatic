import { describe, expect, it } from "vitest";
import { FAROL_GLOBAL } from "@ea/shared-types";
import { deriveFarolGlobal } from "../domain/admissao";
import { STATUS_CONCLUI, conclui } from "../domain/esteira";

/**
 * ONDA 3 da frente INTEGRAÇÃO: o desfecho e o farol automático.
 *
 * A REGRA QUE ESTES TESTES PROTEGEM: `ADMISSAO_CONCLUIDA` é gravado na PRÓPRIA TRANSIÇÃO para
 * `REALIZADO`, e NÃO virou um estado derivável pelo `deriveFarolGlobal`. A distinção é o coração da
 * decisão do diretor: `ADMISSAO_CONCLUIDA` mora em `FAROL_MANUAL`, e torná-lo derivável mudaria o
 * comportamento de TODA admissão do sistema, inclusive das 1.511 já concluídas, num recálculo
 * qualquer (editar a admissão, mudar uma frente, rodar a auditoria).
 *
 * O outro lado da mesma moeda, e o motivo de a escrita pontual ser SEGURA: como os três faróis de
 * desfecho estão em `FAROL_MANUAL`, o `recomputeFarolGlobal` que roda logo depois da transação os
 * PRESERVA por construção, em vez de desfazer o que a transição acabou de gravar.
 */

describe("o farol automático da Integração não vazou para a derivação", () => {
  it("o derive NÃO produz ADMISSAO_CONCLUIDA sozinho, em nenhuma combinação", () => {
    const combinacoes = [
      { auditoriaConcluida: true, exameApto: true, temDataAdmissao: true },
      { auditoriaConcluida: true, exameApto: true, temDataAdmissao: false },
      { auditoriaConcluida: true, exameApto: false, temDataAdmissao: true },
      { auditoriaConcluida: false, exameApto: false, temDataAdmissao: false },
    ];
    for (const c of combinacoes) {
      expect(deriveFarolGlobal({ atual: "EM_ADMISSAO", ...c })).not.toBe("ADMISSAO_CONCLUIDA");
    }
  });

  it("o derive PRESERVA os três desfechos que a transição grava (não desfaz a escrita pontual)", () => {
    for (const farol of ["ADMISSAO_CONCLUIDA", "DECLINOU", "RESCISAO"] as const) {
      expect(
        deriveFarolGlobal({
          atual: farol,
          auditoriaConcluida: true,
          exameApto: true,
          temDataAdmissao: false,
        }),
      ).toBe(farol);
    }
  });

  it("os três desfechos são faróis que JÁ existiam: nada de CANCELADA nem farol novo", () => {
    for (const farol of ["ADMISSAO_CONCLUIDA", "DECLINOU", "RESCISAO"]) {
      expect(FAROL_GLOBAL).toContain(farol);
    }
    expect(FAROL_GLOBAL).not.toContain("CANCELADA");
  });

  it("só REALIZADO conclui a frente, então só ele tira a admissão da fila", () => {
    expect(STATUS_CONCLUI.INTEGRACAO).toBe("REALIZADO");
    expect(conclui("INTEGRACAO", "REALIZADO")).toBe(true);
    // Declínio e rescisão encerram o processo pelo FAROL, mas não falseiam êxito na frente, que é o
    // mesmo critério das outras frentes (§A.16 Regra 2 mantém `concluida = false`).
    expect(conclui("INTEGRACAO", "DECLINOU")).toBe(false);
    expect(conclui("INTEGRACAO", "RESCISAO")).toBe(false);
  });
});
