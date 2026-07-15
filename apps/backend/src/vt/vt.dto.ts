import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { normalizeCpf } from "@ea/shared-types";

/**
 * Identificação do candidato no formulário de VT (§A.17). CPF + data de nascimento são
 * CREDENCIAL de acesso (§A.6): nunca são logados e não trafegam de volta na resposta.
 */
export class IdentificarDto {
  // Aceita com ou sem máscara; normaliza para 11 dígitos (chave técnica).
  @Transform(({ value }) => (typeof value === "string" ? normalizeCpf(value) : value))
  @IsString()
  @Matches(/^\d{11}$/, { message: "CPF deve ter 11 dígitos" })
  cpf!: string;

  /** ISO (yyyy-mm-dd), como o input[type=date] do formulário envia. */
  @IsISO8601({ strict: true }, { message: "Data de nascimento inválida" })
  dataNascimento!: string;
}

/** Uma condução declarada pelo candidato (§A.17 Parte B). */
export class ConducaoDto {
  @IsIn(["IDA", "VOLTA"])
  sentido!: "IDA" | "VOLTA";

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cidade!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  tipoTransporte!: string;

  @IsIn(["BILHETE_UNICO", "CARTAO_TOP", "OUTRO"])
  cartao!: "BILHETE_UNICO" | "CARTAO_TOP" | "OUTRO";

  /** Obrigatório quando `cartao` = OUTRO. A regra composta é checada no service. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  cartaoOutro?: string;

  // Zero é válido (cidades com gratuidade: Guararema, Santa Isabel).
  @Transform(({ value }) => (typeof value === "string" ? Number(value.replace(",", ".")) : value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valor!: number;
}

/**
 * Envio do formulário de VT (§A.17 Partes B e C). Chega já com o aceite dos 3 avisos: a tela só
 * dispara este POST depois do "Estou ciente das informações passadas".
 *
 * Os TOTAIS não vêm daqui de propósito: são recalculados no service a partir das conduções. O que
 * o cliente manda não é fonte de verdade para valor.
 */
export class EnviarFormularioDto {
  @IsBoolean()
  optante!: boolean;

  @IsString()
  @Matches(/^\d{8}$/, { message: "CEP deve ter 8 dígitos" })
  cep!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  logradouro!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  numero!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  complemento?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  bairro!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cidade!: string;

  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: "UF deve ter 2 letras" })
  uf!: string;

  // Teto defensivo: ninguém pega 40 conduções por dia; evita payload abusivo na rota pública.
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ConducaoDto)
  conducoes!: ConducaoDto[];
}
