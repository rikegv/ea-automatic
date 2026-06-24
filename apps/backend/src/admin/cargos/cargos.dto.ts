import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCargoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;
}

export class UpdateCargoDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
