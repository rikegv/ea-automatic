import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { FAROL_GLOBAL } from "@ea/shared-types";
import { BeneficioAlocadoDto, VagaFolhaInputDto } from "./create-admissao.dto";

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
  @IsDateString(
    {},
    { message: "A data de nascimento informada é inválida. Confira e tente novamente." },
  )
  dataNascimento?: string;
}

/**
 * Edição de uma admissão pelo Gerenciador (F10). Edita dados da vaga/folha, campos de processo
 * (contrato, data, matrícula, farol) e, desde o ajuste da OST-EA-GESTAO-USUARIOS, os dados pessoais
 * do candidato. **NÃO** edita CPF nem cod_cliente (identidade — §A.3).
 */
export class UpdateAdmissaoDto {
  /**
   * Pacote de benefícios ESTRUTURADO (§A.17 etapa 4). Ausente = não mexe nos benefícios; presente
   * = SUBSTITUI o pacote inteiro (o front sempre manda a lista completa que ficou na tela).
   * Admissão com blob legado continua editando a string, não isto (ver `editar` no service).
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BeneficioAlocadoDto)
  pacoteBeneficios?: BeneficioAlocadoDto[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipoContrato?: string;

  @IsOptional()
  @IsDateString(
    {},
    { message: "A data de admissão informada é inválida. Confira e tente novamente." },
  )
  dataAdmissao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  matricula?: string;

  @IsOptional()
  @IsIn(FAROL_GLOBAL as unknown as string[], { message: "Status (farol) inválido." })
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
