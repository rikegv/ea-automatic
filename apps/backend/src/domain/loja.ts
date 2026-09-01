/**
 * DOMÍNIO PURO DA LOJA (cenário 1, `docs/DESENHO-LOJAS-UNIDADES.md`). Sem I/O.
 *
 * Uma função só, e ela é o coração do catálogo: a NORMALIZAÇÃO DO NOME. Ela existe em três lugares
 * que precisam concordar por construção, e não por coincidência:
 *
 *  1. o índice único do banco (`uq_cliente_loja_nome`);
 *  2. a detecção de nome repetido no serviço do catálogo;
 *  3. o casamento de nome das duas importações (etapas 2 e 4).
 *
 * Se os três divergirem, o sistema aceita "LOJA CENTRO " como nome novo num lugar e o recusa em
 * outro, que é como um catálogo volta a acumular a mesma loja escrita de N formas. Foi assim que o
 * centro de custo chegou a 435 valores, dos quais 11 são só variação de caixa e espaço.
 *
 * CAIXA E ESPAÇO, SEM TIRAR ACENTO: é o que as duplicatas reais são. Tirar acento exigiria a
 * extensão `unaccent`, que não está instalada, e instalar extensão é escopo que ninguém pediu
 * (§A.14). "Loja Sé" e "Loja Se" ficam como duas lojas, e a prévia da importação mostra as duas.
 */

/**
 * O nome como o banco o compara: sem espaço nas pontas, espaços internos colapsados em um só, e em
 * maiúsculas. TEM DE SER IDÊNTICA à expressão do índice único.
 */
export function nomeLojaNormalizado(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Dois nomes são a mesma loja? É a pergunta que as importações fazem linha a linha. */
export function mesmoNomeDeLoja(a: string, b: string): boolean {
  return nomeLojaNormalizado(a) === nomeLojaNormalizado(b);
}
