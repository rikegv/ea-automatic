import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * DTOs do catálogo de BENEFÍCIOS (OST cadastro de benefícios por tela).
 *
 * O limite de 160 espelha a coluna (`varchar(160)`): nome de benefício é rótulo curto
 * ("VR (Vale-Refeição)"), não descrição livre como a escala.
 *
 * `exigeValor` é o campo que dá sentido à tela: é a regra "este benefício precisa de quanto?", que
 * até aqui vivia no CÓDIGO e casava por texto do nome. Sendo campo do cadastro, benefício novo já
 * nasce com a exigência certa e renomear deixa de mudar comportamento em silêncio.
 */
export class CreateBeneficioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  /** Omitido = false (mesmo default da coluna): benefício só concedido/não concedido. */
  @IsOptional()
  @IsBoolean()
  exigeValor?: boolean;
}

export class UpdateBeneficioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsBoolean()
  exigeValor?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}
