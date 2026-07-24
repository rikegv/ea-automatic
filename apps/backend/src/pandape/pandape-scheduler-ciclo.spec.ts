import { afterEach, describe, expect, it, vi } from "vitest";
import { PandapeSyncService } from "./pandape-sync.service";
import { SCHEDULER_TETO_IA_POR_CICLO } from "../domain/scheduler-pandape";

/**
 * Ciclo do scheduler de re-consulta (OST scheduler, Blocos 1/3/5). Prova o teto de segurança de IA
 * (Bloco 3), o caminho inerte (bate heartbeat sem buscar) e o freio do desligado (Bloco 5). O pull
 * por admissão (`puxarDocumentosDaAdmissao`) é espiado: a lógica incremental dele já é coberta pelo
 * `pandape-dedup-arquivo.spec`.
 */

function tipos(n: number, acao: string) {
  return Array.from({ length: n }, () => ({ novos: acao === "AUDITADO" ? 1 : 0, acao }));
}

function montar(parts: {
  ligado?: boolean;
  ativo?: boolean;
  alvos?: Array<{ admissaoId: string; idPrecollaborator: string }>;
}) {
  const scheduler = {
    estaLigado: vi.fn().mockResolvedValue(parts.ligado ?? true),
    marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
    registrarCiclo: vi.fn().mockResolvedValue(undefined),
    admissoesVivasPandape: vi.fn().mockResolvedValue(parts.alvos ?? []),
  };
  const api = { estaAtivo: vi.fn().mockReturnValue(parts.ativo ?? true) };
  const svc = new PandapeSyncService(
    {} as never,
    { get: () => undefined } as never,
    api as never,
    {} as never,
    {} as never,
    {} as never,
    scheduler as never,
  );
  return { svc, scheduler, api };
}

afterEach(() => vi.restoreAllMocks());

describe("rodarCicloScheduler", () => {
  it("DESLIGADO: não marca início nem varre (freio do Bloco 5 vale mesmo após enfileirado)", async () => {
    const { svc, scheduler } = montar({ ligado: false });
    await svc.rodarCicloScheduler();
    expect(scheduler.marcarInicioCiclo).not.toHaveBeenCalled();
    expect(scheduler.admissoesVivasPandape).not.toHaveBeenCalled();
    expect(scheduler.registrarCiclo).not.toHaveBeenCalled();
  });

  it("INERTE (sem token): bate o heartbeat com nota, sem buscar nada", async () => {
    const { svc, scheduler } = montar({ ativo: false, alvos: [] });
    const pull = vi.spyOn(svc, "puxarDocumentosDaAdmissao");
    await svc.rodarCicloScheduler();
    expect(scheduler.marcarInicioCiclo).toHaveBeenCalledTimes(1);
    expect(pull).not.toHaveBeenCalled();
    const arg = scheduler.registrarCiclo.mock.calls[0][0];
    expect(arg.varridas).toBe(0);
    expect(arg.abortado).toBe(false);
    expect(arg.nota).toMatch(/inerte/i);
  });

  it("TETO DE IA: para o ciclo antes de estourar a quota e marca abortado", async () => {
    // 5 admissões, cada uma auditando 20 tipos. Teto=40: roda adm1 (20), adm2 (40), e no adm3 para.
    const alvos = Array.from({ length: 5 }, (_, i) => ({
      admissaoId: `adm-${i}`,
      idPrecollaborator: `pc-${i}`,
    }));
    const { svc, scheduler } = montar({ alvos });
    const pull = vi
      .spyOn(svc, "puxarDocumentosDaAdmissao")
      .mockResolvedValue({ admissaoId: "x", formularios: 0, semDestino: [], tipos: tipos(20, "AUDITADO") } as never);

    await svc.rodarCicloScheduler();

    // Só as duas primeiras rodaram (20 + 20 = 40 = teto); a terceira foi barrada.
    expect(pull).toHaveBeenCalledTimes(2);
    expect(SCHEDULER_TETO_IA_POR_CICLO).toBe(40);
    const arg = scheduler.registrarCiclo.mock.calls[0][0];
    expect(arg.abortado).toBe(true);
    expect(arg.varridas).toBe(2);
    expect(arg.nota).toMatch(/teto de seguran/i);
  });

  it("regime normal: varre todas, conta novos, sem abortar", async () => {
    const alvos = [
      { admissaoId: "a", idPrecollaborator: "pa" },
      { admissaoId: "b", idPrecollaborator: "pb" },
    ];
    const { svc, scheduler } = montar({ alvos });
    vi.spyOn(svc, "puxarDocumentosDaAdmissao").mockResolvedValue({
      admissaoId: "x",
      formularios: 0,
      semDestino: [],
      tipos: tipos(1, "PULADO_SEM_BAIXAR"),
    } as never);

    await svc.rodarCicloScheduler();

    const arg = scheduler.registrarCiclo.mock.calls[0][0];
    expect(arg.varridas).toBe(2);
    expect(arg.novos).toBe(0);
    expect(arg.abortado).toBe(false);
    expect(arg.nota).toBeNull();
  });

  it("falha de UMA admissão não derruba o ciclo (conta como falha, segue)", async () => {
    const alvos = [
      { admissaoId: "a", idPrecollaborator: "pa" },
      { admissaoId: "b", idPrecollaborator: "pb" },
    ];
    const { svc, scheduler } = montar({ alvos });
    const pull = vi.spyOn(svc, "puxarDocumentosDaAdmissao");
    pull.mockRejectedValueOnce(new Error("boom"));
    pull.mockResolvedValueOnce({
      admissaoId: "b",
      formularios: 0,
      semDestino: [],
      tipos: tipos(1, "PULADO_SEM_BAIXAR"),
    } as never);

    await svc.rodarCicloScheduler();

    expect(pull).toHaveBeenCalledTimes(2);
    const arg = scheduler.registrarCiclo.mock.calls[0][0];
    expect(arg.falhas).toBe(1);
    expect(arg.abortado).toBe(false);
  });
});
