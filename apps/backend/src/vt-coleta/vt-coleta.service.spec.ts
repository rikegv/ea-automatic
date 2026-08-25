import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItemColetaVt } from "../ai/ai-client.service";
import { VtColetaService } from "./vt-coleta.service";

/**
 * QA do NÚCLEO da coleta de VT (§A.17 etapa 3 / GCS). Foco: o casamento por CPF, a idempotência por
 * (md5, origem) e a regra da baixa (só quando o FORMULARIO_VT está na régua). O ai-service é MOCKADO
 * (nada de bucket real); os acessos ao banco são ESPIADOS (métodos isolados na service exatamente
 * para isto), então nenhum teste toca banco. §A.6: os testes não usam CPF/nome real como asserção
 * sensível, e o nome do objeto (id) nunca é persistido.
 */

const CPF = "52998224725";

/** Nome do bucket usado nos testes ligados. */
const BUCKET = "bucket-vt";

function item(over: Partial<ItemColetaVt> = {}): ItemColetaVt {
  return {
    id: "file-1",
    md5: "md5-1",
    mimeType: "application/pdf",
    cpf: CPF,
    ehPdf: true,
    ...over,
  };
}

function admissao(over: Record<string, unknown> = {}) {
  return {
    id: "adm-1",
    codCliente: "16",
    cargoId: "cargo-1",
    tipoContrato: "Interno", // mapeia para uma pasta-pai de fallback (resolvePastaPaiId não-nulo).
    candidatoNome: "Fulano De Tal",
    clienteOperacao: "Operacao X",
    ...over,
  };
}

function montar(
  parts: {
    ai?: Record<string, unknown>;
    config?: (k: string) => unknown;
  } = {},
) {
  const ai = {
    listarColetaVt: vi.fn().mockResolvedValue({ arquivos: [] }),
    baixarColetaVt: vi.fn().mockResolvedValue({ stagingPath: "/staging/x.pdf" }),
    arquivarDrive: vi.fn().mockResolvedValue({ pastaUrl: "https://drive/u", arquivados: 1 }),
    ...parts.ai,
  };
  const scheduler = {
    estaLigado: vi.fn().mockResolvedValue(true),
    marcarInicioCiclo: vi.fn().mockResolvedValue(undefined),
    registrarCiclo: vi.fn().mockResolvedValue(undefined),
  };
  const auditoria = { aplicarPosVeredito: vi.fn().mockResolvedValue({}) };
  const config = {
    get:
      parts.config ??
      ((k: string) => (k === "VT_COLETA_GCS_BUCKET" ? BUCKET : undefined)),
  };
  const svc = new VtColetaService(
    {} as never,
    config as never,
    ai as never,
    auditoria as never,
    scheduler as never,
    // Serviço de SOLICITAÇÃO: duplo mínimo. Fechar o pedido é trilha, não a entrega, então o que
    // importa aqui é que a gravação do formulário não dependa dele para acontecer.
    { marcarRespondida: vi.fn().mockResolvedValue(undefined) } as never,
  );
  return { svc, ai, scheduler, auditoria };
}

/** Espia os acessos ao banco da service, para nenhum teste tocar o banco de verdade. */
function spyDb(
  svc: VtColetaService,
  over: {
    ledger?: string | undefined;
    matches?: Array<Record<string, unknown>>;
    tipoVt?: { id: string; nome: string } | undefined;
    naRegua?: boolean;
  } = {},
) {
  const buscarLedgerStatus = vi.spyOn(svc, "buscarLedgerStatus").mockResolvedValue(over.ledger);
  const buscarMatches = vi
    .spyOn(svc, "buscarMatches")
    .mockResolvedValue((over.matches ?? []) as never);
  const carregarTipoVt = vi
    .spyOn(svc, "carregarTipoVt")
    .mockResolvedValue(over.tipoVt ?? { id: "vt-tipo", nome: "Formulario de VT" });
  const vtEstaNaRegua = vi.spyOn(svc, "vtEstaNaRegua").mockResolvedValue(over.naRegua ?? false);
  const darBaixaVt = vi.spyOn(svc, "darBaixaVt").mockResolvedValue(undefined);
  const upsertLedger = vi.spyOn(svc, "upsertLedger").mockResolvedValue(undefined);
  return {
    buscarLedgerStatus,
    buscarMatches,
    carregarTipoVt,
    vtEstaNaRegua,
    darBaixaVt,
    upsertLedger,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("processarItem", () => {
  it("(a) 1 casamento com VT na régua: arquiva e dá baixa", async () => {
    const { svc, ai } = montar();
    const db = spyDb(svc, { matches: [admissao()], naRegua: true });

    const r = await svc.processarItem(item());

    expect(ai.baixarColetaVt).toHaveBeenCalledWith(BUCKET, "file-1");
    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    const payload = ai.arquivarDrive.mock.calls[0][0];
    expect(payload.arquivos[0].subpasta).toBe("BENEFICIOS");
    expect(payload.arquivos[0].nomeFinal).toContain("Formulario de VT_");
    expect(db.darBaixaVt).toHaveBeenCalledWith("adm-1", "vt-tipo");
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", admissaoId: "adm-1", vtNaRegua: true }),
    );
    expect(r).toMatchObject({ status: "CASADO", novo: true, arquivado: true, deuBaixa: true });
  });

  it("(b) 1 casamento com VT FORA da régua: arquiva, não dá baixa, não cria documento", async () => {
    const { svc, ai } = montar();
    const db = spyDb(svc, { matches: [admissao()], naRegua: false });

    const r = await svc.processarItem(item());

    expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(db.darBaixaVt).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "CASADO", vtNaRegua: false }),
    );
    expect(r).toMatchObject({ status: "CASADO", deuBaixa: false });
  });

  it("(c) 0 casamentos: SEM_ADMISSAO, sem arquivar", async () => {
    const { svc, ai } = montar();
    const db = spyDb(svc, { matches: [] });

    const r = await svc.processarItem(item());

    expect(ai.baixarColetaVt).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "SEM_ADMISSAO" }),
    );
    expect(r.status).toBe("SEM_ADMISSAO");
  });

  it("(d) mais de um casamento: MULTIPLO, sem arquivar", async () => {
    const { svc, ai } = montar();
    const db = spyDb(svc, { matches: [admissao(), admissao({ id: "adm-2" })] });

    const r = await svc.processarItem(item());

    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "MULTIPLO" }),
    );
    expect(r.status).toBe("MULTIPLO");
  });

  it("(e) não-PDF: NAO_PDF, nem tenta casar", async () => {
    const { svc, ai } = montar();
    const db = spyDb(svc);

    const r = await svc.processarItem(item({ ehPdf: false, mimeType: "image/png" }));

    expect(db.buscarMatches).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "NAO_PDF" }),
    );
    expect(r.status).toBe("NAO_PDF");
  });

  it("(f) CPF ausente no nome: NOME_FORA_PADRAO", async () => {
    const { svc } = montar();
    const db = spyDb(svc);

    const r = await svc.processarItem(item({ cpf: null }));

    expect(db.buscarMatches).not.toHaveBeenCalled();
    expect(db.upsertLedger).toHaveBeenCalledWith(
      "md5-1",
      expect.objectContaining({ status: "NOME_FORA_PADRAO" }),
    );
    expect(r.status).toBe("NOME_FORA_PADRAO");
  });

  it("(g) md5 já CASADO: pulado (idempotência), sem re-arquivar nem reescrever o ledger", async () => {
    const { svc, ai } = montar();
    const db = spyDb(svc, { ledger: "CASADO" });

    const r = await svc.processarItem(item());

    expect(db.buscarMatches).not.toHaveBeenCalled();
    expect(ai.baixarColetaVt).not.toHaveBeenCalled();
    expect(ai.arquivarDrive).not.toHaveBeenCalled();
    expect(db.upsertLedger).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: "CASADO", novo: false, jaProcessado: true });
  });
});

describe("rodarCiclo", () => {
  it("(h) INERTE sem VT_COLETA_GCS_BUCKET: não lista o bucket, bate o heartbeat com nota", async () => {
    const { svc, ai, scheduler } = montar({ config: () => undefined });

    await svc.rodarCiclo();

    expect(ai.listarColetaVt).not.toHaveBeenCalled();
    expect(scheduler.marcarInicioCiclo).toHaveBeenCalledTimes(1);
    const arg = scheduler.registrarCiclo.mock.calls[0][0];
    expect(arg.varridas).toBe(0);
    expect(arg.nota).toMatch(/bucket coletivo não configurado/i);
  });

  it("ligado com bucket configurado: lista o bucket e processa cada item", async () => {
    const arquivos = [item({ id: "f1", md5: "m1" }), item({ id: "f2", md5: "m2", ehPdf: false })];
    const { svc, ai, scheduler } = montar({
      ai: { listarColetaVt: vi.fn().mockResolvedValue({ arquivos }) },
      config: (k: string) => (k === "VT_COLETA_GCS_BUCKET" ? BUCKET : undefined),
    });
    const processar = vi
      .spyOn(svc, "processarItem")
      .mockResolvedValue({ status: "SEM_ADMISSAO", novo: false });

    await svc.rodarCiclo();

    expect(ai.listarColetaVt).toHaveBeenCalledWith(BUCKET);
    expect(processar).toHaveBeenCalledTimes(2);
    const arg = scheduler.registrarCiclo.mock.calls[0][0];
    expect(arg.varridas).toBe(2);
  });
});
