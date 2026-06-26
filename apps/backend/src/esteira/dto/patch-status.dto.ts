import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/** Mudança de status de uma frente (F8). `confirmar` libera reversão/aceite com pendência. */
export class PatchStatusDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsOptional()
  @IsBoolean()
  confirmar?: boolean;

  /**
   * Via 2 (2C item 2) — aceite de liberação com pendência feito A PEDIDO DA DIRETORIA. Quando
   * verdadeiro, a NC gerada nasce "aguardando aprovação da diretoria" (PENDENTE) com o motivo, em
   * vez de penalizar diretamente o consultor (Via 1). Exige `liberacaoMotivo`.
   */
  @IsOptional()
  @IsBoolean()
  liberacaoDiretoria?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  liberacaoMotivo?: string;

  // S3 — aceite de avanço com campos obrigatórios pendentes (gera o log de passagem permanente).
  @IsOptional()
  @IsBoolean()
  aceitePassagem?: boolean;
}
