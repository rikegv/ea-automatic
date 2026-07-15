import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

/** Registro manual de NC-3 (Cadastro incompleto) — flags manuais (kit/assinatura/realizado). */
export class RegistrarNc3Dto {
  @IsUUID()
  admissaoId!: string;

  @IsOptional()
  @IsBoolean()
  flagSemKit?: boolean;

  @IsOptional()
  @IsBoolean()
  flagSemAssinatura?: boolean;

  @IsOptional()
  @IsBoolean()
  flagCadastroNaoMarcado?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalhe?: string;

  /** Via 2 — registro a pedido da diretoria: NC nasce PENDENTE de aprovação (exige motivo). */
  @IsOptional()
  @IsBoolean()
  liberacaoDiretoria?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  liberacaoMotivo?: string;
}

/** Via 2 — consultor solicita liberação por determinação da diretoria (flag + motivo). */
export class SolicitarLiberacaoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  motivo!: string;
}

/** Decisão da supervisão (Master/Super Admin) sobre a liberação por diretoria. */
export class DecidirLiberacaoDto {
  @IsBoolean()
  aprovar!: boolean;
}
