import type { Artigo } from "../../tipos";

/**
 * PADRÃO DO SISTEMA 6 de 14: EXPORTAR PARA PLANILHA.
 *
 * ┌─ A REGRA QUE MAIS SURPREENDE QUEM EXPORTA, E ELA É A RAZÃO DESTE ARTIGO ─────────────────────┐
 * │ A exportação leva o RECORTE ATUAL DA TELA, e não a tela inteira: quem esqueceu um filtro       │
 * │ ligado baixa um arquivo pela metade e só descobre na reunião. A própria janela diz quantas      │
 * │ linhas vão sair, e é essa frase que o artigo manda conferir antes de clicar.                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "exportar-a-lista-para-excel",
  titulo: "Exportar A Lista Para Excel",
  modulo: "COMECAR_AQUI",
  rotas: ["/gerenciador", "/esteira"],
  menus: [],
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como baixar em planilha o que está na tela, escolhendo quais colunas entram no arquivo, e por que o filtro ligado vai junto.",
  termos: [
    "exportar",
    "exportacao",
    "excel",
    "planilha",
    "xlsx",
    "csv",
    "baixar",
    "download",
    "relatorio",
    "extrair",
    "tirar relatorio",
    "mandar para o excel",
  ],
  preRequisitos: [
    "Estar na tela que tem o botão de exportar. Onde ele não aparece, aquela tela não exporta.",
    "Deixar a lista com o recorte que você quer levar: o arquivo sai com o filtro e a busca da tela.",
  ],
  passos: [
    {
      gesto: "Deixe a lista como você quer o arquivo.",
      detalhe:
        "Filtro, busca e card ligados valem para a exportação. Se você quer tudo, limpe os recortes antes.",
      controles: ["Limpar filtro"],
    },
    {
      gesto: "Clique em Exportar, no alto da tela.",
      detalhe: "O logo da planilha no botão é a pista de que ali sai arquivo, e não tela.",
      controles: ["Exportar"],
      print: {
        arquivo: "01-botao-exportar.png",
        legenda: "Passo 2: o botão que abre a janela de exportação.",
      },
    },
    {
      gesto: "Leia a frase do topo, que diz quantas linhas vão sair.",
      detalhe:
        "Ela avisa se o arquivo leva o recorte do filtro ou a lista inteira. É a conferência que evita baixar um relatório pela metade.",
      controles: ["Exportar Relatório"],
      print: {
        arquivo: "02-janela-de-exportacao.png",
        legenda: "Passo 3: a janela de exportação, com a quantidade de linhas e as colunas.",
      },
    },
    {
      gesto: "Marque as colunas que você quer no arquivo.",
      detalhe:
        "As colunas vêm agrupadas por assunto, e cada grupo abre e fecha. Há atalhos para marcar tudo, desmarcar tudo, tratar um grupo de uma vez e voltar à escolha padrão.",
      controles: [
        "Marcar todas",
        "Desmarcar todas",
        "Voltar ao padrão",
        "Marcar grupo",
        "Desmarcar grupo",
      ],
      print: {
        arquivo: "03-escolher-as-colunas.png",
        legenda: "Passo 4: os grupos de coluna, com o contador de quantas estão marcadas.",
      },
    },
    {
      gesto: "Clique em Exportar Em Excel e espere o arquivo baixar.",
      detalhe:
        "O botão fica escrito Gerando enquanto o arquivo é montado. Com muitas linhas isso leva alguns segundos.",
      controles: ["Exportar Em Excel", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão de exportar está apagado.",
      acao: "Ou nenhuma coluna está marcada, ou o arquivo já está sendo gerado. Marque ao menos uma coluna e espere o fim da geração.",
    },
    {
      sintoma: "O arquivo veio com menos linhas do que eu esperava.",
      acao: "Havia recorte na tela. Limpe filtro, busca e card, confira a frase do topo da janela e exporte de novo.",
    },
    {
      sintoma: "O arquivo não baixou.",
      acao: "O navegador pode ter bloqueado o download. Libere o download para este endereço e tente outra vez.",
    },
    {
      sintoma: "Falta uma coluna que eu preciso.",
      acao: "Clique em Marcar todas para sair com tudo. Se o dado não existe como coluna, peça a inclusão à administração.",
    },
  ],
  regras: [
    "A exportação leva o recorte atual da tela: filtro, busca e card ligados vão junto.",
    "Você escolhe quais colunas entram, e a escolha vale só para aquele arquivo.",
    "O arquivo sai com o que a tela mostra, no momento em que você pediu: ele não se atualiza depois.",
    "A planilha sai com dado de pessoa dentro. Ela é documento de trabalho interno, e o cuidado com o arquivo é seu.",
  ],
  relacionados: ["filtrar-uma-lista", "importar-uma-planilha", "ler-a-linha-da-tabela"],
  fontes: [
    "apps/frontend/src/components/gerenciador/ExportarRelatorioModal.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "apps/frontend/src/components/ui/ExcelLogo.tsx",
  ],
  revisadoEm: "2026-09-28",
};
