import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import {
  catalogoDeStatusFingido,
  linhasDeStatusFingidas,
} from "../vaga-status/vaga-status-catalogo.fake";
import type { AuthUser } from "../../auth/auth.types";

/**
 * ─ A RÉGUA VEM DO CATÁLOGO, E CONTINUA NÃO SENDO DIGITADA AQUI (onda B2) ───────────────────────
 *
 * `STATUS_QUE_NAO_RECEBEM` e `vagaRecebeCandidato` saíram do domínio: a pergunta virou o flag
 * `recebeCandidato` do catálogo. O QUE ESTE ARQUIVO AFIRMA NÃO MUDOU, e a forma também não: os dois
 * conjuntos são DERIVADOS do mesmo catálogo que o serviço consulta, então um status novo entra na
 * cobertura sozinho, que é o ponto inteiro de a trava perguntar em vez de repetir a lista.
 */
const CATALOGO = linhasDeStatusFingidas();
const NAO_RECEBEM = CATALOGO.filter((s) => !s.recebeCandidato).map((s) => s.codigo);
const RECEBE = (codigo: string) => CATALOGO.find((s) => s.codigo === codigo)?.recebeCandidato === true;

/**
 * ─ A VAGA ENCERRADA NÃO RECEBE POSIÇÃO, TAMBÉM PELO CAMINHO TRAVADO (auditoria de 09/09) ────────
 *
 * ┌─ O BURACO, e ele era de LEITURA SEM CONFERÊNCIA, não de dado faltando ─────────────────────┐
 * │ `mudarSituacaoOcupandoPosicao` já selecionava `vagas.status` dentro do `SELECT ... FOR      │
 * │ UPDATE`, e NENHUMA linha do método usava o campo. A `alocar` e a `trocarVaga` aplicavam     │
 * │ `vagaRecebeCandidato`; o caminho travado, por onde passam a FINALIZAÇÃO DE POSIÇÃO, a       │
 * │ APROVAÇÃO e o AVANÇO PARA A ESTEIRA, lia o status e seguia adiante.                         │
 * │                                                                                            │
 * │ O DANO É SILENCIOSO E MEDIDO: o fechamento CONGELA `vagas_fechadas`/`vagas_fechadas_banco`  │
 * │ com a contagem do instante em que encerrou, e é esse carimbo que a vaga encerrada mostra.   │
 * │ Toda posição finalizada depois move a ocupação DERIVADA e não move o carimbo: os dois       │
 * │ números passam a discordar num processo que a operação considera terminado.                 │
 * │                                                                                            │
 * │ E O GATE DE MASTER VIRAVA CONTORNÁVEL EM DUAS ETAPAS: o Master força o fechamento com       │
 * │ posição oficial em aberto, e depois despeja-se alocação na vaga fechada, onde nenhuma trava │
 * │ do fechamento roda de novo.                                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. AS TRÊS PORTAS do caminho travado recusam a vaga encerrada, nas TRÊS folhas do encerramento.
 *   2. NADA É GRAVADO na recusa: nem a situação, nem o evento do histórico.
 *   3. A RECUSA VEM ANTES DA CONTAGEM: a vaga encerrada nem chega a ser medida contra a meta, e a
 *      frase que a pessoa lê fala do ENCERRAMENTO, não de vaga cheia.
 *   4. A VAGA VIVA CONTINUA PASSANDO, inclusive o RASCUNHO, que recebe candidato de propósito.
 *   5. A RÉGUA É A DO CATÁLOGO: quem passa é exatamente quem o flag `recebeCandidato` deixa passar,
 *      e não uma segunda lista de status escrita aqui dentro.
 *
 * O FAKE é o mesmo formato do `candidatos.guardas-de-situacao.spec.ts`, com uma diferença: o STATUS
 * DA VAGA é do cenário. Nos outros arquivos ele é sempre "ABERTA", e foi por isso que 200 testes
 * verdes conviveram com o buraco sem nunca encostar nele.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

/**
 * QUEM REGISTRA A SAÍDA. O método passou a receber o usuário INTEIRO, e não só o id, porque
 * desvincular quem está ALOCADO virou ação de MASTER (a posição dele já foi entregue). Aqui o COMUM
 * basta: nenhuma destas chamadas desvincula um alocado, e a autoria continua saindo de `user.id`.
 */
const consultor = (id: string): AuthUser => ({
  id,
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
});

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function candidatura(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "APROVACAO",
    situacao: "APROVADO",
    motivoDescarte: null,
    posicaoLado: null,
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    ...over,
  };
}

function makeDb(cenario: {
  statusVaga: string;
  candidatura?: Record<string, unknown>;
  posicoesOficiais?: number | null;
  posicoesBanco?: number;
  ocupadas?: number;
}) {
  const c = cenario.candidatura ?? candidatura();
  const vaga = {
    id: "vaga-1",
    status: cenario.statusVaga,
    posicoesOficiais: cenario.posicoesOficiais === undefined ? 5 : cenario.posicoesOficiais,
    posicoesBanco: cenario.posicoesBanco ?? 0,
  };

  const ordem: string[] = [];
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn(() => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.orderBy = () =>
      Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    b.for = (modo: string) => {
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    b.groupBy = () => {
      if (tabela === asCandidaturas) ordem.push("conta-ocupadas");
      return Promise.resolve([{ lado: null, quantas: cenario.ocupadas ?? 0 }]);
    };
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
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
    query: { asCandidaturas: { findFirst: vi.fn().mockResolvedValue(c) } },
  };

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: { asCandidaturas: { findFirst: vi.fn().mockResolvedValue(c) } },
  };

  return { service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never), ordem, updates, inserts };
}

const doUpdate = (updates: Escrita[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};

const frase = (erro: unknown) =>
  String(((erro as ConflictException).getResponse() as { message?: string })?.message ?? erro);

/**
 * AS TRÊS PORTAS DO CAMINHO TRAVADO, cada uma com a chamada real que a rota faz. Elas são três
 * caminhos diferentes até o MESMO método privado, e testar só uma deixaria as outras duas livres no
 * dia em que alguém movesse a conferência para dentro de um dos chamadores.
 */
interface Porta {
  nome: string;
  /** De qual situação a candidatura parte, para a porta não esbarrar em OUTRA trava antes desta. */
  de: string;
  chamar: (s: CandidatosService) => Promise<unknown>;
}

const PORTAS: Porta[] = [
  {
    nome: "finalizarPosicao",
    de: "APROVADO",
    chamar: (s) => s.finalizarPosicao("cand-1", {}, "user-1"),
  },
  { nome: "aprovar", de: "ATIVO", chamar: (s) => s.aprovar("cand-1", "user-1") },
  {
    nome: "registrarSaida (ENVIADO_PARA_ADMISSAO)",
    de: "ALOCADO",
    chamar: (s) =>
      s.registrarSaida(
        "cand-1",
        { situacao: "ENVIADO_PARA_ADMISSAO", motivo: "foi para a esteira" },
        consultor("user-1"),
      ),
  },
];

describe("o caminho travado CONFERE o status da vaga que ele já lia", () => {
  for (const porta of PORTAS) {
    it.each([...NAO_RECEBEM])(
      `${porta.nome}: RECUSA a vaga %s, e NADA é gravado`,
      async (status) => {
        const { service, ordem, updates, inserts } = makeDb({
          statusVaga: status,
          candidatura: candidatura({ situacao: porta.de }),
          posicoesOficiais: 5,
          ocupadas: 0,
        });

        const erro = await porta.chamar(service).catch((e) => e);

        expect(erro).toBeInstanceOf(ConflictException);
        expect(frase(erro)).toContain("já foi encerrada");
        // A vaga tinha posição de sobra (5 oficiais, 0 ocupadas): o que recusou foi o ENCERRAMENTO.
        expect(updates).toHaveLength(0);
        expect(inserts).toHaveLength(0);
        // E A RECUSA VEM ANTES DA CONTAGEM: a vaga encerrada nem é medida contra a meta.
        expect(ordem).toEqual(["trava-vaga"]);
      },
    );
  }

  it.each(["ABERTA", "RASCUNHO"])(
    "a vaga %s continua recebendo posição, exatamente como antes",
    async (status) => {
      const { service, ordem, updates } = makeDb({
        statusVaga: status,
        posicoesOficiais: 5,
        ocupadas: 1,
      });

      await service.finalizarPosicao("cand-1", {}, "user-1");

      expect(doUpdate(updates)).toMatchObject({ situacao: "ALOCADO", posicaoLado: "OFICIAL" });
      expect(ordem).toEqual(["trava-vaga", "conta-ocupadas"]);
    },
  );

  /**
   * A RÉGUA É A DO DOMÍNIO, E NÃO UMA SEGUNDA LISTA. Este teste percorre os dois conjuntos pelo
   * PREDICADO, não por nomes digitados: o dia em que um status novo nascer com `recebeCandidato`
   * falso, ele passa a ser recusado aqui sem ninguém tocar neste arquivo, que é o ponto inteiro de
   * a trava perguntar ao catálogo em vez de repetir a lista.
   */
  it("quem passa é exatamente quem o flag `recebeCandidato` deixa passar", async () => {
    // O CATÁLOGO INTEIRO, e não uma lista digitada: o `VAGA_BANCO` (dormente, inativo e que RECEBE)
    // entra por estar no catálogo, exatamente como está no banco depois da migration 0102.
    const TODOS = CATALOGO.map((s) => s.codigo);

    for (const status of TODOS) {
      const { service, updates } = makeDb({ statusVaga: status, posicoesOficiais: 5, ocupadas: 0 });
      const erro = await service.finalizarPosicao("cand-1", {}, "user-1").catch((e) => e);

      const passou = !(erro instanceof ConflictException);
      expect(passou).toBe(RECEBE(status));
      expect(updates.length > 0).toBe(RECEBE(status));
    }
  });

  /**
   * O CONTORNO EM DUAS ETAPAS, encenado: a vaga já FECHADA (com o carimbo do fechamento congelado
   * em 3) recebendo mais uma finalização de posição. Antes, a candidatura virava `ALOCADO`, a
   * ocupação derivada ia para 4 e o carimbo continuava dizendo 3, sem nada falhar.
   */
  it("a vaga FECHADA não ganha mais uma posição por baixo do carimbo do fechamento", async () => {
    const { service, updates, inserts } = makeDb({
      statusVaga: "FECHADA",
      posicoesOficiais: 5,
      ocupadas: 3,
    });

    const erro = await service
      .finalizarPosicao("cand-1", { lado: "OFICIAL" } as never, "user-1")
      .catch((e) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(updates).toHaveLength(0);
    expect(inserts.filter((i) => i.tabela === asCandidaturaEtapas)).toHaveLength(0);
  });

  /** §A.11: nenhuma frase que chega ao usuário carrega travessão. §A.6: fala de estado, não de gente. */
  it("a frase da recusa não tem travessão e não cita pessoa nenhuma", async () => {
    const { service } = makeDb({
      statusVaga: "ENTREGUE",
      candidatura: candidatura({ situacao: "ATIVO" }),
      posicoesOficiais: 5,
    });
    const erro = await service.aprovar("cand-1", "user-1").catch((e) => e);

    expect(frase(erro)).not.toContain("—");
    expect(frase(erro)).not.toContain("Fulano");
    expect(frase(erro)).not.toContain("pessoa-1");
  });
});
