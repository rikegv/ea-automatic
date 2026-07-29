import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClicksignGestaoService } from "./clicksign-gestao.service";

/**
 * PDF VALIDADO ANTES DE VIRAR ENVELOPE (INT-4, proteção da virada de produção).
 *
 * A Clicksign aceita arquivo quebrado sem reclamar: devolve id de documento, o envelope entra em
 * `running` e a falha só aparece quando o signatário abre o visualizador. Em produção esse
 * signatário é um candidato real, e nem o e-mail de convite nem o documento tarifado voltam atrás.
 * Por isso a régua tem de estar do lado do EA, no caminho síncrono do disparo, que é o único que
 * consegue devolver o motivo na tela.
 */

/** Instancia o service com o mínimo de colaboradores para exercitar o caminho do disparo. */
function servico(opts: { kitPath?: string | null; filaVazia?: boolean }): ClicksignGestaoService {
  const db = {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve([{ kitPath: opts.kitPath ?? null }]),
      }),
    }),
  } as never;
  const staging = { dentroDaRaiz: () => true } as never;
  const fila = { enfileirarCriarEnvelope: () => Promise.resolve(true) } as never;
  const api = {} as never;

  const svc = new ClicksignGestaoService(db, api, staging, fila);
  // A fila real vem do banco; aqui interessa só o que acontece DEPOIS dela.
  (svc as unknown as { listarAptos: () => Promise<unknown[]> }).listarAptos = () =>
    Promise.resolve(
      opts.filaVazia
        ? []
        : [{ admissaoId: "adm-1", candidato: "Fulano de Teste", bloqueio: null }],
    );
  return svc;
}

const USER = { id: "u-1", email: "c@ea.local", papel: "COMUM", senhaTemporaria: false } as never;

describe("PDF do kit validado no disparo", () => {
  let dir = "";
  let stub = "";
  let bom = "";

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ea-kit-"));
    stub = join(dir, "stub.pdf");
    bom = join(dir, "kit.pdf");
    // O stub que a Clicksign aceitou em 28/07: cabeçalho e nada mais.
    await writeFile(stub, "%PDF-1.4\n");
    await writeFile(
      bom,
      `%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n% ${"x".repeat(1500)}\n` +
        `2 0 obj\n<< /Type /Page >>\nendobj\nxref\ntrailer\n<< >>\nstartxref\n9\n%%EOF\n`,
    );
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("RECUSA o disparo quando o kit no disco é um PDF quebrado", async () => {
    const svc = servico({ kitPath: stub });
    const r = await svc.dispararLote(["adm-1"], USER);
    expect(r.disparados).toBe(0);
    expect(r.itens[0]?.ok).toBe(false);
    expect(r.itens[0]?.motivo).toMatch(/Gere o kit de novo/i);
  });

  it("o motivo devolvido à tela não usa travessão (§A.11)", async () => {
    const svc = servico({ kitPath: stub });
    const r = await svc.dispararLote(["adm-1"], USER);
    expect(r.itens[0]?.motivo).not.toContain("—");
  });

  it("RECUSA quando o arquivo do kit sumiu da staging (TTL) em vez de estourar", async () => {
    const svc = servico({ kitPath: join(dir, "nao-existe.pdf") });
    const r = await svc.dispararLote(["adm-1"], USER);
    expect(r.itens[0]?.ok).toBe(false);
    expect(r.itens[0]?.motivo).toMatch(/staging/i);
  });

  it("DEIXA PASSAR o kit bem formado (a trava não pode barrar admissão legítima)", async () => {
    const svc = servico({ kitPath: bom });
    const r = await svc.dispararLote(["adm-1"], USER);
    expect(r.disparados).toBe(1);
    expect(r.itens[0]?.ok).toBe(true);
  });

  /**
   * O disparo em LOTE e o INDIVIDUAL passam pelo mesmo caminho de propósito (o `dispararUm` chama o
   * `dispararLote` com um item só). Este teste trava isso: os dois têm a MESMA régua, e nenhum dos
   * dois tem trava a mais que o outro.
   */
  it("lote e individual seguem a mesma régua, sem trava extra em nenhum dos dois", async () => {
    const lote = await servico({ kitPath: bom }).dispararLote(["adm-1"], USER);
    expect(lote.disparados).toBe(1);

    const individual = await servico({ kitPath: bom }).dispararUm("adm-1", USER);
    expect(individual).toMatchObject({ ok: true, candidato: "Fulano de Teste" });
  });
});
