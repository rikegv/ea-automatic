import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

/** Escopos válidos da pasta-pai (espelha `drive_pasta_pai.escopo`). */
export const ESCOPOS_PASTA_PAI = ["CONTRATO", "FOPAG"] as const;
export type EscopoPastaPaiDto = (typeof ESCOPOS_PASTA_PAI)[number];

/** Validação de uma referência de pasta (URL do Drive ou id cru), antes de salvar. */
export class ValidarPastaDriveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(400)
  folderRef!: string;
}

/** Upsert de uma pasta-pai por (escopo + chave). `folderRef` aceita URL do Drive ou id cru. */
export class UpsertPastaDriveDto {
  @IsIn(ESCOPOS_PASTA_PAI)
  escopo!: EscopoPastaPaiDto;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  chave!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(400)
  folderRef!: string;
}
