import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { asCandidaturaEtapas, asCandidaturas, asVagaStatusEventos } from "../../db/schema";
import { tipoDoEvento } from "../../domain/candidatura-historico";
import { bancoDaReprovacao, linhaDaReprovacao } from "./reprovacao-cliente.tester-fake";

/**
 * ─ REPROVADO PELO CLIENTE: A PESSOA VOLTA PARA A ETAPA INICIAL (Frente E, ponto 12) ─────────────
 *
 * ┌─ AS CINCO PROPRIEDADES, E NENHUMA DELAS É ÓBVIA ────────────────────────────────────────────┐
 * │ 1. O DESTINO VEM DO CATÁLOGO (a etapa marcada `inicial`), e NUNCA de um literal. Um          │
 * │    `"CAPTACAO"` no service criaria um segundo dono da pergunta "onde é o começo do funil",   │
 * │    capaz de divergir do primeiro no dia em que o diretor marcar outra etapa.                 │
 * │ 2. É MOVIMENTO, E NÃO DESFECHO. A pessoa continua VIVA: a situação não muda, o               │
 * │    `motivo_descarte` não é escrito e o evento entra com `situacao` NULA. Quebrar isto         │
 * │    transformaria uma recusa do cliente numa saída da base.                                    │
 * │ 3. O MARCADOR É GRAVADO (`reprovado_pelo_cliente`), porque sem ele a pergunta "quantos o     │
 * │    cliente reprovou" dependeria do TEXTO livre ao lado, que a varredura de retenção NULA.    │
 * │ 4. O STATUS DA VAGA ACOMPANHA. Tirar da entrega o ÚLTIMO candidato devolve a vaga para       │
 * │    ABERTA. É o efeito mais caro de esquecer (§A.27), e é invisível em teste de unidade que   │
 * │    não modele a vaga.                                                                         │
 * │ 5. SÓ REPROVA O CLIENTE QUEM ESTAVA COM O CLIENTE, pela marca `entrega_ao_cliente` do        │
 * │    catálogo (Frente B). Sem a guarda, o indicador passaria a contar reprovação que nenhum    │
 * │    cliente fez.                                                                               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todo o arquivo fala de ids técnicos, etapas e um motivo de PROCESSO. Nenhum CPF, nenhum
 * nome de candidato, nenhuma URL.
 */

const AUTOR = "user-1";

describe("1. o destino é a etapa INICIAL do catálogo, e a pessoa continua viva", () => {
  it("move a candidatura para a etapa marcada `inicial`, e não para um código escrito no service", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);

    // `CAPTACAO` é a INICIAL do catálogo fingido, e é por isso que ela é o destino. O teste mede a
    // etapa gravada, que é o que a tela lê.
    expect(b.updateDaCandidatura()).toMatchObject({ etapa: "CAPTACAO" });
    expect(b.linhas[0]!.etapa).toBe("CAPTACAO");
  });

  /**
   * A PROVA DE QUE O DESTINO NÃO É UM LITERAL: com um catálogo em que a inicial é OUTRA etapa, o
   * gesto tem de seguir a inicial. Um `"CAPTACAO"` no service passaria no caso acima e cairia aqui.
   */
  it("segue o catálogo quando a etapa inicial é outra", async () => {
    // Sem `CAPTACAO` no catálogo, o dublê elege a PRIMEIRA linha como inicial, que passa a ser a
    // Triagem. O destino tem de acompanhar.
    const b = bancoDaReprovacao({
      candidaturas: [linhaDaReprovacao()],
      etapas: ["TRIAGEM", "ENTREVISTA_SOULAN", "ENTREVISTA_CLIENTE", "APROVACAO"],
    });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);

    expect(b.updateDaCandidatura()).toMatchObject({ etapa: "TRIAGEM" });
  });

  /**
   * ─ A SITUAÇÃO NÃO É TOCADA, E ESTE É O CASO QUE SEPARA MOVIMENTO DE DESFECHO ────────────────
   *
   * Consequência que não é óbvia e que decide: quem consome POSIÇÃO da vaga é a SITUAÇÃO
   * (`consomePosicao`). Escrever situação aqui mexeria na ocupação da vaga por causa de uma
   * recusa do cliente, que é efeito que ninguém pediu.
   */
  it("NÃO muda a situação e NÃO escreve motivo de descarte", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.reprovarPeloCliente("cand-1", { motivo: "cliente achou o perfil sênior demais" }, AUTOR);

    const gravado = b.updateDaCandidatura()!;
    expect(gravado).not.toHaveProperty("situacao");
    expect(gravado).not.toHaveProperty("motivoDescarte");
    expect(b.linhas[0]!.situacao).toBe("ATIVO");
  });
});

describe("2. o evento de histórico é MOVIMENTO, com o marcador da reprovação", () => {
  it("grava de onde veio, para onde foi, o motivo e o marcador", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.reprovarPeloCliente("cand-1", { motivo: "cliente recusou" }, AUTOR);

    expect(b.eventoDeEtapa()).toMatchObject({
      candidaturaId: "cand-1",
      etapaDe: "ENTREVISTA_CLIENTE",
      etapaPara: "CAPTACAO",
      situacao: null,
      motivo: "cliente recusou",
      reprovadoPeloCliente: true,
      porId: AUTOR,
    });
  });

  /**
   * O TIPO CONTINUA SENDO `MOVIMENTO`, e é a função do domínio que o afirma, não uma leitura à mão:
   * inflar `AsTipoEventoEtapa` com um quinto valor obrigaria toda tela que trata os quatro a ganhar
   * um ramo novo para dizer a mesma coisa.
   */
  it("o tipo derivado do evento continua MOVIMENTO", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);
    const evento = b.eventoDeEtapa()!;

    expect(
      tipoDoEvento({
        etapaDe: evento.etapaDe as string,
        etapaPara: evento.etapaPara as string,
        situacao: evento.situacao as null,
        vagaPara: null,
      }),
    ).toBe("MOVIMENTO");
  });

  /** SEM MOTIVO É CASO NORMAL (o corpo é opcional), e o campo vai NULO, nunca string vazia. */
  it("sem motivo, grava nulo em vez de texto em branco", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.reprovarPeloCliente("cand-1", { motivo: "   " }, AUTOR);

    expect(b.eventoDeEtapa()).toMatchObject({ motivo: null, reprovadoPeloCliente: true });
  });

  /**
   * O MARCADOR É EXCLUSIVO DESTE GESTO: o `moverEtapa` comum, MESMO indo da Entrevista Cliente
   * para a Captação (o mesmo caminho, à mão), NÃO o grava. Sem este caso, o indicador contaria
   * como reprovação de cliente todo recuo que o time faz por decisão própria.
   */
  it("o `moverEtapa` comum, pelo MESMO caminho, não grava o marcador", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.moverEtapa("cand-1", { etapa: "CAPTACAO" }, AUTOR);

    const evento = b.eventoDeEtapa()!;
    expect(evento.etapaPara).toBe("CAPTACAO");
    expect(evento.reprovadoPeloCliente ?? false).toBe(false);
  });
});

describe("3. o status da vaga acompanha (§A.27, o efeito mais caro de esquecer)", () => {
  /**
   * TIRAR O ÚLTIMO QUE ESTAVA COM O CLIENTE DEVOLVE A VAGA PARA ABERTA. A derivação roda DENTRO da
   * mesma transação, e é ela que grava o status e a trilha da vaga.
   */
  it("a vaga volta de ENTREGUE para ABERTA quando sai o último candidato da entrega", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()], vagaStatus: "ENTREGUE" });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);

    expect(b.vaga.status).toBe("ABERTA");
    expect(b.eventoDaVaga()).toMatchObject({ de: "ENTREGUE", para: "ABERTA", porId: AUTOR });
  });

  /**
   * E NÃO VOLTA QUANDO AINDA HÁ GENTE COM O CLIENTE. É a pergunta de PRESENÇA que a derivação faz,
   * e é o caso que separa "a derivação roda" de "a derivação está certa": um service que gravasse
   * ABERTA sem contar passaria no caso acima e cairia aqui.
   */
  it("a vaga CONTINUA entregue quando sobra alguém na etapa de entrega", async () => {
    const b = bancoDaReprovacao({
      candidaturas: [linhaDaReprovacao(), linhaDaReprovacao({ id: "cand-2", candidatoId: "pessoa-2" })],
      vagaStatus: "ENTREGUE",
    });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);

    expect(b.vaga.status).toBe("ENTREGUE");
    expect(b.eventoDaVaga()).toBeNull();
  });

  /**
   * O STATUS POSTO À MÃO É PEGAJOSO (Frente B): a derivação não encosta nele. O gesto continua
   * acontecendo (a pessoa volta para a inicial), e é só a VAGA que fica onde o time a pôs.
   */
  it("não mexe na vaga cujo status foi posto à mão", async () => {
    const b = bancoDaReprovacao({
      candidaturas: [linhaDaReprovacao()],
      vagaStatus: "ENTREGUE",
      statusManualEm: new Date("2026-09-01T12:00:00.000Z"),
    });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);

    expect(b.vaga.status).toBe("ENTREGUE");
    expect(b.updateDaCandidatura()).toMatchObject({ etapa: "CAPTACAO" });
  });
});

describe("4. as guardas, e cada recusa grava NADA", () => {
  it("recusa quem NÃO está em etapa de entrega ao cliente, com frase que diz o que fazer", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao({ etapa: "TRIAGEM" })] });

    const erro = await b.service
      .reprovarPeloCliente("cand-1", {}, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro as BadRequestException).message)).toMatch(/entrega ao cliente/i);
    expect(b.updates).toHaveLength(0);
    expect(b.inserts).toHaveLength(0);
  });

  it("recusa candidatura já encerrada, e não a ressuscita", async () => {
    const b = bancoDaReprovacao({
      candidaturas: [linhaDaReprovacao({ situacao: "DESCARTADO" })],
    });

    const erro = await b.service
      .reprovarPeloCliente("cand-1", {}, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(b.updates).toHaveLength(0);
    expect(b.inserts).toHaveLength(0);
  });

  it("recusa candidatura inexistente com 404", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    const erro = await b.service
      .reprovarPeloCliente("cand-desconhecida", {}, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(NotFoundException);
  });

  /**
   * ─ O CATÁLOGO EM QUE A INICIAL É A PRÓPRIA ETAPA DE ENTREGA ────────────────────────────────
   *
   * NÃO É HIPÓTESE ABSURDA: o catálogo é do diretor, e nada no banco impede que a MESMA linha
   * esteja marcada `inicial` e `entrega_ao_cliente`. Sem a recusa, o gesto gravaria um movimento
   * de A para A, que é evento que não conta nada e que o `moverEtapa` já recusa.
   */
  it("recusa quando a etapa inicial é a própria etapa de entrega (movimento de A para A)", async () => {
    const b = bancoDaReprovacao({
      candidaturas: [linhaDaReprovacao()],
      etapas: ["ENTREVISTA_CLIENTE", "APROVACAO"],
    });

    const erro = await b.service
      .reprovarPeloCliente("cand-1", {}, AUTOR)
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.updates).toHaveLength(0);
  });
});

describe("5. a gravação é UMA transação: o movimento e o evento nunca se separam", () => {
  it("grava a candidatura e o evento, e nada além do que este gesto precisa", async () => {
    const b = bancoDaReprovacao({ candidaturas: [linhaDaReprovacao()] });

    await b.service.reprovarPeloCliente("cand-1", {}, AUTOR);

    // A candidatura, a vaga (pela derivação), o evento de etapa e o evento da vaga. Nenhuma
    // escrita em tabela que este gesto não tem por que tocar.
    const tabelasEscritas = new Set([
      ...b.updates.map((u) => u.tabela),
      ...b.inserts.map((i) => i.tabela),
    ]);
    expect(tabelasEscritas.has(asCandidaturas)).toBe(true);
    expect(tabelasEscritas.has(asCandidaturaEtapas)).toBe(true);
    expect(tabelasEscritas.has(asVagaStatusEventos)).toBe(true);
    expect(tabelasEscritas.size).toBe(4);
  });
});
