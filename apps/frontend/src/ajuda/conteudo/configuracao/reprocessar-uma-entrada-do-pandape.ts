import type { Artigo } from "../../tipos";

/**
 * FICHA: o gesto de reprocessar uma entrada do Pandapé.
 *
 * COBRE o botão de reprocessar da linha, o botão de atualizar a fila, e o que acontece depois do
 * clique: o pedido é enfileirado e a resposta chega em segundo plano, então a tela não muda na
 * hora. É essa defasagem que faz alguém clicar três vezes seguidas achando que não pegou.
 *
 * NÃO COBRE a leitura das colunas nem o vocabulário da coluna Situação: isso é do artigo de leitura,
 * apontado em `relacionados`. Aqui o pressuposto é que a pessoa já sabe ler a linha e decidiu agir.
 *
 * NÃO COBRE o que o servidor faz ao reprocessar (a consulta ao Pandapé, a criação da admissão, a
 * régua de documentos). É comportamento de servidor, não gesto de tela, e descrevê-lo aqui seria
 * escrever um segundo manual do que a fila já resume em duas colunas.
 *
 * DEPENDÊNCIA DE CONFIGURAÇÃO: o reprocessamento consulta o Pandapé, então ele não conclui enquanto
 * a integração estiver sem credencial, que é o estado que a fila mostra como Inerte.
 */
export const artigo: Artigo = {
  slug: "reprocessar-uma-entrada-do-pandape",
  titulo: "Reprocessar Uma Entrada Do Pandapé",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/entradas-pandape"],
  menus: ["entradas-pandape"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "saude-da-ingestao",
  resumo:
    "Como mandar o sistema tentar de novo uma entrada que não virou admissão, como atualizar a fila depois e por que a entrada resolvida some da lista sozinha.",
  termos: [
    "reprocessar",
    "tentar de novo",
    "refazer a entrada",
    "puxar de novo do pandape",
    "trazer o candidato",
    "reenviar entrada",
    "falhou e quero repetir",
    "candidato nao entrou",
  ],
  preRequisitos: [
    "Ter olhado o motivo da linha antes de reprocessar: motivo que depende da origem não se resolve com o clique.",
  ],
  passos: [
    {
      gesto: "Abra Entradas Do Pandapé e localize a linha que você quer tentar de novo.",
      detalhe:
        "Sem nome resolvido, use o identificador que aparece logo abaixo da coluna Candidato para ter certeza de que é a linha certa.",
      controles: ["Entradas Do Pandapé", "Candidato"],
    },
    {
      gesto: "Clique no botão de reprocessar, na coluna Ações da linha.",
      detalhe:
        "Ele manda o sistema consultar o Pandapé de novo pelo mesmo evento. A origem da linha não muda: nada é criado em duplicidade por causa do clique.",
      controles: ["Ações", "Reprocessar a entrada"],
    },
    {
      gesto: "Leia o aviso verde que aparece acima da tabela.",
      detalhe:
        "Ele confirma que o reprocessamento foi enfileirado. O trabalho acontece em segundo plano, então a linha não muda no mesmo instante.",
    },
    {
      gesto: "Aguarde alguns instantes e clique em atualizar a fila.",
      detalhe:
        "É o botão redondo ao lado do filtro. Ele recarrega a lista com o resultado mais recente.",
      controles: ["Atualizar a fila"],
    },
    {
      gesto: "Confira o resultado na coluna Situação da linha.",
      detalhe:
        "Deu certo, a entrada vira Admissão Criada, Pré-Admissão, Adotado ou Já Conhecido e sai da fila sozinha, sem ninguém dar baixa. Continuou pendente, a situação e o motivo dizem o que ainda falta.",
      controles: ["Situação", "Motivo", "Tentativas"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Você clicou e a linha continua igual.",
      acao: "O reprocessamento roda em segundo plano e não muda a tela no ato. Espere alguns instantes e clique em atualizar a fila. Não adianta clicar várias vezes seguidas.",
    },
    {
      sintoma: "O botão de reprocessar está apagado e não aceita o clique.",
      acao: "Aquela linha chegou sem o identificador do Pandapé, então não há o que consultar. Passe o mouse no botão para ver o aviso e escale para a administração.",
    },
    {
      sintoma: "A linha sumiu da fila depois de reprocessar.",
      acao: "É o resultado esperado quando dá certo: a fila só mostra o que continua pendente. Para confirmar, marque as demais situações no filtro e procure a linha pelo identificador.",
    },
    {
      sintoma: "A situação virou Já Conhecido e você esperava uma admissão nova.",
      acao: "Aquele evento já tinha sido processado antes, então nada foi criado de novo. Procure o candidato pelo Gerenciador: ele já está no sistema.",
    },
  ],
  regras: [
    "Reprocessar repete a consulta do mesmo evento. Clicar duas vezes não cria duas admissões.",
    "O pedido é enfileirado: o resultado aparece depois, e só depois de atualizar a fila.",
    "A entrada resolvida sai da fila sozinha, sem ninguém dar baixa nela.",
    "Linha sem identificador do Pandapé não é reprocessável por esta tela.",
  ],
  relacionados: [
    "ler-a-fila-de-entradas-do-pandape",
    "ler-a-fila-de-divergencias-da-ingestao",
    "ler-o-diagnostico-do-sistema",
    "achar-uma-admissao-no-gerenciador",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/entradas-pandape/page.tsx",
    "apps/frontend/src/lib/pandape-entradas.ts",
    "apps/backend/src/pandape/pandape-entradas.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
