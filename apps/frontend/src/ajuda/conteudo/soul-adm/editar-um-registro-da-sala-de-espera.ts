import type { Artigo } from "../../tipos";

/**
 * N2 DA SALA DE ESPERA: CORRIGIR O QUE JÁ FOI ANUNCIADO, E ACHAR A LINHA CERTA.
 *
 * ┌─ O RECORTE, E O QUE FICA DE FORA POR JÁ TER ARTIGO ──────────────────────────────────────────┐
 * │ ANUNCIAR (o Novo Registro) e as duas SAÍDAS da Sala (o vínculo com a admissão e o status que    │
 * │ encerra) são artigos irmãos, e este não os repete. Aqui fica o que sobrou e ninguém tinha       │
 * │ escrito: a EDIÇÃO de um registro que já existe, e os recortes da tela que fazem achar a linha    │
 * │ certa antes de editar (as três abas, o contador de cada uma, a busca e a ordenação).            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DOIS FATOS DA TELA QUE MUDAM O QUE A PESSOA FAZ, e os dois foram lidos do código ───────────┐
 * │ 1. O LÁPIS APARECE NAS TRÊS ABAS. O botão de vincular só existe na fila viva, mas a edição não: │
 * │    dá para corrigir o telefone de quem já foi vinculado e de quem já foi encerrado             │
 * │    (`app/(app)/sala-espera/page.tsx`, a coluna de ações). Quem não sabe disso reanuncia a       │
 * │    pessoa para arrumar um dado, e passa a ter duas linhas da mesma pessoa.                     │
 * │ 2. A SÉTIMA COLUNA TROCA DE ASSUNTO. Na aba de vinculadas ela é Vinculado Em; nas outras duas é │
 * │    Status. É a mesma posição mostrando coisas diferentes, e é a leitura mais fácil de errar.    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS OBRIGATÓRIOS SÃO CINCO, e é o que trava o Salvar (`completo`, na tela): nome, cliente, cargo,
 * data de recebimento e status. Documento, nascimento, e-mail e telefone são opcionais.
 *
 * §A.6: a tela carrega nome, telefone, e-mail e documento de gente real. Nenhum deles, nem sequer
 * como exemplo, aparece neste arquivo: o artigo descreve o CAMPO.
 *
 * IMAGEM: pendência conhecida. A Sala De Espera estava entre as capturas recusadas pela auditoria de
 * segurança, por mostrar nome de colega e de candidato. O texto foi escrito para funcionar sem
 * imagem.
 */
export const artigo: Artigo = {
  slug: "editar-um-registro-da-sala-de-espera",
  titulo: "Editar Um Registro Da Sala De Espera",
  modulo: "SOUL_ADM",
  rotas: ["/sala-espera"],
  menus: ["sala-espera"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "sala-espera",
  resumo:
    "Como corrigir um registro que já foi anunciado, nas três abas da Sala De Espera, e como achar a linha certa antes de editar.",
  termos: [
    "editar registro",
    "corrigir cadastro da sala de espera",
    "mudar o telefone",
    "errei o cliente",
    "errei o cargo",
    "trocar o cargo do candidato anunciado",
    "acrescentar cpf depois",
    "lapis",
    "atualizar registro",
    "achar na sala de espera",
    "vinculado em",
  ],
  preRequisitos: [
    "O registro já precisa existir. Incluir alguém novo é outro caminho, pelo Novo Registro.",
  ],
  passos: [
    {
      gesto: "Abra o menu Sala De Espera e escolha a aba onde o registro está.",
      detalhe:
        "Aguardando é a fila viva. Admissões Vinculadas guarda quem já virou admissão. Admissões Inativadas guarda quem recebeu um status de encerramento. O número ao lado da busca conta as linhas da aba em que você está.",
      controles: ["Sala De Espera", "Aguardando", "Admissões Vinculadas", "Admissões Inativadas"],
    },
    {
      gesto: "Ache a linha pela busca do topo.",
      detalhe:
        "A busca procura por candidato, cliente, cargo ou telefone ao mesmo tempo, enquanto você digita, e vale só para a aba aberta.",
      controles: ["Buscar por candidato, cliente, cargo ou telefone"],
    },
    {
      gesto: "Ordene pelas colunas clicando no cabeçalho, quando a lista estiver grande.",
      detalhe:
        "Candidato, Cliente, Cargo, Telefone, Recebido Em e Origem ordenam nas três abas. A sétima coluna troca de assunto conforme a aba: na de vinculadas ela é Vinculado Em, e nas outras duas é Status.",
      controles: [
        "Candidato",
        "Cliente",
        "Cargo",
        "Telefone",
        "Recebido Em",
        "Origem",
        "Status",
        "Vinculado Em",
      ],
    },
    {
      gesto: "Clique no lápis da coluna Ações, na linha da pessoa.",
      detalhe:
        "O aviso do mouse diz Editar registro. Ele aparece nas três abas, então corrigir um dado de quem já foi vinculado ou encerrado não exige anunciar a pessoa de novo.",
      controles: ["Ações", "Editar registro", "Editar Registro"],
    },
    {
      gesto: "Ajuste os campos na janela Editar Registro.",
      detalhe:
        "É o mesmo formulário do anúncio, já preenchido com o que está gravado. Nome, Cliente, Cargo, Data de recebimento e Status são obrigatórios e travam o Salvar enquanto algum estiver vazio. Cliente, Cargo, Origem e Status são escolhidos de lista, e as listas de cliente e de cargo têm busca.",
      controles: [
        "Editar Registro",
        "Nome",
        "Cliente",
        "Cargo",
        "Data de recebimento",
        "Status",
        "Origem",
      ],
    },
    {
      gesto: "Aproveite para completar os campos opcionais.",
      detalhe:
        "CPF, data de nascimento, e-mail e telefone não são cobrados, e é o documento que faz o registro casar com a admissão por identidade em vez de por nome. A própria janela lembra isso no rodapé do formulário.",
      controles: ["CPF (opcional)", "Data de nascimento (opcional)", "E-mail (opcional)", "Telefone (opcional)"],
    },
    {
      gesto: "Clique em Salvar.",
      detalhe:
        "A lista recarrega com o valor novo. Ao escolher um status que encerra, a linha sai da aba Aguardando e aparece em Admissões Inativadas: o rótulo da lista avisa quais status fazem isso.",
      controles: ["Salvar", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Ao salvar aparece CPF inválido.",
      acao: "O documento é opcional, mas quando preenchido precisa ser válido: documento errado casaria o registro com a pessoa errada mais tarde. Confira dígito por dígito, ou apague o campo e salve sem ele.",
    },
    {
      sintoma: "A tela mostra Registro não encontrado.",
      acao: "Aquela linha saiu da lista enquanto a sua janela estava aberta. Cancele, recarregue a página e edite de novo pela lista de agora.",
    },
    {
      sintoma: "A tela mostra Falha ao salvar.",
      acao: "A gravação não completou e nada foi alterado. Recarregue a página, confira como o registro está e repita a edição.",
    },
    {
      sintoma: "Editei a pessoa e ela desapareceu da aba em que eu estava.",
      acao: "Você trocou o status por um que encerra. Ela está em Admissões Inativadas, com o registro inteiro. Nada é apagado nesta tela, e dá para voltar atrás editando o status de novo.",
    },
    {
      sintoma: "Preciso corrigir o dado de quem já virou admissão.",
      acao: "O lápis existe também na aba Admissões Vinculadas, então a correção é feita ali. Mas a correção vale para o registro da Sala: os dados da admissão em si são editados na tela da admissão.",
    },
    {
      sintoma: "O lápis não abre a janela.",
      acao: "Recarregue a página. Se a lista tiver acabado de mudar, a linha pode não existir mais na aba em que você está.",
    },
  ],
  regras: [
    "A edição existe nas três abas: quem já foi vinculado ou encerrado continua corrigível.",
    "Corrigir é sempre melhor que reanunciar: duas linhas da mesma pessoa viram dois registros a tratar.",
    "São cinco os campos obrigatórios: nome, cliente, cargo, data de recebimento e status. Faltando um, o Salvar fica travado.",
    "Documento, nascimento, e-mail e telefone são opcionais, e o documento é o que faz o registro casar por identidade com a admissão depois.",
    "Documento preenchido precisa ser válido. Vazio é normal, errado não.",
    "Mudar o status para um que encerra tira o registro da fila viva e o joga na aba de inativadas, sem apagar nada.",
    "A sétima coluna da tabela mostra Vinculado Em na aba de vinculadas e Status nas outras duas.",
    "Editar o registro da Sala não altera a admissão: quando a pessoa já virou admissão, os dados dela são editados na tela da admissão.",
  ],
  relacionados: [
    "anunciar-um-candidato-na-sala-de-espera",
    "mover-da-sala-de-espera-para-a-admissao",
    "editar-os-dados-de-uma-admissao",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/sala-espera/page.tsx",
    "apps/backend/src/sala-espera/sala-espera.service.ts",
    "apps/backend/src/sala-espera/sala-espera.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
