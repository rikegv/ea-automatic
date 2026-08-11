import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * DTOs do cadastro de ALTO VOLUME (onda 1): projeto, grupos de entrada e vagas por cargo.
 *
 * As três entidades têm DTOs separados porque são cadastradas em momentos diferentes. O projeto
 * nasce primeiro, com o que se sabe no dia zero (cliente, nome, período); grupos e vagas entram
 * depois, conforme o projeto anda, que é o requisito do diretor ("poder acrescentar campos/vagas
 * conforme o projeto anda"). Um DTO só, com tudo aninhado, obrigaria a reenviar o projeto inteiro
 * para acrescentar uma linha de vaga.
 */

export class CreateProjetoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  codCliente!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  /**
   * O período NÃO é opcional, e é a única obrigatoriedade dura do cadastro. Termômetro de dias
   * restantes e sugestão de projeto na liberação saem daqui; projeto sem período seria projeto que
   * não sabe quando acaba.
   */
  @IsDateString({}, { message: "Data de início inválida (use AAAA-MM-DD)." })
  dataInicio!: string;

  @IsDateString({}, { message: "Data de fim inválida (use AAAA-MM-DD)." })
  dataFim!: string;
}

export class UpdateProjetoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsDateString({}, { message: "Data de início inválida (use AAAA-MM-DD)." })
  dataInicio?: string;

  @IsOptional()
  @IsDateString({}, { message: "Data de fim inválida (use AAAA-MM-DD)." })
  dataFim?: string;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;
}

/**
 * O CLIENTE NÃO É EDITÁVEL depois de criado, por isso não está no `UpdateProjetoDto`.
 *
 * Trocar o cliente de um projeto que já tem admissões vinculadas transformaria as vagas de um
 * cliente nas vagas de outro, sem tocar em uma única admissão: o preenchimento passaria a medir
 * gente do cliente errado. Projeto criado no cliente errado se inativa e se cria de novo, que é o
 * mesmo caminho que o sistema já usa em todo cadastro com histórico.
 */

export class CreateGrupoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  rotulo!: string;

  @IsDateString({}, { message: "Data de entrada inválida (use AAAA-MM-DD)." })
  dataEntrada!: string;
}

export class UpdateGrupoDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  rotulo?: string;

  @IsOptional()
  @IsDateString({}, { message: "Data de entrada inválida (use AAAA-MM-DD)." })
  dataEntrada?: string;
}

export class CreateVagaDto {
  @IsUUID()
  cargoId!: string;

  /**
   * `grupoId` ausente = cota do PROJETO INTEIRO; preenchido = cota daquele grupo de entrada. Os dois
   * modos convivem de propósito (ver o comentário de `projeto_vaga_cargo` no schema).
   */
  @IsOptional()
  @IsUUID()
  grupoId?: string;

  /**
   * Teto de 10.000 por linha: não é regra de negócio, é barreira contra dígito repetido sem querer.
   * O maior projeto real do Grupo Soulan não chega perto disso, e uma meta de 200.000 vagas
   * quebraria a escala de todo cilindro da tela sem ninguém entender por quê.
   */
  @IsInt({ message: "A quantidade de vagas deve ser um número inteiro." })
  @Min(1, { message: "A quantidade de vagas deve ser pelo menos 1." })
  @Max(10000, { message: "Quantidade de vagas acima do limite (10.000 por linha)." })
  quantidade!: number;
}

export class UpdateVagaDto {
  @IsInt({ message: "A quantidade de vagas deve ser um número inteiro." })
  @Min(1, { message: "A quantidade de vagas deve ser pelo menos 1." })
  @Max(10000, { message: "Quantidade de vagas acima do limite (10.000 por linha)." })
  quantidade!: number;
}

// ── Vínculos por correção (onda 3) ──────────────────────────────────────────

/**
 * VINCULAR uma admissão ao projeto depois do fato (origem `CORRECAO`).
 *
 * Só o id da admissão e, opcionalmente, o grupo de entrada. Nada mais entra aqui de propósito: o
 * projeto vem da rota e o cliente vem do projeto, então não há como o corpo da requisição contradizer
 * a tela. Nenhum dado pessoal trafega (§A.6), só ids.
 */
export class VincularAdmissaoDto {
  @IsUUID()
  admissaoId!: string;

  /** Ausente = cota do projeto inteiro, que é o modo padrão do vínculo. */
  @IsOptional()
  @IsUUID()
  grupoId?: string;
}

/**
 * ADICIONAR VÁRIAS admissões de uma vez (a seleção múltipla da tela).
 *
 * O teto de 500 por chamada não é regra de negócio, é barreira: a maior leva real do Grupo Soulan
 * não chega perto disso, e um pedido com milhares de ids seria erro de tela, não intenção.
 */
export class VincularEmLoteDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Selecione pelo menos uma admissão." })
  @ArrayMaxSize(500, { message: "Selecione no máximo 500 admissões por vez." })
  @IsUUID(undefined, { each: true })
  admissaoIds!: string[];

  @IsOptional()
  @IsUUID()
  grupoId?: string;
}

/**
 * TROCAR o projeto e/ou o grupo de um vínculo existente.
 *
 * `grupoId` aceita `null` DE PROPÓSITO, e é o que separa "não mexe no grupo" (campo ausente) de
 * "tira do grupo" (`null` explícito). `@IsOptional` pula a validação nos dois casos, e o serviço
 * distingue um do outro por `undefined`. Sem isso, um grupo escolhido por engano não teria desfazer.
 */
export class AtualizarVinculoDto {
  @IsOptional()
  @IsUUID()
  projetoId?: string;

  @IsOptional()
  @IsUUID()
  grupoId?: string | null;
}
