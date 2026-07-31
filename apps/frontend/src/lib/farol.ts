import { FAROL_GLOBAL, FAROL_GLOBAL_LABEL, type FarolGlobal } from "@ea/shared-types";
import type { PillTone } from "@/components/ui/Pill";

/**
 * Tom da pill por farol global (§A.3). Mapeia os 5 valores oficiais aos tons do Design System:
 * em admissão → azul (in), banco-aguardar → neutro (nt), concluída → verde (ok),
 * declinou → vermelho (dg), rescisão → laranja (or).
 */
export const FAROL_TONE: Record<FarolGlobal, PillTone> = {
  EM_ADMISSAO: "in",
  BANCO_AGUARDAR: "nt",
  ADMISSAO_CONCLUIDA: "ok",
  DECLINOU: "dg",
  RESCISAO: "or",
  // Pré-admissão aguardando liberação: neutro (é uma sala de espera, não um estado do processo vivo).
  AGUARDANDO_LIBERACAO: "nt",
  // Liberação recusada: vermelho (encerrada por recusa, como o declínio).
  LIBERACAO_RECUSADA: "dg",
};

/** {tone,label} de um farol (aceita string crua do backend; cai em neutro se desconhecido). */
export function farolPill(codigo: string): { tone: PillTone; label: string } {
  // Pausa: pseudo-valor de tela (ver FAROL_PAUSADA). Amarelo, o tom de "parado, não encerrado".
  if (codigo === "PAUSADA") return { tone: "wn", label: "Admissão Pausada" };
  const fg = codigo as FarolGlobal;
  if (fg in FAROL_GLOBAL_LABEL) {
    return { tone: FAROL_TONE[fg], label: FAROL_GLOBAL_LABEL[fg] };
  }
  return { tone: "nt", label: codigo };
}

/**
 * "Admissão Pausada" no seletor de status (OST da pausa, correção do diretor).
 *
 * PSEUDO-VALOR DE TELA, e a distinção é o ponto técnico da OST. No banco a pausa é uma FLAG paralela
 * (`pausada_em`), NUNCA um valor de `farol_global`, porque foi assim que o farol pôde continuar
 * derivando por baixo da pausa (auditar durante a pausa chama `recomputeFarolGlobal`, e "Pausada"
 * como farol precisaria entrar em FAROL_MANUAL, o que congelaria a derivação e faria o farol MENTIR
 * ao retomar).
 *
 * Como os dois se reconciliam: o SELETOR é apresentação. O que ele exibe é derivado
 * (`valorSeletorFarol`) e o que ele grava é traduzido (`PAUSADA` aciona a rota de pausa; qualquer
 * outro valor, estando pausada, aciona a de retomada). O consultor vê e escolhe "Admissão Pausada"
 * como escolhe qualquer status; o farol real segue intacto e honesto por baixo.
 */
export const FAROL_PAUSADA = "PAUSADA" as const;
export const FAROL_PAUSADA_LABEL = "Admissão Pausada";

/**
 * Opções de farol para <Select> (edição/filtro do Gerenciador). Exclui AGUARDANDO_LIBERACAO: é
 * estado de SISTEMA (pré-admissão do Pandapé), não uma escolha manual — atribuí-lo pelo lápis
 * arrancaria a admissão da esteira. A liberação é feita na tela de Liberação Admissional, não aqui.
 *
 * "Admissão Pausada" entra logo depois de "Em Admissão": é dali que se pausa (só EM_ADMISSAO pausa,
 * decisão do diretor), então a opção fica ao lado do estado de onde ela nasce.
 */
export const FAROL_SELECT_OPTIONS = FAROL_GLOBAL.filter(
  (value) => value !== "AGUARDANDO_LIBERACAO" && value !== "LIBERACAO_RECUSADA",
).flatMap((value) => {
  const opt = { value: value as string, label: FAROL_GLOBAL_LABEL[value] };
  return value === "EM_ADMISSAO"
    ? [opt, { value: FAROL_PAUSADA, label: FAROL_PAUSADA_LABEL }]
    : [opt];
});

/**
 * O que o seletor MOSTRA para uma admissão: "Pausada" quando a flag está de pé, senão o farol real.
 * Uma função só, usada por toda tela que exibe o seletor, para não haver duas leituras da pausa.
 */
export function valorSeletorFarol(
  farolGlobal: string,
  pausadaEm?: string | null,
): string {
  return pausadaEm ? FAROL_PAUSADA : farolGlobal;
}
