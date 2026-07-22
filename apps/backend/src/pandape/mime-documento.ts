/**
 * BLOCO A (fix do mime) — resolução da extensão de um documento baixado do Pandapé, para a staging
 * gravar o arquivo COM extensão e o ai-service inferir o mime correto (nunca `application/octet-stream`,
 * que o Vertex/Gemini rejeita com 400 e vira 500).
 *
 * Estratégia (decisão do diretor, §A.9):
 *   1. PRIMÁRIO: a extensão vem do `Content-Type` do download.
 *   2. FALLBACK: header ausente/vazio/`octet-stream` → fareja os magic bytes do buffer.
 *   3. Nada resolveu → `null` (o chamador NÃO manda octet-stream para a IA; documento fica
 *      aguardando auditoria).
 *
 * Função PURA, sem I/O, sem PII (§A.6): olha só o mime declarado e os primeiros bytes, nunca o nome
 * de arquivo nem a URL do Pandapé. Cobre os formatos aceitos pela auditoria: PDF, JPEG, PNG.
 */

/** Extensão canônica por tipo suportado (mesma tabela do `_mime_de` do ai-service). */
type ExtensaoSuportada = ".pdf" | ".jpg" | ".png";

/** Content-Type declarado no download → extensão. Ignora parâmetros (ex.: `; charset=`). null = não resolve. */
export function extensaoDeContentType(
  contentType: string | null | undefined,
): ExtensaoSuportada | null {
  if (!contentType) return null;
  const tipo = contentType.split(";")[0]?.trim().toLowerCase();
  switch (tipo) {
    case "application/pdf":
      return ".pdf";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    default:
      return null;
  }
}

/** Fareja os magic bytes do conteúdo → extensão. null = assinatura não reconhecida. */
export function extensaoPorMagicBytes(buffer: Buffer): ExtensaoSuportada | null {
  if (buffer.length < 4) return null;
  // %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return ".pdf";
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return ".png";
  }
  return null;
}

/**
 * Resolve a extensão do documento: Content-Type primeiro, magic bytes como rede de segurança. NUNCA
 * devolve algo que leve a `octet-stream`; devolve `null` quando não há como determinar o formato, e
 * cabe ao chamador tratar como "aguardando auditoria" em vez de mandar octet-stream para a IA.
 */
export function resolverExtensaoDocumento(
  contentType: string | null | undefined,
  buffer: Buffer,
): ExtensaoSuportada | null {
  return extensaoDeContentType(contentType) ?? extensaoPorMagicBytes(buffer);
}

/**
 * BLOCO 3 (PDF protegido) — detecta na COLETA, sem lib externa, se um PDF está criptografado /
 * protegido por senha, ANTES de mandar para a IA (que devolveria "no pages" e um 500 inútil). O
 * critério barato: é um PDF (`%PDF`) e o corpo declara o dicionário de criptografia (`/Encrypt`), que
 * é justamente o que marca um PDF cifrado no trailer. Só olha bytes de estrutura, sem PII (§A.6).
 */
export function pdfProtegidoPorSenha(buffer: Buffer): boolean {
  if (buffer.length < 5) return false;
  const ehPdf = buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46;
  if (!ehPdf) return false;
  // `/Encrypt` como bytes latin1 (o token aparece cru no PDF, mesmo com streams comprimidos).
  return buffer.includes(Buffer.from("/Encrypt", "latin1"));
}
