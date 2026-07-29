import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { PAPEL, type Papel } from "@ea/shared-types";

// Papéis atribuíveis pela administração de usuários (todos os do RBAC — §A.3).
const PAPEIS = PAPEL as unknown as string[];

export class CriarUsuarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsIn(PAPEIS)
  papel!: Papel;
}

export class AtualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsIn(PAPEIS)
  papel?: Papel;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/** Conjunto de menus marcados para um usuário (OST permissão de menu). Códigos inválidos são
 * ignorados no serviço; aqui só validamos o formato. */
export class DefinirMenusDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  menus!: string[];

  /**
   * O CATÁLOGO QUE A TELA EXIBIU, ou seja, o escopo do que ela tem autoridade para remover. Menu que
   * não estiver aqui é PRESERVADO, mesmo não vindo em `menus`.
   *
   * Na FORMA é opcional; quem exige é a controller, com UMA mensagem clara. A obrigatoriedade aqui
   * dispararia a cascata inteira do class-validator ("must be an array", "each value...") e o
   * consultor leria cinco frases técnicas em vez de "recarregue a página".
   *
   * Ele é a correção do defeito: enquanto dava para salvar sem declarar o escopo, uma página aberta
   * antes de um menu novo nascer apagava esse menu em silêncio. Aconteceu com o `assinaturas` e
   * depois com o `assinante-empresa`.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  conhecidos?: string[];
}
