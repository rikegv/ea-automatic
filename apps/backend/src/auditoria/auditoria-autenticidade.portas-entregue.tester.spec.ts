import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";

/**
 * CANÁRIO (§A.38/§A.40): "O SUSPEITO NUNCA VIRA ENTREGUE POR NENHUMA PORTA."
 *
 * Um documento que a IA aprova (VALIDADO) mas marca `autenticidadeSuspeita=true` NÃO pode ser
 * persistido como `estado=ENTREGUE` por porta nenhuma do caminho da IA: ENTREGUE zera a pendência
 * obrigatória da régua e fecha a frente AUDITORIA sozinha (§A.3 regra 2 complemento). Ele tem de ir
 * a AGUARDANDO_AUDITORIA com `conferir_autenticidade=true`, esperando a VALIDAÇÃO HUMANA.
 *
 * ESTE ARQUIVO cobre a PORTA que REALMENTE escreve `ENTREGUE` a partir de um veredito de IA:
 * `auditoria.service.auditarConjunto` (~L422, `estadoDocumentoDeAuditoria(resultado.status)`), que é
 * o upload do consultor E o pull do Pandapé. É a porta #1 do arquiteto.
 *
 * ACHADO DO TESTER, PARA O COORDENADOR CRUZAR COM O SEGURANCA (§A.40, "quem mais escreve este dado?").
 * Levantei por grep TODAS as escritas de `documentos_admissao.estado='ENTREGUE'`. A lista completa
 * (com a razão de cada uma estar DENTRO ou FORA do escopo) vai no relatório. Dois pontos divergem da
 * lista de "duas portas" do arquiteto e NÃO viram canário aqui de propósito:
 *
 *   (a) DEFASADO, E CORRIGIDO EM 02/10/2026 (autorizado pelo coordenador, só este comentário).
 *       Este parágrafo dizia que a porta do Portal não escreve ENTREGUE e que um canário ali
 *       passaria trivialmente. DEIXOU DE SER VERDADE COM O V12: a confirmação do candidato passou a
 *       escrever o destino do veredito (`portal-credencial.service.ts`, bloco "O ESTADO AGORA AVANÇA
 *       NO VALIDADO"), via `decidirDestino`. Era exatamente o bug V12, o documento ficava preso em
 *       AGUARDANDO_AUDITORIA mesmo com veredito VALIDADO e a régua nunca fechava.
 *       O PAR QUE FALTAVA EXISTE: `portal/portal-autenticidade.porta-do-portal.tester.spec.ts`
 *       cobre a porta do Portal nas quatro metades (VALIDADO limpo vira ENTREGUE, VALIDADO suspeito
 *       NÃO vira, INCONFORME/PENDENTE não mexem no estado, e as duas guardas do `where`).
 *       A escrita da COLETA (`marcarEntregue`) continua gravando `AGUARDANDO_AUDITORIA`, e isso
 *       segue correto: ela roda ANTES do veredito.
 *
 *   (b) EXISTE UMA TERCEIRA porta IA→ENTREGUE que a lista do arquiteto não cita:
 *       `esteira.service.ts:~2248` (anexo de ASO). NÃO viro canário aqui porque o ASO vem da clínica
 *       pela aba Exame, não do Portal pelo candidato; se a autenticidade cobre o ASO é DECISÃO DE
 *       ESCOPO do diretor/arquiteto, e o tester não inventa requisito (§A.38). Vai como gap no
 *       relatório, para o coordenador decidir se entra na frente.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};
const pandapeArquivosFake = {
  baixarArquivosDosTipos: async () => ({ arquivos: [], semRetorno: [], chamadasApi: 0 }),
};

/** Varre QUALQUER valor escrito e diz se marcou a conferência de autenticidade (nome de coluna robusto). */
function marcouConferirAutenticidade(valores: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(valores)) {
    if (/conferir.?autenticidade/i.test(k) && v === true) return true;
  }
  return false;
}

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

function makeDb() {
  const inserts: Array<{ values: Record<string, unknown>; conflict?: Record<string, unknown> }> = [];
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
      admissoes: { findFirst: vi.fn().mockResolvedValue({ id: "adm-1", farolGlobal: "EM_ADMISSAO" }) },
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
    drivePastaPaiFake as never,
    pandapeArquivosFake as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );
  return { svc, inserts };
}

afterEach(() => vi.restoreAllMocks());

describe("PORTA A (auditoria.service.auditarConjunto): VALIDADO + suspeita NÃO vira ENTREGUE", () => {
  it("VALIDADO com autenticidadeSuspeita: documento NÃO fica ENTREGUE e marca conferir_autenticidade=true", async () => {
    const ai = {
      // A IA aprova o CONTEÚDO (VALIDADO) mas sinaliza suspeita de forja (ortogonal ao status).
      auditarDocumento: vi.fn().mockResolvedValue({
        status: "VALIDADO",
        motivo: "Documento legível.",
        camposConferidos: [],
        autenticidadeSuspeita: true,
        autenticidadeMotivo: "Fonte e espaçamento inconsistentes na linha do número.",
      }),
      arquivarDrive: vi.fn(),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), originalname: "RG.png" };

    const out = (await svc.auditarConjunto("adm-1", "tipo-rg", [arquivo], USER)) as {
      documento: { estado: string };
    };

    // (1) NENHUMA escrita pode carimbar ENTREGUE num documento sob suspeita.
    expect(inserts.some((i) => i.values.estado === "ENTREGUE")).toBe(false);
    expect(out.documento.estado).not.toBe("ENTREGUE");
    // (2) O destino do suspeito é AGUARDANDO_AUDITORIA.
    expect(out.documento.estado).toBe("AGUARDANDO_AUDITORIA");
    // (3) A marca de conferência tem de ser gravada (é ela que abre a fila da validação humana).
    expect(inserts.some((i) => marcouConferirAutenticidade(i.values))).toBe(true);
  });

  it("VALIDADO sem suspeita: segue ENTREGUE (o caminho feliz não muda) e NÃO marca conferir", async () => {
    const ai = {
      auditarDocumento: vi.fn().mockResolvedValue({
        status: "VALIDADO",
        motivo: "Documento legível.",
        camposConferidos: [],
        autenticidadeSuspeita: false,
      }),
      arquivarDrive: vi.fn(),
    };
    const { svc, inserts } = makeService(ai);
    const arquivo = { buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), originalname: "RG.png" };

    const out = (await svc.auditarConjunto("adm-1", "tipo-rg", [arquivo], USER)) as {
      documento: { estado: string };
    };

    expect(out.documento.estado).toBe("ENTREGUE");
    expect(inserts.some((i) => marcouConferirAutenticidade(i.values))).toBe(false);
  });
});
