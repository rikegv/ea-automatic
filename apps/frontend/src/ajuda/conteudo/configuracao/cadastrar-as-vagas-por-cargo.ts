import type { Artigo } from "../../tipos";

/**
 * VAGAS POR CARGO: a meta do projeto, cargo a cargo.
 *
 * ┌─ UMA LINHA POR CARGO EM CADA COTA, E É DAÍ QUE SAI O ERRO MAIS COMUM ────────────────────────┐
 * │ O time tenta cadastrar o mesmo cargo duas vezes para somar, e o sistema recusa dizendo quantas  │
 * │ vagas aquela linha já tem. O caminho é EDITAR a quantidade, que é edição direta na célula.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTA PEÇA NÃO REEXPLICA: marcar várias linhas de uma vez, que é o padrão do sistema inteiro
 * e tem artigo próprio (`agir-em-varias-linhas-de-uma-vez`). Aqui só se diz o que a ação em lote faz
 * nesta tela.
 *
 * FAMÍLIA: sem família até a família do cadastro de Alto Volume existir.
 *
 * PAPEL: escrita governada pelo menu `alto-volume`, sem `@Roles` de classe na controller.
 */
export const artigo: Artigo = {
  slug: "cadastrar-as-vagas-por-cargo",
  titulo: "Cadastrar As Vagas Por Cargo",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/alto-volume"],
  menus: ["alto-volume"],
  familia: "alto-volume-cadastro",
  publico: "GESTAO",
  nivel: "N1",
  resumo:
    "Como registrar quantas vagas o projeto tem de cada cargo, como corrigir a quantidade depois e o que acontece ao remover uma linha de meta.",
  termos: [
    "vagas por cargo",
    "meta do projeto",
    "quantas vagas",
    "quantidade de vagas",
    "cadastrar cargo no projeto",
    "cota",
    "distribuir por loja",
    "remover vagas",
  ],
  preRequisitos: [
    "Ter o menu Alto Volume liberado para o seu usuário.",
    "O projeto já precisa estar cadastrado, e o cargo já precisa existir no catálogo de cargos.",
  ],
  passos: [
    {
      gesto: "Abra Alto Volume e clique em grupos e vagas na linha do projeto.",
      controles: ["grupos e vagas"],
    },
    {
      gesto: "Na seção Vagas Por Cargo, escolha o Cargo.",
      detalhe: "O seletor tem busca: digite parte do nome do cargo.",
      controles: ["Vagas Por Cargo", "Cargo"],
    },
    {
      gesto: "Escolha a cota, quando o projeto tiver levas de entrada.",
      detalhe:
        "Projeto Inteiro é a cota geral. Escolhendo uma leva, aquelas vagas passam a ser da leva. O seletor só aparece quando existe leva cadastrada, porque sem ela tudo é do projeto inteiro.",
      controles: ["Projeto Inteiro"],
    },
    {
      gesto: "Digite a quantidade em Vagas e clique em Adicionar.",
      controles: ["Vagas", "Adicionar"],
    },
    {
      gesto: "Confira a linha na tabela e o total ao lado do título da seção.",
      detalhe:
        "As colunas são Cargo, a cota quando houver leva, a loja quando houver distribuição, Vagas e as ações.",
      controles: ["Cargo", "Cota", "Loja", "Vagas"],
    },
    {
      gesto: "Para corrigir a quantidade, digite o número novo direto na célula da coluna Vagas.",
      detalhe: "O valor é salvo assim que você sai do campo, sem botão nenhum.",
    },
    {
      gesto: "Para dividir a meta de um cargo entre as lojas, clique em distribuir por loja.",
      detalhe:
        "A janela Distribuir Por Loja substitui a meta daquele cargo pela soma do que você digitar loja a loja. O link só aparece na linha do projeto inteiro.",
      controles: ["distribuir por loja", "Distribuir Por Loja"],
    },
    {
      gesto: "Para tirar uma linha, clique em remover e confirme.",
      detalhe:
        "Remover apaga a meta daquela linha e não desliga ninguém do projeto: quem já está vinculado continua vinculado.",
      controles: ["remover", "Remover"],
    },
    {
      gesto: "Para tirar várias linhas de uma vez, marque as caixas e use Remover selecionadas.",
      detalhe:
        "A caixa do cabeçalho marca todas as linhas à vista. O sistema pede confirmação dizendo quantas linhas vão sair.",
      controles: ["Remover selecionadas", "limpar seleção"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que este cargo já tem vagas cadastradas.",
      acao: "Cada cargo tem uma linha só em cada cota. Edite a quantidade na célula da coluna Vagas em vez de cadastrar outra linha.",
    },
    {
      sintoma: "O sistema não deixa remover a linha do cargo e abre uma janela explicando a ordem.",
      acao: "Aquele cargo está distribuído por loja. Remova primeiro as linhas do mesmo cargo que têm nome de loja e só depois a linha do projeto inteiro.",
    },
    {
      sintoma: "O seletor de cota não aparece.",
      acao: "O projeto não tem leva de entrada cadastrada, então tudo é do projeto inteiro. Cadastre a leva primeiro se você precisa separar a meta por data.",
    },
    {
      sintoma: "Você digitou a quantidade nova e ela voltou ao valor antigo.",
      acao: "O campo salva ao sair dele. Clique fora do campo, ou use a tecla Tab, e confira o total ao lado do título da seção.",
    },
  ],
  regras: [
    "Cada cargo tem uma linha de vagas por cota: para somar, edite a quantidade da linha que já existe.",
    "Sem leva de entrada cadastrada, toda vaga é da cota do projeto inteiro.",
    "Remover a linha apaga a meta, e não desliga ninguém do projeto.",
    "Cargo distribuído por loja sai na ordem: primeiro as linhas de loja, depois a linha do projeto inteiro.",
    "A distribuição por loja substitui a meta do cargo pela soma do que foi digitado nas lojas.",
  ],
  relacionados: [
    "cadastrar-um-projeto-de-alto-volume",
    "cadastrar-os-grupos-de-entrada-do-projeto",
    "vincular-e-desvincular-admissoes-do-projeto",
    "agir-em-varias-linhas-de-uma-vez",
    "o-catalogo-de-cargos",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/alto-volume/page.tsx",
    "apps/backend/src/admin/alto-volume/alto-volume.controller.ts",
    "apps/backend/src/admin/alto-volume/alto-volume.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
