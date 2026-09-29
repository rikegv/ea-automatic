/**
 * ROTEIRO DE CAPTURA: "Buscar Dentro Da Tela".
 *
 * ┌─ POR QUE O LOCALIZADOR AQUI É SELETOR, E NÃO PAPEL MAIS NOME ────────────────────────────────┐
 * │ O campo de busca do sistema é `input type="search"`, e o papel acessível dele é `searchbox`,   │
 * │ que NÃO é `textbox`: procurar por `textbox` simplesmente não acha, e o motor falharia acusando │
 * │ artigo velho onde o artigo está certo. O seletor por `aria-label` é o mais estável que sobra,  │
 * │ porque o rótulo acessível do campo é conteúdo de produto, não classe de estilo.                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TERMO DIGITADO É GENÉRICO DE PROPÓSITO: "ltda" aparece em razão social de cliente, que é entrada
 * de catálogo e passa pelo gate, e não depende de nenhum cliente específico continuar existindo na
 * homologação. Termo casado com um cadastro só quebraria na primeira limpeza de base.
 */
import type { Roteiro } from "../tipos";

const CAMPO = 'input[aria-label="Buscar cliente"]';

export const roteiro: Roteiro = {
  slug: "buscar-dentro-da-tela",
  url: "/admin/integracao-clientes",
  capturas: [
    {
      arquivo: "01-campo-de-busca.png",
      legenda: "Passo 1: o campo de busca, no alto da lista.",
      alvos: [
        {
          seletor: CAMPO,
          texto: "1. Digite aqui",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-lista-recortada.png",
      legenda: "Passo 2: a lista já recortada pelo que foi digitado.",
      preparo: [{ acao: "digitar", alvo: { seletor: CAMPO, texto: "" }, valor: "ltda" }],
      alvos: [
        {
          seletor: CAMPO,
          texto: "2. A lista recorta sozinha",
          forma: "retangulo",
          lado: "abaixo",
        },
      ],
    },
  ],
};
