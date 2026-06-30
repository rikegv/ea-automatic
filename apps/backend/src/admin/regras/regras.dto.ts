import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateRegraDto {
  @IsUUID()
  tipoDocumentoId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  descricaoRegra!: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class UpdateRegraDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  descricaoRegra?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
