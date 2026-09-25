import { describe, expect, it } from "vitest";
import {
  admissaoVivaParaRecuo,
  MENSAGEM_RECUSA_REABERTURA,
  podeReabrirDocumento,
} from "./reabertura-documento";

/**
 * A GUARDA DA REABERTURA, em função pura.
 *
 * O que esta suíte trava:
 *  - envelope VIVO (aguardando ou assinado) recusa, e diz por quê;
 *  - envelope MORTO (cancelado, expirado) libera, porque o reenvio por correção depende disso;
 *  - o KIT na fila recusa mesmo com `SEM_ENVELOPE`, que é o furo que o teste de status sozinho
 *    deixaria passar;
 *  - o farol NÃO participa da decisão (é flag manual até a INT-4, §A.3);
 *  - admissão finalizada e encerrada não entram no recuo (§A.16/§A.19).
 */

const LIVRE = { clicksignStatus: "SEM_ENVELOPE", kitAssinaturaPath: null, kitAssinaturaEm: null };

describe("podeReabrirDocumento() — a guarda por clicksign_status", () => {
  it("libera quando não há envelope e não há kit na fila", () => {
    expect(podeReabrirDocumento(LIVRE)).toEqual({ pode: true });
  });

  it("libera quando a admissão nunca teve status de envelope gravado (nulo)", () => {
    expect(podeReabrirDocumento({ ...LIVRE, clicksignStatus: null }).pode).toBe(true);
  });

  it("RECUSA com o envelope aguardando assinatura", () => {
    const out = podeReabrirDocumento({ ...LIVRE, clicksignStatus: "AGUARDANDO_ASSINATURA" });
    expect(out.pode).toBe(false);
    expect(out.motivo).toBe("ENVELOPE_AGUARDANDO_ASSINATURA");
    expect(out.mensagem).toBe(MENSAGEM_RECUSA_REABERTURA.ENVELOPE_AGUARDANDO_ASSINATURA);
  });

  it("RECUSA com o contrato já assinado", () => {
    const out = podeReabrirDocumento({ ...LIVRE, clicksignStatus: "ASSINADO" });
    expect(out.pode).toBe(false);
    expect(out.motivo).toBe("ENVELOPE_ASSINADO");
  });

  it("LIBERA com envelope cancelado ou expirado (o reenvio por correção depende disso, §A.5)", () => {
    expect(podeReabrirDocumento({ ...LIVRE, clicksignStatus: "CANCELADO" }).pode).toBe(true);
    expect(podeReabrirDocumento({ ...LIVRE, clicksignStatus: "EXPIRADO" }).pode).toBe(true);
  });

  it("RECUSA com o KIT na fila de assinatura, mesmo SEM envelope (o furo do teste de status)", () => {
    const porCaminho = podeReabrirDocumento({ ...LIVRE, kitAssinaturaPath: "/staging/adm-1/kit.pdf" });
    expect(porCaminho.pode).toBe(false);
    expect(porCaminho.motivo).toBe("KIT_NA_FILA_DE_ASSINATURA");

    const porCarimbo = podeReabrirDocumento({ ...LIVRE, kitAssinaturaEm: new Date() });
    expect(porCarimbo.pode).toBe(false);
    expect(porCarimbo.motivo).toBe("KIT_NA_FILA_DE_ASSINATURA");
  });

  it("o envelope vivo tem precedência sobre o kit no motivo reportado (fail-closed na ordem)", () => {
    const out = podeReabrirDocumento({
      clicksignStatus: "ASSINADO",
      kitAssinaturaPath: "/staging/adm-1/kit.pdf",
      kitAssinaturaEm: new Date(),
    });
    expect(out.motivo).toBe("ENVELOPE_ASSINADO");
  });

  it("nenhuma mensagem usa travessão (§A.11)", () => {
    for (const texto of Object.values(MENSAGEM_RECUSA_REABERTURA)) {
      expect(texto).not.toContain("—");
    }
  });
});

describe("admissaoVivaParaRecuo() — o recuo não reescreve histórico (§A.16/§A.19)", () => {
  it("admissão viva entra no recuo", () => {
    expect(admissaoVivaParaRecuo("EM_ADMISSAO")).toBe(true);
    expect(admissaoVivaParaRecuo("BANCO_AGUARDAR")).toBe(true);
  });

  it("finalizada e encerradas NÃO entram (a carga histórica não é recalculada)", () => {
    expect(admissaoVivaParaRecuo("ADMISSAO_CONCLUIDA")).toBe(false);
    expect(admissaoVivaParaRecuo("DECLINOU")).toBe(false);
    expect(admissaoVivaParaRecuo("RESCISAO")).toBe(false);
    expect(admissaoVivaParaRecuo(null)).toBe(false);
  });
});
