import { describe, expect, it } from "vitest";
import { classificarDedupDigai, emailParaDesempateDigai } from "./digai";

/**
 * ─ A REGUA DO DEGRAU 3 DO DEDUP DO DIGAI, EXERCITADA SEM BANCO E SEM NEST ──────────────────────
 *
 * Cobertura do `backend` sobre a funcao que ele construiu. A ORDEM e a COLISAO sao provadas pelo
 * `tester`, em `as/digai/digai-dedup-ordem-das-chaves.tester.spec.ts` e
 * `as/digai/digai-dedup-email-fail-closed.tester.spec.ts`, e nada aqui duplica aquilo: este arquivo
 * cobre so a FORMA do valor, que e o que a funcao decide.
 *
 * §A.6: todo endereco aqui e sintetico, no TLD reservado `.invalido`.
 */
describe("emailParaDesempateDigai: a forma decide se o endereco pode desempatar", () => {
  it("normaliza caixa e borda, e devolve o valor que vai a consulta", () => {
    expect(emailParaDesempateDigai("  Pessoa.Sintetica@Exemplo.Invalido  ")).toBe(
      "pessoa.sintetica@exemplo.invalido",
    );
  });

  it("o endereco ja normalizado atravessa igual", () => {
    expect(emailParaDesempateDigai("pessoa@exemplo.invalido")).toBe("pessoa@exemplo.invalido");
  });

  it("NAO aplica normalizacao agressiva: ponto e `+alias` sao preservados", () => {
    /*
     * Decisao registrada na emenda E-3 do mapa: equivalencia de ponto e remocao de `+alias` sao
     * regra ESPECIFICA do Gmail. Num dominio que trata o endereco literalmente, elas fundiriam
     * pessoas DIFERENTES, e fusao de ficha nao se desfaz. Ganhariam 26 casos e arriscariam o resto.
     */
    expect(emailParaDesempateDigai("a.b+vaga@exemplo.invalido")).toBe("a.b+vaga@exemplo.invalido");
  });

  const LIXO: Array<[string, unknown]> = [
    ["ausente", null],
    ["indefinido", undefined],
    ["numero", 42],
    ["vazio", ""],
    ["so espacos", "   "],
    ["so tabulacao", "\t"],
    ["sem arroba", "pessoa.exemplo.invalido"],
    ["sem dominio", "pessoa@"],
    ["sem parte local", "@exemplo.invalido"],
    ["duas arrobas", "pessoa@@exemplo.invalido"],
    ["dominio sem ponto", "pessoa@exemplo"],
    ["espaco no meio", "pessoa sintetica@exemplo.invalido"],
    ["so a arroba", "@"],
    ["acima do teto de 180, que e o `varchar(180)` da coluna", `${"a".repeat(170)}@exemplo.invalido`],
    ["com `K` KELVIN (U+212A), que `toLowerCase` mapeia para o `k` ASCII", "\u212Aelvin@exemplo.invalido"],
    ["com acento fora do ASCII", "jo\u00e3o@exemplo.invalido"],
    ["com espaco unicode no meio", "pessoa\u00a0sintetica@exemplo.invalido"],
  ];

  for (const [rotulo, valor] of LIXO) {
    it(`${rotulo} NAO desempata, e a resposta e nula`, () => {
      expect(
        emailParaDesempateDigai(valor),
        "fail-closed: o que nao presta nao vira chave, porque casar por lixo funde pessoas diferentes.",
      ).toBeNull();
    });
  }
  it("o endereco de 180 caracteres AINDA desempata: o teto e a coluna, e nao um a menos", () => {
    const endereco = `${"a".repeat(180 - "@exemplo.invalido".length)}@exemplo.invalido`;
    expect(endereco.length).toBe(180);
    expect(emailParaDesempateDigai(endereco)).toBe(endereco);
  });

  it("o `K` KELVIN nao vira `k`: ele NAO normaliza para o endereco de outra pessoa", () => {
    /*
     * A classe de falha: `toLowerCase()` atravessa o alfabeto, e U+212A mapeia para o `k` ASCII.
     * Sem a recusa, `\u212Aelvin@x.y` e `kelvin@x.y` normalizariam para a MESMA chave e o degrau
     * fundiria as duas pessoas. A recusa acontece ANTES do `toLowerCase`, e tem de ser antes:
     * depois dele o caractere ja virou `k` e nao ha mais o que recusar.
     */
    expect("\u212Aelvin@exemplo.invalido".toLowerCase()).toBe("kelvin@exemplo.invalido");
    expect(emailParaDesempateDigai("\u212Aelvin@exemplo.invalido")).toBeNull();
    expect(emailParaDesempateDigai("kelvin@exemplo.invalido")).toBe("kelvin@exemplo.invalido");
  });
});

/**
 * \u2500 A DECISAO PURA DO DEDUP, EXERCITADA DADOS OS TRES RESULTADOS DE CONSULTA \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
 *
 * `classificarDedupDigai` e a regra que `resolverPessoa` (servico) e o harness de medicao
 * (dry-run) consomem, e e por isso que ela e testada ISOLADA: o comportamento de ponta a ponta
 * (efeitos, ordem das consultas, fail-closed da forma do e-mail) ja esta coberto pelos specs de
 * `as/digai`, e este arquivo prova so o MAPEAMENTO dos tres resultados para o desfecho.
 *
 * A CONDICAO DO DIRETOR ORDENA TUDO: na duvida, NAO FUNDE.
 */
const A = { id: "aaaa" } as const;
const B = { id: "bbbb" } as const;
const AMBIGUO = { ambiguo: true } as const;

describe("classificarDedupDigai: os tres resultados viram um desfecho, sem efeito", () => {
  it("DEGRAU 1: identidade casada vence tudo, mesmo com e-mail apontando outra ficha", () => {
    expect(
      classificarDedupDigai({ porIdentidade: A, porDocumento: null, porEmail: B }),
    ).toEqual({ tipo: "CASOU_IDENTIDADE", pessoaId: "aaaa" });
  });

  it("identidade A e CPF B (pessoas diferentes): COLISAO, ancora na identidade", () => {
    expect(
      classificarDedupDigai({ porIdentidade: A, porDocumento: B, porEmail: null }),
    ).toEqual({ tipo: "COLISAO_IDENTIDADE_DOCUMENTO", ancora: "aaaa" });
  });

  it("identidade e documento na MESMA ficha nao e colisao", () => {
    expect(
      classificarDedupDigai({ porIdentidade: A, porDocumento: A, porEmail: null }),
    ).toEqual({ tipo: "CASOU_IDENTIDADE", pessoaId: "aaaa" });
  });

  it("DEGRAU 2: sem identidade, o CPF casa e resolve", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: A, porEmail: null }),
    ).toEqual({ tipo: "CASOU_CPF", pessoaId: "aaaa" });
  });

  it("CPF casou e o e-mail esta AMBIGUO: o CPF decide, o e-mail nao derruba o acerto", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: A, porEmail: AMBIGUO }),
    ).toEqual({ tipo: "CASOU_CPF_COM_EMAIL_AMBIGUO", pessoaId: "aaaa" });
  });

  it("CPF casou A e o e-mail limpo casou B (diferentes): COLISAO, ancora no CPF", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: A, porEmail: B }),
    ).toEqual({ tipo: "COLISAO_CPF_EMAIL", ancora: "aaaa" });
  });

  it("CPF e e-mail apontando a MESMA ficha concordam, e e CASOU_CPF", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: A, porEmail: A }),
    ).toEqual({ tipo: "CASOU_CPF", pessoaId: "aaaa" });
  });

  it("DEGRAU 3: sem identidade e sem CPF casado, o e-mail LIMPO desempata", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: null, porEmail: B }),
    ).toEqual({ tipo: "CASOU_EMAIL_LIMPO", pessoaId: "bbbb" });
  });

  it("e-mail AMBIGUO sem ancora de CPF: ABSTEM, sem resolver ninguem", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: null, porEmail: AMBIGUO }),
    ).toEqual({ tipo: "EMAIL_AMBIGUO_SEM_ANCORA" });
  });

  it("DEGRAU 4: ninguem casa, pessoa nova", () => {
    expect(
      classificarDedupDigai({ porIdentidade: null, porDocumento: null, porEmail: null }),
    ).toEqual({ tipo: "NOVA" });
  });
});
