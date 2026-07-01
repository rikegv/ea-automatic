import { randomInt } from "node:crypto";

// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) para senha temporária legível ao ditar/copiar.
const MINUSC = "abcdefghijkmnpqrstuvwxyz";
const MAIUSC = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITOS = "23456789";
const SIMBOLOS = "!@#$%*?";
const TODOS = MINUSC + MAIUSC + DIGITOS + SIMBOLOS;

/** Sorteio criptograficamente seguro (crypto.randomInt — nunca Math.random) — §A.6. */
function pick(alfabeto: string): string {
  return alfabeto[randomInt(alfabeto.length)];
}

/**
 * Gera uma senha temporária forte (>=12 chars, via crypto). Garante ao menos um de cada classe
 * (minúscula/maiúscula/dígito/símbolo) e embaralha com Fisher-Yates seguro. Retornada em claro
 * uma única vez ao admin; jamais logada nem persistida (só o hash argon2 — §A.6).
 */
export function gerarSenhaTemporaria(tamanho = 16): string {
  const min = 12;
  const total = Math.max(tamanho, min);
  const chars = [pick(MINUSC), pick(MAIUSC), pick(DIGITOS), pick(SIMBOLOS)];
  for (let i = chars.length; i < total; i++) chars.push(pick(TODOS));
  // Fisher-Yates com randomInt para não vazar a posição fixa das classes garantidas.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
