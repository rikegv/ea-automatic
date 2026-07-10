import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

// ── Kit (tipo de vínculo) ──────────────────────────────────────────────────
export class CriarKitTipoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome!: string;
}

export class AtualizarKitTipoDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

// ── Documento de um kit ────────────────────────────────────────────────────
export class CriarKitRegraDto {
  @IsUUID()
  kitTipoId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  titulo!: string;
}

export class AtualizarKitRegraDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  titulo?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

export class ReordenarKitRegraDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID("4", { each: true })
  @Type(() => String)
  ids!: string[];
}
