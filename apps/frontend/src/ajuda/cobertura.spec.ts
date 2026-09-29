/**
 * ─ TESTES DO DETECTOR DE CONTROLE ÓRFÃO ────────────────────────────────────────────────────────
 *
 * Escritos pelo `devops`, que construiu a peça. A revisão independente da cobertura é do `tester`
 * (§A.38): estes testes provam que o detector faz o que EU quis, e é exatamente essa a limitação que
 * a cobertura independente existe para pegar.
 *
 * O que está travado aqui, em ordem de importância:
 *   1. lacuna aparece, e com o rótulo certo;
 *   2. artigo N1 mudo NÃO desaparece do relatório (a régua do `controles` opcional);
 *   3. moldura e padrão não são contados por tela (o recorte que impede o ruído);
 *   4. rótulo com dado de pessoa não entra no relatório (§A.6);
 *   5. a normalização é a MESMA da busca.
 */
import { describe, expect, it } from "vitest";
import { normalizarRotulo } from "./busca";
import {
  COBERTURA_E_FALHA_DURA,
  LIMITES_PADRAO,
  chaveDeControle,
  classificar,
  controlesDeclarados,
  medirCobertura,
  prepararCatalogo,
  reprovaEmModoDuro,
  resumirParaDiretor,
  CHAVE_DE_ROTULO_SO_VALOR,
  ROTULO_SO_VALOR,
  analisarRotulo,
  type TelaEnumerada,
} from "./cobertura";
import type { Artigo, Passo } from "./tipos";

function artigo(parcial: Partial<Artigo> & { slug: string; rotas: string[] }): Artigo {
  return {
    titulo: "Artigo De Prova",
    modulo: "SOUL_ADM",
    menus: [],
    publico: "AMBOS",
    nivel: "N1",
    resumo: "resumo de prova",
    termos: [],
    preRequisitos: [],
    passos: [],
    seDerErrado: [],
    regras: [],
    relacionados: [],
    fontes: [],
    revisadoEm: "2026-09-28",
    ...parcial,
  };
}

function passo(gesto: string, controles?: string[]): Passo {
  return controles ? { gesto, controles } : { gesto };
}

/** Aprova tudo. Onde o gate importa, o teste injeta uma função que recusa. */
const APROVA_TUDO = () => true;

/** Rótulo único SEM dígito: o dígito sai da chave do controle, então "Botao 1" e "Botao 2" colidem. */
function emLetras(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => "abcdefghij"[Number(d)]);
}

describe("a lacuna medida: controle na tela e em artigo nenhum", () => {
  it("acusa o rótulo próprio que o artigo daquela rota não declara", () => {
    const telas: TelaEnumerada[] = [
      {
        rota: "/esteira",
        controles: [
          { rotulo: "Anexar ASO", papel: "button" },
          { rotulo: "Reauditar", papel: "button" },
        ],
      },
    ];
    const r = medirCobertura({
      telas,
      artigos: [artigo({ slug: "aso", rotas: ["/esteira"], passos: [passo("Suba o ASO", ["Anexar ASO"])] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.proprios).toEqual({ total: 2, cobertos: 1 });
    expect(r.telas[0].orfaos).toEqual(["Reauditar"]);
    expect(r.cobertura.percentual).toBe(50);
  });

  it("casa o rótulo da tela com o do artigo pela normalização da BUSCA, não por igualdade crua", () => {
    // "Analisar Com I.A" na tela e "analisar com i.a." no artigo são o MESMO botão. Se o detector
    // usasse a própria normalização, ela divergiria da busca e o sintoma seria o pior possível: a
    // busca acha o artigo pelo rótulo e o detector acusa o mesmo rótulo como lacuna.
    const r = medirCobertura({
      telas: [{ rota: "/x", controles: [{ rotulo: "  Analisar Com I.A ", papel: "button" }] }],
      artigos: [artigo({ slug: "a", rotas: ["/x"], passos: [passo("g", ["analisar com i.a."])] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.telas[0].orfaos).toEqual([]);
    expect(normalizarRotulo("Analisar Com I.A")).toBe("analisar com ia");
    expect(normalizarRotulo("analisar com i.a.")).toBe("analisar com ia");
  });

  it("a tela sem artigo nenhum entra no denominador, não desaparece", () => {
    const r = medirCobertura({
      telas: [{ rota: "/sem-manual", controles: [{ rotulo: "Publicar", papel: "button" }] }],
      artigos: [],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.rotasSemArtigo).toEqual(["/sem-manual"]);
    expect(r.telas[0].situacao).toBe("SEM_ARTIGO");
    expect(r.cobertura).toEqual({ total: 1, cobertos: 0, percentual: 0 });
  });
});

/*
 * ─ A RÉGUA DO `controles` OPCIONAL ──────────────────────────────────────────────────────────────
 *
 * O furo que o `tester` apontou: campo opcional faz o artigo mudo ficar INVISÍVEL, e num detector que
 * só olhasse quem declarou algo o artigo mudo ainda MELHORARIA o número, porque tiraria do
 * denominador a única tela que ninguém documentou. Os dois testes abaixo são a prova de que não.
 */
describe("artigo N1 que não nomeia controle: a lacuna aparece, e com o motivo", () => {
  it("N1 mudo é reportado por nome, e a tela dele é marcada N1_MUDO com 0%", () => {
    const r = medirCobertura({
      telas: [
        { rota: "/gerenciador", controles: [{ rotulo: "Editar", papel: "button" }, { rotulo: "Excluir", papel: "button" }] },
      ],
      artigos: [artigo({ slug: "usar-o-gerenciador", rotas: ["/gerenciador"], passos: [passo("Abra a tela")] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.artigosN1Mudos).toEqual([{ slug: "usar-o-gerenciador", rotas: ["/gerenciador"] }]);
    expect(r.telas[0].situacao).toBe("N1_MUDO");
    expect(r.telas[0].propriosCobertos).toBe(0);
    expect(r.telas[0].propriosTotal).toBe(2);
    // E o resumo DIZ o porquê: "0% numa tela que tem artigo" sem explicação faz quem lê concluir
    // que o detector errou, em vez de mandar consertar o artigo.
    expect(resumirParaDiretor(r)).toContain("usar-o-gerenciador");
  });

  it("N2 pode declarar pouco ou nada, e isso NÃO é defeito", () => {
    const r = medirCobertura({
      telas: [{ rota: "/esteira", controles: [{ rotulo: "Reabrir Pendência", papel: "button" }] }],
      artigos: [
        artigo({
          slug: "n1-completo",
          rotas: ["/esteira"],
          passos: [passo("g", ["Reabrir Pendência"])],
        }),
        artigo({ slug: "n2-magro", rotas: ["/esteira"], nivel: "N2", passos: [passo("g")] }),
      ],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.artigosN1Mudos).toEqual([]);
    expect(r.telas[0].situacao).toBe("MEDIDA");
    expect(r.cobertura.percentual).toBe(100);
  });

  it("artigo mudo nunca melhora o número, porque a unidade de conta é a TELA", () => {
    const telas: TelaEnumerada[] = [
      { rota: "/a", controles: [{ rotulo: "Aprovar", papel: "button" }] },
      { rota: "/b", controles: [{ rotulo: "Recusar", papel: "button" }] },
    ];
    const comArtigoMudo = medirCobertura({
      telas,
      artigos: [
        artigo({ slug: "a", rotas: ["/a"], passos: [passo("g", ["Aprovar"])] }),
        artigo({ slug: "b-mudo", rotas: ["/b"], passos: [passo("g")] }),
      ],
      aprovarRotulo: APROVA_TUDO,
    });
    const semArtigoNenhum = medirCobertura({
      telas,
      artigos: [artigo({ slug: "a", rotas: ["/a"], passos: [passo("g", ["Aprovar"])] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(comArtigoMudo.cobertura).toEqual(semArtigoNenhum.cobertura);
    expect(comArtigoMudo.cobertura.percentual).toBe(50);
  });
});

/*
 * ─ O RECORTE, E ELE É O QUE SEPARA UM RELATÓRIO LIDO DE UM RELATÓRIO IGNORADO ───────────────────
 */
describe("moldura e padrão do sistema: contados UMA vez, nunca por tela", () => {
  const molduraEmTodas = (rota: string, proprio: string): TelaEnumerada => ({
    rota,
    controles: [
      { rotulo: "Sair", papel: "button" },
      { rotulo: "Tema", papel: "button" },
      { rotulo: "Filtros", papel: "button" },
      { rotulo: proprio, papel: "button" },
    ],
  });

  it("o rótulo ubíquo é MOLDURA e sai da conta de cada tela", () => {
    // DOZE telas, e não quatro: abaixo de `minimoDeTelasParaMoldura` a ubiquidade não distingue casca
    // de padrão, e o detector escolhe o balde conservador de propósito (ver `LIMITES_PADRAO`).
    // Os rótulos próprios são LETRAS, e não "Proprio 1": o número é o valor que o controle mostra e
    // sai da chave, então "Proprio 1" e "Proprio 2" seriam o MESMO controle.
    const telas = Array.from({ length: 12 }, (_, i) =>
      molduraEmTodas(`/t${i}`, `Proprio ${"abcdefghijkl"[i]}`),
    );
    const r = medirCobertura({ telas, artigos: [], aprovarRotulo: APROVA_TUDO });
    expect(r.moldura.total).toBe(3);
    expect(r.proprios.total).toBe(12);
    // Sem o recorte, seriam 12 telas x 3 rótulos de casca = 36 órfãos repetidos.
    expect(r.telas.every((t) => t.propriosTotal === 1)).toBe(true);
  });

  it("com POUCAS telas a ubiquidade não vira moldura: uma tela sozinha continua medindo os próprios", () => {
    // O caso degenerado, e ele é caso REAL: medir uma tela só, para conferir uma frente. Sem a trava,
    // todo rótulo dela estaria em 100% das telas e a tela mediria zero controle próprio.
    const r = medirCobertura({
      telas: [{ rota: "/esteira", controles: [{ rotulo: "Reauditar", papel: "button" }] }],
      artigos: [],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.moldura.total).toBe(0);
    expect(r.proprios.total).toBe(1);
  });

  it("o rótulo que repete em 3 telas ou mais, mas não em todas, é PADRAO_DO_SISTEMA", () => {
    const telas: TelaEnumerada[] = [
      { rota: "/a", controles: [{ rotulo: "Exportar", papel: "button" }] },
      { rota: "/b", controles: [{ rotulo: "Exportar", papel: "button" }] },
      { rota: "/c", controles: [{ rotulo: "Exportar", papel: "button" }] },
      { rota: "/d", controles: [{ rotulo: "Sozinho", papel: "button" }] },
      { rota: "/e", controles: [{ rotulo: "Outro Sozinho", papel: "button" }] },
    ];
    const r = medirCobertura({ telas, artigos: [], aprovarRotulo: APROVA_TUDO });
    expect(r.padroes.total).toBe(1);
    expect(r.padroes.orfaos).toEqual(["Exportar"]);
    expect(r.proprios.total).toBe(2);
  });

  it("o padrão é coberto pelo artigo de PADRÃO, que não é da rota da tela", () => {
    const telas: TelaEnumerada[] = ["/a", "/b", "/c"].map((rota) => ({
      rota,
      controles: [{ rotulo: "Filtros", papel: "button" }],
    }));
    const r = medirCobertura({
      telas,
      // O artigo do filtro vive no módulo de padrões, com rota `/ajuda`: se a cobertura do padrão
      // fosse medida contra os artigos DA ROTA, ele nunca cobriria nada e a Fase 1 mediria zero.
      artigos: [artigo({ slug: "filtrar", rotas: ["/ajuda/filtrar"], passos: [passo("g", ["Filtros"])] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.padroes).toEqual({ total: 1, cobertos: 1, orfaos: [] });
    expect(r.cobertura.percentual).toBe(100);
  });

  it("rótulo só de dígito é PAGINAÇÃO, e não um controle próprio por tela", () => {
    expect(classificar(1, 40, true, LIMITES_PADRAO)).toBe("PADRAO_DO_SISTEMA");
    expect(classificar(1, 40, false, LIMITES_PADRAO)).toBe("PROPRIO");
  });

  it("a fração de moldura é de 85%, para três telas sem PageHead não derrubarem a classificação", () => {
    // 40 telas, rótulo em 34 (85%): moldura. Em 33: ainda padrão do sistema.
    expect(classificar(34, 40, false, LIMITES_PADRAO)).toBe("MOLDURA");
    expect(classificar(33, 40, false, LIMITES_PADRAO)).toBe("PADRAO_DO_SISTEMA");
  });
});

/*
 * ─ A CONTAGEM DENTRO DO RÓTULO ──────────────────────────────────────────────────────────────────
 *
 * Medido na PRIMEIRA enumeração real da Esteira, e não previsto: os cards de KPI são clicáveis como
 * filtro e o nome acessível deles inclui a contagem. Sem a régua, a lacuna seria impossível de fechar.
 */
describe("o número é o VALOR que o controle mostra, nunca o NOME dele", () => {
  it("o card de KPI casa com o rótulo declarado, em qualquer dia e com qualquer contagem", () => {
    const declara = [
      artigo({
        slug: "ler-os-cards",
        rotas: ["/esteira"],
        passos: [passo("Clique no card", ["Auditorias Finalizadas", "Com Pendências Obrigatórias"])],
      }),
    ];
    const hoje = medirCobertura({
      telas: [
        {
          rota: "/esteira",
          controles: [
            { rotulo: "1812 Auditorias Finalizadas", papel: "button" },
            { rotulo: "19 Com pendências obrigatórias", papel: "button" },
          ],
        },
      ],
      artigos: declara,
      aprovarRotulo: APROVA_TUDO,
    });
    const amanha = medirCobertura({
      telas: [
        {
          rota: "/esteira",
          controles: [
            { rotulo: "1.813 Auditorias Finalizadas", papel: "button" },
            { rotulo: "7 Com pendências obrigatórias", papel: "button" },
          ],
        },
      ],
      artigos: declara,
      aprovarRotulo: APROVA_TUDO,
    });
    expect(hoje.cobertura.percentual).toBe(100);
    expect(amanha.cobertura.percentual).toBe(100);
  });

  it("o órfão é impresso SEM a contagem, e com a caixa preservada", () => {
    const r = medirCobertura({
      telas: [{ rota: "/esteira", controles: [{ rotulo: "26 Análise Pendente", papel: "button" }] }],
      artigos: [],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.telas[0].orfaos).toEqual(["Análise Pendente"]);
    expect(analisarRotulo("1.812 Auditorias Finalizadas").exibir).toBe("Auditorias Finalizadas");
  });

  it("R2: o valor de CATÁLOGO é podado, e o botão de linha volta a ser o nome do botão", () => {
    // Medido na enumeração real: a régua documental acusava 272 lacunas, quase todas o MESMO botão
    // repetido cliente a cliente. O catálogo vem do banco, então cliente novo entra sozinho.
    const catalogo = prepararCatalogo(["ADVANCE BIONICS", "ALCOOL FERREIRA S A", "Advogada II"]);
    expect(chaveDeControle("Editar ADVANCE BIONICS", { catalogo }).chave).toBe("editar");
    // O "para" solto no fim sai junto (ver CONECTORES_FINAIS): nenhum autor escreve a preposição
    // órfã, ele declara "Integração obrigatória".
    expect(chaveDeControle("Integração obrigatória para ALCOOL FERREIRA S A", { catalogo }).chave).toBe(
      "integracao obrigatoria",
    );
    expect(chaveDeControle("Abrir a gestão da vaga SIM-2026-0501", { catalogo }).chave).toBe(
      "abrir a gestao da vaga",
    );
    // E o mesmo botão em dois clientes vira UM controle, não dois órfãos.
    const r = medirCobertura({
      telas: [
        {
          rota: "/admin/regua",
          controles: [
            { rotulo: "Editar ADVANCE BIONICS", papel: "button" },
            { rotulo: "Editar ALCOOL FERREIRA S A", papel: "button" },
          ],
        },
      ],
      artigos: [],
      catalogo,
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.proprios.total).toBe(1);
    expect(r.telas[0].orfaos).toEqual(["Editar"]);
  });

  it("valor de catálogo curto NÃO poda, ou ele cortaria o nome do controle ao meio", () => {
    // "AM", "II" e "SP" são valores reais de catálogo e aparecem dentro de nome legítimo.
    const catalogo = prepararCatalogo(["AM", "II", "SP"]);
    expect(catalogo.size).toBe(0);
    expect(chaveDeControle("Ver AM", { catalogo }).chave).toBe("ver am");
  });

  it("sem catálogo, a poda R2 não roda e o relatório acusa MAIS lacuna, nunca menos", () => {
    const semPoda = chaveDeControle("Editar ADVANCE BIONICS");
    expect(semPoda.chave).toBe("editar advance bionics");
  });

  it("os DOIS lados são podados: o artigo pode escrever o rótulo com o cliente dentro", () => {
    const catalogo = prepararCatalogo(["ADVANCE BIONICS", "BUNGE"]);
    const r = medirCobertura({
      telas: [{ rota: "/admin/regua", controles: [{ rotulo: "Editar ADVANCE BIONICS", papel: "button" }] }],
      artigos: [artigo({ slug: "a", rotas: ["/admin/regua"], passos: [passo("g", ["Editar BUNGE"])] })],
      catalogo,
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.cobertura.percentual).toBe(100);
  });

  it("rótulo que é SÓ valor não desaparece, e é UMA classe de controle, não uma por variante", () => {
    // A terceira volta do mesmo defeito, achada pela medição da Fase 1: o balde de padrão tinha 466
    // entradas, e eram "Ajudante Geral 782", "Advogada II 3", "102 23". Cada variante era um
    // controle. São UM: a opção de lista e o número de página se aprendem uma vez.
    const { chave, soValor } = chaveDeControle("3");
    expect(chave).toBe(CHAVE_DE_ROTULO_SO_VALOR);
    expect(soValor).toBe(true);
    const catalogo = prepararCatalogo(["Ajudante Geral", "Advogada II"]);
    for (const rotulo of ["3", "102 23", "Ajudante Geral 782", "Advogada II 3"]) {
      expect(chaveDeControle(rotulo, { catalogo }).chave).toBe(CHAVE_DE_ROTULO_SO_VALOR);
    }
    // E o relatório mostra o nome da CLASSE, nunca uma amostra com o dado de uma linha dentro.
    expect(analisarRotulo("Ajudante Geral 782", { catalogo }).exibir).toBe(ROTULO_SO_VALOR);
    expect(analisarRotulo("Ajudante Geral 782", { catalogo }).exibir).not.toContain("782");
    const r = medirCobertura({
      telas: [{ rota: "/a", controles: [{ rotulo: "3", papel: "button" }] }],
      artigos: [],
      aprovarRotulo: APROVA_TUDO,
    });
    // FORA da conta, e não no balde de padrão: não há rótulo para um artigo declarar.
    expect(r.rotulosSoValor).toBe(1);
    expect(r.padroes.total).toBe(0);
    expect(r.proprios.total).toBe(0);
    expect(r.cobertura.total).toBe(0);
  });
});

/*
 * ─ §A.6 NO RELATÓRIO ───────────────────────────────────────────────────────────────────────────
 */
describe("o relatório não carrega dado de pessoa", () => {
  it("rótulo reprovado pelo gate é contado e DESCARTADO, nunca reportado", () => {
    const r = medirCobertura({
      telas: [
        {
          rota: "/gerenciador",
          controles: [
            { rotulo: "Abrir a ficha de Maria Aparecida Dos Santos", papel: "button" },
            { rotulo: "Novo Candidato", papel: "button" },
          ],
        },
      ],
      artigos: [],
      // O gate de verdade é o `auditarTexto` do `pii.ts`, injetado pela casca. Aqui ele é dublado
      // para o teste provar o CAMINHO: reprovado não entra em lugar nenhum do relatório.
      aprovarRotulo: (rotulo) => !rotulo.includes("Maria"),
    });
    expect(r.rotulosOmitidosPeloGate).toBe(1);
    expect(r.controlesEnumerados).toBe(2);
    expect(r.telas[0].orfaos).toEqual(["Novo Candidato"]);
    expect(JSON.stringify(r)).not.toContain("Maria");
    expect(resumirParaDiretor(r)).not.toContain("Maria");
  });
});

describe("o resumo é para ser lido: curto, com a conclusão em cima", () => {
  it("não despeja uma linha por órfão: limita telas e órfãos por tela", () => {
    const telas: TelaEnumerada[] = Array.from({ length: 40 }, (_, i) => ({
      rota: `/tela-${String(i).padStart(2, "0")}`,
      // Rótulo em letras, pelo mesmo motivo do teste da moldura: dígito sai da chave do controle.
      controles: Array.from({ length: 30 }, (_, j) => ({
        rotulo: `Botao ${emLetras(i)} ${emLetras(j)}`,
        papel: "button",
      })),
    }));
    const r = medirCobertura({ telas, artigos: [], aprovarRotulo: APROVA_TUDO });
    const resumo = resumirParaDiretor(r);
    expect(r.proprios.total).toBe(1200);
    expect(resumo.split("\n").length).toBeLessThan(30);
    expect(resumo.split("\n")[0]).toContain("COBERTURA DO MANUAL");
    expect(resumo).toContain("e mais 28 tela(s) no arquivo completo");
  });

  it("§A.11: nenhum travessão no texto que chega ao usuário", () => {
    const r = medirCobertura({
      telas: [{ rota: "/a", controles: [{ rotulo: "X", papel: "button" }] }],
      artigos: [artigo({ slug: "mudo", rotas: ["/a"], passos: [passo("g")] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(resumirParaDiretor(r)).not.toContain("—");
  });
});

describe("modo relatório hoje, falha dura na Fase 6", () => {
  it("o detector nasce em modo RELATÓRIO, e isso é uma constante declarada", () => {
    expect(COBERTURA_E_FALHA_DURA).toBe(false);
  });

  it("a condição do modo duro já existe e já responde certo", () => {
    const comLacuna = medirCobertura({
      telas: [{ rota: "/a", controles: [{ rotulo: "X", papel: "button" }] }],
      artigos: [],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(reprovaEmModoDuro(comLacuna)).toBe(true);
    const fechada = medirCobertura({
      telas: [{ rota: "/a", controles: [{ rotulo: "X", papel: "button" }] }],
      artigos: [artigo({ slug: "a", rotas: ["/a"], passos: [passo("g", ["X"])] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(reprovaEmModoDuro(fechada)).toBe(false);
  });
});

describe("controlesDeclarados: a leitura do campo opcional", () => {
  it("junta os rótulos de todos os passos, normalizados, sem vazio", () => {
    const a = artigo({
      slug: "s",
      rotas: ["/r"],
      passos: [passo("um", ["Salvar", "  "]), passo("dois", ["salvar", "Cancelar"]), passo("tres")],
    });
    expect([...controlesDeclarados(a)].sort()).toEqual(["cancelar", "salvar"]);
  });
});

/*
 * ─ R3: O NOME DA PESSOA NO RÓTULO DA LINHA ──────────────────────────────────────────────────────
 *
 * Achado pelo agente de conteúdo ao fechar os órfãos da Fase 1: sobraram "Ver ficha de <nome>" e
 * "Editar admissão de <nome>". Aqui são DOIS motivos somados, e não um: o nome muda a cada linha, E
 * escrevê-lo no artigo seria dado pessoal dentro do manual (§A.6). A única forma de "fechar" a
 * lacuna seria uma violação, então ela não podia continuar sendo lacuna.
 */
describe("o nome da pessoa é podado como o valor de catálogo", () => {
  const pessoas = prepararCatalogo(["Candidato Homolog", "Maria Aparecida Dos Santos"]);

  it("o botão de linha volta a ser o nome do botão, e o nome some da chave", () => {
    expect(chaveDeControle("Ver ficha de Candidato Homolog", { pessoas }).chave).toBe("ver ficha");
    expect(chaveDeControle("Editar admissão de Maria Aparecida Dos Santos", { pessoas }).chave).toBe(
      "editar admissao",
    );
  });

  it("o conector solto no fim sai junto, ou o desencontro voltaria um token depois", () => {
    // "Ver ficha de Fulano" podado daria "ver ficha de", e nenhum autor escreve o "de" solto.
    expect(chaveDeControle("Ver ficha de Candidato Homolog", { pessoas }).chave).not.toContain(" de");
    expect(analisarRotulo("Ver ficha de Candidato Homolog", { pessoas }).exibir).toBe("Ver ficha");
  });

  it("o mesmo botão em linhas de pessoas diferentes é UM controle, e é declarável", () => {
    const r = medirCobertura({
      telas: [
        {
          rota: "/gerenciador",
          controles: [
            { rotulo: "Ver ficha de Candidato Homolog", papel: "button" },
            { rotulo: "Ver ficha de Maria Aparecida Dos Santos", papel: "button" },
          ],
        },
      ],
      artigos: [artigo({ slug: "a", rotas: ["/gerenciador"], passos: [passo("g", ["Ver ficha"])] })],
      pessoas,
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.proprios).toEqual({ total: 1, cobertos: 1 });
    expect(r.cobertura.percentual).toBe(100);
  });

  it("§A.6: o nome da pessoa não chega ao relatório, nem como órfão", () => {
    const r = medirCobertura({
      telas: [
        { rota: "/gerenciador", controles: [{ rotulo: "Mudar status de Candidato Homolog", papel: "button" }] },
      ],
      artigos: [],
      pessoas,
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.telas[0].orfaos).toEqual(["Mudar status"]);
    expect(JSON.stringify(r)).not.toContain("Homolog");
    expect(resumirParaDiretor(r)).not.toContain("Homolog");
  });

  it("sem a lista de pessoas, a poda R3 não roda e o relatório acusa MAIS, nunca menos", () => {
    expect(chaveDeControle("Ver ficha de Candidato Homolog").chave).toBe("ver ficha de candidato homolog");
  });
});

/*
 * ─ O BALDE QUE NUNCA FECHAVA ────────────────────────────────────────────────────────────────────
 *
 * Lacuna impossível de fechar é o que faz alguém desligar o detector: o relatório nunca chegaria a
 * zero e a falha dura da Fase 6 nunca poderia ser ligada.
 */
describe("o controle cujo rótulo inteiro é dado sai da conta de cobertura", () => {
  it("não entra no denominador, e é reportado na linha própria", () => {
    const r = medirCobertura({
      telas: [
        {
          rota: "/gerenciador",
          controles: [
            { rotulo: "1", papel: "button" },
            { rotulo: "2", papel: "button" },
            { rotulo: "Exportar", papel: "button" },
          ],
        },
      ],
      artigos: [artigo({ slug: "a", rotas: ["/gerenciador"], passos: [passo("g", ["Exportar"])] })],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(r.rotulosSoValor).toBe(1);
    expect(r.cobertura).toEqual({ total: 1, cobertos: 1, percentual: 100 });
    expect(r.padroes.orfaos).toEqual([]);
    expect(r.telas[0].orfaos).toEqual([]);
  });

  it("um artigo NÃO cobre a classe por acidente ao declarar um dado", () => {
    // Sem esta trava, um artigo que escrevesse um nome de cargo ou um número em `controles` seria
    // podado até o vazio e passaria a "cobrir" todos os rótulos de dado do sistema.
    const catalogo = prepararCatalogo(["Ajudante Geral"]);
    const a = artigo({ slug: "a", rotas: ["/x"], passos: [passo("g", ["Ajudante Geral", "42"])] });
    expect([...controlesDeclarados(a, { catalogo })]).toEqual([]);
  });

  it("o resumo diz que aquilo NÃO é lacuna, com o motivo", () => {
    const r = medirCobertura({
      telas: [{ rota: "/a", controles: [{ rotulo: "7", papel: "button" }] }],
      artigos: [],
      aprovarRotulo: APROVA_TUDO,
    });
    expect(resumirParaDiretor(r)).toContain("FORA DA CONTA");
    expect(resumirParaDiretor(r)).toContain("nao e lacuna");
  });
});
