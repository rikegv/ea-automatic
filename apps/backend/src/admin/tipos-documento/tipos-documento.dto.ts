import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateTipoDocumentoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;
}

export class UpdateTipoDocumentoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;
}
