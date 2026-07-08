import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
// ValidarAsoDto removido: a validação do ASO é feita pela I.A na leitura do documento (não manual).

/** Fornecedor do exame — seleção FIXA (§ modal de agendamento). */
export const FORNECEDORES_EXAME = ["MEDICAL", "LIMER"] as const;

/**
 * Dados que o consultor lança no modal de Gestão de Agendamento do Exame (aba EXAME). A clínica/
 * fornecedor responde por e-mail e o consultor registra aqui. Todos obrigatórios: cadastro completo.
 */
export class AgendamentoExameDto {
  @IsDateString()
  data!: string; // ISO YYYY-MM-DD

  @Matches(/^\d{2}:\d{2}$/, { message: "horario deve ser HH:MM" })
  horario!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nomeClinica!: string;

  @IsString()
  @MinLength(1)
  local!: string;

  @IsIn(FORNECEDORES_EXAME)
  fornecedor!: (typeof FORNECEDORES_EXAME)[number];

  /** true quando é REAGENDAMENTO (já existe agendamento) — incrementa o contador. */
  @IsOptional()
  @IsBoolean()
  reagendar?: boolean;
}
