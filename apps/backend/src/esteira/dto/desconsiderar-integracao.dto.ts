import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from "class-validator";

/** Admissões que saem da fila da Integração como "Concluída Sem Integração". */
export class DesconsiderarIntegracaoDto {
  @IsArray()
  @ArrayMinSize(1, { message: "Selecione ao menos um candidato." })
  @ArrayMaxSize(500, { message: "Lote grande demais (máximo de 500 por vez)." })
  @IsUUID("4", { each: true, message: "Admissão inválida." })
  admissaoIds!: string[];
}
