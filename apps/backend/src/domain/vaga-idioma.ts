import { IDIOMA_NIVEIS, type AsVagaIdioma, type IdiomaNivel } from "@ea/shared-types";

/**
 * ─ O IDIOMA EXIGIDO COMO ELE FICA GRAVADO (Onda C) ─────────────────────────────────────────────
 *
 * ┌─ POR QUE ESTE TIPO NÃO É O `AsVagaIdioma` DO CONTRATO, e a diferença é UMA palavra ──────────┐
 * │ `AsVagaIdioma.nivel` é OBRIGATÓRIO, e está certo assim: é a regra da peça, e toda escrita    │
 * │ nova passa pelo DTO, que recusa idioma sem nível. O que o contrato não tem como expressar    │
 * │ hoje é a LINHA MIGRADA: as vagas gravadas antes desta onda pedem idioma e NÃO TÊM nível,     │
 * │ porque nível não existia.                                                                     │
 * │                                                                                               │
 * │ A MIGRATION NÃO PODE INVENTAR ESSE NÍVEL (veto da auditoria, e o veto está certo): um nível  │
 * │ baixo AFROUXA a exigência de uma vaga aberta e recebendo candidato, e um alto ELIMINA gente  │
 * │ do processo, em silêncio, sem ninguém ter decidido. Então o nível fica AUSENTE, e "ausente"  │
 * │ precisa de um tipo que o admita.                                                              │
 * │                                                                                               │
 * │ É POR ISSO QUE ELE MORA NO BACKEND E NÃO NO CONTRATO: o `packages/shared-types` tem dono     │
 * │ único nesta frente (§A.39). Se o coordenador decidir afrouxar `AsVagaIdioma.nivel` para      │
 * │ `IdiomaNivel | null`, este arquivo vira um `export type ... = AsVagaIdioma` e some.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export interface VagaIdiomaGravado {
  idioma: string;
  /** `null` significa EXATAMENTE "vaga anterior à Onda C", nunca "alguém deixou em branco". */
  nivel: IdiomaNivel | null;
}

/**
 * O QUE VEIO DO `jsonb`, SANEADO, e por que sanear é obrigatório aqui.
 *
 * `jsonb` É COLUNA SEM ESQUEMA. O DTO defende a porta HTTP, e o banco aceitaria qualquer coisa que
 * chegasse por outro caminho (um `UPDATE` manual, uma carga futura, um bug). Esta função é a régua
 * da LEITURA: o que não for um par reconhecível não vira `undefined` no meio da tela, ele
 * simplesmente não entra na lista.
 *
 * O NÍVEL DESCONHECIDO VIRA `null`, e não é descartado junto com o idioma: a exigência do idioma é
 * verdadeira mesmo quando o nível não é legível, e apagar a linha inteira esconderia da tela uma
 * exigência que a vaga faz.
 */
export function idiomasGravados(bruto: unknown): VagaIdiomaGravado[] {
  if (!Array.isArray(bruto)) return [];
  const niveis = new Set<string>(IDIOMA_NIVEIS);
  return bruto.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { idioma, nivel } = item as { idioma?: unknown; nivel?: unknown };
    if (typeof idioma !== "string" || !idioma.trim()) return [];
    const nivelValido = typeof nivel === "string" && niveis.has(nivel) ? (nivel as IdiomaNivel) : null;
    return [{ idioma: idioma.trim(), nivel: nivelValido }];
  });
}

/** O par COMPLETO, que é o único que o contrato compartilhado sabe descrever. */
export function temNivel(i: VagaIdiomaGravado): i is AsVagaIdioma {
  return i.nivel !== null;
}
