import type { Artigo } from "../../tipos";

/**
 * ─ CORRIGIR A LIBERAÇÃO DE UMA VAGA REVISADA (N2, família `as-candidatos`) ──────────────────────
 *
 * O QUE ESTE ARTIGO COBRE: a aba Liberadas Recentemente, que existe por um motivo só, ser a REDE DE
 * SEGURANÇA de quem liberou com o cliente errado. Ela lista as vagas que JÁ saíram da fila pela
 * liberação, e é o único lugar em que a liberação se desfaz sem caçar a vaga no meio da Central De
 * Vagas inteira. Os dois gestos andam juntos na vida real (trocar o cliente e, às vezes, devolver a
 * vaga para a fila), e por isso eles moram numa janela só.
 *
 * O QUE ELE **NÃO** COBRE: a fila de pendentes e o gesto de liberar, que são
 * `revisar-uma-vaga-pendente-de-revisao`. Reabrir aqui a aula da fila faria duas redações da mesma
 * tela, e a aba de correção tem público e perfil diferentes.
 *
 * ┌─ SEM PRINT, E O MOTIVO REAL NÃO É O QUE ESTAVA ESCRITO AQUI ─────────────────────────────────┐
 * │ O texto anterior dizia "vetado pela auditoria de segurança" e "zero linha na homologação". As   │
 * │ duas afirmações caducaram em 30/09/2026: o diretor destravou a semeadura de dado sintético de   │
 * │ A&S, a base foi limpa e semeada, e o artigo irmão (o da FILA) passou a ter imagem.               │
 * │                                                                                                │
 * │ O QUE IMPEDE ESTE AQUI É OUTRA COISA, e ela é de PAPEL: a aba Liberadas Recentemente só é        │
 * │ desenhada para MASTER ou SUPER ADMIN, e a conta que tira os prints é COMUM. Não existe alvo na   │
 * │ tela para o motor alcançar, e promover a conta seria a fábrica se conceder acesso, que é         │
 * │ exatamente o que ela não faz. A decisão está com o diretor.                                     │
 * │                                                                                                │
 * │ FICA REGISTRADO PARA NÃO SER REINVESTIGADO: quando a conta de captura tiver o papel, este        │
 * │ artigo ganha imagem sem nenhuma mudança de dado. O texto abaixo funciona sem imagem.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: esta tela não mostra pessoa nenhuma. A linha é dado de processo, e o que a janela acrescenta
 * é a contagem de candidatos, nunca quem são.
 */
export const artigo: Artigo = {
  slug: "corrigir-a-liberacao-de-uma-vaga-revisada",
  titulo: "Corrigir A Liberação De Uma Vaga Revisada",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas-pendentes-revisao"],
  menus: ["as-vagas-revisao"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "as-candidatos",
  resumo:
    "O que fazer quando uma vaga foi liberada para o cliente errado: como trocar o cliente de uma vaga já liberada e, quando for o caso, devolver a vaga para a fila de revisão para ela ser conferida do zero.",
  termos: [
    "liberei com o cliente errado",
    "corrigir liberacao",
    "trocar o cliente da vaga",
    "desfazer liberacao",
    "devolver vaga para a fila",
    "vaga liberada errada",
    "cliente errado na vaga",
    "vagas liberadas recentemente",
  ],
  preRequisitos: [
    "Ter perfil Master ou Super Admin: a aba da correção aparece só para quem pode corrigir.",
    "A vaga precisa ter saído da fila pela liberação e continuar aberta.",
    "Saber qual é o cliente certo daquela vaga.",
  ],
  passos: [
    {
      gesto: "Abra Liberar Vaga pelo menu da lateral esquerda.",
      controles: ["Liberar Vaga"],
    },
    {
      gesto: "Clique na aba Liberadas Recentemente.",
      detalhe:
        "Ela lista as vagas que já saíram da fila pela liberação, com o número delas no próprio rótulo da aba. A aba Pendentes De Revisão continua sendo a fila de trabalho.",
      controles: ["Liberadas Recentemente", "Pendentes De Revisão"],
    },
    {
      gesto: "Encontre a vaga pela busca ou pelo cabeçalho das colunas.",
      detalhe:
        "As colunas são as mesmas da fila: Vaga, Nome De Divulgação, Cargo, Cliente, Cidade, Posições, Candidatos e Entrada. Candidatos é quanta gente já está naquele processo, e é o que dimensiona a correção.",
      controles: [
        "Nome De Divulgação",
        "Cidade",
        "Posições",
        "Candidatos",
        "Entrada",
        "Buscar por vaga, cargo ou cliente",
      ],
    },
    {
      gesto: "Clique em Corrigir liberação, na linha da vaga.",
      detalhe:
        "A janela Corrigir A Liberação começa mostrando a vaga, o nome de divulgação, o cliente atual e quantos candidatos estão em processo, para a decisão ser tomada olhando o tamanho dela.",
      controles: [
        "Corrigir liberação",
        "Corrigir A Liberação",
        "Cliente atual",
        "Candidatos em processo",
      ],
    },
    {
      gesto: "Escolha o cliente certo no seletor Cliente.",
      detalhe:
        "O seletor tem busca e aceita também o código do cliente. O apoio ao lado do nome desempata os clientes com razão social repetida.",
      controles: ["Cliente"],
    },
    {
      gesto:
        "Marque Devolver a vaga para a fila de revisão, se a vaga precisar ser conferida de novo por inteiro.",
      detalhe:
        "Marcado, a vaga volta a aparecer como pendente e precisa ser liberada outra vez. Sem marcar, só o cliente é trocado e a vaga segue rodando na operação.",
      controles: ["Devolver a vaga para a fila de revisão."],
    },
    {
      gesto: "Clique em Salvar correção.",
      detalhe:
        "A correção fica registrada com autor, data e o cliente anterior, então dá para responder depois quem trocou o quê.",
      controles: ["Salvar correção", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Eu não vejo a aba Liberadas Recentemente.",
      acao: "Ela aparece só para perfil Master ou Super Admin. Quem não corrige não vê a aba, para a tela não oferecer uma porta trancada. Peça a correção a quem tem o perfil.",
    },
    {
      sintoma: "A tela mostra Nenhuma vaga liberada pela revisão até agora.",
      acao: "Nenhuma vaga saiu desta fila por liberação, então não há liberação a corrigir. A aba lista apenas as vagas que passaram por aqui, e não a Central De Vagas inteira.",
    },
    {
      sintoma:
        "A tela diz que a correção precisa de um cliente.",
      acao: "Escolha para quem esta vaga é antes de salvar: uma vaga sem cliente é exatamente o estado que a fila existe para resolver, e a correção não pode recriá-lo.",
    },
    {
      sintoma:
        "O sistema diz que não há nada a corrigir.",
      acao: "Você salvou sem mudar nada: o cliente escolhido é o que já estava na vaga e a devolução não foi marcada. Escolha outro cliente, ou marque a devolução para a fila.",
    },
    {
      sintoma:
        "O sistema diz que só é possível desfazer a liberação de uma vaga aberta.",
      acao: "A vaga saiu do estado de aberta no meio do caminho: ela foi fechada, cancelada ou já devolvida à fila por outra pessoa. Recarregue a página e confira o status atual antes de tentar de novo. Vaga encerrada se resolve reabrindo a vaga, que é outro caminho e tem régua própria.",
    },
    {
      sintoma:
        "O sistema diz que esta vaga não foi liberada da fila de revisão.",
      acao: "A correção desfaz só o que esta fila fez. Vaga aberta por alguém aqui dentro, pela trilha normal, não entra nesta aba nem é empurrada para a fila do espelho: corrija os dados dela pela própria Central De Vagas.",
    },
    {
      sintoma: "A tela mostra Não foi possível corrigir a liberação.",
      acao: "Nada foi gravado. Tente de novo. Se repetir, confira se a sua sessão continua aberta e avise a administração.",
    },
  ],
  regras: [
    "A correção é restrita a perfil Master ou Super Admin, e quem recusa é o servidor, não a tela.",
    "Só se corrige o que esta fila liberou, e só enquanto a vaga estiver aberta.",
    "Trocar o cliente e devolver para a fila são decisões separadas: corrigir o cliente não tira a vaga da operação por conta própria.",
    "Devolver para a fila faz a vaga voltar a ser pendente, e ela precisa ser liberada de novo.",
    "Toda troca de cliente deixa registro com autor, data e o cliente anterior, mesmo quando a vaga não é devolvida para a fila.",
    "Os candidatos que já estão no processo continuam na vaga: a correção muda o cliente da vaga, não a candidatura de ninguém.",
  ],
  relacionados: [
    "revisar-uma-vaga-pendente-de-revisao",
    "ler-a-central-de-vagas",
    "abrir-o-painel-da-vaga",
    "reabrir-a-vaga-cancelada",
    "mover-o-status-da-vaga",
    "por-que-eu-nao-vejo-um-menu",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/as/vagas-pendentes-revisao/page.tsx",
    "apps/frontend/src/lib/as-vagas-revisao.ts",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
