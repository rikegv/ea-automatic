import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * O CORPO DO CATÁLOGO DE MOTIVOS DE CANCELAMENTO DE VAGA (onda B1).
 *
 * O `@Transform` DE APARA VEM ANTES DO `@MinLength`, e não é preciosismo: ele é `plainToInstance`
 * quem executa, ANTES da validação, então quem valida já vê o texto aparado. Sem ele, `"   "` passa
 * com três caracteres e o catálogo ganha uma linha em branco que a tela desenha como opção
 * invisível, e que fica gravada no `cancelamento_motivo` de uma vaga. É o mesmo defeito que a saída
 * da candidatura já pagou em 09/09.
 *
 * O NOME É O DADO, porque é ELE que fica gravado na vaga (e não o id): uma grafia torta aqui vira
 * trilha torta em toda vaga cancelada por este motivo.
 */
export class CriarMotivoCancelamentoVagaDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  nome!: string;
}

/** Renomear (corrige grafia SEM trocar o motivo) e ligar/desligar a linha. Os dois são opcionais. */
export class AtualizarMotivoCancelamentoVagaDto {
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
