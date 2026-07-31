import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  EPI_OUTROS_MAX,
  ITENS_EPI,
  TAMANHOS_BOTA,
  TAMANHOS_CALCA,
  TAMANHOS_CAMISETA,
} from "@ea/shared-types";

/**
 * UNIFORME (OST Onda 3, item 1). `possui` é a resposta obrigatória da liberação; os tamanhos só
 * fazem sentido quando ela é `true` (o serviço limpa quando é `false`).
 *
 * Os tamanhos são validados contra o MESMO catálogo que a tela usa para montar os seletores
 * (`@ea/shared-types`). Nada é digitável, então valor fora da lista é chamada forjada, não erro de
 * digitação: cai no 400 do DTO.
 */
export class UniformeInputDto {
  @IsBoolean()
  possui!: boolean;

  @IsOptional()
  @IsIn(TAMANHOS_CAMISETA as unknown as string[])
  camiseta?: string;

  @IsOptional()
  @IsIn(TAMANHOS_CALCA as string[])
  calca?: string;

  @IsOptional()
  @IsIn(TAMANHOS_BOTA as string[])
  bota?: string;
}

/**
 * EPI (OST Onda 3, item 1). NÃO é pendência obrigatória: `possui` pode faltar e a liberação segue.
 * "OUTROS" é o único item que abre texto livre, e o serviço exige esse texto quando ele é marcado
 * (mesma régua do "benefício que exige valor": o que foi escolhido tem de ficar completo).
 */
export class EpiInputDto {
  @IsBoolean()
  possui!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITENS_EPI.length)
  @IsIn(ITENS_EPI as unknown as string[], { each: true })
  itens?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(EPI_OUTROS_MAX)
  outros?: string;
}
