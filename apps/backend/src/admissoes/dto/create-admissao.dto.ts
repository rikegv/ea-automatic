import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

/** Candidato do wizard (F6/F11). CPF e nome obrigatórios; o CPF é validado por dígitos no service (F3). */
export class CandidatoInputDto {
  @IsString()
  @MinLength(1)
  cpf!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;
}

/** Dados de vaga/folha (anexo 1:1) — todos opcionais (não bloqueiam — regra 5). */
export class VagaFolhaInputDto {
  // numeric no banco: aceita string|número e normaliza para string antes da validação.
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  salario?: string;

  @IsOptional()
  @IsString()
  beneficios?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  escala?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  centroCusto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  departamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  gestorBp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tempoContrato?: string;

  // Endereço da folha (decisão de diretor — §A.3): pré-preenchido pelo enderecoPadrao do cliente
  // no wizard, editável por admissão. Texto livre (sem MaxLength).
  @IsOptional()
  @IsString()
  endereco?: string;
}

export class CreateAdmissaoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;

  @IsUUID()
  cargoId!: string;

  @ValidateNested()
  @Type(() => CandidatoInputDto)
  candidato!: CandidatoInputDto;

  @IsOptional()
  @IsDateString()
  dataAdmissao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipoContrato?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VagaFolhaInputDto)
  vagaFolha?: VagaFolhaInputDto;
}
