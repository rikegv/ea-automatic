import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

  /**
   * Marca de coluna OBRIGATÓRIA (Onda 3.1: Nome, Telefone, E-mail entram sempre). O frontend monta
   * as colunas com este campo (`ColunaExport`) e manda o objeto INTEIRO neste corpo; o backend só
   * usa `chave`/`rotulo`/`largura` para formatar, mas PRECISA aceitar `obrigatoria` aqui: o
   * `ValidationPipe` global roda com `forbidNonWhitelisted: true` (`main.ts`) e, sem este campo
   * declarado, rejeitava o payload com 400 ("property obrigatoria should not exist"), derrubando a
   * exportação das abas da Esteira (Auditoria/Exame/Cadastro/Integração, que marcam essas três
   * colunas). O IFractal não marcava nenhuma coluna como obrigatória, por isso seguia funcionando.
   */
  @IsOptional()
  @IsBoolean()
  obrigatoria?: boolean;
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
