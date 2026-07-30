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

  /**
   * FORNECEDOR da clínica (OST do fornecedor por clínica). Texto livre de propósito: era um enum de
   * dois valores e o ponto da mudança é poder cadastrar fornecedor novo sem migração de banco.
   * Obrigatório na criação: o agendamento DERIVA o fornecedor daqui, e clínica sem ele deixaria o
   * agendamento sem fornecedor nenhum.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  fornecedor!: string;
}

export class UpdateClinicaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  fornecedor?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
