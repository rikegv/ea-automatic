import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EtapasFunilService } from "../etapas/etapas-funil.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { bancoFingido, etapasSemente, type LinhaEtapa } from "../etapas/etapas-funil.fake-db";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";
import {
  CODIGO_ABERTURA,
  CODIGO_ENTREGA,
  CODIGO_FECHAMENTO,
  COMUM,
  MASTER,
  T0,
  VAGA,
  bancoDoReabrir,
  escritasEm,
  pessoa,
  portaDe,
  type BancoDoReabrir,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE DA REABERTURA DA VAGA ENTREGUE (§A.38, quem testa não escreveu) ───────
 *
 * ESTE ARQUIVO NÃO DUPLICA `vagas.reabrir-de-entregue.spec.ts`. Ele cobre o que sobrou de fora, e a
 * lista foi montada perguntando "o que só quebra em produção, e em que hora do dia".
 *
 * ┌─ O ACHADO QUE ORIGINOU O ARQUIVO: A REGRA J DO CONTRATO PASSOU A SER UMA AFIRMAÇÃO FALSA ────┐
 * │ `reabrir-vaga.tester-fake.ts`, bloco J, diz: "a vaga no papel ENTREGA foi reaberta por este    │
 * │ caminho" é violação. ISSO DEIXOU DE SER VERDADE: desde a 0138 a ENTREGA reabre, por decisão do │
 * │ diretor, e o que ela exige é PRAZO NOVO. A regra continua VERDE por um motivo lateral: a sonda │
 * │ dela manda `{ candidaturaIds }` e NENHUM `dataLimite`, então a produção recusa por FALTA DE    │
 * │ PRAZO, com zero escritas, e o contrato lê a recusa como se fosse a recusa do PAPEL.            │
 * │                                                                                               │
 * │ MEDIDO, não deduzido: a MESMA sonda com `{ dataLimite }` reabre a vaga (status final ABERTA,   │
 * │ 6 escritas). Os dois testes do primeiro `describe` abaixo são esse experimento congelado, e é  │
 * │ o par deles que substitui o que a regra J dizia: o que NÃO PODE é a entrega ser reaberta       │
 * │ APAGANDO os carimbos de quem foi entregue de verdade, e é ISSO que passa a ser afirmado.       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: as fixtures carregam CPF e contato porque o fake os carrega; nada aqui os asserta, e as
 * asserções de trilha conferem justamente que nome de pessoa NÃO aparece na narrativa. §A.11: sem
 * travessão.
 */

const PRAZO_ANTIGO = "2026-09-20";
const PRAZO_NOVO = "2026-11-30";

const servico = (banco: BancoDoReabrir, etapas: unknown = catalogoDeEtapasFingido()) =>
  new VagasService(banco.db as never, etapas as never, catalogoDeStatusFingido() as never);

const porta = (banco: BancoDoReabrir, etapas?: unknown) => portaDe(servico(banco, etapas));

/**
 * A VAGA ENTREGUE, COM OS CARIMBOS DA ENTREGA PREENCHIDOS.
 *
 * `vagasFechadas`, `vagasFechadasBanco` e `dataFechamento` vêm do molde do fake (2, 1 e 2026-09-10)
 * e são o núcleo do arquivo: eles são o registro de quem foi contratado de verdade, e o caminho do
 * CANCELAMENTO os limpa de propósito. A ENTREGA não pode.
 */
function vagaEntregue(pessoas = [pessoa("Ana", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" })]) {
  const banco = bancoDoReabrir({ status: CODIGO_ENTREGA, encerradaEm: null, pessoas });
  banco.vaga.dataLimite = PRAZO_ANTIGO;
  return banco;
}

const updatesDaVaga = (banco: BancoDoReabrir) =>
  escritasEm(banco, "vagas").filter((e) => e.tipo === "update");

const erroDe = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. O QUE A REGRA J QUERIA DIZER, DITO DE NOVO, DO JEITO QUE HOJE É VERDADE
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a ENTREGA reabre, e o que ela NÃO pode é apagar o carimbo da entrega", () => {
  it("a sonda da regra J, com prazo, REABRE: a regra passa por falta de prazo, não por papel", async () => {
    const banco = vagaEntregue();

    /*
     * ESTE TESTE EXISTE PARA CONGELAR O ACHADO. Ele é a sonda da regra J (`{ candidaturaIds }` para
     * uma vaga no papel ENTREGA) com a ÚNICA diferença que faz a regra passar: o prazo novo. Se
     * alguém um dia voltar a fechar a porta da ENTREGA, este teste fica vermelho e a conversa
     * acontece; enquanto a regra J for a única guardiã, fechar a porta de novo passaria VERDE.
     */
    await porta(banco).reabrir(
      VAGA,
      { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
      MASTER,
    );

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
    expect(banco.escritas.length).toBeGreaterThan(0);
  });

  it("NÃO apaga `vagas_fechadas`, `vagas_fechadas_banco` nem `data_fechamento`", async () => {
    const banco = vagaEntregue();
    const antes = {
      vagasFechadas: banco.vaga.vagasFechadas,
      vagasFechadasBanco: banco.vaga.vagasFechadasBanco,
      dataFechamento: banco.vaga.dataFechamento,
    };
    expect(
      antes,
      "o fixture precisa NASCER com os carimbos preenchidos, senão nada é medido",
    ).toEqual({ vagasFechadas: 2, vagasFechadasBanco: 1, dataFechamento: "2026-09-10" });

    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    /*
     * ┌─ O DANO QUE A REGRA J NOMEIA, AFIRMADO PELO VALOR E NÃO PELA PORTA ───────────────────┐
     * │ O caminho do CANCELAMENTO zera os três de propósito (vaga cancelada não fechou nada).  │
     * │ Aplicado à entrega, isso apagaria a contagem de quem o cliente CONTRATOU, e o número    │
     * │ não volta: ele é derivado no fechamento e congelado ali. Reabrir uma vez por reprovação  │
     * │ de um candidato levaria embora o registro dos outros.                                   │
     * └───────────────────────────────────────────────────────────────────────────────────────┘
     */
    expect(banco.vaga.vagasFechadas).toBe(2);
    expect(banco.vaga.vagasFechadasBanco).toBe(1);
    expect(banco.vaga.dataFechamento).toBe("2026-09-10");
  });

  it("e não os apaga pela outra ponta: as três colunas nem SAEM no `.set`", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    /*
     * A ASSERÇÃO PELO VALOR, SOZINHA, NÃO BASTA: um `.set({ vagasFechadas: 2 })` que recopiasse o
     * mesmo número passaria por ela, e no dia em que a leitura viesse de outro lugar (uma vaga sem
     * o carimbo, uma projeção que esquecesse a coluna) gravaria nulo. A coluna que não deve mudar é
     * a coluna que não deve ser MENCIONADA.
     */
    const chaves = updatesDaVaga(banco).flatMap((u) => Object.keys(u.valores));
    expect(chaves).not.toContain("vagasFechadas");
    expect(chaves).not.toContain("vagasFechadasBanco");
    expect(chaves).not.toContain("dataFechamento");
    // E os carimbos do CANCELAMENTO também não: a vaga entregue não tem cancelamento a desfazer.
    expect(chaves).not.toContain("cancelamentoMotivo");
    expect(chaves).not.toContain("canceladaEm");
  });

  it("FECHADA e ABERTA continuam recusadas, e AGORA com prazo novo no corpo", async () => {
    /*
     * ESTE É O VALOR QUE SOBROU DA REGRA J, e ele precisava ser reafirmado com o prazo: a sonda dela
     * recusa sem prazo, então, para FECHAMENTO e ABERTURA, ela também não distingue mais "recusou
     * pelo papel" de "recusou por falta de prazo". Com o prazo no corpo, a recusa só pode ser do
     * papel.
     *
     * FECHADA SEGUE SEM PORTA DE VOLTA por decisão do diretor: reabrir um FECHAMENTO tem régua
     * própria (a meta fechada, a data prevista de início, o relógio da retenção) e é frente futura.
     */
    for (const [papel, codigo] of [
      ["FECHAMENTO", CODIGO_FECHAMENTO],
      ["ABERTURA", CODIGO_ABERTURA],
    ] as const) {
      const banco = vagaEntregue();
      banco.vaga.status = codigo;

      const e = await erroDe(() =>
        porta(banco).reabrir(
          VAGA,
          { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO },
          MASTER,
        ),
      );

      expect(e, `a vaga no papel ${papel} foi reaberta por esta porta`).toBeInstanceOf(
        ConflictException,
      );
      expect(banco.escritas, `a recusa do papel ${papel} gravou antes de recusar`).toEqual([]);
      expect(banco.vaga.status).toBe(codigo);
    }
  });

  it("o COMUM não reabre a ENTREGUE, e a recusa é 403 sem nenhuma escrita", async () => {
    /*
     * O caminho novo entra DEPOIS da reconferência de papel, então esta garantia é herdada. Herdada
     * não é testada: a régua do `podeReabrir` poderia migrar para dentro de um dos dois ramos numa
     * refatoração, e o ramo da entrega ficaria aberto ao consultor sem nada ficar vermelho.
     */
    const banco = vagaEntregue();
    const e = await erroDe(() => porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, COMUM));

    expect(e).toBeInstanceOf(ForbiddenException);
    expect(banco.escritas).toEqual([]);
    expect(banco.vaga.status).toBe(CODIGO_ENTREGA);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A LISTA PARCIAL, E A ARMADILHA DA LISTA DO MESMO TAMANHO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a lista do corpo é conferida, e conferida por CONJUNTO e não por tamanho", () => {
  const duasComOCliente = () =>
    vagaEntregue([
      pessoa("Ana", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" }),
      pessoa("Bia", "ALOCADO", { etapa: "ENTREVISTA_CLIENTE", posicaoLado: "OFICIAL" }),
    ]);

  it("a lista COMPLETA é aceita, e move os dois", async () => {
    const banco = duasComOCliente();

    await porta(banco).reabrir(
      VAGA,
      { candidaturaIds: ["cand-Ana", "cand-Bia"], dataLimite: PRAZO_NOVO },
      MASTER,
    );

    const etapas = banco.pessoas.map((p) => p.candidatura.etapa);
    expect(etapas).toEqual(["TRIAGEM", "TRIAGEM"]);
    // E a SITUAÇÃO de quem estava ALOCADO não se mexe: a ocupação da vaga fica igual.
    expect(banco.pessoas[1].candidatura.situacao).toBe("ALOCADO");
    expect(banco.pessoas[1].candidatura.posicaoLado).toBe("OFICIAL");
  });

  it("a lista do MESMO TAMANHO com um id de FORA é recusada com 409", async () => {
    const banco = duasComOCliente();

    /*
     * ┌─ A CONFERÊNCIA POR CONTAGEM É O ATALHO ERRADO, E É O ATALHO NATURAL ─────────────────┐
     * │ "São dois no conjunto e vieram dois, então está completa" passa aqui, e o que chega ao  │
     * │ `update` é um id que NÃO está com o cliente (podendo ser de outra vaga) enquanto alguém  │
     * │ que ESTÁ com o cliente fica na etapa de entrega. Resultado: a vaga continua ENTREGUE     │
     * │ pela derivação, com carimbo de reabertura e prazo novo gravados. O sistema afirma uma    │
     * │ reabertura que não aconteceu, que é o pior desfecho possível, porque nada falha.         │
     * └───────────────────────────────────────────────────────────────────────────────────────┘
     */
    const e = await erroDe(() =>
      porta(banco).reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana", "cand-de-outra-vaga"], dataLimite: PRAZO_NOVO },
        MASTER,
      ),
    );

    expect(e).toBeInstanceOf(ConflictException);
    expect(banco.escritas).toEqual([]);
    expect(banco.pessoas[0].candidatura.etapa).toBe("ENTREVISTA_CLIENTE");
  });

  it("a recusa da lista parcial DIZ quantos são, para a tela poder se corrigir", async () => {
    const banco = duasComOCliente();

    const e = (await erroDe(() =>
      porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO }, MASTER),
    )) as Error;

    /*
     * A MENSAGEM É PARTE DO CONTRATO, e não enfeite: a tela que mandou três de cinco precisa saber
     * que o conjunto tem cinco para recarregar e mostrar a verdade. "Conflito" sozinho manda o
     * usuário tentar de novo o mesmo gesto errado.
     */
    expect(String(e.message)).toContain("2");
    // §A.6: a recusa fala de CONTAGEM, nunca de quem ficou de fora.
    expect(String(e.message)).not.toContain("Bia");
    expect(String(e.message)).not.toContain("cand-Bia");
  });

  it("uma lista com o MESMO id repetido não se disfarça de lista completa", async () => {
    const banco = duasComOCliente();

    /*
     * `["cand-Ana", "cand-Ana"]` tem tamanho 2, igual ao conjunto. Sem a deduplicação antes da
     * conferência, ela passaria como completa e a Bia ficaria com o cliente, deixando a vaga
     * ENTREGUE com carimbo de reabertura. O `new Set` do service é o que impede, e ele precisa de
     * teste porque é uma linha fácil de perder numa refatoração.
     */
    const e = await erroDe(() =>
      porta(banco).reabrir(
        VAGA,
        { candidaturaIds: ["cand-Ana", "cand-Ana"], dataLimite: PRAZO_NOVO },
        MASTER,
      ),
    );

    expect(e).toBeInstanceOf(ConflictException);
    expect(banco.escritas).toEqual([]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O DESTINO DA REABERTURA: CATÁLOGO, E O QUE ACONTECE QUANDO ALGUÉM INATIVA A ETAPA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("sem destino ATIVO de reabertura, a reabertura recusa", () => {
  /** O catálogo que TEM a Triagem no funil, mas NENHUMA etapa marcada como destino ativo. */
  const semDestinoAtivo = () => ({
    ...catalogoDeEtapasFingido(),
    etapaDaReabertura: async () => null,
  });

  it("`etapaDaReabertura` ignora a etapa marcada porém INATIVA", async () => {
    /*
     * ┌─ O CAMINHO REAL DO DEFEITO, E ELE NÃO É "APAGAR A TRIAGEM" ──────────────────────────┐
     * │ O spec do autor cobre o catálogo SEM a Triagem, que é o caso improvável (a etapa tem     │
     * │ histórico e a FK é `restrict`). O caso PROVÁVEL é o diretor INATIVAR a Triagem na tela    │
     * │ de Etapas Do Funil: a linha continua lá, com `destino_da_reabertura = true`, e é o        │
     * │ `&& e.ativa` do service que decide. Sem ele, a reabertura devolveria gente para uma etapa │
     * │ que não aparece em seletor nem em filtro, isto é, esconderia os candidatos, que é o       │
     * │ oposto de reabrir.                                                                       │
     * └────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const etapas: LinhaEtapa[] = etapasSemente().map((e) => ({
      ...e,
      destinoDaReabertura: e.codigo === "TRIAGEM",
      ativa: e.codigo !== "TRIAGEM",
    }));
    const { db } = bancoFingido({ etapas, candidaturas: [], historico: [] });
    const service = new EtapasFunilService(db as never);

    expect(await service.etapaDaReabertura()).toBeNull();
  });

  it("a etapa marcada e ATIVA é devolvida, senão o teste acima seria verde por nada", async () => {
    const etapas: LinhaEtapa[] = etapasSemente().map((e) => ({
      ...e,
      destinoDaReabertura: e.codigo === "TRIAGEM",
    }));
    const { db } = bancoFingido({ etapas, candidaturas: [], historico: [] });

    const alvo = await new EtapasFunilService(db as never).etapaDaReabertura();

    expect(alvo?.codigo).toBe("TRIAGEM");
  });

  it("a reabertura da ENTREGUE recusa, e recusa ANTES de gravar carimbo ou prazo", async () => {
    const banco = vagaEntregue();

    const e = await erroDe(() =>
      porta(banco, semDestinoAtivo()).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER),
    );

    expect(e).toBeInstanceOf(BadRequestException);
    /*
     * ZERO ESCRITAS É A ASSERÇÃO INTEIRA. Uma reabertura que gravasse o carimbo e o prazo novo e só
     * depois descobrisse que não há destino deixaria a vaga ENTREGUE, com data de reabertura, com
     * prazo renegociado e com todo mundo ainda com o cliente: nada falharia depois disso, e o
     * relatório passaria a contar uma reabertura que nunca houve.
     */
    expect(banco.escritas).toEqual([]);
    expect(banco.vaga.dataLimite).toBe(PRAZO_ANTIGO);
    expect(banco.vaga.dataReabertura).toBeNull();
    expect(banco.vaga.status).toBe(CODIGO_ENTREGA);
  });

  it("a recusa por falta de destino diz ONDE se resolve, porque é configuração e não erro do usuário", async () => {
    const banco = vagaEntregue();
    const e = (await erroDe(() =>
      porta(banco, semDestinoAtivo()).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER),
    )) as Error;

    expect(String(e.message).toLowerCase()).toContain("etapa");
  });

  it("o caminho da vaga CANCELADA NÃO depende do destino de reabertura", async () => {
    /*
     * A ASSIMETRIA É DELIBERADA, e este teste é o que a protege: no cancelamento, mover é cortesia e
     * o gesto principal acontece de todo jeito; na entrega, mover É a operação. Unificar as duas
     * numa guarda só (a tentação natural ao ler o código) faria a falta de configuração passar a
     * BLOQUEAR a reabertura de vaga cancelada, que está em produção.
     */
    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });

    await porta(banco, semDestinoAtivo()).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 4. `data_limite_anterior`: SÓ QUANDO HÁ PRAZO NOVO SUBSTITUINDO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("o prazo anterior é copiado SÓ quando um novo o substitui", () => {
  it("a vaga entregue SEM previsão registrada não inventa um anterior", async () => {
    const banco = vagaEntregue();
    banco.vaga.dataLimite = null;

    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.dataLimite).toBe(PRAZO_NOVO);
    /*
     * NULO, e não a data de hoje nem o prazo novo: `data_limite_anterior` responde "de quanto veio",
     * e "de nenhum" é uma resposta legítima. Preenchê-la com o próprio prazo novo faria o relatório
     * ler "renegociou de 30/11 para 30/11", que é uma renegociação que não houve.
     */
    expect(banco.vaga.dataLimiteAnterior).toBeNull();
  });

  it("e a trilha DIZ que não havia previsão antes, em vez de omitir", async () => {
    const banco = vagaEntregue();
    banco.vaga.dataLimite = null;

    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    const evento = banco.eventos.find((e) => String(e.observacao ?? "").includes("reprovou"));
    expect(evento, "a reabertura da entrega não gravou a narrativa dela").toBeTruthy();
    expect(String(evento!.observacao)).toContain(PRAZO_NOVO);
    expect(String(evento!.observacao).toLowerCase()).toContain("não tinha previsão");
  });

  it("a SEGUNDA reabertura sobrescreve o anterior na linha, e a trilha guarda a sequência", async () => {
    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    // A vaga voltou para ABERTA e alguém a entregou de novo; o cliente reprovou outra vez.
    banco.vaga.status = CODIGO_ENTREGA;
    banco.pessoas[0].candidatura.etapa = "ENTREVISTA_CLIENTE";
    await porta(banco).reabrir(VAGA, { dataLimite: "2027-01-15" }, MASTER);

    expect(banco.vaga.dataLimite).toBe("2027-01-15");
    expect(banco.vaga.dataLimiteAnterior).toBe(PRAZO_NOVO);

    /*
     * A LINHA DA VAGA GUARDA DUAS CASAS, então a primeira renegociação SÓ existe na trilha. Este
     * teste é o que impede alguém de "simplificar" a narrativa tirando os dois valores dela: feito
     * isso, a pergunta "quantas vezes e de quanto para quanto" fica sem resposta para sempre.
     */
    const narrativas = banco.eventos
      .map((e) => String(e.observacao ?? ""))
      .filter((o) => o.includes("reprovou"));
    expect(narrativas.length).toBe(2);
    expect(narrativas[0]).toContain(PRAZO_ANTIGO);
    expect(narrativas[1]).toContain(PRAZO_NOVO);
  });

  it("prazo em BRANCO é ausência, e a ENTREGUE recusa sem escrever", async () => {
    const banco = vagaEntregue();

    /*
     * O `@IsISO8601` da rota já barraria, mas o service é a autoridade (é dele que dependem os
     * chamadores internos) e ele trata prazo em branco como ausente. Um `if (dto.dataLimite)` que
     * aceitasse a string com espaços entregaria `"   "` a uma coluna `date`: o Postgres derruba a
     * transação, com a vaga a meio caminho de reabrir.
     */
    const e = await erroDe(() => porta(banco).reabrir(VAGA, { dataLimite: "   " }, MASTER));

    expect(e).toBeInstanceOf(BadRequestException);
    expect(banco.escritas).toEqual([]);
    expect(banco.vaga.dataLimite).toBe(PRAZO_ANTIGO);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 5. A DATA CARIMBADA É O DIA DE SÃO PAULO, E ISSO SÓ QUEBRA DEPOIS DAS 21H
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("`data_reabertura` é o dia de São Paulo, não o do processo (que roda em UTC)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * ┌─ POR QUE O TESTE DO AUTOR NÃO PEGA ISTO, E ESTE PEGA ────────────────────────────────────┐
   * │ Ele compara o resultado com um `Intl.DateTimeFormat` montado no próprio teste, no fuso de  │
   * │ São Paulo, e roda em horário comercial: nessa hora o dia de SP e o dia do UTC são o MESMO,  │
   * │ então um `toISOString().slice(0, 10)` na produção passaria igual. O teste não distingue as   │
   * │ duas implementações no momento em que ele roda, que é o único momento em que ele roda.       │
   * │                                                                                            │
   * │ AQUI O RELÓGIO É FIXADO NA JANELA EM QUE OS DOIS DIAS DIVERGEM, e o valor esperado é um     │
   * │ LITERAL. É o único jeito de a asserção não ser tautológica: com o relógio em 01/10 02h UTC,  │
   * │ o dia em São Paulo é 30/09, e uma implementação em UTC devolve 01/10.                        │
   * └──────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("às 23h de São Paulo, quando o UTC já virou, carimba o dia de SÃO PAULO", async () => {
    // 01/10/2026 02:00 UTC é 30/09/2026 23:00 em São Paulo (UTC-3).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T02:00:00.000Z"));

    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.dataReabertura).toBe("2026-09-30");
    /*
     * A ASSERÇÃO NEGATIVA VAI JUNTO porque é ela que nomeia o defeito: a data da reabertura entra em
     * relatório e é comparada com a previsão de entrega, então um dia de erro vira uma renegociação
     * datada do dia errado, e ninguém confere carimbo de sistema.
     */
    expect(banco.vaga.dataReabertura).not.toBe("2026-10-01");
  });

  it("e de manhã cedo em UTC, quando SP ainda está no dia ANTERIOR, também", async () => {
    // 30/09/2026 02:00 UTC é 29/09/2026 23:00 em São Paulo. O par do caso acima, pela outra ponta.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T02:00:00.000Z"));

    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.dataReabertura).toBe("2026-09-29");
  });

  it("o formato é `yyyy-mm-dd`, que é o que uma coluna `date` recebe", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T15:00:00.000Z"));

    const banco = vagaEntregue();
    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    /*
     * `pt-BR` daria `05/03/2026`, e a coluna `date` do Postgres o interpretaria como 5 de março OU
     * derrubaria a inserção, dependendo do `DateStyle` da sessão. O formato importa tanto quanto o
     * fuso, e é a mesma linha de código que resolve os dois.
     */
    expect(banco.vaga.dataReabertura).toBe("2026-03-05");
    expect(String(banco.vaga.dataReabertura)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("o carimbo vale para os DOIS caminhos: a vaga cancelada também é datada em São Paulo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T02:00:00.000Z"));

    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });
    await porta(banco).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.dataReabertura).toBe("2026-09-30");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 6. O CONJUNTO VAZIO, QUE É AUTOCORREÇÃO E NÃO EXCEÇÃO
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a vaga ENTREGUE com ninguém em etapa de entrega se autocorrige", () => {
  it("reabre, sem mover ninguém, e a trilha diz que ninguém foi movido", async () => {
    /*
     * A VAGA MOVIDA A MÃO PARA ENTREGUE, sem ninguém com o cliente. Recusar aqui prenderia a vaga em
     * ENTREGUE para sempre, e é um estado que existe na base (o status é movível manualmente).
     */
    const banco = vagaEntregue([pessoa("Ana", "ATIVO", { etapa: "APROVACAO" })]);
    banco.vaga.statusManualEm = T0;

    await porta(banco).reabrir(VAGA, { dataLimite: PRAZO_NOVO }, MASTER);

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
    expect(banco.pessoas[0].candidatura.etapa).toBe("APROVACAO");
    expect(Number(banco.pessoas[0].candidatura.atualizadoEm)).toBe(Number(T0));
    expect(escritasEm(banco, "as_candidatura_etapas")).toEqual([]);

    const narrativa = banco.eventos
      .map((e) => String(e.observacao ?? ""))
      .find((o) => o.includes("reprovou"));
    expect(String(narrativa).toLowerCase()).toContain("nenhum candidato");
  });

  it("uma lista mandada num conjunto vazio é recusada, e não ignorada", async () => {
    const banco = vagaEntregue([pessoa("Ana", "ATIVO", { etapa: "APROVACAO" })]);

    /*
     * A tela que manda um id quando o conjunto está vazio está olhando para uma fotografia velha
     * (alguém já moveu a pessoa). Completar em silêncio, aqui, reabriria a vaga afirmando ter
     * devolvido para a Triagem uma pessoa que ninguém tocou.
     */
    const e = await erroDe(() =>
      porta(banco).reabrir(VAGA, { candidaturaIds: ["cand-Ana"], dataLimite: PRAZO_NOVO }, MASTER),
    );

    expect(e).toBeInstanceOf(ConflictException);
    expect(banco.escritas).toEqual([]);
  });
});
