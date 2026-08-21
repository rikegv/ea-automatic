import { IsString, IsUUID, Matches } from "class-validator";

/** Casamento manual de um VT órfão: qual arquivo (pelo digest) vai para qual admissão. */
export class CasarOrfaoDto {
  /** md5 hex do objeto no bucket. É a chave do ledger, e não carrega dado pessoal. */
  @IsString()
  @Matches(/^[0-9a-f]{32}$/, { message: "Arquivo inválido." })
  md5!: string;

  @IsUUID("4", { message: "Admissão inválida." })
  admissaoId!: string;
}

/** Dispensa do alerta de um órfão. Só o digest: nada aqui identifica pessoa. */
export class ResolverOrfaoDto {
  @IsString()
  @Matches(/^[0-9a-f]{32}$/, { message: "Arquivo inválido." })
  md5!: string;
}
