import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { DicasDocumentoService, sanitizar } from "./dicas-documento.service";
import { TETO_DA_DICA } from "./dicas-documento.dto";

/**
 * DICAS DE DOCUMENTO (menu novo). O que estes testes travam:
 *  1. a LISTA traz TODOS os tipos ativos, inclusive os que ainda NÃO têm dica (sem isso a tela de
 *     cadastro não tem como oferecer o tipo novo);
 *  2. a escrita é UPSERT por tipo ("um tipo, uma dica"), com autoria carimbada;
 *  3. inativar é LÓGICO, nunca exclusão física: o texto que alguém escreveu não se perde;
 *  4. §A.6 pelo avesso: o texto vai para a tela PÚBLICA do candidato, então ele é sanitizado na
 *     escrita e tem teto de tamanho.
 *
 * §A.6: os fixtures são sintéticos e não pertencem a ninguém.
 */

function makeDb(linhas: unknown[] = []) {
  const estado = {
    ultimoInsert: undefined as Record<string, unknown> | undefined,
    ultimoConflito: undefined as Record<string, unknown> | undefined,
    ultimoSet: undefined as Record<string, unknown> | undefined,
    deleteChamado: false,
    atualizou: linhas.length > 0,
  };
  const db = {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => ({ orderBy: () => Promise.resolve(linhas) }) }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        estado.ultimoInsert = v;
        return {
          onConflictDoUpdate: (arg: { set: Record<string, unknown> }) => {
            estado.ultimoConflito = arg.set;
            return { returning: () => Promise.resolve([{ id: "dica-1", ...v }]) };
          },
        };
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        estado.ultimoSet = v;
        return {
          where: () => ({
            returning: () => Promise.resolve(estado.atualizou ? [{ id: "dica-1" }] : []),
          }),
        };
      },
    }),
    // Presente de propósito: se alguém trocar a inativação por exclusão física, o teste pega.
    delete: () => {
      estado.deleteChamado = true;
      return { where: () => ({ returning: () => Promise.resolve([]) }) };
    },
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-1", nome: "RG" }) },
    },
  };
  return { db, estado };
}

const TIPO = "11111111-1111-4111-8111-111111111111";
const AUTOR = "22222222-2222-4222-8222-222222222222";

describe("a lista da tela de cadastro", () => {
  it("traz o tipo que AINDA NÃO tem dica, com o texto nulo", async () => {
    const { db } = makeDb([
      { tipoDocumentoId: "t1", codigo: "RG", nome: "RG", dicaId: null, texto: null, ativo: null, atualizadoEm: null },
      { tipoDocumentoId: "t2", codigo: "CPF", nome: "CPF", dicaId: "d1", texto: "Foto legível.", ativo: true, atualizadoEm: new Date() },
    ]);
    const linhas = await new DicasDocumentoService(db as never).list();
    expect(linhas).toHaveLength(2);
    expect(linhas[0].texto).toBeNull();
    expect(linhas[1].texto).toBe("Foto legível.");
    expect(typeof linhas[1].atualizadoEm).toBe("string");
  });
});

describe("a escrita: um tipo, uma dica", () => {
  it("grava carimbando o autor nos dois lados e nasce ativa", async () => {
    const { db, estado } = makeDb();
    await new DicasDocumentoService(db as never).upsert(TIPO, { texto: "Os dois lados." }, AUTOR);
    expect(estado.ultimoInsert).toMatchObject({
      tipoDocumentoId: TIPO,
      texto: "Os dois lados.",
      ativo: true,
      criadoPorId: AUTOR,
      atualizadoPorId: AUTOR,
    });
  });

  /** `criado_por_id` responde "quem escreveu isto pela primeira vez", e edição não reescreve. */
  it("na substituição, o autor original é preservado", async () => {
    const { db, estado } = makeDb();
    await new DicasDocumentoService(db as never).upsert(TIPO, { texto: "Novo texto." }, AUTOR);
    expect(estado.ultimoConflito).toMatchObject({ texto: "Novo texto.", atualizadoPorId: AUTOR });
    expect(estado.ultimoConflito).not.toHaveProperty("criadoPorId");
  });

  it("tipo inexistente é 404, e nada é gravado", async () => {
    const { db, estado } = makeDb();
    db.query.tiposDocumento.findFirst = vi.fn().mockResolvedValue(undefined);
    await expect(
      new DicasDocumentoService(db as never).upsert(TIPO, { texto: "x" }, AUTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(estado.ultimoInsert).toBeUndefined();
  });
});

describe("inativar é LÓGICO, nunca exclusão física", () => {
  it("apaga da tela do candidato sem apagar o texto", async () => {
    const { db, estado } = makeDb([{ id: "dica-1" }]);
    await expect(new DicasDocumentoService(db as never).inativar(TIPO, AUTOR)).resolves.toEqual({
      ok: true,
      ativo: false,
    });
    expect(estado.ultimoSet).toMatchObject({ ativo: false });
    expect(estado.deleteChamado).toBe(false);
  });

  it("reativar devolve a dica inteira", async () => {
    const { db, estado } = makeDb([{ id: "dica-1" }]);
    await new DicasDocumentoService(db as never).reativar(TIPO, AUTOR);
    expect(estado.ultimoSet).toMatchObject({ ativo: true });
  });

  it("tipo sem dica nenhuma é 404", async () => {
    const { db } = makeDb([]);
    await expect(
      new DicasDocumentoService(db as never).inativar(TIPO, AUTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/**
 * ══ A AUTORIA DO ATO, NOS DOIS RAMOS (achado S22 da auditoria) ════════════════════════════════
 *
 * O QUE ESTES DOIS TESTES TRAVAM NÃO É "a coluna foi escrita", É QUE A AUTORIA MUDA DE DONO. A
 * régua é sempre a MESMA data (`atualizadoEm` sempre se move) com OUTRO autor: quem age agora é
 * OUTRO e o par que a tela mostra tem de dizer isso. Um teste que só conferisse a presença da
 * coluna passaria com `atualizadoPorId` carimbado a partir de um valor fixo, ou do autor anterior,
 * que é exatamente o defeito auditado.
 *
 * `reativar` é o ramo mais pesado dos dois: é ATO DE PUBLICAÇÃO, devolve o texto à tela PÚBLICA do
 * candidato, e sem autoria não havia como responder "quem republicou isto".
 */
describe("a autoria do ato de inativar e reativar", () => {
  const OUTRO_AUTOR = "33333333-3333-4333-8333-333333333333";

  it("INATIVAR credita quem inativou, e não quem escreveu o texto", async () => {
    const { db, estado } = makeDb([{ id: "dica-1" }]);
    const service = new DicasDocumentoService(db as never);
    await service.upsert(TIPO, { texto: "Escrito pelo primeiro." }, AUTOR);
    await service.inativar(TIPO, OUTRO_AUTOR);
    expect(estado.ultimoSet).toMatchObject({ ativo: false, atualizadoPorId: OUTRO_AUTOR });
    expect(estado.ultimoSet?.atualizadoPorId).not.toBe(AUTOR);
    // A data se move JUNTO com o autor: é o par que a tela lê, e movê-la sozinha é o defeito.
    expect(estado.ultimoSet?.atualizadoEm).toBeInstanceOf(Date);
  });

  it("REATIVAR (ato de publicação) credita quem republicou", async () => {
    const { db, estado } = makeDb([{ id: "dica-1" }]);
    const service = new DicasDocumentoService(db as never);
    await service.upsert(TIPO, { texto: "Escrito pelo primeiro." }, AUTOR);
    await service.reativar(TIPO, OUTRO_AUTOR);
    expect(estado.ultimoSet).toMatchObject({ ativo: true, atualizadoPorId: OUTRO_AUTOR });
    expect(estado.ultimoSet?.atualizadoPorId).not.toBe(AUTOR);
    expect(estado.ultimoSet?.atualizadoEm).toBeInstanceOf(Date);
  });
});

describe("§A.6 pelo avesso: o texto vai para a tela PÚBLICA do candidato", () => {
  it("apara, normaliza a quebra de linha e mantém o parágrafo", () => {
    expect(sanitizar("  Foto   legível.\r\n\r\n\r\nSem corte.  ")).toBe(
      "Foto legível.\n\nSem corte.",
    );
  });

  it("tira caractere de controle, que não se vê e serve para esconder coisa", () => {
    expect(sanitizar("Foto\u0000 legível\u0007.")).toBe("Foto legível.");
  });

  /** Recusar é melhor que remover em silêncio: quem salva tem de ver o texto que gravou. */
  it("RECUSA marcação, em vez de limpá-la escondido", () => {
    expect(() => sanitizar("Foto <script>alert(1)</script>")).toThrow(BadRequestException);
    expect(() => sanitizar("Use o modelo <anexo>")).toThrow(BadRequestException);
  });

  it("recusa o vazio disfarçado de espaço", () => {
    expect(() => sanitizar("   \n  ")).toThrow(BadRequestException);
  });

  it("recusa o texto acima do teto, que é o mesmo da coluna", () => {
    expect(() => sanitizar("a".repeat(TETO_DA_DICA + 1))).toThrow(BadRequestException);
    expect(sanitizar("a".repeat(TETO_DA_DICA))).toHaveLength(TETO_DA_DICA);
  });

  it("o serviço grava o texto JÁ sanitizado, e não o que chegou", async () => {
    const { db, estado } = makeDb();
    await new DicasDocumentoService(db as never).upsert(
      TIPO,
      { texto: "  Foto\u0000   legível.  " },
      AUTOR,
    );
    expect(estado.ultimoInsert?.texto).toBe("Foto legível.");
  });
});
