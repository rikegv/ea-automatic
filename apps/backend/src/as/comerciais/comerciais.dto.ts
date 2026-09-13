import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsString, MaxLength, MinLength } from "class-validator";

/**
 * DTOs DO GERENCIADOR DE COMERCIAIS (A&S, Onda E).
 *
 * ┌─ NÃO HÁ CAMPO `codigo`, E AQUI A AUSÊNCIA É MAIS FORTE QUE NOS CATÁLOGOS IRMÃOS ──────────────┐
 * │ Neles o código existe na tabela e só não é aceito do corpo. Aqui ele NÃO EXISTE: a identidade │
 * │ é o `id` serial. O motivo é LGPD, não estilo: um código derivado do nome ("ANA_PAULA_...")    │
 * │ seria imutável para sempre, e nome de pessoa muda (casamento, retificação, nome social).      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o único campo aqui é o NOME da pessoa, e é o mínimo necessário para responder "de quem é
 * este cliente". Sem e-mail, sem telefone, sem CPF, sem vínculo com `usuarios`: minimização.
 */

/** O nome da pessoa. Editável para sempre pelo `renomear`, que corrige a pessoa inteira. */
export class CriarComercialDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  rotulo!: string;
}

/** Renomear: casamento, retificação, nome social, ou simplesmente o nome digitado errado. */
export class RenomearComercialDto {
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
export class ReordenarComerciaisDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  ids!: number[];
}
