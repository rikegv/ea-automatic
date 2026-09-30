import type { Artigo } from "../../tipos";

/**
 * ─ MARCAR A ENTREVISTA DO CANDIDATO (N2, família `as-funil`) ────────────────────────────────────
 *
 * O QUE ESTE ARTIGO COBRE: marcar e remarcar a entrevista de UMA candidatura, dentro do painel da
 * vaga, e explicar POR QUE o controle aparece em algumas etapas e não em outras (quem responde é o
 * catálogo de etapas, e não uma lista fixa da tela).
 *
 * O QUE ELE **NÃO** COBRE, e é decisão de escopo:
 *   . MOVER de etapa. Marcar entrevista não move ninguém no funil, e o movimento tem artigo próprio
 *     (`mover-o-candidato-de-etapa`). Ensinar os dois aqui juntaria dois gestos que o sistema
 *     separou de propósito.
 *   . MARCAR A ETAPA COMO "com entrevista" no catálogo. Isso é administração do catálogo de etapas,
 *     outra tela e outro perfil. O artigo diz que a marcação existe e onde ela mora, e para aí.
 *   . DESMARCAR. Não existe: o controle remarca, e a correção de data errada é a remarcação. A
 *     ausência é do produto, não do manual.
 *
 * SEM PRINT, E O MOTIVO É MEDIDO: a auditoria de segurança vetou a captura das telas de A&S, e na
 * homologação as tabelas de candidato e de candidatura têm ZERO linha. O painel da vaga abre vazio,
 * não há funil para fotografar, e print de tela vazia parece pronto, que é pior do que print
 * faltando. O texto foi escrito para funcionar sem imagem: cada passo nomeia o controle pelo rótulo
 * que a tela escreve.
 */
export const artigo: Artigo = {
  slug: "marcar-a-entrevista-do-candidato",
  titulo: "Marcar A Entrevista Do Candidato",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "as-funil",
  resumo:
    "Como registrar a data e o horário da entrevista de um candidato dentro do funil da vaga, como remarcar quando a data muda, e por que o campo da entrevista aparece em algumas etapas e não em outras.",
  termos: [
    "marcar entrevista",
    "remarcar entrevista",
    "agendar entrevista",
    "data da entrevista",
    "horario da entrevista",
    "entrevista com o cliente",
    "entrevista soulan",
    "mudou o dia da entrevista",
    "agenda de entrevista",
  ],
  preRequisitos: [
    "A pessoa já precisa estar no funil da vaga: a entrevista é marcada na candidatura, não no cadastro do candidato.",
    "A etapa precisa estar marcada como etapa com entrevista no catálogo de etapas do funil. Quem faz essa marcação é a administração.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Vagas pelo menu da lateral esquerda.",
      controles: ["Central De Vagas"],
    },
    {
      gesto: "Abra a vaga da pessoa e vá até a lista do funil, dentro do painel da vaga.",
      detalhe:
        "A entrevista é marcada por candidatura, então o caminho passa sempre pela vaga em que a pessoa está.",
    },
    {
      gesto: "Na linha da pessoa, clique no ícone de mover de etapa.",
      detalhe:
        "É a mesma janela do movimento no funil. A entrevista fica logo abaixo dos cards de etapa, na seção Entrevista.",
      controles: ["Mover de etapa", "Entrevista"],
    },
    {
      gesto: "Preencha a data e o horário da entrevista no campo da seção Entrevista.",
      detalhe:
        "É um campo só, com dia e hora juntos. Registrar uma entrevista que já aconteceu é permitido: data no passado é aceita.",
      controles: ["Data e horário da entrevista"],
    },
    {
      gesto: "Clique em Marcar entrevista.",
      detalhe:
        "A marcação aparece na hora, numa linha com a etapa, a data e o nome de quem marcou. Nada se move no funil por causa disso.",
      controles: ["Marcar entrevista"],
    },
    {
      gesto:
        "Para mudar a data, volte à mesma janela e clique em Remarcar entrevista.",
      detalhe:
        "O campo abre já preenchido com o que está valendo, então dá para trocar só a hora. A marcação nova substitui a anterior daquela etapa, e quem remarcou passa a ser quem responde por ela.",
      controles: ["Remarcar entrevista"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A tela diz que a etapa atual não tem entrevista e o campo não aparece.",
      acao: "O campo é oferecido só nas etapas marcadas como etapa com entrevista no catálogo de etapas do funil. Mova a pessoa para uma dessas etapas, ou peça à administração para marcar a etapa no catálogo.",
    },
    {
      sintoma: "A seção Entrevista não aparece de jeito nenhum na janela.",
      acao: "Ela se esconde quando a etapa atual não oferece o campo e nada foi marcado ainda. Havendo qualquer entrevista já marcada, a lista continua à vista, mesmo em etapa que não oferece o campo.",
    },
    {
      sintoma:
        "O sistema diz que a candidatura foi encerrada e não recebe entrevista nova.",
      acao: "Quem saiu do processo não recebe marcação: seria agendar com alguém que já não está no funil. Para retomar, aloque a pessoa de novo na vaga e marque depois.",
    },
    {
      sintoma:
        "O sistema diz que a vaga não tem processo em andamento e não é possível marcar entrevista nela.",
      acao: "A vaga foi fechada ou cancelada. Entrevista marcada num processo terminado chamaria o time para um compromisso que não existe mais. Confira o status da vaga e, se ela precisar voltar a rodar, reabra a vaga antes.",
    },
    {
      sintoma: "A tela mostra Falha ao marcar a entrevista.",
      acao: "A gravação não foi concluída e nada foi registrado. Tente de novo. Se repetir, confira se a sua sessão continua aberta e avise a administração.",
    },
    {
      sintoma: "Eu quero apagar uma entrevista, e não achei como.",
      acao: "Não existe desmarcar: o que existe é remarcar. Corrija a data pelo mesmo campo. Para cancelar de verdade um compromisso, combine com quem vai atender e registre a decisão pelo caminho da etapa.",
    },
  ],
  regras: [
    "Cada etapa guarda uma marcação só: marcar de novo na mesma etapa substitui a data anterior.",
    "Marcar noutra etapa acrescenta, não substitui: dá para ter a entrevista interna e a entrevista com o cliente marcadas ao mesmo tempo.",
    "Marcar entrevista não move ninguém de etapa e não ocupa posição da vaga.",
    "Dá para marcar a entrevista do cliente enquanto a pessoa ainda está numa etapa anterior: é o caso normal de quem agenda com antecedência.",
    "Data no passado é aceita, porque registrar hoje a entrevista de ontem é caso comum.",
    "A marcação guarda quem marcou e quando, e quem remarca passa a ser o responsável pela data nova.",
  ],
  relacionados: [
    "mover-o-candidato-de-etapa",
    "reprovar-o-candidato-pelo-cliente",
    "abrir-o-painel-da-vaga",
    "enviar-a-shortlist-ao-cliente",
    "registrar-a-saida-do-candidato",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/EntrevistaDaCandidatura.tsx",
    "apps/frontend/src/components/as/candidatos/MoverCandidaturaModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
