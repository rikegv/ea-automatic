import { describe, expect, it, vi } from "vitest";
import {
  asCandidaturaEtapas,
  asCandidaturas,
  asVagaStatusEventos,
  motivosDescarte,
  vagas,
} from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { CandidatosService } from "./candidatos.service";

/**
 * ─ O FIO ESTÁ LIGADO: MOVER CANDIDATO MOVE A VAGA (Frente B, ponto 2) ───────────────────────────
 *
 * A DECISÃO está provada na função pura (`domain/vaga-status-derivado.spec.ts`) e a GRAVAÇÃO na
 * rotina (`as/vagas/vagas.derivacao-de-status.spec.ts`). O que se mede AQUI é a única coisa que
 * nenhum dos dois pega: que os pontos de gatilho do `candidatos.service` CHAMAM a rotina.
 *
 * ┌─ POR QUE ISTO PRECISA DE TESTE PRÓPRIO ────────────────────────────────────────────────────────┐
 * │ Um fio que não foi ligado não quebra nada: todos os testes de funil continuam verdes, a tela   │
 * │ continua funcionando, e a vaga simplesmente NUNCA muda de status. É o modo de falha mais       │
 * │ silencioso que esta frente tem, e é o que este arquivo existe para impedir.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E ELE MEDE OS DOIS LADOS DO ATALHO: o movimento que TOCA a Entrevista Cliente deriva, e o que não
 * toca NÃO deriva, porque não tem como mudar a resposta. Sem o segundo, a régua do atalho poderia
 * ser removida sem nada ficar vermelho, e todo gesto de candidato voltaria a travar a linha da vaga.
 */

const ENTREVISTA_CLIENTE = "ENTREVISTA_CLIENTE";

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function makeDb(cenario: {
  statusDaVaga?: string;
  statusManualEm?: Date | null;
  etapaAtual?: string;
  /** Sobra alguém na Entrevista Cliente depois do movimento? É o que o `exists` responderia. */
  sobraComCliente?: boolean;
}) {
  const vaga: Record<string, unknown> = {
    id: "vaga-1",
    status: cenario.statusDaVaga ?? "ABERTA",
    statusManualEm: cenario.statusManualEm ?? null,
    posicoesOficiais: 5,
    posicoesBanco: 0,
  };
  const candidatura = {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: cenario.etapaAtual ?? "TRIAGEM",
    situacao: "ATIVO" as const,
    posicaoLado: null,
    motivoDescarte: null,
    alocadoEm: new Date("2026-09-20T10:00:00.000Z"),
    admissaoId: null,
  };

  const escritas: Escrita[] = [];
  const ordem: string[] = [];

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
    b.for = () => {
      ordem.push("trava-vaga");
      return Promise.resolve([{ ...vaga }]);
    };
    /*
     * O `.limit(1)` É A CONSULTA DA DERIVAÇÃO, e o `.orderBy` é a leitura que devolve a candidatura
     * para a tela. Separá-las é o que permite afirmar que o funil FOI (ou NÃO foi) consultado, que
     * é metade do que este arquivo mede.
     */
    b.limit = () => {
      if (tabela === asCandidaturas) ordem.push("le-funil");
      return Promise.resolve(
        tabela === asCandidaturas && cenario.sobraComCliente ? [{ id: "outra" }] : [],
      );
    };
    b.orderBy = () =>
      Promise.resolve(
        tabela === asCandidaturas
          ? [{ c: { ...candidatura }, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "V", autor: null }]
          : tabela === motivosDescarte
            ? [{ id: "m-1", nome: "Reprovado", ativo: true }]
            : [],
      );
    b.groupBy = () => Promise.resolve([]);
    // A ROTA DA TABELA DE MOTIVOS: o desvínculo confere o motivo contra o catálogo ATIVO antes de
    // qualquer transação, e sem ela o teste do descarte morre na validação em vez de medir o fio.
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(
        tabela === motivosDescarte ? [{ id: "m-1", nome: "Reprovado", ativo: true }] : [],
      ).then(r);
    return b;
  });

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async () => {
        escritas.push({ tabela, valores });
        if (tabela === vagas) Object.assign(vaga, valores);
        if (tabela === asCandidaturas) Object.assign(candidatura, valores);
      },
    }),
    values: async (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores });
    },
  });

  const query = {
    asCandidaturas: { findFirst: async () => ({ ...candidatura }) },
    asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
    vagas: { findFirst: async () => ({ ...vaga }) },
  };

  const tx = { select, update: vi.fn(registrar), insert: vi.fn(registrar), query };
  const db = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    query,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    { enviarParaCandidaturas: async () => ({ recusados: [] }) } as never,
  );

  return { service, vaga, escritas, ordem };
}

const naVaga = (e: Escrita[]) => e.filter((x) => x.tabela === vagas);
const naTrilhaDaVaga = (e: Escrita[]) => e.filter((x) => x.tabela === asVagaStatusEventos);
const noFunil = (e: Escrita[]) => e.filter((x) => x.tabela === asCandidaturaEtapas);

describe("moverEtapa liga o fio: a vaga acompanha o candidato", () => {
  it("mover PARA a Entrevista Cliente deixa a vaga ENTREGUE", async () => {
    const { service, vaga, escritas } = makeDb({
      etapaAtual: "TRIAGEM",
      sobraComCliente: true,
    });

    await service.moverEtapa("cand-1", { etapa: ENTREVISTA_CLIENTE } as never, "user-1");

    expect(vaga.status).toBe("ENTREGUE");
    expect(naTrilhaDaVaga(escritas)[0].valores).toMatchObject({ de: "ABERTA", para: "ENTREGUE" });
  });

  it("tirar o ÚLTIMO da Entrevista Cliente devolve a vaga para ABERTA", async () => {
    const { service, vaga } = makeDb({
      statusDaVaga: "ENTREGUE",
      etapaAtual: ENTREVISTA_CLIENTE,
      sobraComCliente: false,
    });

    await service.moverEtapa("cand-1", { etapa: "APROVACAO" } as never, "user-1");
    expect(vaga.status).toBe("ABERTA");
  });

  /**
   * SEM EXIGIR ORDEM: o funil é livre desde 27/08, então o pulo da Captação direto para a
   * Entrevista Cliente entrega a vaga igual. A régua não olha caminho, olha presença.
   */
  it("o PULO de etapas entrega a vaga do mesmo jeito", async () => {
    const { service, vaga } = makeDb({ etapaAtual: "CAPTACAO", sobraComCliente: true });

    await service.moverEtapa("cand-1", { etapa: ENTREVISTA_CLIENTE } as never, "user-1");
    expect(vaga.status).toBe("ENTREGUE");
  });

  /**
   * O MANUAL GRUDA, ATRAVESSANDO O FIO INTEIRO: é aqui que a regra do §A.3 encontra a operação. O
   * movimento de etapa acontece (a pessoa anda no funil), e o status da vaga NÃO se mexe.
   */
  it("com o status posto à mão, o movimento acontece e a vaga NÃO se mexe", async () => {
    const { service, vaga, escritas } = makeDb({
      etapaAtual: "TRIAGEM",
      sobraComCliente: true,
      statusManualEm: new Date("2026-09-20T10:00:00.000Z"),
    });

    await service.moverEtapa("cand-1", { etapa: ENTREVISTA_CLIENTE } as never, "user-1");

    expect(noFunil(escritas)).toHaveLength(1);
    expect(vaga.status).toBe("ABERTA");
    expect(naVaga(escritas)).toHaveLength(0);
  });

  /**
   * ─ O OUTRO LADO DO ATALHO, E ELE É O QUE PROTEGE O CUSTO ──────────────────────────────────────
   *
   * Movimento entre duas etapas FORA da entrega não pode mudar a resposta, então a vaga nem é
   * travada. Sem esta asserção, a régua do atalho sairia numa refatoração e TODO gesto de candidato
   * (mover, aprovar, alocar, descartar) passaria a serializar na linha da vaga, sem nada ficar
   * vermelho.
   */
  it("movimento entre etapas fora da entrega NÃO trava a vaga nem a consulta", async () => {
    const { service, escritas, ordem } = makeDb({ etapaAtual: "CAPTACAO", sobraComCliente: true });

    await service.moverEtapa("cand-1", { etapa: "TRIAGEM" } as never, "user-1");

    expect(noFunil(escritas)).toHaveLength(1);
    expect(ordem).not.toContain("trava-vaga");
    expect(naVaga(escritas)).toHaveLength(0);
  });
});

describe("registrarSaida liga o fio pelo outro lado", () => {
  /**
   * DESCARTAR O ÚLTIMO QUE ESTAVA COM O CLIENTE devolve a vaga para ABERTA, e é o gesto mais comum
   * da operação: o cliente reprovou, a vaga volta a ser vaga a preencher.
   */
  it("descartar o último que estava com o cliente devolve a vaga para ABERTA", async () => {
    const { service, vaga } = makeDb({
      statusDaVaga: "ENTREGUE",
      etapaAtual: ENTREVISTA_CLIENTE,
      sobraComCliente: false,
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: "Reprovado" } as never,
      { id: "user-1", papel: "COMUM" } as never,
    );

    expect(vaga.status).toBe("ABERTA");
  });

  /**
   * E DESCARTAR QUEM NÃO ESTAVA COM O CLIENTE NÃO TRAVA A VAGA: é a asserção que preserva a decisão
   * registrada no caminho SIMPLES do `registrarSaida` ("libera posição, então não precisa travar").
   */
  it("descartar quem estava fora da entrega não trava a linha da vaga", async () => {
    const { service, ordem } = makeDb({ etapaAtual: "TRIAGEM", sobraComCliente: true });

    await service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: "Reprovado" } as never,
      { id: "user-1", papel: "COMUM" } as never,
    );

    expect(ordem).not.toContain("trava-vaga");
  });
});
