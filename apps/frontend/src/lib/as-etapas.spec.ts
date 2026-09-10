import { describe, expect, it } from "vitest";
import { ETAPAS_FUNIL_SEMENTE, ETAPA_TONS, ETAPA_TOM_PADRAO, type AsEtapaFunil } from "@ea/shared-types";
import { etapaInicial, etapasOrdenadas, rotuloDaEtapa, tomDaEtapa } from "@/lib/as-etapas";

/**
 * ─ A PILL DE UMA ETAPA DESCONHECIDA SAI FEIA, E NUNCA SAI VAZIA ─────────────────────────────────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2), contra o requisito.
 *
 * ┌─ O QUE SE PERDEU, E O QUE PRECISA SUBSTITUIR ──────────────────────────────────────────────┐
 * │ `CandidaturaEtapa` DEIXOU DE SER UNION E VIROU `string`, porque a lista passou a ser do      │
 * │ diretor. Com isso morreu a exaustividade do compilador: o `Record<CandidaturaEtapa, PillTone>`│
 * │ que EXIGIA a cor de toda etapa nova (o comentário de `as-candidatos-visual.ts` diz que essa  │
 * │ exigência era deliberada) não tem mais como existir. O TypeScript parou de recusar "TRIGEM". │
 * │                                                                                             │
 * │ O QUE SUBSTITUI: um FALLBACK EXPLÍCITO em runtime, com teste. É este arquivo.                │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E ISTO NÃO É CASO DE BORDA TEÓRICO: ACONTECE NO USO NORMAL ───────────────────────────────┐
 * │ A leitura PADRÃO do catálogo devolve só as ATIVAS. A ficha de um candidato antigo mostra a   │
 * │ linha do tempo dele, e ela cita etapas que o diretor INATIVOU depois. O código está gravado  │
 * │ no evento, a etapa não está na listagem padrão, e o rótulo não resolve. Sem fallback, a pill │
 * │ sai VAZIA: um retângulo colorido sem texto nenhum, que não diz onde a pessoa esteve e nem    │
 * │ parece um defeito. Pill feia é ruim; pill vazia é pior, porque some do olho de quem revisa.  │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA:
 *   . `rotuloDaEtapa(codigo)` de um código fora do catálogo devolve O PRÓPRIO CÓDIGO;
 *   . `tomDaEtapa(codigo)` devolve `ETAPA_TOM_PADRAO`;
 *   . nunca `undefined`, nunca string vazia, nunca `null`.
 *
 * NOTA AO CONSTRUTOR SOBRE A ASSINATURA: os casos abaixo passam o catálogo EXPLICITAMENTE como
 * segundo argumento, e essa é a forma que eu recomendo (função pura em cima, promessa memoizada em
 * volta: a régua fica testável sem estado de módulo, que é o padrão do `lib/` da casa). Se a
 * assinatura final resolver o catálogo por dentro, mude a CHAMADA e preserve as ASSERÇÕES: o que
 * está guardado aqui é o fallback, não o formato do parâmetro.
 */

/** O catálogo como a rota o devolve: as cinco de hoje, ativas. */
const CATALOGO: AsEtapaFunil[] = ETAPAS_FUNIL_SEMENTE.map((e, i) => ({
  id: i + 1,
  codigo: e.codigo,
  rotulo: e.rotulo,
  ordem: e.ordem,
  tom: e.tom,
  inicial: e.ordem === 1,
  ativa: true,
}));

/** A etapa que o diretor inativou: fora da listagem padrão, viva no histórico de quem passou. */
const INATIVADA = "TRIAGEM_ANTIGA";

describe("o fallback do rótulo: a pill nunca sai vazia", () => {
  it("código fora do catálogo devolve o PRÓPRIO CÓDIGO, e não vazio nem undefined", () => {
    const r = rotuloDaEtapa(INATIVADA, CATALOGO);
    expect(r).toBe(INATIVADA);
    expect(r).toBeTruthy();
  });

  it.each(["", "   ", "TRIGEM", "etapa-que-nao-existe", "123"])(
    "o código %j nunca produz rótulo vazio",
    (codigo) => {
      const r = rotuloDaEtapa(codigo, CATALOGO);
      expect(typeof r).toBe("string");
      if (codigo.trim()) expect(r).toBeTruthy();
    },
  );

  /**
   * O CONTRASTE, sem o qual "devolve o próprio código" seria satisfeito por uma função que IGNORA o
   * catálogo e devolve sempre o código: quem está no catálogo resolve pelo RÓTULO.
   */
  it("código conhecido resolve pelo rótulo do catálogo, e não pelo código", () => {
    expect(rotuloDaEtapa("ENTREVISTA_SOULAN", CATALOGO)).toBe("Entrevista Soulan");
    expect(rotuloDaEtapa("CAPTACAO", CATALOGO)).toBe("Captação");
  });

  /**
   * A ETAPA INATIVA RESOLVE QUANDO ELA ESTÁ NA LISTA. É o caso do `?incluirInativas=1`, que existe
   * exatamente para a linha do tempo: passada a lista completa, o rótulo bom aparece.
   */
  it("etapa INATIVA presente na lista resolve pelo rótulo, e não cai no fallback", () => {
    const comInativa: AsEtapaFunil[] = [
      ...CATALOGO,
      { id: 9, codigo: INATIVADA, rotulo: "Triagem Antiga", ordem: 9, tom: "nt", inicial: false, ativa: false },
    ];
    expect(rotuloDaEtapa(INATIVADA, comInativa)).toBe("Triagem Antiga");
  });

  it("catálogo VAZIO (a tela abriu antes da rota responder) devolve o código, e não quebra", () => {
    expect(rotuloDaEtapa("CAPTACAO", [])).toBe("CAPTACAO");
  });
});

describe("o fallback do tom: a pill sempre tem cor, e é uma cor da paleta", () => {
  it("código fora do catálogo devolve `ETAPA_TOM_PADRAO`", () => {
    expect(tomDaEtapa(INATIVADA, CATALOGO)).toBe(ETAPA_TOM_PADRAO);
  });

  it.each(["", "TRIGEM", "etapa-que-nao-existe"])("o código %j nunca fica sem tom", (codigo) => {
    const t = tomDaEtapa(codigo, CATALOGO);
    expect(t).toBeTruthy();
    expect(ETAPA_TONS as readonly string[]).toContain(t);
  });

  it("código conhecido usa o tom do catálogo (o contraste do fallback)", () => {
    expect(tomDaEtapa("APROVACAO", CATALOGO)).toBe("ok");
    expect(tomDaEtapa("TRIAGEM", CATALOGO)).toBe("in");
  });

  /**
   * §A.12: o `dg` é RECUSA e a `StatusPill` põe o X vermelho nele. Etapa de funil é POSIÇÃO, não
   * julgamento, e o fallback é o lugar mais fácil de deixar isso escapar sem ninguém notar.
   */
  it("o fallback nunca é o vermelho de recusa", () => {
    expect(tomDaEtapa("QUALQUER_COISA", CATALOGO)).not.toBe("dg");
    expect(ETAPA_TOM_PADRAO).not.toBe("dg");
  });
});

describe("a ordem e a etapa inicial vêm do catálogo, e não de uma lista escrita na tela", () => {
  /**
   * A ORDEM DO FUNIL É A COLUNA `ordem`. Quatro telas ordenavam por `indexOf` de uma constante que
   * saiu, e nenhuma delas quebra com erro: elas passam a ordenar ERRADO em silêncio.
   */
  it("`etapasOrdenadas` devolve pela coluna `ordem`, e não pela ordem de chegada da rota", () => {
    const embaralhado = [CATALOGO[3], CATALOGO[0], CATALOGO[4], CATALOGO[1], CATALOGO[2]];
    expect(etapasOrdenadas(embaralhado).map((e) => e.codigo)).toEqual(
      [...CATALOGO].sort((a, b) => a.ordem - b.ordem).map((e) => e.codigo),
    );
  });

  it("uma etapa criada NO MEIO do funil aparece no meio, sem a tela ser tocada", () => {
    const comNova: AsEtapaFunil[] = [
      ...CATALOGO,
      { id: 9, codigo: "DINAMICA", rotulo: "Dinâmica", ordem: 3, tom: "wn", inicial: false, ativa: true },
    ];
    const ordenadas = etapasOrdenadas(comNova).map((e) => e.codigo);
    expect(ordenadas.indexOf("DINAMICA")).toBeGreaterThan(ordenadas.indexOf("TRIAGEM"));
    expect(ordenadas.indexOf("DINAMICA")).toBeLessThan(ordenadas.indexOf("APROVACAO"));
  });

  /**
   * A ETAPA DE NASCIMENTO TEM UM DONO SÓ, e ele é a coluna `inicial`. Ela era o DEFAULT da coluna no
   * banco, mais uma constante escrita à mão no estado inicial do modal de cadastro: três fontes
   * concordando por coincidência, e a do banco capaz de apontar para uma etapa inativada.
   */
  it("`etapaInicial` é a marcada no catálogo, e não a primeira da lista", () => {
    const outraInicial: AsEtapaFunil[] = CATALOGO.map((e) => ({
      ...e,
      inicial: e.codigo === "TRIAGEM",
    }));
    expect(etapaInicial(outraInicial)?.codigo).toBe("TRIAGEM");
  });

  it("sem nenhuma marcada, `etapaInicial` não inventa: devolve nulo ou indefinido", () => {
    const semInicial = CATALOGO.map((e) => ({ ...e, inicial: false }));
    expect(etapaInicial(semInicial) ?? null).toBeNull();
  });
});
