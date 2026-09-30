import type { Artigo } from "../../tipos";

/**
 * N2 DO MENU DO IFRACTAL: A LISTA DE STATUS DA FRENTE.
 *
 * ┌─ A CORREÇÃO DE PREMISSA DESTE ARTIGO, medida na tela e na rota ───────────────────────────────┐
 * │ NÃO EXISTE coluna mostrando quantas admissões usam cada status. A janela lista nome, a etiqueta  │
 * │ de quem conclui a frente e os botões, e nada mais: a rota que alimenta a lista devolve nome,     │
 * │ ordem e o marcador de concluinte, sem contagem nenhuma.                                        │
 * │                                                                                                 │
 * │ A CONTAGEM POR STATUS EXISTE, e aparece num lugar só: na RECUSA do Remover, que diz quantas      │
 * │ admissões estão naquele status e manda movê-las antes. A coluna "Admissões" da tabela de trás    │
 * │ conta por CLIENTE, e não por status, e confundir as duas leva a conclusão errada sobre o que     │
 * │ pode ser apagado. O artigo ensina a usar o Remover como a pergunta "quantos estão aqui?", que é   │
 * │ o que a tela de fato oferece hoje.                                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS TRAVAS QUE PARECEM DEFEITO E SÃO PROTEÇÃO ──────────────────────────────────────────┐
 * │ 1. RENOMEAR NÃO MOVE NINGUÉM. O nome que aparece muda; o registro interno de cada admissão      │
 * │    continua o mesmo. É por isso que renomear é seguro e apagar não é.                          │
 * │ 2. REMOVER É BARRADO duas vezes: quando alguma admissão está naquele status, e quando ele é o    │
 * │    que conclui a frente. As duas recusas dizem o que fazer antes.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO ENSINA A MOVER O STATUS DE UMA PESSOA: isso é a aba iFractal da Esteira, com artigo próprio.
 * Aqui se mexe na LISTA, não em quem está nela.
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a captura está suspensa enquanto a homologação não tiver arnês
 * sintético. Esta janela não mostra pessoa, mas segue a mesma liberação do motor, então o texto foi
 * escrito para funcionar sem imagem.
 *
 * §A.6: nenhum dado de pessoa.
 */
export const artigo: Artigo = {
  slug: "gerenciar-a-lista-de-status-do-ifractal",
  titulo: "Gerenciar A Lista De Status Do iFractal",
  modulo: "SOUL_ADM",
  rotas: ["/ifractal"],
  menus: ["ifractal"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "ifractal",
  resumo:
    "Como manter a lista de status da frente do iFractal: acrescentar, renomear, escolher qual status conclui a frente e por que o Remover é barrado quando há admissões usando o status.",
  termos: [
    "status do ifractal",
    "lista de status",
    "acrescentar status",
    "renomear status",
    "apagar status",
    "remover status",
    "status que conclui",
    "concluinte",
    "criar status novo",
    "quantas admissoes estao no status",
  ],
  preRequisitos: [
    "Combinar antes o nome do status com quem opera a frente: a lista é vista por todo mundo que trabalha a aba do iFractal.",
  ],
  passos: [
    {
      gesto: "Abra o iFractal e clique em Gerenciar Status, no canto superior direito.",
      detalhe: "A lista vive numa janela, e não no fim da página.",
      controles: ["iFractal", "Gerenciar Status"],
    },
    {
      gesto: "Leia a lista na ordem em que ela aparece.",
      detalhe:
        "É a mesma ordem que o seletor da aba do iFractal oferece. Um dos itens tem a etiqueta Conclui A Frente: é ele que fecha a frente quando alguém o escolhe na linha de uma pessoa.",
      controles: ["Conclui A Frente"],
    },
    {
      gesto: "Para criar, digite o nome no campo de baixo e clique em Acrescentar.",
      detalhe:
        "O status novo entra no fim da lista e nasce sem a marca de concluinte. O nome precisa ter ao menos uma letra ou número, e não pode repetir um que já existe.",
      controles: ["Nome do novo status", "Acrescentar"],
    },
    {
      gesto: "Para corrigir o nome, clique em Renomear, edite e clique em Salvar.",
      detalhe:
        "Renomear é seguro: o nome na tela muda e o registro interno de cada admissão não se move, então ninguém é deslocado de status por uma correção de texto.",
      controles: ["Renomear", "Salvar", "Cancelar"],
    },
    {
      gesto: "Para trocar qual status fecha a frente, clique em marcar como concluinte.",
      detalhe:
        "O link aparece só nos itens que ainda não concluem. Marcar um DESMARCA o anterior na mesma hora: a frente tem um único status que a conclui, nunca dois.",
      controles: ["marcar como concluinte"],
    },
    {
      gesto: "Use o Remover para descobrir quantas admissões estão num status.",
      detalhe:
        "Não há coluna de contagem por status nesta janela. Estando alguém no status, o Remover é recusado e a recusa diz o número e manda mover essas admissões antes. Estando vazio, o status é apagado.",
      controles: ["Remover"],
    },
    {
      gesto: "Feche a janela pelo Fechar.",
      detalhe:
        "Cada ação é gravada no clique, então não há nada a confirmar no fim. A janela não fecha por clique fora.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema responde: N admissões estão neste status. Mova elas para outro antes de remover.",
      acao: "É a proteção, e é também a resposta que você procurava: esse número é quantas admissões usam o status. Mova essas pessoas na aba iFractal da Esteira e só então remova.",
    },
    {
      sintoma:
        "O sistema responde: Este é o status que conclui a frente. Marque outro como concluinte antes de remover este.",
      acao: "A frente ficaria sem nenhum status que a fecha, e ninguém mais concluiria o iFractal. Marque outro item como concluinte e repita a remoção.",
    },
    {
      sintoma: "O sistema responde Já existe um status com esse nome.",
      acao: "Outro item da lista guarda o mesmo nome interno, mesmo que o texto na tela pareça diferente. Renomeie o que já existe, em vez de criar um segundo.",
    },
    {
      sintoma:
        "O sistema responde O nome precisa ter ao menos uma letra ou número, ou Informe o nome do status.",
      acao: "O campo está vazio ou só com pontuação e símbolos. Escreva um nome com letras.",
    },
    {
      sintoma: "O sistema responde Status não encontrado.",
      acao: "Aquele item já foi removido, possivelmente por outra pessoa. Feche e abra a janela outra vez para ver a lista vigente.",
    },
    {
      sintoma: "Renomeei um status e quero saber se as pessoas nele mudaram de lugar.",
      acao: "Não mudaram. O nome é do time, o registro interno é do sistema, e renomear mexe só no primeiro. A aba do iFractal passa a mostrar o nome novo para as mesmas pessoas.",
    },
    {
      sintoma: "Procuro nesta janela a contagem de admissões por status e não encontro.",
      acao: "Ela não existe aqui. A coluna Admissões da tabela de trás conta por cliente, não por status. A contagem por status aparece quando o Remover é recusado.",
    },
    {
      sintoma: "Criei um status e ele não aparece no seletor da aba do iFractal.",
      acao: "Recarregue a Esteira: o seletor lê a lista ao abrir a tela. O status novo entra no fim da ordem.",
    },
  ],
  regras: [
    "A lista de status da frente do iFractal é mantida pelo time, e é a única frente com lista editável.",
    "Um status, e só um, conclui a frente. Marcar outro como concluinte desmarca o anterior na mesma hora.",
    "Renomear muda o nome na tela e não desloca nenhuma admissão.",
    "Remover é barrado quando alguma admissão está no status, e a recusa informa quantas são.",
    "Remover também é barrado quando o status é o que conclui a frente.",
    "Nome novo não pode repetir um já existente, e precisa ter ao menos uma letra ou número.",
    "O status criado entra no fim da lista e nasce sem a marca de concluinte.",
    "Não há contagem por status nesta janela: a coluna Admissões da tela conta por cliente.",
  ],
  relacionados: [
    "configurar-o-tipo-de-marcacao-por-cliente",
    "gerenciar-as-credenciais-do-ifractal",
    "o-mapa-das-frentes-da-admissao",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/ifractal/page.tsx",
    "apps/backend/src/ifractal/ifractal-status.service.ts",
    "apps/backend/src/ifractal/ifractal.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
