import { describe, expect, it } from "vitest";
import { verificarContratoAssinado } from "./contrato-assinado";

/**
 * A REGRA QUE ESTE ARQUIVO TRANCA (§A.33): o sistema NUNCA arquiva um contrato sem assinatura.
 *
 * As amostras abaixo reproduzem o que a Clicksign serve de verdade, medido em 01/09/2026 contra a
 * produção: o `signed` carrega o dicionário de assinatura digital (`/ByteRange` + `/Name(Clicksign)`)
 * e o `original` (o kit cru) não carrega nenhum dos dois. Quem mexer no critério e afrouxar a guarda
 * quebra estes testes.
 */

/** Kit CRU: PDF legítimo, páginas de contrato, e NENHUMA assinatura. É o que causou o dano. */
const KIT_CRU = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\ntrailer\n<</Root 1 0 R>>\n%%EOF\n",
);

/** ASSINADO: o mesmo PDF depois da Clicksign, com o `/Sig` que ela grava ao fechar o envelope. */
const ASSINADO = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n" +
    "9 0 obj\n<</Type/Sig/ByteRange [0 840 8420 1200]/SubFilter/adbe.pkcs7.detached" +
    "/Reference[<</TransformMethod/DocMDP>>]/M(D:20260831211137+00'00')/Name(Clicksign)>>\nendobj\n" +
    "trailer\n<</Root 1 0 R>>\n%%EOF\n",
);

describe("verificarContratoAssinado — guarda do arquivamento (§A.33)", () => {
  it("ACEITA o PDF assinado pela Clicksign", () => {
    expect(verificarContratoAssinado(ASSINADO)).toEqual({ ok: true });
  });

  it("RECUSA o kit cru, que é exatamente o que virou dano permanente em 25 e 28/08/2026", () => {
    const v = verificarContratoAssinado(KIT_CRU);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motivo).toContain("sem assinatura digital");
  });

  it("RECUSA PDF assinado por OUTRO emissor (assinatura existe, mas não é a da Clicksign)", () => {
    const outro = Buffer.from(String(ASSINADO).replace("/Name(Clicksign)", "/Name(Outro Emissor)"));
    const v = verificarContratoAssinado(outro);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motivo).toContain("não pela Clicksign");
  });

  it("RECUSA o que nem PDF é (HTML de erro, JSON, resposta truncada)", () => {
    const v = verificarContratoAssinado(Buffer.from('{"error":"expired link"}'));
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motivo).toContain("não é um PDF");
  });

  it("RECUSA vazio e indefinido (download que voltou sem corpo)", () => {
    expect(verificarContratoAssinado(Buffer.alloc(0)).ok).toBe(false);
    expect(verificarContratoAssinado(undefined).ok).toBe(false);
  });

  it("tolera variação de espaçamento do PDF, que muda entre versões do gerador", () => {
    const espacado = Buffer.from(
      String(ASSINADO)
        .replace("/ByteRange [", "/ByteRange  [")
        .replace("/Name(Clicksign)", "/Name ( Clicksign )"),
    );
    expect(verificarContratoAssinado(espacado)).toEqual({ ok: true });
  });

  it("acha a assinatura mesmo cercada de bytes binários (PDF real não é texto limpo)", () => {
    const comBinario = Buffer.concat([
      Buffer.from("%PDF-1.7\n"),
      Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x0a, 0x1b, 0x7f]),
      Buffer.from("stream\n/ByteRange [0 10 20 30]/Name(Clicksign)\nendstream\n%%EOF"),
    ]);
    expect(verificarContratoAssinado(comBinario)).toEqual({ ok: true });
  });
});
