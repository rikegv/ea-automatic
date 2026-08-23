/**
 * SALÁRIO NO CAMPO, em pt-BR (OST do salário que "desconfigurava").
 *
 * O campo do lápis carregava o valor CRU do banco ("1806.00"). Quem abria o lápis lia um número com
 * PONTO, num sistema em que ponto é separador de milhar, e ao salvar o backend fazia exatamente o
 * que a régua pt-BR manda: apagava o ponto. O salário virava 180600,00, e de novo a cada salvamento.
 *
 * O backend já reconhece a forma canônica (`valor-monetario-br`), e esta é a outra metade: a tela
 * mostra o que o time lê e digita ("1.806,00"), então o valor exibido, o digitado e o gravado são o
 * mesmo. Valor não numérico volta como veio, sem inventar formatação.
 *
 * Vive em `lib/` para ser testável: a prova pedida na OST é que o valor NÃO muda ao reabrir nem ao
 * salvar de novo, e isso é o teste de idempotência em `salario.spec.ts`.
 */
export function salarioParaCampo(v: string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * MÁSCARA de moeda pt-BR: a PRIMEIRA barreira do campo de valor. Guarda só os dígitos e formata como
 * centavos, então valor inválido (letra, "R$" solto, pontuação torta) nem chega a ser digitado.
 * Ex.: "250000" vira "2.500,00". A normalização do backend (`valor-monetario-br`) é a barreira final.
 *
 * A GÊMEA DELA VIVE NA TELA DE LIBERAÇÃO e não foi movida para cá de propósito (§A.26): aquele campo
 * é código validado e em uso, e mexer nele para economizar cinco linhas seria arriscar uma frente
 * que já funciona por conta de outra. Quando a Liberação for aberta por motivo próprio, ela passa a
 * importar daqui e a duplicação morre.
 */
export function maskMoedaBR(raw: string): string {
  const digitos = raw.replace(/\D/g, "");
  if (!digitos) return "";
  const n = Number(digitos) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
