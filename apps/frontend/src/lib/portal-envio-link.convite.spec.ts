import { describe, expect, it } from "vitest";
import type { ResultadoDoConvitePrimeiroAcesso, ResultadoDoEnvioDoLink } from "@ea/shared-types";
import { ehConvitePrimeiroAcesso, fraseDoConvite, fraseDoResultado } from "./portal-envio-link";

/**
 * ITEM 1 no frontend: o reenvio de quem está SEM CPF (marcador PROV) volta como CONVITE DE PRIMEIRO
 * ACESSO, não como link clássico. A tela precisa DISTINGUIR os dois pelo discriminante e dizer a
 * frase certa. Este arquivo tranca o discriminante e as quatro frases do convite.
 */

const link: ResultadoDoEnvioDoLink = {
  enviado: true,
  motivo: null,
  canal: "EMAIL",
  origem: "MANUAL",
  destinoMascarado: "f****o@x.com",
  enviadoEm: "2026-10-13T12:00:00.000Z",
  expiraEm: "2026-10-16T12:00:00.000Z",
};

function convite(
  p: Partial<ResultadoDoConvitePrimeiroAcesso>,
): ResultadoDoConvitePrimeiroAcesso {
  return { convitePrimeiroAcesso: true, enviado: true, motivo: null, destinoMascarado: "f****o@x.com", ...p };
}

describe("ehConvitePrimeiroAcesso: separa o convite do link clássico", () => {
  it("é verdadeiro só para o resultado do convite", () => {
    expect(ehConvitePrimeiroAcesso(convite({}))).toBe(true);
    expect(ehConvitePrimeiroAcesso(link)).toBe(false);
  });
});

describe("fraseDoConvite: cada desfecho do convite tem a sua frase, sem travessão (§A.11)", () => {
  it("sucesso diz que o convite foi por e-mail e explica o próximo passo", () => {
    const f = fraseDoConvite(convite({ enviado: true }));
    expect(f).toContain("convite de primeiro acesso");
    expect(f).toContain("f****o@x.com");
    expect(f).not.toContain("—");
  });

  it("SEM_EMAIL_NO_FUNIL pede o cadastro do e-mail", () => {
    const f = fraseDoConvite(convite({ enviado: false, motivo: "SEM_EMAIL_NO_FUNIL", destinoMascarado: null }));
    expect(f.toLowerCase()).toContain("e-mail");
    expect(f).not.toContain("—");
  });

  it("CANAL_INDISPONIVEL diz que o convite não saiu", () => {
    const f = fraseDoConvite(convite({ enviado: false, motivo: "CANAL_INDISPONIVEL" }));
    expect(f.toLowerCase()).toContain("não saiu");
    expect(f).not.toContain("—");
  });

  it("FALHA_NO_ENVIO pede para tentar de novo", () => {
    const f = fraseDoConvite(convite({ enviado: false, motivo: "FALHA_NO_ENVIO" }));
    expect(f.toLowerCase()).toContain("tente de novo");
    expect(f).not.toContain("—");
  });
});

describe("fraseDoResultado continua intacta para o link clássico", () => {
  it("o link enviado diz para onde foi e até quando vale", () => {
    const f = fraseDoResultado(link, "16/10/2026 09:00");
    expect(f).toContain("link");
    expect(f).toContain("f****o@x.com");
  });
});
