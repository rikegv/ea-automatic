import { describe, expect, it } from "vitest";
import { deriveFarolGlobal } from "./admissao";

/**
 * BANCO, AGUARDAR: a marcação do usuário manda (bug de 13/08/2026).
 *
 * O DEFEITO: o diretor punha a admissão em "Banco, Aguardar" e o status voltava sozinho para "Em
 * Admissão" na Esteira e no Gerenciador. A causa era esta função: `BANCO_AGUARDAR` não é farol
 * manual, então o recompute que roda logo depois de gravar recalculava pela regra automática
 * (auditoria ok E exame apto E sem data) e, não batendo os três, devolvia `EM_ADMISSAO`.
 *
 * O QUE ESTES TESTES TRAVAM:
 *  1. Marcada como banco, o farol é BANCO_AGUARDAR e o recompute NÃO desfaz. É a correção.
 *  2. A regra automática do §A.3 continua valendo para quem não está marcado.
 *  3. Os faróis MANUAIS continuam mandando em tudo, inclusive na marca de banco: declínio é desfecho.
 */

const base = { auditoriaConcluida: false, exameApto: false, temDataAdmissao: false };

describe("a marcação de banco manda", () => {
  it("marcada, o farol é BANCO_AGUARDAR mesmo sem auditoria e exame prontos", () => {
    expect(deriveFarolGlobal({ atual: "EM_ADMISSAO", isBanco: true, ...base })).toBe(
      "BANCO_AGUARDAR",
    );
  });

  /** O caso EXATO do bug: o recompute rodando logo depois da gravação não pode desfazer a escolha. */
  it("marcada e COM data de admissão, o recompute não devolve EM_ADMISSAO", () => {
    expect(
      deriveFarolGlobal({
        atual: "BANCO_AGUARDAR",
        isBanco: true,
        auditoriaConcluida: true,
        exameApto: true,
        temDataAdmissao: true,
      }),
    ).toBe("BANCO_AGUARDAR");
  });

  it("desmarcada, a admissão volta ao fluxo normal", () => {
    expect(
      deriveFarolGlobal({ atual: "BANCO_AGUARDAR", isBanco: false, ...base, temDataAdmissao: true }),
    ).toBe("EM_ADMISSAO");
  });
});

describe("a regra automática do §A.3 continua de pé", () => {
  it("auditoria ok, exame apto e sem data ainda deriva BANCO_AGUARDAR", () => {
    expect(
      deriveFarolGlobal({
        atual: "EM_ADMISSAO",
        auditoriaConcluida: true,
        exameApto: true,
        temDataAdmissao: false,
      }),
    ).toBe("BANCO_AGUARDAR");
  });

  it("ao preencher a data, quem NÃO é banco volta a EM_ADMISSAO", () => {
    expect(
      deriveFarolGlobal({
        atual: "BANCO_AGUARDAR",
        auditoriaConcluida: true,
        exameApto: true,
        temDataAdmissao: true,
      }),
    ).toBe("EM_ADMISSAO");
  });
});

describe("os faróis manuais continuam acima de tudo", () => {
  it.each(["DECLINOU", "RESCISAO", "ADMISSAO_CONCLUIDA", "AGUARDANDO_LIBERACAO"] as const)(
    "%s não é sobrescrito nem pela marca de banco",
    (farol) => {
      expect(deriveFarolGlobal({ atual: farol, isBanco: true, ...base })).toBe(farol);
    },
  );
});
