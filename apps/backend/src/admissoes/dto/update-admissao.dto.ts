import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { FAROL_GLOBAL } from "@ea/shared-types";
import { VagaFolhaInputDto } from "./create-admissao.dto";

/**
 * Edição dos dados PESSOAIS do candidato (OST-EA-GESTAO-USUARIOS, ajuste de escopo). Nome/e-mail/
 * telefone/nascimento passaram a ser editáveis (antes imutáveis). **CPF NÃO** entra aqui — é a chave
 * de identidade (§A.3), permanece imutável. Toda alteração aqui também gera log (candidato_alteracoes_log).
 */
export class CandidatoUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsDateString()
  dataNascimento?: string;
}

/**
 * Edição de uma admissão pelo Gerenciador (F10). Edita dados da vaga/folha, campos de processo
 * (contrato, data, matrícula, farol) e, desde o ajuste da OST-EA-GESTAO-USUARIOS, os dados pessoais
 * do candidato. **NÃO** edita CPF nem cod_cliente (identidade — §A.3).
 */
export class UpdateAdmissaoDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipoContrato?: string;

  @IsOptional()
  @IsDateString()
  dataAdmissao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  matricula?: string;

  @IsOptional()
  @IsIn(FAROL_GLOBAL as unknown as string[])
  farolGlobal?: string;

  /** Admissão de banco (§A.3 / Fase 4 complemento): muda a regra de pendência (Termo de Banco). */
  @IsOptional()
  @IsBoolean()
  isBanco?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => VagaFolhaInputDto)
  vagaFolha?: VagaFolhaInputDto;

  /** Dados pessoais do candidato (nome/e-mail/telefone/nascimento). CPF fica de fora (identidade). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CandidatoUpdateDto)
  candidato?: CandidatoUpdateDto;
}
