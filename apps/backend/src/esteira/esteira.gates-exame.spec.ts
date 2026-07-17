import { describe, expect, it } from "vitest";
import { EsteiraService } from "./esteira.service";
import type { AuthUser } from "../auth/auth.types";
import {
  admissaoBeneficio,
  dadosVagaFolha,
  documentosAdmissao,
  exameAgendamento,
  frentesAdmissao,
  naoConformidades,
} from "../db/schema";

/**
 * GATES DO EXAME (OST 3 furos) — as duas regras mais duras da frente, antes sem rede:
 *   (a) AGENDADO exige o agendamento COMPLETO (data, horário, clínica, local, fornecedor).
 *   (b) APTO exige ASO anexado E validado pela I.A; COMUM trava, MASTER/SUPER_ADMIN liberam com
 *       confirmação explícita, gerando NC-2 + termo.
 *
 * Sem Postgres: um db falso roteia cada `select().from(tabela)` para a fixture daquela tabela e
 * grava o que foi inserido, então o teste observa o comportamento REAL do serviço (inclusive a NC).
 */

const FRENTE_ID = "frente-exame-1";
const ADMISSAO_ID = "adm-1";

interface Fixtures {
  /** Linha de `exame_agendamento` (null = nunca agendou). */
  agendamento: Record<string, unknown> | null;
  /** ASO consta ENTREGUE em `documentos_admissao`? */
  asoEntregue: boolean;
  /** Veredito da I.A gravado em `admissoes.aso_validado`. */
  asoValidado: boolean;
  /** Status atual da frente EXAME. */
  status: string;
}

/** Admissão COMPLETA de propósito: zera `pendenciasObrigatorias` e tira o aceite de passagem do
 *  caminho, deixando o teste medir só o gate. */
const ADMISSAO_COMPLETA = {
  id: ADMISSAO_ID,
  codCliente: "1001",
  cargoId: "cargo-1",
  dataAdmissao: "2026-08-01",
  tipoContrato: "Temporário",
  isBanco: false,
  consultorId: "user-consultor",
  farolGlobal: "EM_ADMISSAO",
  clicksignStatus: "SEM_ENVELOPE",
};

const VAGA_COMPLETA = {
  salario: "2000.00",
  beneficios: "VR",
  escala: "6x1",
  centroCusto: "CC-1",
  gestorBp: "Fulano",
};

function fakeDb(f: Fixtures, inseridos: { tabela: unknown; valores: unknown }[]) {
  const linhasDe = (tabela: unknown): unknown[] => {
    if (tabela === frentesAdmissao) {
      // "irmãs": só a própria EXAME (sem Cadastro nascido) — o gate do Cadastro não é o alvo aqui.
      return [{ id: FRENTE_ID, tipo: "EXAME", concluida: false }];
    }
    if (tabela === exameAgendamento) return f.agendamento ? [f.agendamento] : [];
    if (tabela === documentosAdmissao) {
      return f.asoEntregue ? [{ admissaoId: ADMISSAO_ID }] : [];
    }
    // Pacote estruturado presente (zera a pendência "Pacote de benefícios"). O serviço lê esta
    // tabela por `selectDistinct({ admissaoId })`, então a fixture devolve a chave que ele mapeia.
    if (tabela === admissaoBeneficio) return [{ admissaoId: ADMISSAO_ID, id: "ben-1" }];
    return [];
  };

  const chain = (): Record<string, unknown> => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    for (const m of ["innerJoin", "leftJoin", "orderBy", "groupBy", "limit", "where", "set"]) {
      b[m] = () => b;
    }
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(linhasDe(tabela)).then(res, rej);
    return b;
  };

  const escrita = (tabela: unknown) => {
    const b: Record<string, unknown> = {};
    b.values = (v: unknown) => {
      inseridos.push({ tabela, valores: v });
      return b;
    };
    b.set = () => b;
    b.where = () => b;
    b.onConflictDoNothing = () => b;
    b.returning = () =>
      Promise.resolve([{ id: "novo-1", status: f.status, concluida: false, dataConclusao: null }]);
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej);
    return b;
  };

  const exec = {
    select: () => chain(),
    selectDistinct: () => chain(),
    insert: (t: unknown) => escrita(t),
    update: (t: unknown) => escrita(t),
    query: {
      frentesAdmissao: {
        findFirst: async () => ({
          id: FRENTE_ID,
          admissaoId: ADMISSAO_ID,
          tipo: "EXAME",
          status: f.status,
          concluida: false,
          dataConclusao: null,
        }),
      },
      admissoes: { findFirst: async () => ADMISSAO_COMPLETA },
      dadosVagaFolha: { findFirst: async () => VAGA_COMPLETA },
      // Tipo de documento por código (ASO / TERMO_BANCO) — o docEntregueSet resolve por aqui.
      tiposDocumento: { findFirst: async () => ({ id: "tipo-aso", codigo: "ASO" }) },
    },
  } as Record<string, unknown>;
  (exec as { transaction: unknown }).transaction = async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(exec);
  return exec;
}

const regua = {
  obrigatoriosPendentesSet: async () => new Set<string>(),
  obrigatoriosPendentesCountMap: async () => new Map<string, number>(),
  faltantesObrigatorios: async () => [],
};

function montar(f: Partial<Fixtures> = {}) {
  const fixtures: Fixtures = {
    agendamento: null,
    asoEntregue: false,
    asoValidado: false,
    status: "A_AGENDAR",
    ...f,
  };
  const inseridos: { tabela: unknown; valores: unknown }[] = [];
  const db = fakeDb(fixtures, inseridos);
  // `asoValidado` mora na admissão: reflete a fixture.
  (db.query as { admissoes: { findFirst: () => Promise<unknown> } }).admissoes.findFirst =
    async () => ({ ...ADMISSAO_COMPLETA, asoValidado: fixtures.asoValidado });
  const svc = new EsteiraService(db as never, regua as never, {} as never);
  return { svc, inseridos };
}

const user = (papel: AuthUser["papel"]): AuthUser =>
  ({ id: `user-${papel}`, papel }) as unknown as AuthUser;

/** Captura o corpo do ConflictException (o Nest embrulha o objeto em `response`). */
async function capturar(p: Promise<unknown>): Promise<Record<string, unknown> | null> {
  try {
    await p;
    return null;
  } catch (e) {
    const resp = (e as { response?: unknown }).response;
    if (!resp) throw e; // erro inesperado (não é o 409 do gate): estoura em vez de mascarar
    return resp as Record<string, unknown>;
  }
}

const AGENDAMENTO_COMPLETO = {
  admissaoId: ADMISSAO_ID,
  data: "2026-07-30",
  horario: "09:00",
  nomeClinica: "Clínica Medical",
  local: "Av. Paulista, 1000",
  fornecedor: "MEDICAL",
  valor: null,
  previsaoAso: null,
  reagendamentos: 0,
};

describe("Gate (a): AGENDADO exige o agendamento completo", () => {
  it("trava quando NÃO existe agendamento, listando os 5 campos", async () => {
    const { svc } = montar({ agendamento: null });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "AGENDADO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBe("exameSemAgendamento");
    expect(err?.needsConfirmation).toBe(false);
    expect(err?.message).toContain("data");
    expect(err?.message).toContain("fornecedor");
  });

  it("FURO 1: trava com agendamento INCOMPLETO (só data), dizendo o que falta", async () => {
    // Este é o furo: a linha existe com data, mas sem os demais campos (gravada fora do modal, que
    // exige tudo). Antes o guard só olhava a data e deixava passar.
    const { svc } = montar({
      agendamento: {
        ...AGENDAMENTO_COMPLETO,
        horario: null,
        nomeClinica: null,
        local: null,
        fornecedor: null,
      },
    });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "AGENDADO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBe("exameSemAgendamento");
    const msg = String(err?.message);
    expect(msg).toContain("horário");
    expect(msg).toContain("clínica");
    expect(msg).toContain("local");
    expect(msg).toContain("fornecedor");
    // A data está preenchida: não pode ser cobrada.
    expect(msg).not.toContain("Falta preencher: data");
  });

  it("trava quando falta UM só campo (fornecedor)", async () => {
    const { svc } = montar({ agendamento: { ...AGENDAMENTO_COMPLETO, fornecedor: null } });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "AGENDADO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBe("exameSemAgendamento");
    expect(String(err?.message)).toContain("fornecedor");
  });

  it("caminho feliz: com os 5 campos PASSA (previsão do ASO e valor são opcionais)", async () => {
    // Decisão do diretor: a previsão do ASO quem informa é a clínica e pode não ter chegado ainda,
    // então ela NÃO trava o AGENDADO.
    const { svc } = montar({ agendamento: AGENDAMENTO_COMPLETO });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "AGENDADO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBeUndefined();
  });
});

describe("Gate (b): APTO exige ASO anexado e validado pela I.A", () => {
  it("COMUM sem ASO anexado: trava DURA, sem opção de liberar", async () => {
    const { svc } = montar({ status: "AGENDADO", asoEntregue: false, asoValidado: false });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "APTO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBe("aptoSemAsoValidado");
    expect(err?.needsConfirmation).toBe(false);
  });

  it("COMUM com ASO anexado mas NÃO validado pela I.A: trava DURA", async () => {
    const { svc } = montar({ status: "AGENDADO", asoEntregue: true, asoValidado: false });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "APTO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBe("aptoSemAsoValidado");
    expect(err?.needsConfirmation).toBe(false);
  });

  it("COMUM não escapa nem mandando confirmar (o bypass não é dele)", async () => {
    const { svc } = montar({ status: "AGENDADO", asoEntregue: false, asoValidado: false });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "APTO", confirmar: true } as never, user("COMUM")),
    );
    expect(err?.reason).toBe("aptoSemAsoValidado");
  });

  // O texto da NC nomeia o papel REAL de quem autorizou (antes era fixo "Super Admin", mentindo
  // quando quem liberava era um Master). A NC é registro de responsabilização: tem de dizer a
  // verdade. O `reason` do 409 segue como está: é código de fio com o front, ninguém o lê.
  const ROTULO = { MASTER: "Master", SUPER_ADMIN: "Super Admin" } as const;

  for (const papel of ["MASTER", "SUPER_ADMIN"] as const) {
    it(`${papel} sem ASO e SEM confirmar: pede autorização explícita (não passa calado)`, async () => {
      const { svc } = montar({ status: "AGENDADO", asoEntregue: false, asoValidado: false });
      const err = await capturar(
        svc.mudarStatus(FRENTE_ID, { status: "APTO" } as never, user(papel)),
      );
      expect(err?.reason).toBe("aptoSemAsoSuperAdmin");
      expect(err?.needsConfirmation).toBe(true);
    });

    it(`${papel} sem ASO COM confirmar: libera e gera NC-2 com o termo de aceite`, async () => {
      const { svc, inseridos } = montar({
        status: "AGENDADO",
        asoEntregue: false,
        asoValidado: false,
      });
      const err = await capturar(
        svc.mudarStatus(FRENTE_ID, { status: "APTO", confirmar: true } as never, user(papel)),
      );
      expect(err?.reason).toBeUndefined();
      // Rastreabilidade: a liberação vira NC-2 com o termo (§A.6, exceção autorizada e registrada).
      const nc = inseridos.find((i) => i.tabela === naoConformidades);
      expect(nc).toBeDefined();
      expect((nc?.valores as { tipo: string }).tipo).toBe("NC2");
      expect((nc?.valores as { aceiteTermo: string }).aceiteTermo).toBeTruthy();
      // O detalhe nomeia QUEM autorizou, e não o outro papel.
      const detalhe = (nc?.valores as { detalhe: string }).detalhe;
      expect(detalhe).toContain(`autorização de ${ROTULO[papel]}`);
      const outro = papel === "MASTER" ? "SUPER_ADMIN" : "MASTER";
      expect(detalhe).not.toContain(ROTULO[outro]);
    });
  }

  it("caminho feliz: ASO anexado E validado passa para QUALQUER papel, sem NC", async () => {
    const { svc, inseridos } = montar({ status: "AGENDADO", asoEntregue: true, asoValidado: true });
    const err = await capturar(
      svc.mudarStatus(FRENTE_ID, { status: "APTO" } as never, user("COMUM")),
    );
    expect(err?.reason).toBeUndefined();
    // Sem exceção, não há não conformidade a registrar.
    expect(inseridos.find((i) => i.tabela === naoConformidades)).toBeUndefined();
  });
});

// `dadosVagaFolha` é importado para o roteamento do db falso ficar explícito no arquivo.
void dadosVagaFolha;
