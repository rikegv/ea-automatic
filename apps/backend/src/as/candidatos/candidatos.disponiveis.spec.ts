import { BadRequestException } from "@nestjs/common";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { CANDIDATURA_SITUACOES, candidaturaViva } from "@ea/shared-types";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { CandidatosService } from "./candidatos.service";
import { BUSCA_LIMITE_MAXIMO, BUSCA_LIMITE_PADRAO } from "./candidatos.dto";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ QUEM APARECE NA LISTA DE ALOCAÇÃO, E O QUE A LISTA NÃO PODE ESCONDER (Frente D, 13 e 15) ────
 *
 * ┌─ O DANO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR QUE VOLTE ────────────────────────────────────┐
 * │ A régua de `semCandidatura` tinha virado "sem candidatura NENHUMA". Efeito medido na        │
 * │ operação: QUEM FOI DESCARTADO UMA VEZ SUMIA das listas de alocação PARA SEMPRE, mesmo livre.│
 * │ O diretor descartou uma pessoa e não a achou mais. A correção devolve a régua à VIVACIDADE. │
 * │                                                                                             │
 * │ E A CORREÇÃO TEM UMA METADE QUE NÃO PODE AFROUXAR JUNTO (§A.26): ela ALARGA o que a tela    │
 * │ mostra, então quem tem candidatura VIVA precisa continuar FORA. Alocá-lo de novo seria       │
 * │ recusado pelo unique parcial `uq_as_candidaturas_viva`, e oferecê-lo faria a tela propor um  │
 * │ gesto que o banco recusa.                                                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ O QUE É FORMA E O QUE É COMPORTAMENTO, DITO SEM MEIO-TERMO ───────────────────────────────────
 *
 * O FILTRO MORA DENTRO DA CONSULTA, e um banco fingido devolve as linhas que quiser, com o filtro
 * certo ou errado. Então as afirmações sobre QUEM aparece são sobre a CLÁUSULA renderizada, e não
 * sobre linhas devolvidas por um dublê: a cláusula é passada pelo `PgDialect` de verdade e os
 * parâmetros são recolocados no texto, exatamente como o `retencao-candidatos.lgpd` já faz.
 *
 * O QUE É COMPORTAMENTO DE VERDADE aqui é o CORTE (`total`, `limite`, `offset`, `truncado`) e a
 * recusa do CPF ilegível: os dois são decididos em TypeScript, com o banco fora do caminho.
 */

const dialeto = new PgDialect();

/** A cláusula como o Postgres a receberia, com os parâmetros de volta no texto. */
function textoDe(cond: unknown): string {
  if (cond === undefined || cond === null) return "";
  // O `sql`${x}`` embrulha coluna e expressão pelo mesmo caminho: `sqlToQuery` recusa `Column` cru.
  const { sql: texto, params } = dialeto.sqlToQuery(sql`${cond}` as never);
  return texto.replace(/\$(\d+)/g, (_, n: string) => String(params[Number(n) - 1]));
}

interface Consulta {
  where: string;
  /** A expressão da coluna `candidaturasAtivas`, que conta as vivas de cada linha. */
  colunaDeAtivas: string;
  limite: number | null;
  offset: number | null;
  ordem: string[];
}

/**
 * O BANCO FINGIDO DA BUSCA. Ele guarda a consulta montada (cláusula, teto, deslocamento) e devolve
 * as linhas que o cenário mandar, com o `total` da janela já dentro de cada uma, que é como o
 * `count(*) over ()` chega do driver.
 */
function bancoDaBusca(cenario: { linhas?: number; total?: number } = {}) {
  const quantas = cenario.linhas ?? 0;
  const total = cenario.total ?? quantas;
  const consulta: Consulta = {
    where: "",
    colunaDeAtivas: "",
    limite: null,
    offset: null,
    ordem: [],
  };

  const linhas = Array.from({ length: quantas }, (_, i) => ({
    id: `pessoa-${i}`,
    nome: `Fulano ${i}`,
    origem: "MANUAL",
    bancoTalentos: false,
    cidade: "São Paulo",
    uf: "SP",
    temCpf: true,
    criadoEm: new Date("2026-09-01T12:00:00.000Z"),
    candidaturasAtivas: 0,
    total,
  }));

  const construtor: Record<string, unknown> = {};
  construtor.from = () => construtor;
  construtor.where = (w: unknown) => {
    consulta.where = textoDe(w);
    return construtor;
  };
  construtor.orderBy = (...cols: unknown[]) => {
    consulta.ordem = cols.map(textoDe);
    return construtor;
  };
  construtor.limit = (n: number) => {
    consulta.limite = n;
    return construtor;
  };
  construtor.offset = (n: number) => {
    consulta.offset = n;
    return Promise.resolve(linhas);
  };

  /*
   * A SEGUNDA CONSULTA, A DO FUNIL, CAI NUMA CADEIA PROPRIA E INERTE, e ela precisa ser propria.
   *
   * A busca passou a ler o funil da pagina em UMA segunda consulta (`as_candidaturas` por
   * `candidato_id in (...)`), que e justamente o conserto do 429. Se ela caisse no construtor de
   * cima, o `where` e a coluna de ativas que este arquivo afere seriam SOBRESCRITOS pela consulta
   * seguinte, e as afirmacoes sobre a consulta PAGINADA passariam a falar da outra.
   *
   * ELA DEVOLVE LISTA VAZIA de proposito: o que este arquivo afere e a consulta paginada e o corte,
   * e quem cobre a forma e a paginacao do funil sao os arquivos proprios daquela frente.
   */
  const cadeiaDoFunil: Record<string, unknown> = {};
  for (const passo of ["from", "innerJoin", "leftJoin", "where", "orderBy"]) {
    cadeiaDoFunil[passo] = () => cadeiaDoFunil;
  }
  cadeiaDoFunil.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
    Promise.resolve([]).then(ok, falha);

  const db = {
    select: vi.fn((selecao: Record<string, unknown>) => {
      // A consulta paginada e a unica que pede `candidaturasAtivas`; a do funil nao pede.
      if (!selecao || !("candidaturasAtivas" in selecao)) return cadeiaDoFunil;
      consulta.colunaDeAtivas = textoDe(selecao?.candidaturasAtivas);
      return construtor;
    }),
  };
  const service = new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
  return { service, consulta };
}

/** A parte da cláusula que decide quem está "sem candidatura", isolada do resto do `where`. */
function clausulaDoSemCandidatura(where: string): string {
  const i = where.toLowerCase().indexOf("not exists");
  expect(i, "sem o `not exists` o filtro de disponíveis não existe mais.").toBeGreaterThanOrEqual(0);
  return where.slice(i);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PONTO 13: quem foi descartado VOLTA a aparecer, e quem está vivo continua fora
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("semCandidatura: a régua é SEM CANDIDATURA VIVA, e não SEM CANDIDATURA NENHUMA", () => {
  it("o recorte sai da régua única do vocabulário: 4 vivas, 2 encerradas", () => {
    expect(SITUACOES_VIVAS).toEqual(["ATIVO", "APROVADO", "ALOCADO", "ENVIADO_PARA_ADMISSAO"]);
    expect(CANDIDATURA_SITUACOES.filter((s) => !candidaturaViva(s))).toEqual([
      "DESCARTADO",
      "DESISTIU",
    ]);
  });

  /**
   * O TESTE DO DANO. Sem a lista de situações dentro do `not exists`, a subconsulta volta a casar
   * com QUALQUER candidatura, e quem foi descartado uma vez desaparece da lista para sempre.
   */
  it("o `not exists` é restrito às situações VIVAS", async () => {
    const { service, consulta } = bancoDaBusca();
    await service.buscar({ semCandidatura: true });

    const filtro = clausulaDoSemCandidatura(consulta.where);
    for (const viva of SITUACOES_VIVAS) {
      expect(
        filtro,
        `sem '${viva}' na subconsulta, quem está ${viva} volta a ser oferecido para alocação e o unique parcial recusa o gesto que a tela propôs.`,
      ).toContain(viva);
    }
  });

  /**
   * A OUTRA METADE, e é a que descreve o bug do diretor: `DESCARTADO` e `DESISTIU` NÃO podem
   * aparecer na subconsulta, porque é a presença deles ali que excluía a pessoa da lista.
   */
  it.each(["DESCARTADO", "DESISTIU"])(
    "a subconsulta NÃO menciona %s: quem saiu do processo volta a ser alocável",
    async (encerrada) => {
      const { service, consulta } = bancoDaBusca();
      await service.buscar({ semCandidatura: true });

      expect(
        clausulaDoSemCandidatura(consulta.where),
        `com '${encerrada}' na subconsulta, quem foi ${encerrada} uma vez nunca mais aparece em lista de alocação nenhuma, mesmo estando livre.`,
      ).not.toContain(encerrada);
    },
  );

  /**
   * A LISTA NÃO É REDIGITADA: filtro e coluna `candidaturasAtivas` leem a MESMA constante. Com duas
   * listas, elas discordam na primeira situação nova e a tela passa a mostrar "0 candidaturas
   * ativas" para quem o filtro considera ocupado.
   */
  it("filtro e coluna de candidaturas ativas usam a MESMA lista de vivas", async () => {
    const { service, consulta } = bancoDaBusca();
    await service.buscar({ semCandidatura: true });

    // A COLUNA VIVE NA PROJEÇÃO e o FILTRO vive no `where`: são dois lugares, e é por isso que eles
    // podem divergir. Cada situação viva tem de aparecer NOS DOIS, senão a tela mostra "0 ativas"
    // para quem o filtro considera ocupado (ou o contrário).
    for (const s of SITUACOES_VIVAS) {
      expect(consulta.where, `filtro sem '${s}'`).toContain(s);
      expect(consulta.colunaDeAtivas, `coluna de ativas sem '${s}'`).toContain(s);
    }
    for (const encerrada of ["DESCARTADO", "DESISTIU"]) {
      expect(consulta.colunaDeAtivas).not.toContain(encerrada);
    }
  });

  /** Sem o filtro, o `not exists` não existe: a busca normal continua trazendo todo mundo. */
  it("sem `semCandidatura`, nenhuma subconsulta de disponibilidade entra na cláusula", async () => {
    const { service, consulta } = bancoDaBusca();
    await service.buscar({ nome: "ana" });
    expect(consulta.where.toLowerCase()).not.toContain("not exists");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PONTO 15 (a): o corte deixa de mentir
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("o corte da lista não mente mais", () => {
  it("o padrão continua sendo o teto antigo, e ele agora é DITO na resposta", async () => {
    const { service, consulta } = bancoDaBusca({ linhas: 3, total: 3 });
    const pagina = await service.buscar({});

    expect(consulta.limite).toBe(BUSCA_LIMITE_PADRAO);
    expect(pagina.limite).toBe(BUSCA_LIMITE_PADRAO);
    expect(pagina.offset).toBe(0);
  });

  /**
   * O CASO DO DANO: a página traz 200 e existem 1.480. Antes, a resposta era um array de 200 e
   * NADA dizia que havia mais alguém, então o candidato antigo simplesmente não existia para quem
   * procurava rolando a tela.
   */
  it("com gente além da página, `truncado` é verdadeiro e `total` diz quantos existem", async () => {
    const { service } = bancoDaBusca({ linhas: 200, total: 1480 });
    const pagina = await service.buscar({});

    expect(pagina.itens).toHaveLength(200);
    expect(pagina.total).toBe(1480);
    expect(pagina.truncado).toBe(true);
  });

  it("cabendo tudo na página, `truncado` é falso: não se inventa corte onde não há", async () => {
    const { service } = bancoDaBusca({ linhas: 12, total: 12 });
    const pagina = await service.buscar({});
    expect(pagina.truncado).toBe(false);
    expect(pagina.total).toBe(12);
  });

  /** Lista vazia é lista vazia: zero total, zero corte, e nenhum `undefined` vazando para a tela. */
  it("lista vazia devolve total zero e truncado falso", async () => {
    const { service } = bancoDaBusca({ linhas: 0, total: 0 });
    const pagina = await service.buscar({ nome: "ninguem" });
    expect(pagina).toMatchObject({ total: 0, truncado: false, itens: [] });
  });

  /** A última página de uma base grande não é corte: o `truncado` conta o que sobrou DEPOIS dela. */
  it("a última página de uma base grande não é reportada como cortada", async () => {
    const { service, consulta } = bancoDaBusca({ linhas: 50, total: 250 });
    const pagina = await service.buscar({ limite: 200, offset: 200 });

    expect(consulta.offset).toBe(200);
    expect(pagina.truncado).toBe(false);
  });

  it("o teto do corpo é aparelhado no service: `limite` absurdo não vira exportação da base", async () => {
    const { service, consulta } = bancoDaBusca();
    await service.buscar({ limite: 999_999 });
    expect(consulta.limite).toBe(BUSCA_LIMITE_MAXIMO);
  });

  it("`limite` zero ou negativo não zera a lista: o piso é 1", async () => {
    const { service, consulta } = bancoDaBusca();
    await service.buscar({ limite: 0, offset: -5 });
    expect(consulta.limite).toBe(1);
    expect(consulta.offset).toBe(0);
  });

  /**
   * A ORDENAÇÃO PRECISA DE DESEMPATE. Sem ele, duas pessoas cadastradas no mesmo instante (o que
   * uma importação de planilha produz às dezenas) têm ordem indefinida entre páginas, e a mesma
   * linha aparece duas vezes ou some no meio da paginação.
   */
  it("a ordenação tem desempate por id, para a paginação não pular nem repetir linha", async () => {
    const { service, consulta } = bancoDaBusca();
    await service.buscar({});
    expect(consulta.ordem).toHaveLength(2);
    expect(consulta.ordem[0]).toContain("criado_em");
    expect(consulta.ordem[1]).toContain("id");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// PONTO 15 (b): CPF ilegível INFORMA, nunca devolve lista
// ─────────────────────────────────────────────────────────────────────────────────────────────
describe("CPF preenchido e ilegível informa o erro, em vez de mentir com uma lista", () => {
  /**
   * O SILÊNCIO ANTIGO: `return []`. A tela dizia "nenhum candidato encontrado", que é uma resposta
   * sobre a BASE, quando o fato era sobre o que foi DIGITADO. Quem lê conclui que a pessoa não está
   * cadastrada e cadastra de novo alguém que já existe.
   */
  it("CPF pela metade recusa com frase, e NÃO devolve lista vazia", async () => {
    const { service } = bancoDaBusca({ linhas: 3, total: 3 });
    await expect(service.buscar({ cpf: "123" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("CPF com 11 dígitos e dígito verificador errado também recusa", async () => {
    const { service } = bancoDaBusca();
    await expect(service.buscar({ cpf: "11111111111" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /**
   * A MENTIRA CONTRÁRIA, e a mais perigosa das duas: o `@Transform` do DTO deixa só dígitos, então
   * "abc" chega como string VAZIA. Com o `if (dto.cpf)` de antes, o filtro era PULADO e a busca por
   * um CPF ilegível devolvia A BASE INTEIRA.
   */
  it("CPF que não tem dígito nenhum recusa, em vez de listar a base inteira", async () => {
    const { service, consulta } = bancoDaBusca({ linhas: 200, total: 1480 });
    await expect(service.buscar({ cpf: "" })).rejects.toBeInstanceOf(BadRequestException);
    expect(consulta.where, "a consulta nem deve ser montada quando o CPF é ilegível.").toBe("");
  });

  /** §A.6: a recusa NÃO repete o número recebido, que iria parar no log de qualquer cliente HTTP. */
  it("a frase da recusa não carrega o que foi digitado", async () => {
    const { service } = bancoDaBusca();
    const erro = await service.buscar({ cpf: "52998224724" }).catch((e: unknown) => e);
    const frase = JSON.stringify((erro as BadRequestException).getResponse());
    expect(frase).not.toContain("52998224724");
    expect(frase).not.toContain("529.982.247-24");
  });

  it("CPF válido passa e vira filtro de igualdade sobre a coluna", async () => {
    const { service, consulta } = bancoDaBusca({ linhas: 1, total: 1 });
    const pagina = await service.buscar({ cpf: "529.982.247-25" });
    expect(pagina.itens).toHaveLength(1);
    expect(consulta.where).toContain("cpf");
  });
});
