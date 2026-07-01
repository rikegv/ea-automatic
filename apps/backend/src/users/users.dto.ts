import {
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
