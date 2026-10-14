import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/** Cria o grupo. O nome é a identidade, e o índice único do banco usa a forma normalizada dele. */
export class CriarGrupoClienteDto {
  @IsString()
  @MinLength(2, { message: "O nome do grupo precisa de pelo menos 2 caracteres." })
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  /**
   * META OBRIGATÓRIA (decisão do diretor: sem opção de "sem meta"). O banco aceita nulo só para os
   * grupos legados; na criação a meta é exigida, e tem de ser pelo menos 1 (grupo com meta zero não
   * é meta, é grupo sem alvo).
   */
  @IsInt({ message: "A meta precisa ser um número inteiro." })
  @Min(1, { message: "A meta precisa ser de pelo menos 1." })
  meta!: number;
}

export class AtualizarGrupoClienteDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: "O nome do grupo precisa de pelo menos 2 caracteres." })
  @MaxLength(200)
  nome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /**
   * Na edição a meta é OPCIONAL (o patch é parcial), mas quando vem tem de ser válida: inteiro de
   * pelo menos 1, a mesma régua da criação.
   */
  @IsOptional()
  @IsInt({ message: "A meta precisa ser um número inteiro." })
  @Min(1, { message: "A meta precisa ser de pelo menos 1." })
  meta?: number;
}

/**
 * A LISTA COMPLETA de quem pertence ao grupo depois de salvar, e não um "acrescente estes".
 *
 * É o formato do livreto: o que está marcado fica, o que foi desmarcado sai. Mandar só os novos
 * tornaria impossível tirar alguém pela mesma tela, e obrigaria uma segunda rota para o inverso.
 *
 * SEM `@ArrayNotEmpty`: lista vazia é um pedido legítimo, o de esvaziar o grupo.
 */
export class DefinirMembrosDto {
  @IsArray()
  @IsString({ each: true })
  codClientes!: string[];
}
