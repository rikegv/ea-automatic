import type { Artigo } from "../../tipos";

/*
 * FICHA DE CATÁLOGO: os Motivos De Descarte Do Candidato.
 *
 * O QUE ELA COBRE: o que este catálogo GOVERNA (a lista obrigatória da saída do candidato do funil)
 * e o fato que muda a tela de quem descarta, a MARCA de pretensão salarial que uma linha pode
 * carregar. É o dado mais importante da ficha: com a marca, a tela do descarte passa a pedir um
 * campo a mais, e o motivo deixa de ser oferecido no descarte em massa.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A MECÂNICA dos catálogos, que está em `manter-um-catalogo-do-sistema`.
 *   . O DESCARTE em si e o descarte em massa, que são de outra frente e têm peça própria.
 *   . REORDENAR E EXCLUIR: esta tela não tem nem um nem outro.
 *
 * NENHUM VALOR DO CATÁLOGO É CITADO, inclusive o motivo que carrega a marca: a lista é gerenciável
 * e a marca mora na LINHA, nunca no nome. Citar um nome faria o manual ensinar uma regra que para de
 * valer na primeira correção de grafia.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-motivos-de-descarte",
  titulo: "O Catálogo De Motivos De Descarte",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/motivos-descarte"],
  menus: ["as-motivos-descarte"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "O que o catálogo de motivos de descarte governa: a lista obrigatória da saída do candidato do funil, e a marca que faz um motivo pedir a pretensão salarial na hora do descarte.",
  termos: [
    "motivo de descarte",
    "por que o candidato saiu",
    "descartar candidato",
    "criar motivo de descarte",
    "motivo nao aparece no descarte",
    "pretensao salarial",
    "motivo sumiu do descarte em massa",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Motivos De Descarte Do Candidato pelo Menu Gerencial e leia a lista pela coluna Motivo.",
      detalhe: "A coluna Status diz quais motivos ainda são oferecidos na saída do candidato.",
      controles: ["Motivo", "Status"],
    },
    {
      gesto: "Para acrescentar um motivo, digite o nome no campo do topo e clique em Acrescentar motivo.",
      detalhe: "Ele nasce ativo e passa a aparecer no seletor do descarte do candidato.",
      controles: ["Nome do motivo novo *", "Acrescentar motivo"],
    },
    {
      gesto: "Para corrigir uma grafia, clique em Renomear na linha e salve em Salvar nome.",
      detalhe:
        "A correção vale do momento em diante. As candidaturas encerradas antes dela continuam com o texto que foi gravado nelas.",
      controles: ["Renomear", "Novo nome do motivo *", "Salvar nome", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela do descarte pediu a pretensão salarial e eu não esperava por isso.",
      acao: "O motivo escolhido é um dos que pedem o valor. Se não for o caso da pessoa, escolha outro motivo: nos demais, o campo nem aparece.",
    },
    {
      sintoma: "Um motivo que existe aqui não aparece quando eu descarto vários candidatos de uma vez.",
      acao: "Motivos que pedem a pretensão salarial ficam fora do descarte em massa, de propósito: o valor é de uma pessoa só, e perguntado uma vez para trinta gravaria um número errado em vinte e nove.",
    },
    {
      sintoma: "Renomeei um motivo e as candidaturas encerradas antes continuam com o nome antigo.",
      acao: "É o comportamento correto: o que fica gravado na candidatura é o texto do motivo, e não a linha do catálogo.",
    },
  ],
  regras: [
    "Descartar um candidato exige um motivo desta lista, e o texto digitado à mão não é aceito. Sem nenhum motivo ativo, nenhum candidato pode ser descartado.",
    "Um motivo pode carregar a marca de pedir a pretensão salarial. Quando ele é o escolhido, a tela do descarte passa a exigir o valor que a pessoa pediu; nos demais, o campo nem é mostrado, e nenhum valor é coletado.",
    "Motivo com essa marca não é oferecido no descarte em massa, porque a pretensão é de cada pessoa. Tirar a marca depois não apaga nada do que já foi coletado.",
    "Quem decide se um motivo pede o valor é a marca da linha, nunca o nome dela: renomear o motivo não liga nem desliga a exigência.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "o-catalogo-de-motivos-de-cancelamento",
    "o-catalogo-de-motivos-de-reenvio",
    "registrar-a-saida-do-candidato",
    "agir-em-massa-no-funil-da-vaga",
    "trazer-o-candidato-de-volta",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/motivos-descarte/page.tsx",
    "apps/backend/src/as/motivos-descarte/motivos-descarte.service.ts",
    "apps/backend/src/as/motivos-descarte/motivos-descarte.dto.ts",
  ],
  revisadoEm: "2026-09-30",
};
