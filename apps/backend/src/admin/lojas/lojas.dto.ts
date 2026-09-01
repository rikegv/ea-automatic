import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

/**
 * DTOs do catálogo de LOJAS de um cliente (cenário 1, etapa 1).
 *
 * O `codCliente` NÃO entra no corpo: ele vem da ROTA (`admin/clientes/:codCliente/lojas`), porque a
 * tela já sabe em qual cliente está. Aceitá-lo no corpo abriria a porta para criar a loja do CRM
 * dentro do DIA por causa de um campo divergente, e esse erro é silencioso.
 */
export class CreateLojaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;

  /**
   * ENDEREÇO: metade da definição de loja (nome mais endereço), mas OPCIONAL no contrato da API.
   * A cobrança é da TELA, não do DTO, e a razão é a importação: a migração do legado nasce só com os
   * nomes (o endereço não existe em lugar nenhum hoje) e exigi-lo aqui travaria a carga inteira.
   */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

  /** Código interno do cliente, quando existe. Chave alternativa de casamento na importação B. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoExterno?: string;
}

export class UpdateLojaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  /** String vazia LIMPA o endereço (vira null); ausente não toca no campo. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoExterno?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * Uma linha aprovada na prévia da importação (etapa 2). O APLICAR grava exatamente estas linhas, e
 * não relê o arquivo (Q14, opção A): o que a pessoa viu na tela é o que vai para o banco.
 */
export class LinhaImportacaoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  endereco?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoExterno?: string | null;

  /** Número da linha no arquivo. Só informativo, para a tela referenciar a planilha da pessoa. */
  @IsOptional()
  @IsInt()
  linha?: number;
}

export class AplicarImportacaoDto {
  @IsArray()
  @ArrayMaxSize(2000, { message: "Máximo de 2.000 lojas por importação." })
  @ValidateNested({ each: true })
  @Type(() => LinhaImportacaoDto)
  linhas!: LinhaImportacaoDto[];
}
