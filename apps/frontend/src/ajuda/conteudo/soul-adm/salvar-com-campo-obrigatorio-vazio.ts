import type { Artigo } from "../../tipos";

/**
 * N1 DO WIZARD, 3 de 3: CRIAR COM PENDÊNCIA, QUE É DESENHO E NÃO FALHA.
 *
 * ┌─ POR QUE ESTE ARTIGO PRECISOU EXISTIR SEPARADO ──────────────────────────────────────────────┐
 * │ A janela vermelha com "Campos obrigatórios vazios" e um botão escrito "Estou ciente, criar" é  │
 * │ lida como ERRO por quem a encontra pela primeira vez, e a reação natural é cancelar e ir caçar │
 * │ dado que ninguém tem ainda. O não-bloqueio é regra do sistema (§A.3, regra 5): o sinalizador    │
 * │ MARCA e nunca IMPEDE. Um parágrafo dentro do artigo do wizard não desfaz a impressão de erro;   │
 * │ um artigo com título afirmativo desfaz.                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ACHADO QUE MUDA O QUE O ARTIGO PRECISA DIZER, e ele foi MEDIDO no código ─────────────────┐
 * │ O wizard NÃO TEM campo de Setor nem a pergunta de uniforme (conferido em `app/(app)/nova/      │
 * │ page.tsx`: nenhuma ocorrência das duas palavras), e as duas entram na régua de pendências       │
 * │ (`pendenciasObrigatorias`, `domain/admissao.ts`). Consequência prática: quem cadastra pelo      │
 * │ wizard vê a janela QUASE SEMPRE, com Setor e Uniforme na lista, mesmo tendo preenchido tudo o   │
 * │ que a tela mostrou. Sem dizer isso, o artigo mandaria a pessoa procurar dois campos que não     │
 * │ existem naquela tela, e ela concluiria que o sistema está com defeito.                         │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS RÓTULOS DA LISTA SÃO OS DO BACKEND (`ROTULO_PENDENCIA`, `domain/pendencia-config.ts`), e é por
 * isso que a coluna do Gerenciador, o modal de pendências e esta janela dizem exatamente o mesmo
 * texto. §A.6: nenhum dado de pessoa.
 */
export const artigo: Artigo = {
  slug: "salvar-com-campo-obrigatorio-vazio",
  titulo: "Salvar Com Campo Obrigatório Vazio",
  modulo: "SOUL_ADM",
  rotas: ["/nova"],
  menus: ["nova"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "nova-admissao",
  resumo:
    "A admissão pode ser criada com campo obrigatório em branco: o sistema pede o seu aceite, registra a pendência e segue. Como ler a janela de aviso, o que fazer com a lista que ela mostra e onde a pendência reaparece depois.",
  termos: [
    "campo obrigatorio",
    "obrigatorio vazio",
    "faltando",
    "nao deixa salvar",
    "nao consigo criar",
    "pendencia",
    "pendencias obrigatorias",
    "estou ciente",
    "aceite",
    "sinalizador",
    "parcial",
    "incompleto",
    "sem salario",
    "sem data de admissao",
    "setor",
    "uniforme",
  ],
  preRequisitos: [
    "Estar na etapa Candidato do wizard, com cliente, cargo, nome, CPF válido e sexo já preenchidos. Sem esses cinco o botão Confirmar admissão nem acende, e eles não entram neste aceite.",
  ],
  passos: [
    {
      gesto: "Preencha o que você tem e clique em Confirmar admissão.",
      detalhe:
        "Não pule etapa para fugir do aviso: o que estiver preenchido entra agora, e o que faltar aparece na lista do passo seguinte.",
      controles: ["Confirmar admissão"],
      print: {
        arquivo: "01-confirmar-admissao.png",
        legenda: "Passo 1: o botão que fecha o cadastro, na última etapa do wizard.",
      },
    },
    {
      gesto: "Leia a janela Criar Com Pendências Obrigatórias?",
      detalhe:
        "Ela lista, nome por nome, os campos obrigatórios que ficaram vazios. Setor e Uniforme costumam estar aí mesmo quando você preencheu tudo o que a tela mostrou: eles não têm campo no wizard e são respondidos depois, na Liberação ou pelo lápis do Gerenciador.",
      controles: ["Criar Com Pendências Obrigatórias?", "Cancelar", "Estou ciente, criar"],
      print: {
        arquivo: "02-janela-de-aceite.png",
        legenda: "Passo 2: a janela que lista os campos obrigatórios vazios.",
      },
    },
    {
      gesto: "Decida: Cancelar para preencher agora, ou Estou ciente, criar para seguir.",
      detalhe:
        "Cancelar só fecha o aviso, nada é perdido e você volta ao formulário exatamente como estava. Estou ciente, criar cria a admissão e registra que você viu a lista.",
      controles: ["Cancelar", "Estou ciente, criar"],
    },
    {
      gesto: "Na tela de confirmação, olhe a etiqueta de pendências.",
      detalhe:
        "OK é admissão sem pendência nenhuma. PARCIAL é criada com campo obrigatório vazio. PENDENTE é o caso em que falta o essencial de identidade ou do par cliente e cargo.",
      controles: ["Admissão Criada", "Pendências Obrigatórias (F5)", "OK", "PARCIAL", "PENDENTE"],
    },
    {
      gesto: "Depois, resolva a pendência pela ficha da admissão.",
      detalhe:
        "A mesma lista aparece no Gerenciador, na coluna de pendências obrigatórias, e o preenchimento é feito pelo lápis da linha. Assim que o último campo é preenchido, a admissão passa a Completo sozinha.",
      controles: ["Pendências Obrig."],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela não apareceu e a admissão foi criada direto.",
      acao: "Não faltava nada obrigatório para aquele cliente. A lista de itens cobrados é configurável por cliente, então nem todos cobram os mesmos campos.",
    },
    {
      sintoma: "Cancelei a janela e fiquei com medo de ter perdido o formulário.",
      acao: "Não perdeu. Cancelar fecha só o aviso: tudo o que você digitou continua na tela, e você pode preencher o que falta e confirmar de novo.",
    },
    {
      sintoma: "A lista traz Setor e Uniforme, e eu não achei esses campos em lugar nenhum do cadastro.",
      acao: "Eles realmente não existem no wizard. São respondidos na Liberação Admissional ou depois, pelo lápis do Gerenciador. Criar com os dois pendentes é o caminho normal de quem cadastra por aqui.",
    },
    {
      sintoma: "Cliquei em Estou ciente, criar e apareceu Erro ao criar admissão.",
      acao: "Aí não é a pendência: a gravação não voltou. Tente outra vez e, repetindo, procure a pessoa no Gerenciador antes de refazer, para não cadastrar duas vezes.",
    },
    {
      sintoma: "Quero saber depois quem criou com pendência.",
      acao: "O aceite fica registrado na admissão. A trilha de passagem, na ficha, guarda os avanços feitos com campo obrigatório em branco, com quem aceitou e o que faltava.",
    },
  ],
  regras: [
    "A admissão pode ser criada com campo obrigatório vazio: o sinalizador marca a pendência e não impede o cadastro.",
    "Criar com pendência exige o seu aceite explícito, e esse aceite fica registrado com o seu nome.",
    "Nome, CPF, sexo, cliente e cargo não entram nesse aceite: sem eles o botão de confirmar nem acende.",
    "A lista de campos cobrados é a mesma em todo o sistema, e é ela que alimenta a coluna de pendências obrigatórias, o indicador da tela e o modal da ficha.",
    "Cada cliente pode ter itens desligados da cobrança, então dois clientes podem cobrar listas diferentes.",
    "Setor e uniforme fazem parte da régua e não têm campo no wizard: são preenchidos na Liberação ou depois, pela edição da admissão.",
    "Pendência não trava a esteira: a admissão anda, e o preenchimento pode acontecer a qualquer momento antes da conclusão.",
  ],
  relacionados: [
    "cadastrar-uma-admissao-nova",
    "reaproveitar-um-candidato-pelo-cpf",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "editar-os-dados-de-uma-admissao",
    "liberar-uma-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/nova/page.tsx",
    "apps/frontend/src/components/ui/ConfirmDialog.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/domain/admissao.ts",
    "apps/backend/src/domain/pendencia-config.ts",
  ],
  revisadoEm: "2026-09-28",
};
