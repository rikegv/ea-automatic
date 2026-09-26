import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * O CORPO DO CATÁLOGO DE MOTIVOS DE REENVIO DE SHORTLIST (decisão 6 do diretor).
 *
 * O `@Transform` DE APARA VEM ANTES DO `@MinLength`, e não é preciosismo: é `plainToInstance` quem o
 * executa, ANTES da validação, então quem valida já vê o texto aparado. Sem ele, `"   "` passa com
 * três caracteres e o catálogo ganha uma linha em branco que a tela desenha como opção invisível.
 * É letra por letra o defeito que a saída da candidatura já pagou em 09/09.
 *
 * SEM `pedePretensao` NEM MARCA NENHUMA, e a ausência é o recorte (§A.31): o motivo de reenvio não
 * pendura segundo comportamento em ninguém. Reenvio de lista é fato da VAGA, e não desfecho de
 * pessoa, então não há dado de candidato a pedir junto.
 */
export class CriarMotivoReenvioShortlistDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;
}

/** Renomear (corrige grafia SEM trocar o motivo) e ligar/desligar a linha. Os dois são opcionais. */
export class AtualizarMotivoReenvioShortlistDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
