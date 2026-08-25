import { Transform } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import {
  UFS,
  VAGA_ESCOLARIDADE,
  VAGA_ETAPAS_PS,
  VAGA_GENERO,
  VAGA_IDIOMAS,
  VAGA_MODELO_TRABALHO,
  VAGA_NATUREZA,
  VAGA_SAZONALIDADE,
  VAGA_STATUS,
  VAGA_TEMPO_CONTRATO,
  VAGA_TESTES,
  VAGA_TIPO_SUBSTITUICAO,
  VAGA_VINCULO,
  type VagaEscolaridade,
  type VagaGenero,
  type VagaModeloTrabalho,
  type VagaNatureza,
  type VagaSazonalidade,
  type VagaStatus,
  type VagaTipoSubstituicao,
  type VagaVinculo,
} from "@ea/shared-types";
import { normalizarSalarioParaDto } from "../../admissoes/dto/valor-monetario-br";

/** Um benefício da vaga: o id do catálogo mais o valor, que nem todo benefício tem. */
export class VagaBeneficioDto {
  @IsUUID("4")
  beneficioId!: string;

  /**
   * Valor em pt-BR ("500,00"), normalizado para a forma canônica do `numeric`. Ausente e vazio são a
   * mesma coisa: benefício concedido sem valor a informar.
   */
  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: "Valor de benefício inválido. Informe um valor como 500 ou 500,00.",
  })
  valor?: string;
}

/**
 * DTO de criação da vaga (trilha de abertura, 5 passos).
 *
 * O QUE NÃO ESTÁ AQUI E É DE PROPÓSITO: `abertoPorId`, `consultorId` e `recruiterId`. Quem abriu é
 * carimbado a partir da sessão, e os dois lados da vaga saem do PAPEL DE A&S de quem abre mais a
 * contraparte escolhida (`contraparteId`). Aceitar os dois lados do corpo faria da trilha um campo
 * editável e a autoria deixaria de ser trilha.
 *
 * Os campos de FECHAMENTO também não estão aqui: são da ação Fechar Vaga, momento diferente.
 *
 * POR QUE OS OBRIGATÓRIOS SÃO `@IsOptional()` AQUI (OST de 25/08): o MESMO corpo serve para SALVAR
 * RASCUNHO e para PUBLICAR, e no rascunho nada é cobrado. Quem cobra é a régua única do domínio
 * (`vagaPendencias`, no shared-types), chamada no service SÓ quando o status pedido não é RASCUNHO.
 *
 * ISSO NÃO AFROUXA A PUBLICAÇÃO. O `@IsString`/`@IsUUID`/`@IsISO8601` continua conferindo o FORMATO
 * de tudo que vier preenchido, e a régua confere a PRESENÇA na hora de publicar, com a lista inteira
 * do que falta em vez de um erro por vez. O que saiu do DTO foi só a exigência de estar presente,
 * porque ela deixou de valer no momento em que o DTO chega.
 */
export class CreateVagaDto {
  // ── PASSO 1, a vaga ───────────────────────────────────────────────────────
  /** Código do PROCESSO SELETIVO, único no sistema. Normalizado (trim + caixa alta) no service. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codigo?: string;

  @IsOptional()
  @IsUUID()
  cargoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nomeDivulgacao?: string;

  /** NULÁVEL: vaga sem cliente vinculado é estado real e não trava nada. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  codCliente?: string;

  // CENTRO DE CUSTO SAIU DA ABERTURA (item 4 da OST de 22/08). Não é campo omitido por engano: o
  // DTO deixa de aceitá-lo de propósito, então corpo antigo com `centroCusto` é rejeitado pelo
  // `forbidNonWhitelisted` em vez de gravar em silêncio um campo que a trilha não pergunta mais.

  @IsOptional()
  @IsIn(VAGA_NATUREZA as unknown as string[])
  natureza?: VagaNatureza;

  @IsOptional()
  @IsIn(VAGA_STATUS as unknown as string[])
  status?: VagaStatus;

  @IsOptional()
  @IsIn(VAGA_SAZONALIDADE as unknown as string[])
  sazonalidade?: VagaSazonalidade;

  /**
   * OS DOIS CONTADORES DA VAGA (decisão do diretor, 25/08). OFICIAIS aceita a partir de 1, porque
   * vaga com zero contratação não é vaga; BANCO aceita ZERO, porque não reservar excedente é o
   * estado normal da maioria das vagas. É a mesma assimetria dos dois CHECK do banco de dados.
   *
   * O NOME ANTIGO `posicoes` DEIXA DE SER ACEITO de propósito: com `forbidNonWhitelisted`, um corpo
   * montado fora da tela com o campo velho é RECUSADO com mensagem, em vez de gravar em silêncio uma
   * vaga sem meta oficial nenhuma.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  posicoesOficiais?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  posicoesBanco?: number;

  // ── PASSO 2, quem pediu ───────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(200)
  solicitanteNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  solicitanteTelefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  solicitanteEmail?: string;

  @IsOptional()
  @IsISO8601()
  dataSolicitacao?: string;

  @IsOptional()
  @IsISO8601()
  dataAlinhamento?: string;

  @IsOptional()
  @IsISO8601()
  dataAbertura?: string;

  /** Vale em QUALQUER natureza de vaga (correção de 21/08). Segue opcional. */
  @IsOptional()
  @IsISO8601()
  dataLimite?: string;

  @IsOptional()
  @IsISO8601()
  envioShortlist?: string;

  // ── PASSO 3, contratação ──────────────────────────────────────────────────
  /**
   * A CONTRAPARTE: o usuário do lado OPOSTO ao de quem abre. Qual lado é esse, quem decide é o papel
   * de A&S da sessão, no service. A tela manda um id só, e não escolhe o lado.
   */
  @IsOptional()
  @IsUUID()
  contraparteId?: string;

  @IsOptional()
  @IsIn(VAGA_VINCULO as unknown as string[])
  vinculo?: VagaVinculo;

  @IsOptional()
  @IsIn(VAGA_TEMPO_CONTRATO as unknown as string[])
  tempoContrato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  motivo?: string;

  @IsOptional()
  @IsString()
  justificativaMotivo?: string;

  @IsOptional()
  @IsIn(VAGA_TIPO_SUBSTITUICAO as unknown as string[])
  tipoSubstituicao?: VagaTipoSubstituicao;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  substituidoNome?: string;

  /**
   * CPF DE QUEM SERÁ SUBSTITUÍDO. Chega com máscara da tela ("123.456.789-01") e é normalizado aqui
   * para 11 dígitos; quem validou que o dígito fecha é o service, com `isValidCpf`, para o erro sair
   * como frase em português e não como violação de constraint.
   *
   * PERSISTE, por decisão do diretor (22/08): exigência legal do cadastro do ADM. §A.6 no resto.
   */
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.replace(/\D/g, "") : value))
  @IsString()
  @MaxLength(11)
  substituidoCpf?: string;

  // ── PASSO 4, condições e benefícios ───────────────────────────────────────
  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "Salário de abertura inválido. Informe um valor como 2500 ou 2.500,00 (ponto separa o milhar, vírgula os centavos).",
  })
  salarioAbertura?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VagaBeneficioDto)
  beneficios?: VagaBeneficioDto[];

  @IsOptional()
  @IsString()
  localTrabalho?: string;

  /**
   * A UF ESCOLHIDA (item 7). Lista fechada nas 27 unidades da federação: sigla inventada não entra,
   * porque é ela que decide quais regiões são aceitas logo abaixo.
   */
  @IsOptional()
  @IsIn(UFS.map((u) => u.uf))
  regiaoEstado?: string;

  /**
   * AS REGIÕES MARCADAS. Aqui o DTO garante só a FORMA (array de texto sem repetição); QUAL região
   * é válida depende da UF, e essa é a régua de `regiaoPertenceAUf`, aplicada no service. Um
   * `@IsIn` com a união dos 27 estados aceitaria região do Ceará numa vaga de São Paulo.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  regioes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  regioesOutras?: string;

  /**
   * ESCALA: o nome vindo do catálogo `escalas_catalogo` OU o texto de "Outra escala". Texto livre de
   * propósito (item 5): o catálogo está sujo e a limpeza dele é frente futura do diretor, então uma
   * validação contra a lista barraria a escala nova que ainda não foi cadastrada.
   */
  @IsOptional()
  @IsString()
  horarioEscala?: string;

  @IsOptional()
  @IsIn(VAGA_MODELO_TRABALHO as unknown as string[])
  modeloTrabalho?: VagaModeloTrabalho;

  /** Lista fechada (item 6), com "Outro" abrindo texto. O texto do escape cabe nos mesmos 200. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  detalheHibrido?: string;

  @IsOptional()
  @IsBoolean()
  confidencial?: boolean;

  @IsOptional()
  @IsBoolean()
  divulgarEmpresa?: boolean;

  // ── PASSO 5, requisitos ───────────────────────────────────────────────────
  @IsOptional()
  @IsIn(VAGA_ESCOLARIDADE as unknown as string[])
  escolaridade?: VagaEscolaridade;

  /**
   * FAIXA ETÁRIA: uma opção da lista OU o que a pessoa escreveu em "Outra". Uma coluna só, e não
   * uma para a opção e outra para o escape: a vaga responde UMA faixa, e ao reabrir a tela sabe de
   * onde o texto veio comparando com a lista (`separarOpcaoEscape`, no shared-types).
   */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  faixaEtaria?: string;

  @IsOptional()
  @IsIn(VAGA_GENERO as unknown as string[])
  genero?: VagaGenero;

  /** Lista FECHADA, seleção múltipla (item 6). O que não estiver nela é rejeitado, não gravado. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VAGA_IDIOMAS as unknown as string[], { each: true })
  idiomas?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idiomasOutros?: string;

  /** SEGUE TEXTO ABERTO, por decisão do diretor. Não virou lista e não deve virar sem pedido. */
  @IsOptional()
  @IsString()
  cursosConhecimentos?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VAGA_TESTES as unknown as string[], { each: true })
  testes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  testesOutro?: string;

  @IsOptional()
  @IsString()
  experiencia?: string;

  @IsOptional()
  @IsString()
  atribuicoes?: string;

  @IsOptional()
  @IsString()
  perfilComportamental?: string;

  @IsOptional()
  @IsString()
  ambiente?: string;

  /** Lista FECHADA, seleção múltipla (item 6). A ordem que chega é a ordem em que fica gravada. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(VAGA_ETAPAS_PS as unknown as string[], { each: true })
  etapasPs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(160)
  etapasPsOutra?: string;

  @IsOptional()
  @IsString()
  observacoes?: string;
}

/**
 * DTO DA EDIÇÃO DOS DOIS CONTADORES (decisão do diretor, 25/08: "continuam editáveis depois").
 *
 * CORPO PRÓPRIO, MINÚSCULO, E NÃO O `CreateVagaDto`: a vaga publicada NÃO volta para a trilha de
 * abertura (decisão anterior, preservada), então reaproveitar o corpo da trilha aqui abriria a vaga
 * inteira para edição livre de tabela, que é outra decisão e ninguém pediu (§A.14/§A.26). Este corpo
 * escreve DUAS colunas e mais nenhuma.
 *
 * OS DOIS SÃO OBRIGATÓRIOS porque a edição é do PAR: mandar só um deles deixaria a tela decidir em
 * silêncio se o outro foi zerado ou preservado, e é exatamente esse tipo de silêncio que faz o
 * contador mentir depois.
 */
export class EditarPosicoesVagaDto {
  @IsInt()
  @Min(1)
  posicoesOficiais!: number;

  @IsInt()
  @Min(0)
  posicoesBanco!: number;
}

/**
 * DTO do FECHAMENTO (frente 4). Momento diferente da abertura, então DTO diferente: aqui não se
 * edita nada da vaga, só se registra como ela terminou.
 */
export class FecharVagaDto {
  @IsISO8601()
  dataFechamento!: string;

  /**
   * UMA CONTAGEM PARA CADA META (os dois contadores, 25/08): `vagasFechadas` são as posições
   * OFICIAIS preenchidas, `vagasFechadasBanco` são as de banco. A trava "não passa das posições" é
   * do service, que conhece as metas da vaga, e confere os dois lados SEPARADAMENTE.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  vagasFechadas?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vagasFechadasBanco?: number;

  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "Salário de fechamento inválido. Informe um valor como 2500 ou 2.500,00 (ponto separa o milhar, vírgula os centavos).",
  })
  salarioFechamento?: string;

  @IsOptional()
  @IsISO8601()
  dataPrevistaInicio?: string;

  /**
   * A segunda opção do fechamento: "finalizar o processo seletivo e enviar para admissão". Hoje ela
   * REGISTRA A INTENÇÃO e nada mais. A ponte com a esteira é frente separada (última etapa do
   * planejamento), e por isso o campo existe agora: no dia da ponte, saber quais vagas pediram
   * passagem já estará gravado.
   */
  @IsOptional()
  @IsBoolean()
  enviarParaAdmissao?: boolean;
}
