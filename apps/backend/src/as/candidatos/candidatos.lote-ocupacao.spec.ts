import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { consomePosicao } from "../../domain/candidatura";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";

/**
 * ─ A TRAVA DE OCUPAÇÃO SOBREVIVE AO LOTE (escrito ANTES do código, §A.40 regra 2) ───────────────
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE É O PRIMEIRO DOS TRÊS ─────────────────────────┐
 * │ A PROPRIEDADE MAIS CARA DO MÓDULO É "UMA POSIÇÃO É DE UM CANDIDATO SÓ", e ela é garantida  │
 * │ por UMA sequência dentro de UMA transação: travar a linha da vaga com `SELECT ... FOR       │
 * │ UPDATE`, SÓ ENTÃO contar as ocupadas, decidir e gravar. Toda ação em massa é a tentação de  │
 * │ trocar essa sequência por um `update ... where id in (...)`, que é rápido, elegante e faz a │
 * │ vaga de 5 aceitar 30.                                                                       │
 * │                                                                                             │
 * │ O LOTE, ENTÃO, TEM DE SER N TRANSAÇÕES SEQUENCIAIS reusando o método individual. Não é      │
 * │ preferência de implementação: é a única forma de a trava continuar valendo, porque é a linha │
 * │ da VAGA que serializa a disputa, e ela só serializa quem passa por ela.                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   A. VAGA DE 5 E LOTE DE 30 dá EXATAMENTE 5 entregues e 25 falhas, e a meta nunca estoura. Vale
 *      para a vaga vazia e para a vaga que já começa parcialmente ocupada.
 *   B. O LOTE NÃO É UM QUARTO ESCRITOR: cada linha abre a própria transação, trava a vaga antes de
 *      contar, e a recusa que o consultor lê é LETRA POR LETRA a mesma da ação individual.
 *   B2. NÃO EXISTE PRÉ-CONFERÊNCIA de "cabe todo mundo?" antes do laço: qualquer contagem fora da
 *      trava responde sobre o passado e mente (decisão do diretor). A verdade é o resultado do lote.
 *   F. VAGA ENCERRADA RECUSA O LOTE INTEIRO, e não entrega meia coisa.
 *   H. `posicaoLado` SAI NO ITEM, é NULO para quem não ocupa posição, e NINGUÉM conta meta lendo
 *      esse campo: quem conta é a SITUAÇÃO.
 *
 ┌─ O MOLDE FOI APAGADO, e as chamadas voltaram para o COMPILADOR ────────────────────────────┐
 * │ Enquanto o grupo 1 não existia, os métodos eram alcançados por um molde (`AcoesEmMassa`) com │
 * │ `as unknown as`, para o `typecheck` do repositório seguir verde para as outras sessões. Os   │
 * │ métodos nasceram, o molde saiu, e agora a assinatura de cada chamada é conferida por quem    │
 * │ deve conferi-la: qualquer mudança de nome ou de forma quebra AQUI, e não em produção.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O FAKE AQUI É COM ESTADO, e é isso que o separa dos fakes vizinhos: a gravação da linha 1 PRECISA
 * ser lida pela contagem da linha 2. Com um fake sem memória, as 30 linhas contariam sempre "zero
 * ocupadas", as 30 passariam, e o teste diria que a trava segurou a vaga: exatamente a falsa
 * tranquilidade que este arquivo existe para eliminar.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

const USER: AuthUser = {
  id: "user-1",
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
  motivoDescarte: string | null;
  posicaoLado: string | null;
  alocadoEm: Date;
  atualizadoEm: Date;
  ultimoContatoEm: Date | null;
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
  /** DENTRO DA TRANSAÇÃO OU FORA DELA. É esta coluna que responde se o lote virou um quarto escritor. */
  dentroDaTransacao: boolean;
}

/**
 * Os parâmetros de uma condição do drizzle, para o fake responder POR ID em vez de devolver sempre a
 * mesma linha. Mesmo utilitário do lote do Alto Volume, pelo mesmo motivo: sem ele, um fake com
 * estado não consegue distinguir a candidatura 7 da candidatura 8.
 */
function parametros(cond: unknown): string[] {
  const out: string[] = [];
  const visitar = (no: unknown) => {
    if (Array.isArray(no)) return no.forEach(visitar);
    if (!no || typeof no !== "object") return;
    const rec = no as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(rec.queryChunks)) return rec.queryChunks.forEach(visitar);
    if ("value" in rec && typeof rec.value === "string") out.push(rec.value);
  };
  visitar(cond);
  return out;
}

function linha(over: Partial<Linha> & { id: string }): Linha {
  return {
    candidatoId: `pessoa-${over.id}`,
    vagaId: "vaga-1",
    etapa: "APROVACAO",
    situacao: "ATIVO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    ...over,
  };
}

/** N candidaturas vivas na mesma vaga, prontas para receber posição. */
function fila(quantas: number, over: Partial<Linha> = {}): Linha[] {
  return Array.from({ length: quantas }, (_, i) => linha({ id: `cand-${i + 1}`, ...over }));
}

/**
 * O BANCO COM MEMÓRIA.
 *
 * A contagem de ocupadas é DERIVADA do estado, pela mesma régua da produção (`consomePosicao`,
 * agrupada por `posicao_lado`, excluindo a própria candidatura). É assim que a linha 6 do lote
 * enxerga as 5 que passaram antes dela.
 */
function makeDb(cenario: {
  linhas?: Linha[];
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  status?: string;
}) {
  const vaga = {
    id: "vaga-1",
    codigo: "PS-2026-777",
    nomeDivulgacao: "Vaga de teste",
    status: cenario.status ?? "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
  };

  const estado = new Map<string, Linha>();
  for (const l of cenario.linhas ?? []) estado.set(l.id, { ...l });

  const escritas: Escrita[] = [];
  const ordem: string[] = [];
  let transacoes = 0;

  /** A candidatura lida na transação em curso: é ela que a contagem exclui, como o `ne` da produção. */
  let atual: Linha | null = null;

  const ocupadasPorLado = (excluirId: string | null) => {
    const contagem = new Map<string | null, number>();
    for (const l of estado.values()) {
      if (l.vagaId !== vaga.id) continue;
      if (l.id === excluirId) continue;
      if (!consomePosicao(l.situacao as never)) continue;
      contagem.set(l.posicaoLado, (contagem.get(l.posicaoLado) ?? 0) + 1);
    }
    return [...contagem.entries()].map(([lado, quantas]) => ({ lado, quantas }));
  };

  const itemDaLeitura = (l: Linha) => ({
    c: l,
    candidatoNome: "Fulano de Tal",
    vagaCodigo: vaga.codigo,
    vagaNome: vaga.nomeDivulgacao,
    autor: "Consultor",
  });

  const criarSelect = (dentroDaTransacao: boolean) =>
    vi.fn(() => {
      let tabela: unknown = null;
      let onde: unknown = null;
      const b: Record<string, unknown> = {};
      b.from = (t: unknown) => {
        tabela = t;
        return b;
      };
      b.innerJoin = () => b;
      b.leftJoin = () => b;
      b.where = (cond: unknown) => {
        onde = cond;
        return b;
      };
      b.for = (modo: string) => {
        ordem.push(
          `${modo === "update" ? "trava" : modo}-vaga${dentroDaTransacao ? "" : "-FORA-DA-TRANSACAO"}`,
        );
        return Promise.resolve([{ ...vaga }]);
      };
      b.groupBy = () => {
        ordem.push(`conta-ocupadas${dentroDaTransacao ? "" : "-FORA-DA-TRANSACAO"}`);
        return Promise.resolve(ocupadasPorLado(atual ? atual.id : null));
      };
      b.orderBy = () => {
        const alvo = parametros(onde).find((p) => estado.has(p));
        return Promise.resolve(alvo ? [itemDaLeitura(estado.get(alvo)!)] : []);
      };
      // As candidaturas anteriores da pessoa naquela vaga (a leitura da `alocar`).
      b.then = (r: (v: unknown) => unknown) => {
        const ps = parametros(onde);
        const linhas =
          tabela === asCandidaturas
            ? [...estado.values()]
                .filter((l) => ps.includes(l.candidatoId) && ps.includes(l.vagaId))
                .map((l) => ({
                  id: l.id,
                  situacao: l.situacao,
                  motivo: l.motivoDescarte,
                  encerradaEm: l.atualizadoEm,
                }))
            : [];
        return Promise.resolve(linhas).then(r);
      };
      return b;
    });

  const criarUpdate = (dentroDaTransacao: boolean) =>
    vi.fn((tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: async (cond: unknown) => {
          escritas.push({ tabela, valores, dentroDaTransacao });
          if (tabela !== asCandidaturas) return;
          const alvo = parametros(cond).find((p) => estado.has(p));
          if (alvo) Object.assign(estado.get(alvo)!, valores);
        },
      }),
    }));

  const criarInsert = (dentroDaTransacao: boolean) =>
    vi.fn((tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        escritas.push({ tabela, valores, dentroDaTransacao });
        const nova = linha({
          id: `nova-${estado.size + 1}`,
          candidatoId: String(valores.candidatoId ?? "pessoa-nova"),
          vagaId: String(valores.vagaId ?? vaga.id),
          etapa: "CAPTACAO",
          situacao: "ATIVO",
        });
        if (tabela === asCandidaturas) estado.set(nova.id, nova);
        return {
          returning: async () => [{ id: nova.id, etapa: nova.etapa }],
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
      },
    }));

  const consultas = (dentroDaTransacao: boolean) => ({
    asCandidaturas: {
      findFirst: async (arg: { where?: unknown }) => {
        const alvo = parametros(arg.where).find((p) => estado.has(p));
        const achada = alvo ? { ...estado.get(alvo)! } : null;
        if (dentroDaTransacao) atual = achada;
        return achada;
      },
    },
    asCandidatos: {
      findFirst: async (arg: { where?: unknown }) => {
        const id = parametros(arg.where)[0];
        return id ? { id, nome: "Fulano de Tal" } : null;
      },
    },
    vagas: {
      findFirst: async (arg: { where?: unknown }) =>
        parametros(arg.where).includes(vaga.id) ? { ...vaga } : null,
    },
  });

  const tx = {
    select: criarSelect(true),
    update: criarUpdate(true),
    insert: criarInsert(true),
    query: consultas(true),
  };

  const db = {
    select: criarSelect(false),
    update: criarUpdate(false),
    insert: criarInsert(false),
    query: consultas(false),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes += 1;
      atual = null;
      return fn(tx);
    },
  };

  const situacoes = () => [...estado.values()].map((l) => l.situacao);
  const contar = (situacao: string) => situacoes().filter((s) => s === situacao).length;

  return {
    service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never),
    estado,
    escritas,
    ordem,
    contar,
    transacoesFeitas: () => transacoes,
  };
}

const idsDe = (linhas: Linha[]) => linhas.map((l) => l.id);
const escritasNaCandidatura = (escritas: Escrita[]) =>
  escritas.filter((e) => e.tabela === asCandidaturas);

describe("A trava de ocupação sobrevive ao lote: 5 posições, 30 selecionados", () => {
  /**
   * O CASO DO DIRETOR, LETRA POR LETRA: "selecionou 30 para 5 posições, `aplicadas: 5` e 25 falhas".
   *
   * É O TESTE QUE MAIS IMPORTA DO ARQUIVO. Um lote que monte `update ... where id in (...)` passa em
   * qualquer outro teste desta pasta e é reprovado aqui, com a vaga de 5 entregando 30.
   */
  it("entrega EXATAMENTE 5, reporta 25 falhas, e a meta nunca estoura", async () => {
    const linhas = fila(30);
    const { service, contar } = makeDb({ linhas, posicoesOficiais: 5 });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: idsDe(linhas) },
      USER.id,
    );

    expect(r.aplicadas).toBe(5);
    expect(r.falhas).toHaveLength(25);
    // A PROPRIEDADE, e não o desenho: o que ficou gravado é 5, e não "o método foi chamado 5 vezes".
    expect(contar("ALOCADO")).toBe(5);
    // E ninguém sumiu: as 25 recusadas continuam vivas no funil, exatamente onde estavam.
    expect(contar("ATIVO")).toBe(25);
  });

  /** A recusa fala de VAGA CHEIA, e não de erro genérico: é a frase que o consultor lê no relatório. */
  it("as 25 falhas dizem que a vaga está cheia, com a frase da trava", async () => {
    const linhas = fila(30);
    const { service } = makeDb({ linhas, posicoesOficiais: 5 });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: idsDe(linhas) },
      USER.id,
    );

    for (const f of r.falhas) {
      expect(f.motivo).toMatch(/já estão preenchidas|já está preenchida/);
    }
  });

  /**
   * A VAGA QUE JÁ COMEÇA OCUPADA é o caso que uma pré-conferência ingênua erra: quem contasse só o
   * tamanho da seleção contra a meta entregaria 5 e estouraria para 7.
   */
  it("com 2 posições já entregues, o lote de 10 entrega só as 3 que sobravam", async () => {
    const linhas = [
      ...fila(2).map((l, i) => ({ ...l, id: `ja-${i}`, situacao: "ALOCADO", posicaoLado: "OFICIAL" })),
      ...fila(10).map((l, i) => ({ ...l, id: `cand-${i}` })),
    ];
    const { service, contar } = makeDb({ linhas, posicoesOficiais: 5 });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: linhas.filter((l) => l.situacao === "ATIVO").map((l) => l.id) },
      USER.id,
    );

    expect(r.aplicadas).toBe(3);
    expect(r.falhas).toHaveLength(7);
    expect(contar("ALOCADO")).toBe(5);
  });

  /** Vaga sem posição livre nenhuma: o lote inteiro falha, e NADA é gravado. */
  it("vaga já completa recusa as 4 linhas e não grava nada", async () => {
    const cheias = fila(5).map((l, i) => ({
      ...l,
      id: `ja-${i}`,
      situacao: "ALOCADO",
      posicaoLado: "OFICIAL",
    }));
    const novas = fila(4).map((l, i) => ({ ...l, id: `cand-${i}` }));
    const { service, escritas } = makeDb({
      linhas: [...cheias, ...novas],
      posicoesOficiais: 5,
    });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: idsDe(novas) },
      USER.id,
    );

    expect(r).toMatchObject({ aplicadas: 0 });
    expect(r.falhas).toHaveLength(4);
    expect(escritasNaCandidatura(escritas)).toHaveLength(0);
  });

  /**
   * O LADO TEM TETO PRÓPRIO, e o lote respeita o teto do lado ESCOLHIDO. Sem isto, um lote mandado
   * para a reserva seria medido contra a meta oficial e travaria numa vaga com banco de sobra, ou
   * pior, encheria o banco além do que foi reservado.
   */
  it("lote para o BANCO respeita o teto do banco, e não o das oficiais", async () => {
    const linhas = fila(6);
    const { service, estado } = makeDb({ linhas, posicoesOficiais: 5, posicoesBanco: 2 });

    const r = await service.finalizarPosicaoEmLote(
      {
        candidaturaIds: idsDe(linhas),
        lado: "BANCO",
        cienteBancoComOficiaisAbertas: true,
      },
      USER.id,
    );

    expect(r.aplicadas).toBe(2);
    expect(r.falhas).toHaveLength(4);
    const noBanco = [...estado.values()].filter((l) => l.posicaoLado === "BANCO");
    expect(noBanco).toHaveLength(2);
  });
});

describe("O lote NÃO vira um quarto escritor: ele passa pelo caminho travado", () => {
  /**
   * A SEQUÊNCIA, POR LINHA: travar a vaga, SÓ ENTÃO contar. Repetida N vezes, uma por candidatura.
   *
   * ESTA É A ASSERÇÃO QUE PEGA O `UPDATE ... WHERE ID IN (...)`: um lote que grave em uma tacada
   * trava a vaga zero vez ou uma vez só, e a ordem não bate de jeito nenhum.
   */
  it("cada linha trava a vaga ANTES de contar, e a sequência se repete por linha", async () => {
    const linhas = fila(3);
    const { service, ordem, transacoesFeitas } = makeDb({ linhas, posicoesOficiais: 5 });

    await service.finalizarPosicaoEmLote({ candidaturaIds: idsDe(linhas) }, USER.id);

    expect(ordem).toEqual([
      "trava-vaga",
      "conta-ocupadas",
      "trava-vaga",
      "conta-ocupadas",
      "trava-vaga",
      "conta-ocupadas",
    ]);
    // N TRANSAÇÕES SEQUENCIAIS, uma por linha: é o que faz a segunda esperar a primeira no banco.
    expect(transacoesFeitas()).toBe(3);
  });

  /**
   * NÃO EXISTE PRÉ-CONFERÊNCIA (decisão 2 do diretor). Qualquer contagem antes do laço roda FORA da
   * trava e responde sobre um instante que já passou: outro consultor pode ocupar a última posição
   * entre a conta e a gravação.
   */
  it("nenhuma contagem de ocupação roda fora da transação, nem antes do laço", async () => {
    const linhas = fila(4);
    const { service, ordem } = makeDb({ linhas, posicoesOficiais: 2 });

    await service.finalizarPosicaoEmLote({ candidaturaIds: idsDe(linhas) }, USER.id);

    expect(ordem.filter((o) => o.includes("FORA-DA-TRANSACAO"))).toEqual([]);
    // E a PRIMEIRA coisa que acontece é a trava, nunca uma conta.
    expect(ordem[0]).toBe("trava-vaga");
  });

  /** Toda escrita na candidatura nasce dentro de uma transação. Nenhuma pela porta de fora. */
  it("nenhuma escrita em as_candidaturas acontece fora de uma transação", async () => {
    const linhas = fila(6);
    const { service, escritas } = makeDb({ linhas, posicoesOficiais: 5 });

    await service.finalizarPosicaoEmLote({ candidaturaIds: idsDe(linhas) }, USER.id);

    expect(escritasNaCandidatura(escritas).every((e) => e.dentroDaTransacao)).toBe(true);
    // O evento do histórico acompanha a mudança, na MESMA transação: 5 mudanças, 5 eventos.
    expect(escritas.filter((e) => e.tabela === asCandidaturaEtapas)).toHaveLength(5);
  });

  /**
   * A MESMA FRASE, LETRA POR LETRA. Se o lote reescrever a recusa com texto próprio, nasce uma
   * segunda régua para dizer a mesma coisa, e as duas divergem na primeira correção feita numa só.
   */
  it("a recusa dentro do lote é a MESMA da ação individual, palavra por palavra", async () => {
    const cheia = () =>
      makeDb({
        linhas: [
          linha({ id: "ja-1", situacao: "ALOCADO", posicaoLado: "OFICIAL" }),
          linha({ id: "cand-1" }),
        ],
        posicoesOficiais: 1,
      });

    const individual = cheia();
    const erro = await individual.service
      .finalizarPosicao("cand-1", {}, USER.id)
      .catch((e: unknown) => e as ConflictException);
    expect(erro).toBeInstanceOf(ConflictException);

    const lote = cheia();
    const r = await lote.service.finalizarPosicaoEmLote(
      { candidaturaIds: ["cand-1"] },
      USER.id,
    );

    expect(r.falhas[0].motivo).toBe((erro as ConflictException).message);
  });
});

describe("Vaga encerrada recusa o LOTE INTEIRO, e não entrega meia coisa", () => {
  /**
   * É ESTADO DA VAGA, NÃO DA LINHA. Trinta recusas idênticas num relatório de falhas não é
   * resultado, é ruído: o problema é um só, é da vaga, e a resposta certa é recusar o pedido.
   */
  for (const status of ["FECHADA", "CANCELADA", "ENTREGUE"] as const) {
    it(`vaga ${status} recusa o lote de adição e não grava nada`, async () => {
      const { service, escritas } = makeDb({ linhas: [], posicoesOficiais: 5, status });

      await expect(
        service.adicionarEmLote(
          "vaga-1",
          { candidatoIds: ["pessoa-1", "pessoa-2", "pessoa-3"] },
          USER,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(escritas).toHaveLength(0);
    });
  }

  /**
   * A FINALIZAÇÃO EM LOTE NÃO RECEBE A VAGA POR PARÂMETRO (a vaga sai de cada candidatura), então
   * aqui a propriedade é a outra metade da mesma promessa: nada é entregue e nada é gravado numa
   * vaga já encerrada, nem uma linha.
   */
  it("finalizar posição em lote numa vaga encerrada não entrega nenhuma posição", async () => {
    const linhas = fila(4);
    const { service, escritas, contar } = makeDb({
      linhas,
      posicoesOficiais: 5,
      status: "FECHADA",
    });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: idsDe(linhas) },
      USER.id,
    );

    expect(r.aplicadas).toBe(0);
    expect(r.falhas).toHaveLength(4);
    expect(contar("ALOCADO")).toBe(0);
    expect(escritasNaCandidatura(escritas)).toHaveLength(0);
  });
});

describe("O lado da posição sai no ITEM, e não é ele que conta a meta", () => {
  /** A lista de alocados mostra "oficial ou banco" por linha, e o campo tem de chegar até ela. */
  it("o item devolvido carrega o lado OFICIAL de quem acabou de entregar a posição", async () => {
    const { service } = makeDb({ linhas: [linha({ id: "cand-1" })], posicoesOficiais: 5 });
    const item = await service.finalizarPosicao("cand-1", {}, USER.id);
    expect(item.posicaoLado).toBe("OFICIAL");
  });

  it("o item carrega BANCO quando a posição saiu da reserva", async () => {
    const { service } = makeDb({
      linhas: [linha({ id: "cand-1" })],
      posicoesOficiais: 5,
      posicoesBanco: 3,
    });
    const item = await service.finalizarPosicao(
      "cand-1",
      { lado: "BANCO", cienteBancoComOficiaisAbertas: true },
      USER.id,
    );
    expect(item.posicaoLado).toBe("BANCO");
  });

  /**
   * NULO NÃO É "OFICIAL POR OMISSÃO". Quem está no funil sem ocupar posição tem NULO aqui, e a tela
   * precisa poder distinguir "está na reserva" de "não ocupa posição nenhuma".
   */
  it("quem não ocupa posição tem o lado NULO no item", async () => {
    const { service } = makeDb({ linhas: [linha({ id: "cand-1", etapa: "TRIAGEM" })] });
    const item = await service.moverEtapa("cand-1", { etapa: "ENTREVISTA_SOULAN" }, USER.id);
    expect(item.situacao).toBe("ATIVO");
    expect(item.posicaoLado).toBeNull();
  });

  /**
   * QUEM CONTA POSIÇÃO É A SITUAÇÃO, NUNCA ESTE CAMPO, e este teste é a trava contra o atalho: uma
   * linha DESCARTADA conserva o lado gravado, e contar por `posicao_lado is not null` faria a vaga
   * de uma posição parecer cheia com ninguém dentro.
   */
  it("linha encerrada que conservou o lado gravado NÃO ocupa posição", async () => {
    const { service, contar } = makeDb({
      linhas: [
        linha({
          id: "saiu-1",
          situacao: "DESCARTADO",
          posicaoLado: "OFICIAL",
          motivoDescarte: "não compareceu",
        }),
        linha({ id: "cand-1" }),
      ],
      posicoesOficiais: 1,
    });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: ["cand-1"] },
      USER.id,
    );

    expect(r).toMatchObject({ aplicadas: 1, falhas: [] });
    expect(contar("ALOCADO")).toBe(1);
  });
});
