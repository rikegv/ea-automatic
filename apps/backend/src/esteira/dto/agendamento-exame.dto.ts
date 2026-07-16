import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
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

  // Valor do exame (novo — decisão do diretor). Opcional: o time preenche quando souber. Aceita
  // "500,00" e "500.00" (front pt-BR), mesma regra dos benefícios. Zero é válido (gratuito).
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" && value.trim() !== ""
      ? Number(value.replace(/\./g, "").replace(",", "."))
      : value === "" || value === null
        ? undefined
        : value,
  )
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Valor do exame inválido. Use o formato 500,00." })
  @Min(0, { message: "O valor do exame não pode ser negativo." })
  valor?: number;

  // Previsão de quando o ASO fica pronto, informada pela clínica (novo). Opcional (só existe quando
  // a clínica informa). ISO YYYY-MM-DD.
  @IsOptional()
  @IsDateString({}, { message: "A previsão do ASO informada é inválida." })
  previsaoAso?: string;

  /** true quando é REAGENDAMENTO (já existe agendamento) — incrementa o contador. */
  @IsOptional()
  @IsBoolean()
  reagendar?: boolean;
}
