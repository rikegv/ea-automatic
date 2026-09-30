import type { Artigo } from "../../tipos";

/**
 * ─ FINALIZAR A POSIÇÃO: "esta vaga foi entregue com esta pessoa" ───────────────────────────────
 *
 * ┌─ A REGRA CENTRAL: É AQUI QUE A POSIÇÃO É CONSUMIDA ──────────────────────────────────────────┐
 * │ Trazer gente para o funil não mexe na meta da vaga; ENTREGAR mexe, e é este o gesto. O artigo │
 * │ diz isso na primeira linha do resumo de propósito: o par de gestos vizinhos ("adicionar ao    │
 * │ funil" e "finalizar posição") é a confusão mais cara do módulo, porque um clique errado queima │
 * │ posição de uma meta que alguém dimensionou.                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O LADO DA META, E A CIÊNCIA QUE O BANCO EXIGE ─────────────────────────────────────────────┐
 * │ A posição sai de um dos dois lados, oficial ou banco, e cada cartão mostra o número daquele   │
 * │ lado. Escolher o BANCO enquanto sobra posição OFICIAL é decisão permitida e cara de reverter: │
 * │ o sistema RECUSA a primeira tentativa, diz quantas oficiais continuam abertas, e espera a      │
 * │ confirmação do consultor. Avisa, não bloqueia, e o aceite fica no histórico da candidatura.    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE **NÃO** COBRE: enviar para a admissão (é o passo SEGUINTE, e finalizar a posição não
 * envia ninguém), a aprovação do candidato, e o desvínculo de quem já entregou. Cada um tem a sua
 * peça, e a delegação vai por `relacionados`.
 *
 * SEM ROTEIRO DE CAPTURA E SEM `print`: a janela traz o nome da pessoa, e a liberação dessa
 * superfície para o motor de captura está em auditoria.
 */
export const artigo: Artigo = {
  slug: "finalizar-a-posicao-da-vaga",
  titulo: "Finalizar A Posição Da Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-funil",
  nivel: "N1",
  publico: "AMBOS",
  resumo:
    "Como registrar que a vaga foi entregue com uma pessoa, escolhendo de qual lado da meta a posição sai, oficial ou banco. É este o gesto que consome a posição da vaga.",
  termos: [
    "finalizar posicao",
    "entregar a vaga",
    "alocar na vaga",
    "preencher posicao",
    "fechar posicao",
    "banco de talentos",
    "posicao de banco",
    "reserva",
    "meta da vaga",
    "consumir posicao",
    "candidato alocado",
  ],
  preRequisitos: [
    "A pessoa já precisa estar no funil desta vaga e ainda não ter entregue posição.",
    "A vaga já precisa ter o número de posições definido. Vaga sem posição dimensionada não recebe entrega.",
  ],
  passos: [
    {
      gesto:
        "Na aba Ver Candidatos, clique no ícone Finalizar posição na linha da pessoa que entregou a vaga.",
      print: {
        arquivo: "01-icone-finalizar-posicao.png",
        legenda:
          "O check da coluna de ações, que só aparece para quem ainda não entregou posição nesta vaga.",
      },
      detalhe:
        "É o ícone de check. Ele aparece só para quem ainda não entregou posição nesta vaga.",
      controles: ["Finalizar posição"],
    },
    {
      gesto: "Em De Qual Lado Da Meta, escolha Posição Oficial ou Posição De Banco.",
      print: {
        arquivo: "02-de-qual-lado-da-meta.png",
        legenda:
          "A janela de finalizar posição: os dois lados da meta e o bloco que explica a diferença entre os estados.",
      },
      detalhe:
        "Cada cartão mostra quantas posições daquele lado já estão preenchidas, de quantas a vaga tem. Lado sem meta definida aparece como meta não informada.",
      controles: ["De Qual Lado Da Meta", "Posição Oficial", "Posição De Banco"],
    },
    {
      gesto: "Leia O Que Muda Para Esta Pessoa antes de confirmar.",
      detalhe:
        "É ali que fica a diferença entre entregar a posição e enviar para a admissão, que são dois estados vizinhos e fáceis de trocar.",
      controles: ["O Que Muda Para Esta Pessoa"],
    },
    {
      gesto: "Clique em Finalizar posição, no rodapé da janela.",
      controles: ["Finalizar Posição"],
    },
    {
      gesto:
        "Escolhendo o banco com posição oficial ainda aberta, confirme em Alocar no banco mesmo assim.",
      detalhe:
        "A pergunta traz o número de posições oficiais que continuam abertas. Confirmando, o aceite fica registrado no histórico desta candidatura.",
      controles: ["Alocar no banco mesmo assim"],
    },
    {
      gesto: "Confira o resultado na aba Ver Candidatos Alocados.",
      print: {
        arquivo: "03-aba-alocados.png",
        legenda: "A aba Ver Candidatos Alocados, com a coluna Posição dizendo de que lado cada um entrou.",
      },
      detalhe:
        "A lista mostra só quem preencheu posição, e a coluna Posição diz de que lado cada um entrou: Oficial ou Banco.",
      controles: ["Ver Candidatos Alocados", "Posição"],
    },
    {
      gesto: "Confira o cilindro de posições e os cards da Central De Vagas.",
      detalhe:
        "O card Alocados conta quem entregou a posição. O card Aprovados conta quem foi aprovado e ainda não teve a entrega formalizada.",
      controles: ["Alocados", "Aprovados"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema pergunta se é isso mesmo ao escolher o banco.",
      acao: 'Não é erro: a frase é "Esta vaga ainda tem 1 posição oficial aberta. Alocar no banco deixa a posição oficial em aberto. Confirme que é isso mesmo que você quer.", com o número que está valendo. Decida com o número na frente: a posição oficial continua aberta e a vaga segue recebendo candidato.',
    },
    {
      sintoma: "O sistema diz que a vaga não tem posição de banco reservada.",
      acao: 'A frase é "Esta vaga não tem posição de banco reservada. Defina as posições de banco da vaga antes de alocar alguém na reserva." Corrija as posições de banco na vaga, ou entregue pelo lado oficial.',
    },
    {
      sintoma: "O sistema diz que as posições de banco já estão preenchidas.",
      acao: 'A frase é "Esta vaga tem 1 posição de banco e ela já está preenchida. Aumente as posições de banco da vaga ou libere alguém.", com o número da vaga. A reserva tem meta própria, contada separada da oficial.',
    },
    {
      sintoma: "O sistema diz que a vaga ainda não tem posições definidas.",
      acao: 'A frase é "Esta vaga ainda não tem o número de posições definido. Informe as posições da vaga antes de aprovar." Vaga que ninguém dimensionou não recebe entrega: preencha as posições na ficha da vaga.',
    },
    {
      sintoma: "O sistema diz que a entrega não volta atrás por aqui.",
      acao: 'A frase é "Esta candidatura já entregou a posição da vaga, e a entrega não volta atrás por aqui. Se a pessoa saiu do processo, registre a saída dela." Para desfazer uma entrega errada, desvincule o candidato informando o motivo.',
    },
    {
      sintoma: "O sistema diz que a vaga já foi encerrada.",
      acao: 'A frase é "Esta vaga já foi encerrada e não recebe posição nova. Recarregue a página para ver o estado atual da vaga." Alguém encerrou a vaga enquanto a janela estava aberta.',
    },
    {
      sintoma: "O ícone de finalizar posição não aparece na linha.",
      acao: "Ou a pessoa já entregou a posição, e aí ela está na aba Ver Candidatos Alocados, ou o processo dela já terminou. Confira a coluna Situação da linha.",
    },
  ],
  regras: [
    "Finalizar a posição é o gesto que consome a posição da meta da vaga. Adicionar ao funil não consome.",
    "A posição sai de um dos dois lados: oficial ou banco. O banco é reserva e é contado separado da meta oficial.",
    "Quem entregou a posição continua no funil: entregar não encerra o processo da pessoa.",
    "Finalizar a posição não envia ninguém para a admissão. O envio é o passo seguinte.",
    "Alocar no banco com posição oficial aberta é permitido, exige a confirmação do consultor com o número na frente, e o aceite fica no histórico da candidatura.",
    "Aprovar alguém também reserva posição, antes da entrega. Por isso a conta de quem ocupa posição é sempre maior ou igual à de quem entregou.",
    "Desfazer a entrega é desvincular o candidato da vaga informando o motivo, e não existe outro caminho.",
  ],
  relacionados: [
    "abrir-o-painel-da-vaga",
    "adicionar-candidatos-ao-funil-da-vaga",
    "mover-o-candidato-de-etapa",
    "enviar-o-candidato-para-a-admissao",
    "registrar-a-saida-do-candidato",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/FinalizarPosicaoModal.tsx",
    "apps/frontend/src/components/as/vagas/ConfirmarBancoModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/frontend/src/lib/as-vaga-acoes.ts",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
