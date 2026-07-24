import { describe, expect, it } from "vitest";
import {
  classificarConteudo,
  MOTIVO_CONTEUDO,
  pareceTextoDigitado,
  triarConjunto,
} from "./conteudo-documento";

const PDF = Buffer.from("%PDF-1.7\nconteudo binario qualquer", "latin1");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
/** O caso REAL que originou a OST: resposta digitada no formulário, 91 bytes, sem dado de ninguém. */
const TEXTO_DIGITADO = Buffer.from(
  "Segue abaixo a conta que informei no cadastro, qualquer coisa me chamem por favor.",
  "utf8",
);
/** Binário de formato que a auditoria não lê (assinatura de arquivo compactado). */
const BINARIO_DESCONHECIDO = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x08]);

describe("pareceTextoDigitado", () => {
  it("reconhece texto UTF-8 curto", () => {
    expect(pareceTextoDigitado(TEXTO_DIGITADO)).toBe(true);
  });

  it("recusa binário com bytes de controle", () => {
    expect(pareceTextoDigitado(JPEG)).toBe(false);
    expect(pareceTextoDigitado(BINARIO_DESCONHECIDO)).toBe(false);
  });

  it("recusa vazio e recusa arquivo grande (resposta de formulário é curta)", () => {
    expect(pareceTextoDigitado(Buffer.alloc(0))).toBe(false);
    expect(pareceTextoDigitado(Buffer.from("a".repeat(70 * 1024), "utf8"))).toBe(false);
  });

  it("recusa texto só de espaço em branco", () => {
    expect(pareceTextoDigitado(Buffer.from("   \n\t  ", "utf8"))).toBe(false);
  });
});

describe("classificarConteudo", () => {
  it("PDF, JPEG e PNG são auditáveis", () => {
    expect(classificarConteudo(PDF)).toBe("AUDITAVEL");
    expect(classificarConteudo(JPEG)).toBe("AUDITAVEL");
    expect(classificarConteudo(PNG)).toBe("AUDITAVEL");
  });

  it("resposta digitada é TEXTO_DIGITADO", () => {
    expect(classificarConteudo(TEXTO_DIGITADO)).toBe("TEXTO_DIGITADO");
  });

  it("binário de formato não lido é FORMATO_NAO_SUPORTADO", () => {
    expect(classificarConteudo(BINARIO_DESCONHECIDO)).toBe("FORMATO_NAO_SUPORTADO");
  });
});

describe("triarConjunto", () => {
  it("conjunto inteiro auditável passa reto, sem motivo de reprovação", () => {
    const r = triarConjunto([{ buffer: PDF }, { buffer: JPEG }]);
    expect(r.auditaveis).toHaveLength(2);
    expect(r.motivoInconforme).toBeUndefined();
  });

  // NÃO-BLOQUEIO: um arquivo ruim não condena a peça inteira (mesma lógica do PDF protegido).
  it("com pelo menos um auditável, audita só o que serve e não reprova o conjunto", () => {
    const r = triarConjunto([{ buffer: TEXTO_DIGITADO }, { buffer: PNG }]);
    expect(r.auditaveis).toEqual([{ buffer: PNG }]);
    expect(r.motivoInconforme).toBeUndefined();
  });

  it("nada auditável e houve texto digitado: motivo diz que o candidato digitou", () => {
    const r = triarConjunto([{ buffer: TEXTO_DIGITADO }]);
    expect(r.auditaveis).toHaveLength(0);
    expect(r.motivoInconforme).toBe(MOTIVO_CONTEUDO.TEXTO_DIGITADO);
  });

  it("nada auditável e sem texto: motivo genérico de formato", () => {
    const r = triarConjunto([{ buffer: BINARIO_DESCONHECIDO }]);
    expect(r.motivoInconforme).toBe(MOTIVO_CONTEUDO.FORMATO_NAO_SUPORTADO);
  });

  it("na mistura de ruins, o motivo mais específico ganha (texto digitado)", () => {
    const r = triarConjunto([{ buffer: BINARIO_DESCONHECIDO }, { buffer: TEXTO_DIGITADO }]);
    expect(r.motivoInconforme).toBe(MOTIVO_CONTEUDO.TEXTO_DIGITADO);
  });

  it("conjunto vazio não trava: devolve motivo de formato", () => {
    expect(triarConjunto([]).motivoInconforme).toBe(MOTIVO_CONTEUDO.FORMATO_NAO_SUPORTADO);
  });

  it("os motivos falam com o CONSULTOR e não têm travessão (§A.11)", () => {
    for (const m of Object.values(MOTIVO_CONTEUDO)) {
      expect(m).not.toContain("—");
      expect(m.toLowerCase()).toContain("solicitar reenvio");
    }
  });
});
