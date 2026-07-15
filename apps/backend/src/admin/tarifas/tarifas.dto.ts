import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * Valor da tarifa em reais. Aceita 0 (gratuidade: Guararema, Santa Isabel), rejeita negativo.
 * `maxDecimalPlaces: 2` casa com o numeric(10,2) da coluna.
 */
const VALOR_RULES = { maxDecimalPlaces: 2 } as const;

export class CreateTarifaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cidade!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  tipoTransporte!: string;

  // O front envia número; aceitamos também string ("6,10"/"6.10") para tolerar entrada monetária.
  @Transform(({ value }) => (typeof value === "string" ? Number(value.replace(",", ".")) : value))
  @IsNumber(VALOR_RULES)
  @Min(0)
  valor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  observacao?: string;
}

export class UpdateTarifaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cidade?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  tipoTransporte?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? Number(value.replace(",", ".")) : value))
  @IsNumber(VALOR_RULES)
  @Min(0)
  valor?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  observacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
