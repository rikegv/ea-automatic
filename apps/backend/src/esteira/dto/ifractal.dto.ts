import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * Credencial do iFractal digitada pelo consultor na aba da frente.
 *
 * Os dois campos são OPCIONAIS: o consultor salva o login hoje e a senha quando ela chegar, sem que
 * o formulário o obrigue a inventar o que ainda não tem (§A.3 regra 5, o sinalizador marca e nunca
 * impede). Vazio grava NULL, então corrigir um erro de digitação apagando o campo funciona.
 *
 * §A.6: a senha é DESCARTÁVEL (o iFractal força a troca no primeiro acesso) e por decisão do diretor
 * fica legível. O que continua valendo é que ela nunca entra em log nem em mensagem de erro.
 */
export class SalvarIfractalDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  login?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  senha?: string | null;
}
