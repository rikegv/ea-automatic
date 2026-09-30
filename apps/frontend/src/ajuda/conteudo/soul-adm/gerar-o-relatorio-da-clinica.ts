import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA EXAME, 3 de 4: O ARQUIVO QUE VAI PARA A CLÍNICA.
 *
 * ┌─ O BOTÃO NÃO TEM PALAVRA NENHUMA, E É POR ISSO QUE O PASSO 3 EXISTE ─────────────────────────┐
 * │ Ele é SÓ o ícone de planilha, ao lado do filtro (`esteira/page.tsx`, aba Exame), e o nome      │
 * │ "Gerar relatório da clínica" vive no texto de apoio. Quem procura um botão escrito não acha, e │
 * │ quem acha o ícone com a fila sem seleção o encontra APAGADO, sem nada explicando por quê. As   │
 * │ duas coisas viraram passo e primeira linha do bloco de erros.                                  │
 * │                                                                                                │
 * │ NÃO REEXPLICA A SELEÇÃO MÚLTIPLA: a caixa da linha, a caixa do cabeçalho e o soltar tudo são   │
 * │ padrão do sistema e vivem em "agir-em-varias-linhas-de-uma-vez". Aqui fica só o que é próprio  │
 * │ desta fila: a poda da seleção quando a lista recarrega, e o que o arquivo leva.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS REGRAS QUE FAZEM O ARQUIVO NÃO BATER COM O QUE FOI MARCADO ─────────────────────────┐
 * │ Medidas em `resolverLinhas` (`esteira.service.ts`), e as duas são silenciosas:                 │
 * │   1. ESTÁGIO FICA DE FORA. Admissão cujo vínculo é de estágio é descartada sem aviso, porque   │
 * │      estágio não faz exame admissional. Marcar dez, sendo três de estágio, dá sete linhas.     │
 * │   2. UMA LINHA POR ENDEREÇO. Quem faz o exame em três lugares no mesmo dia sai em três linhas, │
 * │      cada uma com a clínica, o endereço e o horário dela. O arquivo tem MAIS linhas que        │
 * │      pessoas, e isso não é duplicidade.                                                        │
 * │ Sem essas duas no texto, a pessoa conta linhas, não fecha com a seleção e refaz o trabalho.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NÃO É A EXPORTAÇÃO DA LISTA, e confundir manda o arquivo errado para fora de casa ──────────┐
 * │ O artigo de padrão "exportar-a-lista-para-excel" ensina a exportação genérica, que leva o      │
 * │ recorte da tela. ESTE arquivo é outro: layout fixo combinado com a clínica, colunas próprias,  │
 * │ e ele sai da SELEÇÃO, nunca do filtro. O passo 5 diz isso com todas as letras.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a fila do Exame mostra pessoas, e a captura
 * das telas com pessoa está vetada enquanto a homologação não tiver arnês sintético. Os prints entram
 * em entrega própria; o texto nomeia cada controle por escrito para funcionar sem eles.
 *
 * §A.11: nenhum travessão. §A.6: o artigo NOMEIA as colunas do arquivo (uma delas é o documento, outra
 * é a data de nascimento) e não reproduz nenhum valor de ninguém.
 */
export const artigo: Artigo = {
  slug: "gerar-o-relatorio-da-clinica",
  titulo: "Gerar O Relatório Da Clínica",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como marcar candidatos na fila do Exame e baixar a planilha que vai para a clínica, por que o botão fica apagado sem seleção e por que o arquivo pode sair com mais linhas, ou menos, do que você marcou.",
  termos: [
    "relatorio da clinica",
    "planilha da clinica",
    "mandar para a clinica",
    "enviar candidatos para a clinica",
    "modelo de agendamento",
    "csv",
    "excel do exame",
    "lista para a clinica",
    "botao apagado",
    "gerar relatorio",
    "pedir exame",
    "agendar em massa",
  ],
  preRequisitos: [
    "Estar na aba Exame. O gerador de planilha da clínica existe só nesta fila.",
    "Saber quem vai no mesmo envio. A planilha sai da sua seleção, e não do filtro da tela.",
  ],
  passos: [
    {
      gesto: "Na Esteira Admissional, clique na aba Exame.",
      controles: ["EXAME"],
    },
    {
      gesto: "Marque na lista quem vai entrar no envio.",
      detalhe:
        "A caixa fica na primeira coluna de cada linha, e a do cabeçalho marca todas as linhas visíveis. Clientes diferentes podem ir no mesmo arquivo.",
      controles: ["Selecionar todos os candidatos da fila", "Selecionar todos", "Limpar seleção"],
    },
    {
      gesto: "Clique no ícone de planilha que fica ao lado do filtro, no topo da tela.",
      detalhe:
        "Ele não tem texto: passe o mouse e o apoio diz gerar relatório da clínica, com a quantidade de selecionados. Com zero marcados o ícone fica apagado, e o apoio pede para selecionar ao menos um candidato na fila.",
      controles: ["Gerar relatório da clínica"],
    },
    {
      gesto: "Aguarde o download e abra o arquivo.",
      detalhe:
        "A mensagem verde do topo confirma, dizendo quantos candidatos entraram. O arquivo sai em formato de planilha separada por ponto e vírgula, que o Excel em português abre direto.",
    },
    {
      gesto: "Confira as linhas antes de mandar para a clínica.",
      detalhe:
        "As colunas são fixas, no modelo combinado com a clínica: empresa, documento da empresa, código e nome do cliente, documento do cliente, nome, setor, cargo, documento do candidato, data de nascimento, agendamento, clínica, endereço, fornecedor e região. O arquivo é o recorte da sua seleção, nunca do filtro da tela, e leva dado pessoal: trate como documento restrito.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O ícone de planilha está apagado e não clica.",
      acao: "Nada está marcado na fila. Marque ao menos uma linha: o botão só acende com seleção, porque o arquivo sai do que você escolheu, não da lista inteira.",
    },
    {
      sintoma: "Marquei pessoas, a lista recarregou e a seleção diminuiu.",
      acao: "É de propósito: quem saiu da fila, por avanço de status ou por filtro, sai da seleção também, para o arquivo não levar quem já não está na etapa. Confira as marcações antes de gerar.",
    },
    {
      sintoma: "O arquivo saiu com menos linhas do que eu marquei.",
      acao: "Admissão de estágio não entra, porque estágio não faz exame admissional, e ela é descartada em silêncio. Admissão ainda sem cliente e cargo também fica fora: ela nem está na esteira.",
    },
    {
      sintoma: "O arquivo saiu com mais linhas do que eu marquei.",
      acao: "Não é duplicidade: quem tem mais de um endereço no mesmo dia sai em uma linha por endereço, cada uma com a sua clínica, o seu endereço e o seu horário.",
    },
    {
      sintoma: "As colunas de clínica, endereço e fornecedor saíram em branco.",
      acao: "Aquela pessoa ainda não tem agendamento lançado, então não há clínica a informar. Lance o agendamento e gere de novo, ou mande assim mesmo quando o arquivo é justamente o pedido de agenda à clínica.",
    },
    {
      sintoma: "Aparece Falha ao gerar o relatório da clínica.",
      acao: "O arquivo não foi produzido e nada mudou na fila. A mensagem fica ao lado da lista: tente de novo com a mesma seleção e, repetindo, reduza a quantidade de marcados para isolar o caso.",
    },
    {
      sintoma: "A coluna de empresa saiu vazia.",
      acao: "O vínculo daquele cliente não está resolvido no cadastro, então não há empregador a escrever. Peça a conferência do vínculo do cliente antes de enviar.",
    },
  ],
  regras: [
    "A planilha sai da SELEÇÃO, nunca do filtro da tela.",
    "Sem nenhuma linha marcada o botão fica apagado, porque não haveria o que gerar.",
    "As colunas e a ordem delas são fixas, no modelo combinado com a clínica. Elas não são escolhidas na hora de gerar.",
    "Admissão de estágio fica fora do arquivo, porque estágio não faz exame admissional.",
    "Quem tem mais de um endereço no mesmo dia sai em uma linha por endereço.",
    "Quem ainda não tem agendamento sai com as colunas de clínica, endereço e fornecedor vazias.",
    "Gerar o arquivo não muda status nem fila: é só leitura.",
    "O arquivo leva dado pessoal do candidato, então vale a mesma regra de cuidado dos demais documentos da admissão.",
  ],
  relacionados: [
    "agendar-o-exame-admissional",
    "reagendar-o-exame",
    "agir-em-varias-linhas-de-uma-vez",
    "exportar-a-lista-para-excel",
    "anexar-o-aso-no-exame",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/esteira/esteira.controller.ts",
    "apps/backend/src/esteira/dto/relatorio-clinica.dto.ts",
  ],
  revisadoEm: "2026-09-30",
};
