import type { Artigo } from "../../tipos";

/**
 * N1 DO ASSINANTE DA EMPRESA: quem assina o contrato pelo lado da empresa.
 *
 * ┌─ O QUE ESTA PEÇA COBRE, E ONDE ELA PARA ────────────────────────────────────────────────────┐
 * │ Ela cobre o cadastro do GRUPO: criar o grupo padrão e o grupo de um cliente, o que a posição     │
 * │ significa (mesma posição assina junto, posição seguinte espera a anterior), tirar uma pessoa do │
 * │ grupo, remover o grupo inteiro, e a consequência de não existir grupo padrão.                   │
 * │                                                                                                 │
 * │ O que ela deliberadamente NÃO cobre:                                                            │
 * │   . DISPARAR o pedido de assinatura, que é a tela de gestão das assinaturas e artigo de lá.     │
 * │     Esta tela é cadastro: ela decide QUEM assina, nunca QUANDO o pedido sai;                    │
 * │   . gerar ou anexar o kit, que é a tela do Gerador De Kit.                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A POSIÇÃO É O CORAÇÃO DO ARTIGO ──────────────────────────────────────────────────┐
 * │ O erro que a tela mais recebe não é de digitação, é de expectativa: duas pessoas cadastradas em │
 * │ posições diferentes fazem a segunda esperar a primeira, e quem queria as duas assinando ao      │
 * │ mesmo tempo acha que o sistema travou. Então o artigo explica a posição antes de ensinar a      │
 * │ salvar, que é a ordem em que a dúvida aparece.                                                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, PENDÊNCIA CONHECIDA E NÃO ESQUECIMENTO: esta tela guarda nome, e-mail e documento de
 * pessoas, e a captura de tela com pessoa está vetada enquanto a homologação não tiver arnês de dado
 * sintético. O texto foi escrito para funcionar lido.
 *
 * §A.6: nenhum nome, e-mail ou documento de ninguém entra neste texto, nem como exemplo. O que se
 * descreve é o CAMPO. §A.11: nenhum travessão. §A.24: title case em título e etiqueta.
 */
export const artigo: Artigo = {
  slug: "montar-o-grupo-de-assinatura-da-empresa",
  titulo: "Montar O Grupo De Assinatura Da Empresa",
  modulo: "SOUL_ADM",
  rotas: ["/admin/assinante-empresa"],
  menus: ["assinante-empresa"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "assinante-empresa",
  resumo:
    "Como cadastrar quem assina o contrato pela empresa: o grupo padrão, o grupo próprio de um cliente, a ordem em que as pessoas assinam, e como remover uma pessoa ou o grupo inteiro.",
  termos: [
    "quem assina pela empresa",
    "assinante da empresa",
    "representante da empresa",
    "cadastrar quem assina",
    "grupo de assinatura",
    "ordem de assinatura",
    "assinar em conjunto",
    "assinar junto",
    "duas pessoas assinam",
    "sem grupo padrao",
    "contrato nao dispara",
  ],
  preRequisitos: [
    "Saber se aquele grupo vale para todos os contratos ou só para um cliente.",
    "Saber em que ordem as pessoas assinam, e quais delas assinam ao mesmo tempo.",
  ],
  passos: [
    {
      gesto: "Abra o Assinante Da Empresa pelo menu da lateral esquerda.",
      detalhe:
        "A tabela lista um grupo por linha. Aplica-se A mostra a etiqueta Padrão ou o cliente; Pessoas traz quantas assinam; Ordem De Assinatura resume a sequência, marcando quem assina junto.",
      controles: [
        "Assinante Da Empresa",
        "Aplica-se A",
        "Pessoas",
        "Ordem De Assinatura",
        "Ações",
        "Padrão",
      ],
    },
    {
      gesto: "Clique em Adicionar Grupo De Assinatura.",
      detalhe:
        "A janela abre com uma pessoa em branco na primeira posição. Ela não fecha ao clicar fora: sai pelo Cancelar ou pelo Salvar grupo.",
      controles: ["Adicionar Grupo De Assinatura", "Novo Grupo De Assinatura"],
    },
    {
      gesto: "Em Aplica-se a, escolha o cliente ou deixe como Padrão, todos os contratos.",
      detalhe:
        "O padrão vale para todo cliente que não tenha grupo próprio. O grupo de um cliente vale só para ele e passa na frente do padrão. O campo tem busca, então dá para digitar o código ou o nome da operação.",
      controles: ["Aplica-se a", "Padrão, todos os contratos"],
    },
    {
      gesto: "Preencha, na Posição 1, o nome, o e-mail e o documento de quem assina.",
      detalhe:
        "O nome precisa ter nome e sobrenome, só letras. O e-mail é por onde a pessoa vai ser chamada para assinar, então ele tem de estar certo. O documento é obrigatório.",
      controles: [
        "Posição",
        "Nome do representante",
        "E-mail do representante",
        "CPF do representante",
      ],
    },
    {
      gesto:
        "Para duas pessoas assinando ao mesmo tempo, clique em Adicionar pessoa nesta posição.",
      detalhe:
        "Pessoas na mesma posição assinam juntas, e o bloco passa a avisar que elas assinam juntos. Qualquer uma pode assinar primeiro: o sistema não faz uma esperar a outra.",
      controles: ["Adicionar pessoa nesta posição"],
    },
    {
      gesto:
        "Para alguém que só assina depois, clique em Adicionar pessoa em nova posição.",
      detalhe:
        "Nasce a Posição seguinte, com o aviso de que ela só assina depois da anterior. Quem está nela só é chamado quando a posição de cima terminar. O campo numérico ao lado de cada pessoa também muda a posição dela.",
      controles: ["Adicionar pessoa em nova posição", "Posição de assinatura"],
    },
    {
      gesto: "Clique em Salvar grupo.",
      detalhe:
        "O grupo entra inteiro ou não entra: se algum dado estiver errado, nada é gravado e a mensagem diz de qual pessoa é o problema. A confirmação verde diz com quantas pessoas o grupo ficou.",
      controles: ["Salvar grupo", "Cancelar"],
    },
    {
      gesto: "Para mexer num grupo existente, use o lápis na coluna Ações.",
      detalhe:
        "A edição abre o grupo inteiro. O cliente não muda na edição: para mover o grupo, remova e crie outro. Ao editar alguém já gravado, deixe o documento em branco para manter o que está guardado, ou digite para substituir.",
      controles: ["Editar o grupo de assinatura", "Editar Grupo De Assinatura"],
    },
    {
      gesto: "Para tirar uma pessoa do grupo, use a lixeira ao lado dela e salve.",
      detalhe:
        "Quem sai da lista deixa de assinar por aquele cliente na próxima vez. Quem fica mantém a posição que estiver na tela, então confira a sequência antes de salvar.",
      controles: ["Remover esta pessoa do grupo", "Salvar grupo"],
    },
    {
      gesto: "Para apagar o grupo inteiro, use a lixeira na coluna Ações da tabela.",
      detalhe:
        "A janela de confirmação avisa a consequência: grupo de cliente removido faz aquele cliente voltar a usar o padrão, e grupo padrão removido deixa sem assinatura da empresa todo cliente que não tenha o seu.",
      controles: ["Remover o grupo inteiro", "Remover O Grupo?", "Remover grupo", "Voltar"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema responde Informe nome e sobrenome do representante, apenas letras. A Clicksign recusa nome com número ou com uma palavra só.",
      acao: "Escreva o nome completo, sem número, sem sigla de cargo e sem abreviação de uma palavra só. A mensagem começa dizendo de qual pessoa do grupo é o problema.",
    },
    {
      sintoma: "O sistema responde E-mail do representante inválido.",
      acao: "Confira o e-mail daquela pessoa: é por ele que a assinatura é pedida. Espaço sobrando ou endereço incompleto é a causa mais comum.",
    },
    {
      sintoma:
        "O sistema responde CPF do representante inválido. O CPF é obrigatório e precisa ter dígito verificador válido.",
      acao: "O documento é obrigatório e é conferido na hora de salvar. Digite o número completo. Numa pessoa já gravada, deixar o campo em branco mantém o que estava guardado.",
    },
    {
      sintoma: "O sistema responde A ordem de assinatura precisa ser 1 ou maior.",
      acao: "A posição começa em 1. Corrija o número ao lado daquela pessoa e salve de novo.",
    },
    {
      sintoma: "O sistema avisa que o cliente não existe no catálogo.",
      acao: "Aquele cliente não está cadastrado, ou saiu do catálogo depois que a janela foi aberta. Feche, recarregue a página e escolha o cliente na lista.",
    },
    {
      sintoma: "O sistema avisa que a pessoa está repetida neste conjunto.",
      acao: "Cada pessoa entra uma vez só no mesmo grupo, mesmo em posições diferentes. Remova a linha duplicada e salve.",
    },
    {
      sintoma: "Cadastrei duas pessoas e só uma foi chamada para assinar.",
      acao: "Elas estão em posições diferentes, então a segunda só é chamada quando a primeira terminar. Para as duas ao mesmo tempo, coloque as duas na mesma posição.",
    },
    {
      sintoma: "A tabela mostra Nenhum grupo de assinatura cadastrado.",
      acao: "Não há nem grupo padrão nem grupo de cliente, então nenhum contrato tem quem assine pela empresa. Comece cadastrando o grupo padrão.",
    },
  ],
  regras: [
    "O grupo padrão vale para todo cliente que não tenha grupo próprio, e o grupo do cliente passa na frente do padrão.",
    "Pessoas na mesma posição assinam juntas, em qualquer ordem entre elas. Posições diferentes viram sequência, e a seguinte só é chamada quando a anterior terminar.",
    "O candidato assina antes das pessoas cadastradas aqui: a posição 1 é a primeira da empresa, não a primeira do contrato.",
    "Nome com nome e sobrenome, e-mail válido e documento são obrigatórios, e o grupo é gravado inteiro ou não é gravado.",
    "A mesma pessoa entra uma vez só no mesmo grupo.",
    "Sem grupo padrão, cliente que não tenha grupo próprio não tem quem assine pela empresa e o contrato dele não sai.",
    "O cliente de um grupo não muda na edição: para mover, remova o grupo e crie outro.",
  ],
  relacionados: [
    "enviar-o-kit-para-assinatura",
    "ler-a-gestao-das-assinaturas",
    "disparar-a-assinatura-de-um-candidato",
    "ordenar-a-lista-pelo-cabecalho",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/admin/assinante-empresa/page.tsx",
    "apps/backend/src/admin/assinante-empresa/assinante-empresa.controller.ts",
    "apps/backend/src/clicksign/assinante-empresa.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
