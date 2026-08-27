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
}

/** As frentes que nascem juntas com a admissão (regra 1). */
export const FRENTES_AO_NASCER: FrenteTipo[] = ["AUDITORIA", "EXAME"];

/**
 * Regra 3 — gate do Cadastro: só pode abrir CADASTRO_CONTRATO quando AUDITORIA e EXAME
 * estiverem concluídas. Função pura: a fonte de verdade é o estado das frentes da admissão.
 */
export function podeAbrirCadastro(frentes: EstadoFrente[]): boolean {
  const auditoria = frentes.find((f) => f.tipo === "AUDITORIA");
  const exame = frentes.find((f) => f.tipo === "EXAME");
  return Boolean(auditoria?.concluida && exame?.concluida);
}

/**
 * Gate do kit (F9 / INT-4) — o kit de assinatura só nasce após as TRÊS frentes concluídas:
 * AUDITORIA, EXAME e CADASTRO_CONTRATO. "Concluída" é a mesma noção das demais frentes
 * (`frentesAdmissao.concluida` / `STATUS_CONCLUI` em esteira.ts — CADASTRO_CONTRATO conclui em
 * CADASTRADO). Função pura: a fonte de verdade é o estado das frentes da admissão. Reusa o gate do
 * Cadastro (regra 3) e soma a conclusão do próprio Cadastro/Contrato.
 */
export function kitLiberado(frentes: EstadoFrente[]): boolean {
  const cadastro = frentes.find((f) => f.tipo === "CADASTRO_CONTRATO");
  return podeAbrirCadastro(frentes) && Boolean(cadastro?.concluida);
}
