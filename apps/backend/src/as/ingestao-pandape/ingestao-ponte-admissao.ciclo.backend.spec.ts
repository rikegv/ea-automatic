import { describe, expect, it } from "vitest";
import type { CandidaturaSituacao } from "@ea/shared-types";
import { executarCicloDeIngestao } from "./ingestao-ciclo";
import type {
  DependenciasDaVarredura,
  PortaBanco,
  PortaPonteParaAdmissao,
  ResultadoDaPonte,
} from "./ingestao-portas";
import {
  acharSentinelas,
  criarMatch,
  criarMundo,
  SENTINELA,
  SENTINELAS_PESSOAIS,
  type EstadoDoMundo,
  type Mundo,
} from "./ingestao-varredura.tester-fake";

/**
 * ─ A PONTE PARA A ADMISSÃO, MEDIDA NO CICLO (o QUANDO, não o COMO) ─────────────────────────────
 *
 * O que se prova aqui é a DECISÃO do ciclo: quando a ponte é acionada, quando ela NÃO é, e o que o
 * resumo conta. O COMO (a pré-admissão, o `admissao_id`, a guarda de idempotência) é medido no
 * adaptador, em `ingestao-ponte-admissao.backend.spec.ts`, com um banco fingido.
 *
 * ┌─ POR QUE O `criada` É EMBRULHADO AQUI, E NÃO PEDIDO AO MUNDO FALSO ──────────────────────────┐
 * │ O mundo falso (`ingestao-varredura.tester-fake.ts`) é do `tester`, e ele não declara `criada`: │
 * │ o `escrever` dele devolve `linhasAfetadas`, que vale 1 no nascimento E no update que mudou     │
 * │ algo. Este arquivo embrulha aquele banco e responde a pergunta do MESMO jeito que o repositório │
 * │ de produção responde (a linha existia antes desta escrita?), sem tocar o arquivo do `tester`.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado real. As sentinelas vêm do mundo falso e são perseguidas no log da ponte.
 */

const VAGA = 9001;
const PASTA_CONTRATADOS = 71;
const PASTA_EM_SELECAO = 72;

/** A porta da ponte, ANOTANDO cada chamada e devolvendo o que o cenário mandar. */
function ponteFalsa(
  resposta: ResultadoDaPonte = { feita: true, posicaoExcedida: false },
  lancar?: () => never,
): PortaPonteParaAdmissao & { chamadas: string[] } {
  const chamadas: string[] = [];
  return {
    chamadas,
    async criar(candidaturaId) {
      chamadas.push(candidaturaId);
      if (lancar) lancar();
      return resposta;
    },
  };
}

/**
 * O BANCO DO MUNDO FALSO, ACRESCIDO DO FATO QUE SÓ O ESCRITOR CONHECE: a candidatura NASCEU nesta
 * escrita? A pergunta é feita ANTES de escrever, olhando o par (candidato, vaga), que é a mesma
 * chave que o repositório de produção usa na busca explícita.
 */
function bancoComNascimento(mundo: Mundo): PortaBanco {
  const original = mundo.deps.banco;
  return {
    ...original,
    async escrever(e) {
      if (e.tabela !== "as_candidaturas") return original.escrever(e);
      const linhas = mundo.obs.linhas.as_candidaturas ?? [];
      const jaExistia = linhas.some(
        (l) => l.candidato_id === e.valores.candidato_id && l.vaga_id === e.valores.vaga_id,
      );
      const r = await original.escrever(e);
      return { ...r, criada: !jaExistia };
    },
  };
}

function mundoComInscricao(
  over: Partial<EstadoDoMundo> = {},
  situacao: CandidaturaSituacao = "ENVIADO_PARA_ADMISSAO",
) {
  const estado: EstadoDoMundo = {
    vagas: [
      { idVacancy: VAGA, reference: "REF-1", job: "Cargo Sintetico", city: "", numberVacancies: 2 },
    ],
    pastas: {
      [VAGA]: [
        { idVacancyFolder: PASTA_CONTRATADOS, name: "Contratados" },
        { idVacancyFolder: PASTA_EM_SELECAO, name: "Em Selecao" },
      ],
    },
    matches: {
      [VAGA]: [
        criarMatch({
          idCandidate: 777,
          idMatch: 999,
          idVacancy: VAGA,
          idVacancyFolder: PASTA_CONTRATADOS,
          insertDate: "2026-09-10T10:00:00Z",
        }),
      ],
    },
    // O de/para REAL da casa: `Contratados` carrega etapa E desfecho, e é a linha que o diretor
    // semeou. A chave é a normalizada, como o ciclo a calcula.
    dePara: {
      contratados: { etapaCodigo: "APROVACAO", situacao },
      "em selecao": { etapaCodigo: "TRIAGEM", situacao: null },
    },
    ...over,
  };
  const mundo = criarMundo(estado);
  const ponte = ponteFalsa();
  const deps: DependenciasDaVarredura = {
    ...mundo.deps,
    banco: bancoComNascimento(mundo),
    ponteParaAdmissao: ponte,
  };
  return { mundo, deps, ponte };
}

describe("a ponte para a admissão, do ponto de vista do ciclo", () => {
  it("CRIA a ponte quando a situação do de/para pede, e conta no resumo", async () => {
    const { mundo, deps, ponte } = mundoComInscricao();
    const resumo = await executarCicloDeIngestao(deps);
    expect(ponte.chamadas).toHaveLength(1);
    // O ARGUMENTO É O ID DA CANDIDATURA QUE ACABOU DE NASCER, e não o do candidato: é nela que o
    // `admissao_id` mora, e é ela que a guarda de idempotência lê.
    const candidatura = (mundo.obs.linhas.as_candidaturas ?? [])[0];
    expect(ponte.chamadas[0]).toBe(candidatura.id);
    expect(resumo.pontesParaAdmissao).toBe(1);
    expect(resumo.pontesAdiadas).toBe(0);
    expect(resumo.erros).toBe(0);
  });

  /*
   * A VOLTA É DE 30 EM 30 MINUTOS, e sem esta propriedade a mesma pessoa viraria uma chamada por
   * volta, para sempre. Pior do que o desperdício: quando a admissão já saiu de AGUARDANDO_LIBERACAO
   * para ADMISSAO_CONCLUIDA ou DECLINOU, o unique parcial da admissão não protege mais, e uma
   * SEGUNDA admissão nasceria da mesma candidatura.
   */
  it("NÃO cria duas vezes: a segunda volta não chama a ponte", async () => {
    const { deps, ponte } = mundoComInscricao();
    const primeira = await executarCicloDeIngestao(deps);
    const segunda = await executarCicloDeIngestao(deps);
    expect(ponte.chamadas).toHaveLength(1);
    expect(primeira.pontesParaAdmissao).toBe(1);
    expect(segunda.pontesParaAdmissao).toBe(0);
  });

  /*
   * ─ A CANDIDATURA QUE JÁ EXISTIA NÃO VIRA ADMISSÃO POR SINAL DO ATS ──────────────────────────
   *
   * A varredura SOBRESCREVE etapa e situação de quem já está no funil do EA (o
   * `where ... is distinct from` do repositório existe para não empurrar o relógio do expurgo, não
   * para proteger o trabalho de ninguém). Se a ponte disparasse no update, o ATS promoveria à
   * admissão alguém que o time está trabalhando aqui, e admissão criada é muito mais caro de
   * desfazer do que etapa trocada.
   */
  it("candidatura PREEXISTENTE cuja situação passa a pedir ponte NÃO gera admissão", async () => {
    const { deps, ponte, mundo } = mundoComInscricao({
      preexistentes: {
        vagas: [{ id: "vaga-1", id_vacancy_pandape: VAGA, codigo: "REF-1" }],
        as_candidatos: [{ id: "cand-1", cpf: SENTINELA.cpf, nome: SENTINELA.nome }],
        as_candidaturas: [
          {
            id: "candidatura-1",
            candidato_id: "cand-1",
            vaga_id: "vaga-1",
            etapa: "TRIAGEM",
            situacao: "ATIVO",
          },
        ],
      },
    });
    const resumo = await executarCicloDeIngestao(deps);
    expect(ponte.chamadas).toHaveLength(0);
    expect(resumo.pontesParaAdmissao).toBe(0);
    expect(resumo.pontesAdiadas).toBe(0);
    // A SITUAÇÃO CONTINUA SENDO ESCRITA (o comportamento de hoje da varredura não mudou nesta
    // frente): o que esta frente decidiu é que ela NÃO abre admissão.
    expect((mundo.obs.linhas.as_candidaturas ?? [])[0].situacao).toBe("ENVIADO_PARA_ADMISSAO");
  });

  it("situação que NÃO pede ponte não chama a porta", async () => {
    const { deps, ponte } = mundoComInscricao({}, "APROVADO");
    const resumo = await executarCicloDeIngestao(deps);
    expect(ponte.chamadas).toHaveLength(0);
    expect(resumo.pontesParaAdmissao).toBe(0);
  });

  it("pasta sem desfecho traduzido não chama a porta", async () => {
    const { deps, ponte } = mundoComInscricao({
      matches: {
        [VAGA]: [
          criarMatch({
            idCandidate: 778,
            idMatch: 1000,
            idVacancy: VAGA,
            idVacancyFolder: PASTA_EM_SELECAO,
            insertDate: "2026-09-10T10:00:00Z",
          }),
        ],
      },
    });
    await executarCicloDeIngestao(deps);
    expect(ponte.chamadas).toHaveLength(0);
  });

  /*
   * ADIAR É O DESFECHO CERTO DA FALTA DE DADO (§A.5, "adiar em vez de inventar `cod_cliente`"): a
   * candidatura fica gravada, o ciclo segue, e o caso vira CONTAGEM. Sem o número, a inscrição que
   * chega contratada e sem CPF ficaria sem admissão e sem ninguém saber que há caso a resolver.
   */
  it("ADIA quando a ponte diz que falta CPF, sem erro e sem dado pessoal no log", async () => {
    const { mundo, deps } = mundoComInscricao();
    const resumo = await executarCicloDeIngestao({
      ...deps,
      ponteParaAdmissao: ponteFalsa({ feita: false, motivo: "SEM_CPF" }),
    });
    expect(resumo.pontesAdiadas).toBe(1);
    expect(resumo.pontesParaAdmissao).toBe(0);
    expect(resumo.erros).toBe(0);
    // A candidatura NÃO é perdida por causa da lacuna: ela está gravada.
    expect(mundo.obs.linhas.as_candidaturas).toHaveLength(1);
    const log = mundo.obs.logs.map((l) => `${l.texto} ${JSON.stringify(l.dados ?? {})}`).join(" ");
    expect(log).toContain("ponte para a admissao adiada");
    expect(acharSentinelas(mundo.obs.logs, SENTINELAS_PESSOAIS)).toEqual([]);
  });

  it("`JA_TEM_ADMISSAO` não conta como adiada: nada ficou pendente", async () => {
    const { deps } = mundoComInscricao();
    const resumo = await executarCicloDeIngestao({
      ...deps,
      ponteParaAdmissao: ponteFalsa({ feita: false, motivo: "JA_TEM_ADMISSAO" }),
    });
    expect(resumo.pontesAdiadas).toBe(0);
    expect(resumo.pontesParaAdmissao).toBe(0);
  });

  it("CONTA a posição excedida em vez de travar a entrada", async () => {
    const { deps } = mundoComInscricao();
    const resumo = await executarCicloDeIngestao({
      ...deps,
      ponteParaAdmissao: ponteFalsa({ feita: true, posicaoExcedida: true }),
    });
    // A ADMISSÃO ENTROU: o ATS é a fonte do fato, e recusá-lo faria a base divergir da realidade em
    // silêncio. O excesso fica VISÍVEL, que é o que a contagem existe para fazer.
    expect(resumo.pontesParaAdmissao).toBe(1);
    expect(resumo.posicoesExcedidas).toBe(1);
  });

  /*
   * A FALHA DA PONTE NÃO É A FALHA DA INSCRIÇÃO. A candidatura já foi gravada (é o fato); a ponte é
   * efeito. Deixar a exceção subir faria o log dizer "falha ao ingerir a inscricao", que é mentira, e
   * a vaga seguinte pagaria o erro de contexto de quem for procurar.
   */
  it("a falha da ponte é contida, nomeada e não derruba a volta", async () => {
    const { mundo, deps } = mundoComInscricao();
    const resumo = await executarCicloDeIngestao({
      ...deps,
      ponteParaAdmissao: ponteFalsa(undefined, () => {
        throw new Error("indisponivel");
      }),
    });
    expect(resumo.erros).toBe(1);
    expect(mundo.obs.linhas.as_candidaturas).toHaveLength(1);
    const erros = mundo.obs.logs.filter((l) => l.nivel === "erro").map((l) => l.texto);
    expect(erros).toContain("falha ao criar a ponte para a admissao");
    expect(erros).not.toContain("falha ao ingerir a inscricao");
  });

  /*
   * SEM A PORTA, NENHUMA ADMISSÃO. Em produção ela é sempre injetada; esta propriedade existe para
   * que um teste de outra coisa, montado sem a ponte, não ganhe admissão de brinde, e para que o dia
   * em que alguém esquecer de injetá-la seja um dia sem admissão automática, e não um dia de
   * admissão silenciosa pela metade.
   */
  it("sem a porta injetada, o ciclo grava a candidatura e não cria admissão", async () => {
    const { mundo, deps } = mundoComInscricao();
    const resumo = await executarCicloDeIngestao({ ...deps, ponteParaAdmissao: undefined });
    expect(resumo.pontesParaAdmissao).toBe(0);
    expect(resumo.erros).toBe(0);
    expect(mundo.obs.linhas.as_candidaturas).toHaveLength(1);
  });
});
