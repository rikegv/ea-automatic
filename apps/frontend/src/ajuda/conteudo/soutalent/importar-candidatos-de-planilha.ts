import type { Artigo } from "../../tipos";

/**
 * ─ IMPORTAR CANDIDATOS DE PLANILHA (N1, família `as-candidatos`) ────────────────────────────────
 *
 * O QUE ESTE ARTIGO COBRE: os CINCO PASSOS da janela de importação da Central De Candidatos, cada
 * um com o rótulo que a tela escreve (Cenário, Planilha, De, Para, Confirmação, Resultado), a
 * escolha entre importar só para a base ou já vinculando a uma vaga, a troca de aba, a conferência
 * do de, para e a prévia do que vai ser criado antes de gravar.
 *
 * O QUE ELE **NÃO** COBRE, E ISSO É DELEGAÇÃO DELIBERADA: o padrão de importação do sistema (subir
 * arquivo, a leitura sugerir as colunas, conferir antes de gravar, nada entra sem aceite) já é
 * ensinado em `importar-uma-planilha`, no módulo de começar aqui. Reexplicá-lo aqui criaria duas
 * redações da mesma régua, que divergem no primeiro ajuste. Este artigo ensina o que é PRÓPRIO da
 * importação de candidatos.
 *
 * ┌─ OS DOIS PRIMEIROS PASSOS TÊM IMAGEM. OS TRÊS ÚLTIMOS, NÃO, E A CAUSA É MEDIDA ──────────────┐
 * │ A pendência registrada aqui antes ("o print desta tela é possível, com uma planilha sintética") │
 * │ foi APURADA em 30/09/2026 e a resposta é NÃO, por dois impedimentos independentes:             │
 * │                                                                                               │
 * │ 1. A PLANILHA TERIA DE TER NOME DE GENTE. O de, para desta importação é de PESSOA, e a amostra │
 * │    do passo Confirmação imprime na tela as linhas lidas. Um arquivo com nomes inventados vira, │
 * │    no print, uma lista de pessoas indistinguível de real para quem lê o manual. A planilha de  │
 * │    LOJAS que o artigo irmão sobe não tem esse problema porque loja não é gente.                │
 * │ 2. A LEITURA NÃO RENDERIZA NO TEMPO DO GESTO. O de, para depende do backend mais da leitura    │
 * │    por I.A., e o roteiro de importar planilha já mediu que os prints da prévia nunca foram     │
 * │    alcançados na homologação dentro da espera do gesto que sobe arquivo.                       │
 * │                                                                                               │
 * │ ENTÃO O CENÁRIO E A PLANILHA GANHARAM IMAGEM, e De, Para, Confirmação e Resultado continuam    │
 * │ ensinados em texto. Print de prévia vazia pareceria pronto, que é pior do que print faltando.  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, COM CUIDADO REDOBRADO: este artigo fala de planilha de gente, e nenhuma coluna de exemplo
 * carrega nome, CPF, e-mail, telefone ou endereço de pessoa nenhuma. O que ele nomeia são os
 * RÓTULOS dos campos da tela, que são vocabulário do sistema.
 */
export const artigo: Artigo = {
  slug: "importar-candidatos-de-planilha",
  titulo: "Importar Candidatos De Planilha",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-candidatos",
  resumo:
    "Como subir uma planilha de candidatos para a base, com ou sem vincular as pessoas a uma vaga, conferindo coluna por coluna o que a leitura entendeu antes de qualquer coisa ser gravada.",
  termos: [
    "importar candidatos",
    "subir planilha",
    "importar excel",
    "carga de candidatos",
    "planilha de candidatos",
    "importar lista de pessoas",
    "csv de candidatos",
    "cadastrar muita gente de uma vez",
    "importar para uma vaga",
  ],
  preRequisitos: [
    "Ter a planilha em mão, em .xlsx, .xls ou .csv.",
    "Saber se as pessoas entram só para a base ou já vinculadas a uma vaga: é a primeira pergunta da janela.",
    "Para vincular a uma vaga, a vaga já precisa estar aberta e recebendo candidato.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Candidatos pelo menu da lateral esquerda.",
      controles: ["Central De Candidatos"],
    },
    {
      gesto: "Clique em Importar Candidatos, no topo da tela.",
      detalhe:
        "A janela mostra, no alto, em qual dos cinco passos você está: Cenário, Planilha, De, Para, Confirmação e Resultado.",
      print: {
        arquivo: "01-botao-importar.png",
        legenda: "O botão de importar, no topo da Central De Candidatos.",
      },
      controles: [
        "Importar Candidatos",
        "Cenário",
        "Planilha",
        "De, Para",
        "Confirmação",
        "Resultado",
      ],
    },
    {
      gesto:
        "No passo Cenário, escolha entre Sem Vaga e Com Vaga, e clique em Avançar.",
      detalhe:
        "Sem Vaga importa as pessoas para a base e você aloca depois. Com Vaga importa as pessoas já como candidaturas da vaga que você escolher no seletor, que tem busca por nome, por código do processo e por cliente.",
      print: {
        arquivo: "02-passo-cenario.png",
        legenda:
          "O passo Cenário: as duas opções lado a lado e o trilho dos cinco passos, no alto da janela.",
      },
      controles: ["Sem Vaga", "Com Vaga", "Vaga", "Avançar"],
    },
    {
      gesto: "No passo Planilha, anexe o arquivo em Planilha De Candidatos.",
      detalhe:
        "A leitura começa na hora e leva alguns segundos: a tela mostra Lendo A Planilha enquanto identifica as colunas. Não anexe outro arquivo no meio da espera.",
      print: {
        arquivo: "03-passo-planilha.png",
        legenda: "O passo Planilha: o campo em que o arquivo é anexado e os formatos aceitos.",
      },
      controles: ["Planilha De Candidatos"],
    },
    {
      gesto:
        "No passo De, Para, confira a frase que diz qual aba foi lida e em que linha está o cabeçalho.",
      detalhe:
        "Planilha com linha de título antes do cabeçalho é caso comum, e planilha com mais de uma aba também. Havendo mais de uma aba, troque em Aba Da Planilha e a leitura é refeita, inclusive a sugestão das colunas.",
      controles: ["Aba Da Planilha"],
    },
    {
      gesto:
        "Confira, em Colunas Da Planilha, qual coluna da sua planilha vale para cada campo, e corrija o que estiver trocado.",
      detalhe:
        "Os campos são Nome, CPF, E-mail, Telefone, Nascimento, Cidade e UF. Só o Nome é obrigatório: o que não existe na sua planilha fica sem coluna. A etiqueta de confiança ao lado diz o quanto a leitura se garantiu na sugestão.",
      controles: [
        "Colunas Da Planilha",
        "Nome",
        "CPF",
        "E-mail",
        "Telefone",
        "Nascimento",
        "Cidade",
        "UF",
      ],
    },
    {
      gesto:
        "Clique em Avançar e leia a amostra do passo Confirmação, que é a planilha já interpretada.",
      detalhe:
        "É a última conferência antes de gravar: cada coluna da amostra é um campo do sistema, preenchido com o que o de, para mandou. Campo sem coluna aparece como não informado.",
      controles: ["Voltar"],
    },
    {
      gesto: "Clique no botão de importar, no rodapé, para gravar.",
      detalhe:
        "O botão diz quantas pessoas vão entrar. A gravação cria quem é novo e reaproveita quem já existe na base pelo CPF.",
    },
    {
      gesto:
        "No passo Resultado, leia o relatório e clique em Concluir.",
      detalhe:
        "Os quatro números são Importados, Reaproveitados, Vinculados e Ignorados, e a lista abaixo diz, linha por linha, o que aconteceu com cada uma e por quê. A Central recarrega por baixo, então quem entrou já aparece na lista ao fechar.",
      controles: [
        "Importados",
        "Reaproveitados",
        "Vinculados",
        "Ignorados",
        "Linha",
        "Status",
        "Motivo",
        "Concluir",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra Não Foi Possível Ler A Planilha.",
      acao: "O arquivo não foi entendido: formato não suportado, arquivo corrompido, planilha vazia ou sem cabeçalho reconhecível. A mensagem abaixo do aviso diz qual dos casos é. Nada foi importado: corrija o arquivo e suba de novo, ou clique em Escolher outro arquivo.",
    },
    {
      sintoma:
        "A tela pede para escolher qual coluna tem o nome do candidato para continuar.",
      acao: "O Nome é o único campo obrigatório do de, para, porque é ele que identifica a pessoa na lista do resultado. Escolha a coluna do nome em Colunas Da Planilha e o Avançar libera.",
    },
    {
      sintoma: "A tela mostra Planilha Acima Do Limite De Importação.",
      acao: "O arquivo tem mais linhas do que uma importação alcança, e a gravação fica bloqueada de propósito, para ninguém ficar de fora sem aviso. O aviso diz quantas linhas o arquivo tem, quantas entram e quantas ficariam de fora: divida a planilha em arquivos desse tamanho e importe um por um.",
    },
    {
      sintoma: "Os dados entraram na coluna errada.",
      acao: "A sugestão das colunas é um chute da leitura, e o passo De, Para existe para você corrigir antes de gravar. Confira também a aba: planilha com várias abas pode ter sido lida na aba errada, e a frase no topo do passo diz qual foi.",
    },
    {
      sintoma: "Troquei a aba e a leitura falhou.",
      acao: "O de, para que você já tinha conferido continua na tela: nada foi perdido. Escolha outra aba, ou volte ao passo da planilha e suba o arquivo de novo.",
    },
    {
      sintoma: "A tela diz que nenhuma vaga aberta pode receber candidatos no momento.",
      acao: "Não há vaga em condição de receber alocação, então o cenário Com Vaga não tem destino. Importe em Sem Vaga e aloque depois, ou confira a situação da vaga na Central De Vagas.",
    },
    {
      sintoma:
        "O resultado marcou linhas como Sem CPF ou Inválido.",
      acao: "Sem CPF é a pessoa que entrou na base sem o documento: ela existe e é alocável, e o CPF é exigido mais adiante. Inválido é a linha que não pôde ser aproveitada, e a coluna Motivo diz por quê. Corrija essas linhas numa planilha nova e importe de novo: quem já entrou é reaproveitado pelo CPF e não duplica.",
    },
    {
      sintoma: "A tela mostra Não foi possível gravar a importação.",
      acao: "A gravação não foi concluída. Confira no resultado, ou na lista da Central, se alguma coisa entrou antes de subir o arquivo de novo, e avise a administração se repetir.",
    },
  ],
  regras: [
    "Nada é gravado sem o seu aceite: a gravação acontece só no clique do último passo.",
    "Só o Nome é obrigatório no de, para. Os demais campos podem ficar sem coluna.",
    "Quem já existe na base pelo CPF é reaproveitado, não duplicado.",
    "Pessoa sem CPF entra na base e conta como sem CPF no relatório.",
    "Com Vaga cria as pessoas e as candidaturas na vaga escolhida. Sem Vaga só cria as pessoas.",
    "A aba conferida na tela é a aba gravada: se o cabeçalho conferido não for o mesmo da gravação, a importação é recusada em vez de gravar a coluna errada em silêncio.",
    "Existe um limite de linhas por importação, e acima dele a gravação é bloqueada em vez de cortar o arquivo pela metade.",
  ],
  relacionados: [
    "importar-uma-planilha",
    "ler-a-central-de-candidatos",
    "cadastrar-um-candidato-novo",
    "adicionar-um-candidato-a-uma-vaga",
    "adicionar-candidatos-ao-funil-da-vaga",
    "ler-a-ficha-do-candidato",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/ImportarCandidatosModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/backend/src/as/candidatos/candidatos-import.service.ts",
    "apps/backend/src/as/candidatos/candidatos-import-planilha.ts",
  ],
  revisadoEm: "2026-09-30",
};
