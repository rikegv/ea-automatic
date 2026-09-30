import type { Artigo } from "../../tipos";

/**
 * O CADASTRO DO CLIENTE, a peça de entrada da família.
 *
 * O QUE ELA COBRE: o formulário do topo da tela de Clientes (código, razão social, documento da
 * empresa, nome de operação) e o vínculo com a empresa empregadora do grupo, que só aparece na
 * EDIÇÃO e por isso confunde quem acabou de criar o cliente.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE, e cada exclusão tem dono:
 *   - a classificação por segmento e comercial, os campos de pagamento do benefício, os grupos e a
 *     inativação, que são as outras quatro peças desta mesma tela;
 *   - a IMPORTAÇÃO por planilha, que não é o caminho ensinado aqui;
 *   - o tipo de marcação de ponto, que tem artigo próprio na trilha de admissão.
 *
 * NENHUM valor de cliente real aparece no texto: o artigo descreve o CAMPO, nunca o conteúdo dele.
 */
export const artigo: Artigo = {
  slug: "cadastrar-um-cliente-novo",
  titulo: "Cadastrar Um Cliente Novo",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/clientes"],
  menus: ["clientes"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "cadastros-do-cliente",
  resumo:
    "Como criar um cliente do zero: o código que é a chave de todo o sistema, a razão social, o documento da empresa, o nome de operação e o vínculo com a empresa empregadora do grupo.",
  termos: [
    "cadastrar cliente",
    "cliente novo",
    "criar cliente",
    "codigo do cliente",
    "cod cliente",
    "razao social",
    "cnpj do cliente",
    "nome operacao",
    "apelido do cliente",
    "empresa empregadora",
    "vinculo do cliente",
    "empresa do grupo",
  ],
  preRequisitos: [
    "Ter o código, a razão social e o documento da empresa em mãos antes de abrir a tela.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Clientes pelo Menu Gerencial.",
      controles: ["Clientes"],
    },
    {
      gesto: "Digite o código do cliente no primeiro campo do formulário do topo.",
      detalhe:
        "O código é a chave de todo o sistema: é por ele que apelido, razão social, régua, admissões e relatórios se encontram. Ele não se repete e não muda depois de criado.",
      controles: ["Cód. cliente *"],
    },
    {
      gesto: "Preencha a razão social, que é o nome formal da empresa.",
      controles: ["Razão social *"],
    },
    {
      gesto: "Informe o documento da empresa e o nome de operação.",
      detalhe:
        "O nome de operação é o nome pelo qual o time procura o cliente no dia a dia. Quando ele fica vazio, as listas mostram a razão social no lugar.",
      controles: ["CNPJ", "Nome Operação"],
    },
    {
      gesto: "Clique em Adicionar cliente.",
      detalhe: "O cliente nasce ativo e já aparece na lista abaixo do formulário.",
      controles: ["Adicionar cliente"],
    },
    {
      gesto: "Na linha do cliente recém-criado, clique em editar para definir o vínculo.",
      detalhe:
        "O seletor de vínculo só existe na edição: ele diz qual empresa do Grupo Soulan emprega as pessoas daquele cliente, e a lista tem busca porque é longa.",
      controles: ["editar", "Vínculo (empresa Soulan / tipo)", "Salvar alterações"],
    },
    {
      gesto: "Confira a linha na lista e abra a ficha pela seta, à esquerda do código.",
      detalhe:
        "A ficha mostra tudo o que está cadastrado para aquele cliente, incluindo as lojas e o grupo.",
      controles: [
        "Código",
        "Razão social",
        "CNPJ",
        "Nome Operação",
        "Empresa (Soulan)",
        "CNPJ vínculo",
        "Tipo de serviço",
        "Status",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O seletor de vínculo não aparece no formulário.",
      acao: "Ele existe só na edição. Crie o cliente primeiro, depois clique em editar na linha dele e escolha o vínculo.",
    },
    {
      sintoma: "Digitei o código errado e quero corrigir.",
      acao: "O código é a chave e fica bloqueado na edição. Inative o cliente errado e cadastre outro com o código certo: o que foi inativado continua no histórico.",
    },
    {
      sintoma: "A coluna do documento do vínculo mostra pendente.",
      acao: "O cliente ainda não foi vinculado a uma empresa do grupo. Clique em editar na linha e escolha o vínculo.",
    },
    {
      sintoma: "O cliente não aparece na lista depois de salvar.",
      acao: "Confira a busca e os filtros de situação no topo da lista. A busca procura por razão social, código e nome de operação ao mesmo tempo.",
    },
  ],
  regras: [
    "O código do cliente é a chave: ele liga apelido, razão social, régua documental e histórico de admissões.",
    "O código não se repete e não muda depois de criado.",
    "Todo cliente novo nasce ativo e já passa a ser oferecido nas telas que escolhem cliente.",
    "Razão social e código são obrigatórios; documento da empresa e nome de operação podem ser preenchidos depois.",
    "O vínculo define qual empresa do Grupo Soulan emprega as pessoas daquele cliente.",
  ],
  relacionados: [
    "classificar-o-cliente-por-segmento-e-comercial",
    "definir-o-pagamento-do-beneficio-do-cliente",
    "montar-os-grupos-de-cliente",
    "inativar-e-reativar-um-cliente",
    "cadastrar-a-regua-de-um-cliente-e-cargo",
    "configurar-o-tipo-de-marcacao-por-cliente",
    "buscar-dentro-da-tela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/clientes/page.tsx",
    "apps/backend/src/admin/clientes/clientes.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
