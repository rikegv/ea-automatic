import type { Artigo } from "../../tipos";

/**
 * ─ REGISTRAR CONTATO COM O CANDIDATO: anotar a conversa e alimentar a coluna do último contato ──
 *
 * O QUE ESTA PEÇA COBRE: o gesto na linha da fila, os três campos da janela, e como o registro
 * alimenta a coluna Último Contato da lista.
 *
 * ┌─ AS DUAS REGRAS QUE A OPERAÇÃO MAIS ERRA, e as duas foram lidas do serviço ───────────────────┐
 * │ 1. A COLUNA SÓ ANDA COM CONTATO. Ela não é "última movimentação": mudar de etapa ou registrar  │
 * │    saída não mexe nela, e é por isso que ela responde "quando falamos com essa pessoa".        │
 * │ 2. ELA SÓ ANDA PARA FRENTE. Contato de ontem anotado hoje entra no lugar certo do histórico e  │
 * │    NÃO puxa a coluna para trás, senão a pessoa pareceria mais fria do que está. Quem anota      │
 * │    retroativo e olha a coluna esperando vê-la mudar conclui que o registro não gravou.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA **NÃO** COBRE ────────────────────────────────────────────────────────────────────┐
 * │ A LEITURA da lista e do que cada coluna mostra é "ler-a-central-de-candidatos"; o histórico    │
 * │ completo por candidatura mora na ficha, em "ler-a-ficha-do-candidato"; e marcar entrevista é   │
 * │ gesto próprio, com data e convite, em artigo separado. Todos entram por `relacionados`.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o texto diz, no passo do resumo, que o campo é resumo do PROCESSO e não ficha da pessoa, que
 * é a mesma frase que a tela mostra. Nenhum exemplo com dado de pessoa.
 *
 * OS PRINTS EXISTEM DESDE 30/09/2026, e a janela é fotografada com o resumo VAZIO: preencher para
 * fotografar gravaria um contato de verdade numa candidatura de verdade a cada rodada de captura, e
 * captura que muda o estado do sistema deixa de ser repetível. É por isso que o botão de salvar
 * aparece apagado na imagem, e é exatamente o que o artigo diz em "o botão de salvar continua
 * apagado".
 */
export const artigo: Artigo = {
  slug: "registrar-contato-com-o-candidato",
  titulo: "Registrar Contato Com O Candidato",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como anotar uma ligação, um WhatsApp ou uma conversa com o candidato direto da fila, e como esse registro alimenta a coluna do último contato.",
  termos: [
    "registrar contato",
    "anotar ligacao",
    "liguei para o candidato",
    "nao atendeu",
    "falei com o candidato",
    "whatsapp para candidato",
    "quando falamos com essa pessoa",
    "ultimo contato",
    "historico de contato",
  ],
  preRequisitos: [
    "A pessoa precisa estar alocada em alguma vaga: o contato é registrado na candidatura, não na pessoa solta.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Candidatos e ache a linha da pessoa.",
      detalhe:
        "Cada linha é uma candidatura. A mesma pessoa em duas vagas tem duas linhas, e o contato que você anotar pertence à linha escolhida.",
    },
    {
      gesto: "Clique no ícone de telefone da coluna Ações, com o rótulo Registrar contato.",
      detalhe:
        "Ele aparece em qualquer situação, inclusive em quem já recebeu desfecho: ligar para quem foi descartado é conversa legítima, e o registro dela tem valor.",
      print: {
        arquivo: "01-icone-na-linha.png",
        legenda:
          "O ícone de telefone na coluna Ações, e a coluna Último Contato, que é o que o registro alimenta.",
      },
      controles: ["Registrar contato"],
    },
    {
      gesto: "Escolha o Tipo do contato.",
      detalhe: "As opções são Ligação, WhatsApp, E-mail, Entrevista e Observação.",
      print: {
        arquivo: "02-janela-do-contato.png",
        legenda:
          "A janela do contato, ainda vazia: o tipo, a data em que aconteceu e o resumo do que foi conversado.",
      },
      controles: ["Registrar Contato", "Tipo"],
    },
    {
      gesto: "Confira o campo Quando aconteceu.",
      detalhe:
        "Ele já nasce com a data de hoje e continua editável. Troque a data quando estiver anotando uma conversa de outro dia: o que importa é quando o contato aconteceu, não quando você digitou.",
      controles: ["Quando aconteceu"],
    },
    {
      gesto: "Escreva o que aconteceu, com pelo menos duas letras.",
      detalhe:
        "É resumo do processo, não ficha da pessoa: evite documentos e dados pessoais no campo. Uma linha do tipo não atendeu, retornar amanhã de manhã já resolve.",
      controles: ["O que aconteceu"],
    },
    {
      gesto: "Clique em Registrar contato para salvar.",
      detalhe:
        "A janela fecha e a fila recarrega. O registro entra no histórico daquela candidatura com o tipo, a data, o resumo e o nome de quem registrou.",
    },
    {
      gesto: "Confira a coluna Último Contato, na linha da pessoa.",
      detalhe:
        "Sem contato registrado, a célula diz não informado. Com contato, ela mostra a data e a hora do mais recente. A coluna também ordena por clique no cabeçalho.",
      controles: ["Último Contato"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O ícone de registrar contato não aparece na linha.",
      acao: "A pessoa está na base sem candidatura, e a linha mostra Vaga Não Alocada nas colunas de vaga. Adicione a pessoa a uma vaga primeiro: o contato pertence à candidatura.",
    },
    {
      sintoma: "O botão de salvar continua apagado.",
      acao: "O resumo é obrigatório e precisa de pelo menos duas letras. Escreva o que aconteceu, mesmo curto, e o botão libera.",
    },
    {
      sintoma: "Registrei um contato de ontem e a coluna Último Contato não mudou.",
      acao: "É o comportamento correto: a coluna só anda para frente. O contato antigo entrou no lugar certo do histórico da candidatura, na ficha, e a coluna continua mostrando a conversa mais recente.",
    },
    {
      sintoma: "Registrei o contato e a coluna Último Contato continua dizendo não informado.",
      acao: "Confira se você anotou na linha certa: a mesma pessoa pode ter mais de uma candidatura, e a coluna é por candidatura. Se a linha for a certa, recarregue a página.",
    },
    {
      sintoma: "A janela mostra Falha ao registrar o contato.",
      acao: "A gravação não voltou. Tente de novo. Se repetir, recarregue a página e confira se a sua sessão continua aberta.",
    },
    {
      sintoma: "A janela mostra Candidatura não encontrada.",
      acao: "A candidatura mudou por baixo da sua tela, normalmente porque alguém trocou a vaga ou a pessoa foi realocada. Recarregue a página e registre de novo.",
    },
    {
      sintoma: "Anotei a conversa na candidatura errada.",
      acao: "O registro não é apagado nem movido. Anote na candidatura certa e, no resumo, diga que a anotação anterior foi feita na linha errada: o histórico dos dois lados fica consultável na ficha da pessoa.",
    },
  ],
  regras: [
    "O contato pertence à candidatura, não à pessoa: anotar na linha de uma vaga não alimenta a linha de outra vaga da mesma pessoa.",
    "A coluna Último Contato só anda quando um contato é registrado. Mudar de etapa ou registrar saída não mexe nela.",
    "A coluna só anda para frente: contato de data antiga entra no lugar certo do histórico e não puxa a coluna para trás.",
    "Registrar contato vale em qualquer situação, inclusive com a candidatura já encerrada.",
    "A data do fato é diferente da data em que você digitou, e é a do fato que vale no histórico.",
    "O histórico guarda tipo, data, resumo e quem registrou. Nada disso é editável depois.",
    "Sem contato registrado, a célula da coluna diz não informado.",
    "O campo do resumo é do processo: documento, endereço e dado pessoal não entram ali.",
  ],
  relacionados: [
    "ler-a-central-de-candidatos",
    "ler-a-ficha-do-candidato",
    "mover-o-candidato-de-etapa",
    "marcar-a-entrevista-do-candidato",
    "trocar-a-vaga-do-candidato",
    "trazer-o-candidato-de-volta",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/RegistrarContatoModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
