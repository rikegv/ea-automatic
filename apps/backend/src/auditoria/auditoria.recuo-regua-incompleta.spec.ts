import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import type { AuthUser } from "../auth/auth.types";

/**
 * O RECUO DA AUDITORIA quando a régua obrigatória DEIXA de estar completa.
 *
 * O ESTADO QUE ISTO ELIMINA, e ele era alcançável em produção: "AUDITORIA = ANALISE_OK, concluída,
 * com régua obrigatória INCOMPLETA". `aplicarPosVeredito` só tinha o ramo do `if (progresso.completa)`
 * e nenhum `else`, então qualquer caminho que devolvesse um obrigatório a pendente (o descarte de
 * documento, uma reauditoria voltando INCONFORME) deixava a frente concluída e o gate do Cadastro
 * aberto por uma conclusão que já não se sustentava.
 *
 * O que esta suíte trava:
 *  - régua incompleta com AUDITORIA concluída → frente volta a ANALISE_PENDENTE, `concluida: false`,
 *    `dataConclusao` nula, com evento `reversao: true`;
 *  - o CADASTRO já nascido é derrubado junto (gate da regra 3 fechando), também com `reversao: true`;
 *  - derrubar é RECUAR, não APAGAR: nenhum delete de frente (a trilha em `frente_status_eventos`
 *    tem ON DELETE CASCADE e sumiria junto);
 *  - IDEMPOTÊNCIA: a segunda reabertura não recua de novo nem duplica evento;
 *  - admissão FINALIZADA e ENCERRADA não são recalculadas (§A.16/§A.19);
 *  - régua COMPLETA não recua nada (o caminho de conclusão segue intacto).
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const ADM_SELECT = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "CLT",
  dataAdmissao: new Date("2026-10-01"),
  drivePastaUrl: null,
  driveAsoUrl: null,
  driveDuplicatasBaixadas: null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  candidatoSexo: "MASCULINO",
  candidatoBanco: null,
  candidatoAgencia: null,
  candidatoConta: null,
  clienteOperacao: "Operação X",
};

interface Frente {
  id: string;
  tipo: string;
  status: string;
  concluida: boolean;
}

interface Cenario {
  frentes: Frente[];
  farolGlobal?: string;
  completa?: boolean;
  /** O envelope da Clicksign e o kit, que são a guarda do recuo. */
  clicksignStatus?: string;
  kitAssinaturaPath?: string | null;
}

function montar(cen: Cenario) {
  const updatesFrente: Array<{ id: unknown; set: Record<string, unknown> }> = [];
  const eventos: Array<Record<string, unknown>> = [];
  const deletes: unknown[] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("candidatoNome")
      ? [ADM_SELECT]
      : keys.includes("concluida")
        ? cen.frentes
        : keys.includes("estado")
          ? []
          : keys.includes("descricaoRegra")
            ? []
            : [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
    };
    return builder;
  });

  // O `where` do update guarda o argumento cru: basta provar QUANTOS updates de frente houve e o
  // que cada um escreveu. A identidade da frente é conferida pela ordem (Auditoria, depois Cadastro).
  const tx = {
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => ({
        where: (w: unknown) => {
          updatesFrente.push({ id: w, set: v });
          return Promise.resolve(undefined);
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        eventos.push(v);
        return Promise.resolve(undefined);
      },
    })),
    delete: vi.fn((t: unknown) => {
      deletes.push(t);
      return { where: async () => undefined };
    }),
  };

  const db = {
    select,
    update: vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) })),
    insert: vi.fn(() => ({
      values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }),
    })),
    delete: vi.fn((t: unknown) => {
      deletes.push(t);
      return { where: async () => undefined };
    }),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      admissoes: {
        findFirst: vi.fn(async () => ({
          id: "adm-1",
          farolGlobal: cen.farolGlobal ?? "EM_ADMISSAO",
          isBanco: false,
          dataAdmissao: ADM_SELECT.dataAdmissao,
          clicksignStatus: cen.clicksignStatus ?? "SEM_ENVELOPE",
          kitAssinaturaPath: cen.kitAssinaturaPath ?? null,
          kitAssinaturaEm: null,
        })),
      },
      dadosVagaFolha: { findFirst: vi.fn(async () => ({ salario: "2000" })) },
      tiposDocumento: { findFirst: vi.fn(async () => undefined) },
    },
  };

  const svc = new AuditoriaService(
    db as never,
    { listar: vi.fn(async () => []) } as never,
    {} as never,
    { progresso: vi.fn(async () => ({ completa: cen.completa ?? false, obrigatoriosTotal: 5, obrigatoriosOk: 4 })) } as never,
    { resolver: async () => resolvePastaPaiId(null, null, {}) } as never,
    {} as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );

  return { svc, updatesFrente, eventos, deletes };
}

afterEach(() => vi.restoreAllMocks());

describe("aplicarPosVeredito() — o RECUO da AUDITORIA (régua obrigatória des-completada)", () => {
  it("frente concluída + régua incompleta → volta a ANALISE_PENDENTE com evento de REVERSÃO", async () => {
    const ctx = montar({
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
        { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
      ],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: true, cadastroDerrubado: false });
    expect(ctx.updatesFrente).toHaveLength(1);
    expect(ctx.updatesFrente[0].set).toMatchObject({
      status: "ANALISE_PENDENTE",
      concluida: false,
      dataConclusao: null,
    });
    expect(ctx.eventos).toHaveLength(1);
    expect(ctx.eventos[0]).toMatchObject({
      tipo: "AUDITORIA",
      deStatus: "ANALISE_OK",
      paraStatus: "ANALISE_PENDENTE",
      reversao: true,
      autorId: "user-1",
    });
    // Nada de conclusão nem de arquivamento neste ramo.
    expect(out.auditoriaAuto).toBeUndefined();
    expect(out.arquivado).toBeUndefined();
  });

  it("DERRUBA o Cadastro já nascido, com evento de reversão próprio", async () => {
    const ctx = montar({
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
        { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
        { id: "f-cad", tipo: "CADASTRO_CONTRATO", status: "CADASTRADO", concluida: true },
      ],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: true, cadastroDerrubado: true });
    expect(ctx.updatesFrente).toHaveLength(2);
    expect(ctx.updatesFrente[1].set).toMatchObject({
      status: "A_CADASTRAR",
      concluida: false,
      dataConclusao: null,
    });
    expect(ctx.eventos[1]).toMatchObject({
      tipo: "CADASTRO_CONTRATO",
      deStatus: "CADASTRADO",
      paraStatus: "A_CADASTRAR",
      reversao: true,
    });
  });

  it("DERRUBAR É RECUAR, NÃO APAGAR: nenhuma frente é deletada (a trilha cascatearia junto)", async () => {
    const ctx = montar({
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
        { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
        { id: "f-cad", tipo: "CADASTRO_CONTRATO", status: "CADASTRADO", concluida: true },
      ],
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.deletes).toHaveLength(0);
  });

  it("o Cadastro no status inicial e não concluído NÃO gera evento de reversão sem reversão", async () => {
    const ctx = montar({
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
        { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
        { id: "f-cad", tipo: "CADASTRO_CONTRATO", status: "A_CADASTRAR", concluida: false },
      ],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: true, cadastroDerrubado: false });
    expect(ctx.updatesFrente).toHaveLength(1);
    expect(ctx.eventos).toHaveLength(1);
  });

  it("IDEMPOTENTE: com a AUDITORIA já pendente, reabrir de novo não recua nem duplica evento", async () => {
    const ctx = montar({
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
        { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
      ],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: false, cadastroDerrubado: false });
    expect(ctx.updatesFrente).toHaveLength(0);
    expect(ctx.eventos).toHaveLength(0);
  });

  it("admissão FINALIZADA não é recalculada (§A.16/§A.19): nada recua", async () => {
    const ctx = montar({
      farolGlobal: "ADMISSAO_CONCLUIDA",
      frentes: [{ id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true }],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: false });
    expect(ctx.updatesFrente).toHaveLength(0);
  });

  it("admissão DECLINADA não volta para a fila da Auditoria (§A.16)", async () => {
    const ctx = montar({
      farolGlobal: "DECLINOU",
      frentes: [{ id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true }],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: false });
    expect(ctx.updatesFrente).toHaveLength(0);
  });

  it("régua COMPLETA não passa pelo recuo (o caminho de conclusão segue intacto)", async () => {
    const ctx = montar({
      completa: true,
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
        { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
      ],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toBeUndefined();
    expect(ctx.updatesFrente).toHaveLength(0);
  });

  /*
   * ══ A GUARDA VALE NO EFEITO, E NÃO SÓ NA PORTA ═════════════════════════════════════════════
   *
   * Exigência de saída da auditoria de segurança. O recuo mora no pós-veredito COMPARTILHADO, então
   * ele é alcançável por caminhos que NÃO passam por `descartar` nem por `reauditar`: o mais curto
   * tem um clique, porque o modal da Esteira oferece "Enviar novo arquivo" em documento já
   * ENTREGUE e o upload comum sobrescreve o estado sem condição. Sem a guarda aqui, o Cadastro
   * caía com o envelope VIVO lá fora.
   */
  it("envelope AGUARDANDO_ASSINATURA NÃO recua, mesmo com a régua incompleta", async () => {
    const ctx = montar({
      clicksignStatus: "AGUARDANDO_ASSINATURA",
      frentes: [
        { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true },
        { id: "f-cad", tipo: "CADASTRO_CONTRATO", status: "CADASTRADO", concluida: false },
      ],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: false, cadastroDerrubado: false });
    expect(ctx.updatesFrente, "nenhuma frente pode ser tocada com contrato em assinatura").toHaveLength(0);
  });

  it("kit já na fila de assinatura NÃO recua", async () => {
    const ctx = montar({
      kitAssinaturaPath: "kits/adm-1.pdf",
      frentes: [{ id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true }],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: false });
    expect(ctx.updatesFrente).toHaveLength(0);
  });

  it("envelope CANCELADO libera o recuo: envelope morto não protege nada", async () => {
    const ctx = montar({
      clicksignStatus: "CANCELADO",
      frentes: [{ id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_OK", concluida: true }],
    });

    const out = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(out.recuo).toMatchObject({ frenteRecuou: true });
  });
});
