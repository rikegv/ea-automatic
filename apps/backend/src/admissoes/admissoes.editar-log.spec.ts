import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AdmissoesService } from "./admissoes.service";

// Farol recalculado pós-transação é ação do SISTEMA — não gera log de usuário (OST). Mocka-se.
vi.mock("./farol", () => ({ recomputeFarolGlobal: vi.fn().mockResolvedValue("EM_ADMISSAO") }));

const USER: AuthUser = {
  id: "user-9",
  email: "c@ea.local",
  papel: "COMUM",
  senhaTemporaria: false,
};

type Row = Record<string, unknown>;

function montar(adm: Row, vaga: Row | undefined) {
  const inserted: Row[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: () => ({
        where: () => {
          const p: Promise<undefined> & { returning?: () => Promise<Row[]> } =
            Promise.resolve(undefined);
          p.returning = async () => [{ id: adm.id, sinalizador: "OK" }];
          return p;
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: (rows: Row[]) => {
        inserted.push(...rows);
        return Promise.resolve(undefined);
      },
    })),
    // §A.17 etapa 4: o `editar` passou a ler o pacote ESTRUTURADO (admissao_beneficio) para a régua
    // unificada do sinalizador. Stub vazio = admissão sem pacote estruturado, que é o caso destes
    // testes (eles cobrem a TRILHA de alteração, não os benefícios).
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({ limit: async () => [] as Row[] }),
      }),
    })),
    delete: vi.fn(() => ({ where: async () => undefined })),
  };
  const db = {
    query: {
      admissoes: { findFirst: async () => adm },
      candidatos: {
        findFirst: async () => ({
          nome: "Fulano",
          cpf: adm.candidatoCpf,
          email: "old@ea.local",
          telefone: "111",
          dataNascimento: "1990-01-01",
        }),
      },
      dadosVagaFolha: { findFirst: async () => vaga },
    },
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const svc = new AdmissoesService(db as never);
  return { svc, inserted, tx };
}

const ADM_BASE: Row = {
  id: "adm-1",
  candidatoCpf: "12345678909",
  codCliente: "C1",
  cargoId: "cargo-1",
  tipoContrato: "CLT",
  dataAdmissao: "2026-02-01",
  matricula: "M1",
  farolGlobal: "EM_ADMISSAO",
  isBanco: false,
};

const VAGA_BASE: Row = {
  salario: "1000.00",
  beneficios: "VT",
  escala: "5x2",
  centroCusto: "CC1",
  departamento: "TI",
  gestorBp: "Gestor",
  motivo: "Aumento de quadro",
  tempoContrato: "12m",
  endereco: "Rua A",
};

describe("AdmissoesService.editar — trilha de alteração de candidato (OST)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("N campos mudados → N linhas de log com autorId do usuário", async () => {
    const { svc, inserted } = montar({ ...ADM_BASE }, { ...VAGA_BASE });
    await svc.editar(
      "adm-1",
      {
        tipoContrato: "PJ", // muda
        matricula: "M2", // muda
        vagaFolha: { salario: "2000", beneficios: "VT+VR" }, // salario e beneficios mudam
      },
      USER,
    );
    const campos = inserted.map((l) => l.campo).sort();
    expect(campos).toEqual(["beneficios", "matricula", "salario", "tipoContrato"]);
    expect(inserted.every((l) => l.autorId === "user-9")).toBe(true);
    const tipo = inserted.find((l) => l.campo === "tipoContrato");
    expect(tipo?.valorAnterior).toBe("CLT");
    expect(tipo?.valorNovo).toBe("PJ");
  });

  it("campos inalterados não geram log (payload que repete os valores atuais)", async () => {
    const { svc, inserted } = montar({ ...ADM_BASE }, { ...VAGA_BASE });
    await svc.editar(
      "adm-1",
      {
        tipoContrato: "CLT", // igual
        matricula: "M1", // igual
        vagaFolha: { salario: "1000.00", beneficios: "VT" }, // iguais
      },
      USER,
    );
    expect(inserted).toHaveLength(0);
  });

  it("farolGlobal só é logado quando vem no dto (ação direta); autorId nulo sem usuário", async () => {
    const { svc, inserted } = montar({ ...ADM_BASE }, { ...VAGA_BASE });
    await svc.editar("adm-1", { farolGlobal: "DECLINOU" });
    const farol = inserted.find((l) => l.campo === "farolGlobal");
    expect(farol?.valorAnterior).toBe("EM_ADMISSAO");
    expect(farol?.valorNovo).toBe("DECLINOU");
    expect(farol?.autorId).toBeNull();
  });

  it("edita dados pessoais do candidato → loga nome/email/telefone/nascimento; CPF nunca (ajuste OST)", async () => {
    const { svc, inserted } = montar({ ...ADM_BASE }, { ...VAGA_BASE });
    await svc.editar(
      "adm-1",
      {
        candidato: {
          nome: "Fulano da Silva", // muda
          email: "novo@ea.local", // muda
          telefone: "", // limpa → null (muda)
          // dataNascimento ausente → mantém (não loga)
        },
      },
      USER,
    );
    const campos = inserted.map((l) => l.campo).sort();
    expect(campos).toEqual(["email", "nome", "telefone"]);
    const nome = inserted.find((l) => l.campo === "nome");
    expect(nome?.valorAnterior).toBe("Fulano");
    expect(nome?.valorNovo).toBe("Fulano da Silva");
    expect(inserted.find((l) => l.campo === "telefone")?.valorNovo).toBeNull();
    // CPF é identidade — NUNCA vira log.
    expect(inserted.some((l) => l.campo === "cpf")).toBe(false);
    expect(inserted.every((l) => l.autorId === "user-9")).toBe(true);
  });

  it("nenhuma mudança → não chama insert de log", async () => {
    const { svc, tx } = montar({ ...ADM_BASE }, { ...VAGA_BASE });
    await svc.editar("adm-1", {}, USER);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
