import type { Artigo } from "../../tipos";

/**
 * ─ REPROVAR O CANDIDATO PELO CLIENTE (N2, família `as-funil`) ───────────────────────────────────
 *
 * O CORAÇÃO DESTE ARTIGO É UMA DISTINÇÃO, e ela é a razão de o gesto existir: reprovado PELO
 * CLIENTE não é descartado PELA SELEÇÃO. Um é movimento (a pessoa volta ao começo do funil e segue
 * viva, podendo ser apresentada de novo), o outro é desfecho (encerra o processo dela). Antes deste
 * gesto, quem recebia a recusa do cliente tinha só dois caminhos, e os dois eram ruins: descartar
 * (que encerra quem não pediu para sair) ou mover de etapa à mão (que funciona e não deixa dito
 * quem recusou). O artigo aponta o irmão do desfecho por `relacionados`.
 *
 * O QUE ELE **NÃO** COBRE:
 *   . DESCARTAR, DESISTIR OU CONTRATAR, que são os desfechos e vivem em `registrar-a-saida-do-candidato`.
 *   . MARCAR A ETAPA como etapa de entrega ao cliente, que é administração do catálogo de etapas.
 *   . ESCOLHER PARA ONDE A PESSOA VOLTA: o destino é a etapa inicial do funil, resolvida pelo
 *     catálogo no servidor. Não há seletor, e dizer que há seria ensinar um controle que não existe.
 *
 * SEM PRINT, pelo mesmo motivo medido do irmão: a captura das telas de A&S foi vetada pela
 * auditoria de segurança, e na homologação as tabelas de candidato e de candidatura têm ZERO linha,
 * então o funil abre vazio e não há nada para fotografar. O texto nomeia cada controle pelo rótulo
 * que a tela escreve, para funcionar sem imagem.
 */
export const artigo: Artigo = {
  slug: "reprovar-o-candidato-pelo-cliente",
  titulo: "Reprovar O Candidato Pelo Cliente",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "as-funil",
  resumo:
    "Como registrar que o cliente recusou um candidato que foi apresentado a ele, o que acontece com a pessoa e com a vaga depois do registro, e por que isso não é o mesmo que descartar o candidato.",
  termos: [
    "cliente reprovou",
    "reprovado pelo cliente",
    "cliente recusou o candidato",
    "nao aprovou",
    "cliente nao quis",
    "voltar para a captacao",
    "reprovacao",
    "recusa do cliente",
  ],
  preRequisitos: [
    "A pessoa já precisa ter sido apresentada ao cliente: o registro vale para quem está numa etapa de entrega ao cliente.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Vagas pelo menu da lateral esquerda.",
      controles: ["Central De Vagas"],
    },
    {
      gesto: "Abra a vaga e encontre a pessoa na lista do funil.",
    },
    {
      gesto: "Na linha da pessoa, clique no ícone de mover de etapa.",
      detalhe:
        "A janela do funil reúne os gestos da candidatura. Role até a seção Reprovado Pelo Cliente.",
      controles: ["Mover de etapa", "Reprovado Pelo Cliente"],
    },
    {
      gesto: "Clique em Registrar reprovação.",
      detalhe:
        "A janela que abre já diz o que vai acontecer: a pessoa volta para a etapa inicial do funil e continua no processo.",
      controles: ["Registrar reprovação", "Registrar Reprovação Pelo Cliente"],
    },
    {
      gesto: "Escreva o que o cliente disse, se ele disse algo que valha guardar.",
      detalhe:
        "O texto é opcional de propósito: exigir justificativa aqui só faria todo mundo escrever a mesma palavra toda vez, e isso não é trilha.",
      controles: ["O que o cliente disse (opcional)"],
    },
    {
      gesto: "Confirme em Registrar reprovação, no rodapé da janela.",
      detalhe:
        "A pessoa passa para a etapa inicial na hora, e o histórico da candidatura guarda que a volta foi por reprovação do cliente, com quem registrou e quando.",
      controles: ["Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema diz que só é possível registrar reprovação pelo cliente para quem está numa etapa de entrega ao cliente.",
      acao: "A pessoa não está numa etapa em que ela foi apresentada ao cliente, então não há recusa do cliente a registrar. Mova a pessoa para a etapa de entrega antes, ou peça à administração para marcar a etapa como etapa de entrega ao cliente no catálogo de etapas do funil.",
    },
    {
      sintoma:
        "O sistema diz que a candidatura foi encerrada sem êxito e não anda mais no funil.",
      acao: "Quem já recebeu desfecho não se move. Para trazer a pessoa de volta ao processo, aloque-a de novo na vaga e registre a reprovação depois, se ela voltar a ser apresentada.",
    },
    {
      sintoma:
        "O sistema diz que a etapa inicial do funil é a mesma em que esta pessoa está, então não há para onde voltar.",
      acao: "O catálogo de etapas está com a mesma etapa marcada como inicial e como etapa de entrega ao cliente. Peça à administração para revisar as etapas do funil.",
    },
    {
      sintoma:
        "O sistema diz que a vaga não tem processo em andamento e não é possível registrar reprovação nela.",
      acao: "A vaga já foi fechada ou cancelada. Registrar a recusa do cliente depois disso contaria uma história que não aconteceu naquela ordem. Confira o status da vaga e reabra antes, se o processo precisar voltar a rodar.",
    },
    {
      sintoma: "A tela mostra Falha ao registrar a reprovação pelo cliente.",
      acao: "Nada foi gravado. Tente de novo. Se repetir, confira se a sua sessão continua aberta e avise a administração.",
    },
    {
      sintoma: "Eu registrei a reprovação e a pessoa continua aparecendo na vaga.",
      acao: "É o comportamento certo: reprovar pelo cliente não encerra ninguém. A pessoa volta para a etapa inicial e segue no funil, pronta para ser trabalhada de novo. Quem precisa sair do processo é registrado como saída, que é outro gesto.",
    },
  ],
  regras: [
    "Reprovado pelo cliente é movimento, não desfecho: a pessoa segue viva no funil e pode ser apresentada de novo.",
    "Descartado pela seleção é outra coisa: ele encerra o processo da pessoa naquela vaga, e tem caminho próprio.",
    "O destino é sempre a etapa inicial do funil, definida no catálogo de etapas. Não existe escolher para onde a pessoa volta.",
    "A posição da vaga não é mexida: quem ocupa posição é quem foi entregue, e a reprovação não muda isso.",
    "Tirar da etapa de entrega o último candidato que estava lá pode fazer a vaga deixar de estar entregue e voltar a aberta.",
    "O registro fica no histórico da candidatura marcado como reprovação do cliente, com autor e data. O texto do que o cliente disse é opcional e pode ser apagado com o tempo pela rotina de retenção de dados, mas a marcação da reprovação continua.",
  ],
  relacionados: [
    "registrar-a-saida-do-candidato",
    "mover-o-candidato-de-etapa",
    "marcar-a-entrevista-do-candidato",
    "enviar-a-shortlist-ao-cliente",
    "trazer-o-candidato-de-volta",
    "abrir-o-painel-da-vaga",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/ReprovarPeloClienteModal.tsx",
    "apps/frontend/src/components/as/candidatos/MoverCandidaturaModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
