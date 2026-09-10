import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  consomePosicao,
  finalizaPosicao,
  type CandidaturaSituacao,
} from "@ea/shared-types";
import { SITUACOES_DE_SAIDA, ocupaPosicao } from "../../domain/candidatura";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";

/**
 * ─ AS GUARDAS DE SITUAÇÃO: quem se move, quem é aprovado, e por qual porta cada saída entra ─────
 *
 * TRÊS ACHADOS DA AUDITORIA E DO TESTER, no mesmo arquivo porque são a MESMA pergunta feita em três
 * lugares: "esta candidatura, no estado em que está, pode receber esta operação?".
 *
 *   ITEM 2. `moverEtapa` exigia `situacao === "ATIVO"` e recusava com "já foi encerrada". A frase JÁ
 *     MENTIA para o `APROVADO` (ser aprovado não encerra nada) e passaria a mentir para o `ALOCADO`,
 *     que é o estado que o diretor definiu como o oposto de encerrado: o alocado PREENCHE a posição
 *     e CONTINUA no funil.
 *
 *   ITEM 3. `aprovar` não conferia situação NENHUMA. Aprovar um `ALOCADO` gravava `APROVADO` por
 *     cima da ENTREGA, a contagem de entregues caía, o cilindro esvaziava e a vaga completa voltava
 *     a exigir Master para fechar. Sobre um `DESCARTADO`, ressuscitava a linha morta e pulava a
 *     ciência de reentrada, que é o buraco que a finalização de posição já tinha fechado.
 *
 *   ITEM 6. `registrarSaida` escolhia o caminho comparando com o NOME `"ENVIADO_PARA_ADMISSAO"`, e
 *     a lista de saídas estava REDIGITADA no DTO enquanto a constante do domínio não era lida por
 *     linha de produção nenhuma. A fonte morta, a cópia mandando, e uma linha de distância do
 *     desastre: `"ALOCADO"` acrescentado à lista cairia no `update` direto, sem trava de ocupação.
 *
 * O FAKE DE BANCO é o mesmo formato do `candidatos.finalizar-posicao.spec.ts`: a régua a proteger é
 * a ORDEM das operações (travar a linha da vaga, contar, decidir, gravar) e o QUE é gravado, e as
 * duas são observáveis nas chamadas.
 */

const AGORA = new Date("2026-09-08T12:00:00.000Z");

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function candidatura(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "TRIAGEM",
    situacao: "ATIVO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    ...over,
  };
}

function makeDb(cenario: {
  candidatura?: Record<string, unknown>;
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  /** Ocupação do lado OFICIAL das OUTRAS candidaturas, do jeito que o `group by` devolve. */
  ocupadas?: number;
}) {
  const c = cenario.candidatura ?? candidatura();
  const vaga = {
    id: "vaga-1",
    status: "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
  };

  const ordem: string[] = [];
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.orderBy = () =>
      Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    b.groupBy = () => {
      if (tabela === asCandidaturas) ordem.push("conta-ocupadas");
      return Promise.resolve([{ lado: null, quantas: cenario.ocupadas ?? 0 }]);
    };
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
    return b;
  });

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (v: Record<string, unknown>) => {
      lista.push({ tabela, valores: v });
      return Promise.resolve(undefined);
    },
  });

  const tx = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    query: { asCandidaturas: { findFirst: vi.fn().mockResolvedValue(c) } },
  };

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: { asCandidaturas: { findFirst: vi.fn().mockResolvedValue(c) } },
  };

  return { service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never), ordem, updates, inserts };
}

const doUpdate = (updates: Escrita[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
const doHistorico = (inserts: Escrita[]) =>
  inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};

const frase = (erro: unknown) =>
  String(((erro as ConflictException).getResponse() as { message?: string })?.message ?? erro);

/** As situações do vocabulário, separadas pela régua única, sem lista escrita à mão aqui. */
const VIVAS = CANDIDATURA_SITUACOES.filter(candidaturaViva);
const ENCERRADAS = CANDIDATURA_SITUACOES.filter((s) => !candidaturaViva(s));

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 2
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("moverEtapa: anda no funil quem está VIVO, e não só quem está ATIVO", () => {
  it("o recorte do teste sai da régua única: 4 vivas, 2 encerradas", () => {
    expect(VIVAS).toEqual(["ATIVO", "APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO"]);
    expect(ENCERRADAS).toEqual(["DESCARTADO", "DESISTIU"]);
  });

  it.each(VIVAS)("deixa a candidatura %s andar no funil", async (situacao) => {
    const { service, updates, inserts } = makeDb({
      candidatura: candidatura({ situacao, etapa: "TRIAGEM" }),
    });

    await service.moverEtapa("cand-1", { etapa: "ENTREVISTA_SOULAN" }, "user-1");
    expect(doUpdate(updates)).toMatchObject({ etapa: "ENTREVISTA_SOULAN" });
    expect(doHistorico(inserts)).toMatchObject({
      etapaDe: "TRIAGEM",
      etapaPara: "ENTREVISTA_SOULAN",
      // MOVER NÃO MUDA SITUAÇÃO: é essa independência que mantém a ocupação da vaga fora de alcance.
      situacao: null,
    });
  });

  /**
   * A GARANTIA QUE A RÉGUA ANTIGA PROTEGIA E ESTA MANTÉM: mover de etapa escreve SÓ a coluna
   * `etapa`. A ocupação da vaga deriva de `situacao`, e nenhuma das duas é tocada aqui.
   */
  it("o ALOCADO anda no funil SEM largar a posição: a situação não é escrita", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
    });

    await service.moverEtapa("cand-1", { etapa: "APROVACAO" }, "user-1");
    const gravado = doUpdate(updates);
    expect(gravado).toMatchObject({ etapa: "APROVACAO" });
    expect(gravado.situacao).toBeUndefined();
    expect(gravado.posicaoLado).toBeUndefined();
  });

  it.each(ENCERRADAS)("recusa a candidatura %s, que encerrou sem êxito", async (situacao) => {
    const { service, updates } = makeDb({ candidatura: candidatura({ situacao }) });

    const erro = await service
      .moverEtapa("cand-1", { etapa: "ENTREVISTA_SOULAN" }, "user-1")
      .catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
  });

  /**
   * A FRASE DEIXOU DE MENTIR. "Já foi encerrada" era falso para o aprovado e seria falso para o
   * alocado; agora ela diz SEM ÊXITO, que é a única coisa que de fato impede o movimento, e aponta
   * o caminho de volta, que é o mesmo da reentrada.
   */
  it("a recusa diz SEM ÊXITO e aponta a volta pela alocação, sem travessão (§A.11)", async () => {
    const { service } = makeDb({ candidatura: candidatura({ situacao: "DESCARTADO" }) });
    const erro = await service
      .moverEtapa("cand-1", { etapa: "ENTREVISTA_SOULAN" }, "user-1")
      .catch((e) => e);

    expect(frase(erro)).toContain("sem êxito");
    expect(frase(erro)).toContain("aloque-a de novo na vaga");
    expect(frase(erro)).not.toContain("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 3
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("aprovar: não desfaz entrega, e não ressuscita quem saiu", () => {
  it("aprova quem está ATIVO, como sempre aprovou", async () => {
    const { service, updates, ordem } = makeDb({
      candidatura: candidatura({ situacao: "ATIVO" }),
      posicoesOficiais: 5,
      ocupadas: 1,
    });

    await service.aprovar("cand-1", "user-1");
    expect(doUpdate(updates)).toMatchObject({ situacao: "APROVADO" });
    // O CAMINHO CONTINUA SENDO O TRAVADO: travar a linha da vaga vem ANTES de contar.
    expect(ordem).toEqual(["trava-vaga", "conta-ocupadas"]);
  });

  /**
   * ┌─ O DANO QUE ISTO IMPEDE, e ele é silencioso ────────────────────────────────────────────┐
   * │ `ALOCADO` virava `APROVADO`, e com isso a posição ENTREGUE virava posição apenas          │
   * │ RESERVADA. `finalizadasOficial` caía, o cilindro da tela esvaziava, e a vaga que já tinha │
   * │ entregue tudo voltava a precisar de um MASTER para fechar. Nada falhava e nada avisava.   │
   * └──────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it.each(CANDIDATURA_SITUACOES.filter(finalizaPosicao))(
    "RECUSA aprovar quem já entregou a posição (%s), e NADA é gravado",
    async (situacao) => {
      const { service, updates, inserts } = makeDb({
        candidatura: candidatura({ situacao, posicaoLado: "OFICIAL" }),
        posicoesOficiais: 5,
        ocupadas: 4,
      });

      const erro = await service.aprovar("cand-1", "user-1").catch((e) => e);
      expect(erro).toBeInstanceOf(ConflictException);
      expect(frase(erro)).toContain("já entregou a posição");

      // A CONTAGEM DE ENTREGUES FICA INTACTA: nem a situação nem o histórico foram escritos, então
      // a linha continua contando como posição ENTREGUE na próxima leitura da vaga.
      expect(updates).toHaveLength(0);
      expect(inserts).toHaveLength(0);
      expect(finalizaPosicao(situacao)).toBe(true);
    },
  );

  it.each(ENCERRADAS)("RECUSA aprovar quem saiu (%s), com a frase da reentrada", async (situacao) => {
    const { service, updates, inserts } = makeDb({
      candidatura: candidatura({ situacao }),
      posicoesOficiais: 5,
    });

    const erro = await service.aprovar("cand-1", "user-1").catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    // A CONVERSA DA REENTRADA é da `alocar`, que mostra o motivo e a data do encerramento anterior.
    expect(frase(erro)).toContain("aloque-a de novo na vaga");
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  /**
   * A TRAVA 7 NÃO É OPÇÃO DE CHAMADOR, e é isso que a separa da trava 5: não existe caminho para
   * quem desfazer uma entrega esteja certo. O avanço LEGÍTIMO do alocado para a esteira entrega dos
   * dois lados da pergunta e passa por ela sem sentir.
   */
  it("o ALOCADO continua avançando para a esteira: a trava só barra o RETROCESSO", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
      posicoesOficiais: 5,
      ocupadas: 2,
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: "ENVIADO_PARA_ADMISSAO", motivo: "foi para a esteira" },
      "user-1",
    );
    expect(doUpdate(updates)).toMatchObject({ situacao: "ENVIADO_PARA_ADMISSAO" });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ITEM 6
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("registrarSaida: quem escolhe a porta é a RÉGUA, não o nome da situação", () => {
  /**
   * A FONTE VOLTOU A MANDAR. A constante do domínio não era lida por nenhuma linha de produção
   * enquanto o DTO carregava a lista redigitada: mexer na fonte não mudava nada, e quem lesse a
   * fonte acreditaria estar lendo a régua.
   */
  it("a lista de saídas do DTO é a constante do domínio, e não uma cópia", () => {
    expect([...SITUACOES_DE_SAIDA]).toEqual(["DESCARTADO", "DESISTIU", "ENVIADO_PARA_ADMISSAO"]);
    for (const s of SITUACOES_DE_SAIDA) expect(CANDIDATURA_SITUACOES).toContain(s);
  });

  it("`ocupaPosicao` é `consomePosicao`, e não uma segunda régua", () => {
    for (const s of CANDIDATURA_SITUACOES) expect(ocupaPosicao(s)).toBe(consomePosicao(s));
  });

  it.each(SITUACOES_DE_SAIDA.filter((s) => !consomePosicao(s)))(
    "%s vai pelo caminho SIMPLES: libera posição, então não precisa travar a vaga",
    async (situacao) => {
      const { service, ordem, updates } = makeDb({ candidatura: candidatura({ situacao: "ATIVO" }) });
      await service.registrarSaida("cand-1", { situacao, motivo: "não seguiu" }, "user-1");

      expect(ordem).toEqual([]);
      expect(doUpdate(updates)).toMatchObject({ situacao, motivoDescarte: "não seguiu" });
    },
  );

  it.each(SITUACOES_DE_SAIDA.filter(consomePosicao))(
    "%s vai pelo caminho TRAVADO, porque consome posição",
    async (situacao) => {
      const { service, ordem, updates } = makeDb({
        candidatura: candidatura({ situacao: "APROVADO" }),
        posicoesOficiais: 5,
        ocupadas: 1,
      });
      await service.registrarSaida("cand-1", { situacao, motivo: "foi para a esteira" }, "user-1");

      expect(ordem).toEqual(["trava-vaga", "conta-ocupadas"]);
      expect(doUpdate(updates)).toMatchObject({ situacao });
    },
  );

  /**
   * ┌─ O ERRO FUTURO, SIMULADO: alguém acrescenta `"ALOCADO"` à lista de saídas ─────────────────┐
   * │ ERA UMA LINHA DE DISTÂNCIA. Com o desvio feito por `dto.situacao === "ENVIADO_PARA_ADMISSAO"`,│
   * │ a alocação cairia no `update` direto: sem `FOR UPDATE`, sem `cabeMaisUm`, sem lado e sem   │
   * │ aceite. Vaga de 5 aceitaria 6 alocados, em silêncio, porque a trava não teria sido burlada,│
   * │ apenas não consultada.                                                                    │
   * │                                                                                           │
   * │ O `as never` É O PONTO DO TESTE, e não uma folga: ele encena exatamente o corpo que aquela │
   * │ mudança faria chegar aqui, e afirma que a rota o manda para a porta certa MESMO ASSIM.     │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("ALOCADO entrando por esta rota cai no caminho TRAVADO, e a vaga cheia o RECUSA", async () => {
    const cheia = makeDb({
      candidatura: candidatura({ situacao: "ATIVO" }),
      posicoesOficiais: 5,
      ocupadas: 5,
    });

    const erro = await cheia.service
      .registrarSaida("cand-1", { situacao: "ALOCADO" as never, motivo: "alocado" }, "user-1")
      .catch((e) => e);

    expect(cheia.ordem).toEqual(["trava-vaga", "conta-ocupadas"]);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(frase(erro)).toContain("já estão preenchidas");
    expect(cheia.updates).toHaveLength(0);

    // E com espaço na vaga ele passa, pelo caminho travado, contado contra o teto do lado.
    const comEspaco = makeDb({
      candidatura: candidatura({ situacao: "ATIVO" }),
      posicoesOficiais: 5,
      ocupadas: 4,
    });
    await comEspaco.service.registrarSaida(
      "cand-1",
      { situacao: "ALOCADO" as never, motivo: "alocado" },
      "user-1",
    );
    expect(comEspaco.ordem).toEqual(["trava-vaga", "conta-ocupadas"]);
    expect(doUpdate(comEspaco.updates)).toMatchObject({ situacao: "ALOCADO" });
  });

  /**
   * O TRIPWIRE, no espírito do que já protege `SITUACOES_QUE_CONSOMEM_POSICAO`: toda situação que
   * consome posição tem de caber na assinatura do caminho travado. O dia em que uma quarta aparecer,
   * este teste falha e aponta para `SituacaoQueOcupaPosicao`, em vez de deixar a régua divergir.
   */
  it("toda situação que consome posição é uma das TRÊS que o caminho travado sabe gravar", () => {
    const doCaminhoTravado: CandidaturaSituacao[] = ["APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO"];
    for (const s of CANDIDATURA_SITUACOES) {
      if (consomePosicao(s)) expect(doCaminhoTravado).toContain(s);
    }
  });
});
