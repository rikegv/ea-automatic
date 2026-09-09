import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemColetaVt } from "../ai/ai-client.service";
import { DrivePastaPaiService } from "../ai/drive-pasta-pai.service";
import { VtColetaService } from "./vt-coleta.service";

/**
 * O QUE A TROCA DO RESOLVEDOR DE PASTA-PAI NAO PODE MEXER (item 1 da OST, guarda de regressao).
 *
 * DUAS INVARIANTES, as duas dentro do MESMO `processarMatch` que vai ser editado:
 *
 * 1. A ORDEM. O arquivamento no Drive acontece ANTES de `gravarFormularioColetado`, e nao por gosto:
 *    o PDF no Drive e a entrega que nao pode falhar, e os campos estruturados sao o complemento que a
 *    tela de Beneficios soma. Gravar antes faria uma falha do JSON irmao decidir sobre o arquivamento.
 *    A URL do arquivo, alias, so existe depois que o arquivamento devolve o id.
 *
 * 2. ADMISSAO CONCLUIDA ARQUIVA E GRAVA, MAS NAO DA BAIXA NA REGUA. O `const admissaoViva` existe
 *    porque `darBaixaVt` chama `aplicarPosVeredito`, que recalcula sinalizador e progresso e, fechando
 *    a regua obrigatoria, CONCLUI A AUDITORIA sozinha, abre o gate do Cadastro e reavalia o farol.
 *    Numa admissao ja encerrada isso mexeria em frente e farol de quem so queria corrigir o endereco.
 *
 * O RECORTE FOPAG ESTA AQUI DE PROPOSITO. Ate a correcao, nenhuma admissao Fopag chegava a este
 * trecho (parava no ERRO da pasta-pai), entao as duas invariantes nunca foram exercitadas naquele
 * caminho. Passam a ser: cada uma tem uma versao Fopag (o cliente 54929, que so resolve pela heranca
 * por empresa) e uma versao Temporario.
 *
 * §A.6: nenhum CPF real e nenhum nome de objeto persistido.
 */

const BUCKET = "bucket-vt";
const CPF = "52998224725";

function item(over: Partial<ItemColetaVt> = {}): ItemColetaVt {
  return { id: "obj-1", md5: "md5-1", mimeType: "application/pdf", cpf: CPF, ehPdf: true, ...over };
}

function admissao(over: Record<string, unknown> = {}) {
  return {
    id: "adm-1",
    codCliente: "57269",
    cargoId: "cargo-1",
    tipoContrato: "Temporário",
    candidatoNome: "Fulano De Tal",
    clienteOperacao: "Operacao X",
    farolGlobal: "EM_ADMISSAO",
    ...over,
  };
}

/** Fopag do cliente 54929: sem cadastro proprio, herda a pasta da empresa 33 do vinculo. */
const FOPAG_54929 = { tipoContrato: "Fopag", codCliente: "54929" };

/** Drizzle falso do resolvedor, na ordem fixa das consultas: cliente, empresa do vinculo, empresa. */
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
 * Mesma montagem do `vt-coleta.pasta-pai.spec.ts`: a dependencia nova entra por duas portas (ultimo
 * argumento posicional e campo `drivePastaPai`), porque o construtor ainda nao a declara.
 */
function montar(
  opts: {
    naRegua?: boolean;
    dadosColetaVt?: ReturnType<typeof vi.fn>;
    /** Estado do resolvedor. O default e o do 54929: sem cadastro proprio, empresa 33 no vinculo. */
    pastaPaiOpts?: { pastaDoCliente?: string; empresa?: string; pastaDaEmpresa?: string };
  } = {},
) {
  const pastaPai = new DrivePastaPaiService(fakeDbPastaPai(opts.pastaPaiOpts ?? { empresa: "33" }));
  const ai = {
    listarColetaVt: vi.fn().mockResolvedValue({ arquivos: [] }),
    baixarColetaVt: vi.fn().mockResolvedValue({ stagingPath: "/staging/x.pdf" }),
    arquivarDrive: vi
      .fn()
      .mockResolvedValue({ pastaUrl: "https://drive/u", arquivados: 1, arquivosIds: ["arq-1"] }),
    dadosColetaVt: opts.dadosColetaVt ?? vi.fn().mockResolvedValue({ encontrado: false, dados: null }),
  };
  const config = { get: (k: string) => (k === "VT_COLETA_GCS_BUCKET" ? BUCKET : undefined) };
  const Ctor = VtColetaService as unknown as new (...args: unknown[]) => VtColetaService;
  const svc = new Ctor(
    {},
    config,
    ai,
    { aplicarPosVeredito: vi.fn().mockResolvedValue({}) },
    {
      estaLigado: vi.fn().mockResolvedValue(true),
      marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
      registrarCiclo: vi.fn().mockResolvedValue(undefined),
    },
    { marcarRespondida: vi.fn().mockResolvedValue(undefined) },
    pastaPai,
  );
  Object.assign(svc, { drivePastaPai: pastaPai });

  const db = {
    carregarTipoVt: vi
      .spyOn(svc, "carregarTipoVt")
      .mockResolvedValue({ id: "vt-tipo", nome: "Formulario de VT" }),
    vtEstaNaRegua: vi.spyOn(svc, "vtEstaNaRegua").mockResolvedValue(opts.naRegua ?? true),
    darBaixaVt: vi.spyOn(svc, "darBaixaVt").mockResolvedValue(undefined),
    upsertLedger: vi.spyOn(svc, "upsertLedger").mockResolvedValue(undefined),
  };
  return { svc, ai, db };
}

afterEach(() => vi.restoreAllMocks());

describe("a ordem do arquivamento nao inverte", () => {
  it("Temporario: baixa da staging, arquiva no Drive e SO ENTAO grava os campos estruturados", async () => {
    const { svc, ai, db } = montar();

    await svc.processarMatch(item(), admissao() as never);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(ai.dadosColetaVt).toHaveBeenCalledTimes(1);
    const baixa = ai.baixarColetaVt.mock.invocationCallOrder[0];
    const arquiva = ai.arquivarDrive.mock.invocationCallOrder[0];
    const grava = ai.dadosColetaVt.mock.invocationCallOrder[0];
    const ledger = db.upsertLedger.mock.invocationCallOrder[0];
    expect(baixa).toBeLessThan(arquiva);
    expect(arquiva).toBeLessThan(grava);
    expect(grava).toBeLessThan(ledger);
  });

  it("Fopag do 54929: mesma ordem no caminho que a correcao acabou de abrir", async () => {
    const { svc, ai } = montar();

    await svc.processarMatch(item(), admissao(FOPAG_54929) as never);

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(ai.dadosColetaVt).toHaveBeenCalledTimes(1);
    expect(ai.arquivarDrive.mock.invocationCallOrder[0]).toBeLessThan(
      ai.dadosColetaVt.mock.invocationCallOrder[0],
    );
  });

  it("falha ao gravar os campos estruturados NAO derruba o arquivamento nem o ledger", async () => {
    const { svc, db } = montar({
      dadosColetaVt: vi.fn().mockRejectedValue(new Error("json irmao indisponivel")),
    });

    const r = await svc.processarMatch(item(), admissao(FOPAG_54929) as never);

    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", admissaoId: "adm-1" }),
    );
    expect(r).toMatchObject({ status: "CASADO", arquivado: true });
  });
});

describe("admissao CONCLUIDA arquiva e grava, mas nao da baixa na regua", () => {
  it("Temporario concluido: arquiva, grava, e nao toca na regua nem no pos veredito", async () => {
    const { svc, ai, db } = montar({ naRegua: true });

    const r = await svc.processarMatch(
      item(),
      admissao({ farolGlobal: "ADMISSAO_CONCLUIDA" }) as never,
    );

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(ai.dadosColetaVt).toHaveBeenCalledTimes(1);
    expect(db.darBaixaVt).not.toHaveBeenCalled();
    expect(db.vtEstaNaRegua).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", vtNaRegua: false }),
    );
    expect(r).toMatchObject({ status: "CASADO", arquivado: true, deuBaixa: false });
  });

  it("Fopag do 54929 concluido: a pasta passou a resolver, a baixa segue bloqueada", async () => {
    const { svc, ai, db } = montar({ naRegua: true });

    const r = await svc.processarMatch(
      item(),
      admissao({ ...FOPAG_54929, farolGlobal: "ADMISSAO_CONCLUIDA" }) as never,
    );

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(db.darBaixaVt).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: "CASADO", arquivado: true, deuBaixa: false });
  });

  it("admissao VIVA com o VT na regua continua dando baixa (a guarda nao pode virar bloqueio geral)", async () => {
    const { svc, db } = montar({ naRegua: true });

    const r = await svc.processarMatch(item(), admissao({ farolGlobal: "EM_ADMISSAO" }) as never);

    expect(db.darBaixaVt).toHaveBeenCalledWith("adm-1", "vt-tipo");
    expect(r).toMatchObject({ deuBaixa: true });
  });

  it("sem pasta-pai, admissao concluida tambem nao arquiva nem grava (ERRO com admissao_id)", async () => {
    // Sem cadastro do cliente e SEM vinculo: nao ha por onde herdar, entao o resolvedor devolve null.
    const { svc, ai, db } = montar({ naRegua: true, pastaPaiOpts: {} });

    const r = await svc.processarMatch(
      item(),
      admissao({ tipoContrato: "Fopag", codCliente: "99999", farolGlobal: "ADMISSAO_CONCLUIDA" }) as never,
    );

    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(ai.dadosColetaVt).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "ERRO", admissaoId: "adm-1" }),
    );
    expect(r.status).toBe("ERRO");
  });
});
