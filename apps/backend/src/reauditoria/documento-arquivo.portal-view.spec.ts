import { describe, expect, it, vi } from "vitest";
import { DocumentoArquivoService } from "./documento-arquivo.service";

/**
 * O ACRÉSCIMO: a tela de Auditoria ABRE o documento entregue pelo Portal, lido pela conta cega.
 * §A.13 em teste (produção depende do binding): aqui a conta cega é um fake; provamos que, quando a
 * staging não tem o arquivo, a Auditoria lista e serve o objeto do balde, e que FICA INERTE quando a
 * conta cega está desligada (o comportamento de hoje: indisponível).
 */

const TIPO = { id: "tipo-rg", codigo: "RG", nome: "RG" };

function montar(opts: {
  portalDisponivel?: boolean;
  portalObjetos?: { objeto: string; mime: string; tamanhoBytes: number }[];
  semPortalDocs?: boolean; // simula o serviço construído sem a dependência (specs legados, 4 args)
}) {
  const db = {
    query: { tiposDocumento: { findFirst: vi.fn(async () => TIPO) } },
  };
  const staging = { listar: vi.fn(async () => []), dentroDaRaiz: vi.fn(() => true) };
  const auditoria = { aplicarPosVeredito: vi.fn() };
  const portalPendencias = { reabrirPorAuditoria: vi.fn() };
  const baixar = vi.fn(async (_objeto: string) => ({
    bytes: Buffer.from("%PDF-1.4 bytes-do-balde"),
    contentType: "application/pdf",
  }));
  const portalDocs = opts.semPortalDocs
    ? undefined
    : {
        disponivel: () => opts.portalDisponivel ?? false,
        listar: vi.fn(async () => opts.portalObjetos ?? []),
        baixar,
      };
  const svc = new DocumentoArquivoService(
    db as never,
    staging as never,
    auditoria as never,
    portalPendencias as never,
    portalDocs as never,
  );
  return { svc, baixar, portalDocs };
}

async function lerStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const pedacos: Buffer[] = [];
  for await (const p of stream) pedacos.push(Buffer.from(p as Buffer));
  return Buffer.concat(pedacos);
}

describe("Auditoria abre documento do Portal (conta cega, acréscimo)", () => {
  it("lista os objetos do Portal quando a staging está vazia e a conta cega está ligada", async () => {
    const { svc } = montar({
      portalDisponivel: true,
      portalObjetos: [
        { objeto: "obj-1", mime: "application/pdf", tamanhoBytes: 1000 },
        { objeto: "obj-2", mime: "image/jpeg", tamanhoBytes: 2000 },
      ],
    });
    const out = await svc.listarArquivos("adm-1", TIPO.id);
    expect(out.disponivel).toBe(true);
    expect(out.arquivos).toHaveLength(2);
    expect(out.arquivos[0]).toMatchObject({ indice: 0, rotulo: expect.any(String), mime: "application/pdf" });
    // §A.6: o nome do objeto NÃO atravessa a API.
    expect(JSON.stringify(out)).not.toContain("obj-1");
  });

  it("serve os bytes do objeto do Portal pela conta cega (abrirArquivo)", async () => {
    const { svc, baixar } = montar({
      portalDisponivel: true,
      portalObjetos: [{ objeto: "obj-1", mime: "application/pdf", tamanhoBytes: 10 }],
    });
    const { stream, mime, nomeExibicao } = await svc.abrirArquivo("adm-1", TIPO.id, 0);
    expect(baixar).toHaveBeenCalledWith("obj-1");
    expect(mime).toBe("application/pdf");
    expect(nomeExibicao).toBe("RG.pdf");
    expect((await lerStream(stream)).toString()).toContain("bytes-do-balde");
  });

  it("INERTE: conta cega desligada (disponivel=false) → indisponível, como hoje", async () => {
    const { svc, baixar } = montar({ portalDisponivel: false, portalObjetos: [{ objeto: "x", mime: "application/pdf", tamanhoBytes: 1 }] });
    const out = await svc.listarArquivos("adm-1", TIPO.id);
    expect(out.disponivel).toBe(false);
    await expect(svc.abrirArquivo("adm-1", TIPO.id, 0)).rejects.toThrow();
    expect(baixar).not.toHaveBeenCalled();
  });

  it("INERTE: serviço sem a dependência (specs legados, 4 args) não quebra e fica indisponível", async () => {
    const { svc } = montar({ semPortalDocs: true });
    const out = await svc.listarArquivos("adm-1", TIPO.id);
    expect(out.disponivel).toBe(false);
    await expect(svc.abrirArquivo("adm-1", TIPO.id, 0)).rejects.toThrow();
  });
});
