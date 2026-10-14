import { describe, expect, it, vi } from "vitest";
import { PortalDocumentoVisualizacaoService } from "./portal-documento-visualizacao.service";

/** A visualização do documento do Portal pela conta cega: inércia + listagem + delegação do baixar. */

type Linhas = Record<string, unknown>[];

function fakeDb(linhas: Linhas) {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.where = () => chain;
  chain.orderBy = async () => linhas;
  return { select: () => chain } as never;
}

function servico(opts: {
  configurado?: boolean;
  bucket?: string;
  linhas?: Linhas;
}) {
  const baixarDocumento = vi.fn(async () => ({ bytes: Buffer.from("b"), contentType: "application/pdf" }));
  const arquivador = { configurado: () => opts.configurado ?? true, baixarDocumento } as never;
  const armazenamento = { nomeDoBucket: () => opts.bucket ?? "ea-portal-prod-entrada" } as never;
  const db = fakeDb(opts.linhas ?? []);
  const svc = new PortalDocumentoVisualizacaoService(db, arquivador, armazenamento);
  return { svc, baixarDocumento };
}

describe("PortalDocumentoVisualizacaoService", () => {
  it("disponivel() falso sem cliente configurado (inerte sem binding)", () => {
    expect(servico({ configurado: false }).svc.disponivel()).toBe(false);
  });

  it("disponivel() falso sem balde", () => {
    expect(servico({ configurado: true, bucket: "" }).svc.disponivel()).toBe(false);
  });

  it("disponivel() verdadeiro com cliente + balde", () => {
    expect(servico({ configurado: true }).svc.disponivel()).toBe(true);
  });

  it("listar() devolve [] quando inerte, sem tocar o banco", async () => {
    const { svc } = servico({ configurado: false, linhas: [{ objeto: "x", mime: "application/pdf", tamanhoBytes: 1 }] });
    expect(await svc.listar("adm-1", "tipo-1")).toEqual([]);
  });

  it("listar() mapeia objeto/mime/tamanho quando ligado", async () => {
    const { svc } = servico({
      configurado: true,
      linhas: [
        { objeto: "obj-1", mime: "application/pdf", tamanhoBytes: 100 },
        { objeto: "obj-2", mime: "image/jpeg", tamanhoBytes: null },
      ],
    });
    const out = await svc.listar("adm-1", "tipo-1");
    expect(out).toEqual([
      { objeto: "obj-1", mime: "application/pdf", tamanhoBytes: 100 },
      { objeto: "obj-2", mime: "image/jpeg", tamanhoBytes: 0 },
    ]);
  });

  it("baixar() delega ao cliente com o balde nomeado", async () => {
    const { svc, baixarDocumento } = servico({ configurado: true });
    await svc.baixar("obj-9");
    expect(baixarDocumento).toHaveBeenCalledWith({ bucket: "ea-portal-prod-entrada", objeto: "obj-9" });
  });
});
