/**
 * PILL DA COLUNA "PENDÊNCIAS OBRIGATÓRIAS", num lugar só (OST do "Parcial" com zero pendências).
 *
 * O DEFEITO QUE ISTO CONSERTA. A coluna mostrava **Parcial** em admissão cujo card, ao ser clicado,
 * listava **zero** pendência obrigatória. Causa: o card e o pill bebiam de fontes DIFERENTES.
 *  - o CARD lista `pendenciasObrigatorias` calculada ao vivo (campos obrigatórios vazios);
 *  - o PILL lia o enum `sinalizador_preenchimento`, que a auditoria SOBRESCREVE com `INCONFORMIDADE`
 *    sempre que existe documento inconforme.
 * Documento inconforme não é pendência de CAMPO. O resultado era a coluna se contradizendo na mesma
 * linha, e a inconformidade documental sendo contada duas vezes (ela já tem a coluna Auditoria).
 *
 * A REGRA, agora explícita: **`temPendencias` manda.** Zero pendência obrigatória lê "Completo",
 * qualquer que seja o sinalizador. O enum só é consultado quando o backend não informou a contagem
 * (compatibilidade com uma resposta anterior a esta correção) e para os estados que não são grau de
 * preenchimento (Competências).
 *
 * O mapa vivia COPIADO em `gerenciador/page.tsx` e `esteira/page.tsx`, que é como as duas telas
 * divergiram. Agora é este módulo, com teste próprio.
 */

export type PillTone = "ok" | "wn" | "dg" | "nt";

export interface PillPendencias {
  tone: PillTone;
  label: string;
}

/** Faróis de admissão ENCERRADA: não têm pendência de processo vivo (§A.16, Bloco D). */
const FAROIS_ENCERRADOS = ["DECLINOU", "RESCISAO"];

/**
 * Decide o pill da coluna.
 *
 * @param farolGlobal farol da admissão (dado autoritativo do encerramento).
 * @param sinalizador enum `sinalizador_preenchimento` gravado.
 * @param temPendencias há campo obrigatório faltando? `undefined` = backend não informou.
 */
export function pillPendencias(
  farolGlobal: string | null | undefined,
  sinalizador: string | null | undefined,
  temPendencias?: boolean,
): PillPendencias {
  // Encerrada vence tudo: quem declinou não deixa pendência de processo vivo (§A.16).
  if (farolGlobal && FAROIS_ENCERRADOS.includes(farolGlobal)) {
    return { tone: "dg", label: "Declínio" };
  }

  // Competências é estado PRÓPRIO, não grau de preenchimento: preservado como sempre foi.
  if (sinalizador === "COMPETENCIAS") return { tone: "nt", label: "Competências" };

  // A FONTE DA VERDADE. Zero pendência obrigatória NUNCA lê "Parcial".
  if (temPendencias !== undefined) {
    return temPendencias ? { tone: "wn", label: "Parcial" } : { tone: "ok", label: "Completo" };
  }

  // Sem a contagem (resposta antiga): cai no enum, como era antes. OK lê Completo; os três valores
  // que significam "falta informação obrigatória" leem Parcial, no mesmo tom (OST B2 / Bloco 1).
  if (sinalizador === "OK") return { tone: "ok", label: "Completo" };
  if (sinalizador === "PARCIAL" || sinalizador === "PENDENTE" || sinalizador === "INCONFORMIDADE") {
    return { tone: "wn", label: "Parcial" };
  }
  return { tone: "nt", label: sinalizador ?? "não informado" };
}
