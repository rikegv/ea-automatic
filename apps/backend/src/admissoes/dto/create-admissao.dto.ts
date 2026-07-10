import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export const SEXO_VALORES = ["MASCULINO", "FEMININO"] as const;
export type SexoValor = (typeof SEXO_VALORES)[number];

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

  // Data de nascimento (W7) — base do aviso de menor de idade.
  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  // Sexo (régua padrão): condiciona a exigência da Carteira de Reservista (só MASCULINO). Opcional
  // no contrato (candidatos antigos/integração podem não ter); o wizard passa a exigir no F6.
  @IsOptional()
  @IsIn(SEXO_VALORES as unknown as string[])
  sexo?: SexoValor;
}

/** Dados de vaga/folha (anexo 1:1) — opcionais por padrão (não bloqueiam — regra 5/F4). */
export class VagaFolhaInputDto {
  // numeric no banco: aceita string|número e normaliza para string antes da validação.
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === null ? value : String(value)))
  @IsString()
  salario?: string;

  @IsOptional()
  @IsString()
  beneficios?: string;

  // texto livre (escala vem do catálogo — pode ser longa).
  @IsOptional()
  @IsString()
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
  @MaxLength(120)
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

  // Substituição (W2): nome + CPF da pessoa substituída (obrigatórios quando motivo = "Substituição").
  @IsOptional()
  @IsString()
  @MaxLength(200)
  substituidoNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  substituidoCpf?: string;
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

  // W6 — aceite explícito ao criar com campos obrigatórios pendentes (F4: marca, não impede).
  @IsOptional()
  @IsBoolean()
  aceitePendencias?: boolean;
}
