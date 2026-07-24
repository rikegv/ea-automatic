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
}
