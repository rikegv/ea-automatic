import { RETENCAO_EVENTO_RESULTADO, type RetencaoEventoResultado } from "@ea/shared-types";

/**
 * ─ O VOCABULÁRIO DA TRILHA DA RETENÇÃO (A&S, fechamento da fundação unificadora) ────────────────
 *
 * DOMÍNIO PURO: nenhuma consulta, nenhuma injeção, nenhum Nest. Quem escreve a linha é
 * `as/candidatos/candidatos.service.ts` (o método `aplicarRetencao`, único escritor da coluna).
 *
 * ┌─ POR QUE A AÇÃO É COLUNA PRÓPRIA, E NÃO SÓ O PAR "de/para" ───────────────────────────────────┐
 * │ `MARCAR` e `DESMARCAR` são gestos de peso MUITO diferente, e a trilha existe para separá-los.  │
 * │ Marcar concede vida eterna a dado pessoal; DESMARCAR devolve a pessoa ao expurgo, que é        │
 * │ irreversível e apaga CPF, e-mail, telefone e nascimento sem volta. Uma trilha que só guardasse │
 * │ "resultado" responderia "alguém mexeu", quando a pergunta de auditoria é "quem devolveu esta   │
 * │ pessoa ao apagamento". A coluna é derivada do valor novo, nunca digitada.                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO MORA NO `shared-types` DE PROPÓSITO: aquele arquivo é de DONO ÚNICO (§A.39, o dono é o
 * coordenador). O que a tela precisa (o rótulo e a lista de resultados) já está lá; a ação é
 * derivada do valor e nunca trafega no corpo da requisição, então ela é vocabulário do backend.
 */
export const RETENCAO_EVENTO_ACAO = ["MARCAR", "DESMARCAR"] as const;
export type RetencaoEventoAcao = (typeof RETENCAO_EVENTO_ACAO)[number];

/**
 * A AÇÃO É DERIVADA DO VALOR PRETENDIDO, e é por isso que ela não pode divergir do que aconteceu:
 * não existe caminho em que alguém informe "MARCAR" e a escrita grave `false`.
 */
export function acaoDaRetencao(valorPretendido: boolean): RetencaoEventoAcao {
  return valorPretendido ? "MARCAR" : "DESMARCAR";
}

/** Reexportado para o schema e o serviço lerem o vocabulário da trilha de um lugar só. */
export { RETENCAO_EVENTO_RESULTADO };
export type { RetencaoEventoResultado };
