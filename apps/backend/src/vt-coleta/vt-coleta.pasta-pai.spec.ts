import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemColetaVt } from "../ai/ai-client.service";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { CONTRATO_FALLBACK, FOPAG_FALLBACK } from "../ai/drive-routing";
import { VtColetaService } from "./vt-coleta.service";

/**
 * A COLETA DE VT TEM DE RESOLVER A PASTA-PAI PELO MESMO RESOLVEDOR DA AUDITORIA.
 *
 * O QUE ESTA SUITE COBRA (item 1 da OST). Hoje a coleta chama `resolvePastaPaiId` (`ai/drive-routing`),
 * que enxerga apenas o `.env` e um mapa fixo em codigo com 8 chaves Fopag (16, 19, 27, 28, 29, 33, 34
 * e 44). Ela passa a chamar `DrivePastaPaiService.resolver`, que consulta a tabela `drive_pasta_pai`,
 * depois herda pela EMPRESA do vinculo (`cliente_vinculos.empresa_codigo`) e so entao cai no mapa fixo.
 *
 * MEDIDO NA PRODUCAO: o contrato Fopag tem 0 coletas bem sucedidas e 14 arquivos em ERRO, sobre 6
 * admissoes e 4 clientes (54929, 54925, 55371 e 51156). Temporario tem 95 sucessos, Terceirizado 4 e
 * Interno 1. O recorte do defeito e exatamente o Fopag, e e por isso que os testes de regressao dos
 * demais contratos estao aqui tambem.
 *
 * O RESOLVEDOR ENTRA DE VERDADE, e nao como duplo de conveniencia: as suites usam um
 * `DrivePastaPaiService` REAL sobre um drizzle falso, mesmo padrao de `ai/drive-pasta-pai.service.spec.ts`.
 * Assim o caso 54929 exercita o passo de heranca por empresa no codigo que roda em producao, em vez de
 * um `mockResolvedValue` que so repetiria a resposta esperada.
 *
 * O `await` FAZ PARTE DO CONTRATO. `resolvePastaPaiId` e sincrono e `resolver` e assincrono: uma
 * Promise nao aguardada e um objeto truthy, entao o caso "sem pasta" passaria a arquivar em lugar
 * nenhum e os demais mandariam uma Promise no `parentFolderId`. As asserces de igualdade do id e a do
 * caso 3 pegam as duas formas desse erro.
 *
 * §A.6: nenhum CPF real, nenhum nome de objeto persistido, nenhuma URL externa.
 */

const BUCKET = "bucket-vt";
/** CPF sintetico valido (nao pertence a ninguem). */
const CPF = "52998224725";

/** Pasta da empresa 33, no mapa fixo. E o destino esperado do cliente 54929 (heranca por empresa). */
const PASTA_EMPRESA_33 = FOPAG_FALLBACK["33"];
/** Pasta cadastrada na tabela para um cliente Fopag (o caso 54925 / 55371 / 51156). */
const PASTA_TABELA = "1PastaDaTabelaDoCliente_abc";

function item(over: Partial<ItemColetaVt> = {}): ItemColetaVt {
  return { id: "obj-1", md5: "md5-1", mimeType: "application/pdf", cpf: CPF, ehPdf: true, ...over };
}

function admissao(over: Record<string, unknown> = {}) {
  return {
    id: "adm-1",
    codCliente: "54929",
    cargoId: "cargo-1",
    tipoContrato: "Fopag",
    candidatoNome: "Fulano De Tal",
    clienteOperacao: "Operacao X",
    farolGlobal: "EM_ADMISSAO",
    ...over,
  };
}

/**
 * Drizzle falso do `DrivePastaPaiService`, respondendo pela ORDEM fixa das consultas do servico:
 * pasta do cliente, empresa do vinculo, pasta da empresa. Mesmo duplo de `drive-pasta-pai.service.spec.ts`.
 */
function fakeDbPastaPai(opts: { pastaDoCliente?: string; empresa?: string; pastaDaEmpresa?: string }) {
  let consultasDePasta = 0;
  return {
    select: (proj: Record<string, unknown>) => {
      const pedeEmpresa = Object.keys(proj ?? {}).includes("empresa");
      return {
        from: () => ({
          where: () => ({
            limit: async () => {
              if (pedeEmpresa) return opts.empresa ? [{ empresa: opts.empresa }] : [];
              consultasDePasta += 1;
              const alvo = consultasDePasta === 1 ? opts.pastaDoCliente : opts.pastaDaEmpresa;
              return alvo ? [{ folderId: alvo }] : [];
            },
          }),
        }),
      };
    },
  } as never;
}

/**
 * Monta a `VtColetaService` com o resolvedor novo injetado.
 *
 * O CONSTRUTOR AINDA NAO TEM ESSE PARAMETRO. O teste nasce antes do codigo (§A.40 regra 2), entao a
 * dependencia entra por DUAS portas de proposito: como ultimo argumento posicional (se o backend
 * anexar o parametro no fim, o padrao do `AuditoriaService`) e por atribuicao no campo `drivePastaPai`
 * (se ele entrar em outra posicao). A construcao passa por um cast de assinatura variadica para o
 * `tsc` nao contar argumentos nem hoje nem depois da correcao.
 */
function montar(
  opts: {
    pastaPai?: DrivePastaPaiService;
    naRegua?: boolean;
    tipoVt?: { id: string; nome: string };
  } = {},
) {
  const pastaPai = opts.pastaPai ?? new DrivePastaPaiService(fakeDbPastaPai({}));
  const ai = {
    listarColetaVt: vi.fn().mockResolvedValue({ arquivos: [] }),
    baixarColetaVt: vi.fn().mockResolvedValue({ stagingPath: "/staging/x.pdf" }),
    arquivarDrive: vi
      .fn()
      .mockResolvedValue({ pastaUrl: "https://drive/u", arquivados: 1, arquivosIds: ["arq-1"] }),
    // JSON irmao ausente: `gravarFormularioColetado` retorna cedo e nenhum teste toca o banco.
    dadosColetaVt: vi.fn().mockResolvedValue({ encontrado: false, dados: null }),
  };
  const scheduler = {
    estaLigado: vi.fn().mockResolvedValue(true),
    marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
    registrarCiclo: vi.fn().mockResolvedValue(undefined),
  };
  const auditoria = { aplicarPosVeredito: vi.fn().mockResolvedValue({}) };
  const config = { get: (k: string) => (k === "VT_COLETA_GCS_BUCKET" ? BUCKET : undefined) };
  const solicitacao = { marcarRespondida: vi.fn().mockResolvedValue(undefined) };

  const Ctor = VtColetaService as unknown as new (...args: unknown[]) => VtColetaService;
  const svc = new Ctor({}, config, ai, auditoria, scheduler, solicitacao, pastaPai);
  Object.assign(svc, { drivePastaPai: pastaPai });

  const db = {
    carregarTipoVt: vi
      .spyOn(svc, "carregarTipoVt")
      .mockResolvedValue(opts.tipoVt ?? { id: "vt-tipo", nome: "Formulario de VT" }),
    vtEstaNaRegua: vi.spyOn(svc, "vtEstaNaRegua").mockResolvedValue(opts.naRegua ?? true),
    darBaixaVt: vi.spyOn(svc, "darBaixaVt").mockResolvedValue(undefined),
    upsertLedger: vi.spyOn(svc, "upsertLedger").mockResolvedValue(undefined),
    buscarLedgerStatus: vi.spyOn(svc, "buscarLedgerStatus").mockResolvedValue(undefined),
  };
  return { svc, ai, db, pastaPai };
}

/** O `parentFolderId` que a coleta mandou para o arquivamento (o dado central desta suite). */
function pastaUsada(ai: { arquivarDrive: { mock: { calls: unknown[][] } } }): unknown {
  return (ai.arquivarDrive.mock.calls[0]?.[0] as { parentFolderId?: unknown })?.parentFolderId;
}

afterEach(() => vi.restoreAllMocks());

describe("caso 1: Fopag de cliente que resolve SO pela tabela (54925, 55371, 51156)", () => {
  it("arquiva na pasta da TABELA e grava o ledger como CASADO", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ pastaDoCliente: PASTA_TABELA }));
    const { svc, ai, db } = montar({ pastaPai });

    const r = await svc.processarMatch(item(), admissao({ codCliente: "54925" }) as never);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(pastaUsada(ai)).toBe(PASTA_TABELA);
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", admissaoId: "adm-1" }),
    );
    expect(r).toMatchObject({ status: "CASADO", novo: true, arquivado: true });
  });
});

describe("caso 2: Fopag que resolve SO pela heranca por empresa (o cliente 54929)", () => {
  /**
   * O TESTE QUE SEPARA O RESOLVEDOR CERTO DO ERRADO. O 54929 nao esta na tabela `drive_pasta_pai` e
   * nao esta no mapa fixo, mas tem vinculo Fopag ativo apontando a empresa 33, e a 33 esta no mapa.
   * O resolvedor antigo devolve null e o arquivo cai em ERRO (foi assim que os 14 arquivos pararam);
   * o novo herda a pasta da empresa e arquiva.
   */
  it("arquiva na pasta da EMPRESA do vinculo e grava o ledger como CASADO", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ empresa: "33" }));
    const { svc, ai, db } = montar({ pastaPai });

    const r = await svc.processarMatch(item(), admissao({ codCliente: "54929" }) as never);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(pastaUsada(ai)).toBe(PASTA_EMPRESA_33);
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", admissaoId: "adm-1" }),
    );
    expect(r).toMatchObject({ status: "CASADO", novo: true, arquivado: true });
  });

  it("com o VT na regua da admissao viva, a baixa acontece como em qualquer outro contrato", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ empresa: "33" }));
    const { svc, db } = montar({ pastaPai, naRegua: true });

    const r = await svc.processarMatch(item(), admissao({ codCliente: "54929" }) as never);

    expect(db.darBaixaVt).toHaveBeenCalledWith("adm-1", "vt-tipo");
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", vtNaRegua: true }),
    );
    expect(r).toMatchObject({ deuBaixa: true });
  });

  it("cadastro POR CLIENTE continua vencendo a empresa (a excecao explicita nao pode sumir)", async () => {
    const pastaPai = new DrivePastaPaiService(
      fakeDbPastaPai({ pastaDoCliente: PASTA_TABELA, empresa: "33", pastaDaEmpresa: "OUTRA_PASTA" }),
    );
    const { svc, ai } = montar({ pastaPai });

    await svc.processarMatch(item(), admissao({ codCliente: "56685" }) as never);

    expect(pastaUsada(ai)).toBe(PASTA_TABELA);
  });
});

describe("caso 3: Fopag que nao resolve por NENHUM caminho", () => {
  /**
   * ABSTER-SE E O COMPORTAMENTO SEGURO. Sem pasta-pai o arquivo NAO sobe, o ledger fica em ERRO COM o
   * `admissao_id` (e o que permite achar o caso na tela) e o objeto permanece no bucket para o proximo
   * ciclo. A correcao nao pode transformar "sem pasta" em "arquiva em lugar errado", que e exatamente
   * o que uma Promise nao aguardada faria aqui.
   */
  it("continua ERRO, sem arquivar e sem baixar da staging, com o admissao_id no ledger", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({}));
    const { svc, ai, db } = montar({ pastaPai });

    const r = await svc.processarMatch(item(), admissao({ codCliente: "99999" }) as never);

    expect(ai.baixarColetaVt).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(ai.dadosColetaVt).not.toHaveBeenCalled();
    expect(db.darBaixaVt).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "ERRO", admissaoId: "adm-1" }),
    );
    expect(r).toMatchObject({ status: "ERRO", novo: false });
  });

  it("cliente com vinculo cuja EMPRESA tambem nao tem pasta segue em ERRO", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ empresa: "37" }));
    const { svc, ai } = montar({ pastaPai });

    const r = await svc.processarMatch(item(), admissao({ codCliente: "55841" }) as never);

    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(r.status).toBe("ERRO");
  });
});

describe("caso 4: REGRESSAO dos contratos que ja funcionam", () => {
  /**
   * O RAMO `else` DO RESOLVEDOR NOVO E OUTRO. Para contrato que nao e Fopag ele consulta a tabela por
   * escopo CONTRATO e so entao cai no mapa fixo, enquanto o antigo lia env e mapa. Uma regressao
   * silenciosa caberia aqui, e ela apagaria os 95 sucessos do Temporario.
   */
  const contratos: Array<[string, string]> = [
    ["Temporário", CONTRATO_FALLBACK.temporario],
    ["Terceirizado", CONTRATO_FALLBACK.terceirizado],
    ["Interno", CONTRATO_FALLBACK.interno],
    ["Estágio", CONTRATO_FALLBACK.estagio],
    ["Jovem Aprendiz", CONTRATO_FALLBACK["jovem aprendiz"]],
  ];

  for (const [contrato, esperada] of contratos) {
    it(`${contrato}: arquiva na MESMA pasta de sempre`, async () => {
      const { svc, ai } = montar();

      const r = await svc.processarMatch(
        item(),
        admissao({ tipoContrato: contrato, codCliente: "57269" }) as never,
      );

      expect(pastaUsada(ai)).toBe(esperada);
      expect(r).toMatchObject({ status: "CASADO", arquivado: true });
    });
  }

  it("a TABELA vence o mapa fixo tambem para contrato que nao e Fopag", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ pastaDoCliente: "PASTA_CONTRATO_TABELA" }));
    const { svc, ai } = montar({ pastaPai });

    await svc.processarMatch(item(), admissao({ tipoContrato: "Temporário", codCliente: "57269" }) as never);

    expect(pastaUsada(ai)).toBe("PASTA_CONTRATO_TABELA");
  });

  it("contrato vazio ou nao mapeado continua em ERRO, sem arquivar", async () => {
    const { svc, ai } = montar();

    const r = await svc.processarMatch(item(), admissao({ tipoContrato: "42" }) as never);

    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(r.status).toBe("ERRO");
  });
});

describe("a resolucao passa pelo servico novo, e o resultado e aguardado", () => {
  it("chama `DrivePastaPaiService.resolver` com o contrato e o cliente da admissao", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ empresa: "33" }));
    const espia = vi.spyOn(pastaPai, "resolver");
    const { svc } = montar({ pastaPai });

    await svc.processarMatch(item(), admissao({ codCliente: "54929" }) as never);

    expect(espia).toHaveBeenCalledWith("Fopag", "54929");
  });

  it("o `parentFolderId` entregue ao arquivamento e uma string, nunca uma Promise", async () => {
    const pastaPai = new DrivePastaPaiService(fakeDbPastaPai({ empresa: "33" }));
    const { svc, ai } = montar({ pastaPai });

    await svc.processarMatch(item(), admissao({ codCliente: "54929" }) as never);

    expect(typeof pastaUsada(ai)).toBe("string");
  });
});
