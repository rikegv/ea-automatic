import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { EsteiraService } from "./esteira.service";

/**
 * PAUSAR e RETOMAR (OST admissão pausada, Blocos 1 e 5).
 *
 * O que estes testes travam, em ordem de importância:
 *
 *  1. A PAUSA NÃO TOCA EM FRENTE NEM EM FAROL. É a regra de ouro, irmã da do declínio, e é o que faz
 *     "retomar volta exatamente de onde parou" ser verdade por CONSTRUÇÃO em vez de por esforço: se
 *     nada foi alterado, não há nada para restaurar. Se alguém um dia acrescentar um `update` de
 *     frente ou de farol aqui, o teste do `set` quebra.
 *  2. Só EM_ADMISSAO pausa (decisão do diretor): banco já é espera, concluída e declinada não têm o
 *     que pausar.
 *  3. O evento vai para a trilha (quem/quando), inclusive o motivo quando informado.
 */

interface AdmFake {
  id: string;
  farolGlobal: string;
  pausadaEm: Date | null;
}

function montar(adm: AdmFake | undefined) {
  const setCalls: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        setCalls.push(v);
        return { where: () => Promise.resolve(undefined) };
      },
    })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown> | Record<string, unknown>[]) => {
        inserted.push(...(Array.isArray(v) ? v : [v]));
        return Promise.resolve(undefined);
      },
    })),
  };
  const db = {
    query: { admissoes: { findFirst: vi.fn().mockResolvedValue(adm) } },
    transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  // Pausar/retomar não tocam régua nem auditoria: os outros dois colaboradores ficam vazios de
  // propósito, e é mais uma evidência de que a pausa é um marcador, não um efeito em cascata.
  const svc = new EsteiraService(db as never, {} as never, {} as never);
  return { svc, setCalls, inserted, tx };
}

const VIVA: AdmFake = { id: "adm-1", farolGlobal: "EM_ADMISSAO", pausadaEm: null };

describe("pausarAdmissao", () => {
  it("REGRA DE OURO: grava só a flag, nunca frente nem farol", async () => {
    const { svc, setCalls, tx } = montar(VIVA);
    await svc.pausarAdmissao("adm-1", undefined, "user-1");

    expect(setCalls).toHaveLength(1);
    const campos = Object.keys(setCalls[0]).sort();
    // Exatamente estes: a flag, o autor, o motivo e o carimbo de atualização. Nada de frente/farol.
    expect(campos).toEqual(["atualizadoEm", "pausaMotivo", "pausadaEm", "pausadaPor"]);
    expect(setCalls[0]).not.toHaveProperty("farolGlobal");
    expect(setCalls[0]).not.toHaveProperty("status");
    expect(setCalls[0]).not.toHaveProperty("concluida");
    // Uma única tabela tocada (admissoes) mais a trilha; nenhum update extra escondido.
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("registra o evento na trilha com autor (quem) e sem motivo quando não informado", async () => {
    const { svc, inserted } = montar(VIVA);
    await svc.pausarAdmissao("adm-1", undefined, "user-1");

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      campo: "pausa",
      valorNovo: "Admissão pausada",
      admissaoId: "adm-1",
      autorId: "user-1",
    });
  });

  it("motivo informado vira uma linha PRÓPRIA na trilha (o porquê fica consultável)", async () => {
    const { svc, inserted, setCalls } = montar(VIVA);
    await svc.pausarAdmissao("adm-1", "  Cliente suspendeu a vaga  ", "user-1");

    expect(setCalls[0].pausaMotivo).toBe("Cliente suspendeu a vaga"); // aparado
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toMatchObject({
      campo: "motivoPausa",
      valorNovo: "Cliente suspendeu a vaga",
    });
  });

  it("motivo só com espaço é tratado como ausente (não polui a trilha)", async () => {
    const { svc, inserted, setCalls } = montar(VIVA);
    await svc.pausarAdmissao("adm-1", "   ", "user-1");
    expect(setCalls[0].pausaMotivo).toBeNull();
    expect(inserted).toHaveLength(1);
  });

  it.each([
    ["BANCO_AGUARDAR", "banco já é estado de espera"],
    ["ADMISSAO_CONCLUIDA", "concluída não tem o que pausar"],
    ["DECLINOU", "declinada está encerrada"],
    ["RESCISAO", "rescindida está encerrada"],
    ["AGUARDANDO_LIBERACAO", "pré-admissão nem entrou na esteira"],
  ])("BARRA o farol %s (%s)", async (farol) => {
    const { svc, setCalls } = montar({ ...VIVA, farolGlobal: farol });
    await expect(svc.pausarAdmissao("adm-1", undefined, "user-1")).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(setCalls).toHaveLength(0); // barrou ANTES de escrever
  });

  it("pausar duas vezes é 409 (não sobrescreve a pausa original nem o autor)", async () => {
    const { svc, setCalls } = montar({ ...VIVA, pausadaEm: new Date("2026-07-01T10:00:00Z") });
    await expect(svc.pausarAdmissao("adm-1", undefined, "user-2")).rejects.toThrow(/já está pausada/i);
    expect(setCalls).toHaveLength(0);
  });

  it("admissão inexistente é 404", async () => {
    const { svc } = montar(undefined);
    await expect(svc.pausarAdmissao("nao-existe", undefined, "user-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("retomarAdmissao", () => {
  const PAUSADA: AdmFake = {
    id: "adm-1",
    farolGlobal: "EM_ADMISSAO",
    pausadaEm: new Date("2026-07-27T12:00:00Z"),
  };

  it("limpa SÓ a flag: nada de frente, farol ou recomputação", async () => {
    const { svc, setCalls, tx } = montar(PAUSADA);
    await svc.retomarAdmissao("adm-1", "user-1");

    expect(setCalls).toHaveLength(1);
    expect(Object.keys(setCalls[0]).sort()).toEqual(["atualizadoEm", "pausadaEm", "pausadaPor"]);
    expect(setCalls[0].pausadaEm).toBeNull();
    expect(setCalls[0]).not.toHaveProperty("farolGlobal");
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("PRESERVA o motivo da última pausa (o porquê não é jogado fora ao retomar)", async () => {
    const { svc, setCalls } = montar(PAUSADA);
    await svc.retomarAdmissao("adm-1", "user-1");
    expect(setCalls[0]).not.toHaveProperty("pausaMotivo");
  });

  it("registra a retomada na trilha, com o estado anterior legível", async () => {
    const { svc, inserted } = montar(PAUSADA);
    await svc.retomarAdmissao("adm-1", "user-9");
    expect(inserted).toEqual([
      {
        campo: "pausa",
        valorAnterior: "Admissão pausada",
        valorNovo: "Admissão retomada",
        admissaoId: "adm-1",
        autorId: "user-9",
      },
    ]);
  });

  it("retomar o que não está pausado é 409", async () => {
    const { svc, setCalls } = montar(VIVA);
    await expect(svc.retomarAdmissao("adm-1", "user-1")).rejects.toThrow(/não está pausada/i);
    expect(setCalls).toHaveLength(0);
  });
});
