import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { PortalPendenciasService } from "./portal-pendencias.service";

/**
 * O SEGUNDO CAMINHO DA REABERTURA (frente Auditoria -> Portal): o ADM reabre um documento RECEBIDO
 * PELO PORTAL (envio do candidato confirmado, não reprovado, em análise), que não vira arquivo
 * coletado na esteira e por isso o descarte não alcança. Esta suíte trava o que o
 * `reabrirDocumentoRecebidoPortal` promete:
 *
 *  - SÓ vale quando há envio recebido EM ABERTO (confirmado, não reprovado). Sem ele, recusa.
 *  - CARIMBA `reprovado_em` no envio recebido (o rastro "rejeitado pelo time").
 *  - MOVE o marco pela MESMA porta única `REABERTURA_AUDITORIA` (devolve o teto, NÃO consome a cota
 *    do time, métrica do Master limpa §A.9), reusando `reabrirPorAuditoria`.
 *  - `situacao` expõe `recebidoEmAberto`, o sinal que habilita o botão na aba Portal da Auditoria.
 *
 * §A.6: ids, código do tipo e contagem nos fixtures. Nenhum dado pessoal.
 */

const ADM = "adm-1";
const RG = "tipo-rg";
const CONSULTOR: AuthUser = {
  id: "user-consultor",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** Banco de mentirinha: responde pela projeção e GUARDA marco e reprovação (mesmo molde dos demais). */
function banco(opts: {
  emAberto: number;
  marco?: Date | null;
  reprovacoes?: number;
  falharCarimbo?: boolean;
}) {
  const gravadas: Record<string, unknown>[] = [];
  const reprovados: Record<string, unknown>[] = [];
  // A ORDEM das escritas importa para a segurança da falha parcial: o marco (porta única) tem de ser
  // escrito ANTES do carimbo de reprovação. Este log a registra para o teste travar a ordem.
  const ordem: string[] = [];
  const db = {
    execute: async () => [],
    select: (proj: Record<string, unknown>) => {
      const chaves = Object.keys(proj ?? {});
      return {
        from: () => ({
          where: async () => {
            if (chaves.includes("liberadoEm")) return [{ liberadoEm: opts.marco ?? null }];
            if (chaves.includes("emAberto")) return [{ emAberto: opts.emAberto }];
            if (chaves.includes("reprovacoes")) return [{ reprovacoes: opts.reprovacoes ?? 0 }];
            if (chaves.includes("codigo")) return [{ id: RG, codigo: "RG", nome: "RG" }];
            return [];
          },
        }),
      };
    },
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          // O carimbo pode falhar (erro transitório de banco). O serviço o trata como best-effort:
          // a reabertura já feita NÃO pode ser desfeita por isto.
          if (opts.falharCarimbo) throw new Error("falha simulada no carimbo de reprovacao");
          ordem.push("reprovado");
          reprovados.push(v);
        },
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          ordem.push("marco");
          gravadas.push(v);
        },
      }),
    }),
    query: {
      admissoes: { findFirst: async () => ({ id: ADM }) },
      documentosAdmissao: { findFirst: async () => ({ id: "doc-1" }) },
      portalPendenciasNoTime: {
        findFirst: async () => (opts.marco ? { liberadoEm: opts.marco } : undefined),
      },
    },
  };
  return { gravadas, reprovados, ordem, db };
}

function servico(b: ReturnType<typeof banco>, registrar = vi.fn(async () => {})) {
  const trilha = { configurada: () => true, registrar } as never;
  return new PortalPendenciasService(b.db as never, trilha);
}

describe("reabrirDocumentoRecebidoPortal: o ADM reabre um documento recebido pelo Portal", () => {
  it("com envio recebido EM ABERTO: carimba reprovado_em E move o marco pela porta única", async () => {
    const b = banco({ emAberto: 1, reprovacoes: 0 });
    const registrar = vi.fn(async () => {});

    await servico(b, registrar).reabrirDocumentoRecebidoPortal(ADM, RG, CONSULTOR);

    // O time reprovou o envio recebido (o rastro "rejeitado pelo time"): escreveu reprovado_em.
    expect(b.reprovados).toHaveLength(1);
    expect(b.reprovados[0]).toHaveProperty("reprovadoEm");

    // E o marco foi movido pela porta única, com o tipo próprio e o teto inteiro devolvido.
    expect(b.gravadas).toHaveLength(1);
    expect(b.gravadas[0]).toMatchObject({
      admissaoId: ADM,
      tipoDocumentoId: RG,
      liberadoTipo: "REABERTURA_AUDITORIA",
      liberadoPorId: CONSULTOR.id,
    });
    // NÃO consome a cota de reaberturas do time (§A.9: métrica do Master não é poluída).
    expect(b.gravadas[0].reaberturasTime).toBe(0);
    // Mesmo evento próprio da outra porta da reabertura.
    expect(registrar).toHaveBeenCalledWith(
      "PORTAL_REABERTURA_AUDITORIA",
      expect.objectContaining({ codigoTipoDocumento: "RG", autorId: CONSULTOR.id }),
    );
  });

  it("move o marco (porta única) ANTES de carimbar a reprovação: ordem segura na falha parcial", async () => {
    // O carimbo e o marco não são atômicos. A ORDEM é a garantia: movido o marco primeiro, uma falha
    // no carimbo não desfaz a reabertura nem conta reprovação contra o candidato (§A.9). A ordem
    // inversa deixaria um `reprovado_em` commitado contra o marco antigo, que CONTA no teto.
    const b = banco({ emAberto: 1 });
    await servico(b).reabrirDocumentoRecebidoPortal(ADM, RG, CONSULTOR);
    expect(b.ordem).toEqual(["marco", "reprovado"]);
  });

  it("falha no carimbo NÃO desfaz a reabertura já feita (best-effort, candidato não perde tentativa)", async () => {
    const b = banco({ emAberto: 1, falharCarimbo: true });

    // A reabertura resolve mesmo com o carimbo falhando: o retorno vem, não propaga o erro.
    const r = await servico(b).reabrirDocumentoRecebidoPortal(ADM, RG, CONSULTOR);
    expect(r).toMatchObject({ codigoTipoDocumento: "RG" });

    // O marco (a reabertura de fato) FOI escrito; o carimbo não. O candidato ganhou a casa de volta.
    expect(b.gravadas).toHaveLength(1);
    expect(b.gravadas[0]).toMatchObject({ liberadoTipo: "REABERTURA_AUDITORIA" });
    expect(b.reprovados).toHaveLength(0);
  });

  it("SEM envio recebido em aberto: recusa, não reprova nada e não move marco", async () => {
    const b = banco({ emAberto: 0 });

    await expect(
      servico(b).reabrirDocumentoRecebidoPortal(ADM, RG, CONSULTOR),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(b.reprovados).toHaveLength(0);
    expect(b.gravadas).toHaveLength(0);
  });

  it("situacao expõe recebidoEmAberto = true quando há envio recebido em aberto", async () => {
    const r = await servico(banco({ emAberto: 1 })).situacao(ADM, RG);
    expect(r).toMatchObject({ recebidoEmAberto: true });
  });

  it("situacao expõe recebidoEmAberto = false quando não há envio recebido em aberto", async () => {
    const r = await servico(banco({ emAberto: 0 })).situacao(ADM, RG);
    expect(r).toMatchObject({ recebidoEmAberto: false });
  });
});
