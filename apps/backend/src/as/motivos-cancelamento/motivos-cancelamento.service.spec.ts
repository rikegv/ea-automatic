import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { motivosCancelamentoVaga } from "../../db/schema";
import { MotivosCancelamentoVagaService } from "./motivos-cancelamento.service";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE CANCELAMENTO: SOFT-DELETE, 409 DE NOME E NADA DE EXCLUSÃO FÍSICA ────
 *
 * O QUE ESTES TESTES PROTEGEM, e por que não é zelo de catálogo: é o NOME daqui que fica GRAVADO na
 * vaga cancelada (a vaga não guarda o id, guarda o texto, como já faz com o motivo de contratação).
 * Então duas coisas passam a ter consequência fora desta tabela:
 *   . APAGAR de verdade uma linha que já foi usada tiraria da administração o motivo que a trilha de
 *     uma vaga cancelada continua exibindo, e ninguém conseguiria reativá-lo nem renomeá-lo.
 *   . DOIS MOTIVOS HOMÔNIMOS tornariam a leitura ambígua na vaga, e não só no cadastro.
 *
 * O BANCO É FINGIDO e a memória é uma lista: o que se afirma aqui é a régua do service (o que ele
 * recusa, o que ele grava), e não o SQL, que é do Drizzle.
 */
/**
 * QUAL COLUNA A CLÁUSULA COMPARA, lida do `queryChunks` do Drizzle (o primeiro pedaço de um `eq` é a
 * própria coluna).
 *
 * NÃO SE VARRE A ÁRVORE À PROCURA DO NOME, e a primeira tentativa provou por quê: a coluna aponta
 * para a TABELA, que aponta para TODAS as outras colunas, então uma varredura por nome encontra
 * "ativo" dentro de uma cláusula que compara "nome", e o fake passa a filtrar o que a consulta não
 * filtrou. Além de circular, a árvore responde qualquer pergunta com "sim".
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
    // O RECORTE DE `ativo` é reconhecido pela COLUNA COMPARADA na cláusula (ver a função acima).
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

  return { service: new MotivosCancelamentoVagaService(db as never), escritas, deletes, linhas };
}

describe("o nome é único, e a colisão é 409 com frase, nunca 500 do driver", () => {
  it("recusa criar um motivo com nome que já existe", async () => {
    const { service, escritas } = makeDb([{ id: "m-1", nome: "Cliente desistiu", ativo: true }]);

    await expect(service.criar({ nome: "Cliente desistiu" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(escritas).toHaveLength(0);
  });

  /**
   * O CASO QUE CONFUNDE QUEM ESTÁ CADASTRANDO: o nome "não aparece" na tela porque foi INATIVADO, e
   * criar outro igual esbarra num unique que ele não enxerga. A frase precisa dizer o caminho.
   */
  it("o motivo já existente e INATIVO devolve a frase que manda REATIVAR", async () => {
    const { service } = makeDb([{ id: "m-1", nome: "Cliente desistiu", ativo: false }]);

    const erro = await service.criar({ nome: "Cliente desistiu" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ConflictException);
    expect(String((erro as ConflictException).message)).toMatch(/reative/i);
  });

  it("cria quando o nome é novo", async () => {
    const { service, escritas } = makeDb([]);

    const row = await service.criar({ nome: "Vaga congelada" });
    expect(row.nome).toBe("Vaga congelada");
    expect(escritas).toHaveLength(1);
  });
});

describe("inativar é soft-delete, e reativar é o caminho de volta", () => {
  it("inativar grava `ativo: false` e NÃO apaga linha nenhuma", async () => {
    const { service, escritas, deletes } = makeDb([
      { id: "m-1", nome: "Cliente desistiu", ativo: true },
    ]);

    const row = await service.inativar("m-1");
    expect(row.ativo).toBe(false);
    expect(escritas[0]?.tabela).toBe(motivosCancelamentoVaga);
    expect(escritas[0]?.valores).toMatchObject({ ativo: false });
    // NENHUM `delete` em nenhum caminho: a vaga cancelada guarda o NOME, e apagar a linha tiraria
    // da administração o motivo que a trilha dela continua exibindo.
    expect(deletes).toHaveLength(0);
  });

  it("reativar grava `ativo: true`, com o mesmo nome", async () => {
    const { service, linhas } = makeDb([{ id: "m-1", nome: "Cliente desistiu", ativo: false }]);

    const row = await service.reativar("m-1");
    expect(row.ativo).toBe(true);
    expect(linhas[0]?.nome).toBe("Cliente desistiu");
  });

  it("o id que não existe é 404, e não um sucesso silencioso", async () => {
    const { service } = makeDb([]);
    await expect(service.inativar("m-x")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("a leitura da tela de cancelar só enxerga o que está em circulação", () => {
  it("`listarAtivos` recorta pelo `ativo`, e `list` devolve tudo", async () => {
    const { service } = makeDb([
      { id: "m-1", nome: "Cliente desistiu", ativo: true },
      { id: "m-2", nome: "Motivo aposentado", ativo: false },
    ]);

    expect((await service.listarAtivos()).map((m) => m.id)).toEqual(["m-1"]);
    expect((await service.list()).map((m) => m.id)).toEqual(["m-1", "m-2"]);
  });
});
