import type { Artigo } from "../../tipos";

/**
 * N2 DO GERENCIADOR: EXCLUIR, E POR QUE QUASE NUNCA É ISSO QUE SE QUER.
 *
 * ┌─ O ARTIGO EXISTE PARA DESENCORAJAR, E ISSO É DELIBERADO ──────────────────────────────────────┐
 * │ A exclusão é um apagamento de verdade: a linha da admissão sai, e com ela saem, em cascata, os   │
 * │ estados dos documentos, as etapas, as não conformidades, o pacote de benefícios e os registros    │
 * │ ligados (medido nas referências de `admissoes.id` em `db/schema/tables.ts`: a esmagadora maioria  │
 * │ é cascata). Quem quer "tirar da fila" quer DECLINAR, que preserva tudo. Um manual que ensine o    │
 * │ gesto sem dizer isso, com todas as letras, é um manual que ajuda a perder histórico.             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A PRECISÃO QUE VALE, E QUE A TELA NÃO CONTA ─────────────────────────────────────────────────┐
 * │ A trilha de alterações NÃO é apagada: a referência dela à admissão é anulada, não removida       │
 * │ (`candidatoAlteracoesLog`, ON DELETE SET NULL, comentado como governança). Na prática, para quem  │
 * │ opera, isso é a mesma coisa que perder: o histórico deixa de ser alcançável, porque a ficha que   │
 * │ o mostrava não existe mais. O artigo diz as duas coisas, na ordem certa: não é consultável pela   │
 * │ tela, e não é isso que salva a decisão.                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO COBRE declinar (artigo irmão) nem a edição de dados. §A.6: nenhum dado de pessoa aqui. A
 * pergunta de confirmação da tela traz o nome de quem vai ser excluído, então só a parte ESTÁVEL
 * dela está declarada.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: a captura está vetada pela auditoria de segurança enquanto a
 * homologação não tiver arnês sintético.
 */
export const artigo: Artigo = {
  slug: "excluir-uma-admissao",
  titulo: "Excluir Uma Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "gerenciador",
  resumo:
    "O que a exclusão apaga, quem pode executá-la e por que, em quase todo caso, o caminho certo é declinar a admissão em vez de excluí-la.",
  termos: [
    "excluir",
    "apagar",
    "deletar",
    "remover admissao",
    "lixeira",
    "admissao duplicada",
    "cadastrei errado",
    "criei duas vezes",
    "desfazer cadastro",
    "tirar do sistema",
  ],
  preRequisitos: [
    "Ser Master ou Super Admin. Sem esse papel o ícone de lixeira não aparece na linha.",
    "Ter certeza de que o caso é duplicidade ou cadastro criado por engano. Desistência da pessoa não se resolve excluindo.",
  ],
  passos: [
    {
      gesto: "Antes de qualquer clique, decida entre declinar e excluir.",
      detalhe:
        "Declinar é o caminho de quase todo caso: a pessoa desistiu, não compareceu, o cliente cancelou. Excluir serve para o que nunca deveria ter existido, como uma admissão criada duas vezes para a mesma pessoa e a mesma vaga.",
    },
    {
      gesto: "Ache a admissão na lista e confira que é ela mesma, pela ficha.",
      detalhe:
        "Abra pelo olho e confira o cliente, o cargo e a data. A exclusão não tem desfazer, então a conferência é a única proteção que existe.",
      controles: ["Ações", "Ver ficha"],
    },
    {
      gesto: "Clique no ícone de lixeira, na coluna Ações.",
      detalhe:
        "Ele fica ao lado do olho e do lápis, e aparece só para Master e Super Admin. A dica do ícone lê Excluir.",
      controles: ["Ações", "Excluir"],
    },
    {
      gesto: "Leia a pergunta da janela Excluir Admissão até o fim.",
      detalhe:
        "Ela diz de quem é a admissão, avisa que a exclusão remove também documentos, etapas e não conformidades vinculadas, e afirma que a ação não pode ser desfeita. É a última chance de desistir.",
      controles: ["Excluir Admissão"],
    },
    {
      gesto: "Clique em Excluir para confirmar, ou em Cancelar para desistir.",
      detalhe:
        "Enquanto a exclusão acontece, o botão lê Processando. Terminada, a lista recarrega e o aviso confirma que a admissão foi excluída.",
      controles: ["Cancelar", "Excluir", "Processando…"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Não vejo o ícone de lixeira na linha.",
      acao: "A exclusão é restrita a Master e Super Admin. Se o caso é desistência, você não precisa dela: declinar resolve e é permitido a qualquer consultor.",
    },
    {
      sintoma: "A tela mostra Falha ao excluir.",
      acao: "A exclusão não foi aceita e nada foi apagado. Recarregue a página e confira se a admissão continua na lista antes de tentar de novo.",
    },
    {
      sintoma: "Aparece Admissão não encontrada.",
      acao: "Aquela admissão já não existe, ou a sua lista está velha. Recarregue a página.",
    },
    {
      sintoma: "Excluí e agora preciso do histórico daquela admissão.",
      acao: "Não há como reabri-lo pela tela: a ficha que mostrava o histórico não existe mais. Recadastrar cria uma admissão nova, sem o passado da antiga. É por isso que o caminho de encerrar é declinar.",
    },
    {
      sintoma: "Eu queria só tirar a pessoa da fila de trabalho.",
      acao: "Não exclua. Declinar tira a admissão de todas as filas e das contagens de pendência, e preserva o histórico para consulta. Se a parada for temporária, pause em vez de encerrar.",
    },
    {
      sintoma: "Existem duas admissões da mesma pessoa e eu não sei qual excluir.",
      acao: "Abra as duas pelo olho e compare cliente, cargo, data e o que já andou. Exclua a que não tem nada registrado, e nunca a que já tem documento auditado, exame ou contrato.",
    },
  ],
  regras: [
    "Na dúvida, declinar. O declínio encerra a admissão, tira ela das filas e das contagens de pendência e preserva tudo o que aconteceu. A exclusão não preserva nada.",
    "A exclusão remove a admissão e, com ela, os estados dos documentos, as etapas, as não conformidades e os demais registros ligados àquela admissão.",
    "A exclusão não tem desfazer, e o sistema não guarda uma cópia para recuperar depois.",
    "Depois de excluir, o histórico daquela admissão deixa de ser consultável pela tela, porque a ficha que o mostrava não existe mais.",
    "Excluir é restrito a Master e Super Admin. Declinar é permitido a qualquer consultor.",
    "Excluir a admissão não apaga o cadastro da pessoa: o candidato continua existindo e pode ser reaproveitado pelo CPF.",
    "Excluir serve para o que nunca deveria ter existido, como duplicidade de cadastro. Desistência, rescisão e cancelamento do cliente são declínio.",
  ],
  relacionados: [
    "declinar-uma-admissao",
    "pausar-e-retomar-uma-admissao",
    "achar-uma-admissao-no-gerenciador",
    "ler-a-ficha-da-admissao",
    "editar-os-dados-de-uma-admissao",
    "reaproveitar-um-candidato-pelo-cpf",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/components/ui/ConfirmDialog.tsx",
    "apps/backend/src/admissoes/admissoes.controller.ts",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/db/schema/tables.ts",
  ],
  revisadoEm: "2026-09-30",
};
