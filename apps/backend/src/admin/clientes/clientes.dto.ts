import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateClienteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  razaoSocial!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeOperacao?: string;
}

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeOperacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
