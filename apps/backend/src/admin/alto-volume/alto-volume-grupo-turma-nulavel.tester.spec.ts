import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { AltoVolumeVinculosService } from "./alto-volume-vinculos.service";
import { admissaoProjeto } from "../../db/schema";

/**
 * COBERTURA INDEPENDENTE (§A.38) — A TURMA (grupoId) CONTINUA NULÁVEL AO CRIAR/LIBERAR VÍNCULO.
 *
 * Escrita a partir do REQUISITO: remover o quadro "Grupos De Entrada" (a turma por data) NÃO pode
 * tornar a turma obrigatória. Criar/liberar um vínculo SEM turma tem de gravar `grupoId = null`, sem
 * erro. `grupo_id` nulo é a cota do projeto inteiro — o caso normal — e não um estado de exceção.
 *
 * O ponto que o requisito protege mora em `exigirGrupoDoProjeto`: para turma nula a validação RETORNA
 * cedo (não exige que a turma exista), então vincular sem turma nunca bate em "Grupo de entrada não
 * encontrado". Se alguém, ao tirar a seção, passar a exigir turma, estes testes quebram.
 */

const USER: AuthUser = {
  id: "user-3",
  email: "gerencial@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};

const PROJETO = "22222222-2222-4222-8222-222222222222";

type Row = Record<string, unknown>;

/**
 * Banco falso mínimo para os caminhos de escrita de vínculo. Captura a tabela e os valores de cada
 * insert (o requisito é sobre o `grupoId` gravado). A consulta de turma NÃO deve ser nem alcançada
 * quando a turma é nula, e o fake registra se foi, para o teste poder afirmar isso.
 */
function montar(opts: { admissoes?: Record<string, Row> } = {}) {
  const inserts: { tabela: unknown; valores: unknown }[] = [];
  const admissoesBase: Record<string, Row> = opts.admissoes ?? {
    "a-1": { id: "a-1", codCliente: "100", farolGlobal: "EM_ADMISSAO" },
    "a-2": { id: "a-2", codCliente: "100", farolGlobal: "EM_ADMISSAO" },
  };
  const grupoFindFirst = vi.fn(async () => null);

  const db = {
    query: {
      projetosAltoVolume: {
        findFirst: vi.fn(async () => ({ id: PROJETO, codCliente: "100", ativo: true })),
      },
      admissoes: {
        findFirst: vi.fn(async () => {
          // O fake não interpreta o `where`; devolve pela ordem pedida nos testes via um ponteiro.
          return pendente.shift() ?? null;
        }),
      },
      admissaoProjeto: {
        findFirst: vi.fn(async () => null), // nenhum vínculo prévio
      },
      projetoGrupoEntrada: {
        findFirst: grupoFindFirst, // só deve ser chamado quando a turma vem preenchida
      },
    },
    insert: vi.fn((tabela: unknown) => ({
      values: (valores: unknown) => {
        inserts.push({ tabela, valores });
        return { returning: async () => (Array.isArray(valores) ? valores : [{ id: "novo", ...(valores as Row) }]) };
      },
    })),
  };

  // Fila de admissões que o `findFirst` por id vai devolvendo, na ordem em que o serviço as pede.
  const pendente: Row[] = [];
  const enfileirar = (...ids: string[]) => {
    for (const id of ids) pendente.push(admissoesBase[id]);
  };

  return {
    inserts,
    grupoFindFirst,
    enfileirar,
    service: new AltoVolumeVinculosService(db as never),
  };
}

describe("vincular por correção: turma nula é o caso normal", () => {
  it("vincular SEM grupoId grava grupoId=null em admissao_projeto, sem erro", async () => {
    const ctx = montar();
    ctx.enfileirar("a-1");

    const row = await ctx.service.vincular(PROJETO, { admissaoId: "a-1" }, USER);

    expect(ctx.inserts).toHaveLength(1);
    expect(ctx.inserts[0].tabela).toBe(admissaoProjeto);
    expect((ctx.inserts[0].valores as Row).grupoId).toBeNull();
    expect((row as Row).grupoId).toBeNull();
  });

  it("com turma nula a validação de turma NÃO é nem consultada (retorna cedo)", async () => {
    const ctx = montar();
    ctx.enfileirar("a-1");

    await ctx.service.vincular(PROJETO, { admissaoId: "a-1", grupoId: undefined }, USER);

    expect(ctx.grupoFindFirst).not.toHaveBeenCalled();
  });
});

describe("vincular em lote: turma nula para a leva inteira", () => {
  it("vincularEmLote SEM grupoId grava todas com grupoId=null, sem erro", async () => {
    const ctx = montar();
    ctx.enfileirar("a-1", "a-2");

    const r = await ctx.service.vincularEmLote(PROJETO, { admissaoIds: ["a-1", "a-2"] }, USER);

    expect(r.adicionadas).toBe(2);
    expect(r.falhas).toHaveLength(0);
    expect(ctx.inserts).toHaveLength(1);
    const valores = ctx.inserts[0].valores as Row[];
    expect(valores).toHaveLength(2);
    for (const v of valores) expect(v.grupoId).toBeNull();
  });

  it("o lote sem turma não consulta a tabela de turma", async () => {
    const ctx = montar();
    ctx.enfileirar("a-1", "a-2");
    await ctx.service.vincularEmLote(PROJETO, { admissaoIds: ["a-1", "a-2"] }, USER);
    expect(ctx.grupoFindFirst).not.toHaveBeenCalled();
  });
});
