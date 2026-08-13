import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { SEQUENCIA_BENEFICIO } from "../db/schema/enums";

/**
 * AVANÇAR O ESTÁGIO (§A.17 etapa 4). Um id ou N: o clique da linha e o lote falam o mesmo contrato,
 * e a régua da sequência mora no serviço, não aqui.
 */
export class AvancarBeneficioDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID("4", { each: true })
  ids!: string[];

  /** O estágio de DESTINO. Só a sequência viva é aceita; os valores antigos do enum ficam de fora. */
  @IsIn([...SEQUENCIA_BENEFICIO])
  para!: string;
}

/** Um benefício do pacote: o item do catálogo e, quando houver, o valor. */
export class ItemPacoteDto {
  @IsUUID()
  beneficioId!: string;

  /**
   * Valor OPCIONAL: benefício sem valor cadastrado é estado real (o VT hoje é assim). Negativo é
   * recusado, porque valor de benefício não é desconto.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valor?: number | null;
}

/**
 * EDITAR O PACOTE. O payload é o pacote COMPLETO, e não um delta: lista vazia significa "esta pessoa
 * não tem benefício estruturado", que é uma decisão legítima do time.
 */
export class EditarPacoteDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemPacoteDto)
  itens!: ItemPacoteDto[];
}
