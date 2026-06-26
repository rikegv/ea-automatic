/**
 * Regras puras da Esteira/Faróis (CLAUDE.md §A.3 / F8 / F12). Sem dependência de DB — testáveis
 * isoladamente. Complementam `frentes.ts` (gate contínuo do Cadastro, regra 3) cobrindo a
 * operação de status por frente e a reversão (recuo de etapa) com alerta.
 */
import { STATUS_CADASTRO_CONTRATO, STATUS_EXAME } from "@ea/shared-types";
import { podeAbrirCadastro, type EstadoFrente, type FrenteTipo } from "./frentes";

/**
 * Progressão operacional dos status por frente — ordem do catálogo seedado
 * (`frente_status_catalogo.ordem`), que é a fonte de verdade dos seletores no front.
 *
 * EXAME e CADASTRO_CONTRATO já vêm em progressão nas arrays de `@ea/shared-types`. Em AUDITORIA,
 * o array de shared-types lista `ANALISE_OK` primeiro (prioridade de exibição/filtro), então a
 * progressão real (pendente → reenvio → ok → declinou) é fixada aqui — é o que define o que é
 * "recuo" (reversão). O conjunto de códigos é idêntico ao de shared-types.
 */
export const ORDEM_STATUS: Record<FrenteTipo, string[]> = {
  AUDITORIA: ["ANALISE_PENDENTE", "AGUARDA_REENVIO", "ANALISE_OK", "DECLINOU"],
  EXAME: [...STATUS_EXAME],
  CADASTRO_CONTRATO: [...STATUS_CADASTRO_CONTRATO],
};

/** Status terminal que conclui cada frente (insumo do gate — regra 3). */
export const STATUS_CONCLUI: Record<FrenteTipo, string> = {
  AUDITORIA: "ANALISE_OK",
  EXAME: "APTO",
  CADASTRO_CONTRATO: "INTEGRACAO",
};

/** O status conclui a frente? */
export function conclui(tipo: FrenteTipo, status: string): boolean {
  return status === STATUS_CONCLUI[tipo];
}

/** O status pertence ao catálogo daquela frente? */
export function isStatusValido(tipo: FrenteTipo, status: string): boolean {
  return ORDEM_STATUS[tipo].includes(status);
}

/**
 * A transição `de → para` é um recuo (reversão) na progressão da frente?
 * Status fora do catálogo nunca caracteriza reversão (indexOf -1).
 */
export function isReversao(tipo: FrenteTipo, de: string, para: string): boolean {
  const ordem = ORDEM_STATUS[tipo];
  const i = ordem.indexOf(de);
  const j = ordem.indexOf(para);
  if (i === -1 || j === -1) return false;
  return j < i;
}

/**
 * A reversão derruba um Cadastro já aberto? Verdadeiro quando uma frente concluinte (AUDITORIA ou
 * EXAME) sai do seu status terminal — recuando o gate — enquanto o Cadastro estava aberto. É o
 * gatilho do alerta de confirmação (reabrir pendência num candidato já em cadastro).
 *
 * `cadastroAbertoAgora` deve ser derivado de `podeAbrirCadastro(frentes)` ANTES da mudança.
 */
export function reversaoDerrubaCadastro(
  tipo: FrenteTipo,
  de: string,
  para: string,
  cadastroAbertoAgora: boolean,
): boolean {
  return (
    (tipo === "AUDITORIA" || tipo === "EXAME") &&
    conclui(tipo, de) &&
    !conclui(tipo, para) &&
    cadastroAbertoAgora
  );
}

/** Reexporta o gate puro para quem opera a esteira (estado da regra 3). */
export { podeAbrirCadastro };
export type { EstadoFrente };
