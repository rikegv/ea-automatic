import type { FamiliaDeArtigos } from "../../tipos";

/**
 * FAMÍLIA: o funil da vaga, o que se faz COM O CANDIDATO dentro de uma vaga.
 *
 * Reúne os artigos que mexem na CANDIDATURA: adicionar ao funil, mover de etapa, finalizar a
 * posição, registrar a saída, enviar para a admissão, agir em massa, marcar a entrevista e
 * registrar a reprovação pelo cliente. Todos começam DENTRO do painel da vaga e tropeçam nas
 * MESMAS quatro coisas: a etapa que não está na lista porque o catálogo manda, o motivo que o
 * sistema cobra no desfecho, a vaga cheia, e o teto do lote.
 *
 * ┌─ A DISTINÇÃO QUE ESTA FAMÍLIA EXISTE PARA NÃO DEIXAR DIVERGIR ───────────────────────────────┐
 * │ Adicionar ao funil NÃO consome posição; finalizar consome. Os dez artigos desta família       │
 * │ precisam dizer a mesma coisa sobre isso, e é o tipo de regra que, escrita dez vezes, é         │
 * │ corrigida em quatro e esquecida em seis. Ela mora aqui uma vez.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As frases são as que o código escreve, letra por letra: a da vaga cheia sai de
 * `components/as/vagas/CandidatosPendentesModal.tsx` e o teto de 200 linhas por lote sai de
 * `AS_MAXIMO_POR_LOTE`, no contrato compartilhado, que a própria barra de lote anuncia antes de a
 * recusa chegar.
 */
export const familia: FamiliaDeArtigos = {
  codigo: "as-funil",
  rotulo: "O Funil Da Vaga",
  preRequisitos: [
    "Ter o menu Central De Vagas liberado para o seu usuário.",
    "A vaga já precisa estar publicada e aberta: o funil de uma vaga encerrada é só leitura.",
    "O candidato já precisa estar na base. Quem ainda não existe entra pela Central De Candidatos.",
  ],
  seDerErrado: [
    {
      sintoma: "A etapa que você procura não está na lista do seletor.",
      acao: "As etapas vêm do catálogo de etapas do funil, não de uma lista fixa desta tela. Etapa inativada no catálogo deixa de ser oferecida. Peça à administração para conferir o catálogo.",
    },
    {
      sintoma: "O sistema não deixa concluir sem preencher o motivo.",
      acao: "É assim de propósito nos três desfechos de saída, descartado, desistiu e contratado: o motivo é obrigatório. Escolha um motivo do catálogo ou escreva o seu, e só então confirme.",
    },
    {
      sintoma:
        "O sistema diz que a vaga já está com todas as posições preenchidas.",
      acao: "A vaga chegou à meta e não recebe mais entrega. Para encerrar este candidato, registre a saída dele como descartado ou desistiu, que são os dois caminhos que nunca esbarram na vaga cheia. Se a meta estiver errada, corrija as posições da vaga antes.",
    },
    {
      sintoma: "O lote recusou tudo e nada foi aplicado.",
      acao: "O sistema aplica no máximo 200 linhas por vez. Reduza a seleção e repita. Recusa do lote inteiro também acontece quando a vaga foi encerrada no meio do caminho: recarregue e confira a pill de status.",
    },
    {
      sintoma: "O lote foi aplicado em parte e algumas linhas ficaram de fora.",
      acao: "Abra O Que Ficou De Fora, no resultado do lote. Ele diz, linha por linha, quem não passou e por quê. Trate esses casos um a um.",
    },
    {
      sintoma: "A janela que você abriu não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não jogar fora o que você preencheu. Saia pelo Cancelar, pelo Fechar ou pela tecla Esc.",
    },
  ],
};
