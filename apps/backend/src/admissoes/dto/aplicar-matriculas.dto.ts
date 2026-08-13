import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, IsUUID, MaxLength, ValidateNested } from "class-validator";

/** Um par conferido na prévia: a admissão que casou e a matrícula que vai para ela. */
export class ItemMatriculaDto {
  @IsUUID()
  admissaoId!: string;

  /**
   * Texto, e não número: matrícula com zero à esquerda é comum na folha, e virar número comeria o
   * zero. O teto acompanha a coluna do banco.
   */
  @IsString()
  @MaxLength(40)
  matricula!: string;
}

/**
 * APLICAÇÃO EM LOTE das matrículas (item 11d). A lista vem da PRÉVIA que o time acabou de conferir,
 * então aqui não há casamento por CPF: só ids de admissão e o valor.
 *
 * TETO DE 2.000 LINHAS: é uma importação da folha, não uma carga de base. O teto existe para o lote
 * caber numa transação sem prender o banco, e para um arquivo errado não virar um update gigante.
 */
export class AplicarMatriculasDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => ItemMatriculaDto)
  itens!: ItemMatriculaDto[];
}
