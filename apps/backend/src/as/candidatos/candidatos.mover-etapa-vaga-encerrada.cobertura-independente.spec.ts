import { ConflictException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import {
  asCandidaturaEtapas,
  asCandidaturas,
  vagaBeneficio,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";
import { CandidatosService } from "./candidatos.service";
import { VagasService } from "../vagas/vagas.service";

/**
 * ─ `moverEtapa` RECUSA VAGA FORA DE PROCESSO, **E** O CANCELAMENTO CONTINUA MOVENDO TODO MUNDO ──
 *
 * ESTE ARQUIVO É DO `tester`, ESCRITO ANTES DO CÓDIGO (§A.40 regra 2). Ele tem DUAS metades, e a
 * SEGUNDA é a que importa mais: ela não afirma o requisito novo, ela protege o que o requisito novo
 * pode derrubar sem ninguém ver.
 *
 * ┌─ METADE 1, O REQUISITO: A FRESTA QUE SOBROU ──────────────────────────────────────────────────┐
 * │ `reprovarPeloCliente` e `marcarEntrevista` já perguntam se a vaga está EM PROCESSO             │
 * │ (`papelDeVagaEmProcesso`), e as duas ganharam a guarda depois de o `tester` medir a mesma       │
 * │ fresta. `moverEtapa` NÃO pergunta: as guardas dele são todas sobre a CANDIDATURA (existe, está │
 * │ viva) e sobre a ETAPA (existe no catálogo e recebe gente). A vaga não entra na conversa.        │
 * │                                                                                                 │
 * │ O CAMINHO É O MESMO CAMINHO FELIZ DA FRENTE B, e não uma hipótese: cancelar uma vaga deixa     │
 * │ TODO MUNDO VIVO dentro dela (ninguém é descartado, por decisão do diretor), e fechar uma vaga  │
 * │ deixa os `ALOCADO` vivos (a trava do fechamento os trata como TRATADOS). Ou seja: depois que a │
 * │ vaga acaba, há gente viva lá dentro, e o funil dela continua clicável.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ METADE 2, O RISCO: A GUARDA NOVA NÃO PODE ALCANÇAR OS CAMINHOS INTERNOS ─────────────────────┐
 * │ O CANCELAMENTO MOVE GENTE DE ETAPA. Ele move todos os VIVOS para o Stand By, e move DENTRO da  │
 * │ transação em que a vaga está virando CANCELADA. Se a guarda nova for parar num caminho comum   │
 * │ aos dois (hoje `moverVivosParaODestino` grava direto, mas uma refatoração "para não repetir    │
 * │ código" que a fizesse chamar `moverEtapa` é o gesto mais natural do mundo), o cancelamento      │
 * │ passa a RECUSAR A SI MESMO: a vaga que está sendo cancelada não está em processo, e a promessa │
 * │ da Frente B ("cancelar sem descartar ninguém") vira gente presa na etapa antiga de uma vaga    │
 * │ morta, ou um cancelamento que falha no meio.                                                    │
 * │                                                                                                 │
 * │ A REPROVAÇÃO PELO CLIENTE TEM O MESMO FORMATO (ela devolve a pessoa para a etapa INICIAL), e   │
 * │ por isso a guarda dela é medida aqui junto: ela já existe e já está certa, e o que este arquivo│
 * │ trava é que ela continue recusando pelo MOTIVO dela, e não por um efeito colateral novo.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids técnicos, códigos de etapa e de status. Nomes inventados. Nenhum CPF, nenhum log.
 */

const AGORA = new Date("2026-09-26T12:00:00.000Z");
const dialeto = new PgDialect();

function textoDe(cond: unknown): string {
  if (cond === undefined || cond === null) return "";
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// METADE 1: `moverEtapa` OLHA A VAGA
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * O BANCO FINGIDO DO MOVIMENTO. Ele modela a candidatura, a VAGA dela (que é o dado que a guarda
 * nova precisa ler, e que o dublê de hoje não tinha por que entregar) e as duas escritas do gesto.
 *
 * A VAGA É SERVIDA PELAS DUAS PORTAS (`query.vagas.findFirst` e `select().from(vagas)`), de
 * propósito: a `marcarEntrevista` lê pela primeira e o `reprovarPeloCliente` pela segunda, e eu não
 * tenho como saber, escrevendo antes, por qual delas a construção vai ler. Medir o REQUISITO não
 * pode depender de adivinhar a porta.
 */
function bancoDoMovimento(cenario: { statusDaVaga?: string; etapa?: string; situacao?: string }) {
  const vaga = {
    id: "vaga-1",
    codigo: "PS-1",
    nomeDivulgacao: "Vaga de teste",
    status: cenario.statusDaVaga ?? "ABERTA",
    codCliente: "CLI-1",
    posicoesOficiais: 5,
    posicoesBanco: 0,
  };
  const candidatura = {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: vaga.id,
    etapa: cenario.etapa ?? "TRIAGEM",
    situacao: cenario.situacao ?? "ATIVO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
  };

  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.limit = () => Promise.resolve(tabela === vagas ? [{ ...vaga }] : []);
    b.groupBy = () => Promise.resolve([]);
    b.orderBy = () => {
      if (tabela === vagas) return Promise.resolve([{ ...vaga }]);
      // A leitura final (`candidatura()`), com os nomes já resolvidos.
      return Promise.resolve([
        {
          c: { ...candidatura },
          candidatoNome: "Pessoa Inventada",
          vagaCodigo: vaga.codigo,
          vagaNome: vaga.nomeDivulgacao,
          autor: "Consultor",
        },
      ]);
    };
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(tabela === vagas ? [{ ...vaga }] : []).then(r);
    return b;
  });

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (v: Record<string, unknown>) => {
      lista.push({ tabela, valores: v });
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        catch: pronto.catch.bind(pronto),
        finally: pronto.finally.bind(pronto),
        returning: async () => [{ id: `linha-${lista.length}` }],
      };
    },
    onConflictDoUpdate: async () => undefined,
  });

  const query = {
    asCandidaturas: { findFirst: vi.fn().mockResolvedValue(candidatura) },
    vagas: { findFirst: vi.fn().mockResolvedValue(vaga) },
  };

  const tx = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    delete: vi.fn(() => ({ where: async () => undefined })),
    query,
  };
  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    delete: vi.fn(() => ({ where: async () => undefined })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query,
  };

  return {
    service: new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    ),
    updates,
    inserts,
  };
}

/**
 * OS STATUS QUE NÃO SÃO PROCESSO. `FECHADA` e `CANCELADA` são os dois papéis terminais do catálogo,
 * e `RASCUNHO` entra porque a vaga nem foi publicada: mover alguém no funil de um rascunho é mover
 * gente num processo que ainda não começou.
 */
describe("4. `moverEtapa` recusa vaga que não está em processo", () => {
  it.each(["FECHADA", "CANCELADA"])(
    "a vaga %s não deixa mover ninguém no funil, e NADA é gravado",
    async (status) => {
      const b = bancoDoMovimento({ statusDaVaga: status });

      const erro = await b.service
        .moverEtapa("cand-1", { etapa: "ENTREVISTA_SOULAN" }, "user-1")
        .catch((e: unknown) => e);

      expect(
        erro,
        "a mesma guarda que `reprovarPeloCliente` e `marcarEntrevista` já têm",
      ).toBeInstanceOf(ConflictException);
      expect(b.updates, "movimento recusado não grava etapa").toEqual([]);
      expect(b.inserts, "movimento recusado não grava evento na linha do tempo").toEqual([]);
    },
  );

  /**
   * ─ O OUTRO LADO, E SEM ELE A GUARDA PODERIA SER "RECUSA SEMPRE" ───────────────────────────────
   *
   * `ENTREGUE` é o caso que separa uma guarda certa de uma guarda copiada: desde a Frente B ela
   * DEIXOU DE ENCERRAR (é estado vivo, com gente em Entrevista Cliente e a vaga ainda captando).
   * Uma guarda escrita com `encerra` em vez de `papelDeVagaEmProcesso` acertaria os dois casos de
   * cima e MATARIA o funil da vaga entregue, que é o normal da operação.
   */
  it.each(["ABERTA", "ENTREGUE"])("a vaga %s continua movendo normalmente", async (status) => {
    const b = bancoDoMovimento({ statusDaVaga: status });

    await b.service.moverEtapa("cand-1", { etapa: "ENTREVISTA_SOULAN" }, "user-1");

    expect(b.updates.find((u) => u.tabela === asCandidaturas)?.valores).toMatchObject({
      etapa: "ENTREVISTA_SOULAN",
    });
    expect(b.inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores).toMatchObject({
      etapaDe: "TRIAGEM",
      etapaPara: "ENTREVISTA_SOULAN",
      // MOVIMENTO, E NÃO DESFECHO: a guarda nova não pode mudar a natureza do evento.
      situacao: null,
    });
  });

  /**
   * A ORDEM DAS RECUSAS. Quem clica numa vaga encerrada precisa ouvir que a VAGA acabou, e não que
   * "a candidatura já está nesta etapa": a segunda frase manda a pessoa procurar defeito no lugar
   * errado. É a mesma ordem deliberada que a `marcarEntrevista` já documenta.
   */
  it("a vaga encerrada é recusada ANTES da recusa de etapa repetida", async () => {
    const b = bancoDoMovimento({ statusDaVaga: "CANCELADA", etapa: "TRIAGEM" });

    const erro = await b.service
      .moverEtapa("cand-1", { etapa: "TRIAGEM" }, "user-1")
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// METADE 2: O CANCELAMENTO CONTINUA MOVENDO TODO MUNDO PARA O STAND BY
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * `STAND_BY` NÃO ESTÁ NO CATÁLOGO FINGIDO PADRÃO (ele nasceu na migration 0111 e não está em
 * `ETAPAS_FUNIL_SEMENTE`), então quem testa o destino do cancelamento monta o catálogo com ele.
 */
const STAND_BY = {
  id: 99,
  codigo: "STAND_BY",
  rotulo: "Stand By",
  ordem: 6,
  tom: "wn" as const,
  inicial: false,
  ativa: true,
  entregaAoCliente: false,
  destinoDoCancelamento: true,
  temEntrevista: false,
};

function catalogoComStandBy() {
  const base = catalogoDeEtapasFingido();
  return {
    ...base,
    etapaDoCancelamento: async () => STAND_BY,
    ordemPorCodigo: async () => {
      const mapa = new Map(await base.ordemPorCodigo());
      mapa.set(STAND_BY.codigo, STAND_BY.ordem);
      return mapa;
    },
  };
}

const MOTIVO_DE_CANCELAMENTO = "Cliente Desistiu";
const CATALOGO_DE_CANCELAMENTO = [
  { id: "mc-1", nome: MOTIVO_DE_CANCELAMENTO, ativo: true },
  { id: "mc-2", nome: "Vaga Duplicada", ativo: true },
];

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** O banco fingido do cancelamento, com gente VIVA dentro da vaga. */
function bancoDoCancelamento(candidaturas: { id: string; etapa: string; situacao: string }[]) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    codigo: "PS-1",
    nomeDivulgacao: "Vaga de teste",
    status: "ABERTA",
    posicoesOficiais: 3,
    posicoesBanco: 0,
    codCliente: "CLI-1",
    canceladaEm: null,
    encerradaEm: null,
    // A LEITURA DE DEVOLUÇÃO (`devolverVaga` -> `list`) formata esta data. Sem ela o dublê derruba a
    // chamada com um erro que NÃO é o requisito sob teste.
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  };

  const linhas = candidaturas.map((c) => ({
    candidaturaId: c.id,
    candidatoId: `pessoa-${c.id}`,
    candidatoNome: `Pessoa ${c.id}`,
    etapa: c.etapa,
    situacao: c.situacao,
    posicaoLado: null,
  }));

  const escritas: (Escrita & { where: string })[] = [];

  const linhasDe = (tabela: unknown): unknown[] => {
    if (tabela === vagas) {
      return [
        {
          v: { ...vaga },
          cargoNome: null,
          clienteRazao: null,
          clienteOperacao: null,
          abertoPorNome: null,
          consultorNome: null,
          recruiterNome: null,
          fechamentoForcadoPorNome: null,
          canceladaPorNome: null,
        },
      ];
    }
    if (tabela === asCandidaturas) return linhas;
    if (tabela === vagaBeneficio || tabela === vagaMetaReducoes) return [];
    // A tabela DESCONHECIDA é o catálogo de motivos de cancelamento.
    return CATALOGO_DE_CANCELAMENTO.filter((m) => m.ativo).map((m) => ({ ...m }));
  };

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.limit = () => Promise.resolve(linhasDe(tabela));
    b.orderBy = () => Promise.resolve(linhasDe(tabela));
    b.groupBy = () =>
      Promise.resolve(
        tabela === asCandidaturas
          ? linhas.map((l) => ({
              vagaId: vaga.id,
              situacao: l.situacao,
              posicaoLado: l.posicaoLado,
              etapa: l.etapa,
              quantas: 1,
            }))
          : [],
      );
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(linhasDe(tabela)).then(r);
    return b;
  });

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async (cond: unknown) => {
        escritas.push({ tabela, valores, where: textoDe(cond) });
        if (tabela === vagas) Object.assign(vaga, valores);
        return undefined;
      },
    }),
    values: (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores, where: "" });
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        catch: pronto.catch.bind(pronto),
        finally: pronto.finally.bind(pronto),
        returning: async () => [{ id: `evento-${escritas.length}`, ...valores }],
      };
    },
  });

  const tx = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: async () => CATALOGO_DE_CANCELAMENTO.filter((m) => m.ativo),
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };
  const db = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: async () => CATALOGO_DE_CANCELAMENTO.filter((m) => m.ativo),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };

  const Ctor = VagasService as unknown as new (...args: unknown[]) => VagasService;
  return {
    service: new Ctor(db, catalogoComStandBy(), catalogoDeStatusFingido()),
    vaga,
    escritas,
  };
}

const movimentos = (b: ReturnType<typeof bancoDoCancelamento>) =>
  b.escritas.filter((e) => e.tabela === asCandidaturas);

describe("4-bis. a guarda nova NÃO pode alcançar o cancelamento (promessa da Frente B)", () => {
  /**
   * ─ O TESTE MAIS VALIOSO DESTA RODADA, E ELE NÃO AFIRMA O REQUISITO NOVO ───────────────────────
   *
   * Ele afirma o que o requisito novo pode QUEBRAR. O cancelamento move gente de etapa DENTRO da
   * transação em que a vaga está virando CANCELADA: a vaga, no instante do movimento, está a uma
   * linha de deixar de estar em processo. Qualquer caminho comum entre este movimento e o
   * `moverEtapa` do consultor faz a guarda nova recusar o cancelamento inteiro, ou pior, recusar só
   * parte dele e deixar gente presa na etapa antiga de uma vaga morta.
   *
   * O TESTE NÃO OLHA NOME DE FUNÇÃO, e é de propósito: ele olha o RESULTADO. Refatorar é legítimo;
   * o que não é legítimo é o resultado mudar. É a mesma escolha do teste irmão que afirma que
   * ninguém vira `DESCARTADO` no cancelamento: a asserção é sobre o valor gravado, porque é o valor
   * que apaga gente.
   */
  it("todo mundo que estava VIVO vai para o Stand By, mesmo com a vaga virando CANCELADA", async () => {
    const b = bancoDoCancelamento([
      { id: "c1", etapa: "TRIAGEM", situacao: "ATIVO" },
      { id: "c2", etapa: "ENTREVISTA_CLIENTE", situacao: "ALOCADO" },
      { id: "c3", etapa: "APROVACAO", situacao: "APROVADO" },
    ]);

    await (b.service as unknown as {
      cancelar: (id: string, dto: Record<string, unknown>, u: AuthUser) => Promise<unknown>;
    }).cancelar("vaga-1", { motivo: MOTIVO_DE_CANCELAMENTO }, COMUM);

    expect(b.vaga.status).toBe("CANCELADA");
    const movidos = movimentos(b);
    expect(
      movidos,
      "os TRÊS vivos têm de ser movidos: a guarda nova não pode alcançar este caminho",
    ).toHaveLength(3);
    for (const m of movidos) expect(m.valores.etapa).toBe("STAND_BY");
  });

  /** E NINGUÉM É DESCARTADO: a guarda nova não pode reintroduzir desfecho onde há movimento. */
  it("o cancelamento continua sem escrever desfecho em candidatura nenhuma", async () => {
    const b = bancoDoCancelamento([{ id: "c1", etapa: "TRIAGEM", situacao: "ATIVO" }]);

    await (b.service as unknown as {
      cancelar: (id: string, dto: Record<string, unknown>, u: AuthUser) => Promise<unknown>;
    }).cancelar("vaga-1", { motivo: MOTIVO_DE_CANCELAMENTO }, COMUM);

    for (const m of movimentos(b)) {
      expect(m.valores.situacao, "cancelar move, não encerra").toBeUndefined();
    }
    for (const e of b.escritas.filter((x) => x.tabela === asCandidaturaEtapas)) {
      expect(e.valores.situacao, "o evento é MOVIMENTO, e `situacao` nula é o que diz isso").toBeNull();
    }
  });

  /**
   * A VAGA COM UM ALOCADO É O CASO QUE MAIS DÓI SE A GUARDA VAZAR: ele é quem enche o cilindro da
   * vaga, e deixá-lo preso na Entrevista Cliente de uma vaga cancelada é exatamente o "gente
   * esquecida na vaga morta" que a Frente B existe para não produzir.
   */
  it("o ALOCADO também é movido, e a situação dele NÃO muda", async () => {
    const b = bancoDoCancelamento([
      { id: "c1", etapa: "ENTREVISTA_CLIENTE", situacao: "ALOCADO" },
    ]);

    await (b.service as unknown as {
      cancelar: (id: string, dto: Record<string, unknown>, u: AuthUser) => Promise<unknown>;
    }).cancelar("vaga-1", { motivo: MOTIVO_DE_CANCELAMENTO }, COMUM);

    const movidos = movimentos(b);
    expect(movidos).toHaveLength(1);
    expect(movidos[0].valores).toMatchObject({ etapa: "STAND_BY" });
    expect(movidos[0].valores.situacao).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// METADE 2-b: A REPROVAÇÃO PELO CLIENTE CONTINUA DEVOLVENDO PARA A ETAPA INICIAL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("4-ter. a reprovação pelo cliente continua funcionando em vaga VIVA", () => {
  /**
   * ELA JÁ TEM A GUARDA DELA, e o ponto aqui é que ela continue recusando pelo MOTIVO dela e
   * passando quando deve passar. Uma guarda nova escrita no lugar errado (numa rotina compartilhada
   * de movimento, por exemplo) recusaria este gesto em vaga ENTREGUE, que é justamente a vaga em
   * que ele acontece: só reprova o cliente quem estava COM o cliente.
   */
  it("em vaga ENTREGUE, quem estava com o cliente volta para a etapa inicial", async () => {
    const b = bancoDoMovimento({
      statusDaVaga: "ENTREGUE",
      etapa: "ENTREVISTA_CLIENTE",
      situacao: "ATIVO",
    });

    await (b.service as unknown as {
      reprovarPeloCliente: (id: string, dto: Record<string, unknown>, porId: string) => Promise<unknown>;
    }).reprovarPeloCliente("cand-1", {}, "user-1");

    expect(b.updates.find((u) => u.tabela === asCandidaturas)?.valores).toMatchObject({
      etapa: "CAPTACAO",
    });
  });

  it("em vaga CANCELADA, a reprovação continua recusada", async () => {
    const b = bancoDoMovimento({
      statusDaVaga: "CANCELADA",
      etapa: "ENTREVISTA_CLIENTE",
      situacao: "ATIVO",
    });

    const erro = await (b.service as unknown as {
      reprovarPeloCliente: (id: string, dto: Record<string, unknown>, porId: string) => Promise<unknown>;
    })
      .reprovarPeloCliente("cand-1", {}, "user-1")
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(b.updates).toEqual([]);
  });
});
