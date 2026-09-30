import type { Artigo } from "../../tipos";

/**
 * CADASTRAR UM USUÁRIO: a porta de entrada de uma pessoa no sistema.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ─────────────────────────────────────────────────────┐
 * │ Cobre o formulário do topo da tela de Usuários (nome, e-mail, papel, papel de A&S, área), o     │
 * │ botão que cria e o bloco da senha temporária que aparece logo depois. Para AÍ, de propósito:    │
 * │ LIBERAR MENU é a peça irmã (`liberar-os-menus-de-um-usuario`), e ensinar as duas juntas faria   │
 * │ este artigo virar o manual inteiro da tela, que é exatamente o que a divisão por peça evita.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SENHA: o artigo descreve o MECANISMO (o sistema gera, mostra uma vez, obriga a troca) e em nenhum
 * lugar escreve um valor de senha, nem de exemplo. O mesmo vale para nome e e-mail: a tela mostra a
 * equipe inteira, e o texto fala sempre em COLUNA e CAMPO, nunca em uma pessoa.
 *
 * PAPEL, conferido no backend e não na tela: a rota inteira desta administração é restrita ao Super
 * Admin (`apps/backend/src/users/users.controller.ts`, o `@Roles("SUPER_ADMIN")` da classe). A
 * afirmação vive no bloco da família, para não ser repetida em quatro artigos.
 */
export const artigo: Artigo = {
  slug: "cadastrar-um-usuario",
  titulo: "Cadastrar Um Usuário",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/usuarios"],
  menus: ["usuarios"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "acesso-e-usuarios",
  resumo:
    "Como criar o acesso de uma pessoa nova: os campos do cadastro, o papel, a área de atuação e a senha temporária que o sistema gera na criação e mostra uma única vez.",
  termos: [
    "criar usuario",
    "cadastrar usuario",
    "usuario novo",
    "novo funcionario no sistema",
    "dar acesso para alguem",
    "primeiro acesso",
    "senha temporaria",
    "papel do usuario",
    "area de atuacao",
    "master",
    "super admin",
    "comum",
  ],
  preRequisitos: [
    "Ter em mãos o nome completo e o e-mail corporativo da pessoa.",
    "Saber qual papel e qual área a diretoria definiu para ela: é o papel que decide o que ela pode fazer.",
  ],
  passos: [
    {
      gesto: "Abra Usuários, na Administração.",
      controles: ["Usuários"],
    },
    {
      gesto: "Preencha Nome e E-mail no formulário do topo da tela.",
      detalhe:
        "O e-mail é a identidade da pessoa no sistema e não se repete: é com ele que ela entra.",
      controles: ["Nome", "E-mail"],
    },
    {
      gesto: "Escolha o Papel.",
      detalhe:
        "Comum é quem opera, Master é a administração e Super Admin é a diretoria. O papel manda no que a pessoa alcança, e mudá-lo depois é uma edição na própria linha dela.",
      controles: ["Papel", "Comum", "Master", "Super Admin"],
    },
    {
      gesto: "Escolha o Papel De A&S, quando a pessoa trabalhar com vagas.",
      detalhe:
        "É o lado que ela ocupa na frente de vagas, e nada mais: ele não dá nem tira acesso a tela nenhuma. Quem não trabalha com vagas fica sem papel de A&S, que é o normal.",
      controles: ["Papel De A&S", "Sem papel de A&S"],
    },
    {
      gesto: "Marque a Área da pessoa.",
      detalhe:
        "A área é o teto de tudo o que ela enxerga: menu de outra área não fica acessível nem depois de liberado. Sem nenhuma área marcada o botão de criar não habilita.",
      controles: ["Área"],
    },
    {
      gesto: "Clique em Criar usuário.",
      controles: ["Criar usuário"],
    },
    {
      gesto: "Copie a senha temporária no bloco que aparece e entregue à pessoa.",
      detalhe:
        "O sistema gera a senha sozinho, mostra uma única vez e não a guarda em texto: ela não é exibida de novo. No primeiro acesso a pessoa é obrigada a trocá-la.",
      controles: ["Copiar"],
    },
    {
      gesto: "Confira a pessoa na lista, com o status Ativo.",
      detalhe:
        "A lista traz as colunas Nome, E-mail, Papel, Área, Papel De A&S, Status e Criado em, e qualquer uma delas ordena por clique no cabeçalho.",
      controles: ["Status", "Ativo", "Criado em"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão de criar não habilita.",
      acao: "Falta nome, e-mail ou área. A área é obrigatória: sem ela a pessoa entraria em um sistema sem nenhum menu.",
    },
    {
      sintoma: "Você fechou o bloco da senha temporária antes de copiar.",
      acao: "A senha não é exibida de novo. Gere outra pelo caminho do reset de senha, na linha da pessoa.",
    },
    {
      sintoma: "A pessoa entrou e vê poucos menus.",
      acao: "É o esperado: ela nasce apenas com o padrão do papel dela. O resto é liberado menu a menu, e essa liberação é decisão da diretoria.",
    },
  ],
  regras: [
    "O e-mail não se repete no sistema, nem entre usuários desativados.",
    "A senha temporária é gerada pelo sistema, aparece uma única vez e é trocada pela pessoa no primeiro acesso.",
    "A área é o teto do acesso: fora dela, nenhum menu fica alcançável, mesmo liberado.",
    "O papel de A&S diz o lado da vaga que a pessoa ocupa e não interfere em permissão.",
    "Usuário novo nasce com o conjunto padrão de menus do papel dele, e nada além disso.",
  ],
  relacionados: [
    "liberar-os-menus-de-um-usuario",
    "resetar-a-senha-de-um-usuario",
    "desativar-e-reativar-um-usuario",
    "por-que-eu-nao-vejo-um-menu",
    "entrar-no-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/usuarios/page.tsx",
    "apps/backend/src/users/users.controller.ts",
    "apps/backend/src/users/users.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
