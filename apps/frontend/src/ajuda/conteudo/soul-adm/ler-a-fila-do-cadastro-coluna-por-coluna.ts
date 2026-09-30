import type { Artigo } from "../../tipos";

/**
 * N2 DA ABA CADASTRO: LER A FILA, COLUNA POR COLUNA.
 *
 * ┌─ O RECORTE, E ELE É ESTREITO DE PROPÓSITO ───────────────────────────────────────────────────┐
 * │ A aba tem artigo de AÇÃO (concluir o cadastro, mudar o status e voltar atrás) e artigo de       │
 * │ ASSINATURA (acompanhar o envelope). Esta peça é de LEITURA: o que cada coluna diz, o que é      │
 * │ próprio desta aba e o que é a mesma máscara das outras. Ela NÃO ensina ordenar nem filtrar, que  │
 * │ são artigos gerais de tabela, e NÃO ensina concluir a frente.                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS LEITURAS QUE SÓ ESTA ABA TEM, MEDIDAS NA TELA ──────────────────────────────────────┐
 * │ 1. MATRÍCULA, e só aqui (`isCadastro && ...` na composição das colunas e no cabeçalho, em       │
 * │    `app/(app)/esteira/page.tsx`), antes do nome, porque é aqui que a importação acontece.       │
 * │    Vazia, a célula diz "não informado", que é a régua da casa para célula sem dado.             │
 * │ 2. O STATUS QUE DIZ "Aguardando" ENQUANTO O CADASTRO NÃO ABRIU. É LEITURA DE TELA, e o status   │
 * │    guardado não muda: a frente nasce antes de poder trabalhar, e mostrar o status real ali      │
 * │    ("A Cadastrar") diria que há trabalho a fazer quando não há. A coluna de avanço, na mesma    │
 * │    linha, escreve por extenso o que falta.                                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O INDICADOR PRÓPRIO DA ABA é o de cadastrados, e ele existe por um motivo técnico com efeito
 * prático: os indicadores por status contam só frente EM ANDAMENTO, e cadastrado é o estado que
 * conclui, então ali daria zero para sempre. Clicar nele é o que traz as concluídas de volta à fila.
 *
 * SEM IMAGEM, pendência conhecida: a fila mostra gente e a captura está vetada pela auditoria de
 * segurança enquanto a homologação não tiver arnês sintético.
 *
 * §A.6: nenhum nome, matrícula ou dado de pessoa aparece aqui. O que o artigo nomeia são COLUNAS.
 */
export const artigo: Artigo = {
  slug: "ler-a-fila-do-cadastro-coluna-por-coluna",
  titulo: "Ler A Fila Do Cadastro",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N2",
  familia: "esteira",
  resumo:
    "O que cada coluna da aba Cadastro está dizendo, quais são as duas leituras que só existem nela, por que uma linha aparece como Aguardando e o que o indicador de cadastrados do topo conta.",
  termos: [
    "aba cadastro",
    "fila do cadastro",
    "colunas",
    "matricula",
    "aguardando",
    "pausado",
    "nao informado",
    "pendencias obrigatorias",
    "indicador cadastrado",
    "sumiu da fila",
    "contrato no drive",
    "ler a tabela",
  ],
  preRequisitos: [
    "Saber que esta aba é a terceira frente: ela só abre para trabalho depois que a Auditoria e o Exame concluírem.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e clique na aba CADASTRO.",
      detalhe:
        "A fila mostra quem está nesta frente. Quem concluiu o cadastro sai dela, e é isso que o indicador de cadastrados devolve.",
      controles: ["Esteira Admissional", "CADASTRO"],
    },
    {
      gesto: "Leia os indicadores do topo, começando pelo que é só desta aba.",
      detalhe:
        "Cadastrado conta quem já concluiu a frente, e clicar nele traz essas pessoas de volta à lista. Ao lado ficam os de sempre: o total da fila, quem tem campo obrigatório pendente e as pausadas.",
      controles: ["Cadastrado", "Total na fila", "Com pendências obrigatórias", "Pausadas"],
    },
    {
      gesto: "Confira as colunas de identificação: Contrato, Matrícula e Nome.",
      detalhe:
        "Matrícula existe só nesta aba e vem antes do nome, porque é aqui que a importação das matrículas acontece. Sem matrícula gravada, a célula diz não informado.",
      controles: ["Contrato", "Matrícula", "Nome"],
    },
    {
      gesto: "Siga por Cliente, Cargo, Loja e Projeto.",
      detalhe:
        "São as mesmas quatro das outras abas, na mesma posição. Loja é a unidade do cliente em que a pessoa trabalha, e Projeto é o projeto de alto volume, quando existe um.",
      controles: ["Cliente", "Cargo", "Loja", "Projeto"],
    },
    {
      gesto: "Leia Data adm. e Status.",
      detalhe:
        "A data é a de admissão. O status é o da frente de cadastro, escrito na etiqueta colorida. Linha cuja frente ainda não abriu mostra Aguardando, que é leitura de tela: o status guardado não foi alterado.",
      controles: ["Data adm.", "Status", "Aguardando"],
    },
    {
      gesto: "Confira a coluna Pendências Obrig.",
      detalhe:
        "Ela diz se aquela admissão tem campo obrigatório em branco, e é coluna separada de propósito, nunca embutida nas ações. É a mesma leitura do Gerenciador.",
      controles: ["Pendências Obrig."],
    },
    {
      gesto: "Olhe a coluna Avanço, que é onde a frente anda.",
      detalhe:
        "Enquanto o cadastro não abriu, ela escreve por extenso que a admissão aguarda a Auditoria e o Exame, e o trabalho já feito fica preservado. A mudança de status tem artigo próprio.",
      controles: ["Avanço", "Pausado: aguarda Auditoria + Exame"],
    },
    {
      gesto: "Na mesma faixa, veja o estado da assinatura, quando houver.",
      detalhe:
        "Havendo envelope, a etiqueta dele aparece na linha, e o contrato já assinado ganha um link para o Drive. Sem envelope, a linha fica limpa. O acompanhamento é o artigo do envelope.",
      controles: ["Aguardando Assinatura", "Assinado", "Cancelado", "Contrato no Drive"],
    },
    {
      gesto: "Faltando coluna do lado direito, role a tabela na horizontal.",
      detalhe:
        "Esta é a aba mais larga da esteira, então a tabela rola em vez de espremer as colunas. A coluna Ações fica fixa à direita enquanto você rola.",
      controles: ["Ações"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A coluna Status diz Aguardando e o seletor não deixa mudar nada.",
      acao: "A frente de cadastro ainda não abriu: ela espera a Auditoria e o Exame concluírem. Não há o que fazer nesta aba enquanto isso, e a admissão volta à fila sozinha quando as duas fecharem, sem perder nada.",
    },
    {
      sintoma: "A Matrícula está em não informado.",
      acao: "Aquela admissão ainda não tem matrícula gravada. Ela entra pela importação da planilha de matrículas, que tem artigo próprio, ou pela edição da admissão.",
    },
    {
      sintoma: "O indicador de cadastrados mostra um número e eu não acho essas pessoas na lista.",
      acao: "Quem concluiu o cadastro sai da fila. Clique no indicador de cadastrados: ele filtra pelo status de conclusão e traz essas pessoas de volta à tabela.",
    },
    {
      sintoma: "A linha não mostra etiqueta nenhuma de assinatura.",
      acao: "Aquela admissão não tem envelope. A etiqueta aparece só quando existe um, e o link do contrato só depois que ele volta assinado.",
    },
    {
      sintoma: "Só esta aba tem a coluna Matrícula, e eu procurei nas outras.",
      acao: "É de propósito: a matrícula está aqui porque é nesta frente que ela é importada e conferida. Nas outras abas ela não entra, para a tabela não ficar mais larga do que precisa.",
    },
    {
      sintoma: "A coluna de pendências diz que falta campo obrigatório e eu não sei quais.",
      acao: "A lista dos campos que faltam abre pela ficha da pessoa, no olho da coluna Ações, e é a mesma lista do Gerenciador.",
    },
  ],
  regras: [
    "A aba Cadastro tem duas leituras próprias: a coluna Matrícula, antes do nome, e o estado da assinatura na faixa de avanço.",
    "Célula sem dado escreve não informado, e não um traço.",
    "Enquanto a Auditoria e o Exame não concluírem, a linha aparece como Aguardando: isso é leitura de tela, e o status guardado da frente não muda.",
    "Quem concluiu o cadastro sai da fila. O indicador de cadastrados é o caminho de volta para essas pessoas.",
    "Os indicadores por status contam só frente em andamento, por isso o estado que conclui tem indicador próprio.",
    "A etiqueta da assinatura aparece só quando existe envelope, e o link do contrato só quando ele volta assinado.",
    "A tabela rola na horizontal em vez de espremer as colunas, e a coluna de ações fica fixa à direita.",
  ],
  relacionados: [
    "mudar-o-status-do-cadastro-e-voltar-atras",
    "concluir-o-cadastro-e-o-contrato",
    "acompanhar-o-envelope-na-aba-cadastro",
    "importar-as-matriculas-por-planilha",
    "o-mapa-das-frentes-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "ler-a-linha-da-tabela",
    "ordenar-a-lista-pelo-cabecalho",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/frontend/src/lib/clicksign.ts",
    "apps/backend/src/esteira/esteira.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
