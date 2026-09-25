import "reflect-metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { admissoes } from "../db/schema";
import { MOTIVO_DRIVE } from "../domain/drive-arquivamento";

/**
 * SÓ O APROVADO SOBE AO PRONTUÁRIO, NO FLUXO INTEIRO (decisão do diretor).
 *
 * O DEFEITO, QUE ERA ATIVO EM PRODUÇÃO. O arquivamento listava TODO arquivo da pasta temporária da
 * admissão e o transformava na lista de envio ao Drive sem consultar o estado de documento nenhum.
 * Um arquivo REPROVADO pela IA, cujos bytes ainda estivessem lá quando a régua fechasse, subia ao
 * prontuário do funcionário junto com os aprovados, e nada falhava.
 *
 * A PROVA É DOS DOIS LADOS, e essa é a exigência do diretor (§A.27): o comportamento muda SÓ para o
 * reprovado; o aprovado continua subindo exatamente como antes. Um filtro que barrasse demais
 * passaria num teste que só olhasse a primeira metade.
 *
 * §A.6: nenhum dado pessoal aqui. O nome do candidato é rótulo técnico e o campo de CPF carrega um
 * marcador que não é um CPF.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

const USUARIO: AuthUser = {
  id: "u-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const ADM = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null as string | null,
  driveAsoUrl: null as string | null,
  driveDuplicatasBaixadas: null as string | null,
  candidatoNome: "CANDIDATO TESTE",
  candidatoCpf: "SEM-CPF-NO-TESTE",
  candidatoSexo: null as string | null,
  clienteOperacao: "Operação X",
};

const FRENTES = [
  { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
  { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
];

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * Harness no mesmo idioma das demais suítes de auditoria (dispatch por PROJEÇÃO no `select`).
 *
 * `entregues` é a lista de tipos com estado ENTREGUE; `naStaging` é o que está na pasta temporária.
 * A divergência entre as duas é exatamente o cenário do defeito: arquivo na pasta cujo documento
 * NÃO está entregue.
 */
function montar(opts: { entregues: string[]; naStaging: string[] }) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? FRENTES
        : keys.includes("estado") && keys.length === 1
          ? [{ estado: "ENTREGUE" }]
          : keys.includes("codigo") && keys.includes("validadoEm")
            ? opts.entregues.map((codigo) => ({ codigo, validadoEm: null }))
            : keys.length === 1 && keys.includes("id")
              ? [] // sem vínculo Pandapé: nada é re-baixado neste cenário.
              : keys.includes("codigo") && keys.includes("nome")
                ? [
                    { codigo: "RG", nome: "RG" },
                    { codigo: "CPF", nome: "CPF" },
                    { codigo: "CNH", nome: "CNH" },
                    { codigo: "CARTAO_SUS", nome: "Cartão SUS" },
                  ]
                : [ADM];
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

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ id: "frente-nova" }] }),
      };
    },
  });

  const tx = { update: vi.fn(registrar(updates)), insert: vi.fn(registrar(inserts)) };
  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    execute: vi.fn(async () => undefined),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG", nome: "RG" }) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(ADM) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: USUARIO.id, nome: "Bruna" }) },
    },
  };

  const arquivos = opts.naStaging.map((codigoTipo, i) => ({
    codigoTipo,
    caminho: `/staging/adm-1/${codigoTipo}__${i}`,
  }));
  const staging = {
    salvar: vi.fn(),
    listar: vi.fn(async () => [...arquivos]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi.fn().mockResolvedValue({
      pastaUrl: "https://drive.google.com/drive/folders/REAL-1",
      arquivados: 1,
    }),
  };
  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa: true,
      obrigatoriosTotal: 1,
      obrigatoriosEntregues: 1,
      faltantes: [],
    }),
  };
  const pandapeArquivos = {
    baixarArquivosDosTipos: vi.fn().mockResolvedValue({ arquivos: [], semRetorno: [], chamadasApi: 0 }),
  };

  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    regua as never,
    drivePastaPaiFake as never,
    pandapeArquivos as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );
  return { svc, ai, updates, staging };
}

/** Os códigos de tipo que de fato foram mandados ao Drive. */
function enviados(ai: { arquivarDrive: { mock: { calls: unknown[][] } } }): string[] {
  const lote = (ai.arquivarDrive.mock.calls[0]?.[0] as { arquivos: { stagingPath: string }[] }).arquivos;
  return lote.map((a) => a.stagingPath.split("/").pop()!.split("__")[0]!);
}

afterEach(() => vi.restoreAllMocks());

describe("O LADO QUE MUDA: o reprovado deixa de subir", () => {
  it("arquivo de documento NÃO entregue fica fora do lote, mesmo estando na pasta", async () => {
    const ctx = montar({ entregues: ["RG"], naStaging: ["RG", "CNH"] });

    await ctx.svc.aplicarPosVeredito("adm-1", USUARIO);

    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(enviados(ctx.ai)).toEqual(["RG"]);
  });

  it("FACULTATIVO reprovado também fica fora, e isso é o objetivo, não efeito colateral", async () => {
    const ctx = montar({ entregues: ["RG"], naStaging: ["RG", "CARTAO_SUS"] });

    await ctx.svc.aplicarPosVeredito("adm-1", USUARIO);

    expect(enviados(ctx.ai)).toEqual(["RG"]);
  });
});

describe("O LADO QUE NÃO MUDA: o aprovado sobe exatamente como hoje", () => {
  it("com tudo ENTREGUE, o lote inteiro vai ao Drive, na mesma ordem de sempre", async () => {
    const ctx = montar({ entregues: ["RG", "CPF"], naStaging: ["RG", "CPF"] });

    await ctx.svc.aplicarPosVeredito("adm-1", USUARIO);

    expect(enviados(ctx.ai)).toEqual(["RG", "CPF"]);
    // A pasta é gravada e o aviso anterior é limpo, como no caminho de sempre.
    expect(ctx.updates.filter((e) => e.tabela === admissoes)).toContainEqual(
      expect.objectContaining({
        valores: expect.objectContaining({
          drivePastaUrl: "https://drive.google.com/drive/folders/REAL-1",
          driveFalhaMotivo: null,
        }),
      }),
    );
  });
});

describe("A ORDEM: o filtro vem ANTES da conta de pasta vazia", () => {
  it("com TODOS reprovados, a pasta nasce assim mesmo e o motivo diz que ela veio sem arquivo", async () => {
    // Régua fechada significa prontuário criado SEMPRE (decisão do diretor). Filtrar depois da conta
    // de `semArquivos` criaria a pasta contando o reprovado como se ele estivesse lá.
    const ctx = montar({ entregues: [], naStaging: ["CNH"] });

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USUARIO);

    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(enviados(ctx.ai)).toEqual([]);
    expect(pos.avisoDrive).toBe(MOTIVO_DRIVE.PASTA_CRIADA_SEM_ARQUIVO);
  });
});

describe("O GATILHO AUTOMÁTICO: a regressão chegaria à produção sem ninguém clicar", () => {
  it("o filtro vale quando quem dispara é o SISTEMA, e não um consultor", async () => {
    // A reconciliação do Drive arquiva SOZINHA, numa varredura, com um usuário de sistema. É o
    // caminho por onde uma regressão do filtro chegaria à produção sem um clique humano no meio.
    const SISTEMA: AuthUser = {
      id: "00000000-0000-0000-0000-000000000000",
      email: "sistema@ea.local",
      papel: "SUPER_ADMIN",
      senhaTemporaria: false,
    };
    const ctx = montar({ entregues: ["RG"], naStaging: ["RG", "CNH"] });

    await ctx.svc.aplicarPosVeredito("adm-1", SISTEMA);

    expect(enviados(ctx.ai)).toEqual(["RG"]);
  });

  it("a reconciliação entra pelo MESMO método, então este arquivo cobre o caminho dela", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "diagnostico", "reconciliacao-drive.service.ts"),
      "utf-8",
    );
    expect(fonte).toContain("aplicarPosVeredito");
  });
});

describe("O FILTRO MORA EM UM LUGAR SÓ (veto da auditoria de segurança)", () => {
  // Descer o filtro para o cliente do Drive ou para a rota do serviço de IA pararia de arquivar o
  // CONTRATO ASSINADO da INT-4 (tipo fora do catálogo, nunca ENTREGUE) e o VT coletado fora da
  // régua. Os dois passam pelos mesmos dois pontos que o arquivamento da auditoria usa.
  it("o cliente do Drive não conhece estado de documento", () => {
    const fonte = readFileSync(join(__dirname, "..", "ai", "ai-client.service.ts"), "utf-8");
    expect(fonte).not.toContain("ENTREGUE");
    expect(fonte).not.toContain("somenteAprovadosVaoAoProntuario");
  });

  it("a rota de arquivamento do serviço de IA também não", () => {
    const fonte = readFileSync(
      join(__dirname, "..", "..", "..", "ai-service", "app", "routers", "drive.py"),
      "utf-8",
    );
    expect(fonte).not.toContain("ENTREGUE");
  });
});
