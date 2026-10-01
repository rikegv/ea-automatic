import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeParaClienteSchedulerService } from "./depara-cliente-scheduler.service";

/**
 * ─ A CADÊNCIA DA SINCRONIZAÇÃO: NASCE INERTE, NÃO ATROPELA, E NÃO DERRUBA O PROCESSO ───────────
 *
 * ┌─ AS TRÊS COISAS QUE ESTE ARQUIVO PROVA, E O DANO DE CADA UMA ────────────────────────────────┐
 * │ 1. SEM A VARIÁVEL, O AGENDADOR NÃO ARMA. Armado sobre porta fechada, ele escreve uma falha por │
 * │    hora para sempre, e quem opera aprende a ignorar o aviso. É o mesmo argumento do sal da     │
 * │    marca de pasta e da data de corte da varredura;                                            │
 * │ 2. PASSADA NÃO ATROPELA PASSADA. Duas leituras concorrentes escreveriam o MESMO de/para ao     │
 * │    mesmo tempo, e a segunda decidiria sobre o estado que a primeira ainda está mudando. A que  │
 * │    chega durante uma passada viva PULA, e o pulo é CONTADO (silêncio é indistinguível de       │
 * │    agendador parado);                                                                          │
 * │ 3. FALHA NÃO DERRUBA O PROCESSO, e isto é o mais caro: promessa rejeitada sem `catch` é        │
 * │    `unhandledRejection`, e no Node 20 isso MATA O PROCESSO. Sob `systemd --user` com restart    │
 * │    automático, uma falha de planilha viraria CRASH-LOOP levando Esteira, Admissões e Clicksign  │
 * │    junto. A lição já está escrita em `retencao-candidatos.service.ts`, e aqui ela é medida.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM RELÓGIO DE VERDADE: os timers são falsos (`vi.useFakeTimers`), e é isso que permite afirmar o
 * ATRASO da primeira passada e a cadência sem o teste levar uma hora. O que se mede é QUANDO a
 * sincronização é chamada, nunca o efeito dela no banco, que é medido em
 * `depara-cliente.sincronizacao.backend.spec.ts`.
 *
 * §A.6: nenhum dado real. A sincronização é um dublê que conta chamadas.
 */

/** O resumo mínimo que a sincronização devolve. Zero em tudo: o conteúdo não é assunto daqui. */
const RESUMO_VAZIO = {
  linhasLidas: 0,
  chaves: 0,
  linhasCriadas: 0,
  linhasAtualizadas: 0,
  linhasDesligadasPorAmbiguidade: 0,
  confirmacoesDesfeitasPorTrocaDeNome: 0,
  malformados: 0,
  codigosInternos: 0,
  vazios: 0,
  ambiguos: 0,
  palpitesExatos: 0,
  palpitesPorPrefixo: 0,
  semPalpite: 0,
};

/** O agendador com os dois dublês. `travar` devolve a promessa que o teste resolve na mão. */
function cenario(opcoes: { ativa: boolean; travar?: boolean; falhar?: boolean }) {
  const chamadas: number[] = [];
  let liberar: (() => void) | undefined;
  const sincronizar = vi.fn(() => {
    chamadas.push(Date.now());
    if (opcoes.falhar) return Promise.reject(new Error("22P02 com o valor no detail"));
    if (opcoes.travar) {
      return new Promise<typeof RESUMO_VAZIO>((resolve) => {
        liberar = () => resolve(RESUMO_VAZIO);
      });
    }
    return Promise.resolve(RESUMO_VAZIO);
  });
  const dePara = { sincronizar } as never;
  const planilha = { estaAtiva: () => opcoes.ativa } as never;
  const svc = new DeParaClienteSchedulerService(dePara, planilha);
  const interno = svc as unknown as Record<string, unknown>;
  /** A passada, alcançada pelo nome: ela é privada, e quem a dispara em produção são os timers. */
  const passada = () => (interno.passada as () => void).call(svc);
  return { svc, interno, sincronizar, chamadas, passada, liberar: () => liberar?.() };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("o agendador NASCE INERTE sem a variável de ambiente", () => {
  it("sem `AS_PLANILHA_VIVA_FILE_ID`, não arma timer nem lê a planilha", () => {
    /*
     * MUTANTE QUE ISTO MATA: armar o intervalo e deixar a sincronização responder "inerte" a cada
     * hora. Fica verde em qualquer teste de comportamento (nada é escrito, afinal), e produz uma
     * linha de log por hora, para sempre, que é como um aviso REAL deixa de ser lido.
     */
    const { svc, interno, sincronizar } = cenario({ ativa: false });

    svc.onModuleInit();

    expect(interno.timer, "a cadência foi armada com a porta fechada").toBeUndefined();
    expect(interno.timerDaPrimeira, "a primeira passada foi agendada com a porta fechada").toBeUndefined();
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    expect(sincronizar, "a sincronização rodou com a porta fechada").not.toHaveBeenCalled();
  });

  it("com a variável configurada, arma os DOIS relógios", () => {
    const { svc, interno } = cenario({ ativa: true });

    svc.onModuleInit();

    expect(interno.timerDaPrimeira).toBeDefined();
    expect(interno.timer).toBeDefined();
  });
});

describe("a PRIMEIRA passada é atrasada, e a cadência é de uma hora", () => {
  it("não roda no `onModuleInit`, e isso é o oposto do molde da retenção", () => {
    /*
     * ┌─ POR QUE O MOLDE NÃO É COPIADO INTEIRO AQUI ────────────────────────────────────────────┐
     * │ `RetencaoCandidatosService` chama a varredura DIRETO no init, e para ele isso é barato: é │
     * │ um `update`. Esta passada BAIXA 1,9 MB do Drive e fala com o `ai-service`, que é OUTRO     │
     * │ processo e é reiniciado JUNTO com este: no boot, ela atrasa o start e falha à toa enquanto │
     * │ o vizinho não respondeu. O custo de esperar é zero, porque o de/para que já está no banco  │
     * │ continua servindo a proposta.                                                             │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { svc, sincronizar } = cenario({ ativa: true });

    svc.onModuleInit();

    expect(sincronizar, "a primeira passada rodou no boot").not.toHaveBeenCalled();
  });

  it("a primeira roda depois do atraso declarado, e UMA vez só", () => {
    const { svc, sincronizar } = cenario({ ativa: true });

    svc.onModuleInit();
    vi.advanceTimersByTime(DeParaClienteSchedulerService.ATRASO_DA_PRIMEIRA_MS - 1);
    expect(sincronizar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(sincronizar).toHaveBeenCalledTimes(1);
  });

  it("depois dela, uma passada por hora", async () => {
    /*
     * O ATRASO DA PRIMEIRA NÃO ATRASA A CADÊNCIA: são dois relógios, e o intervalo conta do boot.
     * Em quatro horas e cinco minutos há a primeira (5 min) mais quatro do intervalo.
     *
     * ┌─ POR QUE CADA HORA É AGUARDADA, E ISSO ME CUSTOU UMA EXECUÇÃO ──────────────────────────┐
     * │ Avançar as quatro horas de uma vez devolve UMA chamada, não cinco, e a implementação está │
     * │ CERTA: com relógio falso, nenhuma microtarefa roda entre os avanços, então a promessa da  │
     * │ primeira passada nunca assenta, a trava continua fechada e as quatro seguintes PULAM, com │
     * │ as quatro linhas de "PULADA" no log. É a trava de concorrência funcionando, medida por     │
     * │ acidente. Um teste que "consertasse" isso afrouxando a trava trocaria uma asserção verde   │
     * │ por duas leituras concorrentes escrevendo o mesmo de/para em produção.                     │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { svc, sincronizar, interno } = cenario({ ativa: true });

    svc.onModuleInit();
    vi.advanceTimersByTime(DeParaClienteSchedulerService.ATRASO_DA_PRIMEIRA_MS);
    await vi.waitFor(() => expect(interno.rodando).toBe(false));
    for (let hora = 1; hora <= 4; hora += 1) {
      vi.advanceTimersByTime(DeParaClienteSchedulerService.INTERVALO_MS);
      await vi.waitFor(() => expect(interno.rodando).toBe(false));
    }

    expect(sincronizar).toHaveBeenCalledTimes(5);
    expect(interno.puladas, "alguma passada pulou sem haver passada viva").toBe(0);
  });

  it("`onModuleDestroy` desarma os dois: nada roda depois da parada", () => {
    /*
     * DEFEITO QUE PEGA: um dos dois timers sobrevivendo ao `SIGTERM` do deploy. O `unref` já impede
     * que ele PENDURE o processo, mas um intervalo vivo depois do destroy continua chamando um
     * serviço cujo banco já foi fechado, e o log de erro final é um erro que ninguém causou.
     */
    const { svc, sincronizar } = cenario({ ativa: true });

    svc.onModuleInit();
    svc.onModuleDestroy();
    vi.advanceTimersByTime(6 * DeParaClienteSchedulerService.INTERVALO_MS);

    expect(sincronizar).not.toHaveBeenCalled();
  });
});

describe("uma passada não atropela a outra", () => {
  it("a segunda PULA enquanto a primeira roda, e o pulo é contado", async () => {
    /*
     * MUTANTE QUE ISTO MATA: nenhuma trava. Com o Drive lento, a passada das 14h ainda estaria
     * lendo quando a das 15h começasse, e as duas escreveriam o MESMO de/para: a segunda decidiria
     * "criar ou atualizar" sobre um retrato que a primeira está mudando, e o resultado dependeria de
     * qual terminasse primeiro.
     */
    const { interno, sincronizar, passada, liberar } = cenario({ ativa: true, travar: true });

    passada();
    passada();
    passada();

    expect(sincronizar, "a trava não segurou a passada concorrente").toHaveBeenCalledTimes(1);
    expect(interno.puladas, "o pulo não foi contado").toBe(2);

    /* LIBERADA A PRIMEIRA, A TRAVA ABRE: ela não pode ficar presa em `true` para sempre. */
    liberar();
    await vi.waitFor(() => expect(interno.rodando).toBe(false));
    passada();
    expect(sincronizar).toHaveBeenCalledTimes(2);
  });

  it("a trava ABRE mesmo quando a passada FALHA", async () => {
    /*
     * ┌─ O DEFEITO MAIS SILENCIOSO DESTE ARQUIVO, E ELE É DE UMA LINHA ─────────────────────────┐
     * │ Liberar a trava dentro do `then` em vez do `finally`: no primeiro erro a flag fica presa │
     * │ em `true` PARA SEMPRE, e o agendador para de rodar sem nenhuma linha de log dizendo que  │
     * │ parou. O estado "parado para sempre e calado" é pior que a falha que o causou.           │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { interno, sincronizar, passada } = cenario({ ativa: true, falhar: true });

    passada();
    await vi.waitFor(() => expect(interno.rodando).toBe(false));
    passada();

    expect(sincronizar, "a trava ficou presa depois do erro").toHaveBeenCalledTimes(2);
    expect(interno.puladas).toBe(0);
  });
});

describe("a falha não derruba o processo e não apaga nada", () => {
  it("a rejeição é CAPTURADA: nada escapa para `unhandledRejection`", async () => {
    /*
     * O QUE ESTÁ EM JOGO, MEDIDO E NÃO SUPOSTO: não há handler de `unhandledRejection` nem de
     * `uncaughtException` neste backend (conferido por varredura quando a retenção de A&S levou este
     * mesmo defeito), então o comportamento padrão do Node 20 vale inteiro e ele MATA O PROCESSO.
     * O serviço sobe sob `systemd --user` com restart automático: uma falha de planilha de hora em
     * hora viraria crash-loop, e levaria junto Esteira, Admissões, Clicksign e o tick do cron.
     *
     * A ASSERÇÃO É SOBRE O PROCESSO, e não sobre o log: o teste escuta `unhandledRejection` de
     * verdade e falha se alguma coisa chegar lá.
     */
    const escapou: unknown[] = [];
    const ouvir = (err: unknown) => escapou.push(err);
    process.on("unhandledRejection", ouvir);
    try {
      const { interno, passada } = cenario({ ativa: true, falhar: true });

      passada();
      await vi.waitFor(() => expect(interno.rodando).toBe(false));
      /* Duas voltas de microtarefa, que é onde uma rejeição sem `catch` apareceria. */
      await Promise.resolve();
      await Promise.resolve();

      expect(escapou, "a rejeição escapou e mataria o processo").toEqual([]);
    } finally {
      process.off("unhandledRejection", ouvir);
    }
  });

  it("a falha de uma passada NÃO impede a seguinte, e o de/para gravado não é tocado", async () => {
    /*
     * QUEM PRESERVA O DE/PARA É A SINCRONIZAÇÃO (ela só escreve depois de uma leitura completa, e as
     * três famílias de falha devolvem resumo sem escrita, medido em
     * `depara-cliente.sincronizacao.backend.spec.ts`). O que ESTE caso afirma é que o agendador não
     * desfaz isso: ele não limpa nada por conta própria, e a hora seguinte tenta de novo.
     */
    const { svc, sincronizar, interno } = cenario({ ativa: true, falhar: true });

    svc.onModuleInit();
    vi.advanceTimersByTime(DeParaClienteSchedulerService.ATRASO_DA_PRIMEIRA_MS);
    await vi.waitFor(() => expect(interno.rodando).toBe(false));
    vi.advanceTimersByTime(DeParaClienteSchedulerService.INTERVALO_MS);
    await vi.waitFor(() => expect(sincronizar).toHaveBeenCalledTimes(2));

    /* O AGENDADOR SÓ CHAMA A SINCRONIZAÇÃO: ele não tem método de limpeza para chamar por engano. */
    const metodosChamados = Object.keys(interno).filter((k) => k.startsWith("limpar"));
    expect(metodosChamados).toEqual([]);
  });
});
