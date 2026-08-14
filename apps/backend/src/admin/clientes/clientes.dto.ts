import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

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

export class DefinirVinculoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  opcaoId!: string;
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

  // ── Camada de pagamento do benefício (§A.17 etapa 4) ────────────────────────
  // Os três aceitam NULL de propósito: é assim que o admin LIMPA uma regra cadastrada por engano.
  // `IsOptional` já deixa passar null e undefined, e o `update` grava o que vier, então limpar é
  // mandar null, e não mandar campo nenhum é não mexer.

  /** Só informativa na tela de Benefícios: exibe o rótulo, sem cálculo (decisão do diretor). */
  @IsOptional()
  @IsIn(["CADA_5_DIAS", "CADA_15_DIAS", "MENSAL"])
  periodicidadeBeneficio?: "CADA_5_DIAS" | "CADA_15_DIAS" | "MENSAL" | null;

  /** Dia âncora do pagamento recorrente. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaPagamentoBeneficio?: number | null;

  /**
   * Dias CORRIDOS até o primeiro crédito, contando o próprio dia da admissão. Zero é válido e
   * significa "crédito no mesmo dia", por isso o mínimo é 0 e não 1.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  diasPrimeiroCredito?: number | null;
}
