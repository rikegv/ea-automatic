import { IsIn, IsOptional, IsString } from "class-validator";
import {
  CAMPOS_DE_DIVERGENCIA,
  ESCOPOS_DE_DIVERGENCIA,
  type CampoDeDivergencia,
  type EscopoDeDivergencia,
} from "@ea/shared-types";

/**
 * ─ O CORPO E OS FILTROS DA FILA DE DIVERGENCIAS DA INGESTAO ────────────────────────────────────
 *
 * §A.28: TODO FILTRO É MÚLTIPLO. A multiplicidade é quebrada na controller, com o MESMO `parseMulti`
 * que a Esteira e o painel do Portal usam, e a cláusula vira `in (...)` no serviço. Filtro que a tela
 * oferece e a consulta ignora é pior que filtro nenhum, porque ele mente.
 *
 * AS DUAS LISTAS VÊM DO CONTRATO (`@ea/shared-types`) e não são redigitadas: o `@IsIn` sobre uma
 * cópia aceitaria um campo que o banco recusa (e devolveria 500 do driver em vez de 400) ou recusaria
 * um campo novo que o contrato já conhece.
 *
 * §A.6: nenhum filtro aqui é por dado pessoal. Não há busca por nome, CPF, e-mail nem telefone: a
 * fila se filtra por escopo, por campo e por estado de resolução.
 */
export class FiltroDeDivergenciasDto {
  /** `CANDIDATURA` e/ou `VAGA`, separados por vírgula. Ausente é "todos". */
  @IsOptional()
  @IsString()
  escopo?: string;

  /** Um ou mais de `CAMPOS_DE_DIVERGENCIA`, separados por vírgula. Ausente é "todos". */
  @IsOptional()
  @IsString()
  campo?: string;

  /**
   * O NOME DO CLIENTE, e não um id: `DivergenciaDaIngestaoItem` não carrega `clienteId`, então é o
   * nome que a célula mostra e é por ele que a tela filtra. O catálogo dos valores vem do endpoint
   * `/opcoes` (§A.37), nunca das linhas carregadas.
   */
  @IsOptional()
  @IsString()
  cliente?: string;

  /** Um ou mais ids de vaga, separados por vírgula. Catálogo em `/opcoes`, como o do cliente. */
  @IsOptional()
  @IsString()
  vaga?: string;

  /**
   * O RECORTE PADRÃO É `ABERTAS`, e o default é a fila: quem abre a tela quer o que tem de resolver.
   * `RESOLVIDAS` e `TODAS` existem para a conferência do que já foi decidido, que é o histórico.
   */
  @IsOptional()
  @IsIn(["ABERTAS", "RESOLVIDAS", "TODAS"])
  estado?: "ABERTAS" | "RESOLVIDAS" | "TODAS";
}

/** Os filtros já quebrados pela controller, do jeito que o serviço os consome. */
export interface FiltroDeDivergencias {
  escopo?: EscopoDeDivergencia[];
  campo?: CampoDeDivergencia[];
  /** NOMES de cliente (ver o DTO): é o que a linha carrega e o que o catálogo de `/opcoes` devolve. */
  cliente?: string[];
  /** IDs de vaga. */
  vaga?: string[];
  estado: "ABERTAS" | "RESOLVIDAS" | "TODAS";
}

/*
 * ─ O ENVELOPE, OS KPIS E AS OPCOES DE FILTRO VIVEM NO CONTRATO, E NAO MAIS AQUI ────────────────
 *
 * `KpisDeDivergencias`, `DivergenciasDaIngestaoPagina` e `OpcoesDeFiltroDeDivergencias` nasceram
 * neste arquivo e o COORDENADOR os levantou para `@ea/shared-types` (§A.39: aquele arquivo tem dono
 * único). A definição local foi REMOVIDA em vez de mantida em paralelo: duas definições do mesmo
 * envelope concordam até a primeira vez que alguém corrige uma só, e o lado que ficasse desatualizado
 * seria justamente o que a tela consome.
 */

/** As duas listas, prontas para a controller validar o que chegou. */
export const ESCOPOS_VALIDOS: readonly string[] = ESCOPOS_DE_DIVERGENCIA;
export const CAMPOS_VALIDOS: readonly string[] = CAMPOS_DE_DIVERGENCIA;
