import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Logger, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiRepositorio } from "./digai-repositorio";
import { DigaiSchedulerService } from "./digai-scheduler.service";
import { DigaiVarreduraService } from "./digai-varredura.service";
import { DigaiFilaService } from "./digai-fila.service";
import {
  DIGAI_TENTATIVAS_DO_POLLING,
  DIGAI_WORKER_OPTIONS,
  JOB_PAGINA_DIGAI,
  JOB_TICK_DIGAI,
} from "./digai.queue";
import {
  DIGAI_FOLGA_DA_NECESSIDADE,
  DIGAI_PAGINAS_DE_DESCOBERTA,
  DIGAI_POLLING_INTERVALO_MS,
  DIGAI_TAMANHO_DA_PAGINA,
  DIGAI_TETO_PAGINAS_POR_SCREENING,
  DIGAI_TETO_REQ_POR_CICLO,
  necessidadeDePaginasDigai,
  planoDaVarredura,
  proximaPaginaDigai,
  pollingHabilitado,
  projetarScreeningDigai,
  totalDeclaradoDigai,
} from "../../domain/digai";
import {
  fonteDoModulo,
  paginaDeCandidatosFingida,
  respostaDigaiFingida,
  semComentario,
} from "./digai.tester-fake";
import { DigaiPollingController } from "./digai-polling.controller";
import { InternalTokenGuard } from "../../pandape/internal-token.guard";
import { ClicksignController } from "../../clicksign/clicksign.controller";
import { PandapeController } from "../../pandape/pandape.controller";
import { IS_PUBLIC_KEY } from "../../auth/decorators";

/**
 * ─ A COBERTURA DE QUEM CONSTRUIU O POLLING (29/09/2026) ────────────────────────────────────────
 *
 * Sufixo `.backend.spec.ts`, e nao `.tester.spec.ts`: o sufixo do `tester` e trava de DONO UNICO
 * (§A.39), e os 48 do contrato real sao de outro agente e nao se editam daqui.
 *
 * NADA SAI PARA A REDE EM NENHUM TESTE DESTE ARQUIVO. O cliente e dublado no ponto unico de leitura
 * (`ler`), e o teste que conta requisicoes conta CHAMADAS AQUELE ponto, que e o unico que existe.
 *
 * §A.6: nenhum dado real. Os registros sao sinteticos e a maior parte deles existe para ser
 * RECUSADA pelo portao da admissao.
 */

/**
 * Um screening do fornecedor, na forma da LISTAGEM medida em 29/09.
 *
 * ┌─ O `status` PADRAO E `PUBLISHED`, E ELE DEIXOU DE SER ENFEITE EM 01/10/2026 ─────────────────┐
 * │ Ate aqui o campo valia `"ACTIVE"`, que NAO e um dos cinco status reais do fornecedor (medidos │
 * │ ao vivo: PUBLISHED 187, PAUSED 204, QUEUED 110, CLOSED 34, DRAFT 2). Era inofensivo enquanto a │
 * │ varredura nao filtrava nada; com o recorte, um valor fora da lista branca faz TODO screening   │
 * │ deste arquivo ser recusado, e os testes de paginacao e de orcamento passariam a medir zero.    │
 * │                                                                                               │
 * │ O PADRAO E O QUE ENTRA, de proposito: os casos deste arquivo sao sobre teto, cota e paginacao, │
 * │ e nenhum deles e sobre o recorte. Quem mede o recorte e                                        │
 * │ `digai.recorte-publicadas.backend.spec.ts`, e e lá que os outros quatro status aparecem.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function screeningFingido(
  id: string,
  updatedAt = "2026-09-29T12:00:00Z",
  status = "PUBLISHED",
) {
  return {
    id,
    title: "Triagem sintetica",
    description: "nao deve atravessar a projecao",
    status,
    updatedAt,
    webAccessLink: "https://exemplo.invalido/acesso",
    whatsappAccessLink: "https://exemplo.invalido/zap",
  };
}

/**
 * A pagina de RESULTADOS com `total` MAIOR que a pagina. O fake do `tester`
 * (`paginaDeCandidatosFingida`) fixa `total` no tamanho da lista, entao ele nao consegue descrever
 * um screening com mais de uma pagina, que e exatamente o caso que a paginacao existe para tratar.
 * O envelope e o mesmo (`respostaDigaiFingida`), que segue sendo o unico ponto que conhece a forma.
 */
function paginaDeCandidatosComTotal(candidates: unknown[], total: number, page = 1): unknown {
  return respostaDigaiFingida({ page, total, candidates });
}

/** A pagina da LISTAGEM, no envelope real: `data.value = { page, total, screenings }`. */
function paginaDeScreeningsFingida(screenings: unknown[], total?: number): unknown {
  return respostaDigaiFingida({ page: 1, total: total ?? screenings.length, screenings });
}

/** Um candidato que FINALIZOU (tem CPF valido) e um que nao finalizou. */
const CPF_VALIDO = "11144477735";
function candidatoFingido(userId: string, comCpf: boolean) {
  return {
    userId,
    partnerJobId: "vaga-1",
    firstname: "Sintetico",
    lastname: "DeTeste",
    cpf: comCpf ? CPF_VALIDO : null,
    email: "sintetico@exemplo.invalido",
    phoneNumber: "11900000000",
    appliedAt: "2026-09-20T10:00:00Z",
  };
}

/**
 * O servico de importacao com o CLIENTE DUBLADO no ponto unico de leitura. Tudo o mais e o codigo
 * de producao: a projecao por allowlist, o desembrulho do envelope e o portao da admissao rodam de
 * verdade.
 */
function importacaoComClienteDublado(respostaPorCaminho: (caminho: string, params: unknown) => unknown) {
  const chamadas: Array<{ caminho: string; params: unknown }> = [];
  const config = {
    get: (chave: string) => (chave === "DIGAI_API_TOKEN" ? "token-sintetico" : undefined),
  } as unknown as ConfigService;
  const repo = {} as unknown as DigaiRepositorio;
  const importacao = new DigaiImportacaoService(config, repo);
  const cliente = (importacao as unknown as { cliente: { ler: unknown } }).cliente;
  cliente.ler = vi.fn(async (caminho: string, params: unknown) => {
    chamadas.push({ caminho, params });
    return respostaPorCaminho(caminho, params);
  });
  return { importacao, chamadas };
}

/**
 * O repositorio do cursor como duble: ANOTA o que seria gravado e nunca toca banco.
 *
 * `totais` e o que o CICLO ANTERIOR mediu, e e o insumo da reparticao por necessidade. Vazio (o
 * padrao) significa base inteira DESCONHECIDA, que e a partida a frio.
 */
function repositorioDeCursorFingido(
  falhar = false,
  totais: ReadonlyMap<string, number> = new Map(),
) {
  const gravados: Array<{ screeningId: string; updatedAt: string | null; total?: number }> = [];
  const repo = {
    gravados,
    registrarCursorDoScreening: vi.fn(
      async (d: { screeningId: string; updatedAt: string | null; total?: number }) => {
        if (falhar) return false;
        gravados.push(d);
        return true;
      },
    ),
    cursorDoScreening: vi.fn(async () => null),
    totaisConhecidos: vi.fn(async () => new Map(totais)),
  };
  return repo as unknown as DigaiRepositorio & { gravados: typeof gravados };
}

// ── 1. O CICLO, COM O CLIENTE DUBLADO ──────────────────────────────────────

describe("o ciclo do polling varre a listagem e as paginas de resultados, sem tocar a rede", () => {
  it("o tick le a listagem e devolve os screenings projetados, e nada alem de `id`, `updatedAt` e `status`", async () => {
    const { importacao, chamadas } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1"), screeningFingido("sc-2")]),
    );
    const repo = repositorioDeCursorFingido();
    const varredura = new DigaiVarreduraService(importacao, repo);

    const r = await varredura.executarTick(1);

    expect(r.inerte, "com token configurado, o ciclo roda.").toBe(false);
    expect(
      r.screenings.map((i) => i.screeningId),
      "os dois screenings entram na passada.",
    ).toEqual(["sc-1", "sc-2"]);
    expect(chamadas, "UMA requisicao para a listagem, e ela e a primeira do ciclo.").toHaveLength(1);
    expect(chamadas[0]?.caminho).toBe("/api/v1/public/screenings");
    expect(
      chamadas[0]?.params,
      "o `page` vai por PARAMETRO, nunca colado no path: a query tem porta propria com coleira.",
    ).toEqual({ page: 1 });
  });

  it("a projecao do screening deixa `webAccessLink` e `title` de fora (allowlist, secao A.6)", () => {
    const projetado = projetarScreeningDigai(screeningFingido("sc-1"));
    /*
     * O `status` ENTROU NA ALLOWLIST EM 01/10/2026, e e o TERCEIRO e ultimo campo: ele e o RECORTE
     * (so `PUBLISHED` entra na varredura), nao e dado de pessoa, e e do mesmo tipo do
     * `VacancyStatus` que o Pandape ja usa. Os outros quatorze campos continuam fora pela MESMA
     * razao de antes, e `webAccessLink`/`whatsappAccessLink` sao o caso concreto.
     */
    expect(projetado).toEqual({
      id: "sc-1",
      updatedAt: "2026-09-29T12:00:00Z",
      status: "PUBLISHED",
    });
    expect(
      Object.keys(projetado ?? {}),
      "URL de acesso e da mesma regua da URL do Pandape: nao se persiste nem se loga.",
    ).toEqual(["id", "updatedAt", "status"]);
  });

  it("a folha do leque le UMA pagina de resultados e entrega ao `importar`", async () => {
    const { importacao, chamadas } = importacaoComClienteDublado(() =>
      paginaDeCandidatosFingida([candidatoFingido("usr-1", true), candidatoFingido("usr-2", false)]),
    );
    const importar = vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 1,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 1,
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());

    const r = await varredura.executarPaginaDeScreening("sc-1", 1);

    expect(chamadas[0]?.caminho, "a LISTAGEM de resultados e v2; a versao e por ROTA.").toBe(
      "/api/v2/public/screenings/sc-1/results",
    );
    expect(chamadas[0]?.params).toEqual({ page: 1 });
    expect(r.lidos, "os dois foram lidos e projetados.").toBe(2);
    expect(importar, "quem aplica o portao da admissao e o `importar`, e ele foi chamado.").toHaveBeenCalledTimes(1);
  });

  it("o portao INGERIR_SOMENTE_QUEM_FINALIZOU continua valendo no caminho do polling", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeCandidatosFingida([candidatoFingido("usr-1", true), candidatoFingido("usr-2", false)]),
    );
    const vistos: unknown[] = [];
    vi.spyOn(importacao, "importar").mockImplementation(async (registros) => {
      vistos.push(...registros);
      return { escritos: 0, adiados: 0, ignorados: 0, naoFinalizaram: 0 };
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());

    await varredura.executarPaginaDeScreening("sc-1", 1);

    expect(
      vistos,
      "a varredura NAO filtra por conta propria: ela entrega o lote inteiro ao `importar`, que e o dono do portao. Um segundo filtro aqui seria a copia da regra que a secao 2.1 do dominio existe para impedir.",
    ).toHaveLength(2);
  });

  it("sem `DIGAI_API_TOKEN` o ciclo e INERTE e nada sai para a rede", async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const importacao = new DigaiImportacaoService(config, {} as unknown as DigaiRepositorio);
    const espiao = vi.spyOn(
      (importacao as unknown as { cliente: { ler: (c: string) => Promise<unknown> } }).cliente,
      "ler",
    );
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());

    const tick = await varredura.executarTick(1);
    const folha = await varredura.executarPaginaDeScreening("sc-1", 1);

    expect(tick.inerte).toBe(true);
    expect(folha.inerte).toBe(true);
    expect(espiao, "o primeiro portao fecha ANTES da rede.").not.toHaveBeenCalled();
  });
});

// ── 2. A PAGINACAO, COM MAIS DE UMA PAGINA, E O CORTE QUE REGISTRA ────────

describe("a paginacao e de verdade: nao se presume que uma pagina basta", () => {
  it("a folha pede a proxima pagina enquanto o `total` declarado nao foi alcancado", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeCandidatosComTotal([candidatoFingido("usr-1", true), candidatoFingido("usr-2", true)], 5),
    );
    vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 0,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 0,
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());

    const p1 = await varredura.executarPaginaDeScreening("sc-1", 1, 5);
    expect(p1.proximaPagina, "2 lidos de 5 declarados, com 5 paginas concedidas: ha mais.").toBe(2);

    const p3 = await varredura.executarPaginaDeScreening("sc-1", 3, 5);
    expect(p3.proximaPagina, "3 x 2 = 6 acumulados contra 5 declarados: acabou.").toBeNull();
  });

  it("a LISTAGEM tambem pagina, e o tick devolve a proxima pagina dela", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1")], 3),
    );
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());

    const r = await varredura.executarTick(1);
    expect(
      r.proximaPaginaDaListagem,
      "a listagem medida trouxe 528 numa pagina, e isso e observacao de um dia, nao contrato.",
    ).toBe(2);
  });

  it("pagina VAZIA para a paginacao, senao `total` inconsistente viraria laco", () => {
    const d = proximaPaginaDigai({
      total: 100,
      lidosAcumulados: 0,
      itensNaPagina: 0,
      paginaAtual: 1,
      paginasPermitidas: 20,
    });
    expect(d.proxima, "o fornecedor declarar 100 e devolver zero e o laco classico.").toBeNull();
    expect(d.motivo).toBe("PAGINA_VAZIA");
    expect(d.cortada, "pagina vazia nao e corte nosso: nao ha o que registrar como perdido.").toBe(false);
  });

  it("`total` ausente para a paginacao, porque a forma do fornecedor mudou", () => {
    const d = proximaPaginaDigai({
      total: null,
      lidosAcumulados: 1,
      itensNaPagina: 1,
      paginaAtual: 1,
      paginasPermitidas: 20,
    });
    expect(d.proxima, "nao se inventa paginacao sem `total`: parar e o certo.").toBeNull();
    expect(d.motivo).toBe("SEM_TOTAL");
    expect(totalDeclaradoDigai({ page: 1, screenings: [] })).toBeNull();
  });

  it("`SEM_TOTAL` NAO E TERMINO NORMAL: e ABSTENCAO, e a diferenca decide o nivel do log", () => {
    const semTotal = proximaPaginaDigai({
      total: null,
      lidosAcumulados: 1,
      itensNaPagina: 1,
      paginaAtual: 1,
      paginasPermitidas: 20,
    });
    expect(
      semTotal.abstencao,
      "`COMPLETA` e 'provou-se que acabou'; `SEM_TOTAL` e 'NAO SE SABE se acabou'. Tratar desconhecimento como conclusao e a definicao do modo de falha silencioso.",
    ).toBe(true);
    expect(semTotal.cortada, "abstencao nao e corte NOSSO: a acao de quem le e outra.").toBe(false);

    const completa = proximaPaginaDigai({
      total: 10,
      lidosAcumulados: 10,
      itensNaPagina: 10,
      paginaAtual: 1,
      paginasPermitidas: 1,
    });
    expect(completa.abstencao, "termino provado nao gera alarme.").toBe(false);
    const vazia = proximaPaginaDigai({
      total: 100,
      lidosAcumulados: 0,
      itensNaPagina: 0,
      paginaAtual: 1,
      paginasPermitidas: 20,
    });
    expect(vazia.abstencao, "pagina vazia tambem e termino provado: nao ha o que somar.").toBe(false);
  });

  it("SUPERFICIE 1, A FOLHA: resposta sem `total` tem de gerar AVISO, e nao silencio", async () => {
    // O envelope real, sem o campo `total`: exatamente o que uma mudanca de contrato produz.
    const { importacao } = importacaoComClienteDublado(() =>
      respostaDigaiFingida({ page: 1, candidates: [candidatoFingido("usr-1", true)] }),
    );
    vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 1,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 0,
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarPaginaDeScreening("sc-1", 1, 20);
    aviso.mockRestore();
    log.mockRestore();

    expect(r.proximaPagina, "parar continua certo: nao se inventa paginacao.").toBeNull();
    expect(
      avisos,
      "sem esta linha, o fornecedor mudar a forma faria a ingestao ler a pagina 1 de cada screening (~4% da base) e NADA ficaria vermelho, amarelo ou contado.",
    ).not.toHaveLength(0);
    const juntas = avisos.join("\n");
    expect(juntas, "o aviso precisa dizer QUAL screening.").toContain("sc-1");
    expect(juntas, "e precisa dizer o QUE faltou, senao vira alarme sem acao.").toContain("total");
  });

  it("SUPERFICIE 2, A LISTAGEM: listagem sem `total` tambem gera AVISO", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      respostaDigaiFingida({ page: 1, screenings: [screeningFingido("sc-1"), screeningFingido("sc-2")] }),
    );
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarTick(1);
    aviso.mockRestore();
    log.mockRestore();

    expect(r.proximaPaginaDaListagem).toBeNull();
    expect(
      avisos,
      "aqui o silencio e mais caro que na folha: perde-se o screening INTEIRO, e nao paginas dele, enquanto o log informativo diria '2 screening(s) lido(s)' como se fosse a base toda.",
    ).not.toHaveLength(0);
    expect(avisos.join("\n")).toContain("LISTAGEM");
  });

  it("o cursor NAO carimba `total` falso quando o `total` nao veio", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      respostaDigaiFingida({ page: 1, candidates: [candidatoFingido("usr-1", true)] }),
    );
    vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 0,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 0,
    });
    const repo = repositorioDeCursorFingido();
    const varredura = new DigaiVarreduraService(importacao, repo);
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    await varredura.executarPaginaDeScreening("sc-1", 1, 20);
    aviso.mockRestore();
    log.mockRestore();

    expect(
      repo.gravados,
      "carimbar `total_visto = 0` faria o ciclo seguinte ler 'o total caiu de 58 para 0' e concluir que o screening esvaziou. Com a reparticao POR NECESSIDADE isso ficou pior: 0 e DESCONHECIDO, e a cota erraria por um ciclo inteiro.",
    ).toEqual([]);
  });

  it("TERMINO NORMAL nao e corte, senao o log encheria de alarme falso", () => {
    const d = proximaPaginaDigai({
      total: 10,
      lidosAcumulados: 10,
      itensNaPagina: 10,
      paginaAtual: 1,
      paginasPermitidas: 1,
    });
    expect(d.motivo).toBe("COMPLETA");
    expect(d.cortada).toBe(false);
  });

  it("o teto anti-laco de paginas por screening e CORTE, e ele tem nome proprio", () => {
    const d = proximaPaginaDigai({
      total: 1_000_000,
      lidosAcumulados: 1,
      itensNaPagina: 1,
      paginaAtual: DIGAI_TETO_PAGINAS_POR_SCREENING,
      paginasPermitidas: 1_000,
    });
    expect(d.proxima).toBeNull();
    expect(d.motivo).toBe("CORTE_TETO");
    expect(d.cortada, "corte e decisao nossa que deixa gente de fora: tem de aparecer.").toBe(true);
  });

  it("O CORTE REGISTRA: parar pelo teto NAO pode ser indistinguivel de 'acabou'", async () => {
    // 2 lidos de 500 declarados, na pagina do teto: ha MUITO mais, e a passada para aqui.
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeCandidatosComTotal([candidatoFingido("usr-1", true), candidatoFingido("usr-2", true)], 500),
    );
    vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 0,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 0,
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarPaginaDeScreening(
      "sc-1",
      DIGAI_TETO_PAGINAS_POR_SCREENING,
      1_000,
    );
    aviso.mockRestore();
    log.mockRestore();

    expect(r.proximaPagina).toBeNull();
    expect(
      avisos.join("\n"),
      "um screening com mais paginas que o teto perderia todo mundo dali em diante sem erro e sem alarme, que e o modo de falha mais caro de uma ingestao.",
    ).toContain("CORTADO");
    expect(avisos.join("\n"), "o motivo precisa estar no texto para nao virar adivinhacao.").toContain(
      "anti-laco",
    );
  });

  it("O CORTE POR ORCAMENTO tambem registra, e diz que foi o orcamento", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeCandidatosComTotal([candidatoFingido("usr-1", true)], 500),
    );
    vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 0,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 0,
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarPaginaDeScreening("sc-1", 2, 2);
    aviso.mockRestore();
    log.mockRestore();

    expect(r.proximaPagina, "2 paginas concedidas, esta e a 2a: nao pede a 3a.").toBeNull();
    expect(avisos.join("\n")).toContain("orcamento");
    /*
     * ─ A LINHA NAO PODE DESARMAR QUEM A LE (auditoria de 29/09) ────────────────────────────────
     *
     * Ela terminava em "os demais ficam para o proximo ciclo", e a MEDICAO DA ORDENACAO derrubou
     * essa frase: o fornecedor nao ordena os resultados, o ciclo seguinte rele da pagina 1 com a
     * MESMA cota e corta o MESMO conjunto. Nao e adiamento, e perda recorrente. Log que desarma e
     * pior que log nenhum, e e o mesmo modo de falha do `SEM_TOTAL` saindo como termino normal,
     * voltando pela porta do TEXTO em vez da do valor de retorno.
     */
    expect(
      avisos.join("\n"),
      "o aviso tem de dizer que o proximo ciclo NAO recupera, senao quem le arquiva a perda como rotina.",
    ).toContain("NAO ficam para o proximo");
    expect(
      avisos.join("\n"),
      "e tem de dizer que a perda se REPETE, que e o que distingue corte de atraso.",
    ).toContain("RECORRENTE");
    expect(
      avisos.join("\n"),
      "a frase confortavel nao pode voltar por refatoracao.",
    ).not.toContain("os demais ficam para o proximo ciclo");
  });
});

// ── 3. O ORCAMENTO: ELE CONTA REQUISICAO E ATRAVESSA O LEQUE ──────────────

describe("o teto por ciclo conta REQUISICOES, e o orcamento atravessa jobs e paginas", () => {
  it("o teto e constante nomeada, e ela e maior que o ciclo medido de 682 requisicoes", () => {
    expect(DIGAI_TETO_REQ_POR_CICLO).toBe(8_000);
    expect(
      DIGAI_TETO_REQ_POR_CICLO,
      "medido em 29/09 varrendo a base inteira: 1 listagem + 527 screenings + 154 paginas extras = 682. O teto tem de caber o ciclo de hoje e ainda ser freio de crescimento.",
    ).toBeGreaterThan(682);
    expect(
      DIGAI_TETO_REQ_POR_CICLO / 682,
      "8.000 e 11,7x o ciclo medido: no ritmo medido (+73% em 13 dias) a base leva ~58 dias para encostar.",
    ).toBeGreaterThan(10);
  });

  it("A CONTA FECHA: o pior caso com a base de HOJE cabe no teto, e a PARTIDA A FRIO tambem", () => {
    const screenings = Array.from({ length: 528 }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
    // Sem cursor nenhum: a base inteira e DESCONHECIDA, que e o pior caso da cota de descoberta.
    const plano = planoDaVarredura({ screenings, orcamento: DIGAI_TETO_REQ_POR_CICLO });
    const piorCaso = 1 + plano.paginasAutorizadas;
    expect(
      piorCaso,
      "este era o veto: cada screening podia pedir ate 20 paginas sem consultar orcamento, e o teto autorizava 1 + N x 20.",
    ).toBeLessThanOrEqual(DIGAI_TETO_REQ_POR_CICLO);
    expect(piorCaso, "528 x 13 + 1 = 6.865 de 8.000: nem a partida a frio degrada.").toBe(6_865);
    expect(
      plano.varrer[0]?.paginasPermitidas,
      "desconhecido leva a COTA DE DESCOBERTA, que e o maior screening ja medido (1.225 = 13 paginas).",
    ).toBe(DIGAI_PAGINAS_DE_DESCOBERTA);
    expect(plano.cortadosPorOrcamento, "ninguem foi cortado: a soma coube.").toBe(0);
  });

  /**
   * ─ A COBERTURA E O PISO DO TETO, E FOI A MEDICAO DA PAGINA QUE A REVELOU ──────────────────────
   *
   * A pagina do fornecedor e de 100 (medido em 29/09: screening com `total` 273 devolveu 100 na
   * pagina 1), 78 dos 528 screenings passam disso e o MAIOR TEM 1.225 CANDIDATOS, ou 13 paginas.
   *
   * COM O TETO ANTIGO DE 1.200, a cota por screening era `floor(1199/528)` = 2 PAGINAS, e o
   * conjunto perdido eram os screenings ACIMA DE 200 CANDIDATOS, e nao "os 78 acima de 100": quem
   * tem 101 a 200 termina COMPLETA, porque `proximaPaginaDigai` avalia `lidosAcumulados >= total`
   * ANTES dos cortes (ver o teste logo abaixo, que fixa isso). Quantos passam de 200 nao foi
   * medido. Para quem passa, nao e atraso: e perda recorrente, o modo de falha mais caro daqui.
   */
  it("A COBERTURA MANDA NO TETO: a cota de hoje cobre o MAIOR screening medido (1.225 candidatos)", () => {
    const screenings = Array.from({ length: 528 }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
    const plano = planoDaVarredura({ screenings, orcamento: DIGAI_TETO_REQ_POR_CICLO });
    const paginasDoMaior = Math.ceil(1_225 / 100);
    expect(paginasDoMaior, "1.225 candidatos em paginas de 100 sao 13 paginas.").toBe(13);
    expect(
      plano.varrer[0]?.paginasPermitidas,
      "a cota por screening tem de cobrir o maior medido, senao o corte volta.",
    ).toBeGreaterThanOrEqual(paginasDoMaior);
  });

  /**
   * ─ O CONJUNTO CORTADO ERA O DE ACIMA DE 200, E NAO "OS 78 ACIMA DE 100" ───────────────────────
   *
   * Numero publicado errado vira a proxima medicao errada de alguem, entao ele fica fixado aqui.
   * Com 2 paginas concedidas, quem tem 101 a 200 TERMINA, porque a decisao avalia
   * `lidosAcumulados >= total` ANTES de olhar cota e teto.
   */
  it("com 2 paginas de cota, 101 a 200 candidatos TERMINAM; o corte comeca acima de 200", () => {
    const naPagina2 = (total: number) =>
      proximaPaginaDigai({
        total,
        lidosAcumulados: 200,
        itensNaPagina: 100,
        paginaAtual: 2,
        paginasPermitidas: 2,
      });
    expect(naPagina2(200).motivo, "200 lidos de 200: acabou, e nao foi cortado.").toBe("COMPLETA");
    expect(naPagina2(200).cortada).toBe(false);
    expect(naPagina2(201).cortada, "201 e o primeiro que a cota de 2 paginas deixa incompleto.").toBe(
      true,
    );
    expect(naPagina2(201).motivo).toBe("CORTE_ORCAMENTO");
  });

  /**
   * ─ A BASE MEDIDA, NA FORMA QUE A REPARTICAO POR NECESSIDADE ENXERGA ───────────────────────────
   *
   * Medido em 29/09/2026: 528 screenings, o maior com 1.225 candidatos (13 paginas de 100), 78
   * acima de uma pagina e 154 paginas extras no ciclo inteiro. O molde abaixo reproduz essa forma
   * (1 gigante de 1.225, 71 de 284 e 456 de 58), que soma exatamente as 154 extras medidas. E
   * SINTETICO NO DADO E FIEL NA FORMA: nenhum candidato real, e a distorcao que importa (a base e
   * TORTA) preservada.
   */
  function baseMedida(n: number): Map<string, number> {
    const m = new Map<string, number>();
    for (let i = 0; i < n; i += 1) {
      const r = i % 528;
      m.set(`sc-${i}`, r === 0 ? 1_225 : r < 72 ? 284 : 58);
    }
    return m;
  }

  function screeningsDe(n: number) {
    return Array.from({ length: n }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
  }

  /**
   * ─ O DESPERDICIO QUE A REPARTICAO IGUALITARIA TINHA, E ELE ERA A METADE DO PROBLEMA ───────────
   *
   * ~450 dos 528 screenings cabem numa pagina so, e cada um recebia cota de 15 para usar 1. A cota
   * reservada onde nao havia o que ler era tirada de quem tinha: o gigante levava as mesmas 15.
   *
   * ESTE TESTE E A PROVA DE MUTACAO DA REPARTICAO: voltando a dividir igualmente, o pequeno recebe
   * 15 e a primeira assercao cai; ignorando o `total` conhecido, todos viram desconhecidos, o
   * pequeno recebe 13 e ela cai do mesmo jeito.
   */
  it("REPARTE POR NECESSIDADE: o pequeno leva 1 pagina e o gigante leva as 14 dele", () => {
    const plano = planoDaVarredura({
      screenings: screeningsDe(528),
      orcamento: DIGAI_TETO_REQ_POR_CICLO,
      totaisConhecidos: baseMedida(528),
    });
    const cota = (i: number) => plano.varrer[i]?.paginasPermitidas;
    expect(cota(0), "1.225 candidatos com folga de 10% sao 14 paginas.").toBe(14);
    expect(cota(100), "58 candidatos cabem em UMA pagina, e e uma que ele leva (antes: 15).").toBe(1);
    expect(cota(5), "284 candidatos com folga sao 4 paginas (antes: 15).").toBe(4);
    expect(
      plano.paginasAutorizadas,
      "754 paginas autorizadas de 7.999 disponiveis. A igualitaria autorizava 528 x 15 = 7.920 para ler as mesmas ~682.",
    ).toBe(754);
    expect(plano.cortadosPorOrcamento, "com a base de hoje nao ha corte nenhum.").toBe(0);
  });

  /**
   * ─ CASO 1: O SCREENING QUE A GENTE NUNCA VIU ──────────────────────────────────────────────────
   *
   * Sem cursor nao ha `total`, e os dois erros sao assimetricos: dar POUCO perde gente de verdade
   * (o fornecedor NAO ORDENA, entao quem cai na pagina cortada e sorteado); dar DEMAIS gasta
   * orcamento de todo mundo. Erra-se para CIMA porque a cota e AUTORIZACAO e nao gasto (o vazio
   * para em `PAGINA_VAZIA` na primeira requisicao) e porque o pior caso cabe: 528 x 13 + 1 = 6.865.
   */
  it("DESCONHECIDO leva a cota de descoberta, que e o maior screening ja medido", () => {
    expect(necessidadeDePaginasDigai(null)).toBe(DIGAI_PAGINAS_DE_DESCOBERTA);
    expect(necessidadeDePaginasDigai(undefined)).toBe(DIGAI_PAGINAS_DE_DESCOBERTA);
    expect(
      necessidadeDePaginasDigai(0),
      "`0` e a linha recem-inserida pelo tick, e NAO um screening vazio: tratar como vazio daria UMA pagina a quem pode ter 1.225, no ciclo em que ele aparece.",
    ).toBe(DIGAI_PAGINAS_DE_DESCOBERTA);
    expect(
      DIGAI_PAGINAS_DE_DESCOBERTA,
      "13 e o maior medido (1.225 candidatos em paginas de 100), e nao um numero redondo.",
    ).toBe(Math.ceil(1_225 / DIGAI_TAMANHO_DA_PAGINA));
    expect(
      528 * DIGAI_PAGINAS_DE_DESCOBERTA + 1,
      "a partida a frio (base inteira desconhecida) tem de caber no teto, senao a generosidade vira corte.",
    ).toBeLessThanOrEqual(DIGAI_TETO_REQ_POR_CICLO);
  });

  /**
   * ─ CASO 2: O `total` DO CURSOR E VELHO POR CONSTRUCAO, E A FOLGA E O QUE PAGA POR ISSO ────────
   *
   * Ele foi gravado no ciclo anterior, 15 min atras. Cravar `ceil(total/100)` cortaria justamente
   * quem CRESCEU. A folga e de 10% e PROPORCIONAL: 122 candidatos de sobra no maior medido e
   * nenhuma pagina extra nos 450 que cabem em uma. "Uma pagina a mais para todos" foi recusado por
   * custo medido: levaria o ciclo de ~682 para ~1.210 requisicoes, 90% da janela de 15 min.
   */
  it("A FOLGA DE 10% sobre o `total` guardado, e ela e proporcional ao tamanho", () => {
    expect(DIGAI_FOLGA_DA_NECESSIDADE).toBe(0.1);
    expect(necessidadeDePaginasDigai(58), "58 x 1,1 = 63,8: uma pagina.").toBe(1);
    expect(
      necessidadeDePaginasDigai(100),
      "quem encheu a pagina exata e o mais provavel de ter crescido: leva a segunda.",
    ).toBe(2);
    expect(
      necessidadeDePaginasDigai(1_225),
      "13 paginas de necessidade crua e 14 com folga: 122 candidatos de margem no maior medido.",
    ).toBe(14);
    expect(
      necessidadeDePaginasDigai(1_225),
      "PROVA DE MUTACAO DA FOLGA: sem ela o maior medido receberia 13 e o primeiro candidato novo do ciclo seria cortado.",
    ).toBeGreaterThan(Math.ceil(1_225 / DIGAI_TAMANHO_DA_PAGINA));
    const crescimentoPorCiclo = 0.043 / 96;
    expect(
      DIGAI_FOLGA_DA_NECESSIDADE / crescimentoPorCiclo,
      "a +4,3% ao dia, 10% sao ~220 ciclos de 15 min de folga.",
    ).toBeGreaterThan(200);
  });

  /**
   * ─ CASO 3: A SOMA DAS NECESSIDADES PASSOU DO ORCAMENTO. QUEM E CORTADO? ───────────────────────
   *
   * Cortar O MAIOR primeiro concentra a perda inteira em quem tem mais gente, e o deixa
   * PERMANENTEMENTE cego do mesmo trecho. Cortar O MENOR mal libera orcamento, porque os pequenos
   * ja estao no piso de uma pagina. O adotado e PROPORCIONAL: todos encolhem na mesma fracao, pelo
   * metodo do maior resto, e ninguem e eleito vitima.
   */
  it("CORTE PROPORCIONAL: todos encolhem na mesma fracao, ninguem cai abaixo do piso", () => {
    const screenings = screeningsDe(10);
    // Cinco gigantes de 20 paginas e cinco de uma: necessidade 105, orcamento util 59.
    const totais = new Map(screenings.map((s, i) => [s.id, i < 5 ? 5_000 : 58]));
    const plano = planoDaVarredura({ screenings, orcamento: 60, totaisConhecidos: totais });
    const cotas = plano.varrer.map((i) => i.paginasPermitidas);

    expect(cotas.reduce((a, b) => a + b, 0), "a soma nunca passa do orcamento util.").toBeLessThanOrEqual(59);
    expect(
      cotas.slice(5),
      "os pequenos NAO sao cortados abaixo do piso, e os deles ja estavam satisfeitos com 1.",
    ).toEqual([1, 1, 1, 1, 1]);
    expect(
      cotas.slice(0, 5),
      "os cinco gigantes encolhem JUNTOS e quase igual (54 paginas para 5 x 20 de necessidade), com o troco do maior resto. Cortar 'o maior primeiro' daria 20,20,20,... e zero para o ultimo.",
    ).toEqual([11, 11, 11, 11, 10]);
    expect(
      plano.cortadosPorOrcamento,
      "sao os cinco gigantes que receberam menos do que precisavam, e o corte e CONTADO para virar log.",
    ).toBe(5);
  });

  it("CABENDO TUDO, ninguem e cortado e o troco segue para a proxima pagina da listagem", () => {
    const screenings = screeningsDe(3);
    const plano = planoDaVarredura({
      screenings,
      orcamento: 100,
      totaisConhecidos: new Map([
        ["sc-0", 1_225],
        ["sc-1", 58],
        ["sc-2", 284],
      ]),
    });
    expect(plano.varrer.map((i) => i.paginasPermitidas)).toEqual([14, 1, 4]);
    expect(plano.cortadosPorOrcamento).toBe(0);
    expect(plano.orcamentoRestante, "99 restantes menos 19 autorizados = 80 de troco.").toBe(80);
  });

  /**
   * ─ CASO 5: O NOVO PONTO DE RUPTURA, CALCULADO PELA FUNCAO DE VERDADE ──────────────────────────
   *
   * ┌─ O NUMERO VELHO E O NOVO, e a diferenca e de NOVE VEZES ────────────────────────────────────┐
   * │ Com a reparticao IGUALITARIA a cota caia com N, e a cobertura do maior medido quebrava em    │
   * │ N = 616: +17% sobre a base de hoje, ou ~4 DIAS a +4,3% ao dia.                                │
   * │                                                                                               │
   * │ Com a reparticao POR NECESSIDADE a cota cai com a SOMA DAS NECESSIDADES, e a base e TORTA:   │
   * │ a ruptura vai para N = 5.524 (o gigante perde a FOLGA) e N = 5.762 (perde a COBERTURA de     │
   * │ verdade, as 13 paginas dos 1.225 medidos). Sao ~56 e ~57 DIAS no mesmo ritmo.                 │
   * │                                                                                               │
   * │ O EFEITO QUE IMPORTA: a cobertura deixou de ser o gargalo e passou a vencer JUNTO com o      │
   * │ freio (~58 dias). As duas grandezas que o `DIGAI_TETO_REQ_POR_CICLO` mandava nao confundir   │
   * │ agora coincidem.                                                                              │
   * └───────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O CALCULO E PELA FUNCAO DE PRODUCAO, e nao por uma formula copiada para o teste: a versao
   * anterior deste teste repetia `min(20, floor((teto-1)/N))` a mao, e uma formula copiada nao pega
   * mudanca nenhuma na reparticao. Aqui, mexer no teto, na folga ou no criterio de corte move o
   * numero e este teste cobra o novo.
   */
  it("A COBERTURA QUEBRA EM N = 5.524 (folga) e N = 5.762 (cobertura), ~56 dias e nao mais ~4", () => {
    const cotaDoGigante = (n: number) =>
      planoDaVarredura({
        screenings: screeningsDe(n),
        orcamento: DIGAI_TETO_REQ_POR_CICLO,
        totaisConhecidos: baseMedida(n),
      }).varrer[0]?.paginasPermitidas ?? 0;

    /*
     * VARREDURA EM DOIS PASSOS (grosso de 32 em 32, depois fino), e nao linear de 1 em 1: o plano e
     * recalculado do zero a cada N, entao a busca linear ate ~5.800 custava 28 SEGUNDOS de suite. A
     * resposta e a MESMA, porque o passo fino comeca no ultimo N que ainda cobria.
     */
    const primeiro = (limite: number) => {
      let grosso = 528;
      while (grosso <= 8_000 && cotaDoGigante(grosso) >= limite) grosso += 32;
      for (let n = Math.max(528, grosso - 32); n <= 8_000; n += 1) {
        if (cotaDoGigante(n) < limite) return n;
      }
      return 0;
    };

    const rupturaDaFolga = primeiro(necessidadeDePaginasDigai(1_225));
    const rupturaDaCobertura = primeiro(Math.ceil(1_225 / DIGAI_TAMANHO_DA_PAGINA));
    expect(rupturaDaFolga, "o gigante deixa de receber as 14 de necessidade.").toBe(5_524);
    expect(
      rupturaDaCobertura,
      "e so aqui ele deixa de cobrir os 1.225 candidatos medidos. O primeiro e o alarme, o segundo e o dano.",
    ).toBe(5_762);
    expect(cotaDoGigante(5_523), "em 5.523 ainda leva as 14.").toBe(14);

    const dias = (n: number) => Math.log(n / 528) / Math.log(1.043);
    expect(dias(rupturaDaCobertura), "~57 dias a +4,3% ao dia.").toBeGreaterThan(50);
    expect(
      dias(rupturaDaCobertura) / dias(616),
      "PROVA DE MUTACAO DA RUPTURA: a igualitaria quebrava em ~4 dias (N = 616). Voltando a ela, esta razao desaba para 1.",
    ).toBeGreaterThan(10);
  });

  it("A SOMA DO QUE O PLANO AUTORIZA NUNCA PASSA DO QUE ELE RECEBEU, em varios tamanhos e formas", () => {
    for (const n of [1, 5, 60, 522, 1_500, 3_000, 9_000]) {
      const screenings = Array.from({ length: n }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
      // Duas formas: base DESCONHECIDA (cota de descoberta) e base TORTA com um gigante de 20.
      const tortos = new Map(screenings.map((s, i) => [s.id, i % 7 === 0 ? 9_000 : 58]));
      for (const totais of [undefined, tortos]) {
        const plano = planoDaVarredura({
          screenings,
          orcamento: DIGAI_TETO_REQ_POR_CICLO,
          totaisConhecidos: totais,
        });
        const gasto = 1 + plano.paginasAutorizadas;
        const somado = plano.varrer.reduce((a, i) => a + i.paginasPermitidas, 0);
        expect(somado, "o campo agregado tem de bater com a soma das cotas, item a item.").toBe(
          plano.paginasAutorizadas,
        );
        expect(gasto, `com ${n} screening(s), o plano autorizou ${gasto} requisicoes.`).toBeLessThanOrEqual(
          DIGAI_TETO_REQ_POR_CICLO,
        );
        for (const item of plano.varrer) {
          expect(
            item.paginasPermitidas,
            "o PISO de uma pagina e o que impede um screening de ficar inteiramente invisivel.",
          ).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("a requisicao da propria listagem conta no orcamento", () => {
    const screenings = Array.from({ length: 10 }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
    const plano = planoDaVarredura({ screenings, orcamento: 6 });
    expect(plano.varrer, "orcamento 6 menos a listagem = 5 screenings.").toHaveLength(5);
    expect(plano.foraDoTeto).toBe(5);
    expect(plano.estourou).toBe(true);
  });

  it("O CORTE DA LISTAGEM tambem registra, e tambem diz que o proximo ciclo NAO recupera", async () => {
    // 2 screenings numa listagem que declara 9: ha proxima pagina. Orcamento 3 = 1 (listagem) + 2
    // (uma pagina por screening), entao sobra ZERO e a pagina 2 da listagem e CORTE.
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1"), screeningFingido("sc-2")], 9),
    );
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarTick(1, 3);
    aviso.mockRestore();
    log.mockRestore();

    expect(r.proximaPaginaDaListagem, "sem orcamento, a pagina 2 da listagem nao e pedida.").toBeNull();
    expect(avisos.join("\n")).toContain("LISTAGEM foi CORTADA");
    expect(
      avisos.join("\n"),
      "com o MESMO orcamento, o proximo ciclo corta no mesmo ponto: dizer que os demais 'ficam para o proximo ciclo' seria desarmar quem le.",
    ).toContain("NAO ficam para o");
  });

  it("LISTAGEM PAGINADA e conservadora e PASSA O RESTO ADIANTE (furo B do veto)", () => {
    const screenings = Array.from({ length: 10 }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
    const plano = planoDaVarredura({
      screenings,
      orcamento: 100,
      haProximaPaginaDaListagem: true,
    });
    expect(
      plano.varrer[0]?.paginasPermitidas,
      "sem saber quantos screenings ainda virao, esta pagina leva UMA por screening.",
    ).toBe(1);
    expect(
      plano.orcamentoRestante,
      "99 restantes menos 10 gastos = 89 para a proxima pagina da listagem. Antes, ela recomecava com o teto CHEIO.",
    ).toBe(89);
  });

  /**
   * ─ A IGUALITARIA E O CASO DEGENERADO DA NOVA REGRA, E ISSO E A PROVA DE QUE ELA A GENERALIZA ──
   *
   * Com TODOS desconhecidos as necessidades sao iguais, e o corte proporcional devolve exatamente a
   * divisao igualitaria de antes (`floor(99/10)` = 9), com o troco indo para quem tem maior resto.
   */
  it("SEM NADA CONHECIDO, a reparticao degenera na IGUALITARIA de antes", () => {
    const screenings = Array.from({ length: 10 }, (_, i) => ({ id: `sc-${i}`, updatedAt: null, status: "PUBLISHED" }));
    const plano = planoDaVarredura({ screenings, orcamento: 100, haProximaPaginaDaListagem: false });
    const cotas = plano.varrer.map((i) => i.paginasPermitidas);
    expect(
      cotas,
      "cota igual para todos (com o troco do maior resto), e nao 13 para uns e 1 para outros: sem `total` nao ha necessidade que os distinga.",
    ).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 9]);
    expect(
      cotas.reduce((a, b) => a + b, 0),
      "99 restantes, 99 gastos. A igualitaria de antes dava `floor(99/10)` = 9 a cada um e DEIXAVA 9 requisicoes orfas.",
    ).toBe(99);
  });

  it("o teto de paginas por screening limita a NECESSIDADE, e nao o contrario", () => {
    const plano = planoDaVarredura({
      screenings: [{ id: "sc-1", updatedAt: null, status: "PUBLISHED" }],
      orcamento: 10_000,
      // 5.000 candidatos pedem 55 paginas com folga: quem manda e o anti-laco.
      totaisConhecidos: new Map([["sc-1", 5_000]]),
    });
    expect(
      plano.varrer[0]?.paginasPermitidas,
      "com orcamento enorme e um screening enorme, quem manda e o teto anti-laco.",
    ).toBe(DIGAI_TETO_PAGINAS_POR_SCREENING);
  });

  it("screening repetido na listagem nao gasta duas requisicoes", () => {
    const plano = planoDaVarredura({
      screenings: [
        { id: "sc-1", updatedAt: null, status: "PUBLISHED" },
        { id: "sc-1", updatedAt: "2026-09-29T00:00:00Z", status: "PUBLISHED" },
        { id: "sc-2", updatedAt: null, status: "PUBLISHED" },
      ],
      orcamento: DIGAI_TETO_REQ_POR_CICLO,
    });
    expect(plano.varrer.map((i) => i.screening.id)).toEqual(["sc-1", "sc-2"]);
  });

  it("NO CICLO DE VERDADE, com a base estourada, a passada PARA no teto e REGISTRA", async () => {
    // 8.500 screenings: 16x a base de hoje (528). O teto so trunca a LISTA quando N passa de 7.999.
    const muitos = Array.from({ length: 8_500 }, (_, i) => screeningFingido(`sc-${i}`));
    const { importacao } = importacaoComClienteDublado(() => paginaDeScreeningsFingida(muitos));
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarTick(1, DIGAI_TETO_REQ_POR_CICLO);
    aviso.mockRestore();
    log.mockRestore();

    expect(
      r.screenings,
      "o teto e de REQUISICOES, e a listagem ja gastou uma: sobram 7.999 para o leque.",
    ).toHaveLength(DIGAI_TETO_REQ_POR_CICLO - 1);
    expect(r.foraDoTeto).toBe(8_500 - (DIGAI_TETO_REQ_POR_CICLO - 1));
    expect(
      r.screenings[0]?.paginasPermitidas,
      "7.999 requisicoes para 7.999 screenings: uma pagina cada.",
    ).toBe(1);
    expect(
      avisos.join("\n"),
      "bater o teto tem de virar uma LINHA DE LOG, que e o que transforma 'a base cresceu' em aviso em vez de incidente com o fornecedor.",
    ).toContain("TETO");
  });

  /**
   * ─ O QUE ESTE TESTE AFIRMAVA ANTES, E POR QUE AQUILO ESTAVA ERRADO ────────────────────────────
   *
   * ELE ASSERIA `attempts x teto / 90 < cadencia`, ou seja, "o pior caso de retentativa CABE NA
   * CADENCIA". A cadencia de 15 min (escolha do diretor, 29/09) tornou isso IMPOSSIVEL, e a conta
   * mostra por que: a janela de 15 min a 90/min tem 1.350 vagas, e o CICLO NOMINAL MEDIDO ja custa
   * 682; com `attempts: 2` o pior caso e 1.364, que ja estoura 1.350.
   *
   * O TESTE NAO FOI APAGADO, E SIM CORRIGIDO NO QUE AFIRMA. A saida preguicosa seria baixar o teto
   * para 675 "para fazer caber", e ela e PIOR: cortaria o ciclo NORMAL de 682, e cortar o ciclo
   * normal e deixar gente de fora.
   *
   * O INVARIANTE ERA ERRADO DESDE O COMECO PORQUE DERIVAVA O TETO DA CADENCIA, E A DEPENDENCIA E A
   * OPOSTA: a cadencia e escolha do diretor (latencia que a operacao aceita), e o teto e freio de
   * crescimento (ate onde a base cresce antes de alguem olhar). Um ciclo mais longo que a cadencia
   * NAO ESTOURA NADA: ele so faz o tick seguinte nao sair, com linha de log. Degradacao prevista.
   *
   * OS DOIS INVARIANTES QUE DE FATO PROTEGEM SAO OS ASSERIDOS ABAIXO, E OS DOIS JA EXISTEM NO
   * CODIGO: o LIMITER segura a vazao em qualquer cadencia, e `temCicloEmAndamento` impede a soma
   * dos ciclos.
   *
   * ─ O QUE ESTES TRES TESTES ALCANCAM, E O QUE ELES NAO ALCANCAM (auditoria de 29/09) ───────────
   *
   * A VERSAO ANTERIOR DESTE COMENTARIO PROMETIA MUTACAO QUE NAO EXISTIA, e o auditor mediu: os
   * testes daqui aseriam o VALOR DA CONSTANTE e DUBLAM a guarda com `vi.fn`, entao trocar o spread
   * do worker por `concurrency: 10`, ou fazer o corpo de `temCicloEmAndamento` devolver `false`,
   * deixava tudo VERDE. Prometer alcance que o codigo nao tem e o defeito que este modulo ja vetou
   * duas vezes no texto de producao; ele vale para o texto de teste pelo mesmo motivo.
   *
   * ENTAO A DIVISAO E ESTA, e ela esta escrita para nao voltar a ser suposta:
   *  - AQUI: o SCHEDULER respeita a resposta da guarda, e a constante vale o que diz;
   *  - `digai-worker.backend.spec.ts`: o WORKER CONSTRUIDO carrega o limiter, e a IMPLEMENTACAO de
   *    `temCicloEmAndamento` responde a verdade (inclusive com o Redis fora). Essas duas mutacoes
   *    morrem la, medidas.
   */
  it("A VAZAO E DO LIMITER, E NAO DA CADENCIA: 90/min com concorrencia 1, em qualquer intervalo", () => {
    expect(
      DIGAI_WORKER_OPTIONS.limiter,
      "quem respeita o teto de 120/min do fornecedor e isto, e nao o intervalo do scheduler.",
    ).toEqual({ max: 90, duration: 60_000 });
    expect(
      DIGAI_WORKER_OPTIONS.concurrency,
      "um job e UMA requisicao: com concorrencia > 1 o limiter continuaria contando jobs, mas a premissa de 'um job, uma requisicao' e o que faz a conta dele ser a vazao real.",
    ).toBe(1);
    const piorCasoReq = DIGAI_TETO_REQ_POR_CICLO * DIGAI_TENTATIVAS_DO_POLLING;
    expect(
      piorCasoReq / (DIGAI_WORKER_OPTIONS.limiter?.max ?? 0),
      "o pior caso NAO cabe na cadencia, e isso e esperado: ele cabe em minutos a 90/min, que e o unico teto que o fornecedor sente.",
    ).toBeGreaterThan(DIGAI_POLLING_INTERVALO_MS / 60_000);
  });

  it("O CICLO LONGO NAO EMPILHA: com o anterior ainda drenando, o tick seguinte NAO SAI", async () => {
    const enfileirarTick = vi.fn(async () => true);
    const fila = {
      enfileirarTick,
      // O ciclo anterior ainda na fila: a 15 min de cadencia com um ciclo de 89 min autorizados,
      // este e o estado NORMAL de degradacao, e nao a excecao.
      temCicloEmAndamento: vi.fn(async () => true),
    } as unknown as DigaiFilaService;
    const config = {
      get: (chave: string) => (chave === "DIGAI_POLLING_ATIVO" ? "true" : undefined),
    } as unknown as ConfigService;
    const scheduler = new DigaiSchedulerService(config, fila);
    const linhas: string[] = [];
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });

    const r = await scheduler.dispararCiclo();
    log.mockRestore();

    expect(r).toEqual({ enfileirado: false, ligado: true });
    expect(
      enfileirarTick,
      "sem esta guarda, o ciclo que passa da cadencia vira fila somada a fila, que e o unico jeito de a cadencia curta virar incidente.",
    ).not.toHaveBeenCalled();
    expect(
      linhas.join("\n"),
      "o tick pulado tem de virar LINHA DE LOG: e assim que 'o ciclo esta passando da cadencia' aparece antes de virar latencia inexplicada.",
    ).toContain("job pendente");
    expect(
      linhas.join("\n"),
      "a fila e COMPARTILHADA com o evento do webhook: um evento em backoff tambem suprime o tick, entao a linha NAO pode afirmar que o culpado e o ciclo anterior. Ela diz o que foi medido.",
    ).toContain("backoff");
  });

  it("AS RETENTATIVAS: 2, e o argumento agora e a taxa de falha medida, nao a cadencia", () => {
    expect(DIGAI_TENTATIVAS_DO_POLLING).toBe(2);
    /*
     * MEDIDO EM 29/09, varrendo a base inteira: 4 falhas em 532 requisicoes (0,75%, timeout do
     * fornecedor), e um screening perdido mesmo com tres tentativas. NO POLLING, FALHA E ATRASO E
     * NAO PERDA: o ciclo rele TUDO 15 min depois. Com 0,75% e duas tentativas, a chance de um
     * screening ficar de fora de UM ciclo e ~1 em 18.000, e mesmo esse volta no ciclo seguinte.
     */
    const taxaDeFalha = 4 / 532;
    expect(taxaDeFalha).toBeLessThan(0.01);
    expect(
      taxaDeFalha ** DIGAI_TENTATIVAS_DO_POLLING,
      "com duas tentativas, o screening que fica de fora de um ciclo e 1 em 18.000, e ele volta 15 min depois.",
    ).toBeLessThan(1 / 10_000);
    expect(
      DIGAI_TENTATIVAS_DO_POLLING,
      "os 5 do evento nao valem aqui: o evento e entregue UMA vez e desistir PERDE a pessoa; o polling rele tudo, e insistir contra um fornecedor que ja esta dando timeout piora a causa.",
    ).toBeLessThan(5);
  });
});

// ── 4. O CURSOR: GRAVA, E NAO PULA NADA ────────────────────────────────────

describe("o cursor e medicao, e nao decisao", () => {
  it("o tick grava o `updatedAt` da LISTAGEM por screening", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1", "2026-09-29T09:00:00Z")]),
    );
    const repo = repositorioDeCursorFingido();
    const varredura = new DigaiVarreduraService(importacao, repo);

    await varredura.executarTick(1);

    expect(
      repo.gravados,
      "o tick grava o `updatedAt` e NAO MEXE no `total`: zerando, o screening CORTADO (que nao tem pagina 1 nesta passada) ficaria com 0 de pe e voltaria a receber cota de desconhecido para sempre.",
    ).toEqual([{ screeningId: "sc-1", updatedAt: "2026-09-29T09:00:00Z" }]);
  });

  it("o cursor NAO pula screening: um screening ja visto continua sendo varrido", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1", "2026-09-29T09:00:00Z")]),
    );
    const repo = repositorioDeCursorFingido();
    (repo.cursorDoScreening as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      updatedAt: "2026-09-29T09:00:00Z",
      total: 58,
    });
    const varredura = new DigaiVarreduraService(importacao, repo);

    const r = await varredura.executarTick(1);

    expect(
      r.screenings.map((i) => i.screeningId),
      "nao esta provado que o `updatedAt` do SCREENING se mexe quando um CANDIDATO finaliza. Pular sem prova perde exatamente quem acabou de finalizar, para sempre e em silencio.",
    ).toEqual(["sc-1"]);
  });

  /**
   * ─ O CICLO DE VERDADE USA O CURSOR PARA REPARTIR, E NAO SO PARA MEDIR (29/09/2026) ────────────
   *
   * Aqui o duble e do REPOSITORIO, e a varredura, o plano e a reparticao sao codigo de producao. E
   * a prova de que o fio existe: trocando a leitura dos totais por um mapa vazio, os dois screenings
   * recebem a mesma cota de descoberta e as assercoes caem.
   */
  it("o tick REPARTE pelo `total` que o ciclo anterior gravou", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-grande"), screeningFingido("sc-pequeno")]),
    );
    const repo = repositorioDeCursorFingido(
      false,
      new Map([
        ["sc-grande", 1_225],
        ["sc-pequeno", 58],
      ]),
    );
    const varredura = new DigaiVarreduraService(importacao, repo);
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarTick(1, DIGAI_TETO_REQ_POR_CICLO);
    log.mockRestore();

    expect(r.screenings).toEqual([
      { screeningId: "sc-grande", paginasPermitidas: 14 },
      { screeningId: "sc-pequeno", paginasPermitidas: 1 },
    ]);
    expect(
      r.orcamentoRestante,
      "7.999 menos as 15 autorizadas. Na igualitaria os dois levavam min(20, floor(7999/2)) = 20, e 40 ficavam reservadas para ler 1.283 candidatos.",
    ).toBe(7_984);
  });

  it("A LEITURA DOS TOTAIS acontece ANTES da gravacao do cursor, senao o tick leria o que acabou de escrever", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1")]),
    );
    const ordem: string[] = [];
    const repo = repositorioDeCursorFingido(false, new Map([["sc-1", 1_225]]));
    (repo.totaisConhecidos as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      ordem.push("leu");
      return new Map([["sc-1", 1_225]]);
    });
    (repo.registrarCursorDoScreening as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        ordem.push("gravou");
        return true;
      },
    );
    const varredura = new DigaiVarreduraService(importacao, repo);
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    await varredura.executarTick(1);
    log.mockRestore();

    expect(ordem).toEqual(["leu", "gravou"]);
  });

  it("SEM CURSOR NENHUM o ciclo roda igual, degradado para a reparticao IGUALITARIA", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1"), screeningFingido("sc-2")]),
    );
    // Banco fora, ou tabela vazia: o repositorio devolve mapa vazio e ninguem tem `total`.
    const repo = repositorioDeCursorFingido();
    const varredura = new DigaiVarreduraService(importacao, repo);
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    const r = await varredura.executarTick(1, DIGAI_TETO_REQ_POR_CICLO);
    log.mockRestore();

    expect(
      r.screenings.map((i) => i.paginasPermitidas),
      "perder a medicao nao pode custar as pessoas da passada: sem `total`, todos levam a cota de descoberta.",
    ).toEqual([DIGAI_PAGINAS_DE_DESCOBERTA, DIGAI_PAGINAS_DE_DESCOBERTA]);
  });

  /**
   * ─ O CORTE DA REPARTICAO REGISTRA, PELA MESMA REGUA DO `CORTE_ORCAMENTO` DA FOLHA ─────────────
   *
   * Repartir por necessidade nao e repartir sem teto. Estourando, alguem le menos do que precisa, e
   * a perda e RECORRENTE: o proximo ciclo rele da pagina 1 com a mesma cota, e o fornecedor NAO
   * ORDENA os resultados. Corte que nao aparece no log e perda silenciosa.
   */
  it("O CORTE DA REPARTICAO VIRA WARN, e ele diz que a perda e RECORRENTE", async () => {
    const muitos = Array.from({ length: 40 }, (_, i) => screeningFingido(`sc-${i}`));
    const { importacao } = importacaoComClienteDublado(() => paginaDeScreeningsFingida(muitos));
    const repo = repositorioDeCursorFingido(
      false,
      new Map(muitos.map((s) => [s.id, 5_000] as const)),
    );
    const varredura = new DigaiVarreduraService(importacao, repo);
    const avisos: string[] = [];
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation((m: unknown) => {
      avisos.push(String(m));
    });
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    // 40 screenings de 20 paginas de necessidade = 800, contra 99 de orcamento util.
    const r = await varredura.executarTick(1, 100);
    aviso.mockRestore();
    log.mockRestore();

    expect(
      r.screenings.reduce((a, i) => a + i.paginasPermitidas, 0),
      "a soma continua cabendo no orcamento: repartir por necessidade nao e repartir sem teto.",
    ).toBeLessThanOrEqual(99);
    expect(avisos.join("\n")).toContain("REPARTICAO POR NECESSIDADE");
    expect(
      avisos.join("\n"),
      "sem dizer que a perda se repete, quem le arquiva o aviso como rotina.",
    ).toContain("RECORRENTE");
  });

  it("falha ao gravar o cursor NAO derruba o ciclo: perder a medicao nao pode custar as pessoas", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1")]),
    );
    const repo = repositorioDeCursorFingido(true);
    const varredura = new DigaiVarreduraService(importacao, repo);
    const aviso = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const r = await varredura.executarTick(1);
    aviso.mockRestore();

    expect(r.screenings.map((i) => i.screeningId), "o leque sai igual.").toEqual(["sc-1"]);
  });
});

// ── 5. O PORTAO DO POLLING, DOS DOIS LADOS ─────────────────────────────────

describe("o terceiro portao: sem `DIGAI_POLLING_ATIVO` a varredura nao dispara sozinha", () => {
  function schedulerCom(valor: string | undefined, cicloEmAndamento = false) {
    const enfileirarTick = vi.fn(async () => true);
    const fila = {
      enfileirarTick,
      temCicloEmAndamento: vi.fn(async () => cicloEmAndamento),
    } as unknown as DigaiFilaService;
    const config = {
      get: (chave: string) => (chave === "DIGAI_POLLING_ATIVO" ? valor : undefined),
    } as unknown as ConfigService;
    return { scheduler: new DigaiSchedulerService(config, fila), enfileirarTick };
  }

  it("LIGADO: com `true`, o ciclo e enfileirado na pagina 1", async () => {
    const { scheduler, enfileirarTick } = schedulerCom("true");
    const r = await scheduler.dispararCiclo();
    expect(r).toEqual({ enfileirado: true, ligado: true });
    expect(enfileirarTick).toHaveBeenCalledWith(1, DIGAI_TETO_REQ_POR_CICLO);
  });

  it("NAO EMPILHA CICLO: com o ciclo anterior ainda na fila, nao enfileira outro", async () => {
    const { scheduler, enfileirarTick } = schedulerCom("true", true);
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const r = await scheduler.dispararCiclo();
    log.mockRestore();
    expect(r).toEqual({ enfileirado: false, ligado: true });
    expect(
      enfileirarTick,
      "o tick nao tem `jobId` (chave fixa ficaria retida e bloquearia o ciclo seguinte), entao sem esta guarda a fila crescia monotonicamente a cada 15 min.",
    ).not.toHaveBeenCalled();
  });

  it("DESLIGADO: ausente nao enfileira nada", async () => {
    const { scheduler, enfileirarTick } = schedulerCom(undefined);
    const r = await scheduler.dispararCiclo();
    expect(r).toEqual({ enfileirado: false, ligado: false });
    expect(enfileirarTick).not.toHaveBeenCalled();
  });

  it("FAIL-CLOSED: o erro de digitacao no `.env` deixa desligado", () => {
    for (const valor of ["TRUE ", "true", "1", "sim", "", undefined, "false"]) {
      const esperado = (valor ?? "").trim().toLowerCase() === "true";
      expect(pollingHabilitado({ DIGAI_POLLING_ATIVO: valor }), `valor ${String(valor)}`).toBe(esperado);
    }
    expect(pollingHabilitado({ DIGAI_POLLING_ATIVO: "1" }), "so `true` liga.").toBe(false);
  });

  it("o scheduler NAO roda no boot, e o timer e `unref` (evita pico a cada restart)", () => {
    const { scheduler, enfileirarTick } = schedulerCom("true");
    const timers: Array<{ unref: () => void }> = [];
    const original = globalThis.setInterval;
    globalThis.setInterval = ((fn: () => void, ms: number) => {
      const t = { unref: vi.fn(), _fn: fn, _ms: ms };
      timers.push(t);
      return t as unknown as NodeJS.Timeout;
    }) as unknown as typeof globalThis.setInterval;
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);

    scheduler.onModuleInit();

    globalThis.setInterval = original;
    log.mockRestore();
    expect(enfileirarTick, "nada e enfileirado no boot.").not.toHaveBeenCalled();
    expect(timers[0]?.unref, "o timer nao segura o processo vivo.").toHaveBeenCalled();
  });

  it("a cadencia e constante nomeada: 15 min, a escolha do diretor, e o ciclo medido cabe nela", () => {
    expect(DIGAI_POLLING_INTERVALO_MS).toBe(15 * 60 * 1000);
    // MEDIDO EM 29/09: 1 listagem + 527 screenings + 154 paginas extras = 682 requisicoes.
    const cicloMs = (682 / 90) * 60_000;
    expect(
      cicloMs,
      "682 requisicoes a 90/min sao 7,6 min: o ciclo ocupa metade da janela de 15 min.",
    ).toBeLessThan(DIGAI_POLLING_INTERVALO_MS);
    expect(
      cicloMs / DIGAI_POLLING_INTERVALO_MS,
      "51% de ocupacao. Passar disso nao quebra nada (o tick seguinte e pulado, com log), mas a latencia real deixa de ser a cadencia nominal.",
    ).toBeLessThan(0.6);
    const cicloDobrado = (1_364 / 90) * 60_000;
    expect(
      cicloDobrado,
      "a base foi de 301 para 528 screenings em 13 dias, +73%: dobrar leva ~16 dias, e ai o ciclo passa da janela e o tick comeca a ser pulado. Esta assercao registra o limite, e por isso e `toBeGreaterThan`.",
    ).toBeGreaterThan(DIGAI_POLLING_INTERVALO_MS);
  });
});

// ── 6. O LEQUE NA FILA: UM JOB E UMA REQUISICAO ────────────────────────────

describe("a fila abre o leque, e quem decide e a varredura", () => {
  /** As opcoes com que TODO job do polling nasce. Ver `DIGAI_TENTATIVAS_DO_POLLING`. */
  const OPCOES = { attempts: DIGAI_TENTATIVAS_DO_POLLING };

  function filaComDubles(varredura: Partial<DigaiVarreduraService>) {
    const adicionados: Array<{ tipo: string; dados: unknown; opcoes?: unknown }> = [];
    const fila = new DigaiFilaService(
      { get: () => undefined } as unknown as ConfigService,
      { ativa: false } as unknown as DigaiImportacaoService,
      varredura as DigaiVarreduraService,
    );
    (fila as unknown as { queue: unknown }).queue = {
      add: vi.fn(async (tipo: string, dados: unknown, opcoes?: unknown) => {
        adicionados.push({ tipo, dados, opcoes });
      }),
    };
    const executar = (fila as unknown as { processar: (j: unknown) => Promise<void> }).processar.bind(fila);
    return { fila, adicionados, executar };
  }

  it("o tick enfileira UM job por screening, e um job e UMA requisicao", async () => {
    const { adicionados, executar } = filaComDubles({
      executarTick: vi.fn(async () => ({
        inerte: false,
        screenings: [
          { screeningId: "sc-1", paginasPermitidas: 2 },
          { screeningId: "sc-2", paginasPermitidas: 2 },
          { screeningId: "sc-3", paginasPermitidas: 2 },
        ],
        foraDoTeto: 0,
        proximaPaginaDaListagem: null,
        orcamentoRestante: 0,
        publicadas: 0,
        foraDoRecorte: 0,
        statusDesconhecidos: 0,
      })),
    });

    await executar({ name: JOB_TICK_DIGAI, data: { pagina: 1 } });

    expect(
      adicionados,
      "o limiter do BullMQ conta JOBS: um job que fizesse as 682 chamadas medidas passaria por baixo dele.",
    ).toEqual([
      { tipo: JOB_PAGINA_DIGAI, dados: { screeningId: "sc-1", pagina: 1, paginasPermitidas: 2 }, opcoes: OPCOES },
      { tipo: JOB_PAGINA_DIGAI, dados: { screeningId: "sc-2", pagina: 1, paginasPermitidas: 2 }, opcoes: OPCOES },
      { tipo: JOB_PAGINA_DIGAI, dados: { screeningId: "sc-3", pagina: 1, paginasPermitidas: 2 }, opcoes: OPCOES },
    ]);
  });

  it("havendo segunda pagina da listagem, o tick se reenfileira COM O ORCAMENTO QUE SOBROU", async () => {
    const { adicionados, executar } = filaComDubles({
      executarTick: vi.fn(async () => ({
        inerte: false,
        screenings: [],
        foraDoTeto: 0,
        proximaPaginaDaListagem: 2,
        orcamentoRestante: 89,
        publicadas: 0,
        foraDoRecorte: 0,
        statusDesconhecidos: 0,
      })),
    });

    await executar({ name: JOB_TICK_DIGAI, data: { pagina: 1, orcamento: 100 } });

    expect(
      adicionados,
      "o furo B do veto era exatamente este: `{ pagina }` sozinho fazia cada pagina de listagem recomecar com o teto CHEIO.",
    ).toEqual([{ tipo: JOB_TICK_DIGAI, dados: { pagina: 2, orcamento: 89 }, opcoes: OPCOES }]);
  });

  it("O ORCAMENTO CHEGA NA FOLHA: o tick passa `paginasPermitidas` para cada screening", async () => {
    const { adicionados, executar } = filaComDubles({
      executarTick: vi.fn(async () => ({
        inerte: false,
        screenings: [{ screeningId: "sc-1", paginasPermitidas: 3 }],
        foraDoTeto: 0,
        proximaPaginaDaListagem: null,
        orcamentoRestante: 0,
        publicadas: 0,
        foraDoRecorte: 0,
        statusDesconhecidos: 0,
      })),
    });

    await executar({ name: JOB_TICK_DIGAI, data: { pagina: 1, orcamento: 1_200 } });

    expect(
      (adicionados[0]?.dados as { paginasPermitidas: number }).paginasPermitidas,
      "sem isto, a folha pedia ate 20 paginas sem consultar orcamento nenhum.",
    ).toBe(3);
  });

  it("a folha REPASSA o orcamento que recebeu ao se reenfileirar", async () => {
    const { adicionados, executar } = filaComDubles({
      executarPaginaDeScreening: vi.fn(async () => ({ inerte: false, lidos: 58, proximaPagina: 2 })),
    });

    await executar({
      name: JOB_PAGINA_DIGAI,
      data: { screeningId: "sc-1", pagina: 1, paginasPermitidas: 4 },
    });

    expect(adicionados).toEqual([
      { tipo: JOB_PAGINA_DIGAI, dados: { screeningId: "sc-1", pagina: 2, paginasPermitidas: 4 }, opcoes: OPCOES },
    ]);
  });

  it("os jobs do polling nascem com `attempts` PROPRIO, porque retentativa e requisicao", async () => {
    const { adicionados, executar } = filaComDubles({
      executarPaginaDeScreening: vi.fn(async () => ({ inerte: false, lidos: 1, proximaPagina: 2 })),
    });

    await executar({
      name: JOB_PAGINA_DIGAI,
      data: { screeningId: "sc-1", pagina: 1, paginasPermitidas: 4 },
    });

    expect(adicionados[0]?.opcoes).toEqual({ attempts: DIGAI_TENTATIVAS_DO_POLLING });
  });

  it("o ciclo INERTE nao abre leque nenhum", async () => {
    const { adicionados, executar } = filaComDubles({
      executarTick: vi.fn(async () => ({
        inerte: true,
        screenings: [],
        foraDoTeto: 0,
        proximaPaginaDaListagem: 2,
        orcamentoRestante: 100,
        publicadas: 0,
        foraDoRecorte: 0,
        statusDesconhecidos: 0,
      })),
    });

    await executar({ name: JOB_TICK_DIGAI, data: { pagina: 1 } });

    expect(adicionados, "sem credencial, nem a paginacao continua.").toEqual([]);
  });

  it("o payload do job e a lista FECHADA de identificador tecnico, e nada mais", async () => {
    const { adicionados, executar } = filaComDubles({
      executarTick: vi.fn(async () => ({
        inerte: false,
        screenings: [{ screeningId: "sc-1", paginasPermitidas: 2 }],
        foraDoTeto: 0,
        proximaPaginaDaListagem: null,
        orcamentoRestante: 0,
        publicadas: 0,
        foraDoRecorte: 0,
        statusDesconhecidos: 0,
      })),
    });

    await executar({ name: JOB_TICK_DIGAI, data: { pagina: 1 } });

    expect(
      Object.keys(adicionados[0]?.dados as Record<string, unknown>),
      "o payload fica no Redis junto de `failedReason`, sem TTL e fora do expurgo que so conhece Postgres.",
    ).toEqual(["screeningId", "pagina", "paginasPermitidas"]);
  });
});

// ── 7. §A.6: O LOG DO CICLO E CONTAGEM ─────────────────────────────────────

describe("zero PII no log do ciclo: so contagem e id tecnico de screening", () => {
  it("o log da folha nao carrega nome, CPF, e-mail nem telefone", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeCandidatosFingida([candidatoFingido("usr-1", true)]),
    );
    vi.spyOn(importacao, "importar").mockResolvedValue({
      escritos: 1,
      adiados: 0,
      ignorados: 0,
      naoFinalizaram: 0,
    });
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const linhas: string[] = [];
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });

    await varredura.executarPaginaDeScreening("sc-1", 1);
    log.mockRestore();

    const juntas = linhas.join("\n");
    for (const valor of [CPF_VALIDO, "Sintetico", "DeTeste", "sintetico@exemplo.invalido", "11900000000"]) {
      expect(juntas, `'${valor}' nao pode aparecer no log do ciclo (secao A.6).`).not.toContain(valor);
    }
    expect(juntas, "o que se loga e contagem e o id do screening, que nao e de ninguem.").toContain("sc-1");
  });

  it("o log do tick nao carrega a URL de acesso do screening", async () => {
    const { importacao } = importacaoComClienteDublado(() =>
      paginaDeScreeningsFingida([screeningFingido("sc-1")]),
    );
    const varredura = new DigaiVarreduraService(importacao, repositorioDeCursorFingido());
    const linhas: string[] = [];
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation((m: unknown) => {
      linhas.push(String(m));
    });

    await varredura.executarTick(1);
    log.mockRestore();

    expect(
      linhas.join("\n"),
      "`webAccessLink` e URL de acesso, na mesma regua da URL do Pandape: nao se persiste nem se loga.",
    ).not.toContain("exemplo.invalido");
  });
});

// ── 8. A ROTA INTERNA: O GUARD, E A FIACAO DELE ────────────────────────────

/**
 * ─ POR QUE ESTA SECAO EXISTE, E ELA VALE PARA AS TRES ROTAS INTERNAS ───────────────────────────
 *
 * ┌─ O VETO DO `seguranca` (29/09), em duas metades ─────────────────────────────────────────────┐
 * │ 1. `InternalTokenGuard` comparava com `!==`, que SAI NO PRIMEIRO BYTE DIFERENTE. O veto nao   │
 * │    veio de fora: tres arquivos ao lado, `digai-webhook.guard.ts`, ja usava `timingSafeEqual`  │
 * │    e explicava por escrito que a diferenca de tempo e mensuravel pela rede.                    │
 * │ 2. NAO HAVIA TESTE DA FIACAO. Como a rota carrega `@Public()`, remover o `@UseGuards` nao     │
 * │    deixava NENHUM teste vermelho e a rota ficava ABERTA. Guarda sem teste e guarda que nao     │
 * │    existe.                                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O GUARD E COMPARTILHADO (`/internal/pandape/tick`, `/internal/clicksign/tick` e o do Digai), entao
 * o teste cobre as TRES fiacoes (§A.26): endurecer um guard compartilhado sem olhar quem mais o usa
 * e exatamente o alcance que a regra manda medir antes.
 */
describe("a rota interna e protegida pelo segredo compartilhado, e a fiacao tem teste", () => {
  function contextoCom(header: unknown) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers: { "x-internal-token": header } }) }),
    } as unknown as ExecutionContext;
  }
  function guardCom(token: string | undefined) {
    return new InternalTokenGuard({
      get: (chave: string) => (chave === "INTERNAL_TOKEN" ? token : undefined),
    } as unknown as ConfigService);
  }

  it("FAIL-CLOSED: sem `INTERNAL_TOKEN` configurado, a rota fica fechada", () => {
    expect(() => guardCom(undefined).canActivate(contextoCom("qualquer"))).toThrow(UnauthorizedException);
    expect(() => guardCom("   ").canActivate(contextoCom("qualquer"))).toThrow(UnauthorizedException);
  });

  it("token certo passa; token errado, ausente ou vazio da 401", () => {
    const guard = guardCom("segredo-sintetico");
    expect(guard.canActivate(contextoCom("segredo-sintetico"))).toBe(true);
    expect(guard.canActivate(contextoCom(["segredo-sintetico"])), "header repetido usa o primeiro.").toBe(true);
    for (const errado of ["segredo-sintetic", "segredo-sintetico-x", "", undefined, "outro"]) {
      expect(() => guard.canActivate(contextoCom(errado)), `token '${String(errado)}'`).toThrow(
        UnauthorizedException,
      );
    }
  });

  it("COMPRIMENTO DIFERENTE da 401, e NAO 500: `timingSafeEqual` LANCA com buffers desiguais", () => {
    const guard = guardCom("segredo-sintetico");
    let capturado: unknown = null;
    try {
      guard.canActivate(contextoCom("x"));
    } catch (err) {
      capturado = err;
    }
    expect(
      capturado,
      "sem o curto-circuito por tamanho, o `throw` do `timingSafeEqual` viraria 500 em vez de 401.",
    ).toBeInstanceOf(UnauthorizedException);
  });

  it("A COMPARACAO E EM TEMPO CONSTANTE, e quem afirma isso e a FONTE do guard", () => {
    const fonte = readFileSync(join(__dirname, "../../pandape/internal-token.guard.ts"), "utf8");
    const codigo = semComentario(fonte);
    expect(
      /timingSafeEqual/.test(codigo),
      "`!==` de string sai no primeiro byte diferente, e quem chuta o segredo byte a byte aprende o token em O(n) tentativas. O precedente da casa e `digai-webhook.guard.ts`.",
    ).toBe(true);
    expect(
      /recebido\s*!==\s*esperado/.test(codigo),
      "a comparacao ingenua nao pode voltar por refatoracao.",
    ).toBe(false);
  });

  it("A FIACAO: as TRES rotas internas declaram o `InternalTokenGuard` e sao `@Public()`", () => {
    const rotas: Array<[string, object]> = [
      ["digai", DigaiPollingController.prototype],
      ["clicksign", ClicksignController.prototype],
      ["pandape", PandapeController.prototype],
    ];
    for (const [nome, proto] of rotas) {
      const handler = (proto as Record<string, unknown>).tick;
      expect(handler, `${nome}: o handler do tick tem de existir.`).toBeTypeOf("function");
      const guards = (Reflect.getMetadata("__guards__", handler as object) ?? []) as unknown[];
      expect(
        guards,
        `${nome}: sem o \`@UseGuards(InternalTokenGuard)\`, a rota e \`@Public()\` e fica ABERTA, sem nenhum teste ficar vermelho.`,
      ).toContain(InternalTokenGuard);
      expect(
        Reflect.getMetadata(IS_PUBLIC_KEY, handler as object),
        `${nome}: a rota e chamada por processo, sem sessao, entao ela e \`@Public()\` de proposito.`,
      ).toBe(true);
    }
  });
});

// ── 8. AS TRES PECAS NOVAS SOB O VARREDOR DE PII ──────────────────────────

/**
 * ─ A RESSALVA DA AUDITORIA DE 29/09, MEDIDA E FECHADA ──────────────────────────────────────────
 *
 * ┌─ O QUE A AUDITORIA APONTOU, E O QUE A MEDICAO MOSTROU ───────────────────────────────────────┐
 * │ A ressalva era que `varredura`, `scheduler` e `polling.controller` estariam FORA do varredor  │
 * │ estatico de PII, porque a sentinela do `zero-pii` lista so `["dominio", "grade"]`.            │
 * │                                                                                               │
 * │ MEDIDO: ELES JA ESTAO DENTRO. A lista da sentinela diz de que pecas aquele ARQUIVO precisa    │
 * │ para acordar; quem define o ESCOPO da varredura e `fonteDoModulo`, que ANDA A PASTA INTEIRA   │
 * │ e concatena todo `.ts` que nao seja de teste. As tres pecas entram por existirem no disco.    │
 * │                                                                                               │
 * │ MAS A PREOCUPACAO DE FUNDO E LEGITIMA, E E ELA QUE ESTE BLOCO FECHA: nada FIXAVA esse escopo. │
 * │ Mover uma peca para uma subpasta fora do andar, ou trocar o varredor por uma lista de         │
 * │ arquivos, tiraria as tres da varredura SEM NENHUM TESTE FICAR VERMELHO, e a proxima linha de  │
 * │ log escrita ali deixaria de ter detector. Aqui o escopo vira assercao.                        │
 * │                                                                                               │
 * │ §A.39 (dono unico): `digai.zero-pii.tester.spec.ts` e do `tester` e nao se edita daqui. Este  │
 * │ bloco vive no spec do `backend` e so CONSOME o helper compartilhado.                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("o varredor de PII alcanca as pecas do polling, e isso esta FIXADO", () => {
  /** As tres pecas que a auditoria apontou, pelo simbolo que so existe dentro de cada uma. */
  const PECAS_DO_POLLING = [
    "class DigaiVarreduraService",
    "class DigaiSchedulerService",
    "class DigaiPollingController",
  ] as const;

  it("as tres pecas do polling estao DENTRO do fonte varrido", () => {
    const fonte = fonteDoModulo();
    for (const peca of PECAS_DO_POLLING) {
      expect(
        fonte.includes(peca),
        `${peca} fora da varredura: toda assercao de "o fonte nao loga campo de pessoa" passaria a ser verdade sobre o vazio, justamente na peca mais nova.`,
      ).toBe(true);
    }
  });

  it("e o que elas logam e id tecnico e contagem, nunca campo de pessoa", () => {
    /*
     * A MESMA REGRA DO `zero-pii`, aplicada as tres pecas: procura chamada de log com nome de campo
     * de pessoa DENTRO dela. Repetida aqui de proposito, porque o que protege o caminho novo tem de
     * ficar vermelho no arquivo de quem escreve o caminho novo.
     */
    const codigo = semComentario(
      [
        readFileSync(join(__dirname, "digai-varredura.service.ts"), "utf8"),
        readFileSync(join(__dirname, "digai-scheduler.service.ts"), "utf8"),
        readFileSync(join(__dirname, "digai-polling.controller.ts"), "utf8"),
      ].join("\n"),
    );
    const suspeitos = [
      ...codigo.matchAll(
        /\b(?:log|warn|error|debug|verbose)\s*\([^)]{0,200}?\b(cpf|email|phoneNumber|telefone|nome|name|documento)\b/gi,
      ),
    ].map((m) => m[0].slice(0, 90));
    expect(
      suspeitos,
      "log de aplicacao nao carrega dado sensivel (§A.6, protocolo secao 1). O que sai e id de screening, pagina e contagem.",
    ).toEqual([]);
  });
});
