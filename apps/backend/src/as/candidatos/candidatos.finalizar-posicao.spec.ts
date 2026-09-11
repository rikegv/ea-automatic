import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import type { AuthUser } from "../../auth/auth.types";

/**
 * ─ FINALIZAR POSIÇÃO: a posição da vaga é ENTREGUE, com nome e sobrenome ────────────────────────
 *
 * O QUE ESTE ARQUIVO PROTEGE, e cada item custou uma decisão:
 *   1. UMA POSIÇÃO É DE UM CANDIDATO SÓ. A trava 1 (`cabeMaisUm`) vale para a finalização como vale
 *      para a aprovação, e a frase que o consultor lê é a mesma.
 *   2. O CAMINHO É O TRAVADO. A linha da VAGA é travada com `SELECT ... FOR UPDATE` ANTES de
 *      qualquer contagem. Gravar `ALOCADO` por fora disso reabriria a corrida entre dois consultores
 *      na última posição, que é a única razão de a trava 4 existir.
 *   3. O AVISO DO BANCO AVISA, E NÃO BLOQUEIA. Alocar no banco com posição oficial aberta devolve a
 *      pergunta com o NÚMERO na frente; a ciência volta no corpo e a segunda chamada passa.
 *   4. O LADO GRAVADO É LIDO DE VOLTA. Quem foi alocado no banco avança para a esteira medido contra
 *      o teto DELE, senão ele fica preso numa vaga que tem reserva de sobra.
 *
 * POR QUE UM FAKE DE BANCO, E NÃO UM BANCO DE VERDADE: a régua a proteger é a ORDEM das operações
 * dentro da transação (travar, contar, decidir, gravar), e ela é observável nas chamadas. O que um
 * banco real acrescentaria é a corrida de verdade entre duas transações, que nenhum teste de unidade
 * reproduz de qualquer forma.
 */

const AGORA = new Date("2026-09-08T12:00:00.000Z");

/**
 * QUEM REGISTRA A SAÍDA. O método passou a receber o usuário INTEIRO, e não só o id, porque
 * desvincular quem está ALOCADO virou ação de MASTER (a posição dele já foi entregue). Aqui o COMUM
 * basta: nenhuma destas chamadas desvincula um alocado, e a autoria continua saindo de `user.id`.
 */
const consultor = (id: string): AuthUser => ({
  id,
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
});

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** A candidatura que está sendo movida. O lado nulo é o caso de toda linha que existe hoje. */
function candidatura(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "APROVACAO",
    situacao: "APROVADO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    ...over,
  };
}

/**
 * `ocupadas` É A OCUPAÇÃO DO LADO OFICIAL, e `ocupadasBanco` a da reserva. Os nomes mudaram junto
 * com a trava: ela deixou de contar um total e passou a contar por lado, porque o total medido
 * contra dois tetos diferentes era a causa dos dois defeitos que este arquivo agora protege.
 *
 * O FAKE DEVOLVE O QUE O `group by posicao_lado` DEVOLVERIA, inclusive o lado NULO, que é como toda
 * linha de hoje está gravada: é o domínio que dobra o nulo em OFICIAL, e é isso que faz o
 * comportamento das linhas antigas continuar idêntico ao de antes da separação.
 */
function makeDb(cenario: {
  candidatura?: Record<string, unknown>;
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  ocupadas?: number;
  ocupadasBanco?: number;
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
    // A LEITURA FINAL da candidatura (a que monta a resposta) termina em `orderBy`, e é por isso que
    // ela não entra na `ordem`: o que se afirma aqui é a sequência DENTRO da transação.
    b.orderBy = () =>
      Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    // A CONTAGEM DA TRAVA TERMINA EM `groupBy`, e o lado NULO é o das linhas de hoje.
    b.groupBy = () => {
      if (tabela === asCandidaturas) ordem.push("conta-ocupadas");
      return Promise.resolve([
        { lado: null, quantas: cenario.ocupadas ?? 0 },
        { lado: "BANCO", quantas: cenario.ocupadasBanco ?? 0 },
      ]);
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
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: { asCandidaturas: { findFirst: vi.fn().mockResolvedValue(c) } },
  };

  return { service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never), ordem, updates, inserts };
}

const doUpdate = (updates: Escrita[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
const doHistorico = (inserts: Escrita[]) =>
  inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};

describe("finalizarPosicao: o caminho travado", () => {
  /**
   * A TRAVA 4, escrita como ordem: travar a linha da vaga vem ANTES de contar. Uma consulta solta
   * antes do update responde sobre o passado, e é assim que duas finalizações simultâneas passam as
   * duas na última posição.
   */
  it("trava a linha da VAGA antes de contar as ocupadas", async () => {
    const { service, ordem } = makeDb({ posicoesOficiais: 5, ocupadas: 1 });
    await service.finalizarPosicao("cand-1", {}, "user-1");
    expect(ordem).toEqual(["trava-vaga", "conta-ocupadas"]);
  });

  /** A finalização grava `ALOCADO`, o lado OFICIAL e o evento do histórico, na mesma transação. */
  it("grava ALOCADO no lado OFICIAL e registra o evento", async () => {
    const { service, updates, inserts } = makeDb({ posicoesOficiais: 5, ocupadas: 0 });
    await service.finalizarPosicao("cand-1", {}, "user-1");

    expect(doUpdate(updates)).toMatchObject({ situacao: "ALOCADO", posicaoLado: "OFICIAL" });
    expect(doHistorico(inserts)).toMatchObject({
      candidaturaId: "cand-1",
      situacao: "ALOCADO",
      etapaPara: "APROVACAO",
      porId: "user-1",
    });
  });

  /** Finalizar posição não tem motivo a dar: o desfecho bem-sucedido não precisa de justificativa. */
  it("não inventa motivo nem apaga o que já estava gravado", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ motivoDescarte: "anotação anterior" }),
      ocupadas: 0,
    });
    await service.finalizarPosicao("cand-1", {}, "user-1");
    expect(doUpdate(updates).motivoDescarte).toBe("anotação anterior");
  });

  it("recusa finalizar quem já está alocado", async () => {
    const { service, updates } = makeDb({ candidatura: candidatura({ situacao: "ALOCADO" }) });
    await expect(service.finalizarPosicao("cand-1", {}, "user-1")).rejects.toThrow(
      ConflictException,
    );
    expect(updates).toHaveLength(0);
  });
});

/**
 * ─ SÓ CANDIDATURA VIVA FINALIZA POSIÇÃO (a trava 5, achado da auditoria) ────────────────────────
 *
 * O QUE ESTAVA ABERTO: a finalização não olhava se a candidatura ainda estava viva, então uma linha
 * DESCARTADA ia direto a `ALOCADO`. Quem foi descartado e volta a ser escolhido tem UM caminho, o da
 * `alocar`, que mostra o MOTIVO e a DATA do descarte e exige a ciência de reentrada. Finalizar por
 * cima da linha morta pulava essa conversa e ressuscitava a candidatura encerrada, em vez de abrir a
 * nova que o histórico espera.
 *
 * A RECUSA É O CONSERTO, e não a tradução do erro de banco. O índice parcial `uq_as_candidaturas_viva`
 * só barra o caso em que a pessoa TEM outra candidatura viva na mesma vaga; sem ela, a linha morta
 * virava ALOCADO consumindo posição, e nada falhava. A tradução do unique continua existindo como
 * segunda camada, para a fresta em que a `alocar` cria a segunda viva no meio do caminho.
 */
describe("finalizarPosicao: só candidatura VIVA recebe posição (trava 5)", () => {
  /** A régua é `candidaturaViva`, do domínio, e o laço cobre as duas saídas sem êxito de uma vez. */
  for (const situacao of ["DESCARTADO", "DESISTIU"] as const) {
    it(`recusa finalizar posição de quem está ${situacao}, e não grava nada`, async () => {
      const { service, updates, inserts } = makeDb({
        candidatura: candidatura({ situacao }),
        posicoesOficiais: 5,
        ocupadas: 0,
      });

      await expect(service.finalizarPosicao("cand-1", {}, "user-1")).rejects.toThrow(
        /já foi encerrada e não recebe posição/,
      );
      expect(updates).toHaveLength(0);
      expect(inserts).toHaveLength(0);
    });
  }

  /** O contorno, para a trava não virar "recusa tudo": quem está no processo continua entregando. */
  it("quem está ATIVO ou APROVADO continua finalizando normalmente", async () => {
    for (const situacao of ["ATIVO", "APROVADO"] as const) {
      const { service, updates } = makeDb({
        candidatura: candidatura({ situacao }),
        posicoesOficiais: 5,
        ocupadas: 0,
      });
      await service.finalizarPosicao("cand-1", {}, "user-1");
      expect(doUpdate(updates).situacao).toBe("ALOCADO");
    }
  });

  /**
   * A SEGUNDA CAMADA: a violação do índice parcial chega na tela como FRASE, e não como 500.
   *
   * A fresta existe porque a `alocar` NÃO trava a linha da vaga: ela pode criar a segunda
   * candidatura viva do par pessoa/vaga entre a leitura desta transação e a gravação dela. Sem a
   * tradução, o erro cru do Postgres subiria como erro interno, enquanto a `alocar` devolveria a
   * frase certa no mesmíssimo caso.
   */
  it("a violação do unique vira 409 com a frase da alocação, e não 500", async () => {
    const { service } = makeDb({ posicoesOficiais: 5, ocupadas: 0 });
    // O erro que o driver levanta quando o índice parcial barra a segunda linha viva.
    (service as unknown as { db: { transaction: unknown } }).db.transaction = () =>
      Promise.reject(
        Object.assign(new Error("duplicate key value violates unique constraint"), {
          constraint_name: "uq_as_candidaturas_viva",
        }),
      );

    const erro = await service
      .finalizarPosicao("cand-1", {}, "user-1")
      .catch((e: unknown) => e as ConflictException);

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).message).toBe("Esta pessoa já está nesta vaga.");
  });

  /**
   * E A TRADUÇÃO NÃO ENGOLE AS RECUSAS LEGÍTIMAS: vaga cheia continua chegando com a frase dela, e
   * não transformada em outra coisa pelo `catch`.
   */
  it("a recusa por vaga cheia atravessa a tradução sem mudar de forma", async () => {
    const { service } = makeDb({ posicoesOficiais: 1, ocupadas: 1 });
    await expect(service.finalizarPosicao("cand-1", {}, "user-1")).rejects.toThrow(
      "Esta vaga tem 1 posição e ela já está preenchida. Reprove alguém ou aumente as posições da vaga.",
    );
  });
});

describe("finalizarPosicao: uma posição é de um candidato só (trava 1)", () => {
  /** A frase é a mesma da aprovação, e de propósito: é a mesma trava, no mesmo lugar. */
  it("recusa a finalização que passaria da meta oficial", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 1, ocupadas: 1 });
    await expect(service.finalizarPosicao("cand-1", {}, "user-1")).rejects.toThrow(
      "Esta vaga tem 1 posição e ela já está preenchida. Reprove alguém ou aumente as posições da vaga.",
    );
    expect(updates).toHaveLength(0);
  });

  it("a última posição livre ainda entra", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 5, ocupadas: 4 });
    await service.finalizarPosicao("cand-1", {}, "user-1");
    expect(doUpdate(updates).situacao).toBe("ALOCADO");
  });

  /** Vaga sem meta não é vaga cheia: a frase precisa dizer o que fazer, e não "está cheia". */
  it("vaga sem meta definida recusa pedindo a meta", async () => {
    const { service } = makeDb({ posicoesOficiais: null, ocupadas: 0 });
    await expect(service.finalizarPosicao("cand-1", {}, "user-1")).rejects.toThrow(
      /ainda não tem o número de posições definido/,
    );
  });
});

describe("finalizarPosicao: o aviso do banco AVISA e não bloqueia", () => {
  /**
   * A PRIMEIRA CHAMADA É RECUSADA COM A PERGUNTA, e o corpo traz o NÚMERO: sobrar uma posição e
   * sobrarem cinco são decisões diferentes, e sem o número o aviso vira clique automático.
   */
  it("alocar no banco com posições oficiais abertas pede confirmação", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 5, posicoesBanco: 20, ocupadas: 2 });

    const erro = await service
      .finalizarPosicao("cand-1", { lado: "BANCO" }, "user-1")
      .catch((e: ConflictException) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      needsConfirmation: true,
      reason: "bancoComOficiaisAbertas",
      oficiaisAbertas: 3,
    });
    // AVISA, NÃO BLOQUEIA, mas a primeira chamada não grava: quem decide é o consultor.
    expect(updates).toHaveLength(0);
  });

  it("com a ciência no corpo, a mesma chamada passa e grava o lado BANCO", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 5, posicoesBanco: 20, ocupadas: 2 });
    await service.finalizarPosicao(
      "cand-1",
      { lado: "BANCO", cienteBancoComOficiaisAbertas: true },
      "user-1",
    );
    expect(doUpdate(updates)).toMatchObject({ situacao: "ALOCADO", posicaoLado: "BANCO" });
  });

  /** Sem posição oficial aberta não há o que avisar: o banco é o caminho natural dali em diante. */
  it("com as oficiais cheias, o banco não pergunta nada", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 5, posicoesBanco: 20, ocupadas: 5 });
    await service.finalizarPosicao("cand-1", { lado: "BANCO" }, "user-1");
    expect(doUpdate(updates)).toMatchObject({ situacao: "ALOCADO", posicaoLado: "BANCO" });
  });

  /**
   * O TETO DO BANCO É O DA RESERVA, medido contra a ocupação DA RESERVA: a vigésima pessoa ainda
   * entra na vaga de 20 de banco, mesmo com as 5 oficiais lotadas, porque são cilindros distintos.
   */
  it("o banco cabe até a meta de banco", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 5,
      ocupadasBanco: 19,
    });
    await service.finalizarPosicao("cand-1", { lado: "BANCO" }, "user-1");
    expect(doUpdate(updates).situacao).toBe("ALOCADO");
  });

  /**
   * E ELE TEM FIM. A frase fala do número DE BANCO, e só dele: com o teto próprio, quem esbarrou foi
   * nos 20 da reserva, e citar os 5 oficiais mandaria o consultor mexer no campo errado.
   */
  it("passando do teto de banco, recusa falando do número de banco", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 0,
      ocupadasBanco: 20,
    });
    await expect(
      service.finalizarPosicao("cand-1", { lado: "BANCO", cienteBancoComOficiaisAbertas: true }, "user-1"),
    ).rejects.toThrow(
      "Esta vaga tem 20 posições de banco e as 20 já estão preenchidas. Aumente as posições de banco da vaga ou libere alguém.",
    );
    expect(updates).toHaveLength(0);
  });

  /**
   * VAGA QUE NÃO RESERVOU BANCO NENHUM tem frase própria, porque é problema diferente: não é reserva
   * cheia, é reserva que ninguém dimensionou. Antes, o teto cumulativo mandava essa alocação
   * consumir uma posição OFICIAL em silêncio, que é a confusão que a separação por lado acabou.
   */
  it("banco sem reserva recusa pedindo para definir as posições de banco", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 2, posicoesBanco: 0, ocupadas: 0 });
    await expect(
      service.finalizarPosicao("cand-1", { lado: "BANCO", cienteBancoComOficiaisAbertas: true }, "user-1"),
    ).rejects.toThrow(
      "Esta vaga não tem posição de banco reservada. Defina as posições de banco da vaga antes de alocar alguém na reserva.",
    );
    expect(updates).toHaveLength(0);
  });
});

/**
 * ─ OS DOIS DEFEITOS MEDIDOS NA VAGA REAL DE HOMOLOGAÇÃO, e este bloco existe para matá-los ──────
 *
 * A VAGA É DE VERDADE: 5 posições oficiais e 20 de banco. A causa dos dois era UMA: a trava contava
 * as ocupadas com um `count(*)` SEM LADO, e media esse número único contra dois tetos diferentes.
 *
 * ELES SÃO O CORAÇÃO DESTA ENTREGA. Um teste que passe com a contagem total de volta não protege
 * nada, e é por isso que os dois cenários são escritos com o número exato que a operação viu.
 */
describe("a vaga de 5 oficiais e 20 de banco, alocando no BANCO", () => {
  /**
   * DEFEITO 1: O AVISO MENTIA E DEPOIS SUMIA.
   *
   * Alocando um a um NO BANCO, com as 5 oficiais SEMPRE vazias, o aviso dizia 5, 4, 3, 2, 1 e, na
   * QUINTA, parava de aparecer: `oficiaisAindaAbertas(ocupadasTOTAL, 5)` chegava a zero e a condição
   * deixava de disparar. Ele desaparecia exatamente no caso que o diretor mandou avisar.
   *
   * O LAÇO VAI ATÉ 19 de propósito: é a vigésima alocação de banco, e sob o defeito o aviso já tinha
   * sumido havia quinze.
   */
  it("o aviso continua dizendo 5 e continua aparecendo, da primeira à vigésima", async () => {
    for (let jaNoBanco = 0; jaNoBanco < 20; jaNoBanco++) {
      const { service, updates } = makeDb({
        posicoesOficiais: 5,
        posicoesBanco: 20,
        ocupadas: 0,
        ocupadasBanco: jaNoBanco,
      });

      const erro = await service
        .finalizarPosicao("cand-1", { lado: "BANCO" }, "user-1")
        .catch((e: ConflictException) => e);

      expect(erro).toBeInstanceOf(ConflictException);
      expect((erro as ConflictException).getResponse()).toMatchObject({
        needsConfirmation: true,
        reason: "bancoComOficiaisAbertas",
        oficiaisAbertas: 5,
      });
      expect(updates).toHaveLength(0);
    }
  });

  /**
   * DEFEITO 2: A VAGA NUNCA ENTREGAVA O OFICIAL.
   *
   * Com 20 alocados no banco (permitido: a reserva comporta 20), o candidato do lado OFICIAL batia
   * em `cabeMaisUm(20, 5)`, dava falso, e era recusado com "as 5 posições já estão preenchidas",
   * TENDO ZERO POSIÇÃO OFICIAL PREENCHIDA. A vaga ficava travada para o que ela existe para fazer.
   */
  it("com 20 no banco, o candidato OFICIAL entra, e as cinco entram", async () => {
    for (let jaOficiais = 0; jaOficiais < 5; jaOficiais++) {
      const { service, updates } = makeDb({
        posicoesOficiais: 5,
        posicoesBanco: 20,
        ocupadas: jaOficiais,
        ocupadasBanco: 20,
      });
      await service.finalizarPosicao("cand-1", { lado: "OFICIAL" }, "user-1");
      expect(doUpdate(updates)).toMatchObject({ situacao: "ALOCADO", posicaoLado: "OFICIAL" });
    }
  });

  /** E O CILINDRO OFICIAL TEM FIM: a sexta oficial continua sendo recusada, com a frase de sempre. */
  it("a sexta posição oficial continua recusada, e o banco cheio não muda a frase", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 5,
      ocupadasBanco: 20,
    });
    await expect(service.finalizarPosicao("cand-1", { lado: "OFICIAL" }, "user-1")).rejects.toThrow(
      "Esta vaga tem 5 posições e as 5 já estão preenchidas. Reprove alguém ou aumente as posições da vaga.",
    );
    expect(updates).toHaveLength(0);
  });
});

describe("o lado gravado é lido de volta", () => {
  /**
   * O BECO SEM SAÍDA QUE ESTE TESTE FECHA: quem foi alocado no BANCO de uma vaga com as oficiais
   * cheias seria medido contra a meta oficial ao avançar para a esteira, e o avanço seria recusado
   * numa vaga com reserva de sobra. A pessoa ficaria presa no estado em que entrou.
   */
  it("o alocado no BANCO avança para a esteira mesmo com as oficiais cheias", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO", posicaoLado: "BANCO" }),
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 5,
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: "ENVIADO_PARA_ADMISSAO", motivo: "documentação ok" },
      consultor("user-1"),
    );

    expect(doUpdate(updates).situacao).toBe("ENVIADO_PARA_ADMISSAO");
  });

  /**
   * E O AVANÇO NÃO REESCREVE O LADO. Gravar `OFICIAL` a cada mudança de situação apagaria em
   * silêncio o banco de quem estava na reserva, e a trava passaria a medi-lo contra o teto errado na
   * operação seguinte.
   */
  it("avançar de situação não mexe no lado de quem já tinha um", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO", posicaoLado: "BANCO" }),
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 5,
    });
    await service.registrarSaida(
      "cand-1",
      { situacao: "ENVIADO_PARA_ADMISSAO", motivo: "documentação ok" },
      consultor("user-1"),
    );
    expect(doUpdate(updates)).not.toHaveProperty("posicaoLado");
  });

  /** APROVAR NÃO ESCOLHE LADO: aprovar reserva, não entrega, e o comportamento dela não mudou. */
  it("aprovar continua sem escrever lado nenhum", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ situacao: "ATIVO", etapa: "TRIAGEM" }),
      posicoesOficiais: 5,
      ocupadas: 0,
    });
    await service.aprovar("cand-1", "user-1");
    expect(doUpdate(updates).situacao).toBe("APROVADO");
    expect(doUpdate(updates)).not.toHaveProperty("posicaoLado");
  });
});

/**
 * ─ O LOG DO ACEITE: o aviso destravado deixa rastro permanente (§A.3 regra 8, §A.6) ─────────────
 *
 * O QUE ESTAVA ABERTO, e a auditoria levantou: `cienteBancoComOficiaisAbertas` era LIDO e JOGADO
 * FORA. O consultor atravessava a guarda mais cara de desfazer do módulo (mandar alguém para a
 * reserva com posição oficial em aberto) e não sobrava rastro nenhum de quem decidiu, quando, nem do
 * que ele estava vendo na hora.
 *
 * A RÉGUA É "QUEM, QUANDO E O ESTADO NO INSTANTE DA DECISÃO", e o estado aqui é o NÚMERO de posições
 * oficiais que continuavam abertas. Sem ele o log não serve: confirmar com uma posição aberta e
 * confirmar com cinco são decisões diferentes.
 *
 * §A.6 É PARTE DO TESTE, E NÃO UMA NOTA DE RODAPÉ: o registro leva usuário INTERNO, data, lado e um
 * número. Nenhum dado de candidato, nenhum CPF, nenhum nome de pessoa, nenhuma URL. O teste afirma
 * isso sobre as CHAVES gravadas, e não sobre a intenção de quem escreveu.
 */
describe("o aceite do aviso de banco deixa log permanente", () => {
  it("grava quem, o lado e o número que estava na tela quando o consultor confirmou", async () => {
    const { service, inserts } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 2,
      ocupadasBanco: 0,
    });

    await service.finalizarPosicao(
      "cand-1",
      { lado: "BANCO", cienteBancoComOficiaisAbertas: true },
      "user-1",
    );

    expect(doHistorico(inserts)).toMatchObject({
      candidaturaId: "cand-1",
      situacao: "ALOCADO",
      // QUEM: usuário interno, e é dele que o nome sai na leitura, por join.
      porId: "user-1",
      // O LADO ESCOLHIDO, no evento, e não só na candidatura.
      posicaoLado: "BANCO",
      // QUAL GUARDA foi destravada, em valor fechado, para a consulta poder perguntar por ele.
      aceite: "BANCO_COM_OFICIAIS_ABERTAS",
      // O ESTADO: 5 posições oficiais, 2 ocupadas, 3 continuavam abertas quando ele confirmou.
      aceiteNumero: 3,
    });
  });

  /**
   * QUANDO. O carimbo não é escrito pelo service de propósito: `ocorrido_em` tem default no banco e
   * é `NOT NULL`, então o instante do aceite vem do Postgres, dentro da mesma transação, e não do
   * relógio do processo que montou o insert. O teste afirma isso no schema, que é onde a garantia
   * mora, em vez de afirmar sobre um valor que o service não escreve.
   */
  it("o quando vem do banco, e o insert não o falseia", () => {
    const coluna = asCandidaturaEtapas.ocorridoEm as unknown as Record<string, unknown>;
    expect(coluna.hasDefault).toBe(true);
    expect(coluna.notNull).toBe(true);
  });

  /**
   * §A.6: NADA DE CANDIDATO NO REGISTRO. A lista é fechada e conferida contra as chaves gravadas,
   * porque o jeito de essa regra se perder é alguém acrescentar "só o nome, para ficar legível" no
   * insert, e o log de auditoria virar um lugar por onde o dado pessoal vaza.
   */
  it("o registro não carrega dado nenhum de candidato", async () => {
    const { service, inserts } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 2,
      ocupadasBanco: 0,
    });
    await service.finalizarPosicao(
      "cand-1",
      { lado: "BANCO", cienteBancoComOficiaisAbertas: true },
      "user-1",
    );

    const permitidas = [
      "candidaturaId",
      "etapaDe",
      "etapaPara",
      "situacao",
      "motivo",
      "porId",
      "posicaoLado",
      "aceite",
      "aceiteNumero",
    ];
    const h = doHistorico(inserts);
    expect(Object.keys(h).filter((k) => !permitidas.includes(k))).toEqual([]);
    // Nem o id nem o nome da pessoa entram, e os dois estão disponíveis neste ponto do código.
    expect(Object.values(h)).not.toContain("pessoa-1");
    expect(Object.values(h)).not.toContain("Fulano");
  });

  /**
   * ACEITE SÓ EXISTE ONDE HOUVE GUARDA. Com as oficiais cheias o aviso nem aparece, então confirmar
   * não destrava nada, e registrar "aceite" ali encheria a trilha de linhas que não descrevem
   * decisão nenhuma. A pergunta que o log responde é "onde alguém passou por cima de um aviso".
   */
  it("não registra aceite quando o aviso não tinha o que avisar", async () => {
    const { service, inserts } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      ocupadas: 5,
      ocupadasBanco: 0,
    });
    await service.finalizarPosicao(
      "cand-1",
      { lado: "BANCO", cienteBancoComOficiaisAbertas: true },
      "user-1",
    );
    const h = doHistorico(inserts);
    expect(h).not.toHaveProperty("aceite");
    expect(h).not.toHaveProperty("aceiteNumero");
    // O lado continua sendo gravado: ele é a decisão, e a decisão aconteceu.
    expect(h).toMatchObject({ posicaoLado: "BANCO" });
  });

  /**
   * E O EVENTO QUE NÃO ESCOLHE LADO NÃO INVENTA UM. Aprovar reserva, não entrega, e carimbar
   * `OFICIAL` na linha do tempo faria a ficha afirmar uma decisão que ninguém tomou.
   */
  it("aprovar não escreve lado nem aceite no histórico", async () => {
    const { service, inserts } = makeDb({
      candidatura: candidatura({ situacao: "ATIVO", etapa: "TRIAGEM" }),
      posicoesOficiais: 5,
      ocupadas: 0,
    });
    await service.aprovar("cand-1", "user-1");
    const h = doHistorico(inserts);
    expect(h).not.toHaveProperty("posicaoLado");
    expect(h).not.toHaveProperty("aceite");
  });
});
