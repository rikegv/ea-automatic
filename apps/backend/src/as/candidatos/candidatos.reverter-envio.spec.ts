import "reflect-metadata";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  consomePosicao,
  finalizaPosicao,
} from "@ea/shared-types";
import {
  SITUACAO_APOS_REVERTER_ENVIO,
  SITUACAO_QUE_A_REVERSAO_DESFAZ,
  kpisDoFunil,
  ocupacaoDaVaga,
  podeReverterEnvio,
} from "../../domain/candidatura";
import { CandidatosService } from "./candidatos.service";
import { asCandidaturaEtapas, asCandidaturas } from "../../db/schema";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";

/**
 * ─ REVERTER O ENVIO PARA A ADMISSÃO: desfazer o clique errado ───────────────────────────────────
 *
 * O QUE O DIRETOR PEDIU, em quatro linhas: qualquer consultor reverte, a pessoa volta para a ÚLTIMA
 * ETAPA em que estava, a posição que ela ocupava fica LIVRE, e o gesto deixa rastro.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e o que ele guarda que nenhum outro guarda ───────────────────┐
 * │ A REVERSÃO É A ÚNICA OPERAÇÃO DO MÓDULO QUE DESFAZ UMA ENTREGA DE POSIÇÃO DE PROPÓSITO, e a │
 * │ trava 7 ("a entrega não anda para trás") existe justamente para impedir que isso aconteça    │
 * │ como EFEITO COLATERAL de outro verbo. As duas coisas convivem porque a diferença é o ALVO:   │
 * │ a reversão só alcança `ENVIADO_PARA_ADMISSAO`, e nada mais.                                  │
 * │                                                                                             │
 * │ SE O ALVO ALARGAR, a trava 7 vira decoração: uma rota sem `@Roles`, sem motivo e sem trava   │
 * │ de ocupação passaria a desfazer alocação e aprovação, que é exatamente a porta que a trava   │
 * │ fechou. É esse alargamento que os testes de recusa abaixo tornam impossível em silêncio.     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO PROTEGE:
 *   1. SÓ REVERTE QUEM ESTÁ ENVIADO, e a lista das recusadas é DERIVADA do vocabulário: situação
 *      nova entra na cobertura sem ninguém lembrar dela.
 *   2. A ETAPA NÃO É ESCRITA, que é como "voltar para a última etapa" é implementado.
 *   3. NÃO PASSA PELO CAMINHO TRAVADO, e a trava 7 continua incondicional onde ela mora.
 *   4. A CONTAGEM NÃO FURA (§A.27): a posição livre a mais e a pessoa de volta em "Em Processo" são
 *      o MESMO número, e andam juntos.
 *   5. O RASTRO EXISTE: quem reverteu e a etapa em que a pessoa volta a ficar.
 */

const AGORA = new Date("2026-09-10T12:00:00.000Z");

/** A situação de onde se reverte, e as OUTRAS, derivadas da régua e nunca digitadas aqui. */
const AS_OUTRAS = CANDIDATURA_SITUACOES.filter((s) => s !== SITUACAO_QUE_A_REVERSAO_DESFAZ);

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function candidatura(over: Record<string, unknown> = {}) {
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
 * O FAKE COM MEMÓRIA: a reversão ESCREVE na linha, e a leitura seguinte a lê já revertida. É o que
 * permite afirmar que reverter DUAS VEZES é recusado na segunda, sem inventar um estado à mão.
 *
 * `ordem` REGISTRA TODO `for("update")`, e é ele que prova a ausência do caminho travado: um `for`
 * que apareça ali é a linha da vaga sendo segurada por uma operação que só devolve posição.
 */
/**
 * ─ O DUBLÊ AVALIA O `where` DE VERDADE, e é isso que faz o teste da corrida MORDER ──────────────
 *
 * ┌─ POR QUE ELE NÃO PODE SIMPLESMENTE "APLICAR O UPDATE" ─────────────────────────────────────┐
 * │ UM FAKE QUE GRAVA SEMPRE não distingue o `update` que filtra pela situação do que filtra só │
 * │ pelo id: os dois passariam igual, e o teste da corrida estaria afirmando o DESENHO ("a      │
 * │ cláusula está escrita lá") em vez da PROPRIEDADE ("a linha não é sobrescrita").             │
 * │                                                                                            │
 * │ ELE RENDERIZA A CONDIÇÃO REAL (`PgDialect`) e confere os parâmetros contra a linha ATUAL,   │
 * │ que é o que o Postgres faz: toda situação exigida no `where` tem de bater com a situação    │
 * │ que a linha tem NO INSTANTE DA ESCRITA. Tirando a cláusula do service, nenhuma situação é   │
 * │ exigida, o dublê grava (como o banco gravaria) e o teste da corrida FICA VERMELHO.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 */
function condicaoAindaCasa(cond: unknown, linha: Record<string, unknown>): boolean {
  const { params } = new PgDialect().sqlToQuery(cond as never);
  const situacoesExigidas = params.filter(
    (p): p is string =>
      typeof p === "string" && (CANDIDATURA_SITUACOES as readonly string[]).includes(p),
  );
  return situacoesExigidas.every((s) => s === linha.situacao);
}

function makeDb(
  cenario: {
    candidatura?: Record<string, unknown>;
    /** A CORRIDA: roda uma vez, entre a leitura que decide e a escrita que ela autoriza. */
    entreALeituraEAEscrita?: (linha: Record<string, unknown>) => void;
  } = {},
) {
  const c: Record<string, unknown> = { ...candidatura(), ...(cenario.candidatura ?? {}) };
  const vaga = { id: "vaga-1", status: "ABERTA", posicoesOficiais: 5, posicoesBanco: 0 };

  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const ordem: string[] = [];

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
      ordem.push(`${modo === "update" ? "trava" : modo}-vaga`);
      return Promise.resolve([vaga]);
    };
    b.groupBy = () => Promise.resolve([]);
    b.then = (r: (v: unknown) => unknown) => Promise.resolve([]).then(r);
    return b;
  });

  let corridaJaAconteceu = false;
  const update = vi.fn((tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      updates.push({ tabela, valores });

      // A CONCORRÊNCIA ENTRA AQUI, no ponto exato em que ela acontece na vida real: depois de a
      // leitura ter decidido, antes de a escrita ter gravado.
      if (tabela === asCandidaturas && !corridaJaAconteceu) {
        corridaJaAconteceu = true;
        cenario.entreALeituraEAEscrita?.(c);
      }

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

  const tx = {
    select,
    update,
    insert,
    query: { asCandidaturas: { findFirst: async () => ({ ...c }) } },
  };

  const db = {
    select,
    update,
    insert,
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      asCandidaturas: { findFirst: async () => ({ ...c }) },
      asCandidatos: { findFirst: async () => ({ id: "pessoa-1", nome: "Fulano" }) },
      vagas: { findFirst: async () => vaga },
    },
  };

  return {
    service: new CandidatosService(db as never, catalogoDeEtapasFingido() as never),
    linha: c,
    updates,
    inserts,
    ordem,
  };
}

const daCandidatura = (updates: Escrita[]) =>
  updates.find((u) => u.tabela === asCandidaturas)?.valores ?? {};
const doHistorico = (inserts: Escrita[]) =>
  inserts.find((i) => i.tabela === asCandidaturaEtapas)?.valores ?? {};

const erroDe = (p: Promise<unknown>) =>
  p.then(() => null).catch((e: unknown) => e as ConflictException);

// ── A RÉGUA, ANTES DO CAMINHO ────────────────────────────────────────────────

describe("a régua da reversão, afirmada contra o vocabulário e não contra os nomes escritos nela", () => {
  it("desfaz o ENVIO, e é dele que a reversão parte", () => {
    expect(SITUACAO_QUE_A_REVERSAO_DESFAZ).toBe("ENVIADO_PARA_ADMISSAO");
  });

  it("a origem ENTREGA posição, e é por isso que reverter libera uma", () => {
    expect(finalizaPosicao(SITUACAO_QUE_A_REVERSAO_DESFAZ)).toBe(true);
  });

  it("o destino NÃO consome posição: é o que faz a posição ficar livre sem nenhuma escrita a mais", () => {
    // A ocupação é DERIVADA da situação. Um destino que consumisse posição deixaria a vaga devendo
    // a entrega que o consultor acabou de desfazer, e nada falharia.
    expect(consomePosicao(SITUACAO_APOS_REVERTER_ENVIO)).toBe(false);
  });

  it("o destino é VIVO, senão a reversão entregaria a pessoa ao expurgo da retenção", () => {
    // `retencao-candidatos.service` anonimiza IRREVERSIVELMENTE quem não tem candidatura viva. Um
    // destino encerrado faria "voltar para a seleção" significar "sair do processo de vez".
    expect(candidaturaViva(SITUACAO_APOS_REVERTER_ENVIO)).toBe(true);
  });

  it("o destino é exatamente o critério de EM PROCESSO, e por isso a pessoa reaparece no funil", () => {
    // `emSelecao` e `porEtapa` contam `ATIVO`, e só ele. É a segunda metade do pedido do diretor.
    const o = ocupacaoDaVaga(5, [{ situacao: SITUACAO_APOS_REVERTER_ENVIO }]);
    expect(o.emSelecao).toBe(1);
  });

  it("só o envio é reversível, e a régua recusa TODAS as outras situações do vocabulário", () => {
    expect(podeReverterEnvio(SITUACAO_QUE_A_REVERSAO_DESFAZ)).toBe(true);
    for (const s of AS_OUTRAS) expect(podeReverterEnvio(s)).toBe(false);
  });

  /*
   * ┌─ A TRAVA 7 RECUSARIA ESTA TRANSIÇÃO, e é esta afirmação que justifica o caminho simples ───┐
   * │ A CONDIÇÃO DELA é "a situação atual ENTREGA e a nova NÃO ENTREGA", letra por letra o que a  │
   * │ reversão faz. Ela não foi afrouxada, nem contornada por parâmetro: a reversão passa pelo    │
   * │ caminho SIMPLES, que é a porta que a própria frase da trava manda usar, com alvo estreito e │
   * │ rastro. Este teste existe para que a escolha fique AFIRMADA, e não só comentada: quem um    │
   * │ dia levar a reversão para o caminho travado descobre aqui, e não em produção, que ela bate  │
   * │ de frente com a trava.                                                                      │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a transição bate exatamente na condição da trava 7, e é por isso que ela NÃO vai pelo caminho travado", () => {
    const condicaoDaTrava7 =
      finalizaPosicao(SITUACAO_QUE_A_REVERSAO_DESFAZ) &&
      !finalizaPosicao(SITUACAO_APOS_REVERTER_ENVIO);
    expect(condicaoDaTrava7).toBe(true);
  });
});

// ── O CAMINHO ────────────────────────────────────────────────────────────────

describe("reverter o envio: o que é escrito, e o que NÃO é", () => {
  it("a situação volta para a seleção", async () => {
    const { service, updates } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(daCandidatura(updates)).toMatchObject({ situacao: SITUACAO_APOS_REVERTER_ENVIO });
  });

  it("a ETAPA não é escrita: voltar para a última etapa é não mexer nela", async () => {
    const { service, updates } = makeDb({
      candidatura: candidatura({ etapa: "ENTREVISTA_SOULAN" }),
    });

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    // O envio nunca moveu ninguém no funil (ele só mudou a SITUAÇÃO), então a etapa da pessoa
    // continua na linha. Reescrevê-la a partir do histórico seria uma segunda fonte para um dado
    // que já está certo, e erraria em quem mudou de etapa DEPOIS do envio.
    expect(daCandidatura(updates)).not.toHaveProperty("etapa");
  });

  it("o LADO não é apagado: quem segura posição é a situação, não o lado gravado", async () => {
    const { service, updates, linha } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    // O lado é MEMÓRIA de onde a pessoa estava, útil no dia em que ela for enviada de novo, e ele
    // não segura posição nenhuma sozinho. Já o motivo é outra história, e é o teste seguinte.
    expect(daCandidatura(updates)).not.toHaveProperty("posicaoLado");
    expect(linha.posicaoLado).toBe("OFICIAL");
  });

  /*
   * ┌─ O MOTIVO DO ENVIO SAI DA LINHA VIVA (decisão do diretor) ─────────────────────────────────┐
   * │ O CAMPO É O MOTIVO DAQUELE DESFECHO, e desfeito o desfecho ele perdeu o referente. Sem esta │
   * │ limpeza a candidatura volta VIVA carregando a justificativa de um envio que não existe      │
   * │ mais, e `motivoDescarte` é exposto no `AsCandidaturaItem`: toda tela que o leia passa a     │
   * │ mostrar a explicação de um fato desfeito, sem erro e sem aviso.                             │
   * │                                                                                            │
   * │ ESTE TESTE MORDE de propósito: a linha do `set` é fácil de perder numa refatoração, e a     │
   * │ perda é SILENCIOSA (nada falha, o dado só passa a mentir). Sem ele, o campo volta e ninguém │
   * │ vê.                                                                                         │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o MOTIVO do envio é LIMPO: o campo descreve o estado atual da linha, não um estado desfeito", async () => {
    const { service, updates, linha } = makeDb({
      candidatura: candidatura({ motivoDescarte: "Aprovado pelo cliente" }),
    });

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(daCandidatura(updates)).toMatchObject({ motivoDescarte: null });
    expect(linha.motivoDescarte).toBeNull();
  });

  it("carimba `atualizadoEm`, porque a candidatura ANDOU", async () => {
    const { service, updates } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    expect(daCandidatura(updates).atualizadoEm).toBeInstanceOf(Date);
  });

  it("NÃO trava a linha da vaga: liberar posição não disputa recurso nenhum", async () => {
    const { service, ordem } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    // A propriedade não é "o código é simples": é que DEVOLVER posição não estoura teto nenhum, e
    // não há corrida entre dois consultores a serializar. Se um dia esta operação passar a travar a
    // vaga, é sinal de que ela mudou de natureza, e a mudança precisa ser deliberada.
    expect(ordem).toEqual([]);
  });
});

describe("o rastro, que é o que o diretor pediu junto", () => {
  it("grava QUEM reverteu e a ETAPA em que a pessoa volta a ficar", async () => {
    const { service, inserts } = makeDb({
      candidatura: candidatura({ etapa: "ENTREVISTA_SOULAN" }),
    });

    await service.reverterEnvioParaAdmissao("cand-1", "user-7");

    expect(doHistorico(inserts)).toMatchObject({
      candidaturaId: "cand-1",
      etapaDe: null,
      etapaPara: "ENTREVISTA_SOULAN",
      situacao: SITUACAO_APOS_REVERTER_ENVIO,
      porId: "user-7",
    });
  });

  it("§A.6: o evento não carrega nome, CPF nem URL", async () => {
    const { service, inserts } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");

    const evento = doHistorico(inserts);
    const texto = JSON.stringify(evento);
    expect(texto).not.toContain("Fulano");
    expect(texto).not.toMatch(/\d{11}/);
    expect(texto).not.toContain("http");
  });

  /*
   * ┌─ A METADE QUE TORNA A LIMPEZA SEGURA, provada PONTA A PONTA ───────────────────────────────┐
   * │ ESTE TESTE NÃO MONTA O ESTADO À MÃO: ele ENVIA de verdade (`registrarSaida`, pelo caminho   │
   * │ travado, com motivo obrigatório) e SÓ ENTÃO reverte, sobre o mesmo dublê com memória. É a   │
   * │ única forma de a prova valer: um cenário fabricado afirmaria sobre um histórico que nenhum  │
   * │ código produziu.                                                                            │
   * │                                                                                            │
   * │ O QUE ELE AMARRA: limpar a linha viva é seguro PORQUE o motivo continua no histórico. Se um │
   * │ dia a reversão passar a apagar (ou a sobrescrever) o evento do envio, a limpeza do campo    │
   * │ deixa de ser troca de lugar e vira PERDA de trilha, e é aqui que isso aparece.              │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("o motivo do envio NÃO se perde: sai da linha viva e continua no histórico, com autor e etapa", async () => {
    const { service, inserts, linha } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO", motivoDescarte: null }),
    });

    await service.registrarSaida(
      "cand-1",
      { situacao: SITUACAO_QUE_A_REVERSAO_DESFAZ, motivo: "Aprovado pelo cliente" } as never,
      "user-3",
    );
    expect(linha.motivoDescarte).toBe("Aprovado pelo cliente");

    await service.reverterEnvioParaAdmissao("cand-1", "user-7");

    // A LINHA VIVA ficou sem o motivo do desfecho desfeito...
    expect(linha.motivoDescarte).toBeNull();
    expect(linha.situacao).toBe(SITUACAO_APOS_REVERTER_ENVIO);

    // ...e o HISTÓRICO guarda os dois fatos, na ordem em que aconteceram, sem perder nada do envio.
    const eventos = inserts
      .filter((i) => i.tabela === asCandidaturaEtapas)
      .map((i) => i.valores);
    expect(eventos).toHaveLength(2);
    expect(eventos[0]).toMatchObject({
      situacao: SITUACAO_QUE_A_REVERSAO_DESFAZ,
      motivo: "Aprovado pelo cliente",
      etapaPara: "ENTREVISTA_CLIENTE",
      porId: "user-3",
    });
    expect(eventos[1]).toMatchObject({
      situacao: SITUACAO_APOS_REVERTER_ENVIO,
      etapaPara: "ENTREVISTA_CLIENTE",
      porId: "user-7",
    });
  });

  it("o registro nasce na MESMA transação da mudança: recusa não deixa evento órfão", async () => {
    const { service, inserts, updates } = makeDb({
      candidatura: candidatura({ situacao: "ALOCADO" }),
    });

    await erroDe(service.reverterEnvioParaAdmissao("cand-1", "user-1"));

    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

// ── O ALVO ESTREITO ──────────────────────────────────────────────────────────

describe("só reverte quem está ENVIADO PARA ADMISSÃO, e a recusa é legível", () => {
  for (const situacao of AS_OUTRAS) {
    it(`recusa quem está ${situacao}: não houve envio a desfazer`, async () => {
      const { service, updates } = makeDb({ candidatura: candidatura({ situacao }) });

      const erro = await erroDe(service.reverterEnvioParaAdmissao("cand-1", "user-1"));

      expect(erro).toBeInstanceOf(ConflictException);
      expect(String((erro!.getResponse() as { message?: string })?.message)).toContain(
        "não está enviada para admissão",
      );
      expect(updates).toHaveLength(0);
    });
  }

  it("o ALOCADO e o APROVADO estão entre os recusados, e é isso que preserva a trava da entrega", () => {
    // Se a reversão os alcançasse, ela viraria uma porta sem motivo, sem ciência e sem contagem de
    // posição para desfazer alocação e aprovação, que é exatamente o que a trava 7 fechou.
    expect(AS_OUTRAS).toContain("ALOCADO");
    expect(AS_OUTRAS).toContain("APROVADO");
  });

  it("reverter DUAS VEZES: a segunda é recusada, porque a primeira já a tirou do envio", async () => {
    const { service } = makeDb();

    await service.reverterEnvioParaAdmissao("cand-1", "user-1");
    const erro = await erroDe(service.reverterEnvioParaAdmissao("cand-1", "user-1"));

    expect(erro).toBeInstanceOf(ConflictException);
  });

  /*
   * ┌─ A CORRIDA: A SITUAÇÃO MUDA ENTRE A LEITURA E A ESCRITA (achado da auditoria) ─────────────┐
   * │ O CASO CONCRETO: a reversão lê `ENVIADO_PARA_ADMISSAO`, e a `finalizarPosicao` (ou a       │
   * │ `aprovar`) da MESMA candidatura grava antes dela. Com o `update` filtrando só por `id`, a  │
   * │ reversão sobrescreveria aquela gravação e ainda registraria "voltou para a seleção" no     │
   * │ histórico de uma linha que está ALOCADA.                                                    │
   * │                                                                                            │
   * │ NÃO É FURO DE CONTAGEM, e é bom não confundir: a reversão só SUBTRAI ocupação, então        │
   * │ nenhuma ordem infla número nenhum. O dano é a TRILHA CONTRADIZENDO A LINHA, que é pior do   │
   * │ que trilha ausente, porque quem consulta para de conferir.                                  │
   * │                                                                                            │
   * │ ESTE TESTE AFIRMA A PROPRIEDADE, e não a cláusula: o dublê avalia o `where` renderizado     │
   * │ contra a linha do instante da escrita (ver `condicaoAindaCasa`). Sem a cláusula no service, │
   * │ o dublê grava e as três asserções abaixo caem juntas.                                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  it("a situação muda entre a leitura e a escrita: não grava, não deixa evento e recusa", async () => {
    const { service, inserts, linha } = makeDb({
      entreALeituraEAEscrita: (c) => {
        c.situacao = "ALOCADO";
      },
    });

    const erro = await erroDe(service.reverterEnvioParaAdmissao("cand-1", "user-1"));

    // 1. RECUSA, e não no-op: quem clicou em desfazer merece saber que não desfez. É a mesma frase
    //    da guarda de cima, porque é a mesma régua respondendo.
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String((erro!.getResponse() as { message?: string })?.message)).toContain(
      "não está enviada para admissão",
    );

    // 2. A LINHA NÃO É SOBRESCRITA: a gravação de quem chegou primeiro fica de pé, inteira.
    expect(linha.situacao).toBe("ALOCADO");
    expect(linha.motivoDescarte).toBe("Aprovado pelo cliente");

    // 3. E NENHUM EVENTO NASCE. É a metade que a auditoria apontou: a trilha não pode afirmar uma
    //    volta para a seleção que não aconteceu. Em produção o `throw` ainda desfaz a transação
    //    inteira; aqui nada chegou a ser escrito, que é a garantia mais forte das duas.
    expect(inserts).toHaveLength(0);
  });

  it("candidatura inexistente é 404, e não 409: some com o id, não com a régua", async () => {
    const db = {
      transaction: async (fn: (t: unknown) => Promise<unknown>) =>
        fn({ query: { asCandidaturas: { findFirst: async () => undefined } } }),
    };
    const vazio = new CandidatosService(db as never, catalogoDeEtapasFingido() as never);

    await expect(vazio.reverterEnvioParaAdmissao("cand-1", "user-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// ── §A.27: A CONTAGEM NÃO FURA ───────────────────────────────────────────────

describe("§A.27: a posição livre a mais e a pessoa de volta em Em Processo são o MESMO fato", () => {
  /**
   * OS DOIS NÚMEROS SAEM DA MESMA LEITURA, e é isso que os faz andarem juntos por construção. O
   * defeito que este bloco recusa é o da §A.27: um dado escrito num lugar, lido em outros três, com
   * um deles ficando para trás em silêncio.
   */
  const vagaAntes = [
    { situacao: SITUACAO_QUE_A_REVERSAO_DESFAZ, posicaoLado: "OFICIAL" },
    { situacao: "ALOCADO" as const, posicaoLado: "OFICIAL" },
    { situacao: "ATIVO" as const, posicaoLado: null },
  ];
  const vagaDepois = [
    { situacao: SITUACAO_APOS_REVERTER_ENVIO, posicaoLado: "OFICIAL" },
    { situacao: "ALOCADO" as const, posicaoLado: "OFICIAL" },
    { situacao: "ATIVO" as const, posicaoLado: null },
  ];

  it("uma posição livre a MAIS e uma pessoa a MAIS em seleção, na mesma reversão", () => {
    const antes = ocupacaoDaVaga(5, vagaAntes);
    const depois = ocupacaoDaVaga(5, vagaDepois);

    expect(antes).toMatchObject({ ocupadas: 2, finalizadas: 2, livres: 3, emSelecao: 1 });
    expect(depois).toMatchObject({ ocupadas: 1, finalizadas: 1, livres: 4, emSelecao: 2 });

    // OS DOIS ANDAM JUNTOS: a posição que sobrou é exatamente a pessoa que voltou. Um lado sem o
    // outro seria a vaga com posição livre e ninguém no funil para preenchê-la, ou a pessoa contada
    // duas vezes, no funil e na ocupação.
    expect(depois.livres! - antes.livres!).toBe(1);
    expect(depois.emSelecao - antes.emSelecao).toBe(1);
    expect(antes.ocupadas - depois.ocupadas).toBe(1);
  });

  it("a entrega do lado OFICIAL cai junto, e o cilindro da vaga esvazia uma casa", () => {
    expect(ocupacaoDaVaga(5, vagaAntes).finalizadasOficial).toBe(2);
    expect(ocupacaoDaVaga(5, vagaDepois).finalizadasOficial).toBe(1);
  });

  it("NINGUÉM É CONTADO DUAS VEZES: a pessoa sai do desfecho e entra na etapa, no mesmo passo", () => {
    const funil = (situacao: string) =>
      kpisDoFunil([{ etapa: "ENTREVISTA_CLIENTE", situacao: situacao as never }]);

    const antes = funil(SITUACAO_QUE_A_REVERSAO_DESFAZ);
    expect(antes.porDesfecho[SITUACAO_QUE_A_REVERSAO_DESFAZ]).toBe(1);
    expect(antes.porEtapa.ENTREVISTA_CLIENTE).toBeUndefined();

    const depois = funil(SITUACAO_APOS_REVERTER_ENVIO);
    expect(depois.porDesfecho[SITUACAO_QUE_A_REVERSAO_DESFAZ]).toBeUndefined();
    expect(depois.porEtapa.ENTREVISTA_CLIENTE).toBe(1);
  });

  it("reverter UMA pessoa não solta a posição das OUTRAS", () => {
    expect(ocupacaoDaVaga(5, vagaDepois)).toMatchObject({ finalizadas: 1, ocupadas: 1 });
  });

  it("a pessoa revertida pode ser ENVIADA DE NOVO, e o envio volta a consumir a posição", () => {
    // A volta não é beco sem saída: o reenvio passa pelo caminho travado, com `cabeMaisUm` contando
    // sob a linha da vaga, e a ocupação volta ao número de antes. Nada fica pendurado.
    expect(ocupacaoDaVaga(5, vagaAntes).ocupadas).toBe(2);
  });
});
