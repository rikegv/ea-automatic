import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: o cancelamento da vaga que não vai acontecer, o motivo de catálogo que ele
 * exige, a observação opcional, e o que acontece com quem ainda estava em processo naquela vaga.
 *
 * O QUE ELA DELIBERADAMENTE NAO COBRE:
 *   . REABRIR A VAGA CANCELADA, que é gesto próprio, com trilha própria, e tem peça própria. Quem
 *     está cancelando não está reabrindo, e misturar os dois num artigo só ensinaria a desfazer
 *     antes de ensinar a fazer.
 *   . FECHAR, que é a vaga que acabou e pergunta coisas completamente diferentes.
 *   . TRAZER O CANDIDATO DE VOLTA, que é o caminho de quem foi movido e precisa voltar a um processo.
 */
export const artigo: Artigo = {
  slug: "cancelar-a-vaga",
  titulo: "Cancelar A Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-vagas",
  resumo:
    "Como encerrar uma vaga que não vai acontecer, com o motivo registrado, e o que acontece com os candidatos que ainda estavam em processo nela.",
  termos: [
    "cancelar vaga",
    "vaga caiu",
    "cliente desistiu da vaga",
    "vaga cancelada",
    "nao vamos mais contratar",
    "vaga suspensa",
    "motivo do cancelamento",
    "remanejaram a vaga",
    "o que acontece com os candidatos da vaga cancelada",
  ],
  preRequisitos: [
    "O catálogo de motivos de cancelamento já precisa ter pelo menos um motivo cadastrado.",
  ],
  passos: [
    {
      gesto: "Abra o gesto Cancelar vaga na barra daquela vaga.",
      detalhe: "O gesto existe só na vaga viva: fechada e cancelada não o oferecem.",
      controles: ["Cancelar vaga"],
    },
    {
      gesto: "Leia os dois blocos de contexto antes de preencher.",
      detalhe:
        "O primeiro conta o que já aconteceu nesta vaga, com os processos que terminaram. O segundo diz para onde vai quem ainda está em processo. Nenhum dos dois trava o cancelamento.",
      controles: ["Cancelar Vaga", "Stand By"],
    },
    {
      gesto: "Escolha o motivo do cancelamento.",
      detalhe:
        "É obrigatório e vem do catálogo. É ele que responde, depois, por que estas vagas caem.",
      controles: ["Motivo do cancelamento"],
    },
    {
      gesto: "Escreva a observação, se houver algo do caso a registrar.",
      detalhe: "Opcional: o motivo classifica, a observação conta o caso.",
      controles: ["Observação"],
    },
    {
      gesto: "Confira a data do cancelamento.",
      controles: ["Data do cancelamento"],
    },
    {
      gesto: "Clique em Cancelar a vaga.",
      detalhe:
        "A vaga passa a Cancelada, sai das filas de trabalho e continua consultável no histórico com o motivo registrado.",
      controles: ["Cancelar a vaga", "Cancelada", "Voltar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Motivo de cancelamento inválido. Escolha um motivo da lista.",
      acao: "O motivo escolhido saiu de circulação enquanto a janela estava aberta. Recarregue a página e escolha um da lista atual.",
    },
    {
      sintoma:
        "A tela mostra Nenhum motivo de cancelamento está cadastrado. Cadastre em Menu Gerencial, Motivos De Cancelamento De Vaga.",
      acao: "Sem motivo cadastrado o cancelamento não acontece. Peça o cadastro em Motivos De Cancelamento De Vaga, no Menu Gerencial, e volte depois.",
    },
    {
      sintoma: "A tela mostra Esta vaga já foi encerrada. Recarregue a página.",
      acao: "Outra pessoa encerrou a vaga, ou o clique foi duplo. Recarregue e confira a pill de status: vaga encerrada não é cancelada de novo.",
    },
    {
      sintoma:
        "A tela mostra Não foi possível conferir quantos processos desta vaga já terminaram. O cancelamento continua disponível.",
      acao: "Só a contagem de contexto não voltou. O formulário segue inteiro e o cancelamento pode ser feito. Querendo o número antes de decidir, recarregue a página e abra de novo.",
    },
    {
      sintoma: "O botão de cancelar a vaga está cinza.",
      acao: "Falta o motivo ou a data do cancelamento. Os dois são obrigatórios e estão marcados com asterisco.",
    },
    {
      sintoma: "Cancelei a vaga e os candidatos dela desapareceram do meu trabalho.",
      acao: "Ninguém foi descartado. Quem estava em processo foi movido para a etapa Stand By, vivo, e continua encontrável na Central de Candidatos para ser transferido ou realocado depois.",
    },
  ],
  regras: [
    "Cancelar não é fechar: fechar é a vaga que acabou, cancelar é a vaga que não vai acontecer.",
    "O motivo é obrigatório e vem do catálogo; a observação é livre e opcional.",
    "Quem ainda está em processo vai para a etapa Stand By, vivo: ninguém é descartado pelo cancelamento.",
    "Cancelar vaga com candidato dentro é permitido para qualquer consultor.",
    "A vaga cancelada sai das filas de trabalho e continua consultável no histórico, com o motivo e a observação registrados.",
  ],
  relacionados: [
    "reabrir-uma-vaga",
    "fechar-a-vaga",
    "mover-o-status-da-vaga",
    "trazer-o-candidato-de-volta",
    "trocar-a-vaga-do-candidato",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/CancelarVagaModal.tsx",
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/frontend/src/lib/as-vaga-cancelamento.ts",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
