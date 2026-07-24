/**
 * FALHA DE AUDITORIA: classificação por FAMÍLIA, motivo exibido e política de retentativa.
 *
 * POR QUE EXISTE (OST motivo verdadeiro). Antes desta OST só a QUOTA (429) tinha tratamento próprio:
 * o `catch` do `auditarConjunto` reescrevia a observação apenas para `MotorIaSemQuotaException`, e
 * QUALQUER outra falha deixava o documento exibindo "Documento coletado, aguardando a análise por
 * IA". O caso real que expôs o defeito foi um HTTP 415 (o candidato digitou os dados da conta em vez
 * de anexar comprovante): o documento ficou 14h parado exibindo uma frase que sugere fila, sem fila
 * nenhuma, e foi descoberto por acaso.
 *
 * TRÊS DECISÕES ATRAVESSAM ESTE MÓDULO:
 *
 * 1. **O leitor é o CONSULTOR, não o candidato.** O EA é sistema interno. Todo motivo aqui diz ao
 *    consultor O QUE FAZER (solicitar reenvio, tentar de novo, avisar a TI), nunca fala com o
 *    candidato nem descreve o erro em jargão de HTTP.
 * 2. **Problema do ARQUIVO é INCONFORME; problema NOSSO é AGUARDANDO_AUDITORIA.** `AGUARDANDO_AUDITORIA`
 *    fica reservado a falha de sistema (quota, motor fora, credencial, inesperado). Arquivo que não
 *    serve não é falha de sistema: é veredito, e veredito ruim é INCONFORME. Mesma régua que já valia
 *    para o PDF protegido por senha, agora estendida.
 * 3. **Só se retenta o que CONVERGE.** Família transitória (quota, indisponibilidade) pode melhorar
 *    sozinha, então retenta. Família determinística (entrada) não muda por repetição: repetir só
 *    queima IA e mantém o documento preso. Credencial também não converge sozinha, mas não é culpa do
 *    arquivo, então não vira INCONFORME: fica visível como parada de sistema.
 *
 * Módulo PURO: sem I/O, sem Nest, sem PII (§A.6). Todos os textos são fixos e falam de formato e de
 * estado do sistema, nunca do conteúdo do documento nem de quem é o candidato.
 */

/** Famílias de falha da auditoria. `DESCONHECIDA` é o balde do que não se encaixa (nunca some). */
export type FamiliaFalhaIa =
  | "QUOTA"
  | "ENTRADA"
  | "CREDENCIAL"
  | "INDISPONIBILIDADE"
  | "DESCONHECIDA";

/**
 * Status HTTP do ai-service → família. Os limites:
 *  - 429              → QUOTA (o ai-service já esgotou o backoff dele antes de devolver);
 *  - 415 e 422        → ENTRADA (o motor RESPONDEU: quem não serve é o arquivo);
 *  - 401 e 403        → CREDENCIAL (service account recusada; nenhuma ação do consultor resolve);
 *  - 5xx e 408        → INDISPONIBILIDADE (motor fora, timeout, erro interno);
 *  - resto            → DESCONHECIDA.
 *
 * O 415 estava classificado como "Motor de IA indisponível", o que era falso: ele respondeu, e
 * respondeu que o ARQUIVO não serve. Confundir as duas coisas manda o consultor esperar por um
 * sistema que está no ar.
 */
export function familiaPorStatus(status: number | null | undefined): FamiliaFalhaIa {
  if (status === 429) return "QUOTA";
  if (status === 415 || status === 422) return "ENTRADA";
  if (status === 401 || status === 403) return "CREDENCIAL";
  if (status === 408 || status === 504) return "INDISPONIBILIDADE";
  if (typeof status === "number" && status >= 500) return "INDISPONIBILIDADE";
  return "DESCONHECIDA";
}

/**
 * Motivo GRAVADO e EXIBIDO por família. Cada texto responde à única pergunta que o consultor tem
 * diante de um documento parado: "isso é comigo?".
 *  - ENTRADA        → é com ele, e a ação é pedir reenvio;
 *  - QUOTA / INDISP.→ é do sistema e pode passar, então pode tentar de novo;
 *  - CREDENCIAL     → é do sistema e NÃO passa sozinho, então não adianta tentar, tem de escalar;
 *  - DESCONHECIDA   → não se sabe, e dizer isso é melhor que fingir uma fila.
 * Nenhum deles sugere processamento em andamento, que era o defeito original.
 */
export const MOTIVO_FALHA_IA: Record<FamiliaFalhaIa, string> = {
  QUOTA:
    "Auditoria parada: limite de uso da IA atingido. O documento está coletado e íntegro, o problema " +
    "não é dele. Use Reauditar mais tarde; se insistir, avise a TI.",
  ENTRADA:
    "O arquivo recebido não é um documento auditável (esperado PDF, JPG ou PNG). Solicitar reenvio ao " +
    "candidato, com foto ou PDF.",
  CREDENCIAL:
    "Auditoria parada: credencial da IA recusada. Não é problema do documento nem do candidato, e " +
    "Reauditar não resolve. Avise a TI.",
  INDISPONIBILIDADE:
    "Auditoria parada: o motor de IA não respondeu. O documento está coletado e íntegro. Use " +
    "Reauditar; se insistir, avise a TI.",
  DESCONHECIDA:
    "Auditoria parada por falha inesperada do sistema. O documento está coletado e íntegro. Use " +
    "Reauditar; se insistir, avise a TI.",
};

/**
 * Estado do documento depois da falha. ENTRADA é a única família que vira veredito: o motor
 * respondeu e o arquivo é que não serve. As outras deixam o documento COLETADO e sem veredito,
 * porque a falha é nossa e o documento pode estar perfeito.
 */
export function estadoAposFalha(
  familia: FamiliaFalhaIa,
): "INCONFORME" | "AGUARDANDO_AUDITORIA" {
  return familia === "ENTRADA" ? "INCONFORME" : "AGUARDANDO_AUDITORIA";
}

/**
 * POLÍTICA DE RETENTATIVA (Bloco 4 da OST). Retenta só o que pode melhorar sozinho.
 *
 *  | Família           | Retenta | Por quê                                                        |
 *  |-------------------|---------|----------------------------------------------------------------|
 *  | QUOTA             | SIM     | janela de quota vira sozinha                                    |
 *  | INDISPONIBILIDADE | SIM     | motor reiniciando, timeout de pico                              |
 *  | ENTRADA           | NÃO     | determinístico: o mesmo arquivo dá o mesmo veredito, sempre     |
 *  | CREDENCIAL        | NÃO     | não converge sem alguém trocar a credencial                     |
 *  | DESCONHECIDA      | NÃO     | não se retenta o que não se entende, para não gastar IA às cegas |
 */
export function familiaRetentavel(familia: FamiliaFalhaIa): boolean {
  return familia === "QUOTA" || familia === "INDISPONIBILIDADE";
}

/**
 * Intervalos (ms) entre as retentativas das famílias transitórias, em ordem. O tamanho do array É o
 * número máximo de retentativas: **2**, portanto no máximo **3 tentativas** no total.
 *
 * Curtos de propósito. Este backoff é o SEGUNDO da cadeia (o ai-service já retentou o Vertex com
 * backoff antes de responder), e roda DENTRO da requisição do consultor quando o upload é manual:
 * esperar mais que isso trava a tela. Quota longa não é resolvida aqui, e não é para ser: quem
 * garante que ela não fica esquecida é o marcador de tempo parado.
 */
export const INTERVALOS_RETENTATIVA_MS: readonly number[] = [2_000, 6_000];

/** Número máximo de retentativas (derivado dos intervalos, para não haver dois números divergentes). */
export const MAX_RETENTATIVAS = INTERVALOS_RETENTATIVA_MS.length;
