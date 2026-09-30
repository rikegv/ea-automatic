import type { Artigo } from "../../tipos";

/**
 * ─ A SAÍDA SEM ÊXITO: DESCARTADO PELA SELEÇÃO E DESISTIU DO PROCESSO ──────────────────────────
 *
 * ┌─ AS DUAS SAÍDAS SÃO O MESMO GESTO, E O QUE MUDA É O MOTIVO ─────────────────────────────────┐
 * │ Descartado e Desistiu sempre tiraram a pessoa da vaga e sempre exigiram motivo. A tela as     │
 * │ apresenta como as duas respostas de uma pergunta só (por que a pessoa saiu), e o artigo segue  │
 * │ a mesma leitura: um passo a passo, dois cards, um campo de motivo.                             │
 * │                                                                                                │
 * │ O CAMPO DO MOTIVO NÃO É O MESMO NOS DOIS, e é o detalhe que mais gera recusa: no DESCARTE ele  │
 * │ é um SELETOR com a lista de motivos cadastrados (o servidor confere contra o catálogo, então    │
 * │ texto livre ali é recusado), e na DESISTÊNCIA é prosa, porque a pergunta ali é o que a pessoa   │
 * │ disse. E há motivo marcado para pedir a PRETENSÃO SALARIAL, que abre um campo a mais.           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE **NÃO** COBRE, e a razão importa:
 *  . A REPROVAÇÃO PELO CLIENTE. Ela NÃO é uma saída: não encerra ninguém, não libera posição e o
 *    texto dela é opcional. É decisão de fora, tem seção própria na mesma janela e artigo próprio.
 *  . O DESVÍNCULO EM MASSA, que é outra peça, com o relatório de quem ficou de fora.
 *  . Onde o gesto mora na tela (a seção Desvincular Da Vaga) é apresentado no artigo de mover de
 *    etapa, que é onde a janela é aberta. Aqui fica a escolha e o motivo.
 *
 * SEM ROTEIRO DE CAPTURA E SEM `print`: a janela traz o nome da pessoa, e a liberação dessa
 * superfície para o motor de captura está em auditoria.
 */
export const artigo: Artigo = {
  slug: "registrar-a-saida-do-candidato",
  titulo: "Registrar A Saída Do Candidato",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-funil",
  nivel: "N1",
  publico: "AMBOS",
  resumo:
    "Como registrar que uma pessoa saiu do processo da vaga, por decisão da seleção ou por decisão dela, com o motivo que o sistema exige e que fica no histórico.",
  termos: [
    "descartar candidato",
    "reprovar",
    "eliminar",
    "cortar candidato",
    "desistiu",
    "desistencia",
    "recusou a vaga",
    "sem interesse",
    "sem perfil",
    "motivo do descarte",
    "pretensao salarial",
    "tirar da vaga",
    "encerrar processo do candidato",
  ],
  preRequisitos: [
    "A pessoa já precisa estar no funil desta vaga, com o processo em andamento.",
    "Para tirar da vaga quem já entregou a posição, o seu usuário precisa ser Master.",
  ],
  passos: [
    {
      gesto:
        "Na linha da pessoa, clique no ícone Encerrar ou enviar para a admissão para abrir a janela de decisão.",
      detalhe:
        "É a mesma seta que move de etapa. Para quem já entregou posição, o rótulo do ícone muda, porque o que resta ali é a decisão.",
      controles: ["Encerrar ou enviar para a admissão"],
    },
    {
      gesto:
        "Na seção Desvincular Da Vaga, clique em Descartado Pela Seleção ou em Desistiu Do Processo.",
      print: {
        arquivo: "01-secao-desvincular.png",
        legenda: "A seção Desvincular Da Vaga, com os dois motivos de saída lado a lado.",
      },
      detalhe:
        "A escolha é o motivo de a pessoa ter saído: a primeira é decisão da seleção, a segunda é decisão dela. O clique só abre o campo de motivo, e nada foi gravado ainda.",
      controles: ["Descartado Pela Seleção", "Desistiu Do Processo"],
    },
    {
      gesto: "Preencha o Motivo, que é obrigatório nas duas saídas.",
      print: {
        arquivo: "02-campo-motivo.png",
        legenda: "O campo Motivo, que no descarte é um seletor alimentado pelo cadastro de motivos.",
      },
      detalhe:
        "No descarte o campo é um seletor com busca, e a lista vem do cadastro de motivos. Na desistência é um campo de texto, de até 500 caracteres.",
      controles: ["Motivo"],
    },
    {
      gesto: "Informe a Pretensão salarial quando o motivo escolhido pedir o valor.",
      detalhe:
        "O campo aparece sozinho, só para os motivos marcados para isso. O valor fica na ficha da pessoa e é o que responde, depois, por que este processo não seguiu.",
      controles: ["Pretensão salarial"],
    },
    {
      gesto: "Clique no botão que confirma o desvínculo e leia a pergunta antes de confirmar.",
      detalhe:
        "A pergunta diz o motivo escolhido e o que acontece: a pessoa sai da vaga, volta para o banco de candidatos e a posição volta a ficar livre.",
    },
    {
      gesto: "Confira o resultado na lista da vaga e nos cards da Central De Vagas.",
      detalhe:
        "A linha continua na lista, como histórico, e para de aceitar decisão nova. Os cards Descartados Pela Seleção e Desistentes contam cada saída.",
      controles: ["Descartados Pela Seleção", "Desistentes"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema recusa o motivo escrito no descarte.",
      acao: 'A frase é "Motivo de saída inválido. Escolha um motivo da lista." No descarte o motivo é uma classificação do cadastro, não texto livre: use o seletor.',
    },
    {
      sintoma: "O seletor de motivo está vazio.",
      acao: 'O aviso é "Nenhum motivo de descarte está cadastrado. Enquanto isso, o descarte não pode ser registrado. Peça o cadastro em Motivos De Descarte, na administração." Sem a lista o descarte não acontece.',
    },
    {
      sintoma: "O sistema pede a pretensão salarial.",
      acao: 'A frase é "Este motivo pede a pretensão salarial do candidato. Informe o valor pretendido." O motivo escolhido é marcado para pedir o valor: preencha o campo que apareceu, ou escolha outro motivo.',
    },
    {
      sintoma: "O sistema diz que o motivo não pede pretensão salarial.",
      acao: 'A frase é "Este motivo não pede pretensão salarial. Escolha o motivo que pede o valor, ou envie o desfecho sem ele." Trocar de motivo limpa o valor digitado de propósito, para ele não viajar carimbado com o motivo errado.',
    },
    {
      sintoma: "O sistema diz que tirar esta pessoa da vaga é ação de Master.",
      acao: 'A frase é "Tirar da vaga um candidato cuja posição já foi entregue é ação de Master. Peça o desvínculo a quem tem esse papel." A posição dela já foi entregue, e desfazer uma entrega é decisão de Master.',
    },
    {
      sintoma: "O sistema diz que a candidatura já foi encerrada.",
      acao: 'A frase é "Esta candidatura já foi encerrada e não recebe um segundo desfecho. Para trazer a pessoa de volta, aloque-a de novo na vaga." Quem já saiu não recebe outro desfecho por cima: o motivo original é preservado.',
    },
    {
      sintoma: "O botão de confirmar o desvínculo está cinza.",
      acao: "Falta o motivo. O botão só libera com pelo menos dois caracteres escritos, ou com um motivo escolhido na lista, e com a pretensão preenchida quando o motivo pede o valor.",
    },
  ],
  regras: [
    "As duas saídas tiram a pessoa da vaga: a posição volta a ficar livre e a pessoa volta para o banco de candidatos.",
    "O motivo é obrigatório nas duas, e é ele que o histórico vai mostrar meses depois para quem não participou do processo.",
    "No descarte o motivo é uma classificação do cadastro de motivos. Na desistência é texto livre.",
    "Motivo marcado para pedir a pretensão salarial só pode ser usado numa saída individual, porque o valor é de cada pessoa, nunca de um lote.",
    "Trocar de card limpa o motivo já digitado, para o texto de uma saída não ser gravado na outra.",
    "Tirar da vaga quem já entregou a posição é ação de Master.",
    "Quem já saiu não recebe um segundo desfecho, e trazer a pessoa de volta depois abre uma candidatura nova.",
    "A reprovação pelo cliente não é uma saída: ela não encerra ninguém e não libera posição.",
  ],
  relacionados: [
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "adicionar-candidatos-ao-funil-da-vaga",
    "ler-a-ficha-do-candidato",
    "manter-um-catalogo-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/MoverCandidaturaModal.tsx",
    "apps/frontend/src/components/as/candidatos/CampoMotivoDaSaida.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/frontend/src/lib/as-motivos-descarte.ts",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
