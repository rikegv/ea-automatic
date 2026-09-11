import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AsResultadoEmMassa } from "@ea/shared-types";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { bancoFingido, etapasSemente } from "../etapas/etapas-funil.fake-db";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ QUEM MOVE GENTE NO FUNIL PERGUNTA AO CATÁLOGO, E ESTE ARQUIVO GUARDA A PERGUNTA ──────────────
 *
 * ┌─ A PROPRIEDADE, e por que ela ficou sem guardião ───────────────────────────────────────────┐
 * │ `candidatos.service.ts` chama `this.etapas.exigirEtapaAtiva(dto.etapa)` dentro da            │
 * │ `moverEtapa`, e ESSA LINHA É A ÚNICA COISA que impede mover uma pessoa para uma etapa        │
 * │ INATIVADA. Nada mais no caminho segura:                                                      │
 * │                                                                                             │
 * │  . A FK do banco referencia `as_etapas_funil.codigo` e NÃO OLHA `ativa`: para o Postgres, a  │
 * │    etapa inativada é um valor perfeitamente válido, e o `INSERT` passa.                      │
 * │  . Os `@IsIn` estáticos SAÍRAM dos DTOs quando a lista virou dado do diretor. O que sobrou   │
 * │    lá é checagem de FORMA (string, 1 a 40 caracteres), que aceita "TRIGEM" sem piscar.       │
 * │                                                                                             │
 * │ A MEDIÇÃO QUE ORIGINOU ESTE ARQUIVO (auditoria, 09/09): apagando a chamada da `moverEtapa`,  │
 * │ NENHUM teste da suíte ficava vermelho. `exigirEtapaAtiva` era testada SOZINHA, nos specs do  │
 * │ catálogo, e ninguém afirmava que os dois chamadores dela a chamam. Teste do serviço isolado  │
 * │ prova que a guarda FUNCIONA; ele não prova que a guarda ESTÁ NO CAMINHO, que é a metade que  │
 * │ a operação sente.                                                                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O CATÁLOGO AQUI É O DE VERDADE, e isso é deliberado: `EtapasFunilService` real sobre o banco
 * fingido do próprio módulo (`etapas-funil.fake-db.ts`). Um dublê escrito neste arquivo devolveria a
 * recusa que ESTE arquivo imaginou, e as duas frases (a da etapa inexistente e a da etapa
 * desativada) passariam a ser afirmadas contra elas mesmas. Com o serviço real, quem responde é a
 * régua de produção.
 *
 * O DETALHE QUE FAZ O CENÁRIO SER ESTE E NÃO OUTRO: dentro da `moverEtapa`, a recusa de
 * `movimentoPermitido` ("já está nesta etapa") roda ANTES da guarda do catálogo. Uma candidatura
 * parada NA etapa inativada receberia a frase do movimento e o teste ficaria verde sem a guarda
 * existir. Por isso a pessoa está em `CAPTACAO` e o destino é OUTRA etapa, sempre.
 *
 * §A.6: nada de dado pessoal passa por aqui. A candidatura fingida tem id, vaga, etapa e situação.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

/** A etapa que o diretor tirou de circulação, e que continua existindo por causa do histórico. */
const INATIVADA = "ENTREVISTA_CLIENTE";
/** A que nunca existiu: o "TRIGEM" digitado errado, ou um corpo montado fora da tela. */
const DESCONHECIDA = "TRIGEM";
/** A ativa, que existe para o contraste: sem ela, um serviço que recusasse TUDO passaria. */
const ATIVA = "TRIAGEM";

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * O CATÁLOGO DE VERDADE, com uma etapa inativada dentro. `ativa: false` é o estado em que a
 * `remover` deixa uma etapa que já tem histórico (camada 2 da remoção), ou seja, o caso real.
 */
function catalogoComUmaInativada(): EtapasFunilService {
  const etapas = etapasSemente().map((e) =>
    e.codigo === INATIVADA ? { ...e, ativa: false } : e,
  );
  const { db } = bancoFingido({ etapas, candidaturas: [], historico: [] });
  return new EtapasFunilService(db as never);
}

/** O mínimo de banco para a `moverEtapa` andar: uma candidatura viva e as escritas anotadas. */
function cenario() {
  const linha = {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "CAPTACAO",
    situacao: "ATIVO",
    motivoDescarte: null as string | null,
    posicaoLado: null as string | null,
    alocadoPorId: null as string | null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null as Date | null,
  };

  const escritas: Escrita[] = [];

  const update = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async () => {
        escritas.push({ tabela, valores });
        if (tabela === asCandidaturas) Object.assign(linha, valores);
      },
    }),
  });

  const insert = (tabela: unknown) => ({
    values: async (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores });
    },
  });

  // A leitura de volta (`candidatura`), que só o caso de contraste alcança.
  const select = () => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.orderBy = async () => [
      {
        c: { ...linha },
        candidatoNome: "Candidata De Teste",
        vagaCodigo: "PS-2026-001",
        vagaNome: "Vaga de teste",
        autor: null,
      },
    ];
    return b;
  };

  const query = {
    asCandidaturas: { findFirst: async () => ({ ...linha }) },
  };

  const tx = { select, update, insert, query };
  const db = {
    select,
    update,
    insert,
    query,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return {
    service: new CandidatosService(db as never, catalogoComUmaInativada() as never, catalogoDeStatusFingido() as never),
    linha,
    escritas,
  };
}

/** A recusa, capturada: tem de ser resposta de HTTP com frase, e não erro cru vazando para a tela. */
async function recusaAo(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn();
  } catch (e) {
    expect(e, `a recusa precisa ser HttpException, veio: ${String(e)}`).toBeInstanceOf(
      HttpException,
    );
    return e as HttpException;
  }
  throw new Error("esperava a recusa e o movimento passou");
}

const eventos = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === asCandidaturaEtapas);

/** O motivo da única linha do lote, que é onde a recusa aparece quando ela vem em massa. */
function motivoUnico(r: AsResultadoEmMassa): string {
  expect(r.aplicadas, "nenhuma linha podia ter sido aplicada").toBe(0);
  expect(r.falhas).toHaveLength(1);
  return r.falhas[0]!.motivo;
}

describe("mover UMA candidatura só entra em etapa que existe E está ativa", () => {
  it("recusa a etapa DESCONHECIDA, e não escreve nada", async () => {
    const { service, linha, escritas } = cenario();

    const err = await recusaAo(() => service.moverEtapa("cand-1", { etapa: DESCONHECIDA }, "u1"));

    expect(err.message).toContain("não existe no funil");
    expect(linha.etapa, "a pessoa não podia ter saído do lugar").toBe("CAPTACAO");
    expect(escritas, "recusa que grava não é recusa").toHaveLength(0);
  });

  /**
   * O CASO QUE A FK DO BANCO NÃO PEGA: o código EXISTE na tabela, então o `INSERT` passaria. Quem
   * recusa é a guarda, e só ela.
   */
  it("recusa a etapa INATIVADA, e não escreve nada", async () => {
    const { service, linha, escritas } = cenario();

    const err = await recusaAo(() => service.moverEtapa("cand-1", { etapa: INATIVADA }, "u1"));

    expect(err.message).toContain("desativada");
    // A frase é a do CATÁLOGO, e não a de "já está nesta etapa": a guarda foi de fato exercitada.
    expect(err.message).not.toContain("já está nesta etapa");
    expect(linha.etapa).toBe("CAPTACAO");
    expect(escritas).toHaveLength(0);
  });

  /** O CONTRASTE, sem o qual os dois de cima seriam satisfeitos por um serviço que recusa tudo. */
  it("aceita a etapa ATIVA, move e registra a passagem", async () => {
    const { service, linha, escritas } = cenario();

    await service.moverEtapa("cand-1", { etapa: ATIVA }, "u1");

    expect(linha.etapa).toBe(ATIVA);
    expect(eventos(escritas)).toHaveLength(1);
    expect(eventos(escritas)[0]!.valores).toMatchObject({ etapaDe: "CAPTACAO", etapaPara: ATIVA });
  });
});

describe("o LOTE não é a porta dos fundos da mesma régua", () => {
  /**
   * A AÇÃO EM MASSA CHAMA A INDIVIDUAL, e é por isso que ela herda a guarda. O que este bloco
   * impede é a "otimização" que um dia troque o laço por um `UPDATE ... WHERE id IN (...)`: ali a
   * guarda desapareceria em silêncio, e o único sinal seria uma etapa morta recebendo gente.
   */
  it("recusa a etapa DESCONHECIDA em todas as linhas, sem escrever", async () => {
    const { service, linha, escritas } = cenario();

    const r = await service.moverEtapaEmLote(
      { candidaturaIds: ["cand-1"], etapa: DESCONHECIDA },
      "u1",
    );

    expect(motivoUnico(r)).toContain("não existe no funil");
    expect(linha.etapa).toBe("CAPTACAO");
    expect(escritas).toHaveLength(0);
  });

  it("recusa a etapa INATIVADA em todas as linhas, sem escrever", async () => {
    const { service, linha, escritas } = cenario();

    const r = await service.moverEtapaEmLote({ candidaturaIds: ["cand-1"], etapa: INATIVADA }, "u1");

    const motivo = motivoUnico(r);
    expect(motivo).toContain("desativada");
    expect(motivo).not.toContain("já está nesta etapa");
    expect(linha.etapa).toBe("CAPTACAO");
    expect(escritas).toHaveLength(0);
  });
});
