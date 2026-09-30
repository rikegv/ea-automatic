import type { Artigo } from "../../tipos";

/**
 * ─ N1 DA CENTRAL DE VAGAS 2 de 2: A VOLTA GUIADA PELO PAINEL ───────────────────────────────────
 *
 * ┌─ O QUE ESTE ARTIGO ENSINA: **ONDE** CADA COISA MORA, E NADA MAIS ─────────────────────────────┐
 * │ Ele abre o painel e mostra o mapa: o topo que identifica a vaga, a trilha dos dois eixos, as    │
 * │ quatro abas, os blocos da ficha e a barra que oferece os gestos da vaga. É o artigo que a        │
 * │ pessoa lê UMA vez, para depois achar tudo sozinha.                                              │
 * │                                                                                                 │
 * │ NENHUM GESTO DO FUNIL É ENSINADO AQUI, e a separação é de escopo, não de espaço: adicionar      │
 * │ candidato, mover de etapa, finalizar posição, registrar saída e enviar para admissão têm artigo │
 * │ próprio cada um. Ensinar "um pouquinho" de cada um aqui criaria a segunda explicação de cinco    │
 * │ operações, e é a segunda explicação que envelhece sem ninguém notar. Os cinco estão em           │
 * │ `relacionados`.                                                                                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ESTE ARTIGO NASCE **SEM IMAGEM**, E ISSO É DECISÃO DE PRIVACIDADE, NÃO PENDÊNCIA DE TEMPO ───┐
 * │ O painel lista candidato por linha, com nome de pessoa em toda linha da aba de candidatos, e a  │
 * │ auditoria de segurança VETOU a captura de toda superfície de A&S. Então não existe roteiro de    │
 * │ captura irmão deste arquivo, e nenhum passo declara `print`: print de tela com gente dentro vai  │
 * │ para o repositório, e o repositório guarda para sempre (§A.6).                                   │
 * │                                                                                                 │
 * │ E HÁ UM SEGUNDO MOTIVO, QUE É DE DADO: `as_candidatos` e `as_candidaturas` têm ZERO linha na     │
 * │ homologação, então as abas de candidato deste painel estão vazias e não haveria o que            │
 * │ fotografar. Print de tela vazia PARECE pronto, que é pior do que print faltando.                 │
 * │                                                                                                 │
 * │ QUANDO O DADO SINTÉTICO EXISTIR E A AUDITORIA LIBERAR, o roteiro nasce com recorte por bloco (o  │
 * │ topo e a barra das abas não carregam nome de candidato), e não com a caixa inteira.              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O `controles` DECLARA O RÓTULO ACESSÍVEL DA PORTA ("Abrir a gestão da vaga", o que o botão diz a
 * quem passa o mouse e a quem usa leitor de tela) e o rótulo à vista fica no artigo irmão
 * ("Gestão Da Vaga"). São dois textos do MESMO botão, e as duas perguntas chegam por eles.
 *
 * §A.11: sem travessão. §A.24: title case na aba e no título de bloco; ação em escrita normal
 * ("Mover status", "Fechar").
 */
export const artigo: Artigo = {
  slug: "abrir-o-painel-da-vaga",
  titulo: "Abrir O Painel Da Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-vagas",
  resumo:
    "Como abrir a gestão de uma vaga e se achar dentro dela: o topo que diz em que pé o processo está, as quatro abas, os blocos da ficha e a barra com os gestos que o status da vaga permite.",
  termos: [
    "painel da vaga",
    "gestao da vaga",
    "abrir a vaga",
    "ficha da vaga",
    "detalhes da vaga",
    "quem esta na vaga",
    "candidatos da vaga",
    "shortlist enviada",
    "em que pe esta a vaga",
    "dados da vaga",
    "salario da vaga",
    "previsao de entrega",
  ],
  preRequisitos: [],
  passos: [
    {
      gesto: "Na linha da vaga, clique no botão da coluna Ações.",
      print: {
        arquivo: "01-botao-da-coluna-acoes.png",
        legenda: "O botão da coluna Ações, o único da linha, que abre o painel da vaga.",
      },
      detalhe:
        "É o único botão da linha, e ele abre sempre na ficha. A janela cobre a tela inteira e a lista fica atrás, como você a deixou.",
      controles: ["Abrir a gestão da vaga"],
    },
    {
      gesto: "Leia o topo: o nome da vaga, o código, quando abriu e quem abriu.",
      print: {
        arquivo: "02-topo-e-trilha.png",
        legenda: "O topo do painel, com o status da vaga, e a trilha com os dois eixos lado a lado.",
      },
      detalhe:
        "A pill ao lado do nome é o status da vaga, o mesmo da coluna Status da lista. É o único lugar que mostra quem abriu a vaga.",
      controles: ["Mover status"],
    },
    {
      gesto: "Leia a trilha, logo abaixo: dois blocos lado a lado.",
      detalhe:
        "Processo Seletivo diz em que pé está o trabalho e Desfecho diz como a vaga terminou. Os dois andam independentes: uma vaga pode ter o processo concluído e ainda não ter desfecho.",
      controles: [
        "Processo Seletivo",
        "Desfecho",
        "Vaga Aberta",
        "Processo Seletivo Concluído",
        "Processo Seletivo Encerrado",
        "Ainda Não Encerrada",
        "Enviada Para Admissão",
        "Finalizada Na A&S",
        "Fechada Sem Entrega",
      ],
    },
    {
      gesto: "Confira se há aviso em amarelo abaixo da trilha.",
      detalhe:
        "Eles só aparecem na vaga que teve isso: um diz que o fechamento foi forçado, o outro que a meta de posições foi reduzida, com quem fez e quando.",
      controles: ["Fechamento Forçado", "Meta Reduzida"],
    },
    {
      gesto: "Escolha uma das quatro abas, na barra do meio.",
      print: {
        arquivo: "03-abas-do-painel.png",
        legenda: "As quatro abas do painel, com a contagem de cada uma ao lado do nome.",
      },
      detalhe:
        "A Vaga é a ficha, Ver Candidatos é quem está no processo, Ver Candidatos Alocados é quem já entregou posição, e Candidatos Disponíveis é quem ainda pode entrar. O número ao lado da aba é da vaga inteira e não muda quando você busca.",
      controles: [
        "A Vaga",
        "Ver Candidatos",
        "Ver Candidatos Alocados",
        "Candidatos Disponíveis",
      ],
    },
    {
      gesto: "Na aba A Vaga, desça pelos blocos até o dado que você procura.",
      detalhe:
        "Fechamento aparece só na vaga encerrada, e Shortlists Enviadas lista as listas que já foram ao cliente, com a data de cada envio.",
      controles: [
        "Quem Pediu",
        "Contratação",
        "Condições",
        "Requisitos",
        "Fechamento",
        "Shortlists Enviadas",
      ],
    },
    {
      /*
       * A BARRA É DESCRITA, E OS GESTOS NÃO SÃO ENSINADOS. Cada um dos rótulos abaixo é a porta de
       * um artigo próprio ou de uma operação de encerramento com régua inteira: declará-los aqui
       * indexaria a pergunta "o que faz este botão" no artigo que NÃO a responde.
       */
      gesto: "Olhe a direita da barra das abas: ali ficam os gestos desta vaga.",
      detalhe:
        "A barra mostra só o que o status atual permite, então ela muda de vaga para vaga. Fechar e cancelar encerram, editar posições muda a meta, continuar rascunho volta para a abertura, reabrir desfaz um cancelamento e clonar cria uma abertura nova a partir desta.",
    },
    {
      gesto: "Terminou? Clique em Fechar, no rodapé do painel.",
      print: {
        arquivo: "04-rodape-fechar.png",
        legenda: "O botão Fechar, no rodapé do painel.",
      },
      detalhe:
        "A janela não fecha por clique fora, de propósito. A tecla Esc também fecha, e a lista atrás continua no mesmo recorte.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A aba de candidatos fica em Carregando quem está nesta vaga e a lista não chega.",
      acao: "A lista de candidatos pertence ao menu Central De Candidatos. Sem esse menu liberado para o seu usuário, a aba responde acesso negado e o resto do painel continua funcionando. Peça a liberação à diretoria.",
    },
    {
      sintoma: "A aba diz Nenhuma candidatura registrada nesta vaga.",
      acao: "Ninguém foi trazido para esta vaga ainda. Quem traz gente é a própria aba, pelos botões de adicionar, e a aba Candidatos Disponíveis mostra quem pode entrar.",
    },
    {
      sintoma: "O painel diz que a vaga não recebe candidato novo.",
      acao: "O status atual dela não capta gente, e a vaga pausada ou encerrada é o caso comum. A lista continua consultável, e para voltar a captar é preciso mudar o status da vaga.",
    },
    {
      sintoma: "O botão Mover status não aparece ao lado da pill.",
      acao: "Ele não existe na vaga encerrada nem no rascunho. O rascunho sai pela trilha de abertura, e a vaga cancelada volta pelo reabrir, que é gesto de Master.",
    },
    {
      sintoma: "O painel abriu direto na lista de candidatos, e eu esperava a ficha.",
      acao: "Isso acontece quando o painel foi aberto por uma recusa de cancelamento: ela precisa mostrar quem ainda está em processo. Clique na aba A Vaga para ver a ficha.",
    },
    {
      sintoma: "Eu procuro o CPF da pessoa e não acho no painel.",
      acao: "O painel não mostra CPF de propósito. Ele aparece na ficha de uma pessoa, aberta uma por vez, pelo botão da linha dela.",
    },
  ],
  regras: [
    "O painel é a mesma vaga em quatro abas: o que ela é, quem está nela, quem já entregou posição e quem ainda pode entrar.",
    "A lista de candidatos é carregada só quando a aba é aberta, e ela depende do menu Central De Candidatos.",
    "O número ao lado da aba é o da vaga inteira, e não muda com a busca nem com o filtro da lista.",
    "A barra ao lado das abas mostra só os gestos que o status atual da vaga permite.",
    "Mover status não encerra a vaga: fechar e cancelar continuam sendo as únicas portas do encerramento.",
    "O painel não mostra CPF. Ele fica na ficha de uma pessoa, aberta por clique deliberado.",
    "A janela sai pelo Fechar ou pela tecla Esc, nunca por clique fora dela.",
  ],
  relacionados: [
    "ler-a-central-de-vagas",
    "adicionar-candidatos-ao-funil-da-vaga",
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "registrar-a-saida-do-candidato",
    "enviar-o-candidato-para-a-admissao",
    "ler-a-ficha-do-candidato",
    "abrir-uma-vaga-nova",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/VagaPainelModal.tsx",
    "apps/frontend/src/components/as/vagas/ShortlistsDaVaga.tsx",
    "apps/frontend/src/components/as/vagas/CandidatosDisponiveisDaVaga.tsx",
    "apps/frontend/src/lib/as-vaga-trilha.ts",
    "apps/frontend/src/lib/as-vaga-acoes.ts",
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
  ],
  revisadoEm: "2026-09-30",
};
