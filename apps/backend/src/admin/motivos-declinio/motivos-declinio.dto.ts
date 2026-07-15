import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateMotivoDeclinioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;
}

export class UpdateMotivoDeclinioDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
