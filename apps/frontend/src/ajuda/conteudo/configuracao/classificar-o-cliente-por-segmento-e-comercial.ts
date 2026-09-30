import type { Artigo } from "../../tipos";

/**
 * OS DOIS SELETORES DE CLASSIFICAÇÃO do cadastro do cliente.
 *
 * O QUE ELA COBRE: onde ficam os campos de segmento e de comercial, de onde vêm as opções deles,
 * como limpar uma escolha errada e por que uma opção pode aparecer marcada como fora de circulação.
 *
 * O QUE ELA NÃO COBRE, de propósito: MANTER os catálogos que alimentam os dois seletores. Criar,
 * renomear, inativar e reativar item de catálogo é a mesma mecânica em todo o sistema e tem artigo
 * próprio, e repeti-la aqui criaria duas explicações capazes de divergir.
 *
 * O seletor de comercial mostra NOME DE PESSOA na tela. Nenhum nome é citado neste texto: o artigo
 * descreve o campo, e quem lê vê a lista real na própria tela.
 */
export const artigo: Artigo = {
  slug: "classificar-o-cliente-por-segmento-e-comercial",
  titulo: "Classificar O Cliente Por Segmento E Comercial",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/clientes"],
  menus: ["clientes"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "cadastros-do-cliente",
  resumo:
    "Como dizer qual é o ramo do cliente e quem do comercial atende a conta, de onde saem as opções dos dois seletores e como limpar uma classificação feita por engano.",
  termos: [
    "segmento do cliente",
    "ramo do cliente",
    "comercial responsavel",
    "carteira do comercial",
    "quem atende o cliente",
    "classificar cliente",
    "limpar segmento",
    "nao informado",
  ],
  preRequisitos: [
    "Saber a qual segmento o cliente pertence e quem do comercial responde por ele.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Clientes e localize o cliente na lista.",
      controles: ["Clientes"],
    },
    {
      gesto: "Clique em editar na linha do cliente.",
      detalhe:
        "O formulário do topo passa a mostrar os dados daquele cliente, e a tela rola até ele sozinha.",
      controles: ["editar"],
    },
    {
      gesto: "Escolha o ramo do cliente no seletor de segmento.",
      detalhe:
        "As opções vêm do catálogo de segmentos. Item que foi tirado de circulação não é oferecido, e só continua na lista quando o próprio cliente já o usava.",
      controles: ["Segmento"],
    },
    {
      gesto: "Escolha quem do comercial atende o cliente no seletor ao lado.",
      detalhe:
        "As opções vêm do catálogo de comerciais, e a lista ganha campo de busca quando fica longa.",
      controles: ["Comercial"],
    },
    {
      gesto: "Clique em Salvar alterações.",
      detalhe:
        "Os dois campos são opcionais: cliente sem classificação continua salvando normalmente e aparece como não informado.",
      controles: ["Salvar alterações", "Cancelar"],
    },
    {
      gesto: "Para desfazer uma classificação, volte ao seletor e escolha a primeira opção da lista.",
      detalhe:
        "A opção não informado existe justamente para poder esvaziar o campo, e não só para descrever o vazio.",
      controles: ["não informado"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O seletor aparece vazio e há um aviso em vermelho embaixo dele.",
      acao: "O catálogo daquele campo não carregou. Recarregue a página. O resto do cadastro continua salvando, porque os dois campos são opcionais.",
    },
    {
      sintoma: "A opção que eu uso aparece marcada como fora de circulação.",
      acao: "Ela foi inativada no catálogo e só continua na lista porque este cliente já a usava. Escolha uma opção ativa, ou reative o item no catálogo.",
    },
    {
      sintoma: "Classifiquei o cliente errado e quero deixar o campo em branco.",
      acao: "Escolha a opção não informado no seletor e salve. Apagar o texto não é possível: o campo é uma lista.",
    },
    {
      sintoma: "A opção que eu preciso não existe na lista.",
      acao: "Ela ainda não foi criada no catálogo correspondente. O cadastro do item é feito na tela daquele catálogo, não aqui.",
    },
  ],
  regras: [
    "Os dois campos são opcionais: o cliente salva sem eles e a tela mostra não informado.",
    "As opções vêm de catálogos próprios, então renomear um item corrige o nome em todos os clientes de uma vez.",
    "Item inativado deixa de ser oferecido, e continua visível no cliente que já o usava.",
    "A classificação vale para o cliente inteiro e é herdada pelas vagas abertas para ele.",
  ],
  relacionados: [
    "cadastrar-um-cliente-novo",
    "manter-um-catalogo-do-sistema",
    "definir-o-pagamento-do-beneficio-do-cliente",
    "montar-os-grupos-de-cliente",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/clientes/page.tsx",
    "apps/backend/src/admin/clientes/clientes.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
