import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { PortalPendenciasService } from "./portal-pendencias.service";

/**
 * A REABERTURA DISPARADA PELA AUDITORIA (frente Auditoria -> Portal, item 1).
 *
 * Quando o consultor REABRE a pendência de um documento na aba Auditoria (o descarte, porque a IA
 * aprovou errado), o Portal precisa destravar também. Esta suíte trava o que separa
 * `reabrirPorAuditoria` das outras duas portas da reabertura:
 *
 *  - ELA NÃO EXIGE `noTime`. `solicitarReenvio` e `zerarTentativas` recusam antes da queda; esta
 *    vale com o documento ACEITO (zero reprovação), que é exatamente o caso do "reabrir um aprovado
 *    errado". Exigir a queda aqui deixaria o caso mais comum sem conserto.
 *  - ELA GRAVA O MARCO com tipo próprio `REABERTURA_AUDITORIA`, pela porta única (nenhum segundo
 *    escritor de `portal_pendencias_no_time`).
 *  - ELA NÃO CONSOME a cota `reaberturas_time` (só `SOLICITACAO_REENVIO` a consome).
 *
 * §A.6: identificador técnico e contagem nos fixtures. Nenhum dado pessoal.
 */

const ADM = "adm-1";
const RG = "tipo-rg";

const CONSULTOR: AuthUser = {
  id: "user-consultor",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** Banco de mentirinha: responde pela projeção e guarda o que foi gravado (mesmo molde dos demais). */
function banco(opts: { reprovacoes: number }) {
  const gravadas: Record<string, unknown>[] = [];

  const db = {
    execute: async () => [],
    select: (proj: Record<string, unknown>) => {
      const chaves = Object.keys(proj ?? {});
      return {
        from: () => ({
          where: async () => {
            if (chaves.includes("reprovacoes")) return [{ reprovacoes: opts.reprovacoes }];
            if (chaves.includes("codigo")) return [{ id: RG, codigo: "RG", nome: "RG" }];
            return [];
          },
        }),
      };
    },
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoUpdate: async () => {
          gravadas.push(v);
        },
      }),
    }),
    query: {
      admissoes: { findFirst: async () => ({ id: ADM }) },
      documentosAdmissao: { findFirst: async () => ({ id: "doc-1" }) },
      portalPendenciasNoTime: { findFirst: async () => undefined },
    },
  };

  return { gravadas, db };
}

function servico(b: ReturnType<typeof banco>, registrar = vi.fn(async () => {})) {
  const trilha = { configurada: () => true, registrar } as never;
  return new PortalPendenciasService(b.db as never, trilha);
}

describe("reabrirPorAuditoria: destrava o candidato quando a Auditoria reabre a pendência", () => {
  it("MOVE o marco mesmo SEM queda (documento aceito, zero reprovação)", async () => {
    const b = banco({ reprovacoes: 0 });
    const registrar = vi.fn(async () => {});

    await servico(b, registrar).reabrirPorAuditoria(ADM, RG, CONSULTOR);

    // O marco foi gravado, com tipo próprio e crédito do teto inteiro (recomeçar o documento).
    expect(b.gravadas).toHaveLength(1);
    expect(b.gravadas[0]).toMatchObject({
      admissaoId: ADM,
      tipoDocumentoId: RG,
      liberadoTipo: "REABERTURA_AUDITORIA",
      liberadoPorId: CONSULTOR.id,
    });
    // NÃO consome a cota de reaberturas do time (só SOLICITACAO_REENVIO nasce com 1).
    expect(b.gravadas[0].reaberturasTime).toBe(0);
    // Deixa rastro na trilha, com evento PRÓPRIO (§A.9: não polui o número do Master nem do time).
    expect(registrar).toHaveBeenCalledWith(
      "PORTAL_REABERTURA_AUDITORIA",
      expect.objectContaining({ codigoTipoDocumento: "RG", autorId: CONSULTOR.id }),
    );
  });

  it("também vale DEPOIS da queda (documento que já tinha estourado o teto)", async () => {
    const b = banco({ reprovacoes: 3 });

    await servico(b).reabrirPorAuditoria(ADM, RG, CONSULTOR);

    expect(b.gravadas).toHaveLength(1);
    expect(b.gravadas[0]).toMatchObject({ liberadoTipo: "REABERTURA_AUDITORIA" });
  });

  it("sem trilha configurada, recusa (fail-closed): reabrir sem rastro é o que não pode acontecer", async () => {
    const b = banco({ reprovacoes: 0 });
    const svc = new PortalPendenciasService(b.db as never, {
      configurada: () => false,
      registrar: vi.fn(),
    } as never);

    await expect(svc.reabrirPorAuditoria(ADM, RG, CONSULTOR)).rejects.toThrow();
    expect(b.gravadas).toHaveLength(0);
  });
});
