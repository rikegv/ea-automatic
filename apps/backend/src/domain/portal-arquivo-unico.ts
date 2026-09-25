/**
 * PORTAL: UM ARQUIVO POR TIPO DE DOCUMENTO. A RÉGUA, ESCRITA E TESTÁVEL.
 *
 * ══ A DECISÃO ═══════════════════════════════════════════════════════════════════════════════════
 *
 * O candidato manda UM arquivo por documento, com FRENTE E VERSO JUNTOS (decisão do diretor). Não é
 * preferência de organização: é o recorte que faz o fluxo inteiro ser "recebe, audita e salva um
 * só", e que elimina NA ORIGEM o dano descrito abaixo.
 *
 * ══ O DANO QUE ELA EVITA, E POR QUE ELE É SILENCIOSO ════════════════════════════════════════════
 *
 * `documentos_admissao` tem UMA linha por (admissão, tipo de documento): um estado, uma observação,
 * uma decisão do auditor. O objeto no balde, esse sim, é um por credencial (o nome carrega um `uuid`
 * e há `unique` no objeto, justamente para nenhuma credencial sobrescrever a outra).
 *
 * A assimetria é o buraco: dois arquivos do MESMO tipo produzem DOIS objetos e continuam produzindo
 * UMA linha de estado. O segundo envio reescreve o veredito do primeiro, e o time passa a decidir
 * sobre "o documento" olhando só o último que chegou. Mandada a frente e depois o verso, O SISTEMA
 * FICA COM O VERSO e a frente vira objeto órfão: ninguém a audita, ninguém a arquiva, e nada falha.
 * É o modo de dano da §A.33 aplicado a documento de admissão, do ponto de vista do sistema, nada
 * deu errado.
 *
 * Emparelhar objeto e estado (uma linha por arquivo) seria a outra saída, e ela é grande: mexe em
 * `documentos_admissao`, que é lido pela Auditoria, pelo Gerenciador, pela Esteira e pelos KPIs de
 * pendência (§A.26). A decisão do diretor recorta o problema antes disso: um arquivo, um estado.
 *
 * ══ O QUE ESTA RÉGUA NÃO É ═════════════════════════════════════════════════════════════════════
 *
 * NÃO É O TETO DE TENTATIVAS (`portal-tentativas.ts`), e os dois não podem ser confundidos. O teto
 * conta REPROVAÇÕES e tira o candidato de um laço; esta conta ENVIO EM ABERTO e impede dois arquivos
 * vivos para a mesma pendência. Reprovado, o envio deixa de estar em aberto e o candidato manda o
 * documento de novo, inteiro, num arquivo só.
 *
 * NÃO VALE PARA O CONSULTOR NEM PARA O PANDAPÉ. O caminho da esteira recebe um arquivo por
 * requisição e é operado por quem tem crachá; o do Pandapé traz vários anexos por tipo, vindos de
 * fora, e lá a régua é outra. Esta régua é do PORTAL, onde quem envia é o candidato.
 *
 * §A.6: contagem e booleano. Nada aqui é dado pessoal.
 */

/**
 * O QUE CONTA COMO "ENVIO EM ABERTO", e a definição é estreita de propósito.
 *
 * É a credencial cujo arquivo CHEGOU (confirmado pelo servidor, por metadado) e que ainda NÃO foi
 * reprovada. Ou seja: existe um arquivo daquele tipo, vivo, esperando desfecho.
 *
 * O que NÃO conta, e cada exclusão tem motivo:
 *  - credencial emitida e nunca confirmada: o envio morreu no 4G do candidato, não há arquivo no
 *    balde para ninguém auditar, e barrar aqui trancaria a pessoa por causa da rede dela;
 *  - credencial REPROVADA: o documento foi julgado e não serve, então mandar outro é o fluxo, e é
 *    exatamente o que o teto de tentativas governa;
 *  - envio anterior ao marco de reabertura: quando o time solicita o reenvio ou o Master destrava, a
 *    contagem passa a valer do marco para a frente, e o mesmo vale aqui. Fosse diferente, a pendência
 *    reaberta continuaria barrada pelo arquivo velho e a reabertura viraria teatro.
 */
export interface EstadoDoTipoNoPortal {
  /** Quantos envios daquele tipo estão confirmados, não reprovados e depois do marco de reabertura. */
  enviosEmAberto: number;
}

/** A régua: só cabe arquivo novo se não houver nenhum em aberto para aquele tipo. */
export function cabeOutroArquivo(estado: EstadoDoTipoNoPortal): boolean {
  return Math.max(0, Math.trunc(estado.enviosEmAberto || 0)) === 0;
}

/**
 * A MENSAGEM AO CANDIDATO. Ela não recusa seco: diz o que já aconteceu, diz o que fazer com frente e
 * verso, e diz a quem recorrer. §A.11: sem travessão.
 */
export const AVISO_ARQUIVO_UNICO =
  "Você já enviou este documento. Envie a frente e o verso no mesmo arquivo. Se precisar trocar o que enviou, fale com o seu consultor.";

/** Código de motivo da recusa, para a trilha. Fechado em `domain/portal-evento.ts`. */
export const MOTIVO_ARQUIVO_UNICO = "ARQUIVO_JA_ENVIADO";
