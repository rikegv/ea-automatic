import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 14 de 14: POR QUE FALTA UM MENU.
 *
 * ┌─ O ARTIGO QUE EVITA O CHAMADO DE SUPORTE MAIS COMUM DE TODOS ────────────────────────────────┐
 * │ "Sumiu o menu", "não abre para mim", "a tela não existe". Nenhuma das três é defeito: menu é      │
 * │ concedido pessoa por pessoa, e menu NOVO nasce visível só para o nível mais alto até a diretoria   │
 * │ liberar quem usa. Dizer isso em um artigo transforma uma suspeita de erro em um pedido de acesso.  │
 * │                                                                                                   │
 * │ O artigo também explica o que a pessoa vê quando ela digita o endereço de uma tela não liberada: o  │
 * │ sistema devolve ela ao painel inicial. Não é travamento, é a resposta certa.                       │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ARTIGO NÃO ENSINA A CONCEDER MENU, de propósito: conceder é gesto da administração, e quem decide
 * quem vê o quê é a diretoria. Aqui se explica o comportamento e para onde levar o pedido.
 *
 * ┌─ ESTE É O ARTIGO DONO DOS NOMES DE MENU, E A ESCOLHA TEM UM MOTIVO MEDIDO ────────────────────┐
 * │ O detector de cobertura classifica os nomes da barra lateral como MOLDURA: eles aparecem em TODAS  │
 * │ as telas, então um artigo cobre os dezesseis. Os dezesseis estavam órfãos, e o candidato natural a  │
 * │ dono seria um artigo de NAVEGAÇÃO, que não existe. Este existe, e o assunto dele é exatamente qual  │
 * │ menu a pessoa vê e por quê: é onde alguém que leu "Liberação Admissional" na barra e não entendeu    │
 * │ vai cair. Criar um artigo de navegação só para hospedar a lista seria inventar peça fora da OST.     │
 * │                                                                                                    │
 * │ O passo 1 fica com os TRÊS GRUPOS e o passo 2 com os MENUS, e é a divisão que a tela faz: o painel  │
 * │ inicial agrupa os cards por grupo e NÃO desenha um card "Início" (seria um link para a página em que │
 * │ a pessoa já está), enquanto a barra desenha o Início e os grupos.                                    │
 * │                                                                                                     │
 * │ OS PASSOS 3, 4 E 5 SEGUEM SEM `controles`, e isto é o certo: neles não se clica em nada. O passo 3   │
 * │ explica o que o sistema FAZ quando você digita um endereço, e os dois últimos mandam procurar uma     │
 * │ pessoa. Rótulo inventado ali mentiria para o detector, que é pior que campo vazio.                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "por-que-eu-nao-vejo-um-menu",
  titulo: "Por Que Eu Não Vejo Um Menu",
  modulo: "COMECAR_AQUI",
  rotas: ["/"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Por que a sua barra lateral tem menos menus que a de um colega, por que um menu novo demora a aparecer, e o que acontece quando você digita o endereço de uma tela não liberada.",
  termos: [
    "menu",
    "sumiu o menu",
    "nao aparece",
    "nao tenho acesso",
    "sem permissao",
    "permissao",
    "liberar menu",
    "meu colega ve e eu nao",
    "tela nao abre",
    "voltou para o inicio",
    "nao existe essa tela",
    "acesso",
  ],
  preRequisitos: ["Estar conectado. O painel inicial já lista tudo o que você tem liberado."],
  passos: [
    {
      gesto: "Abra o painel inicial e leia a lista de cards.",
      detalhe:
        "Os cards são exatamente as suas telas liberadas, agrupadas do mesmo jeito que na barra lateral. O que não está ali, você não tem.",
      controles: ["Operação", "Atração e Seleção", "Administração"],
      print: {
        arquivo: "01-painel-inicial.png",
        legenda: "Passo 1: o painel inicial, com um card por tela liberada para você.",
      },
    },
    {
      gesto: "Compare com a barra lateral.",
      detalhe:
        "A barra mostra os mesmos menus, em grupos: Operação, Atração e Seleção, Administração. Grupo sem nenhum menu liberado nem aparece, e é por isso que a sua barra pode ser bem mais curta que a de um colega.",
      /*
       * A LISTA INTEIRA DOS DESTINOS DA BARRA, escrita como o componente a escreve (`lib/navegacao`),
       * inclusive o ponto de "Ass. Click" e o acento de "Benefícios". Nenhuma pessoa vê todos: a barra
       * mostra só os liberados, e é disso que o artigo trata. Quem lê um nome na barra e não sabe o que
       * é procura por ESTE nome, então é ele que precisa estar indexado.
       */
      controles: [
        "Início",
        "Controle Gerencial",
        "Sala De Espera",
        "Liberação Admissional",
        "Gerenciador Do Portal",
        "Nova Admissão",
        "Esteira Admissional",
        "Não Conformidades",
        "Gerenciador",
        "Gerador De Kit",
        "Ass. Click",
        "Benefícios",
        "Liberar Vaga",
        "Central De Vagas",
        "Central De Candidatos",
        "Menu Gerencial",
      ],
      print: {
        arquivo: "02-grupos-da-barra.png",
        legenda: "Passo 2: os grupos da barra lateral, que só existem quando há menu liberado.",
      },
    },
    {
      gesto: "Entenda o que acontece ao digitar o endereço de uma tela não liberada.",
      detalhe:
        "O sistema devolve você ao painel inicial. Não é travamento e não é erro: o acesso é conferido nos dois lados, na tela e no servidor.",
    },
    {
      gesto: "Para pedir um menu, procure a administração.",
      detalhe:
        "A liberação é feita usuário por usuário, e quem decide quem enxerga cada menu é a diretoria. Diga qual menu você precisa e para quê.",
    },
    {
      gesto: "Se o menu é novo, conte com um intervalo até ele chegar até você.",
      detalhe:
        "Menu recém-criado nasce visível só para o nível mais alto de acesso, e passa a aparecer para os demais quando a diretoria libera. Não aparecer no primeiro dia não é defeito.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Eu tinha o menu e ele sumiu.",
      acao: "A liberação é salva por substituição: quem abre a tela de usuários, salva com uma lista antiga e não percebe pode remover um menu sem querer. Peça a conferência à administração.",
    },
    {
      sintoma: "Digitei o endereço e voltei para o painel inicial.",
      acao: "Aquela tela não está liberada para você. Peça o acesso, não insista no endereço.",
    },
    {
      sintoma: "A tela abre e as ações dão erro de permissão.",
      acao: "O seu acesso alcança a tela e não alcança aquela ação. Avise a administração dizendo qual ação recusou.",
    },
    {
      sintoma: "Meu colega vê um menu que eu não vejo, e fazemos o mesmo trabalho.",
      acao: "Liberação é individual, então isso acontece. Peça a equiparação à administração, citando o nome do colega e o menu.",
    },
  ],
  regras: [
    "O menu é liberado pessoa por pessoa, e quem decide quem vê o quê é a diretoria.",
    "O painel inicial lista exatamente o que você tem liberado.",
    "Grupo sem nenhum menu liberado não aparece na barra lateral.",
    "Menu novo nasce visível só para o nível mais alto de acesso, até a diretoria liberar.",
    "Digitar o endereço de uma tela não liberada devolve você ao painel inicial: o acesso é conferido na tela e no servidor.",
  ],
  relacionados: ["entrar-no-sistema", "tema-perfil-e-sair"],
  fontes: [
    "apps/frontend/src/app/(app)/page.tsx",
    "apps/frontend/src/app/(app)/layout.tsx",
    "apps/frontend/src/components/shell/Sidebar.tsx",
    "apps/backend/src/domain/menus.ts",
  ],
  revisadoEm: "2026-09-28",
};
