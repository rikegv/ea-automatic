import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiRepositorio } from "./digai-repositorio";
import { separarPorFinalizacaoDigai, type ResultadoDigai } from "../../domain/digai";

/**
 * ─ A ORDEM DAS CHAVES DO DEDUP DO DIGAI, E ELA E A PROPRIEDADE CENTRAL ─────────────────────────
 *
 * Teste do `tester`, escrito ANTES do codigo (secao A.40, regra 2), a partir do REQUISITO e do mapa
 * de alcance (`docs/MAPA-DEDUP-DIGAI-CHAVES.md`). Outro agente constroi.
 *
 * A CONDICAO DO DIRETOR ORDENA TUDO: falso positivo e PIOR que duplicata. Fundir duas pessoas
 * diferentes e irreversivel, porque depois ninguem sabe mais qual candidatura era de quem. Entao
 * toda assercao daqui tem o mesmo formato: na duvida, NAO FUNDE.
 *
 * A REGUA, nos quatro degraus, e cada um so e consultado quando o de cima nao decidiu:
 *   1. identidade externa (`as_identidades_externas`, par fonte + `userId`)
 *   2. CPF (`candidatoPorDocumento`)
 *   3. E-MAIL (`candidatoPorEmail`, o degrau NOVO)
 *   4. ninguem: cria ficha nova
 *
 * ┌─ O CONTRATO QUE ESTE ARQUIVO FIXA PARA QUEM CONSTROI ────────────────────────────────────────┐
 * │ O degrau 3 e um metodo do repositorio chamado `candidatoPorEmail(valor: string)`, que devolve  │
 * │ `{ id } | null`, no MOLDE EXATO de `candidatoPorDocumento`. O duble abaixo oferece esse nome;  │
 * │ implementacao com outro nome faz estes testes falharem, e e de proposito: o vocabulario do     │
 * │ dedup e uma so palavra, e nao uma por camada.                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IDEMPOTENCIA: NAO se duplica cobertura aqui. Ela ja esta provada em
 * `digai.funil-e-contagem.tester.spec.ts:467` (o plano, dominio puro),
 * `digai.contrato-real.tester.spec.ts:914` (o servico, reentrega do mesmo evento) e
 * `digai.webhook-e-teto.tester.spec.ts:324` (o receptor).
 *
 * §A.6: todo valor com cara de pessoa aqui e SINTETICO. Os CPFs tem verificador valido (senao o
 * portao de admissao recusaria o registro e o teste passaria pelo motivo errado) e os e-mails usam
 * o TLD reservado `.invalido`.
 */

// ── AS FICHAS SINTETICAS: A, B e a nova ────────────────────────────────────────────────────────

const PESSOA_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PESSOA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FICHA_NOVA = "11111111-1111-4111-8111-111111111111";

/** CPF sintetico com digito verificador valido: sem ele o registro nem entra na ingestao. */
const CPF_VALIDO = "11122233396";
const EMAIL = "pessoa.sintetica@exemplo.invalido";

const REGISTRO: ResultadoDigai = {
  userId: "usr-sintetico-dedup-1",
  partnerJobId: "1234567",
  name: "Fulano De Teste",
  cpf: CPF_VALIDO,
  email: EMAIL,
  phoneNumber: "11900000001",
  appliedAt: "2026-09-10T12:00:00.000Z",
};

/**
 * O repositorio como duble. Ele ANOTA o que seria escrito e nunca escreve.
 *
 * As chaves PROIBIDAS (`candidatoPorTelefone`, `candidatoPorNome`, `candidatoPorNomeEVaga`) estao
 * aqui de PROPOSITO, e casando com alguem: se um dia alguem as ligar, o teste da secao 4 pega a
 * fusao no ato, em vez de esperar a producao fundir 13.480 pares de pessoas diferentes.
 */
function repositorioFingido(opcoes: {
  porIdentidade?: () => { id: string } | null;
  porDocumento?: string | null;
  porEmail?: string | null;
  /** Um duble HOSTIL de e-mail: casa QUALQUER coisa, inclusive lixo. Serve ao fail-closed. */
  emailCasaQualquerCoisa?: boolean;
}) {
  const escritas: { metodo: string; args: unknown[] }[] = [];
  const anotar =
    (metodo: string) =>
    (...args: unknown[]) => {
      escritas.push({ metodo, args });
    };
  return {
    escritas,
    deParaEtapa: vi.fn(async () => ({ etapaCodigo: "CAPTACAO", situacao: null, ativo: true })),
    candidatoPorIdentidade: vi.fn(async () => (opcoes.porIdentidade ?? (() => null))()),
    candidatoPorDocumento: vi.fn(async () =>
      opcoes.porDocumento ? { id: opcoes.porDocumento } : null,
    ),
    candidatoPorEmail: vi.fn(async (valor: string) => {
      if (opcoes.emailCasaQualquerCoisa === true) return { id: PESSOA_B };
      return opcoes.porEmail && valor === EMAIL ? { id: opcoes.porEmail } : null;
    }),
    // ── AS TRES CHAVES PROIBIDAS, armadas para denunciar quem as usar ──
    candidatoPorTelefone: vi.fn(async () => ({ id: PESSOA_B })),
    candidatoPorNome: vi.fn(async () => ({ id: PESSOA_B })),
    candidatoPorNomeEVaga: vi.fn(async () => ({ id: PESSOA_B })),
    criarCandidato: vi.fn(async (...args: unknown[]) => {
      anotar("criarCandidato")(...args);
      return { id: FICHA_NOVA };
    }),
    atualizarCandidato: vi.fn(async (...args: unknown[]) => {
      anotar("atualizarCandidato")(...args);
      return { linhasAfetadas: 1 };
    }),
    anexarIdentidade: vi.fn(async (...args: unknown[]) => {
      anotar("anexarIdentidade")(...args);
    }),
    registrarConflito: vi.fn(async (...args: unknown[]) => {
      anotar("registrarConflito")(...args);
    }),
    espelharVaga: vi.fn(async (...args: unknown[]) => {
      anotar("espelharVaga")(...args);
      return { id: "22222222-2222-4222-8222-222222222222" };
    }),
    garantirCandidatura: vi.fn(async (...args: unknown[]) => {
      anotar("garantirCandidatura")(...args);
      return { criada: true, id: "33333333-3333-4333-8333-333333333333" };
    }),
  };
}

const AMBIENTE_LIGADO = { DIGAI_API_TOKEN: "token-sintetico-de-teste-000000", DIGAI_INGESTAO_ATIVA: "true" };

function montar(repo: ReturnType<typeof repositorioFingido>) {
  const config = { get: <T,>(c: string) => (AMBIENTE_LIGADO as Record<string, string>)[c] as unknown as T } as ConfigService;
  return new DigaiImportacaoService(config, repo as unknown as DigaiRepositorio);
}

/** A quem a candidatura foi pendurada: e este o id que o dedup RESOLVEU. */
function pessoaResolvida(repo: ReturnType<typeof repositorioFingido>): string | null {
  const linha = repo.escritas.find((e) => e.metodo === "garantirCandidatura");
  if (linha === undefined) return null;
  return (linha.args[0] as { candidatoId: string }).candidatoId;
}

function chamou(repo: ReturnType<typeof repositorioFingido>, metodo: string): number {
  return repo.escritas.filter((e) => e.metodo === metodo).length;
}

// ── 1. OS QUATRO DEGRAUS, E CADA UM NO SEU LUGAR ───────────────────────────────────────────────

describe("1. A ORDEM DAS CHAVES: identidade, CPF, e-mail, e so entao ficha nova", () => {
  it("DEGRAU 1, identidade externa conhecida: o registro e IGNORADO e o e-mail nem e consultado", async () => {
    const repo = repositorioFingido({ porIdentidade: () => ({ id: PESSOA_A }), porEmail: PESSOA_B });
    const r = await montar(repo).importar([REGISTRO]);
    expect(r.ignorados, "quem a base ja conhece pela identidade nao e reescrito a cada volta.").toBe(1);
    expect(chamou(repo, "criarCandidato"), "identidade conhecida NUNCA cria ficha nova.").toBe(0);
    expect(
      repo.candidatoPorEmail.mock.calls.length,
      "o degrau de baixo nao e consultado quando o de cima decidiu: a identidade ja resolveu.",
    ).toBe(0);
  });

  it("DEGRAU 2, sem identidade e o CPF casa: ANEXA a identidade a quem ja existe, e nao cria", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A });
    await montar(repo).importar([REGISTRO]);
    expect(pessoaResolvida(repo), "o CPF e o desempate primario, e ele aponta para A.").toBe(PESSOA_A);
    expect(chamou(repo, "criarCandidato"), "casou por CPF, logo a pessoa JA existe.").toBe(0);
    expect(
      repo.anexarIdentidade.mock.calls[0]?.[0],
      "a identidade nova e pendurada em A, senao a mesma pessoa vira duas fichas.",
    ).toBe(PESSOA_A);
  });

  it("DEGRAU 3, sem identidade e sem CPF casado, o E-MAIL casa: reusa a ficha, NAO cria outra", async () => {
    /*
     * ESTE E O DEGRAU NOVO, e e ele que derruba as 18.722 duplicatas medidas: 82% da populacao do
     * Digai JA ESTA na plataforma e 84% dela nao tem CPF, entao sem este degrau a ingestao cria uma
     * segunda ficha para gente que ja tem uma, cada uma com o seu historico e o seu relogio.
     */
    const repo = repositorioFingido({ porEmail: PESSOA_B });
    await montar(repo).importar([REGISTRO]);
    expect(
      repo.candidatoPorEmail.mock.calls[0]?.[0],
      "o e-mail do registro e o que vai a consulta, e nao outro valor qualquer.",
    ).toBe(EMAIL);
    expect(pessoaResolvida(repo), "o e-mail desempatou, e a pessoa e B.").toBe(PESSOA_B);
    expect(chamou(repo, "criarCandidato"), "casou por e-mail, logo a ficha nova e a duplicata que se quer evitar.").toBe(0);
    expect(
      repo.anexarIdentidade.mock.calls[0]?.[0],
      "sem anexar a identidade, a proxima volta nao acha ninguem e o degrau 3 paga a consulta de novo para sempre.",
    ).toBe(PESSOA_B);
    /*
     * ─ A GUARDA DO VETO V-2, QUE VIVIA SO EM COMENTARIO (achado da auditoria, 02/10/2026) ───────
     *
     * O degrau do e-mail SO ANEXA A IDENTIDADE: ele NAO chama `atualizarCandidato`. Isso estava
     * certo no ramo e escrito em quadro proprio no servico, e NAO TINHA TESTE: reinserir a chamada
     * deixava a suite inteira verde. Guarda que sobreviveu a um veto nao pode depender de alguem
     * reler o comentario antes de editar.
     *
     * O QUE A CHAMADA FARIA AQUI, e por isso ela e proibida: `atualizarCandidato` grava
     * `cpf = coalesce(cpf, novo)`, entao o CPF do registro viraria dado da ficha de OUTRA pessoa.
     * `uq_as_candidatos_cpf` e UNIQUE, logo a ficha VERDADEIRA daquele CPF nunca mais nasceria
     * (23505 capturado, registro pulado em todo ciclo, sem alarme), e `candidatoPorDocumento`
     * passaria a devolver ficha ERRADA, ou seja o degrau MAIS FORTE comecaria a mentir.
     *
     * Quem casou aqui foi a chave MAIS FRACA, e chave fraca nao reescreve identidade de terceiro.
     */
    expect(
      chamou(repo, "atualizarCandidato"),
      "O DEGRAU DO E-MAIL NAO ESCREVE DADO. Escrever `cpf` ou nome por decisao da chave mais fraca " +
        "envenena `uq_as_candidatos_cpf` e faz o degrau do CPF mentir dali para frente.",
    ).toBe(0);
    expect(
      repo.escritas.filter((e) => JSON.stringify(e.args).includes(CPF_VALIDO)).length,
      "o CPF do registro NAO pode viajar em escrita nenhuma deste caminho, por nome de metodo " +
        "nenhum: a trava e sobre o VALOR, senao um metodo novo reabre a porta.",
    ).toBe(0);
  });

  it("DEGRAU 4, nenhuma chave casa: cria ficha nova e anexa a identidade a ela", async () => {
    const repo = repositorioFingido({});
    await montar(repo).importar([REGISTRO]);
    expect(chamou(repo, "criarCandidato"), "ninguem casou: a pessoa e nova de verdade.").toBe(1);
    expect(pessoaResolvida(repo)).toBe(FICHA_NOVA);
    expect(repo.anexarIdentidade.mock.calls[0]?.[0]).toBe(FICHA_NOVA);
  });

  it("O DEGRAU DE CIMA VENCE O DE BAIXO: identidade aponta A, e-mail aponta B, e vale A", async () => {
    /*
     * A identidade aparece na SEGUNDA leitura, e nao na primeira: e assim que o ramo de identidade
     * de `resolverPessoa` e alcancado pela porta publica (na primeira leitura o registro seria
     * IGNORADO antes de chegar la). E tambem a CORRIDA real: a identidade pode nascer entre as duas
     * leituras, por outra entrega do mesmo `userId`.
     */
    let volta = 0;
    const repo = repositorioFingido({
      porIdentidade: () => {
        volta += 1;
        return volta === 1 ? null : { id: PESSOA_A };
      },
      porEmail: PESSOA_B,
    });
    await montar(repo).importar([REGISTRO]);
    expect(
      pessoaResolvida(repo),
      "REORDENAR AS CHAVES QUEBRA AQUI: a identidade externa e a chave mais forte, e o e-mail nao a derruba.",
    ).toBe(PESSOA_A);
    expect(chamou(repo, "criarCandidato")).toBe(0);
    const tocouB = repo.escritas.some((e) => JSON.stringify(e.args).includes(PESSOA_B));
    expect(tocouB, "a ficha que o degrau de baixo apontou NAO pode ser escrita nem fundida.").toBe(false);
  });

  it("O E-MAIL E DESEMPATE, NUNCA CHAVE PRIMARIA: o CPF e consultado antes dele", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A, porEmail: PESSOA_B });
    await montar(repo).importar([REGISTRO]);
    expect(
      repo.candidatoPorDocumento.mock.calls.length,
      "o CPF tem de ser perguntado: ele e a chave mais forte depois da identidade.",
    ).toBeGreaterThan(0);
    expect(pessoaResolvida(repo), "entre CPF e e-mail, o CPF decide.").not.toBe(PESSOA_B);
  });
});

// ── 2. O FAIL-CLOSED DO E-MAIL, NO MOLDE DO CPF, VISTO DO LADO DO SERVICO ──────────────────────

describe("2. FAIL-CLOSED: e-mail que nao presta NAO desempata, e a ingestao segue para criar ficha nova", () => {
  /*
   * O duble aqui e HOSTIL: ele casa QUALQUER coisa, inclusive lixo. E o unico jeito de provar que
   * quem decide "este e-mail serve para desempatar?" e a REGUA (dominio, secao do mapa de alcance),
   * e nao a sorte de a consulta nao achar nada. Com o duble honesto, o teste passaria de graca.
   *
   * O precedente e o do CPF: `documentoParaBanco` recusa o lixo ANTES da consulta, porque um
   * `00000000000` repetido no ATS casaria pessoas DIFERENTES entre si.
   */
  const LIXO: Array<[string, string]> = [
    ["vazio", ""],
    ["so espacos", "   "],
    ["sem arroba", "pessoa.sintetica.exemplo.invalido"],
    ["sem dominio", "pessoa.sintetica@"],
    ["sem parte local", "@exemplo.invalido"],
    ["duas arrobas", "pessoa@@exemplo.invalido"],
    ["com espaco no meio", "pessoa sintetica@exemplo.invalido"],
  ];

  for (const [rotulo, valor] of LIXO) {
    it(`e-mail ${rotulo} nao casa com ninguem, e a ficha nova nasce`, async () => {
      const repo = repositorioFingido({ emailCasaQualquerCoisa: true });
      await montar(repo).importar([{ ...REGISTRO, email: valor }]);
      expect(
        pessoaResolvida(repo),
        "FUNDIR POR E-MAIL INVALIDO E IRREVERSIVEL: um e-mail que nao presta casaria pessoas diferentes entre si.",
      ).not.toBe(PESSOA_B);
      expect(chamou(repo, "criarCandidato"), "nao desempatou, logo o fluxo segue para o degrau 4.").toBe(1);
    });
  }

  it("e-mail AUSENTE (`null`) nao desempata, igual ao CPF ausente", async () => {
    const repo = repositorioFingido({ emailCasaQualquerCoisa: true });
    await montar(repo).importar([{ ...REGISTRO, email: null }]);
    expect(pessoaResolvida(repo)).not.toBe(PESSOA_B);
    expect(chamou(repo, "criarCandidato")).toBe(1);
  });
});

// ── 3. A COLISAO ENTRE CHAVES: ABSTER, E REGISTRAR A DIVERGENCIA ───────────────────────────

describe("3. COLISAO: o CPF aponta A e o e-mail aponta B, e sao fichas DIFERENTES", () => {
  it("a ingestao ABSTEM: nao escolhe, nao escreve, e nao resolve ninguem", async () => {
    /*
     * ─ ABSTER, E NAO DEIXAR O CPF VENCER (emenda E-5 do mapa de alcance) ───────────────────
     *
     * O REQUISITO QUE ORIGINOU ESTE TESTE DIZIA "o CPF vence, escreve, e registra o conflito", E ELE
     * ESTAVA ERRADO. Na colisao existe EVIDENCIA POSITIVA de que as duas chaves apontam para duas
     * pessoas DIFERENTES e identificadas: escolher qualquer uma das duas e ADIVINHAR, e fundir
     * pessoa errada nao se desfaz. E o mesmo gesto que o ramo vizinho (identidade contra documento)
     * ja faz, e e a ordem do diretor levada a serio: falso positivo e PIOR que duplicata.
     *
     * NAO E CASO TEORICO: 121 colisoes REAIS medidas na producao, entre 3.723 registros em que as
     * duas chaves casam. Sem a abstencao, seriam 121 fusoes irreversiveis de pessoas diferentes.
     *
     * ┌─ AMBIGUIDADE NAO E COLISAO, E A DISTINCAO E SUTIL ─────────────────────────────────┐
     * │ Quando o E-MAIL casa DUAS fichas e o CPF casou UMA, o CPF VENCE: ele e unico no banco, o   │
     * │ casamento dele e exato, e a ambiguidade do e-mail e RUIDO, nao evidencia de que sejam duas  │
     * │ pessoas. Abster ali bloquearia aquele registro para sempre, em silencio.                    │
     * │                                                                                            │
     * │ Aquele caso tem teste PROPRIO, do agente que construiu, e este bloco nao o contradiz: aqui │
     * │ cada chave casa UMA ficha, e sao fichas distintas e identificadas.                          │
     * └─────────────────────────────────────────────────────────────────────────────┘
     */
    const repo = repositorioFingido({ porDocumento: PESSOA_A, porEmail: PESSOA_B });
    await montar(repo).importar([REGISTRO]);
    expect(
      pessoaResolvida(repo),
      "ABSTER: com duas chaves apontando para duas pessoas identificadas, a ingestao NAO escolhe nenhuma.",
    ).toBeNull();
    for (const metodo of ["criarCandidato", "atualizarCandidato", "anexarIdentidade", "garantirCandidatura"]) {
      expect(
        chamou(repo, metodo),
        `NADA E ESCRITO na colisao, e '${metodo}' tambem nao: escrever em A ja seria ter escolhido A.`,
      ).toBe(0);
    }
    /*
     * A VARREDURA EXCLUI `registrarConflito` DE PROPOSITO, e nao por conveniencia: a linha de
     * conflito PRECISA apontar para uma ficha (`candidato_id` e NOT NULL), entao o id de A aparece
     * nos argumentos dela sem que nada tenha sido escrito NA ficha. Varrer tudo confundiria o
     * registro da duvida com a resolucao dela, que e exatamente a diferenca que este teste mede.
     */
    const ESCRITAS_NA_FICHA = ["criarCandidato", "atualizarCandidato", "anexarIdentidade", "garantirCandidatura"];
    const tocouAlgumaFicha = repo.escritas
      .filter((e) => ESCRITAS_NA_FICHA.includes(e.metodo))
      .some((e) => [PESSOA_A, PESSOA_B].some((id) => JSON.stringify(e.args).includes(id)));
    expect(
      tocouAlgumaFicha,
      "FUNDIR A COM B E O DANO IRREVERSIVEL QUE ESTA FRENTE EXISTE PARA EVITAR: nenhuma das duas fichas e tocada.",
    ).toBe(false);
  });

  it("a divergencia e REGISTRADA como conflito, e nunca silenciada", async () => {
    /*
     * `as_ingestao_conflitos` ja existe e o Digai ja a usa para a colisao identidade contra
     * documento. Decidir sem avisar seria perder, a cada volta, um caso que alguem precisa olhar.
     */
    const repo = repositorioFingido({ porDocumento: PESSOA_A, porEmail: PESSOA_B });
    await montar(repo).importar([REGISTRO]);
    expect(
      repo.registrarConflito.mock.calls.length,
      "duas chaves apontando para pessoas diferentes e exatamente o caso que pede revisao humana.",
    ).toBe(1);
    expect(
      repo.registrarConflito.mock.calls[0]?.[1],
      "o identificador do conflito e o `userId`, que e a chave estavel do registro.",
    ).toBe(REGISTRO.userId);
  });

  it("sem colisao NAO ha conflito: o caminho normal nao enche a fila de revisao", async () => {
    const repo = repositorioFingido({ porDocumento: PESSOA_A, porEmail: PESSOA_A });
    await montar(repo).importar([REGISTRO]);
    expect(
      repo.registrarConflito.mock.calls.length,
      "as duas chaves apontando para a MESMA ficha e concordancia, nao divergencia.",
    ).toBe(0);
  });
});

// ── 4. O QUE NAO PODE VIRAR CHAVE DE FUSAO, EM COMPORTAMENTO ──────────────────────────────────

describe("4. TELEFONE, NOME e NOME + VAGA nunca fundem ficha", () => {
  /*
   * MEDIDO em 02/10/2026: o telefone casa 15.786 pares, e em 13.480 deles o nome E o CPF sao
   * DIFERENTES, ou seja pessoas diferentes (familia, telefone do recrutador, numero padrao). Nome
   * sozinho casa 2.627 homonimos. Nome + vaga tem 245 pares em que os DOIS lados tem CPF e os CPFs
   * DIFEREM: sao homonimos na mesma vaga.
   *
   * NOME + VAGA + TELEFONE acerta 98,6%, e ainda assim NAO FUNDE: os 14 erros sao irreversiveis. A
   * combinacao serve de SINAL (conflito para revisao), nunca de decisao.
   */
  it("o registro cujo telefone e nome casariam alguem, mas cujo e-mail e CPF nao casam, vira ficha NOVA", async () => {
    const repo = repositorioFingido({});
    await montar(repo).importar([REGISTRO]);
    expect(chamou(repo, "criarCandidato"), "sem identidade, sem CPF e sem e-mail, a resposta e ficha nova.").toBe(1);
    expect(
      repo.candidatoPorTelefone.mock.calls.length,
      "85% dos casamentos por telefone sao pessoas DIFERENTES: telefone nao e chave de fusao.",
    ).toBe(0);
    expect(
      repo.candidatoPorNome.mock.calls.length,
      "2.627 nomes casam CPFs distintos: homonimo e comum, e fusao nao se desfaz.",
    ).toBe(0);
    expect(
      repo.candidatoPorNomeEVaga.mock.calls.length,
      "245 pares de mesmo nome na mesma vaga tem CPFs DIFERENTES: sao pessoas diferentes.",
    ).toBe(0);
  });
});

// ── 5. O ALCANCE DO DEGRAU NOVO, QUE O PORTAO DE ADMISSAO LIMITA HOJE ─────────────────────────

describe("5. O portao de admissao decide QUEM chega ao degrau do e-mail", () => {
  it("registro SEM CPF nao entra na ingestao hoje, entao o e-mail nao o alcanca", () => {
    /*
     * REGISTRO DE ALCANCE, nao de regra nova. `INGERIR_SOMENTE_QUEM_FINALIZOU` esta LIGADO por
     * decisao do diretor, e quem responde por "finalizou" e o CPF. Logo os 84% sem CPF nao chegam
     * a ser resolvidos por chave nenhuma, e o degrau do e-mail so alcanca, hoje, quem TEM CPF
     * valido e nao casou por ele. Abrir o portao e decisao do diretor, e e ela que transforma as
     * 18.722 duplicatas evitadas em numero real.
     */
    const { admitidos, naoFinalizaram } = separarPorFinalizacaoDigai([
      { ...REGISTRO, cpf: null },
      REGISTRO,
    ]);
    expect(admitidos.length).toBe(1);
    expect(naoFinalizaram.length).toBe(1);
  });
});
