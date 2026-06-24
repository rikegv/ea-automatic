/**
 * Regras de domínio das frentes (CLAUDE.md §A.3). Estrutura da Fase 1A — a criação de
 * admissões/frentes entra nas Fases 2–3; aqui ficam as regras puras, testáveis.
 *
 * 1. Nascimento paralelo: ao criar a Admissão, nascem AUDITORIA e EXAME simultaneamente.
 * 2. Independência das frentes: concluir uma não altera a outra.
 * 3. Gate do Cadastro: CADASTRO_CONTRATO só abre com AUDITORIA E EXAME concluídas.
 * 4. A régua resolve por (cliente+cargo): muda o cargo, muda o checklist.
 * 5. Não-bloqueio: Admissão é criável com obrigatórios vazios; o sinalizador marca, não impede.
 * 6. Reaproveitamento por CPF: CPF existente oferece reaproveitar dados, preservando histórico.
 * 7. Documento é efêmero: guarda-se o status; o binário transita e é descartado.
 */
export type FrenteTipo = "AUDITORIA" | "EXAME" | "CADASTRO_CONTRATO";

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
