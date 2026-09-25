import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import type { CampoConfirmadoGi } from "../domain/portal-dados-gi";
import { LIMITES_PORTAL, TIPOS_ACEITOS_PORTAL } from "../domain/portal-credencial";

/**
 * Pedido de credencial de escrita. O QUE ELE NÃO TEM É O PONTO: não há caminho, não há nome de
 * arquivo e não há id de admissão. O nome do objeto é escolhido por nós e a admissão vem da sessão.
 *
 * O tamanho é DECLARADO, e declarar é o que o candidato faz de bom grado porque é o navegador dele
 * que lê o tamanho do arquivo. Declarar pouco e subir muito não adianta: o declarado vira o teto
 * assinado, e quem recusa é o armazenamento.
 */
export class PedirCredencialDto {
  /** Código do catálogo `tipos_documento` (§A.3), que é vivo. Formato saneado também na régua pura. */
  @IsString()
  @Matches(/^[A-Za-z0-9_]{1,60}$/, { message: "Tipo de documento inválido" })
  codigoTipoDocumento!: string;

  @IsIn(TIPOS_ACEITOS_PORTAL as unknown as string[], {
    message: "Envie o documento em PDF, JPG ou PNG.",
  })
  contentType!: string;

  /**
   * O teto também é declarado aqui, e não só na régua pura, de propósito: barrar 2 GB na validação
   * do DTO evita carregar estado do link para recusar o óbvio.
   */
  @IsInt()
  @Min(1)
  @Max(LIMITES_PORTAL.BYTES_MAX_ARQUIVO, { message: "Envie um arquivo de até 10 MB." })
  bytes!: number;
}

/**
 * GRAVAÇÃO DOS DADOS DO GI validados pelo candidato (Portal→GI, peça 2).
 *
 * O QUE ELE NÃO TEM É O PONTO, igual ao `PedirCredencialDto`: NÃO há id de admissão. A admissão vem
 * da SESSÃO (`req.portal.admissaoId`), nunca do corpo, senão um link válido gravaria dado na
 * admissão de outra pessoa (veto: item 2 do §7 do desenho). O controller estruturalmente não
 * consegue expressar admissão no corpo.
 *
 * `campos` é a LISTA de campos que o candidato conferiu, cada um com `confirmadoPorHumano`. SÓ o
 * confirmado persiste (veto V12), e o filtro está no domínio (`montarGravacaoDadosGi` +
 * allowlist de colunas): este DTO só barra o grosseiro (não é lista, ou lista grande demais).
 * §A.6: nenhuma mensagem de validação ecoa valor.
 */
export class GravarDadosGiDto {
  @IsArray({ message: "Envio inválido" })
  @ArrayMaxSize(200, { message: "Envio inválido" })
  campos!: CampoConfirmadoGi[];
}

/**
 * Aceite do termo de privacidade (LGPD). Corpo VAZIO no uso normal: a admissão vem da SESSÃO, nunca
 * do corpo. `admissaoId` existe SÓ como defesa em profundidade, para o serviço RECUSAR um corpo que
 * tente apontar para admissão diferente da sessão (molde de `montarGravacaoDadosGi`); o controller
 * nunca o encaminha como origem. §A.6: nenhuma mensagem ecoa valor.
 */
export class AceitarTermoDto {
  @IsOptional()
  @IsUUID()
  admissaoId?: string;
}

/** Confirmação de chegada. O aviso do navegador entra e NÃO decide nada (item G3, veto V11). */
export class ConfirmarEnvioDto {
  @IsUUID()
  credencialId!: string;

  @IsOptional()
  @IsBoolean()
  avisoDoNavegador?: boolean;
}

/**
 * A identificação do candidato: o link que ele recebeu, mais CPF e data de nascimento.
 *
 * §A.6, E É A RÉGUA QUE VALE PARA TODA MENSAGEM AQUI: nenhuma mensagem de validação ECOA o valor
 * digitado. "CPF inválido" é aceitável; "CPF 123... inválido" põe o dado numa resposta, num log de
 * validação e num relatório de erro do navegador, de uma vez só.
 *
 * O FORMATO É CONFERIDO, E O CONTEÚDO NÃO. Não há validação de dígito verificador nem consulta
 * nenhuma aqui: qualquer recusa que distinga "CPF malformado" de "CPF que não casou" começa a
 * responder perguntas sobre CPF, que é exatamente o oráculo que a rota inteira foi desenhada para
 * não ser. O que se barra é lixo de tamanho, para não carregar estado à toa.
 */
export class IdentificarNoPortalDto {
  @IsString()
  @MaxLength(4096, { message: "Link inválido" })
  linkToken!: string;

  /** Só dígitos ou com a máscara que o teclado do celular produz. Onze dígitos, sempre. */
  @IsString()
  @Matches(/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, { message: "Informe um CPF válido" })
  cpf!: string;

  /** `yyyy-mm-dd`, que é o formato do `date` do Postgres e o do `input type="date"`. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Informe a data de nascimento" })
  dataNascimento!: string;
}

/**
 * A válvula de recuperação. SÓ O LINK, e nada mais.
 *
 * NÃO existe campo de texto livre aqui, e a ausência é a defesa: "conte o que aconteceu" é
 * exatamente onde o candidato escreve o nome, o telefone e o CPF dele de uma vez (§A.6). O que ele
 * tem a dizer, ele diz ao RH, que é para onde a resposta o manda.
 */
export class RecuperacaoNoPortalDto {
  @IsString()
  @MaxLength(4096, { message: "Link inválido" })
  linkToken!: string;
}
