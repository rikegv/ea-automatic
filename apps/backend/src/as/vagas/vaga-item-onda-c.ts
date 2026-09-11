import type { VagaListItem } from "@ea/shared-types";
import type { VagaIdiomaGravado } from "../../domain/vaga-idioma";

/**
 * ─ O ITEM DA LISTAGEM DE VAGAS, COM OS CAMPOS DA ONDA C ────────────────────────────────────────
 *
 * ┌─ PONTE TEMPORÁRIA, ATÉ O CONTRATO COMPARTILHADO GANHAR OS CAMPOS ────────────────────────────┐
 * │ `VagaListItem` mora em `packages/shared-types`, e o DONO daquele arquivo nesta frente é o    │
 * │ COORDENADOR (§A.39: arquivo compartilhado tem UM dono por frente, porque dois agentes        │
 * │ escrevendo nele se sobrescrevem em silêncio e o segundo apaga o primeiro sem nada falhar).   │
 * │                                                                                               │
 * │ O BACKEND JÁ DEVOLVE OS CINCO CAMPOS; o que falta é a DECLARAÇÃO. Este tipo existe para o    │
 * │ compilador não recusar a escrita de um campo que ainda não foi escrito no vocabulário comum, │
 * │ e SAI INTEIRO no instante em que ele for: a assinatura volta a ser `VagaListItem`, sem        │
 * │ nenhuma outra mudança. É o mesmo recurso, com a mesma justificativa, que                      │
 * │ `vagas.ocupacao-listagem.spec.ts` já usa para os dois mapas de KPI do funil.                   │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * `idiomas` (A LEGADA) CONTINUA NO TIPO E CONTINUA SENDO DEVOLVIDA, `string[]`, exatamente como
 * antes: é a coluna congelada, e a tela que ainda não trocou continua lendo o que sempre leu. Quem
 * carrega o nível é `idiomasExigidos`, ao lado.
 */
export type VagaItemOndaC = VagaListItem & {
  /** Do catálogo `as_linhas_servico`. `null` em vaga anterior à Onda C, e a tela diz "não informado". */
  linhaServicoId: number | null;
  /** O rótulo VIVO da linha, inclusive quando ela foi inativada: histórico não mostra código cru. */
  linhaServicoRotulo: string | null;
  /** Código do IBGE, de 7 dígitos. A UF continua em `regiaoEstado`, que NÃO saiu. */
  cidadeId: number | null;
  cidadeNome: string | null;
  /**
   * A UF DA CIDADE, ao lado de `regiaoEstado`, e as duas concordam por construção: a gravação deriva
   * a UF da cidade escolhida. Ela viaja junto para a tela conseguir montar "São Paulo, SP" sem
   * precisar casar dois campos de origens diferentes.
   */
  cidadeUf: string | null;
  /** O par idioma+nível. `nivel` nulo é "vaga anterior à Onda C", nunca "deixaram em branco". */
  idiomasExigidos: VagaIdiomaGravado[];
};
