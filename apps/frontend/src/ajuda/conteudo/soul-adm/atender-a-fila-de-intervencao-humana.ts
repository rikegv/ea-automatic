import type { Artigo } from "../../tipos";

/**
 * N1 DO PORTAL: A FILA DE QUEM PAROU DE ANDAR SOZINHO.
 *
 * ┌─ O RECORTE DESTA PEÇA: COMO CHEGAR NA FILA, E NÃO COMO RESOLVER O DOCUMENTO ─────────────────┐
 * │ Quando o candidato esbarra três vezes no MESMO tipo de documento, aquela pendência deixa de ser │
 * │ dele e passa a ser do time. Este artigo ensina a montar essa fila, a ler as colunas que dizem   │
 * │ onde cada pessoa parou e a chegar na ficha dela. A CONFERÊNCIA do documento acontece na aba      │
 * │ Auditoria da Esteira, e ela tem artigo próprio: repetir a aula de auditar aqui criaria duas      │
 * │ versões da mesma regra, que é o defeito mais caro deste manual.                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A DIFERENÇA MEDIDA ENTRE O CARD E O FILTRO, e ela muda a conta do dia ──────────────────────┐
 * │ O card conta toda admissão com pendência na mão do time, inclusive a de quem já terminou a      │
 * │ entrega; a COLUNA e o FILTRO de situação dão preferência a "Concluiu" quando a coleta fechou    │
 * │ (`situacaoNoPainel`, em `domain/portal-painel.ts`, e `situacaoDaLinha`, em                      │
 * │ `lib/portal-painel.ts`). Ou seja: o número do card pode ser MAIOR do que a lista filtrada, e    │
 * │ isso não é defeito. Sem esta frase, quem confere os dois conclui que a tela erra a conta.       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TETO SAIU DO CÓDIGO: três reprovações no mesmo tipo de documento
 * (`TETO_REPROVACOES_POR_PENDENCIA`, em `domain/portal-tentativas.ts`).
 *
 * §A.6: a tela não mostra IP, navegador, localização nem contagem de tentativa, e não busca por CPF.
 * Nada disso é ensinado aqui porque nada disso está lá. Nenhum dado de pessoa neste arquivo.
 *
 * IMAGEM: pendência conhecida. A captura desta tela mostra gente, e a auditoria de segurança
 * recusou capturar tela com pessoa enquanto a homologação não tiver dado sintético. O texto foi
 * escrito para funcionar sem imagem.
 */
export const artigo: Artigo = {
  slug: "atender-a-fila-de-intervencao-humana",
  titulo: "Atender A Fila De Intervenção Humana",
  modulo: "SOUL_ADM",
  rotas: ["/admin/portal-links"],
  menus: ["portal-links"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "portal",
  resumo:
    "Como montar a fila dos candidatos que pararam de enviar documento sozinhos e passaram a depender do time, o que cada coluna diz sobre onde a pessoa parou, e por onde continuar o trabalho.",
  termos: [
    "intervencao humana",
    "caiu para o time",
    "candidato nao consegue mais enviar",
    "documento reprovado tres vezes",
    "acabaram as tentativas",
    "fila do time",
    "quem precisa de ajuda",
    "parou na trilha",
    "documento travado",
    "pendencia do time",
    "reprovou de novo",
  ],
  preRequisitos: [
    "Ter a aba Auditoria da Esteira disponível para você, porque é lá que a conferência do documento continua. Esta tela mostra quem precisa de gente, não decide o documento.",
  ],
  passos: [
    {
      gesto: "Abra o menu Portal Do Candidato e fique na vista Painel Do Portal.",
      controles: ["Portal Do Candidato", "Painel Do Portal"],
    },
    {
      gesto: "Clique no card Intervenção Humana para recortar a lista.",
      detalhe:
        "O card funciona como interruptor: aceso, ele recorta todos os candidatos, nas duas abas, inclusive os finalizados, e as abas ficam suspensas enquanto isso. Clique nele de novo para voltar ao normal.",
      controles: ["Intervenção Humana", "Encaminhados", "Em Andamento", "Concluído"],
    },
    {
      gesto: "Para uma fila só de trabalho vivo, use o filtro de situação em vez do card.",
      detalhe:
        "Abra o ícone de filtro da barra e escolha Intervenção Humana no campo Situação. O filtro aceita mais de um valor, então dá para somar Intervenção Humana e Não Acessou de uma vez. Diferente do card, o filtro deixa de fora quem já terminou a entrega, então a lista pode vir menor que o número do card.",
      controles: ["Situação", "Intervenção Humana", "Não Acessou", "Em Andamento", "Concluiu"],
    },
    {
      gesto: "Ordene pela coluna Situação, clicando no cabeçalho.",
      detalhe:
        "A ordenação por situação põe a fila de trabalho na frente: quem depende do time aparece antes de quem está andando sozinho e de quem já concluiu.",
      controles: ["Situação"],
    },
    {
      gesto: "Leia as três colunas que dizem onde a pessoa parou.",
      detalhe:
        "Documento Atual é o tipo de documento em que ela travou. Progresso é a barra de aceitos sobre obrigatórios, e diz o quanto falta da lista dela. Último Acesso mostra quando ela entrou pela última vez, e ajuda a separar quem tentou agora de quem desistiu há dias.",
      controles: ["Documento Atual", "Progresso", "Último Acesso", "Data De Admissão"],
    },
    {
      gesto: "Filtre por Documento Atual quando a fila tiver muita gente.",
      detalhe:
        "Tratar todos os travados no mesmo tipo de documento de uma vez é mais rápido que ir linha por linha, porque o critério de conferência é o mesmo. O filtro é múltiplo.",
      controles: ["Documento Atual"],
    },
    {
      gesto: "Abra o olho da linha para ver a ficha enxuta antes de agir.",
      detalhe:
        "É leitura pura: cliente, cargo, data de admissão, situação, documento atual, progresso da régua, último acesso, estado e origem do link. Serve para você confirmar que está tratando a pessoa certa sem sair da tela.",
      controles: [
        "Ver as informações deste candidato",
        "Informações Do Candidato",
        "Progresso Da Régua",
        "Documento Atual",
        "Fechar",
      ],
    },
    {
      gesto: "Continue o trabalho na aba Auditoria da Esteira, pelo nome da pessoa.",
      detalhe:
        "O documento dela chegou: o que acabou foi a chance de ela mesma resolver. A partir daqui quem decide o documento é o time, e o caminho é a aba Auditoria, onde a pendência pode ser conferida, reaberta ou devolvida para reenvio.",
      controles: ["Buscar por nome do funcionário", "Atualizar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O card mostra um número e a lista filtrada por situação traz menos gente.",
      acao: "Não é erro de conta. O card conta todo mundo com pendência na mão do time, inclusive quem já terminou a entrega; a coluna e o filtro de situação mostram Concluiu para quem fechou a lista. Para a fila de trabalho, use o filtro; para o tamanho do problema, use o card.",
    },
    {
      sintoma: "O candidato reclama que o portal não deixa mais ele enviar aquele documento.",
      acao: "É o comportamento esperado depois de três reprovações no mesmo tipo de documento, e não é punição. Explique que a conferência passou a ser feita pelo time e trate a pendência na aba Auditoria da Esteira.",
    },
    {
      sintoma: "A linha mostra Intervenção Humana e o Documento Atual está como não informado.",
      acao: "Não há próximo documento apontado naquela linha. Abra o olho para ver o progresso da régua e confira a lista inteira daquela admissão pela aba Auditoria da Esteira.",
    },
    {
      sintoma: "Resolvi a pendência na Esteira e a pessoa continua na fila desta tela.",
      acao: "O painel é uma fotografia do momento em que você o carregou. Clique em Atualizar para reler a situação de agora.",
    },
    {
      sintoma: "Quero saber quantas vezes a pessoa tentou aquele documento.",
      acao: "Esta tela não mostra contagem de tentativa, de propósito. O que ela diz é que a pendência caiu para o time. O histórico do documento fica na aba Auditoria da Esteira.",
    },
  ],
  regras: [
    "Três reprovações no mesmo tipo de documento tiram aquele documento das mãos do candidato e o passam para o time.",
    "O documento continua chegando: o que muda é quem decide sobre ele.",
    "O card conta o universo inteiro, nas duas abas somadas, e inclui quem já terminou a entrega. O filtro de situação mostra a fila de trabalho viva.",
    "A conferência do documento não acontece nesta tela: ela acontece na aba Auditoria da Esteira.",
    "O painel não se atualiza sozinho, então a fila que você está lendo é a do momento em que a tela carregou.",
    "Esta tela não mostra contagem de tentativa, IP, navegador nem localização, e a busca é por nome.",
  ],
  relacionados: [
    "acompanhar-a-conferencia-do-portal",
    "gerar-o-link-do-portal-para-o-candidato",
    "bloquear-e-desbloquear-o-acesso-do-candidato",
    "auditar-os-documentos-da-admissao",
    "reabrir-a-pendencia-de-um-documento",
    "solicitar-o-reenvio-dos-documentos",
    "ler-a-regua-obrigatoria-da-admissao",
    "filtrar-pelo-card-de-indicador",
    "ordenar-a-lista-pelo-cabecalho",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/portal-links/page.tsx",
    "apps/frontend/src/lib/portal-painel.ts",
    "apps/backend/src/domain/portal-painel.ts",
    "apps/backend/src/domain/portal-tentativas.ts",
    "apps/backend/src/portal/portal-painel.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
