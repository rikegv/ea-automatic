import { describe, expect, it } from "vitest";
import { MOTIVOS_DE_RECUSA_DE_ENVIO, type ResultadoDoEnvioDoLink } from "@ea/shared-types";
import {
  classificarEmissao,
  desfechoDeExcecao,
  type DesfechoDaEmissao,
  type MotivoDaFalhaDoLink,
} from "./portal-link-falha";

/**
 * ─ A TAXONOMIA DA EMISSÃO DO LINK, COBERTURA INDEPENDENTE (§A.38) ───────────────────────────────
 *
 * Escrita a partir do REQUISITO decidido pelo diretor (frente A.1), não lendo a implementação e
 * repetindo-a. O requisito, em forma de mapa a/b/c:
 *
 *   enviado:true                                            -> SUCESSO (limpa o estado)
 *   motivo null, LINK_VIVO_EM_USO, ENVIADO_HA_POUCO,
 *     SEM_ADMISSAO                                          -> IGNORAR (recusa legítima, não é falha)
 *   SEM_EMAIL, EMAIL_INVALIDO                               -> (c) CARIMBA, retry=false
 *   CANAL_INDISPONIVEL, FALHA_NO_ENVIO                      -> (b) CARIMBA, retry=true
 *   exceção inesperada (desfechoDeExcecao)                  -> (b) CARIMBA, retry=true, EXCECAO_INESPERADA
 *
 * A GARANTIA CENTRAL: o teste percorre `MOTIVOS_DE_RECUSA_DE_ENVIO` (o catálogo é a fonte da
 * verdade) e exige que CADA valor tenha uma decisão explícita no mapa ESPERADO abaixo. Motivo novo
 * acrescentado ao catálogo e NÃO mapeado aqui DERRUBA este arquivo, forçando a decisão a/b/c antes
 * de chegar à operação, em vez de cair no ramo-default silencioso da função.
 *
 * `MOTIVOS_DE_RECUSA_DE_ENVIO` é importado como VALOR (não só tipo) de propósito: é o laço em cima
 * do valor que pega o motivo novo em tempo de execução.
 */

/** Preenche os campos que a taxonomia NÃO lê, para o fixture ser um `ResultadoDoEnvioDoLink` válido. */
function resultado(
  parcial: Pick<ResultadoDoEnvioDoLink, "enviado" | "motivo">,
): ResultadoDoEnvioDoLink {
  return {
    canal: "EMAIL",
    origem: "AUTOMATICO",
    destinoMascarado: null,
    enviadoEm: null,
    expiraEm: null,
    ...parcial,
  };
}

/**
 * O MAPA ESPERADO, derivado do requisito e escrito à mão (não da função). `enviado:true` não é um
 * motivo do catálogo, então vive separado. Cada motivo do catálogo tem UMA entrada; a ausência de
 * uma entrada é o que o laço exaustivo transforma em falha.
 */
const ESPERADO: Record<string, DesfechoDaEmissao> = {
  SEM_EMAIL: { tipo: "CARIMBA", retry: false, motivo: "SEM_EMAIL" },
  EMAIL_INVALIDO: { tipo: "CARIMBA", retry: false, motivo: "EMAIL_INVALIDO" },
  SEM_ADMISSAO: { tipo: "IGNORAR", motivo: "SEM_ADMISSAO" },
  CANAL_INDISPONIVEL: { tipo: "CARIMBA", retry: true, motivo: "CANAL_INDISPONIVEL" },
  LINK_VIVO_EM_USO: { tipo: "IGNORAR", motivo: "LINK_VIVO_EM_USO" },
  ENVIADO_HA_POUCO: { tipo: "IGNORAR", motivo: "ENVIADO_HA_POUCO" },
  FALHA_NO_ENVIO: { tipo: "CARIMBA", retry: true, motivo: "FALHA_NO_ENVIO" },
};

describe("classificarEmissao: SUCESSO", () => {
  it("enviado:true -> SUCESSO, independentemente do motivo acompanhar nulo", () => {
    expect(classificarEmissao(resultado({ enviado: true, motivo: null }))).toEqual({
      tipo: "SUCESSO",
    });
  });
});

describe("classificarEmissao: fluxo-2 (motivo nulo com enviado:false)", () => {
  it("enviado:false + motivo null -> IGNORAR (recusa legítima, sem carimbo nem retry)", () => {
    expect(classificarEmissao(resultado({ enviado: false, motivo: null }))).toEqual({
      tipo: "IGNORAR",
      motivo: null,
    });
  });
});

describe("classificarEmissao: EXAUSTIVO, um caso por valor de MOTIVOS_DE_RECUSA_DE_ENVIO", () => {
  it("o mapa ESPERADO cobre TODOS os motivos do catálogo (motivo novo não mapeado derruba aqui)", () => {
    for (const motivo of MOTIVOS_DE_RECUSA_DE_ENVIO) {
      expect(ESPERADO[motivo], `motivo "${motivo}" do catálogo sem decisão a/b/c mapeada`).toBeDefined();
    }
  });

  for (const motivo of MOTIVOS_DE_RECUSA_DE_ENVIO) {
    it(`motivo ${motivo} classifica EXATAMENTE conforme o requisito`, () => {
      const esperado = ESPERADO[motivo];
      // Guard: se o catálogo cresceu e ninguém mapeou, isto falha com a mensagem certa.
      expect(esperado, `motivo "${motivo}" sem decisão a/b/c mapeada`).toBeDefined();
      expect(classificarEmissao(resultado({ enviado: false, motivo }))).toEqual(esperado);
    });
  }
});

describe("desfechoDeExcecao: exceção inesperada é sempre (b)", () => {
  it("devolve CARIMBA, retry=true, motivo EXCECAO_INESPERADA", () => {
    const esperado: DesfechoDaEmissao = {
      tipo: "CARIMBA",
      retry: true,
      motivo: "EXCECAO_INESPERADA" satisfies MotivoDaFalhaDoLink,
    };
    expect(desfechoDeExcecao()).toEqual(esperado);
  });
});
