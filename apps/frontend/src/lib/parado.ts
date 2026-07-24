/**
 * Rótulo do MARCADOR DE TEMPO PARADO (OST motivo verdadeiro, Bloco 5).
 *
 * A regra de QUANDO sinalizar mora no backend (`domain/auditoria-parada`, limiar de 6h): a tela
 * recebe as horas já decididas e só precisa dizê-las em português. Deixar a régua num lugar só evita
 * a divergência clássica de a coluna dizer uma coisa e o modal outra sobre a MESMA linha.
 *
 * Puro, sem dependência de componente, para ser testável isolado.
 */

/** Horas paradas → texto curto. Acima de 48h a conta vira dias, que é como a operação fala. */
export function rotuloParado(horas: number): string {
  if (!Number.isFinite(horas) || horas < 1) return "menos de 1 hora";
  if (horas < 48) return horas === 1 ? "1 hora" : `${Math.floor(horas)} horas`;
  const dias = Math.floor(horas / 24);
  return `${dias} dias`;
}
