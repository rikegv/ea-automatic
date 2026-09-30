import type { Artigo } from "../../tipos";

/**
 * A CAMADA DE PAGAMENTO DO BENEFÍCIO, no cadastro do cliente.
 *
 * O QUE ELA COBRE: os três campos que dizem COMO o cliente paga o benefício (de quanto em quanto
 * tempo, em que dia do mês e em quantos dias sai o primeiro crédito), onde eles aparecem em leitura
 * e como apagar uma regra cadastrada por engano.
 *
 * O QUE ELA NÃO COBRE: montar o pacote de benefícios de UMA PESSOA, que é trabalho da tela de
 * Benefícios e já tem artigo próprio. Aqui se define a regra do CLIENTE, não o pacote de ninguém.
 *
 * Nenhum valor de cliente real aparece: os rótulos de periodicidade são controles da tela, não dado.
 */
export const artigo: Artigo = {
  slug: "definir-o-pagamento-do-beneficio-do-cliente",
  titulo: "Definir O Pagamento Do Benefício Do Cliente",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/clientes"],
  menus: ["clientes"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "cadastros-do-cliente",
  resumo:
    "Como cadastrar a regra de pagamento do benefício de um cliente: a periodicidade, o dia do pagamento e quantos dias levam até o primeiro crédito.",
  termos: [
    "pagamento do beneficio",
    "periodicidade do beneficio",
    "dia do pagamento",
    "primeiro credito",
    "quando o vale cai",
    "regra de beneficio do cliente",
    "credito do vale",
    "limpar regra de beneficio",
  ],
  preRequisitos: [
    "Saber a regra combinada com o cliente: de quanto em quanto tempo ele paga, em que dia e em quantos dias entra o primeiro crédito.",
  ],
  passos: [
    {
      gesto: "Abra a tela de Clientes e clique em editar na linha do cliente.",
      detalhe:
        "Os três campos só aparecem na edição: eles são regra de um cliente que já existe, e o cadastro inicial segue com os campos de sempre.",
      controles: ["Clientes", "editar"],
    },
    {
      gesto: "Escolha de quanto em quanto tempo o benefício é pago no seletor de periodicidade.",
      controles: ["Periodicidade do benefício"],
    },
    {
      gesto: "Informe o dia do mês em que o pagamento acontece.",
      detalhe: "É um número de 1 a 31.",
      controles: ["Dia do pagamento"],
    },
    {
      gesto: "Informe quantos dias levam até o primeiro crédito.",
      detalhe:
        "São dias corridos contando o próprio dia da admissão, então zero significa crédito no mesmo dia.",
      controles: ["Dias até o 1º crédito"],
    },
    {
      gesto: "Clique em Salvar alterações.",
      controles: ["Salvar alterações", "Cancelar"],
    },
    {
      gesto: "Confira o resultado abrindo a ficha do cliente pela seta à esquerda da linha.",
      detalhe: "A ficha mostra os três valores em leitura, sem precisar entrar na edição de novo.",
      controles: ["Periodicidade do benefício", "Dia do pagamento", "Dias até o 1º crédito"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Os três campos não aparecem no formulário.",
      acao: "Eles existem só na edição. Clique em editar na linha do cliente e role o formulário do topo.",
    },
    {
      sintoma: "Cadastrei a regra errada e quero apagá-la.",
      acao: "Deixe o dia e os dias em branco e escolha não informado na periodicidade, depois salve. Campo vazio apaga a regra, e é assim que se volta ao estado de cliente sem regra.",
    },
    {
      sintoma: "A tela de Benefícios mostra não informado para este cliente.",
      acao: "A regra de pagamento dele ainda não foi cadastrada. Cadastre aqui e a outra tela passa a exibi-la.",
    },
    {
      sintoma: "Quero que o crédito saia no mesmo dia da admissão.",
      acao: "Informe zero em dias até o primeiro crédito. Zero é valor válido e não é o mesmo que campo vazio.",
    },
  ],
  regras: [
    "A regra vale para o cliente inteiro, e não para uma admissão.",
    "Os três campos são opcionais: cliente sem regra cadastrada aparece como não informado.",
    "Campo vazio apaga a regra; zero em dias até o primeiro crédito significa crédito no mesmo dia.",
    "O que se cadastra aqui é a regra de pagamento do cliente, não o pacote de benefícios de uma pessoa.",
  ],
  relacionados: [
    "cadastrar-um-cliente-novo",
    "as-regras-de-beneficio-do-cliente",
    "montar-o-pacote-de-beneficios",
    "a-memoria-do-pacote-por-cliente-e-cargo",
    "marcar-o-beneficio-como-calculado",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/clientes/page.tsx",
    "apps/backend/src/admin/clientes/clientes.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
