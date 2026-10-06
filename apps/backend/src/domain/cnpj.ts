/**
 * DOMÍNIO PURO do CNPJ. Sem I/O.
 *
 * Espelha o estilo de `assinante-empresa.ts` (CPF): só dígitos, dígito verificador conferido de
 * verdade e sequência repetida rejeitada. Existe para a importação de clientes recusar a linha com
 * CNPJ inválido ANTES de gravar, no lugar onde quem enviou a planilha pode corrigir.
 *
 * §A.6: o CNPJ é dado do estabelecimento, não dado pessoal, mas estas funções não logam nada: só
 * recebem a string e devolvem um booleano.
 */

/** Só os dígitos do CNPJ (tira pontuação, barra, traço e espaço). */
export function soDigitosCnpj(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * CNPJ com os dois dígitos verificadores conferidos. Rejeita também as sequências repetidas
 * (00000000000000 até 99999999999999), que passam no cálculo mas não são CNPJ.
 *
 * O cálculo é o oficial: o primeiro dígito pesa as 12 primeiras posições com os pesos
 * 5,4,3,2,9,8,7,6,5,4,3,2; o segundo pesa as 13 primeiras com 6,5,4,3,2,9,8,7,6,5,4,3,2. Resto da
 * divisão por 11 menor que 2 faz o dígito ser 0, senão o dígito é 11 menos o resto.
 */
export function cnpjValido(cnpj: string | null | undefined): boolean {
  const d = soDigitosCnpj(cnpj);
  if (d.length !== 14 || new Set(d).size === 1) return false;
  const pesosPrimeiro = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const pesosSegundo = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  for (const [tamanho, pesos] of [
    [12, pesosPrimeiro],
    [13, pesosSegundo],
  ] as const) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(d[i]) * pesos[i];
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[tamanho])) return false;
  }
  return true;
}
