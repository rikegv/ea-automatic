import type { Artigo } from "../../tipos";

/**
 * ─ CADASTRAR UM CANDIDATO NOVO: a janela de duas etapas, o CPF repetido e quem não tem CPF ──────
 *
 * O QUE ESTA PEÇA COBRE: o cadastro pelo botão Novo candidato, com o passo A Pessoa e o passo A
 * Vaga; o que o sistema faz quando o CPF digitado JÁ EXISTE na base (ele encontra a pessoa e oferece
 * colocá-la na vaga, em vez de criar um segundo cadastro); e o cadastro de quem ainda não tem CPF,
 * que é caso normal em captação e não erro de preenchimento.
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ───────────────────────────────────────────────────┐
 * │ ADICIONAR À VAGA A PARTIR DA BASE é a peça irmã, e o recorte é este: aqui a pessoa é CRIADA   │
 * │ (e, no caminho do CPF repetido, a alocação vem de carona porque o cadastro tropeçou nela); lá  │
 * │ a pessoa JÁ EXISTE e o gesto começa pela base. São duas portas, e ensinar as duas no mesmo    │
 * │ texto faria o leitor escolher a errada.                                                       │
 * │                                                                                               │
 * │ A LEITURA DA TELA (escopo, cards, colunas) é o artigo de ler a Central, e TRAZER UMA LISTA DE  │
 * │ FORA é artigo próprio de outra onda: o botão de importação NÃO é declarado aqui de propósito,  │
 * │ para não comprar cobertura de uma tela que este texto não ensina.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS REGRAS MEDIDAS NO CÓDIGO QUE O TEXTO PRECISA DIZER EM VOZ ALTA ─────────────────────┐
 * │ 1. A PROCURA POR CPF REPETIDO ACONTECE SOZINHA, enquanto se digita, assim que os onze dígitos │
 * │    fecham e o dígito verificador confere. Achando alguém, a janela mostra o aviso e o botão de │
 * │    guardar sem vaga fica INDISPONÍVEL: o caminho passa a ser colocar aquela pessoa na vaga.    │
 * │    Quem não souber disso conclui que a janela travou.                                          │
 * │ 2. QUEM JÁ ESTÁ CADASTRADO E JÁ TEVE PROCESSO ENCERRADO NAQUELA MESMA VAGA cai na confirmação  │
 * │    de volta: a primeira tentativa não aloca nada, abre a pergunta com a data e o motivo do     │
 * │    processo anterior, e só o ciente efetiva. É a mesma confirmação da outra porta.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: o CPF é o campo central deste artigo e NENHUM número aparece no texto. Onde o formato é
 * necessário, o texto diz "os onze dígitos"; o exemplo visual de máscara fica onde ele já está, no
 * campo da tela. Nenhum nome, telefone, e-mail ou endereço de pessoa real foi copiado para cá.
 *
 * OS PRINTS MOSTRAM A JANELA **VAZIA**, e isso é exigência de §A.6, não enquadramento: este é um
 * formulário de pessoa, e digitar qualquer coisa nele para depois fotografar criaria dado de gente
 * dentro de um PNG versionado. Pela mesma razão o SEGUNDO passo da janela ("A Vaga") ficou sem
 * imagem: chegar até ele exige preencher o nome, que é o gesto proibido. Ele continua ensinado em
 * texto, e o motivo está registrado no roteiro, ao lado deste arquivo.
 */
export const artigo: Artigo = {
  slug: "cadastrar-um-candidato-novo",
  titulo: "Cadastrar Um Candidato Novo",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N1",
  resumo:
    "Como cadastrar uma pessoa na base pela janela de duas etapas, o que acontece quando o CPF já está cadastrado e como cadastrar quem ainda não informou o CPF.",
  termos: [
    "novo candidato",
    "cadastrar candidato",
    "incluir pessoa",
    "criar candidato",
    "cadastrar curriculo",
    "candidato sem cpf",
    "cpf repetido",
    "cpf duplicado",
    "cpf ja cadastrado",
    "candidato ja existe",
    "cadastrar pessoa na base",
    "candidato menor de idade",
    "banco de talentos",
    "indicacao de candidato",
  ],
  preRequisitos: [
    "Ter o nome completo da pessoa: é o único campo obrigatório do cadastro.",
    "Se você já quiser colocar a pessoa numa vaga na mesma janela, ter a vaga aberta no sistema.",
  ],
  passos: [
    {
      gesto: "Na Central De Candidatos, clique em Novo candidato, no topo à direita.",
      detalhe:
        "A janela abre no primeiro de dois passos, e as duas etiquetas do topo mostram em qual você está.",
      print: {
        arquivo: "01-botao-novo-candidato.png",
        legenda: "O botão de cadastrar, no topo da Central De Candidatos, à direita da busca.",
      },
      controles: ["Novo candidato", "A Vaga"],
    },
    {
      gesto: "Preencha o nome completo.",
      detalhe:
        "É o único campo cobrado. Com menos de três letras o avanço fica indisponível, porque um nome pela metade não identifica ninguém depois.",
      print: {
        arquivo: "02-passo-a-pessoa.png",
        legenda:
          "O passo A Pessoa, ainda vazio: o nome completo em cima, o CPF ao lado e a origem do cadastro.",
      },
      controles: ["Nome completo"],
    },
    {
      gesto: "Digite o CPF, se a pessoa já tiver informado, e espere a procura terminar.",
      detalhe:
        "O campo é opcional: em captação é comum a pessoa ainda não ter dado o número, e exigi-lo produziria número inventado. Preenchido, o dígito é conferido na hora e o sistema procura sozinho se aquele CPF já está na base.",
      controles: ["CPF"],
    },
    {
      gesto:
        "Se aparecer o aviso de CPF já cadastrado, clique em Alocar esta pessoa em vez de continuar o cadastro.",
      detalhe:
        "Aquele CPF já tem cadastro, e criar outro partiria o histórico da pessoa em dois. O botão leva direto ao segundo passo, com a pessoa existente já escolhida, e nenhum cadastro novo é criado.",
      controles: ["CPF Já Cadastrado", "Alocar esta pessoa", "Pessoa Escolhida"],
    },
    {
      gesto:
        "Complete o que você tiver de contato e de localização: telefone, e-mail, data de nascimento, cidade e UF.",
      detalhe:
        "Tudo opcional. A data de nascimento faz o sistema mostrar a idade ao lado e avisar quando a pessoa é menor de idade, que é o momento de olhar o tipo de contrato.",
      controles: ["Telefone", "E-mail", "Data de nascimento", "Cidade", "UF"],
    },
    {
      gesto: "Escolha a origem: de onde essa pessoa veio.",
      detalhe:
        "É a procedência do cadastro, e ela some da lista depois, no filtro por origem, quando alguém quiser ver só quem entrou por um caminho.",
      controles: ["Origem"],
    },
    {
      gesto:
        "Para guardar a pessoa apenas na base, clique em Salvar sem vaga e encerre aqui.",
      detalhe:
        "Pessoa na base sem vaga é estado normal: ela aparece na lista com Vaga Não Alocada e pode entrar numa vaga depois, a qualquer momento.",
      print: {
        arquivo: "03-saidas-da-janela.png",
        legenda:
          "O rodapé da janela: guardar a pessoa só na base, ou avançar para escolher a vaga dela.",
      },
      controles: ["Salvar sem vaga"],
    },
    {
      gesto:
        "Para já colocar a pessoa numa vaga, clique em Avançar e escolha a vaga no segundo passo.",
      detalhe:
        "Só vaga aberta aparece na lista: vaga encerrada não recebe candidato novo. O campo procura pelo nome de divulgação e pelo cliente.",
      controles: ["Avançar"],
    },
    {
      gesto:
        "Escolha a etapa em que a pessoa entra e, se quiser, escreva a observação inicial.",
      detalhe:
        "O começo do funil já vem escolhido. Troque quando a pessoa chegou adiantada, por exemplo já triada. A observação vira a primeira linha do histórico daquela candidatura.",
      controles: ["Etapa em que entra", "Observação inicial"],
    },
    {
      gesto: "Clique em Salvar candidato.",
      detalhe:
        "Quando a pessoa veio do aviso de CPF já cadastrado, o botão se chama Alocar na vaga: não há cadastro a criar, só a vaga a atribuir. Terminado, a ficha da pessoa abre por cima da lista.",
      controles: ["Salvar candidato", "Alocar na vaga", "Voltar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A tela mostra O CPF não confere. Confira os dígitos.",
      acao: "Os onze dígitos foram digitados, mas não formam um CPF válido. Confira o número com a pessoa. Enquanto ele estiver assim, o avanço fica indisponível: o sistema não guarda onze dígitos quaisquer, porque isso faria a procura por CPF casar a identidade errada depois.",
    },
    {
      sintoma: "Apareceu CPF Já Cadastrado e o botão Salvar sem vaga ficou indisponível.",
      acao: "É de propósito. Aquele CPF já tem cadastro, e um segundo cadastro partiria o histórico da pessoa. Clique em Alocar esta pessoa para seguir com quem já existe. Se você acha que são duas pessoas diferentes, confira o número: o CPF é a identidade de quem está na base.",
    },
    {
      sintoma:
        "A tela mostra Já existe um candidato cadastrado com este CPF. Abra o cadastro dele em vez de criar outro.",
      acao: "O cadastro foi recusado porque aquele CPF já está na base. Feche a janela, procure a pessoa pela busca por CPF dentro dos filtros e trabalhe o cadastro que já existe.",
    },
    {
      sintoma:
        "A tela mostra Já existe um candidato cadastrado com este CPF. Recarregue a página e procure por ele.",
      acao: "Duas tentativas de cadastro do mesmo CPF chegaram quase juntas, e o sistema guardou a primeira. Recarregue a página: a pessoa já está na base.",
    },
    {
      sintoma: "A pessoa ainda não me deu o CPF e eu preciso cadastrá-la hoje.",
      acao: "Deixe o campo de CPF em branco e salve normalmente. A pessoa entra na base sem o número e pode ser colocada em vaga pelo botão Adicionar à vaga, que identifica pelo nome. O CPF é cobrado bem mais adiante, quando a candidatura vira admissão.",
    },
    {
      sintoma: "A tela mostra Esta vaga está Fechada e não recebe candidato novo.",
      acao: "A vaga foi encerrada depois que você abriu a janela. Escolha outra vaga aberta, ou salve a pessoa sem vaga e coloque-a em vaga depois.",
    },
    {
      sintoma:
        "A tela mostra Este cadastro foi anonimizado por prazo de retenção e não aceita mais edição.",
      acao: "Aquele cadastro venceu o prazo de guarda e os dados de identificação foram descartados. Se a pessoa voltou a participar de um processo, cadastre-a de novo, do começo.",
    },
    {
      sintoma: "O sistema perguntou sobre um processo anterior da pessoa na mesma vaga.",
      acao: "Aquela pessoa já teve um processo encerrado nesta vaga. Nada foi alocado ainda: a janela mostra a data e o motivo do encerramento anterior para você decidir. Confirmando, entra uma candidatura nova, e a anterior continua registrada no histórico.",
    },
    {
      sintoma: "Nenhuma vaga aparece na lista do segundo passo.",
      acao: "Não há vaga aberta no momento, ou a vaga que você procura está pendente de revisão, sem cliente vinculado. Vaga pendente não recebe alocação manual: libere-a antes, na tela das vagas pendentes de revisão.",
    },
  ],
  regras: [
    "Nome completo é o único campo obrigatório do cadastro. Todo o resto é opcional.",
    "O CPF é opcional, mas quando preenchido o dígito é conferido: o sistema não guarda um número que não confere.",
    "CPF já cadastrado não cria um segundo cadastro. O sistema encontra a pessoa e oferece colocá-la na vaga, preservando o histórico dela.",
    "Pessoa sem CPF entra na base normalmente e é alocável pelo caminho que identifica por nome. O CPF só é cobrado quando a candidatura vira admissão.",
    "O segundo passo é opcional: pessoa na base sem vaga é estado normal, não cadastro pela metade.",
    "Só vaga aberta recebe candidato novo, e vaga pendente de revisão não aparece na lista enquanto não tiver cliente vinculado.",
    "A observação inicial vira a primeira linha do histórico daquela candidatura, não um campo do cadastro da pessoa.",
    "A marca de Banco De Talentos aparece só para Super Admin, e ela tira a pessoa do descarte automático por prazo de guarda.",
  ],
  relacionados: [
    "adicionar-um-candidato-a-uma-vaga",
    "ler-a-central-de-candidatos",
    "ler-a-ficha-do-candidato",
    "reaproveitar-um-candidato-pelo-cpf",
    "salvar-com-campo-obrigatorio-vazio",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/NovoCandidatoModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/frontend/src/lib/as-candidatos.ts",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
