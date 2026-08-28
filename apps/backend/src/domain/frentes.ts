/**
 * Regras de domínio das frentes (CLAUDE.md §A.3). Estrutura da Fase 1A — a criação de
 * admissões/frentes entra nas Fases 2–3; aqui ficam as regras puras, testáveis.
 *
 * 1. Nascimento paralelo: ao criar a Admissão, nascem AUDITORIA e EXAME simultaneamente.
 * 2. Independência das frentes: concluir uma não altera a outra.
 * 3. Gate do Cadastro: CADASTRO_CONTRATO só abre com AUDITORIA E EXAME concluídas.
 * 3b. INTEGRAÇÃO (última etapa): nasce quando o CADASTRO conclui, e SÓ para cliente que a exige.
 *     Roda em PARALELO com a assinatura, então NÃO entra no gate do kit (`kitLiberado`).
 * 3c. IFRACTAL: nasce junto do Cadastro, para TODOS os clientes, e não entra em gate NENHUM. Nem no
 *     do kit, nem no de conclusão da admissão (`admissaoConcluidaSql`). Pendurá-la numa contagem
 *     existente moveria Painel, Gerenciador e Alto Volume de uma vez, que é o defeito da §A.27.
 * 4. A régua resolve por (cliente+cargo): muda o cargo, muda o checklist.
 * 5. Não-bloqueio: Admissão é criável com obrigatórios vazios; o sinalizador marca, não impede.
 * 6. Reaproveitamento por CPF: CPF existente oferece reaproveitar dados, preservando histórico.
 * 7. Documento é efêmero: guarda-se o status; o binário transita e é descartado.
 */
import { STATUS_EXAME_LIBERADO_SEM_ASO } from "@ea/shared-types";
export type FrenteTipo =
  | "AUDITORIA"
  | "EXAME"
  | "CADASTRO_CONTRATO"
  | "INTEGRACAO"
  /**
   * IFRACTAL, a 5ª frente. Nasce junto do Cadastro (mesma porta, mesmo gate da regra 3) e é a
   * ÚNICA que não participa de gate nenhum: não abre frente, não libera kit, não fecha admissão.
   * É controle administrativo do time de Ponto, que corre em paralelo ao fim da esteira.
   */
  | "IFRACTAL";

export interface EstadoFrente {
  tipo: FrenteTipo;
  concluida: boolean;
  /**
   * O status da frente, quando quem chama consegue informá-lo.
   *
   * OPCIONAL DE PROPÓSITO, e isso é a trava de segurança desta mudança (§A.26). O gate abaixo passa
   * a olhar o status do EXAME para reconhecer o "Liberado Para Cadastro Sem ASO"; quem não informar
   * o status recebe exatamente o comportamento de antes, o do bit `concluida` sozinho. O default é
   * FECHADO: na dúvida o gate barra, nunca libera. Um chamador esquecido vira admissão que não
   * avança, que é visível na hora, e não admissão que avança sem poder, que é silenciosa.
   */
  status?: string;
}

/** As frentes que nascem juntas com a admissão (regra 1). */
export const FRENTES_AO_NASCER: FrenteTipo[] = ["AUDITORIA", "EXAME"];

/**
 * O EXAME libera o avanço da admissão? Concluído (APTO) **ou** liberado sem ASO.
 *
 * A REGRA NOVA (decisão do diretor, OST "Liberado Para Cadastro Sem ASO"): o cliente precisa da
 * pessoa trabalhando antes de o ASO ficar pronto, então existe um status que DESTRAVA o avanço sem
 * concluir a frente. A admissão anda até o fim da trilha e CONTINUA na fila do Exame até o ASO subir.
 *
 * POR QUE AQUI E NÃO NO BIT `concluida` (a alternativa investigada e recusada). `concluida` responde
 * a três perguntas com um bit só: o gate pode abrir? saiu da fila? a frente terminou? O pedido é SIM
 * apenas para a primeira. Carimbar o bit responderia sim às três: tiraria a admissão da fila do
 * Exame, zeraria o card do status novo, contaria a liberada no card "Aptas" e, o pior,
 * `concluirExamePorAso` ignora frente já concluída, então o ASO chegando NUNCA fecharia o Exame e a
 * admissão ficaria presa para sempre. Ensinar o GATE custa esta função; carimbar o bit custaria nove
 * leitores, dois deles quebrados em silêncio.
 *
 * FUNÇÃO PRÓPRIA, e não um `||` no meio do gate: `kitLiberado` reusa o gate, e a Clicksign pergunta a
 * mesma coisa em SQL. Um lugar só define o que é "o Exame libera", e quem precisar da regra a lê
 * daqui em vez de reescrevê-la.
 */
export function exameLiberaAvanco(exame: EstadoFrente | undefined): boolean {
  if (!exame) return false;
  return exame.concluida || exame.status === STATUS_EXAME_LIBERADO_SEM_ASO;
}

/**
 * Regra 3 — gate do Cadastro: só pode abrir CADASTRO_CONTRATO quando AUDITORIA e EXAME
 * estiverem concluídas. Função pura: a fonte de verdade é o estado das frentes da admissão.
 *
 * O EXAME passou a aceitar também o "Liberado Para Cadastro Sem ASO" (ver `exameLiberaAvanco`). A
 * AUDITORIA não muda: continua exigindo conclusão de verdade.
 */
export function podeAbrirCadastro(frentes: EstadoFrente[]): boolean {
  const auditoria = frentes.find((f) => f.tipo === "AUDITORIA");
  const exame = frentes.find((f) => f.tipo === "EXAME");
  return Boolean(auditoria?.concluida) && exameLiberaAvanco(exame);
}

/**
 * Gate do kit (F9 / INT-4) — o kit de assinatura só nasce após as TRÊS frentes concluídas:
 *
 * O CONTRATO SAI PARA QUEM ESTÁ LIBERADO SEM ASO (decisão do diretor). Não há linha nova aqui: o
 * gate do kit REUSA `podeAbrirCadastro`, então ele herdou o "liberado" de graça. É o motivo de a
 * regra morar numa função só, e é por isso que o pipeline do envelope da Clicksign não é tocado.
 *
 * AUDITORIA, EXAME e CADASTRO_CONTRATO. "Concluída" é a mesma noção das demais frentes
 * (`frentesAdmissao.concluida` / `STATUS_CONCLUI` em esteira.ts — CADASTRO_CONTRATO conclui em
 * CADASTRADO). Função pura: a fonte de verdade é o estado das frentes da admissão. Reusa o gate do
 * Cadastro (regra 3) e soma a conclusão do próprio Cadastro/Contrato.
 */
export function kitLiberado(frentes: EstadoFrente[]): boolean {
  const cadastro = frentes.find((f) => f.tipo === "CADASTRO_CONTRATO");
  return podeAbrirCadastro(frentes) && Boolean(cadastro?.concluida);
}
