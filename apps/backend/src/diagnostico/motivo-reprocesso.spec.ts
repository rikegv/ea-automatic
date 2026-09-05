import { describe, expect, it } from "vitest";
import { mensagemDoReprocesso, traduzirMotivo } from "./motivo-reprocesso";

/**
 * A REGRA CENTRAL: só diz que puxou quem puxou. O defeito que originou o módulo era a tela mostrar
 * cara de sucesso quando o job apenas voltara para a fila (caso Zelda, 05/09/2026).
 */
describe("mensagemDoReprocesso", () => {
  it("NUNCA diz que puxou quando o job só voltou para a fila", () => {
    const m = mensagemDoReprocesso({ desfecho: "EM_PROCESSAMENTO" });
    expect(m).toContain("ainda está rodando");
    expect(m.toLowerCase()).not.toContain("sucesso");
    expect(m.toLowerCase()).not.toContain("reprocessada");
  });

  it("diz ONDE a admissão caiu quando o Pandapé puxou", () => {
    expect(mensagemDoReprocesso({ desfecho: "CONCLUIDO", destino: "LIBERACAO" })).toContain(
      "Liberação Admissional",
    );
    expect(mensagemDoReprocesso({ desfecho: "CONCLUIDO", destino: "ESTEIRA" })).toContain("esteira");
  });

  it("não finge criação quando o job completou sem criar nada", () => {
    const m = mensagemDoReprocesso({ desfecho: "CONCLUIDO", destino: "NADA" });
    expect(m).toContain("nenhuma admissão foi criada");
  });

  it("sucesso genérico para as filas que não são do Pandapé", () => {
    expect(mensagemDoReprocesso({ desfecho: "CONCLUIDO" })).toBe("Job reprocessado com sucesso.");
  });

  it("FALHOU carrega o motivo traduzido", () => {
    const m = mensagemDoReprocesso({ desfecho: "FALHOU", motivo: "CPF inválido" });
    expect(m).toContain("Não puxou.");
    expect(m).toContain("dígito verificador");
  });

  it("FALHOU sem tradução cai no motivo CRU, que já é legível", () => {
    const m = mensagemDoReprocesso({ desfecho: "FALHOU", motivo: "Cliente não encontrado" });
    expect(m).toBe("Não puxou. Cliente não encontrado");
  });

  it("FALHOU sem motivo registrado admite que não sabe, em vez de inventar", () => {
    expect(mensagemDoReprocesso({ desfecho: "FALHOU" })).toContain("não registrou o motivo");
  });

  /** §A.11: travessão proibido em texto que chega ao usuário. */
  it("nenhuma mensagem usa travessão", () => {
    const todas = [
      mensagemDoReprocesso({ desfecho: "EM_PROCESSAMENTO" }),
      mensagemDoReprocesso({ desfecho: "CONCLUIDO", destino: "LIBERACAO" }),
      mensagemDoReprocesso({ desfecho: "CONCLUIDO", destino: "ESTEIRA" }),
      mensagemDoReprocesso({ desfecho: "CONCLUIDO", destino: "NADA" }),
      mensagemDoReprocesso({ desfecho: "CONCLUIDO" }),
      mensagemDoReprocesso({ desfecho: "FALHOU", motivo: "CPF inválido" }),
      mensagemDoReprocesso({ desfecho: "FALHOU", motivo: "429 Too Many Requests" }),
      mensagemDoReprocesso({ desfecho: "FALHOU" }),
    ];
    for (const t of todas) expect(t).not.toContain("—");
  });
});

describe("traduzirMotivo", () => {
  it("traduz o CPF inválido, que é o caso real da Zelda", () => {
    expect(traduzirMotivo("CPF inválido")).toContain("dígito verificador");
  });

  it("traduz cota e rede, que são falhas transitórias e mudam o que fazer", () => {
    expect(traduzirMotivo("Request failed with status 429")).toContain("cota");
    expect(traduzirMotivo("fetch failed: ETIMEDOUT")).toContain("rede");
  });

  it("NÃO inventa tradução para motivo desconhecido", () => {
    expect(traduzirMotivo("Cliente não encontrado")).toBeUndefined();
    expect(traduzirMotivo("")).toBeUndefined();
    expect(traduzirMotivo(undefined)).toBeUndefined();
  });
});
