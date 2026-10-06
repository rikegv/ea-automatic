import { afterEach, describe, expect, it, vi } from "vitest";
import { montarArnesCiclo } from "../gi/gi-ciclo.arnes";

/**
 * TESTE B, A CORRIDA: A PASSAGEM PERDEDORA NAO ENVIA, NAO INSERE EVENTO E NAO FAZ NASCER O CADASTRO.
 *
 * O pos-veredito tem OITO chamadores, dois deles automaticos em lote (o timer de reconciliacao do
 * Drive, de 10 em 10 minutos, e o runner `db/rearquiva-drive.ts`). Duas passagens simultaneas sobre a
 * MESMA admissao leem as duas a frente com `concluida = false` e as duas tentam fecha-la. O conserto
 * e o `UPDATE ... WHERE id = ? AND concluida = false` dentro da transacao: o banco decide, e
 * exatamente UMA afeta uma linha.
 *
 * ESTE ARQUIVO MEDE A PASSAGEM QUE PERDE, e ela e a que nao tem como ser observada em producao: para
 * ela, `rowCount` e ZERO, e o `return` que vem em seguida e o que impede evento duplicado, Cadastro
 * nascido duas vezes e, sobretudo, um SEGUNDO POST para a folha do fornecedor.
 *
 * E MEDE O FAIL-CLOSED DA CONTAGEM DESCONHECIDA: quando o driver nao informa quantas linhas foram
 * afetadas (`linhasAfetadas` devolve `null`), o lado que CEDE e o do envio. Os efeitos internos
 * seguem (preservam o comportamento de sempre), e ninguem vai para a folha por SUPOSICAO, porque
 * mandar gente para a folha de um terceiro por suposicao e dano irreversivel.
 *
 * O arnes com estado (`gi/gi-ciclo.arnes.ts`) emula o UPDATE condicional contra o mundo. §A.6:
 * entrada sintetica (CPF da faixa reservada 999). §A.11: nenhum travessao.
 */

afterEach(() => vi.restoreAllMocks());

/**
 * O CENARIO: gate da regra 3 ABERTO (EXAME ja concluido) e Cadastro AINDA NAO NASCIDO. E assim que a
 * passagem vencedora tem os tres efeitos (envio, evento e nascimento do Cadastro) para a perdedora
 * poder ser medida pela AUSENCIA deles.
 */
const CENARIO = { exameConcluido: true } as const;

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CANARIO: no mesmo cenario, a passagem VENCEDORA tem os tres efeitos
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("CANARIO da corrida: a passagem VENCEDORA envia, grava o evento e faz nascer o Cadastro", () => {
  it("contagem UMA: um POST, um evento de AUDITORIA e o CADASTRO_CONTRATO nascido", async () => {
    const ctx = montarArnesCiclo(CENARIO);

    await ctx.passar();

    expect(ctx.criar, "a vencedora nao enviou: o cenario nao prova nada sobre a perdedora").toHaveBeenCalledTimes(1);
    expect(
      ctx.eventos.filter((e) => e.tipo === "AUDITORIA" && e.paraStatus === "ANALISE_OK").length,
      "a vencedora nao gravou a transicao na trilha",
    ).toBe(1);
    expect(
      ctx.frentesNascidas,
      "o Cadastro nao nasceu na vencedora: a ausencia dele na perdedora seria vazia",
    ).toContain("CADASTRO_CONTRATO");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// O UPDATE E CONDICIONAL: a condicao mora na CLAUSULA, nao no duble
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("o UPDATE da conclusao e CONDICIONAL (`WHERE id = ? AND concluida = false`)", () => {
  /**
   * SEM ESTE TESTE A CORRIDA NAO ESTA COBERTA, e a razao e desconfortavel: todo o resto deste arquivo
   * mede o que o codigo FAZ com a contagem que recebe, e nenhum teste sem Postgres mede de onde a
   * contagem vem. Tirar o `eq(frentesAdmissao.concluida, false)` do `where` devolveria o UPDATE a ser
   * incondicional (as DUAS passagens simultaneas afetariam uma linha cada, as DUAS se diriam
   * vencedoras, as DUAS enviariam), e nenhuma assercao sobre contagem notaria, porque a contagem
   * passou a ser um duble. Entao a condicao e medida onde ela existe: na clausula.
   */
  it("a clausula referencia a coluna `concluida`, e nao so o `id` da frente", async () => {
    const ctx = montarArnesCiclo(CENARIO);

    await ctx.passar();

    expect(ctx.whereDaConclusao.length, "o UPDATE da conclusao nao foi feito").toBe(1);
    expect(
      ctx.whereDaConclusao[0],
      "o UPDATE da conclusao voltou a ser INCONDICIONAL: sem `concluida = false` no where, as duas passagens simultaneas se dizem vencedoras e as duas enviam",
    ).toContain("concluida");
    expect(ctx.whereDaConclusao[0], "o UPDATE deixou de ser enderecado a frente").toContain("id");
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// A PERDEDORA: `afetadas === 0`
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("A PERDEDORA da corrida (`UPDATE` afetou ZERO linhas)", () => {
  it("NAO manda ninguem para a folha: zero chamada ao gatilho e zero POST", async () => {
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "zero" });

    await ctx.passar();

    expect(
      ctx.enviar,
      "a perdedora chamou o gatilho do GI: as duas passagens simultaneas mandariam a mesma pessoa",
    ).not.toHaveBeenCalled();
    expect(ctx.criar, "a perdedora tocou a porta do POST para a folha").not.toHaveBeenCalled();
    expect(ctx.marcarEnviado).not.toHaveBeenCalled();
  });

  it("NAO insere evento de transicao: a trilha nao ganha uma segunda ida a ANALISE_OK", async () => {
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "zero" });

    await ctx.passar();

    expect(
      ctx.eventos.filter((e) => e.tipo === "AUDITORIA").length,
      "a perdedora gravou evento: a trilha da frente passa a mostrar duas conclusoes para uma",
    ).toBe(0);
  });

  it("NAO faz nascer o Cadastro: o nascimento e DAQUELA passagem, nao desta", async () => {
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "zero" });

    await ctx.passar();

    expect(
      ctx.frentesNascidas,
      "a perdedora fez o Cadastro nascer: o efeito que pertence a vencedora foi duplicado",
    ).toEqual([]);
  });

  it("a perdedora NAO quebra: o pos-veredito devolve progresso e sinalizador normalmente", async () => {
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "zero" });

    const out = await ctx.passar();

    expect(out.progresso.completa, "a perdedora deixou de devolver o progresso da regua").toBe(true);
    expect(out.sinalizador, "a perdedora deixou de devolver o sinalizador").toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// FAIL-CLOSED: contagem DESCONHECIDA (`null`) nao envia
// ══════════════════════════════════════════════════════════════════════════════════════════════════

describe("FAIL-CLOSED da contagem DESCONHECIDA (o driver nao informou quantas linhas)", () => {
  it("`UPDATE` resolvendo SEM contagem: ZERO envio (transicao suposta nao manda gente para a folha)", async () => {
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "desconhecida" });

    await ctx.passar();

    expect(
      ctx.enviar,
      "contagem desconhecida virou transicao SUPOSTA e o gatilho disparou: alguem vai para a folha do fornecedor por suposicao",
    ).not.toHaveBeenCalled();
    expect(ctx.criar, "POST para a folha com a transicao apenas SUPOSTA").not.toHaveBeenCalled();
    expect(ctx.marcarEnviado).not.toHaveBeenCalled();
  });

  it("contagem desconhecida NAO desliga os efeitos internos: a escrita aconteceu, so o sinal nao veio", async () => {
    /**
     * A assimetria e deliberada e vale registrar: o que CEDE e o ENVIO, nao a esteira. A frente foi
     * mesmo fechada pelo `UPDATE` (o driver so nao disse quantas linhas), entao evento e nascimento do
     * Cadastro seguem, preservando o comportamento de sempre. Se um dia os efeitos internos tambem
     * passarem a ceder, este teste falha e a decisao volta a mesa em vez de mudar calada.
     */
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "desconhecida" });

    await ctx.passar();

    expect(
      ctx.eventos.filter((e) => e.tipo === "AUDITORIA" && e.paraStatus === "ANALISE_OK").length,
      "a contagem desconhecida passou a derrubar a trilha da frente tambem",
    ).toBe(1);
    expect(
      ctx.frentesNascidas,
      "a contagem desconhecida passou a impedir o nascimento do Cadastro: o gate da regra 3 ficaria fechado com a auditoria concluida",
    ).toContain("CADASTRO_CONTRATO");
  });

  it("contagem desconhecida DUAS vezes seguidas: continua ZERO envio", async () => {
    const ctx = montarArnesCiclo({ ...CENARIO, contagemDaConclusao: "desconhecida" });

    await ctx.passar();
    ctx.estado.reguaCompleta = false;
    await ctx.passar();
    ctx.estado.reguaCompleta = true;
    await ctx.passar();

    expect(
      ctx.criar.mock.calls.length,
      "o ciclo com contagem desconhecida acabou mandando alguem para a folha",
    ).toBe(0);
  });
});
