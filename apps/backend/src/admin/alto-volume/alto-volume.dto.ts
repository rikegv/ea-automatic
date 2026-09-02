import { Type } from "class-transformer";
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
  ValidateNested,
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
   * `lojaId` preenchido = esta linha é a COTA daquela loja (meta por loja). Ausente = a meta vale
   * para o cargo no projeto inteiro, como sempre foi.
   *
   * Um cargo usa UM nível por vez (decisões 1 e 2 do diretor): quem garante é
   * `conflitoDeDetalhamento` no serviço, porque a regra é entre linhas e nenhum `check` a expressa.
   */
  @IsOptional()
  @IsUUID()
  lojaId?: string;

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
/**
 * REMOVER VÁRIAS linhas de vagas de uma vez (peça 3 do pacote de usabilidade).
 *
 * O teto de 200 é o mesmo raciocínio do lote de vínculos: um projeto real não tem duzentos cargos, e
 * um número maior que isso é engano de tela, não uso.
 */
export class RemoverVagasEmLoteDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Selecione pelo menos uma linha de vagas." })
  @ArrayMaxSize(200, { message: "Selecione no máximo 200 linhas por vez." })
  @IsUUID(undefined, { each: true })
  vagaIds!: string[];
}

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
 * TROCAR VÁRIOS vínculos de projeto de uma vez.
 *
 * `projetoDestinoId` é OBRIGATÓRIO aqui, ao contrário da troca individual: em massa a ação existe
 * para MOVER a leva, e um lote sem destino seria um lote que não faz nada. O grupo continua
 * opcional, e sem ele os vínculos caem na cota do projeto inteiro do destino, que é o mesmo
 * comportamento da troca individual quando o projeto muda.
 */
export class TrocarVinculosEmLoteDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Selecione pelo menos uma admissão." })
  @ArrayMaxSize(500, { message: "Selecione no máximo 500 admissões por vez." })
  @IsUUID(undefined, { each: true })
  vinculoIds!: string[];

  @IsUUID()
  projetoDestinoId!: string;

  @IsOptional()
  @IsUUID()
  grupoId?: string;
}

/** DESVINCULAR vários de uma vez: tira do projeto, não toca na admissão. */
export class DesvincularEmLoteDto {
  @IsArray()
  @ArrayNotEmpty({ message: "Selecione pelo menos uma admissão." })
  @ArrayMaxSize(500, { message: "Selecione no máximo 500 admissões por vez." })
  @IsUUID(undefined, { each: true })
  vinculoIds!: string[];
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

/**
 * DETALHAR UM CARGO POR LOJA: a distribuição inteira de uma vez.
 *
 * Vai tudo junto, e não uma cota por chamada, porque a operação é "distribuir 10 vagas entre 3
 * lojas", não "criar uma cota". Mandar de uma vez é o que permite ao serviço SUBSTITUIR a meta antiga
 * numa transação: cotas parciais deixariam o cargo com dois níveis no meio do caminho.
 *
 * Lista VAZIA desfaz o detalhamento e devolve o cargo ao estado de meta única.
 */
export class CotaLojaDto {
  @IsUUID()
  lojaId!: string;

  /**
   * ZERO É VÁLIDO AQUI, e só aqui (decisão do diretor): a loja entra na distribuição com zero para
   * dizer "nesta não se contrata", e as outras cobrem o total. A linha de meta normal continua
   * exigindo pelo menos 1, porque lá zero seria uma meta que não existe.
   *
   * A cota de zero é conferida na soma e depois DESCARTADA na gravação: o `check quantidade > 0` do
   * banco a recusaria, e uma linha de zero não acrescenta nada ao quadro.
   */
  @IsInt({ message: "A quantidade de vagas deve ser um número inteiro." })
  @Min(0, { message: "A quantidade de vagas não pode ser negativa." })
  @Max(10000, { message: "Quantidade de vagas acima do limite (10.000 por linha)." })
  quantidade!: number;
}

export class DetalharPorLojaDto {
  @IsArray()
  @ArrayMaxSize(200, { message: "Máximo de 200 lojas por cargo." })
  @ValidateNested({ each: true })
  @Type(() => CotaLojaDto)
  cotas!: CotaLojaDto[];
}
