import type { Artigo } from "../../tipos";

/**
 * N1 DO WIZARD, 1 de 3: O CAMINHO INTEIRO, DO CLIENTE AO CANDIDATO.
 *
 * ┌─ POR QUE O PASSO A PASSO SEGUE A ORDEM DA TELA, E NÃO A DA IMPORTÂNCIA DO DADO ──────────────┐
 * │ O wizard tem TRÊS etapas com ordem imposta (Cliente, Vaga / Cargo, Candidato) e o Próximo é    │
 * │ travado até a etapa fechar. Um artigo que agrupasse os campos por assunto (tudo da folha junto, │
 * │ tudo do candidato junto) descreveria um formulário que não existe, e a pessoa ficaria           │
 * │ procurando na primeira tela um campo que só aparece na terceira.                                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ DUAS COISAS QUE O ARTIGO INSISTE, PORQUE SÃO AS QUE MAIS GERAM CHAMADO ─────────────────────┐
 * │ 1. O CARGO É POR CLIENTE, e a lista sai da RÉGUA. Cliente sem régua cadastrada deixa o seletor  │
 * │    travado, e quem não sabe disso procura o cargo no catálogo inteiro e conclui que sumiu.      │
 * │ 2. CAMPO OBRIGATÓRIO VAZIO NÃO IMPEDE. Ele pede um aceite e vira pendência (§A.3, regra 5). O   │
 * │    passo do Confirmar diz isso em uma linha e manda ao artigo irmão, que é onde o assunto mora. │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS `controles` FORAM LIDOS LETRA POR LETRA de `app/(app)/nova/page.tsx`, inclusive o asterisco que
 * a tela escreve no rótulo dos campos que ela trata como obrigatórios ("Salário *"), e inclusive a
 * inconsistência que EXISTE e que o manual não conserta (§A.14): o wizard escreve "Gestor / BP" e a
 * ficha da admissão escreve "Gestor BP". Declarar o que está lá é o que faz a busca por rótulo achar.
 *
 * §A.6: nenhum nome, CPF ou e-mail de pessoa aparece aqui. O que o artigo nomeia são RÓTULOS.
 */
export const artigo: Artigo = {
  slug: "cadastrar-uma-admissao-nova",
  titulo: "Cadastrar Uma Admissão Nova",
  modulo: "SOUL_ADM",
  rotas: ["/nova"],
  menus: ["nova"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nova-admissao",
  resumo:
    "O caminho inteiro do cadastro em etapas: escolher o cliente, definir cargo, folha e benefícios, identificar o candidato e confirmar. Ao confirmar, a admissão nasce na esteira com o checklist de documentos do par cliente e cargo.",
  termos: [
    "nova admissao",
    "cadastrar",
    "cadastro",
    "criar admissao",
    "abrir admissao",
    "admitir",
    "contratar",
    "incluir candidato",
    "wizard",
    "etapas",
    "lancar admissao",
    "registrar admissao",
    "colocar na esteira",
    "salario",
    "beneficios",
    "escala",
    "centro de custo",
    "data de admissao",
  ],
  preRequisitos: [
    "Ter os dados da folha em mãos: salário, tipo e tempo de contrato, escala, benefícios, centro de custo e gestor. Nada disso trava a criação, mas tudo o que faltar vira pendência da admissão.",
  ],
  passos: [
    {
      gesto: "Abra Nova Admissão pelo menu da lateral esquerda.",
      detalhe:
        "A tela abre na primeira das três etapas. A trilha do topo mostra em qual você está e o que vem depois.",
      controles: ["Nova Admissão", "Cadastro Em Etapas", "Cliente", "Vaga / Cargo", "Candidato"],
      print: {
        arquivo: "01-etapa-cliente.png",
        legenda: "Passo 1: a etapa Cliente, com a trilha das três etapas no topo.",
      },
    },
    {
      gesto: "Digite na busca para achar o cliente.",
      detalhe:
        "Vale a razão social, o CNPJ, o nome da operação ou o código. A lista aparece enquanto você digita, não precisa apertar nada.",
      controles: [
        "Buscar cliente por razão social, CNPJ, operação ou código",
        "Digite para buscar…",
      ],
    },
    {
      gesto: "Clique no cliente certo e confira o cartão que aparece abaixo.",
      detalhe:
        "O cartão confirma o que você escolheu: código, CNPJ, empresa do grupo e região. Existe cliente com a mesma razão social e código diferente, então é o código que decide.",
      controles: ["Cliente selecionado", "Código", "CNPJ", "Empresa do grupo", "Região"],
    },
    {
      gesto: "Clique em Próximo para ir à etapa Vaga / Cargo.",
      detalhe: "O botão só acende com um cliente escolhido. O Anterior volta sem perder nada.",
      controles: ["Próximo", "Anterior"],
    },
    {
      gesto: "Escolha o Cargo.",
      detalhe:
        "A lista traz só os cargos que têm régua documental cadastrada para este cliente, e a tela diz quantos são. Cliente sem régua deixa o seletor travado, com o aviso de cadastrar a régua primeiro.",
      controles: ["Cargo *", "Selecione o cargo…", "Cadastre a régua do cliente primeiro"],
    },
    {
      gesto: "Confira o Checklist da régua antes de seguir.",
      detalhe:
        "Ele diz quantos documentos serão exigidos daquela pessoa. Ver documentos abre a lista, cada um com a sua exigência, e Recolher fecha de novo. É este checklist que a Auditoria vai cobrar depois.",
      controles: [
        "Checklist da régua",
        "Ver documentos",
        "Recolher",
        "Obrigatório",
        "Facultativo",
        "Não obrigatório",
      ],
      print: {
        arquivo: "02-cargo-e-regua.png",
        legenda: "Passo 6: o cargo escolhido e o checklist da régua aberto.",
      },
    },
    {
      gesto: "Preencha os dados de vaga e folha.",
      detalhe:
        "Escala e endereço já vêm sugeridos pelo padrão do cliente, e o pacote de benefícios vem sugerido pela última admissão deste mesmo cliente e cargo. Tudo é editável: a sugestão poupa digitação, ela não decide por você.",
      controles: [
        "Dados de vaga / folha",
        "Salário *",
        "Tipo de contrato *",
        "Tempo de contrato *",
        "Escala *",
        "Centro de custo *",
        "Loja / Unidade",
        "Departamento",
        "Gestor / BP *",
        "Endereço",
      ],
    },
    {
      gesto: "Marque os Benefícios e informe o valor dos que pedem valor.",
      detalhe:
        "O seletor aceita vários ao mesmo tempo. Benefício que exige valor abre um campo próprio logo abaixo, e sem esse valor o Próximo não acende. Se o pacote fugir do que costuma ser alocado neste cliente e cargo, a tela avisa e deixa seguir.",
      controles: ["Benefícios *", "Selecione os benefícios…", "Valor de"],
    },
    {
      gesto: "Escolha o Motivo de contratação.",
      detalhe:
        "Sendo Substituição, abrem dois campos a mais, para nome e CPF de quem está sendo substituído. Esse CPF é guardado por 48 horas e depois apagado sozinho, e a própria tela avisa isso.",
      controles: [
        "Motivo de contratação",
        "Nome do substituído *",
        "CPF do substituído *",
      ],
    },
    {
      gesto: "Clique em Próximo e preencha a identificação do candidato.",
      detalhe:
        "O CPF é conferido enquanto você digita, e a etiqueta abaixo dele diz se está válido. O sexo não é enfeite de cadastro: é ele que define se a carteira de reservista será exigida. A data de admissão é obrigatória e mesmo assim não bloqueia: vazia, entra como pendência.",
      controles: [
        "Nome completo *",
        "CPF *",
        "CPF válido",
        "CPF inválido",
        "Data de nascimento *",
        "Sexo *",
        "Data de admissão *",
        "Telefone *",
        "E-mail *",
      ],
      print: {
        arquivo: "03-etapa-candidato.png",
        legenda: "Passo 10: a etapa Candidato, com o CPF conferido na hora.",
      },
    },
    {
      gesto: "Quando o cliente tiver projeto de Alto Volume, decida se esta admissão entra nele.",
      detalhe:
        "O bloco só aparece para cliente com projeto ativo. Ligado, o projeto passa a ser obrigatório, e a data de admissão já sugere qual deles é. O grupo de entrada é opcional.",
      controles: ["Alto Volume", "Projeto", "Grupo de entrada", "Sem grupo definido"],
    },
    {
      gesto: "Clique em Confirmar admissão.",
      detalhe:
        "Havendo campo obrigatório vazio, aparece uma janela pedindo o seu aceite, e a admissão pode ser criada assim mesmo. Esse caminho tem artigo próprio.",
      controles: ["Confirmar admissão", "Criar Com Pendências Obrigatórias?"],
    },
    {
      gesto: "Leia a tela de confirmação para saber o que nasceu.",
      detalhe:
        "Ela mostra a situação do preenchimento, quantos documentos entraram pela régua e quantas frentes abriram. Nova admissão limpa tudo e recomeça para a próxima pessoa.",
      controles: [
        "Admissão Criada",
        "Admissão registrada com sucesso",
        "Pendências Obrigatórias (F5)",
        "Documentos na régua",
        "Frentes abertas",
        "Nova admissão",
      ],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A etiqueta embaixo do CPF diz CPF inválido, ou ao confirmar aparece CPF inválido.",
      acao: "O dígito verificador não fecha, então há um número errado. Confira o documento do candidato e digite de novo. Sem CPF válido a admissão não é criada, porque ele é a identidade da pessoa no sistema.",
    },
    {
      sintoma: "A tela pede para informar o valor de um benefício e não deixa avançar.",
      acao: "Alguns benefícios exigem valor. Preencha o campo que apareceu abaixo do seletor, ou tire o benefício do pacote. Esse é o único item da etapa da vaga que trava o Próximo.",
    },
    {
      sintoma: "Apareceu o aviso de pacote de benefícios fora do padrão deste cliente e cargo.",
      acao: "É aviso, não bloqueio. Ele compara com o pacote da última admissão do mesmo par. Estando certo, siga; foi engano, ajuste o pacote ali mesmo.",
    },
    {
      sintoma: "O Confirmar admissão continua apagado.",
      acao: "Ele espera cliente, cargo, nome, CPF válido e sexo. Falta um desses. O restante dos campos não trava a criação, só vira pendência.",
    },
    {
      sintoma: "A tela avisa que o candidato é menor de idade.",
      acao: "É um alerta para você conferir as restrições legais e o tipo de contrato, que nesse caso costuma ser Jovem Aprendiz. Não impede criar.",
    },
    {
      sintoma: "A criação falhou com Cliente não encontrado ou Cargo não encontrado.",
      acao: "O cliente ou o cargo saiu do cadastro enquanto você preenchia. Volte à etapa correspondente e escolha de novo. Se o item sumiu mesmo, avise a administração.",
    },
    {
      sintoma: "Apareceu Erro ao criar admissão.",
      acao: "A gravação não voltou. Tente confirmar outra vez. Repetindo, procure a pessoa no Gerenciador antes de refazer, para não cadastrar duas vezes.",
    },
  ],
  regras: [
    "A régua de documentos resolve pelo par cliente mais cargo: muda o cargo, muda a lista de documentos que será exigida.",
    "Só aparecem os cargos que têm régua cadastrada para aquele cliente. Cliente sem régua trava a escolha do cargo, porque a admissão nasceria sem checklist.",
    "A admissão pode ser criada com campo obrigatório vazio. O sistema pede um aceite, marca a pendência e não impede.",
    "Ao confirmar, nascem duas frentes ao mesmo tempo, Auditoria e Exame. A frente de Cadastro e Contrato só abre depois que as duas primeiras concluírem.",
    "O CPF é a identidade da pessoa. Um CPF que já existe na base oferece reaproveitar os dados, e o histórico das admissões anteriores é preservado.",
    "O sexo do candidato define quais documentos a régua exige: a carteira de reservista só é cobrada do sexo masculino.",
    "Escala, endereço e pacote de benefícios nascem pré-preenchidos pelo padrão do cliente e pela última admissão do par. São sugestões, e o consultor edita.",
    "O CPF de quem está sendo substituído é guardado por 48 horas e apagado automaticamente depois disso.",
    "Nada é gravado antes do Confirmar admissão: o wizard não guarda rascunho.",
  ],
  relacionados: [
    "reaproveitar-um-candidato-pelo-cpf",
    "salvar-com-campo-obrigatorio-vazio",
    "liberar-uma-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "auditar-os-documentos-da-admissao",
    "editar-os-dados-de-uma-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/frontend/src/components/nova/Stepper.tsx",
    "apps/frontend/src/components/admin/SeletorLoja.tsx",
    "apps/frontend/src/components/alto-volume/BlocoAltoVolume.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/domain/admissao.ts",
  ],
  revisadoEm: "2026-09-28",
};
