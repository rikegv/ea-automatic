import { describe, expect, it, vi } from "vitest";
import { PortalArquivamentoService } from "./portal-arquivamento.service";

/**
 * TESTER INDEPENDENTE (§A.38) do AJUSTE B: a rede de segurança `reconciliarVivos`. Cobre o requisito,
 * não a implementação: varre as admissões vivas UMA vez cada (dedup de ids), agrega o que foi
 * arquivado, é best-effort por admissão, e é INERTE sem arme (não varre, não chama o arquivador).
 *
 * `arquivarPortal` é espiado: o que importa aqui é QUEM é varrido e COMO o resultado agrega, não o
 * caminho interno do arquivamento (coberto em portal-arquivamento.service.spec).
 */

// fake-db: só a 1ª consulta (lista de admissões vivas com doc do Portal). `.where` é terminal.
function fakeDbComLinhas(linhas: Array<{ id: string }>) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.where = async () => linhas;
  return { select: () => chain } as never;
}

function servico(opts: {
  armado: boolean;
  linhas: Array<{ id: string }>;
  arquivar: (id: string) => Promise<{ arquivados: number; falhas: number }>;
}) {
  const arquivador = { configurado: () => true } as never;
  const armazenamento = { nomeDoBucket: () => "ea-portal-prod-entrada" } as never;
  const drivePastaPai = { resolver: async () => "PASTA_PAI" } as never;
  const cfg = { get: (k: string) => (k === "PORTAL_ARQUIVAMENTO_ARMADO" && opts.armado ? "true" : "") } as never;
  const svc = new PortalArquivamentoService(
    fakeDbComLinhas(opts.linhas),
    cfg,
    arquivador,
    armazenamento,
    drivePastaPai,
  );
  const spy = vi
    .spyOn(svc, "arquivarPortal")
    .mockImplementation(async (id: string) => {
      const { arquivados, falhas } = await opts.arquivar(id);
      return { tentou: true, motivo: "OK", objetos: arquivados, arquivados, ignorados: 0, falhas } as never;
    });
  return { svc, spy };
}

describe("reconciliarVivos (AJUSTE B: rede de segurança)", () => {
  it("INERTE sem arme: não varre e não chama o arquivador", async () => {
    const { svc, spy } = servico({
      armado: false,
      linhas: [{ id: "a1" }, { id: "a2" }],
      arquivar: async () => ({ arquivados: 0, falhas: 0 }),
    });
    const r = await svc.reconciliarVivos();
    expect(r).toEqual({ varridas: 0, arquivados: 0, falhas: 0, armado: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it("varre cada admissão UMA vez (dedup de ids repetidos) e agrega o arquivado", async () => {
    // a1 aparece 3x (3 docs confirmados), a2 1x: têm de virar 2 varreduras, não 4.
    const { svc, spy } = servico({
      armado: true,
      linhas: [{ id: "a1" }, { id: "a1" }, { id: "a1" }, { id: "a2" }],
      arquivar: async (id) => ({ arquivados: id === "a1" ? 2 : 1, falhas: 0 }),
    });
    const r = await svc.reconciliarVivos();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(r.varridas).toBe(2);
    expect(r.arquivados).toBe(3); // 2 (a1) + 1 (a2)
    expect(r.falhas).toBe(0);
    expect(r.armado).toBe(true);
  });

  it("IDEMPOTENTE: prontuário já completo → 0 arquivados, 0 falhas (dedup md5, sem duplicar)", async () => {
    const { svc, r } = await (async () => {
      const s = servico({
        armado: true,
        linhas: [{ id: "a1" }, { id: "a2" }],
        arquivar: async () => ({ arquivados: 0, falhas: 0 }), // tudo "já estava"
      });
      return { svc: s.svc, r: await s.svc.reconciliarVivos() };
    })();
    expect(r.varridas).toBe(2);
    expect(r.arquivados).toBe(0);
    expect(r.falhas).toBe(0);
    void svc;
  });

  it("BEST-EFFORT: falha de uma admissão não interrompe a varredura (conta a falha e segue)", async () => {
    const { svc, spy } = servico({
      armado: true,
      linhas: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      arquivar: async (id) => {
        if (id === "a2") throw new Error("Drive timeout");
        return { arquivados: 1, falhas: 0 };
      },
    });
    const r = await svc.reconciliarVivos();
    expect(spy).toHaveBeenCalledTimes(3); // nenhuma foi pulada
    expect(r.varridas).toBe(3);
    expect(r.arquivados).toBe(2); // a1 e a3
    expect(r.falhas).toBe(1); // a2
  });
});
