import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditoriaService } from "./auditoria.service";
import { FalhaAuditoriaIaException, MotorIaSemQuotaException } from "../ai/ai-client.service";
import { MOTIVO_FALHA_IA } from "../domain/falha-auditoria";
import { MOTIVO_CONTEUDO } from "./conteudo-documento";
import type { AuthUser } from "../auth/auth.types";

/**
 * OST MOTIVO VERDADEIRO — regressão dos Blocos 1, 3 e 4.
 *
 * O defeito que estes testes travam: um documento parado exibindo "Documento coletado, aguardando a
 * análise por IA", como se estivesse numa fila, quando na verdade a auditoria FALHOU e ninguém vai
 * mexer nele. Aconteceu de verdade, por 14h, e só foi visto por acaso.
 *
 * As três garantias:
 *  1. toda família de falha reescreve o motivo com a verdade (não só a quota, como era antes);
 *  2. problema do ARQUIVO vira INCONFORME; problema NOSSO fica AGUARDANDO_AUDITORIA;
 *  3. retenta o transitório, não retenta o determinístico.
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

/** JPEG de verdade (magic bytes), para o conteúdo passar na triagem e a falha ser a da IA. */
const JPEG = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: "RG.jpg" };
/** Resposta digitada no formulário do Pandapé: 0 magic bytes, texto puro. Sem PII no fixture. */
const TEXTO = {
  buffer: Buffer.from("segue a conta que ja informei no cadastro, obrigado", "utf8"),
  originalname: "DADOS_BANCARIOS",
};

/** db mock que REGISTRA inserts E updates (o motivo da falha é gravado por update). */
function makeDb() {
  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? [{ descricaoRegra: "O documento deve estar legível." }]
      : keys.includes("estado")
        ? []
        : [ADM];
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
      onConflictDoUpdate: (conflict: { set?: Record<string, unknown> }) => {
        inserts.push({ ...values, ...(conflict?.set ?? {}) });
        return Promise.resolve(undefined);
      },
    }),
  }));
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      updates.push(values);
      return { where: () => Promise.resolve(undefined) };
    },
  }));
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
  return { db, inserts, updates };
}

function makeService(auditarDocumento: ReturnType<typeof vi.fn>) {
  const { db, inserts, updates } = makeDb();
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/adm-1/RG__uuid.jpg"),
    listar: vi.fn().mockResolvedValue([]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const reguaCompletude = {
    progresso: vi
      .fn()
      .mockResolvedValue({ completa: false, obrigatoriosTotal: 5, obrigatoriosOk: 2 }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    { auditarDocumento } as never,
    reguaCompletude as never,
  );
  return { svc, inserts, updates, staging, auditarDocumento };
}

/** Último update gravado no documento (é onde o motivo verdadeiro cai). */
const ultimoUpdate = (updates: Array<Record<string, unknown>>) => updates[updates.length - 1];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Bloco 1 e 3 — motivo verdadeiro e estado por família", () => {
  it("ENTRADA (415): vira INCONFORME com motivo de arquivo, não fica 'aguardando'", async () => {
    const ai = vi.fn().mockRejectedValue(new FalhaAuditoriaIaException("ENTRADA", "x", 415));
    const { svc, updates } = makeService(ai);

    await expect(svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER)).rejects.toBeInstanceOf(
      FalhaAuditoriaIaException,
    );

    expect(ultimoUpdate(updates)).toMatchObject({
      estado: "INCONFORME",
      observacao: MOTIVO_FALHA_IA.ENTRADA,
    });
  });

  it("QUOTA: segue coletado (a falha é nossa), mas o motivo passa a dizer quota", async () => {
    // Quota é transitória, então esgota as retentativas antes de gravar: timers falsos para não
    // pagar os 8s reais de espera dentro do teste.
    vi.useFakeTimers();
    const ai = vi.fn().mockRejectedValue(new MotorIaSemQuotaException());
    const { svc, updates } = makeService(ai);

    const p = svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER).catch(() => "falhou");
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("falhou");

    expect(ultimoUpdate(updates)).toMatchObject({
      estado: "AGUARDANDO_AUDITORIA",
      observacao: MOTIVO_FALHA_IA.QUOTA,
    });
  });

  it("CREDENCIAL: segue coletado e o motivo manda escalar, em vez de insistir", async () => {
    const ai = vi.fn().mockRejectedValue(new FalhaAuditoriaIaException("CREDENCIAL", "x", 403));
    const { svc, updates } = makeService(ai);

    await expect(svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER)).rejects.toBeTruthy();

    expect(ultimoUpdate(updates)).toMatchObject({
      estado: "AGUARDANDO_AUDITORIA",
      observacao: MOTIVO_FALHA_IA.CREDENCIAL,
    });
  });

  // O ponto central da OST: erro SEM família conhecida também tem de dizer a verdade.
  it("erro genérico (nem HttpException) cai em DESCONHECIDA e ainda assim reescreve o motivo", async () => {
    const ai = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const { svc, updates } = makeService(ai);

    await expect(svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER)).rejects.toBeTruthy();

    const u = ultimoUpdate(updates);
    expect(u).toMatchObject({
      estado: "AGUARDANDO_AUDITORIA",
      observacao: MOTIVO_FALHA_IA.DESCONHECIDA,
    });
    expect(String(u.observacao)).not.toContain("aguardando a análise");
  });
});

describe("Bloco 3 — resposta digitada não é falha de sistema, é veredito", () => {
  it("texto digitado vira INCONFORME sem gastar UMA chamada de IA", async () => {
    const ai = vi.fn();
    const { svc, inserts } = makeService(ai);

    const r = await svc.auditarBuffer("adm-1", "tipo-rg", TEXTO, USER);

    expect(ai).not.toHaveBeenCalled();
    expect(r.resultado.status).toBe("INCONFORME");
    expect(r.resultado.motivo).toBe(MOTIVO_CONTEUDO.TEXTO_DIGITADO);
    expect(r.documento.estado).toBe("INCONFORME");
    // Nunca passou por AGUARDANDO_AUDITORIA: esse estado é reservado a falha NOSSA.
    expect(inserts.some((i) => i.estado === "AGUARDANDO_AUDITORIA")).toBe(false);
  });

  it("o arquivo recusado ainda vai para a staging, para o consultor poder visualizar", async () => {
    const ai = vi.fn();
    const { svc, staging } = makeService(ai);

    await svc.auditarBuffer("adm-1", "tipo-rg", TEXTO, USER);

    expect(staging.salvar).toHaveBeenCalledTimes(1);
  });

  it("conjunto misto: audita o que serve e NÃO reprova o conjunto (não-bloqueio)", async () => {
    const ai = vi.fn().mockResolvedValue({
      valido: true,
      status: "VALIDADO",
      motivo: "ok",
      camposConferidos: [],
    });
    const { svc } = makeService(ai);

    await svc.auditarConjunto("adm-1", "tipo-rg", [TEXTO, JPEG], USER);

    expect(ai).toHaveBeenCalledTimes(1);
    // Só o arquivo auditável foi mandado para a IA, embora os DOIS estejam na staging.
    expect(ai.mock.calls[0][0].stagingPaths).toHaveLength(1);
  });
});

describe("Bloco 4 — retenta o transitório, não retenta o determinístico", () => {
  it("INDISPONIBILIDADE retenta até 3 tentativas no total", async () => {
    vi.useFakeTimers();
    const ai = vi
      .fn()
      .mockRejectedValue(new FalhaAuditoriaIaException("INDISPONIBILIDADE", "x", 503));
    const { svc } = makeService(ai);

    const p = svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER).catch(() => "falhou");
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("falhou");

    expect(ai).toHaveBeenCalledTimes(3);
  });

  it("transitória que melhora na segunda tentativa devolve veredito, sem erro para o consultor", async () => {
    vi.useFakeTimers();
    const ai = vi
      .fn()
      .mockRejectedValueOnce(new MotorIaSemQuotaException())
      .mockResolvedValue({ valido: true, status: "VALIDADO", motivo: "ok", camposConferidos: [] });
    const { svc } = makeService(ai);

    const p = svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER);
    await vi.runAllTimersAsync();
    const r = await p;

    expect(ai).toHaveBeenCalledTimes(2);
    expect(r.documento.estado).toBe("ENTREGUE");
  });

  it("ENTRADA falha de PRIMEIRA: repetir não converge, só queimaria IA", async () => {
    const ai = vi.fn().mockRejectedValue(new FalhaAuditoriaIaException("ENTRADA", "x", 415));
    const { svc } = makeService(ai);

    await expect(svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER)).rejects.toBeTruthy();

    expect(ai).toHaveBeenCalledTimes(1);
  });

  it("CREDENCIAL também falha de primeira (não converge sem trocar a credencial)", async () => {
    const ai = vi.fn().mockRejectedValue(new FalhaAuditoriaIaException("CREDENCIAL", "x", 401));
    const { svc } = makeService(ai);

    await expect(svc.auditarBuffer("adm-1", "tipo-rg", JPEG, USER)).rejects.toBeTruthy();

    expect(ai).toHaveBeenCalledTimes(1);
  });
});
