import { describe, expect, it } from "vitest";
import { avisoDeReducaoNaTrilha, metaQueATrilhaGrava } from "./as-vaga-meta";

/**
 * O QUE ESTE TESTE PROTEGE: a SEGUNDA porta da meta, a do formulário da trilha.
 *
 * A auditoria e o tester acharam, cada um por si, que `PATCH /as/vagas/:id` também regrava a meta.
 * O backend passou a REGISTRAR a redução vinda por ali, e um registro sem aviso é exatamente o que
 * o diretor pediu para não existir: a pessoa reduz, fica rastreado, e ninguém disse a ela.
 *
 * O CASO QUE ERRA CALADO É O CAMPO VAZIO. O formulário manda `undefined` quando o campo está em
 * branco, e o servidor PRESERVA a meta oficial nesse caso. Um adaptador que lesse o ausente como
 * zero abriria o diálogo dizendo "a meta oficial cai de 3 para 0" para quem não tocou no campo, e
 * um aviso que mente uma vez deixa de ser lido nas outras.
 */

describe("metaQueATrilhaGrava (espelho do servidor, e a assimetria entre os dois lados)", () => {
  it("oficial AUSENTE preserva o número gravado: campo vazio é 'não mexi na meta'", () => {
    expect(metaQueATrilhaGrava({ oficiais: 3, banco: 2 }, { banco: 2 })).toEqual({
      oficiais: 3,
      banco: 2,
    });
  });

  it("banco AUSENTE vale zero, porque 'sem banco' é resposta e não lacuna", () => {
    expect(metaQueATrilhaGrava({ oficiais: 3, banco: 4 }, { oficiais: 3 })).toEqual({
      oficiais: 3,
      banco: 0,
    });
  });

  it("com os dois números no corpo, é o corpo que manda", () => {
    expect(metaQueATrilhaGrava({ oficiais: 5, banco: 3 }, { oficiais: 2, banco: 1 })).toEqual({
      oficiais: 2,
      banco: 1,
    });
  });

  it("rascunho SEM meta oficial e corpo sem o campo continua sem meta oficial", () => {
    expect(metaQueATrilhaGrava({ oficiais: null, banco: 0 }, {})).toEqual({
      oficiais: null,
      banco: 0,
    });
  });
});

describe("avisoDeReducaoNaTrilha (quando a trilha avisa, e quando calar é o certo)", () => {
  it("NÃO avisa na vaga nova, porque o primeiro preenchimento define a meta, não a reduz", () => {
    expect(avisoDeReducaoNaTrilha(null, { oficiais: 1, banco: 0 })).toBeNull();
  });

  it("NÃO avisa quando o campo do oficial está vazio: ausente preserva, não zera", () => {
    expect(avisoDeReducaoNaTrilha({ oficiais: 4, banco: 0 }, { banco: 0 })).toBeNull();
  });

  it("avisa quando o oficial cai, e a frase diz o de/para concreto", () => {
    const aviso = avisoDeReducaoNaTrilha({ oficiais: 5, banco: 0 }, { oficiais: 1, banco: 0 });
    expect(aviso).toContain("A meta oficial cai de 5 para 1.");
    expect(aviso).toContain("fica registrada na vaga");
  });

  it("avisa com a SOMA intacta, que é o contorno que a auditoria achou", () => {
    // 5 + 0 = 5 e 1 + 4 = 5: o gate do fechamento lê só o oficial.
    const aviso = avisoDeReducaoNaTrilha({ oficiais: 5, banco: 0 }, { oficiais: 1, banco: 4 });
    expect(aviso).toContain("A meta oficial cai de 5 para 1.");
    expect(aviso).not.toContain("banco");
  });

  it("avisa quando APAGAR o campo do banco derruba a meta de banco a zero", () => {
    const aviso = avisoDeReducaoNaTrilha({ oficiais: 3, banco: 4 }, { oficiais: 3 });
    expect(aviso).toContain("A meta de banco cai de 4 para 0.");
  });

  it("NÃO avisa no aumento, que afasta o fechamento em vez de aproximá-lo", () => {
    expect(avisoDeReducaoNaTrilha({ oficiais: 2, banco: 1 }, { oficiais: 6, banco: 3 })).toBeNull();
  });

  it("NÃO avisa quando nada mudou, que é o caso de quem só editou os outros campos", () => {
    expect(avisoDeReducaoNaTrilha({ oficiais: 3, banco: 2 }, { oficiais: 3, banco: 2 })).toBeNull();
  });

  it("número inválido no campo não inventa redução", () => {
    // A tela manda `Number("") > 0 ? ... : undefined`, então o lixo chega como `undefined` ou NaN,
    // e o servidor recusa pelo DTO. O que não pode é a tela avisar de uma redução que não existe.
    expect(avisoDeReducaoNaTrilha({ oficiais: 3, banco: 2 }, { oficiais: NaN, banco: NaN })).toBe(
      null,
    );
  });
});
