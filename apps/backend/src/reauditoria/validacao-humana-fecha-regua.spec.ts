import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { ValidacaoHumanaService } from "./validacao-humana.service";

/**
 * TESTE DE REGRESSÃO DO BLOCO 1 (OST visualização/descarte). É este arquivo que impede o buraco de
 * voltar.
 *
 * O BURACO QUE EXISTIA: `ValidacaoHumanaService.validar` gravava ENTREGUE com autor e data e parava
 * ali. `autoConcluirAuditoria` e `arquivarNoDrive` só eram chamados de dentro do `auditarConjunto`,
 * ou seja, só quando quem dava o veredito era a IA. Consequência real: validação humana que FECHAVA a
 * régua deixava a frente AUDITORIA fora de "Análise finalizada" e os documentos fora do Drive, com a
 * admissão completa e o fluxo parado, sem aviso na tela.
 *
 * Por isso o teste monta o serviço REAL de validação humana com o serviço REAL de auditoria (só o
 * banco, a staging, a IA e a régua são falsos): se alguém desligar o pós-veredito de um dos dois
 * caminhos, ou duplicar a lógica em vez de compartilhar, estes casos quebram.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const TIPO = { id: "tipo-rg", codigo: "RG", nome: "RG" };

const ADM = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null,
  driveAsoUrl: null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  clienteOperacao: "Operação X",
};

/** Frente AUDITORIA ainda em análise: é ela que precisa ser concluída ao fechar a régua. */
const FRENTE_AUDITORIA = {
  id: "frente-aud",
  tipo: "AUDITORIA",
  status: "ANALISE_PENDENTE",
  concluida: false,
};
const FRENTE_EXAME = { id: "frente-exa", tipo: "EXAME", status: "APTO", concluida: true };

function makeDb() {
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];

  // O fake reconhece a query pela PROJEÇÃO pedida (o mesmo truque das outras suítes de auditoria).
  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? [FRENTE_AUDITORIA, FRENTE_EXAME]
        : keys.includes("estado") && keys.length === 1
          ? [{ estado: "ENTREGUE" }]
          : keys.includes("codigo") && keys.includes("nome")
            ? [{ codigo: "RG", nome: "RG" }]
            : keys.includes("nome") && keys.includes("em")
              ? []
              : [ADM];
    // Thenable: o Drizzle permite `await db.select().from(x)` sem `where` (é o caso da leitura do
    // catálogo de tipos dentro do arquivamento), então o builder precisa resolver sozinho.
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  });

  const tx = {
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        updates.push(v);
        return { where: async () => undefined };
      },
    })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return Promise.resolve(undefined);
      },
    })),
  };

  const db = {
    select,
    update: vi.fn(() => ({
      set: (v: Record<string, unknown>) => {
        updates.push(v);
        return { where: async () => undefined };
      },
    })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserts.push(v);
        return {
          onConflictDoUpdate: async () => undefined,
        };
      },
    })),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue(TIPO) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "INCONFORME" }) },
      usuarios: {
        findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Ana Clara", email: USER.email }),
      },
      admissoes: { findFirst: vi.fn().mockResolvedValue(ADM) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
    },
  };
  return { db, updates, inserts };
}

/** Monta os serviços REAIS (auditoria + validação humana) sobre infraestrutura falsa. */
function montar(opts: { reguaCompleta: boolean; arquivosNaStaging?: number }) {
  const { db, updates, inserts } = makeDb();
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/adm-1/RG__uuid.jpg"),
    listar: vi.fn().mockResolvedValue(
      Array.from({ length: opts.arquivosNaStaging ?? 1 }, (_, i) => ({
        caminho: `/staging/adm-1/RG__${i}.jpg`,
        codigoTipo: "RG",
      })),
    ),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi.fn().mockResolvedValue({ pastaUrl: "https://drive.google.com/drive/folders/REAL-1" }),
  };
  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa: opts.reguaCompleta,
      obrigatoriosTotal: 6,
      obrigatoriosEntregues: opts.reguaCompleta ? 6 : 5,
      faltantes: opts.reguaCompleta ? [] : ["CPF"],
    }),
  };
  const auditoria = new AuditoriaService(db as never, staging as never, ai as never, regua as never);
  const validacao = new ValidacaoHumanaService(db as never, auditoria);
  return { validacao, auditoria, db, updates, inserts, staging, ai };
}

afterEach(() => vi.restoreAllMocks());

describe("BLOCO 1 — validação humana dispara o MESMO pós-veredito da IA", () => {
  it("validação humana que FECHA a régua conclui a frente AUDITORIA e arquiva no Drive", async () => {
    const ctx = montar({ reguaCompleta: true });

    const out = await ctx.validacao.validar("adm-1", TIPO.id, USER);

    // (a) a frente foi concluída: ANALISE_OK + concluida=true, com evento de transição registrado.
    const conclusao = ctx.updates.find((u) => u.status === "ANALISE_OK");
    expect(conclusao).toMatchObject({ status: "ANALISE_OK", concluida: true });
    expect(ctx.inserts).toContainEqual(
      expect.objectContaining({ tipo: "AUDITORIA", paraStatus: "ANALISE_OK" }),
    );
    expect(out.auditoriaAuto).toMatchObject({ status: "ANALISE_OK" });

    // (b) os documentos subiram para o Drive e a URL REAL da pasta foi gravada na admissão.
    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(out.arquivado?.pastaUrl).toContain("/folders/REAL-1");
    expect(ctx.updates).toContainEqual(
      expect.objectContaining({ drivePastaUrl: "https://drive.google.com/drive/folders/REAL-1" }),
    );

    // (c) a staging da admissão foi expurgada depois de arquivar (§A.6).
    expect(ctx.staging.removerAdmissao).toHaveBeenCalledWith("adm-1");
  });

  it("gate do Cadastro abre pela validação humana: a frente CADASTRO_CONTRATO nasce", async () => {
    const ctx = montar({ reguaCompleta: true });

    const out = await ctx.validacao.validar("adm-1", TIPO.id, USER);

    // AUDITORIA concluída agora + EXAME já concluído = gate aberto (regra 3).
    expect(out.auditoriaAuto?.gateAberto).toBe(true);
    expect(ctx.inserts).toContainEqual(
      expect.objectContaining({ tipo: "CADASTRO_CONTRATO", status: "A_CADASTRAR" }),
    );
  });

  it("validação humana que NÃO fecha a régua não conclui frente nem arquiva", async () => {
    const ctx = montar({ reguaCompleta: false });

    const out = await ctx.validacao.validar("adm-1", TIPO.id, USER);

    expect(out.auditoriaAuto).toBeUndefined();
    expect(out.arquivado).toBeUndefined();
    expect(ctx.ai.arquivarDrive).not.toHaveBeenCalled();
    expect(ctx.staging.removerAdmissao).not.toHaveBeenCalled();
    // ... mas o documento continua sendo marcado como ENTREGUE e o progresso volta para a tela.
    expect(out.documento.estado).toBe("ENTREGUE");
    expect(out.progresso).toMatchObject({ completa: false });
  });

  it("o pós-veredito é o MESMO objeto dos dois caminhos (não há lógica duplicada)", async () => {
    const ctx = montar({ reguaCompleta: true });
    const espiao = vi.spyOn(ctx.auditoria, "aplicarPosVeredito");

    await ctx.validacao.validar("adm-1", TIPO.id, USER);

    // A validação humana NÃO reimplementa conclusão/arquivamento: ela delega ao ponto comum.
    expect(espiao).toHaveBeenCalledWith("adm-1", USER);
  });

  it("pré-admissão (sem cliente/cargo) não quebra a validação humana", async () => {
    const ctx = montar({ reguaCompleta: true });
    ctx.db.query.admissoes.findFirst = vi
      .fn()
      .mockResolvedValue({ ...ADM, codCliente: null, cargoId: null });

    const out = await ctx.validacao.validar("adm-1", TIPO.id, USER);

    expect(out.documento.estado).toBe("ENTREGUE");
    expect(out.progresso).toBeUndefined();
    expect(ctx.ai.arquivarDrive).not.toHaveBeenCalled();
  });
});
