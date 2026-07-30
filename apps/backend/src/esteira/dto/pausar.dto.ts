import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Pausa da admissão (OST admissão pausada). O motivo é OPCIONAL por decisão do diretor: pausa rápida
 * não pode depender de digitar justificativa. Quando vem preenchido, é gravado em
 * `admissoes.pausa_motivo` e vira uma linha na trilha do modal do olho.
 *
 * Texto LIVRE, não catálogo (ao contrário do motivo de declínio, que é `motivos_declinio`): a razão
 * da pausa é circunstancial do cliente, não uma taxonomia que valha manter.
 *
 * 500 caracteres: mesmo teto da observação da Liberação, cabe o recado real sem virar campo de texto
 * longo. §A.6: motivo de pausa é dado de operação, sem PII.
 */
export class PausarDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "O motivo da pausa deve ter no máximo 500 caracteres." })
  motivo?: string;
}
