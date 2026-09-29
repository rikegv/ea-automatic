import type { Artigo } from "../../tipos";

/**
 * N1 DA SALA DE ESPERA 2 de 2: A SAÍDA DA SALA.
 *
 * ┌─ SÃO DUAS SAÍDAS, E O ARTIGO PRECISA ENSINAR AS DUAS ───────────────────────────────────────┐
 * │ A saída boa é o VÍNCULO: o candidato apareceu na Liberação e o registro da Sala é casado com a   │
 * │ admissão dele. A saída ruim é o STATUS QUE ENCERRA: a pessoa declinou, desistiu ou o processo    │
 * │ foi cancelado. Ensinar só a primeira deixa a fila crescendo para sempre, porque ninguém sabe o   │
 * │ que fazer com quem não veio, e foi exatamente esse o buraco que a aba Admissões Inativadas veio  │
 * │ fechar.                                                                                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CONFUSÃO QUE O ARTIGO EXISTE PARA EVITAR: VINCULAR NÃO É LIBERAR ────────────────────────┐
 * │ O rodapé do livreto já diz isso, e a mensagem verde depois do vínculo repete: o cliente vai para │
 * │ a admissão como SUGESTÃO, e só nos campos vazios, e a liberação continua sendo passo à parte, na │
 * │ tela de Liberação. Sem essa frase o time vincula e espera que a admissão ande sozinha.           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O ALVO DO VÍNCULO É A FILA DA LIBERAÇÃO, e não o sistema inteiro: o livreto lista as admissões que
 * aguardam liberação, que é de onde vem a admissão recém-nascida do Pandapé.
 *
 * §A.6: nenhum nome, CPF ou telefone de pessoa real aparece aqui.
 */
export const artigo: Artigo = {
  slug: "mover-da-sala-de-espera-para-a-admissao",
  titulo: "Mover Da Sala De Espera Para A Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/sala-espera"],
  menus: ["sala-espera"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "sala-espera",
  resumo:
    "As duas saídas da Sala De Espera: casar o registro com a admissão que chegou na Liberação, e encerrar quem não seguiu, sem apagar nada.",
  termos: [
    "vincular",
    "vincular admissao",
    "casar com a admissao",
    "match",
    "tirar da sala de espera",
    "virou admissao",
    "o candidato se candidatou",
    "declinou na sala",
    "desistiu",
    "inativar registro",
    "admissoes vinculadas",
    "admissoes inativadas",
  ],
  preRequisitos: [
    "A admissão da pessoa já precisa existir e estar aguardando liberação. O livreto do vínculo lista a fila da Liberação, e não o sistema inteiro.",
  ],
  passos: [
    {
      gesto: "Na aba Aguardando, ache a pessoa pela busca do topo.",
      detalhe:
        "A busca aceita candidato, cliente, cargo ou telefone. O botão Vincular existe só nesta aba: nas outras duas o trabalho já foi feito, ou o registro já está encerrado.",
      controles: ["Aguardando", "Buscar por candidato, cliente, cargo ou telefone", "Vincular"],
      print: {
        arquivo: "01-botao-vincular.png",
        legenda: "Passo 1: a linha da aba Aguardando, com o botão Vincular.",
      },
    },
    {
      gesto: "Clique em Vincular para abrir o livreto.",
      detalhe:
        "A janela tem duas páginas. À esquerda, Quem Esperava, com o que foi anunciado. À direita, Admissões Na Liberação, com a fila de quem chegou. O elo do meio fecha quando você escolhe um dos dois lados.",
      controles: ["Vincular Admissão", "Quem Esperava", "Admissões Na Liberação"],
    },
    {
      gesto: "Confira, à esquerda, se é mesmo a pessoa certa.",
      detalhe:
        "Estão ali cliente, cargo, status, data de recebimento, origem, CPF, nascimento e telefone, exatamente como foram anunciados. É a última conferência antes de o registro virar admissão.",
      controles: ["Cliente", "Cargo", "Status", "Recebido em", "Origem", "CPF", "Nascimento", "Telefone"],
      print: {
        arquivo: "02-livreto-do-vinculo.png",
        legenda: "Passo 3: o livreto do vínculo, com a Sala de um lado e a Liberação do outro.",
      },
    },
    {
      gesto: "À direita, ache a admissão e clique nela.",
      detalhe:
        "A busca aceita nome, CPF ou telefone. Quando o CPF do registro bate com o da admissão, a etiqueta CPF Confere aparece na candidata certa: é o sinal mais forte que a tela oferece, e é por isso que vale preencher o CPF lá no cadastro. O contador ao lado do título diz quantas admissões a busca deixou visíveis.",
      controles: ["Buscar por nome, CPF ou telefone", "CPF Confere"],
    },
    {
      gesto: "Confirme no rodapé.",
      detalhe:
        "A pergunta só aparece com os dois lados escolhidos, e ela repete o nome da admissão. Escolher outra desfaz a escolha sem fechar a janela.",
      controles: ["Vincular esta admissão?", "Sim, vincular", "Escolher outra", "Cancelar"],
    },
    {
      gesto: "Leia a mensagem verde que aparece depois do vínculo.",
      detalhe:
        "Ela diz quem foi vinculado a quem e lembra o que o vínculo NÃO faz: o cliente foi sugerido na admissão, e a liberação continua sendo passo à parte, na tela de Liberação. O registro sai da aba Aguardando e passa a viver em Admissões Vinculadas, com a data e a hora na coluna Vinculado Em.",
      controles: ["Admissões Vinculadas", "Vinculado Em"],
    },
    {
      gesto: "Para quem não seguiu, troque o status pelo lápis em vez de vincular.",
      detalhe:
        "Na lista de status, o rótulo escreve encerra ao lado do nome quando aquela escolha tira o registro da fila. Salvo, ele vai para a aba Admissões Inativadas, inteiro e consultável: nada é apagado.",
      controles: ["Editar registro", "Status", "Admissões Inativadas"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O sistema respondeu Este registro já foi vinculado a uma admissão.",
      acao: "Alguém vinculou antes de você, ou o clique foi repetido. Feche a janela, abra a aba Admissões Vinculadas e confira a coluna Vinculado Em: o registro está lá, com data e hora.",
    },
    {
      sintoma: "O sistema respondeu Admissão não encontrada.",
      acao: "A admissão escolhida saiu da fila da Liberação enquanto a janela estava aberta. Cancele, recarregue a página e abra o vínculo de novo para ver a fila de agora.",
    },
    {
      sintoma: "A lista da direita diz Nenhuma admissão aguardando liberação no momento.",
      acao: "A pessoa ainda não chegou: o vínculo só existe depois que a admissão nasce e entra na fila da Liberação. Deixe o registro na aba Aguardando e volte quando ela aparecer.",
    },
    {
      sintoma: "A lista da direita diz Nenhuma admissão encontrada para essa busca.",
      acao: "É o texto da busca recortando a fila. Apague o que está escrito e procure por outro dado: o campo aceita nome, CPF e telefone.",
    },
    {
      sintoma: "Vinculei e a admissão continua parada.",
      acao: "É o esperado. Vincular não libera: o cliente entrou na admissão como sugestão, e a liberação é feita na tela de Liberação, que é onde a admissão passa a andar.",
    },
    {
      sintoma: "A tela mostra Falha ao vincular.",
      acao: "Nada foi gravado. Tente de novo. Se repetir, cancele, recarregue a página e confira antes na aba Admissões Vinculadas se o vínculo chegou a acontecer.",
    },
  ],
  regras: [
    "São duas saídas da fila: o vínculo com uma admissão, e o status que encerra. Nada é apagado em nenhuma das duas.",
    "Vincular não libera. O cliente e o cargo vão para a admissão como sugestão, e só nos campos que estiverem vazios; a liberação continua sendo passo à parte.",
    "Um registro se vincula uma vez só. O sistema recusa o segundo vínculo, e a aba Admissões Vinculadas é onde se confere o primeiro.",
    "O vínculo só enxerga a fila da Liberação. Admissão que já foi liberada não aparece na lista da direita.",
    "A etiqueta CPF Confere aparece quando o CPF do registro bate com o da admissão. Sem CPF no registro, o casamento é feito pelo nome, no olho de quem escolhe.",
    "Quem foi encerrado e voltar depois é processo novo: o registro antigo fica como histórico em Admissões Inativadas.",
  ],
  relacionados: [
    "anunciar-um-candidato-na-sala-de-espera",
    "achar-uma-admissao-no-gerenciador",
    "ler-a-ficha-da-admissao",
    "buscar-dentro-da-tela",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/sala-espera/page.tsx",
    "apps/frontend/src/components/sala-espera/VincularAdmissaoLivreto.tsx",
    "apps/backend/src/sala-espera/sala-espera.service.ts",
  ],
  revisadoEm: "2026-09-28",
};
