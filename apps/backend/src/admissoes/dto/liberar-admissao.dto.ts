import { Type } from "class-transformer";
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { BeneficioAlocadoDto, VagaFolhaInputDto } from "./create-admissao.dto";
import { OBSERVACAO_LIBERACAO_MAX } from "./observacao-liberacao";

/**
 * Liberação Admissional (item 4): atribui cliente + cargo à pré-admissão E, opcionalmente, os demais
 * campos obrigatórios (régua unificada §A.19). A TRAVA de liberação continua sendo SÓ cliente+cargo:
 * todos os campos abaixo são opcionais e o que ficar vazio vira pendência na esteira (não bloqueia).
 *
 * REUSA os tipos do `create` (VagaFolhaInputDto, BeneficioAlocadoDto) — mesma régua de benefícios/
 * escala/valores, sem recriar. NÃO inclui `tempoContrato`: a régua unificada não o lista.
 */
export class LiberarAdmissaoDto {
  @IsString()
  @MinLength(1)
  codCliente!: string;

  @IsUUID()
  cargoId!: string;

  @IsOptional()
  @IsString()
  tipoContrato?: string;

  @IsOptional()
  @IsString()
  dataAdmissao?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VagaFolhaInputDto)
  vagaFolha?: VagaFolhaInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BeneficioAlocadoDto)
  pacoteBeneficios?: BeneficioAlocadoDto[];

  /**
   * Observação LIVRE da liberação (Bloco 2). Opcional, não bloqueia e não vira pendência. Distinta
   * de `documentos_admissao.observacao` (motivo do veredito da auditoria) — ver o comentário da
   * coluna `admissoes.observacao_liberacao` no schema.
   */
  @IsOptional()
  @IsString()
  @MaxLength(OBSERVACAO_LIBERACAO_MAX, {
    message: `A observação da liberação tem no máximo ${OBSERVACAO_LIBERACAO_MAX} caracteres.`,
  })
  observacaoLiberacao?: string;
}
