import { BadRequestException } from "@nestjs/common";
import { MAX_BYTES_PLANILHA, MENSAGEM_TETO_DE_BYTES } from "./leitor";

/**
 * O TETO DO UPLOAD DE PLANILHA, na porta de entrada. UM lugar só, para as três rotas de importação.
 *
 * ┌─ O QUE ISTO IMPEDE, MEDIDO ────────────────────────────────────────────────────────────────────┐
 * │ O `FileInterceptor("file")` sem `limits` usa o padrão do multer, que é INFINITO. Um arquivo de  │
 * │ 27,66 MB entrava, virava 300.001 linhas, 2 GB de RSS e 45,8 s de parse SÍNCRONO: o event loop   │
 * │ do backend parado quase um minuto, com a sessão de quem está usando o sistema, o worker do      │
 * │ BullMQ, o webhook do Pandapé (que a §A.5 manda NÃO atrasar) e o tick do Clicksign esperando na  │
 * │ fila de um upload. Não era lentidão de importação, era indisponibilidade do sistema inteiro.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SÃO DUAS CAMADAS, de propósito:
 *  - o `limits` do multer ABORTA a leitura do corpo, e é o que impede o arquivo absurdo de sequer
 *    chegar à memória do processo. Ele é a defesa, não a mensagem: vem com folga sobre o teto real;
 *  - a conferência explícita do tamanho do buffer devolve 400 com a MENSAGEM ACIONÁVEL, que diz o
 *    limite e o que fazer. É por ela que passa o arquivo pouco acima do teto, que é o caso comum de
 *    quem exportou a base inteira sem querer.
 *
 * §A.6: nada do conteúdo é tocado aqui, só o tamanho em bytes.
 */

/** A folga entre o teto que a pessoa vê (10 MB) e o corte bruto do multer. */
const FOLGA_DO_MULTER = 1024 * 1024;

/** As opções do `FileInterceptor` das rotas de importação de planilha. */
export const OPCOES_UPLOAD_PLANILHA = {
  limits: {
    fileSize: MAX_BYTES_PLANILHA + FOLGA_DO_MULTER,
    files: 1,
    fields: 20,
  },
};

/**
 * Confere o arquivo que chegou: existe, tem conteúdo e cabe no teto. Lança 400 com mensagem pronta.
 *
 * Devolve o `Buffer` já conferido, para o chamador não repetir o `file?.buffer` em toda rota.
 */
export function exigirPlanilhaNoTeto(file?: { buffer?: Buffer; size?: number }): Buffer {
  if (!file?.buffer?.length) throw new BadRequestException("Envie a planilha.");
  if (file.buffer.length > MAX_BYTES_PLANILHA) {
    throw new BadRequestException(MENSAGEM_TETO_DE_BYTES);
  }
  return file.buffer;
}
