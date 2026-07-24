import { extname } from "node:path";

/**
 * REGRAS PURAS da visualização de documento (OST visualização/descarte, Bloco 2). Sem banco, sem
 * disco, sem rede: só as decisões, para poderem ser testadas isoladamente.
 *
 * §A.6 é o motivo de este arquivo existir separado. A rota NÃO pode receber caminho do cliente, e
 * também não pode DEVOLVER caminho: o cliente só conhece (admissão, tipo, índice). Quem transforma
 * índice em caminho é o servidor, com a lista ORDENADA de forma determinística.
 */

/** Tipos que o navegador abre inline com segurança. Nada fora desta lista é servido. */
const MIME_POR_EXTENSAO: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/**
 * Mime de um arquivo da staging, pela EXTENSÃO do nome gravado por nós (`{TIPO}__{uuid}.{ext}`).
 * `undefined` para extensão fora da allowlist: nesse caso o arquivo não é servido, em vez de sair
 * como `application/octet-stream` e virar download de conteúdo arbitrário.
 */
export function mimeDeVisualizacao(caminho: string): string | undefined {
  return MIME_POR_EXTENSAO[extname(caminho).toLowerCase()];
}

/**
 * Ordena os arquivos de um tipo de forma DETERMINÍSTICA (pelo caminho). O índice que a tela usa para
 * pedir o arquivo N só é estável se a ordem for sempre a mesma, e `readdir` não garante ordem.
 *
 * Importa de verdade quando o tipo tem VÁRIOS arquivos (frente e verso de um RG, as páginas da
 * CTPS): o veredito é do conjunto, então o consultor precisa abrir cada peça sabendo qual é qual.
 */
export function ordenarParaVisualizacao<T extends { caminho: string }>(arquivos: T[]): T[] {
  return [...arquivos].sort((a, b) => a.caminho.localeCompare(b.caminho));
}

/**
 * Nome amigável exibido na tela para o arquivo N de um conjunto de M. NUNCA usa o nome do arquivo
 * original (que no Pandapé já veio com CPF dentro, §A.6) nem o nome gravado na staging: é rótulo
 * montado do zero, a partir do nome do TIPO e da posição.
 */
export function rotuloArquivo(nomeTipo: string, indice: number, total: number): string {
  return total <= 1 ? nomeTipo : `${nomeTipo} (${indice + 1} de ${total})`;
}
