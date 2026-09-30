import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { getTableName } from "drizzle-orm";
import { usuarios, vagaConsultorTransferencias, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ TRANSFERIR A VAGA DE UM CONSULTOR PARA OUTRO (item 5 da OST de 30/09/2026) ────────────────────
 *
 * ┌─ AS TRÊS PROPRIEDADES QUE ESTE ARQUIVO GUARDA ─────────────────────────────────────────────────┐
 * │ 1. A TRILHA É OBRIGATÓRIA, COM AUTOR. `vagas.consultor_id` é UMA coluna, e a escrita apaga o    │
 * │    valor anterior: sem o rastro, "quem tirou esta vaga de mim, e quando" não tem resposta em    │
 * │    lugar nenhum. E ele tem de estar DENTRO da transação, senão a falha da escrita da vaga       │
 * │    deixaria trilha de uma transferência que não aconteceu (ou o contrário).                     │
 * │ 2. O DESTINO INATIVO É RECUSADO, e o sem papel de Consultor também: vaga sob um usuário que não │
 * │    enxerga o módulo sai da carteira de todo mundo sem sair da tela de ninguém.                  │
 * │ 3. QUEM TRANSFERIU VEM DA SESSÃO, nunca do corpo. Autoria é trilha, não campo de formulário.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A DECISÃO QUE A OST NÃO TOMOU, E QUE ESTE ARQUIVO FIXA: VAGA ENCERRADA TRANSFERE ─────────────┐
 * │ Transferir é ATRIBUIÇÃO, não movimento de processo: nenhuma candidatura se move, nenhum         │
 * │ contador muda, nenhuma data se recarimba. E o caso que origina a operação é a pessoa que saiu   │
 * │ da empresa, cujas vagas mais duradouras são justamente as FECHADAS: recusar deixaria a carteira │
 * │ histórica presa a um usuário que ninguém mais usa, sem conserto na tela.                       │
 * │                                                                                                │
 * │ O TESTE EXISTE PARA QUE A DECISÃO NÃO SEJA DESFEITA POR ENGANO: a rota vizinha                  │
 * │ (`editarPosicoes`) recusa as encerradas, e é natural alguém copiar aquela guarda para cá sem    │
 * │ perceber que lá ela protege um NÚMERO já confrontado no fechamento, e aqui não há número algum. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: três ids de usuário interno, um id de vaga e uma data. Nenhum dado de candidato, nenhum CPF.
 */

const AUTOR = "user-autor";
const CONSULTOR_A = "user-consultor-a";
const CONSULTOR_B = "user-consultor-b";
const INATIVO = "user-inativo";
const SEM_PAPEL = "user-sem-papel";
const VAGA = "11111111-1111-1111-1111-111111111111";

interface Escrita {
  tabela: string;
  valores: Record<string, unknown>;
  naTransacao: boolean;
}

/** Os ids citados na cláusula, que é tudo de que este fake precisa para filtrar. */
function idsCitados(cond: unknown): string[] {
  const out: string[] = [];
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) return no.forEach(visitar);
    if (!no || typeof no !== "object") return;
    const rec = no as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(rec.queryChunks)) return rec.queryChunks.forEach(visitar);
    if ("value" in rec && typeof rec.value === "string") out.push(rec.value);
  };
  visitar(cond);
  return out;
}

/**
 * O BANCO FINGIDO, CRU DE PROPÓSITO: ele conhece `usuarios`, `vagas` e a tabela do rastro, filtra
 * por id citado na cláusula, e mais nada. Ele registra a tabela, os valores e SE a escrita saiu de
 * dentro da transação, que é a propriedade 1 deste arquivo.
 */
function banco(cenario: { consultorDaVaga?: string | null; statusDaVaga?: string } = {}) {
  const pessoas = new Map<
    string,
    { id: string; nome: string; ativo: boolean; papelAs: string | null }
  >([
    [AUTOR, { id: AUTOR, nome: "Autor Da Transferência", ativo: true, papelAs: "CONSULTOR" }],
    [CONSULTOR_A, { id: CONSULTOR_A, nome: "Consultora Alice", ativo: true, papelAs: "CONSULTOR" }],
    [CONSULTOR_B, { id: CONSULTOR_B, nome: "Consultor Bruno", ativo: true, papelAs: "CONSULTOR" }],
    [INATIVO, { id: INATIVO, nome: "Consultora Desligada", ativo: false, papelAs: "CONSULTOR" }],
    [SEM_PAPEL, { id: SEM_PAPEL, nome: "Analista Da Admissão", ativo: true, papelAs: null }],
  ]);

  const vaga = {
    id: VAGA,
    status: cenario.statusDaVaga ?? "ABERTA",
    consultorId: cenario.consultorDaVaga === undefined ? CONSULTOR_A : cenario.consultorDaVaga,
    recruiterId: "user-recruiter",
  };

  const escritas: Escrita[] = [];
  const travas: string[] = [];

  const leitura = (dentro: boolean) => () => {
    let tabela = "";
    let cond: unknown = null;
    const b: Record<string, unknown> = {};
    const resolver = () => {
      if (tabela === getTableName(vagas)) {
        return Promise.resolve(idsCitados(cond).includes(VAGA) ? [{ ...vaga }] : []);
      }
      if (tabela === getTableName(usuarios)) {
        // A LISTA DO SELETOR: ativos com papel de Consultor, que é a mesma régua da trava.
        return Promise.resolve(
          [...pessoas.values()]
            .filter((p) => p.ativo && p.papelAs === "CONSULTOR")
            .map((p) => ({ id: p.id, nome: p.nome })),
        );
      }
      return Promise.resolve([]);
    };
    b.from = (t: unknown) => {
      tabela = getTableName(t as never);
      return b;
    };
    b.where = (c: unknown) => {
      cond = c;
      return b;
    };
    b.leftJoin = () => b;
    b.innerJoin = () => b;
    b.groupBy = () => b;
    b.limit = () => resolver();
    b.orderBy = () => resolver();
    b.for = () => {
      travas.push(`${dentro ? "tx" : "db"}:${tabela}`);
      return resolver();
    };
    b.then = (ok: (v: unknown) => unknown) => resolver().then(ok);
    return b;
  };

  const montar = (dentro: boolean) => ({
    select: leitura(dentro),
    update: (t: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: async () => {
          escritas.push({ tabela: getTableName(t as never), valores, naTransacao: dentro });
          if (getTableName(t as never) === getTableName(vagas)) Object.assign(vaga, valores);
        },
      }),
    }),
    insert: (t: unknown) => ({
      values: async (valores: Record<string, unknown>) => {
        escritas.push({ tabela: getTableName(t as never), valores, naTransacao: dentro });
      },
    }),
    query: {
      usuarios: {
        findFirst: async (arg: { where?: unknown }) => {
          const id = idsCitados(arg.where).find((p) => pessoas.has(p));
          return id ? { ...pessoas.get(id)! } : undefined;
        },
      },
      vagas: {
        findFirst: async (arg: { where?: unknown }) =>
          idsCitados(arg.where).includes(VAGA) ? { ...vaga } : undefined,
      },
    },
  });

  const tx = montar(true);
  const db = {
    ...montar(false),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  const service = new VagasService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
  );
  /*
   * A RELEITURA DA LISTAGEM É DUBLADA, e só ela: `devolverVaga` chama `list()`, que é a consulta de
   * dez junções da Central de Vagas. Ela não é o que está sob teste aqui, e montá-la no fake faria o
   * vermelho falar do dublê em vez da régua. O item devolvido carrega o consultor JÁ GRAVADO, que é
   * o que a tela lê depois do gesto.
   */
  (service as unknown as Record<string, unknown>).list = async () => [
    {
      id: VAGA,
      consultorId: vaga.consultorId,
      consultorNome: pessoas.get(String(vaga.consultorId))?.nome ?? null,
    },
  ];

  return { service, vaga, escritas, travas, pessoas };
}

const rastro = (escritas: Escrita[]) =>
  escritas.filter((e) => e.tabela === getTableName(vagaConsultorTransferencias));

describe("A transferência grava a vaga E a trilha, com autor, na mesma transação", () => {
  it("troca o consultor da vaga", async () => {
    const { service, vaga } = banco();

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    expect(vaga.consultorId).toBe(CONSULTOR_B);
  });

  it("grava QUEM transferiu, DE QUEM e PARA QUEM", async () => {
    const { service, escritas } = banco();

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    const linhas = rastro(escritas);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].valores).toMatchObject({
      vagaId: VAGA,
      deConsultorId: CONSULTOR_A,
      paraConsultorId: CONSULTOR_B,
      porId: AUTOR,
    });
  });

  /**
   * DENTRO DA TRANSAÇÃO, e não depois: fora dela, uma falha parcial deixaria a vaga trocada sem
   * rastro nenhum, que é o estado que o rastro existe para impedir.
   */
  it("a trilha é escrita DENTRO da transação, junto da vaga", async () => {
    const { service, escritas } = banco();

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    for (const e of escritas) expect(e.naTransacao).toBe(true);
  });

  /** A LINHA DA VAGA É TRAVADA antes de decidir: duas transferências simultâneas se enfileiram. */
  it("decide com a linha da vaga travada", async () => {
    const { service, travas } = banco();

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    expect(travas).toContain(`tx:${getTableName(vagas)}`);
  });

  /**
   * A VAGA SEM CONSULTOR também transfere, e o rastro guarda NULO em `de`. Medido na homologação em
   * 30/09/2026: 2 das 5 vagas não tinham consultor, então este não é um caso de laboratório.
   */
  it("vaga sem consultor transfere, e o rastro guarda nulo em de_consultor_id", async () => {
    const { service, escritas } = banco({ consultorDaVaga: null });

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    expect(rastro(escritas)[0].valores).toMatchObject({
      deConsultorId: null,
      paraConsultorId: CONSULTOR_B,
    });
  });

  /** ESCREVE UMA COLUNA E MAIS NENHUMA: o outro lado da vaga e o status ficam intactos. */
  it("não toca o recruiter nem o status da vaga", async () => {
    const { service, vaga, escritas } = banco();

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    expect(vaga.recruiterId).toBe("user-recruiter");
    expect(vaga.status).toBe("ABERTA");
    const naVaga = escritas.find((e) => e.tabela === getTableName(vagas))!;
    expect(Object.keys(naVaga.valores).sort()).toEqual(["atualizadoEm", "consultorId"]);
  });
});

describe("O destino é conferido contra o BANCO, e a recusa é de ESTADO", () => {
  it("recusa o usuário INATIVO, e não grava nada", async () => {
    const { service, vaga, escritas } = banco();

    await expect(
      service.transferirConsultor(VAGA, { paraConsultorId: INATIVO }, AUTOR),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(vaga.consultorId).toBe(CONSULTOR_A);
    expect(escritas).toEqual([]);
  });

  it("recusa quem não tem papel de Consultor em A&S", async () => {
    const { service, escritas } = banco();

    await expect(
      service.transferirConsultor(VAGA, { paraConsultorId: SEM_PAPEL }, AUTOR),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(escritas).toEqual([]);
  });

  it("recusa destino inexistente", async () => {
    const { service } = banco();

    await expect(
      service.transferirConsultor(VAGA, { paraConsultorId: "user-que-nao-existe" }, AUTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * TRANSFERIR PARA QUEM JÁ É O CONSULTOR É RECUSADO COM FRASE, e não com erro de banco: o CHECK
   * `ck_vaga_consultor_transferencias_houve_troca` barraria a linha do rastro de qualquer jeito.
   */
  it("recusa a transferência para o consultor que já é o da vaga", async () => {
    const { service, escritas } = banco();

    await expect(
      service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_A }, AUTOR),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(escritas).toEqual([]);
  });

  it("recusa vaga inexistente", async () => {
    const { service } = banco();

    await expect(
      service.transferirConsultor(
        "22222222-2222-2222-2222-222222222222",
        { paraConsultorId: CONSULTOR_B },
        AUTOR,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("Vaga em estado terminal TRANSFERE (decisão registrada no service)", () => {
  it("vaga FECHADA transfere, e deixa a trilha", async () => {
    const { service, vaga, escritas } = banco({ statusDaVaga: "FECHADA" });

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    expect(vaga.consultorId).toBe(CONSULTOR_B);
    expect(rastro(escritas)).toHaveLength(1);
  });

  it("vaga CANCELADA transfere", async () => {
    const { service, vaga } = banco({ statusDaVaga: "CANCELADA" });

    await service.transferirConsultor(VAGA, { paraConsultorId: CONSULTOR_B }, AUTOR);

    expect(vaga.consultorId).toBe(CONSULTOR_B);
  });
});

describe("A lista do seletor e a trava usam a MESMA régua", () => {
  /**
   * SE A LISTA OFERECESSE QUEM A ROTA RECUSA, a tela ofereceria um caminho que sempre falha, que é
   * pior do que não oferecer.
   */
  it("oferece só os ativos com papel de Consultor", async () => {
    const { service } = banco();

    const lista = await service.consultoresParaTransferencia();

    const ids = lista.map((p) => p.id).sort();
    expect(ids).toEqual([AUTOR, CONSULTOR_A, CONSULTOR_B].sort());
    expect(ids).not.toContain(INATIVO);
    expect(ids).not.toContain(SEM_PAPEL);
  });

  it("devolve id e nome, e mais nada (§A.6)", async () => {
    const { service } = banco();

    const lista = await service.consultoresParaTransferencia();

    for (const p of lista) expect(Object.keys(p).sort()).toEqual(["id", "nome"]);
  });
});
