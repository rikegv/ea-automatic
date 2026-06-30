import { ConflictException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitService } from "./kit.service";

type Frente = { tipo: string; concluida: boolean };

/**
 * Monta o KitService com um `db.select()` que devolve, na 1ª chamada, a admissão (join candidato) e,
 * na 2ª, as frentes — espelhando a ordem das duas queries de `gerar`.
 */
function montar(frentes: Frente[]) {
  let chamada = 0;
  // 1ª query: admissão + candidato (innerJoin); 2ª query: frentes (where direto).
  const db = {
    select: vi.fn().mockImplementation(() => {
      chamada += 1;
      if (chamada === 1) {
        return {
          from: () => ({
            innerJoin: () => ({ where: async () => [{ id: "adm-1", nomeCandidato: "Fulano" }] }),
          }),
        };
      }
      return { from: () => ({ where: async () => frentes }) };
    }),
  };
  const staging = {
    salvarKit: vi.fn().mockResolvedValue("/staging/_kits/x.pdf"),
    dentroDaRaiz: vi.fn().mockReturnValue(true),
  };
  const ai = { gerarKit: vi.fn().mockResolvedValue({ stagingPathKit: "/staging/_kits/kit.pdf" }) };
  const clicksignQueue = { enfileirarCriarEnvelope: vi.fn().mockResolvedValue(undefined) };
  const svc = new KitService(db as never, staging as never, ai as never, clicksignQueue as never);
  return { svc, staging, ai, clicksignQueue };
}

const FILE = { buffer: Buffer.from("pdf"), originalname: "mae.pdf" } as never;

describe("KitService — gate F9 + enqueue Clicksign (INT-4)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("3 frentes concluídas → gera o kit e enfileira criar-envelope", async () => {
    const { svc, ai, clicksignQueue } = montar([
      { tipo: "AUDITORIA", concluida: true },
      { tipo: "EXAME", concluida: true },
      { tipo: "CADASTRO_CONTRATO", concluida: true },
    ]);
    const r = await svc.gerar("adm-1", FILE);
    expect(ai.gerarKit).toHaveBeenCalled();
    expect(clicksignQueue.enfileirarCriarEnvelope).toHaveBeenCalledWith(
      "adm-1",
      "/staging/_kits/kit.pdf",
    );
    expect(r.nomeArquivo).toContain("kit_");
  });

  it("frente faltando → 409 e NÃO gera kit nem enfileira", async () => {
    const { svc, ai, clicksignQueue } = montar([
      { tipo: "AUDITORIA", concluida: true },
      { tipo: "EXAME", concluida: true },
      { tipo: "CADASTRO_CONTRATO", concluida: false },
    ]);
    await expect(svc.gerar("adm-1", FILE)).rejects.toBeInstanceOf(ConflictException);
    expect(ai.gerarKit).not.toHaveBeenCalled();
    expect(clicksignQueue.enfileirarCriarEnvelope).not.toHaveBeenCalled();
  });
});
