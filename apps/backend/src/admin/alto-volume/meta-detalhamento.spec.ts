import { describe, expect, it } from "vitest";
import {
  conferirDistribuicao,
  distribuidoPorLoja,
  ehCotaDeLoja,
  metaDoCargo,
  totalDistribuido,
} from "./meta-detalhamento";

/**
 * A REGRA A (decisão do diretor, 02/09/2026): o cargo tem um total FIXO e as lojas repartem esse
 * total, somando EXATAMENTE ele.
 *
 * O QUE ESTES TESTES PROTEGEM, e vale mais do que parece: a meta do cargo alimenta o cilindro, o
 * termômetro e o percentual do topo. Uma meta somada duas vezes não erra uma célula, erra a leitura
 * inteira do projeto, e semanas depois, numa reunião.
 */

const geral = (quantidade: number) => ({ lojaId: null, quantidade });
const cota = (quantidade: number) => ({ lojaId: "loja-1", quantidade });

describe("metaDoCargo: soma SÓ as linhas sem loja", () => {
  it("cargo com meta única devolve ela", () => {
    expect(metaDoCargo([geral(20)])).toBe(20);
  });

  it("NÃO soma as cotas de loja junto, que é o que impediria a meta de inflar", () => {
    // Com a regra A a linha geral CONVIVE com as cotas. Somar as duas daria 40 num cargo de 20, e o
    // percentual de todos os quadros mentiria junto. É por isso que este filtro existe.
    expect(metaDoCargo([geral(20), cota(8), cota(7), cota(5)])).toBe(20);
  });

  it("cargo com cotas por GRUPO continua somando entre si, como sempre somou", () => {
    // Cota de grupo tem `lojaId` nulo, então entra na meta. O eixo de turmas não mudou.
    expect(metaDoCargo([{ lojaId: null, quantidade: 12 }, { lojaId: null, quantidade: 8 }])).toBe(20);
  });

  it("cargo sem linha nenhuma tem meta zero, não indefinida", () => {
    expect(metaDoCargo([])).toBe(0);
  });
});

describe("conferirDistribuicao: a soma tem de fechar o total do cargo", () => {
  it("soma EXATA passa", () => {
    expect(conferirDistribuicao(20, [cota(8), cota(7), cota(5)])).toBeNull();
  });

  it("RECUSA quando falta, e diz quanto", () => {
    expect(conferirDistribuicao(20, [cota(10), cota(8)])).toBe("Distribuído 18 de 20, faltam 2.");
  });

  it("RECUSA quando excede, e diz quanto", () => {
    expect(conferirDistribuicao(20, [cota(15), cota(10)])).toBe("Distribuído 25 de 20, excede 5.");
  });

  it("LOJA COM ZERO é válida: significa que ali não se contrata", () => {
    // O diretor pediu isto explicitamente: a loja aparece na distribuição com zero, e as outras
    // cobrem o total. Zero não é lacuna, é decisão.
    expect(conferirDistribuicao(20, [cota(20), cota(0), cota(0)])).toBeNull();
  });

  it("distribuição VAZIA passa: é o desfazer, não uma distribuição errada", () => {
    expect(conferirDistribuicao(20, [])).toBeNull();
  });

  it("RECUSA distribuir num cargo que ainda não tem quantidade cadastrada", () => {
    // Sem total, não há o que repartir, e aceitar criaria cotas soltas que ninguém consegue conferir.
    expect(conferirDistribuicao(0, [cota(5)])).toMatch(/Cadastre a quantidade de vagas do cargo/);
  });

  it("a mensagem sempre mostra os DOIS números, não só que não bate", () => {
    // "Não bate" obrigaria quem distribui a somar na mão para descobrir o que fazer.
    const msg = conferirDistribuicao(30, [cota(9)])!;
    expect(msg).toContain("9");
    expect(msg).toContain("30");
    expect(msg).toContain("faltam 21");
  });
});

describe("apoio", () => {
  it("totalDistribuido soma as cotas", () => {
    expect(totalDistribuido([cota(8), cota(7), cota(0)])).toBe(15);
  });

  it("ehCotaDeLoja e distribuidoPorLoja separam os dois tipos de linha", () => {
    expect(ehCotaDeLoja(cota(1))).toBe(true);
    expect(ehCotaDeLoja(geral(1))).toBe(false);
    expect(distribuidoPorLoja([geral(20), cota(20)])).toBe(true);
    expect(distribuidoPorLoja([geral(20)])).toBe(false);
  });
});

/**
 * A IDENTIDADE QUE A REGRA A CRIA (§A.27), e o motivo de ela precisar de teste próprio.
 *
 * Antes, a meta do cargo ERA a soma das lojas por construção (a linha geral era apagada). Agora as
 * duas são números independentes que a TRAVA obriga a coincidir: o cargo guarda 20, as cotas guardam
 * 8 mais 7 mais 5, e nada no banco impede que divirjam se alguém escrever direto na tabela.
 *
 * Estes testes fixam a única forma em que elas podem existir: iguais, ou sem cota nenhuma.
 */
describe("identidade: meta do cargo é igual à soma distribuída (§A.27)", () => {
  it("depois de uma distribuição aceita, os dois lados dão o mesmo número", () => {
    const linhas = [geral(20), cota(8), cota(7), cota(5)];
    expect(conferirDistribuicao(metaDoCargo(linhas), linhas.filter((l) => l.lojaId))).toBeNull();
    expect(metaDoCargo(linhas)).toBe(20);
    expect(totalDistribuido(linhas.filter((l) => l.lojaId))).toBe(20);
  });

  it("uma divergência é DETECTÁVEL pela mesma função que a trava usa", () => {
    // Se um dia um caminho novo gravar sem passar pela trava, é esta conferência que acusa. O teste
    // existe para que a detecção não dependa de alguém lembrar de somar na mão.
    const divergente = [geral(20), cota(8), cota(7)];
    expect(conferirDistribuicao(metaDoCargo(divergente), divergente.filter((l) => l.lojaId)))
      .toBe("Distribuído 15 de 20, faltam 5.");
  });

  it("cargo sem cota nenhuma é estado válido, e não uma divergência", () => {
    expect(conferirDistribuicao(metaDoCargo([geral(20)]), [])).toBeNull();
  });
});
