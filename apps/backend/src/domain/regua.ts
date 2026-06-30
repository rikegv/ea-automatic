/**
 * Lógica PURA de completude da régua obrigatória (§A.3 regra 4 / F2). Sem dependência de DB —
 * testável isoladamente. O `ReguaCompletudeService` consulta o banco e delega o cálculo aqui; a
 * `EsteiraService` reusa o mesmo helper, garantindo um único critério de "completude" no sistema.
 *
 * Nada de PII (§A.6): trabalha só com o NOME do tipo de documento (rótulo) e o estado persistido.
 */
import type { ProgressoRegua } from "@ea/shared-types";

export type EstadoDocumento = "PENDENTE" | "ENTREGUE" | "INCONFORME" | null;

/** Linha da régua de uma admissão: o tipo exigido + seu estado atual (null = nunca tocado). */
export interface DocReguaEstado {
  nome: string;
  exigencia: "OBRIGATORIO" | "NAO_OBRIGATORIO" | "FACULTATIVO";
  estado: EstadoDocumento;
}

const entregue = (e: EstadoDocumento): boolean => e === "ENTREGUE";

/**
 * Documentos OBRIGATÓRIOS que ainda NÃO estão ENTREGUE — insumo do gatilho NC-1 e do aceite de
 * conclusão da Auditoria. Retorna os NOMES dos tipos faltantes (rótulos, sem dado pessoal).
 */
export function faltantesObrigatorios(docs: DocReguaEstado[]): string[] {
  return docs
    .filter((d) => d.exigencia === "OBRIGATORIO" && !entregue(d.estado))
    .map((d) => d.nome);
}

/**
 * Progresso da régua obrigatória (barra "X de Y"). `completa` exige ao menos UM obrigatório e
 * nenhum faltante — uma régua sem obrigatórios NÃO é considerada "completa" (não há nada a
 * arquivar no Drive; evita disparo espúrio de arquivamento). Função PURA.
 */
export function calcularProgressoRegua(docs: DocReguaEstado[]): ProgressoRegua {
  const obrigatorios = docs.filter((d) => d.exigencia === "OBRIGATORIO");
  const obrigatoriosEntregues = obrigatorios.filter((d) => entregue(d.estado)).length;
  const faltantes = faltantesObrigatorios(docs);
  return {
    obrigatoriosTotal: obrigatorios.length,
    obrigatoriosEntregues,
    faltantes,
    completa: obrigatorios.length > 0 && faltantes.length === 0,
  };
}
