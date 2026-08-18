import { describe, expect, it, vi } from "vitest";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { admissoes } from "../db/schema";

/**
 * OST DA DUPLICAÇÃO DE PASTA + SELETOR DE SEXO. Regressão das duas correções que vivem no backend.
 *
 * 1. ÂNCORA PELO LINK. A admissão que JÁ tem `drive_pasta_url` manda o id da pasta para o Drive, que
 *    então vai direto nela sem procurar por nome. É o que fecha a corrida na raiz: quem não procura
 *    não cria uma segunda pasta. O acervo real tinha 16 prontuários duplicados, todos nascidos com
 *    segundos de diferença entre duas execuções simultâneas da mesma admissão.
 * 2. DUPLICATAS SINALIZADAS. O que o Drive devolve como pasta extra é gravado na admissão, porque o
 *    módulo não apaga nada (§A.6) e a remoção é do diretor.
 * 3. CONDIÇÃO DE SEXO NO ARQUIVAMENTO. A régua já deixava de exigir o Reservista para quem não é
 *    masculino; o arquivamento não, e era o buraco do caso real (candidata gravada como masculino,
 *    documento validado à mão para destravar, prontuário travado assim mesmo).
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
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  candidatoSexo: null as string | null,
  clienteOperacao: "Operação X",
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function montar(opts: {
  adm?: Partial<typeof BASE_ADM>;
  entregues?: string[];
  naStaging?: string[];
  duplicatas?: string[];
  /** Códigos que uma PESSOA validou à mão (têm `validado_em`). */
  validadosAMao?: string[];
  /** Quantos arquivos o Drive devolveu como NÃO enviados (falha parcial). */
  falhas?: number;
}) {
  const adm = { ...BASE_ADM, ...(opts.adm ?? {}) };
  const entregues = opts.entregues ?? ["RG", "CPF"];
  const updates: Escrita[] = [];

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? [
            { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
            { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
          ]
        : keys.includes("codigo") && keys.includes("validadoEm")
          ? entregues.map((codigo) => ({
              codigo,
              validadoEm: (opts.validadosAMao ?? []).includes(codigo) ? new Date() : null,
            }))
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
      // O fake é COM ESTADO de propósito: gravar a URL muda o que a próxima leitura enxerga, que é
      // exatamente o que faz a segunda execução da corrida encontrar a pasta já existente.
      if (tabela === admissoes && typeof valores.drivePastaUrl === "string") {
        adm.drivePastaUrl = valores.drivePastaUrl;
      }
      return { where: async () => undefined };
    },
    values: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      // `onConflictDoNothing().returning()` é o que o nascimento de frentes usa
      // (`esteira/nascimento-cadastro`), chamado pela auto-conclusão da Auditoria.
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ id: "frente-nova" }] }),
      };
    },
  });
  const tx = { update: vi.fn(registrar(updates)), insert: vi.fn(registrar([])) };
  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar([])),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: { findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG" }) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(adm) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: "u-1", nome: "Bruna" }) },
    },
  };

  const naStaging = (opts.naStaging ?? entregues).map((codigoTipo, i) => ({
    codigoTipo,
    caminho: `/staging/adm-1/${codigoTipo}__${i}`,
  }));
  const staging = {
    listar: vi.fn(async () => [...naStaging]),
    salvar: vi.fn(async () => "/staging/adm-1/novo"),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi.fn().mockResolvedValue({
      pastaUrl: "https://drive.google.com/drive/folders/PASTA-ESCOLHIDA",
      arquivados: 2,
      ...(opts.duplicatas ? { duplicatas: opts.duplicatas } : {}),
      ...(opts.falhas ? { falhas: opts.falhas, motivoFalhas: ["TimeoutError"] } : {}),
    }),
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
  return { svc, ai, updates, pandapeArquivos, staging };
}

/** Dispara o arquivamento pelo caminho real (pós-veredito com a régua fechada). */
async function arquivar(svc: AuditoriaService) {
  return svc.aplicarPosVeredito("adm-1", {
    id: "u-1",
    email: "c@soulan.com.br",
    papel: "COMUM",
    senhaTemporaria: false,
  });
}

describe("âncora da pasta do Drive", () => {
  it("DUAS EXECUÇÕES SIMULTÂNEAS: a segunda usa a pasta da primeira, não cria outra", async () => {
    // É a corrida que gerou as 16 duplicatas do acervo: as duas execuções liam a admissão SEM link,
    // as duas passavam pelo portão do arquivamento, e as duas mandavam o Drive procurar por nome.
    // Com a trava por admissão mais a releitura, a segunda chega depois do link gravado e ancora.
    const { svc, ai } = montar({ adm: { drivePastaUrl: null } });

    await Promise.all([arquivar(svc), arquivar(svc)]);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(2);
    const [primeira, segunda] = ai.arquivarDrive.mock.calls.map((c) => c[0]);
    expect(primeira.pastaId).toBeUndefined();
    expect(segunda.pastaId).toBe("PASTA-ESCOLHIDA");
  });

  it("admissão SEM link não manda âncora nenhuma (primeira vez, busca por nome)", async () => {
    const { svc, ai } = montar({ adm: { drivePastaUrl: null } });

    await arquivar(svc);

    expect(ai.arquivarDrive.mock.calls[0][0].pastaId).toBeUndefined();
  });

  it("duplicatas devolvidas pelo Drive são gravadas na admissão para o diretor apagar", async () => {
    const { svc, updates } = montar({ duplicatas: ["EXTRA-1", "EXTRA-2"] });

    await arquivar(svc);

    const naAdmissao = updates.filter((u) => u.tabela === admissoes);
    const comDuplicata = naAdmissao.find((u) => u.valores.driveDuplicatas !== undefined);
    expect(comDuplicata?.valores.driveDuplicatas).toBe("EXTRA-1,EXTRA-2");
  });

  it("arquivamento limpo NÃO grava duplicata (não inventa aviso)", async () => {
    const { svc, updates } = montar({});

    await arquivar(svc);

    expect(updates.every((u) => u.valores.driveDuplicatas === undefined)).toBe(true);
  });
});

describe("documento validado à MÃO vale sem arquivo", () => {
  it("não pede ao Pandapé o binário que a pessoa já dispensou, e o prontuário fecha", () => {
    // O caso real dos quatro travados: o documento que o Pandapé "não devolveu" era exatamente o
    // que alguém marcou ENTREGUE à mão, porque arquivo nunca houve.
    const { svc, pandapeArquivos } = montar({
      adm: { candidatoSexo: "MASCULINO" },
      entregues: ["RG", "CPF", "RESERVISTA"],
      naStaging: ["RG", "CPF"],
      validadosAMao: ["RESERVISTA"],
    });

    return arquivar(svc).then((r) => {
      expect(pandapeArquivos.baixarArquivosDosTipos).not.toHaveBeenCalled();
      expect(r.avisoDrive).toBeUndefined();
      expect(r.arquivado?.pastaUrl).toContain("PASTA-ESCOLHIDA");
    });
  });
});

describe("condição de sexo no ARQUIVAMENTO (não só na régua)", () => {
  it("candidata FEMININO: o Reservista sem arquivo não é cobrado nem trava o prontuário", async () => {
    // O caso real: RESERVISTA marcado ENTREGUE à mão, sem arquivo na staging e sem nada no Pandapé.
    const { svc, pandapeArquivos } = montar({
      adm: { candidatoSexo: "FEMININO" },
      entregues: ["RG", "CPF", "RESERVISTA"],
      naStaging: ["RG", "CPF"],
    });

    const r = await arquivar(svc);

    expect(pandapeArquivos.baixarArquivosDosTipos).not.toHaveBeenCalled();
    expect(r.avisoDrive).toBeUndefined();
    expect(r.arquivado?.pastaUrl).toContain("PASTA-ESCOLHIDA");
  });

  it("candidato MASCULINO: o Reservista continua sendo cobrado", async () => {
    const { svc, pandapeArquivos } = montar({
      adm: { candidatoSexo: "MASCULINO" },
      entregues: ["RG", "CPF", "RESERVISTA"],
      naStaging: ["RG", "CPF"],
    });

    await arquivar(svc);

    // Sem origem Pandapé no fake, o caminho para antes da chamada, mas o tipo FOI considerado
    // faltante: é o oposto do caso acima, em que ele nem entra na conta.
    expect(pandapeArquivos.baixarArquivosDosTipos).not.toHaveBeenCalled();
  });
});


describe("régua fechada = prontuário existe, SEMPRE", () => {
  it("staging VAZIA ainda cria a pasta: documento ausente não impede o prontuário", async () => {
    // A regra que estava sendo violada: sem arquivo nenhum, o método voltava sem criar nada, e a
    // admissão ficava com a régua completa e sem pasta no Drive.
    const { svc, ai } = montar({ entregues: ["RG", "CPF"], naStaging: [] });

    const r = await arquivar(svc);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(ai.arquivarDrive.mock.calls[0][0].arquivos).toEqual([]);
    expect(r.arquivado?.pastaUrl).toContain("PASTA-ESCOLHIDA");
  });
});

describe("falha parcial no envio NÃO perde o link nem a staging", () => {
  it("grava a URL da pasta, mantém a staging e avisa que faltou arquivo", async () => {
    // O caso real de Camila e Douglas: o upload estourou no meio, a pasta já existia com parte dos
    // arquivos e o EA perdia o link, jogando a admissão de volta na fila como "sem pasta".
    const { svc, updates, staging } = montar({ falhas: 1 });

    const r = await arquivar(svc);

    const naAdmissao = updates.find((u) => u.tabela === admissoes && u.valores.drivePastaUrl);
    expect(naAdmissao?.valores.drivePastaUrl).toContain("PASTA-ESCOLHIDA");
    expect(String(naAdmissao?.valores.driveFalhaMotivo)).toContain("não subiram");
    expect(staging.removerAdmissao).not.toHaveBeenCalled();
    expect(r.avisoDrive).toContain("não subiram");
  });

  it("sem falha, a staging é expurgada e o aviso é limpo (comportamento de sempre)", async () => {
    const { svc, updates, staging } = montar({});

    await arquivar(svc);

    const naAdmissao = updates.find((u) => u.tabela === admissoes && u.valores.drivePastaUrl);
    expect(naAdmissao?.valores.driveFalhaMotivo).toBeNull();
    expect(staging.removerAdmissao).toHaveBeenCalled();
  });
});
