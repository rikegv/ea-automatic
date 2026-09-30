import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA EXAME, 2 de 4: REAGENDAR, E AS ETIQUETAS QUE A FILA PASSA A MOSTRAR.
 *
 * ┌─ POR QUE O REAGENDAMENTO É ARTIGO SEPARADO DO PRIMEIRO AGENDAMENTO ──────────────────────────┐
 * │ É o MESMO botão da linha, e é aí que está a confusão: quem já tem exame marcado abre a janela  │
 * │ em LEITURA, sem nenhum campo editável. A pessoa conclui que a janela quebrou, ou que só quem   │
 * │ cadastrou pode mexer. O que falta é um clique em "Reagendar", que é o que libera a edição.     │
 * │ Juntar os dois num artigo só faria o passo a passo do cadastro terminar em uma tela que não é  │
 * │ a que a maioria encontra.                                                                      │
 * │ NÃO COBRE: o primeiro agendamento ("agendar-o-exame-admissional"), que é onde os campos e as   │
 * │ travas estão explicados.                                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS ETIQUETAS DA LINHA SÃO COISAS DIFERENTES, e o passo 6 existe só para isso ──────────┐
 * │ Na fila do Exame (`esteira/page.tsx`) convivem:                                                │
 * │   . o INDICADOR DISCRETO com o ícone de relógio, o dia e a hora, cujo título de apoio é        │
 * │     "Exame agendado". Ele diz QUANDO é, e aparece para todo mundo que tem agendamento;         │
 * │   . a PILL LARANJA "Reagendado 2x", com título "Exame reagendado". Ela CONTA quantas vezes o   │
 * │     agendamento foi substituído, e só existe a partir da primeira troca.                        │
 * │ Uma não substitui a outra: quem foi reagendado mostra as duas. O `controles` declara só a parte │
 * │ estável ("Reagendado"), porque o número vem do contador e não é rótulo fixo.                    │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CONTADOR SOBE EM QUALQUER SALVAMENTO, e isso surpreende ──────────────────────────────────┐
 * │ `salvarAgendamento` (`esteira.service.ts`) incrementa `reagendamentos` sempre que já existe    │
 * │ agendamento, então corrigir só o valor do exame também conta como reagendamento. Está no bloco │
 * │ de erros, porque a pessoa vê o contador subir sem ter trocado a data e acha que errou algo.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a captura das telas que mostram pessoa está
 * vetada enquanto a homologação não tiver arnês sintético, e tanto a fila quanto o cabeçalho da
 * janela trazem o nome do candidato. Os prints entram em entrega própria.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa.
 */
export const artigo: Artigo = {
  slug: "reagendar-o-exame",
  titulo: "Reagendar O Exame",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como trocar a data, a clínica ou o horário de um exame já marcado, o que o reagendamento substitui, e a diferença entre a etiqueta que mostra o exame agendado e a que conta os reagendamentos.",
  termos: [
    "reagendar",
    "reagendamento",
    "remarcar exame",
    "trocar a data do exame",
    "mudar de clinica",
    "candidato faltou",
    "nao compareceu",
    "exame remarcado",
    "reagendado 2x",
    "quantas vezes reagendou",
    "corrigir o agendamento",
    "editar o agendamento",
    "a janela abriu sem deixar editar",
  ],
  preRequisitos: [
    "A pessoa já precisa ter um agendamento lançado. Sem agendamento nenhum, o caminho é o primeiro cadastro, não o reagendamento.",
    "Ter em mãos o novo combinado com a clínica: dia, horário, endereço e a nova previsão do atestado.",
  ],
  passos: [
    {
      gesto: "Na aba Exame, clique em Agendamento na linha de quem já tem exame marcado.",
      detalhe:
        "É o mesmo botão do primeiro cadastro. Com agendamento existente ele fica destacado, e o texto de apoio muda para ver ou reagendar.",
      controles: ["EXAME", "Agendamento", "Ver / reagendar o exame"],
    },
    {
      gesto: "Leia os dados atuais, que a janela mostra sem deixar editar.",
      detalhe:
        "Cada endereço do dia aparece em um bloco próprio, com a clínica, o local e o horário dele. Agendamento antigo, de quando havia um endereço só, aparece nos campos avulsos de horário, nome da clínica e local.",
      controles: [
        "Data",
        "Horário",
        "Nome da clínica",
        "Local da realização",
        "Fornecedor",
        "Valor do exame",
        "Previsão do ASO",
      ],
    },
    {
      gesto: "Clique em Reagendar para liberar a edição.",
      detalhe:
        "Enquanto você não clica, nada é editável: a janela abre em leitura de propósito, para uma passada de olho não virar troca de data. Só saindo pelo Fechar, nada muda.",
      controles: ["Reagendar", "Fechar"],
    },
    {
      gesto: "Leia o aviso amarelo que aparece no alto do formulário.",
      detalhe:
        "Ele diz que reagendar substitui os dados atuais e registra mais um reagendamento. Não existe histórico de datas anteriores na tela: o que fica é o contador de quantas vezes houve troca.",
    },
    {
      gesto: "Troque o que mudou e clique em Salvar reagendamento.",
      detalhe:
        "Os campos são os mesmos do primeiro cadastro, com as mesmas travas: data, clínica, local, horário e previsão do atestado. Dá para acrescentar ou remover endereços do dia.",
      controles: ["Salvar reagendamento", "Cancelar", "Adicionar endereço", "remover"],
    },
    {
      gesto: "Confira as duas etiquetas na linha da fila.",
      detalhe:
        "O relógio com o dia e a hora diz quando é o exame, e aparece para todo mundo que tem agendamento. A etiqueta laranja Reagendado conta quantas vezes o agendamento foi substituído, e só existe a partir da primeira troca. As duas aparecem juntas em quem foi reagendado, e o contador também aparece no alto da janela.",
      controles: ["Reagendado"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela abriu e nenhum campo aceita digitação.",
      acao: "Ela abre em leitura quando já existe agendamento. Clique em Reagendar para liberar a edição.",
    },
    {
      sintoma: "Eu só corrigi o valor do exame e o contador de reagendamentos subiu.",
      acao: "É o comportamento do sistema: qualquer salvamento sobre um agendamento que já existe conta como reagendamento, porque ele substitui o registro inteiro. O contador não é erro e não tem como ser zerado pela tela.",
    },
    {
      sintoma: "Reagendei e o status da frente voltou para agendado.",
      acao: "É o esperado quando a frente estava em uma das situações de espera do atestado: o reagendamento recoloca o exame no futuro, então a espera é refeita. Exame concluído, cancelado ou liberado para o cadastro sem atestado não é mexido.",
    },
    {
      sintoma: "Reagendei para a clínica errada.",
      acao: "Reagende outra vez, pelo mesmo botão. Vale sempre o último salvamento, e o contador sobe de novo, o que é apenas o registro de que houve mais uma troca.",
    },
    {
      sintoma: "Aparece Clínica não encontrada no cadastro.",
      acao: "A clínica escolhida saiu do cadastro entre a abertura da janela e o salvamento. Feche, abra de novo e escolha uma clínica da lista atualizada.",
    },
    {
      sintoma: "Preciso saber quais eram a data e a clínica anteriores.",
      acao: "A janela guarda só o combinado vigente e o número de reagendamentos. O que foi enviado antes à clínica está no arquivo que você gerou naquele dia para ela.",
    },
  ],
  regras: [
    "Reagendar substitui o agendamento inteiro: não existem dois agendamentos vivos para a mesma admissão.",
    "Qualquer salvamento sobre um agendamento existente conta como reagendamento e soma um no contador.",
    "O contador de reagendamentos não é editável nem zerável pela tela.",
    "O relógio com dia e hora na linha diz que há exame marcado. A etiqueta de reagendado conta as trocas, e as duas convivem.",
    "As travas do reagendamento são as mesmas do primeiro cadastro: data, clínica, local, horário e previsão do atestado.",
    "Reagendar não desfaz exame concluído, exame cancelado nem a liberação para o cadastro sem atestado.",
    "A tela não guarda histórico das datas anteriores, só a quantidade de trocas.",
  ],
  relacionados: [
    "agendar-o-exame-admissional",
    "anexar-o-aso-no-exame",
    "gerar-o-relatorio-da-clinica",
    "liberar-apto-sem-aso-validado",
    "ler-a-linha-da-tabela",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AgendamentoExameModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/esteira/dto/agendamento-exame.dto.ts",
  ],
  revisadoEm: "2026-09-30",
};
