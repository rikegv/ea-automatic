import { describe, expect, it } from "vitest";
import { PANDAPE_ENTRADA_DESFECHOS, PANDAPE_ENTRADA_MOTIVOS } from "@ea/shared-types";
import {
  NAO_INFORMADO,
  ajudaDesfecho,
  rankDesfecho,
  rotuloDesfecho,
  rotuloMotivo,
  toneDesfecho,
} from "./pandape-entradas";

/**
 * O QUE ESTES TESTES SEGURAM: que um valor NOVO do contrato não chegue à tela como o texto cru do
 * enum (caixa alta com underline), e que a régua visual da §A.12 não se perca num ajuste futuro.
 * Nenhum deles conhece backend: são só as traduções da tela.
 */
describe("fila de entradas do Pandapé: vocabulário da tela", () => {
  it("todo desfecho do contrato tem rótulo em title case, sem sobrar o enum cru (§A.24)", () => {
    for (const d of PANDAPE_ENTRADA_DESFECHOS) {
      const r = rotuloDesfecho(d);
      expect(r.length, `${d} sem rótulo`).toBeGreaterThan(2);
      expect(r, `${d} com o enum cru`).not.toContain("_");
      // Primeira letra de cada palavra em maiúscula (ignorando as de ligação, que aqui não há).
      for (const palavra of r.split(" ")) {
        expect(palavra[0], `${d}: "${palavra}" fora do title case`).toBe(palavra[0]?.toUpperCase());
      }
    }
  });

  it("todo motivo tem rótulo, e motivo ausente é 'não informado', nunca vazio (§A.11)", () => {
    for (const m of PANDAPE_ENTRADA_MOTIVOS) {
      expect(rotuloMotivo(m)).not.toContain("_");
    }
    expect(rotuloMotivo(null)).toBe(NAO_INFORMADO);
  });

  it("nenhum texto da tela usa travessão (§A.11)", () => {
    for (const d of PANDAPE_ENTRADA_DESFECHOS) {
      expect(rotuloDesfecho(d)).not.toContain("—");
      expect(ajudaDesfecho(d)).not.toContain("—");
    }
    for (const m of PANDAPE_ENTRADA_MOTIVOS) expect(rotuloMotivo(m)).not.toContain("—");
    expect(NAO_INFORMADO).not.toContain("—");
  });

  it("o tom segue o estado real, que é de onde sai o ícone dinâmico da §A.12", () => {
    // Resolvido bem = check verde.
    expect(toneDesfecho("ADMISSAO_CRIADA")).toBe("ok");
    expect(toneDesfecho("PRE_ADMISSAO")).toBe("ok");
    expect(toneDesfecho("ADOTADO")).toBe("ok");
    expect(toneDesfecho("NO_OP")).toBe("ok");
    // Recusado = X vermelho.
    expect(toneDesfecho("FALHOU")).toBe("dg");
    expect(toneDesfecho("NAO_ENFILEIRADO")).toBe("dg");
    expect(toneDesfecho("DESCARTADO_DUPLICADO")).toBe("dg");
    // Ainda é trabalho de alguém = exclamação amarela. É o caso da entrada que acabou de chegar,
    // e ele NÃO pode virar verde: foi exatamente assim que o caso real ficou invisível.
    expect(toneDesfecho("RECEBIDO")).toBe("wn");
    expect(toneDesfecho("ADIADO")).toBe("wn");
    // Integração sem credencial não é falha de ninguém.
    expect(toneDesfecho("INERTE")).toBe("nt");
  });

  it("o rank ordena por urgência, não por ordem alfabética do rótulo (§A.29)", () => {
    expect(rankDesfecho("FALHOU")).toBeLessThan(rankDesfecho("RECEBIDO"));
    expect(rankDesfecho("RECEBIDO")).toBeLessThan(rankDesfecho("ADMISSAO_CRIADA"));
    // Todo desfecho tem posição própria: dois empatados embaralhariam a fila a cada clique.
    const ranks = PANDAPE_ENTRADA_DESFECHOS.map(rankDesfecho);
    expect(new Set(ranks).size).toBe(ranks.length);
  });
});
