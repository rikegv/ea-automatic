/**
 * ─ A BUSCA DA CENTRAL DE AJUDA, SEM IA (§2.2 do DESENHO-CENTRAL-DE-AJUDA) ───────────────────────
 *
 * ESCRITO PELO `tester`, e NÃO por quem escreveu `busca.ts` (§A.38). A primeira versão deste
 * arquivo nasceu contra o REQUISITO, antes de o módulo existir (§A.40); quando o `frontend` entregou
 * a implementação, ele foi reapontado para a API real. O que NÃO mudou foi a lista do que se mede:
 * ela veio do requisito, e não do código, que é o ponto inteiro de o teste não ser do autor.
 *
 * ┌─ A BUSCA É O QUE DECIDE SE O MANUAL EXISTE ──────────────────────────────────────────────────┐
 * │ Ninguém navega por sumário quando está travado no meio de um cadastro: digita a palavra que   │
 * │ tem na cabeça e espera a resposta. Se a busca só responde ao vocabulário da TELA, o manual     │
 * │ vira um índice que só quem escreveu consegue usar, e é aí que a maioria dos manuais internos  │
 * │ morre (§2.2). Por isso o caso central deste arquivo não é "acha pelo título": é ACHA PELO      │
 * │ SINÔNIMO que a pessoa digita e que não está no título.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from "vitest";
import { buscar, indexar, normalizar, realcar, termosDaConsulta } from "./busca";
import type { Artigo } from "./tipos";

// ── ARTIGOS DE TESTE: realistas, e independentes do conteúdo que a fábrica está escrevendo ──────
// Medir a busca contra o registro real tornaria o teste refém do texto do artigo 85.
function artigo(over: Partial<Artigo> & Pick<Artigo, "slug" | "titulo">): Artigo {
  return {
    modulo: "SOUL_ADM",
    // O CAMINHO PRINCIPAL é o padrão da fixture de propósito: o artigo de recurso secundário (`N2`)
    // é a exceção que cada teste declara quando ela é o assunto, e não um padrão herdado sem querer.
    nivel: "N1",
    rotas: ["/esteira"],
    menus: ["esteira"],
    publico: "OPERACAO",
    resumo: "",
    termos: [],
    preRequisitos: [],
    passos: [],
    seDerErrado: [],
    regras: [],
    relacionados: [],
    fontes: ["apps/frontend/src/app/(app)/esteira/page.tsx"],
    revisadoEm: "2026-09-27",
    ...over,
  };
}

const ASO = artigo({
  slug: "anexar-o-aso",
  titulo: "Anexar O ASO Na Aba Exame",
  resumo: "Como subir o atestado de saúde ocupacional e marcar o candidato como apto.",
  termos: ["aso", "atestado", "exame médico", "médico", "clínica", "apto"],
  passos: [
    { gesto: "Abra a aba Exame" },
    { gesto: "Clique em Anexar Documento" },
    { gesto: "Selecione o arquivo do ASO" },
  ],
  regras: ["O Exame é independente da Auditoria, então anexar o ASO não fecha a Auditoria."],
});

const DECLINIO = artigo({
  slug: "declinar-com-motivo",
  titulo: "Declinar Uma Admissão Com Motivo",
  resumo: "Registre a desistência do candidato e o motivo, e entenda o que sai da fila.",
  termos: ["declinou", "desistiu", "demissao", "demitir", "cancelar", "rescisao", "recusou"],
  passos: [{ gesto: "Abra a ficha da admissão" }, { gesto: "Clique em Declinar" }],
  regras: ["Declínio não conta como pendência em card nenhum, e segue visível no Gerenciador."],
});

const LIBERACAO = artigo({
  slug: "liberar-da-fila",
  titulo: "Liberar Uma Admissão Da Fila",
  resumo: "Confira os dados obrigatórios e libere o candidato para a esteira.",
  termos: ["liberar", "aprovar", "fila de liberação"],
  rotas: ["/liberacao"],
  passos: [{ gesto: "Abra Liberação Admissional" }, { gesto: "Confira o exame médico exigido" }],
  seDerErrado: [{ sintoma: "O botão está apagado", acao: "Confira se a admissão já foi recusada" }],
});

const INDICE = indexar([ASO, DECLINIO, LIBERACAO]);

const slugs = (q: string, idx = INDICE) => buscar(q, idx).map((r) => r.artigo.slug);

describe("normalizar: acento e caixa saem dos DOIS lados", () => {
  /**
   * NORMALIZAR SÓ A CONSULTA É O ERRO CLÁSSICO, e ele passa desapercebido porque metade dos testes
   * continua verde: quem digita "liberacao" não acha "Liberação", mas quem digita "liberação" acha.
   * O defeito só aparece com quem não tem o hábito de acentuar, que é a maioria de quem digita com
   * pressa.
   */
  it("derruba acento e caixa", () => {
    expect(normalizar("Demissão")).toBe(normalizar("demissao"));
    expect(normalizar("LIBERAÇÃO")).toBe(normalizar("liberacao"));
    expect(normalizar("Exame Médico")).toBe(normalizar("exame medico"));
    expect(normalizar("Não Conformidades")).toBe(normalizar("nao conformidades"));
  });

  it("é idempotente: normalizar o já normalizado não muda nada", () => {
    const uma = normalizar("Admissão Concluída");
    expect(normalizar(uma)).toBe(uma);
  });

  it("o ç não vira vazio nem quebra a palavra", () => {
    expect(normalizar("Liberação")).toContain("liberac");
  });

  it("a consulta vira termos limpos, sem vazio e sem espaço sobrando", () => {
    expect(termosDaConsulta("  Exame   Médico  ")).toEqual(["exame", "medico"]);
    expect(termosDaConsulta("   ")).toEqual([]);
  });
});

describe("buscar: onde ela procura", () => {
  it("acha pelo título, sem acento e em qualquer caixa", () => {
    expect(slugs("aso")).toContain("anexar-o-aso");
    expect(slugs("EXAME")).toContain("anexar-o-aso");
    expect(slugs("admissao")).toContain("declinar-com-motivo");
  });

  it("acha pelo resumo", () => {
    expect(slugs("desistencia")).toContain("declinar-com-motivo");
    expect(slugs("obrigatorios")).toContain("liberar-da-fila");
  });

  it("acha pelo texto dos passos", () => {
    expect(slugs("anexar documento")).toContain("anexar-o-aso");
  });

  it("acha pelo `Se Der Errado` e pelas regras, que é onde o time procura quando travou", () => {
    expect(slugs("botao apagado")).toContain("liberar-da-fila");
    expect(slugs("gerenciador")).toContain("declinar-com-motivo");
  });

  /**
   * ─ O CASO QUE DECIDE A UTILIDADE DA BUSCA ────────────────────────────────────────────────────
   *
   * Nenhuma destas palavras está no título nem no resumo. Elas estão em `termos`, que é a lista do
   * que a PESSOA digita, e não do que a TELA escreve. Quem procura o ASO digita "atestado" ou
   * "médico"; quem quer declinar digita "desistiu" ou "demissão", que nem é o termo certo do
   * domínio. Sem sinônimo, busca por texto vira busca por sorte.
   */
  it("ACHA PELO SINÔNIMO que a pessoa digita, e não só pelo vocabulário da tela", () => {
    expect(slugs("atestado")).toContain("anexar-o-aso");
    expect(slugs("clinica")).toContain("anexar-o-aso");
    expect(slugs("demissao")).toContain("declinar-com-motivo");
    expect(slugs("desistiu")).toContain("declinar-com-motivo");
    expect(slugs("recusou")).toContain("declinar-com-motivo");
  });

  it("todos os termos da consulta precisam bater (AND, não OR)", () => {
    // "exame" existe em dois artigos; "apto" só no do ASO.
    expect(slugs("exame apto")).toEqual(["anexar-o-aso"]);
    // Nenhum artigo tem as duas: resultado vazio, e não a união.
    expect(slugs("aso rescisao")).toEqual([]);
  });

  it("consulta sem resultado devolve lista vazia, não o índice inteiro", () => {
    expect(buscar("clicksign", INDICE)).toEqual([]);
    expect(buscar("zzzz", INDICE)).toEqual([]);
  });

  it("consulta vazia ou só espaço não devolve resultado (a tela mostra o sumário)", () => {
    expect(buscar("", INDICE)).toEqual([]);
    expect(buscar("   ", INDICE)).toEqual([]);
  });

  /**
   * CASAR POR PREFIXO É O QUE FAZ A BUSCA RESPONDER ENQUANTO A PESSOA DIGITA. Sem isso, o resultado
   * só aparece na última letra, e a tela parece quebrada no meio da palavra.
   */
  it("acha com a palavra pela metade, para a busca responder enquanto a pessoa digita", () => {
    expect(slugs("libera")).toContain("liberar-da-fila");
    expect(slugs("atest")).toContain("anexar-o-aso");
  });
});

describe("buscar: o ranking, do campo mais forte para o mais fraco", () => {
  /**
   * A ORDEM É TÍTULO, SINÔNIMO, RESUMO, CORPO. Ela importa porque a primeira linha do resultado é a
   * única que a maioria clica: uma palavra que aparece de passagem no corpo de um artigo longo não
   * pode ficar acima do artigo que tem aquela palavra no título.
   */
  it("título vence resumo", () => {
    const noTitulo = artigo({
      slug: "no-titulo",
      titulo: "Matrícula Do Cadastro",
      resumo: "Grave o código do cadastro.",
    });
    const noResumo = artigo({
      slug: "no-resumo",
      titulo: "Mudar O Status Do Cadastro",
      resumo: "Ao concluir, grave a matrícula.",
    });
    expect(slugs("matricula", indexar([noResumo, noTitulo]))).toEqual(["no-titulo", "no-resumo"]);
  });

  it("sinônimo vence resumo, porque sinônimo é a pergunta e resumo é a descrição", () => {
    const noTermo = artigo({ slug: "no-termo", titulo: "Anexar O Exame", termos: ["atestado"] });
    const noResumo = artigo({
      slug: "no-resumo",
      titulo: "Conferir A Régua",
      resumo: "Confira se o atestado já foi entregue.",
    });
    expect(slugs("atestado", indexar([noResumo, noTermo]))).toEqual(["no-termo", "no-resumo"]);
  });

  it("resumo vence corpo", () => {
    const noResumo = artigo({
      slug: "no-resumo",
      titulo: "Concluir O Cadastro",
      resumo: "Grave a matrícula e conclua.",
    });
    const noCorpo = artigo({
      slug: "no-corpo",
      titulo: "Importar Planilha",
      resumo: "Suba o arquivo.",
      passos: [{ gesto: "Confira a coluna de matrícula da planilha" }],
    });
    expect(slugs("matricula", indexar([noCorpo, noResumo]))).toEqual(["no-resumo", "no-corpo"]);
  });

  it("o resultado sai ordenado por pontuação decrescente, sempre", () => {
    const r = buscar("exame", INDICE);
    expect(r.length).toBeGreaterThan(1);
    for (let i = 1; i < r.length; i += 1) {
      expect(r[i - 1].pontos).toBeGreaterThanOrEqual(r[i].pontos);
    }
  });

  /**
   * EMPATE TEM DE SER ESTÁVEL. Duas digitadas iguais que devolvem a mesma lista em ordens
   * diferentes fazem a pessoa clicar no item errado, e é o tipo de defeito que ninguém reporta
   * porque ninguém acredita no que viu.
   */
  it("empate é resolvido de forma estável, e a lista não dança entre duas chamadas iguais", () => {
    const a = artigo({ slug: "zebra", titulo: "Zebra Do Cadastro", resumo: "matricula" });
    const b = artigo({ slug: "abelha", titulo: "Abelha Do Cadastro", resumo: "matricula" });
    const idx = indexar([a, b]);
    expect(slugs("matricula", idx)).toEqual(slugs("matricula", idx));
    expect(slugs("matricula", idx)).toEqual(["abelha", "zebra"]);
  });
});

describe("buscar: o que não pode acontecer", () => {
  it("não devolve o mesmo artigo duas vezes quando a palavra bate em vários campos", () => {
    // "exame" está no título, no resumo, nos termos e nos passos do artigo do ASO.
    const achados = buscar("exame", INDICE).filter((r) => r.artigo.slug === "anexar-o-aso");
    expect(achados.length).toBe(1);
  });

  /**
   * O RESULTADO PRECISA DIZER POR QUE ACHOU. Achar pelo sinônimo e mostrar uma frase que não tem
   * nada a ver com o que a pessoa digitou parece resultado errado, mesmo estando certo.
   */
  it("todo resultado traz um trecho não vazio para a tela mostrar embaixo do título", () => {
    for (const r of buscar("exame", INDICE)) expect(r.trecho.trim().length).toBeGreaterThan(0);
  });
});

describe("realcar: o grifo do que a pessoa digitou", () => {
  it("grifa o trecho certo mesmo com acento no original", () => {
    const pedacos = realcar("Declínio e pausa", ["declinio"]);
    expect(pedacos.filter((p) => p.forte).map((p) => p.texto)).toEqual(["Declínio"]);
  });

  it("recompõe o texto original, sem perder nem duplicar caractere", () => {
    const texto = "Anexar O ASO Na Aba Exame";
    expect(
      realcar(texto, ["aso", "exame"])
        .map((p) => p.texto)
        .join(""),
    ).toBe(texto);
  });

  it("sem termo, devolve o texto inteiro sem grifo", () => {
    expect(realcar("Qualquer coisa", [])).toEqual([{ texto: "Qualquer coisa", forte: false }]);
  });

  it("grifa TODAS as ocorrências, não só a primeira", () => {
    const fortes = realcar("ASO, o ASO e mais ASO", ["aso"]).filter((p) => p.forte);
    expect(fortes.length).toBe(3);
  });
});

/**
 * ─ `controles`: O RÓTULO EXATO DA TELA, QUE É OUTRA PERGUNTA ─────────────────────────────────────
 *
 * ┌─ POR QUE ESTE CAMPO NÃO É UM SEGUNDO `termos` ───────────────────────────────────────────────┐
 * │ `termos` é escrito pensando em SINÔNIMO: o que a pessoa chama a coisa quando não sabe o nome    │
 * │ dela ("atestado" para o ASO). `controles` é o contrário: é o rótulo LITERAL que está desenhado  │
 * │ na tela, e ele responde a uma pergunta diferente, que é a mais comum de quem está travado com o │
 * │ mouse em cima do botão: "o que faz este botão aqui?". Quem pergunta isso digita o rótulo exato, │
 * │ não um sinônimo, porque ele está lendo a palavra.                                              │
 * │                                                                                               │
 * │ E é justamente o rótulo de PASSO INTERMEDIÁRIO que não estava indexado em lugar nenhum: o botão │
 * │ que o artigo manda clicar no meio do caminho não está no título, não está no resumo e não é     │
 * │ sinônimo de nada. Sem `controles` indexado, o artigo ENSINA aquele controle e não é ACHADO por  │
 * │ ele, que é a pior combinação para quem procura socorro na tela.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("`controles`: achar o artigo pelo RÓTULO LITERAL do controle", () => {
  const AUDITAR = artigo({
    slug: "auditar-um-documento",
    titulo: "Auditar Um Documento Na Régua",
    resumo: "Confira o documento entregue e registre o veredito.",
    termos: ["auditar", "conferir documento"],
    nivel: "N2",
    passos: [
      // "Prontuário" não aparece em NENHUM outro campo deste artigo, de propósito: um rótulo que
      // também esteja no título faria o teste passar sem a busca olhar `controles` uma única vez.
      { gesto: "Abra a régua do candidato", controles: ["Ver Prontuário"] },
      {
        gesto: "Peça a leitura da inteligência artificial",
        controles: ["Analisar Com I.A", "Revalidar"],
      },
      { gesto: "Registre o veredito", controles: ["Validar Por Humano", "Descartar"] },
    ],
  });

  const idx = indexar([AUDITAR, ...[ASO, DECLINIO, LIBERACAO]]);
  const achou = (q: string) => buscar(q, idx).some((r) => r.artigo.slug === "auditar-um-documento");

  it("acha pelo rótulo do controle do primeiro passo", () => {
    expect(achou("Ver Prontuário")).toBe(true);
  });

  /**
   * O CASO QUE DECIDE, e é o do diretor: o rótulo do PASSO INTERMEDIÁRIO. "Revalidar" e "Descartar"
   * não estão no título, não estão no resumo, não estão nos sinônimos e não estão no gesto. Se a
   * busca não olhar `controles`, o artigo que ensina exatamente esse botão não é achado por ele.
   */
  it("acha pelo rótulo de PASSO INTERMEDIÁRIO, que não está em nenhum outro campo", () => {
    expect(achou("Revalidar")).toBe(true);
    expect(achou("Descartar")).toBe(true);
    expect(achou("Validar Por Humano")).toBe(true);
  });

  it("acha sem acento e em qualquer caixa, como todo o resto da busca", () => {
    expect(achou("ver prontuario")).toBe(true);
    expect(achou("REVALIDAR")).toBe(true);
  });

  it("acha com o rótulo pela metade, para responder enquanto a pessoa digita", () => {
    expect(achou("revalid")).toBe(true);
  });

  /**
   * RÓTULO NÃO VIRA CORINGA. "Analisar Com I.A" é dois termos que precisam bater os dois (AND), e um
   * rótulo de outro artigo não passa a achar este.
   */
  it("o rótulo não afrouxa o AND nem acha artigo que não declara o controle", () => {
    expect(achou("analisar ia")).toBe(true);
    expect(achou("Analisar Declinar")).toBe(false);
    expect(buscar("Revalidar", idx).map((r) => r.artigo.slug)).toEqual(["auditar-um-documento"]);
  });
});
