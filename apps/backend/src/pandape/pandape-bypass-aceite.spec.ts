import { ConflictException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "../admissoes/admissoes.service";
import type { CreateAdmissaoDto } from "../admissoes/dto/create-admissao.dto";

/**
 * QA do contrato que a sync Pandapé depende (DoD §2 / regra 5 — não-bloqueio para origem sistema):
 * `AdmissoesService.create(dto, user?, { bypassAceite: true })` cria a admissão com os obrigatórios
 * vazios SEM lançar ConflictException(needsAceite). O guard W6 só barra o caminho MANUAL sem aceite.
 *
 * O banco é mockado: o foco é o guard de aceite (que roda ANTES da transação) e a chegada à
 * transação quando o bypass está ligado. CPF válido (52998224725) para passar pela validação F3.
 */

const CPF_VALIDO = "52998224725";

/** dto com TODOS os obrigatórios da W6 vazios (salário, escala, benefícios, contrato, etc.). */
function dtoVazio(): CreateAdmissaoDto {
  return {
    codCliente: "C-10",
    cargoId: "11111111-1111-1111-1111-111111111111",
    candidato: { cpf: CPF_VALIDO, nome: "Fulano de Tal" },
  };
}

/** tx mock: cliente/cargo existem, régua vazia → cria admissão e devolve o id. */
function makeTx() {
  const insertBuilder = {
    values: vi.fn(() => insertBuilder),
    onConflictDoNothing: vi.fn(() => Promise.resolve(undefined)),
    returning: vi.fn(() => Promise.resolve([{ id: "adm-nova" }])),
    then: (res: (v: unknown) => unknown) => res(undefined), // awaitable p/ inserts sem returning
  };
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => Promise.resolve([])), // régua vazia
  };
  return {
    query: {
      clientes: { findFirst: vi.fn().mockResolvedValue({ codCliente: "C-10" }) },
      cargos: { findFirst: vi.fn().mockResolvedValue({ id: "cargo-1" }) },
    },
    insert: vi.fn(() => insertBuilder),
    select: vi.fn(() => selectBuilder),
  };
}

function makeDb() {
  const tx = makeTx();
  const transaction = vi.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(tx));
  return { db: { transaction } as never, transaction, tx };
}

afterEach(() => vi.restoreAllMocks());

describe("AdmissoesService.create — bypassAceite (DoD §2 / regra 5 não-bloqueio)", () => {
  it("MANUAL sem aceite + obrigatórios vazios → ConflictException(needsAceite) (controle)", async () => {
    const { db, transaction } = makeDb();
    const svc = new AdmissoesService(db);

    await expect(svc.create(dtoVazio())).rejects.toBeInstanceOf(ConflictException);
    // o guard barra ANTES de abrir a transação.
    expect(transaction).not.toHaveBeenCalled();

    // confirma o shape do erro (needsAceite + campos pendentes).
    await svc.create(dtoVazio()).catch((err: ConflictException) => {
      const body = err.getResponse() as { needsAceite?: boolean; camposPendentes?: string[] };
      expect(body.needsAceite).toBe(true);
      expect(body.camposPendentes).toEqual(expect.arrayContaining(["Salário", "Tipo de contrato"]));
    });
  });

  it("origem sistema (bypassAceite:true) + obrigatórios vazios → CRIA sem lançar needsAceite", async () => {
    const { db, transaction } = makeDb();
    const svc = new AdmissoesService(db);

    const res = await svc.create(dtoVazio(), undefined, {
      origem: "PANDAPE",
      bypassAceite: true,
      pandape: { idPrecollaborator: "PC-1" },
    });

    expect(res).toMatchObject({ admissaoId: "adm-nova" });
    expect(transaction).toHaveBeenCalledTimes(1); // passou do guard → abriu a transação
  });

  it("MANUAL COM aceitePendencias:true também cria (paridade do caminho humano)", async () => {
    const { db, transaction } = makeDb();
    const svc = new AdmissoesService(db);

    const res = await svc.create({ ...dtoVazio(), aceitePendencias: true });

    expect(res).toMatchObject({ admissaoId: "adm-nova" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("bypassAceite com a linha de IntegraçãoPandapé anexada na MESMA transação (idPrecollaborator)", async () => {
    const { db, tx } = makeDb();
    const svc = new AdmissoesService(db);

    await svc.create(dtoVazio(), undefined, {
      origem: "PANDAPE",
      bypassAceite: true,
      pandape: { idPrecollaborator: "PC-77", idMatch: "M-1", idVacancy: "V-1", etapa: "EXAME" },
    });

    // alguma chamada de insert recebeu os IDs do Pandapé (anexo da integração).
    const valuesCalls = tx.insert.mock.results
      .flatMap((r) => (r.value as { values: ReturnType<typeof vi.fn> }).values.mock.calls)
      .flat();
    const anexo = valuesCalls.find(
      (v) => (v as { idPrecollaborator?: string }).idPrecollaborator === "PC-77",
    ) as { idMatch?: string; idVacancy?: string; etapa?: string } | undefined;
    expect(anexo).toBeDefined();
    expect(anexo).toMatchObject({ idMatch: "M-1", idVacancy: "V-1", etapa: "EXAME" });
  });
});
