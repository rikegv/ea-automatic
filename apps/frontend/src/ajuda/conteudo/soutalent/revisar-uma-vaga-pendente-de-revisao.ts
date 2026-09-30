import type { Artigo } from "../../tipos";

/**
 * ─ REVISAR UMA VAGA PENDENTE DE REVISÃO (N1, família `as-candidatos`) ───────────────────────────
 *
 * O QUE ESTA TELA É DE VERDADE, e o artigo precisa dizer isso na primeira linha: ela é a PONTE
 * entre a varredura do Pandapé e o time de A&S. A varredura espelha, dentro do sistema, vagas que
 * NINGUÉM abriu aqui, e elas chegam incompletas: o ATS não manda cliente, salário, benefícios,
 * escala nem endereço. A vaga já fica viva e já recebe os candidatos que a varredura leu, então a
 * fila não é burocracia, é o que impede uma vaga sem dono de ir para a operação com gente dentro.
 *
 * O QUE ELE COBRE: a fila, o contador, as colunas, a etiqueta Sem Cliente, e o gesto de revisar,
 * que abre o mesmo formulário da abertura de vaga no modo de liberação, com as duas saídas (guardar
 * o que já foi preenchido, ou liberar).
 *
 * O QUE ELE **NÃO** COBRE, por escopo:
 *   . ABRIR UMA VAGA pela trilha, que é `abrir-uma-vaga-nova`. Aqui o formulário é o mesmo, e o
 *     artigo aponta para lá em vez de ensinar campo por campo de novo.
 *   . CORRIGIR UMA LIBERAÇÃO já feita, que é a aba vizinha e tem artigo próprio.
 *
 * ATENÇÃO AO RÓTULO DO MENU, e ele foi conferido no registro de menus: a entrada do menu é
 * **Liberar Vaga**, não "Pendentes De Revisão". "Pendentes De Revisão" é o rótulo da ABA dentro da
 * tela, e o título da tela é "Vagas Pendentes De Revisão". Os três textos convivem, e mandar a
 * pessoa clicar no nome errado no menu é o jeito mais rápido de um manual perder a confiança.
 *
 * ┌─ ESTE ARTIGO TEM PRINT DESDE 30/09/2026, E O QUE MUDOU FOI **DADO**, NÃO RÉGUA ──────────────┐
 * │ O texto anterior dizia que a captura estava "vetada pela auditoria de segurança" e que a fila   │
 * │ abria vazia por causa da tabela de conflitos da ingestão. As duas metades estavam erradas:      │
 * │                                                                                                │
 * │ 1. O VETO CAIU. O diretor destravou a semeadura de dado sintético de A&S, a homologação foi     │
 * │    limpa e semeada, e o motor voltou a aprovar estas telas.                                     │
 * │ 2. A FONTE DA FILA NÃO ERA AQUELA. Esta fila lê UMA coisa só, vaga com o status do papel        │
 * │    REVISAO. A tabela de conflitos da ingestão alimenta OUTRA tela, e povoar uma não povoa a     │
 * │    outra. O que destravou o print foi uma VAGA pendente, semeada com o cliente em branco de     │
 * │    propósito, para a etiqueta Sem Cliente aparecer.                                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A aba vizinha, a da CORREÇÃO, continua sem imagem, e por motivo diferente: ela só é desenhada para
 * MASTER, e a conta que tira os prints é COMUM. Está com o diretor, e não é veto de segurança.
 *
 * §A.6: esta tela não mostra pessoa nenhuma. A linha inteira é dado de processo (código da vaga,
 * nome de divulgação, cargo, cliente, cidade, posições, quantidade de candidatos e data de entrada).
 */
export const artigo: Artigo = {
  slug: "revisar-uma-vaga-pendente-de-revisao",
  titulo: "Revisar Uma Vaga Pendente De Revisão",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas-pendentes-revisao"],
  menus: ["as-vagas-revisao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-candidatos",
  resumo:
    "Como trabalhar a fila de vagas que entraram sozinhas pela varredura do Pandapé: o que significa a etiqueta Sem Cliente, como completar o que o sistema de vagas não manda, e como liberar a vaga para a operação uma de cada vez.",
  termos: [
    "liberar vaga",
    "vaga pendente de revisao",
    "vaga sem cliente",
    "vaga do pandape",
    "vaga que entrou sozinha",
    "revisar vaga",
    "fila de revisao",
    "vincular cliente na vaga",
    "vaga nao revisada",
  ],
  preRequisitos: [
    "Ter o menu Liberar Vaga liberado para o seu usuário.",
    "Saber para qual cliente aquela vaga é: é o dado que o sistema de vagas não manda e o que a fila existe para resolver.",
    "Ter as condições da vaga em mão (salário, benefícios, escala e endereço), porque a liberação cobra os campos obrigatórios da abertura.",
  ],
  passos: [
    {
      gesto: "Abra Liberar Vaga pelo menu da lateral esquerda.",
      detalhe:
        "A tela se chama Vagas Pendentes De Revisão e abre na aba Pendentes De Revisão, com o número de vagas esperando e quantas estão sem cliente vinculado.",
      controles: ["Liberar Vaga", "Pendentes De Revisão"],
    },
    {
      gesto: "Leia a linha da vaga antes de decidir qualquer coisa.",
      detalhe:
        "As colunas são Vaga (o código do processo), Nome De Divulgação, Cargo, Cliente, Cidade, Posições, Candidatos e Entrada. Candidatos é quanta gente a vaga já carrega, e é o número que diz o tamanho do estrago de liberar para o cliente errado.",
      print: {
        arquivo: "01-fila-de-revisao.png",
        legenda:
          "A fila de revisão: a busca do topo, as colunas da vaga e a etiqueta Sem Cliente na coluna do cliente.",
      },
      controles: [
        "Vaga",
        "Nome De Divulgação",
        "Cargo",
        "Cliente",
        "Cidade",
        "Posições",
        "Candidatos",
        "Entrada",
        "Ação",
      ],
    },
    {
      gesto: "Use a busca do topo para achar a vaga, quando a fila estiver grande.",
      detalhe:
        "A busca procura por código da vaga, nome de divulgação, cargo e cliente. O cabeçalho de cada coluna ordena a fila por clique.",
      controles: ["Buscar por vaga, cargo ou cliente", "Atualizar"],
    },
    {
      gesto: "Confira a coluna Cliente: a etiqueta Sem Cliente é a pendência que trava a liberação.",
      detalhe:
        "A vaga veio do sistema de vagas sem cliente, e sem ele não dá para saber a quem o processo seletivo pertence. Vinculado o cliente, a etiqueta passa a mostrar o nome dele.",
      controles: ["Sem Cliente"],
    },
    {
      gesto: "Clique em Revisar vaga, na linha da vaga.",
      detalhe:
        "Abre o mesmo formulário da abertura de vaga, com o que já veio preenchido. É por ele que entram o cliente, o salário, os benefícios, a escala e o endereço.",
      print: {
        arquivo: "02-botao-revisar.png",
        legenda:
          "O botão de revisar, na ponta direita da linha. A tabela rola na horizontal para alcançá-lo.",
      },
      controles: ["Revisar vaga"],
    },
    {
      gesto:
        "Complete os campos e clique em Liberar vaga, no rodapé do formulário.",
      detalhe:
        "O botão fica apagado enquanto faltar campo obrigatório, e o número ao lado dele diz quantos faltam. A lista de pendências no topo do formulário é clicável e leva até cada campo.",
      print: {
        arquivo: "03-saidas-da-revisao.png",
        legenda:
          "O formulário da liberação: a lista do que falta preencher, o campo do cliente e as duas saídas do rodapé.",
      },
      controles: ["Liberar vaga"],
    },
    {
      gesto:
        "Não tem tudo agora? Clique em Salvar sem liberar e volte depois.",
      detalhe:
        "O que você preencheu fica guardado e a vaga continua na fila, exatamente onde estava. Sair pelo Cancelar sem salvar perde o que foi digitado.",
      controles: ["Salvar sem liberar", "Cancelar"],
    },
    {
      gesto: "Confira que a vaga saiu da fila.",
      detalhe:
        "A fila é o próprio estado: liberou, a linha desaparece daqui sozinha, sem ninguém dar baixa em nada. A vaga passa a viver na Central De Vagas como qualquer outra.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Não foi possível carregar a fila de revisão.",
      acao: "A consulta não voltou. Clique em Atualizar. Se repetir, confira se a sua sessão continua aberta e avise a administração.",
    },
    {
      sintoma: "A tela mostra Não foi possível abrir a vaga. Tente de novo.",
      acao: "O formulário não abre com dado velho de propósito: ele só abre depois de a vaga ser lida por inteiro. Feche o aviso e clique em Revisar vaga outra vez.",
    },
    {
      sintoma: "O botão Liberar vaga está apagado e diz que há pendentes.",
      acao: "Faltam campos obrigatórios. Abra a lista de pendências no topo do formulário e clique em cada item: o sistema leva você até o campo. O número no botão zera quando não faltar mais nada.",
    },
    {
      sintoma:
        "O sistema diz para vincular o cliente desta vaga antes de liberar.",
      acao: "É a única pendência que a fila existe para resolver. Escolha o cliente no formulário da revisão. O seletor tem busca e aceita também o código do cliente, e o apoio ao lado do nome desempata os clientes com razão social repetida.",
    },
    {
      sintoma: "A fila mostra Nenhuma vaga esperando revisão.",
      acao: "Não há trabalho pendente, e isso é o estado normal quando a varredura não trouxe nada novo. Havendo busca digitada, a tela diz Nenhuma vaga encontrada para a busca: limpe a busca antes de concluir que a fila está vazia.",
    },
    {
      sintoma: "Eu queria liberar várias vagas de uma vez.",
      acao: "Não existe liberação em lote, e a ausência é proposital: um cliente errado aplicado a centenas de vagas colocaria muita gente sob o cliente errado de uma vez, e o erro só apareceria depois, espalhado. É uma vaga por vez, com o cliente escolhido olhando a vaga.",
    },
    {
      sintoma:
        "O sistema recusa o número de posições que eu digitei.",
      acao: "A vaga da fila já pode ter gente entregue, e a meta não pode ficar abaixo do que já foi entregue. Confira a coluna Candidatos e informe um número compatível.",
    },
  ],
  regras: [
    "A vaga desta fila entrou sozinha pela varredura do sistema de vagas: ninguém a abriu aqui, e ela chega sem cliente porque esse dado não vem de lá.",
    "A vaga da fila já está viva e já recebe candidato: é nela que a varredura pendura quem se inscreveu.",
    "Sem cliente vinculado, a vaga não é liberada.",
    "A liberação cobra os mesmos campos obrigatórios da abertura de uma vaga nova: ou a vaga sai completa, ou ela não sai.",
    "Salvar sem liberar guarda o trabalho e mantém a vaga na fila. Só a liberação tira a vaga daqui.",
    "A liberação é uma vaga por vez. Não existe lote.",
    "Enquanto não for liberada, a vaga aparece na Central De Vagas com a etiqueta Não Revisada.",
  ],
  relacionados: [
    "corrigir-a-liberacao-de-uma-vaga-revisada",
    "abrir-uma-vaga-nova",
    "ler-a-central-de-vagas",
    "mover-o-status-da-vaga",
    "ordenar-a-lista-pelo-cabecalho",
    "buscar-dentro-da-tela",
    "por-que-eu-nao-vejo-um-menu",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/as/vagas-pendentes-revisao/page.tsx",
    "apps/frontend/src/lib/as-vagas-revisao.ts",
    "apps/frontend/src/components/as/vagas/TrilhaDaVaga.tsx",
    "apps/frontend/src/components/as/SeloDeRevisao.tsx",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
