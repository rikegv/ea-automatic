import { describe, expect, it, vi } from "vitest";
import { PortalArquivamentoService } from "./portal-arquivamento.service";
import type { PedidoDeArquivamento } from "./portal-arquivador.service";

/**
 * O ORQUESTRADOR do arquivamento do Portal: inércia sem binding, e o caminho feliz que lê os objetos
 * confirmados e monta o pedido certo (pasta resolvida como a esteira, âncora, dedup pela subpasta).
 *
 * O banco é um FAKE de cadeia (mesmo estilo dos outros specs do Portal): `select().from().innerJoin()
 * ....where()` devolve a próxima fila de linhas; `update().set().where()` é registrado.
 */

type Linhas = Record<string, unknown>[];

function fakeDb(filas: Linhas[], updates: Array<Record<string, unknown>>) {
  const queue = [...filas];
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.groupBy = () => chain;
  chain.where = async () => queue.shift() ?? [];
  return {
    select: () => chain,
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: async () => {
          updates.push(vals);
        },
      }),
    }),
  } as never;
}

function config(map: Record<string, string>) {
  return { get: (k: string) => map[k] } as never;
}

const ADM = {
  id: "adm-1",
  codCliente: "16",
  tipoContrato: "Temporario",
  drivePastaUrl: null as string | null,
  candidatoNome: "joao da silva",
  clienteOperacao: "Operacao X",
};

function servico(opts: {
  armado?: boolean;
  configurado?: boolean;
  bucket?: string;
  admRow?: Record<string, unknown> | null;
  credenciais?: Linhas;
  pastaPai?: string | null;
  arquivarResp?: Partial<{ pastaUrl: string; arquivados: number; ignorados: number; falhas: number }>;
}) {
  const updates: Array<Record<string, unknown>> = [];
  const arquivar = vi.fn(async (_p: PedidoDeArquivamento) => ({
    pastaUrl: opts.arquivarResp?.pastaUrl ?? "https://drive/PASTA",
    arquivados: opts.arquivarResp?.arquivados ?? 1,
    arquivosIds: [],
    ignorados: opts.arquivarResp?.ignorados ?? 0,
    pastaJaExistia: false,
    duplicatas: [],
    falhas: opts.arquivarResp?.falhas ?? 0,
    motivoFalhas: [],
  }));
  const arquivador = { configurado: () => opts.configurado ?? true, arquivar } as never;
  const armazenamento = { nomeDoBucket: () => opts.bucket ?? "ea-portal-prod-entrada" } as never;
  const pastaPai = "pastaPai" in opts ? opts.pastaPai : "PASTA_PAI_16";
  const drivePastaPai = { resolver: async () => pastaPai } as never;
  const cfg = config({
    PORTAL_ARQUIVAMENTO_ARMADO: opts.armado ? "true" : "",
  });
  const admRows = opts.admRow === null ? [] : [opts.admRow ?? ADM];
  const db = fakeDb([admRows, opts.credenciais ?? []], updates);
  const svc = new PortalArquivamentoService(db, cfg, arquivador, armazenamento, drivePastaPai);
  return { svc, arquivar, updates };
}

describe("PortalArquivamentoService (inércia)", () => {
  it("armado() é falso sem a flag, mesmo com cliente e balde", () => {
    const { svc } = servico({ armado: false, configurado: true });
    expect(svc.armado()).toBe(false);
  });

  it("armado() é falso sem cliente configurado", () => {
    const { svc } = servico({ armado: true, configurado: false });
    expect(svc.armado()).toBe(false);
  });

  it("armado() é verdadeiro só com flag + cliente + balde", () => {
    const { svc } = servico({ armado: true, configurado: true, bucket: "ea-portal-prod-entrada" });
    expect(svc.armado()).toBe(true);
  });

  it("talvezArquivarDoVeredito é no-op quando não armado (não chama o arquivador)", async () => {
    const { svc, arquivar } = servico({ armado: false, configurado: true });
    await svc.talvezArquivarDoVeredito("adm-1", "tipo-1");
    expect(arquivar).not.toHaveBeenCalled();
  });

  it("arquivarPortal devolve INERTE quando o cliente não está configurado", async () => {
    const { svc, arquivar } = servico({ configurado: false });
    const r = await svc.arquivarPortal("adm-1");
    expect(r.tentou).toBe(false);
    expect(r.motivo).toBe("INERTE");
    expect(arquivar).not.toHaveBeenCalled();
  });
});

describe("PortalArquivamentoService (caminho feliz)", () => {
  const CREDS = [
    { objeto: "obj-opaco-1", nomeTipo: "RG", codigoTipo: "RG" },
    { objeto: "obj-opaco-2", nomeTipo: "CPF", codigoTipo: "CPF" },
  ];

  it("monta o pedido certo: balde, pasta-pai, pastaNome, itens com nomeFinal e subpasta", async () => {
    const { svc, arquivar } = servico({ configurado: true, credenciais: CREDS });
    const r = await svc.arquivarPortal("adm-1");
    expect(arquivar).toHaveBeenCalledTimes(1);
    const pedido = arquivar.mock.calls[0][0];
    expect(pedido.bucket).toBe("ea-portal-prod-entrada");
    expect(pedido.parentFolderId).toBe("PASTA_PAI_16");
    // montarNomePasta compõe nome + operação; o NOME_FINAL leva o nome em MAIÚSCULAS.
    expect(pedido.itens).toHaveLength(2);
    expect(pedido.itens[0].objeto).toBe("obj-opaco-1");
    expect(pedido.itens[0].nomeFinal).toBe("RG_JOAO DA SILVA");
    expect(pedido.itens[0].subpasta).toBe("DOCUMENTOS_PESSOAIS");
    expect(r.tentou).toBe(true);
    expect(r.objetos).toBe(2);
  });

  it("grava drive_pasta_url quando estava nulo (self-heal do link)", async () => {
    const { svc, updates } = servico({ configurado: true, credenciais: CREDS });
    await svc.arquivarPortal("adm-1");
    expect(updates).toHaveLength(1);
    expect(updates[0].drivePastaUrl).toBe("https://drive/PASTA");
  });

  it("NÃO grava drive_pasta_url quando a admissão já tinha pasta (idempotente)", async () => {
    const { svc, updates } = servico({
      configurado: true,
      credenciais: CREDS,
      admRow: { ...ADM, drivePastaUrl: "https://drive/JA-EXISTE" },
    });
    await svc.arquivarPortal("adm-1");
    expect(updates).toHaveLength(0);
  });

  it("usa a âncora quando a admissão já tem pasta (pastaId no pedido)", async () => {
    const { svc, arquivar } = servico({
      configurado: true,
      credenciais: CREDS,
      admRow: { ...ADM, drivePastaUrl: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp" },
    });
    await svc.arquivarPortal("adm-1");
    expect(arquivar.mock.calls[0][0].pastaId).toBe("1AbCdEfGhIjKlMnOp");
  });

  it("sem pasta-pai mapeada: não arquiva (SEM_PASTA_PAI)", async () => {
    const { svc, arquivar } = servico({ configurado: true, credenciais: CREDS, pastaPai: null });
    const r = await svc.arquivarPortal("adm-1");
    expect(r.motivo).toBe("SEM_PASTA_PAI");
    expect(arquivar).not.toHaveBeenCalled();
  });

  it("sem objeto confirmado: não arquiva (SEM_OBJETO)", async () => {
    const { svc, arquivar } = servico({ configurado: true, credenciais: [] });
    const r = await svc.arquivarPortal("adm-1");
    expect(r.motivo).toBe("SEM_OBJETO");
    expect(arquivar).not.toHaveBeenCalled();
  });

  it("talvezArquivarDoVeredito nunca lança, mesmo se o arquivador falhar", async () => {
    const { svc } = servico({ armado: true, configurado: true, credenciais: CREDS });
    // Força o arquivador a lançar; o gatilho vivo tem de engolir (não derruba o candidato).
    (svc as unknown as { arquivador: { arquivar: () => Promise<never> } }).arquivador.arquivar =
      () => Promise.reject(new Error("boom"));
    await expect(svc.talvezArquivarDoVeredito("adm-1", "tipo-1")).resolves.toBeUndefined();
  });
});
