import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { MOTIVOS_DA_TRAVA_DE_ACESSO } from "@ea/shared-types";

/**
 * OS CORPOS DA PORTA DE E-MAIL.
 *
 * §A.6, E É A RÉGUA QUE VALE PARA TODA MENSAGEM AQUI: nenhuma mensagem de validação ECOA o valor
 * digitado. O que se barra é lixo de TAMANHO e de FORMA, para não carregar estado à toa; o CONTEÚDO
 * é decidido no serviço, onde a recusa é uma só.
 *
 * ┌─ AS MENSAGENS SÃO PROPOSITALMENTE POBRES, e isso não é desleixo ────────────────────────────┐
 * │ A porta tem DOIS desfechos de erro (exigência O5 da auditoria): a recusa neutra e o 503 de     │
 * │ porta não configurada. Uma mensagem de validação específica ("e-mail em formato inválido")     │
 * │ criaria um TERCEIRO, e o terceiro é o que começa a responder perguntas: "este endereço está    │
 * │ bem escrito" é meio caminho de "este endereço existe aqui". Por isso as frases daqui são as    │
 * │ mais genéricas possíveis, e a orientação de campo é da TELA, que sabe qual campo é qual.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Pedido de código. SÓ O E-MAIL, e nada mais.
 *
 * NÃO existe campo de texto livre aqui, e a ausência é a defesa, mesma régua do
 * `RecuperacaoNoPortalDto`: "conte o que aconteceu" é exatamente onde o candidato escreve o nome, o
 * telefone e o CPF dele de uma vez.
 *
 * O FORMATO NÃO É CONFERIDO POR EXPRESSÃO DE E-MAIL, de propósito: uma régua de forma aqui
 * distinguiria "endereço malformado" de "não foi possível continuar", que é o terceiro desfecho
 * proibido. O teto de tamanho é o da coluna (`as_candidatos.email`, 180) com folga, e quem decide se
 * aquilo resolve para alguém é o serviço, em silêncio.
 */
export class SolicitarCodigoDto {
  @IsString({ message: "Informe o seu e-mail" })
  @MaxLength(320, { message: "Informe o seu e-mail" })
  email!: string;
}

/**
 * Confirmação do código. O e-mail volta porque é ele que localiza o código vivo: o bilhete só nasce
 * DEPOIS deste passo, então não há credencial na mão do candidato para identificar a linha.
 *
 * O CÓDIGO ACEITA SÓ DÍGITOS, e o tamanho NÃO é fixado aqui de propósito: barrar "12345" com uma
 * mensagem diferente de "123456 errado" contaria o tamanho do segredo a quem tenta. O serviço
 * compara o HMAC em tempo constante, e qualquer coisa que não seja o código exato cai na mesma
 * recusa.
 */
export class ConfirmarCodigoDto {
  @IsString({ message: "Informe o seu e-mail" })
  @MaxLength(320, { message: "Informe o seu e-mail" })
  email!: string;

  @IsString({ message: "Informe o código" })
  @MaxLength(32, { message: "Informe o código" })
  @Matches(/^\d*$/, { message: "Informe o código" })
  codigo!: string;
}

/**
 * A identidade: o bilhete que a confirmação devolveu, mais CPF e data de nascimento.
 *
 * O FORMATO É CONFERIDO, E O CONTEÚDO NÃO, exatamente como no `IdentificarNoPortalDto`: não há
 * validação de dígito verificador aqui, porque qualquer recusa que distinga "CPF malformado" de
 * "CPF que não casou" começa a responder perguntas sobre CPF. O dígito é conferido no serviço,
 * por `isValidCpf`, e reprovar ali cai na MESMA recusa de tudo o mais.
 */
export class IdentidadeDoAcessoDto {
  @IsString({ message: "Não foi possível continuar" })
  @MaxLength(64, { message: "Não foi possível continuar" })
  bilhete!: string;

  /** Só dígitos ou com a máscara que o teclado do celular produz. Onze dígitos, sempre. */
  @IsString({ message: "Informe um CPF válido" })
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: "Informe um CPF válido" })
  cpf!: string;

  /** `yyyy-mm-dd`, que é o formato do `date` do Postgres e o do `input type="date"`. */
  @IsString({ message: "Informe a data de nascimento" })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Informe a data de nascimento" })
  dataNascimento!: string;
}

/**
 * DESTRAVE, do TIME. CATÁLOGO FECHADO, SEM TEXTO LIVRE.
 *
 * ┌─ POR QUE NÃO HÁ CAMPO DE OBSERVAÇÃO AQUI, e não é falta de espaço na tela ─────────────────┐
 * │ A tabela `portal_acesso_travas` NÃO TEM coluna de observação, de propósito (§A.6): quem opera │
 * │ escreve o nome da pessoa no campo livre, e é assim que a PII volta para um rastro que nasceu  │
 * │ limpo. Um campo de texto no DTO teria de ir para algum lugar, e o único lugar disponível seria │
 * │ a trilha, que é justamente onde texto livre é proibido. Sem o campo, não há onde escrever.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `motivoCodigo` NÃO É "por que eu destravei": é o RECONHECIMENTO de qual trava está sendo
 * desfeita, e o serviço exige que ele seja o MESMO motivo da linha. Ver o bloco de `destravar`.
 */
export class DestravarAcessoDto {
  @IsIn(MOTIVOS_DA_TRAVA_DE_ACESSO as unknown as string[], {
    message: "Escolha o motivo da trava que você está desfazendo.",
  })
  motivoCodigo!: string;
}

/** Filtros da fila, todos opcionais. A multiplicidade é quebrada na controller (`parseMulti`). */
export class FilaDeTravasQueryDto {
  @IsOptional()
  @IsString()
  motivos?: string;

  @IsOptional()
  @IsString()
  situacao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nome?: string;
}
