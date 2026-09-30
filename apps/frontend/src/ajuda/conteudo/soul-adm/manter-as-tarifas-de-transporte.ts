import type { Artigo } from "../../tipos";

/**
 * N1 DO VALE-TRANSPORTE, LADO DO TIME: O CATÁLOGO DE TARIFAS.
 *
 * ┌─ POR QUE ESTA TELA VALE UM ARTIGO, sendo um formulário de quatro campos ─────────────────────┐
 * │ Porque o efeito dela está em OUTRO lugar: é esta tabela que SUGERE o valor ao candidato quando  │
 * │ ele preenche o próprio vale-transporte. Tarifa errada aqui vira valor errado no formulário de   │
 * │ dezenas de pessoas, e tarifa que falta vira campo que o candidato preenche no escuro. O passo a │
 * │ passo é curto; o que faz o artigo valer é a consequência, e a distinção entre INATIVAR e apagar.│
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ESTA PEÇA NÃO COBRE, de propósito ───────────────────────────────────────────────────┐
 * │ O PREENCHIMENTO pelo candidato é outro público e outra tela, e não entra aqui. O envio do link  │
 * │ do formulário é o artigo irmão "enviar-o-link-do-formulario-de-vt".                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O PAR CIDADE MAIS TRANSPORTE É ÚNICO, e isso foi lido do código (`garantirParLivre`, em
 * `admin/tarifas/tarifas.service.ts`): repetir o par devolve conflito com a mensagem do servidor,
 * que está no bloco de erros letra por letra. Zero é valor válido, e é como se cadastra gratuidade
 * (`parseValor`, na tela).
 *
 * §A.6: esta tela não tem dado de pessoa. Nada a mascarar, e nenhum exemplo com gente.
 *
 * IMAGEM: pendência conhecida. A captura desta tela é inofensiva do ponto de vista de dado pessoal,
 * mas o motor de imagens está com a captura das telas desta frente suspensa, então o texto foi
 * escrito para funcionar sem imagem: cada passo nomeia o controle pelo rótulo que a tela usa.
 */
export const artigo: Artigo = {
  slug: "manter-as-tarifas-de-transporte",
  titulo: "Manter As Tarifas De Transporte",
  modulo: "SOUL_ADM",
  rotas: ["/admin/tarifas"],
  menus: ["tarifas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "vt-time",
  resumo:
    "Como cadastrar, corrigir, buscar, inativar e reativar as tarifas de transporte que o sistema sugere ao candidato no formulário de vale-transporte.",
  termos: [
    "tarifa",
    "tarifas de transporte",
    "valor da passagem",
    "passagem",
    "metro",
    "onibus",
    "trem",
    "cadastrar tarifa",
    "mudar o valor da passagem",
    "passagem aumentou",
    "tabela de tarifas",
    "gratuidade",
    "inativar tarifa",
    "reativar tarifa",
    "vale transporte",
  ],
  preRequisitos: [
    "Ter em mãos o valor vigente da tarifa, por cidade e por tipo de transporte. A tela guarda o que você informar, ela não consulta preço em lugar nenhum.",
  ],
  passos: [
    {
      gesto: "Abra o menu Tarifas De Transporte.",
      detalhe:
        "O formulário de cadastro fica no topo e a tabela do que já existe fica logo abaixo.",
      controles: ["Tarifas De Transporte"],
    },
    {
      gesto: "Para incluir uma tarifa, preencha cidade, tipo de transporte e valor, e clique em Adicionar.",
      detalhe:
        "Os três primeiros campos são obrigatórios e a observação é livre. O valor aceita vírgula ou ponto, então 6,10 e 6.10 valem o mesmo. Use 0,00 para gratuidade, que é uma tarifa real e não um campo vazio.",
      controles: ["Cidade *", "Tipo de transporte *", "Valor R$ *", "Observação", "Adicionar"],
    },
    {
      gesto: "Para corrigir uma tarifa, clique em editar na linha dela.",
      detalhe:
        "A tela sobe até o formulário, já preenchido, e avisa que você está editando. O botão passa a ser Salvar alterações, e o Cancelar ao lado abandona a edição sem mexer em nada.",
      controles: ["editar", "Editando uma tarifa, ajuste os campos e salve.", "Salvar alterações", "Cancelar"],
    },
    {
      gesto: "Ache a tarifa pela busca ou pelos três recortes de status.",
      detalhe:
        "A busca procura por cidade ou por transporte enquanto você digita. Os três botões redondos recortam a lista por ativas, inativas ou todas, e cada um mostra quantas linhas tem.",
      controles: ["Buscar por cidade ou transporte", "ativas", "inativas", "todas"],
    },
    {
      gesto: "Leia a tabela pelas cinco colunas e ordene clicando no cabeçalho.",
      detalhe:
        "Cidade, Transporte, Valor, Observação e Status. O valor ordena pela grandeza do número, não pelo texto, e o status põe as ativas na frente. Observação vazia aparece como não informado.",
      controles: ["Cidade", "Transporte", "Valor", "Observação", "Status", "Ativa", "Inativa"],
    },
    {
      gesto: "Para tirar uma tarifa das sugestões, clique em inativar e confirme.",
      detalhe:
        "A janela Inativar Tarifa explica o efeito antes de você decidir: a tarifa deixa de ser sugerida no formulário, mas não é excluída, o histórico é preservado e ela pode voltar.",
      controles: ["inativar", "Inativar Tarifa", "Inativar", "Cancelar"],
    },
    {
      gesto: "Para trazer de volta, recorte por inativas e clique em reativar.",
      detalhe:
        "A reativação não pede confirmação: ela é o desfazer da inativação, e volta a tarifa para as sugestões na hora.",
      controles: ["inativas", "reativar", "Ativa"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "Ao salvar aparece Valor inválido. Informe um valor em reais, por exemplo 6,10. Use 0,00 para gratuidade.",
      acao: "O campo do valor aceita só número, com vírgula ou ponto, e não aceita valor negativo. Escreva só o número, sem o símbolo de moeda e sem texto junto.",
    },
    {
      sintoma: "Ao salvar aparece Já existe tarifa para essa cidade e transporte.",
      acao: "Aquele par de cidade e transporte já está cadastrado, e ele é único. Em vez de criar outra, ache a linha existente pela busca e clique em editar para atualizar o valor.",
    },
    {
      sintoma: "A tela mostra Tarifa não encontrada.",
      acao: "Aquela linha saiu da lista enquanto a sua tela estava aberta. Recarregue a página e repita a ação sobre a lista de agora.",
    },
    {
      sintoma: "A tela mostra Erro ao carregar, Erro ao salvar, Erro ao inativar ou Erro ao reativar.",
      acao: "A chamada não completou. Recarregue a página, confira se a linha está como você esperava e tente de novo. Nada é gravado pela metade.",
    },
    {
      sintoma: "A lista diz Nenhuma tarifa neste filtro.",
      acao: "É recorte, não falta de cadastro. Clique em todas e apague o que está escrito na busca por cidade ou transporte.",
    },
    {
      sintoma: "Mudei o valor e o candidato diz que o formulário ainda mostra o antigo.",
      acao: "O formulário sugere o valor vigente no momento em que a pessoa abre a tela. Peça para ela recarregar o formulário. O que já foi preenchido antes da mudança fica como foi preenchido: a tabela sugere, ela não reescreve o que a pessoa declarou.",
    },
  ],
  regras: [
    "Cada par de cidade e tipo de transporte tem uma tarifa só. Para mudar o valor, edita-se a linha que existe.",
    "Zero é valor válido e é como se cadastra gratuidade.",
    "Inativar não exclui: a tarifa sai das sugestões do formulário, o histórico é preservado e ela pode ser reativada.",
    "Só tarifa ativa é sugerida ao candidato.",
    "A tabela sugere o valor, e o candidato pode confirmar ou ajustar. O que ele declarou não é reescrito quando a tarifa muda depois.",
    "A observação é livre e serve para o time: ela não trava nem altera cálculo nenhum.",
  ],
  relacionados: [
    "enviar-o-link-do-formulario-de-vt",
    "montar-o-pacote-de-beneficios",
    "marcar-o-beneficio-como-cadastrado",
    "buscar-dentro-da-tela",
    "ordenar-a-lista-pelo-cabecalho",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/tarifas/page.tsx",
    "apps/backend/src/admin/tarifas/tarifas.service.ts",
    "apps/backend/src/admin/tarifas/tarifas.controller.ts",
  ],
  revisadoEm: "2026-09-30",
};
