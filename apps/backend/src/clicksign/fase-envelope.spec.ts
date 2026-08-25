import { describe, expect, it } from "vitest";
import { avisoDaFase, faseEnvelope } from "../domain/assinante-empresa";
import { CLICKSIGN_STATUS_LABEL } from "@ea/shared-types";
import { menuDaOperacao } from "../domain/menus";

/**
 * FASE DO ENVELOPE e o aviso que ela produz.
 *
 * O ponto do desenho: o consultor NÃO precisa saber em que estado a Clicksign está. Ele clica em
 * cancelar ou trocar kit, e o sistema detecta a fase e mostra a consequência correta. Um aviso
 * genérico ("tem certeza?") esconderia justamente a diferença que importa: cancelar algo não enviado
 * não notifica ninguém, cancelar um assinado desfaz documento válido.
 */
describe("faseEnvelope: detecção a partir do status e do kit", () => {
  it("kit anexado e sem envelope: NAO_ENVIADO", () => {
    expect(faseEnvelope("SEM_ENVELOPE", true)).toBe("NAO_ENVIADO");
  });

  it("aguardando assinatura: ENVIADO", () => {
    expect(faseEnvelope("AGUARDANDO_ASSINATURA", true)).toBe("ENVIADO");
    // O kit pode ter expirado do TTL e a fase não muda: quem manda é o envelope.
    expect(faseEnvelope("AGUARDANDO_ASSINATURA", false)).toBe("ENVIADO");
  });

  it("assinado: ASSINADO, mesmo sem kit (ele foi ao prontuário)", () => {
    expect(faseEnvelope("ASSINADO", false)).toBe("ASSINADO");
  });

  it("cancelado e expirado: ENCERRADO", () => {
    expect(faseEnvelope("CANCELADO", false)).toBe("ENCERRADO");
    expect(faseEnvelope("EXPIRADO", false)).toBe("ENCERRADO");
  });

  it("sem envelope e SEM kit: ENCERRADO (não há o que cancelar nem trocar)", () => {
    expect(faseEnvelope("SEM_ENVELOPE", false)).toBe("ENCERRADO");
  });
});

describe("avisoDaFase: o texto acompanha a consequência", () => {
  /**
   * O texto desta fase mudou depois de enganar em produção. O antigo ("ainda NÃO foi enviado.
   * Ninguém é notificado.") era verdadeiro e mesmo assim induzia ao erro, porque só falava do que
   * NÃO acontece. O teste agora exige as duas metades: ninguém é notificado (segue verdade) E o
   * candidato sai da fila, que é a consequência que o consultor precisa enxergar antes de clicar.
   */
  it("NAO_ENVIADO diz que ninguém é notificado E que o candidato SAI da fila", () => {
    const a = avisoDaFase("NAO_ENVIADO", "cancelar");
    expect(a).toMatch(/ninguém é notificado/i);
    expect(a).toMatch(/SAI da fila de assinatura/);
    expect(a).toMatch(/kit anexado é descartado/);
    expect(a).toMatch(/Gerador de Kit/);
  });

  it("ENVIADO avisa que o funcionário é notificado", () => {
    expect(avisoDaFase("ENVIADO", "cancelar")).toMatch(/notificar o funcionário/i);
  });

  it("ASSINADO destaca que o envelope JÁ está assinado", () => {
    const a = avisoDaFase("ASSINADO", "cancelar");
    expect(a).toMatch(/JÁ ASSINADO/);
    expect(a).toMatch(/notificar o funcionário/i);
  });

  it("os três avisos são DIFERENTES entre si (senão a detecção de fase seria inútil)", () => {
    const textos = (["NAO_ENVIADO", "ENVIADO", "ASSINADO"] as const).map((f) =>
      avisoDaFase(f, "cancelar"),
    );
    expect(new Set(textos).size).toBe(3);
  });

  it("trocar kit acrescenta a instrução do kit novo; cancelar não", () => {
    expect(avisoDaFase("ENVIADO", "trocar")).toMatch(/Gerador de Kit/);
    expect(avisoDaFase("ENVIADO", "cancelar")).not.toMatch(/Gerador de Kit/);
  });
});

describe("§A.24: rótulo de status é TAG, então title case", () => {
  it("os rótulos de status do Clicksign estão em title case", () => {
    expect(CLICKSIGN_STATUS_LABEL.SEM_ENVELOPE).toBe("Sem Envelope");
    expect(CLICKSIGN_STATUS_LABEL.AGUARDANDO_ASSINATURA).toBe("Aguardando Assinatura");
  });

  it("nenhum rótulo tem palavra começando em minúscula", () => {
    for (const rotulo of Object.values(CLICKSIGN_STATUS_LABEL)) {
      for (const palavra of rotulo.split(/\s+/)) {
        expect(palavra[0]).toBe(palavra[0].toUpperCase());
      }
    }
  });
});

describe("Governança das ações novas", () => {
  it("envio individual, troca de kit e visualização do kit exigem o menu de assinaturas", () => {
    for (const op of ["disparar", "trocarKit", "verKit"]) {
      expect(menuDaOperacao("ClicksignController", op)).toBe("assinaturas");
    }
  });
});
