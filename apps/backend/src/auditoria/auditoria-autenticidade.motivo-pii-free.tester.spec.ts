import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";

/**
 * CANÁRIO (§A.38/§A.6): "autenticidade_motivo É PII-FREE."
 *
 * O novo campo `autenticidade_motivo` é texto endereçado a quem opera, no MESMO espírito do `motivo`
 * da auditoria, que "NUNCA deve conter PII extraída do documento". Este arquivo dirige a porta A
 * (`auditarConjunto`) com uma admissão cheia de PII (CPF 52998224725, nome "Fulano de Tal") e um
 * `autenticidadeMotivo` da IA que é só descrição técnica, e então VARRE tudo que foi persistido na
 * linha de `documentos_admissao`, exigindo que o campo gravado:
 *   (a) EXISTA (hoje não existe → o teste FALHA, provando que morde); e
 *   (b) não carregue CPF (11 dígitos), número de documento formatado, nem o nome/CPF do candidato.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};
const pandapeArquivosFake = {
  baixarArquivosDosTipos: async () => ({ arquivos: [], semRetorno: [], chamadasApi: 0 }),
};

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

/** PII que NÃO pode aparecer no campo persistido. */
const PROIBIDOS = [ADM.candidatoCpf, ADM.candidatoNome, "12.345.678-9"];

function valorAutenticidadeMotivo(valores: Record<string, unknown>): string | undefined {
  for (const [k, v] of Object.entries(valores)) {
    if (/autenticidade.?motivo/i.test(k) && typeof v === "string") return v;
  }
  return undefined;
}

function makeService(aiImpl: { auditarDocumento: ReturnType<typeof vi.fn> }) {
  const inserts: Array<{ values: Record<string, unknown> }> = [];
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
      onConflictDoUpdate: () => {
        inserts.push({ values });
        return Promise.resolve(undefined);
      },
    }),
  }));
  const update = vi.fn(() => ({
    set: (values: Record<string, unknown>) => {
      inserts.push({ values });
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
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    aiImpl as never,
    reguaCompletude as never,
    drivePastaPaiFake as never,
    pandapeArquivosFake as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );
  return { svc, inserts };
}

afterEach(() => vi.restoreAllMocks());

describe("autenticidade_motivo é PII-free (§A.6)", () => {
  it("o motivo persistido existe e não contém CPF, nome do candidato nem número de documento", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({
        status: "VALIDADO",
        motivo: "Documento legível.",
        camposConferidos: [],
        autenticidadeSuspeita: true,
        // Descrição TÉCNICA, sem PII: é o contrato do campo.
        autenticidadeMotivo: "Fonte e espaçamento inconsistentes na linha do número do documento.",
      }),
      arquivarDrive: vi.fn(),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), originalname: "RG.png" };

    await svc.auditarConjunto("adm-1", "tipo-rg", [arquivo], USER);

    const motivos = inserts
      .map((i) => valorAutenticidadeMotivo(i.values))
      .filter((v): v is string => typeof v === "string");

    // (a) o campo foi persistido em alguma escrita (hoje NÃO existe → falha aqui).
    expect(motivos.length).toBeGreaterThan(0);

    // (b) varredura: nenhum valor gravado carrega PII.
    for (const m of motivos) {
      for (const proibido of PROIBIDOS) expect(m).not.toContain(proibido);
      expect(m).not.toMatch(/\d{11}/); // CPF sem máscara
      expect(m).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF com máscara
      expect(m).not.toMatch(/\d{2}\.\d{3}\.\d{3}-[\dxX]/); // RG formatado
    }
  });
});
