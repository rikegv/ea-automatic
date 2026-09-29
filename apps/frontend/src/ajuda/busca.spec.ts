import { describe, it, expect } from "vitest";
import { buscar, indexar, normalizar, realcar, trechoDoResultado } from "./busca";
import { ARTIGOS, artigosDaRota } from "./registro";

/**
 * O QUE ESTE ARQUIVO COBRE, e por que ele não repete o do `tester`.
 *
 * A régua da busca (normalização, sinônimo, E lógico, ranking, prefixo de palavra) está travada em
 * `busca.tester.spec.ts`, escrito contra o REQUISITO por quem não escreveu o código (§A.38). Aqui
 * fica o que é da camada da tela: o índice montado a partir dos artigos REAIS, o trecho que aparece
 * embaixo do título no resultado, e a resolução de quem ensina cada rota, que é o que acende ou
 * apaga o botão de ajuda.
 */

const indice = indexar(ARTIGOS);
const slugs = (consulta: string) => buscar(consulta, indice).map((r) => r.artigo.slug);

describe("o índice montado a partir dos artigos reais", () => {
  it("acha o artigo do exame pelo sinônimo que a pessoa digita, sem acento", () => {
    expect(slugs("atestado")).toContain("anexar-o-aso-no-exame");
    expect(slugs("clinica")).toContain("anexar-o-aso-no-exame");
    expect(slugs("exame medico")).toContain("anexar-o-aso-no-exame");
  });

  it("acha o artigo de catálogo por uma palavra acentuada digitada sem acento", () => {
    expect(slugs("declinio")).toContain("manter-um-catalogo-do-sistema");
  });

  it("acha pelo texto do passo a passo", () => {
    expect(slugs("rascunho")).toContain("abrir-uma-vaga-nova");
  });

  it("acha pelo corpo, que aqui é o que fazer quando dá errado", () => {
    expect(slugs("excluir")).toContain("manter-um-catalogo-do-sistema");
  });

  it("todos os termos precisam bater, então palavra de outro assunto zera o resultado", () => {
    expect(slugs("aso")).not.toEqual([]);
    expect(slugs("aso tarifa")).toEqual([]);
  });
});

describe("o trecho que aparece no resultado", () => {
  const artigo = ARTIGOS.find((a) => a.slug === "abrir-uma-vaga-nova")!;

  it("usa o resumo quando é ele que fala do que foi procurado", () => {
    expect(trechoDoResultado(artigo, ["vaga"])).toBe(artigo.resumo);
  });

  it("usa o passo que bateu quando o resumo não fala daquilo", () => {
    expect(trechoDoResultado(artigo, ["banco"])).toContain("posições");
  });

  /**
   * O TRECHO TEM DE CONTER A PALAVRA PROCURADA, e é isso que o resultado do diretor não tinha:
   * procurar "auditoria" devolvia título e frase de ASO, sem a palavra em nenhum dos dois. Frase que
   * não tem o que a pessoa digitou não explica por que aquele resultado apareceu.
   */
  it("usa a regra ou o detalhe que bateu quando o casamento vem do contexto", () => {
    const aso = ARTIGOS.find((a) => a.slug === "anexar-o-aso-no-exame")!;
    expect(normalizar(trechoDoResultado(aso, ["auditoria"]))).toContain("auditoria");
  });
});

/**
 * ─ MENÇÃO INCIDENTAL: O DEFEITO QUE O DIRETOR ACHOU TESTANDO ───────────────────────────────────
 *
 * Procurar "auditoria" devolvia o artigo do ASO como se ele ensinasse auditoria. A palavra está lá,
 * no detalhe de um passo e em duas regras, e a busca não errou em ACHAR: errou em não dizer que
 * aquilo é citação. Menção apresentada como resposta é pior que "nada encontrado", que pelo menos
 * dizia a verdade.
 */
describe("menção incidental, o casamento que vem só do contexto", () => {
  const achar = (consulta: string, slug: string) =>
    buscar(consulta, indice).find((r) => r.artigo.slug === slug)!;

  it("marca como menção o artigo que só CITA o que foi procurado", () => {
    const r = achar("auditoria", "anexar-o-aso-no-exame");
    expect(r).toBeTruthy();
    expect(r.mencaoIncidental).toBe(true);
  });

  it("não marca como menção quem ensina o assunto, achado por título, sinônimo ou gesto", () => {
    expect(achar("aso", "anexar-o-aso-no-exame").mencaoIncidental).toBe(false);
    expect(achar("atestado", "anexar-o-aso-no-exame").mencaoIncidental).toBe(false);
    expect(achar("vaga", "abrir-uma-vaga-nova").mencaoIncidental).toBe(false);
  });

  /** Uma palavra só mencionada basta: metade da pergunta respondida não é resposta. */
  it("é menção quando UMA das palavras da consulta só é citada", () => {
    const r = achar("auditoria exame", "anexar-o-aso-no-exame");
    expect(r.mencaoIncidental).toBe(true);
    // E a frase mostrada é a da palavra CITADA, não a da palavra ensinada.
    expect(normalizar(r.trecho)).toContain("auditoria");
  });

  /**
   * A ORDENAÇÃO POR PONTOS SEGUE INTACTA. A separação é da tela; a menção não ganha nem perde ponto,
   * senão passariam a existir duas réguas de relevância, com dois números para manter em acordo.
   */
  it("não muda a pontuação de nada, nem a ordem por pontos", () => {
    const r = buscar("exame", indice);
    for (let i = 1; i < r.length; i += 1)
      expect(r[i - 1].pontos).toBeGreaterThanOrEqual(r[i].pontos);
    // A menção pontua pelo campo em que ela foi achada, e não por ser menção: nada é somado nem
    // descontado. O peso é o do campo (aqui, contexto de artigo), sempre abaixo do de um título.
    const mencao = achar("auditoria", "anexar-o-aso-no-exame");
    expect(mencao.pontos).toBeGreaterThan(0);
    expect(mencao.pontos).toBeLessThan(buscar("aso", indice)[0].pontos);
  });
});

describe("realce", () => {
  it("grifa o pedaço certo mesmo quando o texto tem acento", () => {
    const pedacos = realcar("Motivos De Declínio", ["declinio"]);
    expect(pedacos.filter((p) => p.forte).map((p) => p.texto)).toEqual(["Declínio"]);
    expect(pedacos.map((p) => p.texto).join("")).toBe("Motivos De Declínio");
  });

  it("não grifa o miolo da palavra, pela mesma régua da busca", () => {
    expect(realcar("Anexar O ASO", ["so"])).toEqual([{ texto: "Anexar O ASO", forte: false }]);
  });

  it("sem termo, devolve o texto inteiro sem grifo", () => {
    expect(realcar("Qualquer Coisa", [])).toEqual([{ texto: "Qualquer Coisa", forte: false }]);
  });
});

/**
 * ─ O QUE SE AFIRMA AQUI É PROPRIEDADE, NUNCA CONTAGEM ──────────────────────────────────────────
 *
 * ┌─ A LIÇÃO, E ELA VAI SE REPETIR 182 VEZES ────────────────────────────────────────────────────┐
 * │ O inventário aprovado é de 196 peças, e elas pousam EM ONDAS. Asserção que fixa o NÚMERO de     │
 * │ artigos, ou que usa uma rota concreta como exemplo de "tela ainda não coberta", QUEBRA em cada   │
 * │ onda. E o jeito como ela quebra é o problema: a sessão seguinte afrouxa o teste para o número     │
 * │ novo, a onda depois afrouxa de novo, e o teste deixa de medir qualquer coisa.                    │
 * │                                                                                               │
 * │ Aconteceu na Fase 1: estas afirmações diziam "só existe o artigo do ASO na Esteira" e usavam o   │
 * │ `/gerenciador` como exemplo de tela sem artigo. Os padrões novos (card de indicador, exportar,   │
 * │ ler a linha, virar a página) ancoraram justamente no Gerenciador, e a Esteira passou de 1 para   │
 * │ 11 artigos.                                                                                    │
 * │                                                                                               │
 * │ O QUE SE AFIRMA: que a rota RESOLVE para o artigo que ensina aquela tela (contém), que rota      │
 * │ vizinha de nome parecido NÃO herda, e que rota sem nenhum artigo devolve vazio. Quanto o manual   │
 * │ tem é assunto do inventário, não do teste.                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("quem ensina esta tela", () => {
  it("casa a rota exata", () => {
    expect(artigosDaRota("/esteira").map((a) => a.slug)).toContain("anexar-o-aso-no-exame");
    expect(artigosDaRota("/as/vagas").map((a) => a.slug)).toContain("abrir-uma-vaga-nova");
  });

  it("não empresta o artigo de uma tela para a vizinha de nome parecido", () => {
    expect(artigosDaRota("/as/vagas-pendentes-revisao")).toEqual([]);
  });

  /**
   * A ROTA ESCOLHIDA É UMA QUE NEM O MOTOR ALCANÇA HOJE, para o exemplo não virar dívida na próxima
   * onda. Quando um artigo ancorar aqui, troque a rota, não a afirmação.
   */
  it("tela sem artigo devolve lista vazia, e é isso que esconde o botão", () => {
    expect(artigosDaRota("/admin/menu-areas")).toEqual([]);
  });
});
