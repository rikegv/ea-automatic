import { describe, expect, it, vi } from "vitest";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { admissoes, candidatoAlteracoesLog } from "../db/schema";
import type { AuthUser } from "../auth/auth.types";

/**
 * PRONTUÁRIO SOB DEMANDA (ação do Diagnóstico e backfill).
 *
 * O CASO MEDIDO: a Auditoria fechada À MÃO com obrigatório pendente conclui a frente, mas o
 * arquivamento nunca dispara (o gatilho mora dentro do "régua completa"). O prontuário não nasce, e
 * nada em tela nenhuma diz isso. São 31 admissões concluídas assim.
 *
 * O que estes testes travam:
 *  1. cria a pasta com a RÉGUA ABERTA (é o caso inteiro da ferramenta);
 *  2. PRESERVA a staging, porque o binário ainda vai ser auditado e apagá-lo é irreversível;
 *  3. rodar DUAS VEZES não cria duas pastas;
 *  4. quem já tem pasta não toca no Drive;
 *  5. a trilha (quem, quando) fica em `candidato_alteracoes_log`;
 *  6. o caminho NORMAL de arquivamento continua expurgando a staging, como sempre.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

const BASE_ADM = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null as string | null,
  driveAsoUrl: null as string | null,
  driveDuplicatasBaixadas: null as string | null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  candidatoSexo: null as string | null,
  clienteOperacao: "Operação X",
};

const MASTER: AuthUser = {
  id: "u-master",
  email: "master@soulan.com.br",
  papel: "MASTER",
  senhaTemporaria: false,
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/** Régua ABERTA por padrão: é o estado real das admissões que a ferramenta atende. */
function montar(opts: { adm?: Partial<typeof BASE_ADM>; reguaCompleta?: boolean } = {}) {
  const adm = { ...BASE_ADM, ...(opts.adm ?? {}) };
  const entregues = ["RG"];
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? [{ id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false }]
        : keys.includes("codigo") && keys.includes("validadoEm")
          ? entregues.map((codigo) => ({ codigo, validadoEm: null }))
          : keys.length === 1 && keys.includes("id")
            ? []
            : keys.includes("codigo") && keys.includes("nome")
              ? entregues.map((c) => ({ codigo: c, nome: c }))
              : [adm];
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
      // Fake COM ESTADO: gravar a URL muda o que a próxima leitura enxerga, que é o que faz a
      // segunda execução encontrar a pasta já existente.
      if (tabela === admissoes && typeof valores.drivePastaUrl === "string") {
        adm.drivePastaUrl = valores.drivePastaUrl;
      }
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
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG" }) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(adm) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: "u-1", nome: "Bruna" }) },
    },
  };

  const staging = {
    listar: vi.fn(async () => [{ codigoTipo: "RG", caminho: "/staging/adm-1/RG__0" }]),
    salvar: vi.fn(async () => "/staging/adm-1/novo"),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi.fn().mockResolvedValue({
      pastaUrl: "https://drive.google.com/drive/folders/PASTA-DO-CANDIDATO",
      arquivados: 1,
    }),
  };
  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa: opts.reguaCompleta ?? false,
      obrigatoriosTotal: 2,
      obrigatoriosEntregues: opts.reguaCompleta ? 2 : 1,
      faltantes: opts.reguaCompleta ? [] : ["CTPS"],
    }),
  };
  const pandapeArquivos = {
    baixarArquivosDosTipos: vi
      .fn()
      .mockResolvedValue({ arquivos: [], semRetorno: [], chamadasApi: 1 }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    regua as never,
    drivePastaPaiFake as never,
    pandapeArquivos as never,
  );
  return { svc, ai, staging, updates, inserts };
}

describe("criar prontuário sob demanda (régua ABERTA)", () => {
  it("cria a pasta mesmo com obrigatório pendente, que é o caso inteiro da ferramenta", async () => {
    const { svc, ai } = montar({});

    const r = await svc.criarProntuarioSobDemanda("adm-1", MASTER);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.jaExistia).toBeUndefined();
    expect(r.pastaUrl).toContain("PASTA-DO-CANDIDATO");
  });

  it("PRESERVA a staging: o binário ainda vai ser auditado e apagá-lo é irreversível", async () => {
    const { svc, staging } = montar({});

    await svc.criarProntuarioSobDemanda("adm-1", MASTER);

    expect(staging.removerAdmissao).not.toHaveBeenCalled();
  });

  it("grava a URL da pasta pelo MESMO escritor do fluxo vivo (nenhuma porta nova)", async () => {
    const { svc, updates } = montar({});

    await svc.criarProntuarioSobDemanda("adm-1", MASTER);

    const naAdmissao = updates.filter((u) => u.tabela === admissoes && u.valores.drivePastaUrl);
    expect(naAdmissao).toHaveLength(1);
    expect(String(naAdmissao[0].valores.drivePastaUrl)).toContain("PASTA-DO-CANDIDATO");
  });

  it("TRILHA: quem gerou e quando ficam em candidato_alteracoes_log", async () => {
    const { svc, inserts } = montar({});

    await svc.criarProntuarioSobDemanda("adm-1", MASTER);

    const trilha = inserts.find((i) => i.tabela === candidatoAlteracoesLog);
    expect(trilha?.valores).toMatchObject({
      admissaoId: "adm-1",
      campo: "prontuario_sob_demanda",
      autorId: "u-master",
    });
  });

  it("autor NULO quando quem roda é o sistema (backfill), como a coluna já prevê", async () => {
    const { svc, inserts } = montar({});

    await svc.criarProntuarioSobDemanda("adm-1", null);

    const trilha = inserts.find((i) => i.tabela === candidatoAlteracoesLog);
    expect(trilha?.valores.autorId).toBeNull();
  });
});

describe("anti duplicação", () => {
  it("RODAR DUAS VEZES não cria duas pastas: a segunda volta como jaExistia", async () => {
    const { svc, ai } = montar({});

    const primeira = await svc.criarProntuarioSobDemanda("adm-1", MASTER);
    const segunda = await svc.criarProntuarioSobDemanda("adm-1", MASTER);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(primeira.jaExistia).toBeUndefined();
    expect(segunda.jaExistia).toBe(true);
    expect(segunda.pastaUrl).toBe(primeira.pastaUrl);
  });

  it("duas execuções SIMULTÂNEAS: a segunda ancora na pasta da primeira", async () => {
    const { svc, ai } = montar({});

    await Promise.all([
      svc.criarProntuarioSobDemanda("adm-1", MASTER),
      svc.criarProntuarioSobDemanda("adm-1", MASTER),
    ]);

    // A trava serializa e a releitura dentro dela entrega a URL já gravada: a segunda ou nem chama
    // o Drive, ou chama ancorada na mesma pasta. O que não pode é procurar por nome de novo.
    const chamadas = ai.arquivarDrive.mock.calls.map((c) => c[0]);
    expect(chamadas.slice(1).every((c) => c.pastaId === "PASTA-DO-CANDIDATO")).toBe(true);
  });

  it("admissão que JÁ tem pasta não toca no Drive e não grava trilha", async () => {
    const { svc, ai, inserts } = montar({
      adm: { drivePastaUrl: "https://drive.google.com/drive/folders/JA-EXISTE" },
    });

    const r = await svc.criarProntuarioSobDemanda("adm-1", MASTER);

    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(r).toEqual({
      ok: true,
      jaExistia: true,
      pastaUrl: "https://drive.google.com/drive/folders/JA-EXISTE",
    });
    expect(inserts.some((i) => i.tabela === candidatoAlteracoesLog)).toBe(false);
  });
});

describe("o caminho NORMAL não muda", () => {
  it("régua fechada pelo pós-veredito continua EXPURGANDO a staging, como sempre", async () => {
    const { svc, staging } = montar({ reguaCompleta: true });

    await svc.aplicarPosVeredito("adm-1", MASTER);

    expect(staging.removerAdmissao).toHaveBeenCalled();
  });
});
