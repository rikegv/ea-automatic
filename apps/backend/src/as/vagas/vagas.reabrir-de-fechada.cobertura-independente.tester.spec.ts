import { ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import type { AuthUser } from "../../auth/auth.types";
import { VagasService } from "./vagas.service";
import {
  CODIGO_ABERTURA,
  CODIGO_CANCELAMENTO,
  CODIGO_ENTREGA,
  CODIGO_FECHAMENTO,
  COMUM,
  MASTER,
  SUPER,
  T0,
  VAGA,
  bancoDoReabrir,
  escritasEm,
  pessoa,
  portaDe,
  type BancoDoReabrir,
  type Pessoa,
} from "./reabrir-vaga.tester-fake";

/**
 * ─ COBERTURA INDEPENDENTE DA REABERTURA DA VAGA FECHADA, NÍVEL CONSULTOR (§A.38) ────────────────
 *
 * QUEM ESCREVE ESTE ARQUIVO NÃO ESCREVEU A IMPLEMENTAÇÃO. A cobertura sai do REQUISITO, não do
 * código: no modelo "teste antes do código" (§A.40), estes specs devem FALHAR enquanto a frente não
 * existir, e passar quando ela chegar. O REQUISITO, nas palavras do coordenador:
 *
 *   . Hoje `reabrir()` desfaz CANCELAMENTO e ENTREGA, restrito a Master/SUPER_ADMIN. A frente
 *     ACRESCENTA o papel FECHAMENTO e REBAIXA a permissão para CONSULTOR+ (papel COMUM) em TODOS os
 *     casos: `podeReabrir(user)` passa a aceitar COMUM, e as rotas deixam de ter `@Roles`.
 *   . Reabrir FECHADA leva a vaga ao papel ABERTURA (status ABERTA). Os candidatos NÃO são movidos
 *     nem descartados, porque `fechar()` não move ninguém: a vaga "volta com o que tinha".
 *   . Os carimbos do fechamento são LIMPOS: `encerradaEm`, `dataFechamento`, `vagasFechadas`,
 *     `vagasFechadasBanco`, `fechamentoForcado*`, `salarioFechamento`, `dataPrevistaInicio` a nulo, e
 *     `enviarParaAdmissao` a false. Grava `dataReabertura`/`reaberturaPorId=user.id` e um evento de
 *     trilha (quem reabriu e quando).
 *   . FECHADA NÃO exige prazo novo (só a ENTREGA exige).
 *
 * §A.6: as fixtures carregam CPF e contato porque o fake os carrega; nada aqui os asserta, e as
 * asserções de candidatura conferem que NENHUMA linha de pessoa foi tocada. §A.11: sem travessão.
 */

const servico = (banco: BancoDoReabrir) =>
  new VagasService(
    banco.db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
  );

const porta = (banco: BancoDoReabrir) => portaDe(servico(banco));

/** As escritas de `vagas` que são UPDATE: é onde o `.set` da reabertura aparece. */
const updatesDaVaga = (banco: BancoDoReabrir) =>
  escritasEm(banco, "vagas").filter((e) => e.tipo === "update");

/** O `.set` inteiro da reabertura, com todos os UPDATE da vaga fundidos na ordem em que saíram. */
const setDaVaga = (banco: BancoDoReabrir): Record<string, unknown> =>
  Object.assign({}, ...updatesDaVaga(banco).map((u) => u.valores));

const erroDe = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};

/**
 * A VAGA FECHADA, COM TODOS OS CARIMBOS DO FECHAMENTO PREENCHIDOS.
 *
 * O fixture precisa NASCER com os carimbos preenchidos, senão a limpeza não mede nada: um `.set` que
 * esquecesse uma coluna passaria por uma asserção feita contra um valor que já era nulo. O molde do
 * fake já traz `vagasFechadas=2`, `vagasFechadasBanco=1`, `dataFechamento=2026-09-10` e
 * `encerradaEm=T0`; os três que `fechar()` também grava e o molde não trazia entram aqui, mais o
 * trio do fechamento forçado.
 */
function vagaFechada(pessoas: Pessoa[] = []): BancoDoReabrir {
  const banco = bancoDoReabrir({ status: CODIGO_FECHAMENTO, pessoas });
  banco.vaga.salarioFechamento = "3500.00";
  banco.vaga.dataPrevistaInicio = "2026-10-01";
  banco.vaga.enviarParaAdmissao = true;
  banco.vaga.fechamentoForcadoPorId = MASTER.id;
  banco.vaga.fechamentoForcadoEm = T0;
  banco.vaga.fechamentoForcadoFaltavam = 1;
  return banco;
}

// ────────────────────────────────────────────────────────────────────────────────────────────────
// a) FECHADA REABRE PARA ABERTURA, LIMPA OS CARIMBOS E GRAVA REABERTURA + TRILHA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("reabrir a FECHADA leva a vaga para ABERTA e limpa os carimbos do fechamento", () => {
  it("o status volta ao papel ABERTURA, e sem exigir prazo no corpo", async () => {
    const banco = vagaFechada();

    await porta(banco).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });

  it("o `.set` do UPDATE zera TODOS os carimbos do fechamento, campo a campo", async () => {
    const banco = vagaFechada();
    /*
     * A PROVA PELO `.set`, e não só pelo valor final: uma coluna que não é MENCIONADA no update é uma
     * coluna que pode um dia vir de outra leitura e gravar nulo onde não devia, ou ficar congelada
     * com o retrato do fechamento numa vaga que voltou a viver. O requisito é "campo a campo no
     * .set", então cada carimbo é conferido como PROPRIEDADE do objeto gravado, com o valor exato.
     */
    await porta(banco).reabrir(VAGA, {}, MASTER);
    const set = setDaVaga(banco);

    expect(set).toHaveProperty("status", CODIGO_ABERTURA);
    expect(set).toHaveProperty("encerradaEm", null);
    expect(set).toHaveProperty("dataFechamento", null);
    expect(set).toHaveProperty("vagasFechadas", null);
    expect(set).toHaveProperty("vagasFechadasBanco", null);
    expect(set).toHaveProperty("salarioFechamento", null);
    expect(set).toHaveProperty("dataPrevistaInicio", null);
    expect(set).toHaveProperty("enviarParaAdmissao", false);
    expect(set).toHaveProperty("fechamentoForcadoPorId", null);
    expect(set).toHaveProperty("fechamentoForcadoEm", null);
    expect(set).toHaveProperty("fechamentoForcadoFaltavam", null);
  });

  it("o estado final da linha reflete a limpeza (asserção pelo valor, complementar ao `.set`)", async () => {
    const banco = vagaFechada();

    await porta(banco).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.encerradaEm).toBeNull();
    expect(banco.vaga.dataFechamento).toBeNull();
    expect(banco.vaga.vagasFechadas).toBeNull();
    expect(banco.vaga.vagasFechadasBanco).toBeNull();
    expect(banco.vaga.salarioFechamento).toBeNull();
    expect(banco.vaga.dataPrevistaInicio).toBeNull();
    expect(banco.vaga.enviarParaAdmissao).toBe(false);
    expect(banco.vaga.fechamentoForcadoPorId).toBeNull();
    expect(banco.vaga.fechamentoForcadoEm).toBeNull();
    expect(banco.vaga.fechamentoForcadoFaltavam).toBeNull();
  });

  it("grava o carimbo de reabertura: `dataReabertura` e `reaberturaPorId` = quem reabriu", async () => {
    const banco = vagaFechada();

    await porta(banco).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.reaberturaPorId).toBe(MASTER.id);
    expect(banco.vaga.dataReabertura).toBeTruthy();
    // O carimbo também SAI no `.set`, não em um update solto que a transação poderia pular.
    const set = setDaVaga(banco);
    expect(set.reaberturaPorId).toBe(MASTER.id);
    expect(set.dataReabertura).toBeTruthy();
  });

  it("grava um evento de trilha da reabertura (quem reabriu), rumo ao papel ABERTURA", async () => {
    const banco = vagaFechada();

    await porta(banco).reabrir(VAGA, {}, MASTER);

    const eventos = escritasEm(banco, "as_vaga_status_eventos");
    expect(eventos.length).toBeGreaterThan(0);
    const trilha = eventos.find((e) => e.valores.para === CODIGO_ABERTURA);
    expect(trilha, "a reabertura da FECHADA não deixou evento rumo a ABERTA").toBeTruthy();
    expect(trilha!.valores.porId).toBe(MASTER.id);
    expect(trilha!.valores.de).toBe(CODIGO_FECHAMENTO);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// b) FECHADA NÃO MOVE NEM DESCARTA CANDIDATO: VOLTA COM O QUE TINHA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("reabrir a FECHADA preserva os candidatos, sem mover nem restaurar ninguém", () => {
  const comDuasPessoas = () =>
    vagaFechada([
      pessoa("Ana", "ALOCADO", { etapa: "APROVACAO", posicaoLado: "OFICIAL" }),
      pessoa("Bia", "ATIVO", { etapa: "ENTREVISTA_CLIENTE" }),
    ]);

  it("não escreve em `as_candidatura_etapas` nem em `as_candidaturas`", async () => {
    const banco = comDuasPessoas();

    await porta(banco).reabrir(VAGA, {}, MASTER);

    /*
     * `fechar()` não move ninguém, então a reabertura também não tem o que restaurar: chamar o
     * conjunto do cancelamento aqui ressuscitaria quem nunca saiu, e mover para a Triagem (como a
     * ENTREGA faz) descartaria o estado de quem estava alocado. O gesto é SÓ na linha da vaga.
     */
    expect(escritasEm(banco, "as_candidatura_etapas")).toEqual([]);
    expect(escritasEm(banco, "as_candidaturas")).toEqual([]);
  });

  it("a etapa, a situação e o lado de cada candidato ficam exatamente onde estavam", async () => {
    const banco = comDuasPessoas();

    await porta(banco).reabrir(VAGA, {}, MASTER);

    const ana = banco.pessoas[0].candidatura;
    const bia = banco.pessoas[1].candidatura;
    expect(ana.situacao).toBe("ALOCADO");
    expect(ana.etapa).toBe("APROVACAO");
    expect(ana.posicaoLado).toBe("OFICIAL");
    expect(bia.situacao).toBe("ATIVO");
    expect(bia.etapa).toBe("ENTREVISTA_CLIENTE");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// c) FECHADA NÃO EXIGE PRAZO NOVO (AO CONTRÁRIO DA ENTREGA)
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a FECHADA não pede prazo novo, e a ENTREGA continua pedindo", () => {
  it("reabre sem `dataLimite` no corpo, sem lançar e sem renegociar prazo", async () => {
    const banco = vagaFechada();
    const prazoAntes = banco.vaga.dataLimite;

    const e = await erroDe(() => porta(banco).reabrir(VAGA, {}, MASTER));

    expect(e).toBeNull();
    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
    // Sem prazo novo, o prazo vigente não se mexe e nada é copiado para o anterior: a FECHADA não
    // renegocia SLA, só a ENTREGA faz (a SLA dela é contagem regressiva até a previsão de entrega).
    expect(banco.vaga.dataLimite).toBe(prazoAntes);
    expect(banco.vaga.dataLimiteAnterior).toBeNull();
    const set = setDaVaga(banco);
    expect(set.dataLimiteAnterior).toBeUndefined();
  });

  it("a ENTREGA, no mesmo banco, SEGUE recusando quando falta prazo: o contraste é a regra", async () => {
    /*
     * Este par protege a assimetria: se um dia a exigência de prazo migrar para cobrir também a
     * FECHADA, o teste acima fica vermelho; se a exigência da ENTREGA for afrouxada por tabela, este
     * fica. A régua é "só a ENTREGA exige prazo novo", e os dois juntos a travam pelos dois lados.
     */
    const banco = bancoDoReabrir({ status: CODIGO_ENTREGA, encerradaEm: null, pessoas: [] });

    const e = await erroDe(() => porta(banco).reabrir(VAGA, {}, MASTER));

    expect(e).not.toBeNull();
    expect(banco.vaga.status).toBe(CODIGO_ENTREGA);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// d) PERMISSÃO CONSULTOR+: O COMUM REABRE, E `podeReabrir` ACEITA OS TRÊS PAPÉIS
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a reabertura passa a ser de CONSULTOR+ (papel COMUM), em todos os casos", () => {
  const podeReabrirDe = (banco: BancoDoReabrir) => {
    const svc = servico(banco) as unknown as { podeReabrir(u: AuthUser): boolean };
    return (u: AuthUser) => svc.podeReabrir(u);
  };

  it("`podeReabrir` retorna true para COMUM, MASTER e SUPER_ADMIN", () => {
    const pode = podeReabrirDe(vagaFechada());

    expect(pode(COMUM)).toBe(true);
    expect(pode(MASTER)).toBe(true);
    expect(pode(SUPER)).toBe(true);
  });

  it("o COMUM reabre a FECHADA sem levar 403 (`reabrirEhDeMaster` não é lançado)", async () => {
    const banco = vagaFechada();

    const e = await erroDe(() => porta(banco).reabrir(VAGA, {}, COMUM));

    expect(e).not.toBeInstanceOf(ForbiddenException);
    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
    expect(banco.vaga.reaberturaPorId).toBe(COMUM.id);
  });

  it("o COMUM também reabre a CANCELADA: o rebaixamento vale para TODOS os casos", async () => {
    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });

    const e = await erroDe(() => porta(banco).reabrir(VAGA, {}, COMUM));

    expect(e).not.toBeInstanceOf(ForbiddenException);
    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// e) REGRESSÃO: CANCELAMENTO E ENTREGA SEGUEM FUNCIONANDO (MASTER)
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("os caminhos que já existiam não regridem", () => {
  it("a CANCELADA vazia reabre para ABERTA, como hoje", async () => {
    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });

    await porta(banco).reabrir(VAGA, {}, MASTER);

    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });

  it("a ENTREGUE com prazo reabre; sem prazo, recusa, como hoje", async () => {
    const comPrazo = bancoDoReabrir({ status: CODIGO_ENTREGA, encerradaEm: null, pessoas: [] });
    await porta(comPrazo).reabrir(VAGA, { dataLimite: "2026-12-01" }, MASTER);
    expect(comPrazo.vaga.status).toBe(CODIGO_ABERTURA);

    const semPrazo = bancoDoReabrir({ status: CODIGO_ENTREGA, encerradaEm: null, pessoas: [] });
    const e = await erroDe(() => porta(semPrazo).reabrir(VAGA, {}, MASTER));
    expect(e).not.toBeNull();
    expect(semPrazo.vaga.status).toBe(CODIGO_ENTREGA);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// f) GUARDA: PAPEL QUE NÃO É CANCELAMENTO/ENTREGA/FECHAMENTO AINDA RECUSA COM 409
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("reabrir uma vaga que não é desfazível por papel ainda lança ConflictException", () => {
  it("uma vaga JÁ no papel ABERTURA é recusada com 409, sem escrever nada", async () => {
    const banco = bancoDoReabrir({ pessoas: [], eventos: [] });
    banco.vaga.status = CODIGO_ABERTURA;

    const e = await erroDe(() => porta(banco).reabrir(VAGA, {}, MASTER));

    expect(e).toBeInstanceOf(ConflictException);
    expect(banco.escritas).toEqual([]);
    expect(banco.vaga.status).toBe(CODIGO_ABERTURA);
  });

  it("o papel CANCELAMENTO continua previsto (sanidade do catálogo do fake)", () => {
    // Guarda contra o fake perder um papel e um teste virar verde por o código não existir.
    expect(CODIGO_CANCELAMENTO).toBeTruthy();
    expect(CODIGO_FECHAMENTO).toBeTruthy();
    expect(CODIGO_FECHAMENTO).not.toBe(CODIGO_ABERTURA);
  });
});
