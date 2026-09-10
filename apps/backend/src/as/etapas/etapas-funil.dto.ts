import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsString, MaxLength, MinLength } from "class-validator";
import { ETAPA_TONS, type EtapaTom } from "@ea/shared-types";

/**
 * DTOs DO GERENCIADOR DE ETAPAS DO FUNIL (A&S).
 *
 * O QUE NÃO EXISTE AQUI, e a ausência é a regra: NÃO HÁ CAMPO `codigo`. O código é DERIVADO do
 * rótulo na criação (`codigoDoRotulo`) e é IMUTÁVEL para sempre, porque é ele que fica gravado na
 * candidatura e em cada evento do histórico. Aceitar o código do corpo seria oferecer, num
 * formulário, a única operação que este desenho proíbe.
 *
 * §A.6: nenhum campo aqui carrega dado pessoal. É catálogo de processo.
 */

/** O nome que a tela mostra. O código sai daqui na criação e nunca mais muda. */
export class CriarEtapaFunilDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo!: string;
}

/** Renomear. O código NÃO muda (ver o cabeçalho). */
export class RenomearEtapaFunilDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo!: string;
}

/**
 * A COR, da paleta FECHADA (`ETAPA_TONS`). Cor livre não entra: cada tom já tem par claro/escuro no
 * design system e o ÍCONE da pill é derivado do tom, então um `#hex` digitado quebraria os dois.
 */
export class DefinirTomEtapaFunilDto {
  @IsIn(ETAPA_TONS as unknown as string[])
  tom!: EtapaTom;
}

/**
 * REORDENAR RECEBE A LISTA COMPLETA, na ordem nova, e reescreve `ordem = 1..N` numa transação.
 *
 * NÃO É "SOBE/DESCE" COM TROCA DE PARES de propósito: dois cliques rápidos produzem ordem duplicada,
 * e a colisão só aparece na tela do outro. A autoridade é a reescrita completa, e é por isso que a
 * lista precisa vir INTEIRA, não em pedaço.
 */
export class ReordenarEtapasFunilDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  ids!: number[];
}
