import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA AUDITORIA, O GESTO DO SELETOR: pôr a frente em "Aguardando Reenvio Dos Docs".
 *
 * ┌─ O QUE ESTE ARTIGO COBRE, E ONDE ELE COMEÇA ─────────────────────────────────────────────────┐
 * │ Ele mora na FILA, no seletor da coluna de avanço, e não dentro da janela de documentos. O       │
 * │ artigo de auditar já ensina abrir a janela, enviar arquivo e ler veredito, e por isso aqui não  │
 * │ se reexplica nada disso: o assunto é o marcador de fila, que é o que o time usa para dizer      │
 * │ "estou esperando documento" sem concluir nem travar a frente.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FOI MEDIDO, E CONTRARIA A LEITURA INTUITIVA ─────────────────────────────────────────┐
 * │ MUDAR ESTE STATUS NÃO AVISA NINGUÉM. A transição de status da frente não dispara mensagem,    │
 * │ e-mail nem nada para o candidato: `esteira.service.ts` não toca em correio em caminho nenhum,  │
 * │ e o único efeito é o status da frente mais o evento da trilha. Quem devolve ao candidato o     │
 * │ direito de enviar de novo pelo Portal é a ação POR DOCUMENTO, que tem artigo próprio. Um       │
 * │ manual que sugerisse aviso automático faria o time deixar de ligar para a pessoa.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FICOU FORA, DE PROPÓSITO ────────────────────────────────────────────────────────────┐
 * │ O Portal do candidato (como ele recebe o link, o que ele vê, a conferência dos dados) tem       │
 * │ artigos próprios e é só apontado em `relacionados`. A devolução de envio documento a documento  │
 * │ e o destravamento do teto também: o primeiro é artigo irmão, o segundo é a peça de zerar as     │
 * │ tentativas, e repetir aqui criaria duas explicações da mesma regra.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM: pendência conhecida, não esquecimento. As telas desta frente mostram nome de pessoa, e a
 * captura foi vetada enquanto a homologação não tiver base sintética. Os prints entram em entrega
 * própria, então o texto foi escrito para funcionar sem nenhuma imagem.
 *
 * O seletor de status da linha fica sem `controles` pelo mesmo motivo dos artigos irmãos: o nome
 * acessível dele carrega o nome da pessoa. O que se declara são as opções e a coluna.
 */
export const artigo: Artigo = {
  slug: "solicitar-o-reenvio-dos-documentos",
  titulo: "Solicitar O Reenvio Dos Documentos",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como marcar na fila da Auditoria que o time está esperando documento do candidato, usando o status de aguardando reenvio, e como o candidato fica sabendo.",
  termos: [
    "pedir documento de novo",
    "pedir documento novamente",
    "candidato mandou errado",
    "documento errado",
    "reenvio",
    "reenviar documento",
    "aguardando reenvio",
    "esperando documento",
    "cobrar documento",
    "avisar o candidato",
    "documento faltando",
    "mudar status da auditoria",
    "status da auditoria",
    "voltar a auditoria",
  ],
  preRequisitos: [
    "Saber qual documento está errado ou faltando: quem decide isso é a leitura de cada documento na janela de auditoria.",
    "Ter um jeito de falar com a pessoa, porque a mudança de status não manda aviso nenhum.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e fique na aba Auditoria.",
      detalhe: "Ela já vem aberta quando você entra na tela.",
      controles: ["Esteira Admissional", "Farol Admissional", "AUDITORIA"],
    },
    {
      gesto: "Digite o nome, o CPF ou o cliente na busca do topo para achar a pessoa.",
      controles: ["Buscar por nome, CPF ou cliente"],
    },
    {
      gesto:
        "Abra o seletor de status na coluna Avanço / Auditoria e escolha Aguardando Reenvio Dos Docs.",
      detalhe:
        "A mudança é gravada na hora, sem confirmação, porque este status não conclui nada: a frente continua aberta e a linha continua na fila.",
      controles: ["Avanço / Auditoria", "Aguardando Reenvio Dos Docs"],
    },
    {
      gesto: "Confira a coluna Status da linha: ela passa a mostrar o rótulo que você escolheu.",
      detalhe:
        "Enquanto a frente está no status inicial, esse texto é calculado pelo progresso dos documentos. Posto por decisão do time, ele deixa de ser calculado e aparece exatamente como foi escolhido.",
      controles: ["Status"],
    },
    {
      gesto: "Fale com o candidato pelo canal de sempre e diga qual documento você precisa.",
      detalhe:
        "O sistema não manda mensagem quando o status muda. O status organiza a fila do time; o aviso à pessoa é do time.",
    },
    {
      gesto:
        "Se a pessoa vai reenviar pelo Portal, devolva o envio na linha daquele documento, dentro da janela de auditoria.",
      detalhe:
        "Isso é ação por documento e é o que reabre o envio do candidato. O status da fila, sozinho, não devolve envio nenhum.",
      controles: ["Auditar", "Solicitar reenvio"],
    },
    {
      gesto:
        "Para rever todo mundo que está nessa espera, clique no card Aguardando Reenvio Dos Docs no alto da tela.",
      detalhe:
        "O card funciona como filtro e liga e desliga no clique. Total na fila volta a mostrar a fila inteira.",
      controles: ["Aguardando Reenvio Dos Docs", "Total na fila"],
    },
    {
      gesto:
        "Quando o documento chegar e você auditar, deixe a frente fechar sozinha: não é preciso voltar o status à mão.",
      detalhe:
        "Com todos os obrigatórios validados, a Auditoria vai para Análise Finalizada por conta própria e a linha sai da fila.",
      controles: ["Análise Finalizada"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Mudei o status e o candidato não recebeu nada.",
      acao: "É o comportamento correto: nenhuma mudança de status da frente envia mensagem ao candidato. Fale com a pessoa pelo canal de sempre e, se ela precisa reenviar pelo Portal, devolva o envio na linha daquele documento, dentro da janela de auditoria.",
    },
    {
      sintoma: "A coluna Status parou de mostrar o andamento dos documentos.",
      acao: "Esperado. O texto calculado pelo progresso vale só para o status inicial da Auditoria: o que o time põe à mão é mostrado como foi escolhido, para uma decisão humana não ser mascarada por um cálculo. O andamento continua nas etiquetas de aprovados e reprovados abaixo do status.",
    },
    {
      sintoma: "O candidato reenviou, mas a linha continua em aguardando reenvio.",
      acao: "O status não se desfaz sozinho, e ele também não trava nada. Audite o documento que chegou: quando a régua obrigatória fechar, a frente vai para Análise Finalizada e o status antigo deixa de valer.",
    },
    {
      sintoma: "Escolhi Declinou no seletor sem querer.",
      acao: "Abre a janela de declínio, que encerra a admissão inteira e exige motivo. Clique em Cancelar: nada é gravado sem o motivo escolhido e sem a confirmação.",
    },
    {
      sintoma: "Quero desfazer e voltar ao status anterior.",
      acao: "Escolha o status inicial no mesmo seletor. Nenhum dos dois conclui a frente, então a volta é direta, e as duas mudanças ficam registradas na trilha com autor e data.",
    },
  ],
  regras: [
    "Aguardando reenvio não conclui a Auditoria e não tira a linha da fila: é um marcador de espera, não um avanço.",
    "Mudar o status da frente não envia mensagem, e-mail nem notificação ao candidato. Avisar a pessoa é do time.",
    "Quem devolve ao candidato o direito de enviar de novo pelo Portal é a ação por documento, dentro da janela de auditoria, nunca o seletor da fila.",
    "Toda mudança de status fica registrada com autor e data, e aparece na trilha da admissão.",
    "O texto da coluna Status só é calculado pelo progresso dos documentos quando a frente está no status inicial.",
    "A Auditoria fecha pela régua obrigatória completa, sozinha. Não é preciso desfazer este status à mão antes.",
  ],
  relacionados: [
    "auditar-os-documentos-da-admissao",
    "zerar-as-tentativas-de-auditoria",
    "reabrir-a-pendencia-de-um-documento",
    "ler-a-regua-obrigatoria-da-admissao",
    "gerar-o-link-do-portal-para-o-candidato",
    "acompanhar-a-conferencia-do-portal",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/domain/esteira.ts",
    "apps/backend/src/db/seed.ts",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
