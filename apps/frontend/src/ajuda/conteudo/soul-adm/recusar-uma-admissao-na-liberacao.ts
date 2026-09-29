import type { Artigo } from "../../tipos";

/**
 * N1 DA LIBERAÇÃO, 2 de 3: RECUSAR, E O QUE ACONTECE DEPOIS.
 *
 * ┌─ O BOTÃO DE RECUSAR MORA ONDE NINGUÉM PROCURA, E É POR ISSO QUE O PASSO 1 EXISTE ────────────┐
 * │ Não há "recusar" na linha da tabela: ele está DENTRO da janela que se abre pelo "Liberar       │
 * │ Admissão". Quem quer recusar evita justamente esse botão, por achar que ele libera, e conclui  │
 * │ que a tela não tem como recusar. O caminho é abrir a liberação e recusar de lá.                │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ARTIGO É N1 MESMO SENDO AÇÃO DE MASTER, e a razão é o CONSULTOR ─────────────────────────┐
 * │ O consultor comum VÊ o botão, desabilitado, e precisa saber que aquilo não é defeito nem falta │
 * │ de permissão temporária: é desenho. E precisa saber a quem pedir. Esconder o assunto dos N1     │
 * │ deixaria de fora exatamente quem encontra o botão apagado no meio do trabalho.                 │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RECUSA NÃO APAGA NADA, e essa é a informação que mais tranquiliza quem vai clicar: a pessoa vai
 * para a aba Admissões Recusadas, com quem recusou e quando, e volta para a fila pelo Reativar.
 *
 * §A.6: nenhum dado de pessoa, só rótulos.
 */
export const artigo: Artigo = {
  slug: "recusar-uma-admissao-na-liberacao",
  titulo: "Recusar Uma Admissão Na Liberação",
  modulo: "SOUL_ADM",
  rotas: ["/liberacao"],
  menus: ["liberacao"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "liberacao",
  resumo:
    "Como recusar uma pré-admissão que não deve entrar na esteira, onde ela fica depois de recusada e como devolvê-la à fila. A recusa é ação de Master ou Super Admin e não apaga nada.",
  termos: [
    "recusar",
    "recusa",
    "rejeitar",
    "negar",
    "nao vai admitir",
    "cancelar pre admissao",
    "tirar da fila",
    "duplicata",
    "recusadas",
    "reativar",
    "voltar para a fila",
    "desfazer recusa",
    "quem recusou",
  ],
  preRequisitos: [
    "Ser Master ou Super Admin para concluir a recusa. O consultor comum enxerga o botão, mas ele fica desabilitado.",
    "Ter certeza de que aquela pessoa não deve entrar na esteira agora. Recusa é decisão de processo, e fica registrada com o nome de quem recusou.",
  ],
  passos: [
    {
      gesto: "Na aba Aguardando, ache a pessoa e clique em Liberar Admissão.",
      detalhe:
        "É pela mesma janela da liberação que se recusa: não existe botão de recusar na linha da tabela. Abrir a janela não libera ninguém.",
      controles: ["Aguardando", "Buscar por nome ou CPF", "Liberar Admissão"],
    },
    {
      gesto: "Confira no topo da janela que é a pessoa certa.",
      detalhe:
        "O nome e o CPF ficam no alto do painel. É a última conferência antes de uma ação que tira a pessoa da fila.",
      controles: ["Liberação Admissional"],
    },
    {
      gesto: "Clique em Recusar, no canto esquerdo do rodapé.",
      detalhe:
        "O botão é vermelho e fica separado dos demais de propósito. Estando desabilitado, o seu usuário não tem o papel: a própria tela explica isso ao passar o mouse.",
      controles: ["Recusar", "Cancelar"],
      print: {
        arquivo: "01-botao-recusar.png",
        legenda: "Passo 3: o rodapé da janela, com o Recusar separado do Liberar.",
      },
    },
    {
      gesto: "Leia a mensagem verde do topo da tela.",
      detalhe:
        "Ela confirma que a pessoa foi recusada e movida para Admissões Recusadas. A fila de aguardando e o aviso do menu caem na hora.",
      controles: ["Admissões Recusadas"],
    },
    {
      gesto: "Abra a aba Admissões Recusadas para conferir o registro.",
      detalhe:
        "A lista mostra candidato, CPF, telefone, quem recusou e quando. O botão Ver abre a janela com esse histórico.",
      controles: [
        "Admissões Recusadas",
        "Recusado por",
        "Recusado em",
        "Ver",
        "Admissão recusada",
      ],
      print: {
        arquivo: "02-aba-recusadas.png",
        legenda: "Passo 5: a aba Admissões Recusadas, com quem recusou e quando.",
      },
    },
    {
      gesto: "Para desfazer, clique em Reativar dentro da janela da recusada.",
      detalhe:
        "A pessoa volta para a aba Aguardando e pode ser liberada normalmente. Reativar também é ação de Master ou Super Admin.",
      controles: ["Reativar", "Fechar"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão Recusar está apagado.",
      acao: "Só Master ou Super Admin recusa, e a própria tela diz isso ao passar o mouse sobre o botão. Peça a recusa a quem tem o papel, dizendo o motivo.",
    },
    {
      sintoma: "Apareceu Erro ao recusar.",
      acao: "A gravação não voltou. Feche a janela, recarregue a página e confira em qual aba a pessoa está antes de tentar de novo.",
    },
    {
      sintoma: "A tela responde que esta admissão não está aguardando liberação.",
      acao: "Ela já saiu da fila enquanto a sua janela estava aberta, porque alguém liberou ou recusou antes. Recarregue e procure na aba Admissões Recusadas ou no Gerenciador.",
    },
    {
      sintoma: "Recusei a pessoa errada.",
      acao: "Nada foi apagado. Vá à aba Admissões Recusadas, abra pelo Ver e clique em Reativar: ela volta para a fila de aguardando no estado em que estava.",
    },
    {
      sintoma: "Reativei e a pessoa não apareceu na aba Aguardando.",
      acao: "A tela troca de aba sozinha ao reativar. Não estando lá, limpe a busca do topo, que continua filtrando as duas listas.",
    },
  ],
  regras: [
    "Recusar e reativar são ações de Master ou Super Admin. O consultor comum vê os botões desabilitados.",
    "A recusa acontece de dentro da janela de liberação: não existe botão de recusar na linha da tabela.",
    "Pessoa recusada sai da fila de aguardando e some do aviso do menu, mas não é apagada: ela fica na aba Admissões Recusadas, com quem recusou e quando.",
    "Recusar não cria frente nenhuma e não gera documento: aquela admissão nunca chegou a entrar na esteira.",
    "Reativar devolve a pessoa à fila de aguardando, e a liberação segue o caminho normal a partir dali.",
    "Duplicata é um dos motivos comuns de recusa: quando o aviso de CPF duplicado mostra que já existe admissão em andamento da mesma pessoa, recusar a nova é o desfecho correto.",
  ],
  relacionados: [
    "liberar-uma-admissao",
    "liberar-em-lote",
    "achar-uma-admissao-no-gerenciador",
    "abrir-e-fechar-uma-janela-do-sistema",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/liberacao/page.tsx",
    "apps/backend/src/admissoes/admissoes.service.ts",
    "apps/backend/src/admissoes/admissoes.controller.ts",
  ],
  revisadoEm: "2026-09-28",
};
