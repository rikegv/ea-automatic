import type { Artigo } from "../../tipos";

/*
 * O QUE ESTA PEÇA COBRE: a fila que aparece quando o fechamento é recusado por haver gente em
 * seleção, os quatro desfechos possíveis linha por linha, o motivo que cada um pede, e o caso da
 * vaga que já está cheia, que tem nesta tela uma frase própria, diferente da que o resto do sistema
 * mostra.
 *
 * O QUE ELA DELIBERADAMENTE NAO COBRE:
 *   . O FECHAMENTO em si, com os seus campos e a recusa por posição oficial aberta: é a peça
 *     "fechar-a-vaga", e esta começa depois que aquele botão foi clicado.
 *   . A DECISÃO DE CADA PESSOA no fluxo normal do funil, que tem artigo próprio por gesto. Aqui a
 *     mesma decisão é ensinada no contexto do encerramento, que é onde o sistema a cobra de todos
 *     de uma vez.
 */
export const artigo: Artigo = {
  slug: "tratar-os-candidatos-pendentes-antes-de-fechar",
  titulo: "Tratar Os Candidatos Pendentes Antes De Fechar",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "as-vagas",
  resumo:
    "O que fazer quando a vaga não fecha porque ainda tem gente em seleção: tratar cada pessoa na própria fila, sem sair da tela, e encerrar a vaga em seguida.",
  termos: [
    "candidatos pendentes",
    "vaga nao fecha",
    "gente em selecao",
    "tem candidato pendurado",
    "nao consigo encerrar a vaga",
    "resolver candidatos para fechar",
    "dar resposta ao candidato",
    "tratar pendentes",
  ],
  preRequisitos: [
    "Você já precisa ter tentado fechar a vaga: esta fila é a resposta do sistema a essa tentativa.",
  ],
  passos: [
    {
      gesto: "Leia a fila que abriu, com quem ainda está em seleção nesta vaga.",
      detalhe:
        "A ordem é da etapa mais avançada para a mais inicial: quem está mais perto do fim é o mais caro de esquecer.",
      controles: ["Candidatos Pendentes"],
    },
    {
      gesto: "Escolha o desfecho da primeira pessoa da lista.",
      detalhe:
        "Aprovar só anda o funil e grava na hora. Contratar, Descartar e Desistiu são desfechos de saída e abrem o campo do motivo.",
      controles: ["Aprovar", "Contratar", "Descartar", "Desistiu"],
    },
    {
      gesto: "Preencha o motivo do desfecho.",
      detalhe:
        "No descarte o motivo vem da lista do catálogo; na desistência e na contratação é texto seu, com pelo menos dois caracteres.",
    },
    {
      gesto: "Confirme o registro daquela pessoa.",
      detalhe: "A linha sai da fila na hora, e a contagem do cabeçalho diminui.",
      controles: [
        "Registrar descarte",
        "Registrar desistência",
        "Registrar contratação",
      ],
    },
    {
      gesto: "Repita até a fila zerar.",
      detalhe: "Com a fila vazia, o cabeçalho passa a dizer que a vaga já pode ser encerrada.",
    },
    {
      gesto: "Clique em Fechar a vaga.",
      detalhe:
        "O sistema reenvia o mesmo fechamento que você já havia preenchido, sem pedir os campos de novo.",
      controles: ["Fechar a vaga", "Cancelar"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "A tela mostra A vaga já está com todas as posições preenchidas. Para encerrar, registre este candidato como Descartado ou Desistiu.",
      acao: "Aprovar e Contratar consomem posição, e não há posição livre. Registre esta pessoa como Descartado ou Desistiu, que são os dois caminhos que nunca esbarram na vaga cheia. Estando a meta errada, saia daqui e corrija as posições da vaga antes de encerrar.",
    },
    {
      sintoma:
        "A tela mostra que a vaga ainda tem candidatos em seleção e pede para tratar cada um antes de encerrar a vaga.",
      acao: "É esta fila. Trate cada linha aqui mesmo: quem foi entrevistado e nunca soube do resultado sumiria junto com a vaga, e é isso que a trava evita.",
    },
    {
      sintoma: "O botão de fechar a vaga está cinza.",
      acao: "Ainda há gente na fila. Trate todos os candidatos para encerrar a vaga: o botão só libera com a lista zerada.",
    },
    {
      sintoma: "O botão de confirmar o desfecho está cinza.",
      acao: "Falta o motivo. Escolha um motivo da lista, no descarte, ou escreva pelo menos dois caracteres, nos outros dois desfechos.",
    },
    {
      sintoma: "O motivo que eu queria usar não está no seletor do descarte.",
      acao: "Esta tela não oferece os motivos que pedem a pretensão salarial, porque esse valor é de cada pessoa e aqui não há onde informá-lo. Para usar um desses, registre o descarte pela ficha do candidato.",
    },
    {
      sintoma: "Saí da fila por engano e achei que tinha perdido o preenchimento do fechamento.",
      acao: "Não perdeu. Saindo pelo Cancelar, o formulário de fechamento volta como estava, com o que você já havia digitado.",
    },
  ],
  regras: [
    "A vaga não fecha com gente em seleção dentro: cada pessoa recebe um desfecho antes do encerramento.",
    "A ordem da fila vai da etapa mais avançada para a mais inicial.",
    "Aprovar e Contratar consomem posição da vaga; Descartar e Desistiu nunca esbarram na vaga cheia.",
    "O motivo é obrigatório nos três desfechos de saída, e fica gravado no histórico da pessoa.",
    "A fila é o estado real: cada linha tratada sai dela na hora, e ela não precisa ser reaberta para acompanhar o trabalho.",
  ],
  relacionados: [
    "fechar-a-vaga",
    "registrar-a-saida-do-candidato",
    "enviar-o-candidato-para-a-admissao",
    "mover-o-candidato-de-etapa",
    "finalizar-a-posicao-da-vaga",
    "ler-a-ficha-do-candidato",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/CandidatosPendentesModal.tsx",
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
