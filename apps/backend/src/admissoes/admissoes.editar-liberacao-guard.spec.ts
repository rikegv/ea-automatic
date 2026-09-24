import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { AdmissoesService } from "./admissoes.service";

// Farol recalculado pós-transação é ação do SISTEMA (mockado como nos demais specs de editar). Os
// casos "bloqueia" nem chegam ao recompute (a guarda lança antes da transação); os "permite" chegam.
vi.mock("./farol", () => ({ recomputeFarolGlobal: vi.fn().mockResolvedValue("EM_ADMISSAO") }));

type Row = Record<string, unknown>;

// Setup no mesmo molde de admissoes.editar-log.spec.ts: db/tx em memória. Além dos mocks de lá,
// registramos as chamadas de tx.update/tx.insert para provar que uma edição BLOQUEADA não cria
// nada (a guarda mora ANTES da transação, então nada é escrito).
// Nome drizzle da tabela alvo de um insert/update, para provar em QUAL tabela o editar mexeu (a
// guarda garante que uma edição bloqueada não escreve em NENHUMA; a permitida nunca em `frentes`).
const nomeTabela = (t: unknown): string =>
  String((t as Record<symbol, unknown>)?.[Symbol.for("drizzle:OriginalName")] ?? "");

function montar(adm: Row, vaga: Row | undefined) {
  const updates: Row[] = [];
  const inserted: Row[] = [];
  const tabelasInseridas: string[] = [];
  const tx = {
    update: vi.fn(() => ({
      set: (v: Row) => {
        updates.push(v);
        return {
          where: () => {
            const p: Promise<undefined> & { returning?: () => Promise<Row[]> } =
              Promise.resolve(undefined);
            p.returning = async () => [{ id: adm.id, sinalizador: "OK" }];
            return p;
          },
        };
      },
    })),
    insert: vi.fn((t: unknown) => {
      tabelasInseridas.push(nomeTabela(t));
      return {
        values: (rows: Row[]) => {
          inserted.push(...rows);
          return Promise.resolve(undefined);
        },
      };
    }),
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
      // A guarda roda antes de validarLojaDoCliente (lojaId ausente nestes testes), mas o serviço
      // pode consultar lojas nos caminhos que passam; stub vazio = admissão sem loja.
      lojas: { findFirst: async () => undefined },
    },
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  const svc = new AdmissoesService(db as never);
  return { svc, updates, inserted, tabelasInseridas, tx };
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
  setor: "Operações",
  gestorBp: "Gestor",
  possuiUniforme: false,
};

describe("AdmissoesService.editar — guarda da Liberação Admissional (incidente 701dcef3)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("BLOQUEIA LIBERACAO_RECUSADA → EM_ADMISSAO (o incidente exato) e não cria frentes", async () => {
    const { svc, tx } = montar({ ...ADM_BASE, farolGlobal: "LIBERACAO_RECUSADA" }, { ...VAGA_BASE });
    await expect(svc.editar("adm-1", { farolGlobal: "EM_ADMISSAO" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    // A guarda mora antes da transação: nada foi escrito (nenhuma frente, nenhum update).
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("BLOQUEIA AGUARDANDO_LIBERACAO → EM_ADMISSAO", async () => {
    const { svc, tx } = montar(
      { ...ADM_BASE, farolGlobal: "AGUARDANDO_LIBERACAO" },
      { ...VAGA_BASE },
    );
    await expect(svc.editar("adm-1", { farolGlobal: "EM_ADMISSAO" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("BLOQUEIA um ativo (EM_ADMISSAO) → LIBERACAO_RECUSADA via editar", async () => {
    const { svc, tx } = montar({ ...ADM_BASE, farolGlobal: "EM_ADMISSAO" }, { ...VAGA_BASE });
    await expect(svc.editar("adm-1", { farolGlobal: "LIBERACAO_RECUSADA" })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("BLOQUEIA um ativo (EM_ADMISSAO) → AGUARDANDO_LIBERACAO via editar", async () => {
    const { svc, tx } = montar({ ...ADM_BASE, farolGlobal: "EM_ADMISSAO" }, { ...VAGA_BASE });
    await expect(
      svc.editar("adm-1", { farolGlobal: "AGUARDANDO_LIBERACAO" }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("PERMITE editar a folha de uma LIBERACAO_RECUSADA com farolGlobal IGUAL ao atual (o front reenvia o farol)", async () => {
    const { svc, updates, tabelasInseridas } = montar(
      { ...ADM_BASE, farolGlobal: "LIBERACAO_RECUSADA" },
      { ...VAGA_BASE },
    );
    // O modal SEMPRE manda farolGlobal; numa recusada manda o valor atual. Editar só o salário
    // não é troca de farol: passa, não cria frentes, e o farol continua LIBERACAO_RECUSADA.
    await expect(
      svc.editar("adm-1", {
        farolGlobal: "LIBERACAO_RECUSADA",
        vagaFolha: { salario: "2000" },
      }),
    ).resolves.toBeDefined();
    // Nenhuma frente foi criada: o editar só grava a admissão (e a trilha do candidato), nunca a
    // tabela `frentes` (as frentes nascem só em create/aplicarLiberacao).
    expect(tabelasInseridas).not.toContain("frentes_admissao");
    // A gravação da admissão manteve o farol de recusa.
    const admUpdate = updates.find((u) => "farolGlobal" in u);
    expect(admUpdate?.farolGlobal).toBe("LIBERACAO_RECUSADA");
  });

  it("PERMITE a transição normal EM_ADMISSAO → DECLINOU (comportamento inalterado)", async () => {
    const { svc, updates } = montar({ ...ADM_BASE, farolGlobal: "EM_ADMISSAO" }, { ...VAGA_BASE });
    await expect(svc.editar("adm-1", { farolGlobal: "DECLINOU" })).resolves.toBeDefined();
    const admUpdate = updates.find((u) => "farolGlobal" in u);
    expect(admUpdate?.farolGlobal).toBe("DECLINOU");
  });
});
