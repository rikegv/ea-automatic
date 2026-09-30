import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO: A JANELA INTERMEDIÁRIA DO VÍNCULO.
 *
 * ┌─ O RECORTE, E ELE É O LADO DA LIBERAÇÃO, NUNCA O LADO DA SALA ────────────────────────────────┐
 * │ O vínculo tem DUAS portas na tela, e elas não são a mesma coisa:                               │
 * │   1. o LIVRETO da Sala De Espera, que já tem artigo próprio (`mover-da-sala-de-espera-para-a-  │
 * │      admissao`) e parte do registro da Sala para achar a admissão;                             │
 * │   2. esta, que parte da PRÉ-ADMISSÃO e é um passo no meio do caminho de liberar: o sistema     │
 * │      procura sozinho na Sala e mostra a janela quando acha alguém.                             │
 * │ Este artigo é só a 2. Ensinar as duas no mesmo texto faria a pessoa procurar, na Liberação, uma │
 * │ tela que vive em outro menu.                                                                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DOIS MENUS, E ISSO NÃO É ÓBVIO NA TELA (medido no registro de menus) ────────────────────────┐
 * │ O botão Vincular chama uma operação que pertence ao menu da Sala De Espera, e não ao da         │
 * │ Liberação. Quem tem só a Liberação abre a janela, escolhe o registro, clica em Vincular e leva  │
 * │ um acesso negado nominal. É o erro mais confuso desta janela, porque a pessoa está numa tela    │
 * │ que ela tem permissão para usar, e por isso ele está declarado letra por letra.                 │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ELE DELIBERADAMENTE NÃO COBRE: liberar (artigo próprio), o lote (artigo próprio), anunciar
 * candidato na Sala (artigo próprio) e o status que encerra o registro da Sala (lado da Sala).
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a captura desta janela mostra pessoa, e ela fica suspensa enquanto a
 * homologação não tiver dado sintético. O texto foi escrito para funcionar sem imagem nenhuma.
 *
 * §A.6: nenhum nome, CPF, telefone ou data de nascimento de pessoa aparece aqui, só rótulo de campo.
 */
export const artigo: Artigo = {
  slug: "vincular-a-pre-admissao-a-sala-de-espera",
  titulo: "Vincular A Pré-Admissão À Sala De Espera",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao", "sala-espera"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "A janela que aparece entre a fila e a liberação: como ela acha o registro da Sala de Espera, como escolher o certo, o que o vínculo traz preenchido e como seguir sem vincular.",
  termos: [
    "vincular",
    "vinculo",
    "sala de espera",
    "casar registro",
    "juntar com a sala",
    "apareceu uma janela antes de liberar",
    "seguir sem vincular",
    "cpf confere",
    "de onde veio o cliente preenchido",
    "ja veio preenchido",
    "quem anunciou o candidato",
  ],
  preRequisitos: [
    "Ter também o menu Sala De Espera liberado: é dele que depende o botão Vincular, mesmo a janela abrindo dentro da Liberação.",
    "O candidato já precisa ter sido anunciado na Sala de Espera por alguém. Sem registro em aberto lá, esta janela não aparece.",
  ],
  passos: [
    {
      gesto: "Clique em Liberar Admissão, na coluna Ação da linha.",
      detalhe:
        "O sistema procura na Sala de Espera antes de abrir a liberação. Achando alguém, esta janela entra na frente; não achando ninguém, a liberação abre direto e você não vê janela nenhuma.",
      controles: ["Liberar Admissão", "Vincular À Sala De Espera"],
    },
    {
      gesto: "Leia a lista que já veio aberta.",
      detalhe:
        "A busca de abertura é feita pelos dados do candidato que chegou, e a ordem é a da confiança. A etiqueta CPF confere marca o registro cujo CPF é o mesmo: aí é identidade, não semelhança, e o caso é de conferir, não de procurar.",
      controles: ["CPF confere"],
    },
    {
      gesto: "Confira o cliente, o cargo e a data de recebimento de cada registro.",
      detalhe:
        "Cada cartão mostra o cliente com o código na frente, o cargo, a data em que o registro foi recebido, a origem (Cliente ou Seleção) e o status dele na Sala. É esse conjunto que distingue dois registros de nome parecido.",
    },
    {
      gesto: "Procure pelo campo de busca quando a lista não trouxer o registro certo.",
      detalhe:
        "A busca manual procura por nome ou por telefone. Ela não procura por CPF: o CPF já foi usado na abertura, e se ele batesse o registro estaria na lista.",
      controles: ["Buscar por nome ou telefone", "Buscar"],
    },
    {
      gesto: "Clique no cartão do registro certo para escolher.",
      detalhe:
        "O cartão escolhido fica destacado, e o botão Vincular acende. Clicando nele outra vez você desfaz a escolha.",
    },
    {
      gesto: "Clique em Vincular.",
      detalhe:
        "O registro sai da fila da Sala e a liberação abre em seguida, já com o cliente e o cargo do registro. Dentro da liberação fica a marca verde dizendo a qual registro a admissão foi vinculada.",
      controles: ["Vincular"],
    },
    {
      gesto: "Clique em Seguir sem vincular quando nenhum registro for a pessoa.",
      detalhe:
        "Não é desistir de liberar: a liberação abre logo depois, em branco, e você preenche cliente e cargo na mão. O mesmo vale para o Fechar e para a tecla Esc.",
      controles: ["Seguir sem vincular", "Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        'Cliquei em Vincular e o sistema respondeu: Acesso negado: esta operação exige o menu "sala-espera", que não está liberado para o seu usuário.',
      acao: "O vínculo pertence ao menu Sala De Espera, e não ao da Liberação. Peça à diretoria a liberação do menu Sala De Espera, ou clique em Seguir sem vincular e preencha cliente e cargo na mão.",
    },
    {
      sintoma:
        "A janela diz: Nenhum registro em aberto na Sala para esta busca. Procure por nome ou telefone, ou siga sem vincular.",
      acao: "Ou ninguém anunciou essa pessoa na Sala, ou o registro dela já foi vinculado, ou ele já foi encerrado. Tente pelo telefone antes de desistir, e depois siga sem vincular: a liberação não depende do vínculo.",
    },
    {
      sintoma: "A janela responde Este registro já foi vinculado a uma admissão.",
      acao: "Cada registro da Sala se vincula uma vez só. Alguém já casou esse registro com outra admissão, possivelmente ao mesmo tempo que você. Feche, escolha outro registro ou siga sem vincular.",
    },
    {
      sintoma: "A janela mostra Falha ao buscar na Sala de Espera.",
      acao: "A consulta não voltou. Clique em Buscar outra vez. Repetindo, siga sem vincular para não travar a liberação, e avise a administração.",
    },
    {
      sintoma: "A janela mostra Falha ao vincular.",
      acao: "Nada foi gravado. Tente de novo; se repetir, siga sem vincular e preencha cliente e cargo na mão. O registro da Sala continua em aberto e pode ser casado depois pelo livreto da própria Sala.",
    },
    {
      sintoma: "Vinculei e o cliente da admissão continuou como estava.",
      acao: "É de propósito: o vínculo só preenche o que está vazio, e nunca escreve por cima de escolha de gente. Estando o campo já preenchido, o valor que fica é o que estava lá.",
    },
    {
      sintoma: "O botão Vincular não acende.",
      acao: "Falta escolher o registro. Clique no cartão da pessoa: escolhido, ele fica destacado e o botão acende.",
    },
  ],
  regras: [
    "A janela só aparece quando a busca na Sala de Espera achou alguém. Sem ninguém esperando, a liberação abre direto.",
    "A lista é sugestão, nunca decisão: quem escolhe o registro é quem opera.",
    "Vincular não libera. Ele traz cliente e cargo para a janela de liberação, e a liberação continua sendo o passo seguinte.",
    "O vínculo só preenche campo vazio da admissão. O que já estava preenchido nunca é sobrescrito, inclusive o telefone.",
    "Cada registro da Sala se vincula a uma admissão só.",
    "Fechar a janela por qualquer caminho segue para a liberação: cancelar aqui é seguir sem vincular, e não desistir de liberar.",
    "A busca manual procura por nome e por telefone. O CPF só é usado na busca de abertura.",
    "O botão Vincular depende do menu Sala De Espera liberado, mesmo a janela abrindo dentro da Liberação.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "ler-faltam-para-liberar",
    "tratar-possivel-duplicata-de-cpf",
    "mover-da-sala-de-espera-para-a-admissao",
    "anunciar-um-candidato-na-sala-de-espera",
    "abrir-e-fechar-uma-janela-do-sistema",
    "por-que-eu-nao-vejo-um-menu",
  ],
  fontes: [
    "apps/frontend/src/components/liberacao/VincularSalaModal.tsx",
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/backend/src/sala-espera/sala-espera.service.ts",
    "apps/backend/src/domain/menus.ts",
  ],
  revisadoEm: "2026-09-30",
};
