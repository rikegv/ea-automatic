import "reflect-metadata";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * ITEM 3 DA OST DOS 3 AJUSTES — CPF duplicado na LIBERAÇÃO INDIVIDUAL.
 *
 * O QUE ESTAVA ACONTECENDO, e é o que estes testes impedem de voltar: o LOTE recusava duplicata
 * desde sempre, lendo a coluna `possivel_duplicata`, mas a liberação INDIVIDUAL não tinha trava
 * nenhuma. Validava dígito do CPF, farol e uniforme, e liberava. A tela mostrava a tag amarela
 * "Possível duplicata" e o botão funcionava do mesmo jeito.
 *
 * A CONTA É AO VIVO, e não pela coluna, porque a coluna é uma foto tirada na entrada do Pandapé:
 * pré-admissão de outra origem nunca recebe a marca, e duplicata que nasce depois deixa a marca em
 * `false` para sempre.
 */

const MASTER: AuthUser = {
  id: "user-1",
  email: "master@ea.local",
  papel: "MASTER",
  senhaTemporaria: false,
};
const CPF_OK = "52998224725";
const CARGO = "11111111-1111-4111-8111-111111111111";
const DTO = { codCliente: "100", cargoId: CARGO, uniforme: { possui: false } };

/**
 * Fake do Drizzle para o caminho da liberação. `vivas` são as OUTRAS admissões vivas do mesmo CPF,
 * que é o que a trava consulta (a consulta com leftJoin em cliente e cargo).
 */
function montar(vivas: Record<string, unknown>[]) {
  const transacoes = { n: 0 };
  const tx = {
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
    insert: vi.fn(() => ({ values: async () => undefined })),
    select: vi.fn(() => ({ from: () => ({ where: async () => [] }) })),
  };
  const db = {
    query: {
      admissoes: {
        findFirst: async () => ({
          id: "a1",
          candidatoCpf: CPF_OK,
          farolGlobal: "AGUARDANDO_LIBERACAO",
          isBanco: false,
          possivelDuplicata: false,
          tipoContrato: null,
          dataAdmissao: null,
        }),
      },
      clientes: { findFirst: async () => ({ codCliente: "100" }) },
      cargos: { findFirst: async () => ({ id: CARGO }) },
      candidatos: { findFirst: async () => ({ nome: "Fulano", cpf: CPF_OK }) },
      integracaoPandape: { findFirst: async () => null },
      beneficiosCatalogo: { findMany: async () => [] },
    },
    // Sem join = régua do par (vazia). Com leftJoin = a trava de duplicidade.
    select: vi.fn(() => ({
      from: () => {
        const comJoin: { leftJoin: () => typeof comJoin; where: () => Promise<unknown[]> } = {
          leftJoin: () => comJoin,
          where: async () => vivas,
        };
        return { ...comJoin, where: async () => [] };
      },
    })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
      transacoes.n += 1;
      return fn(tx);
    },
  };
  return { service: new AdmissoesService(db as never), transacoes };
}

const VIVA = {
  clienteRazao: "Cliente Um Ltda",
  clienteOperacao: "Operação Norte",
  cargoNome: "Auxiliar de Limpeza",
  farolGlobal: "EM_ADMISSAO",
};

describe("liberação individual: trava de CPF duplicado (item 3)", () => {
  it("CPF sem outra admissão viva: libera normalmente, como sempre liberou", async () => {
    const { service, transacoes } = montar([]);

    const r = await service.liberar("a1", DTO, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("CPF com admissão viva: BARRA com 409 e pede confirmação, sem gravar nada", async () => {
    const { service, transacoes } = montar([VIVA]);

    const err = await service.liberar("a1", DTO, MASTER).catch((e: Error) => e);

    expect(err).toBeInstanceOf(ConflictException);
    // A admissão NÃO nasce: a trava roda antes de qualquer escrita.
    expect(transacoes.n).toBe(0);
  });

  it("o 409 traz o CONTEXTO para o consultor decidir, e nunca o CPF (§A.6)", async () => {
    const { service } = montar([VIVA]);

    const err = (await service
      .liberar("a1", DTO, MASTER)
      .catch((e: ConflictException) => e)) as ConflictException;
    const corpo = err.getResponse() as {
      needsConfirmation: boolean;
      reason: string;
      vivas: { cliente: string; cargo: string; situacao: string }[];
      message: string;
    };

    expect(corpo.needsConfirmation).toBe(true);
    expect(corpo.reason).toBe("cpfDuplicado");
    expect(corpo.vivas).toEqual([
      { cliente: "Operação Norte", cargo: "Auxiliar de Limpeza", situacao: "EM_ADMISSAO" },
    ]);
    expect(JSON.stringify(corpo)).not.toContain(CPF_OK);
  });

  it("com o ACEITE do consultor, a mesma liberação passa (candidato pode ter N admissões)", async () => {
    const { service, transacoes } = montar([VIVA]);

    const r = await service.liberar("a1", { ...DTO, aceiteDuplicidade: true }, MASTER);

    expect(r.admissaoId).toBe("a1");
    expect(transacoes.n).toBe(1);
  });

  it("duas admissões vivas: a mensagem diz quantas são, e as duas vão na lista", async () => {
    const { service } = montar([VIVA, { ...VIVA, clienteOperacao: "Operação Sul" }]);

    const err = (await service
      .liberar("a1", DTO, MASTER)
      .catch((e: ConflictException) => e)) as ConflictException;
    const corpo = err.getResponse() as { vivas: unknown[]; message: string };

    expect(corpo.vivas).toHaveLength(2);
    expect(corpo.message).toContain("2 admissões em andamento");
  });

  it("cliente ou cargo ausentes viram 'não informado', nunca travessão (§A.11)", async () => {
    const { service } = montar([
      { clienteRazao: null, clienteOperacao: null, cargoNome: null, farolGlobal: "BANCO_AGUARDAR" },
    ]);

    const err = (await service
      .liberar("a1", DTO, MASTER)
      .catch((e: ConflictException) => e)) as ConflictException;
    const corpo = err.getResponse() as { vivas: { cliente: string; cargo: string }[] };

    expect(corpo.vivas[0]).toEqual({
      cliente: "não informado",
      cargo: "não informado",
      situacao: "BANCO_AGUARDAR",
    });
  });
});
