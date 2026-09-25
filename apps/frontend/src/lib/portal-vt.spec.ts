// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CODIGO_TIPO_FORMULARIO_VT } from "@ea/shared-types";
import { ApiError } from "./api";
import {
  ESCAPE_PADRAO,
  ESCAPE_VT,
  MSG_VT_FALHA_GENERICA,
  MSG_VT_INDISPONIVEL,
  abrirEmAbaNova,
  ehCasaDoVt,
  mensagemDaFalhaDoVt,
  rotuloDoEscape,
} from "./portal-vt";

/**
 * A PONTE PARA O VT, medida onde ela pode mentir: no reconhecimento da casa, no rosto da falha e
 * na forma como a aba é aberta. O que o teste protege, em uma linha cada:
 *  1. a casa do VT é reconhecida pelo código do CONTRATO, não por uma string solta;
 *  2. o 503 (o estado real da homologação) chega ao candidato com a frase do servidor, e o 500
 *     NÃO chega, porque a mensagem dele é diagnóstico interno;
 *  3. a aba nova sai com `noopener noreferrer`, e o link não sobrevive no DOM ao clique (§A.6).
 */

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ehCasaDoVt", () => {
  it("reconhece a casa pelo código do contrato", () => {
    expect(ehCasaDoVt(CODIGO_TIPO_FORMULARIO_VT)).toBe(true);
    expect(ehCasaDoVt("FORMULARIO_VT")).toBe(true);
  });

  it("não confunde com nenhuma outra casa da trilha", () => {
    for (const outro of ["RG", "CPF", "CARTAO_TRANSPORTE", "COMPROVANTE_RESIDENCIA", ""]) {
      expect(ehCasaDoVt(outro)).toBe(false);
    }
  });
});

describe("mensagemDaFalhaDoVt", () => {
  it("503: entrega a frase do servidor, que é o caso real da homologação sem chave", () => {
    const erro = new ApiError(
      "O formulário de vale-transporte está indisponível no momento. Fale com o RH.",
      503,
    );
    expect(mensagemDaFalhaDoVt(erro)).toBe(
      "O formulário de vale-transporte está indisponível no momento. Fale com o RH.",
    );
  });

  it("422: também é frase escrita para o candidato, e sai como veio", () => {
    const erro = new ApiError(
      "Não foi possível abrir o formulário de vale-transporte. Fale com o RH.",
      422,
    );
    expect(mensagemDaFalhaDoVt(erro)).toBe(
      "Não foi possível abrir o formulário de vale-transporte. Fale com o RH.",
    );
  });

  it("404: fala com o RH, sem dizer se a admissão existe", () => {
    expect(mensagemDaFalhaDoVt(new ApiError("Formulário de vale-transporte indisponível", 404))).toBe(
      MSG_VT_INDISPONIVEL,
    );
  });

  it("500: a mensagem interna NÃO chega ao candidato", () => {
    expect(mensagemDaFalhaDoVt(new ApiError("Internal server error", 500))).toBe(
      MSG_VT_FALHA_GENERICA,
    );
  });

  it("rede fora (nem ApiError é) cai na frase genérica", () => {
    expect(mensagemDaFalhaDoVt(new TypeError("Failed to fetch"))).toBe(MSG_VT_FALHA_GENERICA);
    expect(mensagemDaFalhaDoVt(undefined)).toBe(MSG_VT_FALHA_GENERICA);
  });

  it("503 sem texto nenhum não vira mensagem vazia na tela", () => {
    expect(mensagemDaFalhaDoVt(new ApiError("   ", 503))).toBe(MSG_VT_FALHA_GENERICA);
  });

  it("nenhuma frase da ponte usa travessão (§A.11)", () => {
    for (const frase of [MSG_VT_FALHA_GENERICA, MSG_VT_INDISPONIVEL]) {
      expect(frase.includes("\u2014")).toBe(false);
    }
  });
});

describe("abrirEmAbaNova", () => {
  it("abre em aba nova com noopener e noreferrer", () => {
    const visto: { target: string; rel: string; href: string }[] = [];
    const espia = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        visto.push({ target: this.target, rel: this.rel, href: this.getAttribute("href") ?? "" });
      });

    abrirEmAbaNova("https://vt.exemplo/?t=token-com-credencial");

    expect(visto).toHaveLength(1);
    expect(visto[0]!.target).toBe("_blank");
    expect(visto[0]!.rel).toBe("noopener noreferrer");
    expect(visto[0]!.href).toBe("https://vt.exemplo/?t=token-com-credencial");
    espia.mockRestore();
  });

  it("§A.6: o link não sobrevive no DOM depois do clique", () => {
    const espia = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    abrirEmAbaNova("https://vt.exemplo/?t=token-com-credencial");
    expect(document.body.innerHTML).toBe("");
    expect(document.documentElement.outerHTML).not.toContain("token-com-credencial");
    espia.mockRestore();
  });

  it("§A.6: o elemento sai do DOM mesmo se o clique lançar", () => {
    const espia = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("navegador bloqueou");
    });
    expect(() => abrirEmAbaNova("https://vt.exemplo/?t=abc")).toThrow();
    expect(document.body.innerHTML).toBe("");
    espia.mockRestore();
  });

  it("link vazio não cria elemento nenhum", () => {
    const espia = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    abrirEmAbaNova("");
    expect(espia).not.toHaveBeenCalled();
    expect(document.body.innerHTML).toBe("");
    espia.mockRestore();
  });
});

describe("rotuloDoEscape", () => {
  it("na casa do VT não fala em documento que falta: o VT é preenchimento", () => {
    expect(rotuloDoEscape(CODIGO_TIPO_FORMULARIO_VT)).toBe("Preencher depois");
    expect(rotuloDoEscape(CODIGO_TIPO_FORMULARIO_VT)).not.toMatch(/documento/i);
  });

  it("é um RAMO, não uma troca global: as outras casas continuam com a frase de sempre", () => {
    for (const outro of ["RG", "CPF", "CARTAO_TRANSPORTE", "COMPROVANTE_RESIDENCIA", ""]) {
      expect(rotuloDoEscape(outro)).toBe("Não tenho este documento agora, pular");
    }
  });

  it("nenhuma das duas frases tem travessão (§A.11)", () => {
    expect(ESCAPE_VT).not.toContain("—");
    expect(ESCAPE_PADRAO).not.toContain("—");
  });
});
