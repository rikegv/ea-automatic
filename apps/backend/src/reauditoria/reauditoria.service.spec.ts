import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { AuditoriaService } from "../auditoria/auditoria.service";
import type { StagingService } from "../staging/staging.service";
import type { PandapeSyncService } from "../pandape/pandape-sync.service";
import { ReauditoriaService } from "./reauditoria.service";
import type { ValidacaoHumanaService } from "./validacao-humana.service";

/**
 * QA da REAUDITORIA por documento (OST A / Bloco 5).
 *
 * O que esta suíte trava:
 *  - reauditar reusa os arquivos da STAGING e NÃO baixa do Pandapé à toa;
 *  - staging vazia → busca de novo no Pandapé, só daquele tipo;
 *  - a DEDUP POR HASH não impede a reauditoria (arquivo já marcado é reauditado do mesmo jeito);
 *  - cópias idênticas na staging não incham o conjunto a cada reauditoria;
 *  - vale para QUALQUER estado, inclusive ENTREGUE;
 *  - a trilha grava quem pediu, quando e o antes/depois, sem PII (§A.6).
 */

const USER: AuthUser = {
  id: "user-7",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const TIPO = { id: "tipo-ctps", codigo: "CTPS", nome: "Carteira de Trabalho (CTPS)" };

function makeDb(estadoAtual: string | undefined, idPrecollaborator?: string) {
  const trilha: Array<Record<string, unknown>> = [];
  const db = {
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(TIPO) },
      documentosAdmissao: {
        findFirst: vi.fn(async () => (estadoAtual ? { estado: estadoAtual } : undefined)),
      },
      integracaoPandape: {
        findFirst: vi.fn(async () => (idPrecollaborator ? { idPrecollaborator } : undefined)),
      },
    },
    insert: vi.fn(() => ({
      values: async (v: Record<string, unknown>) => {
        trilha.push(v);
      },
    })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
  };
  return { db, trilha };
}

function makeService(parts: {
  db: ReturnType<typeof makeDb>["db"];
  arquivosStaging?: Array<{ caminho: string; codigoTipo: string }>;
  arquivosPandape?: Array<{ buffer: Buffer; originalname: string }>;
  estadoDepois?: string;
  validador?: { nome: string; em: Date };
}) {
  const staging = {
    listar: vi.fn().mockResolvedValue(parts.arquivosStaging ?? []),
  } as unknown as StagingService;
  const auditoria = {
    auditarConjunto: vi.fn().mockResolvedValue({
      resultado: { status: "VALIDADO", motivo: "Documento legível.", camposConferidos: [] },
      documento: { tipoDocumentoId: TIPO.id, estado: parts.estadoDepois ?? "ENTREGUE" },
      progresso: { completa: false },
    }),
  } as unknown as AuditoriaService;
  const pandape = {
    baixarArquivosDoTipo: vi.fn().mockResolvedValue(parts.arquivosPandape ?? []),
    registrarArquivosColetados: vi.fn().mockResolvedValue(undefined),
  } as unknown as PandapeSyncService;
  // Por padrão o documento NÃO tem validação humana; o cenário do Bloco 4 sobrescreve.
  const validacaoHumana = {
    validadorDe: vi.fn().mockResolvedValue(parts.validador),
  } as unknown as ValidacaoHumanaService;
  const svc = new ReauditoriaService(
    parts.db as never,
    auditoria,
    staging,
    pandape,
    validacaoHumana,
  );
  return { svc, staging, auditoria, pandape, validacaoHumana };
}

/** Escreve arquivos reais num diretório temporário e devolve o que o `staging.listar` devolveria. */
function staging(...conteudos: string[]): Array<{ caminho: string; codigoTipo: string }> {
  const dir = mkdtempSync(join(tmpdir(), "ea-reaud-"));
  return conteudos.map((texto, i) => {
    const caminho = join(dir, `CTPS__arq-${i}.pdf`);
    writeFileSync(caminho, texto);
    return { caminho, codigoTipo: "CTPS" };
  });
}

afterEach(() => vi.restoreAllMocks());

describe("ReauditoriaService (OST A / Bloco 5)", () => {
  it("reusa os arquivos da STAGING e NÃO baixa do Pandapé", async () => {
    const { db } = makeDb("INCONFORME", "PC-1");
    const { svc, auditoria, pandape } = makeService({ db, arquivosStaging: staging("a", "b") });

    const out = await svc.reauditar("adm-1", TIPO.id, USER);

    expect(pandape.baixarArquivosDoTipo).not.toHaveBeenCalled();
    expect(auditoria.auditarConjunto).toHaveBeenCalledTimes(1);
    const arquivos = (auditoria.auditarConjunto as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(arquivos).toHaveLength(2);
    expect(out.reauditoria).toMatchObject({ origemArquivos: "STAGING", estadoAntes: "INCONFORME" });
  });

  it("staging já expurgada → busca de novo no Pandapé, só daquele tipo", async () => {
    const { db } = makeDb("INCONFORME", "PC-1");
    const { svc, auditoria, pandape } = makeService({
      db,
      arquivosStaging: [],
      arquivosPandape: [{ buffer: Buffer.from("do pandape"), originalname: "CTPS.pdf" }],
    });

    const out = await svc.reauditar("adm-1", TIPO.id, USER);

    expect(pandape.baixarArquivosDoTipo).toHaveBeenCalledWith("PC-1", "CTPS");
    expect(auditoria.auditarConjunto).toHaveBeenCalledTimes(1);
    expect(out.reauditoria.origemArquivos).toBe("PANDAPE");
  });

  it("A DEDUP POR HASH NÃO impede a reauditoria (arquivo conhecido é reauditado igual)", async () => {
    // O serviço nem consulta as marcas: reauditar é ação explícita do humano e chama a IA direto.
    const { db } = makeDb("ENTREGUE", "PC-1");
    const { svc, auditoria, pandape } = makeService({ db, arquivosStaging: staging("ja-conhecido") });

    await svc.reauditar("adm-1", TIPO.id, USER);

    expect(auditoria.auditarConjunto).toHaveBeenCalledTimes(1);
    // e as marcas seguem em dia depois do novo veredito.
    expect(pandape.registrarArquivosColetados).toHaveBeenCalledTimes(1);
  });

  it("vale para ENTREGUE (documento já validado pode ser reanalisado)", async () => {
    const { db, trilha } = makeDb("ENTREGUE", "PC-1");
    const { svc } = makeService({ db, arquivosStaging: staging("x"), estadoDepois: "INCONFORME" });

    const out = await svc.reauditar("adm-1", TIPO.id, USER);

    expect(out.reauditoria).toMatchObject({ estadoAntes: "ENTREGUE", estadoDepois: "INCONFORME" });
    expect(trilha[0]).toMatchObject({ valorAnterior: "ENTREGUE", valorNovo: "INCONFORME" });
  });

  it("cópias IDÊNTICAS na staging não incham o conjunto (dedup por conteúdo)", async () => {
    const { db } = makeDb("INCONFORME", "PC-1");
    // Mesmo conteúdo 3x: é o que acontece quando cada reauditoria regrava a staging.
    const { svc, auditoria } = makeService({ db, arquivosStaging: staging("igual", "igual", "igual") });

    await svc.reauditar("adm-1", TIPO.id, USER);

    const arquivos = (auditoria.auditarConjunto as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(arquivos).toHaveLength(1);
  });

  it("trilha registra QUEM pediu e o antes/depois, sem PII (§A.6)", async () => {
    const { db, trilha } = makeDb("INCONFORME", "PC-1");
    const { svc } = makeService({ db, arquivosStaging: staging("x") });

    await svc.reauditar("adm-1", TIPO.id, USER);

    expect(trilha).toHaveLength(1);
    expect(trilha[0]).toMatchObject({
      admissaoId: "adm-1",
      campo: "reauditoria:CTPS",
      valorAnterior: "INCONFORME",
      valorNovo: "ENTREGUE",
      autorId: "user-7",
    });
    const gravado = JSON.stringify(trilha);
    expect(gravado).not.toMatch(/\d{11}/); // nenhum CPF
    expect(gravado).not.toContain(".pdf"); // nenhum nome de arquivo
  });

  it("BLOCO 4: documento VALIDADO POR HUMANO exige confirmação antes de reauditar", async () => {
    const { db } = makeDb("ENTREGUE", "PC-1");
    const { svc, auditoria } = makeService({
      db,
      arquivosStaging: staging("x"),
      validador: { nome: "Ana Clara Souza", em: new Date() },
    });

    // Sem o aceite: 409 com o NOME de quem validou, e a IA nem é chamada.
    await expect(svc.reauditar("adm-1", TIPO.id, USER)).rejects.toMatchObject({
      message: expect.stringContaining("Ana Clara Souza"),
    });
    expect(auditoria.auditarConjunto).not.toHaveBeenCalled();
  });

  it("BLOCO 4: com o aceite explícito, reaudita e LIMPA a marca humana", async () => {
    const { db } = makeDb("ENTREGUE", "PC-1");
    const { svc, auditoria } = makeService({
      db,
      arquivosStaging: staging("x"),
      validador: { nome: "Ana Clara Souza", em: new Date() },
    });

    const out = await svc.reauditar("adm-1", TIPO.id, USER, { confirmarSobrescritaHumana: true });

    expect(auditoria.auditarConjunto).toHaveBeenCalledTimes(1);
    expect(out.reauditoria.sobrescreveuValidacaoHumanaDe).toBe("Ana Clara Souza");
    // a marca humana some: o veredito voltou a ser da IA.
    expect(db.update).toHaveBeenCalled();
  });

  it("sem arquivo em lugar nenhum → erro acionável, sem chamar a IA", async () => {
    const { db } = makeDb("PENDENTE", undefined);
    const { svc, auditoria } = makeService({ db, arquivosStaging: [] });

    await expect(svc.reauditar("adm-1", TIPO.id, USER)).rejects.toBeInstanceOf(BadRequestException);
    expect(auditoria.auditarConjunto).not.toHaveBeenCalled();
  });
});
