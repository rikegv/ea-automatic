import "reflect-metadata";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { ROLES_KEY } from "../../auth/decorators";
import { menuDaOperacao } from "../../domain/menus";
import { ocupacaoDaVaga, SITUACOES_VIVAS } from "../../domain/candidatura";
import { CandidatosController } from "./candidatos.controller";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas, vagas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ TRANSFERIR ENTRE VAGAS: DE MASTER PARA QUALQUER CONSULTOR (Frente D, decisão do diretor) ────
 *
 * O PEDIDO: o time operacional faz a gestão das vagas, e transferir alguém da vaga A para a B é
 * gesto de gestão do dia a dia, não de exceção. O `@Roles("MASTER","SUPER_ADMIN")` da rota saiu.
 *
 * ┌─ ISTO É BAIXAR PERMISSÃO, ENTÃO O TESTE TEM DE DIZER O QUE CONTINUA PROTEGIDO (§A.38) ──────┐
 * │ 1. O MÓDULO segue reivindicado pelo menu `as-candidatos` no `MenuGuard`: "sem `@Roles`"     │
 * │    nunca quis dizer "aberto a qualquer autenticado" nesta controller, e um menu ausente     │
 * │    deixaria a rota alcançável pela URL da API por quem não a enxerga na tela.               │
 * │ 2. DESVINCULAR quem já entregou posição continua sendo de MASTER, no service. Transferir NÃO │
 * │    é desvincular: o desvínculo DESTRÓI o processo (vira desfecho, com motivo), a             │
 * │    transferência PRESERVA a linha, a etapa e o histórico.                                   │
 * │ 3. As quatro travas do `trocarVaga` continuam inteiras, e NENHUMA delas era de papel: o      │
 * │    método sequer recebe o usuário, só o id de quem fez, para a trilha.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ E A INVARIANTE QUE O DIRETOR PEDIU PARA PROVAR ──────────────────────────────────────────────
 *
 * "Ao transferir da vaga A para a B, a vaga A volta a ter posição pendente." Isso NÃO é código
 * novo: a ocupação é SEMPRE DERIVADA das candidaturas, nunca armazenada, então basta a linha mudar
 * de vaga. O teste é de invariante, e ele mede as duas metades: a gravação NÃO toca contador nenhum
 * da vaga, e a conta derivada devolve a posição à vaga de origem.
 */

const dialeto = new PgDialect();

function textoDe(cond: unknown): string {
  if (cond === undefined || cond === null) return "";
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

const AGORA = new Date("2026-09-25T12:00:00.000Z");

/**
 * O BANCO FINGIDO DA TROCA. A régua a proteger é a ORDEM (travar a vaga de destino, contar, gravar)
 * e O QUE é gravado, e as duas são observáveis nas chamadas.
 */
function bancoDaTroca(cenario: {
  situacao?: string;
  posicoesOficiais?: number | null;
  ocupadasNoDestino?: number;
}) {
  const candidatura = {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-A",
    etapa: "ENTREVISTA_SOULAN",
    situacao: cenario.situacao ?? "ALOCADO",
    motivoDescarte: null,
    posicaoLado: "OFICIAL",
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
  };
  const destino = {
    id: "vaga-B",
    status: "ABERTA",
    // O MESMO CLIENTE DA ORIGEM, de propósito: este arquivo mede a TROCA, e não o efeito de mudar
    // de cliente. A entrevista do cliente só é alcançada quando os dois códigos diferem, e quem
    // mede isso é `candidatos.transferencia-entre-clientes.cobertura-independente.spec.ts`.
    codCliente: "CLI-1",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: 0,
  };

  const ordem: string[] = [];
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn((selecao?: Record<string, unknown>) => {
    const pedeOcupadas = Boolean(selecao && "ocupadas" in selecao);
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    // A leitura final (`candidatura()`) termina em `orderBy` e devolve a linha já com nomes.
    b.orderBy = () =>
      Promise.resolve([
        {
          c: { ...candidatura, vagaId: "vaga-B" },
          candidatoNome: "Fulano",
          vagaCodigo: "PS-2",
          vagaNome: "Vaga B",
          autor: "Consultor",
        },
      ]);
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga-destino`);
      return Promise.resolve([destino]);
    };
    // Os `select` awaitados direto: a conferência de "já está nesta vaga" (vazia) e a contagem de
    // ocupação do destino.
    b.then = (r: (v: unknown) => unknown) => {
      if (pedeOcupadas) ordem.push("conta-ocupadas-do-destino");
      return Promise.resolve(
        pedeOcupadas ? [{ ocupadas: cenario.ocupadasNoDestino ?? 0 }] : [],
      ).then(r);
    };
    return b;
  });

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (v: Record<string, unknown>) => {
      lista.push({ tabela, valores: v });
      return Promise.resolve(undefined);
    },
  });

  const tx = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    query: {
      asCandidaturas: { findFirst: vi.fn().mockResolvedValue(candidatura) },
      /*
       * A VAGA DA CANDIDATURA. Ela entrou no dublê porque o service passou a LER a vaga por esta
       * porta, e não porque o teste mudou de assunto: o `moverEtapa` confere se a vaga ainda está
       * em processo, e a troca entre vagas lê o CLIENTE da vaga de origem. Sem esta linha o dublê
       * derruba a chamada com `findFirst of undefined`, acusando o service de um defeito que é do
       * dublê.
       */
      vagas: { findFirst: vi.fn().mockResolvedValue({ id: candidatura.vagaId, status: "ABERTA", codCliente: "CLI-1" }) },
    },
  };
  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      asCandidaturas: { findFirst: vi.fn().mockResolvedValue(candidatura) },
      /*
       * A VAGA DA CANDIDATURA. Ela entrou no dublê porque o service passou a LER a vaga por esta
       * porta, e não porque o teste mudou de assunto: o `moverEtapa` confere se a vaga ainda está
       * em processo, e a troca entre vagas lê o CLIENTE da vaga de origem. Sem esta linha o dublê
       * derruba a chamada com `findFirst of undefined`, acusando o service de um defeito que é do
       * dublê.
       */
      vagas: { findFirst: vi.fn().mockResolvedValue({ id: candidatura.vagaId, status: "ABERTA", codCliente: "CLI-1" }) },
    },
  };

  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
  return { service, ordem, updates, inserts, candidatura };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A AUTORIDADE SAIU DA ROTA
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("a troca de vaga deixou de exigir MASTER", () => {
  /**
   * ESTE ERA O ÚNICO `@Roles` DE MÉTODO DA CONTROLLER INTEIRA. O teste afirma a AUSÊNCIA porque a
   * regressão é fácil e bem-intencionada: alguém lê "corrigir alocação" e acha que aquilo é ação de
   * Master, recoloca o decorador, e o consultor comum perde a gestão que o diretor mandou abrir.
   */
  it("não há @Roles no método trocarVaga", () => {
    const proto = CandidatosController.prototype as unknown as Record<string, object>;
    expect(Reflect.getMetadata(ROLES_KEY, proto.trocarVaga)).toBeUndefined();
  });

  it("não há @Roles em NENHUM método desta controller, nem na classe", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CandidatosController)).toBeUndefined();
    const proto = CandidatosController.prototype as unknown as Record<string, object>;
    const comPapel = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== "constructor" && typeof proto[n] === "function")
      .filter((n) => Reflect.getMetadata(ROLES_KEY, proto[n]) !== undefined);
    expect(comPapel).toEqual([]);
  });

  /**
   * A CONTRAPARTIDA DA AUSÊNCIA, e é ela que impede a leitura de que a rota ficou aberta: quem
   * controla a entrada é o MENU. Sem a reivindicação, o módulo fica alcançável pela URL da API por
   * quem não o enxerga na tela, e o que ele guarda é dado pessoal de quem nem é funcionário.
   */
  it.each(["trocarVaga", "transferiveisPara"])(
    "%s continua reivindicada por um menu do A&S",
    (rota) => {
      expect(menuDaOperacao("CandidatosController", rota)).toMatch(/^as-/);
    },
  );

  /**
   * O SERVICE NÃO GANHOU UM CADEADO NO LUGAR DO DECORADOR. Ele recebe o ID de quem fez (trilha), e
   * não o usuário: não há por onde uma régua de papel entrar em silêncio. Um consultor comum
   * transfere, e é este teste que afirma isso do lado de dentro.
   */
  it("o consultor comum transfere: a gravação acontece com um id só, sem papel nenhum", async () => {
    const { service, updates } = bancoDaTroca({ situacao: "ATIVO" });

    await service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "usuario-comum");

    const gravado = updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
    expect(gravado).toMatchObject({ vagaId: "vaga-B" });
  });

  /** A TRILHA CONTINUA, e é ela que faz a permissão mais larga não virar movimento invisível. */
  it("a troca deixa rastro com autor, vaga de origem e vaga de destino", async () => {
    const { service, inserts } = bancoDaTroca({});

    await service.trocarVaga("cand-1", { vagaId: "vaga-B", motivo: "vaga errada" }, "usuario-1");

    const evento = inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};
    expect(evento).toMatchObject({
      vagaDe: "vaga-A",
      vagaPara: "vaga-B",
      porId: "usuario-1",
      // A ETAPA NÃO MUDA, e o evento diz isso explicitamente na linha do tempo.
      etapaPara: "ENTREVISTA_SOULAN",
    });
  });

  /**
   * AS TRAVAS QUE SOBREVIVEM À PERMISSÃO MAIS LARGA. A da CORRIDA é a que mais importa: a linha da
   * vaga de destino é travada ANTES de qualquer contagem, senão duas transferências simultâneas
   * para a mesma vaga passam as duas pela mesma fotografia.
   */
  it("a vaga de destino é TRAVADA antes de contar a ocupação dela", async () => {
    const { service, ordem } = bancoDaTroca({});
    await service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "usuario-1");
    expect(ordem).toEqual(["trava-vaga-destino", "conta-ocupadas-do-destino"]);
  });

  it("a vaga de destino cheia recusa a transferência, para qualquer consultor", async () => {
    const { service, updates } = bancoDaTroca({ posicoesOficiais: 1, ocupadasNoDestino: 1 });
    await expect(service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "usuario-1")).rejects.toThrow();
    expect(updates).toEqual([]);
  });

  it.each(["DESCARTADO", "DESISTIU"])(
    "a candidatura %s não troca de vaga: ela tem processo a recomeçar, não vaga a corrigir",
    async (situacao) => {
      const { service, updates } = bancoDaTroca({ situacao });
      await expect(
        service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "usuario-1"),
      ).rejects.toThrow();
      expect(updates).toEqual([]);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A INVARIANTE: a vaga A volta a ter posição pendente
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("transferindo da vaga A para a B, a posição da vaga A volta a ficar pendente", () => {
  /**
   * A METADE DA GRAVAÇÃO: a transferência escreve UMA coluna, `vaga_id`, e NÃO mexe em contador
   * nenhum da vaga. É isso que faz a invariante valer por construção: não existe um segundo número
   * para dessincronizar.
   */
  it("a gravação não toca nenhuma linha de `vagas`: não há contador a corrigir", async () => {
    const { service, updates } = bancoDaTroca({ situacao: "ALOCADO" });

    await service.trocarVaga("cand-1", { vagaId: "vaga-B" }, "usuario-1");

    expect(updates.filter((u) => u.tabela === vagas)).toEqual([]);
    const gravado = updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
    // A SITUAÇÃO E O LADO NÃO SÃO REESCRITOS: quem saiu da vaga A entregando posição entra na B
    // entregando posição, e não vira um "ativo" que largou a entrega no caminho.
    expect(gravado.situacao).toBeUndefined();
    expect(gravado.posicaoLado).toBeUndefined();
    expect(gravado).toMatchObject({ vagaId: "vaga-B" });
  });

  /**
   * A METADE DA CONTA. A ocupação é derivada das candidaturas DA VAGA, então tirar a linha da vaga A
   * devolve a posição: `livres` sobe, `finalizadas` cai.
   *
   * §A.6: entram situações e lados, sai contagem. Nenhum dado pessoal atravessa a régua.
   */
  it("a vaga A de 3 posições, cheia com 3 alocados, volta a ter 1 livre ao perder um", () => {
    const antes = ["ALOCADO", "ALOCADO", "ALOCADO"] as const;
    const depois = ["ALOCADO", "ALOCADO"] as const;

    expect(ocupacaoDaVaga(3, [...antes])).toMatchObject({ livres: 0, finalizadas: 3 });
    expect(ocupacaoDaVaga(3, [...depois])).toMatchObject({ livres: 1, finalizadas: 2 });
  });

  /** E a vaga B, que recebeu, passa a dever uma posição a menos. A conta é a mesma, do outro lado. */
  it("a vaga B, ao receber o transferido, tem uma posição livre a menos", () => {
    expect(ocupacaoDaVaga(5, ["ALOCADO"])).toMatchObject({ livres: 4 });
    expect(ocupacaoDaVaga(5, ["ALOCADO", "ALOCADO"])).toMatchObject({ livres: 3 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A LEITURA DA ABA: quem pode ser transferido PARA esta vaga
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("transferiveisPara: o conjunto (b) da aba Candidatos Disponíveis", () => {
  function bancoDaLeitura(vagaExiste = true) {
    let clausula = "";
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = (w: unknown) => {
      clausula = textoDe(w);
      return b;
    };
    b.orderBy = () => Promise.resolve([]);

    const db = {
      select: vi.fn(() => b),
      query: {
        vagas: { findFirst: vi.fn().mockResolvedValue(vagaExiste ? { id: "vaga-B" } : undefined) },
      },
    };
    const service = new CandidatosService(
      db as never,
      catalogoDeEtapasFingido() as never,
      catalogoDeStatusFingido() as never,
      envioDoPortalFingido() as never,
    );
    return { service, clausulaAtual: () => clausula };
  }

  it("vaga inexistente recusa, em vez de devolver uma lista vazia que parece resposta", async () => {
    const { service } = bancoDaLeitura(false);
    await expect(service.transferiveisPara("vaga-B")).rejects.toThrow();
  });

  it("só candidatura VIVA aparece, pela MESMA constante do resto do módulo", async () => {
    const { service, clausulaAtual } = bancoDaLeitura();
    await service.transferiveisPara("vaga-B");
    for (const s of SITUACOES_VIVAS) expect(clausulaAtual()).toContain(s);
  });

  it("quem já está NESTA vaga não é oferecido: nem a linha dela, nem outra linha da mesma pessoa", async () => {
    const { service, clausulaAtual } = bancoDaLeitura();
    await service.transferiveisPara("vaga-B");

    const c = clausulaAtual();
    expect(c, "sem o `<>` da vaga, a lista ofereceria transferir a linha para a vaga onde ela já está.").toMatch(
      /<>/,
    );
    expect(
      c.toLowerCase(),
      "sem o `not exists`, a lista ofereceria alguém que já tem processo vivo aqui, e o unique parcial recusaria o gesto que a tela propôs.",
    ).toContain("not exists");
    expect(c).toMatch(/candidato_id/);
  });

  /** §A.6: a leitura é POBRE. Nenhum CPF entra no filtro nem sai na resposta. */
  it("nenhum CPF atravessa a leitura", async () => {
    const { service, clausulaAtual } = bancoDaLeitura();
    await service.transferiveisPara("vaga-B");
    expect(clausulaAtual()).not.toContain("cpf");
  });
});
