import { describe, expect, it, vi } from "vitest";
import { VagasService } from "./vagas.service";
import { VagasController } from "./vagas.controller";
import type { CreateVagaDto } from "./vagas.dto";
import type { AuthUser } from "../../auth/auth.types";
import { asCandidaturas, vagaMetaReducoes, vagas } from "../../db/schema";

/**
 * ─ O RASTRO DA REDUÇÃO DE META NA OUTRA PORTA: a trilha de abertura (veto mantido, 09/09/2026) ──
 *
 * A AUDITORIA MANTEVE O VETO E O TESTER ACHOU O MESMO BURACO SOZINHO. O rastro tinha sido aplicado
 * em UM dos DOIS escritores de `posicoes_oficiais`: a rota irmã (`PATCH /as/vagas/:id/posicoes`)
 * registrava a redução, e ESTA (`PATCH /as/vagas/:id`, a continuação do rascunho) gravava o número
 * novo em silêncio, sem autor e sem uma linha em `vaga_meta_reducoes`.
 *
 * O DESVIO INTEIRO, POR OUTRA ROTA, e é ele que este arquivo guarda fechado:
 *   1. rascunho com meta 5 (o rascunho RECEBE candidato de propósito, `vagaRecebeCandidato`);
 *   2. alocam-se e finalizam-se as posições de N pessoas;
 *   3. um `PATCH` com `{ posicoesOficiais: 1, status: "ABERTA" }` rebaixa a meta E publica;
 *   4. `fechar()` calcula `faltam <= 0`, a vaga fecha pela porta NORMAL, sem Master, com
 *      `fechamento_forcado_*` em branco e `vaga_meta_reducoes` VAZIA.
 *
 * A RESPOSTA CONTINUA SENDO RASTRO, E NÃO TRAVA (decisão do diretor, e o `seguranca` foi explícito:
 * "não estou pedindo trava"). Por isso o primeiro teste daqui é o que incomoda: a redução CONTINUA
 * PASSANDO, e continua publicando. O que ela não pode mais ser é SILENCIOSA.
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. BAIXAR A META PELA TRILHA GRAVA UMA LINHA, com os quatro números e o autor da SESSÃO.
 *   2. O REPRO COMPLETO: baixar a meta E publicar na MESMA requisição também grava.
 *   3. AUMENTAR NÃO GRAVA, e salvar o mesmo par também não.
 *   4. CORPO SEM A META PRESERVA o número gravado, em vez de apagá-lo em silêncio.
 *   5. A MESMA TRANSAÇÃO da escrita da vaga: rastro que pode faltar não é rastro.
 *   6. A CONTROLLER PASSA `user.id`: sem autor, a linha nasce anônima.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

/** A linha da vaga do jeito que a LISTAGEM a lê (o resto dos campos não importa aqui). */
function linhaDaListagem(posicoesOficiais: number | null, posicoesBanco: number) {
  return {
    v: {
      id: "vaga-1",
      codigo: "PS-2026-099",
      nomeDivulgacao: "Vaga de teste",
      status: "RASCUNHO",
      posicoesOficiais,
      posicoesBanco,
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

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
  /** Se aconteceu DENTRO da transação. É o que separa "gravou" de "gravou junto". */
  naTransacao: boolean;
}

/** O corpo mínimo que a trilha manda, com tudo que a régua dos obrigatórios cobra ao publicar. */
function corpo(over: Partial<CreateVagaDto> = {}): CreateVagaDto {
  return {
    codigo: "PS-2026-099",
    nomeDivulgacao: "Vaga de teste",
    cargoId: "cargo-1",
    natureza: "AUMENTO_QUADRO",
    sazonalidade: "OPERACAO_PADRAO",
    dataAbertura: "2026-09-01",
    posicoesOficiais: 1,
    posicoesBanco: 0,
    ...over,
  } as unknown as CreateVagaDto;
}

function makeDb(cenario: { posicoesOficiais?: number | null; posicoesBanco?: number } = {}) {
  const vaga = {
    id: "vaga-1",
    status: "RASCUNHO",
    abertoPorId: "user-1",
    codigo: "PS-2026-099",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
  };

  const escritas: Escrita[] = [];
  let dentroDaTransacao = false;

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.where = () => b;
    b.orderBy = () => {
      if (tabela === vagas) {
        return Promise.resolve([
          linhaDaListagem(vaga.posicoesOficiais, vaga.posicoesBanco),
        ]);
      }
      return Promise.resolve([]);
    };
    b.groupBy = () => Promise.resolve(tabela === asCandidaturas ? [] : []);
    // A trava de duplicidade de código aguarda o próprio builder: nenhum código repetido aqui.
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

  const del = vi.fn(() => ({ where: async () => undefined }));

  const tx = { select, update, insert, delete: del };
  const db = {
    select,
    update,
    insert,
    delete: del,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      dentroDaTransacao = true;
      try {
        return await fn(tx);
      } finally {
        dentroDaTransacao = false;
      }
    },
    query: {
      vagas: { findFirst: vi.fn().mockResolvedValue(vaga) },
      usuarios: {
        findFirst: vi.fn().mockResolvedValue({ id: "user-1", papelAs: "CONSULTOR", ativo: true }),
      },
    },
  };

  return { service: new VagasService(db as never), escritas };
}

const rastroGravado = (e: Escrita[]) => e.filter((x) => x.tabela === vagaMetaReducoes);
const vagaGravada = (e: Escrita[]) => e.filter((x) => x.tabela === vagas);
const AUTOR = "user-comum";

describe("atualizar (trilha de abertura): a redução de meta deixa rastro, e continua passando", () => {
  it("PERMITE baixar a meta do rascunho, e grava quem, de quanto para quanto, na mesma transação", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5 });

    await service.atualizar("vaga-1", corpo({ posicoesOficiais: 1 }), AUTOR);

    expect(vagaGravada(escritas)[0].valores).toMatchObject({ posicoesOficiais: 1 });
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
    expect(rastro[0].naTransacao).toBe(true);
  });

  /**
   * O REPRO INTEIRO, NUMA REQUISIÇÃO SÓ. Rebaixar a meta E publicar era o caminho que zerava o
   * `faltam` do fechamento sem passar por Master e sem deixar linha nenhuma.
   */
  it("baixar a meta E publicar na mesma requisição também grava o rastro", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5 });

    await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: 1, status: "ABERTA" } as Partial<CreateVagaDto>),
      AUTOR,
    );

    expect(vagaGravada(escritas)[0].valores).toMatchObject({
      posicoesOficiais: 1,
      status: "ABERTA",
    });
    expect(rastroGravado(escritas)[0].valores).toMatchObject({ deOficiais: 5, paraOficiais: 1 });
  });

  it("AUMENTAR a meta não grava: aumento afasta o fechamento em vez de aproximá-lo", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5 });
    await service.atualizar("vaga-1", corpo({ posicoesOficiais: 8 }), AUTOR);
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  it("salvar o MESMO par não grava: 'salvei o formulário' não é evento", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5, posicoesBanco: 2 });
    await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: 5, posicoesBanco: 2 }),
      AUTOR,
    );
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  it("a redução do BANCO também gera linha, e ela carrega os DOIS lados", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5, posicoesBanco: 3 });

    await service.atualizar("vaga-1", corpo({ posicoesOficiais: 5, posicoesBanco: 1 }), AUTOR);

    expect(rastroGravado(escritas)[0].valores).toMatchObject({
      deOficiais: 5,
      paraOficiais: 5,
      deBanco: 3,
      paraBanco: 1,
    });
  });

  /**
   * META QUE JÁ EXISTIA NÃO É APAGADA PELO CORPO SEM O CAMPO, e este é o caso que o tester mediu:
   * omitir gravava NULO, e nulo é a redução mais completa que há (o fechamento perde o gate por
   * inteiro, `travaPosicoesOficiais` devolve `null` de saída). O rastro não sabe escrever "virou
   * nulo" (`para_oficiais` é NOT NULL e `> 0`), então a saída não é apagar em silêncio: é preservar.
   */
  it("corpo SEM a meta PRESERVA o número gravado, em vez de apagá-lo sem rastro", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 5 });

    await service.atualizar("vaga-1", corpo({ posicoesOficiais: undefined }), AUTOR);

    expect(vagaGravada(escritas)[0].valores).toMatchObject({ posicoesOficiais: 5 });
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  it("meta explicitamente NULA no corpo também preserva: apagar não é definir", async () => {
    const { service, escritas } = makeDb({ posicoesOficiais: 4 });

    await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: null as unknown as number }),
      AUTOR,
    );

    expect(vagaGravada(escritas)[0].valores).toMatchObject({ posicoesOficiais: 4 });
    expect(rastroGravado(escritas)).toHaveLength(0);
  });

  /**
   * O RASCUNHO SEM META CONTINUA NASCENDO SEM META: a preservação não inventa número onde não havia,
   * e DEFINIR a meta pela primeira vez não é redução (é o que a régua já dizia).
   */
  it("rascunho sem meta continua sem meta, e definir a primeira meta não gera linha", async () => {
    const semMeta = makeDb({ posicoesOficiais: null });
    await semMeta.service.atualizar("vaga-1", corpo({ posicoesOficiais: undefined }), AUTOR);
    expect(vagaGravada(semMeta.escritas)[0].valores).toMatchObject({ posicoesOficiais: null });

    const definindo = makeDb({ posicoesOficiais: null });
    await definindo.service.atualizar("vaga-1", corpo({ posicoesOficiais: 3 }), AUTOR);
    expect(vagaGravada(definindo.escritas)[0].valores).toMatchObject({ posicoesOficiais: 3 });
    expect(rastroGravado(definindo.escritas)).toHaveLength(0);
  });
});

/**
 * ─ O AUTOR VEM DA SESSÃO, e é a controller que o entrega ────────────────────────────────────────
 *
 * O SERVICE ACEITA A CHAMADA SEM AUTOR (a linha nasceria anônima, que é melhor do que não nascer:
 * `por_id` é `set null` no banco pela mesma razão). Quem garante que a produção NUNCA passa por aí é
 * este teste: a rota real lê `user.id` do `@CurrentUser()` e repassa.
 */
describe("a rota da trilha entrega o autor da sessão ao service", () => {
  it("repassa `user.id`, e não o corpo, para o `atualizar`", async () => {
    const atualizar = vi.fn().mockResolvedValue({ id: "vaga-1" });
    const controller = new VagasController({ atualizar } as unknown as VagasService);
    const dto = corpo();

    await controller.atualizar("vaga-1", dto, { id: "user-7" } as AuthUser);

    expect(atualizar).toHaveBeenCalledWith("vaga-1", dto, "user-7");
  });

  /*
   * ┌─ A ROTA IRMÃ PRECISA DA MESMA PROVA, e ela não tinha (achado do `tester`, 09/09) ──────────┐
   * │ A ASSIMETRIA ERA ESTA: a porta consertada (a trilha) ganhou o teste de controller acima, e  │
   * │ a porta ORIGINAL (as posições), que já gravava o rastro desde a primeira rodada, nunca teve │
   * │ ninguém afirmando de onde vem o autor. Todos os testes dela chamam o service direto,        │
   * │ passando o autor à mão, que é justamente o que um teste de controller existe para não fazer.│
   * │                                                                                            │
   * │ O DEFEITO QUE PASSARIA VERDE HOJE: trocar `user.id` por um campo do corpo no handler faz o  │
   * │ rastro da rota original nascer anônimo, ou em nome de quem o cliente disser, e nenhum teste │
   * │ da suíte fica vermelho. É a mesma classe de furo que a auditoria achou na outra porta,      │
   * │ sobrevivendo na porta que já tinha sido consertada.                                         │
   * │                                                                                            │
   * │ O compilador ajuda um pouco e não basta: `editarPosicoes(id, dto, autorId: string)` tem o   │
   * │ terceiro parâmetro OBRIGATÓRIO, então OMITIR quebra o build. Passar o valor ERRADO, não.    │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a rota das posições repassa `user.id`, e não o corpo, para o `editarPosicoes`", async () => {
    const editarPosicoes = vi.fn().mockResolvedValue({ id: "vaga-1" });
    const controller = new VagasController({ editarPosicoes } as unknown as VagasService);
    const dto = { posicoesOficiais: 3, posicoesBanco: 1 };

    await controller.editarPosicoes(
      "vaga-1",
      dto as unknown as Parameters<VagasController["editarPosicoes"]>[1],
      { id: "user-7" } as AuthUser,
    );

    expect(editarPosicoes).toHaveBeenCalledWith("vaga-1", dto, "user-7");
  });
});
