import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AdmissoesService } from "./admissoes.service";

/**
 * ═══ O SELO DA AUDITORIA DO SALÁRIO, NO `editar` DE VERDADE (migration 0140) ══════════════════
 *
 * Regra permanente do diretor: **nenhum salário é gravado na folha sem auditoria do time.** Declarar a
 * unidade É o ato de auditoria, então o `editar` precisa carimbar `salario_unidade`,
 * `salario_auditado_em` e `salario_auditado_por` **no mesmo gesto** em que a unidade é escolhida.
 *
 * ┌─ O DEFEITO QUE SÓ APARECE AQUI, e não no teste do helper ─────────────────────────────────────┐
 * │ O lápis do Gerenciador PRÉ-PREENCHE a unidade e a devolve em TODO salvamento. O helper puro já   │
 * │ sabe não recarimbar quando nada mudou, mas só este teste prova que o SERVIÇO lhe passa o estado  │
 * │ ANTERIOR: passando `null` por engano, o helper carimbaria sempre, a data do selo avançaria       │
 * │ sozinha e o autor viraria quem só trocou o centro de custo. Auditoria que ninguém fez, assinada  │
 * │ por quem não a fez, e nada falharia.                                                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O harness CAPTURA o patch de `.set()` (o da trilha, `admissoes.editar-log.spec.ts`, o descarta).
 *
 * §A.6: nenhum assert abaixo usa CPF, nome ou valor de remuneração como esperado, e o salário só
 * aparece como gatilho da invalidação.
 */
vi.mock("./farol", () => ({ recomputeFarolGlobal: vi.fn().mockResolvedValue("EM_ADMISSAO") }));

const USER: AuthUser = {
  id: "user-auditor",
  email: "c@ea.local",
  papel: "COMUM",
  senhaTemporaria: false,
};

type Row = Record<string, unknown>;

function montar(vaga: Row | undefined) {
  /** Todo patch de `.set()` da transação, na ordem. O da folha é o que tem `escala`. */
  const patches: Row[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: (patch: Row) => {
        patches.push(patch);
        return {
          where: () => {
            const p: Promise<undefined> & { returning?: () => Promise<Row[]> } =
              Promise.resolve(undefined);
            p.returning = async () => [{ id: "adm-1", sinalizador: "OK" }];
            return p;
          },
        };
      },
    })),
    insert: vi.fn(() => ({ values: () => Promise.resolve(undefined) })),
    select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [] as Row[] }) }) })),
    delete: vi.fn(() => ({ where: async () => undefined })),
  };
  const db = {
    query: {
      admissoes: {
        findFirst: async () => ({
          id: "adm-1",
          candidatoCpf: "12345678909",
          codCliente: "C1",
          cargoId: "cargo-1",
          tipoContrato: "Temporário",
          dataAdmissao: "2026-02-01",
          farolGlobal: "EM_ADMISSAO",
          isBanco: false,
        }),
      },
      candidatos: { findFirst: async () => ({ nome: "Fulano", cpf: "12345678909" }) },
      dadosVagaFolha: { findFirst: async () => vaga },
    },
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const svc = new AdmissoesService(db as never);
  /** O patch da folha: é o único que carrega `escala`. */
  const patchDaFolha = () => patches.find((p) => "escala" in p);
  return { svc, patchDaFolha };
}

const VAGA_SEM_SELO: Row = {
  salario: "9.34",
  escala: "12x36",
  salarioUnidade: null,
  jornadaHorasMes: null,
  jornadaHorasSem: null,
  salarioAuditadoEm: null,
  salarioAuditadoPor: null,
};

const VAGA_COM_SELO: Row = {
  salario: "9.34",
  escala: "12x36",
  salarioUnidade: "HORA",
  jornadaHorasMes: "220.00",
  jornadaHorasSem: "44.00",
  salarioAuditadoEm: new Date("2026-09-30T10:00:00.000Z"),
  salarioAuditadoPor: "outro-usuario",
};

describe("AdmissoesService.editar: a unidade do salário CARIMBA o selo (0140)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("DECLARAR a unidade grava as colunas E carimba autor e data", async () => {
    const { svc, patchDaFolha } = montar({ ...VAGA_SEM_SELO });
    const antes = Date.now();
    await svc.editar(
      "adm-1",
      { vagaFolha: { escala: "12x36", salarioUnidade: "HORA", jornadaHorasMes: 220, jornadaHorasSem: 44 } },
      USER,
    );
    const p = patchDaFolha();
    expect(p?.salarioUnidade).toBe("HORA");
    expect(p?.jornadaHorasMes).toBe("220.00");
    expect(p?.jornadaHorasSem).toBe("44.00");
    expect(p?.salarioAuditadoPor).toBe("user-auditor");
    expect((p?.salarioAuditadoEm as Date).getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("⚠️ salvar SEM tocar na unidade NÃO recarimba: o selo de quem auditou antes permanece", async () => {
    /**
     * O caso do lápis: a tela pré-preencheu a unidade e a devolveu junto de uma troca de centro de
     * custo. As cinco chaves ficam AUSENTES do patch, que no Drizzle é "não toque nesta coluna".
     */
    const { svc, patchDaFolha } = montar({ ...VAGA_COM_SELO });
    await svc.editar(
      "adm-1",
      {
        vagaFolha: {
          escala: "12x36",
          centroCusto: "CC-9",
          salarioUnidade: "HORA",
          jornadaHorasMes: 220,
          jornadaHorasSem: 44,
        },
      },
      USER,
    );
    const p = patchDaFolha();
    expect(p?.centroCusto).toBe("CC-9");
    expect("salarioUnidade" in (p ?? {})).toBe(false);
    expect("salarioAuditadoEm" in (p ?? {})).toBe(false);
    expect("salarioAuditadoPor" in (p ?? {})).toBe(false);
    expect("jornadaHorasMes" in (p ?? {})).toBe(false);
  });

  it("TROCAR a unidade carimba de novo com o autor de agora, e LIMPA a jornada de horista", async () => {
    const { svc, patchDaFolha } = montar({ ...VAGA_COM_SELO });
    await svc.editar("adm-1", { vagaFolha: { escala: "12x36", salarioUnidade: "MENSAL" } }, USER);
    const p = patchDaFolha();
    expect(p?.salarioUnidade).toBe("MENSAL");
    expect(p?.jornadaHorasMes).toBeNull();
    expect(p?.jornadaHorasSem).toBeNull();
    expect(p?.salarioAuditadoPor).toBe("user-auditor");
  });

  it("MUDAR O SALÁRIO SEM declarar unidade ZERA o selo (a edição não sai lavada)", async () => {
    /** A invalidação continua valendo: sem declaração nova, o carimbo de ontem não certifica o valor novo. */
    const { svc, patchDaFolha } = montar({ ...VAGA_COM_SELO });
    await svc.editar("adm-1", { vagaFolha: { escala: "12x36", salario: "2000" } }, USER);
    const p = patchDaFolha();
    expect(p?.salario).toBe("2000");
    expect(p?.salarioUnidade).toBeNull();
    expect(p?.salarioAuditadoEm).toBeNull();
    expect(p?.salarioAuditadoPor).toBeNull();
  });

  it("corrigir o salário E declarar a unidade no MESMO gesto: a declaração vence a invalidação", async () => {
    /**
     * A ordem documentada no helper. É o fluxo real da correção dos 9,34: o time conserta o valor e
     * declara que ele é de HORA, e esse gesto único É a auditoria.
     */
    const { svc, patchDaFolha } = montar({ ...VAGA_COM_SELO });
    await svc.editar(
      "adm-1",
      { vagaFolha: { escala: "12x36", salario: "2000", salarioUnidade: "MENSAL" } },
      USER,
    );
    const p = patchDaFolha();
    expect(p?.salario).toBe("2000");
    expect(p?.salarioUnidade).toBe("MENSAL");
    expect(p?.salarioAuditadoPor).toBe("user-auditor");
    expect(p?.salarioAuditadoEm).toBeInstanceOf(Date);
  });
});
