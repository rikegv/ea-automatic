import { describe, expect, it } from "vitest";
import { serializar } from "../vagas/vaga-status.tester-fake";
import { DigaiRepositorio } from "../digai/digai-repositorio";
import { IngestaoRepositorio } from "./ingestao-repositorio";
import {
  CODIGO,
  ID_VACANCY,
  catalogoDaRevisao,
  escritaDaVaga,
} from "./vaga-pendente-revisao.tester-fake";

/**
 * ─ A CORRIDA PERDIDA CONTRA O UNIQUE DO NÚMERO: OS CONTRATOS DO AUTOR (0150) ────────────────────
 *
 * A cobertura do REQUISITO está em dois arquivos do `tester` (§A.38), e este NÃO os repete:
 * `vagas.unique-id-vacancy.tester.spec.ts` mede o DDL declarado (unique, parcial, nulos convivem,
 * número repetido recusado) e `vagas.conflito-numero-pandape.tester.spec.ts` mede o caminho MANUAL
 * (a frase, o status, a detecção por SQLSTATE e a lista dos escritores).
 *
 * ESTE MEDE O QUE SÓ QUEM ESCREVEU OS CAMINHOS AUTOMÁTICOS VÊ, e é o lado da regra que não tem
 * mensagem de usuário nenhuma: na varredura e no espelho do Digai, a violação do unique significa
 * CORRIDA PERDIDA, e o desfecho certo é RELER pelo número e seguir com a vaga que a volta vizinha
 * gravou. Cada `it` aqui é um jeito de o conserto ficar verde por fora e errado por dentro:
 *
 *  1. O 23505 do insert do espelho virava EXCEÇÃO CRUA. O chamador soma um contador de falha, a
 *     vaga fica sem ser processada naquela volta, e nada diz que o motivo foi uma corrida.
 *  2. O 23505 da ADOÇÃO (`update ... set id_vacancy_pandape`) derrubava a volta do ciclo. Ele não é
 *     alcançado pelo compare-and-swap, que só protege a MESMA candidata: a vizinha que gravou o
 *     número em OUTRA linha ainda casa o `where`, e quem recusa é o índice.
 *  3. A RELEITURA TEM DE SEGUIR COM A VAGA ACHADA, e não só engolir o erro: engolir devolveria
 *     "nada aconteceu" sobre uma vaga que existe, e a volta seguinte repetiria tudo.
 *  4. NADA ALÉM DA NOSSA VIOLAÇÃO É ENGOLIDO. Um `catch` largo transforma queda de banco em
 *     silêncio, numa varredura onde o chamador engole o erro e soma um contador.
 *  5. O `espelharVaga` do Digai é o MESMO select-then-insert, e ele devolve um id para a
 *     candidatura apontar: deixar o 23505 subir ali derruba a importação inteira.
 *
 * §A.6: números de vaga sintéticos, zero PII. §A.11: sem travessão.
 */

const NOME_DO_INDICE = "uq_vagas_id_vacancy_pandape";
const ID_DA_VIZINHA = "00000000-0000-4000-8000-00000000viz";
const ID_DA_CANDIDATA = "00000000-0000-4000-8000-0000000000ad";
const ID_QUE_NAO_PODE_NASCER = "00000000-0000-4000-8000-000000000no";

/** O erro do driver `postgres` quando o unique parcial recusa a segunda vaga. */
function erro23505(restricao: string): Error {
  return Object.assign(new Error("violacao de unicidade"), {
    code: "23505",
    constraint_name: restricao,
  });
}

/** Um erro de banco que NÃO é a nossa colisão, para provar que o `catch` é estreito. */
function erroDeOutraNatureza(): Error {
  return Object.assign(new Error("conexao caiu"), { code: "08006" });
}

interface Resposta {
  quando: RegExp;
  /** Recebe quantas vezes este padrão já foi casado (1 na primeira). Pode lançar. */
  responder: (chamada: number) => unknown[];
}

/**
 * O DUBLÊ DE BANCO, com resposta que DEPENDE DA VEZ. O fake compartilhado
 * (`bancoDaRevisao`) responde sempre a mesma coisa, e a corrida é por definição um cenário em que a
 * MESMA consulta responde diferente antes e depois de a vizinha escrever: a busca pelo número não
 * acha nada, o insert é recusado, e a releitura acha. Sem resposta por vez, o cenário não existe.
 */
function bancoDaCorrida(respostas: Resposta[]): { db: never; consultas: string[] } {
  const consultas: string[] = [];
  const vezes = new Map<RegExp, number>();
  const db = {
    execute: (q: unknown) => {
      const texto = serializar(q)
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      consultas.push(texto);
      const r = respostas.find((x) => x.quando.test(texto.toLowerCase()));
      if (!r) return Promise.resolve([]);
      const n = (vezes.get(r.quando) ?? 0) + 1;
      vezes.set(r.quando, n);
      try {
        return Promise.resolve(r.responder(n));
      } catch (e) {
        return Promise.reject(e);
      }
    },
  };
  return { db: db as never, consultas };
}

/** A vaga que a volta VIZINHA gravou: tem o número, é da varredura e está na fila de revisão. */
const vagaDaVizinha = {
  id: ID_DA_VIZINHA,
  status: CODIGO.pendenteRevisao,
  codigo: "codigo-que-veio-do-ats",
  nome_divulgacao: "titulo-que-veio-do-ats",
  cidade_id: null,
  posicoes_oficiais: 2,
  status_antes: null,
  da_varredura: true,
  recusada_em: null,
  encerrou: false,
};

const PADRAO = {
  buscaPeloNumero: /select[\s\S]*from vagas v/,
  leituraDaCandidata: /from vagas where codigo =/,
  adocao: /set id_vacancy_pandape/,
  nascimento: /insert into vagas/,
  refresh: /^update vagas set codigo/,
  matricula: /insert into as_varredura_vagas/,
};

/** As consultas separadas por sentido, para o `expect` falar de gesto e não de string. */
function gestos(consultas: string[]) {
  const baixo = consultas.map((c) => c.toLowerCase());
  return {
    buscas: baixo.filter((c) => PADRAO.buscaPeloNumero.test(c)),
    inserts: baixo.filter((c) => PADRAO.nascimento.test(c)),
    adocoes: baixo.filter((c) => PADRAO.adocao.test(c)),
    refreshes: baixo.filter((c) => PADRAO.refresh.test(c)),
  };
}

function repositorio(db: never): IngestaoRepositorio {
  const cat = catalogoDaRevisao();
  return new IngestaoRepositorio(db, cat.servico as never, null as never);
}

// ── 1. O INSERT DO ESPELHO QUE PERDE A CORRIDA ─────────────────────────────────────────────────

/**
 * A volta em que NADA é achado (nem pelo número, nem pela adoção), o insert é RECUSADO pelo índice,
 * e a releitura acha a vaga que a vizinha acabou de gravar.
 *
 * A busca pelo número responde por VEZ: as duas primeiras (a de entrada e a SEGUNDA CHANCE) não
 * acham nada, e é isso que abre o caminho do insert; da terceira em diante, a vizinha já gravou.
 */
function cenarioDoInsertRecusado(restricao: string | null) {
  return bancoDaCorrida([
    { quando: PADRAO.buscaPeloNumero, responder: (n) => (n <= 2 ? [] : [{ ...vagaDaVizinha }]) },
    // Nenhuma candidata para adotar: zero é um dos casos em que a adoção se abstém de propósito.
    { quando: PADRAO.leituraDaCandidata, responder: () => [] },
    {
      quando: PADRAO.nascimento,
      responder: () => {
        if (restricao !== null) throw erro23505(restricao);
        throw erroDeOutraNatureza();
      },
    },
    { quando: PADRAO.refresh, responder: () => [{ id: ID_DA_VIZINHA }] },
    { quando: PADRAO.matricula, responder: () => [] },
  ]);
}

describe("o insert do espelho que perde a corrida contra o unique do número", () => {
  it("RELÊ pelo número e segue com a vaga da vizinha, sem criar vaga nenhuma", async () => {
    const banco = cenarioDoInsertRecusado(NOME_DO_INDICE);
    const resultado = await repositorio(banco.db).escrever(escritaDaVaga(null));
    const g = gestos(banco.consultas);

    expect(
      resultado.id,
      "a volta seguiu com uma vaga que não é a da vizinha: a candidatura apontaria para a linha errada",
    ).toBe(ID_DA_VIZINHA);
    expect(
      g.inserts.length,
      "o insert foi tentado mais de uma vez. A repetição existe para RELER, não para insistir na " +
        "escrita: insistir é a gêmea voltando pela porta do laço.",
    ).toBe(1);
    expect(
      g.inserts.some((c) => c.includes(ID_QUE_NAO_PODE_NASCER)),
      "nasceu vaga depois da recusa do índice",
    ).toBe(false);
    expect(
      g.buscas.length,
      "a releitura não aconteceu: sem ela, o 23505 sobe cru e a vaga fica sem processar na volta",
    ).toBeGreaterThanOrEqual(3);
    expect(
      g.refreshes.length,
      "a volta não seguiu o fluxo normal depois de reler. Engolir o erro devolveria nada aconteceu " +
        "sobre uma vaga que existe, e a volta seguinte repetiria tudo.",
    ).toBe(1);
  });

  it("erro que NÃO é a nossa violação sobe INTACTO, e a passada não se repete", async () => {
    const banco = cenarioDoInsertRecusado(null);
    const erro = await repositorio(banco.db)
      .escrever(escritaDaVaga(null))
      .then(() => null)
      .catch((e: unknown) => e);
    const g = gestos(banco.consultas);

    expect(
      (erro as { code?: string } | null)?.code,
      "um erro de banco que não é a colisão do número foi engolido ou traduzido. Numa varredura em " +
        "que o chamador soma um contador, isso transforma queda de banco em silêncio.",
    ).toBe("08006");
    expect(
      g.inserts.length,
      "a passada foi repetida para um erro que não é a corrida: repetir uma falha de conexão é " +
        "dobrar o custo sem nenhuma chance de desfecho diferente",
    ).toBe(1);
  });

  it("a violação de OUTRO unique da tabela também sobe intacta", async () => {
    const banco = cenarioDoInsertRecusado("uq_as_candidaturas_viva");
    const erro = await repositorio(banco.db)
      .escrever(escritaDaVaga(null))
      .then(() => null)
      .catch((e: unknown) => e);

    expect(
      (erro as { constraint_name?: string } | null)?.constraint_name,
      "a repetição foi acionada pela colisão de QUALQUER unique. A releitura pelo número só faz " +
        "sentido para a colisão DO número: para outra, ela repete a passada e devolve o mesmo erro " +
        "duas vezes mais tarde.",
    ).toBe("uq_as_candidaturas_viva");
  });
});

// ── 2. A ADOÇÃO QUE PERDE A CORRIDA ────────────────────────────────────────────────────────────

/**
 * A adoção acha UMA candidata em REVISAO e o `update` é recusado pelo índice: a vizinha gravou
 * aquele número em OUTRA linha. O compare-and-swap do `where` NÃO alcança esse caso, porque ele só
 * protege a MESMA candidata (`id_vacancy_pandape is null` continua verdadeiro na nossa linha).
 */
function cenarioDaAdocaoRecusada(restricao: string | null) {
  return bancoDaCorrida([
    { quando: PADRAO.buscaPeloNumero, responder: (n) => (n === 1 ? [] : [{ ...vagaDaVizinha }]) },
    {
      quando: PADRAO.leituraDaCandidata,
      responder: () => [
        {
          id: ID_DA_CANDIDATA,
          status: CODIGO.pendenteRevisao,
          codigo: "codigo-que-veio-do-ats",
          nome_divulgacao: "titulo-conferido-por-pessoa",
          cidade_id: 10,
          posicoes_oficiais: 9,
        },
      ],
    },
    {
      quando: PADRAO.adocao,
      responder: () => {
        if (restricao !== null) throw erro23505(restricao);
        throw erroDeOutraNatureza();
      },
    },
    { quando: PADRAO.nascimento, responder: () => [{ id: ID_QUE_NAO_PODE_NASCER }] },
    { quando: PADRAO.refresh, responder: () => [{ id: ID_DA_VIZINHA }] },
    { quando: PADRAO.matricula, responder: () => [] },
  ]);
}

describe("a adoção que perde a corrida contra o unique do número", () => {
  it("NÃO lança: a segunda chance relê e a volta segue com a vaga da vizinha", async () => {
    const banco = cenarioDaAdocaoRecusada(NOME_DO_INDICE);
    const resultado = await repositorio(banco.db).escrever(escritaDaVaga(null));
    const g = gestos(banco.consultas);

    expect(
      resultado.id,
      "a adoção recusada derrubou a volta ou seguiu com a linha errada. O 23505 da adoção não é " +
        "alcançado pelo compare-and-swap: quem recusa é o índice, e o desfecho é reler.",
    ).toBe(ID_DA_VIZINHA);
    expect(
      g.inserts,
      "a adoção falhou e o fluxo CRIOU a vaga: é exatamente a gêmea que o índice acabou de impedir, " +
        "nascendo pela porta do tratamento do erro",
    ).toEqual([]);
    expect(g.adocoes.length, "a adoção foi tentada mais de uma vez").toBe(1);
    /*
     * ┌─ ESTE É O `expect` QUE DISTINGUE AS DUAS CAMADAS, E SEM ELE O TESTE SERIA VAZIO ──────────┐
     * │ A repetição externa de `escreverVaga` ABSORVERIA o 23505 da adoção sozinha, e o desfecho    │
     * │ visível seria IDÊNTICO (mesma vaga, zero insert, uma adoção). O que muda é o CUSTO: sem o   │
     * │ `catch` da própria adoção, a volta inteira é refeita, e tudo que ela já tinha lido é lido   │
     * │ de novo. A busca da cidade é a testemunha barata disso: ela acontece ANTES da adoção, uma   │
     * │ vez por passada. Duas = a volta reiniciou; uma = a adoção se absteve e a SEGUNDA CHANCE,    │
     * │ que já existia, resolveu no mesmo ciclo. A corrida é rara, mas o preço dela é pago numa     │
     * │ varredura de 137 mil inscrições.                                                            │
     * └───────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const buscasDeCidade = banco.consultas.filter((c) => /from as_cidades/i.test(c));
    expect(
      buscasDeCidade.length,
      "a volta inteira foi REINICIADA para absorver a corrida da adoção, em vez de a adoção se " +
        "abster e a segunda chance resolver no mesmo ciclo",
    ).toBe(1);
  });

  it("erro que NÃO é a nossa violação sobe intacto da adoção", async () => {
    const banco = cenarioDaAdocaoRecusada(null);
    const erro = await repositorio(banco.db)
      .escrever(escritaDaVaga(null))
      .then(() => null)
      .catch((e: unknown) => e);

    expect(
      (erro as { code?: string } | null)?.code,
      "o `catch` da adoção é largo: uma falha de banco viraria não adotou em silêncio, e a gêmea " +
        "voltaria pelo insert sem ninguém saber por quê",
    ).toBe("08006");
  });
});

// ── 3. O ESPELHO DO DIGAI, QUE É O MESMO SELECT-THEN-INSERT ────────────────────────────────────

function digai(db: never): DigaiRepositorio {
  const cat = catalogoDaRevisao();
  return new DigaiRepositorio(db, cat.servico as never, null as never);
}

/** O espelho do Digai: o `select` não acha, o `insert` é recusado, a releitura acha a vencedora. */
function cenarioDoEspelhoDigai(restricao: string | null) {
  return bancoDaCorrida([
    {
      quando: /select id from vagas where id_vacancy_pandape/,
      responder: (n) => (n === 1 ? [] : [{ id: ID_DA_VIZINHA }]),
    },
    {
      quando: PADRAO.nascimento,
      responder: () => {
        if (restricao !== null) throw erro23505(restricao);
        throw erroDeOutraNatureza();
      },
    },
  ]);
}

describe("o espelho de vaga do Digai que perde a corrida", () => {
  it("devolve a vaga VENCEDORA em vez de lançar, e não cria segunda linha", async () => {
    const banco = cenarioDoEspelhoDigai(NOME_DO_INDICE);
    const vaga = await digai(banco.db).espelharVaga(String(ID_VACANCY));
    const g = gestos(banco.consultas);

    expect(
      vaga.id,
      "o espelho do Digai lançou ou devolveu outra vaga. Ele devolve o id para a candidatura " +
        "apontar: o 23505 subindo ali derruba a importação inteira, e apontar para a linha errada " +
        "parte as candidaturas entre duas vagas, que é o dano que o índice existe para impedir.",
    ).toBe(ID_DA_VIZINHA);
    expect(g.inserts.length, "o insert do espelho foi tentado mais de uma vez").toBe(1);
  });

  it("erro que NÃO é a nossa violação sobe intacto do espelho do Digai", async () => {
    const banco = cenarioDoEspelhoDigai(null);
    const erro = await digai(banco.db)
      .espelharVaga(String(ID_VACANCY))
      .then(() => null)
      .catch((e: unknown) => e);

    expect((erro as { code?: string } | null)?.code).toBe("08006");
  });

  it("colisão SEM vaga vencedora na releitura não devolve vaga inventada", async () => {
    /**
     * O índice recusou e a releitura não achou nada: é estado contraditório (alguém apagou a linha
     * entre as duas idas, ou a colisão foi de outra natureza). Devolver um id qualquer faria a
     * candidatura apontar para vaga que não existe, e a FK só reclamaria depois. Lançar é o certo.
     */
    const banco = bancoDaCorrida([
      { quando: /select id from vagas where id_vacancy_pandape/, responder: () => [] },
      { quando: PADRAO.nascimento, responder: () => { throw erro23505(NOME_DO_INDICE); } },
    ]);
    const erro = await digai(banco.db)
      .espelharVaga(String(ID_VACANCY))
      .then(() => null)
      .catch((e: unknown) => e);

    expect(erro, "o espelho devolveu vaga depois de o índice recusar e a releitura não achar nada").toBeTruthy();
  });
});
