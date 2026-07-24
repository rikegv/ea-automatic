import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { normalizarSalarioParaDto } from "./valor-monetario-br";

/**
 * Mensagens de validação em LINGUAGEM DE GENTE (ajuste do diretor).
 *
 * Sem `message`, o class-validator devolve o texto cru dele ("dataAdmissao must be a valid ISO 8601
 * date string"), que vaza nome de campo e jargão para o consultor. Toda regra deste fluxo (o wizard
 * F6) diz o que fazer, não o que a biblioteca pensa.
 */
export const SEXO_VALORES = ["MASCULINO", "FEMININO"] as const;
export type SexoValor = (typeof SEXO_VALORES)[number];

/** Candidato do wizard (F6/F11). CPF e nome obrigatórios; o CPF é validado por dígitos no service (F3). */
export class CandidatoInputDto {
  @IsString()
  @MinLength(1)
  cpf!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  nome!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  // Data de nascimento (W7) — base do aviso de menor de idade.
  @IsOptional()
  @IsDateString(
    {},
    { message: "A data de nascimento informada é inválida. Confira e tente novamente." },
  )
  dataNascimento?: string;

  // Sexo (régua padrão): condiciona a exigência da Carteira de Reservista (só MASCULINO). Opcional
  // no contrato (candidatos antigos/integração podem não ter); o wizard passa a exigir no F6.
  @IsOptional()
  @IsIn(SEXO_VALORES as unknown as string[], { message: "Selecione um sexo válido." })
  sexo?: SexoValor;
}

/** Dados de vaga/folha (anexo 1:1) — opcionais por padrão (não bloqueiam — regra 5/F4). */
export class VagaFolhaInputDto {
  // Coluna `numeric` no banco. Era o ÚNICO numérico sem validação de formato: valor não-numérico
  // estourava 22P02 e, num lote, derrubava TODAS. Agora normaliza o pt-BR que o consultor digita
  // (ponto milhar, vírgula decimal, "R$", espaço) para a forma canônica "2500.00" e, se não sobrar
  // número, o `@Matches` barra com 400 claro ANTES do banco. Ver `valor-monetario-br`. A validação
  // é no BACKEND (autoridade): chamada direta à API também é barrada.
  @IsOptional()
  @Transform(({ value }) => normalizarSalarioParaDto(value))
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message:
      "Salário inválido. Informe um valor como 2500 ou 2.500,00 (ponto separa o milhar, vírgula os centavos).",
  })
  salario?: string;

  @IsOptional()
  @IsString()
  beneficios?: string;

  // texto livre (escala vem do catálogo — pode ser longa).
  @IsOptional()
  @IsString()
  escala?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  centroCusto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  departamento?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  gestorBp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  motivo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tempoContrato?: string;

  // Endereço da folha (decisão de diretor — §A.3): pré-preenchido pelo enderecoPadrao do cliente
  // no wizard, editável por admissão. Texto livre (sem MaxLength).
  @IsOptional()
  @IsString()
  endereco?: string;

  // Substituição (W2): nome + CPF da pessoa substituída (obrigatórios quando motivo = "Substituição").
  @IsOptional()
  @IsString()
  @MaxLength(200)
  substituidoNome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  substituidoCpf?: string;
}

/**
 * Um benefício ALOCADO à admissão (§A.17 etapa 4). Substitui, para admissões novas, a string
 * achatada de `vagaFolha.beneficios`. `valor` é opcional: nem todo benefício tem valor (ex.:
 * "Seguro de vida" é só concedido/não concedido, enquanto VR e VA têm valor).
 */
export class BeneficioAlocadoDto {
  @IsUUID(undefined, { message: "Benefício inválido. Selecione um benefício da lista." })
  beneficioId!: string;

  // Aceita "500,00" e "500.00" (o front é pt-BR). Zero é válido.
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string" ? Number(value.replace(/\./g, "").replace(",", ".")) : value,
  )
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: "Valor do benefício inválido. Use o formato 500,00." },
  )
  @Min(0, { message: "O valor do benefício não pode ser negativo." })
  valor?: number;
}

export class CreateAdmissaoDto {
  /**
   * Pacote de benefícios ESTRUTURADO (§A.17 etapa 4). Admissão nova grava AQUI, e não mais na
   * string `vagaFolha.beneficios` (que segue existindo só para as 2.066 importadas, não migradas).
   * Teto defensivo: o catálogo tem 10 itens; 30 cobre qualquer crescimento sem virar payload aberto.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => BeneficioAlocadoDto)
  pacoteBeneficios?: BeneficioAlocadoDto[];

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;

  @IsUUID(undefined, { message: "Selecione um cargo válido." })
  cargoId!: string;

  @ValidateNested()
  @Type(() => CandidatoInputDto)
  candidato!: CandidatoInputDto;

  @IsOptional()
  @IsDateString(
    {},
    { message: "A data de admissão informada é inválida. Confira e tente novamente." },
  )
  dataAdmissao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tipoContrato?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => VagaFolhaInputDto)
  vagaFolha?: VagaFolhaInputDto;

  // W6 — aceite explícito ao criar com campos obrigatórios pendentes (F4: marca, não impede).
  @IsOptional()
  @IsBoolean({ message: "Aceite das pendências inválido." })
  aceitePendencias?: boolean;
}
