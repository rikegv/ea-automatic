import type { Artigo } from "../../tipos";

/**
 * ─ MOVER A PESSOA DE ETAPA NO FUNIL DA VAGA ────────────────────────────────────────────────────
 *
 * ┌─ AS ETAPAS VÊM DO CATÁLOGO, E É ISSO QUE O ARTIGO PRECISA ENSINAR ──────────────────────────┐
 * │ A lista de etapas NÃO é fixa nesta tela: ela é cadastro da administração, com nome, ordem e   │
 * │ cor. Por isso o artigo não promete uma sequência de etapas nem cita "as cinco do funil": ele  │
 * │ ensina que a fileira de cards é o catálogo desenhado na ordem do processo, que etapa nova     │
 * │ aparece sozinha e que etapa inativada deixa de ser oferecida. Prometer a lista aqui seria     │
 * │ escrever um artigo que envelhece na primeira renomeação feita pelo diretor.                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DOIS GESTOS VIZINHOS MORAM AQUI COMO PASSO, E ISSO É DELIBERADO ───────────────────────────┐
 * │ "Voltar Para A Seleção" e "Desvincular Da Vaga" são seções da MESMA janela deste artigo, e   │
 * │ nenhuma das duas ganhou peça própria (decisão de escopo do coordenador). Elas entram como     │
 * │ PASSO: quem abriu a janela para mover alguém é quem encontra as duas, e mandá-lo a outro      │
 * │ artigo para entender o botão que está na tela na frente dele seria pior do que repetir.       │
 * │                                                                                               │
 * │ O DETALHE DO DESVÍNCULO (a escolha entre as duas saídas e o motivo obrigatório) continua      │
 * │ sendo do artigo `registrar-a-saida-do-candidato`. Aqui fica o AVISO que importa na hora de    │
 * │ clicar: desvincular não se desfaz.                                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE **NÃO** COBRE: os desfechos em si (saída, envio para a admissão), a finalização de
 * posição, a aprovação e a reprovação pelo cliente. Cada um tem a sua peça, e mover de etapa não
 * aprova nem encerra ninguém, que é justamente o que o artigo afirma.
 *
 * SEM ROTEIRO DE CAPTURA E SEM `print`: a janela mostra o nome da pessoa no cabeçalho, e a
 * liberação dessa superfície para o motor de captura está em auditoria.
 */
export const artigo: Artigo = {
  slug: "mover-o-candidato-de-etapa",
  titulo: "Mover O Candidato De Etapa",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-funil",
  nivel: "N1",
  publico: "AMBOS",
  resumo:
    "Como andar com a pessoa no funil da vaga, para frente ou para trás, de onde vêm as etapas oferecidas, onde fica o histórico da candidatura, e os dois gestos vizinhos: voltar para a seleção quem já foi enviado, e desvincular da vaga.",
  termos: [
    "mover etapa",
    "mudar etapa",
    "avancar etapa",
    "voltar etapa",
    "passar para triagem",
    "mandar para entrevista",
    "andar no funil",
    "mudar fase do candidato",
    "desfazer envio",
    "voltar para selecao",
    "tirar da vaga",
    "desvincular",
    "historico do candidato",
  ],
  preRequisitos: [
    "A pessoa já precisa estar no funil desta vaga. Quem ainda não está entra por Adicionar à vaga.",
  ],
  passos: [
    {
      gesto: "Ache a pessoa na aba Ver Candidatos, com a busca e os filtros da barra do recorte.",
      detalhe:
        "Buscar Por Nome procura na lista da vaga. Situação e Etapa aceitam mais de um valor ao mesmo tempo.",
      controles: ["Buscar Por Nome", "Situação", "Etapa", "Limpar o recorte"],
    },
    {
      gesto: "Clique no ícone Mover de etapa, na coluna de ações da linha.",
      print: {
        arquivo: "01-icone-mover-de-etapa.png",
        legenda: "A seta da coluna de ações, que abre a janela de movimento.",
      },
      detalhe: "É a seta. O rótulo aparece ao passar o mouse.",
      controles: ["Mover de etapa"],
    },
    {
      gesto: "Na seção Mover No Funil, clique no card da etapa de destino.",
      print: {
        arquivo: "02-cards-de-etapa.png",
        legenda: "Os cards da fileira do funil, cada um dizendo o que aquele clique significa.",
      },
      detalhe:
        "Cada card diz o que aquele clique significa: Avançar para cá, Voltar para cá, ou Etapa atual no lugar onde a pessoa está.",
      controles: ["Mover No Funil", "Avançar para cá", "Voltar para cá", "Etapa atual"],
    },
    {
      gesto: "Confira o nome das etapas na fileira de cards antes de escolher.",
      detalhe:
        "As etapas vêm do catálogo de etapas do funil, e não de uma lista fixa desta tela: etapa nova cadastrada pela administração aparece sozinha, na ordem do processo, e etapa inativada deixa de ser oferecida.",
      controles: ["Candidatura", "Etapa Cliente", "Stand By", "Contratado"],
    },
    {
      gesto: "Confirme em Mover na pergunta que abre.",
      detalhe:
        "Nenhum movimento acontece no clique do card. A pergunta diz de onde a pessoa sai e para onde ela vai.",
      controles: ["Mover"],
    },
    {
      gesto: "Confira a etapa na coluna Etapa da lista.",
      print: {
        arquivo: "03-coluna-etapa.png",
        legenda: "A coluna Etapa da lista, e o Fora Do Funil de quem já saiu do processo.",
      },
      detalhe:
        "Quem já saiu do processo não mostra etapa: a coluna passa a dizer Fora Do Funil, porque a etapa dele é memória e não posição atual.",
      controles: ["Fora Do Funil"],
    },
    {
      gesto: "Abra o ícone Ver a ficha para ler o histórico da candidatura.",
      detalhe:
        "Todo movimento fica registrado, com quem fez e quando, inclusive os que foram desfeitos depois.",
      controles: ["Ver a ficha"],
    },
    {
      gesto:
        "Para desfazer um envio para a admissão, use a seção Voltar Para A Seleção e clique em Voltar para a seleção.",
      detalhe:
        "A seção só existe para quem está enviado. A pessoa volta para a etapa em que parou, a posição dela fica livre na vaga, e o motivo do envio sai da ficha e continua no histórico.",
      controles: ["Voltar Para A Seleção", "Voltar para a seleção"],
    },
    {
      gesto: "Para tirar a pessoa da vaga, use a seção Desvincular Da Vaga, na mesma janela.",
      detalhe:
        "Desvincular não se desfaz: a posição volta a ficar livre, a pessoa volta para o banco de candidatos e trazê-la de volta depois é uma candidatura nova. A escolha do motivo é ensinada em Registrar A Saída Do Candidato.",
      controles: ["Desvincular Da Vaga"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que a candidatura já está na etapa escolhida.",
      acao: 'A frase é "Esta candidatura já está nesta etapa." O card da etapa atual aparece marcado e desabilitado: escolha outro destino.',
    },
    {
      sintoma: "O sistema recusa o movimento por causa da vaga.",
      acao: 'A frase é \'Esta vaga está em "Fechada" e não tem processo em andamento. A vaga acabou, então não é possível mover ninguém no funil dela.\', com o status que a vaga tem hoje. Ninguém anda no funil de uma vaga encerrada.',
    },
    {
      sintoma: "O sistema diz que a candidatura não anda mais no funil.",
      acao: 'A frase é "Esta candidatura foi encerrada sem êxito e não anda mais no funil. Para trazer a pessoa de volta, aloque-a de novo na vaga." Quem foi descartado ou desistiu não se move: para retomar, é uma candidatura nova.',
    },
    {
      sintoma: "A seção Voltar Para A Seleção não aparece.",
      acao: 'Ela existe só para quem está Enviado Para Admissão. Em qualquer outra situação a resposta seria "Esta candidatura não está enviada para admissão, então não há envio a reverter. Recarregue a página para ver a situação atual."',
    },
    {
      sintoma: "A seta de mover não aparece na linha da pessoa.",
      acao: "O processo dela já terminou. O aviso da linha diz: O processo desta pessoa já terminou, então ela não aceita decisão nova e fica fora das ações em massa. A linha segue na lista como histórico.",
    },
    {
      sintoma: "A fileira de cards do funil não aparece na janela.",
      acao: "A pessoa está encerrada, e a janela mostra só a frase do encerramento com o motivo registrado. Para retomar o processo, aloque a pessoa de novo na vaga.",
    },
  ],
  regras: [
    "O movimento é livre: avance, volte ou pule quantas etapas precisar. A operação real não é linear.",
    "Mover de etapa não aprova nem encerra ninguém: só registra onde a pessoa está no processo.",
    "Nenhum movimento acontece no clique do card: o sistema pergunta antes, e o card só escolhe o destino.",
    "As etapas oferecidas são as ativas do catálogo. Quem está parado numa etapa inativada continua aparecendo com o nome dela.",
    "Quem está com a posição entregue continua andando no funil como todo mundo.",
    "Voltar para a seleção é de qualquer consultor e só vale para quem está enviado para a admissão.",
    "Desvincular da vaga não se desfaz, e tirar da vaga quem já entregou posição é ação de Master.",
  ],
  relacionados: [
    "abrir-o-painel-da-vaga",
    "adicionar-candidatos-ao-funil-da-vaga",
    "registrar-a-saida-do-candidato",
    "enviar-o-candidato-para-a-admissao",
    "finalizar-a-posicao-da-vaga",
    "ler-a-ficha-do-candidato",
    "filtrar-uma-lista",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/MoverCandidaturaModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/frontend/src/lib/as-etapas.ts",
    "apps/frontend/src/lib/as-vaga-acoes.ts",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
    "apps/backend/src/as/etapas/etapas-funil.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
