import {
  IsBoolean,
  IsEmail,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

/** Catálogo de status: criar e editar (o diretor mantém a lista pelo Gerencial). */
export class SalaEsperaStatusDto {
  @IsString()
  @MinLength(2, { message: "Nome muito curto." })
  @MaxLength(160)
  nome!: string;

  /** Terminal: o registro com este status SAI da fila ativa. */
  @IsOptional()
  @IsBoolean()
  encerra?: boolean;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  @IsOptional()
  @IsInt()
  ordem?: number;
}

/** Registro da Sala de Espera. SEM CPF: o candidato ainda não se candidatou. */
export class SalaEsperaDto {
  @IsString()
  @MinLength(3, { message: "Informe o nome do candidato." })
  @MaxLength(200)
  nome!: string;

  @IsString()
  @MaxLength(40)
  codCliente!: string;

  @IsUUID("4", { message: "Cargo inválido." })
  cargoId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefone?: string;

  @IsDateString({}, { message: "Data de recebimento inválida (use AAAA-MM-DD)." })
  dataRecebimento!: string;

  @IsIn(["CLIENTE", "SELECAO"], { message: "Origem inválida (cliente ou seleção)." })
  origem!: "CLIENTE" | "SELECAO";

  @IsUUID("4", { message: "Status inválido." })
  statusId!: string;

  /**
   * CPF, nascimento e e-mail: OPCIONAIS (decisão do diretor). Nenhum trava o cadastro.
   *
   * O CPF, quando informado, é VALIDADO no dígito: um CPF errado aqui é pior que CPF ausente, porque
   * o match da onda 3 casaria pela identidade errada. Aceita com ou sem máscara; o serviço normaliza.
   */
  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @IsOptional()
  @IsDateString({}, { message: "Data de nascimento inválida (use AAAA-MM-DD)." })
  dataNascimento?: string;

  @IsOptional()
  @IsEmail({}, { message: "E-mail inválido." })
  @MaxLength(180)
  email?: string;
}
