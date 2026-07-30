import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsString } from "class-validator";
import { CHAVES_PENDENCIA } from "../../domain/pendencia-config";

/**
 * DTOs da tela de obrigatoriedade por cliente. A chave é validada contra a lista CANÔNICA: payload
 * com chave desconhecida vira 400 aqui, e não linha órfã no banco.
 */
export class AtualizarItemDto {
  @IsIn([...CHAVES_PENDENCIA])
  chave!: string;

  @IsBoolean()
  obrigatorio!: boolean;
}

/**
 * APLICAÇÃO EM MASSA: a MESMA alteração para N clientes. O teto de 500 é folga sobre os 233 clientes
 * de hoje e existe para um payload absurdo não virar uma transação gigante.
 */
export class AplicarEmMassaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  codClientes!: string[];

  @IsArray()
  @ArrayMinSize(1)
  itens!: AtualizarItemDto[];
}
