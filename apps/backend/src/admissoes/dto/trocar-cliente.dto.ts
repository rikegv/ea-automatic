import { IsString, IsUUID, MaxLength, MinLength } from "class-validator";

/**
 * Troca de CLIENTE e CARGO de uma admissão (OST da correção do cliente errado).
 *
 * Os DOIS são obrigatórios, e juntos por decisão do diretor: a régua documental e a memória resolvem
 * por (cliente + cargo), então trocar só o cliente deixaria o par sem régua cadastrada e a admissão
 * sem checklist. O cargo do cliente novo costuma ter outro nome no catálogo dele.
 */
export class TrocarClienteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;

  @IsUUID()
  cargoId!: string;
}
