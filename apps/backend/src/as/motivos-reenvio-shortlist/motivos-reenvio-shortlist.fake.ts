import type { AsMotivoReenvioShortlist } from "@ea/shared-types";
import { motivosReenvioShortlist } from "../../db/schema";

/**
 * ─ O CATÁLOGO DE REENVIO PARA OS BANCOS FINGIDOS DAS SPECS ─────────────────────────────────────
 *
 * MOLDE `motivos-descarte.fake.ts`, e existe pela mesma razão: o envio de shortlist passou a
 * conferir o `motivoReenvioId` contra `motivos_reenvio_shortlist`, e os dublês das specs da
 * shortlist não conhecem a tabela nova. Consertar arquivo a arquivo faria três cópias da mesma
 * lista, que divergiriam no primeiro motivo que o diretor acrescentar.
 *
 * A LISTA É A SEMENTE DA MIGRATION 0132, e é a única razão de ela estar escrita duas vezes no
 * repositório. Um teste que passasse com um catálogo INVENTADO provaria que a conferência existe e
 * não provaria que ela confere contra o que está no banco de verdade.
 *
 * §A.6: nomes de motivo e ids técnicos. Nenhum dado pessoal.
 */
export const MOTIVOS_REENVIO_SEMEADOS = [
  "Ampliação Do Número De Posições",
  "Candidato Desistiu",
  "Candidato Sem Retorno",
  "Cliente Pediu Mais Nomes",
  "Cliente Pediu Outro Perfil",
  "Cliente Recusou Os Candidatos",
  "Correção Da Lista Enviada",
] as const;

/** Um motivo QUE ESTÁ no catálogo ativo, para as specs não redigitarem um id literal cada uma. */
export const MOTIVO_DE_REENVIO_VALIDO = "mr-5";

/** Um id que NÃO está no catálogo: é o uuid qualquer que a rota passou a recusar. */
export const MOTIVO_DE_REENVIO_FORA_DO_CATALOGO = "mr-inexistente";

/**
 * UM MOTIVO INATIVO, e ele é o caso que a FK sozinha NÃO pega: a chave estrangeira aceita qualquer
 * linha existente, inclusive a que o diretor tirou de circulação. Quem recusa é a conferência
 * contra a lista ATIVA, e é para medir isso que esta linha existe.
 */
export const MOTIVO_DE_REENVIO_INATIVO = "mr-inativo";

export function catalogoDeReenvioFingido(): AsMotivoReenvioShortlist[] {
  return [
    ...MOTIVOS_REENVIO_SEMEADOS.map((nome, i) => ({ id: `mr-${i + 1}`, nome, ativo: true })),
    { id: MOTIVO_DE_REENVIO_INATIVO, nome: "Motivo Fora De Circulação", ativo: false },
  ];
}

/** O nome que a leitura deve devolver para `MOTIVO_DE_REENVIO_VALIDO`, sem redigitar a string. */
export const NOME_DO_MOTIVO_DE_REENVIO_VALIDO = catalogoDeReenvioFingido().find(
  (m) => m.id === MOTIVO_DE_REENVIO_VALIDO,
)!.nome;

/**
 * A RESPOSTA DO CATÁLOGO quando a consulta é a dele, e `null` quando não é. SÓ OS ATIVOS, porque é
 * exatamente o recorte que `motivosDeReenvioAtivos` faz no banco de verdade.
 *
 * A TABELA É O CRITÉRIO, e não a forma da consulta: é o objeto que o `from()` recebeu, comparado por
 * identidade com o schema de verdade. Reconhecer por nome de coluna ou por formato de cláusula
 * tornaria o fake sensível a qualquer refatoração da consulta real.
 */
export function respostaDoCatalogoDeReenvio(
  tabela: unknown,
): AsMotivoReenvioShortlist[] | null {
  return tabela === motivosReenvioShortlist
    ? catalogoDeReenvioFingido().filter((m) => m.ativo)
    : null;
}
