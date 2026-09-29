import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 13 de 14: A BARRA LATERAL, O TEMA E A SAÍDA.
 *
 * Tudo o que é "sobre você e não sobre o trabalho" mora no pé da barra lateral: quem está conectado,
 * qual é o seu nível de acesso, o tema claro ou escuro, e o botão de sair. Um artigo, porque é um
 * lugar só.
 *
 * ÂNCORA: o painel inicial, que é a primeira tela de todo mundo e a única que já está aberta quando a
 * pergunta aparece.
 */
export const artigo: Artigo = {
  slug: "tema-perfil-e-sair",
  titulo: "Tema, Perfil E Sair",
  modulo: "COMECAR_AQUI",
  rotas: ["/", "/trocar-senha"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Onde ver com qual usuário você está conectado e qual é o seu nível de acesso, como trocar entre tema claro e escuro, como recolher a barra lateral e como sair.",
  termos: [
    "tema",
    "escuro",
    "claro",
    "dark mode",
    "modo noturno",
    "perfil",
    "meu usuario",
    "quem estou logado",
    "papel",
    "nivel de acesso",
    "sair",
    "logout",
    "deslogar",
    "recolher menu",
    "esconder menu",
    "barra lateral",
  ],
  preRequisitos: ["Estar conectado. A barra lateral aparece em todas as telas de dentro do sistema."],
  passos: [
    {
      gesto: "Olhe o pé da barra lateral, à esquerda.",
      detalhe:
        "Ali estão a sua inicial, o seu nome e o seu nível de acesso. É por esse bloco que você confere com qual usuário está conectado antes de fazer algo em nome de outra pessoa.",
      print: {
        arquivo: "01-pe-da-barra-lateral.png",
        legenda: "Passo 1: o pé da barra lateral, com o usuário conectado, o tema e a saída.",
      },
    },
    {
      gesto: "Clique na lua para ir ao tema escuro, e no sol para voltar ao claro.",
      detalhe:
        "A escolha fica guardada no seu navegador, então ela continua valendo na próxima vez que você entrar. Ela é só sua: não muda o tema de mais ninguém.",
      /*
       * OS QUATRO RÓTULOS DO MESMO BOTÃO, e é por isso que os quatro precisam estar aqui. Ele tem
       * `title` ("Tema escuro" / "Tema claro"), que é o que a PESSOA lê ao passar o mouse, e
       * `aria-label` ("Mudar para tema escuro" / "Mudar para tema claro"), que é o NOME ACESSÍVEL e é
       * o que o detector de cobertura enumera, porque é por ele que o botão é encontrado. Declarar só
       * o `title` deixava o botão do tema contado como órfão em todas as telas do sistema, já que ele
       * é moldura: um controle que o manual ensina e a medição dizia não ensinar.
       */
      controles: [
        "Tema escuro",
        "Tema claro",
        "Mudar para tema escuro",
        "Mudar para tema claro",
      ],
    },
    {
      gesto: "Use o controle do topo da barra para recolher ou fixar o menu.",
      detalhe:
        "Recolhido, o menu mostra só os ícones e sobra largura para a tabela. Fixado, ele fica aberto com os nomes.",
      controles: ["Recolher menu", "Fixar menu expandido"],
      print: {
        arquivo: "02-recolher-o-menu.png",
        legenda: "Passo 3: o controle que recolhe e fixa a barra lateral.",
      },
    },
    {
      gesto: "Clique em Sair para encerrar a sessão.",
      detalhe:
        "Você volta para a tela de entrada. Faça isso sempre que deixar o computador com outra pessoa: o que for feito depois fica registrado no seu nome.",
      controles: ["Sair"],
    },
    {
      gesto: "Para trocar a sua senha, use a tela de troca de senha.",
      detalhe:
        "Informe a senha atual, escolha a nova com pelo menos oito caracteres e confirme. Quem redefine senha de outra pessoa é a administração.",
      controles: ["Nova senha", "Confirmar nova senha", "Salvar nova senha"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O tema voltou ao claro sozinho.",
      acao: "A escolha fica guardada no navegador. Em outro navegador, em outro computador ou depois de limpar os dados de navegação, ela começa do claro.",
    },
    {
      sintoma: "Não vejo o meu nome no pé da barra.",
      acao: "A barra está recolhida e mostra só a inicial. Fixe o menu para ver o nome e o nível de acesso.",
    },
    {
      sintoma: "Cliquei em Sair e continuei dentro.",
      acao: "Recarregue a página. Se persistir, feche o navegador: a sessão não sobrevive ao fechamento.",
    },
    {
      sintoma: "Meu nome está diferente do cadastro.",
      acao: "A barra monta o nome a partir do seu e-mail. Divergência no cadastro é corrigida pela administração.",
    },
  ],
  regras: [
    "O tema é escolha sua e vale só no seu navegador.",
    "O pé da barra lateral diz sempre com qual usuário você está conectado, e é o que você confere antes de agir.",
    "Tudo o que é feito no sistema fica registrado no nome do usuário conectado.",
    "Quem redefine senha de outra pessoa é a administração.",
  ],
  relacionados: ["entrar-no-sistema", "por-que-eu-nao-vejo-um-menu"],
  fontes: [
    "apps/frontend/src/components/shell/Sidebar.tsx",
    "apps/frontend/src/components/ui/ThemeToggle.tsx",
    "apps/frontend/src/app/trocar-senha/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
