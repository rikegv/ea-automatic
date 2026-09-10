import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { VagasService } from "./vagas.service";
import { asCandidaturas, vagaBeneficio, vagaMetaReducoes, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";

/**
 * ─ O FURO DO GATE, PONTA A PONTA: REDUZIR A META E ENTÃO FECHAR A VAGA ──────────────────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NÃO É O `vagas.rastro-reducao-meta.spec.ts` ─────┐
 * │ AQUELE ARQUIVO PROVA QUE A REDUÇÃO GRAVA UMA LINHA. Este prova a coisa DIFERENTE, que é a    │
 * │ razão de a linha existir: que a VAGA FECHADA depois de uma redução fica DISTINGUÍVEL de uma  │
 * │ vaga que entregou o que prometeu. Uma coisa é o `insert` acontecer; outra é a história ficar │
 * │ contada na ponta em que alguém vai perguntar.                                                │
 * │                                                                                              │
 * │ A DIFERENÇA NÃO É ACADÊMICA, e o precedente desta frente é a prova: existia um teste verde   │
 * │ (`vagas.fechar-sem-roles.spec.ts`) afirmando que a rota NÃO tem `@Roles`, enquanto o sistema  │
 * │ era contornável pela rota irmã. Ele testava o DESENHO ("o decorador não está lá") e não a     │
 * │ PROPRIEDADE ("o fechamento sem Master não passa despercebido"). 194 testes verdes não pegaram │
 * │ o desvio porque nenhum deles chegava a FECHAR a vaga depois de mexer na meta.                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O FAKE AQUI É COM ESTADO, e é isso que o separa dos outros dois fakes do módulo: a escrita de
 * `editarPosicoes` PRECISA ser lida pelo `fechar` da chamada seguinte. Com um fake sem memória, o
 * `SELECT ... FOR UPDATE` do fechamento devolveria a meta ORIGINAL e o teste diria que o gate segurou
 * a vaga, que é exatamente a falsa tranquilidade que se está tentando eliminar.
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. O CONTORNO CONTINUA PASSANDO (é a decisão do diretor: rastro, não trava) e DEIXA MARCA.
 *   2. O CONTRASTE: a entrega real fecha com o rastro VAZIO. É o par dos dois casos que torna o
 *      primeiro legível; sozinha, uma lista com uma linha não diz que a outra não teria nenhuma.
 *   3. DUAS REDUÇÕES SEGUIDAS continuam contando o encolhimento INTEIRO (5 para 3, 3 para 1), e não
 *      só o último passo.
 *   4. REDUZIR SÓ O BANCO NÃO ABRE O FECHAMENTO: o gate lê o lado oficial, e o rastro nasce sem o
 *      gate se mover um milímetro.
 *   5. O CONTORNO PELA SOMA (oficial de 5 para 1 subindo o banco de 0 para 4, soma intacta em 5) é
 *      pego pelos DOIS lados: o gate abre e o rastro registra a queda do oficial.
 *   6. AS DUAS TRILHAS NÃO SE CONFUNDEM: o Master que força sem reduzir sai com a trilha do forçado
 *      preenchida e o rastro vazio.
 */

const T0 = new Date("2026-09-09T12:00:00.000Z");

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const MASTER: AuthUser = { ...COMUM, id: "user-master", papel: "MASTER" };

const NOME_DE = new Map<string, string>([
  ["user-comum", "Ana Consultora"],
  ["user-master", "Beto Master"],
]);

/** Uma candidatura da vaga, na forma que a leitura do fechamento devolve. */
function pessoa(situacao: string, posicaoLado: string | null = null, nome = "Fulano") {
  return {
    candidaturaId: `cand-${nome}-${situacao}-${posicaoLado ?? "OFICIAL"}`,
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
 * O BANCO COM MEMÓRIA. `editarPosicoes` grava na MESMA linha que `fechar` vai travar e ler, e o
 * rastro gravado sai na listagem, que é onde a pergunta ("esta vaga fechou porque entregou?") é feita.
 */
function makeDb(cenario: {
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  candidaturas?: ReturnType<typeof pessoa>[];
}) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    codigo: "PS-2026-777",
    nomeDivulgacao: "Vaga de teste",
    status: "ABERTA",
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

  const linhas = cenario.candidaturas ?? [];
  const rastro: LinhaDeRastro[] = [];
  let tique = 0;

  const agregado = () => {
    const chave = new Map<
      string,
      { vagaId: string; situacao: string; posicaoLado: string | null; quantas: number }
    >();
    for (const l of linhas) {
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

  /** A linha da listagem é MONTADA NA HORA, sobre o estado atual: é assim que a leitura enxerga o que foi escrito. */
  const daListagem = () => ({
    v: { ...vaga },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
    fechamentoForcadoPorNome: vaga.fechamentoForcadoPorId
      ? (NOME_DE.get(vaga.fechamentoForcadoPorId as string) ?? null)
      : null,
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
      if (tabela === asCandidaturas) return Promise.resolve(linhas);
      if (tabela === vagas) return Promise.resolve([daListagem()]);
      if (tabela === vagaMetaReducoes) {
        return Promise.resolve(
          rastro.map((r) => ({
            vagaId: r.vagaId,
            deOficiais: r.deOficiais,
            paraOficiais: r.paraOficiais,
            deBanco: r.deBanco,
            paraBanco: r.paraBanco,
            porNome: r.porId ? (NOME_DE.get(r.porId) ?? null) : null,
            criadoEm: r.criadoEm,
          })),
        );
      }
      if (tabela === vagaBeneficio) return Promise.resolve([]);
      return Promise.resolve([]);
    };
    b.groupBy = () => Promise.resolve(tabela === asCandidaturas ? agregado() : []);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
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

  const tx = { select, update, insert };
  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };

  return { service: new VagasService(db as never, catalogoDeEtapasFingido() as never), vaga, rastro };
}

const FECHAMENTO = { dataFechamento: "2026-09-09" };

/** Tenta fechar e devolve a recusa, para o teste afirmar sobre ela sem `try/catch` espalhado. */
async function recusaAoFechar(service: VagasService, user: AuthUser, forcar = false) {
  try {
    await service.fechar("vaga-1", { ...FECHAMENTO, forcar } as never, user);
    return null;
  } catch (err) {
    return err as ConflictException;
  }
}

describe("o contorno do gate de Master: baixar a meta até o entregue e FECHAR", () => {
  it("o COMUM baixa 5 para 3 com 3 entregues, fecha SEM Master, e o fechamento fica DISTINGUÍVEL", async () => {
    const { service, vaga } = makeDb({ posicoesOficiais: 5, candidaturas: pessoas(3, "ALOCADO") });

    // ANTES da redução, o gate segura a vaga e nem oferece o forçamento ao COMUM.
    const antes = await recusaAoFechar(service, COMUM);
    expect(antes).toBeInstanceOf(ConflictException);
    expect(antes!.getResponse()).toMatchObject({
      motivo: "POSICOES_OFICIAIS_ABERTAS",
      faltam: 2,
      podeForcar: false,
    });

    // O GESTO DO DESVIO, e ele CONTINUA PASSANDO: é a decisão do diretor, rastro e não trava.
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 3, posicoesBanco: 0 }, COMUM.id);

    // E AGORA A VAGA FECHA PELA PORTA NORMAL, sem Master e sem `forcar`.
    const fechada = await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    expect(vaga.status).toBe("ENTREGUE");
    expect(vaga.vagasFechadas).toBe(3);
    // A TRILHA DO FORÇAMENTO FICA EM BRANCO, exatamente como o desvio previa: não houve forçamento.
    expect(vaga.fechamentoForcadoPorId).toBeNull();
    expect(fechada.fechamentoForcado).toBeNull();

    // ─ A PROPRIEDADE: a história FICA CONTADA, e quem lê a vaga fechada vê por que ela fechou.
    expect(fechada.metaReducoes).toHaveLength(1);
    expect(fechada.metaReducoes[0]).toMatchObject({
      deOficiais: 5,
      paraOficiais: 3,
      porNome: "Ana Consultora",
    });
    expect(fechada.metaReducoes[0].quandoIso).toBeTruthy();
  });

  it("a entrega REAL fecha com o rastro VAZIO, e é o CONTRASTE que torna o outro caso legível", async () => {
    const { service } = makeDb({ posicoesOficiais: 3, candidaturas: pessoas(3, "ALOCADO") });

    const fechada = await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    // As colunas da VAGA são idênticas às do teste anterior: mesmo status, mesma contagem, mesma
    // trilha de forçamento vazia. Se o rastro não existisse, os dois fechamentos seriam o MESMO
    // registro, e a pergunta "entregou ou encolheram a meta?" não teria resposta em lugar nenhum.
    expect(fechada.status).toBe("ENTREGUE");
    expect(fechada.vagasFechadas).toBe(3);
    expect(fechada.fechamentoForcado).toBeNull();
    expect(fechada.metaReducoes).toEqual([]);
  });

  it("redução em DOIS passos: a trilha conta 5 para 3 e 3 para 1, e não só o último passo", async () => {
    const { service } = makeDb({ posicoesOficiais: 5, candidaturas: pessoas(1, "ALOCADO") });

    await service.editarPosicoes("vaga-1", { posicoesOficiais: 3, posicoesBanco: 0 }, COMUM.id);
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 1, posicoesBanco: 0 }, MASTER.id);

    const fechada = await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    expect(fechada.metaReducoes).toHaveLength(2);
    // A ORDEM É DO MAIS ANTIGO PARA O MAIS RECENTE, e é ela que deixa a leitura "5 para 3, depois 3
    // para 1" possível. Invertida, o encolhimento total fica ilegível.
    expect(fechada.metaReducoes.map((r) => [r.deOficiais, r.paraOficiais])).toEqual([
      [5, 3],
      [3, 1],
    ]);
    // O ENCOLHIMENTO INTEIRO: de onde a primeira linha partiu até onde a última chegou. Guardar só a
    // última contaria QUATRO posições sumidas como DUAS.
    const primeira = fechada.metaReducoes[0];
    const ultima = fechada.metaReducoes[fechada.metaReducoes.length - 1];
    expect([primeira.deOficiais, ultima.paraOficiais]).toEqual([5, 1]);
    // E CADA PASSO RESPONDE POR SI: os dois autores aparecem, não só o último.
    expect(fechada.metaReducoes.map((r) => r.porNome)).toEqual(["Ana Consultora", "Beto Master"]);
  });

  it("reduzir SÓ O BANCO deixa rastro e NÃO abre o fechamento: o gate lê o lado oficial", async () => {
    const { service } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 4,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await service.editarPosicoes("vaga-1", { posicoesOficiais: 5, posicoesBanco: 0 }, COMUM.id);

    // O RASTRO NASCE (o banco caiu), e o GATE NÃO SE MOVEU UM MILÍMETRO: continuam faltando as 2
    // posições OFICIAIS. Reserva não é entrega, nem quando ela desaparece.
    const recusa = await recusaAoFechar(service, COMUM);
    expect(recusa).toBeInstanceOf(ConflictException);
    expect(recusa!.getResponse()).toMatchObject({
      motivo: "POSICOES_OFICIAIS_ABERTAS",
      faltam: 2,
      posicoesOficiais: 5,
    });
  });

  it("o contorno pela SOMA (oficial 5 para 1 subindo o banco de 0 para 4) é pego pelos DOIS lados", async () => {
    const { service, vaga } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 0,
      candidaturas: pessoas(1, "ALOCADO"),
    });

    // 5 + 0 = 5 e 1 + 4 = 5: quem conferisse a SOMA não veria redução nenhuma acontecer.
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 1, posicoesBanco: 4 }, COMUM.id);

    const fechada = await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    // O GATE ABRIU, porque ele lê o lado OFICIAL sozinho: é este o caminho que a soma esconderia.
    expect(vaga.status).toBe("ENTREGUE");
    expect(fechada.fechamentoForcado).toBeNull();
    // E O RASTRO REGISTROU A QUEDA DO OFICIAL, com o lado do banco na mesma linha para a leitura
    // saber que ele SUBIU (`paraBanco` maior que `deBanco`) em vez de ter ficado parado.
    expect(fechada.metaReducoes).toHaveLength(1);
    expect(fechada.metaReducoes[0]).toMatchObject({
      deOficiais: 5,
      paraOficiais: 1,
      deBanco: 0,
      paraBanco: 4,
    });
  });

  it("as DUAS trilhas não se confundem: o Master que força sem reduzir sai com o rastro vazio", async () => {
    const { service, vaga } = makeDb({ posicoesOficiais: 5, candidaturas: pessoas(2, "ALOCADO") });

    const fechada = await service.fechar(
      "vaga-1",
      { ...FECHAMENTO, forcar: true } as never,
      MASTER,
    );

    expect(vaga.fechamentoForcadoPorId).toBe("user-master");
    expect(fechada.fechamentoForcado).toMatchObject({ faltavam: 3, porNome: "Beto Master" });
    // Nenhuma meta foi tocada: quem forçou assumiu a exceção pelo nome dele, e não encolheu o alvo.
    expect(fechada.metaReducoes).toEqual([]);
  });
});

describe("o rastro é evitável? os caminhos tentados, e o que cada um devolve", () => {
  it("depois do fechamento a meta NÃO muda mais: a trilha não é reescrita para caber no entregue", async () => {
    const { service, rastro } = makeDb({
      posicoesOficiais: 3,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await service.fechar("vaga-1", FECHAMENTO as never, COMUM);

    // A vaga saiu ENTREGUE, e a rota das posições recusa a vaga encerrada. Sem isto, uma vaga que
    // fechou 3 de 3 poderia virar "3 de 1" depois do fato, e o indicador de entrega passaria a
    // mentir sobre um processo terminado.
    await expect(
      service.editarPosicoes("vaga-1", { posicoesOficiais: 1, posicoesBanco: 0 }, COMUM.id),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(rastro).toHaveLength(0);
  });

  it("a edição recusada por excesso não grava rastro NEM move o gate", async () => {
    const { service, rastro, vaga } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    // Baixar para 2 com 3 entregues é recusado: a meta não desce abaixo do que já foi preenchido.
    await expect(
      service.editarPosicoes("vaga-1", { posicoesOficiais: 2, posicoesBanco: 0 }, COMUM.id),
    ).rejects.toThrow();

    expect(rastro).toHaveLength(0);
    expect(vaga.posicoesOficiais).toBe(5);
    // E O GATE CONTINUA EXATAMENTE ONDE ESTAVA: a tentativa recusada não deixou meia mudança.
    const recusa = await recusaAoFechar(service, COMUM);
    expect(recusa!.getResponse()).toMatchObject({ faltam: 2, posicoesOficiais: 5 });
  });

  it("baixar a meta ATÉ o entregue passa, e baixar ABAIXO dele não: a borda é o próprio entregue", async () => {
    const { service, rastro } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await expect(
      service.editarPosicoes("vaga-1", { posicoesOficiais: 2, posicoesBanco: 0 }, COMUM.id),
    ).rejects.toThrow();
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 3, posicoesBanco: 0 }, COMUM.id);

    // UMA linha só: a tentativa recusada não conta, e a que passou conta uma vez.
    expect(rastro).toHaveLength(1);
    expect(rastro[0]).toMatchObject({ deOficiais: 5, paraOficiais: 3, porId: "user-comum" });
  });

  it("o autor do rastro é o da SESSÃO, e o corpo da requisição não tem como escolher outro", async () => {
    const { service, rastro } = makeDb({ posicoesOficiais: 5, candidaturas: [] });

    // O corpo carrega campos que a rota não aceita; o autor vem do parâmetro que a controller
    // preenche com `@CurrentUser()`. Se um dia o autor voltar a sair do corpo, esta linha quebra.
    await service.editarPosicoes(
      "vaga-1",
      { posicoesOficiais: 2, posicoesBanco: 0, porId: "user-master" } as never,
      COMUM.id,
    );

    expect(rastro[0].porId).toBe("user-comum");
  });
});
