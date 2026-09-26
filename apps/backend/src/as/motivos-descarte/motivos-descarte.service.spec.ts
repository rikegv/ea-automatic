import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { motivosDescarte } from "../../db/schema";
import { MotivosDescarteService, motivosDeDescarteAtivos } from "./motivos-descarte.service";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE DESCARTE: SOFT-DELETE, 409 DE NOME E NADA DE EXCLUSÃO FÍSICA ────────
 *
 * O QUE ESTES TESTES PROTEGEM, e por que não é zelo de catálogo: é o NOME daqui que fica GRAVADO em
 * `as_candidaturas.motivo_descarte` (a candidatura não guarda o id, guarda o texto, como a vaga já
 * faz com o motivo de cancelamento). Então duas coisas passam a ter consequência fora desta tabela:
 *   . APAGAR de verdade uma linha que já foi usada tiraria da administração o motivo que a ficha de
 *     uma pessoa descartada continua exibindo, e ninguém conseguiria reativá-lo nem renomeá-lo.
 *   . DOIS MOTIVOS HOMÔNIMOS tornariam a leitura ambígua na candidatura, e não só no cadastro.
 *
 * O BANCO É FINGIDO e a memória é uma lista: o que se afirma aqui é a régua do service (o que ele
 * recusa, o que ele grava), e não o SQL, que é do Drizzle.
 */
/**
 * QUAL COLUNA A CLÁUSULA COMPARA, lida do `queryChunks` do Drizzle (o primeiro pedaço de um `eq` é a
 * própria coluna).
 *
 * NÃO SE VARRE A ÁRVORE À PROCURA DO NOME, pelo mesmo motivo medido no fake irmão do cancelamento: a
 * coluna aponta para a TABELA, que aponta para TODAS as outras colunas, então uma varredura por nome
 * encontra "ativo" dentro de uma cláusula que compara "nome", e o fake passa a filtrar o que a
 * consulta não filtrou.
 */
function colunaComparada(cond: unknown): string | null {
  const chunks = (cond as { queryChunks?: unknown[] } | null)?.queryChunks ?? [];
  for (const chunk of chunks) {
    const nome = (chunk as { name?: unknown } | null)?.name;
    if (typeof nome === "string") return nome;
  }
  return null;
}

function makeDb(linhas: { id: string; nome: string; ativo: boolean }[]) {
  const escritas: { tabela: unknown; valores: Record<string, unknown> }[] = [];
  const deletes: unknown[] = [];

  const select = vi.fn(() => {
    const b: Record<string, unknown> = {};
    let filtro: (l: (typeof linhas)[number]) => boolean = () => true;
    b.from = () => b;
    b.where = (cond: unknown) => {
      if (colunaComparada(cond) === "ativo") filtro = (l) => l.ativo;
      return b;
    };
    b.limit = () => Promise.resolve(linhas.filter(filtro));
    b.orderBy = () => Promise.resolve(linhas.filter(filtro));
    b.then = (r: (v: unknown) => unknown) => Promise.resolve(linhas.filter(filtro)).then(r);
    return b;
  });

  const db = {
    select,
    insert: (tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => ({
        returning: async () => {
          escritas.push({ tabela, valores });
          const row = { id: `novo-${linhas.length + 1}`, ativo: true, ...valores };
          linhas.push(row as (typeof linhas)[number]);
          return [row];
        },
      }),
    }),
    update: (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            escritas.push({ tabela, valores });
            const alvo = linhas[0];
            if (!alvo) return [];
            Object.assign(alvo, valores);
            return [{ id: alvo.id, nome: alvo.nome, ativo: alvo.ativo }];
          },
        }),
      }),
    }),
    delete: (tabela: unknown) => {
      deletes.push(tabela);
      return { where: async () => undefined };
    },
  };

  return { service: new MotivosDescarteService(db as never), db, escritas, deletes, linhas };
}

describe("o nome é único, e a colisão é 409 com frase, nunca 500 do driver", () => {
  it("recusa criar um motivo com nome que já existe", async () => {
    const { service, escritas } = makeDb([{ id: "m-1", nome: "Reprovado", ativo: true }]);

    await expect(service.criar({ nome: "Reprovado" })).rejects.toBeInstanceOf(ConflictException);
    expect(escritas).toHaveLength(0);
  });

  /**
   * O CASO QUE CONFUNDE QUEM ESTÁ CADASTRANDO: o nome "não aparece" na tela porque foi INATIVADO, e
   * criar outro igual esbarra num unique que ele não enxerga. A frase precisa dizer o caminho.
   */
  it("o motivo já existente e INATIVO devolve a frase que manda REATIVAR", async () => {
    const { service } = makeDb([{ id: "m-1", nome: "Stand By", ativo: false }]);

    const erro = await service.criar({ nome: "Stand By" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String((erro as ConflictException).message)).toMatch(/reative/i);
  });

  it("cria quando o nome é novo", async () => {
    const { service, escritas } = makeDb([]);

    const row = await service.criar({ nome: "Sem Perfil" });
    expect(row.nome).toBe("Sem Perfil");
    expect(escritas).toHaveLength(1);
  });
});

describe("inativar é soft-delete, e reativar é o caminho de volta", () => {
  it("inativar grava `ativo: false` e NÃO apaga linha nenhuma", async () => {
    const { service, escritas, deletes } = makeDb([{ id: "m-1", nome: "Faltante", ativo: true }]);

    const row = await service.inativar("m-1");
    expect(row.ativo).toBe(false);
    expect(escritas[0]?.tabela).toBe(motivosDescarte);
    expect(escritas[0]?.valores).toMatchObject({ ativo: false });
    // NENHUM `delete` em nenhum caminho: a candidatura descartada guarda o NOME, e apagar a linha
    // tiraria da administração o motivo que a ficha dela continua exibindo.
    expect(deletes).toHaveLength(0);
  });

  it("reativar grava `ativo: true`, com o mesmo nome", async () => {
    const { service, linhas } = makeDb([{ id: "m-1", nome: "Faltante", ativo: false }]);

    const row = await service.reativar("m-1");
    expect(row.ativo).toBe(true);
    expect(linhas[0]?.nome).toBe("Faltante");
  });

  it("o id que não existe é 404, e não um sucesso silencioso", async () => {
    const { service } = makeDb([]);
    await expect(service.inativar("m-x")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("a leitura do seletor do desfecho só enxerga o que está em circulação", () => {
  it("`listarAtivos` recorta pelo `ativo`, e `list` devolve tudo", async () => {
    const { service } = makeDb([
      { id: "m-1", nome: "Reprovado", ativo: true },
      { id: "m-2", nome: "Motivo aposentado", ativo: false },
    ]);

    expect((await service.listarAtivos()).map((m) => m.id)).toEqual(["m-1"]);
    expect((await service.list()).map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });

  /**
   * A FUNÇÃO DE MÓDULO E O MÉTODO SÃO A MESMA CONSULTA, e esta é a asserção que impede o defeito
   * clássico do par: a tela oferecendo o que a rota recusa. `registrarSaida` chama a função;
   * `listarAtivos` enche o seletor. No dia em que uma das duas ganhar um filtro que a outra não
   * tiver, este teste cai.
   */
  it("`motivosDeDescarteAtivos` devolve exatamente o que `listarAtivos` devolve", async () => {
    const { service, db } = makeDb([
      { id: "m-1", nome: "Reprovado", ativo: true },
      { id: "m-2", nome: "Motivo aposentado", ativo: false },
    ]);

    expect(await motivosDeDescarteAtivos(db as never)).toEqual(await service.listarAtivos());
  });
});
