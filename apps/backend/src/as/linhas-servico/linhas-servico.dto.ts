import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, MaxLength, MinLength } from "class-validator";

/**
 * DTOs DO GERENCIADOR DE LINHAS DE SERVIÇO (A&S).
 *
 * O QUE NÃO EXISTE AQUI, e a ausência é a regra: NÃO HÁ CAMPO `codigo`. O código é DERIVADO do
 * rótulo na criação e é IMUTÁVEL para sempre. Aceitá-lo do corpo seria oferecer, num formulário, a
 * única operação que este desenho proíbe.
 *
 * §A.6: nenhum campo aqui carrega dado pessoal. É catálogo de processo.
 */

/** O nome que a tela mostra. O código sai daqui na criação e nunca mais muda. */
export class CriarLinhaServicoDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo!: string;
}

/** Renomear. O código NÃO muda (ver o cabeçalho). */
export class RenomearLinhaServicoDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo!: string;
}

/**
 * REORDENAR RECEBE A LISTA COMPLETA, na ordem nova, e reescreve `ordem = 1..N` numa transação.
 *
 * NÃO É "SOBE/DESCE" COM TROCA DE PARES de propósito: dois cliques rápidos produzem ordem duplicada,
 * e a colisão só aparece na tela do outro. A autoridade é a reescrita completa.
 */
export class ReordenarLinhasServicoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  ids!: number[];
}
