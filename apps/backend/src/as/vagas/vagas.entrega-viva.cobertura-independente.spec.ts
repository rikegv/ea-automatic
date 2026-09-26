import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { CandidaturaSituacao } from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import {
  asCandidaturaEntrevistas,
  asCandidaturaEtapas,
  asCandidaturas,
  asVagaStatusEventos,
  vagaBeneficio,
  vagaMetaReducoes,
  vagas,
} from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ A ENTREGA VIROU ESTADO VIVO: AS DUAS PORTAS DE SAÍDA DELA (cobertura independente, §A.38) ────
 *
 * ESTE ARQUIVO É DO `tester`, E NÃO DE QUEM CONSTRUIU A FRENTE B. Ele mede o REQUISITO como o
 * diretor o enunciou, e não o que os comentários do `vagas.service` dizem que foi feito:
 *
 *   "ENTREGUE deixou de ser desfecho: a vaga Entregue continua VIVA, volta para a fila padrão, e
 *    ainda pode ser FECHADA (o candidato entregue foi contratado) ou CANCELADA (o cliente
 *    desistiu)."
 *
 * ┌─ O BURACO QUE ELE FECHA, MEDIDO E NÃO SUPOSTO ────────────────────────────────────────────────┐
 * │ A metade "CANCELADA" TEM teste: `vagas.cancelar.spec.ts` cancela a partir de `ENTREGUE`.      │
 * │ A metade "FECHADA" NÃO TINHA NENHUM. A varredura dos 16 specs que chamam `fechar` não achou   │
 * │ um só que partisse de uma vaga cujo STATUS fosse `ENTREGUE`: todos partem de `ABERTA`, e os   │
 * │ que escrevem `status: "ENTREGUE"` o fazem na LINHA DE LISTAGEM (a leitura), nunca na linha    │
 * │ travada pelo `FOR UPDATE`.                                                                     │
 * │                                                                                                │
 * │ E É EXATAMENTE A LINHA QUE A FRENTE B MUDOU: `vagas.service.ts:1793` trocou                    │
 * │ `ehDoPapel(status, "ABERTURA")` por `papelDeVagaEmProcesso(...)`. Voltar aquela linha ao que   │
 * │ era deixa a suíte inteira verde e a vaga ENTREGUE SEM PORTA DE FECHAMENTO, que é o caminho     │
 * │ NORMAL do processo (o candidato que estava com o cliente foi contratado).                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A SEGUNDA METADE DO ARQUIVO É A INTERAÇÃO ENTRE FRENTES que ninguém mediu porque cada autor via
 * só a sua: FECHAR UMA VAGA ENTREGUE DEPOIS DE O ENTREGUE TER SIDO TRANSFERIDO PARA FORA (Frente D).
 * A transferência é de QUALQUER consultor desde esta sessão, então este cenário deixou de ser raro.
 *
 * §A.6: nomes inventados, ids técnicos, contagens. Nenhum CPF sai daqui.
 */

const T0 = new Date("2026-09-10T12:00:00.000Z");

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const MASTER: AuthUser = { ...COMUM, id: "user-master", papel: "MASTER" };

const FECHAR = { dataFechamento: "2026-09-10" };
const MOTIVO_CANCELAMENTO = "Cliente cancelou a solicitação";
const CANCELAR = { motivo: MOTIVO_CANCELAMENTO, dataCancelamento: "2026-09-10" };

function pessoa(
  situacao: CandidaturaSituacao,
  etapa: string,
  nome = "Fulano",
  posicaoLado: string | null = null,
) {
  return {
    candidaturaId: `cand-${nome}`,
    candidatoId: `pessoa-${nome}`,
    candidatoNome: nome,
    etapa,
    situacao,
    posicaoLado,
  };
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
  naTransacao: boolean;
}

/**
 * O BANCO FINGIDO, no molde do vizinho `vagas.cancelar.spec.ts`, com UMA diferença que é o ponto
 * desta frente: ele também serve a tabela de ENTREVISTAS, para o teste do cancelamento poder
 * afirmar que o gesto NÃO ENCOSTA nela. Sem a tabela modelada, "não escreveu" seria verdade por
 * o fake não ter onde escrever, que é prova de nada.
 *
 * A ETAPA `STAND_BY` ENTRA NO CATÁLOGO PELO PARÂMETRO, e não pela semente: a semente do
 * `shared-types` não a tem (o próprio dublê de etapas explica por quê), então quem testa o destino
 * do cancelamento monta o catálogo com ela, como o vizinho faz.
 */
function makeDb(cenario: {
  status?: string;
  posicoesOficiais?: number | null;
  candidaturas?: ReturnType<typeof pessoa>[];
  entrevistas?: { candidaturaId: string; etapa: string }[];
}) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    codigo: "PS-2026-777",
    nomeDivulgacao: "Vaga entregue ao cliente",
    status: cenario.status ?? "ENTREGUE",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 1 : cenario.posicoesOficiais,
    posicoesBanco: 0,
    vagasFechadas: null,
    vagasFechadasBanco: null,
    dataFechamento: null,
    escolaridade: null,
    regioes: [],
    idiomas: [],
    testes: [],
    etapasPs: [],
    criadoEm: T0,
    statusManualEm: null,
    statusManualPorId: null,
    fechamentoForcadoPorId: null,
    fechamentoForcadoEm: null,
    fechamentoForcadoFaltavam: null,
    canceladaPorId: null,
    canceladaEm: null,
    cancelamentoMotivo: null,
    cancelamentoObservacao: null,
    cancelamentoEtapa: null,
  };

  const linhas = cenario.candidaturas ?? [];
  const entrevistas = cenario.entrevistas ?? [];
  const escritas: Escrita[] = [];
  let naTransacao = false;

  const daListagem = () => ({
    v: { ...vaga },
    cargoNome: null,
    clienteRazao: null,
    clienteOperacao: null,
    abertoPorNome: null,
    consultorNome: null,
    recruiterNome: null,
    fechamentoForcadoPorNome: null,
    canceladaPorNome: null,
  });

  const linhasDe = (tabela: unknown): unknown[] => {
    if (tabela === vagas) return [daListagem()];
    if (tabela === asCandidaturas) return linhas;
    if (tabela === asCandidaturaEntrevistas) return entrevistas;
    if (tabela === vagaBeneficio) return [];
    if (tabela === vagaMetaReducoes) return [];
    // A rota da tabela desconhecida é o catálogo de motivos de cancelamento, como no vizinho.
    return [{ id: "mot-1", nome: MOTIVO_CANCELAMENTO, ativo: true }];
  };

  const agregado = () => {
    const chave = new Map<string, Record<string, unknown>>();
    for (const l of linhas) {
      const k = `${l.situacao}|${l.posicaoLado ?? ""}|${l.etapa}`;
      const atual = chave.get(k) ?? {
        vagaId: "vaga-1",
        situacao: l.situacao,
        posicaoLado: l.posicaoLado,
        etapa: l.etapa,
        quantas: 0,
      };
      atual.quantas = (atual.quantas as number) + 1;
      chave.set(k, atual);
    }
    return [...chave.values()];
  };

  const select = () => {
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
    b.limit = () => Promise.resolve(linhasDe(tabela));
    b.orderBy = () => Promise.resolve(linhasDe(tabela));
    b.groupBy = () => Promise.resolve(tabela === asCandidaturas ? agregado() : []);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(linhasDe(tabela)).then(r);
    return b;
  };

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async () => {
        escritas.push({ tabela, valores, naTransacao });
        if (tabela === vagas) Object.assign(vaga, valores);
        return undefined;
      },
    }),
    values: (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores, naTransacao });
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
    select: vi.fn(select),
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: async () => [{ id: "mot-1", nome: MOTIVO_CANCELAMENTO, ativo: true }],
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };

  const db = {
    select: vi.fn(select),
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    execute: async () => [{ id: "mot-1", nome: MOTIVO_CANCELAMENTO, ativo: true }],
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      naTransacao = true;
      try {
        return await fn(tx);
      } finally {
        naTransacao = false;
      }
    },
    query: { vagas: { findFirst: async () => ({ ...vaga }) } },
  };

  /*
   * O CATÁLOGO COM `STAND_BY` MARCADO COMO DESTINO DO CANCELAMENTO. O dublê padrão deixa o destino
   * VAZIO (a semente não tem a etapa), então quem mede o agrupamento do cancelamento monta a linha,
   * que é o que o banco de verdade tem desde a migration 0130.
   */
  const etapas = catalogoDeEtapasFingido();
  const comStandBy = {
    ...etapas,
    listar: async () => [
      ...(await etapas.listar()),
      {
        id: 99,
        codigo: "STAND_BY",
        rotulo: "Stand By",
        ordem: 99,
        tom: "nt",
        inicial: false,
        ativa: true,
        entregaAoCliente: false,
        destinoDoCancelamento: true,
        temEntrevista: false,
      },
    ],
    ordemPorCodigo: async () =>
      new Map([...(await etapas.ordemPorCodigo()), ["STAND_BY", 99] as [string, number]]),
    etapaDoCancelamento: async () => ({
      codigo: "STAND_BY",
      rotulo: "Stand By",
      ativa: true,
      destinoDoCancelamento: true,
    }),
  };

  return {
    service: new VagasService(
      db as never,
      comStandBy as never,
      catalogoDeStatusFingido() as never,
    ),
    /** O MESMO service, com o catálogo SEM destino de cancelamento (o Stand By inativado). */
    semDestino: new VagasService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
    ),
    vaga,
    escritas,
  };
}

const naVaga = (e: Escrita[]) => e.filter((x) => x.tabela === vagas);
const naCandidatura = (e: Escrita[]) => e.filter((x) => x.tabela === asCandidaturas);
const naEntrevista = (e: Escrita[]) => e.filter((x) => x.tabela === asCandidaturaEntrevistas);
const noHistorico = (e: Escrita[]) => e.filter((x) => x.tabela === asCandidaturaEtapas);
const naTrilhaDaVaga = (e: Escrita[]) => e.filter((x) => x.tabela === asVagaStatusEventos);

async function erroDe(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("1. a vaga ENTREGUE FECHA, que é o caminho NORMAL do processo", () => {
  /**
   * O CASO QUE O DIRETOR DESCREVEU COM ESTAS PALAVRAS: "ainda pode ser FECHADA (o candidato
   * entregue foi contratado)". A vaga está ENTREGUE porque há alguém na Entrevista Cliente; ele é
   * contratado, e a vaga fecha DALI, sem passar por Aberta.
   */
  it("fecha a partir do status ENTREGUE, sem exigir volta manual para ABERTA", async () => {
    const { service, vaga, escritas } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 1,
      candidaturas: [pessoa("ALOCADO", "ENTREVISTA_CLIENTE", "Contratado")],
    });

    const erro = await erroDe(() => service.fechar("vaga-1", FECHAR as never, COMUM));

    expect(erro).toBeNull();
    expect(vaga.status).toBe("FECHADA");
    expect(naVaga(escritas)[0].valores).toMatchObject({ vagasFechadas: 1 });
  });

  it("NÃO é preciso ser MASTER: o fechamento normal da entrega é de qualquer consultor", async () => {
    const { service, vaga } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 2,
      candidaturas: [
        pessoa("ALOCADO", "ENTREVISTA_CLIENTE", "Um"),
        pessoa("ALOCADO", "ENTREVISTA_CLIENTE", "Dois"),
      ],
    });
    await service.fechar("vaga-1", FECHAR as never, COMUM);
    expect(vaga.status).toBe("FECHADA");
  });

  /**
   * NENHUMA TRAVA FOI AFROUXADA PELA ENTREGA VIVA, e é a outra metade do requisito: o que mudou foi
   * DE ONDE se fecha, não SOB QUE CONDIÇÕES. A trava 5 (candidato em seleção) continua valendo numa
   * vaga ENTREGUE, e ninguém a força.
   */
  it("a trava 5 continua de pé na vaga ENTREGUE: quem está ATIVO segura o fechamento", async () => {
    const { service, vaga, escritas } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 1,
      candidaturas: [
        pessoa("ALOCADO", "ENTREVISTA_CLIENTE", "Contratado"),
        pessoa("ATIVO", "TRIAGEM", "EmSelecao"),
      ],
    });

    const erro = await erroDe(() => service.fechar("vaga-1", FECHAR as never, COMUM));

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      reason: "candidatosPendentes",
    });
    expect(vaga.status).toBe("ENTREGUE");
    expect(naVaga(escritas)).toHaveLength(0);
  });

  /** E O DESFECHO GRAVADO É `FECHADA`, nunca `ENTREGUE` de novo: a entrega não encerra mais. */
  it("o status gravado é o do papel FECHAMENTO, e não o da ENTREGA de onde ela partiu", async () => {
    const { service, escritas } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 1,
      candidaturas: [pessoa("ALOCADO", "ENTREVISTA_CLIENTE", "Contratado")],
    });
    await service.fechar("vaga-1", FECHAR as never, COMUM);
    expect(naVaga(escritas)[0].valores.status).toBe("FECHADA");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("2. INTERAÇÃO ENTRE FRENTES: fechar a vaga ENTREGUE depois de o entregue sair por transferência", () => {
  /**
   * ┌─ O CENÁRIO, E ELE DEIXOU DE SER RARO NESTA SESSÃO ──────────────────────────────────────────┐
   * │ A vaga de 1 posição está ENTREGUE porque o único candidato, ALOCADO, está na Entrevista      │
   * │ Cliente. QUALQUER CONSULTOR (Frente D: a transferência deixou de ser de Master) o move para  │
   * │ outra vaga. A vaga A fica sem ninguém: a entrega que ela afirmava não existe mais.           │
   * │                                                                                              │
   * │ O QUE NÃO PODE ACONTECER: a vaga fechar como se tivesse entregue a posição. O carimbo        │
   * │ `vagas_fechadas` viraria 0 numa vaga "concluída", e o indicador de entrega passaria a mentir │
   * │ sobre um processo terminado.                                                                  │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a trava 6 RECUSA o fechamento: a posição voltou a estar em aberto", async () => {
    const { service, vaga, escritas } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 1,
      // O entregue foi TRANSFERIDO: a linha dele agora pertence à outra vaga, e não aparece aqui.
      candidaturas: [],
    });

    const erro = await erroDe(() => service.fechar("vaga-1", FECHAR as never, COMUM));

    expect(erro).toBeInstanceOf(ConflictException);
    expect(vaga.status).toBe("ENTREGUE");
    expect(naVaga(escritas)).toHaveLength(0);
  });

  it("o MASTER força, e a trilha registra que faltava a posição que saiu", async () => {
    const { service, vaga, escritas } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 1,
      candidaturas: [],
    });

    await service.fechar("vaga-1", { ...FECHAR, forcar: true } as never, MASTER);

    expect(vaga.status).toBe("FECHADA");
    expect(naVaga(escritas)[0].valores).toMatchObject({
      vagasFechadas: 0,
      fechamentoForcadoFaltavam: 1,
      fechamentoForcadoPorId: MASTER.id,
    });
  });

  /**
   * E O CONSULTOR COMUM NÃO CONTORNA: `forcar` no corpo de quem não é Master não abre a porta. Sem
   * isto, a transferência viraria o atalho para fechar qualquer vaga sem entregar nada.
   */
  it("o COMUM com `forcar: true` continua barrado (403), e nada é gravado", async () => {
    const { service, vaga, escritas } = makeDb({
      status: "ENTREGUE",
      posicoesOficiais: 1,
      candidaturas: [],
    });

    const erro = await erroDe(() =>
      service.fechar("vaga-1", { ...FECHAR, forcar: true } as never, COMUM),
    );

    // FORÇAR É DE MASTER, e a recusa é de AUTORIZAÇÃO (403), não de estado (409): o COMUM não é
    // informado de que "faltam posições", ele é informado de que não pode forçar.
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(vaga.status).toBe("ENTREGUE");
    expect(naVaga(escritas)).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
describe("3. INTERAÇÃO ENTRE FRENTES: cancelar a vaga de quem TEM ENTREVISTA MARCADA", () => {
  /**
   * ┌─ O REQUISITO, NAS PALAVRAS DO DIRETOR ──────────────────────────────────────────────────────┐
   * │ "CANCELAR a vaga NÃO descarta ninguém: quem está em processo vai para a etapa Stand By,     │
   * │  VIVO, e continua encontrável para ser transferido ou realocado depois."                     │
   * │                                                                                              │
   * │ A ENTREVISTA É O DADO QUE A FRENTE E CRIOU, e nenhum dos dois autores mediu o cruzamento:    │
   * │ quem cancela não sabia que existia entrevista, e quem construiu a entrevista não sabia que o │
   * │ cancelamento move gente de etapa. APAGAR a marcação aqui seria perder a informação de que a  │
   * │ pessoa TEM compromisso agendado, que é justamente o que o consultor precisa saber antes de   │
   * │ realocá-la.                                                                                   │
   * └──────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a marcação de entrevista NÃO é tocada pelo cancelamento", async () => {
    const { service, escritas } = makeDb({
      status: "ENTREGUE",
      candidaturas: [pessoa("ATIVO", "ENTREVISTA_CLIENTE", "ComAgenda")],
      entrevistas: [{ candidaturaId: "cand-ComAgenda", etapa: "ENTREVISTA_CLIENTE" }],
    });

    await service.cancelar("vaga-1", CANCELAR as never, COMUM);

    expect(naEntrevista(escritas)).toHaveLength(0);
  });

  it("quem tinha entrevista marcada continua VIVO, só muda de etapa", async () => {
    const { service, escritas } = makeDb({
      status: "ENTREGUE",
      candidaturas: [pessoa("ATIVO", "ENTREVISTA_CLIENTE", "ComAgenda")],
      entrevistas: [{ candidaturaId: "cand-ComAgenda", etapa: "ENTREVISTA_CLIENTE" }],
    });

    await service.cancelar("vaga-1", CANCELAR as never, COMUM);

    const movida = naCandidatura(escritas);
    expect(movida).toHaveLength(1);
    expect(movida[0].valores).toMatchObject({ etapa: "STAND_BY" });
    // A SITUAÇÃO NÃO ENTRA NO `set`: é a garantia de que ninguém foi descartado.
    expect(Object.keys(movida[0].valores)).not.toContain("situacao");
  });

  /**
   * O CARIMBO DA ETAPA É MEDIDO ANTES DO MOVIMENTO, e a entrevista é o caso em que isso mais
   * importa: a pergunta do relatório é "até onde este processo chegou", e a resposta é "estava com
   * o cliente, com entrevista marcada", nunca "Stand By".
   */
  it("a vaga carimba a etapa de ENTREGA de onde a pessoa saiu, e não o Stand By de destino", async () => {
    const { service, escritas } = makeDb({
      status: "ENTREGUE",
      candidaturas: [pessoa("ATIVO", "ENTREVISTA_CLIENTE", "ComAgenda")],
      entrevistas: [{ candidaturaId: "cand-ComAgenda", etapa: "ENTREVISTA_CLIENTE" }],
    });

    await service.cancelar("vaga-1", CANCELAR as never, COMUM);

    expect(naVaga(escritas)[0].valores.cancelamentoEtapa).toBe("ENTREVISTA_CLIENTE");
  });

  /**
   * O HISTÓRICO GUARDA DE ONDE ELA VEIO, que é o que permite realocá-la com contexto meses depois
   * ("ela estava em entrevista com o cliente quando a vaga caiu").
   */
  it("a linha do tempo preserva a etapa de origem do movimento", async () => {
    const { service, escritas } = makeDb({
      status: "ENTREGUE",
      candidaturas: [pessoa("ATIVO", "ENTREVISTA_CLIENTE", "ComAgenda")],
    });

    await service.cancelar("vaga-1", CANCELAR as never, COMUM);

    expect(noHistorico(escritas)[0].valores).toMatchObject({
      etapaDe: "ENTREVISTA_CLIENTE",
      etapaPara: "STAND_BY",
      situacao: null,
    });
  });

  /**
   * O CANCELAMENTO NÃO PASSA PELA DERIVAÇÃO: ele grava `CANCELADA` na porta própria. Se a trilha da
   * vaga recebesse a frase da derivação, a linha do tempo afirmaria que a vaga andou sozinha no
   * gesto mais caro do módulo.
   */
  it("a trilha da vaga registra o CANCELAMENTO, com o motivo do catálogo e o tamanho do que houve", async () => {
    const { service, escritas } = makeDb({
      status: "ENTREGUE",
      candidaturas: [pessoa("ATIVO", "ENTREVISTA_CLIENTE", "ComAgenda")],
    });

    await service.cancelar("vaga-1", CANCELAR as never, COMUM);

    const evento = naTrilhaDaVaga(escritas)[0].valores;
    expect(evento).toMatchObject({ de: "ENTREGUE", para: "CANCELADA", porId: COMUM.id });
    expect(String(evento.observacao)).toContain(MOTIVO_CANCELAMENTO);
    expect(String(evento.observacao)).toContain("Stand By");
    // §A.11: nenhum travessão no texto que chega à tela.
    expect(String(evento.observacao)).not.toContain("—");
    // §A.6: a narrativa conta QUANTOS, e nunca QUEM.
    expect(String(evento.observacao)).not.toContain("ComAgenda");
  });

  /**
   * ─ A BORDA QUE O CATÁLOGO ABRE: O STAND BY INATIVADO ─────────────────────────────────────────
   *
   * `etapaDoCancelamento()` filtra por `ativa`, e o diretor inativa etapa pela tela. Com o destino
   * ausente, o requisito "ninguém é descartado" TEM de continuar valendo: o correto é NINGUÉM SE
   * MOVER, e não alguém sumir. O teste existe porque este é o caminho em que seria fácil alguém,
   * um dia, "resolver" o catálogo vazio caindo no descarte antigo.
   */
  it("sem etapa de destino no catálogo, o cancelamento acontece e NINGUÉM é movido nem descartado", async () => {
    const { semDestino, escritas, vaga } = makeDb({
      status: "ENTREGUE",
      candidaturas: [pessoa("ATIVO", "ENTREVISTA_CLIENTE", "ComAgenda")],
    });

    await semDestino.cancelar("vaga-1", CANCELAR as never, COMUM);

    expect(vaga.status).toBe("CANCELADA");
    expect(naCandidatura(escritas)).toHaveLength(0);
    expect(noHistorico(escritas)).toHaveLength(0);
  });
});
