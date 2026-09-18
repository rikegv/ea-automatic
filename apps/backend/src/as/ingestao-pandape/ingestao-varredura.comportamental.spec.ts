import { describe, expect, it } from "vitest";
import { RetencaoCandidatosService } from "../candidatos/retencao-candidatos.service";
import { sqlDaVarredura } from "../candidatos/retencao-lgpd.tester-fake";
import {
  MUTANTES_DA_INGESTAO,
  SENTINELA,
  auditarIngestor,
  criarIngestorDeReferencia,
  criarMundo,
  criarMatch,
  type Ingestor,
} from "./ingestao-varredura.tester-fake";

/**
 * ─ COBERTURA DA INGESTÃO DO PANDAPÉ, ESCRITA ANTES DO CÓDIGO (§A.40 regra 2, §A.38) ────────────
 *
 * ESCRITO PELO `tester`, QUE NÃO VAI ESCREVER O INGESTOR. O requisito é
 * `docs/PLANO-INGESTAO-PANDAPE-VARREDURA.md`, medido contra a API real: 621 vagas ativas, 137.654
 * inscrições vivas, 58 campos por inscrição, 35% das inscrições em pasta sem tradução.
 *
 * ┌─ ESTE ARQUIVO NASCE VERMELHO, E ISSO É O COMBINADO ─────────────────────────────────────────┐
 * │ Os testes da seção 2 exercitam o ingestor de PRODUÇÃO, que AINDA NÃO EXISTE. Eles falham     │
 * │ dizendo exatamente isso, e passam a valer no minuto em que o módulo aparecer. Quem constrói   │
 * │ não precisa adivinhar o alvo: cada vermelho nomeia a propriedade e o dano dela em produção.   │
 * │                                                                                               │
 * │ Os testes da seção 1 são VERDES desde já, e são o que separa "teste escrito cedo" de "teste   │
 * │ escrito no escuro": eles provam que o CONTRATO funciona, aprovando uma referência correta e   │
 * │ reprovando 28 mutantes, cada um pela regra nomeada dele. Sem essa metade, um contrato          │
 * │ frouxo ficaria verde no dia da entrega e ninguém saberia.                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado real. Não há CPF, nome, e-mail, telefone nem payload do Pandapé neste arquivo:
 * o que circula são sentinelas inventadas, feitas para serem procuradas onde não podem aparecer.
 */

/** O SQL REAL da varredura de retenção, para cruzar texto livre novo com o expurgo que existe. */
async function sqlDoExpurgo(): Promise<string> {
  const { sql } = await sqlDaVarredura((db: never) => new RetencaoCandidatosService(db));
  return sql.toLowerCase();
}

/** As violações que começam por qualquer um dos prefixos dados. */
function regras(violacoes: string[], nomes: string[]): string[] {
  return violacoes.filter((x) => nomes.some((n) => x.startsWith(`${n}:`)));
}

// ── 1. O CONTRATO SE PROVA ANTES DE ACUSAR ALGUÉM ──────────────────────────────────────────────

describe("o contrato da ingestão, exercitado contra referência e mutantes", () => {
  it("APROVA uma ingestão sabidamente correta, sem nenhuma violação", async () => {
    const violacoes = await auditarIngestor(criarIngestorDeReferencia(), {
      sqlDoExpurgo: await sqlDoExpurgo(),
    });
    expect(violacoes).toEqual([]);
  });

  it.each(MUTANTES_DA_INGESTAO)(
    "REPROVA o mutante $nome, pela regra certa",
    async ({ defeito, regraEsperada, dano }) => {
      const violacoes = await auditarIngestor(criarIngestorDeReferencia(defeito), {
        sqlDoExpurgo: await sqlDoExpurgo(),
      });
      expect(
        regras(violacoes, [regraEsperada]),
        `o mutante passou batido. Dano em produção: ${dano}`,
      ).not.toEqual([]);
    },
  );

  /**
   * A LISTA É A DECLARADA PELOS MUTANTES, e ela não é a lista inteira de regras: `CRIADO_EM_HISTORICO`,
   * `CICLO_NAO_IDEMPOTENTE`, `ETAPA_MAPEADA_NAO_INGERIDA` e `CICLO_MORRE_NO_PRIMEIRO_ERRO` são
   * cobradas de lado por mutantes que declaram outra regra, e por isso não aparecem aqui. O que este
   * teste trava é o contrário do que parece: que ninguém APAGUE um mutante sem perceber, deixando a
   * regra dele sem quem a exercite.
   */
  it("cobre TODAS as regras que o plano exige, e não só as fáceis", async () => {
    const cobertas = new Set(MUTANTES_DA_INGESTAO.map((m) => m.regraEsperada));
    expect([...cobertas].sort()).toEqual(
      [
        "BANCO_TALENTOS_ESCRITO",
        "CAMINHO_DE_ESCRITA",
        "CASOU_POR_NOME",
        "CHAVE_CRUA_NO_RESUMO",
        "COD_CLIENTE_INVENTADO",
        "COLETADO_EM_NAO_EXPLICITO",
        "CONFLITO_DECIDIDO_SOZINHO",
        "CONFLITO_NAO_REGISTRADO",
        "CORTE_NAO_DETERMINISTICO",
        "CPF_NAO_DESEMPATA",
        "DEPARA_CRIADO_PELO_CICLO",
        "ETAPA_CHUTADA",
        "ETAPA_NAO_MAPEADA_NAO_REGISTRADA",
        "ETAPA_NAO_NORMALIZADA",
        "FONTE_FORA_DO_VOCABULARIO",
        "INGESTOR_CITA_ATUALIZADO_EM",
        "INGESTOR_CITA_CRIADO_EM",
        "PASSIVO_INGERIDO",
        "PESSOA_DUPLICADA",
        "PII_EM_LOG",
        "PROJECAO_NAO_EXPLICITA",
        "REENTREGA_IDENTICA_ESCREVE",
        "REENTREGA_QUE_MUDA_NAO_ESCREVE",
        "SENSIVEL_VAZOU",
        "TEXTO_LIVRE_FORA_DO_EXPURGO",
        "VAGA_DUPLICADA",
        "VAGA_NAO_CASADA_PELO_ID",
        "VERBO_QUE_ESCREVE",
      ].sort(),
    );
  });

  /**
   * O INSTRUMENTO TAMBÉM É CONFERIDO, e não por zelo: um mundo fake que não anotasse o verbo faria
   * a regra mais cara deste arquivo (GET apenas) ficar verde para sempre, medindo nada.
   */
  it("o mundo fake anota o VERBO de cada requisição, que é o que torna a regra do GET mensurável", async () => {
    const m = criarMundo({
      vagas: [],
      pastas: {},
      matches: {},
      dePara: {},
    });
    const espiao: Ingestor = async (deps) => {
      await deps.http.requisitar("POST", "/v1/Match/UpdateFolder", {});
      return {
        vagasVarridas: 0,
        paginasLidas: 0,
        pessoasCriadas: 0,
        candidaturasCriadas: 0,
        etapasNaoMapeadas: [],
        conflitosParaRevisao: 0,
        erros: 0,
      };
    };
    await m.rodar(espiao);
    expect(m.obs.requisicoes).toEqual([{ metodo: "POST", caminho: "/v1/Match/UpdateFolder" }]);
  });

  it("o item sintético carrega os quatro campos do art. 11, senão a armadilha não existiria", () => {
    const item = criarMatch({
      idCandidate: 1,
      idMatch: 2,
      idVacancy: 3,
      idVacancyFolder: 4,
      insertDate: "2026-09-10T00:00:00Z",
    });
    for (const campo of ["idRace", "idSexualOrientation", "idGenderIdentity", "deficiencies"]) {
      expect(item, `sem \`${campo}\` no item, o vazamento dele seria impossível de testar`).toHaveProperty(campo);
    }
  });
});

// ── 2. A INGESTÃO DE PRODUÇÃO ──────────────────────────────────────────────────────────────────

/**
 * O MÓDULO QUE AINDA NÃO EXISTE, e o contrato mínimo que se espera dele.
 *
 * O caminho está numa VARIÁVEL de propósito: um `import` estático de módulo inexistente derrubaria
 * o arquivo inteiro na carga, e os testes da seção 1 (que são verdes e provam o contrato) morreriam
 * junto, virando um vermelho sem informação nenhuma.
 */
const CAMINHO_DO_INGESTOR = "./ingestao-ciclo";

async function ingestorDeProducao(): Promise<Ingestor> {
  let modulo: Record<string, unknown>;
  try {
    modulo = (await import(CAMINHO_DO_INGESTOR)) as Record<string, unknown>;
  } catch {
    throw new Error(
      "A INGESTÃO AINDA NÃO EXISTE. Este teste foi escrito a partir do requisito, antes do código " +
        "(§A.40 regra 2), e nasce vermelho de propósito. Esperado: " +
        "`apps/backend/src/as/ingestao-pandape/ingestao-ciclo.ts` exportando " +
        "`executarCicloDeIngestao(deps: DependenciasDaIngestao): Promise<ResumoDoCiclo>`, com as " +
        "portas declaradas em `ingestao-varredura.tester-fake.ts`. O contrato que este arquivo " +
        "aplica já está provado contra 28 mutantes na seção 1.",
    );
  }
  const fn = modulo.executarCicloDeIngestao;
  if (typeof fn !== "function") {
    throw new Error(
      "O módulo da ingestão existe mas não exporta `executarCicloDeIngestao`. O contrato das portas " +
        "está em `ingestao-varredura.tester-fake.ts`.",
    );
  }
  return fn as Ingestor;
}

async function violacoesDaProducao(): Promise<string[]> {
  return auditarIngestor(await ingestorDeProducao(), { sqlDoExpurgo: await sqlDoExpurgo() });
}

describe("a ingestão de produção, medida contra o requisito", () => {
  it("a trava do DIARIO: reentrega que NÃO muda nada não escreve em `as_candidatos`", async () => {
    expect(regras(await violacoesDaProducao(), ["REENTREGA_IDENTICA_ESCREVE"])).toEqual([]);
  });

  it("a trava do DIARIO: o ingestor não CITA `atualizado_em` nem `criado_em`", async () => {
    expect(
      regras(await violacoesDaProducao(), ["INGESTOR_CITA_ATUALIZADO_EM", "INGESTOR_CITA_CRIADO_EM"]),
    ).toEqual([]);
  });

  it("a trava do DIARIO: o candidato nasce com a data da COLETA, nunca com a do ATS", async () => {
    expect(regras(await violacoesDaProducao(), ["CRIADO_EM_HISTORICO"])).toEqual([]);
  });

  it("a trava do DIARIO não vira imobilidade: o que muda de verdade é escrito", async () => {
    expect(regras(await violacoesDaProducao(), ["REENTREGA_QUE_MUDA_NAO_ESCREVE"])).toEqual([]);
  });

  it("`coletado_em` é preenchido explicitamente com o instante da coleta", async () => {
    expect(regras(await violacoesDaProducao(), ["COLETADO_EM_NAO_EXPLICITO"])).toEqual([]);
  });

  it("dedup por `(PANDAPE, idCandidate)`, com CPF de desempate e nome NUNCA", async () => {
    expect(
      regras(await violacoesDaProducao(), [
        "PESSOA_DUPLICADA",
        "CPF_NAO_DESEMPATA",
        "CASOU_POR_NOME",
        "FONTE_FORA_DO_VOCABULARIO",
      ]),
    ).toEqual([]);
  });

  it("o ciclo é idempotente: rodar duas vezes o mesmo payload não cria nada a mais", async () => {
    expect(regras(await violacoesDaProducao(), ["CICLO_NAO_IDEMPOTENTE"])).toEqual([]);
  });

  it("conflito de identidade e CPF vai para revisão, e o ciclo não escolhe sozinho", async () => {
    expect(
      regras(await violacoesDaProducao(), ["CONFLITO_DECIDIDO_SOZINHO", "CONFLITO_NAO_REGISTRADO"]),
    ).toEqual([]);
  });

  it("a etapa é fail-closed: pasta sem de/para não vira candidatura em etapa chutada", async () => {
    expect(
      regras(await violacoesDaProducao(), [
        "ETAPA_CHUTADA",
        "ETAPA_NAO_MAPEADA_NAO_REGISTRADA",
        "DEPARA_CRIADO_PELO_CICLO",
        "ETAPA_NAO_NORMALIZADA",
        "ETAPA_MAPEADA_NAO_INGERIDA",
      ]),
    ).toEqual([]);
  });

  it("§A.6: a projeção é explícita, e o dado do art. 11 não chega a lugar nenhum", async () => {
    expect(
      regras(await violacoesDaProducao(), [
        "PROJECAO_NAO_EXPLICITA",
        "SENSIVEL_VAZOU",
        "BANCO_TALENTOS_ESCRITO",
        "TEXTO_LIVRE_FORA_DO_EXPURGO",
      ]),
    ).toEqual([]);
  });

  it("§A.6: nenhum CPF, nome, e-mail ou telefone em log, inclusive no caminho de ERRO", async () => {
    expect(regras(await violacoesDaProducao(), ["PII_EM_LOG", "CICLO_MORRE_NO_PRIMEIRO_ERRO"])).toEqual([]);
  });

  it("só os novos: o passivo antigo não entra, e o corte é determinístico", async () => {
    expect(
      regras(await violacoesDaProducao(), ["PASSIVO_INGERIDO", "CORTE_NAO_DETERMINISTICO"]),
    ).toEqual([]);
  });

  it("a vaga espelhada casa por `id_vacancy_pandape` e nunca inventa `cod_cliente`", async () => {
    expect(
      regras(await violacoesDaProducao(), [
        "VAGA_DUPLICADA",
        "COD_CLIENTE_INVENTADO",
        "VAGA_NAO_CASADA_PELO_ID",
      ]),
    ).toEqual([]);
  });

  it("GET APENAS: nenhum verbo e nenhum caminho que escreva no funil do Pandapé", async () => {
    expect(regras(await violacoesDaProducao(), ["VERBO_QUE_ESCREVE", "CAMINHO_DE_ESCRITA"])).toEqual([]);
  });

  /**
   * ─ A MARCA DE ÁGUA É REGISTRO, E NUNCA PARADA DE LEITURA (medido no ingestor REAL) ───────────
   *
   * O plano tem as duas instruções e elas parecem uma: a seção 6 manda parar de paginar na marca, e
   * a ressalva logo abaixo desfaz isso, porque MOVER ALGUÉM DE PASTA NÃO ALTERA O `insertDate` e a
   * lista não vem ordenada por `modifyDate`. Quem para de ler no que já ingeriu nunca mais vê
   * mudança nenhuma daquela inscrição, nem troca de etapa nem dado corrigido, e a conta do próprio
   * plano fecha contra isso: 660 requisições contra 622, 6% de diferença.
   *
   * O mutante 29 prova que o CONTRATO acusa esse caminho. Este teste prova a outra metade, que é a
   * que o contrato sozinho não daria: que o INGESTOR REAL grava a marca (senão o cenário do
   * contrato não estaria exercitando marca nenhuma, e o verde dele seria vazio) e, ainda assim,
   * enxerga a mudança de quem está ATRÁS dela.
   */
  it("a marca de água é gravada pelo ingestor REAL e NÃO faz ele parar de ler", async () => {
    const ingestor = await ingestorDeProducao();

    const registra = criarMundo({
      vagas: [{ idVacancy: 9001, reference: "1234567", job: "Cargo Sintetico", city: "Cidade Sintetica - SP", numberVacancies: 1 }],
      pastas: { 9001: [{ idVacancyFolder: 71, name: "Triados" }] },
      matches: {
        9001: [
          criarMatch({ idCandidate: 111, idMatch: 900111, idVacancy: 9001, idVacancyFolder: 71, insertDate: "2026-09-10T10:00:00Z" }),
        ],
      },
      dePara: { triados: { etapaCodigo: "TRIAGEM", situacao: null, motivoPadrao: null, ativo: true } },
    });
    await registra.rodar(ingestor);
    expect(
      registra.obs.linhas.as_varredura_vagas ?? [],
      "o ingestor não grava marca de água nenhuma, então o cenário que a exercita não prova nada",
    ).toHaveLength(1);

    // AGORA A MARCA ESTÁ MUITO À FRENTE DO ITEM, e o telefone dele mudou no ATS.
    const atrasDaMarca = criarMundo({
      vagas: [{ idVacancy: 9001, reference: "1234567", job: "Cargo Sintetico", city: "Cidade Sintetica - SP", numberVacancies: 1 }],
      pastas: { 9001: [{ idVacancyFolder: 71, name: "Triados" }] },
      matches: {
        9001: [
          criarMatch({
            idCandidate: 111,
            idMatch: 900111,
            idVacancy: 9001,
            idVacancyFolder: 71,
            insertDate: "2026-09-10T10:00:00Z",
            phone: "telefone-sintetico-corrigido",
          }),
        ],
      },
      dePara: { triados: { etapaCodigo: "TRIAGEM", situacao: null, motivoPadrao: null, ativo: true } },
      preexistentes: {
        as_varredura_vagas: [
          { id_vacancy_pandape: 9001, ultimo_insert_date: "2026-12-31T00:00:00Z" },
        ],
        vagas: [{ id: "vaga-espelhada", id_vacancy_pandape: 9001, codigo: "1234567" }],
        as_candidatos: [
          {
            id: "pessoa-ja-ingerida",
            nome: `${SENTINELA.nome} ${SENTINELA.sobrenome}`,
            cpf: SENTINELA.cpf,
            email: SENTINELA.email,
            telefone: SENTINELA.telefone,
            data_nascimento: "1990-01-01",
            cidade: "Cidade Sintetica",
            uf: "SP",
            criado_em: "2026-09-10T00:00:00.000Z",
            atualizado_em: "2026-09-10T00:00:00.000Z",
          },
        ],
        as_identidades_externas: [
          {
            id: "identidade-ja-coletada",
            fonte: "PANDAPE",
            identificador: "111",
            candidato_id: "pessoa-ja-ingerida",
            coletado_em: "2026-09-10T00:00:00.000Z",
          },
        ],
      },
    });
    await atrasDaMarca.rodar(ingestor);

    const pessoa = (atrasDaMarca.obs.linhas.as_candidatos ?? []).find(
      (c) => c.id === "pessoa-ja-ingerida",
    );
    expect(
      pessoa?.telefone,
      "o ingestor parou de ler na marca de água: a correção do dado de quem está atrás dela nunca chega, e uma troca de pasta também não, porque mover alguém não altera o `insertDate`",
    ).toBe("telefone-sintetico-corrigido");
  });
});
