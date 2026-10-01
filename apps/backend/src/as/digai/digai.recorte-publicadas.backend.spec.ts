import { describe, expect, it, vi } from "vitest";
import {
  STATUS_DE_SCREENING_CONHECIDOS,
  STATUS_DE_SCREENING_QUE_ENTRA,
  classificarStatusDeScreening,
  planoDaVarredura,
  projetarScreeningDigai,
  recortarScreeningsPublicadas,
  type ScreeningDigai,
} from "../../domain/digai";
import { DigaiVarreduraService } from "./digai-varredura.service";

/**
 * ─ O RECORTE DA VARREDURA DO DIGAI: SO VAGA `PUBLISHED` ENTRA ──────────────────────────────────
 *
 * Decisão do diretor, 01/10/2026. Até aqui a varredura NÃO FILTRAVA NADA: listava as 537 screenings,
 * de todos os cinco status. Ligar a ingestão sem o recorte traria PAUSED, QUEUED, CLOSED e DRAFT
 * junto com as publicadas. No Pandapé o recorte equivalente já existe (`VacancyStatus=2`).
 *
 * ┌─ A DISTRIBUIÇÃO MEDIDA AO VIVO CONTRA A API (01/10/2026), E É ELA QUE DÁ PESO AOS CASOS ─────┐
 * │   PUBLISHED 187 · PAUSED 204 · QUEUED 110 · CLOSED 34 · DRAFT 2 · total 537                   │
 * │ As 204 PAUSED ficam de fora por DECISÃO EXPLÍCITA: a vaga republicada volta sozinha no ciclo   │
 * │ seguinte, porque a varredura RELISTA por status. Incluí-las mais que dobraria a base varrida.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTE ARQUIVO PROVA, E A PRIMEIRA ASSERÇÃO É A QUE MAIS IMPORTA ───────────────────────┐
 * │ 1. é LISTA BRANCA: status novo fica de FORA, e não "entra porque não está na lista negra";     │
 * │ 2. cada um dos outros quatro é recusado NOMINALMENTE, um por um;                               │
 * │ 3. status desconhecido é recusado E CONTADO, separado dos 350 esperados;                       │
 * │ 4. a soma das três saídas fecha com o total que entrou;                                        │
 * │ 5. o recorte NÃO quebra a paginação, que é a armadilha da ordem (ver o caso do fim).           │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nada de pessoa. Screenings sintéticos, ids técnicos, e nenhum candidato é lido aqui.
 */

const screening = (id: string, status: string | null): ScreeningDigai => ({
  id,
  updatedAt: null,
  status,
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A CLASSIFICAÇÃO, E ELA É LISTA BRANCA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("classificarStatusDeScreening: entra quem é PUBLISHED, e mais ninguém", () => {
  it("PUBLISHED entra", () => {
    expect(classificarStatusDeScreening("PUBLISHED")).toBe("ENTRA");
    expect(STATUS_DE_SCREENING_QUE_ENTRA).toEqual(["PUBLISHED"]);
  });

  it.each([["PAUSED"], ["QUEUED"], ["CLOSED"], ["DRAFT"]])(
    "%s é recusado NOMINALMENTE, e é conhecido",
    (status) => {
      /*
       * NOMINALMENTE, UM POR UM, e não por um laço sobre o complemento da lista branca: o laço sobre
       * o complemento fica verde mesmo se alguém TIRAR um status da lista de conhecidos, e aí aquele
       * status viraria "desconhecido" e sairia no `warn` de mudança de contrato todo ciclo, para
       * sempre. São 204 PAUSED e 110 QUEUED: o barulho seria diário.
       */
      expect(classificarStatusDeScreening(status)).toBe("FORA_DO_RECORTE");
      expect(STATUS_DE_SCREENING_CONHECIDOS as readonly string[]).toContain(status);
    },
  );

  it("o SEXTO status do fornecedor fica de FORA, e esta é a prova da lista BRANCA", () => {
    /*
     * ┌─ O ÚNICO CASO QUE DISTINGUE LISTA BRANCA DE LISTA NEGRA ──────────────────────────────────┐
     * │ Uma lista negra ("não entra quem é CLOSED, QUEUED ou DRAFT") passa VERDE em todos os casos │
     * │ acima e FALHA aqui: ela não tem como conhecer o status que o fornecedor vai criar. E o     │
     * │ custo de errar é concreto: o status novo ENTRA CALADO, e a ingestão passa a trazer         │
     * │ candidato de um estado de vaga que ninguém avaliou. É a mesma razão da lista branca de     │
     * │ colunas da planilha do time.                                                               │
     * └──────────────────────────────────────────────────────────────────────────────────────────────┘
     */
    expect(classificarStatusDeScreening("ARCHIVED_BY_PROVIDER")).toBe("DESCONHECIDO");
  });

  it("ausente, vazio e não texto são DESCONHECIDO, e não `fora do recorte`", () => {
    /*
     * A DISTINÇÃO É DE AÇÃO: sem o campo não se sabe o estado da vaga, e isso é mudança de contrato
     * que alguém tem de olhar. Somar com os 350 esperados esconderia a mudança dentro do número que
     * é rotina.
     */
    for (const cru of [null, undefined, "", 7, {}]) {
      expect(classificarStatusDeScreening(cru as never)).toBe("DESCONHECIDO");
    }
  });

  it("a comparação é EXATA: variação de caixa não entra", () => {
    /*
     * MUTANTE QUE ISTO MATA: `status.trim().toUpperCase() === "PUBLISHED"`. Parece higiene e é a
     * porta por onde um valor PARECIDO com um conhecido passa a ser tratado como ele. O fornecedor
     * manda `PUBLISHED` em maiúsculas (medido), e o dia em que mandar outra coisa é o dia de alguém
     * olhar, não de o código adivinhar.
     */
    for (const variacao of ["published", "Published", " PUBLISHED", "PUBLISHED "]) {
      expect(classificarStatusDeScreening(variacao)).toBe("DESCONHECIDO");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. O RECORTE PURO, E AS CONTAGENS QUE FECHAM
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("recortarScreeningsPublicadas: a lista que entra, e as duas contagens", () => {
  it("na distribuição MEDIDA, entram 187 de 537", () => {
    /*
     * A DISTRIBUIÇÃO REAL, reproduzida: 187 PUBLISHED, 204 PAUSED, 110 QUEUED, 34 CLOSED, 2 DRAFT.
     * Este caso é o que liga o código ao número que o diretor aprovou: mexer no recorte move o 187,
     * e quem mexer tem de vir aqui explicar por quê.
     */
    const base = [
      ...Array.from({ length: 187 }, (_, i) => screening(`pub-${i}`, "PUBLISHED")),
      ...Array.from({ length: 204 }, (_, i) => screening(`pau-${i}`, "PAUSED")),
      ...Array.from({ length: 110 }, (_, i) => screening(`que-${i}`, "QUEUED")),
      ...Array.from({ length: 34 }, (_, i) => screening(`clo-${i}`, "CLOSED")),
      ...Array.from({ length: 2 }, (_, i) => screening(`dra-${i}`, "DRAFT")),
    ];
    expect(base).toHaveLength(537);

    const r = recortarScreeningsPublicadas(base);

    expect(r.publicadas).toHaveLength(187);
    expect(r.foraDoRecorte, "as 350 conhecidas que o recorte deixa de fora").toBe(350);
    expect(r.statusDesconhecidos).toBe(0);
  });

  it("a SOMA das três saídas fecha com o total que entrou", () => {
    /*
     * O QUE ISTO IMPEDE: um ramo que descarta em silêncio. Diferença sem nome vira "sumiu no
     * caminho", e nesta ingestão o silêncio já custou uma entrada inteira zerada (o desembrulho
     * errado). A soma fechar é o que torna o log do ciclo auditável.
     */
    const base = [
      screening("a", "PUBLISHED"),
      screening("b", "PAUSED"),
      screening("c", "STATUS_QUE_NINGUEM_VIU"),
      screening("d", null),
      screening("e", "PUBLISHED"),
    ];

    const r = recortarScreeningsPublicadas(base);

    expect(r.publicadas.length + r.foraDoRecorte + r.statusDesconhecidos).toBe(base.length);
    expect(r.publicadas.map((s) => s.id)).toEqual(["a", "e"]);
    expect(r.foraDoRecorte).toBe(1);
    expect(r.statusDesconhecidos).toBe(2);
  });

  it("lista vazia não é erro: devolve vazio e zeros", () => {
    expect(recortarScreeningsPublicadas([])).toEqual({
      publicadas: [],
      foraDoRecorte: 0,
      statusDesconhecidos: 0,
    });
  });

  it("o recorte PRESERVA a ordem e o objeto, e não reescreve nada", () => {
    /*
     * MUTANTE QUE ISTO MATA: um recorte que reconstrói o objeto (`{ ...s, status: "PUBLISHED" }`) ou
     * que ordena. O `updatedAt` é o cursor gravado pelo tick, e reordenar mudaria quem recebe cota
     * primeiro quando o orçamento estoura, sem autor.
     */
    const a = screening("a", "PUBLISHED");
    const b = screening("b", "PUBLISHED");

    const r = recortarScreeningsPublicadas([a, screening("x", "CLOSED"), b]);

    expect(r.publicadas[0]).toBe(a);
    expect(r.publicadas[1]).toBe(b);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O RECORTE DENTRO DO TICK, COM O CLIENTE DUBLADO
// ────────────────────────────────────────────────────────────────────────────────────────────────

/** A listagem do fornecedor, no envelope real: `data.value = { page, total, screenings }`. */
const listagem = (screenings: unknown[], total?: number) => ({
  data: { value: { page: 1, total: total ?? screenings.length, screenings } },
});

/** Um screening CRU da listagem, com os campos que a projeção descarta. */
const cru = (id: string, status: string | null) => ({
  id,
  title: "Triagem sintetica",
  webAccessLink: "https://exemplo.invalido/acesso",
  status,
  updatedAt: "2026-10-01T12:00:00Z",
});

function varreduraComListagem(resposta: unknown) {
  const importacao = {
    podeLer: true,
    listarScreenings: async (pagina: number) => {
      const { desembrulharRespostaDigai, totalDeclaradoDigai } = await import("../../domain/digai");
      const { conteudo, lista } = desembrulharRespostaDigai(resposta);
      void pagina;
      const screenings: ScreeningDigai[] = [];
      for (const item of lista) {
        const p = projetarScreeningDigai(item);
        if (p !== null) screenings.push(p);
      }
      return { screenings, total: totalDeclaradoDigai(conteudo) };
    },
  } as never;
  const repo = {
    totaisConhecidos: vi.fn(async () => new Map<string, number>()),
    registrarCursorDoScreening: vi.fn(async () => true),
    cursorDoScreening: vi.fn(async () => null),
  } as never;
  return { varredura: new DigaiVarreduraService(importacao, repo), repo };
}

describe("o tick só põe na fila o que está PUBLICADO", () => {
  it("dos cinco status, só o PUBLISHED entra na fila, e os outros são contados", async () => {
    const { varredura } = varreduraComListagem(
      listagem([
        cru("sc-pub", "PUBLISHED"),
        cru("sc-pau", "PAUSED"),
        cru("sc-que", "QUEUED"),
        cru("sc-clo", "CLOSED"),
        cru("sc-dra", "DRAFT"),
      ]),
    );

    const r = await varredura.executarTick(1);

    expect(
      r.screenings.map((s) => s.screeningId),
      "só a publicada recebe cota, entra na fila e gasta requisição",
    ).toEqual(["sc-pub"]);
    expect(r.publicadas).toBe(1);
    expect(r.foraDoRecorte).toBe(4);
    expect(r.statusDesconhecidos).toBe(0);
  });

  it("status desconhecido não entra E aparece na contagem do tick", async () => {
    const { varredura } = varreduraComListagem(
      listagem([cru("sc-pub", "PUBLISHED"), cru("sc-novo", "ARCHIVED_BY_PROVIDER"), cru("sc-sem", null)]),
    );

    const r = await varredura.executarTick(1);

    expect(r.screenings.map((s) => s.screeningId)).toEqual(["sc-pub"]);
    expect(r.statusDesconhecidos, "o sexto status e o campo ausente contam juntos").toBe(2);
    expect(r.foraDoRecorte, "e não se escondem dentro do número que é rotina").toBe(0);
  });

  it("o CURSOR só é gravado para quem entrou no recorte", async () => {
    /*
     * O CURSOR É MEDIÇÃO DO QUE SE VARRE. Gravá-lo para a vaga pausada encheria a tabela com
     * `updatedAt` de screening que a varredura não lê, e o `total` daquela linha ficaria velho para
     * sempre: na republicação, a repartição por necessidade usaria um número de meses atrás.
     */
    const { varredura, repo } = varreduraComListagem(
      listagem([cru("sc-pub", "PUBLISHED"), cru("sc-pau", "PAUSED")]),
    );

    await varredura.executarTick(1);

    const gravados = (repo as unknown as { registrarCursorDoScreening: { mock: { calls: unknown[][] } } })
      .registrarCursorDoScreening.mock.calls;
    expect(gravados).toHaveLength(1);
    expect((gravados[0]?.[0] as { screeningId: string }).screeningId).toBe("sc-pub");
  });

  it("A ARMADILHA DA ORDEM: o recorte NÃO faz a listagem pedir página que não existe", async () => {
    /*
     * ┌─ O DEFEITO QUE ESTE CASO EXISTE PARA MATAR, E ELE SERIA CARO E INVISÍVEL ────────────────┐
     * │ A paginação compara o que a LISTAGEM devolveu com o `total` que o FORNECEDOR declarou.    │
     * │ Recortando ANTES dessa conta, `lidos` viraria 1 contra um `total` de 5, e                 │
     * │ `haMaisListagem` daria VERDADEIRO: a varredura pediria a página 2 de uma listagem que     │
     * │ acabou na 1, e repetiria isso página após página, gastando o orçamento do ciclo inteiro em │
     * │ listagem vazia. Nada falharia: o log diria "1 screening lido" e a fila ficaria quase       │
     * │ parada.                                                                                   │
     * │                                                                                          │
     * │ O RECORTE É NOSSO, O `total` É DELES: os dois lados da comparação têm de vir da mesma     │
     * │ fonte, e é por isso que o recorte acontece DEPOIS de `haMaisListagem`.                     │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const { varredura } = varreduraComListagem(
      listagem(
        [
          cru("sc-pub", "PUBLISHED"),
          cru("sc-1", "PAUSED"),
          cru("sc-2", "PAUSED"),
          cru("sc-3", "CLOSED"),
          cru("sc-4", "QUEUED"),
        ],
        5,
      ),
    );

    const r = await varredura.executarTick(1);

    expect(
      r.proximaPaginaDaListagem,
      "a listagem devolveu as 5 de 5 que o fornecedor declarou: ela ACABOU, e o recorte não muda isso",
    ).toBeNull();
  });

  it("página inteira fora do recorte: fila vazia, e a listagem continua paginando", async () => {
    /*
     * O CASO REAL DAS 204 PAUSED: uma página de listagem pode não ter NENHUMA publicada. A fila
     * fica vazia naquela passada, e isso é correto; o que não pode é a PAGINAÇÃO parar por causa
     * disso, senão as publicadas das páginas seguintes nunca seriam alcançadas.
     */
    const { varredura } = varreduraComListagem(
      listagem([cru("sc-1", "PAUSED"), cru("sc-2", "PAUSED")], 50),
    );

    const r = await varredura.executarTick(1);

    expect(r.screenings).toEqual([]);
    expect(r.publicadas).toBe(0);
    expect(r.foraDoRecorte).toBe(2);
    expect(r.proximaPaginaDaListagem, "há 48 screenings adiante, e pode haver publicada entre eles").toBe(2);
  });

  it("o ORÇAMENTO não é gasto por quem ficou de fora", async () => {
    /*
     * ┌─ O GANHO QUE O RECORTE TRAZ DE GRAÇA, E ELE É MEDÍVEL ──────────────────────────────────┐
     * │ A repartição por necessidade divide o orçamento entre os screenings DO PLANO. Entrando as │
     * │ 537, as 350 que ninguém trabalha levariam cota junto; entrando 187, a mesma requisição    │
     * │ disponível vira cota de quem está publicado. O recorte não é só menos leitura: é a mesma  │
     * │ leitura concentrada onde há gente para trazer.                                            │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const todas = [
      screening("pub", "PUBLISHED"),
      ...Array.from({ length: 20 }, (_, i) => screening(`pau-${i}`, "PAUSED")),
    ];
    const recorte = recortarScreeningsPublicadas(todas);

    const comRecorte = planoDaVarredura({
      screenings: recorte.publicadas,
      orcamento: 50,
      totaisConhecidos: new Map([["pub", 1_000]]),
    });
    const semRecorte = planoDaVarredura({
      screenings: todas,
      orcamento: 50,
      totaisConhecidos: new Map([["pub", 1_000]]),
    });

    expect(
      comRecorte.varrer[0]?.paginasPermitidas ?? 0,
      "com o recorte, a publicada leva a cota de que precisa",
    ).toBeGreaterThan(semRecorte.varrer[0]?.paginasPermitidas ?? 0);
    expect(semRecorte.varrer, "sem o recorte, as pausadas levam cota junto").toHaveLength(21);
  });
});
