import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { AREA, PAPEL, PAPEL_AS, type Area, type Papel, type PapelAs } from "@ea/shared-types";

// Papéis atribuíveis pela administração de usuários (todos os do RBAC, §A.3).
const PAPEIS = PAPEL as unknown as string[];
// Áreas atribuíveis (segmentação do módulo de A&S).
const AREAS = AREA as unknown as string[];
// PAPEL DE A&S: o lado da vaga que a pessoa ocupa. Nada a ver com o RBAC acima.
const PAPEIS_AS = PAPEL_AS as unknown as string[];

export class CriarUsuarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome!: string;

  @IsEmail()
  @MaxLength(180)
  email!: string;

  @IsIn(PAPEIS)
  papel!: Papel;

  /**
   * ÁREAS do novo usuário. OBRIGATÓRIO e com pelo menos uma, porque ninguém pode nascer sem área: o
   * sistema é fail-closed, e um usuário sem área entraria numa tela em branco sem entender por quê.
   *
   * LISTA porque o modelo suporta HÍBRIDO desde o primeiro dia (requisito do diretor), mesmo que hoje
   * cada pessoa seja cadastrada com uma área só.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(AREAS, { each: true })
  areas!: Area[];

  /**
   * PAPEL DE A&S (Consultor ou Recruiter), OPCIONAL, e essa é a diferença que mais importa em relação
   * à área logo acima: ninguém pode nascer sem área, e quase todo mundo nasce sem papel de A&S,
   * porque só quem trabalha na frente de vagas ocupa um lado. Ausente é o estado normal.
   */
  @IsOptional()
  @IsIn(PAPEIS_AS)
  papelAs?: PapelAs;
}

export class AtualizarUsuarioDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nome?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsIn(PAPEIS)
  papel?: Papel;

  @IsOptional()
  @IsBoolean()
  ativo?: boolean;

  /**
   * PAPEL DE A&S. `null` LIMPA o papel (a pessoa saiu da frente de vagas), e é por isso que o
   * `@IsOptional` importa aqui: ele deixa o `null` passar sem cair no `@IsIn`, enquanto AUSENTE
   * continua significando "não mexa neste campo". Ausente preserva, null limpa, valor troca.
   */
  @IsOptional()
  @IsIn(PAPEIS_AS)
  papelAs?: PapelAs | null;
}

/** Conjunto de menus marcados para um usuário (OST permissão de menu). Códigos inválidos são
 * ignorados no serviço; aqui só validamos o formato. */
export class DefinirMenusDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  menus!: string[];

  /**
   * O CATÁLOGO QUE A TELA EXIBIU, ou seja, o escopo do que ela tem autoridade para remover. Menu que
   * não estiver aqui é PRESERVADO, mesmo não vindo em `menus`.
   *
   * Na FORMA é opcional; quem exige é a controller, com UMA mensagem clara. A obrigatoriedade aqui
   * dispararia a cascata inteira do class-validator ("must be an array", "each value...") e o
   * consultor leria cinco frases técnicas em vez de "recarregue a página".
   *
   * Ele é a correção do defeito: enquanto dava para salvar sem declarar o escopo, uma página aberta
   * antes de um menu novo nascer apagava esse menu em silêncio. Aconteceu com o `assinaturas` e
   * depois com o `assinante-empresa`.
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  conhecidos?: string[];

  /**
   * ÁREAS do usuário, salvas no MESMO envio da marcação de menu porque é a área que RECORTA os menus:
   * mandá-las em requisições separadas deixaria uma janela em que a marcação é avaliada contra a área
   * errada, e o resultado dependeria da ordem de chegada.
   *
   * OPCIONAL na forma: uma tela antiga, que ainda não conhece o campo, continua salvando só os menus e
   * as áreas ficam como estão. É o mesmo cuidado do `conhecidos`, que nasceu de a tela desatualizada
   * apagar em silêncio o que não conhecia.
   *
   * VAZIO É DIFERENTE DE AUSENTE, e a diferença é intencional: ausente preserva, vazio é o diretor
   * dizendo "este usuário fica sem área" (fail-closed, ele passa a ver só o Início).
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(AREAS, { each: true })
  areas?: Area[];
}
