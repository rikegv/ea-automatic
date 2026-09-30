import type { Artigo } from "../../tipos";

/**
 * PROJETO DE ALTO VOLUME: o cadastro do projeto sazonal, que é a casca de tudo o mais.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E O QUE ELA DELIBERADAMENTE NÃO COBRE ───────────────────────────────┐
 * │ Cobre o formulário do topo (cliente, nome, início e fim), a lista com os filtros e a busca, a   │
 * │ edição e a inativação. NÃO cobre a ANÁLISE do projeto (os indicadores, o termômetro, o          │
 * │ acompanhamento das metas): ela deixou de ser tela deste menu e virou página do painel gerencial, │
 * │ então ensiná-la aqui mandaria a pessoa procurar no lugar errado.                                 │
 * │                                                                                                 │
 * │ Os GRUPOS, as VAGAS e os VÍNCULOS são as três peças irmãs, e cada uma mora no seu artigo: são    │
 * │ trabalhos diferentes feitos em momentos diferentes do mesmo projeto.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * FAMÍLIA: esta peça e as três irmãs ficam SEM família até a família do cadastro de Alto Volume
 * existir. Declarar uma família de outra tela faria o artigo herdar pré-requisito e erro que não são
 * dele, que é pior do que herdar nada.
 *
 * PAPEL, conferido no backend: `alto-volume.controller.ts` NÃO tem `@Roles` de classe. A LEITURA é
 * aberta a qualquer autenticado de propósito (outras telas listam os projetos num seletor), e a
 * ESCRITA é governada pelo menu `alto-volume` (`domain/menus.ts`). O menu nasce só para o Super
 * Admin, e a liberação é da diretoria.
 */
export const artigo: Artigo = {
  slug: "cadastrar-um-projeto-de-alto-volume",
  titulo: "Cadastrar Um Projeto De Alto Volume",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/alto-volume"],
  menus: ["alto-volume"],
  familia: "alto-volume-cadastro",
  publico: "GESTAO",
  nivel: "N1",
  resumo:
    "Como abrir um projeto sazonal de um cliente: o cliente, o nome e o período, como corrigir o que foi cadastrado e como inativar um projeto sem perder o que já foi feito nele.",
  termos: [
    "alto volume",
    "projeto sazonal",
    "criar projeto",
    "cadastrar projeto",
    "projeto de contratacao",
    "safra",
    "temporada",
    "inativar projeto",
    "reativar projeto",
    "periodo do projeto",
  ],
  preRequisitos: [
    "Ter o menu Alto Volume liberado para o seu usuário.",
    "O cliente já precisa estar cadastrado e ativo no sistema.",
    "Saber o período do projeto: a data em que ele começa e a data em que termina.",
  ],
  passos: [
    {
      gesto: "Abra Alto Volume, na Administração.",
      controles: ["Alto Volume"],
    },
    {
      gesto: "Escolha o Cliente no seletor do formulário do topo.",
      detalhe:
        "O seletor tem busca: digite parte do nome, do código ou do documento do cliente. Só clientes ativos aparecem.",
      controles: ["Cliente"],
    },
    {
      gesto: "Digite o nome do projeto em Novo projeto.",
      detalhe:
        "É o nome pelo qual o time vai procurar o projeto depois. Ele não se repete dentro do mesmo cliente.",
      controles: ["Novo projeto"],
    },
    {
      gesto: "Preencha Início e Fim.",
      detalhe:
        "É o período do projeto, e ele faz trabalho depois: é por ele que a tela sabe quais admissões daquele cliente podem entrar no projeto.",
      controles: ["Início", "Fim"],
    },
    {
      gesto: "Clique em Adicionar.",
      controles: ["Adicionar"],
    },
    {
      gesto: "Confira o projeto na lista.",
      detalhe:
        "As colunas são Projeto, Cliente, Período, Grupos, Cargos, Vagas, Status e as ações. Clique no cabeçalho para ordenar, e use a busca quando a lista crescer.",
      controles: ["Projeto", "Cliente", "Período", "Vagas", "Status", "Buscar projeto ou cliente"],
    },
    {
      gesto: "Para corrigir o nome ou o período, clique em editar na linha do projeto.",
      detalhe:
        "O formulário do topo passa a editar aquele projeto. O cliente não muda: projeto aberto no cliente errado se inativa e se cria de novo.",
      controles: ["editar", "Salvar alterações"],
    },
    {
      gesto: "Para tirar o projeto de circulação, clique em inativar e confirme.",
      detalhe:
        "Inativar não exclui: grupos, vagas e vínculos ficam intactos, o projeto sai das opções selecionáveis e você pode reativar quando quiser.",
      controles: ["inativar", "Inativar", "reativar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que este cliente já tem um projeto com esse nome.",
      acao: "Use o que já existe. Se o de mesmo nome estiver inativo, o sistema avisa: reative aquele em vez de criar outro.",
    },
    {
      sintoma: "O sistema recusa o período.",
      acao: "O fim não pode ser antes do início. Confira as duas datas.",
    },
    {
      sintoma: "O cliente que você procura não aparece no seletor.",
      acao: "Só cliente ativo recebe projeto. Reative o cliente no cadastro de clientes e volte aqui.",
    },
    {
      sintoma: "Você escolheu o cliente errado e já salvou.",
      acao: "O cliente não muda na edição. Inative o projeto errado e crie um novo no cliente certo.",
    },
    {
      sintoma: "O projeto sumiu da lista.",
      acao: "Confira o filtro do topo, entre ativos, inativos e todos, e limpe a busca ao lado dele.",
    },
  ],
  regras: [
    "Um projeto pertence a um cliente só, e o cliente não muda depois de criado.",
    "O nome do projeto não se repete dentro do mesmo cliente, nem contando os inativos.",
    "O fim do projeto não pode ser antes do início.",
    "Cliente inativo não recebe projeto novo.",
    "Inativar não exclui: grupos, vagas e vínculos continuam, e o projeto pode ser reativado.",
  ],
  relacionados: [
    "cadastrar-os-grupos-de-entrada-do-projeto",
    "cadastrar-as-vagas-por-cargo",
    "vincular-e-desvincular-admissoes-do-projeto",
    "ordenar-a-lista-pelo-cabecalho",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/alto-volume/page.tsx",
    "apps/backend/src/admin/alto-volume/alto-volume.controller.ts",
    "apps/backend/src/admin/alto-volume/alto-volume.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
