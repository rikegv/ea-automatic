/**
 * ─ O CANÁRIO DE MONOTONICIDADE DA AGREGAÇÃO (guarda exigida pelo `seguranca`, 07/10/2026) ───────
 *
 * ┌─ O QUE ELE TRAVA, E POR QUE CASO A CASO NÃO BASTAVA ────────────────────────────────────────┐
 * │ Quando a regra virou "a ABERTA ganha da FECHADA", o `seguranca` provou por enumeração que a   │
 * │ mudança é uma RELAXAÇÃO MONOTÔNICA: ela só pode DEIXAR DE ESCONDER, nunca passar a esconder.  │
 * │ Mas os testes travavam CASOS (combinações escolhidas à mão), não a PROPRIEDADE. Quem mexesse  │
 * │ na precedência de volta passaria por todos eles escolhendo um conjunto que ninguém listou.     │
 * │                                                                                               │
 * │ Este arquivo enumera os 31 subconjuntos NÃO VAZIOS do vocabulário canônico, que é o espaço de  │
 * │ entrada COMPLETO da agregação (ela só olha PRESENÇA de token, não ordem nem repetição), e      │
 * │ assere a invariante: NENHUM conjunto passou a esconder.                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA REVOGADA VIVE AQUI DENTRO, de propósito, como implementação de REFERÊNCIA. Ela foi
 * removida da produção (era `every`, fail-closed no conflito) e é reescrita aqui só para o
 * comparativo. Sem ela, a invariante não teria contra o que ser medida, e um teste que compara o
 * código novo consigo mesmo não prova nada.
 *
 * §A.6: vocabulário fechado de status, zero dado pessoal. Domínio puro, sem banco e sem rede.
 */

import { describe, expect, it } from "vitest";
import {
  STATUS_DE_PLANILHA_QUE_ENTRAM,
  agregarStatusDaPlanilha,
  vagaDaPlanilhaSai,
  type StatusDePlanilhaCanonico,
} from "./as-planilha-status-vaga";

/** O vocabulário inteiro. A agregação não conhece nenhum token fora desta lista. */
const VOCABULARIO: readonly StatusDePlanilhaCanonico[] = [
  "ABERTO",
  "ENTREGUE",
  "FECHADO",
  "CANCELADO",
  "OUTRO",
];

/**
 * A AGREGAÇÃO REVOGADA (fail-closed no conflito), como estava antes de 07/10/2026. Referência de
 * comparação, nunca o comportamento desejado: se qualquer linha não entrava, o código inteiro era
 * tratado como encerrado, e era isso que fazia vaga ABERTA sumir da fila.
 */
function agregacaoRevogada(
  canonicos: readonly StatusDePlanilhaCanonico[],
): StatusDePlanilhaCanonico | null {
  if (canonicos.length === 0) return null;
  const todosEntram = canonicos.every((s) => STATUS_DE_PLANILHA_QUE_ENTRAM.includes(s));
  if (todosEntram) return canonicos.includes("ENTREGUE") ? "ENTREGUE" : "ABERTO";
  if (canonicos.includes("CANCELADO")) return "CANCELADO";
  if (canonicos.includes("FECHADO")) return "FECHADO";
  return "OUTRO";
}

/** Os 31 subconjuntos não vazios, por máscara de bits sobre o vocabulário de 5 tokens. */
function subconjuntosNaoVazios(): StatusDePlanilhaCanonico[][] {
  const todos: StatusDePlanilhaCanonico[][] = [];
  for (let mascara = 1; mascara < 1 << VOCABULARIO.length; mascara += 1) {
    const conjunto = VOCABULARIO.filter((_, i) => (mascara & (1 << i)) !== 0);
    todos.push([...conjunto]);
  }
  return todos;
}

describe("agregação por código: a invariante de monotonicidade (canário do seguranca)", () => {
  const conjuntos = subconjuntosNaoVazios();

  it("o espaço de entrada enumerado é o completo: 31 subconjuntos não vazios", () => {
    expect(conjuntos).toHaveLength(31);
  });

  it("NENHUM conjunto passou a esconder: esconder agora implica esconder antes", () => {
    const regressoes: string[] = [];
    for (const conjunto of conjuntos) {
      const escondeAntes = vagaDaPlanilhaSai(agregacaoRevogada(conjunto));
      const escondeDepois = vagaDaPlanilhaSai(agregarStatusDaPlanilha(conjunto));
      if (escondeDepois && !escondeAntes) regressoes.push(conjunto.join("+"));
    }
    // A mensagem nomeia o conjunto culpado, para quem quebrar isto saber qual combinação regrediu.
    expect(regressoes, `conjuntos que passaram a esconder: ${regressoes.join(", ")}`).toEqual([]);
  });

  it("a relaxação é real e medida: 6 conjuntos escondem agora, contra 24 antes", () => {
    const antes = conjuntos.filter((c) => vagaDaPlanilhaSai(agregacaoRevogada(c))).length;
    const depois = conjuntos.filter((c) => vagaDaPlanilhaSai(agregarStatusDaPlanilha(c))).length;
    expect(antes).toBe(24);
    expect(depois).toBe(6);
  });

  it("o braço de ENCERRAMENTO é idêntico: quando o novo esconde, o token é o mesmo do antigo", () => {
    for (const conjunto of conjuntos) {
      if (!vagaDaPlanilhaSai(agregarStatusDaPlanilha(conjunto))) continue;
      expect(agregarStatusDaPlanilha(conjunto), conjunto.join("+")).toBe(
        agregacaoRevogada(conjunto),
      );
    }
  });

  it("todo conjunto SEM linha viva continua escondendo, e todo conjunto COM linha viva aparece", () => {
    for (const conjunto of conjuntos) {
      const temLinhaViva = conjunto.some((s) => STATUS_DE_PLANILHA_QUE_ENTRAM.includes(s));
      const soEncerramento = conjunto.every((s) => s === "FECHADO" || s === "CANCELADO");
      const esconde = vagaDaPlanilhaSai(agregarStatusDaPlanilha(conjunto));
      if (temLinhaViva) expect(esconde, `${conjunto.join("+")} tem linha viva`).toBe(false);
      if (soEncerramento) expect(esconde, `${conjunto.join("+")} é só encerramento`).toBe(true);
    }
  });

  it("a ausência de status nunca esconde: lista vazia agrega nulo e nulo não sai", () => {
    expect(agregarStatusDaPlanilha([])).toBeNull();
    expect(vagaDaPlanilhaSai(null)).toBe(false);
  });
});
