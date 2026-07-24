import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditoriaService } from "./auditoria.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * BLOCO E — testes de regressão do DESACOPLAMENTO coleta/auditoria (§A.9).
 *
 * Teste 2 (o que impede a regressão): com a IA falhando (500), o documento TEM que permanecer
 * gravado como AGUARDANDO_AUDITORIA. Antes, a persistência vinha DEPOIS da IA, então uma falha da IA
 * descartava a coleta (nenhum documento subia). Agora a coleta é gravada ANTES da IA.
 *
 * Teste 3 (reprocesso sem duplicata): a persistência usa upsert com alvo (admissaoId,
 * tipoDocumentoId) — combinado com o índice único do banco, reprocessar o mesmo documento atualiza a
 * mesma linha, nunca cria uma segunda.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const ADM = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "CLT",
  dataAdmissao: null,
  drivePastaUrl: null,
  driveAsoUrl: null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  clienteOperacao: "Operação X",
};

/** db mock que REGISTRA cada insert (values + onConflictDoUpdate) para inspeção. */
function makeDb() {
  const inserts: Array<{ values: Record<string, unknown>; conflict?: Record<string, unknown> }> = [];
  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? [{ descricaoRegra: "O documento deve estar legível." }] // há régua → chama a IA
      : keys.includes("estado")
        ? [] // docs p/ recalcular sinalizador
        : [ADM]; // carregarAdmissao
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
    };
    return builder;
  });
  const insert = vi.fn(() => ({
    values: (values: Record<string, unknown>) => ({
      onConflictDoUpdate: (conflict: Record<string, unknown>) => {
        inserts.push({ values, conflict });
        return Promise.resolve(undefined);
      },
    }),
  }));
  const update = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }));
  const db = {
    select,
    insert,
    update,
    query: {
      tiposDocumento: {
        findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG", nome: "RG" }),
      },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
    },
  };
  return { db, inserts };
}

function makeService(aiImpl: { auditarDocumento: ReturnType<typeof vi.fn> }) {
  const { db, inserts } = makeDb();
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/adm-1/RG__uuid.jpg"),
    listar: vi.fn().mockResolvedValue([]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const reguaCompletude = {
    progresso: vi.fn().mockResolvedValue({ completa: false, obrigatoriosTotal: 5, obrigatoriosOk: 2 }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    aiImpl as never,
    reguaCompletude as never,
  );
  return { svc, inserts };
}

afterEach(() => vi.restoreAllMocks());

describe("AuditoriaService — desacoplamento coleta/auditoria (BLOCO B/E)", () => {
  it("IA falha (500) → documento PERMANECE gravado como AGUARDANDO_AUDITORIA (coleta não se perde)", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockRejectedValue(new Error("Motor de IA indisponível (HTTP 500)")),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from([0xff, 0xd8, 0xff]), originalname: "RG.jpg" };

    // a falha da IA sobe (o caller do pull a engole em WARN; o manual a mostra ao usuário) ...
    await expect(svc.auditarBuffer("adm-1", "tipo-rg", arquivo, USER)).rejects.toThrow();

    // ... mas a COLETA já foi gravada ANTES da IA: exatamente um insert, com AGUARDANDO_AUDITORIA.
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toMatchObject({
      admissaoId: "adm-1",
      tipoDocumentoId: "tipo-rg",
      estado: "AGUARDANDO_AUDITORIA",
    });
    // e o veredito NUNCA foi gravado (a IA nem respondeu).
    expect(inserts.some((i) => i.values.estado === "ENTREGUE")).toBe(false);
  });

  it("IA responde VALIDADO → grava AGUARDANDO_AUDITORIA e DEPOIS o veredito ENTREGUE", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({ status: "VALIDADO", motivo: "Documento legível" }),
      arquivarDrive: vi.fn(),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), originalname: "RG.png" };

    const out = await svc.auditarBuffer("adm-1", "tipo-rg", arquivo, USER);

    // dois inserts, na ordem: coleta (aguardando) e depois veredito (entregue).
    expect(inserts.map((i) => i.values.estado)).toEqual(["AGUARDANDO_AUDITORIA", "ENTREGUE"]);
    expect(out.documento).toMatchObject({ tipoDocumentoId: "tipo-rg", estado: "ENTREGUE" });
  });

  it("BLOCO 1: conjunto de N arquivos → UMA chamada à IA com stagingPaths de tamanho N", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({ status: "VALIDADO", motivo: "ok" }),
      arquivarDrive: vi.fn(),
    };
    const { svc } = makeService(ai);
    // frente e verso do mesmo documento (2 JPEGs).
    const frente = { buffer: Buffer.from([0xff, 0xd8, 0xff]), originalname: "CPF.jpg" };
    const verso = { buffer: Buffer.from([0xff, 0xd8, 0xff]), originalname: "CPF.jpg" };

    await svc.auditarConjunto("adm-1", "tipo-rg", [frente, verso], USER);

    expect(ai.auditarDocumento).toHaveBeenCalledTimes(1);
    const payload = ai.auditarDocumento.mock.calls[0][0];
    expect(payload.stagingPaths).toHaveLength(2);
  });

  it("OST A/Bloco 1: PDF com /Encrypt NÃO é mais vetado aqui — vai para a IA (fim do falso positivo)", async () => {
    // REGRESSÃO da CTPS da Silvia. O backend vetava por achar a string `/Encrypt` no buffer, e ela
    // existe em PDF cifrado só por PERMISSÕES, que abre sem senha. Agora quem decide é o ai-service,
    // tentando abrir com senha vazia (pypdf). O backend não adivinha: manda auditar.
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({ status: "VALIDADO", motivo: "Legível." }),
      arquivarDrive: vi.fn(),
    };
    const { svc } = makeService(ai);
    const pdfComEncrypt = {
      buffer: Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("<< /Encrypt 5 0 R >>")]),
      originalname: "CTPS.pdf",
    };

    const out = await svc.auditarConjunto("adm-1", "tipo-rg", [pdfComEncrypt], USER);

    expect(ai.auditarDocumento).toHaveBeenCalledTimes(1);
    expect(out.documento).toMatchObject({ estado: "ENTREGUE" });
  });

  it("OST A/Bloco 1: INCONFORME por senha vindo do ai-service é persistido igual (motivo acionável)", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({
        status: "INCONFORME",
        motivo: "Documento protegido por senha. Reenviar o arquivo sem proteção para permitir a auditoria.",
      }),
      arquivarDrive: vi.fn(),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from("%PDF-1.4 real"), originalname: "CTPS.pdf" };

    const out = await svc.auditarConjunto("adm-1", "tipo-rg", [arquivo], USER);

    expect(out.documento).toMatchObject({ estado: "INCONFORME" });
    expect(out.resultado.motivo).toMatch(/senha/i);
    // AGUARDANDO_AUDITORIA é gravado antes da IA (desacoplamento) e depois SUBSTITUÍDO pelo veredito.
    expect(inserts.some((i) => i.values.estado === "INCONFORME")).toBe(true);
  });

  it("REPROCESSO sem duplicata: todo persist usa upsert no alvo (admissaoId, tipoDocumentoId)", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({ status: "VALIDADO", motivo: "ok" }),
      arquivarDrive: vi.fn(),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from([0x25, 0x50, 0x44, 0x46]), originalname: "RG.pdf" };

    await svc.auditarBuffer("adm-1", "tipo-rg", arquivo, USER);

    // Cada gravação declara onConflictDoUpdate na chave composta → reprocessar atualiza, não duplica
    // (o índice único documentos_admissao_admissao_id_tipo_documento_id_unique reforça no banco).
    expect(inserts.length).toBeGreaterThan(0);
    for (const i of inserts) {
      const target = (i.conflict as { target?: unknown[] }).target;
      expect(Array.isArray(target)).toBe(true);
      expect((target as unknown[]).length).toBe(2);
    }
  });
});
