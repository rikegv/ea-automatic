import { describe, expect, it, vi } from "vitest";
import { ReconciliacaoDriveSchedulerService } from "./reconciliacao-drive-scheduler.service";
import type { ReconciliacaoDriveService } from "./reconciliacao-drive.service";

/**
 * OST da concorrência no arquivamento, camada 3: a reconciliação precisa rodar SOZINHA.
 *
 * O que estes testes travam é o gatilho, não a varredura (essa já tem cobertura própria). Antes, o
 * único chamador de `reconciliarSeVencido` era o carregamento da tela de Diagnóstico: sem alguém
 * abrindo a tela, prontuário que existe no Drive seguia sem link no EA e o diretor tinha de ligar as
 * pontas à mão.
 */
describe("ReconciliacaoDriveSchedulerService", () => {
  function montar(reconciliar: () => Promise<void>) {
    const svc = { reconciliarSeVencido: vi.fn(reconciliar) };
    const scheduler = new ReconciliacaoDriveSchedulerService(
      svc as unknown as ReconciliacaoDriveService,
    );
    return { svc, scheduler };
  }

  /** O ciclo é privado de propósito (só o timer chama); o teste alcança pelo nome. */
  const rodarCiclo = (s: ReconciliacaoDriveSchedulerService): Promise<void> =>
    (s as unknown as { ciclo(): Promise<void> }).ciclo();

  it("o ciclo chama a MESMA rotina que a tela chamava", async () => {
    const { svc, scheduler } = montar(async () => {});
    await rodarCiclo(scheduler);
    expect(svc.reconciliarSeVencido).toHaveBeenCalledTimes(1);
  });

  it("falha da varredura NÃO derruba o ciclo (o timer tem de sobreviver)", async () => {
    const { svc, scheduler } = montar(async () => {
      throw new Error("Drive fora do ar");
    });
    await expect(rodarCiclo(scheduler)).resolves.toBeUndefined();
    expect(svc.reconciliarSeVencido).toHaveBeenCalledTimes(1);
  });

  it("agenda a cadência no init e a desarma no destroy", () => {
    vi.useFakeTimers();
    try {
      const { svc, scheduler } = montar(async () => {});
      scheduler.onModuleInit();
      // Não dispara no boot: o pico de subida é justamente o que esta OST evita criar.
      expect(svc.reconciliarSeVencido).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2 * 60 * 1000); // atraso inicial
      expect(svc.reconciliarSeVencido).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(10 * 60 * 1000); // uma cadência
      expect(svc.reconciliarSeVencido).toHaveBeenCalledTimes(2);

      scheduler.onModuleDestroy();
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(svc.reconciliarSeVencido).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
