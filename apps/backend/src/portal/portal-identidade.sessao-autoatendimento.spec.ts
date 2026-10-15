import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { minutosDaSessao } from "../domain/portal-identidade";

/**
 * COBERTURA (§A.38) do miolo que a porta de e-mail (autoatendimento) reusa para ENTRAR direto: o
 * prazo da sessão é o MENOR entre o teto e o que resta do LINK, e a sessão ANCORA no `jti` do link
 * vivo. É a defesa central do P2 (a sessão não pode sobreviver ao link), e o furo que a auditoria
 * prévia apontou. `emitirComTrava` e a chave são espionados; o resto é o código real.
 */
function decodePayload(token: string): Record<string, unknown> {
  const payloadB64 = token.split(".")[1];
  return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>;
}

const AGORA = 1_760_000_000_000;

describe("minutosDaSessao: o prazo é o MENOR entre o teto e o que resta do link", () => {
  it("link mais longo que o teto: devolve o teto (30)", () => {
    expect(minutosDaSessao(AGORA, AGORA + 120 * 60_000, 30)).toBe(30);
  });
  it("link mais curto que o teto: devolve o que resta do link, nunca o teto", () => {
    expect(minutosDaSessao(AGORA, AGORA + 2 * 60_000, 30)).toBe(2);
  });
  it("link já vencido: devolve 0, nunca negativo", () => {
    expect(minutosDaSessao(AGORA, AGORA - 5 * 60_000, 30)).toBe(0);
  });
});

function montar(chave: KeyObject | null) {
  const trilha = { registrar: vi.fn(async () => {}) };
  const svc = new PortalIdentidadeService(
    {} as never, // db (emitirComTrava é espionado, não toca o banco)
    {} as never, // config
    trilha as never,
    {} as never, // throttle
  );
  vi.spyOn(
    svc as unknown as { chaveDaSessao: () => KeyObject | null },
    "chaveDaSessao",
  ).mockReturnValue(chave);
  const emitir = vi.spyOn(
    svc as unknown as { emitirComTrava: (...a: unknown[]) => Promise<unknown> },
    "emitirComTrava",
  );
  const abrir = (
    svc as unknown as {
      abrirSessaoNoAutoatendimento: (
        a: string,
        b: string,
        c: { ip: string | null; userAgent: string | null },
      ) => Promise<{ sessao: string; expiraEm: string } | null>;
    }
  ).abrirSessaoNoAutoatendimento.bind(svc);
  return { trilha, emitir, abrir };
}

describe("abrirSessaoNoAutoatendimento", () => {
  const CTX = { ip: null, userAgent: null };

  it("sem chave de sessão (porta desligada): devolve null e nem tenta emitir", async () => {
    const { abrir, emitir } = montar(null);
    expect(await abrir("adm-1", "autor-1", CTX)).toBeNull();
    expect(emitir).not.toHaveBeenCalled();
  });

  it("admissão fora do recorte (sem link vivo): devolve null", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const { abrir, emitir } = montar(privateKey);
    emitir.mockResolvedValue({ emitido: null, jaAtivo: null, foraDoRecorte: { codigo: "SEM_ADMISSAO" } });
    expect(await abrir("adm-1", "autor-1", CTX)).toBeNull();
  });

  it("link vivo CURTO: ancora no jti do link e RECORTA o prazo pela janela do link (não o teto)", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const { abrir, trilha, emitir } = montar(privateKey);
    const expLink = new Date(Date.now() + 2 * 60_000); // 2 min
    emitir.mockResolvedValue({ emitido: { jti: "LINK-JTI", link: "x", expiraEm: expLink }, jaAtivo: null });

    const r = await abrir("adm-9", "autor-9", CTX);

    expect(r).not.toBeNull();
    const claims = decodePayload(r!.sessao);
    expect(claims.sub).toBe("adm-9"); // binding à admissão do vínculo
    expect(claims.jti).toBe("LINK-JTI"); // ancorado no link vivo
    expect(claims.typ).toBe("portal");
    const dur = (claims.exp as number) - (claims.iat as number);
    expect(dur).toBeLessThanOrEqual(2 * 60 + 1); // ~2 min, NUNCA os 30 min do teto
    expect(dur).toBeGreaterThan(60);
    expect(trilha.registrar).toHaveBeenCalledWith("PORTAL_SESSAO_EMITIDA", expect.anything(), null);
  });

  it("link vivo JÁ ABERTO e longo (jaAtivo): reaproveita o jti e capa no teto (30 min)", async () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const { abrir, emitir } = montar(privateKey);
    const expLink = new Date(Date.now() + 40 * 60_000); // 40 min > teto 30
    emitir.mockResolvedValue({ emitido: null, jaAtivo: { jti: "J2", expiraEm: expLink, enviadoEm: null } });

    const r = await abrir("adm-2", "autor-2", CTX);

    const claims = decodePayload(r!.sessao);
    expect(claims.jti).toBe("J2");
    const dur = (claims.exp as number) - (claims.iat as number);
    expect(dur).toBeLessThanOrEqual(30 * 60); // capado no teto, não os 40 min do link
    expect(dur).toBeGreaterThan(29 * 60);
  });
});
