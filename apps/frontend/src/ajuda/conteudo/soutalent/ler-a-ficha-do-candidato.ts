import type { Artigo } from "../../tipos";

/**
 * ─ LER A FICHA DO CANDIDATO: os blocos da janela, o histórico e o resumo da vaga ─────────────────
 *
 * O QUE ESTA PEÇA COBRE: a leitura da ficha que o ícone de olho abre. O cabeçalho (origem, marca de
 * guarda permanente, quando a pessoa foi cadastrada), o bloco A Pessoa (o ÚNICO lugar do sistema em
 * que o CPF aparece), o bloco As Candidaturas com uma caixa por vaga, a linha do tempo Por Onde
 * Passou, o Histórico De Contato de cada candidatura e o descritivo da vaga que abre por cima daqui.
 *
 * ┌─ ARTIGO DE LEITURA: ELE NÃO ENSINA A MEXER EM NADA ─────────────────────────────────────────┐
 * │ REGISTRAR CONTATO tem formulário dentro desta janela e NÃO é ensinado aqui: é artigo próprio.  │
 * │ Esta peça diz que a seção existe, o que ela guarda e por que ela pende da CANDIDATURA e não da │
 * │ pessoa. MOVER DE ETAPA, TROCAR VAGA, REGISTRAR SAÍDA e ENVIAR PARA A ADMISSÃO também são de   │
 * │ outras peças: nenhum deles acontece aqui dentro.                                              │
 * │                                                                                               │
 * │ A LEITURA DA LISTA (escopo, cards, colunas) é o artigo de ler a Central. Esta peça começa      │
 * │ depois do clique no olho.                                                                     │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A DISTINÇÃO QUE O TEXTO PRECISA CARREGAR, MEDIDA NO CÓDIGO ────────────────────────────────┐
 * │ SÃO DOIS HISTÓRICOS, E ELES RESPONDEM PERGUNTAS DIFERENTES. "Por Onde Passou" é a linha do     │
 * │ tempo das ETAPAS e dos desfechos daquela candidatura (entrou, andou, voltou, trocou de vaga,   │
 * │ terminou), e é ela que responde por onde a pessoa andou depois que a etapa sai da leitura      │
 * │ viva. "Histórico De Contato" é a conversa: ligação, mensagem, observação. Quem confunde os     │
 * │ dois procura a movimentação no lugar errado e conclui que ela não foi registrada.               │
 * │                                                                                               │
 * │ E OS DOIS PENDEM DA CANDIDATURA, NÃO DA PESSOA: quem está em duas vagas tem duas linhas do     │
 * │ tempo e dois históricos de contato, um por caixa.                                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E AQUI ELA PESA MAIS QUE EM QUALQUER OUTRA PEÇA DA FAMÍLIA: esta é a tela que mostra CPF,
 * telefone, e-mail, nascimento e cidade. NENHUM desses valores foi copiado para este arquivo, em
 * nenhuma forma: o texto descreve os CAMPOS. Nenhum print é declarado, e nesta peça isso não é
 * cautela genérica: a auditoria de captura desta janela está em curso justamente porque ela é a
 * superfície com dado pessoal à vista, e é ela que vai decidir se cada imagem existe e recortada
 * como. O texto foi escrito para funcionar sem imagem nenhuma.
 */
export const artigo: Artigo = {
  slug: "ler-a-ficha-do-candidato",
  titulo: "Ler A Ficha Do Candidato",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como ler a ficha de uma pessoa: os dados de cadastro, cada candidatura dela em uma caixa, por onde ela passou no funil, o histórico de contato e o descritivo da vaga que abre dali.",
  termos: [
    "ficha do candidato",
    "abrir ficha",
    "olhinho do candidato",
    "dados do candidato",
    "ver cpf do candidato",
    "telefone do candidato",
    "historico do candidato",
    "por onde passou",
    "linha do tempo do candidato",
    "candidaturas da pessoa",
    "ver vaga do candidato",
    "quem alocou o candidato",
    "motivo do descarte",
  ],
  preRequisitos: [
    "Ter a pessoa na lista da Central De Candidatos. Se ela já recebeu desfecho, troque o escopo para Histórico antes de procurar.",
  ],
  passos: [
    {
      gesto:
        "Na linha da pessoa, clique no ícone de olho, na coluna Ações, para abrir a ficha.",
      detalhe:
        "A ficha é a única superfície do sistema que mostra o CPF, e ela abre uma pessoa por vez, por clique deliberado.",
      controles: ["Ver a ficha"],
    },
    {
      gesto:
        "Leia o cabeçalho: o nome, a etiqueta de origem e a data em que a pessoa foi cadastrada.",
      detalhe:
        "A etiqueta de origem diz de onde aquele cadastro veio. Logo abaixo, o sistema informa quantas candidaturas a pessoa tem. Quando existe a marca de guarda permanente, ela aparece ao lado da origem, e significa que aquela pessoa não entra no descarte por prazo de retenção.",
      controles: ["Banco De Talentos"],
    },
    {
      gesto:
        "No bloco A Pessoa, confira os dados de cadastro: CPF, telefone, e-mail, nascimento, cidade e UF.",
      detalhe:
        "Campo em branco aparece como não informado. Quem foi cadastrado sem CPF mostra não informado na primeira linha, e isso é estado normal em captação. Os campos não são editáveis nesta janela.",
      controles: ["A Pessoa"],
    },
    {
      gesto:
        "No bloco As Candidaturas, leia uma caixa por vaga: o nome da vaga, o código, quando a pessoa foi alocada e por quem.",
      detalhe:
        "Quem está em duas vagas tem duas caixas, cada uma com a sua etapa, a sua situação e o seu histórico. Quem está na base e ainda não entrou em vaga vê uma frase no lugar das caixas, dizendo que esse é um estado normal.",
      controles: ["As Candidaturas"],
    },
    {
      gesto:
        "Nas etiquetas de cada caixa, leia a etapa e a situação daquela candidatura.",
      detalhe:
        "A etapa vale enquanto a candidatura está viva. Encerrada, a etiqueta passa a dizer Fora Do Funil, e o caminho percorrido fica logo abaixo. Quando houve saída com motivo escrito, o motivo registrado aparece na própria caixa.",
    },
    {
      gesto: "Leia Por Onde Passou para reconstruir o caminho daquela candidatura.",
      detalhe:
        "Cada linha traz a data, de qual etapa para qual, quem registrou e, quando houver, o motivo. Troca de vaga, reprovação pelo cliente, desfecho e entrada aparecem marcados, cada um com a sua etiqueta.",
      controles: ["Por Onde Passou", "Trocou De Vaga", "Reprovado Pelo Cliente", "Aceite Registrado"],
    },
    {
      gesto: "Leia o Histórico De Contato daquela candidatura.",
      detalhe:
        "É a conversa com a pessoa: cada linha tem o tipo do contato, a data, quem registrou e o que aconteceu. O histórico pende da candidatura, então contato sobre uma vaga não aparece na caixa da outra.",
      controles: ["Histórico De Contato"],
    },
    {
      gesto: "Clique em Ver vaga para ler o descritivo da vaga sem sair da ficha.",
      detalhe:
        "O descritivo abre por cima, com O Trabalho, A Proposta e O Processo. Fechar devolve a ficha exatamente como ela estava, então ler a vaga não custa o contexto da triagem.",
      controles: ["Ver vaga", "O Trabalho", "A Proposta", "O Processo", "Abrir na Central De Vagas"],
    },
    {
      gesto: "Feche a ficha pelo Fechar, no rodapé, ou pela tecla Esc.",
      detalhe:
        "A janela não fecha por clique fora, para um clique torto não jogar fora o que você estava lendo ou escrevendo.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A ficha diz Sem candidatura registrada.",
      acao: "Aquela pessoa está na base e ainda não entrou em vaga nenhuma. É estado normal, não cadastro pela metade: use Adicionar à vaga quando ela entrar em um processo.",
    },
    {
      sintoma: "A tela mostra Falha ao carregar a ficha.",
      acao: "A consulta não voltou. Feche a janela e abra de novo pelo ícone de olho. Se repetir, recarregue a página e avise a administração.",
    },
    {
      sintoma: "O botão Ver vaga está indisponível.",
      acao: "O descritivo daquela vaga não está entre os que a tela carregou. Recarregue a página e abra a ficha de novo. Persistindo, abra a vaga diretamente pela Central De Vagas.",
    },
    {
      sintoma: "Por Onde Passou diz Sem movimentação registrada nesta candidatura.",
      acao: "Aquela candidatura é anterior ao registro de movimentação, e nenhuma passagem foi inventada para preencher a lista. O registro começa a partir da primeira movimentação feita no sistema.",
    },
    {
      sintoma: "A linha de CPF diz não informado e eu preciso do número.",
      acao: "Aquela pessoa foi cadastrada sem CPF, que é caso comum em captação. O número é cobrado quando a candidatura vira admissão, e até lá o cadastro segue válido.",
    },
    {
      sintoma:
        "A ficha avisa que a retenção da pessoa venceu e os dados de identificação foram descartados.",
      acao: "Aquele cadastro passou do prazo de guarda e os dados de identificação foram apagados. O histórico das vagas continua na ficha. Se a pessoa voltou a participar de um processo, cadastre-a de novo.",
    },
  ],
  regras: [
    "O CPF aparece só na ficha, uma pessoa por vez. A lista não o mostra nem o recebe.",
    "Os dados de cadastro não são editáveis nesta janela: ela é de leitura.",
    "Cada candidatura tem a sua caixa, a sua linha do tempo e o seu histórico de contato. Contato sobre uma vaga não é história de outra.",
    "São dois históricos diferentes: Por Onde Passou é a movimentação no funil, e Histórico De Contato é a conversa com a pessoa.",
    "A etapa é mostrada só enquanto a candidatura está viva. Encerrada, a etiqueta diz Fora Do Funil, e o caminho fica em Por Onde Passou.",
    "Por Onde Passou vazia é estado legítimo: nas candidaturas anteriores ao registro, nenhuma passagem foi fabricada.",
    "A marca de guarda permanente aparece só quando existe, e ela significa que aquela pessoa não entra no descarte por prazo de retenção. Quem a concede é o Super Admin, no cadastro.",
    "O descritivo da vaga abre por cima da ficha e fechar devolve a ficha como ela estava.",
  ],
  relacionados: [
    "ler-a-central-de-candidatos",
    "cadastrar-um-candidato-novo",
    "adicionar-um-candidato-a-uma-vaga",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/FichaCandidatoModal.tsx",
    "apps/frontend/src/components/as/vagas/VagaResumoModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
