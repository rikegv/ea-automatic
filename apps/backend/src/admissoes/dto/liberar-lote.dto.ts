import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
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
 * Liberação Admissional EM LOTE: aplica os MESMOS valores a N pré-admissões selecionadas.
 *
 * MESMO conjunto de campos da liberação individual (`LiberarAdmissaoDto`) e MESMA obrigatoriedade:
 * só cliente + cargo travam. O que o consultor preencher vale para TODAS as N do lote (o caso real é
 * justamente N pessoas do mesmo cliente, cargo e salário); o que ficar em branco vira pendência
 * individual de cada admissão na esteira (regra 5, não-bloqueio), exatamente como no individual.
 *
 * Teto de 50 por lote (decisão do diretor), validado aqui e de novo no service.
 */
export class LiberarEmLoteDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50, {
    message: "Máximo de 50 pré-admissões por lote. Selecione menos e repita a operação.",
  })
  @IsUUID("4", { each: true })
  admissaoIds!: string[];

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
   * Observação LIVRE da liberação (Bloco 2), MESMO campo do individual e MESMA regra dos demais
   * campos do lote: o preenchido vale para TODAS as N selecionadas. Opcional, não bloqueia.
   */
  @IsOptional()
  @IsString()
  @MaxLength(OBSERVACAO_LIBERACAO_MAX, {
    message: `A observação da liberação tem no máximo ${OBSERVACAO_LIBERACAO_MAX} caracteres.`,
  })
  observacaoLiberacao?: string;
}
