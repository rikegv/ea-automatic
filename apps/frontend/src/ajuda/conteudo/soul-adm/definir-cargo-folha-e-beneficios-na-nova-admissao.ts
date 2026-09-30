import type { Artigo } from "../../tipos";

/**
 * N1 DA SEGUNDA ETAPA DO CADASTRO: A FOLHA, CAMPO POR CAMPO, E O QUE TRAVA O AVANÇO.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E O QUE ELA DEIXA PARA AS IRMÃS ─────────────────────────────────────┐
 * │ Aqui é a etapa Vaga / Cargo olhada de perto: cada campo, o que é lista fixa, o que é catálogo  │
 * │ aberto, o que aparece só em certos casos. Ela NÃO ensina de onde vem o pré-preenchimento (peça  │
 * │ irmã, o padrão do cliente), NÃO ensina a memória do pacote de benefícios (peça irmã) e NÃO      │
 * │ reexplica criar com pendência, que já é artigo próprio.                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A MEDIÇÃO QUE MUDA O QUE O ARTIGO PRECISA DIZER, E DESMENTE O QUE SE SUPUNHA ───────────────┐
 * │ O avanço desta etapa NÃO espera o salário. O `disabled` do botão, em `app/(app)/nova/page.tsx`, │
 * │ é `step === 1 && (!cargoId || semValor.length > 0)`: só o CARGO e o VALOR dos benefícios que    │
 * │ exigem valor travam. Salário, escala, centro de custo e gestor têm asterisco no rótulo, e       │
 * │ asterisco aqui quer dizer "o sistema cobra como obrigatório", nunca "impede de seguir". Em      │
 * │ branco, eles viram pendência da admissão, que é o caminho normal do não-bloqueio.               │
 * │                                                                                                │
 * │ Sem essa distinção o artigo mandaria a pessoa caçar um salário que ninguém tem ainda para       │
 * │ conseguir passar de etapa, o que é exatamente o contrário do desenho do sistema.                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS RÓTULOS FORAM LIDOS LETRA POR LETRA da tela, inclusive o asterisco ("Salário *") e a barra
 * ("Gestor / BP *", "Loja / Unidade"), porque é por eles que a busca do manual acha o campo.
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA: o print desta tela mostra gente e a captura está vetada pela
 * auditoria de segurança enquanto não houver arnês sintético na homologação.
 *
 * §A.6: o campo de quem está sendo substituído é DESCRITO, nunca preenchido com exemplo.
 */
export const artigo: Artigo = {
  slug: "definir-cargo-folha-e-beneficios-na-nova-admissao",
  titulo: "Definir Cargo, Folha E Benefícios",
  modulo: "SOUL_ADM",
  rotas: ["/nova"],
  menus: ["nova"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nova-admissao",
  resumo:
    "A segunda etapa do cadastro de admissão, campo por campo: cargo, salário, tipo e tempo de contrato, escala, benefícios com valor, motivo, centro de custo, loja, departamento, gestor e endereço. E as duas únicas coisas desta etapa que travam o avanço.",
  termos: [
    "dados da vaga",
    "dados de folha",
    "salario",
    "tipo de contrato",
    "tempo de contrato",
    "escala",
    "beneficios",
    "valor do beneficio",
    "centro de custo",
    "departamento",
    "gestor",
    "bp",
    "endereco da vaga",
    "loja",
    "unidade",
    "motivo de contratacao",
    "substituicao",
    "segunda etapa",
    "nao consigo avancar",
    "asterisco",
  ],
  preRequisitos: [
    "Ter passado a etapa Cliente. A lista de cargos e o checklist de documentos saem do cliente escolhido.",
  ],
  passos: [
    {
      gesto: "Escolha o Cargo.",
      detalhe:
        "A lista traz só os cargos que têm régua de documentos cadastrada para este cliente, e a tela diz quantos são. O cargo é uma das duas coisas que travam o avanço desta etapa.",
      controles: ["Cargo *", "Selecione o cargo…"],
    },
    {
      gesto: "Preencha o Salário e escolha o Tipo de contrato e o Tempo de contrato.",
      detalhe:
        "O salário aceita centavos. Tipo e tempo são dois campos distintos, os dois em lista fixa: o tipo é o vínculo, o tempo é a duração em dias. Nenhum dos três trava o avanço.",
      controles: ["Salário *", "Tipo de contrato *", "Tempo de contrato *", "Selecione…", "Selecione o tempo…"],
    },
    {
      gesto: "Escolha a Escala.",
      detalhe:
        "O seletor tem busca, então dá para digitar em vez de rolar a lista. Quando o cliente tem escala padrão cadastrada, ela já vem escolhida e a linha de apoio abaixo diz que é padrão do cliente e que é editável.",
      controles: ["Escala *", "Selecione a escala…"],
    },
    {
      gesto: "Marque os Benefícios da pessoa.",
      detalhe:
        "O seletor aceita vários ao mesmo tempo. O pacote costuma chegar sugerido, e a sugestão é editável: marcar e desmarcar aqui é o esperado.",
      controles: ["Benefícios *", "Selecione os benefícios…"],
    },
    {
      gesto: "Informe o valor dos benefícios que pedem valor.",
      detalhe:
        "Benefício cujo cadastro exige valor abre um campo próprio logo abaixo do seletor. Este é o outro item que trava o avanço: enquanto faltar um desses valores, a tela pede o valor em vermelho e o botão de seguir fica apagado.",
      controles: ["Valor de"],
    },
    {
      gesto: "Escolha o Motivo de contratação, quando você souber qual é.",
      detalhe:
        "O motivo não trava nada. Escolhendo substituição, abrem dois campos a mais, para o nome e o documento de quem está saindo. A própria tela avisa que esse documento é retido por 48 horas e apagado depois.",
      controles: ["Motivo de contratação", "Selecione o motivo…", "Nome do substituído *", "CPF do substituído *"],
    },
    {
      gesto: "Complete Centro de custo, Departamento e Gestor / BP.",
      detalhe:
        "São campos de digitação livre. Centro de custo e gestor são cobrados como obrigatórios e, em branco, viram pendência da admissão em vez de barreira.",
      controles: ["Centro de custo *", "Departamento", "Gestor / BP *"],
    },
    {
      gesto: "Havendo Loja / Unidade, escolha em qual a pessoa vai trabalhar.",
      detalhe:
        "O campo só aparece para cliente que tem lojas cadastradas, que é a minoria. Ele fica ao lado do centro de custo e é coisa diferente dele.",
      controles: ["Loja / Unidade"],
    },
    {
      gesto: "Confira o Endereço do posto de trabalho.",
      detalhe:
        "Tendo o cliente endereço padrão cadastrado, ele chega preenchido e pode ser trocado por cima. É o endereço onde a pessoa trabalha, não o dela.",
      controles: ["Endereço"],
    },
    {
      gesto: "Clique em Próximo para ir à etapa Candidato.",
      detalhe:
        "Continuando apagado, falta o cargo ou falta o valor de algum benefício. O resto dos campos desta etapa não impede seguir.",
      controles: ["Próximo", "Anterior"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O Salário tem asterisco e eu não tenho o valor ainda.",
      acao: "Siga sem ele. O asterisco quer dizer que o sistema cobra o campo, não que ele impede. Salário, escala, centro de custo e gestor em branco viram pendência da admissão, e o preenchimento pode acontecer depois.",
    },
    {
      sintoma: "A tela diz para informar o valor de um benefício e o botão de seguir não acende.",
      acao: "Preencha o campo de valor que apareceu abaixo do seletor de benefícios, ou tire aquele benefício do pacote. É o único item desta etapa que trava o avanço junto com o cargo.",
    },
    {
      sintoma: "Marquei um benefício e nenhum campo de valor apareceu.",
      acao: "Aquele benefício não exige valor no cadastro dele. Quem decide isso é o catálogo de benefícios, não o nome do item.",
    },
    {
      sintoma: "Escolhi o motivo e apareceram dois campos que eu não esperava.",
      acao: "É o caso da substituição. Preencha quem está saindo e siga: o documento informado ali é retido por 48 horas e apagado automaticamente depois do uso.",
    },
    {
      sintoma: "Não encontro o campo Loja / Unidade.",
      acao: "Ele só existe para cliente com lojas cadastradas. Não aparecendo, aquele cliente não tem lojas, e o centro de custo continua sendo o campo a preencher.",
    },
    {
      sintoma: "A escala, o benefício ou o motivo que eu preciso não está na lista.",
      acao: "Quem administra os cadastros consegue acrescentar o item pelo próprio seletor, e ele já fica escolhido. Sem esse perfil, peça a inclusão à administração antes de cadastrar.",
    },
    {
      sintoma: "A tela mostra Falha ao adicionar ao catálogo.",
      acao: "O item não foi criado. Confira se ele já existe com outra grafia e tente de novo. Repetindo, avise a administração: o cadastro da admissão pode seguir sem aquele item.",
    },
  ],
  regras: [
    "Nesta etapa, só duas coisas travam o avanço: o cargo escolhido e o valor dos benefícios que exigem valor.",
    "O asterisco no rótulo diz que o sistema cobra aquele campo como obrigatório. Cobrar não é impedir: em branco, ele vira pendência da admissão.",
    "Tipo de contrato e tempo de contrato são campos diferentes, os dois em lista fixa, sem digitação livre.",
    "Quem decide se um benefício exige valor é o cadastro dele, não o nome.",
    "Loja / Unidade aparece só para cliente com lojas cadastradas, e não substitui o centro de custo.",
    "O endereço é o do posto de trabalho, e chega sugerido quando o cliente tem endereço padrão.",
    "Acrescentar item ao catálogo de escala, benefício ou motivo é ação de quem administra os cadastros.",
  ],
  relacionados: [
    "escolher-o-cliente-na-nova-admissao",
    "cadastrar-uma-admissao-nova",
    "o-padrao-do-cliente-que-pre-preenche-o-wizard",
    "a-memoria-do-pacote-por-cliente-e-cargo",
    "salvar-com-campo-obrigatorio-vazio",
    "ler-a-regua-obrigatoria-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/frontend/src/components/admin/SeletorLoja.tsx",
    "apps/backend/src/admin/catalogos/catalogos.service.ts",
    "apps/backend/src/domain/admissao.ts",
  ],
  revisadoEm: "2026-09-30",
};
