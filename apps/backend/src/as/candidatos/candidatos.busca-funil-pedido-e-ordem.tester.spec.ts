import { describe, expect, it } from "vitest";
import { bancoDaBuscaComFunil } from "./busca-funil.tester-fake";

/**
 * ─ QUANDO O FUNIL VEM, E EM QUE ORDEM. Duas reguas que a tela JA depende, e nenhuma tinha teste ──
 *
 * ┌─ 1. AUSENTE E `[]` QUEREM DIZER COISAS DIFERENTES, e a diferenca e deliberada ─────────────┐
 * │ `[]`      = o funil FOI PEDIDO, e esta pessoa nao tem candidatura nenhuma (a Gizele).       │
 * │ AUSENTE   = o funil NAO FOI PEDIDO nesta chamada, ou nao veio.                              │
 * │                                                                                             │
 * │ POR QUE NAO DEVOLVER `[]` SEMPRE, que seria mais simples: com `semCandidatura: true` a      │
 * │ rota filtra quem nao tem candidatura VIVA, e essas pessoas PODEM ter candidatura MORTA      │
 * │ (medido: 1.620 pessoas com 1.645 candidaturas descartadas). Dizer `[]` para quem tem        │
 * │ candidatura descartada e AFIRMAR que ela nao existe, e mentira pequena em contrato e o que   │
 * │ morde seis meses depois.                                                                     │
 * │                                                                                             │
 * │ QUEM FAZ ESSA PERGUNTA E A TELA, e so a Central de Candidatos a faz: ela chama SEM          │
 * │ `semCandidatura`, entao para ela o campo SEMPRE vem, e ausente ali significa falha de        │
 * │ carregamento. Os tres leitores que chamam com `semCandidatura: true` nao leem o campo.      │
 * │                                                                                             │
 * │ OS DOIS LADOS ESTAO TRAVADOS AQUI. O segundo e o que importa mais para o 429: ele impede    │
 * │ que alguem "otimize" tirando a segunda consulta e devolva a tela ao painel por vaga.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("o funil vem na busca normal e NAO vem na busca de alocaveis", () => {
  function cenario() {
    return bancoDaBuscaComFunil({
      pessoas: [{ id: "p-1", nome: "Primeira Pessoa" }],
      candidaturas: [
        {
          id: "c-1",
          candidatoId: "p-1",
          vagaId: "v-1",
          vagaCodigo: "3572904",
          vagaNome: "Auxiliar De Limpeza",
          situacao: "DESCARTADO",
        },
      ],
    });
  }

  it("com `semCandidatura: true`, o campo `candidaturas` e AUSENTE, e nao uma lista vazia", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({ semCandidatura: true });

    expect(pagina.itens).toHaveLength(1);
    expect(
      pagina.itens[0],
      "`[]` aqui afirmaria que esta pessoa nao tem candidatura nenhuma, quando ela tem uma DESCARTADA: ausente quer dizer 'nao foi pedido', e e a unica resposta verdadeira.",
    ).not.toHaveProperty("candidaturas");
  });

  it("com `semCandidatura: true`, a segunda consulta nem vai ao banco", async () => {
    const cenarioAtual = cenario();
    await cenarioAtual.service.buscar({ semCandidatura: true });

    expect(
      cenarioAtual.doFunil,
      "os tres leitores de alocacao nao leem o campo: ler candidatura para eles e trafego de dado pessoal sem ninguem olhando (§A.6).",
    ).toBeUndefined();
  });

  /**
   * A SEGUNDA METADE, e e ela que impede o conserto do 429 de ser desfeito por "otimizacao": sem
   * `semCandidatura`, o campo VEM e a segunda consulta ACONTECE. Tirar a consulta devolveria a tela
   * ao laco de 481 paineis por vaga, que e o defeito inteiro.
   */
  it("sem `semCandidatura`, o campo VEM e a segunda consulta acontece", async () => {
    const cenarioAtual = cenario();
    const pagina = await cenarioAtual.service.buscar({});

    expect(pagina.itens[0]).toHaveProperty("candidaturas");
    expect(pagina.itens[0]!.candidaturas).toHaveLength(1);
    expect(
      cenarioAtual.doFunil,
      "sem a segunda consulta a tela volta a montar o funil pedindo um painel por vaga, que e o 429.",
    ).toBeDefined();
  });

  it("a busca por nome tambem traz o campo: o funil nao depende de qual filtro foi usado", async () => {
    const { service } = cenario();
    const pagina = await service.buscar({ nome: "primeira" });
    expect(pagina.itens[0]).toHaveProperty("candidaturas");
  });
});

/**
 * ┌─ 2. A MAIS RECENTE PRIMEIRO, porque a TELA MOSTRA A PRIMEIRA ───────────────────────────────┐
 * │ A coluna de vaga da linha mostra a PRIMEIRA candidatura da lista, entao a ordem nao e        │
 * │ enfeite: ela decide QUAL VAGA o time le naquela linha. Um `orderBy` removido numa            │
 * │ refatoracao nao quebra teste nenhum, nao derruba a tela e nao gera erro: ele so passa a      │
 * │ mostrar a vaga ERRADA, e ninguem vai suspeitar de ordenacao. E o modo de falha mais caro     │
 * │ desta base, que e silencioso e plausivel.                                                    │
 * │                                                                                             │
 * │ O CENARIO E INSERIDO FORA DE ORDEM DE PROPOSITO, com a mais ANTIGA primeiro: o banco         │
 * │ fingido devolve a ordem de insercao quando a consulta nao pede ordem, entao a passagem deste │
 * │ teste depende do `orderBy` existir de verdade.                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("a candidatura mais recente vem primeiro", () => {
  function cenarioForaDeOrdem() {
    return bancoDaBuscaComFunil({
      pessoas: [{ id: "p-1", nome: "Pessoa De Tres Vagas" }],
      candidaturas: [
        {
          id: "a-mais-antiga",
          candidatoId: "p-1",
          vagaId: "v-1",
          vagaCodigo: "3000001",
          vagaNome: "Vaga Antiga",
          alocadoEm: new Date("2026-06-01T10:00:00.000Z"),
        },
        {
          id: "a-do-meio",
          candidatoId: "p-1",
          vagaId: "v-2",
          vagaCodigo: "3000002",
          vagaNome: "Vaga Do Meio",
          alocadoEm: new Date("2026-08-15T10:00:00.000Z"),
        },
        {
          id: "a-mais-recente",
          candidatoId: "p-1",
          vagaId: "v-3",
          vagaCodigo: "3000003",
          vagaNome: "Vaga Recente",
          alocadoEm: new Date("2026-09-30T10:00:00.000Z"),
        },
      ],
    });
  }

  it("as tres vem da mais recente para a mais antiga", async () => {
    const { service } = cenarioForaDeOrdem();
    const pagina = await service.buscar({});

    expect(
      pagina.itens[0]!.candidaturas!.map((c) => c.id),
      "a ordem decide qual vaga a linha mostra: invertida, o time le a vaga errada e nada acusa.",
    ).toEqual(["a-mais-recente", "a-do-meio", "a-mais-antiga"]);
  });

  it("a PRIMEIRA da lista, que e a que a tela mostra, e a vaga mais recente", async () => {
    const { service } = cenarioForaDeOrdem();
    const pagina = await service.buscar({});
    const primeira = pagina.itens[0]!.candidaturas![0];

    expect(primeira.vagaCodigo).toBe("3000003");
    expect(primeira.vagaNome).toBe("Vaga Recente");
  });

  it("a consulta do funil pede a ordem ao BANCO, por `alocado_em` descendente", async () => {
    const cenario = cenarioForaDeOrdem();
    await cenario.service.buscar({});

    const ordem = cenario.doFunil!.ordem.join(" ");
    expect(
      ordem,
      "sem `orderBy`, a ordem passa a ser a ordem fisica das linhas, que muda sozinha.",
    ).toContain("alocado_em");
    expect(ordem, "ascendente poe a candidatura mais ANTIGA na coluna da tela.").toContain("desc");
  });
});
