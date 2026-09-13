import type { AsValorHerdado } from "@ea/shared-types";
import type { VagaItemOndaC } from "./vaga-item-onda-c";

/**
 * ─ O ITEM DA LISTAGEM DE VAGAS, COM O SEGMENTO E O COMERCIAL DA ONDA E ─────────────────────────
 *
 * ┌─ PONTE TEMPORÁRIA, ATÉ O CONTRATO COMPARTILHADO GANHAR OS CAMPOS ────────────────────────────┐
 * │ `VagaListItem` mora em `packages/shared-types`, e o DONO daquele arquivo nesta frente é o    │
 * │ COORDENADOR (§A.39: arquivo compartilhado tem UM dono por frente, porque dois agentes        │
 * │ escrevendo nele se sobrescrevem em silêncio e o segundo apaga o primeiro sem nada falhar).   │
 * │                                                                                               │
 * │ O TIPO `AsValorHerdado` **JÁ FOI ESCRITO PELO DONO**, e é ele que viaja aqui. O que falta é  │
 * │ só a DECLARAÇÃO dos quatro campos dentro de `VagaListItem`; no instante em que ela existir,  │
 * │ este arquivo SAI INTEIRO e a assinatura volta a ser `VagaListItem`, sem nenhuma outra         │
 * │ mudança. É o mesmo recurso, com a mesma justificativa, de `vaga-item-onda-c.ts`, que estende │
 * │ pela mesma razão e que este tipo estende por sua vez (a Onda C ainda não foi absorvida).     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE OS DOIS ID CRUS VIAJAM AO LADO DO VALOR RESOLVIDO ──────────────────────────────────┐
 * │ `segmento` e `comercial` respondem "o que ESTA vaga vale hoje", com a origem junto, e é isso │
 * │ que a TELA mostra. `segmentoId` e `comercialId` são a SOBREPOSIÇÃO CRUA, e é isso que o      │
 * │ FORMULÁRIO precisa para pré-selecionar: um formulário que lesse o valor resolvido marcaria o │
 * │ seletor com o valor HERDADO, e salvar sem tocar no campo transformaria uma herança viva numa │
 * │ sobreposição congelada, sem ninguém ter pedido. Os dois pares são coisas diferentes e por    │
 * │ isso viajam separados.                                                                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export type VagaItemOndaE = VagaItemOndaC & {
  /**
   * A SOBREPOSIÇÃO CRUA. `null` significa HERDAR do cliente, nunca "sem segmento".
   *
   * O NOME CARREGA "SOBREPOSTO" DE PROPÓSITO (achado do `tester`): chamá-lo de `segmentoId` poria,
   * ao lado do valor resolvido, o campo de nome mais óbvio com o conteúdo errado, e o filtro escrito
   * contra ele perderia todas as vagas que herdam, sem erro nenhum. Quem quer a sobreposição pede
   * pela sobreposição; quem quer o valor da vaga lê `segmento`/`comercial`.
   */
  segmentoSobrepostoId: number | null;
  comercialSobrepostoId: number | null;
  /** O valor EFETIVO da vaga, já resolvido por `coalesce(vaga.x, cliente.x)`, com a origem junto. */
  segmento: AsValorHerdado;
  comercial: AsValorHerdado;
};
