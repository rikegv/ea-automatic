import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { PortalPendenciasService } from "./portal-pendencias.service";
import { TETO_REPROVACOES_POR_PENDENCIA } from "../domain/portal-tentativas";

/**
 * O ZERAR DO MASTER SÓ VALE COM A PENDÊNCIA NA FILA (decisão do diretor).
 *
 * ┌─ POR QUE A TRAVA É DO LADO DO SERVIDOR ───────────────────────────────────────────────────┐
 * │ A tela já esconde o botão antes da terceira reprovação, e esconder não é impedir: a rota    │
 * │ continua alcançável por quem tiver o papel e o endereço. O servidor é o único lugar onde a  │
 * │ decisão do diretor vira regra.                                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E O QUE SE PERDIA DESTRAVANDO CEDO: antes da queda o candidato AINDA TEM tentativa, então zerar
 * não muda o que ele pode fazer, só apaga a contagem de quantas vezes a régua já o reprovou. É
 * justamente o número que o §A.9 existe para vigiar.
 *
 * §A.6: identificador técnico e contagem nos fixtures. Nenhum dado pessoal.
 */

const ADM = "adm-1";
const RG = "tipo-rg";

const MASTER: AuthUser = {
  id: "user-master",
  email: "master@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

/** Banco de mentirinha: responde pela projeção e guarda o que foi gravado. */
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

/** O corpo da recusa, que é onde moram o código e os números. */
async function recusa(b: ReturnType<typeof banco>, registrar = vi.fn(async () => {})) {
  try {
    await servico(b, registrar).zerarTentativas(ADM, RG, MASTER);
  } catch (e) {
    const erro = e as { getResponse?: () => unknown; message?: string };
    return {
      corpo: (erro.getResponse?.() ?? {}) as {
        codigo?: string;
        message?: string;
        tentativas?: { usadas?: number; teto?: number };
      },
      message: erro.message ?? "",
    };
  }
  throw new Error("o destrave passou quando deveria ter sido recusado");
}

describe("ANTES DA QUEDA, o servidor recusa, e recusa de forma legível", () => {
  it("sem nenhuma reprovação, não há o que zerar", async () => {
    const b = banco({ reprovacoes: 0 });

    const r = await recusa(b);

    expect(r.message).toMatch(/não há tentativa a zerar/i);
    expect(b.gravadas, "o marco foi gravado mesmo com a recusa").toHaveLength(0);
  });

  it("com UMA reprovação, a mensagem traz A CONTAGEM e o TETO, não um erro genérico", async () => {
    const b = banco({ reprovacoes: 1 });

    const r = await recusa(b);

    expect(r.message).toMatch(
      new RegExp(`1 de ${TETO_REPROVACOES_POR_PENDENCIA} reprova`, "i"),
    );
    expect(r.corpo.tentativas?.usadas).toBe(1);
    expect(r.corpo.tentativas?.teto).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(b.gravadas).toHaveLength(0);
  });

  it("a recusa carrega um CÓDIGO estável: a tela decide pelo código, não pelo texto", async () => {
    const r = await recusa(banco({ reprovacoes: 2 }));
    expect(r.corpo.codigo).toBe("DESTRAVE_FORA_DA_HORA");
  });

  it("a mensagem diz o que dá para fazer agora, em vez de só negar", async () => {
    const r = await recusa(banco({ reprovacoes: TETO_REPROVACOES_POR_PENDENCIA - 1 }));

    expect(r.message).toMatch(/por conta própria/i);
    expect(r.message).toMatch(/reenvio/i);
  });

  it("§A.11: a recusa não usa travessão", async () => {
    const r = await recusa(banco({ reprovacoes: 2 }));
    expect(r.message).not.toContain("\u2014");
  });

  it("a tentativa fora da hora VAI À TRILHA, com evento próprio e sem PII", async () => {
    const registrar = vi.fn(async () => {});
    const b = banco({ reprovacoes: 2 });

    await recusa(b, registrar);

    const chamadas = registrar.mock.calls as unknown as Array<[string, Record<string, unknown>]>;
    const tipos = chamadas.map((c) => c[0]);
    expect(tipos).toContain("PORTAL_DESTRAVE_RECUSADO");
    // Contar tentativa recusada como destrave estragaria o número do §A.9.
    expect(tipos).not.toContain("PORTAL_TETO_DESTRAVADO");

    const evento = chamadas.find((c) => c[0] === "PORTAL_DESTRAVE_RECUSADO")![1];
    expect(evento.autorId).toBe(MASTER.id);
    expect(evento.motivoCodigo).toBe("DESTRAVE_FORA_DA_HORA");
    expect(JSON.stringify(evento)).not.toMatch(/\d{11}/);
  });
});

describe("NA FILA, o Master destrava normalmente", () => {
  it("na terceira reprovação, que é quando o botão aparece, o destrave acontece", async () => {
    const b = banco({ reprovacoes: TETO_REPROVACOES_POR_PENDENCIA });

    const r = await servico(b).zerarTentativas(ADM, RG, MASTER);

    expect(r.tentativas.restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(r.tentativas.noTime).toBe(false);
    expect(b.gravadas).toHaveLength(1);
    expect(b.gravadas[0].liberadoTipo).toBe("DESTRAVAMENTO_MASTER");
    expect(b.gravadas[0].liberadoPorId).toBe(MASTER.id);
  });

  it("acima do teto (quem insistiu antes de a tela esconder o botão) também destrava", async () => {
    const b = banco({ reprovacoes: TETO_REPROVACOES_POR_PENDENCIA + 2 });
    await expect(servico(b).zerarTentativas(ADM, RG, MASTER)).resolves.toBeTruthy();
  });
});
