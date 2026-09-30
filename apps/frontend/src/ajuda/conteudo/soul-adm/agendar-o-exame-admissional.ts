import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA EXAME, 1 de 4: O AGENDAMENTO, do zero.
 *
 * ┌─ O QUE ESTE ARTIGO COBRE, E O QUE ELE DEIXA DE PROPÓSITO PARA OS IRMÃOS ─────────────────────┐
 * │ COBRE: a janela de agendamento aberta pela primeira vez (cadastro), os cinco campos que travam │
 * │ o salvamento, o multi-endereço do mesmo dia e o efeito de salvar, que é a frente do Exame andar │
 * │ sozinha para agendada.                                                                         │
 * │ NÃO COBRE, por já ser artigo: anexar o atestado e ler o veredito da leitura automática          │
 * │ ("anexar-o-aso-no-exame"), reagendar ("reagendar-o-exame"), gerar o arquivo que vai à clínica    │
 * │ ("gerar-o-relatorio-da-clinica") e liberar como apto sem o atestado validado                    │
 * │ ("liberar-apto-sem-aso-validado").                                                              │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CAMPO QUE TRAVA SEM PARECER QUE TRAVA, e é o motivo do passo 5 existir ───────────────────┐
 * │ "Previsão do ASO" É OBRIGATÓRIA e NÃO tem asterisco na tela (`AgendamentoExameModal.tsx`: o    │
 * │ gate `completo` exige `previsaoAso`, e o rótulo é escrito sem o marcador de obrigatório). Quem  │
 * │ preenche data, clínica, local e horário e vê o botão continuar apagado não tem nenhuma pista    │
 * │ visual do que falta. É a lacuna mais provável desta tela, então ela virou passo próprio e       │
 * │ primeira linha do bloco de erros.                                                              │
 * │                                                                                                │
 * │ O "Valor do exame", esse sim, é opcional de verdade, e o artigo diz isso em seguida: sem a      │
 * │ distinção, a pessoa preenche o opcional procurando destravar o botão.                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O FORNECEDOR NÃO É CAMPO DESTA JANELA, E ISSO GERA UM BLOQUEIO SURPREENDENTE ───────────────┐
 * │ Ele é atributo da CLÍNICA e vem dela. O guard de "Agendado" (`camposAgendamentoFaltantes`,     │
 * │ `esteira.service.ts`) considera INCOMPLETO o endereço cuja clínica não tem fornecedor           │
 * │ cadastrado, então a pessoa preenche a janela inteira, salva, e o status ainda pode recusar por  │
 * │ um dado que não está na tela dela. Está no bloco de erros com essa explicação.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E ISSO É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: a captura das telas que mostram
 * pessoa está vetada enquanto a homologação não tiver arnês sintético, e a janela de agendamento traz
 * o nome do candidato no cabeçalho. Os prints entram em entrega própria, e o texto foi escrito para
 * funcionar sem eles: cada passo nomeia o controle por escrito.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa, só rótulos de campo.
 */
export const artigo: Artigo = {
  slug: "agendar-o-exame-admissional",
  titulo: "Agendar O Exame Admissional",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como lançar o agendamento do exame na fila do Exame: escolher a clínica, a data e o horário, registrar mais de um endereço no mesmo dia, informar a previsão do atestado e o valor, e por que salvar já move a frente para agendada.",
  termos: [
    "agendar exame",
    "agendamento",
    "marcar exame",
    "exame medico",
    "exame admissional",
    "clinica",
    "horario do exame",
    "previsao do aso",
    "quando sai o aso",
    "valor do exame",
    "quanto custa o exame",
    "endereco do exame",
    "dois enderecos",
    "onde vai fazer o exame",
    "agendei e nao mudou o status",
  ],
  preRequisitos: [
    "A clínica já precisa ter respondido com dia, horário e endereço. Esta janela é o registro do que foi combinado, ela não consulta agenda de clínica nenhuma.",
    "A clínica precisa estar cadastrada no sistema, com fornecedor preenchido no cadastro dela. O nome da clínica não é digitado aqui, é escolhido de uma lista.",
  ],
  passos: [
    {
      gesto: "Na Esteira Admissional, clique na aba Exame.",
      detalhe:
        "É a fila de quem está na etapa do exame. Cada aba é independente, e o agendamento só existe nesta.",
      controles: ["EXAME"],
    },
    {
      gesto: "Ache a pessoa pela busca do topo e clique em Agendamento, na linha dela.",
      detalhe:
        "Quem ainda não tem exame marcado abre a janela em branco, pronta para preencher. Quem já tem abre em leitura, e aí o caminho é o do reagendamento.",
      controles: ["Buscar por nome, CPF ou cliente", "Agendamento", "Cadastrar o agendamento do exame"],
    },
    {
      gesto: "Informe a Data do exame.",
      detalhe:
        "A data é única para o agendamento inteiro, mesmo quando a pessoa passa por mais de um endereço: o dia é um só, os horários são de cada endereço.",
      controles: ["Data"],
    },
    {
      gesto: "Preencha o primeiro endereço: Clínica, Local da realização e Horário.",
      detalhe:
        "A Clínica vem de uma lista com busca, nunca digitada. Escolhida a clínica, o sistema sugere o endereço que está no cadastro dela, e você pode trocar: é sugestão, não trava. Havendo mais de um lugar no mesmo dia, clique em Adicionar endereço e repita os três campos; remover apaga a linha que sobrou.",
      controles: [
        "Endereços do exame",
        "Clínica",
        "Selecione a clínica",
        "Local da realização",
        "Endereço / unidade do exame…",
        "Horário",
        "Adicionar endereço",
        "remover",
      ],
    },
    {
      gesto: "Preencha a Previsão do ASO.",
      detalhe:
        "É a data em que a clínica promete entregar o atestado, e ela é obrigatória mesmo sem estar marcada como tal na tela: sem ela o botão de cadastrar continua apagado. É por essa data que o sistema distingue, sozinho, a espera normal de um atraso de verdade.",
      controles: ["Previsão do ASO"],
    },
    {
      gesto: "Informe o Valor do exame, se você já souber.",
      detalhe:
        "Este é opcional de verdade: dá para salvar sem ele. Aceita a vírgula do português, e zero é valor válido quando o exame não é cobrado.",
      controles: ["Valor do exame", "Ex.: 120,00"],
    },
    {
      gesto: "Clique em Cadastrar agendamento.",
      detalhe:
        "Salvar já leva a frente do Exame para agendada, sem você precisar mexer no seletor de status. A mensagem verde do topo confirma, e a linha da fila passa a mostrar o dia e a hora ao lado do status.",
      controles: ["Cadastrar agendamento", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Preenchi tudo o que tem asterisco e o botão Cadastrar agendamento continua apagado.",
      acao: "Falta a Previsão do ASO, que é obrigatória e não tem asterisco na tela. Confira também se cada endereço tem clínica, local e horário: um endereço pela metade trava o salvamento tanto quanto a data em branco.",
    },
    {
      sintoma:
        "Aparece Cadastre as informações do exame (modal de agendamento) antes de marcar como Agendado. Falta preencher: clínica, local, horário e fornecedor dos endereços.",
      acao: "O fornecedor não é campo desta janela: ele vem do cadastro da clínica. Havendo clínica sem fornecedor cadastrado, o endereço conta como incompleto e o status é recusado. Peça o preenchimento do fornecedor no cadastro daquela clínica e repita.",
    },
    {
      sintoma: "A clínica que eu preciso não aparece na lista.",
      acao: "A lista traz só as clínicas ativas do cadastro. Peça o cadastro ou a reativação da clínica: o nome não pode ser digitado aqui de propósito, para o agendamento nunca apontar para uma clínica que o sistema não conhece.",
    },
    {
      sintoma: "Escolhi a clínica e o campo de local preencheu sozinho.",
      acao: "É a sugestão do endereço cadastrado naquela clínica, e ela é editável. O sistema só sugere quando o campo está vazio ou quando o que está ali foi ele mesmo que pôs: o que você digitou nunca é sobrescrito.",
    },
    {
      sintoma: "Aparece Valor do exame inválido. Use o formato 500,00.",
      acao: "Escreva só números, com vírgula para os centavos, sem o símbolo da moeda. Valor negativo também é recusado.",
    },
    {
      sintoma: "Aparece Falha ao carregar o agendamento.",
      acao: "A consulta não voltou. Feche a janela, recarregue a página e abra de novo. Persistindo, avise a administração antes de lançar o mesmo agendamento duas vezes.",
    },
    {
      sintoma: "Aparece Falha ao salvar o agendamento.",
      acao: "Nada foi gravado. Confira os campos e tente de novo. Reabrindo a janela e vendo os dados lá, o salvamento passou e o aviso foi só de retorno.",
    },
    {
      sintoma: "Salvei o agendamento e o status da frente não mudou.",
      acao: "O sistema não desfaz decisão humana: exame já concluído, exame cancelado e exame liberado para o cadastro sem atestado continuam como estavam. Nesses casos o agendamento é gravado e o status fica intacto, de propósito.",
    },
  ],
  regras: [
    "Salvar o agendamento já move a frente do Exame para agendada. Não é preciso trocar o status na mão.",
    "A data é única do agendamento. Os endereços é que são vários, e cada um tem clínica, local e horário próprios, até dez no mesmo dia.",
    "Data, clínica, local, horário e previsão do atestado travam o salvamento. O valor do exame é opcional.",
    "A previsão do atestado é o que permite ao sistema separar, sozinho, a espera normal do atraso.",
    "A clínica é escolhida no cadastro de clínicas, nunca digitada, e o fornecedor vem da clínica escolhida.",
    "Escolher a clínica sugere o endereço cadastrado nela, e a sugestão é editável.",
    "Existe um agendamento por admissão. Salvar de novo substitui os dados e conta como reagendamento.",
    "Salvar não desfaz exame concluído, cancelado nem liberado para o cadastro sem atestado.",
  ],
  relacionados: [
    "reagendar-o-exame",
    "anexar-o-aso-no-exame",
    "gerar-o-relatorio-da-clinica",
    "liberar-apto-sem-aso-validado",
    "aceitar-o-avanco-com-pendencias",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/esteira/AgendamentoExameModal.tsx",
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/esteira/dto/agendamento-exame.dto.ts",
  ],
  revisadoEm: "2026-09-30",
};
