import type { Artigo } from "../../tipos";

/**
 * N1 DO GERENCIADOR: A JANELA DE EXPORTAÇÃO.
 *
 * ┌─ O QUE ESTE ARTIGO NÃO REEXPLICA, E ISSO É METADE DA DECISÃO DE ESCOPO ───────────────────────┐
 * │ O GESTO de exportar já é artigo do módulo Começar Aqui, e é o mesmo em várias telas: o botão, o  │
 * │ arquivo que cai na pasta de downloads, o aviso de conclusão. Repeti-lo aqui criaria a segunda    │
 * │ explicação que diverge no primeiro ajuste do componente. O que só existe AQUI é o seletor de     │
 * │ COLUNAS por grupo, o que o arquivo herda do recorte da tela e o que ele nunca leva.              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O ARTIGO NÃO DIZ QUANTAS COLUNAS SÃO ────────────────────────────────────────────────┐
 * │ O catálogo é compartilhado entre a tela e o servidor (`packages/shared-types`), então coluna     │
 * │ nova entra nos dois no mesmo commit, e o número muda. O comentário do próprio componente diz     │
 * │ "113 colunas em 14 grupos" e a contagem de hoje é OUTRA, que é exatamente o defeito de escrever  │
 * │ número em texto: ele envelhece calado. O artigo aponta o CONTADOR que a janela mostra na tela.   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o artigo registra o que NUNCA sai no arquivo (banco, agência e conta do candidato, e o CPF da
 * pessoa substituída), porque relatório baixável é superfície coletiva e a minimização ali é decisão
 * do diretor, não omissão de catálogo. Nenhum dado de pessoa aparece neste arquivo.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: a captura está vetada pela auditoria de segurança enquanto a
 * homologação não tiver arnês sintético, e esta janela é aberta por cima de uma lista de gente.
 */
export const artigo: Artigo = {
  slug: "exportar-o-relatorio-do-gerenciador",
  titulo: "Exportar O Relatório Do Gerenciador",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "Como escolher exatamente quais colunas o relatório leva, o que o arquivo herda do filtro que está na tela e quais dados o sistema nunca exporta.",
  termos: [
    "exportar",
    "relatorio",
    "planilha",
    "excel",
    "baixar lista",
    "xlsx",
    "escolher colunas",
    "relatorio de candidatos",
    "extrair dados",
    "levar para o excel",
    "relatorio completo",
    "colunas do relatorio",
  ],
  preRequisitos: [
    "Deixar na tela o recorte que você quer no arquivo. O relatório sai com o filtro que está valendo, não com a tela inteira.",
  ],
  passos: [
    {
      gesto: "Deixe a lista com o filtro que você quer levar.",
      detalhe:
        "Busca, cards do topo e campos de filtro valem todos. O que está recortado na tela é o que vai para o arquivo.",
      controles: ["Limpar filtro"],
    },
    {
      gesto: "Clique em Exportar, no alto à direita.",
      detalhe:
        "A janela Exportar Relatório abre por cima da lista e já diz, na primeira linha, quantas admissões vão sair: as do filtro atual, ou todas, quando não há filtro na tela.",
      controles: ["Exportar", "Exportar Relatório"],
    },
    {
      gesto: "Leia o contador de colunas marcadas, logo abaixo do título.",
      detalhe:
        "Ele mostra quantas colunas estão marcadas e quantas existem. A janela abre com o padrão marcado, que é o nome e o telefone.",
    },
    {
      gesto: "Abra o grupo que interessa e marque as colunas uma a uma.",
      detalhe:
        "As colunas vêm agrupadas por assunto, e cada grupo mostra quantas das suas estão marcadas. Só os grupos que já têm coluna marcada nascem abertos, para a lista não virar uma rolagem sem fim.",
      controles: [
        "Dados Do Candidato",
        "Dados Da Admissão",
        "Dados De Vaga E Folha",
        "Uniforme E EPI",
        "Substituição",
        "Empresa E Cliente",
        "Vínculo E Entidade Soulan",
        "Benefícios",
        "Frentes Da Esteira",
        "Exame",
        "Integração",
        "Assinatura",
        "Controle Da Admissão",
        "Formulário De VT",
        "iFractal",
      ],
    },
    {
      gesto: "Para ir mais rápido, use Marcar grupo, Marcar todas ou Voltar ao padrão.",
      detalhe:
        "Marcar grupo é um interruptor e não mexe em nada fora daquele grupo: marcar um bloco não desmarca o que você já escolheu em outro. Com o grupo inteiro marcado, o mesmo botão passa a ler Desmarcar grupo. Voltar ao padrão devolve a marcação inicial.",
      controles: [
        "Marcar grupo",
        "Desmarcar grupo",
        "Marcar todas",
        "Desmarcar todas",
        "Voltar ao padrão",
      ],
    },
    {
      gesto: "Clique em Exportar Em Excel.",
      detalhe:
        "Enquanto o arquivo é montado o botão lê Gerando. Terminado, o aviso da tela diz com quantos candidatos o relatório saiu, e o arquivo cai na sua pasta de downloads com a data do dia no nome.",
      controles: ["Cancelar", "Exportar Em Excel", "Gerando…"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Aparece Marque pelo menos uma coluna para gerar o relatório.",
      acao: "Você desmarcou tudo. Marque ao menos uma coluna, ou clique em Voltar ao padrão para recomeçar do nome e do telefone.",
    },
    {
      sintoma: "Aparece Falha ao gerar o relatório.",
      acao: "O arquivo não foi montado e nada foi baixado. Tente de novo. Se repetir, reduza o recorte pelos filtros da tela e avise a administração.",
    },
    {
      sintoma: "O arquivo veio com muito mais gente do que eu esperava.",
      acao: "A janela avisa, na primeira linha, quantas admissões vão sair. Sem filtro na tela, sai a base inteira: feche, recorte a lista e exporte de novo.",
    },
    {
      sintoma: "O arquivo veio só com a página que estava na tela.",
      acao: "Não é o comportamento do relatório: ele leva o conjunto filtrado inteiro, e não a página aberta. Confira o número que a janela informou antes de exportar.",
    },
    {
      sintoma: "Procurei a conta bancária do candidato na lista de colunas e não achei.",
      acao: "Banco, agência e conta do candidato, e o CPF da pessoa substituída, não são exportáveis por decisão de proteção de dados. Eles ficam visíveis apenas na ficha da própria admissão.",
    },
    {
      sintoma: "Marquei um grupo e perdi o que eu já tinha marcado em outro.",
      acao: "Não é o que o botão faz: ele mexe só nas colunas daquele grupo. Confira o contador de marcadas e abra os grupos para ver o que está selecionado.",
    },
  ],
  regras: [
    "O relatório é leitura pura: exportar não altera nada no sistema.",
    "O arquivo leva o conjunto filtrado inteiro, não a página aberta na tela.",
    "O recorte é o da tela: busca, cards e filtros valem todos, sem nenhum filtro próprio da janela.",
    "A lista de colunas é a mesma que o sistema aceita, então coluna nova aparece aqui e sai na planilha sem ajuste.",
    "A janela abre com o nome e o telefone marcados, e Voltar ao padrão devolve essa marcação.",
    "Banco, agência e conta do candidato e o CPF da pessoa substituída nunca saem no arquivo: são visíveis só na ficha da própria admissão.",
    "O nome do arquivo carrega a data do dia, para o relatório de hoje não sobrescrever o da semana passada.",
    "Exportar é operação, não administração: quem entra na tela consegue exportar.",
  ],
  relacionados: [
    "exportar-a-lista-para-excel",
    "achar-uma-admissao-no-gerenciador",
    "filtrar-uma-lista",
    "filtrar-pelo-card-de-indicador",
    "ler-o-modal-de-pendencias-obrigatorias",
    "entender-o-farol-e-as-pendencias-obrigatorias",
  ],
  fontes: [
    "apps/frontend/src/components/gerenciador/ExportarRelatorioModal.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
    "packages/shared-types/src/index.ts",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/admissoes/admissoes.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
