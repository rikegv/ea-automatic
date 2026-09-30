import type { Artigo } from "../../tipos";

/**
 * ─ TROCAR A VAGA DO CANDIDATO: corrigir a alocação sem recomeçar o processo ─────────────────────
 *
 * O QUE ESTA PEÇA COBRE: onde fica o gesto, quem pode usá-lo, o que acontece com a ETAPA, e as
 * recusas que a vaga de destino pode dar.
 *
 * ┌─ CORRIGIR NÃO É RECOMEÇAR, e é essa a confusão que o artigo existe para desfazer ────────────┐
 * │ Trocar a vaga conserta a MESMA candidatura, que só estava anotada no lugar errado, e por isso  │
 * │ MANTÉM A ETAPA: quem estava na entrevista do cliente continua lá, na vaga certa. Trazer de      │
 * │ volta é o caminho de quem RECOMEÇA um processo encerrado, e ele cria candidatura nova na etapa  │
 * │ inicial do funil. Os dois nunca aparecem na mesma linha: um só existe na candidatura viva, o    │
 * │ outro só na encerrada.                                                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA **NÃO** COBRE, E O RECORTE É EXPLÍCITO ───────────────────────────────────────────┐
 * │ ISTO NÃO É DESVÍNCULO. Tirar a pessoa da vaga sem pôr em outra é REGISTRAR A SAÍDA, que é      │
 * │ passo do artigo "mover-o-candidato-de-etapa": lá a candidatura é encerrada com motivo, e aqui  │
 * │ ela continua viva em outro lugar. Confundir os dois é a forma de alguém encerrar um processo    │
 * │ achando que estava corrigindo um endereço. Entra por `relacionados`.                           │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa aqui. A janela mostra nome na tela, e o texto descreve o CAMPO.
 *
 * ┌─ SEM PRINT, E O MOTIVO REAL NÃO É O QUE ESTAVA ESCRITO AQUI ─────────────────────────────────┐
 * │ O texto anterior dizia que a captura da superfície de A&S estava "vetada pela auditoria". Isso  │
 * │ caducou em 30/09/2026: o diretor destravou a semeadura de dado sintético, a base foi limpa e    │
 * │ semeada, e os outros artigos desta mesma tela ganharam imagem na mesma entrega.                 │
 * │                                                                                                │
 * │ O QUE IMPEDE ESTE AQUI É DE PAPEL: o ícone de trocar vaga só é desenhado na linha para MASTER   │
 * │ ou SUPER ADMIN, e a conta que tira os prints é COMUM. Não há alvo na tela para o motor          │
 * │ alcançar, e promover a conta seria a fábrica se conceder acesso, que é exatamente o que ela não │
 * │ faz. A decisão está com o diretor, e quando ela vier este artigo ganha imagem sem nenhuma       │
 * │ mudança de dado.                                                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "trocar-a-vaga-do-candidato",
  titulo: "Trocar A Vaga Do Candidato",
  modulo: "SOUTALENT",
  rotas: ["/as/candidatos"],
  menus: ["as-candidatos"],
  familia: "as-candidatos",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como mover uma candidatura para a vaga certa quando a pessoa foi alocada no lugar errado, mantendo a etapa e o histórico dela.",
  termos: [
    "troquei a vaga errada",
    "aloquei na vaga errada",
    "mudar candidato de vaga",
    "trocar vaga do candidato",
    "corrigir alocacao",
    "mover candidato para outra vaga",
    "candidato na vaga errada",
    "passar candidato para outra vaga",
  ],
  preRequisitos: [
    "A candidatura precisa estar viva. Quem já recebeu desfecho volta por outro caminho.",
    "Ter o papel de Master ou Super Admin: a ação não aparece para o consultor comum.",
    "A vaga de destino precisa estar aberta e, se a pessoa já ocupa posição, precisa ter posição livre.",
  ],
  passos: [
    {
      gesto: "Abra a Central De Candidatos e ache a candidatura que está na vaga errada.",
      detalhe:
        "A busca por nome e a coluna Vaga ajudam a confirmar que é a linha certa antes de mexer.",
    },
    {
      gesto: "Clique no ícone de troca da coluna Ações, com o rótulo Trocar vaga.",
      detalhe:
        "Ele só existe na candidatura viva e só para quem tem papel de Master. O sistema recusa a troca de quem chegar por fora da tela, mesmo assim.",
      controles: ["Trocar vaga"],
    },
    {
      gesto: "Leia o cabeçalho da janela antes de escolher.",
      detalhe:
        "Ele diz em qual vaga a pessoa está hoje e qual etapa vai ser mantida. A troca corrige a vaga desta mesma candidatura e não abre processo novo.",
      controles: ["Trocar Vaga", "Trocar a vaga da candidatura"],
    },
    {
      gesto: "Escolha a Vaga de destino.",
      detalhe:
        "A lista traz só vaga aberta, e a vaga atual não aparece nela. O seletor tem busca, e cada opção mostra o cliente embaixo do nome da vaga.",
      controles: ["Vaga de destino", "Escolha a vaga certa"],
    },
    {
      gesto: "Escreva o Motivo da troca.",
      detalhe:
        "O campo é opcional. A troca fica registrada na linha do tempo da ficha com quem fez e quando, mesmo sem motivo escrito, e o motivo é o que explica a correção para quem ler depois.",
      controles: ["Motivo"],
    },
    {
      gesto: "Clique em Trocar vaga para salvar.",
      detalhe: "A janela fecha e a fila recarrega.",
    },
    {
      gesto:
        "Confira a linha: a vaga, o cliente e o cargo mudaram, e a etapa continua a mesma de antes.",
      detalhe:
        "O histórico da candidatura segue inteiro, inclusive os contatos registrados antes da troca.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A ação Trocar vaga não aparece na linha.",
      acao: "Ela exige duas coisas: candidatura viva e papel de Master. Se a pessoa já recebeu desfecho, o caminho é trazer o candidato de volta, que abre processo novo. Se você não tem o papel, peça a correção a quem tem.",
    },
    {
      sintoma: "A vaga que eu quero não está na lista do seletor.",
      acao: "Só vaga aberta recebe candidato, então vaga fechada, cancelada ou em rascunho não aparece. A vaga atual também fica fora da lista de propósito: trocar para onde a pessoa já está não é troca.",
    },
    {
      sintoma:
        "A tela mostra Esta pessoa já está nesta vaga. Não dá para trocar para uma vaga em que ela já tem processo aberto.",
      acao: "A pessoa tem candidatura viva na vaga de destino, e a troca não junta dois processos. Decida qual dos dois segue: encerre um pelo registro de saída e mantenha o outro.",
    },
    {
      sintoma:
        "A tela mostra Esta vaga não recebe candidato: ela está encerrada. Escolha uma vaga aberta.",
      acao: "A vaga de destino foi fechada ou cancelada enquanto a janela estava aberta. Recarregue a página e escolha outra vaga.",
    },
    {
      sintoma:
        "A tela diz que a vaga de destino já tem as posições preenchidas e a troca deixaria a vaga acima do limite.",
      acao: "A pessoa ocupa posição na vaga de origem, então ela precisa de posição livre no destino. Ajuste o número de posições da vaga de destino por editar posições, ou escolha outra vaga.",
    },
    {
      sintoma:
        "A tela diz que a vaga de destino ainda não tem o número de posições definido.",
      acao: "Sem número de posições não há limite a respeitar, e o sistema não move para lá quem já está aprovado. Informe as posições da vaga de destino primeiro.",
    },
    {
      sintoma:
        "A tela mostra Esta candidatura já foi encerrada e não troca de vaga.",
      acao: "A candidatura recebeu desfecho enquanto você preenchia. Para trazer a pessoa de volta, use a ação da linha encerrada, que abre um processo novo.",
    },
    {
      sintoma: "A tela mostra Esta candidatura já está nesta vaga.",
      acao: "A vaga escolhida é a mesma em que a pessoa já está. Escolha outra, ou feche a janela: não há nada a corrigir.",
    },
    {
      sintoma: "A janela mostra Falha ao trocar a vaga desta candidatura.",
      acao: "A gravação não voltou. Tente de novo. Se repetir, recarregue a página e confira se a sua sessão continua aberta.",
    },
    {
      sintoma: "Eu queria só tirar a pessoa da vaga, sem pôr em outra.",
      acao: "Isso não é troca, é registrar a saída da candidatura, com motivo. O caminho está no artigo de mover o candidato de etapa.",
    },
  ],
  regras: [
    "A troca corrige a alocação e não recomeça o processo: a candidatura é a mesma, o histórico segue inteiro e a etapa não volta para o começo do funil.",
    "A etapa é mantida de propósito: quem estava na entrevista do cliente continua na entrevista do cliente, na vaga certa.",
    "Trocar é gesto de Master. O consultor comum não vê a ação, e o sistema recusa quem chegar por fora da tela.",
    "Só a candidatura viva é trocada. Quem já recebeu desfecho volta pelo caminho de trazer o candidato de volta, que cria processo novo.",
    "Só vaga aberta recebe candidato, e a vaga atual nunca é oferecida como destino.",
    "Quem já ocupa posição só é movido para uma vaga com posição livre.",
    "A pessoa não entra duas vezes na mesma vaga: havendo processo aberto no destino, a troca é recusada.",
    "Quem trocou, quando e o motivo ficam na linha do tempo da ficha da pessoa.",
    "Trocar não é desvincular: tirar a pessoa da vaga sem pôr em outra é registrar a saída.",
  ],
  relacionados: [
    "mover-o-candidato-de-etapa",
    "trazer-o-candidato-de-volta",
    "ler-a-central-de-candidatos",
    "ler-a-ficha-do-candidato",
    "adicionar-um-candidato-a-uma-vaga",
    "registrar-contato-com-o-candidato",
  ],
  fontes: [
    "apps/frontend/src/components/as/candidatos/TrocarVagaModal.tsx",
    "apps/frontend/src/app/(app)/as/candidatos/page.tsx",
    "apps/backend/src/as/candidatos/candidatos.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
