import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO, 4 de 4: O BLOCO DE UNIFORME E O DE EPI.
 *
 * ┌─ POR QUE ESTES DOIS BLOCOS MERECEM ARTIGO PRÓPRIO ───────────────────────────────────────────┐
 * │ Eles parecem gêmeos na tela (mesmo desenho, mesmo par Sim e Não, um embaixo do outro) e se     │
 * │ comportam de forma OPOSTA: a resposta do uniforme TRAVA a liberação, a do EPI não trava nada.  │
 * │ Quem lê os dois como iguais fica parado sem saber qual dos dois prendeu o botão. E há a         │
 * │ exceção que ninguém adivinha: o EPI não trava, MAS marcar "Outros" e não dizer qual é o item   │
 * │ trava (`epiOutrosFaltando` entra no gate `baseLiberar`, `liberacao/page.tsx`).                 │
 * │                                                                                                │
 * │ NÃO COBRE, por já ser artigo: liberar ("liberar-uma-admissao"), o lote ("liberar-em-lote") e    │
 * │ recusar ("recusar-uma-admissao-na-liberacao"). O artigo de liberar cita os dois blocos em UM     │
 * │ passo, de passagem; aqui está o detalhe deles, e é por isso que o passo 1 já entra com a janela │
 * │ aberta, sem reensinar como chegar nela.                                                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A TRAVA DO UNIFORME NÃO É RELAXADA PELO ACEITE DO MASTER, E ISSO SURPREENDE ─────────────────┐
 * │ O aceite explícito de Master e Super Admin relaxa os SEIS campos da folha, e só eles: a base do │
 * │ gate (cliente, cargo, uniforme, documento válido, vínculo e projeto) continua dura para todo    │
 * │ mundo. Então o Master clica no botão de liberar mesmo com campos faltando e ele também não      │
 * │ acende enquanto a pergunta do uniforme estiver sem resposta.                                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE A MEMÓRIA DO PAR CLIENTE E CARGO TRAZ, E O QUE ELA NÃO TRAZ ──────────────────────────┐
 * │ Ela pré-preenche SÓ o "possui sim ou não" das duas perguntas, e nunca os tamanhos: tamanho é   │
 * │ individual, e herdar o do candidato anterior seria erro caro em roupa comprada. E ela só entra  │
 * │ quando a pergunta ainda está sem resposta, então o que você respondeu nunca é sobrescrito.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a liberação vigente do motor de captura já
 * recusava duas capturas desta fila por dado pessoal, e a janela mostra a pessoa no cabeçalho. Os
 * prints entram em entrega própria, e o texto nomeia cada controle por escrito.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa, só rótulos de campo e opções de catálogo.
 */
export const artigo: Artigo = {
  slug: "informar-o-uniforme-e-o-epi-na-liberacao",
  titulo: "Informar O Uniforme E O EPI",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "Como responder os blocos de uniforme e de EPI na janela de liberação: por que a resposta do uniforme trava o botão e ter uniforme não trava nada, quando os tamanhos valem, e o único caso em que o EPI prende a liberação.",
  termos: [
    "uniforme",
    "possui uniforme",
    "tamanho de camiseta",
    "tamanho de calca",
    "tamanho de bota",
    "epi",
    "equipamento de protecao",
    "capacete",
    "luva",
    "oculos",
    "protetor auricular",
    "botao liberar apagado",
    "nao consigo liberar",
    "resposta obrigatoria",
  ],
  preRequisitos: [
    "Estar com a janela de liberação aberta, na pessoa certa. Os dois blocos ficam abaixo do campo de observações.",
    "Saber se aquele cliente e aquele cargo usam uniforme. Não sabendo o tamanho, dá para responder que usa e deixar os tamanhos para depois.",
  ],
  passos: [
    {
      gesto: "Role a janela de liberação até o bloco Possui uniforme?",
      detalhe:
        "Ele fica logo abaixo das observações, em uma caixa própria, e o rótulo tem o asterisco de obrigatório.",
      controles: ["Possui uniforme?"],
    },
    {
      gesto: "Responda Sim ou Não.",
      detalhe:
        "A resposta é obrigatória e é ela que trava o botão Liberar. Ter uniforme não bloqueia nada: o que bloqueia é a pergunta ficar sem resposta. Sem resposta, a própria caixa avisa em amarelo.",
      controles: ["Sim", "Não"],
    },
    {
      gesto: "Respondido Sim, escolha os tamanhos.",
      detalhe:
        "Camiseta, Calça e Bota são listas fechadas, nunca digitadas: camiseta vai de P a G4, calça aceita as letras e os números, bota só números. Os três são opcionais e nascem em branco a cada candidato, porque tamanho é individual. Não sabendo, deixe em Não informado.",
      controles: ["Camiseta", "Calça", "Bota", "Tamanho…", "Não informado"],
    },
    {
      gesto: "Respondido Não, não procure os tamanhos.",
      detalhe:
        "Eles desaparecem e o que estivesse escolhido é descartado, de propósito: tamanho de quem não usa uniforme só reapareceria como informação errada na ficha.",
    },
    {
      gesto: "Responda Possui EPI? se você souber.",
      detalhe:
        "Este bloco não trava a liberação e pode ficar sem resposta nenhuma. Respondido Sim, marque os itens: Capacete, Luva, Óculos e Outros. O que for marcado vira o aviso da ficha, para quem conduzir a admissão validar o equipamento.",
      controles: ["Possui EPI?", "Capacete", "Luva", "Óculos", "Outros"],
    },
    {
      gesto: "Marcando Outros, diga qual é o item.",
      detalhe:
        "É a única parte do EPI que prende a liberação: marcar Outros e deixar o texto vazio mantém o botão apagado, porque o aviso da ficha não informaria nada a quem for validar. Desmarcar Outros limpa o texto.",
      controles: ["Qual outro EPI?", "Ex.: protetor auricular"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O bloco de uniforme avisa Resposta obrigatória para liberar. Ter uniforme não bloqueia o fluxo, não responder bloqueia.",
      acao: "Marque Sim ou Não na pergunta do uniforme e o botão acende. Não é preciso saber os tamanhos para responder.",
    },
    {
      sintoma:
        "Aparece Responda se o candidato possui uniforme antes de liberar. Ter uniforme não bloqueia nada, mas a resposta é obrigatória.",
      acao: "A liberação foi recusada na gravação porque a pergunta chegou sem resposta. Volte à janela, responda e libere de novo: nada foi criado no meio do caminho.",
    },
    {
      sintoma: "Sou Master, usei o botão de liberar mesmo com campos faltando, e ele não liberou.",
      acao: "O aceite relaxa os seis campos da folha, e só eles. A resposta do uniforme continua obrigatória para todos os papéis, inclusive Super Admin.",
    },
    {
      sintoma: "Marquei Outros no EPI e o botão Liberar ficou apagado.",
      acao: "Diga qual é o item no campo Qual outro EPI?, ou desmarque Outros. É o único caso em que o EPI prende a liberação.",
    },
    {
      sintoma:
        "Aparece Marcou \"Outros\" no EPI: informe qual é o item. Sem isso o aviso da ficha não diz nada a quem for validar.",
      acao: "O texto do item chegou vazio na gravação. Preencha o campo Qual outro EPI? e libere outra vez.",
    },
    {
      sintoma: "A resposta de uniforme ou de EPI já veio marcada quando eu escolhi cliente e cargo.",
      acao: "É a sugestão do último pacote usado naquele mesmo cliente e cargo, e vale só para o Sim e o Não, nunca para os tamanhos. Confira antes de liberar: é sugestão, não imposição, e o que você responder prevalece.",
    },
    {
      sintoma: "O tamanho que eu preciso não está na lista.",
      acao: "As listas são fechadas de propósito, para a compra não receber tamanho digitado errado. Não havendo o tamanho, deixe em Não informado e registre a necessidade nas observações da liberação.",
    },
    {
      sintoma: "A admissão já entrou na esteira e o uniforme aparece como pendência.",
      acao: "A resposta é dada depois pelo lápis da linha, no Gerenciador ou na esteira. A pendência fecha assim que a pergunta for respondida, inclusive com Não.",
    },
  ],
  regras: [
    "A resposta sobre uniforme é obrigatória para liberar. Ter uniforme nunca bloqueia, não responder bloqueia.",
    "A trava do uniforme vale para todos os papéis: o aceite de Master e Super Admin relaxa os seis campos da folha, e não esta pergunta.",
    "Os tamanhos só existem quando a resposta é Sim, e mesmo aí são opcionais.",
    "Responder Não descarta os tamanhos que estivessem escolhidos.",
    "Os tamanhos nascem em branco em cada candidato, porque tamanho é individual e não se herda do par cliente e cargo.",
    "O EPI é opcional de ponta a ponta e pode ficar sem resposta nenhuma.",
    "A exceção do EPI é o item Outros: marcado sem dizer qual, ele prende a liberação.",
    "A sugestão automática traz apenas o Sim ou o Não das duas perguntas, e só quando elas ainda estão sem resposta.",
    "A pendência do uniforme é a RESPOSTA, não o uniforme: responder Não fecha a pendência.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "liberar-em-lote",
    "recusar-uma-admissao-na-liberacao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "editar-os-dados-de-uma-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/domain/admissao.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
