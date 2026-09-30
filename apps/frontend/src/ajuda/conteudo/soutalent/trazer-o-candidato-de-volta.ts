import type { Artigo } from "../../tipos";

/**
 * ─ TRAZER O CANDIDATO DE VOLTA: recomeçar um processo que já tinha sido encerrado ───────────────
 *
 * O QUE ESTA PEÇA COBRE: onde a ação aparece (só na linha de quem já recebeu desfecho), o escopo em
 * que essa linha mora, a vaga sugerida, e a CIÊNCIA que o sistema exige quando a pessoa já tinha um
 * processo encerrado naquela mesma vaga.
 *
 * ┌─ A CIÊNCIA NÃO É UM "CONFIRMAR MESMO ASSIM", e o texto precisa dizer isso ───────────────────┐
 * │ O sistema recusa a PRIMEIRA tentativa de propósito e devolve como o processo anterior          │
 * │ terminou, quando terminou e com qual motivo. É com esses três fatos na frente que a pessoa      │
 * │ decide, e é por isso que o artigo manda LER a ficha do processo anterior antes de clicar. Um    │
 * │ aviso lido no automático é o mesmo que aviso nenhum. O aceite fica registrado.                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA **NÃO** COBRE ────────────────────────────────────────────────────────────────────┐
 * │ CORRIGIR a vaga de quem está VIVO é "trocar-a-vaga-do-candidato", e os dois nunca aparecem na  │
 * │ mesma linha: aquele mantém a candidatura e a etapa, este cria candidatura nova. A reabertura da │
 * │ VAGA cancelada é outra peça ainda: lá quem volta, volta porque a vaga voltou, e a escolha é do  │
 * │ Master. ADICIONAR alguém sem processo anterior é o artigo de adicionar candidato à vaga.        │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA IMPRECISÃO DA TELA QUE O TEXTO NÃO REPETE ──────────────────────────────────────────────┐
 * │ A janela de ciência se chama "Reentrada Em Vaga Encerrada", e o que está encerrado é o         │
 * │ PROCESSO ANTERIOR da pessoa naquela vaga, não a vaga (que precisa estar ABERTA para receber    │
 * │ alguém). O artigo declara o rótulo como a tela o escreve, porque é por ele que se procura, e   │
 * │ EXPLICA o fato certo no texto, em vez de reproduzir a confusão.                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa aqui. O motivo e a data do encerramento anterior são do PROCESSO, e o
 * texto descreve os campos. NENHUM print é declarado: a captura da superfície de A&S está vetada
 * pela auditoria, e as listas de A&S estão vazias na homologação.
 */
export const artigo: Artigo = {
  slug: "trazer-o-candidato-de-volta",
  titulo: "Trazer O Candidato De Volta",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como recomeçar o processo de alguém que já tinha sido descartado ou tinha desistido, e o que o sistema pede quando a pessoa volta para a mesma vaga de antes.",
  termos: [
    "trazer de volta",
    "descartei sem querer",
    "reentrada",
    "candidato voltou",
    "chamar de novo o candidato",
    "recuperar candidato descartado",
    "reativar candidatura",
    "reaproveitar candidato",
    "candidato desistiu e voltou",
  ],
  preRequisitos: [
    "A candidatura anterior precisa estar encerrada: a ação não existe na linha de quem segue em processo.",
    "A vaga em que a pessoa vai entrar precisa estar aberta.",
  ],
  passos: [
    {
      gesto: "Na Central De Candidatos, troque o escopo para Histórico.",
      detalhe:
        "Quem recebeu desfecho sai da visão padrão e mora ali. É a causa número um de alguém concluir que a pessoa foi apagada.",
      controles: ["Histórico"],
    },
    {
      gesto: "Ache a linha da pessoa e confira a situação em que o processo terminou.",
      detalhe:
        "A coluna Situação mostra como aquele processo acabou, e a coluna Etapa passa a dizer Fora Do Funil: quem saiu não anda mais em etapa.",
    },
    {
      gesto: "Clique no ícone de desfazer da coluna Ações, com o rótulo Trazer de volta.",
      detalhe:
        "Ele aparece só na linha encerrada. Na linha viva, o que aparece no lugar é a troca de vaga, que é outra coisa.",
      controles: ["Trazer de volta"],
    },
    {
      gesto: "Confira o nome no campo Candidato, que já vem escolhido.",
      detalhe:
        "A pessoa veio da linha, então aqui não há o que escolher: o campo é só a confirmação de quem está voltando.",
      controles: ["Trazer De Volta", "Candidato"],
    },
    {
      gesto: "Escolha a Vaga.",
      detalhe:
        "A vaga do processo anterior já vem sugerida, e trocar é permitido: a pessoa pode voltar para outra vaga aberta. A lista traz só vaga aberta.",
      controles: ["Vaga", "Escolha a vaga aberta"],
    },
    {
      gesto: "Clique em Alocar em vaga.",
      detalhe:
        "Voltando para uma vaga diferente, a candidatura nova nasce na hora, na etapa inicial do funil.",
      controles: ["Alocar em vaga", "Candidatura"],
    },
    {
      gesto:
        "Voltando para a MESMA vaga de antes, leia a janela de ciência que o sistema abre.",
      detalhe:
        "Ela mostra o processo anterior em três campos: como terminou, quando foi encerrado e o motivo registrado. Motivo em branco aparece como não informado, e isso também é informação.",
      controles: [
        "Reentrada Em Vaga Encerrada",
        "O Processo Anterior",
        "Como terminou",
        "Encerrado em",
        "Motivo registrado",
      ],
    },
    {
      gesto: "Decida com os três fatos na frente e clique em Estou Ciente para seguir.",
      detalhe:
        "O processo anterior não é apagado nem reaproveitado: nasce uma candidatura nova na etapa inicial, e o histórico dos dois segue na ficha da pessoa. O seu aceite fica registrado.",
      controles: ["Estou Ciente"],
    },
    {
      gesto:
        "Volte o escopo para Em Andamento e confira a pessoa na fila, na etapa inicial do funil.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A ação de trazer de volta não aparece na linha.",
      acao: "Ela existe só na candidatura encerrada. Se a pessoa segue em processo, o que a linha oferece é mover de etapa e trocar de vaga. Confira também o escopo: a linha encerrada mora no Histórico.",
    },
    {
      sintoma: "A pessoa não aparece na lista, em nenhum escopo.",
      acao: "Confira a busca e a página: a lista tem corte, e o aviso do topo diz quantos de quantos você está vendo. Se a pessoa nunca foi cadastrada, o caminho é cadastrar um candidato novo.",
    },
    {
      sintoma: "O sistema recusou e abriu uma janela falando do processo anterior.",
      acao: "É o comportamento correto, e não é erro: a primeira tentativa é sempre recusada quando a pessoa já teve um processo encerrado naquela mesma vaga. Leia como terminou, quando e o motivo, e então clique em Estou Ciente, ou cancele.",
    },
    {
      sintoma: "A tela mostra Esta pessoa já está nesta vaga.",
      acao: "Aí não há o que confirmar: a pessoa tem processo aberto nessa vaga agora. Confira o escopo Em Andamento, porque a linha viva dela existe em algum lugar da fila.",
    },
    {
      sintoma: "A vaga que eu quero não está na lista.",
      acao: "Só vaga aberta recebe candidato. Se a vaga foi cancelada e você quer o processo inteiro de volta, o caminho é reabrir a vaga, que devolve as pessoas junto.",
    },
    {
      sintoma: "A tela recusa dizendo que a vaga não tem posição livre.",
      acao: "A vaga já entregou tudo o que tinha para entregar. Ajuste o número de posições dela por editar posições, ou escolha outra vaga aberta.",
    },
    {
      sintoma: "Eu queria a pessoa de volta na etapa em que ela estava.",
      acao: "Este caminho recomeça o processo, e a candidatura nova nasce na etapa inicial do funil. Volta para a etapa anterior só acontece na reabertura da vaga cancelada, quando o cancelamento registrou onde cada pessoa estava.",
    },
    {
      sintoma: "Trouxe a pessoa de volta e o processo antigo desapareceu da minha vista.",
      acao: "Ele não foi apagado. O processo encerrado continua no Histórico e na linha do tempo da ficha da pessoa, ao lado da candidatura nova.",
    },
  ],
  regras: [
    "Trazer de volta recomeça o processo: nasce uma candidatura nova na etapa inicial do funil, e o processo anterior fica intacto no histórico.",
    "A ação existe só na linha de quem recebeu desfecho, e a linha encerrada mora no escopo Histórico.",
    "A vaga do processo anterior vem sugerida, e trocar por outra vaga aberta é permitido.",
    "Voltar para a mesma vaga de antes exige ciência explícita: o sistema recusa a primeira tentativa e mostra como o processo anterior terminou, quando e com qual motivo.",
    "O aceite da reentrada fica registrado, com quem confirmou e quando.",
    "Pessoa com processo aberto na vaga não volta de novo para ela: não existem duas candidaturas vivas da mesma pessoa na mesma vaga.",
    "Só vaga aberta recebe candidato. Vaga fechada, cancelada ou em rascunho não aparece na lista.",
    "Quem ocupa posição só entra em vaga com posição livre.",
    "Quem teve os dados apagados pelo prazo de retenção não volta a um processo: aquela pessoa precisa ser cadastrada de novo.",
  ],
  relacionados: [
    "trocar-a-vaga-do-candidato",
    "registrar-a-saida-do-candidato",
    "adicionar-um-candidato-a-uma-vaga",
    "reabrir-a-vaga-cancelada",
    "ler-a-central-de-candidatos",
    "ler-a-ficha-do-candidato",
    "cadastrar-um-candidato-novo",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/ConfirmarReentradaModal.tsx",
    "apps/frontend/src/components/as/candidatos/AlocarCandidatoModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
