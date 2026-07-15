import { describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { VtService } from "./vt.service";

/**
 * Limite de tentativas de identificação POR CPF (§A.17 Parte A).
 *
 * O defeito que estes testes travam: o @Throttle de rota contava por `req.ip`, mas o backend vê
 * sempre `127.0.0.1` (o Next repassa em loopback e não manda o IP real). Na prática era um balde
 * ÚNICO: 10 requisições por minuto derrubavam o formulário para TODOS os candidatos, e o único
 * `x-forwarded-for` que chega ao backend é o que o cliente forjar. Por isso o limite é por CPF.
 */

/** Storage em memória com a MESMA semântica do ThrottlerStorageService (isBlocked com hits > limit). */
function storageFake(): ThrottlerStorage & { chaves: () => string[] } {
  const hits = new Map<string, number>();
  const bloqueado = new Set<string>();
  return {
    chaves: () => [...hits.keys()],
    async increment(key, _ttl, limit) {
      if (bloqueado.has(key)) {
        return { totalHits: hits.get(key) ?? 0, timeToExpire: 900, isBlocked: true, timeToBlockExpire: 900 };
      }
      const n = (hits.get(key) ?? 0) + 1;
      hits.set(key, n);
      if (n > limit) bloqueado.add(key);
      return { totalHits: n, timeToExpire: 900, isBlocked: bloqueado.has(key), timeToBlockExpire: 900 };
    },
  };
}

/** VtService com só o necessário para exercitar a identificação. */
function servico(storage: ThrottlerStorage) {
  const db = {
    query: {
      // Candidato inexistente: o que importa aqui é o limite, não o casamento da credencial.
      candidatos: { findFirst: vi.fn().mockResolvedValue(undefined) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(undefined) },
    },
  };
  const config = { getOrThrow: () => "segredo-de-teste" };
  return new VtService(db as never, {} as never, config as never, {} as never, storage);
}

const identificar = (s: VtService, cpf: string) =>
  s.identificar({ cpf, dataNascimento: "1990-01-01" });

/** Roda N tentativas e devolve quantas foram barradas por 429. */
async function tentar(s: VtService, cpf: string, vezes: number): Promise<number> {
  let bloqueadas = 0;
  for (let i = 0; i < vezes; i++) {
    await identificar(s, cpf).catch((e) => {
      if (e instanceof HttpException && e.getStatus() === 429) bloqueadas++;
    });
  }
  return bloqueadas;
}

describe("VT: limite de identificação por CPF", () => {
  it("bloqueia a varredura de datas de UM CPF depois do limite", async () => {
    const s = servico(storageFake());
    // 10 tentativas passam (viram 401 de credencial); a 11ª é barrada por 429.
    expect(await tentar(s, "11144477735", 10)).toBe(0);
    await expect(identificar(s, "11144477735")).rejects.toSatisfy(
      (e) => e instanceof HttpException && e.getStatus() === 429,
    );
  });

  it("um CPF bloqueado NÃO afeta outro candidato (sem balde único)", async () => {
    const s = servico(storageFake());
    await tentar(s, "11144477735", 15); // este CPF fica bloqueado
    await expect(identificar(s, "11144477735")).rejects.toSatisfy(
      (e) => e instanceof HttpException && e.getStatus() === 429,
    );

    // Outro CPF continua sendo atendido: o ataque a um não derruba os demais.
    await expect(identificar(s, "52998224725")).rejects.toSatisfy(
      (e) => e instanceof HttpException && e.getStatus() === 401,
    );
  });

  it("a chave do limite não contém o CPF (§A.6)", async () => {
    const st = storageFake();
    const s = servico(st);
    await identificar(s, "11144477735").catch(() => undefined);

    const chaves = st.chaves();
    expect(chaves).toHaveLength(1);
    expect(chaves[0]).not.toContain("11144477735");
    expect(chaves[0]).toMatch(/^vt-cpf:[0-9a-f]{32}$/);
  });

  it("CPFs diferentes geram chaves diferentes", async () => {
    const st = storageFake();
    const s = servico(st);
    await identificar(s, "11144477735").catch(() => undefined);
    await identificar(s, "52998224725").catch(() => undefined);
    expect(new Set(st.chaves()).size).toBe(2);
  });
});
