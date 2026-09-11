import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { VagasService } from "./vagas.service";
import { VagasController } from "./vagas.controller";
import type { CreateVagaDto } from "./vagas.dto";
import type { AuthUser } from "../../auth/auth.types";
import { asCandidaturas, asLinhasServico, vagaMetaReducoes, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

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
 *   7. O PASSO 4 DO REPRO, que faltava: a vaga rebaixada pela trilha chega a FECHAR, e a redução
 *      SAI NA LEITURA da vaga fechada. Até aqui a propriedade era deduzida do `insert`.
 *   8. A META NÃO DESCE ABAIXO DO ENTREGUE também por esta porta (a trava que existia só na irmã).
 *   9. O RAMO DO `deOficiais` NULO: gravado cru, traduzido na leitura.
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
/** A linha de serviço que o catálogo fingido devolve, e que o corpo publicável escolhe. */
const LINHA_SERVICO = {
  id: 1,
  codigo: "PONTUAIS_ESTRATEGICAS",
  rotulo: "Pontuais & Estratégicas",
  ordem: 1,
  ativo: true,
};

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
    // A LINHA DE SERVIÇO (Onda C) É OBRIGATÓRIA PARA PUBLICAR, e este corpo é o de uma vaga
    // PUBLICÁVEL. Sem ela, todo caso que publica (`status: "ABERTA"`) pararia na régua dos
    // obrigatórios ANTES de chegar na trava de meta, e os testes desta suíte passariam a medir a
    // mensagem errada. O catálogo é servido pelo fake logo abaixo.
    linhaServicoId: LINHA_SERVICO.id,
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
    // O CATÁLOGO DE LINHAS DE SERVIÇO (Onda C) é lido assim, sem `where` nem `orderBy`: o serviço
    // pega a lista inteira (são cinco linhas) e aplica a régua pura em memória.
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(tabela === asLinhasServico ? [LINHA_SERVICO] : []).then(r);
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

  return { service: new VagasService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never), escritas };
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

/**
 * ─ O PASSO 4, QUE FALTAVA: A VAGA REBAIXADA PELA TRILHA CHEGA A FECHAR ──────────────────────────
 *
 * ┌─ POR QUE ISTO PRECISOU DE OUTRO FAKE, e por que ele é COM MEMÓRIA ─────────────────────────┐
 * │ O CABEÇALHO DESTE ARQUIVO DESCREVE QUATRO PASSOS E OS TESTES ACIMA PARAM NO TERCEIRO: eles │
 * │ provam que o `insert` do rastro acontece. A PROPRIEDADE que interessa é outra, e é a do    │
 * │ passo 4: a vaga fechada depois do desvio fica DISTINGUÍVEL de uma vaga que entregou o que  │
 * │ prometeu, na ponta em que alguém pergunta. Até aqui isso era DEDUZIDO do `insert`, e o     │
 * │ precedente do módulo é justamente o de um teste verde sobre o DESENHO convivendo com o     │
 * │ sistema contornável (`vagas.fechar-sem-roles.spec.ts`).                                    │
 * │                                                                                           │
 * │ O FAKE DE CIMA NÃO SERVE porque não tem estado: o `SELECT ... FOR UPDATE` do fechamento    │
 * │ leria a meta ORIGINAL e o teste diria que o gate segurou a vaga, que é exatamente a falsa  │
 * │ tranquilidade a evitar. Este aqui é o mesmo fake com memória do                            │
 * │ `vagas.fechamento-apos-reducao.spec.ts`, que faz a mesma prova pela ROTA IRMÃ.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ COMO OS DOIS ITENS DESTA RODADA INTERAGEM, e o caso mudou de forma por causa disso ───────┐
 * │ A TRAVA DE EXCESSO PASSOU A VALER TAMBÉM NESTA ROTA (item 2), então o repro literal do     │
 * │ cabeçalho (meta 5 para 1 com 3 entregues) NÃO PASSA MAIS: é número impossível, e agora ele │
 * │ é recusado nas duas portas. O desvio do GATE, porém, continua vivo e continua sendo a      │
 * │ decisão do diretor (RASTRO, não trava): baixar a meta ATÉ o que já foi entregue zera o     │
 * │ `faltam` do fechamento do mesmo jeito, sem Master e sem trilha de forçamento. É esse o     │
 * │ caso construído aqui, e é ele que o rastro precisa contar.                                 │
 * │                                                                                           │
 * │ A BORDA É O PRÓPRIO ENTREGUE, e os dois testes a cercam pelos dois lados: 3 entregues,     │
 * │ baixar para 3 PASSA (e deixa rastro), baixar para 2 é RECUSADO (e não deixa nada).         │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 */

const T0 = new Date("2026-09-09T12:00:00.000Z");

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** Uma candidatura da vaga, na forma que a leitura do fechamento devolve. */
function pessoa(situacao: string, posicaoLado: string | null, nome: string) {
  return {
    candidaturaId: `cand-${nome}`,
    candidatoId: `pessoa-${nome}`,
    candidatoNome: nome,
    etapa: "APROVACAO",
    situacao,
    posicaoLado,
  };
}

function pessoas(quantas: number, situacao: string, posicaoLado: string | null = null) {
  return Array.from({ length: quantas }, (_, i) => pessoa(situacao, posicaoLado, `P${i}`));
}

interface LinhaDeRastro {
  vagaId: string;
  deOficiais: number | null;
  paraOficiais: number;
  deBanco: number;
  paraBanco: number;
  porId: string | null;
  criadoEm: Date;
}

/**
 * O BANCO COM MEMÓRIA: o que a trilha grava é lido pelo `fechar` da chamada seguinte, e o rastro
 * gravado sai na LISTAGEM, que é onde a pergunta "esta vaga fechou porque entregou?" é feita.
 */
function makeDbComMemoria(cenario: {
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  candidaturas?: ReturnType<typeof pessoa>[];
}) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    codigo: "PS-2026-099",
    nomeDivulgacao: "Vaga de teste",
    status: "RASCUNHO",
    abertoPorId: "user-1",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
    vagasFechadas: null,
    vagasFechadasBanco: null,
    escolaridade: null,
    regioes: [],
    idiomas: [],
    testes: [],
    etapasPs: [],
    criadoEm: T0,
    fechamentoForcadoPorId: null,
    fechamentoForcadoEm: null,
    fechamentoForcadoFaltavam: null,
  };

  const candidaturas = cenario.candidaturas ?? [];
  const rastro: LinhaDeRastro[] = [];
  let tique = 0;

  /** O `group by` da ocupação, montado sobre as candidaturas do cenário. */
  const agregado = () => {
    const chave = new Map<string, { vagaId: string; situacao: string; posicaoLado: string | null; quantas: number }>();
    for (const l of candidaturas) {
      const k = `${l.situacao}|${l.posicaoLado ?? ""}`;
      const atual = chave.get(k) ?? {
        vagaId: "vaga-1",
        situacao: l.situacao,
        posicaoLado: l.posicaoLado,
        quantas: 0,
      };
      atual.quantas += 1;
      chave.set(k, atual);
    }
    return [...chave.values()];
  };

  const daListagem = () => ({
    v: { ...vaga },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
    fechamentoForcadoPorNome: null,
  });

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
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.orderBy = () => {
      if (tabela === asCandidaturas) return Promise.resolve(candidaturas);
      if (tabela === vagas) return Promise.resolve([daListagem()]);
      if (tabela === vagaMetaReducoes) {
        return Promise.resolve(
          rastro.map((r) => ({
            vagaId: r.vagaId,
            deOficiais: r.deOficiais,
            paraOficiais: r.paraOficiais,
            deBanco: r.deBanco,
            paraBanco: r.paraBanco,
            porNome: r.porId === COMUM.id ? "Ana Consultora" : null,
            criadoEm: r.criadoEm,
          })),
        );
      }
      return Promise.resolve([]);
    };
    b.groupBy = () => Promise.resolve(tabela === asCandidaturas ? agregado() : []);
    // O CATÁLOGO DE LINHAS DE SERVIÇO (Onda C), lido sem `where` nem `orderBy`, como o outro fake.
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(tabela === asLinhasServico ? [LINHA_SERVICO] : []).then(r);
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      if (tabela === vagas) Object.assign(vaga, valores);
      return { where: async () => undefined };
    },
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: async (valores: Record<string, unknown>) => {
      if (tabela === vagaMetaReducoes) {
        tique += 1;
        rastro.push({
          criadoEm: new Date(T0.getTime() + tique * 60_000),
          ...(valores as unknown as Omit<LinhaDeRastro, "criadoEm">),
        });
      }
    },
  }));

  const del = vi.fn(() => ({ where: async () => undefined }));

  const tx = { select, update, insert, delete: del };
  const db = {
    select,
    update,
    insert,
    delete: del,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      vagas: { findFirst: async () => ({ ...vaga }) },
      usuarios: {
        findFirst: async () => ({ id: "user-1", papelAs: "CONSULTOR", ativo: true }),
      },
    },
  };

  return { service: new VagasService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never), vaga, rastro };
}

const FECHAMENTO = { dataFechamento: "2026-09-09" };

describe("o passo 4: a vaga rebaixada pela TRILHA chega a FECHAR, e o rastro conta a história", () => {
  it("baixar até o entregue, publicar e FECHAR: sem Master, e a redução sai na leitura da vaga", async () => {
    const { service, vaga } = makeDbComMemoria({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    // O GESTO DO DESVIO, NUMA REQUISIÇÃO SÓ: rebaixa a meta de 5 para 3 (o que já foi entregue) e
    // publica. Continua PASSANDO, que é a decisão do diretor.
    await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: 3, status: "ABERTA" } as Partial<CreateVagaDto>),
      COMUM.id,
    );
    expect(vaga.status).toBe("ABERTA");
    expect(vaga.posicoesOficiais).toBe(3);

    // E A VAGA FECHA PELA PORTA NORMAL: `faltam` deu zero, então nem `forcar` nem Master.
    const fechada = await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    expect(vaga.status).toBe("ENTREGUE");
    expect(vaga.vagasFechadas).toBe(3);
    expect(fechada.fechamentoForcado).toBeNull();

    // ─ A PROPRIEDADE DO PASSO 4: a vaga fechada pelo desvio da TRILHA fica DISTINGUÍVEL.
    expect(fechada.metaReducoes).toHaveLength(1);
    expect(fechada.metaReducoes[0]).toMatchObject({
      deOficiais: 5,
      paraOficiais: 3,
      porNome: "Ana Consultora",
    });
    expect(fechada.metaReducoes[0].quandoIso).toBeTruthy();
  });

  it("o CONTRASTE: a entrega real publicada pela trilha fecha com o rastro VAZIO", async () => {
    const { service } = makeDbComMemoria({
      posicoesOficiais: 3,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: 3, status: "ABERTA" } as Partial<CreateVagaDto>),
      COMUM.id,
    );
    const fechada = await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    // Mesmo status, mesma contagem, mesma trilha de forçamento vazia do caso anterior. Sem o rastro,
    // os dois fechamentos seriam o MESMO registro e a pergunta não teria resposta em lugar nenhum.
    expect(fechada.status).toBe("ENTREGUE");
    expect(fechada.vagasFechadas).toBe(3);
    expect(fechada.fechamentoForcado).toBeNull();
    expect(fechada.metaReducoes).toEqual([]);
  });
});

/**
 * ─ ITEM 2: A META NÃO DESCE ABAIXO DO ENTREGUE, TAMBÉM PELA TRILHA ──────────────────────────────
 *
 * A TRAVA EXISTIA EM `editarPosicoes` E FALTAVA AQUI. As duas portas escrevem `posicoes_oficiais`,
 * e o rascunho RECEBE candidato e pode ter posição finalizada: dava para publicar meta 1 com 3
 * entregues, que é número IMPOSSÍVEL (ocupação estourada na tela, `faltam` negativo no fechamento).
 *
 * O QUE NÃO MUDOU: a REDUÇÃO em si continua passando e continua deixando rastro. O que passa a ser
 * recusado é só o número que não descreve estado nenhum.
 */
describe("a trilha recusa a meta ABAIXO do que a vaga já entregou", () => {
  it("RECUSA baixar para 2 com 3 entregues, e não deixa meia mudança nem linha de rastro", async () => {
    const { service, vaga, rastro } = makeDbComMemoria({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    const erro = await service
      .atualizar("vaga-1", corpo({ posicoesOficiais: 2, status: "ABERTA" } as Partial<CreateVagaDto>), COMUM.id)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    // A FRASE É A MESMA DA ROTA IRMÃ, e diz qual número serve. §A.11: sem travessão.
    const msg = String((erro.getResponse() as { message?: string })?.message ?? erro);
    expect(msg).toContain("já entregou 3 posições oficiais");
    expect(msg).toContain("Informe 3 ou mais");
    expect(msg).not.toContain("—");

    // NADA foi escrito: nem a meta, nem a publicação, nem o rastro.
    expect(vaga.posicoesOficiais).toBe(5);
    expect(vaga.status).toBe("RASCUNHO");
    expect(rastro).toHaveLength(0);
  });

  it("a borda é o PRÓPRIO entregue: 3 passa e deixa rastro, 2 é recusado e não deixa nada", async () => {
    const { service, rastro } = makeDbComMemoria({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await expect(
      service.atualizar("vaga-1", corpo({ posicoesOficiais: 2 }), COMUM.id),
    ).rejects.toBeInstanceOf(BadRequestException);
    await service.atualizar("vaga-1", corpo({ posicoesOficiais: 3 }), COMUM.id);

    expect(rastro).toHaveLength(1);
    expect(rastro[0]).toMatchObject({ deOficiais: 5, paraOficiais: 3, porId: COMUM.id });
  });

  /**
   * OS DOIS LADOS SÃO CONFERIDOS SEPARADAMENTE, e é a régua do domínio que faz isso: sobrar oficial
   * não autoriza estourar o banco. Aqui as oficiais estão de sobra e o BANCO é que não cabe.
   */
  it("o lado do BANCO também é conferido: 2 entregues no banco recusam a meta de banco 1", async () => {
    const { service, vaga } = makeDbComMemoria({
      posicoesOficiais: 5,
      posicoesBanco: 4,
      candidaturas: pessoas(2, "ALOCADO", "BANCO"),
    });

    const erro = await service
      .atualizar("vaga-1", corpo({ posicoesOficiais: 5, posicoesBanco: 1 }), COMUM.id)
      .catch((e) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro.getResponse() as { message?: string })?.message)).toContain(
      "2 posições de banco",
    );
    expect(vaga.posicoesBanco).toBe(4);
  });

  /**
   * A VAGA VAZIA NÃO É ALCANÇADA POR NADA DISSO: sem ninguém entregue, qualquer meta cabe, e é assim
   * que o rascunho continua sendo rascunho. A trava fala do IMPOSSÍVEL, não da decisão.
   */
  it("sem ninguém entregue, baixar a meta continua livre e continua deixando rastro", async () => {
    const { service, vaga, rastro } = makeDbComMemoria({ posicoesOficiais: 5, candidaturas: [] });

    await service.atualizar("vaga-1", corpo({ posicoesOficiais: 1 }), COMUM.id);

    expect(vaga.posicoesOficiais).toBe(1);
    expect(rastro[0]).toMatchObject({ deOficiais: 5, paraOficiais: 1 });
  });

  /**
   * QUEM CONTA É A OCUPAÇÃO DERIVADA, e não uma segunda lista de situações: o DESCARTADO não entrega
   * posição nenhuma, então ele não segura a meta. Com o insumo errado (contar toda candidatura), esta
   * redução seria recusada sem motivo.
   */
  it("quem NÃO entregou posição não segura a meta: 3 descartados não impedem baixar para 1", async () => {
    const { service, vaga } = makeDbComMemoria({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "DESCARTADO"),
    });

    await service.atualizar("vaga-1", corpo({ posicoesOficiais: 1 }), COMUM.id);
    expect(vaga.posicoesOficiais).toBe(1);
  });
});

/**
 * ─ ITEM 3: O RAMO EM QUE O RASTRO GRAVA `deOficiais` NULO, E COMO A LEITURA O TRADUZ ────────────
 *
 * O RAMO EXISTE E NÃO ERA PERCORRIDO POR TESTE NENHUM. `reducaoDeMeta` grava `de_oficiais` NULO
 * quando a vaga NÃO TINHA meta oficial antes e o BANCO caiu na mesma requisição: rascunho sem meta
 * que, no MESMO gesto, define a oficial e baixa o banco. A coluna é nulável exatamente para isso, e
 * nulo é a verdade crua do que havia antes.
 *
 * A LEITURA TRADUZ (`deOficiais ?? paraOficiais`), e a tradução não é cosmética: o contrato do
 * `VagaMetaReducao` é `number` não nulo, e é comparando `deOficiais` com `paraOficiais` que a tela
 * decide NÃO escrever "a meta oficial caiu". Sem a tradução, a frase leria nulo e o lado oficial
 * pareceria ter sido reduzido a partir do nada.
 */
describe("a redução que DEFINE a oficial e baixa o banco: nulo no banco de dados, traduzido na leitura", () => {
  it("grava `deOficiais` NULO, e a LEITURA devolve o número novo no lugar dele", async () => {
    const { service, rastro } = makeDbComMemoria({ posicoesOficiais: null, posicoesBanco: 5 });

    const vaga = await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: 3, posicoesBanco: 1 }),
      COMUM.id,
    );

    // O QUE FOI GRAVADO: `deOficiais` nulo, porque não havia meta oficial antes.
    expect(rastro).toHaveLength(1);
    expect(rastro[0]).toMatchObject({
      deOficiais: null,
      paraOficiais: 3,
      deBanco: 5,
      paraBanco: 1,
    });

    // O QUE A LEITURA DEVOLVE: o contrato é `number`, e nulo vira o próprio `paraOficiais`.
    expect(vaga.metaReducoes).toHaveLength(1);
    expect(vaga.metaReducoes[0].deOficiais).toBe(3);
    expect(vaga.metaReducoes[0].paraOficiais).toBe(3);
    // E É ASSIM QUE A TELA SABE QUE O OFICIAL NÃO CAIU: os dois números iguais, como na redução que
    // mexe só no banco. O que caiu, e a linha diz qual foi, é o BANCO.
    expect(vaga.metaReducoes[0].deOficiais).toBe(vaga.metaReducoes[0].paraOficiais);
    expect([vaga.metaReducoes[0].deBanco, vaga.metaReducoes[0].paraBanco]).toEqual([5, 1]);
  });

  /**
   * O RAMO VIZINHO, para a fronteira ficar cercada: sem meta oficial ANTES e sem meta oficial
   * DEPOIS, `reducaoDeMeta` devolve `null` e NENHUMA linha nasce, mesmo com o banco caindo. Não é
   * escolha estética: `para_oficiais` é NOT NULL e `> 0` por check, e inventar um zero descreveria
   * um estado que a vaga nunca teve.
   */
  it("sem meta oficial antes E depois, o banco caindo sozinho não gera linha nenhuma", async () => {
    const { service, rastro } = makeDbComMemoria({ posicoesOficiais: null, posicoesBanco: 5 });

    await service.atualizar(
      "vaga-1",
      corpo({ posicoesOficiais: undefined, posicoesBanco: 1 }),
      COMUM.id,
    );

    expect(rastro).toHaveLength(0);
  });
});
