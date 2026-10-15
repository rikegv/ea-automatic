import { describe, expect, it, vi } from "vitest";
import { AdmissoesService } from "./admissoes.service";
import { candidatos } from "../db/schema";
import { derivarCpfProvisorio } from "../domain/identidade-provisoria";

/**
 * A PONTE DO PORTAL PROPAGA A DATA DE NASCIMENTO PARA A FICHA, não só o CPF.
 *
 * O bug que originou estes testes: o candidato "sem CPF" prova a identidade pela porta de e-mail e a
 * data É gravada no FUNIL (`as_candidatos`), mas a ponte (`reconciliarCpfProvisorio`) só carregava o
 * CPF para a FICHA (`candidatos`). A data ficava presa no funil, a ficha seguia NULL, e a porta de
 * link (`identificar`) falhava o `casouData` para sempre. A correção: a ponte grava a data na ficha,
 * SÓ QUANDO ESTÁ VAZIA (nunca sobrescreve uma data real já existente).
 *
 * O fake captura os `update()` e distingue a tabela. O `where` (o `isNull` que faz o "só quando
 * vazia") é cláusula de SQL, provada ponta a ponta no runner contra o banco; aqui se prova que a
 * escrita acontece, que vai para `candidatos`, e que ela NÃO acontece sem data.
 */
const CPF_REAL = "52998224725"; // dígito fecha
const PROV = derivarCpfProvisorio("Candidato De Teste", "100", "2026-01-01");
const DATA = "1990-05-20";

function makeDb(findFirstSeq: (Record<string, unknown> | undefined)[]) {
  const updates: { tabela: unknown; valores: Record<string, unknown> }[] = [];
  const findFirst = vi.fn();
  for (const r of findFirstSeq) findFirst.mockResolvedValueOnce(r);
  const db = {
    query: { admissoes: { findFirst } },
    update: vi.fn((tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        updates.push({ tabela, valores });
        return { where: async () => undefined };
      },
    })),
  };
  return { db, updates, findFirst };
}

describe("reconciliarCpfProvisorio: a data de nascimento vai para a ficha", () => {
  it("CPF já real: grava a data na ficha (candidatos), sem reconciliar CPF", async () => {
    const adm = { id: "adm-1", candidatoCpf: CPF_REAL };
    const { db, updates } = makeDb([adm, adm]);
    const svc = new AdmissoesService(db as never);
    const corrigir = vi.spyOn(svc, "corrigirCpf");

    await svc.reconciliarCpfProvisorio("adm-1", CPF_REAL, DATA);

    expect(corrigir).not.toHaveBeenCalled(); // CPF já é real: nada a reapontar
    expect(updates).toHaveLength(1);
    expect(updates[0].tabela).toBe(candidatos);
    expect(updates[0].valores).toEqual({ dataNascimento: DATA });
  });

  it("CPF provisório: reaponta o CPF E DEPOIS grava a data na ficha já reapontada", async () => {
    // 1ª leitura: admissão ainda provisória; 2ª leitura (no preenchimento da data): já com o CPF real.
    const { db, updates } = makeDb([
      { id: "adm-1", candidatoCpf: PROV },
      { id: "adm-1", candidatoCpf: CPF_REAL },
    ]);
    const svc = new AdmissoesService(db as never);
    const corrigir = vi.spyOn(svc, "corrigirCpf").mockResolvedValue({} as never);

    await svc.reconciliarCpfProvisorio("adm-1", CPF_REAL, DATA);

    expect(corrigir).toHaveBeenCalledWith("adm-1", { cpf: CPF_REAL }, null);
    expect(updates).toHaveLength(1);
    expect(updates[0].tabela).toBe(candidatos);
    expect(updates[0].valores).toEqual({ dataNascimento: DATA });
  });

  it("sem data informada: NÃO toca a ficha (retrocompatível com quem só manda o CPF)", async () => {
    const adm = { id: "adm-1", candidatoCpf: CPF_REAL };
    const { db, updates } = makeDb([adm]);
    const svc = new AdmissoesService(db as never);
    vi.spyOn(svc, "corrigirCpf");

    await svc.reconciliarCpfProvisorio("adm-1", CPF_REAL);

    expect(updates).toHaveLength(0);
  });

  it("admissão inexistente: no-op, não escreve nada", async () => {
    const { db } = makeDb([undefined]);
    const svc = new AdmissoesService(db as never);

    await svc.reconciliarCpfProvisorio("sumida", CPF_REAL, DATA);

    expect(db.update).not.toHaveBeenCalled();
  });
});
