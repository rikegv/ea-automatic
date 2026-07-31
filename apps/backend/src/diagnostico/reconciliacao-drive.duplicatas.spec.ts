import { describe, expect, it, vi } from "vitest";
import { ReconciliacaoDriveService } from "./reconciliacao-drive.service";

/**
 * A RECONCILIAÇÃO NÃO PODE DESFAZER A DECISÃO DO DIRETOR (OST do Drive).
 *
 * Ele baixou o sinal das pastas duplicadas SEM apagá-las: assume a remoção manual e não quer o aviso
 * aceso no meio tempo. A varredura automática reconfere o Drive a cada 5 minutos, acha as MESMAS
 * pastas (elas continuam lá, por decisão dele) e regravaria o aviso, que é exatamente o que ele
 * mandou apagar. Estes testes travam os dois lados: o que foi baixado não reacende enquanto a pasta
 * existir, e some da memória quando a pasta for apagada.
 */

/** Fake do drizzle: o `select` da varredura de duplicatas e o `execute` da varredura de pastas. */
function fakeDb(linhas: unknown[], alvos: unknown[] = []) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => Promise.resolve(linhas) }) }),
    update: () => ({
      set: (valores: Record<string, unknown>) => ({
        where: () => {
          updates.push(valores);
          return Promise.resolve();
        },
      }),
    }),
    execute: () => Promise.resolve(alvos),
  } as never;
  return { db, updates };
}

/** Fake do ai-service: quais ids de pasta ainda existem no Drive, e o que a busca por nome acha. */
function fakeAi(existentes: string[], achada?: Record<string, unknown>) {
  return {
    validarPastaDrive: vi.fn(async (id: string) => ({ valido: existentes.includes(id) })),
    localizarPastaDrive: vi.fn(async () => achada ?? { encontrada: false }),
  } as never;
}

const semPastaPai = { resolver: vi.fn(async () => null) } as never;
const auditoriaInerte = { aplicarPosVeredito: vi.fn(async () => ({})) } as never;

describe("reconciliação: a baixa manual do sinal de duplicata", () => {
  it("NÃO reacende o aviso das pastas baixadas quando encontra a pasta do prontuário", async () => {
    // A busca por nome acha o prontuário e devolve as duplicatas de sempre: uma já baixada, uma nova.
    const ai = fakeAi(["pastaBaixada", "pastaNova"], {
      encontrada: true,
      pastaUrl: "https://drive.google.com/drive/folders/pastaBoa",
      arquivos: 5,
      duplicatas: ["pastaBaixada", "pastaNova"],
    });
    const { db, updates } = fakeDb(
      [],
      [
        {
          id: "adm-1",
          tipo_contrato: "Interno",
          cod_cliente: "0060",
          drive_pasta_url: null,
          drive_falha_motivo: "falhou",
          drive_duplicatas_baixadas: "pastaBaixada",
          candidato_nome: "Fulano",
          cliente_operacao: "Operação",
        },
      ],
    );
    const pastaPai = { resolver: vi.fn(async () => "pai-1") } as never;

    await new ReconciliacaoDriveService(db, ai, pastaPai, auditoriaInerte).reconciliar();

    const gravado = updates.find((u) => "driveDuplicatas" in u);
    // Só a NOVA acende. A baixada continua no Drive e continua calada, que foi a decisão do diretor.
    expect(gravado?.driveDuplicatas).toBe("pastaNova");
  });

  it("PODA da memória o id da pasta que o diretor finalmente apagou", async () => {
    const ai = fakeAi(["pastaViva"]); // "pastaApagada" não existe mais no Drive
    const { db, updates } = fakeDb([
      { id: "adm-1", duplicatas: null, baixadas: "pastaViva,pastaApagada" },
    ]);

    await new ReconciliacaoDriveService(db, ai, semPastaPai, auditoriaInerte).reconciliar();

    expect(updates[0]?.driveDuplicatasBaixadas).toBe("pastaViva");
  });

  it("com tudo no lugar, não grava nada: a varredura não mexe em quem está estável", async () => {
    const ai = fakeAi(["pastaViva"]);
    const { db, updates } = fakeDb([{ id: "adm-1", duplicatas: null, baixadas: "pastaViva" }]);

    await new ReconciliacaoDriveService(db, ai, semPastaPai, auditoriaInerte).reconciliar();

    expect(updates).toHaveLength(0);
  });

  it("aviso aceso continua sendo limpo quando a pasta extra some (comportamento original)", async () => {
    const ai = fakeAi(["pastaA"]); // "pastaB" foi apagada
    const { db, updates } = fakeDb([{ id: "adm-1", duplicatas: "pastaA,pastaB", baixadas: null }]);

    const r = await new ReconciliacaoDriveService(db, ai, semPastaPai, auditoriaInerte).reconciliar();

    expect(updates[0]?.driveDuplicatas).toBe("pastaA");
    expect(r.duplicatasLimpas).toBe(1);
  });
});
