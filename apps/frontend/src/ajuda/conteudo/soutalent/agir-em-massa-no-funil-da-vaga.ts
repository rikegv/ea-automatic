import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: a barra que aparece quando o consultor marca linhas na aba de candidatos
 * do painel da vaga, as quatro confirmações que ela abre (finalizar posição, mover no funil, enviar
 * para admissão e desvincular) e a leitura do resultado, que é a metade que costuma ser ignorada.
 *
 * O QUE ELA DELIBERADAMENTE NAO COBRE, e cada exclusão tem motivo:
 *   . COMO SE MARCA VARIAS LINHAS. É gesto de padrão do sistema inteiro, e existe artigo próprio
 *     ("agir-em-varias-linhas-de-uma-vez"). Reexplicar aqui criaria uma segunda redação do mesmo
 *     gesto, que é o que divergiria no primeiro ajuste da tabela.
 *   . AS ACOES UMA A UMA. Mover, finalizar, registrar saída e enviar para a admissão têm artigo
 *     cada um. Aqui só entra o que MUDA quando a ação é feita sobre uma seleção.
 *   . O TETO DO LOTE, A ETAPA FORA DO CATALOGO, O MOTIVO OBRIGATORIO E A VAGA CHEIA. Todos moram na
 *     família "as-funil", que é somada a este artigo na leitura.
 *   . A SHORTLIST, que também parte desta barra e tem artigo próprio, porque não é lote parcial:
 *     ela congela uma lista inteira ou recusa o envio inteiro.
 */
export const artigo: Artigo = {
  slug: "agir-em-massa-no-funil-da-vaga",
  titulo: "Agir Em Massa No Funil Da Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-funil",
  resumo:
    "Como aplicar o mesmo gesto a várias pessoas da vaga de uma vez: mover de etapa, finalizar posição, enviar para admissão, desvincular, e como ler quem ficou de fora.",
  termos: [
    "acao em massa",
    "em lote",
    "varios candidatos",
    "mover todos",
    "mover vários de etapa",
    "finalizar varias posicoes",
    "desvincular vários",
    "descartar em massa",
    "selecionar candidatos da vaga",
    "aplicar para todos",
    "quem ficou de fora",
  ],
  preRequisitos: [
    "As pessoas já precisam estar no funil desta vaga: a barra age sobre quem está na lista, nunca sobre quem está fora dela.",
  ],
  passos: [
    {
      gesto: "Abra o painel da vaga e vá para a aba Ver Candidatos.",
      detalhe:
        "A aba Ver Candidatos Alocados mostra só quem já entregou posição, então a seleção feita ali serve para gestos sobre entregas.",
      controles: ["Ver Candidatos", "Ver Candidatos Alocados", "Aberta"],
    },
    {
      gesto: "Marque as linhas das pessoas que vão receber o mesmo gesto.",
      detalhe:
        "A caixa do cabeçalho marca todas as que estão à vista e ainda aceitam decisão. Quem já saiu do processo fica com a caixa cinza e não entra.",
      controles: ["Selecionar todos os candidatos à vista que aceitam decisão", "limpar seleção"],
    },
    {
      gesto: "Escolha o gesto na barra que apareceu acima da tabela.",
      detalhe:
        "O número entre parênteses é o tamanho da seleção. Nenhum gesto aplica no clique da barra: cada um abre uma confirmação antes.",
      controles: [
        "Finalizar posição",
        "Mover no funil",
        "Enviar para admissão",
        "Desvincular da vaga",
      ],
    },
    {
      gesto: "Para mover no funil, escolha a etapa de destino e confirme.",
      print: {
        arquivo: "01-mover-no-funil-em-massa.png",
        legenda: "A janela de mover em massa: uma etapa de destino escolhida uma vez para o lote todo.",
      },
      detalhe:
        "A origem não é perguntada: cada pessoa sai de onde está. Quem já estiver na etapa escolhida volta na lista de falhas.",
      controles: ["Mover No Funil Em Massa", "Etapa De Destino", "Mover no funil"],
    },
    {
      gesto: "Para finalizar posição, escolha de qual lado da meta a entrega vai contar.",
      detalhe:
        "Cada cartão mostra quantas posições daquele lado já estão preenchidas. Escolher banco com posição oficial ainda aberta pede um aceite marcado, e o aceite fica no histórico de cada candidatura.",
      controles: ["Finalizar Posição Em Massa", "De Qual Lado Da Meta", "Finalizar posição"],
    },
    {
      gesto: "Para registrar a saída, escolha o desfecho e preencha o motivo.",
      print: {
        arquivo: "02-motivo-da-saida-em-massa.png",
        legenda: "A janela de desvincular em massa, com os dois desfechos e o motivo que vale para a seleção inteira.",
      },
      detalhe:
        "O motivo é um só e vale para a seleção inteira: ele é gravado no histórico de cada pessoa. No desvínculo o desfecho é Descartado Pela Seleção ou Desistiu Do Processo.",
      controles: [
        "Desvincular Em Massa",
        "Motivo Da Saída",
        "Descartado Pela Seleção",
        "Desistiu Do Processo",
        "Enviar Para Admissão Em Massa",
        "O Que A Admissão Precisa Saber",
      ],
    },
    {
      gesto: "Antes de confirmar, confira a lista de Quem Está Na Seleção.",
      print: {
        arquivo: "03-quem-esta-na-selecao.png",
        legenda: "A lista Quem Está Na Seleção, nome por nome, que é a última tela antes de gravar.",
      },
      detalhe:
        "Em massa é fácil marcar uma linha a mais sem perceber, e esta é a última tela antes de gravar.",
      controles: ["Quem Está Na Seleção", "Cancelar"],
    },
    {
      gesto: "Leia o resultado e abra O Que Ficou De Fora.",
      detalhe:
        "A etiqueta do resultado diz o que aconteceu: Lote Concluído, Lote Parcial ou Nada Foi Aplicado. A tabela de falhas diz, linha por linha, quem não passou e por quê.",
      controles: [
        "O Que Ficou De Fora",
        "Lote Concluído",
        "Lote Parcial",
        "Nada Foi Aplicado",
        "Fechar",
      ],
    },
    {
      gesto: "Trate um a um quem ficou de fora.",
      detalhe:
        "Quem não passou continua na vaga do jeito que estava e segue selecionável. As recusas que pedem uma confirmação sua são resolvidas na ação da própria linha.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A caixa de marcar de uma linha está cinza e não deixa marcar.",
      acao: "O processo daquela pessoa já terminou, então ela não aceita decisão nova e fica fora das ações em massa. A linha segue na lista como histórico.",
    },
    {
      sintoma: "O Finalizar posição não aparece na barra da seleção.",
      acao: "Ele só aparece quando alguém da seleção ainda pode receber posição. Se todas as marcadas já entregaram, o gesto não é oferecido.",
    },
    {
      sintoma:
        "A tela mostra Esta vaga já foi encerrada e não recebe posição nova. Recarregue a página para ver o estado atual da vaga.",
      acao: "A vaga foi fechada ou cancelada enquanto a seleção estava montada, e nada foi aplicado. Recarregue a página: se o encerramento estiver certo, não há mais posição a entregar nesta vaga.",
    },
    {
      sintoma:
        "A tela mostra Este motivo pede a pretensão salarial, e a pretensão salarial é de cada pessoa.",
      acao: "Esse motivo só existe no desvínculo individual, porque o valor é de cada uma. Escolha outro motivo para o lote, ou desvincule uma pessoa por vez pela ficha do candidato, informando o valor de cada uma.",
    },
    {
      sintoma: "O resultado veio como Nada Foi Aplicado.",
      acao: "Nenhuma linha foi gravada. Abra O Que Ficou De Fora e leia o motivo: quando ele repete para todos, o problema é da seleção ou da vaga, e não de cada pessoa.",
    },
    {
      sintoma: "O botão de confirmar está cinza.",
      acao: "Falta algo que a confirmação exige: a etapa de destino, o motivo, o aceite do banco com posição oficial aberta, ou a seleção tem mais linhas do que o sistema aplica de uma vez. O aviso do que falta aparece na própria janela.",
    },
  ],
  regras: [
    "Nenhum gesto da barra aplica no clique: cada um abre uma confirmação que diz quantas linhas serão tocadas.",
    "Finalizar posição em massa é o único gesto da barra que consome a meta da vaga.",
    "O lote é parcial: o sistema aplica o que couber e devolve o resto na lista de falhas, em vez de desfazer o que já deu certo.",
    "O motivo da saída é um só para a seleção inteira e é gravado no histórico de cada pessoa.",
    "A seleção morre quando o gesto é aplicado e quando você troca de aba: as abas mostram recortes diferentes das mesmas pessoas.",
  ],
  relacionados: [
    "agir-em-varias-linhas-de-uma-vez",
    "abrir-o-painel-da-vaga",
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "registrar-a-saida-do-candidato",
    "enviar-o-candidato-para-a-admissao",
    "enviar-a-shortlist-ao-cliente",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/AcoesEmMassaDaVaga.tsx",
    "apps/frontend/src/components/as/vagas/ResultadoLoteModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
