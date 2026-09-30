import type { Artigo } from "../../tipos";

/**
 * N1 DA PRIMEIRA ETAPA DO CADASTRO: SÓ O CLIENTE, E O AVANÇO QUE ELE LIBERA.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E POR QUE ELA NÃO REPETE O ARTIGO DO CAMINHO INTEIRO ────────────────┐
 * │ `cadastrar-uma-admissao-nova` atravessa as três etapas em um passo cada, porque o assunto dele │
 * │ é o caminho. Esta peça fica DENTRO da primeira etapa: como a busca procura, o que a lista       │
 * │ mostra, o que o cartão confirma e por que o avanço espera o cliente. Ela NÃO ensina a etapa da  │
 * │ folha (peça irmã) nem de onde vem o pré-preenchimento (a outra peça irmã).                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FOI MEDIDO, e corrige o que se supunha ───────────────────────────────────────────────┐
 * │ O avanço da PRIMEIRA etapa depende de UMA coisa só, o cliente escolhido (`disabled` do botão   │
 * │ em `app/(app)/nova/page.tsx`: `step === 0 && !cliente`). E a busca lista só cliente ATIVO      │
 * │ (`listClientes`, `admin/catalogos/catalogos.service.ts`, `eq(clientes.ativo, true)`), o que    │
 * │ explica o cliente que existe e não aparece nem pelo código.                                    │
 * │                                                                                                │
 * │ TRAVAR O AVANÇO DE ETAPA NÃO É TRAVAR O SALVAMENTO, e o artigo não pode embaralhar os dois: a  │
 * │ admissão continua podendo nascer com campo obrigatório vazio, e isso é assunto do artigo irmão. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E ISSO É PENDÊNCIA CONHECIDA: a captura desta tela mostra gente, e a auditoria de
 * segurança vetou o print enquanto a homologação não tiver arnês sintético. O texto foi escrito para
 * funcionar sem imagem, nomeando os rótulos em vez de apontar para a figura.
 *
 * §A.6: nenhum dado de pessoa nem de cliente real. O que o artigo nomeia são RÓTULOS de campo.
 */
export const artigo: Artigo = {
  slug: "escolher-o-cliente-na-nova-admissao",
  titulo: "Escolher O Cliente Na Nova Admissão",
  modulo: "SOUL_ADM",
  rotas: ["/nova"],
  menus: ["nova"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nova-admissao",
  resumo:
    "A primeira etapa do cadastro de admissão: como buscar o cliente pelos quatro jeitos que a tela aceita, o que o cartão de confirmação mostra e por que o botão de seguir só acende com um cliente escolhido.",
  termos: [
    "escolher cliente",
    "achar cliente",
    "buscar cliente",
    "cliente nao aparece",
    "primeira etapa",
    "etapa cliente",
    "codigo do cliente",
    "cnpj do cliente",
    "nome da operacao",
    "razao social",
    "proximo apagado",
    "nao consigo avancar",
    "trocar de cliente",
  ],
  preRequisitos: [
    "Saber de qual cliente é a vaga. Existe cliente com a mesma razão social e código diferente, então é o código que decide.",
  ],
  passos: [
    {
      gesto: "Abra Nova Admissão pelo menu da lateral esquerda.",
      detalhe:
        "A tela abre já na etapa Cliente, com a trilha das três etapas no topo. O campo de busca recebe o cursor sozinho, então dá para digitar sem clicar em nada.",
      controles: ["Nova Admissão", "Cadastro Em Etapas", "Cliente"],
    },
    {
      gesto: "Digite na busca o que você tem do cliente.",
      detalhe:
        "Vale a razão social, o CNPJ, o nome da operação ou o código, e qualquer pedaço deles serve. A tela espera você parar de digitar por um instante e procura sozinha, sem botão de buscar.",
      controles: [
        "Buscar cliente por razão social, CNPJ, operação ou código",
        "Digite para buscar…",
        "Buscando…",
      ],
    },
    {
      gesto: "Leia a lista que aparece abaixo da busca.",
      detalhe:
        "Cada linha traz o nome da operação em destaque e, na linha de baixo, a razão social, o código e o CNPJ. Nada encontrado, a tela diz isso em uma linha, e a lista traz só cliente ativo.",
      controles: ["Nenhum cliente encontrado."],
    },
    {
      gesto: "Clique no cliente certo.",
      detalhe: "A linha escolhida fica destacada e ganha um sinal de confirmação à direita.",
    },
    {
      gesto: "Confira o cartão Cliente selecionado antes de seguir.",
      detalhe:
        "Ele repete o que você escolheu: código, CNPJ, empresa do grupo e região. Dado que o cadastro do cliente não tem aparece como não informado, e isso não impede seguir.",
      controles: ["Cliente selecionado", "Código", "CNPJ", "Empresa do grupo", "Região"],
    },
    {
      gesto: "Errou o cliente: digite outra busca e escolha de novo, ainda nesta etapa.",
      detalhe:
        "Trocar o cliente é livre aqui. Já tendo escolhido o cargo na etapa seguinte, a troca zera aquele cargo, porque a lista de cargos é do cliente.",
    },
    {
      gesto: "Clique em Próximo para ir à etapa Vaga / Cargo.",
      detalhe:
        "Esta é a única coisa que esta etapa cobra: sem cliente escolhido o botão fica apagado. Isso trava o avanço de etapa, e não o cadastro: campo obrigatório vazio continua podendo virar pendência mais tarde.",
      controles: ["Próximo", "Anterior"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O cliente existe, eu sei o código, e a busca não devolve nada.",
      acao: "A lista traz só cliente ativo. Cliente inativo não aparece nem pelo código exato: peça a reativação à administração antes de cadastrar.",
    },
    {
      sintoma: "Apareceram dois clientes com a mesma razão social.",
      acao: "São clientes diferentes com o mesmo nome. Decida pelo código, que é único, e confirme no cartão que aparece depois da escolha.",
    },
    {
      sintoma: "O cartão do cliente mostra não informado no CNPJ ou na região.",
      acao: "Aquele dado não está no cadastro do cliente. Não impede criar a admissão. Precisando dele para o seu trabalho, peça o complemento do cadastro à administração.",
    },
    {
      sintoma: "Fui para a etapa seguinte e quero conferir o cliente outra vez.",
      acao: "Clique em Anterior. Voltar não perde nada do que você já preencheu, e o cartão continua na tela para conferência.",
    },
  ],
  regras: [
    "Só cliente ativo entra na busca do cadastro.",
    "A busca procura em quatro campos ao mesmo tempo: razão social, CNPJ, nome da operação e código.",
    "O código é o que identifica o cliente: razão social se repete, código não.",
    "O avanço da primeira etapa espera uma coisa só, o cliente escolhido. Isso trava o avanço de etapa, nunca o salvamento da admissão.",
    "O cliente escolhido decide o que vem depois: a lista de cargos e o checklist de documentos saem dele.",
  ],
  relacionados: [
    "cadastrar-uma-admissao-nova",
    "definir-cargo-folha-e-beneficios-na-nova-admissao",
    "o-padrao-do-cliente-que-pre-preenche-o-wizard",
    "salvar-com-campo-obrigatorio-vazio",
    "buscar-dentro-da-tela",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/frontend/src/components/nova/Stepper.tsx",
    "apps/backend/src/admin/catalogos/catalogos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
