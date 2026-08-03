/**
 * Leitura do ASO como DOCUMENTO (OST do motivo real do ASO). Lógica PURA, sem banco.
 *
 * POR QUE EXISTE. Até esta OST a aba Exame perguntava uma coisa só: "existe documento ASO em
 * ENTREGUE?". Isso bastava enquanto o anexo virava ENTREGUE incondicionalmente, mas o veredito da
 * I.A passou a governar o estado, e aí "anexado" e "aprovado" se separaram:
 *
 *  - ENTREGUE              → anexado E aprovado pela I.A;
 *  - INCONFORME            → anexado e REPROVADO, com motivo;
 *  - AGUARDANDO_AUDITORIA  → anexado, ainda sem veredito (ou I.A fora do ar);
 *  - PENDENTE com motivo   → anexado, e a I.A não conseguiu decidir (ilegível/insuficiente);
 *  - PENDENTE sem motivo   → NUNCA anexado. É a linha que a régua cria ao nascer a admissão.
 *  - sem linha nenhuma     → nunca anexado.
 *
 * A distinção do PENDENTE por presença de motivo não é invenção daqui: é a MESMA convenção que o
 * modal de auditoria já usa para separar "documento auditado que deu pendente" de "documento que
 * ninguém mandou" (`AuditoriaDocsModal`, ordenação das linhas). Um critério só, dois lugares.
 *
 * §A.6: trabalha com estado e presença de motivo, nunca com o conteúdo do documento.
 */

/** O que a fila do Exame sabe do ASO de uma admissão. `estado` null = sem linha em documentos. */
export interface AsoStatus {
  estado: string | null;
  observacao: string | null;
}

/** Chegou arquivo de ASO? Verdadeiro inclusive para o reprovado, que está anexado e não entregue. */
export function asoFoiAnexado(aso: AsoStatus | undefined): boolean {
  if (!aso?.estado) return false;
  if (aso.estado === "PENDENTE") return !!aso.observacao?.trim();
  return true;
}

/** Reprovado pela I.A: o caso que ficava verde e agora precisa aparecer como recusa. */
export function asoFoiReprovado(aso: AsoStatus | undefined): boolean {
  return aso?.estado === "INCONFORME";
}
