import { IsDateString, IsIn, IsOptional, IsUUID, Matches } from "class-validator";
import { TIPO_INTEGRACAO, type TipoIntegracao } from "@ea/shared-types";

/**
 * Dados do modal de agendamento da INTEGRAÇÃO (aba INTEGRAÇÃO, última etapa da esteira).
 *
 * TODOS OS CAMPOS SÃO OPCIONAIS de propósito, e isso não é descuido: a §A.3 regra 5 diz que
 * pendência SINALIZA e nunca bloqueia. O consultor pode salvar o que já sabe (a data, por exemplo) e
 * completar depois, do mesmo jeito que a admissão nasce com obrigatórios vazios.
 *
 * Quem cobra o preenchimento é o GATE DE TRANSIÇÃO: mover a frente para `AGENDADO` exige o
 * agendamento completo, que é o mesmo desenho do exame (lá o gate cobra os 5 campos do agendamento).
 * Assim o registro parcial é permitido, mas o avanço de status não mente.
 */
export class AgendamentoIntegracaoDto {
  /** Data da integração (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString({}, { message: "Data da integração inválida (use AAAA-MM-DD)." })
  data?: string;

  /** Horário no formato HH:MM (24h). */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Horário inválido (use HH:MM)." })
  horario?: string;

  /** Modalidade: online ou presencial. */
  @IsOptional()
  @IsIn(TIPO_INTEGRACAO, { message: "Tipo de integração inválido (online ou presencial)." })
  tipo?: TipoIntegracao;

  /**
   * Consultor responsável. Vem por ID de uma lista de COMUM e MASTER (super admin fora), servida por
   * `GET /catalogos/consultores`. Nunca texto livre: o responsável é uma pessoa do sistema.
   */
  @IsOptional()
  @IsUUID("4", { message: "Consultor inválido." })
  consultorId?: string;
}
