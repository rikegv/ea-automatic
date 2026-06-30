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
 * Edição de uma admissão pelo Gerenciador (F10). Edita dados da vaga/folha + campos de processo
 * (contrato, data, matrícula, farol). **NÃO** edita CPF nem cod_cliente (identidade — §A.3).
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
}
