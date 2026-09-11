import { describe, expect, it, vi } from "vitest";
import type { AsResultadoEmMassa } from "@ea/shared-types";
import type { AuthUser } from "../../auth/auth.types";
import { ACEITE_REENTRADA, consomePosicao } from "../../domain/candidatura";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";

/**
 * ─ O LOTE PARCIAL: uma linha ruim NÃO derruba as outras, e a resposta NÃO carrega dado pessoal ──
 *
 * ┌─ AS TRÊS DECISÕES DO DIRETOR QUE ESTE ARQUIVO GUARDA ──────────────────────────────────────┐
 * │ 1. LOTE PARCIAL. Aloca quem couber e reporta o resto. Erro numa linha não aborta o lote: a   │
 * │    linha volta em `falhas` com o motivo, e as demais SEGUEM. Uma linha ruim no MEIO da       │
 * │    seleção é o caso que separa o laço com `try/catch` por linha da transação única que faz   │
 * │    rollback de tudo, e é o segundo que a operação sente: trinta candidatos selecionados, um  │
 * │    já descartado, e o consultor descobre que nada foi feito.                                 │
 * │                                                                                             │
 * │ 2. §A.6 NO `falhas[]`, e este é o risco que só aparece no LOTE. Na ação individual, a frase  │
 * │    de reentrada com o motivo do descarte anterior é uma resposta de erro para UMA pessoa que │
 * │    o consultor acabou de selecionar. Em massa, a MESMA frase repetida trinta vezes é um      │
 * │    RELATÓRIO DE DADO PESSOAL indo para o toast, para a área de transferência e para o log de │
 * │    cliente. A falha carrega o ID e um motivo de PROCESSO, e mais nada.                       │
 * │                                                                                             │
 * │ 3. O ACEITE DE REENTRADA PASSA A SER GRAVADO, POR LINHA. Hoje ele é pedido na tela e jogado  │
 * │    fora: `ACEITE_REENTRADA` existe no domínio desde a migration 0097 e NINGUÉM o escreve.    │
 * │    Um aceite só para o lote inteiro não responde "quem trouxe esta pessoa de volta, e        │
 * │    quando", que é a pergunta que a §A.3 regra 8 manda poder responder.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40 regra 2): enquanto os métodos do grupo 1 não existiam, a assinatura
 * esperada morava num molde (`AcoesEmMassa`) alcançado por `as unknown as`, para o `typecheck` das
 * outras sessões continuar verde. Os métodos nasceram e o molde saiu: as chamadas voltaram a ser
 * conferidas pelo compilador, que é onde elas devem ser.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/**
 * AS ISCAS DO TESTE DE §A.6. Elas existem no BANCO do fake, e a asserção é que NENHUMA delas
 * aparece na resposta do lote. Se a implementação repassar `err.message` cru, o motivo do descarte
 * anterior vem junto e o teste acende.
 */
const CPF_NA_BASE = "39053344705";
const NOME_NA_BASE = "Marina Albuquerque Ferreira";
const MOTIVO_ANTERIOR = "chegou atrasada duas vezes e discutiu com a supervisora";

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
}

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

/**
 * O BANCO COM MEMÓRIA, com PESSOAS de verdade dentro (nome e CPF), que é o que faz o teste de §A.6
 * ter o que vazar. A contagem de ocupação é derivada do estado, pela régua da produção.
 */
function makeDb(cenario: {
  linhas?: Linha[];
  candidatos?: { id: string; nome: string; cpf: string | null }[];
  posicoesOficiais?: number | null;
  status?: string;
}) {
  const vaga = {
    id: "vaga-1",
    codigo: "PS-2026-777",
    nomeDivulgacao: "Vaga de teste",
    status: cenario.status ?? "ABERTA",
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 50 : cenario.posicoesOficiais,
    posicoesBanco: 0,
  };

  const estado = new Map<string, Linha>();
  for (const l of cenario.linhas ?? []) estado.set(l.id, { ...l });

  const pessoas = new Map<string, { id: string; nome: string; cpf: string | null }>();
  for (const p of cenario.candidatos ?? []) pessoas.set(p.id, p);

  const escritas: Escrita[] = [];
  let atual: Linha | null = null;
  let novas = 0;

  const ocupadas = (excluirId: string | null) => {
    const contagem = new Map<string | null, number>();
    for (const l of estado.values()) {
      if (l.vagaId !== vaga.id) continue;
      if (l.id === excluirId) continue;
      if (!consomePosicao(l.situacao as never)) continue;
      contagem.set(l.posicaoLado, (contagem.get(l.posicaoLado) ?? 0) + 1);
    }
    return [...contagem.entries()].map(([lado, quantas]) => ({ lado, quantas }));
  };

  const select = vi.fn(() => {
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
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.groupBy = () => Promise.resolve(ocupadas(atual ? atual.id : null));
    b.orderBy = () => {
      const alvo = parametros(onde).find((p) => estado.has(p));
      if (!alvo) return Promise.resolve([]);
      const l = estado.get(alvo)!;
      return Promise.resolve([
        {
          c: l,
          candidatoNome: pessoas.get(l.candidatoId)?.nome ?? "Sem nome",
          vagaCodigo: vaga.codigo,
          vagaNome: vaga.nomeDivulgacao,
          autor: "Consultor",
        },
      ]);
    };
    // A LEITURA DAS CANDIDATURAS ANTERIORES da pessoa naquela vaga (a régua da reentrada).
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

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: async (cond: unknown) => {
        escritas.push({ tabela, valores });
        if (tabela !== asCandidaturas) return;
        const alvo = parametros(cond).find((p) => estado.has(p));
        if (alvo) Object.assign(estado.get(alvo)!, valores);
      },
    }),
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      escritas.push({ tabela, valores });
      novas += 1;
      const nova = linha({
        id: `nova-${novas}`,
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

  const query = {
    asCandidaturas: {
      findFirst: async (arg: { where?: unknown }) => {
        const alvo = parametros(arg.where).find((p) => estado.has(p));
        atual = alvo ? { ...estado.get(alvo)! } : null;
        return atual;
      },
    },
    asCandidatos: {
      findFirst: async (arg: { where?: unknown }) => {
        const id = parametros(arg.where).find((p) => pessoas.has(p));
        return id ? pessoas.get(id) : null;
      },
    },
    vagas: {
      findFirst: async (arg: { where?: unknown }) =>
        parametros(arg.where).includes(vaga.id) ? { ...vaga } : null,
    },
  };

  const tx = { select, update, insert, query };
  const db = {
    select,
    update,
    insert,
    query,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  return {
    service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never),
    estado,
    escritas,
    contar: (situacao: string) =>
      [...estado.values()].filter((l) => l.situacao === situacao).length,
  };
}

const eventos = (escritas: Escrita[]) =>
  escritas.filter((e) => e.tabela === asCandidaturaEtapas).map((e) => e.valores);
const idsDasFalhas = (r: AsResultadoEmMassa) => r.falhas.map((f) => f.alvoId).sort();

describe("Uma linha ruim no MEIO do lote não impede as seguintes", () => {
  /**
   * A ORDEM É DE PROPÓSITO: as ruins ficam no MEIO, nunca no fim. Uma implementação que aborte no
   * primeiro erro passaria num lote com a linha ruim na última posição, e é justamente esse teste
   * confortável que não prova nada.
   */
  const misto = () =>
    makeDb({
      posicoesOficiais: 50,
      linhas: [
        linha({ id: "boa-1" }),
        linha({ id: "sumiu-1" }),
        linha({ id: "boa-2" }),
        linha({ id: "encerrada-1", situacao: "DESCARTADO", motivoDescarte: MOTIVO_ANTERIOR }),
        linha({ id: "boa-3" }),
      ],
    });

  /** A linha "sumiu-1" é retirada do estado: é a candidatura que a tela viu e que já não existe. */
  function comInexistente() {
    const ctx = misto();
    ctx.estado.delete("sumiu-1");
    return ctx;
  }

  const SELECAO = ["boa-1", "sumiu-1", "boa-2", "encerrada-1", "boa-3"];

  it("aplica as 3 boas e devolve as 2 ruins em falhas", async () => {
    const { service, contar } = comInexistente();

    const r = await service.finalizarPosicaoEmLote({ candidaturaIds: SELECAO }, USER.id);

    expect(r.aplicadas).toBe(3);
    expect(idsDasFalhas(r)).toEqual(["encerrada-1", "sumiu-1"]);
    // `aplicadas` CONTA O QUE FOI EFETIVADO, e não o que foi tentado: o estado confirma o número.
    expect(contar("ALOCADO")).toBe(3);
  });

  /** A ORDEM NÃO IMPORTA: o mesmo conjunto, embaralhado, dá o mesmo resultado. */
  it("o lote invertido dá exatamente o mesmo resultado", async () => {
    const { service, contar } = comInexistente();

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: [...SELECAO].reverse() },
      USER.id,
    );

    expect(r.aplicadas).toBe(3);
    expect(idsDasFalhas(r)).toEqual(["encerrada-1", "sumiu-1"]);
    expect(contar("ALOCADO")).toBe(3);
  });

  /** A falha aponta o ID QUE FOI ENVIADO, senão a tela não sabe qual linha marcar de vermelho. */
  it("cada falha aponta um id que estava na seleção", async () => {
    const { service } = comInexistente();
    const r = await service.finalizarPosicaoEmLote({ candidaturaIds: SELECAO }, USER.id);
    for (const f of r.falhas) expect(SELECAO).toContain(f.alvoId);
  });

  /** O mesmo para o avanço de etapa, que é a outra ação em massa que trata linha a linha. */
  it("mover etapa em lote também segue depois da linha encerrada", async () => {
    const { service, estado } = comInexistente();

    const r = await service.moverEtapaEmLote(
      { candidaturaIds: SELECAO, etapa: "ENTREVISTA_CLIENTE" },
      USER.id,
    );

    expect(r.aplicadas).toBe(3);
    expect(estado.get("boa-3")!.etapa).toBe("ENTREVISTA_CLIENTE");
    // A encerrada continua onde estava: recusada, e não movida em silêncio.
    expect(estado.get("encerrada-1")!.etapa).toBe("APROVACAO");
  });

  /** E para o desvínculo, que é o que a operação mais faz em massa depois de uma triagem. */
  it("desvincular em lote aplica as boas e reporta as ruins", async () => {
    const { service, contar } = comInexistente();

    const r = await service.registrarSaidaEmLote(
      { candidaturaIds: SELECAO, situacao: "DESCARTADO", motivo: "perfil não aderente" },
      USER,
    );

    expect(r.aplicadas).toBe(3);
    expect(r.falhas).toHaveLength(2);
    // As 3 boas mais a que já estava descartada antes do lote.
    expect(contar("DESCARTADO")).toBe(4);
  });

  /**
   * NA ADIÇÃO, a linha ruim típica é a pessoa que JÁ ESTÁ na vaga (dois consultores mandando a
   * mesma leva). Ela falha sozinha, e as outras entram.
   */
  it("adicionar em lote: quem já está na vaga falha sozinho, e os demais entram", async () => {
    const { service, escritas } = makeDb({
      posicoesOficiais: 50,
      candidatos: [
        { id: "p-1", nome: "Ana", cpf: null },
        { id: "p-2", nome: "Bruno", cpf: null },
        { id: "p-3", nome: "Carla", cpf: null },
      ],
      linhas: [linha({ id: "cand-2", candidatoId: "p-2", situacao: "ATIVO" })],
    });

    const r = await service.adicionarEmLote(
      "vaga-1",
      { candidatoIds: ["p-1", "p-2", "p-3"] },
      USER,
    );

    expect(r.aplicadas).toBe(2);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0].alvoId).toBe("p-2");
    // DUAS candidaturas novas nasceram, cada uma com o evento de ENTRADA no histórico.
    expect(escritas.filter((e) => e.tabela === asCandidaturas)).toHaveLength(2);
    expect(eventos(escritas)).toHaveLength(2);
  });
});

describe("A resposta do lote NÃO carrega dado pessoal (§A.6)", () => {
  /**
   * O CASO QUE MAIS PREOCUPA: a frase de reentrada monta o MOTIVO LIVRE do descarte anterior. Numa
   * resposta de trinta linhas, isso é um relatório de dado pessoal saindo pela porta da frente.
   */
  it("a falha de reentrada não repete o motivo do descarte anterior, nem o nome, nem o CPF", async () => {
    const { service } = makeDb({
      posicoesOficiais: 50,
      candidatos: [
        { id: "p-1", nome: NOME_NA_BASE, cpf: CPF_NA_BASE },
        { id: "p-2", nome: "Bruno Costa", cpf: null },
      ],
      linhas: [
        linha({
          id: "velha-1",
          candidatoId: "p-1",
          situacao: "DESCARTADO",
          motivoDescarte: MOTIVO_ANTERIOR,
        }),
      ],
    });

    const r = await service.adicionarEmLote(
      "vaga-1",
      { candidatoIds: ["p-1", "p-2"] },
      USER,
    );

    // A linha da reentrada é recusada sem a ciência, como na ação individual.
    expect(r.falhas).toHaveLength(1);

    const corpo = JSON.stringify(r);
    expect(corpo).not.toContain(MOTIVO_ANTERIOR);
    expect(corpo).not.toContain(NOME_NA_BASE);
    expect(corpo).not.toContain(CPF_NA_BASE);
  });

  /**
   * A FORMA DA FALHA É FECHADA: id e motivo, e mais nada. Um campo a mais hoje é o campo em que
   * amanhã alguém guarda o nome "só para a tela ficar mais clara".
   */
  it("cada falha tem exatamente duas chaves: alvoId e motivo", async () => {
    const { service, estado } = makeDb({
      posicoesOficiais: 50,
      linhas: [linha({ id: "encerrada-1", situacao: "DESISTIU", motivoDescarte: MOTIVO_ANTERIOR })],
    });
    estado.set("encerrada-2", linha({ id: "encerrada-2", situacao: "DESCARTADO" }));

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: ["encerrada-1", "encerrada-2"] },
      USER.id,
    );

    expect(r.falhas).toHaveLength(2);
    for (const f of r.falhas) {
      expect(Object.keys(f).sort()).toEqual(["alvoId", "motivo"]);
      expect(typeof f.motivo).toBe("string");
    }
  });

  /**
   * O MOTIVO É DE PROCESSO, e o teste é por CONTRASTE: o texto livre do descarte anterior está
   * gravado na linha que falhou, e mesmo assim não aparece na resposta.
   */
  it("nenhum motivo de falha carrega o texto livre gravado na candidatura", async () => {
    const { service } = makeDb({
      posicoesOficiais: 50,
      linhas: [
        linha({ id: "encerrada-1", situacao: "DESCARTADO", motivoDescarte: MOTIVO_ANTERIOR }),
        linha({ id: "boa-1" }),
      ],
    });

    const r = await service.finalizarPosicaoEmLote(
      { candidaturaIds: ["encerrada-1", "boa-1"] },
      USER.id,
    );

    expect(r.aplicadas).toBe(1);
    expect(JSON.stringify(r.falhas)).not.toContain(MOTIVO_ANTERIOR);
  });
});

describe("O aceite de reentrada é GRAVADO, e é por linha", () => {
  /**
   * DUAS REENTRADAS NO MESMO LOTE GERAM DOIS REGISTROS, cada um preso à sua candidatura. Um aceite
   * só, carimbado no lote, não responde "quem trouxe ESTA pessoa de volta", que é a pergunta da
   * §A.3 regra 8.
   */
  const cenario = () =>
    makeDb({
      posicoesOficiais: 50,
      candidatos: [
        { id: "p-1", nome: NOME_NA_BASE, cpf: CPF_NA_BASE },
        { id: "p-2", nome: "Bruno Costa", cpf: null },
        { id: "p-3", nome: "Carla Dias", cpf: null },
      ],
      linhas: [
        linha({
          id: "velha-1",
          candidatoId: "p-1",
          situacao: "DESCARTADO",
          motivoDescarte: MOTIVO_ANTERIOR,
        }),
        linha({ id: "velha-2", candidatoId: "p-2", situacao: "DESISTIU", motivoDescarte: "desistiu" }),
      ],
    });

  it("grava UM aceite por linha de reentrada, e nenhum para quem entra pela primeira vez", async () => {
    const { service, escritas } = cenario();

    const r = await service.adicionarEmLote(
      "vaga-1",
      { candidatoIds: ["p-1", "p-2", "p-3"], cienteReentrada: true },
      USER,
    );

    expect(r).toMatchObject({ aplicadas: 3, falhas: [] });

    const comAceite = eventos(escritas).filter((e) => e.aceite === ACEITE_REENTRADA);
    expect(comAceite).toHaveLength(2);
    // CADA UM NA SUA CANDIDATURA: um aceite só, repetido, não distingue quem voltou.
    expect(new Set(comAceite.map((e) => e.candidaturaId)).size).toBe(2);
    // E quem nunca esteve na vaga NÃO recebe carimbo de aceite nenhum.
    expect(eventos(escritas).filter((e) => !e.aceite)).toHaveLength(1);
  });

  it("o autor do aceite é o da sessão, e vem por linha", async () => {
    const { service, escritas } = cenario();

    await service.adicionarEmLote(
      "vaga-1",
      { candidatoIds: ["p-1", "p-2", "p-3"], cienteReentrada: true },
      USER,
    );

    for (const e of eventos(escritas).filter((x) => x.aceite === ACEITE_REENTRADA)) {
      expect(e.porId).toBe(USER.id);
    }
  });

  /**
   * SEM A CIÊNCIA, NADA ENTRA E NADA É GRAVADO: o aceite registra uma decisão que foi tomada, e não
   * a existência de um campo no corpo.
   */
  it("sem a ciência no corpo, as reentradas falham e nenhum aceite é gravado", async () => {
    const { service, escritas } = cenario();

    const r = await service.adicionarEmLote(
      "vaga-1",
      { candidatoIds: ["p-1", "p-2", "p-3"] },
      USER,
    );

    expect(r.aplicadas).toBe(1);
    expect(r.falhas).toHaveLength(2);
    expect(eventos(escritas).filter((e) => e.aceite === ACEITE_REENTRADA)).toHaveLength(0);
  });
});
