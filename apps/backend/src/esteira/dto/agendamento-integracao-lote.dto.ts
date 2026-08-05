import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsUrl, IsUUID, Matches } from "class-validator";
import { TIPO_INTEGRACAO, type TipoIntegracao } from "@ea/shared-types";

/**
 * AGENDAMENTO EM MASSA da integração (decisão do diretor).
 *
 * Ao contrário do agendamento individual, aqui TODOS os campos são obrigatórios: o lote leva as
 * frentes para `AGENDADO` de uma vez, e o gate de transição exige o agendamento completo. Permitir
 * lote parcial seria pedir ao backend que recusasse o avanço logo em seguida, item a item.
 *
 * `sobrescrever` é a confirmação EXPRESSA do consultor. Sem ela, o lote que encontra alguém já
 * agendado PARA e devolve os nomes, em vez de apagar o que já estava marcado.
 */
export class AgendamentoIntegracaoLoteDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Selecione ao menos um candidato." })
  // Teto defensivo: a fila da aba é paginada e a seleção realista é de dezenas. Um lote absurdo
  // seria erro de uso, não caso legítimo.
  @ArrayMaxSize(500, { message: "Lote grande demais (máximo de 500 por vez)." })
  @IsUUID("4", { each: true, message: "Admissão inválida no lote." })
  admissaoIds!: string[];

  @IsDateString({}, { message: "Data da integração inválida (use AAAA-MM-DD)." })
  data!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Horário inválido (use HH:MM)." })
  horario!: string;

  @IsIn(TIPO_INTEGRACAO, { message: "Tipo de integração inválido (online ou presencial)." })
  tipo!: TipoIntegracao;

  @IsUUID("4", { message: "Consultor inválido." })
  consultorId!: string;

  /** Link da reunião (só ONLINE). A MESMA URL vale para o grupo inteiro. Opcional. */
  @IsOptional()
  @IsUrl({ require_protocol: true }, { message: "Link inválido (inclua https://)." })
  link?: string;

  /** Confirmação expressa para sobrescrever quem já tinha agendamento. */
  @IsOptional()
  @IsBoolean()
  sobrescrever?: boolean;
}
