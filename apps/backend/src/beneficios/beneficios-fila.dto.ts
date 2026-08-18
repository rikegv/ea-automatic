import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { SEQUENCIA_BENEFICIO } from "../db/schema/enums";
import { CHAVES_REGRA_BENEFICIO } from "../domain/regras-beneficio";

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

/** Uma regra de benefício do cliente: a chave (sigla, OUTROS ou GERAL) e o texto livre. */
export class RegraBeneficioDto {
  @IsIn([...CHAVES_REGRA_BENEFICIO])
  beneficio!: string;

  /**
   * Texto LIVRE (decisão do diretor). O teto de 2.000 é só sanidade de payload, não régua de escrita:
   * cabe qualquer regra real com folga. Texto vazio significa APAGAR a regra, e é tratado no serviço.
   */
  @IsString()
  @MaxLength(2000)
  texto!: string;
}

/**
 * SALVAR AS REGRAS DO CLIENTE. O payload é a lista COMPLETA das regras dele, e não um delta: é o
 * mesmo contrato do pacote acima, pelo mesmo motivo. Chave ausente ou com texto vazio é regra
 * APAGADA, que é como o time desfaz o que cadastrou errado.
 */
export class SalvarRegrasBeneficioDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegraBeneficioDto)
  regras!: RegraBeneficioDto[];
}
