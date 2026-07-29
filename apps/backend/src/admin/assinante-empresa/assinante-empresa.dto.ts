import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

/**
 * UMA PESSOA dentro do conjunto que assina pela empresa (INT-4).
 *
 * As regras fortes (dígito verificador do CPF, formato do e-mail, nome aceito pela Clicksign) ficam
 * no service, que é quem devolve a mensagem dizendo de QUEM é o problema; aqui é só forma e tamanho.
 */
export class ItemAssinanteDto {
  /** Presente quando a pessoa já existe no conjunto (edição); ausente cria. */
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  nome!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(180)
  email!: string;

  /**
   * Aceita com ou sem pontuação; o service normaliza para 11 dígitos. OPCIONAL só na forma: em
   * branco numa pessoa que já existe mantém o CPF gravado (a tela nunca recebe o CPF completo de
   * volta, §A.6). Em pessoa NOVA, o service recusa vazio, porque o CPF é obrigatório.
   */
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  /** Ordem de assinatura no escopo. Mesma ordem = paralelo; diferentes = sequência. Default 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  ordem?: number;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * O CONJUNTO de um escopo, salvo de uma vez. `codCliente` ausente/vazio é o PADRÃO; preenchido é o
 * conjunto daquele cliente. `itens` VAZIO apaga o conjunto.
 */
export class SalvarConjuntoDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codCliente?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAssinanteDto)
  itens!: ItemAssinanteDto[];
}
