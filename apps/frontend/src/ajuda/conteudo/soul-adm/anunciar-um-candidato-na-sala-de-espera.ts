import type { Artigo } from "../../tipos";

/**
 * N1 DA SALA DE ESPERA 1 de 2: ANUNCIAR O CANDIDATO.
 *
 * ┌─ O ARTIGO PRECISA EXPLICAR UMA FASE QUE NINGUÉM ENXERGAVA ──────────────────────────────────┐
 * │ A Sala De Espera existe para o candidato que o cliente ou a Seleção ANUNCIA antes de ele se     │
 * │ candidatar. Antes dela, essa fase vivia em conversa de WhatsApp e em planilha pessoal. O passo a │
 * │ passo é curto (é um formulário), mas o que faz o artigo valer é o que ele diz em volta: que isso │
 * │ não é admissão, que o CPF é opcional e por que vale preenchê-lo mesmo assim, e o que acontece    │
 * │ quando se escolhe um status que encerra.                                                        │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CPF É OPCIONAL E MESMO ASSIM TEM PASSO PRÓPRIO ──────────────────────────────────────────┐
 * │ Ele não trava o Salvar, então é o primeiro campo que alguém pula. Só que é ele que faz o vínculo │
 * │ com a admissão casar por identidade em vez de por nome, e a etiqueta "CPF Confere" do livreto do │
 * │ vínculo só aparece por causa dele. Dizer "opcional" e parar ali produziria uma Sala inteira sem  │
 * │ CPF e um vínculo feito no olho.                                                                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * OS RÓTULOS SÃO OS DO CÓDIGO, letra por letra, inclusive a caixa que a tela usa de verdade
 * ("Data de recebimento", "Data de nascimento", em caixa normal; as abas em title case).
 *
 * §A.6: nenhum nome, CPF, telefone ou e-mail de pessoa real aparece aqui.
 */
export const artigo: Artigo = {
  slug: "anunciar-um-candidato-na-sala-de-espera",
  titulo: "Anunciar Um Candidato Na Sala De Espera",
  modulo: "SOUL_ADM",
  rotas: ["/sala-espera"],
  menus: ["sala-espera"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "sala-espera",
  resumo:
    "Como registrar o candidato que o cliente ou a Seleção anunciou antes da candidatura, com o que é obrigatório, o que é opcional e por que vale preencher o CPF mesmo sem ser cobrado.",
  termos: [
    "sala de espera",
    "candidato anunciado",
    "indicacao",
    "indicado pelo cliente",
    "antes da vaga",
    "pre processo",
    "novo registro",
    "cadastrar candidato",
    "fila de espera",
    "aguardando",
    "status que encerra",
    "declinou",
    "desistiu",
  ],
  preRequisitos: [
    "Ter em mãos o nome da pessoa, o cliente e o cargo para os quais ela foi anunciada. Os três são obrigatórios, junto da data de recebimento e do status.",
  ],
  passos: [
    {
      gesto: "Abra o menu Sala De Espera e fique na aba Aguardando.",
      detalhe:
        "É a fila viva, de quem ainda espera tratativa. As outras duas abas são histórico: Admissões Vinculadas guarda quem virou admissão, e Admissões Inativadas guarda quem parou no caminho. Nada é apagado nesta tela.",
      controles: ["Sala De Espera", "Aguardando", "Admissões Vinculadas", "Admissões Inativadas"],
      print: {
        arquivo: "01-fila-aguardando.png",
        legenda: "Passo 1: a barra da Sala De Espera, com a contagem e o botão Novo Registro.",
      },
    },
    {
      gesto: "Clique em Novo Registro.",
      detalhe:
        "A janela já abre com a data de hoje no recebimento e com o primeiro status que não encerra, então o caso comum é só preencher o resto.",
      controles: ["Novo Registro"],
    },
    {
      gesto: "Escreva o Nome, que ocupa a linha inteira.",
      detalhe:
        "É o campo mais longo do cadastro e o que mais sofre com abreviação. Escreva o nome como ele vai aparecer no documento da pessoa.",
      controles: ["Nome"],
      print: {
        arquivo: "02-janela-do-registro.png",
        legenda: "Passo 3: a janela Novo Registro, com os campos obrigatórios e os opcionais.",
      },
    },
    {
      gesto: "Preencha CPF, Data de nascimento e E-mail sempre que tiver.",
      detalhe:
        "Os três são opcionais e não travam o Salvar, mas são eles que fazem o vínculo com a admissão casar por identidade depois, em vez de casar por nome. Com o CPF preenchido, o livreto do vínculo mostra a etiqueta CPF Confere na admissão certa.",
      controles: ["CPF", "Data de nascimento", "E-mail"],
    },
    {
      gesto: "Escolha o Cliente e o Cargo nas listas.",
      detalhe:
        "As duas listas têm busca: digite parte do nome em vez de rolar. O cliente aparece sempre com o código na frente, porque a mesma operação se repete entre unidades e o código é o que distingue.",
      controles: ["Cliente", "Cargo", "Selecionar…"],
    },
    {
      gesto: "Confira Telefone, Data de recebimento, Origem e Status.",
      detalhe:
        "Origem diz quem anunciou: Cliente ou Seleção. Em Status, o rótulo avisa quando a escolha encerra o registro, escrevendo encerra ao lado do nome: status que encerra tira a pessoa da fila na hora do salvamento e a manda para Admissões Inativadas.",
      controles: ["Telefone", "Data de recebimento", "Origem", "Cliente", "Seleção", "Status"],
    },
    {
      gesto: "Clique em Salvar.",
      detalhe:
        "O botão só acende com Nome, Cliente, Cargo, Data de recebimento e Status preenchidos. A lista se refaz sozinha, e a contagem ao lado da busca passa a incluir o registro novo.",
      controles: ["Salvar", "Cancelar"],
    },
    {
      gesto: "Para corrigir depois, clique no lápis da linha.",
      detalhe:
        "Abre a mesma janela, com o título Editar Registro. É por ali que se troca o status quando a pessoa declina ou desiste, e é por ali que se acrescenta o CPF que faltava.",
      controles: ["Editar registro", "Editar Registro"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Salvei e a pessoa não apareceu na aba Aguardando.",
      acao: "O status escolhido encerra o registro. Ela está na aba Admissões Inativadas, inteira, e volta para a fila se você trocar o status pelo lápis.",
    },
    {
      sintoma: "O sistema respondeu CPF inválido.",
      acao: "Os dígitos não fecham. Confira o número com a pessoa ou apague o campo: o CPF é opcional, e é melhor ficar sem ele do que gravar um número errado que vai atrapalhar o vínculo depois.",
    },
    {
      sintoma: "O sistema respondeu Falha ao salvar.",
      acao: "Nada foi gravado. Confira os campos obrigatórios, tente de novo e, se repetir, cancele, recarregue a página e refaça o cadastro.",
    },
    {
      sintoma: "Não acho o cliente ou o cargo na lista.",
      acao: "As duas listas trazem só o que está ativo no catálogo, e a Sala não cria nenhum dos dois. Peça o cadastro à administração e volte para concluir o registro.",
    },
    {
      sintoma: "Cadastrei a pessoa aqui e não a encontro na Esteira.",
      acao: "É o esperado. O registro da Sala não é admissão: ele só entra na esteira no momento do vínculo, e até lá não aparece em fila nem em indicador nenhum.",
    },
  ],
  regras: [
    "O registro da Sala De Espera não é admissão. Ele não entra na esteira, não tem régua de documentos e não conta em indicador nenhum.",
    "São obrigatórios cinco campos: Nome, Cliente, Cargo, Data de recebimento e Status. CPF, data de nascimento, e-mail e telefone são opcionais.",
    "CPF, nascimento e e-mail servem ao vínculo com a admissão: com eles o casamento é por identidade, sem eles é pelo nome.",
    "Status que encerra tira o registro da fila viva e o manda para Admissões Inativadas. Nada é apagado nesta tela.",
    "O cliente aparece sempre com o código na frente, porque a mesma operação se repete entre unidades e o código é o que as distingue.",
  ],
  relacionados: [
    "mover-da-sala-de-espera-para-a-admissao",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
    "abrir-e-fechar-uma-janela-do-sistema",
    "manter-um-catalogo-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/sala-espera/page.tsx",
    "apps/backend/src/sala-espera/sala-espera.service.ts",
    "apps/backend/src/sala-espera/sala-espera.controller.ts",
  ],
  revisadoEm: "2026-09-28",
};
