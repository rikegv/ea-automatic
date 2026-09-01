/**
 * GUARDA DO ARQUIVAMENTO: um contrato SEM ASSINATURA nunca vai para o Drive (§A.33).
 *
 * POR QUE ESTE ARQUIVO EXISTE. Em 25 e 28/08/2026 dez admissões perderam o contrato porque o
 * pipeline baixou o `files.original` (o kit CRU) achando que era o assinado, arquivou no Drive com o
 * nome "Contrato Assinado", marcou ASSINADO, apagou a cópia local do kit e tirou a admissão da fila.
 * Do ponto de vista do sistema nada tinha falhado: o dano foi permanente e silencioso.
 *
 * A causa (o `?? files.original` em `obterUrlAssinado`) foi removida no commit `3e10ddd`. Isto aqui
 * é a segunda tranca, a pedido do diretor: a ausência de um fallback é disciplina, e disciplina se
 * perde numa refatoração. A guarda olha o BINÁRIO que está prestes a subir e recusa o arquivamento
 * se ele não for um assinado de verdade. Qualquer caminho futuro que volte a entregar o kit cru
 * esbarra aqui, mesmo que ninguém se lembre desta história.
 *
 * O CRITÉRIO, MEDIDO E NÃO DEDUZIDO (01/09/2026, contra a produção). Comparados os dois ativos da
 * Clicksign (`files.original` e `files.signed`) de três envelopes reais:
 *
 *   | ativo    | %PDF- | /ByteRange | /Name(Clicksign) |
 *   |----------|-------|------------|------------------|
 *   | original |  sim  |     0      |        0         |
 *   | signed   |  sim  |     1      |        1         |
 *
 * As duas marcas são a ASSINATURA DIGITAL do PDF, não texto de página: `/ByteRange` é o intervalo
 * assinado criptograficamente e `/Name(Clicksign)` é o campo do assinador dentro do dicionário
 * `/Sig` (o contexto real observado foi `/TransformMethod/DocMDP>>]/M(D:...)/Name(Clicksign)`). Por
 * isso o critério é estrutural: um kit cru não tem como exibi-las por acidente, e um assinado não
 * tem como perdê-las. O log de assinatura em texto seria um sinal mais frágil, porque depende de
 * extrair texto de página (e há kits com páginas em imagem).
 *
 * §A.6: a função recebe bytes em memória e devolve um veredicto. Não persiste, não loga, não guarda
 * o binário e nada aqui toca CPF, nome ou URL.
 */

/** Assinatura digital presente no PDF: o intervalo assinado. Tolera espaço antes do `[`. */
const MARCA_BYTE_RANGE = /\/ByteRange\s*\[/i;

/** O assinador dentro do dicionário `/Sig`. Tolera espaço antes e dentro do parêntese. */
const MARCA_ASSINADOR_CLICKSIGN = /\/Name\s*\(\s*Clicksign/i;

/** Todo PDF começa com esta marca; recusar cedo evita varrer lixo binário atrás de assinatura. */
const CABECALHO_PDF = "%PDF-";

/**
 * Veredicto da guarda. O `motivo` é curto e sem PII de propósito: ele vai para o log de ERRO e
 * precisa dizer POR QUE recusou sem carregar nada do candidato.
 */
export type VeredictoContratoAssinado = { ok: true } | { ok: false; motivo: string };

/**
 * O binário é um contrato ASSINADO pela Clicksign?
 *
 * Recusa (nesta ordem): vazio, não-PDF, PDF sem dicionário de assinatura, PDF assinado por outro
 * emissor que não a Clicksign. Só o `ok: true` autoriza o arquivamento.
 */
export function verificarContratoAssinado(bytes: Uint8Array | undefined): VeredictoContratoAssinado {
  if (!bytes || bytes.byteLength === 0) return { ok: false, motivo: "arquivo vazio" };

  // latin1 preserva byte a byte (todo byte vira um code unit), então a busca acha as marcas mesmo em
  // meio a stream binário. É uma cópia transitória do buffer que já está em memória, descartada no
  // fim da chamada; o custo é aceitável para o único ponto do sistema que arquiva contrato.
  const texto = Buffer.from(bytes).toString("latin1");

  if (!texto.startsWith(CABECALHO_PDF)) return { ok: false, motivo: "não é um PDF" };
  if (!MARCA_BYTE_RANGE.test(texto)) {
    return { ok: false, motivo: "PDF sem assinatura digital (kit cru, provavelmente o `original`)" };
  }
  if (!MARCA_ASSINADOR_CLICKSIGN.test(texto)) {
    return { ok: false, motivo: "PDF assinado, mas não pela Clicksign" };
  }
  return { ok: true };
}
