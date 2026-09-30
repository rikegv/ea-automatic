import type { Artigo } from "../../tipos";

/**
 * N2: recurso secundário da tela. Serve para um caso estreito e real, o de descobrir que o ARQUIVO
 * anexado está errado (kit de outra pessoa, kit de versão antiga) e querer substituí-lo.
 *
 * ELA É DESTRUTIVA E PARECE INOFENSIVA, e é por isso que existe artigo em vez de uma linha solta: a
 * troca desanexa o kit atual e, quando já há documento criado, encerra o documento e avisa o
 * funcionário. Quem lê "trocar" e espera um seletor de arquivo nesta tela não encontra nenhum: o kit
 * novo vem do Gerador De Kit, depois.
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE:
 *   - CANCELAR ISOLADO: artigo irmão. A diferença é o objetivo, não o efeito: cancelar encerra o
 *     documento, trocar encerra o documento PARA substituir o arquivo.
 *   - GERAR O KIT NOVO: acontece no Gerador De Kit, que tem artigo próprio. Aqui só se diz de onde
 *     ele vem.
 *
 * O aviso de retorno fica fora de `controles` porque carrega o nome da pessoa.
 */
export const artigo: Artigo = {
  slug: "trocar-o-kit-anexado",
  titulo: "Trocar O Kit Anexado",
  modulo: "SOUL_ADM",
  rotas: ["/assinaturas"],
  menus: ["assinaturas"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "assinaturas",
  resumo:
    "Como desanexar o kit errado de um candidato para colocar outro no lugar, e o que a troca faz com o documento de assinatura que já estava em andamento.",
  termos: [
    "trocar kit",
    "kit errado",
    "anexei o kit errado",
    "substituir kit",
    "tirar o kit",
    "desanexar kit",
    "kit de outra pessoa",
    "kit desatualizado",
  ],
  preRequisitos: [
    "Saber qual kit deve entrar no lugar. O kit novo não é escolhido nesta tela: ele vem do Gerador De Kit.",
  ],
  passos: [
    {
      gesto: "Abra o Ass. Click e confira o kit anexado pelo olho da linha, antes de trocar.",
      detalhe:
        "O olho abre o PDF que está anexado hoje. Vale conferir: se o arquivo certo já é aquele, não há troca a fazer.",
      controles: ["Ass. Click", "Ações", "Visualizar o kit anexado"],
    },
    {
      gesto: "Clique no ícone de troca de kit da coluna Ações.",
      detalhe:
        "Ele aparece em quem tem kit anexado ou documento criado, e não aparece em documento já encerrado.",
      controles: ["Trocar kit: cancela o atual e desanexa"],
    },
    {
      gesto: "LEIA o aviso da janela Trocar O Kit antes de confirmar.",
      detalhe:
        "Ele muda conforme o estado. Sem documento criado, ninguém é notificado, mas o kit anexado é descartado e o candidato sai da fila de assinatura. Com documento em andamento, o documento é cancelado e o funcionário é notificado. Com o contrato já assinado, um documento já assinado é cancelado e o funcionário é notificado. Em todos os casos o aviso termina lembrando que o kit novo entra pelo Gerador de Kit.",
      controles: ["Trocar O Kit?"],
    },
    {
      gesto: "Clique em Trocar kit para confirmar, ou em Voltar para desistir.",
      controles: ["Trocar kit", "Voltar"],
    },
    {
      gesto: "Leia o aviso de retorno, porque ele diz o que aconteceu de cada lado.",
      detalhe:
        "Ele confirma que o kit foi removido e diz se o documento foi cancelado também no serviço externo ou se o cancelamento não foi aceito lá. E termina com o próximo passo: enviar o kit novo pelo Gerador de Kit.",
    },
    {
      gesto: "Gere o kit certo no Gerador De Kit e envie para assinatura.",
      detalhe:
        "É esse envio que anexa o kit novo e devolve o candidato à fila Prontos Para Solicitar, apto a ser disparado.",
      controles: ["Prontos Para Solicitar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela avisa: Falha ao trocar o kit.",
      acao: "O pedido não completou. Recarregue a fila pelo Atualizar e confira o estado da linha antes de repetir: se o kit já foi desanexado, a troca aconteceu e falta só enviar o novo.",
    },
    {
      sintoma: "Troquei o kit e o candidato não voltou para a fila de disparo.",
      acao: "É o esperado: a troca desanexa e não coloca nada no lugar. O candidato volta à fila quando o kit novo for enviado pelo Gerador de Kit.",
    },
    {
      sintoma: "O ícone de troca não aparece na linha.",
      acao: "Documento já encerrado, cancelado ou expirado, não tem troca: ali não há kit anexado nem documento em andamento. Se aquela pessoa ainda precisa assinar, o caminho é o reenvio por correção.",
    },
    {
      sintoma: "O aviso diz que a Clicksign não aceitou o cancelamento do documento.",
      acao: "O cancelamento no serviço externo é uma tentativa e pode não ser aceito. O kit já foi desanexado e o registro desta tela é o que vale. Quando o serviço externo não cancela, ele também não avisa o funcionário: quem precisa que a pessoa saiba deve comunicá-la por outro caminho.",
    },
    {
      sintoma: "Eu só queria trocar o arquivo, não cancelar o contrato da pessoa.",
      acao: "Não há como fazer uma coisa sem a outra quando o documento já existe: o documento em andamento foi gerado a partir do kit antigo. Trocar o arquivo exige encerrar aquele documento e disparar outro depois, com o kit novo.",
    },
  ],
  regras: [
    "A troca desanexa o kit atual e não coloca nada no lugar. O kit novo vem do Gerador De Kit, e é o envio de lá que devolve o candidato à fila.",
    "Sem documento criado, a troca só descarta o kit e ninguém é notificado.",
    "Com documento criado, a troca também encerra o documento, e o cancelamento no serviço externo é uma tentativa que pode não ser aceita.",
    "Documento encerrado passa a ser consultado no recorte Cancelados E Expirados; quem nunca teve documento volta ao estado de quem ainda não tem kit.",
    "A troca não existe em documento já encerrado: ali não há kit anexado nem documento em andamento.",
    "Toda troca fica registrada com quem fez e em que estado o documento estava.",
  ],
  relacionados: [
    "ler-a-gestao-das-assinaturas",
    "cancelar-o-documento-na-clicksign",
    "reenviar-por-correcao-com-o-pdf-corrigido",
    "disparar-a-assinatura-de-um-candidato",
    "enviar-o-kit-para-assinatura",
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/assinaturas/page.tsx",
    "apps/backend/src/clicksign/clicksign-gestao.service.ts",
    "apps/backend/src/clicksign/clicksign.controller.ts",
    "apps/backend/src/domain/assinante-empresa.ts",
  ],
  revisadoEm: "2026-09-30",
};
