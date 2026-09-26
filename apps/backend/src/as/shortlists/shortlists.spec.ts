import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SHORTLIST_MINIMO_SUGERIDO, shortlistCurta } from "@ea/shared-types";
import {
  MOTIVO_DE_REENVIO_FORA_DO_CATALOGO,
  MOTIVO_DE_REENVIO_INATIVO,
  MOTIVO_DE_REENVIO_VALIDO,
  NOME_DO_MOTIVO_DE_REENVIO_VALIDO,
} from "../motivos-reenvio-shortlist/motivos-reenvio-shortlist.fake";
import { bancoDaShortlist, candidaturaDaShortlist } from "./shortlists.tester-fake";

/**
 * ─ A SHORTLIST: CONJUNTO, ENVIO, REENVIO E O AVISO QUE NÃO BLOQUEIA (Frente E, 10 e 11) ─────────
 *
 * ┌─ O QUE MUDOU, E POR QUE UM TESTE SOBRE ISSO É NECESSÁRIO ────────────────────────────────────┐
 * │ ANTES existia UM campo `date` digitado à mão (`vagas.envio_shortlist`), que dizia "alguma     │
 * │ coisa foi enviada em tal dia" e mais nada. Não havia conjunto, não havia contagem, não havia  │
 * │ reenvio e não havia como saber se a data correspondia a algum fato. Este arquivo mede o fato. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS CINCO PROPRIEDADES ──────────────────────────────────────────────────────────────────────┐
 * │ 1. O `numero` é do SERVIDOR (`max + 1`, sob a linha da vaga travada), nunca do corpo. É ele  │
 * │    que distingue a primeira lista do reenvio em toda a régua.                                 │
 * │ 2. O REENVIO exige MOTIVO, e o PRIMEIRO envio o recusa. Os dois lados, e no banco também.     │
 * │ 3. O AVISO DOS TRÊS **AVISA E NÃO IMPEDE** (decisão do diretor): 409 com o NÚMERO na primeira │
 * │    tentativa, e passa com a ciência, que fica GRAVADA (§A.3 regra 8).                          │
 * │ 4. SÓ ENTRA QUEM É DA VAGA E ESTÁ VIVO. Mandar ao cliente quem já saiu é apresentar alguém    │
 * │    que não está mais no processo.                                                              │
 * │ 5. `vagas.envio_shortlist` VIRA CONSEQUÊNCIA do envio, e é escrito na MESMA transação.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids, datas e frases de processo. A recusa de candidato inelegível é por CONTAGEM e nunca
 * nominal, e há um caso medindo isso: mensagem de erro com nome de candidato viaja para toast, para
 * a área de transferência de quem copia o erro e para log de cliente.
 */

const AUTOR = "user-1";
const DIA = "2026-10-05";
const OUTRO_DIA = "2026-10-12";

/** Três candidaturas vivas: o tamanho que NÃO dispara o aviso, e por isso o cenário base. */
function tresVivos() {
  return [
    candidaturaDaShortlist({ id: "k1", candidatoId: "p1", nome: "Ana Inventada" }),
    candidaturaDaShortlist({ id: "k2", candidatoId: "p2", nome: "Bruno Inventado" }),
    candidaturaDaShortlist({ id: "k3", candidatoId: "p3", nome: "Carla Inventada" }),
  ];
}

describe("1. o envio cria o CONJUNTO, e o número vem do servidor", () => {
  it("a primeira shortlist nasce com numero 1, sem motivo, com os candidatos dentro", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const enviada = await b.service.enviar(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA },
      AUTOR,
    );

    expect(enviada.numero).toBe(1);
    expect(enviada.enviadaEm).toBe(DIA);
    expect(enviada.motivoReenvioId).toBeNull();
    expect(enviada.motivoReenvioNome).toBeNull();
    expect(enviada.itens.map((i) => i.candidaturaId).sort()).toEqual(["k1", "k2", "k3"]);
  });

  /**
   * OS ITENS CARREGAM O ESTADO DE HOJE, e não o do envio. É a pergunta que a tela faz ("dos que
   * mandei, onde cada um foi parar?"), e congelar a etapa no envio responderia "todos estavam na
   * Triagem", que é verdade e não serve para nada.
   */
  it("cada item traz o nome, a etapa ATUAL e a situação ATUAL", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const enviada = await b.service.enviar(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA },
      AUTOR,
    );

    expect(enviada.itens[0]).toMatchObject({
      candidatoNome: "Ana Inventada",
      etapaAtual: "TRIAGEM",
      situacaoAtual: "ATIVO",
    });
  });

  /**
   * O NÚMERO É `max + 1` LIDO DO BANCO, e não um contador do corpo: o segundo envio de uma vaga que
   * já tem uma lista é o REENVIO 2, mesmo que a tela ache outra coisa.
   */
  it("o segundo envio vira reenvio numero 2, contado a partir do que a vaga já tem", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const enviada = await b.service.enviar(
      "vaga-1",
      {
        candidaturaIds: ["k1", "k2"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
        // A CIÊNCIA ENTROU PORQUE O REQUISITO MUDOU: desde a decisão do diretor, TODO envio com
        // menos de três avisa, e este caso mede o NÚMERO do reenvio, não o aviso.
        cienteShortlistCurta: true,
      },
      AUTOR,
    );

    expect(enviada.numero).toBe(2);
    // O ID FICA GRAVADO, E O NOME VEM RESOLVIDO PELO JOIN: é o contrato que a tela consome.
    expect(enviada.motivoReenvioId).toBe(MOTIVO_DE_REENVIO_VALIDO);
    expect(enviada.motivoReenvioNome).toBe(NOME_DO_MOTIVO_DE_REENVIO_VALIDO);
  });
});

describe("2. o REENVIO exige motivo, e o PRIMEIRO envio o recusa", () => {
  it("recusa o reenvio sem motivo, e não grava nada", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1"], enviadaEm: OUTRO_DIA }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro as BadRequestException).message)).toMatch(/motivo do reenvio/i);
    expect(b.shortlists).toHaveLength(1);
  });

  /**
   * E O PRIMEIRO ENVIO RECUSA O MOTIVO EM VEZ DE IGNORÁ-LO. Silenciar o campo faria a tela mostrar
   * um texto salvo que o banco não guardou, que é a forma mais barata de a operação deixar de
   * confiar no sistema.
   */
  it("recusa motivo de reenvio na PRIMEIRA shortlist, em vez de descartá-lo em silêncio", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const erro = await b.service
      .enviar(
        "vaga-1",
        { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA, motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO },
        AUTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists).toHaveLength(0);
  });
});

describe("3. o aviso da shortlist curta AVISA e NÃO IMPEDE (decisão do diretor)", () => {
  it("recusa a PRIMEIRA vez com 409, com o número de candidatos e o mínimo dentro", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const erro = await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1", "k2"], enviadaEm: DIA }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    const corpo = (erro as ConflictException).getResponse() as Record<string, unknown>;
    expect(corpo).toMatchObject({
      needsConfirmation: true,
      quantidade: 2,
      minimoSugerido: SHORTLIST_MINIMO_SUGERIDO,
    });
    expect(b.shortlists).toHaveLength(0);
  });

  /** COM A CIÊNCIA, PASSA: é aviso, não trava. E a confirmação fica GRAVADA (§A.3 regra 8). */
  it("passa com a ciência, e registra que a guarda foi atravessada", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const enviada = await b.service.enviar(
      "vaga-1",
      { candidaturaIds: ["k1", "k2"], enviadaEm: DIA, cienteShortlistCurta: true },
      AUTOR,
    );

    expect(enviada.numero).toBe(1);
    expect(enviada.itens).toHaveLength(2);
    expect(enviada.avisoCurtaAceito).toBe(true);
  });

  /**
   * A CIÊNCIA SÓ MARCA QUANDO A GUARDA FOI DE FATO ATRAVESSADA. Gravar o flag do corpo cru marcaria
   * como "aceitou o aviso" quem mandou seis candidatos com o flag ligado por engano da tela, e o
   * log de aceite passaria a contar confirmações que nunca foram feitas.
   */
  it("o flag enviado à toa numa lista completa NÃO vira aceite registrado", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const enviada = await b.service.enviar(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA, cienteShortlistCurta: true },
      AUTOR,
    );

    expect(enviada.avisoCurtaAceito).toBe(false);
  });

  /**
   * ─ ESTE CASO FOI REESCRITO PORQUE O **REQUISITO** MUDOU, e não porque o teste incomodava ─────
   *
   * ELE AFIRMAVA O CONTRÁRIO ("o REENVIO curto passa direto, sem aviso nenhum"), e afirmava certo
   * para a régua de então: `shortlistCurta` exigia `numero === 1`. O diretor decidiu que TODO envio
   * é medido, e a razão dele é a operação: DEPOIS DE TRANSFERÊNCIA E DESCARTE, REENVIO CURTO É O
   * CASO NORMAL, e justamente a lista que encolheu porque a vaga perdeu gente era a que passava
   * calada.
   *
   * A COBERTURA INDEPENDENTE JÁ TINHA APONTADO ISSO em `shortlists.transferencia-cruzada`, com o
   * nome do caso dizendo que o comportamento era "escolha do autor, não do requisito". Era, e o
   * requisito acabou de escolher o outro lado.
   */
  it("o REENVIO curto TAMBÉM avisa, com 409 e o número dentro", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await b.service
      .enviar(
        "vaga-1",
        { candidaturaIds: ["k1"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO },
        AUTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    const corpo = (erro as ConflictException).getResponse() as Record<string, unknown>;
    expect(corpo).toMatchObject({ needsConfirmation: true, quantidade: 1 });
    expect(b.shortlists).toHaveLength(1);
  });

  /**
   * A FRASE PRECISA ESTAR CERTA NOS DOIS CASOS, e é por isso que ela é medida. Dizer "esta primeira
   * shortlist" num REENVIO é o sistema afirmando um fato falso na única tela em que o consultor
   * para para pensar, e a pergunta que ele responderia seria sobre outra coisa.
   */
  it("a mensagem do aviso fala de PRIMEIRA no primeiro envio e de REENVIO no reenvio", async () => {
    const primeira = bancoDaShortlist({ candidaturas: tresVivos() });
    const doPrimeiro = await primeira.service
      .enviar("vaga-1", { candidaturaIds: ["k1"], enviadaEm: DIA }, AUTOR)
      .catch((e: unknown) => e);

    const reenvio = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });
    const doReenvio = await reenvio.service
      .enviar(
        "vaga-1",
        { candidaturaIds: ["k1"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO },
        AUTOR,
      )
      .catch((e: unknown) => e);

    const frase = (e: unknown) =>
      String(((e as ConflictException).getResponse() as Record<string, unknown>).mensagem);

    expect(frase(doPrimeiro)).toMatch(/primeira shortlist/i);
    expect(frase(doPrimeiro)).not.toMatch(/reenvio/i);
    expect(frase(doReenvio)).toMatch(/reenvio/i);
    expect(frase(doReenvio)).not.toMatch(/primeira/i);
    // O NÚMERO DO ENVIO ENTRA NA FRASE: avisar no envio 2 e no envio 5 são conversas diferentes.
    expect(frase(doReenvio)).toContain("2");
  });

  /** COM A CIÊNCIA, O REENVIO CURTO PASSA e o aceite fica GRAVADO, como no primeiro envio. */
  it("o reenvio curto passa com a ciência, e registra o aceite", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const enviada = await b.service.enviar(
      "vaga-1",
      {
        candidaturaIds: ["k1"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
        cienteShortlistCurta: true,
      },
      AUTOR,
    );

    expect(enviada.numero).toBe(2);
    expect(enviada.itens).toHaveLength(1);
    expect(enviada.avisoCurtaAceito).toBe(true);
  });

  /** O REENVIO COMPLETO NÃO AVISA: o que dispara é a quantidade, e nunca o fato de ser reenvio. */
  it("o reenvio com três candidatos passa direto, sem aviso", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const enviada = await b.service.enviar(
      "vaga-1",
      {
        candidaturaIds: ["k1", "k2", "k3"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
      },
      AUTOR,
    );

    expect(enviada.numero).toBe(2);
    expect(enviada.avisoCurtaAceito).toBe(false);
  });

  /** A RÉGUA É A DO VOCABULÁRIO COMPARTILHADO, e a tela lê a MESMA. Duas cópias divergem. */
  it("a régua do aviso é a função compartilhada, e ela olha SÓ a quantidade", () => {
    expect(shortlistCurta(1, 2)).toBe(true);
    expect(shortlistCurta(1, SHORTLIST_MINIMO_SUGERIDO)).toBe(false);
    // ERA `false` ATÉ A DECISÃO DO DIRETOR, e é a linha que prova que a régua mudou em UM lugar só.
    expect(shortlistCurta(2, 1)).toBe(true);
    expect(shortlistCurta(2, SHORTLIST_MINIMO_SUGERIDO)).toBe(false);
  });
});

/**
 * ─ O MOTIVO DO REENVIO VIROU CATÁLOGO (decisão 6 do diretor) ───────────────────────────────────
 *
 * ERA TEXTO LIVRE DE 500 CARACTERES, e as duas razões da troca estão medidas no molde da 0129: o
 * mesmo fato escrito de cinco jeitos (e a pergunta agregada virando `like` sobre prosa) e, aqui,
 * um resíduo de §A.6 que não tinha conserto barato, porque a varredura de retenção é chaveada por
 * candidato e a shortlist pendura na VAGA.
 */
describe("9. o motivo do reenvio vem do CATÁLOGO, e a FK sozinha não basta", () => {
  it("recusa um id que não está no catálogo", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await b.service
      .enviar(
        "vaga-1",
        {
          candidaturaIds: ["k1", "k2", "k3"],
          enviadaEm: OUTRO_DIA,
          motivoReenvioId: MOTIVO_DE_REENVIO_FORA_DO_CATALOGO,
        },
        AUTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists).toHaveLength(1);
  });

  /**
   * ESTE É O CASO QUE A **FK NÃO PEGA**, e é ele que justifica a camada de service existir: a chave
   * estrangeira aceita qualquer linha EXISTENTE, inclusive a que o diretor tirou de circulação pela
   * tela. Quem recusa o motivo inativo é a conferência contra a lista ATIVA, que é a MESMA consulta
   * que enche o seletor.
   */
  it("recusa um motivo que existe mas está INATIVO", async () => {
    const b = bancoDaShortlist({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await b.service
      .enviar(
        "vaga-1",
        {
          candidaturaIds: ["k1", "k2", "k3"],
          enviadaEm: OUTRO_DIA,
          motivoReenvioId: MOTIVO_DE_REENVIO_INATIVO,
        },
        AUTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists).toHaveLength(1);
  });

  /** A LEITURA DEVOLVE O PAR: o id (que é o dado) e o nome resolvido (que é o que a tela mostra). */
  it("a leitura devolve o id e o nome do motivo, e os dois nulos no primeiro envio", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    await b.service.enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR);
    await b.service.enviar(
      "vaga-1",
      {
        candidaturaIds: ["k1", "k2", "k3"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
      },
      AUTOR,
    );

    const todas = await b.service.listar("vaga-1");
    expect(todas[0]).toMatchObject({ motivoReenvioId: null, motivoReenvioNome: null });
    expect(todas[1]).toMatchObject({
      motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
      motivoReenvioNome: NOME_DO_MOTIVO_DE_REENVIO_VALIDO,
    });
  });
});

describe("4. só entra na lista quem é DA VAGA e está VIVO", () => {
  it("recusa a lista que inclui quem já saiu do processo", async () => {
    const b = bancoDaShortlist({
      candidaturas: [
        ...tresVivos(),
        candidaturaDaShortlist({ id: "k4", candidatoId: "p4", nome: "Dino Inventado", situacao: "DESCARTADO" }),
      ],
    });

    const erro = await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3", "k4"], enviadaEm: DIA }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists).toHaveLength(0);
  });

  /**
   * §A.6: A RECUSA É POR CONTAGEM E NUNCA NOMINAL. Dizer QUEM foi recusado devolveria nome de
   * candidato numa mensagem que a tela copia para toast e para log de cliente.
   */
  it("a recusa não cita o NOME de ninguém", async () => {
    const b = bancoDaShortlist({
      candidaturas: [
        ...tresVivos(),
        candidaturaDaShortlist({ id: "k4", candidatoId: "p4", nome: "Dino Inventado", situacao: "DESISTIU" }),
      ],
    });

    const erro = await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1", "k4"], enviadaEm: DIA, cienteShortlistCurta: true }, AUTOR)
      .catch((e: unknown) => e);

    expect(JSON.stringify(erro)).not.toContain("Dino");
    expect(String((erro as BadRequestException).message)).toMatch(/\d+ de \d+/);
  });

  /**
   * O ID REPETIDO NO CORPO NÃO INFLA A CONTAGEM. Sem a desduplicação, uma lista de DOIS passaria
   * como lista de três e o aviso dos menos de três nunca dispararia para ela.
   */
  it("id repetido no corpo não vira dois itens nem engana o aviso dos três", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    const erro = await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1", "k1", "k2"], enviadaEm: DIA }, AUTOR)
      .catch((e: unknown) => e);

    const corpo = (erro as ConflictException).getResponse() as Record<string, unknown>;
    expect(corpo.quantidade).toBe(2);
  });
});

describe("5. a vaga precisa estar EM PROCESSO, e é essa guarda que separa os dois escritores", () => {
  /**
   * ─ A PROVA DA DISJUNÇÃO (§A.40: "quem mais escreve este dado?") ────────────────────────────
   *
   * `vagas.envio_shortlist` tem DOIS escritores: a trilha de abertura (`camposDaTrilha`) e este
   * envio. Eles não colidem porque a trilha só grava em vaga de papel RASCUNHO/REVISAO, e o envio
   * só é aceito em ABERTURA/ENTREGA. Este caso é a metade que o código desta frente controla.
   */
  it("recusa shortlist de vaga em RASCUNHO, que é onde a trilha de abertura escreve", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos(), vagaStatus: "RASCUNHO" });

    const erro = await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(b.shortlists).toHaveLength(0);
    expect(b.vaga.envioShortlist).toBeNull();
  });

  it("recusa shortlist de vaga FECHADA e de vaga CANCELADA: o processo acabou", async () => {
    for (const status of ["FECHADA", "CANCELADA"]) {
      const b = bancoDaShortlist({ candidaturas: tresVivos(), vagaStatus: status });

      const erro = await b.service
        .enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR)
        .catch((e: unknown) => e);

      expect(erro, status).toBeInstanceOf(ConflictException);
      expect(b.shortlists, status).toHaveLength(0);
    }
  });

  it("aceita na vaga ENTREGUE, que continua viva desde a Frente B", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos(), vagaStatus: "ENTREGUE" });

    const enviada = await b.service.enviar(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA },
      AUTOR,
    );

    expect(enviada.numero).toBe(1);
  });
});

describe("6. o campo antigo vira CONSEQUÊNCIA do envio", () => {
  it("o envio carimba `vagas.envio_shortlist` com a data enviada", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    await b.service.enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR);

    expect(b.vaga.envioShortlist).toBe(DIA);
  });

  /**
   * O REENVIO ATUALIZA O CARIMBO. A pergunta que a coluna responde na tela é "quando a shortlist
   * foi ao cliente", e depois de um reenvio a resposta certa é a do reenvio. O histórico completo
   * (inclusive a data do PRIMEIRO envio) continua em `as_shortlists`, que é a fonte.
   */
  it("o reenvio atualiza o carimbo para a data mais recente, e o histórico guarda as duas", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    await b.service.enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR);
    await b.service.enviar(
      "vaga-1",
      {
        candidaturaIds: ["k1"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
        // Ver a nota do caso 1: o reenvio curto passou a avisar, e aqui o que se mede é o CARIMBO.
        cienteShortlistCurta: true,
      },
      AUTOR,
    );

    expect(b.vaga.envioShortlist).toBe(OUTRO_DIA);
    const todas = await b.service.listar("vaga-1");
    expect(todas.map((s) => s.enviadaEm)).toEqual([DIA, OUTRO_DIA]);
  });

  /** RECUSA NÃO CARIMBA: o campo não pode dizer que houve envio quando o envio foi recusado. */
  it("a recusa do aviso não carimba a data na vaga", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    await b.service
      .enviar("vaga-1", { candidaturaIds: ["k1"], enviadaEm: DIA }, AUTOR)
      .catch(() => null);

    expect(b.vaga.envioShortlist).toBeNull();
  });
});

describe("7. a vaga inexistente é 404, e não um envio órfão", () => {
  /**
   * A RECUSA NASCE SOB A TRAVA: o `SELECT ... FOR UPDATE` volta vazio e o service lança. Modelar
   * pelo retorno vazio, e não por um erro do dublê, é o que prova que a guarda está no SERVICE.
   */
  it("recusa com 404 quando a vaga não existe", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos(), semVaga: true });

    const erro = await b.service
      .enviar("vaga-9", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(NotFoundException);
    expect(b.shortlists).toHaveLength(0);
  });
});

describe("8. a leitura devolve as listas na ordem do envio", () => {
  it("lista as shortlists da vaga, da primeira para a última", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    await b.service.enviar("vaga-1", { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA }, AUTOR);
    await b.service.enviar(
      "vaga-1",
      {
        candidaturaIds: ["k2", "k3"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_DE_REENVIO_VALIDO,
        // Ver a nota do caso 1: aqui o que se mede é a ORDEM da leitura.
        cienteShortlistCurta: true,
      },
      AUTOR,
    );

    const todas = await b.service.listar("vaga-1");
    expect(todas.map((s) => s.numero)).toEqual([1, 2]);
    expect(todas[1]!.itens.map((i) => i.candidaturaId).sort()).toEqual(["k2", "k3"]);
  });

  it("vaga sem shortlist devolve lista vazia, e não erro", async () => {
    const b = bancoDaShortlist({ candidaturas: tresVivos() });

    expect(await b.service.listar("vaga-1")).toEqual([]);
  });
});
