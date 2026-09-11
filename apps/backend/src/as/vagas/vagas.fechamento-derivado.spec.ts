import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { VagasService } from "./vagas.service";
import { asCandidaturas, vagaBeneficio, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ O FECHAMENTO DA VAGA: QUEM DIZ QUE ELA ENTREGOU SÃO AS CANDIDATURAS ──────────────────────────
 *
 * A RÉGUA DO DIRETOR: a vaga só fecha quando TODAS as posições OFICIAIS estão preenchidas. Master e
 * Super Admin podem forçar, e o forçado deixa trilha.
 *
 * O QUE ESTE ARQUIVO PROTEGE, e cada item é uma decisão que custou uma linha do desenho:
 *   1. O GATE É A DERIVADA, nunca o número digitado no formulário. 3 de 5 não fecha.
 *   2. O BANCO NÃO AJUDA A FECHAR. Vinte pessoas na reserva não entregam uma posição oficial.
 *   3. O COMUM CONTINUA FECHANDO VAGA COMPLETA. É a regressão que um `@Roles` na rota causaria, e
 *      ela é silenciosa: ninguém percebe que o consultor parou de conseguir encerrar o que entregou.
 *   4. FORÇAR É DE MASTER, e a conferência é do SERVICE. O COMUM que manda `forcar` leva 403.
 *   5. A TRILHA DO FORÇADO GRAVA QUEM, QUANDO E QUANTAS FALTAVAM, e o `faltavam` é CONGELADO: a
 *      leitura devolve o número gravado, e não uma recontagem de hoje.
 *   6. A ORDEM DENTRO DA TRANSAÇÃO: travar a linha da vaga, depois contar. Uma contagem solta antes
 *      do update responde sobre o passado, e é assim que um fechamento decide sobre uma fotografia
 *      velha enquanto alguém finaliza a última posição.
 *
 * POR QUE UM FAKE DE BANCO: a régua a proteger é a ORDEM das operações e o que é gravado, e as duas
 * são observáveis nas chamadas. O mesmo formato do `candidatos.finalizar-posicao.spec.ts`.
 */

const AGORA = new Date("2026-09-08T12:00:00.000Z");

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const MASTER: AuthUser = { ...COMUM, id: "user-master", papel: "MASTER" };
const SUPER: AuthUser = { ...COMUM, id: "user-super", papel: "SUPER_ADMIN" };

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

/** N pessoas na mesma situação e no mesmo lado, que é como as vagas reais se parecem. */
function pessoas(quantas: number, situacao: string, posicaoLado: string | null = null) {
  return Array.from({ length: quantas }, (_, i) => pessoa(situacao, posicaoLado, `P${i}`));
}

/** A linha da vaga do jeito que a LISTAGEM a lê (o resto dos 60 campos não importa aqui). */
function linhaDeVaga(over: Record<string, unknown> = {}) {
  return {
    v: {
      id: "vaga-1",
      codigo: "PS-2026-001",
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

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function makeDb(cenario: {
  status?: string;
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  candidaturas?: ReturnType<typeof pessoa>[];
  /** O que a LISTAGEM devolve depois da gravação (a trilha lida de volta, por exemplo). */
  linhaListagem?: ReturnType<typeof linhaDeVaga>;
}) {
  const linhas = cenario.candidaturas ?? [];
  const vagaTravada = {
    id: "vaga-1",
    status: cenario.status ?? "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
  };
  const daListagem =
    cenario.linhaListagem ??
    linhaDeVaga({
      posicoesOficiais: vagaTravada.posicoesOficiais,
      posicoesBanco: cenario.posicoesBanco ?? 0,
    });

  /** O `group by (vaga, situação, lado)` da listagem, derivado das MESMAS candidaturas. */
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

  const ordem: string[] = [];
  const updates: Escrita[] = [];

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
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vagaTravada]);
    };
    b.orderBy = () => {
      if (tabela === asCandidaturas) ordem.push("le-candidaturas");
      if (tabela === asCandidaturas) return Promise.resolve(linhas);
      if (tabela === vagas) return Promise.resolve([daListagem]);
      if (tabela === vagaBeneficio) return Promise.resolve([]);
      return Promise.resolve([]);
    };
    b.groupBy = () => Promise.resolve(agregado());
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
      return { where: async () => undefined };
    },
  }));

  /**
   * O `insert` ENTROU NO FAKE porque `editarPosicoes` passou a gravar o RASTRO DA REDUÇÃO DE META na
   * MESMA transação da escrita das posições (achado da auditoria de 09/09). Aqui ele só precisa
   * existir para a transação não quebrar; quem cobre o conteúdo do rastro é
   * `vagas.rastro-reducao-meta.spec.ts`, que é o arquivo desse assunto.
   */
  const insert = vi.fn((tabela: unknown) => ({
    values: async (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
    },
  }));

  const tx = { select, update, insert };
  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      vagas: {
        findFirst: vi.fn().mockResolvedValue({
          ...daListagem.v,
          posicoesBanco: cenario.posicoesBanco ?? 0,
        }),
      },
    },
  };

  return { service: new VagasService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never), ordem, updates };
}

const gravado = (updates: Escrita[]) => updates.find((u) => u.tabela === vagas)?.valores ?? {};
const CORPO = { dataFechamento: "2026-09-08" };

/** A recusa estruturada da trava 6, do jeito que ela chega na tela. */
function recusaDe(erro: unknown): Record<string, unknown> {
  expect(erro).toBeInstanceOf(ConflictException);
  return (erro as ConflictException).getResponse() as Record<string, unknown>;
}

describe("fechar: a trava 6, quem decide é a contagem das candidaturas", () => {
  it("NÃO fecha com 3 posições oficiais entregues de 5, e a recusa diz o que falta", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    const erro = await service.fechar("vaga-1", CORPO, COMUM).catch((e) => e);
    expect(recusaDe(erro)).toMatchObject({
      motivo: "POSICOES_OFICIAIS_ABERTAS",
      faltam: 2,
      posicoesOficiais: 5,
      finalizadasOficial: 3,
      podeForcar: false,
    });
    // NADA É GRAVADO na recusa: a vaga continua aberta e recebendo gente.
    expect(updates).toHaveLength(0);
  });

  it("diz ao MASTER que ele PODE forçar, e ao COMUM que não", async () => {
    for (const [user, esperado] of [
      [COMUM, false],
      [MASTER, true],
      [SUPER, true],
    ] as const) {
      const { service } = makeDb({ posicoesOficiais: 5, candidaturas: pessoas(3, "ALOCADO") });
      const erro = await service.fechar("vaga-1", CORPO, user).catch((e) => e);
      expect(recusaDe(erro).podeForcar).toBe(esperado);
    }
  });

  /**
   * A REGRESSÃO QUE UM `@Roles` NA ROTA CAUSARIA, e ela é silenciosa: o consultor que operou a vaga
   * inteira deixaria de conseguir encerrá-la depois de entregar tudo.
   */
  it("FECHA normalmente com 5 de 5, INCLUSIVE para o COMUM, e não grava trilha nenhuma", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(5, "ALOCADO"),
    });

    await service.fechar("vaga-1", CORPO, COMUM);
    const v = gravado(updates);
    expect(v).toMatchObject({ status: "ENTREGUE", vagasFechadas: 5, vagasFechadasBanco: 0 });
    expect(v.fechamentoForcadoPorId).toBeUndefined();
    expect(v.fechamentoForcadoEm).toBeUndefined();
    expect(v.fechamentoForcadoFaltavam).toBeUndefined();
  });

  /**
   * RESERVA NÃO É ENTREGA. Esta é a regra que o desenho isolou como a mais fácil de errar: com um
   * contador só, vinte pessoas no banco fechariam uma vaga que não contratou ninguém.
   */
  it("BANCO CHEIO NÃO AJUDA A FECHAR: 0 de 5 oficiais com 20 de 20 no banco continua recusando", async () => {
    const { service } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      candidaturas: pessoas(20, "ALOCADO", "BANCO"),
    });

    const erro = await service.fechar("vaga-1", CORPO, COMUM).catch((e) => e);
    expect(recusaDe(erro)).toMatchObject({ faltam: 5, finalizadasOficial: 0 });
  });

  it("conta o ENVIADO_PARA_ADMISSAO como posição entregue, e o APROVADO não", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 2,
      candidaturas: [pessoa("ALOCADO", null, "A"), pessoa("ENVIADO_PARA_ADMISSAO", null, "B")],
    });
    await service.fechar("vaga-1", CORPO, COMUM);
    expect(gravado(updates)).toMatchObject({ vagasFechadas: 2, status: "ENTREGUE" });

    const so2Aprovados = makeDb({
      posicoesOficiais: 2,
      candidaturas: [pessoa("APROVADO", null, "A"), pessoa("APROVADO", null, "B")],
    });
    const erro = await so2Aprovados.service.fechar("vaga-1", CORPO, COMUM).catch((e) => e);
    // APROVADO RESERVA E NÃO ENTREGA: a vaga continua devendo as duas posições.
    expect(recusaDe(erro)).toMatchObject({ faltam: 2, finalizadasOficial: 0 });
  });
});

describe("fechar: o forçamento é de Master, e ele deixa trilha", () => {
  it("dá 403 ao COMUM que manda `forcar`", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await expect(
      service.fechar("vaga-1", { ...CORPO, forcar: true }, COMUM),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updates).toHaveLength(0);
  });

  it("deixa o MASTER passar e grava QUEM, QUANDO e QUANTAS FALTAVAM", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });

    await service.fechar("vaga-1", { ...CORPO, forcar: true }, MASTER);
    const v = gravado(updates);
    expect(v).toMatchObject({
      status: "ENTREGUE",
      vagasFechadas: 3,
      fechamentoForcadoPorId: "user-master",
      fechamentoForcadoFaltavam: 2,
    });
    expect(v.fechamentoForcadoEm).toBeInstanceOf(Date);
  });

  it("deixa o SUPER_ADMIN passar pelo mesmo caminho", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 4,
      candidaturas: pessoas(1, "ALOCADO"),
    });
    await service.fechar("vaga-1", { ...CORPO, forcar: true }, SUPER);
    expect(gravado(updates)).toMatchObject({
      fechamentoForcadoPorId: "user-super",
      fechamentoForcadoFaltavam: 3,
    });
  });

  /**
   * SEM NINGUÉM DENTRO A VAGA SAI `FECHADA`, e não `ENTREGUE`: é a distinção que a operação faz, e
   * ela passou a ser respondida pela contagem em vez de pelo número digitado.
   */
  it("força uma vaga sem ninguém dentro e a marca FECHADA, com as 5 faltando", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: 5, candidaturas: [] });
    await service.fechar("vaga-1", { ...CORPO, forcar: true }, MASTER);
    expect(gravado(updates)).toMatchObject({
      status: "FECHADA",
      vagasFechadas: 0,
      fechamentoForcadoFaltavam: 5,
    });
  });

  /**
   * O `faltavam` É CARIMBO, NÃO CONTA VIVA. A vaga segue existindo, alguém pode ser descartado e a
   * meta pode mudar; a trilha continua contando o que aconteceu naquele dia.
   */
  it("a leitura devolve o `faltavam` GRAVADO, e não uma recontagem de hoje", async () => {
    const forcadoEm = new Date("2026-09-01T10:00:00.000Z");
    const { service } = makeDb({
      // Hoje a vaga tem 5 entregues (alguém finalizou depois do fechamento forçado), e a meta caiu.
      candidaturas: pessoas(5, "ALOCADO"),
      linhaListagem: {
        ...linhaDeVaga({
          status: "ENTREGUE",
          posicoesOficiais: 5,
          vagasFechadas: 3,
          fechamentoForcadoEm: forcadoEm,
          fechamentoForcadoFaltavam: 2,
        }),
        fechamentoForcadoPorNome: "Master da Silva",
      },
    });

    const [v] = await service.list();
    expect(v.fechamentoForcado).toEqual({
      porNome: "Master da Silva",
      quandoIso: forcadoEm.toISOString(),
      faltavam: 2,
    });
  });

  it("a trilha sobrevive ao usuário apagado: sem nome, com data e número", async () => {
    const forcadoEm = new Date("2026-09-01T10:00:00.000Z");
    const { service } = makeDb({
      linhaListagem: linhaDeVaga({
        status: "FECHADA",
        fechamentoForcadoEm: forcadoEm,
        fechamentoForcadoFaltavam: 4,
      }),
    });
    const [v] = await service.list();
    expect(v.fechamentoForcado).toEqual({
      porNome: null,
      quandoIso: forcadoEm.toISOString(),
      faltavam: 4,
    });
  });

  it("a vaga que fechou normalmente não tem trilha nenhuma", async () => {
    const { service } = makeDb({ linhaListagem: linhaDeVaga({ status: "ENTREGUE" }) });
    const [v] = await service.list();
    expect(v.fechamentoForcado).toBeNull();
  });
});

describe("fechar: a ordem, a trava 5 e o que deixou de decidir", () => {
  /**
   * A CORRIDA QUE A TRANSAÇÃO FECHA: um consultor finaliza a última posição no instante em que outro
   * fecha a vaga. Contar antes de travar é decidir sobre uma fotografia velha.
   */
  it("TRAVA a linha da vaga ANTES de ler as candidaturas", async () => {
    const { service, ordem } = makeDb({ posicoesOficiais: 1, candidaturas: pessoas(1, "ALOCADO") });
    await service.fechar("vaga-1", CORPO, COMUM);
    expect(ordem).toEqual(["trava-vaga", "le-candidaturas"]);
  });

  /**
   * A TRAVA 5 VEM PRIMEIRO, e ela não tem forçamento nem para Master: fechar deixando alguém no
   * funil é autorizar o silêncio com quem foi entrevistado. Note que a vaga do cenário TAMBÉM
   * falharia na trava 6, e ainda assim é a 5 que a pessoa lê.
   */
  it("recusa pela TRAVA 5 antes da 6, e o `forcar` do Master não passa por ela", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      candidaturas: [pessoa("ATIVO", null, "Pendente"), ...pessoas(1, "ALOCADO")],
    });

    const erro = await service.fechar("vaga-1", { ...CORPO, forcar: true }, MASTER).catch((e) => e);
    expect(recusaDe(erro)).toMatchObject({
      needsConfirmation: false,
      reason: "candidatosPendentes",
    });
    expect(updates).toHaveLength(0);
  });

  it("recusa a vaga que já foi fechada, sem contar nada", async () => {
    const { service, ordem } = makeDb({ status: "ENTREGUE", candidaturas: pessoas(5, "ALOCADO") });
    await expect(service.fechar("vaga-1", CORPO, COMUM)).rejects.toBeInstanceOf(ConflictException);
    expect(ordem).toEqual(["trava-vaga"]);
  });

  /**
   * O NÚMERO DIGITADO NÃO DECIDE E NÃO É GRAVADO. Os dois campos seguem aceitos pelo DTO só até a
   * tela parar de mandá-los (o `forbidNonWhitelisted` recusaria o corpo de hoje), e este teste é o
   * que impede que "aceito" volte a virar "gravado".
   */
  it("IGNORA `vagasFechadas` e `vagasFechadasBanco` do corpo e grava a contagem real", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 3,
      candidaturas: [...pessoas(5, "ALOCADO"), ...pessoas(2, "ALOCADO", "BANCO")],
    });

    await service.fechar("vaga-1", { ...CORPO, vagasFechadas: 1, vagasFechadasBanco: 9 }, COMUM);
    expect(gravado(updates)).toMatchObject({ vagasFechadas: 5, vagasFechadasBanco: 2 });
  });

  /**
   * META NULA NÃO TEM TETO A COBRAR: ausência de meta não é meta zero. A vaga publicada sempre tem
   * meta (a régua não deixa publicar sem ela), mas a coluna é nulável e a trava é honesta sobre isso.
   */
  it("não cobra posição de uma vaga sem meta definida", async () => {
    const { service, updates } = makeDb({ posicoesOficiais: null, candidaturas: [] });
    await service.fechar("vaga-1", CORPO, COMUM);
    expect(gravado(updates)).toMatchObject({ status: "FECHADA", vagasFechadas: 0 });
  });
});

describe("editarPosicoes: a meta não desce abaixo do que já foi entregue", () => {
  it("recusa baixar a meta oficial para 2 quando 3 posições já foram entregues", async () => {
    const { service } = makeDb({ posicoesOficiais: 5, candidaturas: pessoas(3, "ALOCADO") });
    const erro = await service
      .editarPosicoes("vaga-1", { posicoesOficiais: 2, posicoesBanco: 0 }, "user-comum")
      .catch((e) => e);

    expect(String(erro.message)).toContain("já entregou 3 posições oficiais");
    // A FRASE ANTIGA FALAVA DE UM CAMPO QUE A TELA NÃO TEM MAIS.
    expect(String(erro.message)).not.toContain("vagas fechadas");
  });

  it("recusa baixar a meta de banco abaixo do que a reserva já recebeu", async () => {
    const { service } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 4,
      candidaturas: [...pessoas(5, "ALOCADO"), ...pessoas(2, "ALOCADO", "BANCO")],
    });
    const erro = await service
      .editarPosicoes("vaga-1", { posicoesOficiais: 5, posicoesBanco: 1 }, "user-comum")
      .catch((e) => e);
    expect(String(erro.message)).toContain("já entregou 2 posições de banco");
  });

  it("deixa aumentar a meta, e deixa baixar até o que foi entregue", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      candidaturas: pessoas(3, "ALOCADO"),
    });
    await service.editarPosicoes("vaga-1", { posicoesOficiais: 3, posicoesBanco: 0 }, "user-comum");
    expect(gravado(updates)).toMatchObject({ posicoesOficiais: 3, posicoesBanco: 0 });
  });
});

/**
 * ─ O CRUZAMENTO DAS DUAS CONTAGENS NO FORÇAMENTO (lacuna que o tester provou, 08/09) ────────────
 *
 * O PONTO. O ROTULO do desfecho sai de `ocupacao.finalizadas`, que soma os DOIS lados; o GATE da
 * trava 6 sai de `ocupacao.finalizadasOficial`, que exclui a reserva. Duas contagens diferentes, na
 * mesma gravação, e é natural olhar para isso e ver um bug.
 *
 * ┌─ A DECISÃO: ESTÁ CERTO, e as duas contagens respondem a PERGUNTAS DIFERENTES ──────────────┐
 * │ O GATE pergunta "a vaga cumpriu o que PROMETEU?". A promessa é a meta OFICIAL, e reserva    │
 * │ não é entrega: vinte pessoas no banco não pagam uma posição oficial. Por isso ele exclui.   │
 * │                                                                                            │
 * │ O RÓTULO pergunta "esta vaga entregou ALGUÉM?". Três pessoas na reserva são três pessoas    │
 * │ entregues de verdade, com nome e sobrenome, e chamar isso de `FECHADA` apagaria o único     │
 * │ indicador que o vocabulário guarda de propósito para distinguir a vaga que produziu da vaga │
 * │ que morreu vazia. É decisão registrada do diretor, e não uma coincidência de implementação. │
 * │                                                                                            │
 * │ E NADA SE PERDE NA TRILHA, que é o que fecha o argumento: a MESMA gravação carimba          │
 * │ `fechamentoForcadoFaltavam`, e ele diz que as CINCO oficiais estavam abertas. O sistema não │
 * │ afirma que a vaga cumpriu a meta em lugar nenhum: ele afirma que ela entregou alguém, e     │
 * │ registra, ao lado, quanto ainda faltava. As duas frases são verdadeiras ao mesmo tempo.     │
 * │                                                                                            │
 * │ NA OPERAÇÃO OS DOIS SÃO O MESMO ESTADO: `ENTREGUE` e `FECHADA` são ambos terminais e ambos  │
 * │ estão em `STATUS_QUE_NAO_RECEBEM`, então a vaga para de receber candidato de qualquer jeito.│
 * │ A diferença é de NARRATIVA, e é por isso que ela não abre buraco operacional nenhum.        │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE BLOCO PROTEGE, então, NÃO é um conserto: é a decisão, escrita como asserção, para que
 * quem cruzar com o descasamento amanhã encontre a resposta aqui em vez de "corrigir" o rótulo e
 * apagar o indicador de sucesso da reserva.
 */
describe("fechar forçado: a vaga que entregou SÓ no banco (a decisão, pinada)", () => {
  it("5 oficiais, 0 no oficial e 3 no banco: MASTER força, sai ENTREGUE e a trilha diz que faltavam 5", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      candidaturas: pessoas(3, "ALOCADO", "BANCO"),
    });

    await service.fechar("vaga-1", { ...CORPO, forcar: true }, MASTER);
    expect(gravado(updates)).toMatchObject({
      // O RÓTULO: entregou gente, então ENTREGUE. Três pessoas na reserva são três pessoas.
      status: "ENTREGUE",
      // OS DOIS CARIMBOS SEPARADOS: zero no oficial, três no banco. Nenhum dos dois mente.
      vagasFechadas: 0,
      vagasFechadasBanco: 3,
      // A TRILHA: o gate cobrou as CINCO oficiais, e é isso que fica gravado para a auditoria.
      fechamentoForcadoPorId: "user-master",
      fechamentoForcadoFaltavam: 5,
    });
  });

  it("e o COMUM continua BARRADO nesse mesmo cenário: o banco cheio não abre o gate para ninguém", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      candidaturas: pessoas(3, "ALOCADO", "BANCO"),
    });

    const erro = await service.fechar("vaga-1", CORPO, COMUM).catch((e) => e);
    expect(recusaDe(erro)).toMatchObject({ faltam: 5, finalizadasOficial: 0, podeForcar: false });
    expect(updates).toHaveLength(0);
  });

  /**
   * O CONTRASTE QUE PROVA QUE O RÓTULO NÃO É DESCUIDO: a vaga forçada sem NINGUÉM dentro sai
   * `FECHADA`. É a entrega, dos dois lados, que separa um caso do outro.
   */
  it("sem ninguém dentro sai FECHADA, com as mesmas 5 faltando: é a entrega que separa os casos", async () => {
    const { service, updates } = makeDb({
      posicoesOficiais: 5,
      posicoesBanco: 20,
      candidaturas: [],
    });
    await service.fechar("vaga-1", { ...CORPO, forcar: true }, MASTER);
    expect(gravado(updates)).toMatchObject({
      status: "FECHADA",
      vagasFechadasBanco: 0,
      fechamentoForcadoFaltavam: 5,
    });
  });
});
