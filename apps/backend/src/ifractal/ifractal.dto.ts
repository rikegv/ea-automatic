import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { TIPO_MARCACAO, type TipoMarcacao } from "@ea/shared-types";

export class CriarStatusIfractalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  rotulo!: string;
}

export class RenomearStatusIfractalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  rotulo!: string;
}

/**
 * Edição da linha do cliente na tela do iFractal (o lápis).
 *
 * Os dois campos são OPCIONAIS: o formulário manda só o que mudou, e não mandar um campo é não
 * mexer nele. `ativo` alcança MAIS que esta tela (cliente inativo some dos seletores do sistema),
 * e por isso a edição é explícita e nunca um efeito colateral da troca de tipo.
 */
export class EditarClienteIfractalDto {
  @IsOptional()
  @IsIn(TIPO_MARCACAO)
  tipoMarcacao?: TipoMarcacao;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
