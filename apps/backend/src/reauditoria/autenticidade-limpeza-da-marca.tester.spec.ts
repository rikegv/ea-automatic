import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import type { AuditoriaService } from "../auditoria/auditoria.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";
import { AuditoriaService as AuditoriaServiceReal } from "../auditoria/auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";

/**
 * CANÁRIO (§A.38): "A MARCA SÓ É LIMPA PELA VALIDAÇÃO HUMANA, NUNCA POR REAUDITORIA AUTOMÁTICA."
 *
 * `conferir_autenticidade=true` é posta pela porta de IA quando há suspeita. Ela NÃO pode ser
 * baixada por uma reauditoria automática que volte VALIDADO: quem marcou foi a desconfiança da
 * máquina, e só um humano, com o nome assinado, tem autoridade para dizer "conferi, é autêntico".
 *
 * Duas metades, como manda o requisito:
 *   5a (CANÁRIO que falha hoje): `ValidacaoHumanaService.validar` ZERA a marca
 *       (`conferir_autenticidade=false`) na mesma escrita em que grava ENTREGUE. Hoje esse campo não
 *       existe no write → o teste falha, provando que morde.
 *   5b (GUARDA, verde hoje): a porta de IA (`auditarConjunto`), ao voltar VALIDADO SEM suspeita, NÃO
 *       escreve `conferir_autenticidade=false`. Hoje nenhuma escrita toca o campo → verde. Fica
 *       vermelho se alguém "limpar" a marca na reauditoria (escrevendo false), que é o erro que este
 *       guarda existe para pegar.
 */

const USER: AuthUser = {
  id: "user-9",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const TIPO = { id: "tipo-rg", codigo: "RG", nome: "RG" };

/** Procura o valor booleano gravado para a coluna de conferência (nome de coluna robusto). */
function valorConferir(valores: Record<string, unknown>): boolean | undefined {
  for (const [k, v] of Object.entries(valores)) {
    if (/conferir.?autenticidade/i.test(k) && typeof v === "boolean") return v;
  }
  return undefined;
}

// ── 5a — VALIDAÇÃO HUMANA ZERA A MARCA ───────────────────────────────────────────────────────

function makeDbHumana(estadoAtual?: string) {
  const upserts: Array<Record<string, unknown>> = [];
  const db = {
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(TIPO) },
      documentosAdmissao: {
        findFirst: vi.fn(async () => (estadoAtual ? { estado: estadoAtual } : undefined)),
      },
      usuarios: {
        findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Ana Clara Souza", email: USER.email }),
      },
      admissoes: { findFirst: vi.fn().mockResolvedValue({ codCliente: "C-1", cargoId: "cargo-1" }) },
    },
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        if ("campo" in v) return Promise.resolve(undefined); // trilha
        upserts.push(v);
        return { onConflictDoUpdate: (c: { set?: Record<string, unknown> }) => {
          if (c?.set) upserts.push(c.set);
          return Promise.resolve(undefined);
        } };
      },
    })),
    select: vi.fn(() => ({ from: () => ({ leftJoin: () => ({ where: () => Promise.resolve([]) }) }) })),
  };
  return { db, upserts };
}

function makeHumana(db: ReturnType<typeof makeDbHumana>["db"]) {
  const auditoria = {
    aplicarPosVeredito: vi
      .fn()
      .mockResolvedValue({ progresso: { completa: false, obrigatoriosTotal: 6 }, sinalizador: "PARCIAL" }),
  } as unknown as AuditoriaService;
  return new ValidacaoHumanaService(db as never, auditoria);
}

// ── 5b — REAUDITORIA AUTOMÁTICA NÃO LIMPA ────────────────────────────────────────────────────

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};
const pandapeArquivosFake = {
  baixarArquivosDosTipos: async () => ({ arquivos: [], semRetorno: [], chamadasApi: 0 }),
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

function makeAuditoria() {
  const writes: Array<Record<string, unknown>> = [];
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
      onConflictDoUpdate: (c: { set?: Record<string, unknown> }) => {
        writes.push(values);
        if (c?.set) writes.push(c.set);
        return Promise.resolve(undefined);
      },
    }),
  }));
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      writes.push(values);
      return { where: () => Promise.resolve(undefined) };
    },
  }));
  const db = {
    select,
    insert,
    update,
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG", nome: "RG" }) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue({ id: "adm-1", farolGlobal: "EM_ADMISSAO" }) },
    },
  };
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/adm-1/RG__uuid.jpg"),
    listar: vi.fn().mockResolvedValue([]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const reguaCompletude = {
    progresso: vi.fn().mockResolvedValue({ completa: false, obrigatoriosTotal: 5, obrigatoriosOk: 2 }),
  };
  const ai = {
    auditarDocumento: vi.fn().mockResolvedValue({
      status: "VALIDADO",
      motivo: "Documento legível.",
      camposConferidos: [],
      autenticidadeSuspeita: false, // reauditoria volta LIMPA
    }),
    arquivarDrive: vi.fn(),
  };
  const svc = new AuditoriaServiceReal(
    db as never,
    staging as never,
    ai as never,
    reguaCompletude as never,
    drivePastaPaiFake as never,
    pandapeArquivosFake as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );
  return { svc, writes };
}

afterEach(() => vi.restoreAllMocks());

describe("5a — ValidacaoHumanaService.validar ZERA conferir_autenticidade", () => {
  it("ao validar à mão, a mesma escrita que grava ENTREGUE zera a marca (conferir=false)", async () => {
    const { db, upserts } = makeDbHumana("AGUARDANDO_AUDITORIA");
    const svc = makeHumana(db);

    await svc.validar("adm-1", TIPO.id, USER);

    // Alguma escrita do documento precisa zerar explicitamente a marca.
    expect(upserts.some((v) => valorConferir(v) === false)).toBe(true);
  });
});

describe("5b — reauditoria automática NÃO limpa a marca (guarda)", () => {
  it("auditarConjunto VALIDADO sem suspeita NÃO escreve conferir_autenticidade=false", async () => {
    const { svc, writes } = makeAuditoria();
    const arquivo = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), originalname: "RG.png" };

    await svc.auditarConjunto("adm-1", "tipo-rg", [arquivo], USER);

    // A automação pode gravar true (quando suspeita) mas NUNCA false: limpar é privilégio do humano.
    expect(writes.some((v) => valorConferir(v) === false)).toBe(false);
  });
});
