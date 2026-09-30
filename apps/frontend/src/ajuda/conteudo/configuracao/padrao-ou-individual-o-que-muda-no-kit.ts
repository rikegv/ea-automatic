import type { Artigo } from "../../tipos";

/**
 * N2 DAS REGRAS DO KIT, 3 de 3: A MARCAÇÃO DE CADA TÍTULO.
 *
 * ┌─ O QUE CADA UM EXIGE, CONFERIDO NO MOTOR E NÃO DEDUZIDO DO RÓTULO ───────────────────────────┐
 * │ PADRÃO: instrução geral, a mesma folha para todo mundo. O motor NÃO cobra nome nessa página,   │
 * │ mesmo que ela traga um nome por acaso, e REPLICA o documento no kit de TODOS os funcionários   │
 * │ do lote, na posição de ordem dele. Título padrão repetido dentro do lote é deduplicado: fica o │
 * │ primeiro.                                                                                      │
 * │                                                                                                │
 * │ INDIVIDUAL: documento da pessoa, e continua EXIGINDO o nome para ser atribuído. Sem nome        │
 * │ legível na página, o documento é reconhecido e mesmo assim vai para a lista do que não foi      │
 * │ atribuído, porque não há a quem entregá-lo.                                                    │
 * │                                                                                                │
 * │ A marcação é CADASTRO, e o código diz isso na letra: ela nunca é deduzida do texto do título.  │
 * │ Título novo nasce INDIVIDUAL, que é o lado seguro: o erro dele é uma linha para revisar, e o   │
 * │ erro do contrário seria uma folha da pessoa entrando no kit de todo mundo.                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * N2 de propósito: quem monta o dicionário pela primeira vez consegue trabalhar sem esta peça, com
 * o padrão que já vem marcado. Ela é o recurso secundário, e é por isso que é a terceira.
 *
 * SEM IMAGEM DECLARADA: os prints desta frente entram em entrega própria.
 */
export const artigo: Artigo = {
  slug: "padrao-ou-individual-o-que-muda-no-kit",
  titulo: "Padrão Ou Individual: O Que Muda No Kit",
  modulo: "CONFIGURACAO",
  rotas: ["/admin/kit-regras"],
  menus: ["kit-regras"],
  publico: "GESTAO",
  nivel: "N2",
  familia: "motor-de-documentos",
  resumo:
    "A diferença entre o documento que é igual para todos e o documento que é da pessoa, o que cada marcação exige do arquivo da folha e quando trocar uma pela outra.",
  termos: [
    "documento padrao",
    "documento individual",
    "manual entrou para todo mundo",
    "documento igual para todos",
    "sem nome de funcionario",
    "documento sem dono",
    "nao foi atribuido a ninguem",
    "instrucao geral",
    "folha de orientacao",
    "documento repetido no kit",
  ],
  preRequisitos: [
    "Ter o título já cadastrado no dicionário do kit: a marcação é feita sobre a linha dele.",
  ],
  passos: [
    {
      gesto: "Abra Regras Do Kit e selecione o kit na coluna da esquerda.",
      controles: ["Regras Do Kit"],
    },
    {
      gesto: "Localize a linha do título e olhe a etiqueta do meio da linha.",
      detalhe:
        "Ela mostra Padrão ou Individual, e é a marcação atual daquele título. Todo título novo nasce como Individual.",
      controles: ["Padrão", "Individual"],
    },
    {
      gesto:
        "Clique na etiqueta para trocar a marcação: de Individual para Padrão, e de Padrão para Individual.",
      detalhe:
        "A troca vale do próximo processamento em diante. Lote já processado não muda sozinho.",
      controles: ["Padrão", "Individual"],
    },
    {
      gesto:
        "Marque como Padrão o que é instrução geral: o manual, a folha de orientação, o comunicado que sai igual para todo mundo.",
      detalhe:
        "O sistema deixa de cobrar nome nessa página e coloca uma cópia dela no kit de cada funcionário do lote, na posição de ordem do título.",
    },
    {
      gesto:
        "Deixe como Individual tudo que é da pessoa: registro, contrato, ficha, termo assinado por ela.",
      detalhe:
        "Esse continua exigindo o nome na página para ser entregue à pessoa certa. Sem o nome, o documento aparece na lista do que não foi atribuído.",
    },
    {
      gesto: "Processe um lote de conferência e confira o resultado antes de valer para o mês inteiro.",
      detalhe:
        "O erro de marcação aparece na hora: ou o documento de todos ficou faltando para a maioria, ou o documento de uma pessoa apareceu no kit dos outros.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "Um documento que é igual para todos apareceu na lista do que não foi atribuído.",
      acao: "Ele está marcado como Individual e não tem nome na página. Marque o título como Padrão e processe o lote de novo.",
    },
    {
      sintoma: "Um documento de uma pessoa entrou no kit de todo mundo.",
      acao: "Ele está marcado como Padrão, e Padrão entra no kit de todos sem olhar nome. Marque o título como Individual e processe o lote de novo.",
    },
    {
      sintoma: "O documento padrão veio uma vez só, mesmo estando repetido em vários arquivos do lote.",
      acao: "É assim de propósito. O sistema guarda a primeira ocorrência de cada título padrão e descarta as repetidas, para não empilhar a mesma folha no kit.",
    },
    {
      sintoma: "O documento é da pessoa, tem o nome na página e mesmo assim pediu revisão.",
      acao: "Isso não é marcação errada. Quando a página não traz documento de identificação para confirmar quem é, o sistema entrega com um aviso de revisão, para alguém conferir antes de baixar.",
    },
  ],
  regras: [
    "Título novo nasce como Individual.",
    "Padrão é instrução geral: não exige nome na página e entra no kit de todos os funcionários do lote.",
    "Título padrão repetido dentro do mesmo lote entra uma vez só.",
    "Individual é documento da pessoa: sem nome legível na página, ele não é atribuído a ninguém.",
    "A marcação é cadastro desta tela, e nunca é deduzida do texto do título.",
    "Trocar a marcação vale do próximo processamento em diante.",
  ],
  relacionados: [
    "montar-o-dicionario-de-titulos-do-kit",
    "criar-e-renomear-um-tipo-de-kit",
    "processar-o-kit-a-partir-dos-pdfs-da-folha",
    "reimportar-os-documentos-que-faltam",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/kit-regras/page.tsx",
    "apps/backend/src/admin/kit-regras/kit-regras.service.ts",
    "apps/ai-service/app/kit_motor.py",
  ],
  revisadoEm: "2026-09-30",
};
