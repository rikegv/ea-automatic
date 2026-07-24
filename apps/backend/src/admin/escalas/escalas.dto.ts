import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * DTOs do catálogo de ESCALAS. O limite é generoso de propósito: descrição de escala no acervo real
 * passa de 120 caracteres (ex.: jornada com dias, horários e intervalo no mesmo texto), e a coluna do
 * banco é `text`, não `varchar` curto.
 */
export class CreateEscalaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;
}

export class UpdateEscalaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
