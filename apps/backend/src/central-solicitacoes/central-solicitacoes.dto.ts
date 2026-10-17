import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import {
  SOLICITACAO_ACAO_GESTAO,
  SOLICITACAO_DESCRICAO_MIN,
  SOLICITACAO_TIPO,
  type SolicitacaoAcaoGestao,
  type SolicitacaoTipo,
} from "@ea/shared-types";

/** Apara string; deixa o resto como veio (o `@IsString` depois rejeita não-string). */
const aparar = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * DTOs DA CENTRAL DE SOLICITAÇÕES (OST Central de Solicitações).
 *
 * O CORPO DO POST É MULTIPART: os campos de texto vêm por `@Body()` (strings) e o print por
 * `FileInterceptor`. A validação de que o `menuCodigo`+`submenu` existem no catálogo e de que o
 * arquivo veio é do service (é regra de domínio, não de forma). §A.6: nenhum campo carrega PII de
 * candidato, só texto do usuário interno.
 */

/** Abertura de uma solicitação (multipart: estes campos + `file`). */
export class CriarSolicitacaoDto {
  @IsIn(SOLICITACAO_TIPO)
  tipo!: SolicitacaoTipo;

  @Transform(aparar)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  menuCodigo!: string;

  @Transform(aparar)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  submenu!: string;

  // A apara VEM ANTES do `@MinLength`: "descrição" de 50 espaços não é descrição. O mínimo é o do
  // contrato compartilhado (§A.39), não um número digitado aqui.
  @Transform(aparar)
  @IsString()
  @MinLength(SOLICITACAO_DESCRICAO_MIN)
  @MaxLength(5000)
  descricao!: string;
}

/** Uma mensagem na thread (solicitante ou gestão). */
export class CriarMensagemDto {
  @Transform(aparar)
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  corpo!: string;
}

/**
 * Ação da gestão sobre uma solicitação. `corpo` é opcional no DTO; a obrigatoriedade do corpo para
 * ENVIAR_DUVIDA é regra de domínio e mora no service (BadRequest quando falta).
 */
export class AcaoGestaoDto {
  @IsIn(SOLICITACAO_ACAO_GESTAO)
  acao!: SolicitacaoAcaoGestao;

  @IsOptional()
  @Transform(aparar)
  @IsString()
  @MaxLength(5000)
  corpo?: string;
}
