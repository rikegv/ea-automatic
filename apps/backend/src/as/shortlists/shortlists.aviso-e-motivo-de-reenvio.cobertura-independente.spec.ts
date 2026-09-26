import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { SHORTLIST_MINIMO_SUGERIDO } from "@ea/shared-types";
import {
  asCandidaturas,
  asShortlistItens,
  asShortlists,
  vagas as vagasTabela,
} from "../../db/schema";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { ShortlistsService } from "./shortlists.service";

/**
 * ─ O AVISO DA LISTA CURTA E O MOTIVO DE REENVIO DE CATÁLOGO (cobertura independente, §A.38) ─────
 *
 * ESTE ARQUIVO É DO `tester`, ESCRITO ANTES DO CÓDIGO (§A.40 regra 2), a partir do REQUISITO do
 * diretor e não da implementação. Nada do que a construção vier a fazer é lido aqui como definição.
 *
 * ┌─ OS DOIS REQUISITOS FECHADOS PELO DIRETOR QUE ESTE ARQUIVO MEDE ───────────────────────────────┐
 * │ 2. AVISAR SEMPRE QUE A LISTA TIVER MENOS DE TRÊS, INCLUSIVE EM REENVIO. Até aqui o aviso era   │
 * │    medido SÓ no primeiro envio, e o reenvio curto passava direto, em silêncio. O diretor       │
 * │    reverteu: o cliente que recebe dois nomes recebe dois nomes, seja na primeira lista ou na   │
 * │    quarta, e a pergunta tem de aparecer nas duas. CONTINUA NÃO BLOQUEANTE: pergunta, registra  │
 * │    a confirmação e deixa passar.                                                                │
 * │ 6. O MOTIVO DO REENVIO VIRA CATÁLOGO (`motivos_reenvio_shortlist`), no molde dos motivos de    │
 * │    descarte: hoje ele é TEXTO LIVRE com `@MinLength(2)`, então "ok" é um motivo válido e o     │
 * │    relatório de reenvio nunca fecha. O reenvio passa a exigir motivo DO CATÁLOGO ATIVO; o      │
 * │    primeiro envio continua RECUSANDO motivo; e inativar um motivo NÃO reescreve o histórico.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE UM DUBLÊ PRÓPRIO, E NÃO O `shortlists.tester-fake.ts` DO VIZINHO ─────────────────────┐
 * │ Aquele dublê NÃO CONHECE o catálogo de motivos de reenvio (a tabela nem existia quando ele foi │
 * │ escrito), e a leitura do catálogo é metade do requisito 6. Um fake que devolvesse vazio para a │
 * │ consulta do catálogo recusaria TODO reenvio, e o vermelho falaria do dublê e não do código.    │
 * │                                                                                                 │
 * │ A ROTA DA TABELA DESCONHECIDA É DELIBERADA, e é o mesmo recurso de `vagas.cancelar.spec.ts`:   │
 * │ toda consulta cujo `from()` NÃO é uma das três tabelas que a shortlist já usa é tratada como a │
 * │ consulta do CATÁLOGO. Assim o dublê não depende do NOME que a construção vier a dar à tabela   │
 * │ nova nem do arquivo em que ela for declarada, que é justamente o que eu não posso adivinhar    │
 * │ escrevendo antes do código.                                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CORREÇÃO DE CONTRATO QUE ESTE ARQUIVO RECEBEU DEPOIS DE ESCRITO ────────────────────────────┐
 * │ Ele foi escrito ANTES do código (que é o ponto), e supôs o molde EXATO do descarte: o motivo    │
 * │ gravado como NOME. O contrato fechado pelo coordenador é OUTRO, e está no `shared-types`:       │
 * │ `AsShortlist.motivoReenvioId` + `motivoReenvioNome`, com FK `restrict` para o catálogo. A razão │
 * │ da divergência é real e não é estilo: o reenvio é lido em AGREGADO ("quantos por mudança de     │
 * │ perfil?"), e agregado exato só existe com id.                                                    │
 * │                                                                                                 │
 * │ O QUE MUDOU AQUI FOI SÓ O VOCABULÁRIO DO CORPO E DAS ASSERÇÕES. Nenhum requisito foi afrouxado, │
 * │ e o caso que mais importava segue medindo a MESMA propriedade: o motivo INATIVADO continua       │
 * │ legível no histórico. Com id, essa propriedade passa a depender de o join ser `left` e de NÃO   │
 * │ filtrar por `ativo` na leitura, que é exatamente o erro que o bloco daquele caso descreve.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nomes inventados de candidato, ids técnicos, datas e frases de processo. Nenhum CPF.
 */

const DIA = "2026-09-20";
const OUTRO_DIA = "2026-09-26";
const AUTOR = "user-1";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE REENVIO, COMO ELE NASCE NO MOLDE DO DESCARTE ───────────────────────
 *
 * OS NOMES SÃO INVENTADOS DE PROPÓSITO, e nenhum teste deste arquivo se apoia num deles: o que está
 * sob prova é a PERTINÊNCIA AO CATÁLOGO ATIVO, não a grafia. Comparar por nome literal é exatamente
 * o defeito que o bloco da pretensão salarial já documentou no `candidatos.service`.
 */
const NOME_DO_ATIVO = "O Cliente Pediu Mais Nomes";
const NOME_DO_INATIVO = "Erro De Montagem Da Lista";

const MOTIVO_ATIVO = "mr-1";
const MOTIVO_INATIVO = "mr-9";
/** Um id que o catálogo não conhece: é o que a rota passou a recusar. */
const MOTIVO_FORA_DO_CATALOGO = "mr-que-ninguem-cadastrou";

const CATALOGO_DE_REENVIO = [
  { id: MOTIVO_ATIVO, nome: NOME_DO_ATIVO, ativo: true },
  { id: "mr-2", nome: "Lista Recusada Pelo Cliente", ativo: true },
  { id: MOTIVO_INATIVO, nome: NOME_DO_INATIVO, ativo: false },
];

/** O nome que a leitura tem de resolver para um id, pelo `leftJoin` com o catálogo. */
const nomeDoMotivo = (id: string | null) =>
  CATALOGO_DE_REENVIO.find((m) => m.id === id)?.nome ?? null;

interface CandidaturaFingida {
  id: string;
  candidatoId: string;
  nome: string;
  situacao: string;
  etapa: string;
}

function tresVivos(): CandidaturaFingida[] {
  return [
    { id: "k1", candidatoId: "p1", nome: "Ana Inventada", situacao: "ATIVO", etapa: "TRIAGEM" },
    { id: "k2", candidatoId: "p2", nome: "Bruno Inventado", situacao: "ATIVO", etapa: "TRIAGEM" },
    { id: "k3", candidatoId: "p3", nome: "Carla Inventada", situacao: "ATIVO", etapa: "TRIAGEM" },
  ];
}

/** Os valores de parâmetro que um filtro do Drizzle carrega (mesmo extrator dos dublês vizinhos). */
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

/**
 * A CLÁUSULA CARREGA UM PARÂMETRO BOOLEANO `true`? É como se reconhece o `eq(motivos.ativo, true)`
 * do recorte de leitura do catálogo, sem serializar o objeto circular do Drizzle.
 */
function temParametroVerdadeiro(filtro: unknown): boolean {
  const vistos = new Set<unknown>();
  let achou = false;
  const visitar = (no: unknown) => {
    if (achou || !no || typeof no !== "object" || vistos.has(no)) return;
    vistos.add(no);
    if (Array.isArray(no)) {
      for (const filho of no) visitar(filho);
      return;
    }
    const c = no as { encoder?: unknown; value?: unknown; queryChunks?: unknown[] };
    if ("encoder" in c && c.value === true) {
      achou = true;
      return;
    }
    if (Array.isArray(c.queryChunks)) for (const filho of c.queryChunks) visitar(filho);
    if (Array.isArray(c.value)) visitar(c.value);
  };
  visitar(filtro);
  return achou;
}

interface ShortlistGravada {
  id: string;
  numero: number;
  enviadaEm: string;
  motivoReenvioId: string | null;
  avisoCurtaAceito: boolean;
  itens: string[];
}

function banco(cenario: {
  candidaturas: CandidaturaFingida[];
  jaEnviadas?: { numero: number; enviadaEm: string; motivoReenvioId?: string | null }[];
  /** O catálogo que a construção vier a ler. Trocável para o caso do catálogo VAZIO. */
  catalogo?: { id: string; nome: string; ativo: boolean }[];
}) {
  const candidaturas = cenario.candidaturas.map((c) => ({ ...c }));
  const catalogo = cenario.catalogo ?? CATALOGO_DE_REENVIO;
  const vaga = { id: "vaga-1", status: "ABERTA", envioShortlist: null as string | null };
  const shortlists: ShortlistGravada[] = (cenario.jaEnviadas ?? []).map((s) => ({
    id: `sl-${s.numero}`,
    numero: s.numero,
    enviadaEm: s.enviadaEm,
    motivoReenvioId: s.numero === 1 ? null : (s.motivoReenvioId ?? MOTIVO_ATIVO),
    avisoCurtaAceito: false,
    itens: [],
  }));

  /**
   * A RESPOSTA DO CATÁLOGO. Ela HONRA O `where` de forma crua: cláusula que fale de `ativo` (e não
   * tenha `or`) devolve só os ativos, que é o que uma consulta no molde do descarte faz
   * (`where(eq(motivos.ativo, true))`). Uma construção que trouxesse a lista INTEIRA e esquecesse de
   * filtrar o inativo deixaria o caso do motivo inativado VERMELHO, que é o ponto.
   */
  const respostaDoCatalogo = (filtro: unknown): Record<string, unknown>[] => {
    /*
     * ─ POR QUE ISTO NÃO É `JSON.stringify(filtro)`, E ISSO CUSTOU UMA RODADA DE VERMELHO ────────
     *
     * A primeira redação serializava o filtro para procurar "ativo" no texto. O objeto de filtro do
     * Drizzle é CIRCULAR (`PgTable -> PgUUID -> table`), então `JSON.stringify` LANÇA, e o erro
     * subia de dentro do dublê acusando o service de devolver `TypeError` no lugar da recusa.
     * FALSO VERMELHO É BARATO QUANDO SE INVESTIGA E CARO QUANDO SE ACREDITA.
     *
     * A DETECÇÃO CERTA É A MESMA DOS DUBLÊS VIZINHOS: descer nos parâmetros que a cláusula carrega
     * e procurar o booleano `true` de `eq(motivos.ativo, true)`. Sem `stringify`, sem regex sobre
     * texto, e insensível a qualquer refatoração da consulta real.
     */
    const soAtivos = temParametroVerdadeiro(filtro);
    return (soAtivos ? catalogo.filter((m) => m.ativo) : catalogo).map((m) => ({ ...m }));
  };

  const select = vi.fn((projecao?: Record<string, unknown>) => {
    let tabela: unknown = null;
    let filtro: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.limit = () => Promise.resolve(respostaDoCatalogo(filtro));
    b.where = (f: unknown) => {
      filtro = f;
      return b;
    };
    b.for = () => Promise.resolve([{ ...vaga }]);
    b.orderBy = () => {
      if (tabela === asShortlists) {
        const alvo = parametros(filtro).filter((p) => p.startsWith("sl-"));
        const recorte = alvo.length ? shortlists.filter((s) => alvo.includes(s.id)) : shortlists;
        return Promise.resolve(
          [...recorte]
            .sort((a, z) => a.numero - z.numero)
            .map((s) => ({
              s: {
                id: s.id,
                vagaId: vaga.id,
                numero: s.numero,
                enviadaEm: s.enviadaEm,
                motivoReenvioId: s.motivoReenvioId,
                avisoCurtaAceito: s.avisoCurtaAceito,
              },
              autor: "Consultor",
              /*
               * O NOME RESOLVIDO PELO JOIN, E ELE **NÃO** OLHA `ativo`. É esta linha que deixa o
               * caso do motivo inativado honesto: um `innerJoin ... where ativo` na construção
               * faria a shortlist histórica SUMIR da leitura, e é isso que se quer pegar.
               */
              motivoNome: nomeDoMotivo(s.motivoReenvioId),
            })),
        );
      }
      if (tabela === asShortlistItens) {
        const alvo = parametros(filtro).filter((p) => p.startsWith("sl-"));
        const linhas: Record<string, unknown>[] = [];
        for (const s of shortlists) {
          if (alvo.length && !alvo.includes(s.id)) continue;
          for (const candidaturaId of s.itens) {
            const c = candidaturas.find((x) => x.id === candidaturaId);
            if (!c) continue;
            linhas.push({
              shortlistId: s.id,
              candidaturaId: c.id,
              candidatoId: c.candidatoId,
              candidatoNome: c.nome,
              etapaAtual: c.etapa,
              situacaoAtual: c.situacao,
            });
          }
        }
        return Promise.resolve(linhas);
      }
      // A ROTA DA TABELA DESCONHECIDA: o catálogo de motivos de reenvio. Ver o cabeçalho.
      return Promise.resolve(respostaDoCatalogo(filtro));
    };
    b.then = (r: (v: unknown) => unknown) => {
      if (projecao && "maximo" in projecao) {
        const maximo = shortlists.reduce((m, s) => Math.max(m, s.numero), 0);
        return Promise.resolve([{ maximo }]).then(r);
      }
      if (tabela === asCandidaturas) {
        const pedidos = parametros(filtro).filter((p) => candidaturas.some((c) => c.id === p));
        const vivos = candidaturas.filter(
          (c) => pedidos.includes(c.id) && c.situacao !== "DESCARTADO" && c.situacao !== "DESISTIU",
        );
        return Promise.resolve(vivos.map((c) => ({ id: c.id }))).then(r);
      }
      return Promise.resolve(respostaDoCatalogo(filtro)).then(r);
    };
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => ({
      where: () => {
        if (tabela === vagasTabela && typeof valores.envioShortlist === "string") {
          vaga.envioShortlist = valores.envioShortlist;
        }
        return {
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
          returning: async () => [{ id: vaga.id }],
        };
      },
    }),
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown> | Record<string, unknown>[]) => {
      if (tabela === asShortlists) {
        const v = valores as Record<string, unknown>;
        shortlists.push({
          id: `sl-${v.numero as number}`,
          numero: v.numero as number,
          enviadaEm: v.enviadaEm as string,
          motivoReenvioId: (v.motivoReenvioId as string | null) ?? null,
          avisoCurtaAceito: v.avisoCurtaAceito === true,
          itens: [],
        });
      }
      if (tabela === asShortlistItens) {
        for (const item of valores as Record<string, unknown>[]) {
          const alvo = shortlists.find((s) => s.id === item.shortlistId);
          if (alvo) alvo.itens.push(item.candidaturaId as string);
        }
      }
      return {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [
          { id: `sl-${(valores as Record<string, unknown>).numero as number}` },
        ],
      };
    },
  }));

  const tx = { select, update, insert };
  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  /*
   * FOLGA PARA DEPENDÊNCIA NOVA NO CONSTRUTOR, e é o mesmo recurso de
   * `onda-e.menu-dos-catalogos.tester.spec.ts`: se a construção preferir INJETAR o catálogo em vez
   * de lê-lo com `this.db` (o molde do descarte lê com `this.db`, de propósito documentado), o
   * terceiro argumento responde `listarAtivos`/`listar`/`ativos` com a mesma lista. Assim o teste
   * mede o REQUISITO, e não a escolha de desenho que eu não tenho como adivinhar antes do código.
   */
  const catalogoInjetado = {
    listarAtivos: async () => catalogo.filter((m) => m.ativo),
    listar: async () => catalogo,
    ativos: async () => catalogo.filter((m) => m.ativo),
  };
  const Ctor = ShortlistsService as unknown as new (...args: unknown[]) => ShortlistsService;

  return {
    service: new Ctor(db, catalogoDeStatusFingido(), catalogoInjetado),
    shortlists,
    vaga,
  };
}

/** O envio, com o corpo tipado com folga: o contrato fechado usa `motivoReenvioId`. */
type Corpo = Record<string, unknown>;
const enviar = (s: ShortlistsService) =>
  (s as unknown as {
    enviar: (vagaId: string, dto: Corpo, porId: string) => Promise<Record<string, unknown>>;
  }).enviar.bind(s);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 2: O AVISO DA LISTA CURTA VALE TAMBÉM NO REENVIO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("2. a lista com menos de três avisa SEMPRE, inclusive no reenvio", () => {
  /**
   * ─ O CASO CENTRAL DESTE BLOCO, E ELE INVERTE UM COMPORTAMENTO QUE JÁ ESTAVA EM PRODUÇÃO ───────
   *
   * O reenvio de DOIS nomes passava em silêncio. O argumento de então era razoável ("reenviar dois
   * depois de uma lista de seis é o cliente pedindo mais dois"), e o diretor decidiu contra ele: o
   * que a guarda mede é o TAMANHO DA LISTA QUE FOI AO CLIENTE, e o cliente não soma as listas na
   * cabeça dele. A pergunta aparece, e quem quiser mandar assim mesmo confirma.
   */
  it("o REENVIO com dois nomes PERGUNTA antes, e não grava nada", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_ATIVO },
      AUTOR,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect((erro as ConflictException).getResponse()).toMatchObject({
      needsConfirmation: true,
      quantidade: 2,
      minimoSugerido: SHORTLIST_MINIMO_SUGERIDO,
    });
    // NADA GRAVADO: a lista de shortlists continua com a primeira e só ela.
    expect(b.shortlists.map((s) => s.numero)).toEqual([1]);
  });

  /**
   * NÃO BLOQUEIA, E A CONFIRMAÇÃO FICA GRAVADA (§A.3 regra 8). Guarda atravessável sem registro não
   * é guarda, é texto: sem `avisoCurtaAceito` no reenvio, o log de aceite passaria a ter buraco
   * justamente nos envios que o diretor mandou passar a medir.
   */
  it("com a ciência, o reenvio curto PASSA e o aceite fica registrado", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const enviada = await enviar(b.service)(
      "vaga-1",
      {
        candidaturaIds: ["k1", "k2"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_ATIVO,
        cienteShortlistCurta: true,
      },
      AUTOR,
    );

    expect(enviada.numero).toBe(2);
    expect(enviada.avisoCurtaAceito, "o aceite do reenvio curto tem de ser gravado").toBe(true);
  });

  /** O REENVIO COMPLETO NÃO PERGUNTA NADA: a guarda mede o tamanho, e três é o mínimo sugerido. */
  it("o reenvio com três nomes passa direto, sem aviso", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const enviada = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_ATIVO },
      AUTOR,
    );

    expect(enviada.numero).toBe(2);
    expect(enviada.avisoCurtaAceito, "sem guarda atravessada não há aceite a registrar").toBe(false);
  });

  /**
   * ─ A FRASE TEM DE PARAR DE DIZER "PRIMEIRA", E ISSO NÃO É REDAÇÃO ──────────────────────────────
   *
   * A mensagem hoje é "Esta PRIMEIRA shortlist tem N candidato(s)...". Ligada ao reenvio sem tocar a
   * frase, ela passa a AFIRMAR UM FATO FALSO na tela, num modal cuja única função é fazer a pessoa
   * decidir com a informação certa. Quem lê "primeira" num reenvio conclui que o sistema perdeu o
   * envio anterior, e o próximo passo dela é abrir chamado, não confirmar.
   */
  it("a frase do aviso NÃO chama de PRIMEIRA uma lista que é reenvio", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_ATIVO },
      AUTOR,
    ).catch((e: unknown) => e);

    const corpo = (erro as ConflictException).getResponse() as { mensagem?: string };
    expect(String(corpo.mensagem)).not.toMatch(/primeira/i);
  });

  /** A REGRESSÃO DO OUTRO LADO: ligar o reenvio não pode desligar o aviso do PRIMEIRO envio. */
  it("o PRIMEIRO envio curto continua avisando", async () => {
    const b = banco({ candidaturas: tresVivos() });

    const erro = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2"], enviadaEm: DIA },
      AUTOR,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ConflictException);
    expect(b.shortlists).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 6: O MOTIVO DO REENVIO VEM DO CATÁLOGO ATIVO
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("6. o motivo do reenvio deixa de ser texto livre e passa a ser catálogo", () => {
  /**
   * ─ O DEFEITO QUE O CATÁLOGO FECHA, E ELE É SILENCIOSO ─────────────────────────────────────────
   *
   * Hoje o motivo é `@IsString() @MinLength(2)`. "ok" passa. "asdf" passa. Cada consultor escreve de
   * um jeito, e a pergunta que o campo existe para responder ("por que esta vaga reenviou quatro
   * vezes?") não tem resposta agregável nenhuma. É LETRA POR LETRA o que levou o motivo de DESCARTE
   * a virar catálogo na Frente A, e a correção é a mesma.
   */
  it("o reenvio RECUSA motivo que não está no catálogo", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await enviar(b.service)(
      "vaga-1",
      {
        candidaturaIds: ["k1", "k2", "k3"],
        enviadaEm: OUTRO_DIA,
        motivoReenvioId: MOTIVO_FORA_DO_CATALOGO,
      },
      AUTOR,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists.map((s) => s.numero)).toEqual([1]);
  });

  /**
   * O MOTIVO INATIVADO SAIU DE CIRCULAÇÃO, e recusá-lo é a outra metade do que "inativar" quer
   * dizer. Sem esta recusa, inativar não faria nada no servidor: a tela pararia de oferecer e
   * qualquer chamada direta à rota continuaria gravando.
   */
  it("o reenvio RECUSA motivo do catálogo que foi INATIVADO", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_INATIVO },
      AUTOR,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists.map((s) => s.numero)).toEqual([1]);
  });

  /** O CAMINHO FELIZ, e sem ele os dois de cima passariam com uma recusa que recusa TUDO. */
  it("o reenvio com motivo do catálogo ATIVO grava, e o motivo fica na linha", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const enviada = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_ATIVO },
      AUTOR,
    );

    expect(enviada.numero).toBe(2);
    expect(enviada.motivoReenvioId).toBe(MOTIVO_ATIVO);
    expect(enviada.motivoReenvioNome).toBe(NOME_DO_ATIVO);
  });

  /** A EXIGÊNCIA CONTINUA: reenviar sem motivo nenhum segue recusado, e a frase segue de processo. */
  it("o reenvio SEM motivo continua recusado", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [{ numero: 1, enviadaEm: DIA }],
    });

    const erro = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: OUTRO_DIA },
      AUTOR,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists.map((s) => s.numero)).toEqual([1]);
  });

  /**
   * O PRIMEIRO ENVIO CONTINUA RECUSANDO MOTIVO, e agora com o catálogo no meio a regressão fica
   * mais fácil: quem escreve "confere o motivo contra o catálogo" tende a deixar o primeiro envio
   * passar com um motivo VÁLIDO, porque ele é válido. Não é sobre validade, é sobre não haver envio
   * anterior a justificar.
   */
  it("o PRIMEIRO envio recusa motivo, mesmo sendo um motivo do catálogo ativo", async () => {
    const b = banco({ candidaturas: tresVivos() });

    const erro = await enviar(b.service)(
      "vaga-1",
      { candidaturaIds: ["k1", "k2", "k3"], enviadaEm: DIA, motivoReenvioId: MOTIVO_ATIVO },
      AUTOR,
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.shortlists).toHaveLength(0);
  });

  /**
   * ─ INATIVAR NÃO REESCREVE O PASSADO (a invariante do molde) ───────────────────────────────────
   *
   * O contrato fechado grava o ID com FK `restrict`, e é JUSTAMENTE por isso que este caso ficou
   * mais necessário, e não menos: inativar não pode travar nem sumir com nada, e o reenvio de
   * janeiro continua dizendo por que aconteceu mesmo com o motivo fora de circulação em março.
   * QUALQUER construção que resolvesse o nome por `inner join ... where ativo` faria a linha
   * histórica sumir da leitura, em silêncio, e é esse o erro que este caso existe para pegar.
   */
  it("o motivo INATIVADO continua legível no histórico da vaga", async () => {
    const b = banco({
      candidaturas: tresVivos(),
      jaEnviadas: [
        { numero: 1, enviadaEm: DIA },
        { numero: 2, enviadaEm: OUTRO_DIA, motivoReenvioId: MOTIVO_INATIVO },
      ],
    });

    const listar = (b.service as unknown as {
      listar: (vagaId: string) => Promise<Record<string, unknown>[]>;
    }).listar.bind(b.service);

    const historico = await listar("vaga-1");
    const reenvio = historico.find((s) => s.numero === 2);
    expect(reenvio, "o reenvio sumiu da leitura do histórico").toBeDefined();
    expect(reenvio?.motivoReenvioId).toBe(MOTIVO_INATIVO);
    // E O NOME CONTINUA SAINDO: legível não é "a linha existe", é "dá para ler o que foi o motivo".
    expect(reenvio?.motivoReenvioNome).toBe(NOME_DO_INATIVO);
  });
});
