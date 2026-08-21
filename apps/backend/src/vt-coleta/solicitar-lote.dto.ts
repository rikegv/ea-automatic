import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from "class-validator";

/**
 * Pedido de VT em LOTE.
 *
 * O TETO DE 200 não é arbitrário: cada item emite uma credencial assinada e grava uma linha, então
 * um lote sem limite viraria uma requisição que segura o processo por minutos. Duzentos cobre a
 * maior leva real (uma entrada de alto volume inteira) com folga, e acima disso o time divide.
 */
export class SolicitarLoteDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Selecione ao menos uma pessoa." })
  @ArrayMaxSize(200, { message: "Máximo de 200 pessoas por lote." })
  @IsUUID("4", { each: true })
  admissaoIds!: string[];
}
