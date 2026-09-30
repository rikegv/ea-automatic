import type { Artigo } from "../../tipos";

/*
 * FICHA DE CATÁLOGO: os Motivos De Cancelamento De Vaga.
 *
 * O QUE ELA COBRE: o que este catálogo GOVERNA (a lista oferecida quando alguém cancela uma vaga) e
 * o efeito de renomear e de inativar, que aqui é diferente do dos catálogos vizinhos, porque o que
 * fica gravado na vaga cancelada é o TEXTO do motivo.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A MECÂNICA dos catálogos, que está em `manter-um-catalogo-do-sistema`.
 *   . O CANCELAMENTO DA VAGA em si, que tem peça própria e é de outra frente.
 *   . REORDENAR E EXCLUIR: esta tela não tem nem um nem outro, e apontar para a peça transversal
 *     mandaria o leitor procurar dois botões que não existem aqui.
 */
export const artigo: Artigo = {
  slug: "o-catalogo-de-motivos-de-cancelamento",
  titulo: "O Catálogo De Motivos De Cancelamento",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/motivos-cancelamento"],
  menus: ["as-motivos-cancelamento"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "catalogo-as",
  resumo:
    "O que o catálogo de motivos de cancelamento governa: a lista obrigatória oferecida quando uma vaga é cancelada, e o que muda nas vagas já canceladas quando alguém renomeia um motivo.",
  termos: [
    "motivo de cancelamento",
    "por que a vaga caiu",
    "cancelar vaga",
    "criar motivo de cancelamento",
    "motivo nao aparece no cancelamento",
    "vaga cancelada",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Motivos De Cancelamento De Vaga pelo Menu Gerencial e leia a lista pela coluna Motivo.",
      detalhe: "A coluna Status diz quais motivos ainda são oferecidos no cancelamento.",
      controles: ["Motivo", "Status"],
    },
    {
      gesto: "Para acrescentar um motivo, digite o nome no campo do topo e clique em Acrescentar motivo.",
      detalhe: "Ele nasce ativo e passa a aparecer no seletor do cancelamento da vaga.",
      controles: ["Nome do motivo novo *", "Acrescentar motivo"],
    },
    {
      gesto: "Para corrigir uma grafia, clique em Renomear na linha e salve em Salvar nome.",
      detalhe:
        "A correção vale do momento em diante. As vagas canceladas antes dela continuam com o texto que foi gravado nelas.",
      controles: ["Renomear", "Novo nome do motivo *", "Salvar nome", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Renomeei um motivo e as vagas canceladas antes continuam com o nome antigo.",
      acao: "É o comportamento correto: o que fica gravado na vaga cancelada é o texto do motivo, e não a linha do catálogo. A vaga cancelada em janeiro continua dizendo exatamente por que foi cancelada.",
    },
    {
      sintoma: "Não encontro o botão de excluir nesta tela.",
      acao: "Ela não tem. O caminho de tirar um motivo de circulação é inativar, e ele volta pelo reativar.",
    },
  ],
  regras: [
    "Cancelar uma vaga exige um motivo desta lista, e o texto digitado à mão não é aceito. Sem nenhum motivo ativo, nenhuma vaga pode ser cancelada.",
    "O que fica gravado na vaga cancelada é o texto do motivo. Por isso inativar um motivo aqui nunca deixa uma vaga antiga sem explicação.",
    "Inativar tira o motivo do seletor do cancelamento e não mexe em nenhuma vaga.",
    "Esta tela não apaga nem reordena: ela cria, renomeia, inativa e reativa.",
  ],
  relacionados: [
    "manter-um-catalogo-do-sistema",
    "o-catalogo-de-motivos-de-descarte",
    "o-catalogo-de-motivos-de-reenvio",
    "cancelar-a-vaga",
    "reabrir-uma-vaga",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/motivos-cancelamento/page.tsx",
    "apps/backend/src/as/motivos-cancelamento/motivos-cancelamento.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
