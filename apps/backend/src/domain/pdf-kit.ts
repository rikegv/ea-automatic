/**
 * DOMÍNIO PURO da VALIDAÇÃO ESTRUTURAL DO PDF DO KIT (INT-4). Sem I/O: recebe os bytes e responde se
 * o arquivo tem cara de PDF íntegro.
 *
 * POR QUE ISTO EXISTE: a Clicksign ACEITA um PDF estruturalmente inválido sem reclamar. O upload
 * devolve id de documento, o envelope entra em `running` e a API não expõe erro nenhum; a quebra só
 * aparece quando o signatário abre o visualizador e não vê documento. No teste de sandbox de 28/07
 * foi exatamente isso: um stub de 45 bytes, com o cabeçalho `%PDF-1.4` e mais nada, viajou inteiro
 * até o envelope. Com candidato REAL do outro lado, esse erro custa um documento tarifado, um e-mail
 * de convite que não pode ser recolhido e a confiança do time na ferramenta.
 *
 * FILOSOFIA DA RÉGUA: reprovar só com EVIDÊNCIA de arquivo quebrado, nunca por suspeita. Um falso
 * positivo aqui trava kit legítimo na véspera de uma admissão, o que é pior que o problema. Por isso
 * os quatro critérios são os que todo PDF gravado por qualquer gerador satisfaz, e a contagem de
 * páginas é INFORMATIVA (o número pode não aparecer em texto plano quando o arquivo usa object
 * streams comprimidos, e isso não é defeito).
 *
 * §A.6: não lê conteúdo, não extrai texto, não loga bytes. Só estrutura.
 */

/** Resultado da validação. `motivo` é a frase que vai ao consultor, já pronta (§A.11, sem travessão). */
export interface PdfValidado {
  ok: boolean;
  /** Preenchido só quando `ok` é false. Diz o que está errado e o que fazer. */
  motivo?: string;
  /** Páginas detectadas, quando dá para contar sem descomprimir. `null` = não deu para saber. */
  paginas: number | null;
  /** Tamanho em bytes, para a trilha (o log registra tamanho, nunca conteúdo). */
  bytes: number;
}

/**
 * TAMANHO MÍNIMO: 1.000 bytes. Um PDF de uma página em branco, gravado por qualquer biblioteca,
 * passa dos 400 bytes; um kit admissional real tem centenas de KB. O stub que quebrou o teste tinha
 * 45 bytes. O corte é generoso de propósito: pega lixo óbvio sem chegar perto de arquivo legítimo.
 */
const BYTES_MINIMOS = 1000;

/**
 * A cauda onde procuramos `%%EOF` e `startxref`. O padrão permite lixo depois do fim do arquivo, e
 * alguns geradores deixam bytes de sobra, então não exigimos que `%%EOF` seja o último byte.
 */
const CAUDA_BYTES = 4096;

/**
 * Valida a estrutura do PDF. Quatro critérios, todos necessários:
 *
 *  1. cabeçalho `%PDF-` no início (o padrão permite até 1.024 bytes de sujeira antes, então olhamos
 *     um trecho inicial, não só o offset zero);
 *  2. tamanho acima do mínimo;
 *  3. marcador de fim `%%EOF` na cauda;
 *  4. tabela de referências cruzadas apontada por `startxref` na cauda, que é o que o leitor usa para
 *     achar os objetos. É o critério que separa "PDF de verdade" de "arquivo que começa com %PDF".
 *
 * A contagem de páginas NÃO reprova: quando o arquivo usa object streams, `/Type /Page` não aparece
 * em texto plano e contar daria zero num arquivo perfeito.
 */
export function validarPdfKit(buf: Buffer | Uint8Array): PdfValidado {
  const bytes = buf.byteLength;
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);

  // `latin1` mapeia byte a byte, então nenhum byte binário vira caractere de substituição e os
  // marcadores ASCII que procuramos sobrevivem intactos.
  const inicio = b.subarray(0, Math.min(bytes, 1024)).toString("latin1");
  const cauda = b.subarray(Math.max(0, bytes - CAUDA_BYTES)).toString("latin1");

  if (!inicio.includes("%PDF-")) {
    return {
      ok: false,
      bytes,
      paginas: null,
      motivo: "O arquivo do kit não é um PDF (falta o cabeçalho). Gere o kit de novo.",
    };
  }

  if (bytes < BYTES_MINIMOS) {
    return {
      ok: false,
      bytes,
      paginas: null,
      motivo: `O arquivo do kit tem só ${bytes} bytes e está incompleto. Gere o kit de novo.`,
    };
  }

  if (!cauda.includes("%%EOF")) {
    return {
      ok: false,
      bytes,
      paginas: null,
      motivo: "O PDF do kit está truncado (falta o marcador de fim). Gere o kit de novo.",
    };
  }

  if (!cauda.includes("startxref")) {
    return {
      ok: false,
      bytes,
      paginas: null,
      motivo:
        "O PDF do kit está corrompido (sem tabela de referências). Gere o kit de novo antes de enviar.",
    };
  }

  return { ok: true, bytes, paginas: contarPaginas(b) };
}

/**
 * Conta páginas por indício textual, MELHOR ESFORÇO. Prefere `/Count N` do nó raiz de páginas e cai
 * para as ocorrências de `/Type /Page`. Devolve `null` quando não encontra nada, que é o caso normal
 * de arquivo comprimido, e nunca zero: zero seria lido como "sem páginas" e este contador não tem
 * autoridade para afirmar isso.
 */
export function contarPaginas(buf: Buffer): number | null {
  const texto = buf.toString("latin1");

  const counts = [...texto.matchAll(/\/Count\s+(\d+)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (counts.length > 0) return Math.max(...counts);

  // `/Type /Page` com espaçamento livre, sem casar com `/Pages` (o nó da árvore, não uma folha).
  const paginas = [...texto.matchAll(/\/Type\s*\/Page(?![s\w])/g)].length;
  return paginas > 0 ? paginas : null;
}
