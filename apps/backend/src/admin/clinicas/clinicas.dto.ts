import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * DTOs do catálogo de CLÍNICAS. Nasceu só com o nome; ganhou fornecedor (OST do fornecedor por
 * clínica) e agora o ENDEREÇO (OST melhorias EAC, item 6), que o agendamento do exame puxa
 * automaticamente. Cada dado novo entra como campo próprio, nunca empilhado no nome.
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

  /**
   * ENDEREÇO da clínica (item 6). OPCIONAL: o agendamento puxa quando existe, e clínica sem endereço
   * segue válida (as já cadastradas não têm). Preenchido conforme cada clínica é editada.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string;
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

  /** Endereço (item 6). String vazia é permitida para LIMPAR o endereço de uma clínica. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  endereco?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
