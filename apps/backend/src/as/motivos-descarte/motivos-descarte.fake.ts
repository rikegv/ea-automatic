import type { AsMotivoDescarte } from "@ea/shared-types";
import { motivosDescarte } from "../../db/schema";

/**
 * ─ O CATÁLOGO DE DESCARTE PARA OS BANCOS FINGIDOS DAS SPECS ────────────────────────────────────
 *
 * POR QUE ESTE ARQUIVO EXISTE, e por que ele não é conveniência: `registrarSaida` passou a conferir
 * o motivo do DESCARTE contra `motivos_descarte`, e os bancos fingidos das specs do funil não
 * conheciam a tabela nova. O sintoma foi imediato e correto (o catálogo vinha vazio, e todo descarte
 * era recusado), mas consertá-lo arquivo a arquivo faria CINCO cópias da mesma lista de seis nomes,
 * que divergiriam no primeiro motivo que o diretor acrescentar.
 *
 * A LISTA É A SEMENTE DA MIGRATION 0129, e é a única razão de ela estar escrita duas vezes no
 * repositório. Um teste que passasse com um catálogo INVENTADO ("motivo de teste") provaria que a
 * conferência existe e não provaria que ela confere contra o que está no banco de verdade.
 *
 * `respostaDoCatalogoDeDescarte` DEVOLVE `null` QUANDO A CONSULTA NÃO É DO CATÁLOGO, e é assim que
 * cada fake a usa sem mudar o resto do comportamento dele: `?? o que ele já devolvia`.
 *
 * §A.6: seis nomes de motivo e um flag. Nenhum dado pessoal.
 */
export const MOTIVOS_DESCARTE_SEMEADOS = [
  "Desistente",
  "Faltante",
  "Reprovado",
  "Sem Interesse",
  "Sem Perfil",
  "Stand By",
] as const;

/** Um motivo QUE ESTÁ no catálogo ativo, para as specs não redigitarem um nome literal cada uma. */
export const MOTIVO_DE_DESCARTE_VALIDO = "Reprovado";

/** Um motivo que NÃO está no catálogo: é o texto livre que a rota passou a recusar. */
export const MOTIVO_DE_DESCARTE_FORA_DO_CATALOGO = "achei que não ia dar certo";

/**
 * ─ O MOTIVO QUE PEDE A PRETENSÃO SALARIAL, PARA AS SPECS (Frente E, ponto 9) ────────────────────
 *
 * ELE NÃO ESTÁ NA SEMENTE DA MIGRATION, e a ausência é fiel ao produto: a 0131 cria a COLUNA
 * `pede_pretensao` e NÃO marca linha nenhuma, porque decidir qual motivo significa "pretensão
 * salarial" é escolha de vocabulário do DIRETOR (§A.31). Em produção a régua nasce inerte.
 *
 * O FAKE ACRESCENTA UMA LINHA MARCADA porque é a única forma de exercitar a régua sem inventar um
 * motivo no banco de verdade. O nome é deliberadamente o que o diretor provavelmente usará, e o
 * teste NÃO se apoia no nome em ponto nenhum: ele se apoia na MARCA, que é exatamente a propriedade
 * sob teste (nenhuma camada compara o nome do motivo com string).
 */
export const MOTIVO_QUE_PEDE_PRETENSAO = "Pretensão Salarial";

export function catalogoDeDescarteFingido(): AsMotivoDescarte[] {
  return [
    ...MOTIVOS_DESCARTE_SEMEADOS.map((nome, i) => ({
      id: `md-${i + 1}`,
      nome,
      ativo: true,
      pedePretensao: false,
    })),
    {
      id: "md-pretensao",
      nome: MOTIVO_QUE_PEDE_PRETENSAO,
      ativo: true,
      pedePretensao: true,
    },
  ];
}

/**
 * A RESPOSTA DO CATÁLOGO quando a consulta é a dele, e `null` quando não é.
 *
 * A TABELA É O CRITÉRIO, e não a forma da consulta: é o objeto que o `from()` recebeu, comparado por
 * identidade com o schema de verdade. Reconhecer por nome de coluna ou por formato de cláusula
 * tornaria o fake sensível a qualquer refatoração da consulta real.
 */
export function respostaDoCatalogoDeDescarte(tabela: unknown): AsMotivoDescarte[] | null {
  return tabela === motivosDescarte ? catalogoDeDescarteFingido() : null;
}
