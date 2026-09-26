import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AsResultadoEmMassa } from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";
import {
  MOTIVO_DE_DESCARTE_VALIDO,
  MOTIVO_QUE_PEDE_PRETENSAO,
  respostaDoCatalogoDeDescarte,
} from "../motivos-descarte/motivos-descarte.fake";
import { CandidatosService } from "./candidatos.service";

/**
 * ─ O LOTE RECUSA O MOTIVO QUE PEDE PRETENSÃO, E A RÉGUA INDIVIDUAL FUNCIONA PONTA A PONTA ───────
 *
 * ESTE ARQUIVO É DO `tester`, ESCRITO ANTES DO CÓDIGO (§A.40 regra 2). Ele cobre DOIS requisitos
 * fechados pelo diretor, e o segundo não tem código novo nenhum a construir.
 *
 * ┌─ REQUISITO 5: O LOTE RECUSA, INTEIRO, ANTES DE TOCAR UMA LINHA ────────────────────────────────┐
 * │ O corpo do lote tem UM motivo para a seleção inteira e NÃO TEM campo de pretensão, e não pode  │
 * │ ter: a pretensão é de CADA PESSOA, e um valor só para trinta seria o mesmo número gravado      │
 * │ trinta vezes, falso em vinte e nove. Então o motivo que PEDE pretensão não cabe no lote, e a   │
 * │ saída certa é recusar o lote e mandar usar o desvínculo individual.                             │
 * │                                                                                                 │
 * │ E A RECUSA TEM DE SER ANTES DO LAÇO, não dentro dele. Esta é a metade que se esquece: o lote    │
 * │ deste módulo é PARCIAL por desenho (erro numa linha não derruba as outras), então uma recusa    │
 * │ que rodasse por linha devolveria trinta falhas e ZERO aplicadas, o que parece equivalente e     │
 * │ NÃO É. A recusa por linha atravessa o `try/catch` de cada uma, e qualquer efeito colateral que  │
 * │ aconteça ANTES da conferência (um `update`, um evento, uma derivação de status da vaga) já      │
 * │ aconteceu quando a exceção sobe. Recusa que processa metade é pior que recusa nenhuma, porque  │
 * │ a tela diz "nada foi feito" e o banco discorda.                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ REQUISITO 1: NADA A CONSTRUIR, E É POR ISSO QUE O TESTE IMPORTA ──────────────────────────────┐
 * │ A régua já existe (`pede_pretensao` no catálogo, `exigirPretensaoQuandoOMotivoPede` no          │
 * │ service), e o que falta é o DIRETOR MARCAR um motivo pela tela. Em produção a régua nasce       │
 * │ INERTE: a migration cria a coluna e NÃO marca linha nenhuma, porque escolher o vocabulário é   │
 * │ dele (§A.31).                                                                                   │
 * │                                                                                                 │
 * │ O QUE SE MEDE, ENTÃO, É O DIA DA MARCAÇÃO: quando ele marcar, a régua tem de valer ponta a     │
 * │ ponta, nas DUAS metades. Régua inerte é indistinguível de régua quebrada até alguém ligar a     │
 * │ chave, e é exatamente aí que ninguém está olhando.                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: ids técnicos, nomes de motivo (catálogo fechado) e um valor inventado. Nenhum CPF, e o
 * arquivo AFIRMA que o valor da pretensão nunca volta numa mensagem de erro.
 */

const AGORA = new Date("2026-09-26T12:00:00.000Z");

/** Um valor inventado, e nenhuma asserção depende do número: o que está sob prova é a régua. */
const PRETENSAO = "2350.00";

const COMUM: AuthUser = {
  id: "user-comum",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

interface Linha {
  id: string;
  candidatoId: string;
  vagaId: string;
  etapa: string;
  situacao: string;
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * Os valores de parâmetro que um filtro do Drizzle carrega. `JSON.stringify` NÃO serve aqui: o
 * objeto do drizzle tem ciclo (coluna aponta para a tabela, que aponta para a coluna), e a tentativa
 * derruba o dublê com um erro que não tem nada a ver com o requisito.
 */
function parametros(filtro: unknown): string[] {
  const achados: string[] = [];
  const vistos = new Set<unknown>();
  const visitar = (no: unknown) => {
    if (!no || typeof no !== "object" || vistos.has(no)) return;
    vistos.add(no);
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    const c = no as { encoder?: unknown; value?: unknown; queryChunks?: unknown[] };
    if ("encoder" in c && typeof c.value === "string") achados.push(c.value);
    if (Array.isArray(c.queryChunks)) for (const filho of c.queryChunks) visitar(filho);
    if (Array.isArray(c.value)) visitar(c.value);
  };
  visitar(filtro);
  return achados;
}

function linha(id: string, over: Partial<Linha> = {}): Linha {
  return {
    id,
    candidatoId: `pessoa-${id}`,
    vagaId: "vaga-1",
    etapa: "TRIAGEM",
    situacao: "ATIVO",
    ...over,
  };
}

/**
 * ─ O BANCO FINGIDO DA SAÍDA, COM MEMÓRIA DE ESCRITA ─────────────────────────────────────────────
 *
 * A PROPRIEDADE SOB PROVA É "NENHUMA LINHA FOI TOCADA", então o que ele precisa guardar é
 * exatamente a lista de escritas. Ele responde o CATÁLOGO pela tabela (molde de
 * `respostaDoCatalogoDeDescarte`, por identidade do objeto que o `from()` recebeu) e devolve a
 * candidatura pedida pelo `findFirst`.
 */
function banco(cenario: { linhas: Linha[]; statusDaVaga?: string }) {
  const linhas = cenario.linhas.map((l) => ({ ...l }));
  const vaga = {
    id: "vaga-1",
    codigo: "PS-1",
    nomeDivulgacao: "Vaga de teste",
    status: cenario.statusDaVaga ?? "ABERTA",
    codCliente: "CLI-1",
    posicoesOficiais: 5,
    posicoesBanco: 0,
    criadoEm: AGORA,
    atualizadoEm: AGORA,
  };

  const escritas: Escrita[] = [];
  let pedida: string | null = null;

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = () => b;
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.limit = () => Promise.resolve(respostaDoCatalogoDeDescarte(tabela) ?? []);
    b.groupBy = () => Promise.resolve([]);
    b.orderBy = () => {
      const catalogo = respostaDoCatalogoDeDescarte(tabela);
      if (catalogo) return Promise.resolve(catalogo);
      const alvo = linhas.find((l) => l.id === pedida) ?? linhas[0];
      return Promise.resolve(
        alvo
          ? [
              {
                c: { ...alvo, motivoDescarte: null, posicaoLado: null, alocadoEm: AGORA, atualizadoEm: AGORA, ultimoContatoEm: null },
                candidatoNome: "Pessoa Inventada",
                vagaCodigo: vaga.codigo,
                vagaNome: vaga.nomeDivulgacao,
                autor: "Consultor",
              },
            ]
          : [],
      );
    };
    b.then = (r: (v: unknown) => unknown) =>
      Promise.resolve(respostaDoCatalogoDeDescarte(tabela) ?? []).then(r);
    return b;
  });

  const registrar = (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async () => {
        escritas.push({ tabela, valores });
        return undefined;
      },
    }),
    values: (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores });
      const pronto = Promise.resolve(undefined);
      return {
        then: pronto.then.bind(pronto),
        catch: pronto.catch.bind(pronto),
        finally: pronto.finally.bind(pronto),
        returning: async () => [{ id: `linha-${escritas.length}` }],
      };
    },
  });

  const findFirst = vi.fn(async (args?: { where?: unknown }) => {
    const pedidos = parametros(args?.where);
    const achada = linhas.find((l) => pedidos.includes(l.id)) ?? null;
    if (achada) pedida = achada.id;
    return achada
      ? { ...achada, motivoDescarte: null, posicaoLado: null, alocadoEm: AGORA, atualizadoEm: AGORA, ultimoContatoEm: null }
      : undefined;
  });

  const query = {
    asCandidaturas: { findFirst },
    vagas: { findFirst: vi.fn().mockResolvedValue(vaga) },
  };

  const tx = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    delete: vi.fn(() => ({ where: async () => undefined })),
    query,
  };
  const db = {
    select,
    update: vi.fn(registrar),
    insert: vi.fn(registrar),
    delete: vi.fn(() => ({ where: async () => undefined })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query,
  };

  return {
    service: new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    ),
    escritas,
  };
}

/** O corpo é tipado com folga: o lote pode ganhar campo novo, e isso não é o que está sob prova. */
const loteDe = (s: CandidatosService) =>
  (s as unknown as {
    registrarSaidaEmLote: (dto: Record<string, unknown>, user: AuthUser) => Promise<AsResultadoEmMassa>;
  }).registrarSaidaEmLote.bind(s);

const saidaDe = (s: CandidatosService) =>
  (s as unknown as {
    registrarSaida: (id: string, dto: Record<string, unknown>, user: AuthUser) => Promise<unknown>;
  }).registrarSaida.bind(s);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 5: O LOTE RECUSA O MOTIVO QUE PEDE PRETENSÃO, INTEIRO E ANTES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("5. o desvínculo EM MASSA recusa o motivo que pede pretensão salarial", () => {
  /**
   * A AFIRMAÇÃO CENTRAL, E ELA TEM DUAS PARTES QUE PRECISAM ESTAR NO MESMO CASO: a recusa acontece
   * E nenhuma linha foi tocada. Separadas, a segunda passaria sozinha numa implementação que recusa
   * tudo, e a primeira passaria sozinha numa implementação que recusa DEPOIS de processar metade.
   */
  it("recusa o lote inteiro, e NENHUMA linha é tocada", async () => {
    const b = banco({ linhas: [linha("c1"), linha("c2"), linha("c3")] });

    const erro = await loteDe(b.service)(
      {
        candidaturaIds: ["c1", "c2", "c3"],
        situacao: "DESCARTADO",
        motivo: MOTIVO_QUE_PEDE_PRETENSAO,
      },
      COMUM,
    ).catch((e: unknown) => e);

    expect(erro, "o lote tem de LANÇAR, e não devolver um relatório de falhas").toBeInstanceOf(
      BadRequestException,
    );
    expect(
      b.escritas.filter((e) => e.tabela === asCandidaturas),
      "nenhuma candidatura pode ter sido escrita: recusa que processa metade é pior que recusa nenhuma",
    ).toEqual([]);
    expect(
      b.escritas.filter((e) => e.tabela === asCandidaturaEtapas),
      "nenhum evento na linha do tempo: o lote nem começou",
    ).toEqual([]);
  });

  /**
   * ─ A RECUSA LANÇA, E NÃO VIRA RELATÓRIO DE FALHAS ─────────────────────────────────────────────
   *
   * Um lote que devolvesse `{ aplicadas: 0, falhas: [30 linhas] }` "funcionaria" na tela e estaria
   * errado por dois motivos: primeiro, cada uma daquelas trinta falhas teria atravessado o caminho
   * individual inteiro (com os efeitos que houver antes da conferência); segundo, o relatório de
   * falhas é um texto por LINHA, e o problema aqui não é de nenhuma linha, é da ESCOLHA que vale
   * para a seleção inteira. Erro de corpo é 400, não é falha de item.
   */
  it("a recusa NÃO volta disfarçada de relatório de falhas", async () => {
    const b = banco({ linhas: [linha("c1"), linha("c2")] });

    const resultado = await loteDe(b.service)(
      { candidaturaIds: ["c1", "c2"], situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO },
      COMUM,
    ).catch(() => null);

    expect(resultado, "devolver relatório em vez de lançar esconde o problema do corpo").toBeNull();
  });

  /**
   * A FRASE TEM DE DIZER O QUE FAZER. "Motivo inválido" mandaria a pessoa trocar o motivo, que é a
   * conclusão errada: o motivo está certo, o que não cabe é o GESTO EM MASSA. A frase manda usar o
   * desvínculo individual, e é ela que transforma uma recusa num caminho.
   */
  it("a frase manda usar o desvínculo INDIVIDUAL", async () => {
    const b = banco({ linhas: [linha("c1")] });

    const erro = await loteDe(b.service)(
      { candidaturaIds: ["c1"], situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO },
      COMUM,
    ).catch((e: unknown) => e);

    expect(String((erro as BadRequestException).message).toLowerCase()).toMatch(/individual/);
  });

  /** O CAMINHO FELIZ DO LOTE: motivo comum continua processando a seleção inteira. */
  it("o motivo que NÃO pede pretensão continua passando no lote", async () => {
    const b = banco({ linhas: [linha("c1"), linha("c2")] });

    const resultado = await loteDe(b.service)(
      { candidaturaIds: ["c1", "c2"], situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO },
      COMUM,
    );

    expect(resultado.aplicadas, `falhas: ${JSON.stringify(resultado.falhas)}`).toBe(2);
    expect(resultado.falhas).toEqual([]);
  });

  /**
   * A RECUSA NÃO PODE ALCANÇAR O ENVIO PARA A ADMISSÃO. `registrarSaidaEmLote` serve os DOIS
   * gestos (desvincular e enviar para a esteira), e `ENVIADO_PARA_ADMISSAO` não usa o catálogo de
   * descarte para nada. Uma conferência escrita sem olhar a situação barraria o envio em massa por
   * causa de um motivo que aquele caminho nem lê.
   */
  it("o ENVIO PARA ADMISSÃO em massa não é alcançado pela recusa", async () => {
    const b = banco({ linhas: [linha("c1", { situacao: "APROVADO" })] });

    const resultado = await loteDe(b.service)(
      {
        candidaturaIds: ["c1"],
        situacao: "ENVIADO_PARA_ADMISSAO",
        motivo: "aprovado pelo cliente",
      },
      COMUM,
    ).catch((e: unknown) => e);

    expect(
      resultado,
      "o envio para a esteira não lê o catálogo de descarte, e não pode ser barrado por ele",
    ).not.toBeInstanceOf(BadRequestException);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 1: A RÉGUA DA PRETENSÃO, PONTA A PONTA, NO DESVÍNCULO INDIVIDUAL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("1. a régua da pretensão vale nas DUAS pontas, no desvínculo individual", () => {
  /** O MOTIVO MARCADO EXIGE O VALOR. Sem esta metade, a regra viveria só no navegador. */
  it("o motivo MARCADO sem o valor é recusado", async () => {
    const b = banco({ linhas: [linha("c1")] });

    const erro = await saidaDe(b.service)(
      "c1",
      { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO },
      COMUM,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.escritas.filter((e) => e.tabela === asCandidaturas)).toEqual([]);
  });

  /** O MOTIVO MARCADO COM O VALOR GRAVA, e o valor chega junto com o desfecho, na mesma transação. */
  it("o motivo MARCADO com o valor grava, e a pretensão vai junto", async () => {
    const b = banco({ linhas: [linha("c1")] });

    await saidaDe(b.service)(
      "c1",
      { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO, pretensaoSalarial: PRETENSAO },
      COMUM,
    );

    const gravado = b.escritas.find((e) => e.tabela === asCandidaturas)?.valores ?? {};
    expect(gravado).toMatchObject({ situacao: "DESCARTADO" });
    expect(
      JSON.stringify(gravado),
      "o valor tem de chegar ao banco: sem ele, o campo é pedido na tela e jogado fora",
    ).toContain(PRETENSAO);
  });

  /**
   * ─ A OUTRA METADE, QUE É §A.6 ANTES DE SER HIGIENE ────────────────────────────────────────────
   *
   * Sem a recusa, o campo vira uma gaveta de salário aberta em QUALQUER desfecho, e o sistema passa
   * a guardar dado financeiro de pessoa que ninguém mandou guardar. Minimização é RECUSAR o que não
   * se pediu, e não só deixar de pedir.
   */
  it("o motivo NÃO marcado com o valor é recusado", async () => {
    const b = banco({ linhas: [linha("c1")] });

    const erro = await saidaDe(b.service)(
      "c1",
      { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO, pretensaoSalarial: PRETENSAO },
      COMUM,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.escritas.filter((e) => e.tabela === asCandidaturas)).toEqual([]);
  });

  /** O motivo não marcado SEM o valor é o caminho normal, e ele não pode ter sido alcançado. */
  it("o motivo NÃO marcado sem o valor continua gravando normalmente", async () => {
    const b = banco({ linhas: [linha("c1")] });

    await saidaDe(b.service)(
      "c1",
      { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO },
      COMUM,
    );

    expect(b.escritas.find((e) => e.tabela === asCandidaturas)?.valores).toMatchObject({
      situacao: "DESCARTADO",
    });
  });

  /**
   * §A.6 NA MENSAGEM. As duas recusas falam do CAMPO e NUNCA repetem o valor recebido: um erro que
   * devolvesse o número faria o dado financeiro viajar na resposta e, dali, para qualquer log de
   * cliente HTTP. É a mesma razão pela qual a recusa de CPF duplicado não repete o CPF.
   */
  it("nenhuma das duas recusas repete o VALOR recebido", async () => {
    const b = banco({ linhas: [linha("c1")] });

    const erro = await saidaDe(b.service)(
      "c1",
      { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO, pretensaoSalarial: PRETENSAO },
      COMUM,
    ).catch((e: unknown) => e);

    expect(JSON.stringify((erro as BadRequestException).getResponse())).not.toContain(PRETENSAO);
  });
});
