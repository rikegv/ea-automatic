import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: o formulário de fechamento, os números que ele pede, as duas opções de
 * destino do processo, e a recusa que aparece quando a contagem de posições oficiais não fecha,
 * inclusive o encerramento forçado que só o Master tem.
 *
 * O QUE ELA DELIBERADAMENTE NAO COBRE:
 *   . OS CANDIDATOS PENDENTES. A outra recusa do mesmo botão abre uma fila de trabalho, com gestos
 *     próprios, e ela é a peça "tratar-os-candidatos-pendentes-antes-de-fechar". Juntar as duas num
 *     artigo só faria a pessoa ler seis passos de tratamento de gente para fechar uma vaga que não
 *     tem ninguém pendurado.
 *   . CANCELAR, que é a vaga que não vai acontecer, e tem peça própria.
 *   . FINALIZAR A POSIÇÃO de cada pessoa, que é o que faz a conta fechar e tem artigo próprio.
 */
export const artigo: Artigo = {
  slug: "fechar-a-vaga",
  titulo: "Fechar A Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-vagas",
  resumo:
    "Como encerrar uma vaga que acabou: a data, quantas posições entregaram, o salário de fechamento, e o que fazer quando o sistema recusa porque ainda falta posição preenchida.",
  termos: [
    "fechar vaga",
    "encerrar vaga",
    "concluir vaga",
    "vaga entregue",
    "finalizar processo seletivo",
    "terminei a vaga",
    "data de fechamento",
    "salario de fechamento",
    "vagas fechadas",
    "nao consigo fechar a vaga",
  ],
  preRequisitos: [
    "Todas as posições oficiais da vaga já precisam estar preenchidas, ou você precisa ser Master para encerrar assim mesmo.",
  ],
  passos: [
    {
      gesto: "Encontre a vaga na lista e confira a coluna Posições.",
      detalhe:
        "É ela que diz quantas posições oficiais já foram entregues. O fechamento é conferido contra esse número.",
      controles: ["Posições"],
    },
    {
      gesto: "Abra o gesto Fechar vaga na barra daquela vaga.",
      detalhe: "O gesto existe só na vaga viva: fechada, cancelada e rascunho não o oferecem.",
      controles: ["Fechar vaga"],
    },
    {
      gesto: "Preencha a data do fechamento.",
      detalhe: "É o único campo obrigatório do formulário.",
      controles: ["Fechar Vaga", "Data do fechamento"],
    },
    {
      gesto: "Confira quantas vagas foram fechadas.",
      detalhe:
        "O campo nasce com a meta da vaga e pode ser ajustado para baixo. O campo do banco só aparece na vaga que reservou banco.",
      controles: ["Nº de vagas fechadas", "Nº de vagas fechadas de banco"],
    },
    {
      gesto: "Informe o salário de fechamento e a data prevista para início, se houver.",
      detalhe: "Os dois são opcionais e o salário nasce com o valor de abertura.",
      controles: ["Salário de fechamento", "Data prevista para início"],
    },
    {
      gesto: "Escolha o destino do processo seletivo.",
      detalhe:
        "A segunda opção registra a intenção na vaga. A passagem para a esteira de admissão ainda não acontece automaticamente a partir daqui.",
      controles: [
        "Fechar a vaga e finalizar o processo seletivo",
        "Finalizar o processo seletivo e enviar para admissão",
      ],
    },
    {
      gesto: "Clique em Fechar vaga para encerrar.",
      detalhe: "A vaga passa a Fechada, sai das filas de trabalho e segue consultável na lista.",
      controles: ["Fechada", "Cancelar"],
    },
    {
      gesto: "Se a conta de posições não fechar, leia a recusa com o número medido.",
      detalhe:
        "A janela diz quantas posições oficiais estão preenchidas e quantas faltam. O banco não entra nessa conta, porque reserva não é entrega.",
      controles: ["Fechar Vaga Com Posição Oficial Aberta", "Entendi"],
    },
    {
      gesto: "Sendo Master, encerre assim mesmo pelo botão da própria recusa.",
      detalhe:
        "Fica registrado no painel da vaga o seu nome, a data e quantas posições oficiais estavam abertas naquele momento.",
      controles: ["Encerrar a vaga assim mesmo"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela diz que o número de vagas fechadas não pode ser maior que isso.",
      acao: "Você informou mais entregas do que a vaga tem de meta. Ajuste o número para a meta ou menos. Precisando de mais posições, corrija as posições da vaga antes de fechar.",
    },
    {
      sintoma:
        "A tela mostra que a vaga tem posições oficiais e alguma ainda não foi preenchida, e pede para finalizar as posições que faltam.",
      acao: "Finalize no painel da vaga a posição de quem entregou, e tente fechar de novo. Não havendo mais quem entregar, peça a um Master para encerrar assim mesmo.",
    },
    {
      sintoma:
        "A tela mostra Encerrar a vaga com posição oficial em aberto é ação de Master. Finalize as posições que faltam, ou peça a um Master para encerrar assim mesmo.",
      acao: "O encerramento com posição em aberto não é do consultor comum. Peça a um Master, ou finalize as posições que faltam e feche normalmente.",
    },
    {
      sintoma: "A tela mostra Esta vaga já foi fechada. Recarregue a página.",
      acao: "Outra pessoa encerrou a vaga, ou o clique foi duplo. Recarregue a página e confira a pill de status antes de tentar de novo.",
    },
    {
      sintoma: "O campo do banco não aparece no formulário.",
      acao: "Ele só existe na vaga que reservou posições de banco. Com reserva zero, não há entrega de banco a informar.",
    },
    {
      sintoma: "A vaga abriu uma fila de candidatos em vez do formulário.",
      acao: "Há gente em seleção segurando o fechamento. Trate cada um ali mesmo e feche a vaga em seguida, sem sair da tela. O que você já preencheu no formulário fica guardado.",
    },
  ],
  regras: [
    "A vaga só fecha quando todas as posições oficiais estão preenchidas. O banco não participa dessa conta.",
    "Encerrar com posição oficial em aberto é ação de Master, e o que for forçado deixa trilha com nome, data e quantas posições estavam abertas.",
    "Escolher enviar para admissão registra a intenção na vaga: a passagem para a esteira ainda não acontece automaticamente.",
    "A vaga fechada sai das filas de trabalho e continua consultável, com os números do fechamento na ficha.",
    "Só fecha vaga que está em processo: fechada, cancelada e rascunho não oferecem o gesto.",
  ],
  relacionados: [
    "tratar-os-candidatos-pendentes-antes-de-fechar",
    "finalizar-a-posicao-da-vaga",
    "cancelar-a-vaga",
    "mover-o-status-da-vaga",
    "ler-a-central-de-vagas",
    "abrir-o-painel-da-vaga",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/frontend/src/components/as/vagas/RecusaFechamentoModal.tsx",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
