import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * DTOs do catálogo de CLÍNICAS (OST Onda 2, item 4). SÓ O NOME, por decisão do diretor: nada de
 * endereço, telefone ou contato. Se um dia precisar de mais, entra como campo novo, não como texto
 * empilhado dentro do nome.
 */
export class CreateClinicaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;
}

export class UpdateClinicaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
