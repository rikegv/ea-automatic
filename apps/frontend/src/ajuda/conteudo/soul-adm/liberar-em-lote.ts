import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO, 3 de 3: VÁRIAS DE UMA VEZ.
 *
 * ┌─ O LOTE NÃO É A LIBERAÇÃO INDIVIDUAL REPETIDA, E CONFUNDIR ISSO CUSTA RETRABALHO ────────────┐
 * │ Três diferenças de REGRA, não de tela:                                                        │
 * │   1. no lote, só cliente e cargo são obrigatórios. Os seis campos que travam o botão na        │
 * │      liberação individual NÃO travam aqui: o que ficar vazio vira pendência de cada admissão;  │
 * │   2. a pergunta do uniforme não é feita, então ela nasce pendente para todas as N;             │
 * │   3. duplicata e CPF inválido SAEM do lote, nominalmente, e seguem para tratamento individual. │
 * │ Quem espera que o lote faça o mesmo que o individual libera 20 pessoas e descobre depois que    │
 * │ todas nasceram com a mesma lista de pendências.                                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ÚNICA COISA QUE NÃO É IGUAL PARA TODOS É A LOJA ─────────────────────────────────────────┐
 * │ "Loja De Cada Um" dá um seletor POR PESSOA, e só aparece para cliente que tem lojas. É         │
 * │ deliberado: o mesmo lote costuma ter gente de lojas diferentes, e exigir um lote por loja       │
 * │ transformaria a liberação em massa em individual disfarçada.                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O TETO DE 50 POR LOTE é do backend (`LOTE_LIBERACAO_MAX`, `admissoes.service.ts`) e está no bloco
 * de erros com o texto que a tela mostra. §A.6: nenhum dado de pessoa.
 */
export const artigo: Artigo = {
  slug: "liberar-em-lote",
  titulo: "Liberar Em Lote",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "Como marcar várias pré-admissões do mesmo cliente e cargo e liberar todas de uma vez, o que o lote aplica a todo mundo, o que fica pendente em cada uma e quem o lote deixa de fora de propósito.",
  termos: [
    "lote",
    "em massa",
    "varias de uma vez",
    "selecionar varios",
    "marcar varios",
    "liberar todos",
    "liberacao em massa",
    "turma",
    "leva",
    "alto volume",
    "selecionar todas",
  ],
  preRequisitos: [
    "As pessoas selecionadas precisam ir para o MESMO cliente e o MESMO cargo. O lote aplica um par só para todas.",
    "O par cliente e cargo já precisa ter régua documental cadastrada: sem ela o lote inteiro é barrado, e ninguém é liberado.",
  ],
  passos: [
    {
      gesto: "Na aba Aguardando, marque a caixa da primeira coluna de cada pessoa do lote.",
      detalhe:
        "Para marcar tudo o que está na tela, use a caixa do cabeçalho. Ela seleciona só as linhas visíveis pela busca, nunca a fila inteira escondida atrás do filtro.",
      controles: ["Aguardando", "Selecionar todas as visíveis"],
      print: {
        arquivo: "01-selecao-em-massa.png",
        legenda: "Passo 1: as linhas marcadas e a barra de seleção que aparece acima da lista.",
      },
    },
    {
      gesto: "Confira a barra que apareceu acima da lista.",
      detalhe:
        "Ela mostra quantas estão marcadas e traz o atalho para desfazer a seleção. Ela só existe enquanto houver algo marcado.",
      controles: ["Limpar seleção", "Liberar selecionadas"],
    },
    {
      gesto: "Clique em Liberar selecionadas.",
      detalhe:
        "Abre a janela do lote, que é uma versão enxuta da individual: os campos são os mesmos, mas aqui cada valor vale para todas as selecionadas.",
      controles: ["Liberar selecionadas", "Liberação em massa"],
    },
    {
      gesto: "Leia os avisos do topo da janela antes de preencher.",
      detalhe:
        "Quem tem possível duplicata e quem está com CPF inválido é listado pelo nome e fica FORA do lote. Essas pessoas continuam na fila e precisam ser tratadas uma a uma.",
      controles: ["Possível duplicata"],
    },
    {
      gesto: "Escolha o Cliente e o Cargo do lote.",
      detalhe:
        "São os dois únicos campos obrigatórios aqui, e é o par deles que define a régua documental de todas as admissões que vão nascer.",
      controles: ["Cliente", "Cargo", "Selecione o cliente…", "Selecione o cargo…"],
      print: {
        arquivo: "02-janela-do-lote.png",
        legenda: "Passo 5: a janela do lote, com cliente e cargo valendo para todas.",
      },
    },
    {
      gesto: "Preencha o que for igual para todas.",
      detalhe:
        "Salário, data de admissão, tipo de contrato, escala, setor, departamento, centro de custo, gestor e benefícios são aplicados a todas as selecionadas. O que ficar em branco vira pendência individual de cada admissão na esteira.",
      controles: [
        "Salário",
        "Data de admissão",
        "Tipo de contrato",
        "Escala",
        "Setor",
        "Departamento",
        "Centro de custo",
        "Gestor / BP",
        "Benefícios",
        "Valor de",
        "Observações (opcional)",
      ],
    },
    {
      gesto: "Quando o cliente tiver lojas, escolha a loja de cada pessoa.",
      detalhe:
        "É a única coisa do lote que não é um valor só para todos, porque a mesma leva costuma ter gente de lojas diferentes. Quem ficar sem loja vira pendência individual e não bloqueia.",
      controles: ["Loja De Cada Um", "Sem loja definida"],
    },
    {
      gesto: "Leia o aviso do que continuará pendente e clique no botão de liberar do rodapé.",
      detalhe:
        "O aviso amarelo lista, antes do clique, o que vai ficar faltando em cada uma das selecionadas. O botão traz a contagem no próprio texto, para você conferir quantas vão sair da fila.",
      controles: ["Cancelar"],
    },
    {
      gesto: "Leia o relatório que aparece no fim.",
      detalhe:
        "Ele separa quem entrou na esteira de quem não foi liberada e continua na fila, com o motivo de cada falha. É aqui que se descobre quem precisa de tratamento individual.",
      controles: [
        "Entraram na esteira:",
        "Não liberadas (seguem na fila):",
        "Fechar",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A janela avisa que o par de cliente e cargo não tem régua documental cadastrada.",
      acao: "O lote inteiro é barrado e ninguém foi liberado, de propósito: nenhuma admissão nasce sem checklist. Peça o cadastro da régua no menu Régua de Documentos e repita o lote.",
    },
    {
      sintoma: "Selecionei mais de cinquenta pessoas e a tela recusou.",
      acao: "O máximo é cinquenta por lote. Selecione menos, libere, e repita a operação com o restante.",
    },
    {
      sintoma: "Algumas pessoas que eu marquei não foram liberadas.",
      acao: "Confira o relatório do fim, que traz o motivo de cada uma. Possível duplicata e CPF inválido saem do lote por regra e seguem para a liberação individual.",
    },
    {
      sintoma: "Marquei pessoas, usei a busca, e a seleção parece ter mudado.",
      acao: "A caixa do cabeçalho opera só sobre as linhas visíveis pela busca. Limpe a busca e confira a contagem da barra antes de abrir o lote.",
    },
    {
      sintoma: "As admissões nasceram todas com uniforme pendente.",
      acao: "É o esperado: a pergunta do uniforme não é feita no lote, ela trava só a liberação individual. Responda depois, pelo lápis do Gerenciador, em cada admissão.",
    },
    {
      sintoma: "Liberei o lote com o cliente errado.",
      acao: "As admissões já estão na esteira. A correção é por admissão, pela troca de cliente e cargo na ficha, que é ação de Master ou Super Admin, e ela muda a régua de documentos.",
    },
  ],
  regras: [
    "No lote, só cliente e cargo são obrigatórios. Todo o resto é opcional e o que ficar vazio vira pendência individual de cada admissão.",
    "Tudo o que for preenchido na janela vale para todas as selecionadas, exceto a loja, que é escolhida pessoa por pessoa.",
    "Quem está marcado como possível duplicata e quem está com CPF inválido fica fora do lote e precisa ser tratado individualmente.",
    "A pergunta sobre uniforme não é feita no lote, então ela nasce pendente para todas. No individual, ela trava a liberação.",
    "O par cliente e cargo precisa ter régua documental cadastrada: sem ela o lote inteiro é recusado, sem liberar ninguém.",
    "São no máximo cinquenta pré-admissões por lote.",
    "Selecionar todas marca só as linhas visíveis pela busca, nunca a fila inteira.",
    "Quem foi liberado sai da fila na hora e passa a ser encontrado na Esteira e no Gerenciador.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "recusar-uma-admissao-na-liberacao",
    "agir-em-varias-linhas-de-uma-vez",
    "achar-uma-admissao-no-gerenciador",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/frontend/src/components/admin/SeletorLoja.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
