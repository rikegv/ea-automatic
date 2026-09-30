import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: criar, renomear e excluir um status da vaga, e a RECUSA que é o fato
 * operacional mais importante desta tela: status com vaga dentro não sai de circulação, e status por
 * onde alguma vaga já passou não é apagado.
 *
 * A SEGUNDA RECUSA, que é a que mais parece defeito e não é: as linhas com PAPEL de sistema não
 * oferecem apagar nem tirar de circulação. Cada uma delas é a linha que uma operação do sistema
 * grava, e sem ela aquela operação para. Elas podem ser renomeadas.
 *
 * NENHUM NOME DE STATUS É CITADO: a lista é cadastrada e o diretor a renomeia. O que a ficha nomeia
 * são as COLUNAS da tela, que não mudam quando o dado muda.
 *
 * O QUE ELA DELIBERADAMENTE NÃO COBRE:
 *   . A COR do status, que tem peça própria em `escolher-a-cor-de-um-status-da-vaga`.
 *   . MOVER UMA VAGA de um status para outro, que é operação do dia a dia e é de outra frente.
 *   . OS COMPORTAMENTOS de cada linha, que esta tela mostra e que não foram pedidos nesta peça.
 */
export const artigo: Artigo = {
  slug: "manter-os-status-da-vaga",
  titulo: "Manter Os Status Da Vaga",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/as/status-vaga"],
  menus: ["as-status-vaga"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "catalogo-as",
  resumo:
    "Como criar, renomear e excluir um status da vaga, e por que o sistema recusa apagar um status que está em uso ou que exerce um papel de sistema.",
  termos: [
    "status da vaga",
    "criar status de vaga",
    "status novo nao aparece",
    "renomear status",
    "apagar status",
    "nao consigo excluir o status",
    "status em uso",
    "tirar status de circulacao",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Abra Status Da Vaga pelo Menu Gerencial e leia a tabela pelas colunas Status, Papel e Situação.",
      detalhe:
        "A coluna Papel é o que explica as recusas: a linha marcada como Da Administração é a que você criou e pode mexer por inteiro; as demais são gravadas por uma operação do sistema.",
      controles: ["Status", "Papel", "Situação", "Da Administração", "Em Circulação", "Fora De Circulação"],
    },
    {
      gesto: "Para criar, digite o nome do status no campo do topo e clique em Acrescentar status.",
      detalhe:
        "Ele nasce como status da administração. O registro interno sai do nome na criação e não muda depois.",
      controles: ["Nome do status novo *", "Acrescentar status"],
    },
    {
      gesto: "Para renomear, clique em Renomear na linha, ajuste o nome e clique em Salvar nome.",
      detalhe:
        "Renomear vale para qualquer linha, inclusive as de sistema, e não move nenhuma vaga: é o mesmo status com o nome corrigido, em todas as telas e em todo o histórico.",
      controles: ["Renomear", "Novo nome do status *", "Salvar nome", "Cancelar"],
    },
    {
      gesto: "Para apagar um status da administração, clique em Excluir e confirme.",
      detalhe:
        "Só apaga de verdade quando nenhuma vaga nunca passou por ele. Se alguma passou, ele é tirado de circulação; se alguma está nele agora, a exclusão é recusada.",
      controles: ["Excluir", "Excluir Status Da Vaga", "Tirar de circulação"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema diz que há vagas neste status.",
      acao: "Status com vaga parada nele não é apagado nem tirado de circulação. Mova essas vagas para outro status e tente de novo. O sistema diz quantas são.",
    },
    {
      sintoma: "Cliquei em Excluir e o status foi tirado de circulação em vez de apagado.",
      acao: "É o comportamento correto: alguma vaga já passou por ele, e apagar deixaria esse histórico sem nome. Ele sai dos seletores e continua identificando o passado.",
    },
    {
      sintoma: "Algumas linhas não oferecem excluir nem tirar de circulação.",
      acao: "São as linhas com papel de sistema. Cada uma é a que uma operação grava na vaga, e sem ela aquela operação para de funcionar. Elas podem ser renomeadas e mudar de cor e de ordem.",
    },
    {
      sintoma: "Criei um status e ele não aparece para onde eu queria mover a vaga.",
      acao: "Confira a situação dele na coluna Situação: fora de circulação, ele não é oferecido. Se estiver em circulação e ainda assim não aparecer, recarregue a tela da vaga, porque a lista é lida na abertura.",
    },
  ],
  regras: [
    "Status com vaga parada nele não é apagado nem tirado de circulação. O sistema recusa e diz quantas vagas precisam ser movidas antes.",
    "Status por onde alguma vaga já passou é tirado de circulação em vez de apagado, para o histórico continuar com o nome. Apagar de verdade só acontece quando nunca houve nenhuma.",
    "As linhas com papel de sistema não são apagadas nem tiradas de circulação em nenhuma hipótese, porque a operação que grava cada uma delas para sem ela. Renomear, colorir e reordenar continuam valendo nelas.",
    "Renomear não move nenhuma vaga: o registro interno é o mesmo, e o nome novo passa a aparecer em todas as telas e em todo o histórico.",
  ],
  relacionados: [
    "escolher-a-cor-de-um-status-da-vaga",
    "manter-um-catalogo-do-sistema",
    "reordenar-e-apagar-um-item-de-catalogo",
    "mover-o-status-da-vaga",
    "ler-a-central-de-vagas",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/as/status-vaga/page.tsx",
    "apps/backend/src/as/vaga-status/vaga-status.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
