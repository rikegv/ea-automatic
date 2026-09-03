import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

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
