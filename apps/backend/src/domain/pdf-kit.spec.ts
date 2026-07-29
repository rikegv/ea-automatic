import { describe, expect, it } from "vitest";
import { contarPaginas, validarPdfKit } from "./pdf-kit";

/**
 * VALIDAÇÃO ESTRUTURAL DO PDF DO KIT (INT-4, proteção para a virada de produção).
 *
 * O caso que originou este arquivo é real e está no DIARIO de 28/07: um stub de 45 bytes, com o
 * cabeçalho `%PDF-1.4` e mais nada, foi aceito pela Clicksign, virou documento de envelope e só
 * quebrou no visualizador do signatário. Em produção o signatário é um candidato de verdade.
 *
 * O que estes testes travam:
 *  - o stub de 45 bytes é REPROVADO (é a regressão que importa);
 *  - um PDF bem formado é APROVADO, inclusive o comprimido, que não expõe `/Type /Page` em texto
 *    plano. Falso positivo aqui trava kit legítimo, que é pior que o defeito original;
 *  - a contagem de páginas nunca devolve zero: sem indício, devolve null (não tem autoridade para
 *    afirmar "sem páginas").
 */

/** Monta um PDF de UMA página, bem formado o bastante para os quatro critérios (com folga de bytes). */
function pdfValido(paginas = 1): Buffer {
  const folhas = Array.from(
    { length: paginas },
    (_, i) => `${4 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n`,
  ).join("");
  const corpo =
    `%PDF-1.7\n` +
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
    `2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count ${paginas} >>\nendobj\n` +
    folhas +
    // Enche o arquivo com um comentário longo: um PDF real tem centenas de KB e o corte de tamanho
    // mínimo (1.000 bytes) não pode ser satisfeito só pelo esqueleto do teste.
    `% ${"conteudo de pagina ".repeat(80)}\n`;
  return Buffer.from(`${corpo}xref\n0 5\ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n9\n%%EOF\n`);
}

describe("validarPdfKit: reprova o que quebraria na mão do candidato", () => {
  it("REPROVA o stub de 45 bytes que passou pela Clicksign em 28/07", () => {
    const stub = Buffer.from("%PDF-1.4\n% stub de teste, sem objetos nem xref\n");
    expect(stub.byteLength).toBeLessThan(100);
    const r = validarPdfKit(stub);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/incompleto|truncado|corrompido/i);
  });

  it("REPROVA arquivo que não é PDF (sem cabeçalho)", () => {
    const r = validarPdfKit(Buffer.from("Isto aqui e um DOCX renomeado. ".repeat(100)));
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("não é um PDF");
  });

  it("REPROVA PDF truncado no meio (perdeu o %%EOF e o startxref)", () => {
    const inteiro = pdfValido();
    const cortado = inteiro.subarray(0, inteiro.byteLength - 60);
    const r = validarPdfKit(cortado);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/truncado|corrompido/i);
  });

  it("REPROVA PDF sem tabela de referências (tem cabeçalho e fim, não tem startxref)", () => {
    const semXref = Buffer.from(
      `%PDF-1.7\n% ${"a".repeat(2000)}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`,
    );
    const r = validarPdfKit(semXref);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain("corrompido");
  });

  it("o motivo nunca usa travessão (§A.11) e sempre diz o que fazer", () => {
    const reprovados = [
      validarPdfKit(Buffer.from("%PDF-1.4\n")),
      validarPdfKit(Buffer.from("nada a ver")),
    ];
    for (const r of reprovados) {
      expect(r.motivo).toBeDefined();
      expect(r.motivo).not.toContain("—");
      expect(r.motivo).toMatch(/Gere o kit de novo/);
    }
  });
});

describe("validarPdfKit: aprova PDF legítimo (falso positivo trava admissão)", () => {
  it("APROVA um PDF bem formado e devolve a contagem de páginas", () => {
    const r = validarPdfKit(pdfValido(4));
    expect(r.ok).toBe(true);
    expect(r.motivo).toBeUndefined();
    expect(r.paginas).toBe(4);
  });

  it("APROVA PDF comprimido, que não expõe /Type /Page em texto plano", () => {
    // Object streams escondem os objetos de página; o arquivo é perfeito e a contagem não acha nada.
    const comprimido = Buffer.concat([
      Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /ObjStm /N 8 /Length 900 >>\nstream\n`),
      Buffer.alloc(1200, 0x7f),
      Buffer.from(`\nendstream\nendobj\nxref\n0 2\nstartxref\n9\n%%EOF\n`),
    ]);
    const r = validarPdfKit(comprimido);
    expect(r.ok).toBe(true);
    expect(r.paginas).toBeNull();
  });

  it("tolera lixo depois do %%EOF (gerador que deixa bytes de sobra)", () => {
    const comSobra = Buffer.concat([pdfValido(), Buffer.from("\n\n\n")]);
    expect(validarPdfKit(comSobra).ok).toBe(true);
  });
});

describe("contarPaginas: informativa, nunca autoritativa", () => {
  it("devolve null (não zero) quando não há indício de página", () => {
    expect(contarPaginas(Buffer.from("%PDF-1.7\nsem nada de pagina aqui\n"))).toBeNull();
  });

  it("não confunde /Type /Pages (a árvore) com /Type /Page (a folha)", () => {
    const so_arvore = Buffer.from("%PDF-1.7\n<< /Type /Pages /Kids [] >>\n");
    expect(contarPaginas(so_arvore)).toBeNull();
  });
});
