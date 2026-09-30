import type { Artigo } from "../../tipos";

/**
 * N1 DAS PASTAS DO DRIVE, 2 de 2: O ESCOPO POR CLIENTE, E A CONSEQUÊNCIA QUE FAZ A PEÇA EXISTIR.
 *
 * ┌─ POR QUE ESTE CASO TEM ARTIGO SEPARADO DO TIPO DE CONTRATO ──────────────────────────────────┐
 * │ Ele não é "o mesmo formulário com outra chave". Três coisas só acontecem aqui, e as três foram  │
 * │ conferidas no código:                                                                           │
 * │                                                                                                 │
 * │   1. A chave é DIGITADA, o código do cliente, e não escolhida numa lista fechada.                │
 * │   2. Existe HERANÇA: quando o cliente não tem pasta própria, o sistema procura a pasta da        │
 * │      empresa do grupo do vínculo Fopag dele. O cadastro por cliente é a exceção, e ele vence.     │
 * │   3. A FALTA ACENDE ALERTA. O diagnóstico do sistema lista cliente Fopag ativo sem pasta, e      │
 * │      acende ANTES da primeira admissão, pelo vínculo cadastrado. Cliente inativo não acende.      │
 * │                                                                                                 │
 * │ E a consequência que dá nome ao artigo: sem pasta mapeada, o arquivamento daquele cliente NÃO    │
 * │ acontece, então cliente novo desse tipo trava em silêncio até alguém cadastrar aqui.             │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum identificador de pasta real, nenhum endereço de produção e nenhum código de cliente
 * de verdade aparece no texto. O artigo descreve o FORMATO do que se cola, nunca um valor.
 *
 * SEM IMAGEM DECLARADA: os prints desta frente entram em entrega própria.
 */
export const artigo: Artigo = {
  slug: "cadastrar-a-pasta-pai-de-um-cliente-fopag",
  titulo: "Cadastrar A Pasta-Pai De Um Cliente Fopag",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/pastas-drive"],
  menus: ["pastas-drive"],
  publico: "GESTAO",
  nivel: "N1",
  familia: "motor-de-documentos",
  resumo:
    "Como mapear a pasta do Drive de um cliente Fopag, por que a falta desse cadastro trava o arquivamento daquele cliente e onde o sistema avisa que ele está faltando.",
  termos: [
    "pasta fopag",
    "cliente fopag",
    "cliente novo sem pasta",
    "travou o arquivamento",
    "nao arquivou no drive",
    "alerta do diagnostico",
    "pasta por cliente",
    "codigo do cliente",
    "empresa do grupo",
    "pasta da empresa",
    "prontuario nao foi criado",
  ],
  preRequisitos: [
    "Ter o código do cliente em mãos: é ele que identifica o mapeamento.",
    "Ter a pasta criada no Drive e compartilhada com a conta de serviço do sistema.",
    "Saber se aquele cliente usa a pasta da empresa do grupo ou uma pasta só dele.",
  ],
  passos: [
    {
      gesto: "Abra Pastas Do Drive pelo menu da lateral esquerda.",
      detalhe:
        "Quando você chega pelo alerta do diagnóstico, a tela abre com o escopo e o código já preenchidos, e é só colar a pasta.",
      controles: ["Pastas Do Drive"],
    },
    {
      gesto: "Em Escopo, clique em Fopag.",
      detalhe:
        "O campo da chave muda de natureza: no escopo Contrato ele é uma lista de tipos, aqui ele é o código do cliente, digitado.",
      controles: ["Escopo:", "Fopag", "Contrato"],
    },
    {
      gesto: "Digite o código do cliente no campo da chave.",
      detalhe:
        "É o mesmo código do cadastro de clientes. Um código por linha, e salvar o mesmo código de novo substitui o mapeamento anterior.",
      controles: ["Código do cliente (Fopag)"],
    },
    {
      gesto:
        "Cole o endereço da pasta, copiado da barra do navegador com a pasta aberta no Drive, e clique em Validar.",
      detalhe:
        "Serve o endereço inteiro, aquele que traz a palavra folders no meio, ou só o identificador da pasta. O aviso verde confirma que o sistema enxerga a pasta.",
      controles: ["URL ou ID da pasta do Drive", "Validar"],
    },
    {
      gesto: "Clique em Salvar e confira a linha nova na tabela.",
      detalhe:
        "A coluna Escopo mostra Fopag e a coluna Chave mostra o código do cliente. O rótulo é montado pelo sistema.",
      controles: ["Salvar", "Escopo", "Chave", "Rótulo", "ID da pasta", "Ativo"],
    },
    {
      gesto:
        "Quando vários clientes do mesmo grupo guardam na mesma pasta, cadastre o código da empresa do grupo em vez de repetir cliente por cliente.",
      detalhe:
        "O sistema procura primeiro a pasta do cliente. Não achando, procura a pasta da empresa do grupo do vínculo Fopag dele. Cadastro por cliente continua valendo como exceção, e vence a da empresa.",
    },
    {
      gesto:
        "Volte ao diagnóstico do sistema e confira se o alerta daquele cliente saiu da lista.",
      detalhe:
        "O alerta some quando o cliente passa a ter pasta, seja a dele, seja a da empresa do grupo.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Um cliente novo entrou e nenhum documento dele foi para o Drive.",
      acao: "É o caso típico desta tela. Sem pasta mapeada o sistema não arquiva, e nada avisa na tela da admissão. Cadastre a pasta daquele código de cliente aqui e o arquivamento volta a acontecer.",
    },
    {
      sintoma: "O alerta de cliente sem pasta continua aceso depois de você cadastrar.",
      acao: "Confira se o código digitado é o mesmo código do cadastro de clientes, sem espaço sobrando, e se a linha está Ativo. Código diferente cria outro mapeamento, e o cliente segue sem o dele.",
    },
    {
      sintoma: "O alerta acendeu para um cliente que ainda não tem nenhuma admissão.",
      acao: "É de propósito: o aviso nasce do vínculo cadastrado, antes da primeira admissão, para a pasta existir quando a primeira pessoa chegar. Cadastre a pasta normalmente.",
    },
    {
      sintoma: "Um cliente antigo, com quem a empresa não trabalha mais, aparece cobrando pasta.",
      acao: "Cliente inativo não entra nesse alerta. Se ele aparece, o cadastro dele ainda está ativo. Inative o cliente no cadastro de clientes, e não crie pasta para ele.",
    },
    {
      sintoma: "Você cadastrou a pasta da empresa do grupo e um cliente dela continua guardando em outro lugar.",
      acao: "Aquele cliente tem cadastro próprio, e o cadastro por cliente vence o da empresa. Edite ou remova a linha do cliente para ele passar a herdar a pasta da empresa.",
    },
  ],
  regras: [
    "No escopo Fopag a chave é o código do cliente, e há um mapeamento por código.",
    "Quando o cliente não tem pasta própria, o sistema usa a pasta da empresa do grupo do vínculo Fopag dele.",
    "O cadastro por cliente vence o da empresa do grupo.",
    "Sem pasta mapeada, o arquivamento daquele cliente não acontece e nada é guardado no lugar errado.",
    "Cliente Fopag ativo sem pasta aparece como alerta no diagnóstico do sistema, inclusive antes da primeira admissão.",
    "Cliente inativo no cadastro não entra nesse alerta.",
    "Só pasta validada é salva, e o sistema valida de novo na hora de salvar.",
  ],
  relacionados: [
    "cadastrar-a-pasta-pai-do-drive-por-tipo-de-contrato",
    "ler-o-diagnostico-do-sistema",
    "os-alertas-de-arquivamento-e-de-prontuario",
    "abrir-o-prontuario-no-drive",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/pastas-drive/page.tsx",
    "apps/backend/src/admin/pastas-drive/pastas-drive.controller.ts",
    "apps/backend/src/ai/drive-pasta-pai.service.ts",
    "apps/backend/src/diagnostico/diagnostico.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
