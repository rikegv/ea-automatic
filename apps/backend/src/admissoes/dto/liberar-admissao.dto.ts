import { IsString, IsUUID, MinLength } from "class-validator";

/** Liberação Admissional (Parte 1): atribui cliente + cargo à pré-admissão para ela nascer na esteira. */
export class LiberarAdmissaoDto {
  @IsString()
  @MinLength(1)
  codCliente!: string;

  @IsUUID()
  cargoId!: string;
}
