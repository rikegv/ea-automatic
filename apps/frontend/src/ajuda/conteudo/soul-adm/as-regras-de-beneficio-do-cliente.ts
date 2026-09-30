import type { Artigo } from "../../tipos";

/**
 * N1 DE BENEFÍCIOS: A JANELA DE REGRAS DO CLIENTE, LER E ESCREVER.
 *
 * ┌─ POR QUE ISTO É ARTIGO, E NÃO UM PARÁGRAFO DO ARTIGO DE MONTAR O PACOTE ─────────────────────┐
 * │ `montar-o-pacote-de-beneficios` cita a janela em um passo, como consulta ("na dúvida, abra a    │
 * │ lâmpada"), e está certo: para quem monta pacote, a regra é insumo. O que aquele artigo não faz, │
 * │ e não deve fazer, é ensinar a ESCREVER a regra, que é a parte perigosa: uma edição aqui alcança │
 * │ TODAS as pessoas do cliente, inclusive as já cadastradas, e é o único ponto desta tela em que   │
 * │ um salvamento passa de uma linha só.                                                           │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O ARTIGO PRECISA DEIXAR COLADO ───────────────────────────────────────────────────────┐
 * │ 1. A REGRA É DO CLIENTE. As quarenta pessoas do mesmo cliente abrem exatamente o mesmo texto.   │
 * │ 2. O SALVAMENTO É A LISTA INTEIRA. Campo esvaziado APAGA a regra daquele grupo, e o grupo volta │
 * │    a mostrar não informado. Não existe salvar só o que foi tocado.                             │
 * │ 3. SÃO SEIS GRUPOS, SEMPRE, inclusive os vazios, porque quem lê precisa saber que aquele        │
 * │    benefício não tem regra escrita, e não ficar em dúvida se a tela deixou de mostrar.          │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTA PEÇA NÃO ENSINA montar o pacote de uma pessoa, que já é artigo, nem o carimbo do estágio.
 *
 * AS MENSAGENS DE ERRO SÃO AS DO CÓDIGO, letra por letra (`components/beneficios/
 * RegrasClienteModal.tsx`), e os rótulos dos seis grupos vêm do backend, para os dois lados nunca
 * divergirem. SEM IMAGEM, pendência conhecida: a fila mostra gente e a captura está vetada pela
 * auditoria de segurança enquanto a homologação não tiver arnês sintético.
 *
 * §A.6: nenhum dado de pessoa nem de cliente real; nenhum valor de benefício copiado de tela.
 */
export const artigo: Artigo = {
  slug: "as-regras-de-beneficio-do-cliente",
  titulo: "As Regras De Benefício Do Cliente",
  modulo: "SOUL_ADM",
  rotas: ["/beneficios"],
  menus: ["beneficios-fila"],
  publico: "OPERACAO",
  nivel: "N1",
  familia: "beneficios",
  resumo:
    "A janela Principais Informações guarda as regras de benefício de um cliente, iguais para todas as pessoas dele. Como consultar os seis grupos, editar o texto e o que o aviso de confirmação está avisando.",
  termos: [
    "regra do beneficio",
    "regras do cliente",
    "principais informacoes",
    "lampada",
    "como funciona o vt desse cliente",
    "politica de beneficio",
    "desconto",
    "observacao do cliente",
    "o que o cliente paga",
    "cadastrar regra",
    "editar regra",
  ],
  preRequisitos: [
    "Saber que a regra é do cliente, e não da pessoa: o que você escrever aqui passa a valer para todas as pessoas daquele cliente.",
  ],
  passos: [
    {
      gesto: "Abra o menu Benefícios e ache uma pessoa do cliente que você quer consultar.",
      detalhe:
        "Qualquer linha daquele cliente serve: a janela abre pelo cliente da linha, então todas mostram o mesmo conteúdo. Recortar por cliente no filtro ajuda a achar uma linha rápido.",
      controles: ["Benefícios", "Cliente"],
    },
    {
      gesto: "Clique no botão de lâmpada na coluna Ações.",
      detalhe:
        "A janela abre em modo de consulta, com o cliente no título e a frase que lembra que as regras são dele. Linha sem cliente não tem lâmpada, porque não há cliente do qual ler a regra.",
      controles: ["Ações", "Principais informações: as regras de benefício deste cliente", "Principais Informações"],
    },
    {
      gesto: "Leia os seis grupos.",
      detalhe:
        "São sempre os mesmos seis, na mesma ordem: os quatro principais, o grupo dos demais benefícios e a observação geral do cliente. Grupo sem regra escrita aparece como não informado.",
      controles: [
        "VT (Vale-Transporte)",
        "VR (Vale-Refeição)",
        "VA (Vale-Alimentação)",
        "AM (Assistência Médica)",
        "Outros Benefícios",
        "Observação Geral Do Cliente",
      ],
    },
    {
      gesto: "Para escrever ou corrigir, clique em Editar regras.",
      detalhe:
        "A edição abre já com o que está gravado, para você corrigir em vez de redigitar. Cada grupo tem o seu campo de texto, e dá para escrever em várias linhas: a leitura preserva as linhas que você digitou.",
      controles: ["Editar regras", "Sem regra cadastrada. Deixe vazio para não ter regra."],
    },
    {
      gesto: "Escreva o texto do grupo que precisa de regra.",
      detalhe:
        "Esvaziar um campo apaga a regra daquele grupo, e ele volta a mostrar não informado na consulta. O que for salvo é a lista inteira, não só o campo que você tocou.",
    },
    {
      gesto: "Clique em Salvar regras e leia o aviso que abre.",
      detalhe:
        "O aviso diz o nome do cliente e que as regras passam a valer na hora para todas as pessoas dele, inclusive as já cadastradas. É o único ponto desta tela em que um salvamento alcança mais de uma linha.",
      controles: ["Salvar regras", "Confirmar Alteração", "Vale Para Todo O Cliente"],
    },
    {
      gesto: "Confirme em Entendi, salvar para todos.",
      detalhe:
        "Salvo, a janela sai da edição e mostra a confirmação em verde. Cancelar, nos dois passos, fecha sem gravar nada.",
      controles: ["Entendi, salvar para todos", "Cancelar", "Regras salvas para todas as pessoas deste cliente."],
    },
    {
      gesto: "Saia pelo Fechar quando terminar de ler.",
      detalhe: "A janela não fecha por clique fora, para um clique torto não jogar fora o que você digitou.",
      controles: ["Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela mostra Não foi possível carregar as regras deste cliente.",
      acao: "A consulta não voltou. Feche, abra outra vez e, repetindo, recarregue a página. Nada foi alterado.",
    },
    {
      sintoma: "A janela mostra Seu usuário não tem permissão para ver as regras de benefício.",
      acao: "O seu acesso não cobre esta consulta. Quem libera acesso é a diretoria: peça a liberação e, enquanto isso, pergunte a regra a quem já a consulta.",
    },
    {
      sintoma: "A janela mostra Seu usuário não tem permissão para editar as regras de benefício.",
      acao: "Você consegue ler e não gravar. Passe o texto a quem tem a permissão, ou peça a liberação à diretoria.",
    },
    {
      sintoma: "A janela mostra Não foi possível salvar as regras. Tente de novo.",
      acao: "Nada foi gravado. Tente salvar outra vez sem fechar a janela, para não perder o texto. Persistindo, copie o texto para outro lugar antes de fechar.",
    },
    {
      sintoma: "Apaguei o texto de um grupo e ele sumiu da consulta.",
      acao: "É o comportamento: campo vazio apaga a regra daquele grupo, e ele volta a aparecer como não informado. Reescreva o texto e salve de novo.",
    },
    {
      sintoma: "A linha da pessoa não tem o botão de lâmpada.",
      acao: "Aquela admissão está sem cliente, então não há regra de cliente a mostrar. Complete o cliente da admissão pela ficha e a lâmpada aparece.",
    },
    {
      sintoma: "Editei achando que ajustava uma pessoa só.",
      acao: "O aviso antes de salvar existe para isso. Ainda não tendo confirmado, use o Cancelar. Já tendo salvo, reescreva a regra do cliente como ela era: o que é de uma pessoa se ajusta no pacote dela, pelo lápis da linha.",
    },
  ],
  regras: [
    "A regra é do cliente, não da pessoa: todas as linhas do mesmo cliente abrem exatamente o mesmo conteúdo.",
    "Salvar alcança na hora todas as pessoas daquele cliente, inclusive as que já estão cadastradas.",
    "São sempre seis grupos, e o grupo sem regra escrita aparece como não informado.",
    "O salvamento manda a lista inteira: campo esvaziado apaga a regra daquele grupo.",
    "A janela nasce em modo de consulta. Editar é um passo deliberado, e o aviso de confirmação é obrigatório.",
    "A regra é texto de orientação para o time: ela não calcula valor e não altera o pacote de ninguém.",
  ],
  relacionados: [
    "montar-o-pacote-de-beneficios",
    "marcar-o-beneficio-como-calculado",
    "marcar-o-beneficio-como-cadastrado",
    "a-memoria-do-pacote-por-cliente-e-cargo",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/components/beneficios/RegrasClienteModal.tsx",
    "apps/frontend/src/app/(app)/beneficios/page.tsx",
    "apps/backend/src/beneficios/regras-beneficio.controller.ts",
    "apps/backend/src/domain/regras-beneficio.ts",
  ],
  revisadoEm: "2026-09-30",
};
