import type { Artigo } from "../../tipos";

/**
 * N1 DAS PASTAS DO DRIVE, 1 de 2: O MAPA POR TIPO DE CONTRATO.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ────────────────────────────────────────────────────┐
 * │ Ela cobre o cadastro de UMA pasta-pai para cada tipo de contrato: escolher o escopo, escolher   │
 * │ o tipo, colar a referência da pasta, validar, salvar, editar e remover. Ela para quando a linha │
 * │ está na tabela.                                                                                │
 * │                                                                                                │
 * │ O que ela NÃO cobre: o escopo por cliente do contrato Fopag, que tem consequência própria e     │
 * │ peça própria; e ABRIR o prontuário guardado, que é o logo do Drive nas telas de trabalho e já    │
 * │ tem artigo escrito.                                                                             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E AQUI A ARMADILHA É ESPECÍFICA: NENHUM identificador de pasta e NENHUM endereço real de
 * produção entra no texto. Identificador de pasta é ponteiro para documento de pessoa. O artigo
 * descreve o FORMATO ("o endereço que aparece na barra do navegador com a pasta aberta"), nunca um
 * valor. Mesma régua para nome, documento e endereço vistos em qualquer lugar.
 *
 * SEM IMAGEM DECLARADA: os prints desta frente entram em entrega própria.
 */
export const artigo: Artigo = {
  slug: "cadastrar-a-pasta-pai-do-drive-por-tipo-de-contrato",
  titulo: "Cadastrar A Pasta-Pai Do Drive Por Tipo De Contrato",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/pastas-drive"],
  menus: ["pastas-drive"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "motor-de-documentos",
  resumo:
    "Como dizer ao sistema em qual pasta do Drive ele guarda os documentos de cada tipo de contrato: colar o endereço da pasta, validar e salvar.",
  termos: [
    "pasta do drive",
    "pasta pai",
    "onde salva o documento",
    "arquivamento",
    "configurar drive",
    "mapear pasta",
    "pasta por tipo de contrato",
    "temporario terceirizado estagio",
    "documento nao foi para o drive",
    "id da pasta",
    "link da pasta",
  ],
  preRequisitos: [
    "Ter a pasta já criada no Drive e compartilhada com a conta de serviço do sistema: sem isso a validação recusa.",
    "Ter o endereço da pasta em mãos, copiado da barra do navegador com a pasta aberta.",
  ],
  passos: [
    {
      gesto: "Abra Pastas Do Drive pelo menu da lateral esquerda.",
      detalhe:
        "O formulário fica no topo e a tabela dos mapeamentos já cadastrados, logo abaixo.",
      controles: ["Pastas Do Drive"],
    },
    {
      gesto: "Em Escopo, deixe selecionado Contrato.",
      detalhe:
        "Contrato é o mapa por tipo de vínculo, e vale para todos os clientes daquele tipo. O outro escopo, Fopag, é por cliente e tem regra própria.",
      controles: ["Escopo:", "Contrato", "Fopag"],
    },
    {
      gesto: "Escolha o tipo de contrato na lista.",
      detalhe: "Cada tipo tem uma pasta-pai, e só uma.",
      controles: ["Tipo de contrato"],
    },
    {
      gesto:
        "Cole no campo seguinte o endereço da pasta, copiado da barra do navegador com a pasta aberta no Drive.",
      detalhe:
        "Serve o endereço inteiro, aquele que traz a palavra folders no meio, ou só o identificador da pasta. Endereço de arquivo não serve: tem de ser de pasta.",
      controles: ["URL ou ID da pasta do Drive"],
    },
    {
      gesto: "Clique em Validar e espere a resposta.",
      detalhe:
        "O sistema tenta enxergar a pasta no Drive de verdade. Dando certo, aparece um aviso verde com o identificador que ele reconheceu. Dando errado, aparece o motivo em vermelho e nada foi salvo ainda.",
      controles: ["Validar"],
    },
    {
      gesto: "Clique em Salvar.",
      detalhe:
        "O sistema confere a pasta mais uma vez na hora de salvar, então pasta que perdeu o acesso no meio do caminho não entra. O rótulo da linha é montado pelo próprio sistema a partir do escopo e do tipo.",
      controles: ["Salvar"],
    },
    {
      gesto: "Confira a linha na tabela: escopo, chave, rótulo, identificador da pasta e estado.",
      detalhe:
        "A tabela ordena por clique no cabeçalho das colunas, o que ajuda quando há muitos mapeamentos.",
      controles: ["Escopo", "Chave", "Rótulo", "ID da pasta", "Ativo", "Ações"],
    },
    {
      gesto:
        "Para trocar a pasta depois, clique em editar na linha, cole a nova referência, valide e salve.",
      detalhe:
        "A tela sobe até o formulário já preenchido com aquele mapeamento, e avisa que você está editando.",
      controles: ["editar", "Salvar alterações", "Cancelar"],
    },
    {
      gesto: "Para desfazer o mapeamento, clique em remover e confirme em Remover.",
      detalhe:
        "A janela avisa o que acontece: aquele tipo de contrato volta a ficar sem pasta-pai, e o arquivamento dele para até um mapeamento novo.",
      controles: ["remover", "Remover Mapeamento De Pasta", "Remover"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Os documentos de um tipo de contrato não estão indo para o Drive.",
      acao: "Confira nesta tela se existe linha daquele tipo e se ela está Ativo. Sem pasta-pai o sistema não arquiva, e os documentos ficam aguardando até o mapeamento existir.",
    },
    {
      sintoma: "Você colou o endereço e o sistema reconheceu um identificador diferente do que esperava.",
      acao: "O sistema extrai o trecho do endereço que identifica a pasta. Abra a pasta certa no Drive, copie o endereço de novo e valide outra vez antes de salvar.",
    },
    {
      sintoma: "A validação deu certo e o salvar recusou.",
      acao: "O sistema confere a pasta de novo no momento de salvar. Se o acesso mudou no meio do caminho, a mensagem diz o motivo e nada foi gravado. Confira o compartilhamento da pasta no Drive e tente outra vez.",
    },
    {
      sintoma: "Existem duas linhas para o mesmo tipo de contrato.",
      acao: "Não existem: o mapeamento é um por tipo, e salvar o mesmo tipo de novo substitui o anterior. Se você vê duas linhas parecidas, confira a coluna Escopo, porque uma delas é do escopo Fopag.",
    },
  ],
  regras: [
    "Um tipo de contrato tem uma pasta-pai, e salvar o mesmo tipo de novo substitui o mapeamento anterior.",
    "Só pasta validada é salva: referência que o sistema não reconhece ou pasta que ele não enxerga não entram.",
    "O sistema valida duas vezes, no botão de validar e de novo ao salvar.",
    "Sem pasta-pai mapeada, o sistema não arquiva os documentos daquele contrato: eles ficam aguardando, e nada é guardado no lugar errado.",
    "O rótulo da linha é montado pelo sistema a partir do escopo e da chave.",
    "Remover o mapeamento para o arquivamento daquele tipo de contrato até um mapeamento novo.",
  ],
  relacionados: [
    "cadastrar-a-pasta-pai-de-um-cliente-fopag",
    "abrir-o-prontuario-no-drive",
    "os-alertas-de-arquivamento-e-de-prontuario",
    "auditar-os-documentos-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/pastas-drive/page.tsx",
    "apps/backend/src/admin/pastas-drive/pastas-drive.controller.ts",
    "apps/backend/src/ai/drive-pasta-pai.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
