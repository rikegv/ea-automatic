/**
 * RÓTULO DA COLUNA DE STATUS DA AUDITORIA, derivado do progresso da régua (OST do status real).
 *
 * O QUE ISTO CONSERTA. A coluna exibia "Análise pendente" de forma ESTÁTICA: a admissão que não
 * recebeu nada e a que recebeu quase tudo liam exatamente o mesmo texto, e o consultor não conseguia
 * separar "cobrar o candidato" de "o time está trabalhando".
 *
 * ESCOPO, decidido pelo diretor: isto é RÓTULO DE TELA. O enum do domínio, a máquina de estados da
 * frente AUDITORIA e as regras da §A.3 (que levam a frente a ANALISE_OK quando a régua fecha) NÃO
 * são tocados. O estado interno segue como está; muda só o que o consultor lê.
 *
 * Função PURA: recebe os mesmos números que alimentam as tags de aprovados e reprovados, então o
 * rótulo e os contadores não podem divergir (é a mesma fonte, no mesmo recorte de obrigatórios).
 */

export interface ProgressoObrigatorios {
  /** Obrigatórios APROVADOS (estado ENTREGUE). */
  entregues: number;
  /** Total de obrigatórios da régua (já com a exceção do Reservista aplicada). */
  total: number;
  /** Obrigatórios REPROVADOS (estado INCONFORME): exigem ação do time. */
  inconformes: number;
  /** Obrigatórios que CHEGARAM, aprovados ou não (inclui aguardando auditoria). */
  recebidos: number;
}

export type RotuloAuditoria = "Entrega pendente" | "Análise em andamento" | "Análise finalizada";

/**
 * Deriva o rótulo do progresso:
 *  - **nada recebido** → "Entrega pendente" (a ação é cobrar o candidato);
 *  - **todos os obrigatórios aprovados** → "Análise finalizada";
 *  - **qualquer outro caso** → "Análise em andamento".
 *
 * REGRA EXPLÍCITA DO DIRETOR: havendo documento REPROVADO, NUNCA é "Análise finalizada". Um
 * INCONFORME nunca conta como ENTREGUE, então `entregues === total` já o exclui por construção, mas a
 * condição está escrita literalmente para a regra ficar evidente e travada por teste.
 *
 * `recebidos` (e não `entregues`) é o que decide "Entrega pendente": documento que chegou e espera a
 * IA, ou que chegou e foi reprovado, JÁ FOI ENTREGUE. Dizer "entrega pendente" nesse caso mandaria o
 * consultor cobrar um candidato que já cumpriu a parte dele.
 */
export function rotuloDaAuditoria(p: ProgressoObrigatorios): RotuloAuditoria {
  if (p.total > 0 && p.entregues === p.total && p.inconformes === 0) return "Análise finalizada";
  if (p.recebidos === 0) return "Entrega pendente";
  return "Análise em andamento";
}
