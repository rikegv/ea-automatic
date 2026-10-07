import "reflect-metadata";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { vagas } from "../../db/schema";
import { novoResumo, descobrirVagasAtivas } from "../ingestao-pandape/ingestao-ciclo";
import { IngestaoRepositorio } from "../ingestao-pandape/ingestao-repositorio";
import type {
  DependenciasDaVarredura,
  Escrita,
  PortaBanco,
  ResultadoDaEscrita,
} from "../ingestao-pandape/ingestao-portas";
import { FONTE_DO_DEPARA_DE_CLIENTE } from "../depara-cliente/depara-cliente.fonte";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ COBERTURA INDEPENDENTE (tester, §A.38): A OPÇÃO A NOS **DOIS** CONSUMIDORES, LADO A LADO ─────
 *
 * Eu NÃO escrevi o código desta frente. Esta suíte parte do REQUISITO do diretor (07/10/2026) e o
 * exercita pelas DUAS portas REAIS, no MESMO arquivo e pela MESMA tabela de casos:
 *   . F2, o gate de ESCRITA: `IngestaoRepositorio.vagaEntra`, lendo o espelho;
 *   . F3, o filtro de LEITURA: `VagasService.pendentesDeRevisao`, lendo o mesmo espelho.
 *
 * O REQUISITO, invertido nesta frente: a vaga APARECE/ENTRA por padrão, e é EXCLUÍDA somente quando
 * o código está na planilha como FECHADO ou CANCELADO. Ausente do espelho, status nulo e status
 * desconhecido APARECEM.
 *
 * ┌─ POR QUE A TABELA É A MESMA PARA OS DOIS, E ISSO É O PONTO DESTA SUÍTE ──────────────────────┐
 * │ Os specs existentes cobrem cada consumidor no seu arquivo, com fakes diferentes. Dois lados     │
 * │ verdes em arquivos separados NÃO provam que eles concordam: provam que cada um satisfaz a        │
 * │ expectativa que o seu próprio autor escreveu. Aqui a MESMA linha de requisito é cobrada das      │
 * │ duas portas na mesma asserção, então uma divergência entre gate e fila falha o teste em vez de   │
 * │ virar "vaga que a varredura espelha e a fila não mostra" (ou o contrário) na operação.           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS TRÊS CASOS QUE A INVERSÃO CRIOU SÃO SENTINELA DE BUG DE SINAL ──────────────────────────┐
 * │ AUSENTE, NULO e OUTRO. Um `!` esquecido ou invertido continuaria passando em FECHADO e em      │
 * │ ABERTO (que são simétricos), e falharia SÓ nesses três. Eles têm teste próprio, nomeado, para   │
 * │ que a falha aponte o defeito em vez de só acusar uma lista diferente.                           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: dado sintético, zero identificador de pessoa; só token de ciclo de vida. §A.11: sem travessão.
 */

const AGORA = new Date("2026-10-07T12:00:00.000Z");
const dialeto = new PgDialect();

// ── A TABELA DO REQUISITO, FONTE ÚNICA DOS DOIS CONSUMIDORES ───────────────────────────────────

/**
 * Uma linha do requisito: o que o ESPELHO diz sobre o código, e se a vaga aparece/entra.
 * `statusNoEspelho === "SEM_LINHA"` modela o código AUSENTE do espelho (nenhuma linha para a chave).
 */
interface CasoDoRequisito {
  nome: string;
  statusNoEspelho: string | null | "SEM_LINHA";
  apareceOuEntra: boolean;
}

const TABELA_DO_REQUISITO: readonly CasoDoRequisito[] = [
  { nome: "FECHADO", statusNoEspelho: "FECHADO", apareceOuEntra: false },
  { nome: "CANCELADO", statusNoEspelho: "CANCELADO", apareceOuEntra: false },
  { nome: "ABERTO", statusNoEspelho: "ABERTO", apareceOuEntra: true },
  { nome: "ENTREGUE", statusNoEspelho: "ENTREGUE", apareceOuEntra: true },
  { nome: "OUTRO (status desconhecido)", statusNoEspelho: "OUTRO", apareceOuEntra: true },
  { nome: "nulo (a planilha nao disse)", statusNoEspelho: null, apareceOuEntra: true },
  { nome: "codigo AUSENTE do espelho", statusNoEspelho: "SEM_LINHA", apareceOuEntra: true },
];

/** A chave numérica do código: `normalizarCodigoDeVaga` só aceita inteiro positivo sem zero à frente. */
const CHAVE_DO_CASO = "4242";
/** Uma segunda linha, SEMPRE presente e com status, para manter o espelho ATIVO em todos os casos. */
const LINHA_QUE_ATIVA_O_ESPELHO = { codigo_externo: "9999", status_planilha: "ABERTO" };

function linhasDoEspelhoPara(caso: CasoDoRequisito) {
  const linhas = [LINHA_QUE_ATIVA_O_ESPELHO];
  if (caso.statusNoEspelho !== "SEM_LINHA") {
    linhas.push({ codigo_externo: CHAVE_DO_CASO, status_planilha: caso.statusNoEspelho as string });
  }
  return linhas;
}

// ── A PORTA F2: O REPOSITÓRIO REAL SOBRE UM ESPELHO FINGIDO ────────────────────────────────────

/**
 * O banco do repositório, respondendo pelo SENTIDO do SQL COMPILADO (não por ordem de chamada):
 *   1. `exists(... status_planilha is not null)` => o sinal de espelho ATIVO;
 *   2. `codigo_externo in (...)` => o lookup, FILTRADO pelas chaves ligadas, como o `IN` do Postgres
 *      (chave ausente de um espelho ativo devolve ZERO linha, e não a primeira linha à toa).
 */
function repositorioSobre(linhas: { codigo_externo: string; status_planilha: string | null }[]) {
  const ativa = linhas.some((l) => l.status_planilha !== null);
  const db = {
    execute: (q: unknown) => {
      const compilada = dialeto.sqlToQuery(q as never);
      if (/status_planilha is not null/.test(compilada.sql)) {
        return Promise.resolve([{ ativa }]);
      }
      const chaves = new Set(
        compilada.params
          .filter((p): p is string => typeof p === "string")
          .filter((p) => p !== FONTE_DO_DEPARA_DE_CLIENTE),
      );
      return Promise.resolve(linhas.filter((l) => chaves.has(l.codigo_externo)));
    },
  };
  return new IngestaoRepositorio(db as never, null as never, null as never);
}

// ── A PORTA F3: O SERVIÇO REAL SOBRE UM BANCO FINGIDO ──────────────────────────────────────────

function linhaDeVaga(id: string, idVacancyPandape: string | null, codigo: string | null) {
  return {
    v: {
      id,
      codigo,
      nomeDivulgacao: `Vaga sintetica ${id}`,
      status: "PENDENTE_REVISAO",
      idVacancyPandape,
      posicoesOficiais: 1,
      posicoesBanco: 0,
      regioes: [],
      idiomas: [],
      testes: [],
      etapasPs: [],
      criadoEm: AGORA,
    },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
  };
}

function servicoSobre(opcoes: {
  linhas: ReturnType<typeof linhaDeVaga>[];
  espelho: { codigo_externo: string; status_planilha: string | null }[];
  recusadas?: string[];
}) {
  const ativa = opcoes.espelho.some((l) => l.status_planilha !== null);
  const recusadas = opcoes.recusadas ?? [];
  const leitura = (tabela: unknown) => (tabela === vagas ? opcoes.linhas : []);
  const construtor = () => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    const resultado = () => leitura(tabela);
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => Promise.resolve(resultado());
    b.groupBy = () => Promise.resolve(resultado());
    b.limit = () => Promise.resolve(resultado());
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(resultado()).then(ok);
    return b;
  };
  const db = {
    select: () => construtor(),
    selectDistinct: () => construtor(),
    execute: (q: unknown) => {
      const compilada = dialeto.sqlToQuery(q as never);
      const texto = compilada.sql.toLowerCase();
      if (/exists\s*\([\s\S]*status_planilha is not null/.test(texto)) {
        return Promise.resolve([{ ativa }]);
      }
      if (/select\s+codigo_externo,\s+status_planilha/.test(texto)) {
        // FILTRA pelas chaves ligadas, como o `IN` do Postgres: ausente devolve zero linha.
        const chaves = new Set(
          compilada.params
            .filter((p): p is string => typeof p === "string")
            .filter((p) => p !== FONTE_DO_DEPARA_DE_CLIENTE),
        );
        return Promise.resolve(opcoes.espelho.filter((l) => chaves.has(l.codigo_externo)));
      }
      if (/recusada_em is not null and id in/.test(texto)) {
        return Promise.resolve(recusadas.map((id) => ({ id })));
      }
      return Promise.resolve([]);
    },
  };
  return new VagasService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido([{ codigo: "PENDENTE_REVISAO", papel: "REVISAO" }] as never) as never,
  );
}

// ── 1. A TABELA DO REQUISITO, COBRADA DAS DUAS PORTAS NA MESMA ASSERÇÃO ────────────────────────

describe("OPÇÃO A: a tabela do requisito vale IGUAL no gate de escrita (F2) e na fila de leitura (F3)", () => {
  it.each(TABELA_DO_REQUISITO)(
    "status $nome no espelho: aparece/entra = $apareceOuEntra nos DOIS consumidores",
    async (caso) => {
      const espelho = linhasDoEspelhoPara(caso);

      // F2, a porta REAL do gate de escrita.
      const entrouNaVarredura = await repositorioSobre(espelho).vagaEntra(
        Number(CHAVE_DO_CASO),
        null,
      );

      // F3, a porta REAL da fila de revisão.
      const servico = servicoSobre({
        linhas: [linhaDeVaga("caso", CHAVE_DO_CASO, null)],
        espelho,
      });
      const fila = await servico.pendentesDeRevisao();
      const apareceuNaFila = fila.some((v) => v.id === "caso");

      expect(entrouNaVarredura, `F2 (gate de escrita) para ${caso.nome}`).toBe(caso.apareceOuEntra);
      expect(apareceuNaFila, `F3 (fila de revisão) para ${caso.nome}`).toBe(caso.apareceOuEntra);
      // E, acima de tudo, os dois lados DECIDEM IGUAL: régua compartilhada de verdade.
      expect(entrouNaVarredura).toBe(apareceuNaFila);
    },
  );

  it("espelho inteiro SEM status (filtro inativo): entra na varredura E aparece na fila", async () => {
    const espelho = [
      { codigo_externo: CHAVE_DO_CASO, status_planilha: null },
      { codigo_externo: "9999", status_planilha: null },
    ];

    expect(await repositorioSobre(espelho).vagaEntra(Number(CHAVE_DO_CASO), null)).toBe(true);
    expect(await repositorioSobre([]).vagaEntra(Number(CHAVE_DO_CASO), null)).toBe(true);

    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", CHAVE_DO_CASO, null)],
      espelho,
    }).pendentesDeRevisao();
    expect(fila.map((v) => v.id)).toEqual(["caso"]);
  });

  it("vaga MANUAL (sem id do Pandapé) aparece na fila mesmo com o espelho ativo e cheio de FECHADO", async () => {
    // A planilha é do Pandapé: ela não tem o que dizer sobre a vaga nascida dentro do EA. O código
    // interno (família SL) também não é chave normalizável, então não casa por acidente.
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("manual", null, "SL00000049")],
      espelho: [
        { codigo_externo: "4242", status_planilha: "FECHADO" },
        { codigo_externo: "9999", status_planilha: "CANCELADO" },
      ],
    }).pendentesDeRevisao();

    expect(fila.map((v) => v.id)).toEqual(["manual"]);
  });
});

// ── 2. OS TRÊS CASOS QUE A INVERSÃO CRIOU: SENTINELA DE BUG DE SINAL ───────────────────────────

describe("SENTINELA DE SINAL: AUSENTE, NULO e OUTRO aparecem (um `!` invertido falharia SÓ aqui)", () => {
  it("as três aparecem na MESMA fila, junto com ABERTO, e só FECHADO e CANCELADO somem", async () => {
    const fila = await servicoSobre({
      linhas: [
        linhaDeVaga("aberta", "100", null),
        linhaDeVaga("fechada", "200", null),
        linhaDeVaga("cancelada", "300", null),
        linhaDeVaga("ausente-do-espelho", "400", null),
        linhaDeVaga("status-nulo", "500", null),
        linhaDeVaga("status-outro", "600", null),
      ],
      espelho: [
        { codigo_externo: "100", status_planilha: "ABERTO" },
        { codigo_externo: "200", status_planilha: "FECHADO" },
        { codigo_externo: "300", status_planilha: "CANCELADO" },
        // 400 ausente de propósito.
        { codigo_externo: "500", status_planilha: null },
        { codigo_externo: "600", status_planilha: "OUTRO" },
      ],
    }).pendentesDeRevisao();

    expect(fila.map((v) => v.id).sort()).toEqual([
      "aberta",
      "ausente-do-espelho",
      "status-nulo",
      "status-outro",
    ]);
  });

  it("as três entram na varredura, pela porta real do repositório", async () => {
    const espelho = [
      { codigo_externo: "100", status_planilha: "ABERTO" },
      { codigo_externo: "500", status_planilha: null },
      { codigo_externo: "600", status_planilha: "OUTRO" },
    ];
    const repo = repositorioSobre(espelho);

    expect(await repo.vagaEntra(400, null), "AUSENTE do espelho ativo").toBe(true);
    expect(await repo.vagaEntra(500, null), "status NULO no espelho").toBe(true);
    expect(await repo.vagaEntra(600, null), "status OUTRO no espelho").toBe(true);
  });

  it("a vaga sem chave normalizável (código corrompido pela planilha) entra: a planilha não a nomeou", async () => {
    // `900001.0` e `0` são o que a formatação numérica da planilha produz; nenhum deles é chave.
    const repo = repositorioSobre([{ codigo_externo: "100", status_planilha: "FECHADO" }]);
    expect(await repo.vagaEntra(0, null)).toBe(true);
    expect(await repo.vagaEntra(Number("900001.0"), "900.001")).toBe(true);
  });
});

// ── 3. A FRONTEIRA DO NORMALIZADOR, POR DENTRO DOS DOIS CONSUMIDORES ───────────────────────────

/**
 * A sincronização grava o TOKEN canônico, mas a régua aceita o texto cru, e nada impede uma linha de
 * espelho com texto de planilha (carga antiga, correção manual, migração). Então a fronteira é
 * cobrada ONDE ELA DECIDE, e não só na função pura.
 */
const FRONTEIRA_QUE_EXCLUI = ["Fechada", "fechado ", "ENCERRADA", "Cancelamento", "cancelada"];
const FRONTEIRA_QUE_APARECE = ["Aberta", "Entregue", "Em andamento", "Pausada", "", "   "];

describe("FRONTEIRA do texto cru da planilha gravado no espelho", () => {
  it.each(FRONTEIRA_QUE_EXCLUI)("o texto %j EXCLUI nos dois consumidores", async (texto) => {
    const espelho = [{ codigo_externo: CHAVE_DO_CASO, status_planilha: texto }];

    expect(await repositorioSobre(espelho).vagaEntra(Number(CHAVE_DO_CASO), null)).toBe(false);
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", CHAVE_DO_CASO, null)],
      espelho,
    }).pendentesDeRevisao();
    expect(fila).toEqual([]);
  });

  it.each(FRONTEIRA_QUE_APARECE)("o texto %j APARECE nos dois consumidores", async (texto) => {
    // Texto vazio não ativa o espelho sozinho, então a linha de ativação acompanha.
    const espelho = [
      { codigo_externo: CHAVE_DO_CASO, status_planilha: texto },
      LINHA_QUE_ATIVA_O_ESPELHO,
    ];

    expect(await repositorioSobre(espelho).vagaEntra(Number(CHAVE_DO_CASO), null)).toBe(true);
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", CHAVE_DO_CASO, null)],
      espelho,
    }).pendentesDeRevisao();
    expect(fila.map((v) => v.id)).toEqual(["caso"]);
  });
});

// ── 4. A PRECEDÊNCIA DAS DUAS CHAVES, COBRADA DOS DOIS LADOS ───────────────────────────────────

describe("PRECEDÊNCIA: a chave FORTE (id do Pandapé) decide quando existe, a reference só responde sem ela", () => {
  it("id FECHADO e reference ABERTO: a vaga SAI nos dois consumidores", async () => {
    const espelho = [
      { codigo_externo: "100", status_planilha: "FECHADO" },
      { codigo_externo: "200", status_planilha: "ABERTO" },
    ];

    expect(await repositorioSobre(espelho).vagaEntra(100, "200")).toBe(false);
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", "100", "200")],
      espelho,
    }).pendentesDeRevisao();
    expect(fila).toEqual([]);
  });

  it("id ABERTO e reference FECHADO: a vaga APARECE nos dois consumidores", async () => {
    const espelho = [
      { codigo_externo: "100", status_planilha: "ABERTO" },
      { codigo_externo: "200", status_planilha: "FECHADO" },
    ];

    expect(await repositorioSobre(espelho).vagaEntra(100, "200")).toBe(true);
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", "100", "200")],
      espelho,
    }).pendentesDeRevisao();
    expect(fila.map((v) => v.id)).toEqual(["caso"]);
  });

  it("SÓ a reference casa (id fora do espelho ativo): é ela que decide", async () => {
    const espelho = [{ codigo_externo: "200", status_planilha: "FECHADO" }];

    expect(await repositorioSobre(espelho).vagaEntra(100, "200")).toBe(false);
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", "100", "200")],
      espelho,
    }).pendentesDeRevisao();
    expect(fila).toEqual([]);
  });

  it("id presente com status NULO e reference FECHADO: pela tabela do requisito, NULO APARECE", async () => {
    /*
     * A CHAVE FORTE ESTÁ NO ESPELHO e o que ela diz é "a planilha não disse". Pela tabela do
     * requisito isso é APARECE, e a chave fraca não tem como sobrepor a forte: a precedência existe
     * justamente para que a resposta da forte seja a resposta. Este é o caso em que "chave ausente" e
     * "chave presente dizendo nada" precisam ser distinguidos, e onde confundi-los esconde uma vaga
     * que o requisito manda mostrar.
     */
    const espelho = [
      { codigo_externo: "100", status_planilha: null },
      { codigo_externo: "200", status_planilha: "FECHADO" },
      LINHA_QUE_ATIVA_O_ESPELHO,
    ];

    expect(await repositorioSobre(espelho).vagaEntra(100, "200"), "F2 (gate de escrita)").toBe(true);
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("caso", "100", "200")],
      espelho,
    }).pendentesDeRevisao();
    expect(
      fila.map((v) => v.id),
      "F3 (fila de revisão) tem de concordar com o gate",
    ).toEqual(["caso"]);
  });
});

// ── 5. O CANÁRIO DE LGPD (§A.6): O GATE BARRA A ESCRITA, E NUNCA O CONJUNTO DE ENCERRAMENTO ────

describe("CANÁRIO §A.6: a vaga BARRADA pelo gate continua no conjunto ATS-ativo de `encerrarAusentes`", () => {
  /** Um `escrever` que anota o que foi ESPELHADO: a prova do que o gate deixou entrar. */
  function bancoQueAnota(): { banco: PortaBanco; espelhadas: number[] } {
    const espelhadas: number[] = [];
    const naoUsado = () => {
      throw new Error("a descoberta de vagas não deveria chamar este método");
    };
    const banco: PortaBanco = {
      identidadeExterna: naoUsado as never,
      candidatoPorCpf: naoUsado as never,
      candidatoPorNome: naoUsado as never,
      vagaPorIdPandape: naoUsado as never,
      vagaPorCodigo: naoUsado as never,
      deParaEtapa: naoUsado as never,
      clientePorVaga: naoUsado as never,
      marcaDaVaga: naoUsado as never,
      escrever: (e: Escrita): Promise<ResultadoDaEscrita> => {
        const idVacancy = Number(e.valores.id_vacancy_pandape);
        espelhadas.push(idVacancy);
        return Promise.resolve({ linhasAfetadas: 1, id: `vaga-${idVacancy}`, divergencias: 0 });
      },
    };
    return { banco, espelhadas };
  }

  /**
   * O ciclo REAL (`descobrirVagasAtivas`) com o gate REAL (`IngestaoRepositorio.vagaEntra`) sobre um
   * espelho fingido. Nenhum dublê de régua: o fio inteiro, da lista do ATS ao encerramento.
   */
  function cicloReal(
    vagasAtivasNoAts: { idVacancy: number; reference: string | null }[],
    espelho: { codigo_externo: string; status_planilha: string | null }[],
  ) {
    const { banco, espelhadas } = bancoQueAnota();
    const encerrarRecebeu: number[][] = [];
    const repo = repositorioSobre(espelho);
    const deps: DependenciasDaVarredura = {
      http: { requisitar: () => Promise.resolve({ data: vagasAtivasNoAts }) },
      banco,
      fila: { enfileirar: () => Promise.resolve() },
      log: { info: () => undefined, erro: () => undefined },
      agora: () => AGORA,
      dataDeCorte: new Date("2026-01-01T00:00:00.000Z"),
      salDaMarca: "sal-sintetico-do-tester",
      cicloDeVida: {
        encerrarAusentes: (ids: number[]) => {
          encerrarRecebeu.push([...ids]);
          return Promise.resolve(0);
        },
      },
      filtroDaPlanilha: { vagaEntra: (id, ref) => repo.vagaEntra(id, ref) },
    };
    return { deps, espelhadas, encerrarRecebeu };
  }

  it("FECHADO na planilha mas ATIVA no ATS: não é espelhada, e AINDA ASSIM vai a `encerrarAusentes`", async () => {
    /*
     * ESTA É A TRAVA MAIS CARA DESTA FRENTE. `ativos.push` acontece ANTES do gate
     * (`ingestao-ciclo.ts`), e tem de continuar assim com a regra NOVA: encerrar deriva de AUSÊNCIA
     * REAL no ATS, nunca de "a planilha disse que fechou". Se a planilha encolhesse `ativos`, a
     * vaga barrada seria carimbada `encerrada_em`, e a cláusula de proteção do expurgo de candidatos
     * (`v.encerrada_em is null`) deixaria de proteger as pessoas vivas daquela vaga: relógio de
     * expurgo aceso por base ilícita, sem nada falhar e sem tela nenhuma acusar.
     */
    const { deps, espelhadas, encerrarRecebeu } = cicloReal(
      [
        { idVacancy: 100, reference: null },
        { idVacancy: 200, reference: null },
      ],
      [
        { codigo_externo: "100", status_planilha: "ABERTO" },
        { codigo_externo: "200", status_planilha: "FECHADO" },
      ],
    );
    const resumo = novoResumo();

    await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas, "só a ABERTA foi espelhada").toEqual([100]);
    expect(encerrarRecebeu, "o encerramento é chamado uma vez").toHaveLength(1);
    expect(
      encerrarRecebeu[0].sort((a, b) => a - b),
      "o conjunto ATS-ativo COMPLETO, inclusive a barrada",
    ).toEqual([100, 200]);
    expect(resumo.vagasForaDaPlanilha).toBe(1);
  });

  it("CANCELADO, ausente e OUTRO no mesmo ciclo: só a CANCELADA é barrada, e todas seguem em `ativos`", async () => {
    const { deps, espelhadas, encerrarRecebeu } = cicloReal(
      [
        { idVacancy: 100, reference: null }, // CANCELADO: barrada
        { idVacancy: 400, reference: null }, // ausente do espelho: entra
        { idVacancy: 600, reference: null }, // OUTRO: entra
      ],
      [
        { codigo_externo: "100", status_planilha: "CANCELADO" },
        { codigo_externo: "600", status_planilha: "OUTRO" },
      ],
    );
    const resumo = novoResumo();

    const espelhadasNoRetorno = await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas.sort((a, b) => a - b)).toEqual([400, 600]);
    expect(espelhadasNoRetorno.map((v) => v.idVacancy).sort((a, b) => a - b)).toEqual([400, 600]);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([100, 400, 600]);
    expect(resumo.vagasForaDaPlanilha).toBe(1);
  });

  it("TODAS barradas (planilha fechou tudo): `ativos` segue completo, nenhum expurgo em massa", async () => {
    const { deps, espelhadas, encerrarRecebeu } = cicloReal(
      [
        { idVacancy: 1, reference: null },
        { idVacancy: 2, reference: null },
        { idVacancy: 3, reference: null },
      ],
      [
        { codigo_externo: "1", status_planilha: "FECHADO" },
        { codigo_externo: "2", status_planilha: "Cancelada" },
        { codigo_externo: "3", status_planilha: "ENCERRADA" },
      ],
    );
    const resumo = novoResumo();

    await descobrirVagasAtivas(deps, resumo);

    expect(espelhadas).toEqual([]);
    expect(encerrarRecebeu[0].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(resumo.vagasForaDaPlanilha).toBe(3);
  });
});

// ── 6. NÃO-REGRESSÃO DA RECUSA (F4): A RECUSA GANHA DO STATUS ──────────────────────────────────

describe("NÃO-REGRESSÃO F4: a recusa é a autoridade, e a Opção A não a desfez", () => {
  it("recusada com a planilha dizendo ABERTO continua FORA da fila", async () => {
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("viva", "100", null), linhaDeVaga("recusada", "200", null)],
      espelho: [
        { codigo_externo: "100", status_planilha: "ABERTO" },
        { codigo_externo: "200", status_planilha: "ABERTO" },
      ],
      recusadas: ["recusada"],
    }).pendentesDeRevisao();

    expect(fila.map((v) => v.id)).toEqual(["viva"]);
  });

  it("recusada com o espelho INATIVO também continua FORA: a recusa não depende da planilha", async () => {
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("viva", "100", null), linhaDeVaga("recusada", "200", null)],
      espelho: [{ codigo_externo: "100", status_planilha: null }],
      recusadas: ["recusada"],
    }).pendentesDeRevisao();

    expect(fila.map((v) => v.id)).toEqual(["viva"]);
  });

  it("recusada MANUAL (sem id do Pandapé) continua FORA: a régua da planilha não a traz de volta", async () => {
    const fila = await servicoSobre({
      linhas: [linhaDeVaga("manual-recusada", null, "SL00000050")],
      espelho: [{ codigo_externo: "100", status_planilha: "ABERTO" }],
      recusadas: ["manual-recusada"],
    }).pendentesDeRevisao();

    expect(fila).toEqual([]);
  });
});

// ── 7. O BADGE CONTA O QUE A FILA MOSTRA (§A.27) ───────────────────────────────────────────────

describe("O CONTADOR do badge e a FILA concordam sob a Opção A", () => {
  it("mesma base, mesmo número: as excluídas pela planilha e pela recusa saem dos dois", async () => {
    const opcoes = {
      linhas: [
        linhaDeVaga("aberta", "100", null),
        linhaDeVaga("fechada", "200", null),
        linhaDeVaga("ausente", "400", null),
        linhaDeVaga("outro", "600", null),
        linhaDeVaga("manual", null, "SL00000051"),
        linhaDeVaga("recusada", "700", null),
      ],
      espelho: [
        { codigo_externo: "100", status_planilha: "ABERTO" },
        { codigo_externo: "200", status_planilha: "FECHADO" },
        { codigo_externo: "600", status_planilha: "OUTRO" },
        { codigo_externo: "700", status_planilha: "ABERTO" },
      ],
      recusadas: ["recusada"],
    };

    const fila = await servicoSobre(opcoes).pendentesDeRevisao();
    const contagem = await servicoSobre(opcoes).contarPendentesDeRevisao();

    expect(fila.map((v) => v.id).sort()).toEqual(["aberta", "ausente", "manual", "outro"]);
    expect(contagem.count).toBe(fila.length);
  });
});
