import { IsBoolean, IsOptional, IsString, Length } from "class-validator";

/**
 * Correção do CPF de uma admissão (item 9, Frente B).
 *
 * `Length(11, 14)` aceita os 11 dígitos crus e também o formato com máscara ("000.000.000-00"), que é
 * como o CPF aparece na tela; o serviço normaliza e só então valida o dígito verificador. O DTO NÃO
 * valida o dígito: quem valida é o serviço, para que a chamada direta à API caia na mesma regra.
 *
 * `confirmarDuplicado` é a decisão do Master depois de o sistema AVISAR que o CPF já pertence a
 * alguém, com o nome. Sem ele, a colisão volta 409 com o nome do duplicado; com ele, a correção é
 * aplicada mesmo assim.
 */
export class CorrigirCpfDto {
  @IsString()
  @Length(11, 14)
  cpf!: string;

  @IsOptional()
  @IsBoolean()
  confirmarDuplicado?: boolean;
}
