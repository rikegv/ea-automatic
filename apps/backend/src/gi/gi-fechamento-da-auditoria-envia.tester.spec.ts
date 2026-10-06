import { afterEach, describe, expect, it, vi } from "vitest";
import type { FuncionarioSelecao } from "../domain/portal-dados-gi";
import {
  ADM_SELECT,
  PESSOA,
  USER,
  montarArnesAutomatico,
  transicaoArmada,
} from "./gi-automatico.arnes";

/**
 * O FECHAMENTO DA AUDITORIA MANDA A PESSOA PARA O GI, e manda UMA vez, na TRANSICAO.
 *
 * Escrito pelo `tester` A PARTIR DO REQUISITO do diretor (§A.38 / §A.40 regra 2), ANTES de o
 * `backend` escrever o codigo: estes testes DEVEM falhar enquanto o gatilho automatico for o no-op
 * de hoje, e passar quando ele enviar de verdade. Sem Postgres e sem rede.
 *
 * O requisito, nas palavras do diretor: "quando a auditoria do candidato fecha, no momento da
 * entrega, o sistema manda a pessoa para o GI. Automaticamente, sem ninguem clicar."
 *
 * Os invariantes 1, 2, 3 e 5 moram aqui. O invariante 4 (as seis guardas continuam mordendo no
 * caminho automatico) mora em `gi-automatico-as-seis-guardas-mordem.tester.spec.ts`.
 *
 * O arnes e a decisao de desenho dele estao em `gi-automatico.arnes.ts`. O resumo: o servico do GI
 * entra INTEIRO e o espiao e `criarFuncionarioSelecao`, porque o requisito fala de EFEITO ("zero
 * chamada ao cliente do GI") e nao de onde o portao mora.
 *
 * §A.6: toda entrada e sintetica. §A.11: nenhum travessao.
 */

afterEach(() => vi.restoreAllMocks());

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 1: O FECHAMENTO DA AUDITORIA ENVIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 1: a regua FECHA NESTA CHAMADA e a pessoa VAI para o GI", () => {
  it("transicao (frente nao concluida + regua completa) com a flag ARMADA: UM envio e o carimbo", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada());

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "o fechamento da auditoria NAO mandou a pessoa para o GI: o gatilho automatico nao envia",
    ).toHaveBeenCalledTimes(1);
    expect(
      ctx.marcarEnviado,
      "enviou e NAO carimbou a idempotencia: a proxima passagem reenviaria",
    ).toHaveBeenCalledTimes(1);
  });

  it("o envio leva o payload DAQUELA pessoa, nao um payload vazio", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada());

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);
    const payload = ctx.criar.mock.calls[0]?.[0] as FuncionarioSelecao | undefined;

    expect(payload, "o automatico chamou o GI sem montar payload").toBeTruthy();
    expect(payload?.cpf, "o CPF da pessoa nao chegou ao payload do automatico").toBe(PESSOA.cpf);
  });

  it("UMA vez, nao duas: o pos-veredito nao chama o GI mais de uma vez na mesma passagem", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada());

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(ctx.criar.mock.calls.length, "envio DUPLICADO na mesma chamada").toBe(1);
  });

  it("GI nao configurado: a transicao acontece e NADA vai para a rede (fail-closed)", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ giConfigurado: false }));

    const out = await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(ctx.criar, "sem credencial do GI o automatico ainda tocou a rede").not.toHaveBeenCalled();
    expect(out.progresso.completa, "o pos-veredito deixou de concluir sem o GI").toBe(true);
  });

  it("idempotencia: admissao JA enviada nao e reenviada, mesmo na transicao", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ jaEnviado: true }));

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "a idempotencia `jaEnviado` deixou de ser consultada no caminho automatico",
    ).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 2: ESTADO NAO DISPARA, SO TRANSICAO. E o que protege a folha de terceiro.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 2: ESTADO nao dispara, so TRANSICAO", () => {
  /**
   * ESTE E O INVARIANTE CARO, e a razao e aritmetica: `aplicarPosVeredito` tem OITO chamadores, e
   * DOIS sao automaticos em lote (o timer de reconciliacao do Drive, de 10 em 10 minutos, e o runner
   * `db/rearquiva-drive.ts`, que laca sobre TODA admissao sem pasta, 2558 hoje). `progresso.completa`
   * e um ESTADO: uma vez verdadeiro, e verdadeiro para sempre. Se o envio disparar no estado, o
   * runner em lote manda uma LEVA de pessoas para a folha de um terceiro, de uma vez, sem que
   * ninguem tenha fechado auditoria nenhuma.
   */
  it("admissao com a regua JA completa ANTES da chamada: ZERO envio", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ frenteAuditoriaConcluida: true }));

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "o envio disparou no ESTADO e nao na TRANSICAO: o runner em lote vai mandar uma leva para a folha",
    ).not.toHaveBeenCalled();
    expect(ctx.marcarEnviado).not.toHaveBeenCalled();
  });

  it("A LEVA: 50 admissoes JA completas, como o runner em lote as encontra, ZERO envio", async () => {
    /**
     * O cenario do `db/rearquiva-drive.ts`: ele nao escolhe por regua, escolhe por `drive_pasta_url`
     * nulo, e chama `aplicarPosVeredito` em sequencia sobre cada uma. Cinquenta passagens sobre
     * admissao ja fechada tem de somar ZERO.
     */
    const ctx = montarArnesAutomatico(transicaoArmada({ frenteAuditoriaConcluida: true }));

    for (let i = 0; i < 50; i += 1) {
      await ctx.svc.aplicarPosVeredito(`adm-sintetica-${i}`, USER);
    }

    expect(
      ctx.criar.mock.calls.length,
      "a leva do runner em lote foi para a folha: cada passagem sobre admissao ja completa enviou",
    ).toBe(0);
  });

  it("regua INCOMPLETA: ZERO envio, haja o que houver com a frente", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ reguaCompleta: false }));

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(ctx.criar, "enviou com a regua obrigatoria INCOMPLETA").not.toHaveBeenCalled();
  });

  it("duas passagens: a PRIMEIRA (que fecha) envia, a SEGUNDA nao", async () => {
    /**
     * A prova direta da diferenca entre evento e estado: a mesma admissao, duas chamadas, e o ANTES
     * da segunda ja e `concluida: true`, porque a primeira a concluiu.
     */
    const fecha = montarArnesAutomatico(transicaoArmada());
    await fecha.svc.aplicarPosVeredito(ADM_SELECT.id, USER);
    expect(fecha.criar, "a passagem que FECHA a regua nao enviou").toHaveBeenCalledTimes(1);

    const depois = montarArnesAutomatico(transicaoArmada({ frenteAuditoriaConcluida: true }));
    await depois.svc.aplicarPosVeredito(ADM_SELECT.id, USER);
    expect(depois.criar, "a SEGUNDA passagem reenviou a mesma pessoa").not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 3: A FALHA DO GI NAO DERRUBA A AUDITORIA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 3: o GI fora do ar nao quebra a auditoria do candidato", () => {
  it("`criarFuncionarioSelecao` LANCANDO: o pos-veredito COMPLETA e devolve progresso e sinalizador", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ giLanca: true }));

    const out = await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "o envio nem foi tentado: o teste nao esta medindo a falha que diz medir",
    ).toHaveBeenCalledTimes(1);
    expect(out.progresso.completa, "a falha do GI derrubou o progresso da auditoria").toBe(true);
    expect(out.sinalizador, "a falha do GI derrubou o sinalizador da admissao").toBeTruthy();
  });

  it("GI lancando: a AUDITORIA nao deixa de ser auto-concluida por causa do envio", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ giLanca: true }));

    const out = await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      out.auditoriaAuto,
      "o GI fora do ar impediu a auto-conclusao da AUDITORIA: a esteira do candidato travou por causa da folha",
    ).toBeTruthy();
  });

  it("GI devolvendo falha limpa (`ok: false`): o pos-veredito completa e NADA e carimbado", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ giRecusa: true }));

    const out = await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(out.progresso.completa).toBe(true);
    expect(
      ctx.marcarEnviado,
      "carimbou idempotencia de um envio que FALHOU: a pessoa nunca mais seria enviada",
    ).not.toHaveBeenCalled();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// INVARIANTE 5: A FLAG DESARMADA CONTINUA SENDO A CHAVE
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("INVARIANTE 5: sem GI_DISPARO_ARMADO=true, o automatico monta e PARA", () => {
  it("transicao perfeita, flag DESARMADA: ZERO chamada ao cliente do GI", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ armado: false }));

    await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(
      ctx.criar,
      "a flag GI_DISPARO_ARMADO deixou de ser a chave: o automatico enviou com ela desligada",
    ).not.toHaveBeenCalled();
    expect(ctx.marcarEnviado).not.toHaveBeenCalled();
  });

  it("flag DESARMADA nao impede a auditoria de concluir", async () => {
    const ctx = montarArnesAutomatico(transicaoArmada({ armado: false }));

    const out = await ctx.svc.aplicarPosVeredito(ADM_SELECT.id, USER);

    expect(out.progresso.completa).toBe(true);
    expect(out.auditoriaAuto).toBeTruthy();
  });
});
