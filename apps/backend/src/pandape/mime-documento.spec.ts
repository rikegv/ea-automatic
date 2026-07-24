import { describe, expect, it } from "vitest";
import {
  extensaoDeContentType,
  extensaoPorMagicBytes,
  resolverExtensaoDocumento,
} from "./mime-documento";

/**
 * BLOCO E, teste 1 (regressão do MIME): um documento vindo do Pandapé NÃO pode chegar na IA como
 * `application/octet-stream` (foi a causa do 400 do Vertex → 500 silencioso). Este teste trava o
 * bug: garante que o Content-Type e, na falta, os magic bytes resolvem a extensão, e que a extensão
 * resolvida vira um sufixo de arquivo que o `_mime_de` do ai-service reconhece (nunca octet-stream).
 */

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DESCONHECIDO = Buffer.from([0x00, 0x01, 0x02, 0x03]);

describe("extensaoDeContentType (fix do mime, primário)", () => {
  it("mapeia os mimes suportados, ignorando parâmetros e caixa", () => {
    expect(extensaoDeContentType("application/pdf")).toBe(".pdf");
    expect(extensaoDeContentType("image/jpeg")).toBe(".jpg");
    expect(extensaoDeContentType("IMAGE/JPG")).toBe(".jpg");
    expect(extensaoDeContentType("image/png; charset=binary")).toBe(".png");
  });

  it("Content-Type ausente, vazio ou octet-stream → null (deixa o fallback agir)", () => {
    expect(extensaoDeContentType(null)).toBeNull();
    expect(extensaoDeContentType(undefined)).toBeNull();
    expect(extensaoDeContentType("")).toBeNull();
    expect(extensaoDeContentType("application/octet-stream")).toBeNull();
  });
});

describe("extensaoPorMagicBytes (fix do mime, fallback)", () => {
  it("reconhece PDF, JPEG e PNG pelos primeiros bytes", () => {
    expect(extensaoPorMagicBytes(PDF)).toBe(".pdf");
    expect(extensaoPorMagicBytes(JPEG)).toBe(".jpg");
    expect(extensaoPorMagicBytes(PNG)).toBe(".png");
  });

  it("assinatura desconhecida ou buffer curto → null", () => {
    expect(extensaoPorMagicBytes(DESCONHECIDO)).toBeNull();
    expect(extensaoPorMagicBytes(Buffer.from([0xff]))).toBeNull();
  });
});

describe("resolverExtensaoDocumento (header primeiro, magic bytes de rede)", () => {
  it("usa o Content-Type quando ele resolve", () => {
    expect(resolverExtensaoDocumento("application/pdf", DESCONHECIDO)).toBe(".pdf");
  });

  it("cai nos magic bytes quando o header falha (octet-stream/ausente)", () => {
    expect(resolverExtensaoDocumento("application/octet-stream", PNG)).toBe(".png");
    expect(resolverExtensaoDocumento(null, JPEG)).toBe(".jpg");
  });

  it("REGRESSÃO: header octet-stream + conteúdo reconhecível NUNCA deixa sem extensão", () => {
    // Exatamente o cenário do pull do Pandapé que quebrava: sem extensão → octet-stream → 500.
    expect(resolverExtensaoDocumento("application/octet-stream", PDF)).toBe(".pdf");
  });

  it("nada resolve → null (o chamador NÃO manda octet-stream, marca aguardando auditoria)", () => {
    expect(resolverExtensaoDocumento(null, DESCONHECIDO)).toBeNull();
  });
});

// NOTA (OST A / Bloco 1): a detecção de PDF protegido por senha SAIU deste módulo. O critério
// antigo era a string `/Encrypt` no buffer, que dá falso positivo em PDF cifrado só por permissões
// (abre sem senha) e reprovou documento bom. A decisão agora é do ai-service, com pypdf tentando
// abrir com senha vazia; a suíte correspondente vive em `apps/ai-service/tests/test_pdf_seguranca.py`.
