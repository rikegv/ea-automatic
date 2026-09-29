import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO, 1 de 3: O CAMINHO PRINCIPAL DA FILA.
 *
 * ┌─ DUAS RÉGUAS CONVIVEM NESTA TELA, E CONFUNDI-LAS É O ERRO MAIS CARO DELA ────────────────────┐
 * │ 1. AS PENDÊNCIAS OBRIGATÓRIAS (o bloco "Informações Que Faltam" e os rótulos vermelhos): NÃO   │
 * │    travam. O que ficar vazio vira pendência da admissão na esteira.                            │
 * │ 2. OS SEIS OBRIGATÓRIOS PARA LIBERAR (Cargo, Sexo, Tipo de contrato, Data de admissão, Pacote  │
 * │    de benefícios e Escala): TRAVAM o botão Liberar para todo mundo. Master e Super Admin podem  │
 * │    liberar assim mesmo, por um botão à parte que registra o aceite.                            │
 * │                                                                                                │
 * │ Elas têm rótulos parecidos e a própria tela mistura as duas listas na mesma janela. O artigo    │
 * │ separa as duas em passos distintos, porque quem lê só vê um bloco vermelho e conclui que está   │
 * │ tudo bloqueado, ou que nada está.                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * FORA DE ESCOPO POR SER N2: recusar (artigo próprio), liberar em lote (artigo próprio), o vínculo
 * com a Sala de Espera em detalhe, o contrato do cliente quando há mais de um e o bloco de Alto
 * Volume. Os três últimos aparecem como PASSO CONDICIONAL, porque só surgem para alguns clientes e
 * omiti-los deixaria a pessoa sem saber por que a janela dela tem um campo a mais.
 *
 * §A.6: nenhum nome, CPF ou telefone de pessoa aparece aqui, só rótulos de coluna e de campo.
 */
export const artigo: Artigo = {
  slug: "liberar-uma-admissao",
  titulo: "Liberar Uma Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "Como tirar uma pré-admissão da fila de espera: achar a pessoa, atribuir cliente e cargo, preencher os campos que travam a liberação e mandar a admissão para a esteira com a régua documental do par.",
  termos: [
    "liberar",
    "liberacao",
    "pre admissao",
    "fila de liberacao",
    "aguardando",
    "sem cliente",
    "sem cargo",
    "atribuir cliente",
    "mandar para a esteira",
    "entrou no sistema e nao aparece",
    "pandape",
    "parado ha dias",
    "uniforme",
    "epi",
    "observacao",
  ],
  preRequisitos: [
    "Saber o cliente e o cargo daquela pessoa. São eles que definem a régua de documentos, e sem os dois o botão de liberar não acende.",
    "Ter em mãos os dados que travam a liberação: sexo, tipo de contrato, data de admissão, escala e o pacote de benefícios.",
  ],
  passos: [
    {
      gesto: "Abra Liberação Admissional pelo menu da lateral esquerda.",
      detalhe:
        "A tela abre na aba Aguardando, com a contagem de quem está na fila ao lado do nome da aba.",
      controles: ["Liberação Admissional", "Aguardando", "Admissões Recusadas"],
      print: {
        arquivo: "01-fila-aguardando.png",
        legenda: "Passo 1: a aba Aguardando, com a fila de pré-admissões.",
      },
    },
    {
      gesto: "Leia a linha da pessoa antes de abrir.",
      detalhe:
        "Cliente vem em branco enquanto ninguém atribuiu, e é justamente isso que você vai resolver. Parado (dias) e Parado (horas) dizem há quanto tempo a pessoa espera, e é por eles que se decide quem sai primeiro. A etiqueta Possível duplicata avisa que já existe admissão viva com aquele CPF.",
      controles: [
        "Cliente",
        "Candidato",
        "CPF",
        "Telefone",
        "Nascimento",
        "Sexo",
        "Chegada",
        "Parado (dias)",
        "Parado (horas)",
        "Ação",
        "Possível duplicata",
      ],
    },
    {
      gesto: "Ache a pessoa pela busca do topo quando a fila estiver grande.",
      detalhe:
        "A busca aceita o nome, mesmo parcial, e o CPF com ou sem pontuação. Ela filtra as duas abas ao mesmo tempo.",
      controles: ["Buscar por nome ou CPF"],
    },
    {
      gesto: "Clique em Liberar Admissão, na coluna Ação da linha.",
      detalhe:
        "Havendo registro parecido na Sala de Espera, aparece antes a janela de vínculo. Escolher o registro traz cliente e cargo já preenchidos; Seguir sem vincular abre a liberação em branco. Nos dois casos você chega à mesma janela.",
      controles: [
        "Liberar Admissão",
        "Vincular À Sala De Espera",
        "Seguir sem vincular",
        "Vincular",
      ],
    },
    {
      gesto: "Na janela, leia Informações Que Faltam e a legenda das cores.",
      detalhe:
        "Azul é valor que já veio preenchido de outra etapa. Vermelho é pendência ainda vazia. A lista encolhe conforme você preenche, e o que sobrar dela não impede liberar: segue como pendência da admissão na esteira.",
      controles: ["Informações Que Faltam", "Azul", "Vermelho", "Veio Do Funil A&S"],
    },
    {
      gesto: "Escolha o Cliente e o Cargo.",
      detalhe:
        "Os dois seletores têm busca própria, e o cliente aparece como código mais nome da operação, porque existe cliente de mesma razão social. Este par é o que define a régua de documentos da admissão.",
      controles: ["Cliente", "Cargo", "Selecione o cliente…", "Selecione o cargo…"],
      print: {
        arquivo: "02-janela-de-liberacao.png",
        legenda: "Passo 6: a janela de liberação, com cliente, cargo e os campos da folha.",
      },
    },
    {
      gesto: "Quando aparecer, escolha o Contrato do cliente.",
      detalhe:
        "Esse campo só existe para cliente que trabalha com mais de um tipo de contrato, e cada contrato tem régua documental própria. Sem escolher, a liberação não passa.",
      controles: ["Contrato do cliente", "Selecione o contrato…"],
    },
    {
      gesto: "Preencha os campos da folha.",
      detalhe:
        "Sexo, tipo de contrato, data de admissão, escala e o pacote de benefícios travam o botão Liberar. Salário, setor, departamento, centro de custo, loja e gestor não travam: ficam como pendência se você não tiver o dado agora. O Setor sugere os valores já usados neste mesmo cliente e cargo.",
      controles: [
        "Sexo",
        "Salário",
        "Data de admissão",
        "Tipo de contrato",
        "Escala",
        "Setor",
        "Departamento",
        "Centro de custo",
        "Loja / Unidade",
        "Gestor / BP",
        "Benefícios",
        "Valor de",
      ],
    },
    {
      gesto: "Responda Possui uniforme?",
      detalhe:
        "A resposta é obrigatória para liberar, e ter uniforme não bloqueia nada: o que bloqueia é não responder. Respondido Sim, escolha os tamanhos. Possui EPI? é opcional, e marcando Outros é preciso dizer qual é o item.",
      controles: [
        "Possui uniforme?",
        "Camiseta",
        "Calça",
        "Bota",
        "Possui EPI?",
        "Qual outro EPI?",
      ],
    },
    {
      gesto: "Use Observações para o que não cabe em campo nenhum.",
      detalhe:
        "É opcional, não entra na régua de pendências e fica visível na ficha do candidato depois de liberado. Serve para recado de processo, do tipo desconto combinado no vale-transporte.",
      controles: ["Observações (opcional)"],
    },
    {
      gesto: "Clique em Liberar.",
      detalhe:
        "A pessoa sai da fila na hora, a admissão entra na esteira e as frentes de Auditoria e Exame nascem juntas. A mensagem verde do topo confirma, e avisa quando o par cliente e cargo não tem régua cadastrada.",
      controles: ["Liberar", "Cancelar"],
      print: {
        arquivo: "03-botao-liberar.png",
        legenda: "Passo 11: o rodapé da janela, com Liberar, Cancelar e Recusar.",
      },
    },
  ],
  seDerErrado: [
    {
      sintoma: "Aparece o bloco Faltam Para Liberar e o botão Liberar está apagado.",
      acao: "São os seis campos que travam: Cargo, Sexo, Tipo de contrato, Data de admissão, Pacote de benefícios e Escala. Preencha os que estiverem listados. Não tendo o dado, só Master ou Super Admin consegue liberar assim mesmo, pelo botão de liberar mesmo com campos faltando.",
    },
    {
      sintoma:
        "A tela responde que só Master ou Super Admin pode liberar com esses campos em branco.",
      acao: "Você é consultor comum e há campo dos seis vazio. Preencha o que falta ou peça a liberação a quem tem o papel. A regra vale mesmo quando o dado não existe ainda.",
    },
    {
      sintoma: "A tela pede para responder se o candidato possui uniforme.",
      acao: "A resposta é obrigatória, o uniforme não. Marque Sim ou Não no bloco de uniforme e o botão acende.",
    },
    {
      sintoma: "Aparece que o CPF é inválido e a liberação fica bloqueada.",
      acao: "O dígito verificador não fecha, então o número está errado desde a origem. Só Master ou Super Admin corrige o CPF, conferindo o documento do candidato. Enquanto não corrigirem, essa pessoa não é liberada nem sozinha nem em lote.",
    },
    {
      sintoma: "Aparece o aviso Possível Duplicata De CPF, com outras admissões listadas.",
      acao: "É pergunta, não erro: já existe admissão em andamento com aquele CPF. Sendo a mesma pessoa em vaga nova, clique em confirmar e liberar. Sendo duplicata, cancele e recuse a pré-admissão.",
    },
    {
      sintoma: "A tela responde que esta admissão não está aguardando liberação.",
      acao: "Alguém já liberou ou recusou essa pessoa enquanto a sua janela estava aberta. Feche, recarregue a página e procure a pessoa no Gerenciador ou na aba Admissões Recusadas.",
    },
    {
      sintoma:
        "Liberou, mas a mensagem avisa que o par cliente e cargo não tem régua documental cadastrada.",
      acao: "A admissão entrou na esteira sem checklist de documentos. Peça o cadastro da régua no menu Régua de Documentos: sem ela, a Auditoria não tem o que cobrar.",
    },
    {
      sintoma: "O cliente trabalha com mais de um contrato e a liberação não passa.",
      acao: "Escolha o Contrato do cliente na janela. Cada contrato tem régua própria, então liberar sem escolher faria a admissão nascer com a lista de documentos do contrato errado.",
    },
  ],
  regras: [
    "Só entram nesta fila as pré-admissões que ainda não têm cliente e cargo. Atribuir os dois é o que manda a admissão para a esteira.",
    "Seis campos travam o botão Liberar: Cargo, Sexo, Tipo de contrato, Data de admissão, Pacote de benefícios e Escala. Master e Super Admin podem liberar com eles em branco, por aceite explícito e registrado.",
    "Os demais campos não travam: o que ficar vazio segue como pendência obrigatória da admissão na esteira.",
    "A resposta sobre uniforme é obrigatória para liberar. Ter uniforme nunca bloqueia, não responder bloqueia.",
    "CPF com dígito que não fecha bloqueia a liberação até um Master corrigir o número.",
    "CPF com admissão viva pede confirmação de que não é duplicata, e a decisão fica com o consultor.",
    "Ao liberar, nascem as frentes de Auditoria e Exame e a admissão recebe o checklist de documentos do par cliente e cargo.",
    "Cliente com mais de um contrato exige escolher qual é o desta admissão, porque cada contrato tem régua documental própria.",
    "A observação da liberação é livre, não conta como pendência e aparece na ficha do candidato depois.",
  ],
  relacionados: [
    "recusar-uma-admissao-na-liberacao",
    "liberar-em-lote",
    "cadastrar-uma-admissao-nova",
    "auditar-os-documentos-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "ler-a-ficha-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/frontend/src/components/liberacao/VincularSalaModal.tsx",
    "apps/frontend/src/components/admin/SeletorLoja.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/domain/admissao.ts",
  ],
  revisadoEm: "2026-09-28",
};
