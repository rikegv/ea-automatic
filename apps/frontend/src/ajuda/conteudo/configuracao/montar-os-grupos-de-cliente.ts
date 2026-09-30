import type { Artigo } from "../../tipos";

/**
 * OS GRUPOS DE CLIENTE: o livreto de duas páginas e o grupo mostrado na ficha do cliente.
 *
 * O QUE ELA COBRE: criar o grupo, ticar quais códigos entram nele, ler a confirmação que diz o que
 * vai acontecer antes de gravar, e inativar ou reativar um grupo.
 *
 * O QUE ELA NÃO COBRE: a LOJA do cliente, que responde a outra pergunta (em qual unidade daquele
 * cliente a pessoa trabalha) e vive em outro bloco da mesma ficha.
 *
 * O grupo na ficha do cliente é SÓ LEITURA de propósito, e o artigo diz isso: um segundo lugar de
 * edição criaria duas telas capazes de divergir sobre a mesma coisa.
 */
export const artigo: Artigo = {
  slug: "montar-os-grupos-de-cliente",
  titulo: "Montar Os Grupos De Cliente",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/clientes"],
  menus: ["clientes"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "cadastros-do-cliente",
  resumo:
    "Como juntar vários códigos de cliente num grupo só, para filtrar e analisar por regional, e como ler a confirmação que mostra quem entra, quem sai e quantas admissões são alcançadas.",
  termos: [
    "grupo de cliente",
    "agrupar clientes",
    "regional",
    "juntar cnpj",
    "mesma razao social",
    "padronizar apelido",
    "cadastrar grupos",
    "tirar cliente do grupo",
  ],
  preRequisitos: [
    "Saber quais códigos de cliente pertencem ao mesmo agrupamento administrativo.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Clientes e clique em Cadastrar Grupos, na barra de filtros.",
      detalhe:
        "O mesmo botão existe dentro da ficha de cada cliente, embaixo do bloco de grupo. Os dois abrem a mesma janela.",
      controles: ["Clientes", "Cadastrar Grupos"],
    },
    {
      gesto: "Digite o nome do grupo no campo da página esquerda e clique em Criar Grupo.",
      detalhe: "O nome do grupo não se repete: ele é o rótulo que vai padronizar as grafias.",
      controles: ["Nome do grupo novo", "Criar Grupo"],
    },
    {
      gesto: "Clique no grupo na lista da esquerda para abri-lo.",
      detalhe:
        "Enquanto nenhum grupo estiver escolhido, a página direita não deixa ticar ninguém. Cada linha mostra quantos códigos o grupo tem e quantas admissões já estão carimbadas nele.",
    },
    {
      gesto: "Na página direita, procure e tique os códigos que entram no grupo.",
      detalhe:
        "A busca procura por código, razão social e apelido. Quem já pertence a outro grupo aparece com a etiqueta dizendo de onde vai sair.",
      controles: ["Buscar cliente", "ver só os ticados"],
    },
    {
      gesto: "Clique em Salvar Grupo e leia a confirmação antes de aplicar.",
      detalhe:
        "A confirmação diz quantos entram, quantos vêm de outro grupo, quantos saem e quantas admissões são alcançadas, linha a linha.",
      controles: ["Salvar Grupo", "Fechar"],
    },
    {
      gesto: "Confirme clicando em Salvar na janela de confirmação.",
      controles: ["Salvar", "Cancelar"],
    },
    {
      gesto:
        "Para tirar um grupo de circulação, abra-o e clique em Inativar Grupo; para trazê-lo de volta, clique em Reativar Grupo.",
      detalhe: "Grupo inativo some dos filtros e continua no histórico que já foi carimbado.",
      controles: ["Inativar Grupo", "Reativar Grupo"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que já existe um grupo com esse nome.",
      acao: "Nome de grupo não se repete. Procure o grupo na lista da esquerda e edite a marcação dele em vez de criar outro.",
    },
    {
      sintoma: "O botão de salvar o grupo está apagado.",
      acao: "Ele só liga quando existe um grupo escolhido e alguma marcação mudou. Tique ou destique ao menos um código.",
    },
    {
      sintoma: "O código que eu quero já pertence a outro grupo.",
      acao: "Um código pertence a um grupo só. Ticar aqui o tira do outro, e a confirmação mostra essa troca antes de gravar.",
    },
    {
      sintoma: "Destiquei um código e ele ficou sem grupo nenhum.",
      acao: "É o comportamento certo: a marcação é a verdade final. Quem sai fica sem grupo e mantém o nome de operação que está, para ser ajustado no editar do cliente.",
    },
    {
      sintoma: "A página direita diz para escolher um grupo ao lado.",
      acao: "Nenhum grupo está aberto. Clique num grupo da lista da esquerda, ou crie o primeiro.",
    },
  ],
  regras: [
    "O grupo junta códigos de cliente num nome só, para filtrar e analisar.",
    "Um código de cliente pertence a um grupo de cada vez.",
    "A marcação é a verdade final: o que fica ticado pertence ao grupo, o que é desticado sai dele.",
    "Salvar carimba as admissões dos códigos que entram ou saem, as concluídas junto com as vivas, e o efeito aparece na hora nas telas de análise.",
    "O nome de operação dos códigos que entram passa a ser o nome do grupo, que é o que padroniza as grafias.",
    "Grupo inativo some dos filtros e continua no histórico já carimbado.",
    "Na ficha do cliente o grupo aparece só em leitura: a edição acontece na janela de grupos.",
  ],
  relacionados: [
    "cadastrar-um-cliente-novo",
    "classificar-o-cliente-por-segmento-e-comercial",
    "inativar-e-reativar-um-cliente",
    "agir-em-varias-linhas-de-uma-vez",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/admin/GruposClienteLivreto.tsx",
    "apps/frontend/src/components/admin/GrupoDoCliente.tsx",
    "apps/backend/src/admin/grupos-cliente/grupos-cliente.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
