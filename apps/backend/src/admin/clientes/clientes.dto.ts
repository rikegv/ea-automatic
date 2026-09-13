import { TIPO_MARCACAO, type TipoMarcacao } from "@ea/shared-types";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateClienteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;

  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  razaoSocial!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeOperacao?: string;

  /**
   * ─ O SEGMENTO E O COMERCIAL JÁ NA CRIAÇÃO (Onda E) ──────────────────────────────────────────
   *
   * ┌─ POR QUE ELES ENTRAM AQUI, e não só no editar, sendo o `create` mínimo há muito tempo ─────┐
   * │ O `ValidationPipe` global roda com `forbidNonWhitelisted: true` (`main.ts`), e isso muda o  │
   * │ custo do erro: campo que o DTO não conhece NÃO é ignorado, ele RECUSA A REQUISIÇÃO INTEIRA  │
   * │ com 400. Uma tela que mande os dois campos no mesmo formulário de cadastro pararia de salvar│
   * │ o cliente INTEIRO, razão social incluída, e a mensagem falaria de um campo que o usuário nem│
   * │ associou ao que ele estava fazendo.                                                         │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * OPCIONAIS, e cliente sem os dois continua nascendo: são 249 para classificar aos poucos.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  segmentoId?: number | null;

  /** §A.6: um ID. O NOME do comercial nunca entra nem sai por este DTO. */
  @IsOptional()
  @IsInt()
  @Min(1)
  comercialId?: number | null;
}

export class DefinirVinculoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  opcaoId!: string;
}

export class UpdateClienteDto {
  @IsOptional()
  @IsString()
  @MaxLength(18)
  cnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  razaoSocial?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeOperacao?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  // ── Camada de pagamento do benefício (§A.17 etapa 4) ────────────────────────
  // Os três aceitam NULL de propósito: é assim que o admin LIMPA uma regra cadastrada por engano.
  // `IsOptional` já deixa passar null e undefined, e o `update` grava o que vier, então limpar é
  // mandar null, e não mandar campo nenhum é não mexer.

  /** Só informativa na tela de Benefícios: exibe o rótulo, sem cálculo (decisão do diretor). */
  @IsOptional()
  @IsIn(["CADA_5_DIAS", "CADA_15_DIAS", "MENSAL"])
  periodicidadeBeneficio?: "CADA_5_DIAS" | "CADA_15_DIAS" | "MENSAL" | null;

  /** Dia âncora do pagamento recorrente. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  diaPagamentoBeneficio?: number | null;

  /**
   * Dias CORRIDOS até o primeiro crédito, contando o próprio dia da admissão. Zero é válido e
   * significa "crédito no mesmo dia", por isso o mínimo é 0 e não 1.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  diasPrimeiroCredito?: number | null;

  /**
   * TIPO DE MARCAÇÃO DE PONTO no iFractal. Toda admissão do cliente herda.
   *
   * NÃO ACEITA NULL, ao contrário dos três campos acima: a coluna é NOT NULL com default
   * `APLICATIVO`, porque não existe cliente que não marque ponto de alguma forma. Não mandar o campo
   * é não mexer; mandar um dos quatro valores troca.
   */
  @IsOptional()
  @IsIn(TIPO_MARCACAO)
  tipoMarcacao?: TipoMarcacao;

  /**
   * ─ O SEGMENTO (o RAMO) E O COMERCIAL DO CLIENTE (Onda E) ─────────────────────────────────────
   *
   * ┌─ OS DOIS ACEITAM `null`, E ISSO É O "LIMPAR" ─────────────────────────────────────────────┐
   * │ Não mandar o campo é NÃO MEXER; mandar `null` é DESCLASSIFICAR (o admin errou e desfaz);  │
   * │ mandar um número é escolher, e o número é CONFERIDO contra o catálogo vivo no service. É a │
   * │ mesma régua dos três campos de benefício logo acima.                                       │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * ELES EXISTEM NOS DOIS DTOs, e a primeira redação deste bloco dizia o contrário (correção de
   * 13/09, achado da auditoria do código). O plano era só no editar, porque classificar os 249 é
   * trabalho de edição; **o `forbidNonWhitelisted: true` do `ValidationPipe` global derrubou o
   * plano**: campo que o DTO não conhece não é ignorado, ele RECUSA A REQUISIÇÃO INTEIRA com 400.
   * Com os campos só no editar, a tela que os enviasse no cadastro novo pararia de criar cliente,
   * e o erro não falaria de segmento nenhum. Estão nos dois, e no `Create` são opcionais.
   *
   * SEM `@IsIn`: são CATÁLOGOS do diretor, e um decorator sobre a lista de ontem recusaria o
   * segmento que ele criou hoje. Quem confere é `conferirSegmentoEComercial`, no service.
   *
   * §A.6: `comercialId` é um ID. O NOME do comercial nunca entra nem sai por este DTO.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  segmentoId?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  comercialId?: number | null;
}
