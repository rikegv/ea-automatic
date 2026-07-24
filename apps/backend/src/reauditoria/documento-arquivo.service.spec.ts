import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { documentoArquivosColetados } from "../db/schema";
import { DocumentoArquivoService, MSG_INDISPONIVEL } from "./documento-arquivo.service";

/**
 * VISUALIZAÇÃO (Bloco 2) e DESCARTE (Bloco 3).
 *
 * O que esta suíte trava:
 *  - a rota de visualização nunca devolve caminho de arquivo nem nome original (§A.6);
 *  - staging vazia é ESTADO, não erro: devolve a mensagem de indisponível;
 *  - tipo com VÁRIOS arquivos oferece todos, não só o primeiro;
 *  - o descarte cobre as SEIS camadas, com destaque para a MARCA DE DEDUP (sem ela o candidato
 *    reenvia o mesmo arquivo e nada acontece);
 *  - o descarte NÃO apaga a linha de `documentos_admissao` (a régua a exige);
 *  - documento já arquivado no Drive é REPORTADO, não fingido como removido.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const TIPO_RG = { id: "tipo-rg", codigo: "RG", nome: "RG" };

vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof import("node:fs/promises")>();
  return { ...real, stat: vi.fn(async () => ({ size: 1234 })) };
});
vi.mock("node:fs", async (original) => {
  const real = await original<typeof import("node:fs")>();
  return { ...real, createReadStream: vi.fn(() => ({ fake: "stream" })) };
});

interface Cenario {
  arquivos?: string[];
  tipo?: { id: string; codigo: string; nome: string };
  admissao?: Record<string, unknown>;
  estadoDoc?: string;
}

function montar(cen: Cenario = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];
  const trilha: Array<Record<string, unknown>> = [];
  const removidos: string[] = [];

  const tx = {
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        updates.push(v);
        return { where: async () => undefined };
      },
    })),
    // Identifica a tabela por REFERÊNCIA (o objeto importado do schema), não por string: é o que
    // prova que o delete atinge exatamente a tabela de marcas de dedup.
    delete: vi.fn((tabela: unknown) => {
      deletes.push(tabela === documentoArquivosColetados ? "documento_arquivos_coletados" : "outra");
      return { where: async () => undefined };
    }),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        trilha.push(v);
        return Promise.resolve(undefined);
      },
    })),
  };

  const db = {
    query: {
      tiposDocumento: { findFirst: vi.fn(async () => cen.tipo ?? TIPO_RG) },
      admissoes: {
        findFirst: vi.fn(async () =>
          cen.admissao === undefined
            ? { id: "adm-1", drivePastaUrl: null, driveAsoUrl: null }
            : cen.admissao,
        ),
      },
      documentosAdmissao: {
        findFirst: vi.fn(async () => ({ estado: cen.estadoDoc ?? "INCONFORME" })),
      },
    },
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };

  const staging = {
    listar: vi.fn(async () =>
      (cen.arquivos ?? []).map((caminho) => ({
        caminho,
        codigoTipo: caminho.split("/").pop()!.split("__")[0],
      })),
    ),
    removerArquivo: vi.fn(async (c: string) => {
      removidos.push(c);
    }),
    dentroDaRaiz: vi.fn(() => true),
  };

  const svc = new DocumentoArquivoService(db as never, staging as never);
  return { svc, db, staging, updates, deletes, trilha, removidos };
}

afterEach(() => vi.restoreAllMocks());

describe("BLOCO 2 — visualizar documento (servindo da staging)", () => {
  it("lista os arquivos SEM devolver caminho nem nome original (§A.6)", async () => {
    const ctx = montar({ arquivos: ["/staging/adm-1/RG__uuid-a.pdf"] });

    const out = await ctx.svc.listarArquivos("adm-1", TIPO_RG.id);

    expect(out.disponivel).toBe(true);
    expect(out.arquivos).toHaveLength(1);
    expect(out.arquivos[0]).toMatchObject({ indice: 0, rotulo: "RG", mime: "application/pdf" });
    // Nenhum caminho, uuid ou nome de arquivo atravessa a fronteira da API.
    const serializado = JSON.stringify(out);
    expect(serializado).not.toContain("/staging/");
    expect(serializado).not.toContain("uuid-a");
  });

  it("tipo com VÁRIOS arquivos oferece TODOS (frente e verso, páginas da CTPS)", async () => {
    const ctx = montar({
      tipo: { id: "tipo-ctps", codigo: "CTPS", nome: "CTPS" },
      arquivos: [
        "/staging/adm-1/CTPS__b.jpg",
        "/staging/adm-1/CTPS__a.jpg",
        "/staging/adm-1/CTPS__d.jpg",
        "/staging/adm-1/CTPS__c.jpg",
      ],
    });

    const out = await ctx.svc.listarArquivos("adm-1", "tipo-ctps");

    expect(out.arquivos).toHaveLength(4);
    expect(out.arquivos.map((a) => a.indice)).toEqual([0, 1, 2, 3]);
    expect(out.arquivos.map((a) => a.rotulo)).toEqual([
      "CTPS (1 de 4)",
      "CTPS (2 de 4)",
      "CTPS (3 de 4)",
      "CTPS (4 de 4)",
    ]);
  });

  it("staging vazia (TTL de 48h ou régua fechada) é ESTADO, não erro", async () => {
    const ctx = montar({ arquivos: [] });

    const out = await ctx.svc.listarArquivos("adm-1", TIPO_RG.id);

    expect(out.disponivel).toBe(false);
    expect(out.arquivos).toHaveLength(0);
    expect(out.mensagem).toBe(MSG_INDISPONIVEL);
    // Decisão do diretor: não oferecer rebaixar do Pandapé nem disparar coleta de novo.
    expect(out.mensagem).toContain("Verifique no Pandapé");
  });

  it("arquivo de extensão fora da allowlist não é oferecido", async () => {
    const ctx = montar({ arquivos: ["/staging/adm-1/RG__x.exe"] });

    const out = await ctx.svc.listarArquivos("adm-1", TIPO_RG.id);

    expect(out.disponivel).toBe(false);
  });

  it("abrir arquivo resolve o caminho NO SERVIDOR, a partir do índice", async () => {
    const ctx = montar({ arquivos: ["/staging/adm-1/RG__uuid-a.pdf"] });

    const out = await ctx.svc.abrirArquivo("adm-1", TIPO_RG.id, 0);

    expect(out.mime).toBe("application/pdf");
    // Nome exibido montado do TIPO, nunca do nome do arquivo original (§A.6).
    expect(out.nomeExibicao).toBe("RG.pdf");
    expect(ctx.staging.dentroDaRaiz).toHaveBeenCalledWith("/staging/adm-1/RG__uuid-a.pdf");
  });

  it("índice inexistente devolve a mensagem de indisponível, não vaza nada", async () => {
    const ctx = montar({ arquivos: ["/staging/adm-1/RG__a.pdf"] });

    await expect(ctx.svc.abrirArquivo("adm-1", TIPO_RG.id, 7)).rejects.toThrow(MSG_INDISPONIVEL);
  });

  it("caminho fora da raiz da staging é recusado (defesa em profundidade §A.6)", async () => {
    const ctx = montar({ arquivos: ["/staging/adm-1/RG__a.pdf"] });
    ctx.staging.dentroDaRaiz = vi.fn(() => false);

    await expect(ctx.svc.abrirArquivo("adm-1", TIPO_RG.id, 0)).rejects.toThrow(MSG_INDISPONIVEL);
  });
});

describe("BLOCO 3 — descartar documento (seis camadas)", () => {
  it("cobre as seis camadas numa operação só", async () => {
    const ctx = montar({ arquivos: ["/staging/adm-1/RG__a.pdf", "/staging/adm-1/RG__b.pdf"] });

    const out = await ctx.svc.descartar("adm-1", TIPO_RG.id, USER);

    // 1. STAGING: os arquivos do tipo foram apagados.
    expect(ctx.removidos).toEqual(["/staging/adm-1/RG__a.pdf", "/staging/adm-1/RG__b.pdf"]);
    expect(out.arquivosRemovidos).toBe(2);

    // 2. documentos_admissao volta a PENDENTE com a observação limpa ...
    const doc = ctx.updates.find((u) => u.estado === "PENDENTE");
    expect(doc).toMatchObject({ estado: "PENDENTE", observacao: null });

    // 3. MARCA DE DEDUP apagada (o ponto crítico: sem isto o reenvio é pulado).
    expect(ctx.deletes).toContain("documento_arquivos_coletados");
    expect(out.marcasDedupRemovidas).toBe(true);

    // 4. VALIDAÇÃO HUMANA limpa (senão a coleta automática continua pulando o tipo).
    expect(doc).toMatchObject({ validadoPorId: null, validadoEm: null });

    // 5. DRIVE: nada arquivado ainda, nada a reportar.
    expect(out.driveJaArquivado).toBe(false);
    expect(out).not.toHaveProperty("avisoDrive");

    // 6. TRILHA: quem descartou, quando e o que mudou, sem PII.
    expect(ctx.trilha[0]).toMatchObject({
      admissaoId: "adm-1",
      campo: "descarte-documento:RG",
      valorAnterior: "INCONFORME",
      valorNovo: "PENDENTE",
      autorId: "user-1",
    });
    expect(JSON.stringify(ctx.trilha)).not.toMatch(/\d{11}/);
  });

  it("NÃO apaga a linha de documentos_admissao: a régua a exige", async () => {
    const ctx = montar({ arquivos: [] });

    await ctx.svc.descartar("adm-1", TIPO_RG.id, USER);

    // O único delete do fluxo é o das marcas de dedup.
    expect(ctx.deletes).toEqual(["documento_arquivos_coletados"]);
  });

  it("documento já arquivado no Drive é REPORTADO, não fingido como removido", async () => {
    const ctx = montar({
      arquivos: [],
      admissao: {
        id: "adm-1",
        drivePastaUrl: "https://drive.google.com/drive/folders/REAL-1",
        driveAsoUrl: null,
      },
    });

    const out = await ctx.svc.descartar("adm-1", TIPO_RG.id, USER);

    expect(out.driveJaArquivado).toBe(true);
    expect(out.avisoDrive).toContain("NÃO foi removido");
  });

  it("ASO já arquivado (sobe ao ser validado, sem esperar a régua) também é reportado", async () => {
    const ctx = montar({
      tipo: { id: "tipo-aso", codigo: "ASO", nome: "ASO" },
      arquivos: [],
      admissao: {
        id: "adm-1",
        drivePastaUrl: null,
        driveAsoUrl: "https://drive.google.com/drive/folders/ASO-1",
      },
    });

    const out = await ctx.svc.descartar("adm-1", "tipo-aso", USER);

    expect(out.driveJaArquivado).toBe(true);
  });

  it("link de MOCK do Drive não conta como arquivado (aponta para pasta inexistente)", async () => {
    const ctx = montar({
      arquivos: [],
      admissao: {
        id: "adm-1",
        drivePastaUrl: "https://drive.google.com/drive/folders/MOCK-abc",
        driveAsoUrl: null,
      },
    });

    const out = await ctx.svc.descartar("adm-1", TIPO_RG.id, USER);

    expect(out.driveJaArquivado).toBe(false);
  });

  it("descartar de novo converge (idempotente): sem arquivo, o estado é reafirmado", async () => {
    const ctx = montar({ arquivos: [], estadoDoc: "PENDENTE" });

    const out = await ctx.svc.descartar("adm-1", TIPO_RG.id, USER);

    expect(out.arquivosRemovidos).toBe(0);
    expect(out.documento.estado).toBe("PENDENTE");
    expect(ctx.deletes).toContain("documento_arquivos_coletados");
  });
});
