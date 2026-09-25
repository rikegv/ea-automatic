import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  DicasDocumentoService,
  documentosValidos,
  pediuFiltroSemValorValido,
  predicadoDeSituacao,
  situacoesValidas,
} from "./dicas-documento.service";

/**
 * ══ OS FILTROS DA TELA DE DICAS: SITUAÇÃO e DOCUMENTO (escolha do diretor, §A.30) ═════════════
 *
 * O RISCO REAL DESTA FRENTE MORA NUM SÓ LUGAR, e é por isso que estes testes olham o SQL e não só
 * o resultado: `SEM_DICA` não é um registro, é a AUSÊNCIA dele. A consulta da tela é um `leftJoin`
 * de `tipos_documento` para `dicas_documento`, e as duas maneiras fáceis de responder ao filtro
 * (virar `innerJoin`, ou pendurar `ativo = true` solto no `where`) transformam o `leftJoin` num
 * inner na prática e FAZEM O TIPO SEM DICA SUMIR DA TELA, sem erro nenhum. Foi o modo de falha que
 * a auditoria pegou no join da trilha na rodada anterior, e o sintoma foi silencioso.
 *
 * Por isso aqui se mede o SQL EMITIDO: `is null` tem de aparecer, o `ON` do join tem de continuar
 * sendo só a igualdade das chaves, e "sem filtro" tem de produzir a consulta de sempre.
 *
 * §A.6: nada de dado pessoal. Isto é catálogo e configuração.
 */

const dialeto = new PgDialect();

/**
 * O SQL **MAIS OS PARÂMETROS**, e a segunda metade não é zelo: o drizzle NÃO inlineia o booleano,
 * ele emite `"ativo" = $1`. Medido aqui, na primeira versão deste arquivo: `COM_DICA` e
 * `DICA_INATIVA` produzem a MESMA string de SQL e diferem só no parâmetro (`true` contra `false`).
 * Comparar só o texto daria por provado um filtro que poderia estar trocado, e o teste passaria.
 */
const paraSql = (p: unknown) => {
  if (p === undefined) return null;
  const q = dialeto.sqlToQuery(p as never);
  return `${q.sql.toLowerCase()} || params=${JSON.stringify(q.params)}`;
};

describe("predicado de SITUAÇÃO", () => {
  it("sem situação nenhuma, NÃO há recorte: a consulta fica a de sempre", () => {
    expect(predicadoDeSituacao([])).toBeUndefined();
  });

  it("as TRÊS juntas são o universo inteiro, então também não recortam", () => {
    expect(predicadoDeSituacao(["COM_DICA", "SEM_DICA", "DICA_INATIVA"])).toBeUndefined();
  });

  it("SEM_DICA pergunta pela AUSÊNCIA do casamento, e não por uma linha", () => {
    const sql = paraSql(predicadoDeSituacao(["SEM_DICA"]));
    expect(sql).toContain("is null");
    // Não pode haver comparação de `ativo` neste caso: a dica não existe para ter `ativo`.
    expect(sql).not.toContain("ativo");
  });

  it("COM_DICA exige o casamento E o ativo VERDADEIRO, sem nunca depender de NULL = true", () => {
    const sql = paraSql(predicadoDeSituacao(["COM_DICA"]));
    expect(sql).toContain("is not null");
    expect(sql).toContain("ativo");
    expect(sql).toContain("params=[true]");
  });

  it("DICA_INATIVA é o par de COM_DICA: casou, e está OCULTA", () => {
    const sql = paraSql(predicadoDeSituacao(["DICA_INATIVA"]));
    expect(sql).toContain("is not null");
    expect(sql).toContain("ativo");
    // O PARÂMETRO É O QUE SEPARA AS DUAS: o SQL delas é idêntico, palavra por palavra. Trocar
    // `true` por `false` aqui inverteria o filtro sem mudar uma vírgula do texto da consulta.
    expect(sql).toContain("params=[false]");
    expect(sql).not.toBe(paraSql(predicadoDeSituacao(["COM_DICA"])));
  });

  it("MÚLTIPLA (§A.28): duas situações viram OU, e a ausência continua dita como ausência", () => {
    const sql = paraSql(predicadoDeSituacao(["SEM_DICA", "DICA_INATIVA"]));
    expect(sql).toContain(" or ");
    expect(sql).toContain("is null");
    expect(sql).toContain("is not null");
  });

  it("repetir a mesma situação não muda a pergunta nem vira um OR bobo", () => {
    expect(paraSql(predicadoDeSituacao(["SEM_DICA", "SEM_DICA"]))).toBe(
      paraSql(predicadoDeSituacao(["SEM_DICA"])),
    );
  });
});

describe("saneamento do que chega na query string", () => {
  it("situação fora do contrato é DESCARTADA, nunca vira consulta", () => {
    expect(situacoesValidas(["COM_DICA", "QUALQUER_COISA"])).toEqual(["COM_DICA"]);
    expect(situacoesValidas(undefined)).toEqual([]);
    expect(situacoesValidas(["nada disso"])).toEqual([]);
  });

  it("id de documento sem forma de UUID é descartado: o `IN` derrubaria a consulta no cast", () => {
    const bom = "11111111-1111-4111-8111-111111111111";
    expect(documentosValidos([bom, "RG", "1 or 1=1"])).toEqual([bom]);
    expect(documentosValidos([bom, bom])).toEqual([bom]);
    expect(documentosValidos(undefined)).toEqual([]);
  });
});

/**
 * A CONSULTA MONTADA, e o que se cobra dela: o `ON` do join intacto, o `where` recebendo o recorte
 * e, sem filtro nenhum, NENHUM predicado a mais do que já existia antes desta OST.
 */
function makeDbEspiao(linhas: unknown[] = []) {
  const visto = { on: null as string | null, where: null as string | null };
  const db = {
    select: () => ({
      from: () => ({
        leftJoin: (_tabela: unknown, on: unknown) => {
          visto.on = paraSql(on);
          return {
            where: (w: unknown) => {
              visto.where = paraSql(w);
              return { orderBy: () => Promise.resolve(linhas) };
            },
          };
        },
        where: (w: unknown) => {
          visto.where = paraSql(w);
          return { orderBy: () => Promise.resolve(linhas) };
        },
      }),
    }),
  };
  return { db, visto };
}

describe("a consulta da lista", () => {
  it("o ON do leftJoin continua sendo SÓ a igualdade das chaves (nada de `ativo` ali)", async () => {
    const { db, visto } = makeDbEspiao();
    await new DicasDocumentoService(db as never).list();
    expect(visto.on).toContain("tipo_documento_id");
    expect(visto.on).not.toContain("ativo");
  });

  /**
   * ══ ESTE TESTE NÃO MORDIA, E ERA A ÚNICA COISA QUE ELE EXISTIA PARA FAZER (achado S30) ══════
   *
   * A versão anterior comparava `list()` com `list({})` e proibia `is null` / `is not null`. Ela
   * NÃO proibia o `false`, e é justamente ali que a régua quebra: trocar o `> 0` de
   * `pediuFiltroSemValorValido` por `>= 0` faz "não pediu filtro" virar "pediu e nada casou", o
   * `sql\`false\`` entra no `where` das DUAS chamadas, elas continuam IDÊNTICAS entre si, nenhum
   * `is null` aparece, e o teste passava enquanto a tela devolvia lista VAZIA para todo mundo.
   *
   * O CONSERTO É AFIRMAR A CONSULTA, e não só a igualdade entre duas chamadas: duas consultas
   * igualmente erradas são iguais. Sem filtro, o `where` é o recorte de sempre, o tipo ativo, e
   * mais NADA: nem impossibilidade, nem `IN`, nem pergunta sobre o NULL da dica.
   */
  it("SEM FILTRO, o `where` é só o recorte de sempre (tipo ativo): a tela não mudou", async () => {
    const { db, visto } = makeDbEspiao();
    await new DicasDocumentoService(db as never).list();
    const semFiltro = visto.where;
    await new DicasDocumentoService(db as never).list({});
    expect(visto.where).toBe(semFiltro);

    // O RECORTE DE SEMPRE ESTÁ LÁ, e com o parâmetro certo: `ativo = true`.
    expect(semFiltro).toContain("ativo");
    expect(semFiltro).toContain("params=[true]");
    // E NADA MAIS. O `false` é a impossibilidade dita ao banco, e ela NÃO pode nascer de quem não
    // filtrou: é ele que a régua de saneamento produz quando "pediu e nada casou".
    expect(
      semFiltro,
      "sem filtro, a consulta não pode carregar impossibilidade: a lista viria vazia para todos",
    ).not.toContain("false");
    // Nenhuma menção ao NULL da dica: não há recorte de situação quando não se pediu nenhum.
    expect(semFiltro).not.toContain("is null");
    expect(semFiltro).not.toContain("is not null");
    expect(semFiltro).not.toContain(" in ");
  });

  it("SEM_DICA entra no `where` como ausência, e o tipo sem dica continua podendo voltar", async () => {
    const { db, visto } = makeDbEspiao();
    await new DicasDocumentoService(db as never).list({ situacoes: ["SEM_DICA"] });
    expect(visto.where).toContain("is null");
    // A prova de que não virou inner join: o ON continua limpo na MESMA chamada.
    expect(visto.on).not.toContain("ativo");
  });

  /**
   * ══ ESTE TESTE INVERTEU DE PROPÓSITO (achado S25) ════════════════════════════════════════════
   *
   * A versão anterior cobrava que o filtro "SUMISSE" quando nenhum id fosse válido, e a segunda
   * metade do nome dela dizia isso em voz alta: `?documentos=abc` devolvia A LISTA INTEIRA. O
   * escopo não era indevido (é o mesmo que a pessoa vê sem filtro), mas a resposta MENTIA para
   * quem filtrou (§A.28): ela não era o resultado da pergunta feita.
   *
   * O QUE NÃO MUDOU, e é a metade delicada: "não pediu filtro" continua sendo "tudo". A prova
   * disso é o teste `SEM FILTRO...` logo acima, que compara a consulta com a de antes desta OST.
   */
  it("DOCUMENTO vira `IN` (§A.28), e pedido sem NENHUM id válido devolve VAZIO", async () => {
    const { db, visto } = makeDbEspiao();
    const a = "11111111-1111-4111-8111-111111111111";
    const b = "22222222-2222-4222-8222-222222222222";
    await new DicasDocumentoService(db as never).list({ documentos: [a, b] });
    expect(visto.where).toContain(" in ");

    await new DicasDocumentoService(db as never).list({ documentos: ["lixo"] });
    expect(visto.where).not.toContain(" in ");
    // Zero linhas, dito ao banco: filtrar por algo que não existe não pode devolver tudo.
    expect(visto.where).toContain("false");
  });

  it("SITUAÇÃO fora do contrato também devolve VAZIO, e não a lista inteira", async () => {
    const { db, visto } = makeDbEspiao();
    await new DicasDocumentoService(db as never).list({ situacoes: ["NAO_EXISTE"] });
    expect(visto.where).toContain("false");
  });

  it("um filtro válido ao lado de um inválido continua VAZIO: o E não perdoa o inválido", async () => {
    const { db, visto } = makeDbEspiao();
    await new DicasDocumentoService(db as never).list({
      situacoes: ["SEM_DICA"],
      documentos: ["lixo"],
    });
    expect(visto.where).toContain("false");
  });

  it("a régua pura: só é vazio quando PEDIU e nada sobrou do saneamento", () => {
    // Não pediu: continua sendo "tudo", e é esta linha que separa os dois casos.
    expect(pediuFiltroSemValorValido(undefined, [])).toBe(false);
    expect(pediuFiltroSemValorValido([], [])).toBe(false);
    // Pediu e nada casou.
    expect(pediuFiltroSemValorValido(["abc"], [])).toBe(true);
    // Pediu e algo casou: o recorte normal.
    expect(pediuFiltroSemValorValido(["abc", "ok"], ["ok"])).toBe(false);
  });

  it("os DOIS filtros se somam (E), cada um sendo um OU por dentro", async () => {
    const { db, visto } = makeDbEspiao();
    await new DicasDocumentoService(db as never).list({
      situacoes: ["SEM_DICA", "DICA_INATIVA"],
      documentos: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(visto.where).toContain(" and ");
    expect(visto.where).toContain(" or ");
    expect(visto.where).toContain(" in ");
  });
});

describe("o catálogo dos filtros (§A.37, do ENDPOINT e não das linhas)", () => {
  it("SITUAÇÃO é fixa nas três, inclusive quando ninguém está naquele estado", async () => {
    const { db } = makeDbEspiao([]);
    const cat = await new DicasDocumentoService(db as never).catalogoDeFiltros();
    expect(cat.situacoes.map((s) => s.valor)).toEqual(["COM_DICA", "SEM_DICA", "DICA_INATIVA"]);
    // Title case (§A.24), sem travessão (§A.11).
    expect(cat.situacoes.map((s) => s.rotulo)).toEqual(["Com Dica", "Sem Dica", "Dica Inativa"]);
    for (const s of cat.situacoes) expect(s.rotulo).not.toContain("—");
  });

  it("DOCUMENTO sai dos tipos ATIVOS, o MESMO recorte da lista (catálogo e tela não divergem)", async () => {
    const { db, visto } = makeDbEspiao([
      { id: "t1", nome: "Carteira De Trabalho" },
      { id: "t2", nome: "RG" },
    ]);
    const cat = await new DicasDocumentoService(db as never).catalogoDeFiltros();
    expect(cat.documentos).toEqual([
      { valor: "t1", rotulo: "Carteira De Trabalho" },
      { valor: "t2", rotulo: "RG" },
    ]);
    // O recorte é o mesmo da lista: tipo inativo não é oferecido, porque nunca traria linha.
    expect(visto.where).toContain("ativo");
  });
});
