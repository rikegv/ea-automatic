import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

/** Troca de senha do próprio usuário (primeiro acesso ou voluntária) — OST-EA-GESTAO-USUARIOS. */
export class TrocarSenhaDto {
  @IsString()
  @MinLength(1)
  senhaAtual!: string;

  @IsString()
  @MinLength(8)
  novaSenha!: string;
}
