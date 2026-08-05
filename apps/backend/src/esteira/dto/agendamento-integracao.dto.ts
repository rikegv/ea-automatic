import { IsDateString, IsIn, IsOptional, IsUrl, IsUUID, Matches } from "class-validator";
import { TIPO_INTEGRACAO, type TipoIntegracao } from "@ea/shared-types";

/**
 * Dados do modal de agendamento da INTEGRAÇÃO (aba INTEGRAÇÃO, última etapa da esteira).
 *
 * OS QUATRO CAMPOS SÃO OBRIGATÓRIOS (decisão do diretor, unificando com o agendamento em massa).
 *
 * A versão anterior aceitava salvamento PARCIAL, apoiada na §A.3 regra 5 (pendência sinaliza, não
 * bloqueia), e o avanço de status ficava por conta do seletor. O diretor reviu: agendar é um ato
 * único, e um agendamento sem horário ou sem responsável não é agendamento, é rascunho. Agora salvar
 * completo JÁ LEVA a frente para `AGENDADO`, no individual e no lote, sem passo manual.
 *
 * O seletor de status continua existindo para os outros desfechos: Realizado, Declinou e Rescisão.
 *
 * O LINK segue opcional, e só vale para ONLINE: a sala costuma ser criada depois de marcada a data.
 */
export class AgendamentoIntegracaoDto {
  /** Data da integração (YYYY-MM-DD). */
  @IsDateString({}, { message: "Data da integração inválida (use AAAA-MM-DD)." })
  data!: string;

  /** Horário no formato HH:MM (24h). */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Horário inválido (use HH:MM)." })
  horario!: string;

  /** Modalidade: online ou presencial. */
  @IsIn(TIPO_INTEGRACAO, { message: "Tipo de integração inválido (online ou presencial)." })
  tipo!: TipoIntegracao;

  /**
   * Link da reunião, só faz sentido quando o tipo é ONLINE. OPCIONAL: o agendamento salva sem ele,
   * porque a sala costuma ser criada depois de marcada a data (decisão do diretor).
   */
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: "Link inválido (inclua https://)." })
  link?: string;

  /**
   * Consultor responsável. Vem por ID de uma lista de COMUM e MASTER (super admin fora), servida por
   * `GET /catalogos/consultores`. Nunca texto livre: o responsável é uma pessoa do sistema.
   */
  @IsUUID("4", { message: "Consultor inválido." })
  consultorId!: string;
}
