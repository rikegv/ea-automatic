import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";

/** Uma coluna do relatório: a chave que casa com a linha, o rótulo do cabeçalho, a largura opcional. */
export class ColunaXlsxDto {
  @IsString()
  @MaxLength(80)
  chave!: string;

  @IsString()
  @MaxLength(160)
  rotulo!: string;

  @IsOptional()
  @IsNumber()
  largura?: number;
}

/**
 * Corpo da exportação genérica (OST das ondas, Onda 2). A TELA manda as colunas e as linhas JÁ
 * VISÍVEIS (strings de exibição), e o backend só formata o xlsx. Não há acesso a dado novo: é a
 * mesma informação que o consultor já vê, empacotada em planilha.
 *
 * Os tetos (200 colunas, 50000 linhas) são folga larga sobre qualquer tela real e existem para um
 * payload absurdo não virar um arquivo gigante.
 */
export class RelatorioXlsxDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  aba?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nomeArquivo?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ColunaXlsxDto)
  colunas!: ColunaXlsxDto[];

  @IsArray()
  @ArrayMaxSize(50000)
  linhas!: Record<string, string | number | null>[];
}
