import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { CANDIDATURA_SITUACOES, ETAPAS_FUNIL_SEMENTE } from "@ea/shared-types";
import {
  SITUACAO_APOS_REVERTER_ENVIO,
  SITUACAO_QUE_A_REVERSAO_DESFAZ,
  kpisDoFunil,
  ocupacaoDaVaga,
} from "../../domain/candidatura";
import { eventoEncerra, tipoDoEvento } from "../../domain/candidatura-historico";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import type { AuthUser } from "../../auth/auth.types";

/**
 * ─ REVERSÃO DO ENVIO: COBERTURA INDEPENDENTE (§A.38, tester que não escreveu o código) ──────────
 *
 * ┌─ POR QUE UM SEGUNDO ARQUIVO, SE JÁ EXISTEM 30 TESTES DO AUTOR ──────────────────────────────┐
 * │ A §A.38 diz por quê: teste do autor pega REGRESSÃO bem e MAL-ENTENDIDO DE REQUISITO mal,     │
 * │ porque ele codifica a mesma suposição que gerou o código. Este arquivo não recontagem o que  │
 * │ o `candidatos.reverter-envio.spec.ts` já cobre: ele afirma o que aquela suposição deixaria    │
 * │ passar.                                                                                      │
 * │                                                                                             │
 * │ AS QUATRO DIFERENÇAS DE MÉTODO, e cada uma nasceu de um furo medido:                         │
 * │  1. A ETAPA É AFIRMADA COMO PROPRIEDADE ("a pessoa continua na etapa em que estava"), e não  │
 * │     como DESENHO ("a coluna não está no `set`"). As duas concordam hoje e discordam no dia   │
 * │     em que a implementação mudar de forma sem mudar de efeito.                               │
 * │  2. A CONTAGEM É MEDIDA SOBRE A LINHA QUE O SERVICE PRODUZIU, e não sobre dois arrays        │
 * │     escritos à mão que descrevem o antes e o depois. Array escrito à mão afirma sobre um     │
 * │     estado que nenhum código gerou.                                                         │
 * │  3. A TRILHA É AFIRMADA PELA NEGATIVA: nada além do `insert` toca `as_candidatura_etapas`.   │
 * │     Limpar o motivo da linha viva só é seguro enquanto o histórico do envio fica INTACTO.    │
 * │  4. O QUE O SERVICE DEVOLVE também é contrato: é o objeto que a tela vai desenhar.           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const AGORA = new Date("2026-09-10T12:00:00.000Z");

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

const ETAPAS = ETAPAS_FUNIL_SEMENTE.map((e) => e.codigo);

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function linhaBase(over: Record<string, unknown> = {}) {
  return {
    id: "cand-1",
    candidatoId: "pessoa-1",
    vagaId: "vaga-1",
    etapa: "ENTREVISTA_CLIENTE",
    situacao: SITUACAO_QUE_A_REVERSAO_DESFAZ,
    motivoDescarte: "Aprovado pelo cliente",
    posicaoLado: "OFICIAL",
    alocadoEm: AGORA,
    atualizadoEm: AGORA,
    ultimoContatoEm: null,
    alocadoPorId: null,
    ...over,
  };
}

/**
 * ─ O DUBLÊ AVALIA O `where` RENDERIZADO, e sem isso o teste da corrida não morde ────────────────
 *
 * O `update` da reversão passou a EXIGIR a situação no `where` (`id` E `situacao = ENVIADO`), que é
 * o que faz a leitura valer no instante da ESCRITA. Um dublê que grave sempre não distingue esse
 * `update` de um que filtre só pelo id: os dois passariam igual, e o teste da corrida estaria
 * afirmando o desenho em vez da propriedade.
 *
 * A EMULAÇÃO É A DO POSTGRES, e cobre as duas formas: `eq` (uma situação exigida, tem de ser a da
 * linha) e `inArray` (várias, a da linha tem de estar entre elas). Nenhuma situação no `where` quer
 * dizer nenhuma exigência, e a linha é escrita.
 */
function condicaoAindaCasa(cond: unknown, linha: Record<string, unknown>): boolean {
  const { params } = new PgDialect().sqlToQuery(cond as never);
  const exigidas = params.filter(
    (p): p is string =>
      typeof p === "string" && (CANDIDATURA_SITUACOES as readonly string[]).includes(p),
  );
  if (exigidas.length === 0) return true;
  return exigidas.includes(linha.situacao as string);
}

/**
 * O DUBLÊ COM MEMÓRIA, e três coisas a mais que o do autor não observa:
 *   `deletes` existe para o `delete` numa tabela de histórico ser MEDIDO em vez de estourar um
 *   TypeError que se lê como qualquer outro erro;
 *   `vagasLidas` conta as consultas à vaga, que é como se prova que o status dela não é consultado;
 *   `aoLer` é o portão que permite INTERCALAR duas reversões da mesma linha.
 */
function makeDb(
  opcoes: {
    candidatura?: Record<string, unknown>;
    vagaStatus?: string;
    aoLer?: () => Promise<void>;
  } = {},
) {
  const c: Record<string, unknown> = { ...linhaBase(), ...(opcoes.candidatura ?? {}) };
  const vaga = {
    id: "vaga-1",
    status: opcoes.vagaStatus ?? "ABERTA",
    posicoesOficiais: 5,
    posicoesBanco: 0,
  };

  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const deletes: unknown[] = [];
  const ordem: string[] = [];
  let vagasLidas = 0;

  const select = vi.fn(() => {
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.where = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.orderBy = () =>
      Promise.resolve([
        { c, candidatoNome: "Fulano", vagaCodigo: "PS-1", vagaNome: "Vaga", autor: "Consultor" },
      ]);
    b.for = (modo: string) => {
      vagasLidas += 1;
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    b.groupBy = () => Promise.resolve([]);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
    return b;
  });

  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });
      return {
        where: (cond: unknown) => {
          const casa = tabela !== asCandidaturas || condicaoAindaCasa(cond, c);
          if (casa && tabela === asCandidaturas) Object.assign(c, valores);
          const afetadas = casa ? [{ id: c.id }] : [];
          return {
            then: (r: (v: unknown) => unknown) => Promise.resolve(afetadas).then(r),
            returning: async () => afetadas,
          };
        },
      };
    },
  }));

  const insert = vi.fn((tabela: unknown) => ({
    values: (valores: Record<string, unknown>) => {
      inserts.push({ tabela, valores });
      return {
        then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        returning: async () => [{ id: "cand-1", etapa: c.etapa }],
      };
    },
  }));

  const del = vi.fn((tabela: unknown) => {
    deletes.push(tabela);
    return { where: async () => undefined };
  });

  const findFirst = async () => {
    if (opcoes.aoLer) await opcoes.aoLer();
    return { ...c };
  };

  const tx = {
    select,
    update,
    insert,
    delete: del,
    query: { asCandidaturas: { findFirst } },
  };

  const db = {
    select,
    update,
    insert,
    delete: del,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      asCandidaturas: { findFirst },
      asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
      vagas: {
        findFirst: async () => {
          vagasLidas += 1;
          return vaga;
        },
      },
    },
  };

  return {
    service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never, catalogoDeStatusFingido() as never),
    linha: c,
    updates,
    inserts,
    deletes,
    ordem,
    vagas: () => vagasLidas,
  };
}

const doHistorico = (inserts: Escrita[]) =>
  inserts.filter((i) => i.tabela === asCandidaturaEtapas).map((i) => i.valores);

const erroDe = (p: Promise<unknown>) =>
  p.then(() => null).catch((e: unknown) => e as ConflictException);

const mensagem = (e: unknown) =>
  String(((e as ConflictException).getResponse() as { message?: string })?.message);

// ── 1. A ETAPA COMO PROPRIEDADE, E NÃO COMO DESENHO ──────────────────────────

describe("a pessoa volta para a etapa em que ESTAVA, afirmado no dado e não no `set`", () => {
  /*
   * ┌─ A DIFERENÇA PARA O TESTE DO AUTOR, e por que ela não é preciosismo ───────────────────────┐
   * │ ELE AFIRMA `not.toHaveProperty("etapa")`, que é uma asserção sobre a FORMA da implementação:│
   * │ ela quebra até quando alguém escrever `etapa: c.etapa` (o MESMO valor, efeito nenhum), e    │
   * │ não diz, em lugar nenhum, QUAL etapa a pessoa tem depois. A propriedade que o diretor pediu │
   * │ é sobre o RESULTADO, e é ela que este bloco afirma, etapa por etapa do catálogo.            │
   * └───────────────────────────────────────────────────────────────────────────────────────────┘
   */
  for (const etapa of ETAPAS) {
    it(`quem foi enviado da etapa ${etapa} volta para ${etapa}`, async () => {
      const { service, linha } = makeDb({ candidatura: linhaBase({ etapa }) });

      const item = await service.reverterEnvioParaAdmissao("cand-1", "user-1");

      expect(linha.etapa).toBe(etapa);
      expect(item.etapa).toBe(etapa);
    });
  }

  /*
   * O CASO QUE O COMENTÁRIO DA RÉGUA PROMETE E NENHUM TESTE AFIRMAVA: a pessoa MUDOU DE ETAPA
   * DEPOIS de ter sido enviada (o funil é livre e `ENVIADO_PARA_ADMISSAO` anda nele, por
   * `candidaturaViva`). O histórico, então, registra o envio numa etapa e a linha guarda outra.
   *
   * QUEM RECONSTRUÍSSE A ETAPA A PARTIR DO ÚLTIMO EVENTO devolveria a pessoa para a etapa ANTIGA,
   * e nada falharia: as duas fontes existem, e a errada é plausível. É este teste que separa as
   * duas, porque ele é o único cenário em que elas discordam.
   */
  it("mudou de etapa DEPOIS do envio: a reversão respeita a LINHA, não o histórico do envio", async () => {
    const { service, inserts, linha } = makeDb({
      candidatura: linhaBase({ situacao: "ALOCADO", motivoDescarte: null, etapa: "TRIAGEM" }),
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: SITUACAO_QUE_A_REVERSAO_DESFAZ, motivo: "Aprovado pelo cliente" } as never,
      consultor("user-3"),
    );
    // O envio ficou gravado na TRIAGEM...
    expect(doHistorico(inserts)[0]).toMatchObject({ etapaPara: "TRIAGEM" });

    // ...e a pessoa andou no funil depois disso.
    await service.moverEtapa("cand-1", { etapa: "APROVACAO" } as never, "user-4");
    expect(linha.etapa).toBe("APROVACAO");

    await service.reverterEnvioParaAdmissao("cand-1", "user-7");

    expect(linha.etapa).toBe("APROVACAO");
    expect(doHistorico(inserts).at(-1)).toMatchObject({ etapaPara: "APROVACAO" });
  });
});

// ── 2. O QUE O SERVICE DEVOLVE TAMBÉM É CONTRATO ─────────────────────────────

describe("o item devolvido já está revertido: é ele que a tela vai desenhar", () => {
  /*
   * O DEFEITO QUE ESTE TESTE PEGA é o da leitura feita cedo demais (ou de uma leitura que não veja
   * a escrita da transação): o backend gravaria certo e devolveria o RETRATO ANTIGO, a tela
   * continuaria mostrando "Enviado Para Admissão" com o motivo do envio, e o consultor clicaria
   * de novo. Nada falharia, e o segundo clique receberia o 409 de "não está enviada".
   */
  it("situação, motivo e etapa do payload descrevem o estado DEPOIS da reversão", async () => {
    const { service } = makeDb({ candidatura: linhaBase({ etapa: "ENTREVISTA_SOULAN" }) });

    const item = await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(item).toMatchObject({
      id: "cand-1",
      situacao: SITUACAO_APOS_REVERTER_ENVIO,
      motivoDescarte: null,
      etapa: "ENTREVISTA_SOULAN",
    });
  });
});

// ── 3. A TRILHA DO ENVIO NÃO É REESCRITA ─────────────────────────────────────

describe("limpar o motivo da linha viva só é seguro porque o histórico fica INTACTO", () => {
  /*
   * ┌─ ESTE É O FURO QUE A SUPOSIÇÃO DO AUTOR DEIXA PASSAR ──────────────────────────────────────┐
   * │ Ele prova que o evento do envio CONTINUA LÁ depois da reversão, e prova bem, ponta a ponta. │
   * │ O que ele não afirma é que NADA MAIS toca `as_candidatura_etapas`: um `update` que zerasse  │
   * │ o motivo do evento do envio (a "limpeza" feita no lugar errado, que é uma leitura possível  │
   * │ do pedido "limpa o motivo") passaria por todos os 30 testes dele, porque o helper dele só   │
   * │ olha o PRIMEIRO update da tabela de candidaturas e o insert do histórico.                   │
   * │                                                                                            │
   * │ E O DANO SERIA PERMANENTE: o histórico é a única cópia que sobra do motivo do envio depois  │
   * │ que a linha viva é limpa. §A.5/§A.6, trilha permanente e consultável.                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a reversão escreve SÓ em `as_candidaturas`: nada de update nem de delete no histórico", async () => {
    const { service, updates, deletes } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(updates.map((u) => u.tabela)).toEqual([asCandidaturas]);
    expect(deletes).toEqual([]);
  });

  it("o evento do envio sobrevive LETRA POR LETRA à reversão", async () => {
    const { service, inserts } = makeDb({
      candidatura: linhaBase({ situacao: "ALOCADO", motivoDescarte: null }),
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: SITUACAO_QUE_A_REVERSAO_DESFAZ, motivo: "Aprovado pelo cliente" } as never,
      consultor("user-3"),
    );
    const envio = { ...doHistorico(inserts)[0] };

    await service.reverterEnvioParaAdmissao("cand-1", "user-7");

    expect(doHistorico(inserts)[0]).toEqual(envio);
  });
});

// ── 4. A CONTAGEM, MEDIDA SOBRE A LINHA QUE O SERVICE PRODUZIU ───────────────

describe("§A.27: a contagem anda junta, e o `depois` sai do service e não da mão de quem escreve o teste", () => {
  /** As OUTRAS pessoas da mesma vaga, que não podem se mexer quando uma reversão acontece. */
  const OUTRAS = [
    { situacao: "ALOCADO" as const, posicaoLado: "OFICIAL" },
    { situacao: "ATIVO" as const, posicaoLado: null },
  ];

  const daVaga = (linha: Record<string, unknown>) => [
    { situacao: linha.situacao as never, posicaoLado: linha.posicaoLado as string | null },
    ...OUTRAS,
  ];

  const noFunil = (linha: Record<string, unknown>) => [
    { situacao: linha.situacao as never, etapa: linha.etapa as string },
    { situacao: "ALOCADO" as const, etapa: "APROVACAO" },
    { situacao: "ATIVO" as const, etapa: "TRIAGEM" },
  ];

  it("os DOIS mapas se movem no mesmo passo, e ninguém fica nos dois nem some dos dois", async () => {
    const { service, linha } = makeDb();

    const ocupacaoAntes = ocupacaoDaVaga(5, daVaga(linha));
    const funilAntes = kpisDoFunil(noFunil(linha));

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    const ocupacaoDepois = ocupacaoDaVaga(5, daVaga(linha));
    const funilDepois = kpisDoFunil(noFunil(linha));

    // A VAGA: uma posição livre a mais, uma ocupação a menos, uma entrega oficial a menos.
    expect(ocupacaoDepois.livres! - ocupacaoAntes.livres!).toBe(1);
    expect(ocupacaoAntes.ocupadas - ocupacaoDepois.ocupadas).toBe(1);
    expect(ocupacaoAntes.finalizadasOficial - ocupacaoDepois.finalizadasOficial).toBe(1);
    expect(ocupacaoDepois.emSelecao - ocupacaoAntes.emSelecao).toBe(1);

    // O FUNIL: sai do desfecho, entra na etapa, e a etapa de destino é a dela.
    expect(funilAntes.porDesfecho[SITUACAO_QUE_A_REVERSAO_DESFAZ]).toBe(1);
    expect(funilDepois.porDesfecho[SITUACAO_QUE_A_REVERSAO_DESFAZ]).toBeUndefined();
    expect(funilDepois.porEtapa[linha.etapa as string]).toBe(
      (funilAntes.porEtapa[linha.etapa as string] ?? 0) + 1,
    );

    /*
     * O CRUZAMENTO QUE FECHA A PERGUNTA "ela não ficou nos dois nem sumiu dos dois": a soma dos
     * dois grupos do funil é o número de pessoas, e ele não muda porque ninguém entrou nem saiu da
     * vaga. Uma pessoa contada duas vezes faria o total subir; uma pessoa perdida o faria cair.
     */
    const total = (k: ReturnType<typeof kpisDoFunil>) =>
      Object.values(k.porEtapa).reduce((a, b) => a + b, 0) +
      Object.values(k.porDesfecho).reduce((a, b) => a + b, 0);
    expect(total(funilDepois)).toBe(total(funilAntes));
    expect(total(funilDepois)).toBe(3);

    // E AS OUTRAS DUAS PESSOAS não se moveram: a reversão é de UMA candidatura.
    expect(ocupacaoDepois).toMatchObject({ ocupadas: 1, finalizadas: 1, fora: 0 });
  });
});

// ── 5. AS DUAS REVERSÕES AO MESMO TEMPO ─────────────────────────────────────

describe("duas reversões SIMULTÂNEAS da MESMA candidatura", () => {
  /*
   * ┌─ O QUE ESTE BLOCO MEDE, e por que ele não é o teste da corrida que o autor já escreveu ────┐
   * │ O DELE INTERCALA UMA OPERAÇÃO DIFERENTE (a `finalizarPosicao` gravando `ALOCADO` no meio) e │
   * │ afirma que a reversão não sobrescreve. ESTE intercala A MESMA OPERAÇÃO, que é o caso do     │
   * │ duplo clique e do consultor que reverte enquanto o colega reverte: as DUAS leem             │
   * │ `ENVIADO_PARA_ADMISSAO`, as duas passam pela guarda, e as duas chegam ao `update`.          │
   * │                                                                                            │
   * │ A PERGUNTA É SE A SEGUNDA É RECUSA LIMPA OU ESCRITA MUDA. Escrita muda seria 200 com um     │
   * │ segundo evento no histórico dizendo que alguém trouxe de volta quem já estava de volta, e o │
   * │ autor tinha registrado por escrito que aceitaria esse evento repetido. Com a cláusula de    │
   * │ situação no `where`, ele deixou de acontecer, e é isso que este teste fixa: quem chegar     │
   * │ depois não escreve NADA, nem na linha, nem na trilha.                                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  function corrida() {
    let chegaram = 0;
    let abrir: () => void = () => undefined;
    const portao = new Promise<void>((r) => (abrir = r));
    return async () => {
      chegaram += 1;
      if (chegaram >= 2) abrir();
      await portao;
    };
  }

  it("uma passa e a outra é RECUSA LIMPA: uma escrita, um evento, nenhuma contradição", async () => {
    const { service, linha, inserts } = makeDb({ aoLer: corrida() });

    const [a, b] = await Promise.allSettled([
      service.reverterEnvioParaAdmissao("cand-1", "user-1"),
      service.reverterEnvioParaAdmissao("cand-1", "user-2"),
    ]);

    const status = [a.status, b.status].sort();
    expect(status).toEqual(["fulfilled", "rejected"]);
    const recusada = (a.status === "rejected" ? a : b) as PromiseRejectedResult;
    expect(recusada.reason).toBeInstanceOf(ConflictException);

    expect(linha.situacao).toBe(SITUACAO_APOS_REVERTER_ENVIO);
    expect(linha.motivoDescarte).toBeNull();
    // UM EVENTO SÓ. Dois eventos não corromperiam número nenhum, e ainda assim a trilha passaria a
    // contar duas voltas para uma pessoa que voltou uma vez.
    expect(doHistorico(inserts)).toHaveLength(1);
  });

  it("a contagem NÃO fura: a vaga recebe UMA posição de volta, não duas", async () => {
    const { service, linha } = makeDb({ aoLer: corrida() });

    const naVaga = () => [
      { situacao: linha.situacao as never, posicaoLado: "OFICIAL" },
      { situacao: "ALOCADO" as const, posicaoLado: "OFICIAL" },
    ];
    const antes = ocupacaoDaVaga(5, naVaga());

    await Promise.allSettled([
      service.reverterEnvioParaAdmissao("cand-1", "user-1"),
      service.reverterEnvioParaAdmissao("cand-1", "user-2"),
    ]);

    const depois = ocupacaoDaVaga(5, naVaga());
    // A OCUPAÇÃO É DERIVADA DA LINHA, e a linha é uma só: nem duas reversões conseguem devolver
    // duas posições. É a razão estrutural pela qual a ausência de lock aqui é segura, medida em vez
    // de argumentada.
    expect(depois.livres! - antes.livres!).toBe(1);
    expect(depois.ocupadas).toBe(1);
  });
});

// ── 6. A LINHA MORTA CONTINUA MORTA, E INTACTA ───────────────────────────────

describe("a reversão não ressuscita linha encerrada, e não estraga o que ela guarda", () => {
  /*
   * O AUTOR JÁ PROVA A RECUSA (o laço dele varre o vocabulário inteiro). O que ele não afirma é que
   * a linha recusada sai INTEIRA do encontro: o motivo do descarte é a única explicação que existe
   * daquele encerramento, e uma implementação que limpasse o motivo ANTES de conferir a situação
   * (a ordem trocada, que é um erro de uma linha) recusaria a operação e AINDA ASSIM apagaria a
   * explicação. E a pessoa continuaria fora da contagem, então nada denunciaria a perda.
   */
  for (const morta of ["DESCARTADO", "DESISTIU"] as const) {
    it(`${morta}: recusa E preserva o motivo do encerramento`, async () => {
      const { service, linha, updates, inserts } = makeDb({
        candidatura: linhaBase({ situacao: morta, motivoDescarte: "Perfil não aderente" }),
      });

      const erro = await erroDe(service.reverterEnvioParaAdmissao("cand-1", "user-1"));

      expect(erro).toBeInstanceOf(ConflictException);
      expect(linha.situacao).toBe(morta);
      expect(linha.motivoDescarte).toBe("Perfil não aderente");
      expect(updates).toEqual([]);
      expect(inserts).toEqual([]);
      // E ela continua FORA da contagem da vaga, que é onde a ressurreição apareceria.
      expect(ocupacaoDaVaga(5, [{ situacao: linha.situacao as never }])).toMatchObject({
        fora: 1,
        ocupadas: 0,
      });
    });
  }

  it("§A.11: a frase da recusa não tem travessão", async () => {
    const { service } = makeDb({ candidatura: linhaBase({ situacao: "DESCARTADO" }) });

    const erro = await erroDe(service.reverterEnvioParaAdmissao("cand-1", "user-1"));

    expect(mensagem(erro)).not.toContain("—");
  });
});

// ── 7. O QUE FOI MEDIDO E É DECISÃO DO DIRETOR, NÃO DEFEITO DE CÓDIGO ────────

describe("MEDIDO (gap reportado ao coordenador): o que a reversão NÃO consulta e NÃO diz", () => {
  /*
   * ┌─ 1. O STATUS DA VAGA NÃO É CONSULTADO ─────────────────────────────────────────────────────┐
   * │ O CAMINHO TRAVADO passou a recusar vaga encerrada na auditoria de 09/09 (`vagaRecebeCandidato`│
   * │ dentro do `FOR UPDATE`), com um motivo escrito lá: o fechamento CONGELA `vagas_fechadas` e   │
   * │ `vagas_fechadas_banco`, e toda mexida na ocupação DERIVADA depois disso faz os dois números  │
   * │ discordarem em silêncio. A reversão mexe na ocupação derivada e não consulta o status.       │
   * │                                                                                            │
   * │ NÃO É REGRESSÃO desta frente: o mesmo vale para a saída simples (o "desvincular" descarta um │
   * │ ALOCADO de vaga fechada pelo mesmo caminho). É uma PORTA NOVA para uma divergência conhecida,│
   * │ e a decisão é do diretor. Este teste MEDE o comportamento de hoje para que a decisão, quando │
   * │ vier, seja deliberada e não uma descoberta.                                                 │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("reverte numa vaga FECHADA, e a vaga não chega a ser lida", async () => {
    const { service, linha, vagas } = makeDb({ vagaStatus: "FECHADA" });

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(linha.situacao).toBe(SITUACAO_APOS_REVERTER_ENVIO);
    expect(vagas()).toBe(0);
  });

  /*
   * ┌─ 2. O EVENTO DA REVERSÃO É CLASSIFICADO COMO **DESFECHO** ─────────────────────────────────┐
   * │ `tipoDoEvento` (domain/candidatura-historico) decide pelo `situacao !== null`, e a reversão  │
   * │ grava `situacao = ATIVO`. Então o evento que DESFAZ um desfecho é lido como um desfecho, e   │
   * │ `eventoEncerra` devolve `true` para ele.                                                    │
   * │                                                                                            │
   * │ ONDE ISSO APARECE: a linha do tempo da ficha (`FichaCandidatoModal`) desenha o ramo do       │
   * │ DESFECHO, ou seja, uma pill "Em Seleção" seguida de "em <etapa>". Não some e não mente sobre │
   * │ o dado, mas também não diz "reverteu o envio", que é o rastro que o diretor pediu por nome.  │
   * │                                                                                            │
   * │ NÃO SEGURA A SUBIDA (é legibilidade, não integridade) e a correção não é do tester. O teste  │
   * │ fica como MEDIÇÃO: quem um dia der um tipo próprio à reversão quebra aqui e lê este bloco.   │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("hoje o rastro da reversão entra na linha do tempo como DESFECHO", async () => {
    const { service, inserts } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    const evento = doHistorico(inserts)[0] as {
      etapaDe: null;
      etapaPara: string;
      situacao: string;
    };
    expect(tipoDoEvento(evento as never)).toBe("DESFECHO");
    expect(eventoEncerra(evento as never)).toBe(true);
  });
});
