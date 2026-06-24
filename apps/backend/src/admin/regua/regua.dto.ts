import { Type } from "class-transformer";
import { ArrayMinSize, IsIn, IsString, IsUUID, ValidateNested } from "class-validator";
import { EXIGENCIA_DOCUMENTO, type ExigenciaDocumento } from "@ea/shared-types";

export class ReguaItemDto {
  @IsUUID()
  tipoDocumentoId!: string;

  @IsIn(EXIGENCIA_DOCUMENTO as unknown as string[])
  exigencia!: ExigenciaDocumento;
}

export class UpsertReguaDto {
  @IsString()
  codCliente!: string;

  @IsUUID()
  cargoId!: string;

  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ReguaItemDto)
  itens!: ReguaItemDto[];
}
