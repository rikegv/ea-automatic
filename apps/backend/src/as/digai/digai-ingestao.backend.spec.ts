import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { consomePosicao, type CandidaturaSituacao } from "@ea/shared-types";
import { autorizar, montarUrlAutorizada, GradeDigaiViolada } from "./digai-grade";
import { DigaiCliente } from "./digai.cliente";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiRepositorio } from "./digai-repositorio";
import {
  paginaDeCandidatosFingida,
  respostaDigaiFingida,
  resultadoDigaiFingido,
} from "./digai.tester-fake";
import { DigaiFilaService } from "./digai-fila.service";
import { JOB_EVENTO_DIGAI } from "./digai.queue";
import {
  admitidoNaIngestaoDigai,
  desembrulharRespostaDigai,
  ETAPAS_DIGAI,
  INGERIR_SOMENTE_QUEM_FINALIZOU,
  mascararParaLog,
  separarPorFinalizacaoDigai,
  situacaoDeNascimentoDigai,
  SITUACAO_NASCIMENTO_DIGAI,
  traduzirErroDeBanco,
  ETAPA_DIGAI_FINALIZOU,
  ETAPA_DIGAI_NAO_FINALIZOU,
  projetarResultadoDigai,
  type ResultadoDigai,
} from "../../domain/digai";

/**
 * ─ A COBERTURA DE QUEM CONSTRUIU, E ELA NAO SUBSTITUI A DO `tester` ────────────────────────────
 *
 * O contrato (`digai.*.tester.spec.ts`) e de OUTRO agente e prova o REQUISITO. Este arquivo prova o
 * CAMINHO DE COSTURA que so quem montou as pecas enxerga: que o portao da escrita fecha ANTES do
 * banco, que a segunda chamada monta um path que a grade aceita, e que a projecao por allowlist
 * acontece de verdade no caminho que a producao percorre.
 *
 * SUFIXO PROPRIO (`.backend.spec.ts`), como a casa ja faz em `ingestao-varredura.backend.spec.ts`:
 * o sufixo do `tester` e trava de DONO UNICO (§A.39), e na onda B1 dois agentes escolheram o mesmo
 * nome de arquivo e um sobrescreveu o teste do outro em silencio.
 *
 * §A.6: nenhum dado real. Os valores com cara de pessoa sao sinteticos e, na maior parte, existem
 * para serem RECUSADOS.
 */

/** O repositorio como dublê: ele ANOTA tudo o que seria escrito, e nunca escreve nada. */
function repositorioFingido() {
  const escritas: string[] = [];
  const repo = {
    escritas,
    deParaEtapa: vi.fn(async () => ({ etapaCodigo: "CAPTACAO", situacao: null, ativo: true })),
    candidatoPorIdentidade: vi.fn(async () => null),
    candidatoPorDocumento: vi.fn(async () => null),
    // O DEGRAU 3 DO DEDUP (e-mail): o duble nao casa ninguem, que e o que estes casos pressupoem.
    candidatoPorEmail: vi.fn(async () => null),
    criarCandidato: vi.fn(async () => {
      escritas.push("criarCandidato");
      return { id: "11111111-1111-4111-8111-111111111111" };
    }),
    atualizarCandidato: vi.fn(async () => {
      escritas.push("atualizarCandidato");
      return { linhasAfetadas: 1 };
    }),
    anexarIdentidade: vi.fn(async () => {
      escritas.push("anexarIdentidade");
    }),
    registrarConflito: vi.fn(async () => {
      escritas.push("registrarConflito");
    }),
    espelharVaga: vi.fn(async () => {
      escritas.push("espelharVaga");
      return { id: "22222222-2222-4222-8222-222222222222" };
    }),
    garantirCandidatura: vi.fn(async () => {
      escritas.push("garantirCandidatura");
      return { criada: true, id: "33333333-3333-4333-8333-333333333333" };
    }),
  };
  return repo;
}

function servico(vars: Record<string, string | undefined>, repo = repositorioFingido()) {
  const config = { get: <T,>(chave: string) => vars[chave] as unknown as T } as ConfigService;
  return {
    repo,
    servico: new DigaiImportacaoService(config, repo as unknown as DigaiRepositorio),
  };
}

/**
 * ─ O REGISTRO QUE A INGESTAO ESCREVE TEM CPF, E ISSO E A REGUA DE ADMISSAO, NAO DETALHE ────────
 *
 * Desde a decisao do diretor de 29/09/2026 a ingestao so admite quem FINALIZOU a triagem, e quem
 * responde por isso e o CPF (`etapaDoResultadoDigai`). Um fixture SEM CPF nao e mais "um registro
 * qualquer": e um registro RECUSADO, e usa-lo para provar dedup, espelho de vaga ou guarda de
 * anonimizacao faria esses testes passarem pelo motivo errado (nada e escrito, mas por outra
 * razao). O CPF e sintetico e tem digito verificador valido, conferido no proprio spec de dominio.
 */
const REGISTRO: ResultadoDigai = {
  userId: "usr-sintetico-9",
  partnerJobId: "1234567",
  name: "Fulano De Teste",
  cpf: "11122233396",
  email: "fulano.teste@exemplo.invalido",
  phoneNumber: "11900000001",
  appliedAt: "2026-09-10T12:00:00.000Z",
};

/** O mesmo registro, mas de quem AINDA NAO finalizou: sem CPF. Nada pode ser escrito por causa dele. */
const REGISTRO_NAO_FINALIZOU: ResultadoDigai = { ...REGISTRO, cpf: null };

describe("os dois portoes fecham em pontos DIFERENTES, e e isso que os torna uteis", () => {
  it("sem `DIGAI_API_TOKEN` a integracao esta inerte, e nada sai para a rede", async () => {
    const cliente = new DigaiCliente({ token: undefined });
    expect(cliente.ativo).toBe(false);
    await expect(cliente.ler("/api/v1/public/workspaces")).rejects.toBeInstanceOf(GradeDigaiViolada);
  });

  it("COM token e SEM `DIGAI_INGESTAO_ATIVA`, a leitura e possivel e o banco NAO e tocado", async () => {
    /*
     * ESTE E O CASO QUE O PORTAO DA CREDENCIAL SOZINHO NAO COBRE, e por isso os dois existem: uma
     * integracao que comeca a escrever no dia em que o token chega nao foi LIGADA, foi
     * SURPREENDIDA, e o universo do outro lado e de 12.445 pessoas.
     */
    const { servico: s, repo } = servico({ DIGAI_API_TOKEN: "token-sintetico-de-teste-000000" });
    const r = await s.importar([REGISTRO]);
    expect(r.escritos, "com o portao fechado, zero escrita.").toBe(0);
    expect(repo.escritas, "nenhum metodo de escrita do repositorio pode ter sido chamado.").toEqual([]);
    expect(s.ativa, "a integracao sabe dizer de si mesma que nao esta ligada dos dois lados.").toBe(false);
  });

  it("com os DOIS portoes abertos, a gravacao acontece e a pessoa nasce com identidade externa", async () => {
    const { servico: s, repo } = servico({
      DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
      DIGAI_INGESTAO_ATIVA: "true",
    });
    const r = await s.importar([REGISTRO]);
    expect(r.escritos).toBe(1);
    expect(
      repo.escritas,
      "a ordem importa: a pessoa nasce, ganha identidade, a vaga e espelhada e so entao a candidatura entra.",
    ).toEqual(["criarCandidato", "anexarIdentidade", "espelharVaga", "garantirCandidatura"]);
  });

  it("sem elo com a vaga, a criacao e ADIADA e nada e escrito", async () => {
    const { servico: s, repo } = servico({
      DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
      DIGAI_INGESTAO_ATIVA: "true",
    });
    const r = await s.importar([{ ...REGISTRO, partnerJobId: null }]);
    expect(r.adiados, "sem `partnerJobId` a importacao e adiada, nunca inventada (secao A.5).").toBe(1);
    expect(repo.escritas).toEqual([]);
  });

  it("sem de/para, NADA e escrito: nem pessoa, nem identidade, nem candidatura", async () => {
    const repo = repositorioFingido();
    repo.deParaEtapa = vi.fn(async () => null) as unknown as typeof repo.deParaEtapa;
    const { servico: s } = servico(
      { DIGAI_API_TOKEN: "token-sintetico-de-teste-000000", DIGAI_INGESTAO_ATIVA: "true" },
      repo,
    );
    await s.importar([REGISTRO]);
    expect(
      repo.escritas,
      "ingerir a pessoa e segurar so a candidatura coletaria dado para uso nenhum, que e o contrario da minimizacao.",
    ).toEqual([]);
  });
});

describe("a REGUA DE ADMISSAO: so quem FINALIZOU entra, e o terreno fica preparado", () => {
  /**
   * ┌─ A DECISAO DO DIRETOR (29/09/2026), e o que ela exige do codigo ─────────────────────────────┐
   * │ A ingestao traz APENAS quem FINALIZOU a triagem (medido: 4 de 58 numa pagina, 382 de 2.298   │
   * │ em 60 screenings). Quem nao finalizou NAO VIRA PESSOA, NAO VIRA CANDIDATURA e NAO VIRA VAGA. │
   * │ E o terreno fica PREPARADO para os demais: o ponto de decisao existe, tem NOME, e e testado  │
   * │ DOS DOIS LADOS, sem que a ingestao dos nao finalizados tenha sido construida (secao A.31).   │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   */

  it("o portao esta FECHADO hoje, e o padrao da funcao e a decisao do diretor", () => {
    expect(
      INGERIR_SOMENTE_QUEM_FINALIZOU,
      "a decisao vigente e trazer SO quem finalizou. Trocar isto e como se abre para os demais.",
    ).toBe(true);
    expect(admitidoNaIngestaoDigai(REGISTRO)).toBe(true);
    expect(admitidoNaIngestaoDigai(REGISTRO_NAO_FINALIZOU)).toBe(false);
  });

  it("CPF invalido NAO e finalizacao: lixo nao carimba conclusao em quem nao concluiu", () => {
    expect(admitidoNaIngestaoDigai({ ...REGISTRO, cpf: "00000000000" })).toBe(false);
    expect(admitidoNaIngestaoDigai({ ...REGISTRO, cpf: "" })).toBe(false);
  });

  it("O OUTRO LADO DO PORTAO TAMBEM E TESTADO: aberto, TODOS entram, sem uma linha nova", () => {
    /*
     * ESTE E O TESTE QUE PROVA QUE O TERRENO ESTA PREPARADO. Ele nao verifica um comentario: ele
     * EXERCITA o caminho que o diretor vai querer um dia, e mostra que a mudanca e de UM VALOR.
     */
    expect(admitidoNaIngestaoDigai(REGISTRO_NAO_FINALIZOU, false)).toBe(true);
    const lote = [REGISTRO, REGISTRO_NAO_FINALIZOU];
    expect(separarPorFinalizacaoDigai(lote, false)).toEqual({
      admitidos: lote,
      naoFinalizaram: [],
    });
  });

  it("a separacao parte o lote nos dois montes, e a soma fecha com o total", () => {
    const lote = [REGISTRO, REGISTRO_NAO_FINALIZOU, { ...REGISTRO, userId: "usr-sintetico-8" }];
    const { admitidos, naoFinalizaram } = separarPorFinalizacaoDigai(lote);
    expect(admitidos.length).toBe(2);
    expect(naoFinalizaram).toEqual([REGISTRO_NAO_FINALIZOU]);
    expect(
      admitidos.length + naoFinalizaram.length,
      "numero que nao fecha com o total lido vira 'sumiu no caminho', que e a falha mais cara de uma ingestao.",
    ).toBe(lote.length);
  });

  it("quem nao finalizou NAO vira pessoa, NAO vira vaga e NAO vira candidatura", async () => {
    const { servico: s, repo } = servico({
      DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
      DIGAI_INGESTAO_ATIVA: "true",
    });
    const r = await s.importar([REGISTRO_NAO_FINALIZOU]);
    expect(r.escritos).toBe(0);
    expect(
      repo.escritas,
      "nao coletar e diferente de nao mostrar: nenhum metodo de ESCRITA pode ter sido chamado por causa dele.",
    ).toEqual([]);
    expect(
      repo.candidatoPorIdentidade,
      "nem a LEITURA acontece: o portao e a primeira linha, senao a base seria consultada por causa de quem nunca ia ser escrito.",
    ).not.toHaveBeenCalled();
  });

  it("'nao finalizou' e um QUARTO caso, e nao se soma a 'adiado'", async () => {
    const { servico: s } = servico({
      DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
      DIGAI_INGESTAO_ATIVA: "true",
    });
    const r = await s.importar([REGISTRO, REGISTRO_NAO_FINALIZOU]);
    expect(r.escritos, "quem finalizou entra normalmente, no mesmo lote.").toBe(1);
    expect(r.naoFinalizaram, "o recusado pela regua tem nome proprio no resumo.").toBe(1);
    expect(
      r.adiados,
      "adiado e FALTA DE ELO COM A VAGA, e e reprocessavel. Confundir os dois faz o log mentir sobre o motivo.",
    ).toBe(0);
    expect(r.ignorados).toBe(0);
  });

  it("o log da recusa nao carrega pessoa nenhuma: contagem e mais nada (secao A.6)", async () => {
    const linhas: string[] = [];
    const espia = vi.spyOn(Logger.prototype, "log").mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });
    try {
      const { servico: s } = servico({
        DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
        DIGAI_INGESTAO_ATIVA: "true",
      });
      await s.importar([REGISTRO_NAO_FINALIZOU]);
    } finally {
      espia.mockRestore();
    }
    const saida = linhas.join("\n");
    expect(saida, "a recusa precisa aparecer, senao o numero nao fecha para quem le.").toContain(
      "fora da regua de admissao",
    );
    for (const pii of [
      "Fulano",
      "De Teste",
      "fulano.teste@exemplo.invalido",
      "11900000001",
      "usr-sintetico-9",
    ]) {
      expect(saida.includes(pii), `'${pii}' vazou no log da recusa.`).toBe(false);
    }
  });
});

describe("a segunda chamada monta um path que a GRADE aceita", () => {
  /**
   * ┌─ POR QUE ESTE TESTE EXISTE, e ele e o defeito mais chato de descobrir em producao ─────────┐
   * │ A grade e fail-closed, entao um caminho mal montado nao devolve dado errado: devolve NADA,  │
   * │ para sempre, em silencio, e a ingestao inteira parece "nao estar chegando evento". A unica  │
   * │ forma de isso aparecer antes e afirmar aqui que o caminho que a producao monta e exatamente │
   * │ um dos que a allowlist reconhece.                                                            │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o caminho da leitura por usuario passa pela allowlist", () => {
    const caminho = "/api/v1/public/screenings/sc-sintetico-1/users/usr-sintetico-1/results";
    expect(() => autorizar(caminho, "GET")).not.toThrow();
    expect(montarUrlAutorizada(caminho, "GET")).toBe(
      `https://api-screening.digai.ai${caminho}`,
    );
  });

  it("o mesmo caminho com um id hostil e recusado ANTES da rede", () => {
    expect(() =>
      autorizar("/api/v1/public/screenings/sc1/users/11122233396/results", "GET"),
    ).toThrow(GradeDigaiViolada);
  });
});

describe("o ENVELOPE do fornecedor, medido na producao dele em 29/09/2026", () => {
  /**
   * ┌─ A LICAO QUE ESTE BLOCO EXISTE PARA ESCREVER ──────────────────────────────────────────────┐
   * │ A suite inteira ficou VERDE sobre um contrato ERRADO porque os fakes devolviam uma forma    │
   * │ que o fornecedor NUNCA devolveu: array no topo, ou `{ results: [...] }`. Nenhum teste       │
   * │ chegava a desembrulhar coisa nenhuma, entao a leitura podia estar completamente errada e    │
   * │ ninguem via. Fake inventado testa o fake, nao a integracao.                                  │
   * │                                                                                             │
   * │ A forma REAL, medida: `{ message: [...], data: { value: <conteudo> } }`, com `data` OBJETO. │
   * │ O `<conteudo>` e `{ page, total, candidates: [...] }` na listagem de resultados (a lista    │
   * │ chama-se `candidates`), `{ page, total, screenings: [...] }` na listagem de screenings, e   │
   * │ UM registro plano na leitura por usuario.                                                    │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("desembrulha `data.value` e acha a lista de `candidates`", () => {
    const { conteudo, lista } = desembrulharRespostaDigai(
      paginaDeCandidatosFingida([resultadoDigaiFingido(), resultadoDigaiFingido({ userId: "usr-sintetico-2" })]),
    );
    expect(lista.length, "a lista da listagem de resultados chama-se `candidates`.").toBe(2);
    expect((conteudo as Record<string, unknown>).total).toBe(2);
  });

  it("desembrulha a lista de `screenings`, que e a outra rota de listagem", () => {
    const { lista } = desembrulharRespostaDigai(
      respostaDigaiFingida({ page: 1, total: 1, screenings: [{ id: "sc-sintetico-1" }] }),
    );
    expect(lista.length).toBe(1);
  });

  it("desembrulha o REGISTRO UNICO, que e o que a leitura por usuario devolve", () => {
    const { conteudo, lista } = desembrulharRespostaDigai(respostaDigaiFingida(resultadoDigaiFingido()));
    expect(lista, "registro unico nao e lista, e forcar uma lista aqui esconderia o caso real.").toEqual([]);
    expect(projetarResultadoDigai(conteudo)?.userId).toBe("usr-sintetico-1");
  });

  it("as formas que o codigo antigo aceitava NAO existem no fornecedor, e nao viram lista", () => {
    /*
     * Este teste guarda a regressao pelo lado de fora: se alguem reintroduzir `results` no topo
     * como se fosse o contrato, esta asercao denuncia que aquilo e invencao, e nao medicao.
     */
    expect(desembrulharRespostaDigai({ results: [resultadoDigaiFingido()] }).lista).toEqual([]);
    expect(
      desembrulharRespostaDigai([resultadoDigaiFingido()]).lista,
      "ARRAY NO TOPO era a ultima porta da tolerancia antiga, e e por ela que um duble mentiroso segue verde para sempre.",
    ).toEqual([]);
    expect(desembrulharRespostaDigai({ message: [], data: [resultadoDigaiFingido()] }).lista).toEqual([]);
    expect(desembrulharRespostaDigai({ message: [], data: {} }).lista).toEqual([]);
    expect(desembrulharRespostaDigai(null).lista).toEqual([]);
  });
});

describe("a leitura por usuario pede a rota v1, e o nome vem partido em dois", () => {
  /** O `fetch` global trocado por um dublê: nada sai para a rede, e a URL pedida fica registrada. */
  async function comFetchFingido(
    corpo: unknown,
    acao: (s: DigaiImportacaoService) => Promise<unknown>,
  ): Promise<{ urls: string[]; retorno: unknown }> {
    const urls: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (entrada: unknown) => {
      urls.push(String(entrada));
      return { ok: true, status: 200, json: async () => corpo } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;
    try {
      const { servico: s } = servico({ DIGAI_API_TOKEN: "token-sintetico-de-teste-000000" });
      return { urls, retorno: await acao(s) };
    } finally {
      globalThis.fetch = original;
    }
  }

  it("a rota do par e v1, porque a v2 devolve 404 nela (medido em 29/09/2026)", async () => {
    const { urls } = await comFetchFingido(respostaDigaiFingida(resultadoDigaiFingido()), (s) =>
      s.buscarRegistro({ screeningId: "sc-sintetico-1", userId: "usr-sintetico-1" }),
    );
    expect(urls[0]).toContain("/api/v1/public/screenings/sc-sintetico-1/users/usr-sintetico-1/results");
    expect(
      urls[0].includes("/api/v2/"),
      "a v2 desta rota devolve 404, e um 404 aqui nao para nada: faz a ingestao inteira parecer que evento nenhum chegou.",
    ).toBe(false);
  });

  it("o registro real atravessa a leitura, e o nome sai composto de `firstname` e `lastname`", async () => {
    const { retorno } = await comFetchFingido(respostaDigaiFingida(resultadoDigaiFingido()), (s) =>
      s.buscarRegistro({ screeningId: "sc-sintetico-1", userId: "usr-sintetico-1" }),
    );
    const registro = retorno as ResultadoDigai | null;
    expect(
      registro,
      "contra a resposta REAL a leitura antiga devolvia null para todo evento, e a ingestao saia por 'sem registro correspondente', sem escrever e sem falhar.",
    ).not.toBeNull();
    expect(
      registro?.name,
      "o campo `name` nao existe no fornecedor (0 de 58 registros medidos). Sem a composicao, todo candidato do Digai nasceria sem nome.",
    ).toBe("Fulano De Teste");
  });
});

describe("a projecao por allowlist acontece no caminho que a producao percorre", () => {
  it("o nome sai da juncao de `firstname` e `lastname`, e a ausencia dos dois e `null`", () => {
    const comOsDois = projetarResultadoDigai({ userId: "u1", firstname: "Fulano", lastname: "De Teste" });
    expect(comOsDois?.name, "a ordem e a da lingua, unidos por UM espaco.").toBe("Fulano De Teste");
    expect(
      projetarResultadoDigai({ userId: "u1", firstname: "Fulano" })?.name,
      "faltando um, vale o outro: meio nome ainda permite reconhecer a pessoa na fila de revisao.",
    ).toBe("Fulano");
    expect(projetarResultadoDigai({ userId: "u1", lastname: "De Teste" })?.name).toBe("De Teste");
    expect(
      projetarResultadoDigai({ userId: "u1" })?.name,
      "faltando os dois e `null`, e quem grava trata isso como sem identificacao minima, sem inventar rotulo.",
    ).toBeNull();
    expect(
      projetarResultadoDigai({ userId: "u1", firstname: " Fulano ", lastname: " De  Teste " })?.name,
      "o espaco interno e colapsado: nome com dois espacos no meio nao casa com o mesmo nome digitado no cadastro manual.",
    ).toBe("Fulano De Teste");
  });

  it("campo fora da allowlist nao sobrevive a projecao, inclusive `stages` e os de julgamento", () => {
    const cru = {
      userId: "usr-sintetico-9",
      partnerJobId: "1234567",
      firstname: "Fulano",
      lastname: "De Teste",
      cpf: null,
      email: null,
      phoneNumber: null,
      appliedAt: null,
      stages: [{ answer: "resposta da pessoa" }],
      disability: "informacao sensivel",
      matchPct: 87,
      /*
       * OS QUATRO ABAIXO SAO DO REGISTRO REAL, medidos em 29/09/2026, e sao o peso da allowlist:
       * `justification` tem 1.556 caracteres de julgamento sobre a pessoa, `attemptFeedback` 771, e
       * `curriculumUrl` e URL de curriculo, PII pura, que nao se persiste nem se loga (secao A.6).
       */
      justification: "parecer extenso sobre a pessoa",
      attemptFeedback: "devolutiva da tentativa",
      summarizedAnalysis: "analise resumida",
      curriculumUrl: "https://exemplo.invalido/curriculo.pdf",
    };
    const projetado = projetarResultadoDigai(cru) as unknown as Record<string, unknown>;
    expect(projetado, "o registro legitimo tem de passar.").not.toBeNull();
    for (const proibido of [
      "stages",
      "disability",
      "matchPct",
      "justification",
      "attemptFeedback",
      "summarizedAnalysis",
      "curriculumUrl",
    ]) {
      expect(
        Object.keys(projetado).includes(proibido),
        `'${proibido}' atravessou a projecao. O dado que nao chega ao dominio tambem nao chega ao banco, ao log nem a fila.`,
      ).toBe(false);
    }
  });

  it("registro sem identificador tecnico utilizavel nao vira registro nenhum", () => {
    expect(projetarResultadoDigai({ userId: "11122233396" })).toBeNull();
    expect(projetarResultadoDigai({ userId: "../outro" })).toBeNull();
    expect(projetarResultadoDigai(null)).toBeNull();
  });
});

describe("o de/para do Digai e o que a semente da migration 0133 escreve", () => {
  /**
   * A migration e SQL e nao importa TypeScript, entao a copia e inevitavel. O que mantem as duas
   * honestas e este teste: divergir aqui faz o resolvedor devolver NAO MAPEADA e a ingestao fica
   * fail-closed para sempre, sem nada falhar e sem ninguem descobrir.
   */
  it("as duas chaves sao as constantes do dominio, e as duas apontam para `CAPTACAO`", () => {
    expect(ETAPAS_DIGAI.map((e) => e.chaveExterna)).toEqual([
      ETAPA_DIGAI_NAO_FINALIZOU,
      ETAPA_DIGAI_FINALIZOU,
    ]);
    expect(ETAPAS_DIGAI.every((e) => e.etapaCodigo === "CAPTACAO")).toBe(true);
  });
});

// ── AS CINCO RESSALVAS DO `seguranca` (29/09/2026), CADA UMA COM O SEU TESTE ───────────────────

describe("E1: a situacao de nascimento NAO PODE consumir posicao, e agora isso e codigo", () => {
  /**
   * ┌─ O BURACO, e ele era inalcancavel hoje e catastrofico amanha ──────────────────────────────┐
   * │ A gravacao usava a situacao da LINHA do de/para, que e dado editavel por SQL cru, e o       │
   * │ comentario ao lado jurava que ela nao consumia posicao. A ocupacao da vaga e DERIVADA e     │
   * │ ninguem a valida: uma linha errada trancaria as vagas em massa SEM NADA FALHAR.             │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o proprio padrao de nascimento reprova em `consomePosicao`", () => {
    expect(
      consomePosicao(SITUACAO_NASCIMENTO_DIGAI),
      "triagem nao e entrega: a situacao padrao nao pode contar como posicao ocupada.",
    ).toBe(false);
  });

  it("situacao da linha que CONSOME posicao e descartada, e o nascimento volta ao padrao", () => {
    const r = situacaoDeNascimentoDigai("APROVADO");
    expect(r.situacao).toBe(SITUACAO_NASCIMENTO_DIGAI);
    expect(r.descartada, "quem grava precisa saber para avisar, senao a linha errada fica ignorada para sempre.").toBe(true);
  });

  it("situacao da linha que NAO consome posicao e respeitada, e a ausencia cai no padrao", () => {
    /* `DESCARTADO` nao consome posicao: a guarda so descarta o que TRANCARIA a vaga, e nao tudo. */
    expect(situacaoDeNascimentoDigai("DESCARTADO").situacao).toBe("DESCARTADO");
    expect(situacaoDeNascimentoDigai("DESCARTADO").descartada).toBe(false);
    expect(situacaoDeNascimentoDigai(null).situacao).toBe(SITUACAO_NASCIMENTO_DIGAI);
  });

  it("no caminho que a producao percorre, a candidatura nasce numa situacao que nao consome", async () => {
    const repo = repositorioFingido();
    repo.deParaEtapa = vi.fn(async () => ({
      etapaCodigo: "CAPTACAO",
      situacao: "APROVADO",
      ativo: true,
    })) as unknown as typeof repo.deParaEtapa;
    const { servico: s } = servico(
      { DIGAI_API_TOKEN: "token-sintetico-de-teste-000000", DIGAI_INGESTAO_ATIVA: "true" },
      repo,
    );
    await s.importar([REGISTRO]);
    const chamadas = repo.garantirCandidatura.mock.calls as unknown as { situacao: string }[][];
    const escrita = chamadas[0]?.[0];
    expect(
      escrita?.situacao !== undefined && consomePosicao(escrita.situacao as CandidaturaSituacao),
      "uma linha de de/para editada a mao nao pode trancar vaga: a situacao escrita reprova em `consomePosicao`.",
    ).toBe(false);
  });
});

describe("D2: ficha anonimizada nao ganha candidatura VIVA, nem quando o registro vem sem nome", () => {
  /**
   * O repositorio com a guarda de anonimizacao armada, que e o que a producao faz de verdade.
   *
   * A IDENTIDADE APARECE SO NA SEGUNDA LEITURA, e isso nao e truque de teste: e A CORRIDA. O plano
   * consulta a base antes de gravar, entao quem ja e conhecido nem chega a `gravar`. O caso que a
   * ressalva D2 descreve e exatamente o da linha que aparece ENTRE as duas leituras.
   */
  function repoComFichaAnonimizada() {
    const repo = repositorioFingido();
    let leituras = 0;
    repo.candidatoPorIdentidade = vi.fn(async () => {
      leituras += 1;
      return leituras === 1 ? null : { id: "44444444-4444-4444-8444-444444444444" };
    }) as unknown as typeof repo.candidatoPorIdentidade;
    repo.atualizarCandidato = vi.fn(async () => {
      throw new Error("Cadastro anonimizado pela retencao: a ingestao do Digai nao regrava dado pessoal.");
    }) as unknown as typeof repo.atualizarCandidato;
    return repo;
  }

  it("com nome vazio, a guarda RODA, e a candidatura nao chega a ser criada", async () => {
    /*
     * ANTES, `atualizarCandidato` so era chamado quando havia nome, e a guarda vivia dentro dele:
     * registro pobre passava ao largo e pendurava candidatura viva numa ficha expurgada. E
     * candidatura viva em vaga nao encerrada PROTEGE a pessoa do expurgo por tempo indefinido,
     * entao o efeito era desfazer o apagamento pelo lado.
     */
    const repo = repoComFichaAnonimizada();
    const { servico: s } = servico(
      { DIGAI_API_TOKEN: "token-sintetico-de-teste-000000", DIGAI_INGESTAO_ATIVA: "true" },
      repo,
    );
    await s.importar([{ ...REGISTRO, name: null }]);
    expect(repo.atualizarCandidato, "a guarda precisa ser ALCANCADA, e e ela que recusa.").toHaveBeenCalled();
    expect(
      repo.escritas.includes("garantirCandidatura"),
      "linha expurgada nao volta para uma fila viva.",
    ).toBe(false);
  });

  it("com nome, o comportamento e o mesmo: recusou, nada de candidatura", async () => {
    const repo = repoComFichaAnonimizada();
    const { servico: s } = servico(
      { DIGAI_API_TOKEN: "token-sintetico-de-teste-000000", DIGAI_INGESTAO_ATIVA: "true" },
      repo,
    );
    await s.importar([REGISTRO]);
    expect(repo.escritas.includes("garantirCandidatura")).toBe(false);
  });
});

describe("D1: `anexarIdentidade` tambem carrega a clausula de anonimizacao", () => {
  it("o insert e condicionado a ficha NAO anonimizada, no proprio SQL", () => {
    const fonte = readFileSync(join(__dirname, "digai-repositorio.ts"), "utf8");
    const trecho = fonte.slice(fonte.indexOf("async anexarIdentidade"));
    const corpo = trecho.slice(0, trecho.indexOf("\n  }"));
    expect(
      /anonimizado_em is null/.test(corpo),
      "era o UNICO insert do modulo sem a clausula: na janela entre a leitura e a escrita ele recriava identidade externa numa ficha recem-anonimizada.",
    ).toBe(true);
    expect(
      /where exists/i.test(corpo),
      "a condicao tem de ser ATOMICA com a escrita: um `if` em TypeScript antes do insert e a mesma corrida com mais linhas.",
    ).toBe(true);
  });
});

describe("A ULTIMA JANELA: `garantirCandidatura` tambem carrega a clausula de anonimizacao", () => {
  /*
   * ┌─ POR QUE ESTE TESTE TIRA OS COMENTARIOS ANTES DE ASSERIR ────────────────────────────────────┐
   * │ O bloco que explica a clausula CITA a clausula, entao uma varredura crua de fonte casaria o  │
   * │ COMENTARIO e ficaria verde mesmo que alguem apagasse o SQL. Verde que nao pode falhar nao e  │
   * │ cobertura, e ja custou tres falsos vermelhos e um falso verde nesta casa. Tira-se o          │
   * │ comentario primeiro, e so entao se afirma.                                                   │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * A JANELA QUE ISTO FECHA: `atualizarCandidato` ja recusa ficha anonimizada, mas roda ANTES desta
   * linha. Entre os dois, a passada do expurgo pode anonimizar a ficha, e a candidatura VIVA
   * nasceria apontando para ela. Candidatura viva em vaga nao encerrada protege a pessoa do expurgo
   * PARA SEMPRE: o relogio de retencao nunca mais volta a correr.
   */
  it("o insert da candidatura e condicionado a ficha NAO anonimizada, no proprio SQL", () => {
    const fonte = readFileSync(join(__dirname, "digai-repositorio.ts"), "utf8");
    /*
     * O CORTE NAO PODE SER O PRIMEIRO `\n  }`: a assinatura deste metodo recebe um OBJETO, e a
     * chave que o fecha esta na mesma indentacao do fim do metodo, entao aquele corte devolveria
     * so a lista de parametros e o teste ficaria vermelho por motivo errado (foi o que aconteceu).
     * O corte e o proximo metodo, ou o fim da classe.
     */
    const trecho = fonte.slice(fonte.indexOf("async garantirCandidatura"));
    const proximo = trecho.indexOf("\n  async ");
    const fimDaClasse = trecho.indexOf("\n}");
    const limites = [proximo, fimDaClasse].filter((i) => i > 0);
    const corpo = trecho.slice(0, Math.min(...limites));
    const semComentario = corpo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    expect(
      /anonimizado_em is null/.test(semComentario),
      "sem a clausula, a candidatura viva nasce numa ficha ja expurgada e a pessoa nunca mais expira.",
    ).toBe(true);
    expect(
      /where exists/i.test(semComentario),
      "a condicao tem de ser ATOMICA com a escrita: um `if` em TypeScript antes do insert e a mesma corrida com mais linhas.",
    ).toBe(true);
    expect(
      /insert into as_candidaturas[\s\S]*?select/i.test(semComentario),
      "`insert ... values` nao aceita `where exists`: a forma tem de ser `insert ... select`.",
    ).toBe(true);
    expect(
      /RECUSADA/.test(semComentario),
      "zero linha aqui NAO e erro de banco, e a mensagem tem de dizer que foi recusa, senao quem le o log procura defeito onde houve protecao.",
    ).toBe(true);
  });
});

describe("A1 e A2: a camada 2 da mascara, e o que ela alcanca e o que nao alcanca", () => {
  it("telefone FORMATADO nao sobrevive, e ele atravessava inteiro", () => {
    /*
     * `\d{8,}` so alcanca o telefone COLADO, e `(11) 98765-4321` nao tem nenhuma corrida de oito
     * digitos. Era a grafia mais provavel de aparecer numa frase escrita por gente.
     */
    for (const forma of ["(11) 98765-4321", "11 98765-4321", "+55 11 98765-4321", "98765-4321"]) {
      /*
       * A CAMADA 2 CONTINUA SENDO EXERCITADA, e agora pela porta que sobrou: o VALOR de um campo
       * SEGURO. `appliedAt` esta na lista exata, entao a camada 1 o deixa passar inteiro, e quem
       * tem de alcancar o telefone escrito ali dentro e a redacao por forma. E o caso real: um
       * campo tecnico que um dia vem com texto de gente dentro.
       */
      expect(
        mascararParaLog({ appliedAt: `contato do candidato: ${forma}` }).includes("4321"),
        `o telefone '${forma}' sobreviveu a mascara.`,
      ).toBe(false);
    }
  });

  it("o erro sem `code` tambem passa pela camada 2, que e o unico funil que lhe resta", () => {
    const saida = traduzirErroDeBanco(new Error("falhou ao contatar (11) 98765-4321"));
    expect(saida.includes("4321"), "erro sem codigo cai so na camada 2, entao ela tem de alcancar as formas.").toBe(false);
  });

  it("A PORTA DA MASCARA NAO ACEITA VALOR SOLTO DO FORNECEDOR, e isso e MECANISMO", () => {
    /*
     * ┌─ O ACHADO DO `seguranca` (29/09/2026), e por que o teste e escrito assim ─────────────────┐
     * │ `mascararParaLog(entrada: unknown)` era uma arma carregada sem dono: a camada 2            │
     * │ (`redigirPorForma`) NAO ALCANCA NOME, entao texto solto do fornecedor passaria INTEIRO. A  │
     * │ garantia de que ninguem faria isso era DISCIPLINA, porque o unico chamador do caminho de   │
     * │ string (`resumirParaLog`) nao tinha consumidor nenhum.                                      │
     * │                                                                                            │
     * │ ESTE TESTE MORRE SOB MUTACAO. Devolver o caminho antigo (`redigirPorForma(entrada)` para   │
     * │ string) faz "Fulano De Teste" SOBREVIVER, e a primeira asercao fica vermelha na hora. Nao  │
     * │ se procura o placeholder na saida: procura-se o VALOR, que foi a licao do verde falso de   │
     * │ 16/09 (o placeholder estava la, e o valor impresso ao lado).                                │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const solto = "candidato Fulano De Teste, telefone 11900000001" as unknown as Record<
      string,
      unknown
    >;
    const saida = mascararParaLog(solto);
    for (const valor of ["Fulano", "De Teste", "11900000001"]) {
      expect(
        saida.includes(valor),
        `'${valor}' sobreviveu ao caminho de texto solto. O que a camada 1 nao pode INSPECIONAR campo a campo nao sai daqui.`,
      ).toBe(false);
    }
    expect(
      saida,
      "o que nao e estrutura e suprimido POR INTEIRO: redigir por forma um texto que ninguem inspecionou seria teatro.",
    ).toBe("[suprimido]");
  });

  it("nem numero, nem `null`, nem `undefined` atravessam: a recusa e de TUDO que nao e estrutura", () => {
    for (const hostil of [null, undefined, 123, true, Symbol("x")]) {
      expect(mascararParaLog(hostil as unknown as Record<string, unknown>)).toBe("[suprimido]");
    }
  });

  it("a estrutura continua passando, senao a correcao teria cegado a mascara", () => {
    /*
     * A trava so vale se a porta CERTA continuar aberta: mascara que nao mascara nada e tao inutil
     * quanto mascara que deixa passar, e vira o proximo `logger.error(err)` cru.
     */
    const saida = mascararParaLog({ userId: "usr-sintetico-9", cpf: "11122233396" });
    expect(saida.includes("usr-sintetico-9"), "campo tecnico da lista exata continua legivel.").toBe(
      true,
    );
    expect(saida.includes("11122233396"), "campo fora da lista exata tem o VALOR suprimido.").toBe(
      false,
    );
    expect(mascararParaLog([{ email: "fulano.teste@exemplo.invalido" }]).includes("fulano")).toBe(
      false,
    );
  });

  it("`resumirParaLog` NAO VOLTOU, nem com este nome nem com outro que aceite `unknown`", () => {
    /*
     * ┌─ A PROVA DE QUE A PORTA ANTIGA NAO REABRIU ───────────────────────────────────────────────┐
     * │ Remover a funcao nao impede que ela volte amanha com outro nome, e o defeito nao e o NOME: │
     * │ e uma porta de LOG que aceite `unknown` e delegue a mascara, porque e ela que reabre o      │
     * │ caminho de string. Entao a asercao e sobre a FORMA do fonte, e nao sobre o simbolo.        │
     * │                                                                                            │
     * │ COMENTARIO E TIRADO ANTES DE ASSERIR: este modulo ja teve tres falsos vermelhos por        │
     * │ varredura que casava a palavra dentro do proprio bloco que a explicava.                    │
     * └────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const fonte = readFileSync(join(__dirname, "digai-importacao.service.ts"), "utf8");
    const semComentario = fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(
      /resumirParaLog/.test(semComentario),
      "a porta sem dono nao pode voltar: ela dava passagem ao caminho de string da mascara.",
    ).toBe(false);
    expect(
      /mascararParaLog/.test(semComentario),
      "o servico nao volta a chamar a mascara sem um consumidor que justifique a chamada.",
    ).toBe(false);
    expect(
      /\(\s*\w+\s*:\s*unknown\s*\)\s*:\s*string/.test(semComentario),
      "nenhuma porta de log que aceite `unknown` e devolva texto: e essa a forma da arma carregada, nao o nome dela.",
    ).toBe(false);
  });

  it("NOME so e alcancado pelo caminho de OBJETO, e essa e a regra de uso da mascara", () => {
    /*
     * ┌─ O LIMITE E ESTRUTURAL, e o teste existe para que ele fique ESCRITO ─────────────────────┐
     * │ Nome NAO TEM FORMA: nenhuma expressao regular o distingue de texto comum, e heuristica de │
     * │ maiusculas comeria as mensagens que a casa escreve. Quem alcanca nome e a camada 1, por   │
     * │ SUPRESSAO DE CAMPO, que so existe no caminho de OBJETO. Logo o caminho de STRING so aceita │
     * │ texto de CONFIGURACAO NOSSA, e valor do fornecedor se mascara como OBJETO, sempre.        │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    expect(
      mascararParaLog({ firstname: "Fulano", lastname: "De Teste" }).includes("Fulano"),
      "no caminho de objeto, o campo fora da lista exata tem o VALOR suprimido, e e assim que o nome e alcancado.",
    ).toBe(false);
  });
});

describe("A3: o erro que ESCAPA do worker passa pelo funil antes de o BullMQ o persistir", () => {
  /**
   * ┌─ O COMENTARIO PROMETIA ALCANCE QUE O CODIGO NAO TINHA ─────────────────────────────────────┐
   * │ A traducao acontecia so no listener `failed`, que escreve no NOSSO log. O que o BullMQ      │
   * │ PERSISTE no `failedReason`, no Redis, e o `err.message` CRU do que escapa de `processar`, e │
   * │ o `detail` do driver do Postgres carrega o VALOR que violou a restricao. A superficie que   │
   * │ dura mais (Redis, sem TTL, fora do expurgo) era justamente a que ficava sem dono.           │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o `detail` do driver nao atravessa: o job falha com a mensagem TRADUZIDA", async () => {
    const erroDoDriver = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint_name: "as_candidatos_cpf_key",
      detail: `Key (cpf)=(${"11122233396"}) already exists.`,
    });
    const importacao = {
      ativa: false,
      processarEvento: vi.fn(async () => {
        throw erroDoDriver;
      }),
    } as unknown as ConstructorParameters<typeof DigaiFilaService>[1];
    // A varredura entrou no construtor com o polling (29/09). Ela NAO participa deste caminho: o
    // job aqui e `JOB_EVENTO_DIGAI`, do webhook, e o duble existe so para o construtor fechar.
    const varredura = {} as unknown as ConstructorParameters<typeof DigaiFilaService>[2];
    const fila = new DigaiFilaService(
      { get: () => undefined } as unknown as ConfigService,
      importacao,
      varredura,
    );

    const executar = (fila as unknown as { processar: (j: unknown) => Promise<void> }).processar.bind(fila);
    await expect(
      executar({ name: JOB_EVENTO_DIGAI, data: { screeningId: "sc1", userId: "usr-sintetico-1" } }),
    ).rejects.toThrow();

    const capturado = await executar({
      name: JOB_EVENTO_DIGAI,
      data: { screeningId: "sc1", userId: "usr-sintetico-1" },
    }).catch((e: unknown) => (e as Error).message);
    expect(
      String(capturado).includes("11122233396"),
      "o valor que violou a restricao chegaria ao `failedReason`, que vive no Redis sem TTL e fora do alcance do expurgo.",
    ).toBe(false);
    expect(String(capturado)).toBe(traduzirErroDeBanco(erroDoDriver));
  });
});
