/**
 * ROTEIRO DE CAPTURA: "Por Que Eu Não Vejo Um Menu".
 *
 * ┌─ AS DUAS IMAGENS SÃO A MESMA LISTA EM DOIS LUGARES, E É ISSO QUE O ARTIGO PROVA ──────────────┐
 * │ A primeira é o painel inicial (um card por tela liberada), a segunda é a barra lateral (os mesmos │
 * │ menus, em grupos). Mostrar as duas é o que faz a pessoa entender que não falta nada escondido: o   │
 * │ que ela tem está nos dois lugares, e o que não está em nenhum ela não tem.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UM LIMITE HONESTO DESTE PRINT, QUE O TEXTO DO ARTIGO COMPENSA ───────────────────────────────┐
 * │ A conta de captura é MASTER, então a imagem sai com MUITOS menus, e o artigo fala justamente de    │
 * │ quem tem POUCOS. Não há como fotografar a barra curta sem uma segunda conta de captura, com menu   │
 * │ reduzido, e criar conta é concessão de acesso, que não é gesto da fábrica. O passo 2 diz em texto   │
 * │ que a barra pode ser bem mais curta, e a imagem ensina a ESTRUTURA (os grupos), que é o que ela     │
 * │ tem para ensinar.                                                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O cabeçalho de grupo não é controle e não tem papel acessível, então o alvo dele é o seletor da
 * classe do design system. A saudação do painel traz o primeiro nome da conta de captura, que está
 * declarado na allowlist do arnês.
 *
 * ┌─ O RECORTE NA BARRA INTEIRA FOI RETIRADO, PELO MESMO MOTIVO MEDIDO DO ROTEIRO DO TEMA ────────┐
 * │ O print 2 recortava `aside`, e o motor o RECUSOU: a barra mede 1241px na conta de captura, contra   │
 * │ 1000px de viewport. O recorte era a causa da falha, não os alvos, e a barra não cabe recolhida       │
 * │ tampouco. Recortar um pedaço menor não serve aqui: o rótulo vermelho é posicionado na viewport e     │
 * │ cairia fora de um recorte estreito, e a aula deste print é justamente ver MAIS de um grupo na mesma  │
 * │ imagem, para a pessoa entender que grupo sem menu liberado não aparece.                              │
 * │                                                                                                      │
 * │ SEM RECORTE, A IMAGEM FICA IGUAL À DO PRINT 1, que é a tela cheia do painel inicial e sempre foi     │
 * │ assim: é a MESMA tela, com a seta em outro lugar, e as duas juntas são exatamente o que o artigo diz  │
 * │ (a mesma lista em dois lugares). O painel inicial não lista pessoa nenhuma, então não há medida de    │
 * │ privacidade perdida com o recorte, e o gate segue auditando a imagem inteira.                        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import type { Roteiro } from "../tipos";

export const roteiro: Roteiro = {
  slug: "por-que-eu-nao-vejo-um-menu",
  url: "/",
  capturas: [
    {
      arquivo: "01-painel-inicial.png",
      legenda: "Passo 1: o painel inicial, com um card por tela liberada para você.",
      alvos: [
        {
          papel: "heading",
          nome: "Operação",
          texto: "1. Suas telas liberadas",
          lado: "direita",
        },
      ],
    },
    {
      arquivo: "02-grupos-da-barra.png",
      legenda: "Passo 2: os grupos da barra lateral, que só existem quando há menu liberado.",
      preparo: [{ acao: "rolarAte", alvo: { seletor: "aside .nav-label", texto: "" } }],
      alvos: [
        {
          seletor: "aside .nav-label",
          texto: "2. Grupo aparece se tem menu",
          forma: "retangulo",
          lado: "direita",
        },
      ],
    },
  ],
};
