import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { admissoes, documentosAdmissao } from "../db/schema";
import { MOTIVO_DRIVE } from "../domain/drive-arquivamento";

/**
 * OST RE-BAIXAR DO PANDAPÉ NO ARQUIVAMENTO — regressão do buraco e da trava crítica.
 *
 * O BURACO, como aconteceu de verdade. O prontuário sempre foi montado a partir da STAGING efêmera,
 * que tem TTL de 48h (§A.6). A régua, porém, fecha quando fecha: um documento validado à mão dias
 * depois da coleta fechava a régua com a staging já expurgada. O arquivamento achava a pasta vazia,
 * devolvia `undefined` e ninguém era avisado: frente em "Análise Finalizada" na tela, prontuário
 * inexistente no Drive. Três admissões reais ficaram assim.
 *
 * A CORREÇÃO, e o que estes testes travam:
 *  1. o arquivamento levanta os tipos ENTREGUES, vê o que não tem arquivo e RE-BAIXA só esses;
 *  2. a VALIDAÇÃO HUMANA é intocável: re-baixar busca o binário, NÃO reaudita e NÃO escreve veredito;
 *  3. quando não conclui, o MOTIVO REAL é gravado (fim do silêncio);
 *  4. as travas de cota valem (só o que falta, uma chamada, 429 aborta sem insistir).
 *
 * A proteção da COLETA automática contra a validação humana continua sendo travada onde sempre
 * esteve, em `pandape-dedup-arquivo.spec.ts` ("a coleta AUTOMÁTICA e o LOTE NUNCA sobrescrevem
 * validação humana"): esta OST não a afrouxa, e o teste de lá segue verde sem alteração.
 */

/** Mock do DrivePastaPaiService: delega ao fallback puro (preserva o comportamento pré-tabela). */
const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
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
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null,
  driveAsoUrl: null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  clienteOperacao: "Operação X",
};

const FRENTES = [
  { id: "frente-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
  { id: "frente-exa", tipo: "EXAME", status: "APTO", concluida: true },
];

/** Uma escrita registrada pelo espião: QUAL tabela e QUAIS valores. */
interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function makeDb(opts: { entregues: string[]; idPrecollaborator?: string }) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  // O fake reconhece a query pela PROJEÇÃO pedida (mesmo truque das demais suítes de auditoria).
  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? FRENTES
        : keys.includes("estado") && keys.length === 1
          ? [{ estado: "ENTREGUE" }]
          : // Tipos ENTREGUES da admissão (insumo do re-baixar).
            keys.length === 1 && keys.includes("codigo")
            ? opts.entregues.map((codigo) => ({ codigo }))
            : // id_precollaborator da integração Pandapé.
              keys.length === 1 && keys.includes("id")
              ? opts.idPrecollaborator
                ? [{ id: opts.idPrecollaborator }]
                : []
              : // Catálogo código → nome, lido pelo arquivamento (sem `where`).
                keys.includes("codigo") && keys.includes("nome")
                ? [
                    { codigo: "RG", nome: "RG" },
                    { codigo: "CPF", nome: "CPF" },
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
      return { onConflictDoUpdate: async () => undefined };
    },
  });

  const tx = { update: vi.fn(registrar(updates)), insert: vi.fn(registrar(inserts)) };

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG", nome: "RG" }) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(ADM) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Bruna" }) },
    },
  };
  return { db, updates, inserts };
}

/** Staging COM ESTADO: `salvar` grava e `listar` devolve o que está lá agora (como o disco real). */
function makeStaging(inicial: Array<{ codigoTipo: string }> = []) {
  const arquivos = inicial.map((a, i) => ({ ...a, caminho: `/staging/adm-1/${a.codigoTipo}__${i}` }));
  return {
    arquivos,
    salvar: vi.fn(async (_adm: string, codigoTipo: string) => {
      const caminho = `/staging/adm-1/${codigoTipo}__novo-${arquivos.length}`;
      arquivos.push({ codigoTipo, caminho });
      return caminho;
    }),
    listar: vi.fn(async () => [...arquivos]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
}

function montar(opts: {
  entregues: string[];
  idPrecollaborator?: string;
  naStaging?: Array<{ codigoTipo: string }>;
  baixa?: {
    arquivos?: Array<{ codigoTipo: string; buffer: Buffer; originalname: string }>;
    semRetorno?: string[];
    abortadoPor?: "QUOTA" | "TIMEOUT" | "API_FORA" | "INERTE";
  };
}) {
  const { db, updates, inserts } = makeDb({
    entregues: opts.entregues,
    idPrecollaborator: opts.idPrecollaborator,
  });
  const staging = makeStaging(opts.naStaging ?? []);
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi
      .fn()
      .mockResolvedValue({ pastaUrl: "https://drive.google.com/drive/folders/REAL-1", arquivados: 2 }),
  };
  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa: true,
      obrigatoriosTotal: 2,
      obrigatoriosEntregues: 2,
      faltantes: [],
    }),
  };
  const pandapeArquivos = {
    baixarArquivosDosTipos: vi.fn().mockResolvedValue({
      arquivos: opts.baixa?.arquivos ?? [],
      semRetorno: opts.baixa?.semRetorno ?? [],
      ...(opts.baixa?.abortadoPor ? { abortadoPor: opts.baixa.abortadoPor } : {}),
      chamadasApi: 1,
    }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    regua as never,
    drivePastaPaiFake as never,
    pandapeArquivos as never,
  );
  return { svc, db, updates, inserts, staging, ai, pandapeArquivos };
}

/** Um anexo qualquer, com magic bytes de JPEG. Sem PII no fixture. */
const anexo = (codigoTipo: string) => ({
  codigoTipo,
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  originalname: `${codigoTipo}.jpg`,
});

/** Escritas dirigidas a `documentos_admissao`, que é o que a trava crítica proíbe. */
const emDocumentos = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === documentosAdmissao);
/** Escritas dirigidas a `admissoes`. */
const emAdmissoes = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === admissoes);

afterEach(() => vi.restoreAllMocks());

describe("O CENÁRIO DO BURACO: staging expirada, régua fechando", () => {
  it("re-baixa o que falta, arquiva sozinho e grava a pasta, em vez de falhar calado", async () => {
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
      naStaging: [], // TTL de 48h já levou tudo: é exatamente o estado das três admissões reais.
      baixa: { arquivos: [anexo("RG"), anexo("CPF")] },
    });

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    // Pediu de volta SÓ os tipos entregues que não tinham arquivo, numa chamada só.
    expect(ctx.pandapeArquivos.baixarArquivosDosTipos).toHaveBeenCalledTimes(1);
    expect(ctx.pandapeArquivos.baixarArquivosDosTipos).toHaveBeenCalledWith("PC-1", ["CPF", "RG"]);
    // O que voltou entrou na staging e seguiu o FLUXO NORMAL de arquivamento.
    expect(ctx.staging.salvar).toHaveBeenCalledTimes(2);
    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(ctx.ai.arquivarDrive.mock.calls[0][0].arquivos).toHaveLength(2);
    // A pasta foi gravada e a falha anterior, limpa.
    expect(pos.arquivado?.pastaUrl).toContain("/folders/REAL-1");
    expect(emAdmissoes(ctx.updates)).toContainEqual(
      expect.objectContaining({
        valores: expect.objectContaining({
          drivePastaUrl: "https://drive.google.com/drive/folders/REAL-1",
          driveFalhaMotivo: null,
          driveFalhaEm: null,
        }),
      }),
    );
    expect(pos.avisoDrive).toBeUndefined();
  });

  it("staging COMPLETA não chama o Pandapé (trava de cota: só o que falta)", async () => {
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
      naStaging: [{ codigoTipo: "RG" }, { codigoTipo: "CPF" }],
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.pandapeArquivos.baixarArquivosDosTipos).not.toHaveBeenCalled();
    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
  });

  it("documento FACULTATIVO entregue também é recuperado (o prontuário leva tudo)", async () => {
    const ctx = montar({
      entregues: ["RG", "CARTAO_SUS"],
      idPrecollaborator: "PC-1",
      naStaging: [{ codigoTipo: "RG" }],
      baixa: { arquivos: [anexo("CARTAO_SUS")] },
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.pandapeArquivos.baixarArquivosDosTipos).toHaveBeenCalledWith("PC-1", ["CARTAO_SUS"]);
  });
});

describe("TRAVA CRÍTICA: o re-baixar NÃO toca a validação humana", () => {
  it("nenhuma escrita em documentos_admissao no caminho do arquivamento", async () => {
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
      naStaging: [],
      baixa: { arquivos: [anexo("RG"), anexo("CPF")] },
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    // O espião é o próprio `db`: se um dia alguém fizer o re-baixar "aproveitar e reauditar",
    // aparece escrita em `documentos_admissao` aqui e este teste cai.
    expect(emDocumentos(ctx.updates)).toEqual([]);
    expect(emDocumentos(ctx.inserts)).toEqual([]);
  });

  it("nenhum campo de VEREDITO é gravado em lugar nenhum (estado, observação, validado_por/em)", async () => {
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
      naStaging: [],
      baixa: { arquivos: [anexo("RG"), anexo("CPF")] },
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    const proibidos = ["estado", "observacao", "validadoPorId", "validadoEm"];
    for (const escrita of [...ctx.updates, ...ctx.inserts]) {
      // A frente AUDITORIA tem `status`, não `estado`: a conclusão automática segue permitida.
      for (const campo of proibidos) {
        expect(Object.keys(escrita.valores)).not.toContain(campo);
      }
    }
  });

  it("a IA NÃO é chamada: re-baixar busca o binário, não pede veredito novo", async () => {
    const ctx = montar({
      entregues: ["RG"],
      idPrecollaborator: "PC-1",
      naStaging: [],
      baixa: { arquivos: [anexo("RG")] },
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.ai.auditarDocumento).not.toHaveBeenCalled();
  });
});

describe("FIM DO SILÊNCIO: todo desfecho que não conclui grava o motivo real", () => {
  it("429 do Pandapé aborta na hora, grava o motivo e NÃO insiste", async () => {
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
      naStaging: [],
      baixa: { arquivos: [], semRetorno: ["CPF", "RG"], abortadoPor: "QUOTA" },
    });

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    // Uma tentativa, nenhuma retentativa: a cota é compartilhada com o webhook da esteira (§A.5).
    expect(ctx.pandapeArquivos.baixarArquivosDosTipos).toHaveBeenCalledTimes(1);
    // Nada subiu (não se cria prontuário vazio) e o motivo REAL ficou gravado.
    expect(ctx.ai.arquivarDrive).not.toHaveBeenCalled();
    expect(emAdmissoes(ctx.updates)).toContainEqual(
      expect.objectContaining({
        valores: expect.objectContaining({ driveFalhaMotivo: MOTIVO_DRIVE.QUOTA_PANDAPE }),
      }),
    );
    expect(pos.avisoDrive).toBe(MOTIVO_DRIVE.QUOTA_PANDAPE);
  });

  it("admissão MANUAL sem arquivo acende o sinal, nomeando os tipos que faltam", async () => {
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: undefined, // sem origem Pandapé: não há de onde re-baixar.
      naStaging: [],
    });

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.pandapeArquivos.baixarArquivosDosTipos).not.toHaveBeenCalled();
    const falha = emAdmissoes(ctx.updates).find((u) => u.valores.driveFalhaMotivo);
    expect(String(falha?.valores.driveFalhaMotivo)).toContain("sem origem Pandapé");
    expect(String(falha?.valores.driveFalhaMotivo)).toContain("CPF, RG");
    expect(falha?.valores.driveFalhaEm).toBeInstanceOf(Date);
    expect(pos.avisoDrive).toBeTruthy();
  });

  it("prontuário INCOMPLETO sobe assim mesmo, e o motivo continua aceso", async () => {
    // O Pandapé devolveu o RG e não devolveu o CPF. Perder o que EXISTE seria pior, então a pasta é
    // criada com o RG e o sinal segue apontando o CPF que falta.
    const ctx = montar({
      entregues: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
      naStaging: [],
      baixa: { arquivos: [anexo("RG")], semRetorno: ["CPF"] },
    });

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(pos.arquivado?.pastaUrl).toContain("/folders/REAL-1");
    const gravacao = emAdmissoes(ctx.updates).find((u) => u.valores.drivePastaUrl);
    expect(String(gravacao?.valores.driveFalhaMotivo)).toContain("CPF");
    expect(pos.avisoDrive).toContain("CPF");
  });

  it("falha do ENVIO ao Drive vira motivo gravado, não só log", async () => {
    const ctx = montar({
      entregues: ["RG"],
      idPrecollaborator: "PC-1",
      naStaging: [{ codigoTipo: "RG" }],
    });
    ctx.ai.arquivarDrive.mockRejectedValue(new Error("500 do Google"));

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(pos.arquivado).toBeUndefined();
    const falha = emAdmissoes(ctx.updates).find((u) => u.valores.driveFalhaMotivo);
    expect(String(falha?.valores.driveFalhaMotivo)).toContain("500 do Google");
  });
});
