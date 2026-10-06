import { afterEach, describe, expect, it, vi } from "vitest";
import { montarArnesCiclo } from "./gi-ciclo.arnes";

/**
 * TESTE A, O CICLO: FECHA, RECUA, FECHA DE NOVO. O GI RECEBE UM ENVIO SO, NUNCA DOIS.
 *
 * Requisito do diretor, e o caminho e REAL e MEDIDO: ha 11 frentes em producao com DOIS eventos
 * `AUDITORIA -> ANALISE_OK` sem reversao entre eles, com intervalos de 3 minutos a 27 dias. O
 * caminho e o `recuarAuditoria`: a regua fecha, um documento e descartado ou volta INCONFORME, a
 * frente RECUA (`concluida` volta a `false`, evento com `reversao: true`), e depois a regua fecha de
 * novo. Duas transicoes legitimas sobre a MESMA pessoa.
 *
 * ┌─ O ACHADO QUE ESTE ARQUIVO PROVA, e ele e a razao de o arquivo existir ────────────────────────┐
 * │ O gate da transicao NAO protege a segunda passagem, e nao tem como proteger: o recuo poe        │
 * │ `concluida` de volta em `false`, entao o refechamento e uma transicao DE VERDADE, o             │
 * │ `UPDATE ... AND concluida = false` afeta UMA linha, `transicionou` e `true` e o gatilho do GI   │
 * │ DISPARA de novo. Quem segura o segundo POST e SO o `jaEnviado` (o carimbo                       │
 * │ `admissao_dados_gi.gi_enviado_em`). A protecao do "um envio so" repousa sobre UMA trava, nao    │
 * │ duas, e os testes abaixo medem as duas afirmacoes separadamente para que a troca de uma pela    │
 * │ outra nao passe calada.                                                                         │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: entrada sintetica (CPF da faixa reservada 999). §A.11: nenhum travessao.
 */

afterEach(() => vi.restoreAllMocks());

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O CICLO COMPLETO: UM ENVIO SO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("CICLO fecha, recua, fecha de novo: UM envio so ao GI", () => {
  it("as tres passagens somam UM POST para a folha e UM carimbo", async () => {
    const ctx = montarArnesCiclo();

    // 1. A regua FECHA: transicao legitima, a pessoa vai para a folha.
    ctx.estado.reguaCompleta = true;
    await ctx.passar();
    expect(ctx.criar, "a passagem que FECHA a regua nao enviou").toHaveBeenCalledTimes(1);
    expect(ctx.marcarEnviado, "enviou e nao carimbou a idempotencia").toHaveBeenCalledTimes(1);

    // 2. UM DOCUMENTO VOLTA: a regua des-completa e a frente RECUA.
    ctx.estado.reguaCompleta = false;
    await ctx.passar();

    // 3. A regua FECHA DE NOVO. Esta e a segunda transicao, e e ela que o requisito protege.
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    expect(
      ctx.criar.mock.calls.length,
      "SEGUNDO POST para a folha do fornecedor no refechamento: a mesma pessoa foi mandada duas vezes",
    ).toBe(1);
    expect(
      ctx.marcarEnviado.mock.calls.length,
      "carimbou duas vezes: houve um segundo envio",
    ).toBe(1);
  });

  it("o recuo ACONTECEU de verdade no meio do ciclo (senao o teste nao mede o que diz medir)", async () => {
    const ctx = montarArnesCiclo();

    await ctx.passar();
    ctx.estado.reguaCompleta = false;
    await ctx.passar();

    const auditoria = ctx.estado.frentes.find((f) => f.tipo === "AUDITORIA");
    expect(auditoria?.concluida, "a frente NAO recuou: o ciclo medido nao e o ciclo real").toBe(
      false,
    );
    expect(
      ctx.eventos.some((e) => e.tipo === "AUDITORIA" && e.reversao),
      "o recuo nao gravou o evento de reversao: a trilha do recuo desapareceu",
    ).toBe(true);
  });

  it("o refechamento grava a SEGUNDA transicao na trilha (duas idas a ANALISE_OK, uma reversao no meio)", async () => {
    const ctx = montarArnesCiclo();

    await ctx.passar();
    ctx.estado.reguaCompleta = false;
    await ctx.passar();
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    const idas = ctx.eventos.filter((e) => e.tipo === "AUDITORIA" && e.paraStatus === "ANALISE_OK");
    expect(
      idas.length,
      "o refechamento nao gravou a segunda ida a ANALISE_OK: o cenario das 11 frentes de producao nao foi reproduzido",
    ).toBe(2);
  });

  it("TRES ciclos seguidos (fecha, recua, fecha, recua, fecha): ainda UM POST so", async () => {
    const ctx = montarArnesCiclo();

    for (let i = 0; i < 3; i += 1) {
      ctx.estado.reguaCompleta = true;
      await ctx.passar();
      ctx.estado.reguaCompleta = false;
      await ctx.passar();
    }
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    expect(
      ctx.criar.mock.calls.length,
      "o vai e vem da regua multiplicou os envios: cada refechamento mandou a pessoa de novo",
    ).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// QUAL TRAVA MORDEU: e o `jaEnviado`, NAO o gate da transicao
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("QUAL das duas travas morde no refechamento", () => {
  it("o gate da TRANSICAO dispara de novo no refechamento: `enviar` e chamado DUAS vezes", async () => {
    /**
     * O recuo poe `concluida` de volta em `false`, entao o `UPDATE ... AND concluida = false` do
     * refechamento afeta UMA linha e `transicionou` e `true`. Nao e defeito do gate: e o que ele
     * significa. Este teste existe para que a afirmacao "quem protege e o gate" nunca seja feita.
     */
    const ctx = montarArnesCiclo();

    await ctx.passar();
    ctx.estado.reguaCompleta = false;
    await ctx.passar();
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    expect(
      ctx.enviar.mock.calls.length,
      "o gatilho deixou de disparar no refechamento: ou o recuo parou de reabrir a frente, ou o gate mudou de significado",
    ).toBe(2);
  });

  it("a trava que MORDE na segunda passagem e a IDEMPOTENCIA: desfecho GI_JA_ENVIADO", async () => {
    const ctx = montarArnesCiclo();

    await ctx.passar();
    ctx.estado.reguaCompleta = false;
    await ctx.passar();
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    const desfechos = await ctx.desfechos();
    expect(desfechos[0]?.motivo, "o primeiro envio nao concluiu como GI_ENVIADO").toBe("GI_ENVIADO");
    expect(
      desfechos[1]?.motivo,
      "a segunda passagem nao foi barrada pelo `jaEnviado`: a unica trava do refechamento deixou de morder",
    ).toBe("GI_JA_ENVIADO");
    expect(desfechos[1]?.enviado).toBe(false);
  });

  it("ACHADO: sem o carimbo, o refechamento MANDA A PESSOA DE NOVO (a protecao nao e redundante)", async () => {
    /**
     * ┌─ O QUE ESTE TESTE REGISTRA, e por que ele asserta o comportamento ATUAL e nao o desejado ───┐
     * │ Apagar o carimbo entre as duas transicoes NAO e hipotese de laboratorio: a linha de         │
     * │ `admissao_dados_gi`, onde o `gi_enviado_em` mora, tem `expurgar_em` com teto de retencao de │
     * │ 30 dias (`RETENCAO_DADOS_GI_MS`, `domain/portal-dados-gi`). Os intervalos medidos entre as  │
     * │ duas idas a ANALISE_OK chegam a 27 DIAS, e o relogio da retencao nao comeca a contar no     │
     * │ envio: comeca quando a linha nasceu (a confirmacao do candidato no Portal). Linha expurgada │
     * │ entre as duas transicoes = carimbo ausente = segundo POST.                                  │
     * │                                                                                             │
     * │ O teste asserta DOIS envios porque e esse o comportamento de hoje, medido, e um teste que   │
     * │ assertasse UM estaria vermelho no gate sem nada ter sido construido. Ele e o canario do      │
     * │ GAP: no dia em que uma segunda trava entrar (por exemplo, recusar o envio quando a frente ja │
     * │ teve ida anterior a ANALISE_OK na trilha), este teste falha e e aqui que se le o porque.     │
     * └─────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const ctx = montarArnesCiclo();

    await ctx.passar();
    ctx.estado.reguaCompleta = false;
    await ctx.passar();
    // A linha de `admissao_dados_gi` expirou pelo TTL de 30 dias entre as duas transicoes.
    ctx.estado.carimbo = false;
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    expect(
      ctx.criar.mock.calls.length,
      "comportamento mudou: havia um segundo POST quando o carimbo falta, e agora nao ha mais (ler o GAP registrado neste teste)",
    ).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O RECUO EM SI NAO ENVIA NADA
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("a passagem que RECUA nao fala com o GI", () => {
  it("regua des-completa: ZERO chamada ao `enviar` e ZERO POST naquela passagem", async () => {
    const ctx = montarArnesCiclo({ carimboInicial: true });

    ctx.estado.reguaCompleta = true;
    await ctx.passar();
    const antes = ctx.enviar.mock.calls.length;

    ctx.estado.reguaCompleta = false;
    await ctx.passar();

    expect(
      ctx.enviar.mock.calls.length - antes,
      "a passagem do RECUO chamou o gatilho do GI: recuar nao e fechar",
    ).toBe(0);
    expect(ctx.criar, "o recuo mandou alguem para a folha").not.toHaveBeenCalled();
  });
});
