import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import type { CreateAdmissaoDto } from "./dto/create-admissao.dto";

/**
 * Regra nova (autorizada pelo diretor): a Data de nascimento virou BLOQUEANTE na criação HUMANA
 * (wizard "+ Nova Admissão"). O Portal do Candidato identifica por CPF mais data de nascimento, então
 * sem ela a admissão nasceria sem o candidato poder entrar no Portal.
 *
 * O guard mora em `AdmissoesService.create`, logo após a validação de CPF e ANTES da transação:
 *   if (!opts?.bypassAceite && !dto.candidato.dataNascimento) throw BadRequestException(...)
 *
 * Consequências medidas aqui:
 * (a) MANUAL sem data           → BadRequestException (não abre transação).
 * (b) MANUAL sem data + aceite  → AINDA BadRequestException (o aceite NÃO contorna o bloqueio duro).
 * (c) bypassAceite sem data     → cria normalmente (Pandapé de/para resolvido, intocado).
 *
 * O banco é mockado: o foco é o guard, que roda antes da transação. CPF válido (52998224725) para
 * passar pela validação F3.
 */

const CPF_VALIDO = "52998224725";
const NASCIMENTO_VALIDO = "1990-01-01";

/** dto mínimo, SEM data de nascimento (candidato só com CPF e nome). */
function dtoSemNascimento(): CreateAdmissaoDto {
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
    then: (res: (v: unknown) => unknown) => res(undefined),
  };
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => Promise.resolve([])),
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
  const selectBuilder = {
    from: vi.fn(() => selectBuilder),
    where: vi.fn(() => Promise.resolve([])),
  };
  const select = vi.fn(() => selectBuilder);
  return { db: { transaction, select } as never, transaction, tx };
}

afterEach(() => vi.restoreAllMocks());

describe("AdmissoesService.create — Data de nascimento bloqueante no caminho humano", () => {
  it("(a) MANUAL sem dataNascimento → BadRequestException e NÃO abre transação", async () => {
    const { db, transaction } = makeDb();
    const svc = new AdmissoesService(db);

    await expect(svc.create(dtoSemNascimento())).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();

    await svc.create(dtoSemNascimento()).catch((err: BadRequestException) => {
      expect(err.message).toBe(
        "Informe a data de nascimento do candidato para criar a admissão.",
      );
    });
  });

  it("(b) MANUAL sem dataNascimento + aceitePendencias:true → AINDA BadRequestException (aceite não contorna)", async () => {
    const { db, transaction } = makeDb();
    const svc = new AdmissoesService(db);

    await expect(
      svc.create({ ...dtoSemNascimento(), aceitePendencias: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();

    // o erro é EXATAMENTE o do bloqueio da data (não um BadRequest de outra validação): prova que
    // o aceite não contornou ESTE guard, e não que tropeçou noutro ponto.
    await svc.create({ ...dtoSemNascimento(), aceitePendencias: true }).catch((err: Error) => {
      expect(err.message).toBe(
        "Informe a data de nascimento do candidato para criar a admissão.",
      );
    });
  });

  it("(c) bypassAceite:true sem dataNascimento → CRIA (Pandapé de/para resolvido, intocado)", async () => {
    const { db, transaction } = makeDb();
    const svc = new AdmissoesService(db);

    const res = await svc.create(dtoSemNascimento(), undefined, {
      origem: "PANDAPE",
      bypassAceite: true,
      pandape: { idPrecollaborator: "PC-1" },
    });

    expect(res).toMatchObject({ admissaoId: "adm-nova" });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it("controle: MANUAL COM dataNascimento passa do guard da data (não lança a mensagem do bloqueio)", async () => {
    const { db } = makeDb();
    const svc = new AdmissoesService(db);

    // Sem aceite e com obrigatórios vazios, o erro esperado é o de OUTRAS pendências, não o da data:
    // prova que o guard da data deixou passar quando ela está presente.
    const base = dtoSemNascimento();
    await svc
      .create({ ...base, candidato: { ...base.candidato, dataNascimento: NASCIMENTO_VALIDO } })
      .catch((err: Error) => {
        expect(err.message).not.toBe(
          "Informe a data de nascimento do candidato para criar a admissão.",
        );
      });
  });
});
