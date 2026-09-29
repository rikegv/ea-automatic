import type { Artigo } from "../../tipos";

/**
 * N1 DO GERENCIADOR 4 de 4: O FAROL E A PENDÊNCIA OBRIGATÓRIA.
 *
 * ┌─ A LISTA DE CAMPOS FOI LIDA DA RÉGUA, NÃO ESCRITA DE CABEÇA ─────────────────────────────────┐
 * │ Os onze itens citados aqui são exatamente os de `pendenciasObrigatorias`                        │
 * │ (`apps/backend/src/domain/admissao.ts`) com os rótulos de `ROTULO_PENDENCIA`                    │
 * │ (`domain/pendencia-config.ts`), na ordem em que a régua os cobra: Cliente, Cargo, Salário, Tipo  │
 * │ de contrato, Data de admissão (ou Termo de Banco, na admissão de banco), Pacote de benefícios,   │
 * │ Escala, Centro de custo, Setor, Gestor / BP e Uniforme.                                        │
 * │                                                                                                 │
 * │ ISSO IMPORTA MAIS DO QUE PARECE: é UMA régua só, e foi por não ser que a coluna dizia "Completo" │
 * │ enquanto o modal da MESMA admissão listava pendência. Um artigo que recite uma lista de cabeça   │
 * │ recria a divergência do outro lado, no texto, e o texto ninguém testa.                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS PERGUNTAS QUE ESTE ARTIGO SEPARA, PORQUE A TELA AS MOSTRA LADO A LADO ──────────────┐
 * │ A coluna Status responde "em que ponto da vida está esta admissão", e a coluna Pendências       │
 * │ Obrig. responde "falta informação obrigatória nela". São independentes: admissão concluída pode  │
 * │ ter nascido com campo em branco, e admissão em andamento pode estar completa. Quem lê as duas    │
 * │ como se fossem a mesma escala acha que o sistema se contradiz.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE O ARTIGO NÃO REPETE: a gramática visual da linha (cor, ícone, etiqueta sólida contra etiqueta
 * de borda tracejada) é o artigo "Ler A Linha Da Tabela", do módulo Começar Aqui, e ele já ensina que
 * a de borda tracejada é botão. Aqui está o SIGNIFICADO de cada valor e o que zera cada pendência.
 */
export const artigo: Artigo = {
  slug: "entender-o-farol-e-as-pendencias-obrigatorias",
  titulo: "Entender O Farol E As Pendências Obrigatórias",
  modulo: "SOUL_ADM",
  rotas: ["/gerenciador"],
  menus: ["gerenciador"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "gerenciador",
  resumo:
    "O que cada valor da coluna Status quer dizer, quais deles o sistema escreve sozinho, e o que exatamente zera uma pendência obrigatória.",
  termos: [
    "farol",
    "status",
    "situacao",
    "em admissao",
    "banco aguardar",
    "admissao concluida",
    "declinou",
    "rescisao",
    "pausada",
    "pendencia",
    "pendencias obrigatorias",
    "o que falta",
    "completo",
    "parcial",
    "declinio",
    "campo obrigatorio",
    "por que aparece parcial",
    "zerar pendencia",
  ],
  preRequisitos: [
    "Estar com a lista do Gerenciador aberta. As duas colunas ficam à direita, perto do fim da linha.",
  ],
  passos: [
    {
      gesto: "Leia a coluna Status para saber em que ponto da vida a admissão está.",
      detalhe:
        "Em Admissão é processo em aberto. Banco, Aguardar é gente pronta esperando vaga. Admissão Concluída é caso encerrado com êxito. Declinou e Rescisão são casos encerrados sem admissão. Aguardando Liberação é pré-admissão, que ainda está na sala de espera.",
      controles: [
        "Status",
        "Em Admissão",
        "Banco, Aguardar",
        "Admissão Concluída",
        "Declinou",
        "Rescisão",
        "Aguardando Liberação",
      ],
      print: {
        arquivo: "01-status-e-pendencias.png",
        legenda: "Passo 1: as colunas Status e Pendências Obrig. na linha da lista.",
      },
    },
    {
      gesto: "Quando houver uma segunda etiqueta escrita Pausada, leia as duas juntas.",
      detalhe:
        "A pausa não substitui o status: ela diz que o trabalho está parado, e o status continua contando a vida da admissão por baixo. O motivo da pausa, quando informado, aparece na ficha.",
      controles: ["Pausada", "Admissão Pausada"],
    },
    {
      gesto: "Saiba o que o sistema escreve sozinho e o que é escolha de gente.",
      detalhe:
        "Banco, Aguardar é automático quando a auditoria fecha, o exame sai apto e não há data de admissão; preencher a data devolve a admissão para Em Admissão. Admissão Concluída, Declinou e Rescisão são escolha manual, e o sistema não as reescreve depois.",
      controles: ["Status (farol)"],
    },
    {
      gesto: "Leia a coluna Pendências Obrig. para saber se falta informação obrigatória.",
      detalhe:
        "Completo é zero pendência. Parcial é falta alguma coisa. Declínio aparece para quem foi encerrado, e ali não se lê Completo nem Parcial: encerrado não tem pendência de processo vivo. Competências é um estado próprio, não um grau de preenchimento.",
      controles: ["Pendências Obrig.", "Completo", "Parcial", "Declínio", "Competências"],
    },
    {
      gesto: "Clique na etiqueta de pendências para ver o que falta naquela admissão.",
      detalhe:
        "A janela Pendências obrigatórias lista os campos em branco, um por linha. Preencher pendências abre o formulário de edição já reduzido a esses campos, para você não caçar nada.",
      controles: [
        "Ver pendências obrigatórias",
        "Pendências obrigatórias",
        "Preencher pendências",
        "Fechar",
      ],
      print: {
        arquivo: "02-modal-de-pendencias.png",
        legenda: "Passo 5: a janela que lista os campos obrigatórios em branco.",
      },
    },
    {
      gesto: "Saiba quais campos a régua cobra, para reconhecer cada linha da janela.",
      detalhe:
        "São Cliente, Cargo, Salário, Tipo de contrato, Data de admissão, Pacote de benefícios, Escala, Centro de custo, Setor, Gestor / BP e Uniforme. Em admissão de banco, a data de admissão sai da conta e entra o Termo de Banco.",
      controles: [
        "Cliente",
        "Cargo",
        "Salário",
        "Tipo de contrato",
        "Data de admissão",
        "Termo de Banco",
        "Pacote de benefícios",
        "Escala",
        "Centro de custo",
        "Setor",
        "Gestor / BP",
        "Uniforme",
      ],
    },
    {
      gesto: "Preencha o campo e confira a etiqueta virar Completo.",
      detalhe:
        "Cada campo sai da lista no instante em que ganha valor. Uniforme sai quando a pergunta é respondida, e responder Não já resolve. Termo de Banco sai quando o documento é entregue. Zerada a lista, a etiqueta passa a ler Completo sozinha, sem ninguém marcar nada.",
      controles: ["Salvar alterações", "Completo"],
    },
    {
      gesto: "Para ver o mesmo resumo dentro da ficha, abra o olho e leia o bloco Status das frentes.",
      detalhe:
        "Ali estão o farol, o resumo de pendências e a lista do que falta, junto da situação de Auditoria, Exame e Cadastro / Contrato.",
      controles: ["Ver ficha", "Status das frentes", "Farol:", "Pendências:"],
      print: {
        arquivo: "03-farol-na-ficha.png",
        legenda: "Passo 8: o bloco Status das frentes, com o farol e o resumo de pendências.",
      },
    },
  ],
  seDerErrado: [
    {
      sintoma: "A etiqueta diz Parcial e a janela não lista pendência nenhuma.",
      acao: "Recarregue a página e abra de novo: a linha na sua tela está velha. As duas leituras saem da mesma régua, então elas não se contradizem depois de recarregar.",
    },
    {
      sintoma: "Coloquei a data de admissão e o status voltou de Banco, Aguardar para Em Admissão.",
      acao: "É o comportamento certo: o banco é para quem está pronto e sem data. Se a pessoa é de banco mesmo, marque Admissão de banco pelo lápis, que é a marcação que segura o status.",
    },
    {
      sintoma: "Mudei o status para Admissão Concluída e ele não volta mais sozinho.",
      acao: "Concluída, Declinou e Rescisão são escolhas manuais e o sistema não as reescreve. Para desfazer, escolha outro status pelo lápis.",
    },
    {
      sintoma: "A admissão está declinada e eu quero saber o que faltava nela.",
      acao: "A coluna mostra Declínio, e é assim de propósito: caso encerrado não entra em fila nem em contagem de pendência. O que existia continua visível na ficha, pelo olho.",
    },
    {
      sintoma: "Uma pendência que eu vejo em um cliente não aparece em outro.",
      acao: "Não é falha. A obrigatoriedade de cada item é configurável por cliente, e cliente que não trabalha com aquele campo não é cobrado por ele.",
    },
    {
      sintoma: "A janela lista o campo mas o botão Preencher pendências não abre caixa para ele.",
      acao: "Cliente e Cargo não se editam por ali, e o Uniforme é respondido na ficha, pelo Editar uniforme. Sobrando campo sem caminho, avise a administração.",
    },
    {
      sintoma: "O card Com Pendências Obrigatórias mostra menos gente do que eu esperava.",
      acao: "O card conta só admissão viva. Quem declinou e quem já concluiu não entra, e é por isso que ele não bate com o total da lista.",
    },
  ],
  regras: [
    "Status e Pendências Obrig. respondem perguntas diferentes: o primeiro diz em que ponto a admissão está, o segundo diz se falta informação obrigatória nela.",
    "Banco, Aguardar é escrito pelo sistema quando a auditoria fechou, o exame saiu apto e não há data de admissão. Preencher a data devolve a admissão para Em Admissão.",
    "Marcar Admissão de banco pelo lápis segura o status em Banco, Aguardar até a marcação sair.",
    "Admissão Concluída, Declinou e Rescisão são manuais e pegajosas: a automação não as sobrescreve.",
    "Completo quer dizer zero pendência obrigatória, e é calculado, nunca marcado à mão.",
    "Admissão declinada ou rescindida lê Declínio na coluna de pendências, e nunca Completo nem Parcial.",
    "Admissão encerrada e admissão já concluída não são recalculadas, e não entram nas contagens de pendência.",
    "A obrigatoriedade de cada item é configurável por cliente: item desligado para um cliente não é cobrado dele.",
    "A pendência do uniforme é a RESPOSTA, não o uniforme: responder Não fecha a pendência.",
    "Pendência sinaliza, ela não bloqueia. A admissão anda com campo em branco, e o avanço de etapa com pendência fica registrado na trilha de passagem.",
  ],
  relacionados: [
    "achar-uma-admissao-no-gerenciador",
    "ler-a-ficha-da-admissao",
    "editar-os-dados-de-uma-admissao",
    "ler-a-linha-da-tabela",
    "filtrar-pelo-card-de-indicador",
  ],
  fontes: [
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/domain/pendencia-config.ts",
    "apps/frontend/src/lib/farol.ts",
    "apps/frontend/src/lib/pendencias-pill.ts",
    "apps/frontend/src/components/gerenciador/PendenciasModal.tsx",
    "apps/frontend/src/app/(app)/gerenciador/page.tsx",
  ],
  revisadoEm: "2026-09-28",
};
