import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { VagasService } from "./vagas.service";
import { asCandidaturas, vagaBeneficio, vagaMetaReducoes, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ O RASTRO DA REDUÇÃO DE META (achado da auditoria de segurança, 09/09/2026) ───────────────────
 *
 * O DESVIO QUE ESTE ARQUIVO GUARDA FECHADO. O gate de Master do fechamento era contornável SEM
 * TOCAR NO GATE: `fechar()` recusa quando `meta - entregues > 0`, mas a META era editável por uma
 * rota irmã sem guard de papel. O consultor baixava a meta até o número já entregue, a subtração
 * dava ZERO, e a vaga fechava pela porta NORMAL, sem Master e com a trilha do forçamento em branco.
 *
 * A DECISÃO DO DIRETOR É RASTRO, E NÃO TRAVA, e por isso o primeiro teste daqui é o que mais
 * incomoda quem chega depois: a redução CONTINUA PASSANDO. Quem "consertar" isto com um `@Roles` na
 * rota tira do consultor uma operação que é dele desde 25/08. O que não pode é ela ser SILENCIOSA.
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. REDUZIR GRAVA UMA LINHA, com os quatro números e o autor da SESSÃO.
 *   2. AUMENTAR NÃO GRAVA, e salvar o mesmo par também não: aumento afasta o fechamento em vez de
 *      aproximá-lo, e "salvei o formulário" não é evento.
 *   3. DUAS REDUÇÕES, DUAS LINHAS, na ordem, e a segunda parte de onde a primeira parou. Guardar só
 *      a última faria quem baixou de 5 para 3 e depois de 3 para 1 aparecer como quem baixou de 3.
 *   4. A MESMA TRANSAÇÃO da escrita das posições: rastro que pode faltar quando a escrita deu certo
 *      não é rastro.
 *   5. RECUSADA A EDIÇÃO, NADA É GRAVADO: nem posição, nem rastro.
 *   6. A LISTAGEM DEVOLVE O RASTRO, da redução mais ANTIGA para a mais RECENTE, em UMA consulta.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

/** A linha da vaga do jeito que a LISTAGEM a lê (o resto dos 60 campos não importa aqui). */
function linhaDeVaga(over: Record<string, unknown> = {}) {
  return {
    v: {
      id: "vaga-1",
      codigo: "PS-2026-099",
      nomeDivulgacao: "Vaga de teste",
      status: "ABERTA",
      posicoesOficiais: 5,
      posicoesBanco: 0,
      vagasFechadas: null,
      vagasFechadasBanco: null,
      escolaridade: null,
      regioes: [],
      idiomas: [],
      testes: [],
      etapasPs: [],
      criadoEm: AGORA,
      fechamentoForcadoEm: null,
      fechamentoForcadoFaltavam: null,
      ...over,
    },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
    fechamentoForcadoPorNome: null as string | null,
  };
}

/** Uma linha do rastro, como o `leftJoin` com `usuarios` a devolve. */
function linhaDeRastro(over: Record<string, unknown> = {}) {
  return {
    vagaId: "vaga-1",
    deOficiais: 5 as number | null,
    paraOficiais: 3,
    deBanco: 0,
    paraBanco: 0,
    porNome: "Ana Consultora" as string | null,
    criadoEm: AGORA,
    ...over,
  };
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
  /** Se aconteceu DENTRO da transação. É o que separa "gravou" de "gravou junto". */
  naTransacao: boolean;
}

function makeDb(cenario: {
  status?: string;
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  /** Situações das candidaturas da vaga, para a trava de excesso ter o que contar. */
  candidaturas?: { situacao: string; posicaoLado?: string | null }[];
  /** O rastro que a LISTAGEM devolve depois da gravação. */
  rastro?: ReturnType<typeof linhaDeRastro>[];
}) {
  const vaga = {
    ...linhaDeVaga().v,
    status: cenario.status ?? "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
  };
  const daListagem = linhaDeVaga({
    posicoesOficiais: vaga.posicoesOficiais,
    posicoesBanco: vaga.posicoesBanco,
  });

  /** O `group by (vaga, situação, lado)` da ocupação, derivado das candidaturas do cenário. */
  const agregado = () =>
    (cenario.candidaturas ?? []).map((c, i) => ({
      vagaId: "vaga-1",
      situacao: c.situacao,
      posicaoLado: c.posicaoLado ?? null,
      quantas: 1,
      _i: i,
    }));

  const escritas: Escrita[] = [];
  const consultasPorTabela = new Map<unknown, number>();
  let dentroDaTransacao = false;

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      consultasPorTabela.set(t, (consultasPorTabela.get(t) ?? 0) + 1);
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => {
      if (tabela === vagas) return Promise.resolve([daListagem]);
      if (tabela === vagaMetaReducoes) return Promise.resolve(cenario.rastro ?? []);
      if (tabela === vagaBeneficio) return Promise.resolve([]);
      return Promise.resolve([]);
    };
    b.groupBy = () => Promise.resolve(tabela === asCandidaturas ? agregado() : []);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores, naTransacao: dentroDaTransacao });
      return { where: async () => undefined };
    },
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: async (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores, naTransacao: dentroDaTransacao });
    },
  }));

  const tx = { select, update, insert };
  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      dentroDaTransacao = true;
      try {
        return await fn(tx);
      } finally {
        dentroDaTransacao = false;
      }
    },
    query: { vagas: { findFirst: vi.fn().mockResolvedValue(vaga) } },
  };

  return { service: new VagasService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never), escritas, consultasPorTabela };
}

const rastroGravado = (e: Escrita[]) => e.filter((x) => x.tabela === vagaMetaReducoes);
const posicoesGravadas = (e: Escrita[]) => e.filter((x) => x.tabela === vagas);
const AUTOR = "user-comum";

describe("editarPosicoes: a redução de meta deixa rastro, e continua passando", () => {
  /**
   * A REGRA INTEIRA EM UM TESTE. A vaga de 5 com 1 pessoa entregue é EXATAMENTE o cenário do desvio
   * (baixar para 1 zera o `faltam` do fechamento), e ele continua sendo permitido de propósito.
   */
  it("PERMITE baixar a meta até o já entregue, e grava quem, quando e de quanto para quanto", async () => {
    const { service, escritas } = makeDb({
      posicoesOficiais: 5,
      candidaturas: [{ situacao: "ALOCADO" }],
    });

    await service.editarPosicoes("vaga-1", { posicoesOficiais: 1, posicoesBanco: 0 }, AUTOR);

    expect(posicoesGravadas(escritas)[0].valores).toMatchObject({ posicoesOficiais: 1 });
    const rastro = rastroGravado(escritas);
    expect(rastro).toHaveLength(1);
    expect(rastro[0].valores).toEqual({
      vagaId: "vaga-1",
      deOficiais: 5,
      paraOficiais: 1,
      deBanco: 0,
      paraBanco: 0,
      porId: AUTOR,
    });
  });

  /**
   * O AUTOR VEM DA SESSÃO, e é a única coisa que o `@CurrentUser()` da rota foi acrescentado para
   * trazer. Rastro sem autor responde "quando", nunca "quem", e era essa a metade que faltava.
   */
  it("grava o autor que a rota passou, e não um valor do corpo", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 4 });
    await service.editarPosicoes(
      "vaga-1",
      { posicoesOficiais: 2, posicoesBanco: 0 },
      "user-master",
    );
    expect(rastroGravado(escritas)[0].valores).toMatchObject({ porId: "user-master" });
  });

  it("NÃO grava rastro quando a meta AUMENTA: aumento afasta o fechamento, não o aproxima", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 3, posicoesBanco: 1 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 8, posicoesBanco: 4 }, AUTOR);

    expect(posicoesGravadas(escritas)).toHaveLength(1);
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  it("NÃO grava rastro quando nada mudou: salvar o mesmo par não é evento", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5, posicoesBanco: 2 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 5, posicoesBanco: 2 }, AUTOR);

    expect(posicoesGravadas(escritas)).toHaveLength(1);
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  /**
   * O GESTO É UMA REQUISIÇÃO SÓ, então a linha carrega OS DOIS LADOS mesmo quando só um caiu. O
   * oficial igual de um lado ao outro é como se lê "esta redução não mexeu no oficial".
   */
  it("grava a redução SÓ DO BANCO, com o lado oficial intacto na mesma linha", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5, posicoesBanco: 4 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 5, posicoesBanco: 1 }, AUTOR);

    expect(rastroGravado(escritas)[0].valores).toMatchObject({
      deOficiais: 5,
      paraOficiais: 5,
      deBanco: 4,
      paraBanco: 1,
    });
  });

  it("grava UMA linha só quando os DOIS lados caem na mesma requisição", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 6, posicoesBanco: 3 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 2, posicoesBanco: 1 }, AUTOR);

    const rastro = rastroGravado(escritas);
    expect(rastro).toHaveLength(1);
    expect(rastro[0].valores).toMatchObject({ paraOficiais: 2, paraBanco: 1 });
  });

  /**
   * META QUE NÃO EXISTIA NÃO FOI REDUZIDA. O rascunho sem meta oficial passa por esta rota (só a
   * vaga ENCERRADA é recusada), e DEFINIR a meta não é baixá-la.
   */
  it("NÃO grava rastro quando o rascunho apenas DEFINE a meta oficial que não existia", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: null, posicoesBanco: 0 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 3, posicoesBanco: 0 }, AUTOR);
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  /**
   * ...E quando o BANCO cai na mesma requisição em que a meta oficial nasce, a linha existe por
   * causa do banco, e o `deOficiais` vai NULO: é a verdade do que havia antes, e não zero.
   */
  it("grava `deOficiais` NULO quando a redução do banco acontece num rascunho sem meta oficial", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: null, posicoesBanco: 5 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 3, posicoesBanco: 2 }, AUTOR);

    expect(rastroGravado(escritas)[0].valores).toMatchObject({
      deOficiais: null,
      paraOficiais: 3,
      deBanco: 5,
      paraBanco: 2,
    });
  });

  /**
   * UMA LINHA POR REDUÇÃO, e é a razão de o rastro ser TABELA e não coluna: guardar só a última
   * faria quem baixou de 5 para 3 e depois de 3 para 1 aparecer como quem baixou de 3 para 1, e as
   * quatro posições que sumiram virariam duas.
   */
  it("duas reduções seguidas geram DUAS linhas, e a segunda parte de onde a primeira parou", async () => {
    const primeira = makeDb({ posicoesOficiais: 5 });
    await primeira.service.editarPosicoes(
      "vaga-1",
      { posicoesOficiais: 3, posicoesBanco: 0 },
      AUTOR,
    );

    // A vaga já com a meta que a primeira redução deixou, que é o que o banco devolveria depois.
    const segunda = makeDb({ posicoesOficiais: 3 });
    await segunda.service.editarPosicoes(
      "vaga-1",
      { posicoesOficiais: 1, posicoesBanco: 0 },
      AUTOR,
    );

    expect(rastroGravado(primeira.escritas)[0].valores).toMatchObject({
      deOficiais: 5,
      paraOficiais: 3,
    });
    expect(rastroGravado(segunda.escritas)[0].valores).toMatchObject({
      deOficiais: 3,
      paraOficiais: 1,
    });
  });

  /**
   * RASTRO QUE PODE FALTAR QUANDO A ESCRITA DEU CERTO NÃO É RASTRO. As duas gravações acontecem
   * dentro da MESMA transação: ou as duas, ou nenhuma.
   */
  it("grava a posição e o rastro DENTRO da mesma transação", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5 });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 2, posicoesBanco: 0 }, AUTOR);

    expect(escritas).toHaveLength(2);
    expect(escritas.every((e) => e.naTransacao)).toBe(true);
  });

  /**
   * A TRAVA DE EXCESSO, que é código validado e NÃO foi tocada, continua recusando. E o rastro não
   * inventa um evento sobre uma edição que não aconteceu.
   */
  it("recusada a edição por excesso, NADA é gravado: nem posição, nem rastro", async () => {
    const { service, escritas } = makeDb({
      posicoesOficiais: 5,
      candidaturas: [{ situacao: "ALOCADO" }, { situacao: "ALOCADO" }, { situacao: "ALOCADO" }],
    });

    await expect(
      service.editarPosicoes("vaga-1", { posicoesOficiais: 2, posicoesBanco: 0 }, AUTOR),
    ).rejects.toThrow();
    expect(escritas).toHaveLength(0);
  });

  it("vaga já encerrada não escreve rastro nenhum", async () => {
    const { service, escritas } = makeDb({ status: "ENTREGUE", posicoesOficiais: 5 });
    await expect(
      service.editarPosicoes("vaga-1", { posicoesOficiais: 1, posicoesBanco: 0 }, AUTOR),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toHaveLength(0);
  });
});

describe("GET /as/vagas: o rastro viaja na listagem", () => {
  it("vaga sem redução nenhuma sai com a lista VAZIA, que é o caso comum", async () => {
    const { service } = makeDb({ posicoesOficiais: 5 });
    const [v] = await service.list();
    expect(v.metaReducoes).toEqual([]);
  });

  /** A ORDEM É A DO CONTRATO: da mais ANTIGA para a mais RECENTE, para a trilha ser lida de frente. */
  it("devolve as reduções da mais ANTIGA para a mais RECENTE, com quem e quando", async () => {
    const { service } = makeDb({
      posicoesOficiais: 1,
      rastro: [
        linhaDeRastro({
          deOficiais: 5,
          paraOficiais: 3,
          criadoEm: new Date("2026-09-01T10:00:00Z"),
        }),
        linhaDeRastro({
          deOficiais: 3,
          paraOficiais: 1,
          porNome: "Bruno Master",
          criadoEm: new Date("2026-09-05T10:00:00Z"),
        }),
      ],
    });

    const [v] = await service.list();
    expect(v.metaReducoes).toEqual([
      {
        deOficiais: 5,
        paraOficiais: 3,
        deBanco: 0,
        paraBanco: 0,
        porNome: "Ana Consultora",
        quandoIso: "2026-09-01T10:00:00.000Z",
      },
      {
        deOficiais: 3,
        paraOficiais: 1,
        deBanco: 0,
        paraBanco: 0,
        porNome: "Bruno Master",
        quandoIso: "2026-09-05T10:00:00.000Z",
      },
    ]);
  });

  /**
   * O AUTOR APAGADO NÃO APAGA O RASTRO (`on delete set null`, a mesma escolha da trilha do
   * forçamento): sem o nome, ele ainda diz QUANDO e de quanto para quanto.
   */
  it("mantém a redução quando o usuário que reduziu foi removido", async () => {
    const { service } = makeDb({ rastro: [linhaDeRastro({ porNome: null })] });
    const [v] = await service.list();
    expect(v.metaReducoes[0]).toMatchObject({ porNome: null, deOficiais: 5, paraOficiais: 3 });
  });

  /**
   * `deOficiais` NULO (rascunho sem meta) VIRA O PRÓPRIO `paraOficiais` NA LEITURA: o contrato lê os
   * dois iguais como "esta redução não mexeu no oficial", que é exatamente o que aconteceu.
   */
  it("traduz `deOficiais` nulo para o número do lado que não foi reduzido", async () => {
    const { service } = makeDb({
      rastro: [linhaDeRastro({ deOficiais: null, paraOficiais: 3, deBanco: 5, paraBanco: 2 })],
    });
    const [v] = await service.list();
    expect(v.metaReducoes[0]).toMatchObject({ deOficiais: 3, paraOficiais: 3, paraBanco: 2 });
  });

  /**
   * UMA CONSULTA PARA A PÁGINA INTEIRA. A listagem não pagina, então uma ida ao banco por linha
   * viraria centenas de consultas para responder "vazio" em quase todas.
   */
  it("lê o rastro de todas as vagas em UMA consulta, sem N+1", async () => {
    const { service, consultasPorTabela } = makeDb({ rastro: [linhaDeRastro()] });
    await service.list();
    expect(consultasPorTabela.get(vagaMetaReducoes)).toBe(1);
  });
});

/**
 * ─ O DESENHO DA TABELA, e as duas escolhas que sustentam o rastro no banco ──────────────────────
 *
 * ELAS NÃO SE DEFENDEM SOZINHAS. Uma refatoração bem-intencionada troca um `cascade` por um
 * `restrict` (ou tira o check) sem que nenhum teste de comportamento perceba, e o defeito só aparece
 * quando alguém tenta apagar uma vaga, ou quando a trilha começa a encher de "salvei o formulário".
 */
describe("vaga_meta_reducoes: o desenho que o rastro depende", () => {
  const config = getTableConfig(vagaMetaReducoes);

  it("a linha some junto com a VAGA, e sobrevive ao AUTOR", () => {
    const porColuna = new Map(
      config.foreignKeys.map((fk) => [fk.reference().columns[0].name, fk.onDelete]),
    );
    expect(porColuna.get("vaga_id")).toBe("cascade");
    expect(porColuna.get("por_id")).toBe("set null");
  });

  it("o banco recusa a linha que não é redução, e as bordas são as mesmas da vaga", () => {
    const nomes = config.checks.map((c) => c.name);
    expect(nomes).toContain("ck_vaga_meta_reducoes_houve_reducao");
    expect(nomes).toContain("ck_vaga_meta_reducoes_numeros");
  });
});
