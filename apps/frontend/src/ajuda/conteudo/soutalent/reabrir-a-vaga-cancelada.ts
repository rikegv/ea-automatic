import type { Artigo } from "../../tipos";

/**
 * ─ REABRIR A VAGA CANCELADA: o único caminho que DESFAZ um encerramento ─────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: achar a vaga cancelada, o gate de Master, a escolha pessoa a pessoa, o que
 * a janela pode e o que ela NÃO pode prometer, e o que a vaga recebe de volta ao ser reaberta.
 *
 * ┌─ A REGRA QUE GOVERNA O TEXTO INTEIRO: NÃO PROMETER VOLTA EXATA ONDE O SISTEMA NÃO SABE ──────┐
 * │ A janela tem QUATRO frases de origem, não uma, e elas saem de uma régua com teste             │
 * │ (`lib/as-vaga-reabertura.ts`), justamente porque prometer demais é a única forma de aquela     │
 * │ tela errar. O artigo reproduz a distinção em vez de resumi-la: com o cancelamento carimbado, a │
 * │ pessoa volta para a situação em que estava; sem o carimbo, o sistema ADMITE que não sabe onde   │
 * │ ela estava nem se ela saiu por causa do cancelamento, e quem for marcado volta em seleção.     │
 * │ Um texto que dissesse só "cada um volta para onde estava" seria verdade num caso e mentira no  │
 * │ outro, e a pessoa só descobriria qual depois de reabrir.                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE ELA DELIBERADAMENTE **NÃO** COBRE ────────────────────────────────────────────────────┐
 * │ CANCELAR e FECHAR são os dois gestos que levam a vaga ao estado encerrado, e cada um é artigo │
 * │ próprio: aqui eles entram por `relacionados`. MOVER O STATUS não reabre nada (ele nem sai de   │
 * │ vaga encerrada) e também é artigo próprio. TRAZER O CANDIDATO DE VOLTA é o caminho da PESSOA,  │
 * │ fora de reabertura de vaga, e é outra peça: quem volta por aqui volta porque a VAGA voltou.    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum dado de pessoa aqui. A fila de reabertura lista gente por nome na tela, então o texto
 * descreve a LINHA e o que ela mostra (etapa, situação, motivo e data da saída), nunca um exemplo.
 * NENHUM print é declarado: a captura de toda a superfície de A&S está vetada pela auditoria, e esta
 * janela é uma das telas que o veto alcança por nome. O texto foi escrito para funcionar sem imagem.
 */
export const artigo: Artigo = {
  slug: "reabrir-a-vaga-cancelada",
  titulo: "Reabrir A Vaga Cancelada",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-vagas",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como trazer de volta ao trabalho uma vaga que foi cancelada, quem tem permissão para isso, e como escolher pessoa a pessoa quem volta para o processo.",
  termos: [
    "cancelei sem querer",
    "voltar vaga",
    "desfazer cancelamento",
    "reabrir vaga",
    "vaga cancelada por engano",
    "descancelar vaga",
    "restaurar candidatos da vaga",
    "trazer de volta quem estava na vaga",
    "vaga voltou",
  ],
  preRequisitos: [
    "A vaga precisa estar cancelada. Vaga fechada não é reaberta por aqui.",
    "Ter o papel de Master ou Super Admin. O consultor comum abre a janela, lê a explicação e não conclui a reabertura.",
  ],
  passos: [
    {
      gesto: "Encontre a vaga cancelada na lista da Central De Vagas.",
      detalhe:
        "O card Cancelada, no topo, também é filtro: clique nele para deixar na tabela só as vagas canceladas.",
      controles: ["Cancelada"],
    },
    {
      gesto: "Clique em Gestão Da Vaga, na linha da vaga.",
      detalhe: "Os gestos da vaga ficam na barra logo acima das abas do painel.",
      controles: ["Gestão Da Vaga"],
    },
    {
      gesto: "Clique em Reabrir vaga.",
      detalhe:
        "A janela abre carregando quem este cancelamento encerrou. Ela aparece para todo mundo de propósito: quem não tem o papel de Master lê ali mesmo que precisa pedir a reabertura, em vez de não encontrar a ação na tela.",
      controles: ["Reabrir vaga", "Reabrir Vaga É Ação De Master"],
    },
    {
      gesto: "Leia o aviso do topo da janela antes de marcar qualquer pessoa.",
      detalhe:
        "É ele que diz o que esta reabertura pode prometer. Quando o cancelamento registrou onde cada pessoa estava, quem for marcado volta exatamente para a situação em que estava. Quando o cancelamento é anterior a esse registro, o aviso fica amarelo e diz que o sistema não sabe onde cada pessoa estava nem se ela saiu por causa do cancelamento: ali quem for marcado volta em seleção, sem posição na vaga.",
      controles: ["Reabrir Vaga"],
    },
    {
      gesto: "Marque, uma a uma, as pessoas que voltam para o processo.",
      detalhe:
        "Não existe marcar todas: a escolha pessoa a pessoa é a trava. Cada linha mostra a etapa, a situação, e o motivo e a data da saída, que é o que separa quem saiu por causa do cancelamento de quem já havia sido descartado antes. Quem ficar desmarcado continua como está e o histórico dele não muda.",
    },
    {
      gesto: "Deixe de fora quem aparece com a tag Dado Expurgado.",
      detalhe:
        "Os dados dessa pessoa já foram apagados pelo prazo de retenção, então ela não volta a um processo. Ela aparece na lista só para você saber que estava na vaga.",
      controles: ["Dado Expurgado"],
    },
    {
      gesto: "Confira a frase ao lado do botão, que diz o que vai acontecer.",
      detalhe:
        "Sem ninguém marcado, ela diz que a vaga volta ao trabalho sem ninguém restaurado, e isso é um pedido legítimo: reabrir a vaga sem trazer gente é o caso normal quando o cancelamento não encerrou o processo de ninguém.",
    },
    {
      gesto: "Clique em Reabrir vaga para confirmar.",
      detalhe:
        "A vaga volta para o status de abertura e deixa de estar encerrada: a data de fechamento, a contagem congelada e os registros do cancelamento saem da linha. O fato não se perde, porque ele fica no histórico da vaga.",
    },
    {
      gesto: "Confira a linha na lista: a vaga saiu de Cancelada e voltou para o status de abertura.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "A janela diz que reabrir vaga é ação de Master.",
      acao: "Cancelar uma vaga é do consultor, desfazer o cancelamento não é. Peça a reabertura a quem tem o papel de Master. Nada foi enviado ao sistema: essa janela é só a explicação, e sai pelo Fechar.",
    },
    {
      sintoma: "A janela diz que este cancelamento não encerrou o processo de ninguém.",
      acao: "É o caso mais comum, e não é erro: ninguém estava em processo quando a vaga foi cancelada, então não há quem trazer de volta. Reabrir devolve a vaga ao trabalho, e ela volta sem ninguém restaurado. Para trazer alguém depois, use o caminho de trazer o candidato de volta, na Central De Candidatos.",
    },
    {
      sintoma:
        "O aviso está amarelo e diz que o cancelamento é anterior ao registro de origem.",
      acao: "Ali o sistema não sabe onde cada pessoa estava nem se ela saiu por causa do cancelamento, e por isso a decisão é sua, linha por linha. Confira o motivo e a data da saída de cada uma antes de marcar. Quem você marcar volta em seleção, sem posição na vaga.",
    },
    {
      sintoma: "A janela lista alguém que eu não quero de volta.",
      acao: "Deixe a linha desmarcada. A pessoa continua exatamente como está, o histórico dela não muda, e a reabertura da vaga acontece do mesmo jeito.",
    },
    {
      sintoma:
        "A tela recusa dizendo que uma das pessoas escolhidas já teve os dados expurgados por prazo de retenção.",
      acao: "Essa pessoa não volta a um processo, porque os dados dela foram apagados. Se ela ainda tiver interesse, cadastre a pessoa de novo na Central De Candidatos e aloque na vaga já reaberta.",
    },
    {
      sintoma:
        "A tela recusa dizendo que a mesma pessoa está na sua escolha duas vezes, em processos diferentes.",
      acao: "Quando o sistema não sabe a origem, a mesma pessoa pode aparecer em mais de uma linha encerrada da vaga. Escolha só uma delas e reabra; as outras continuam no histórico.",
    },
    {
      sintoma:
        "A tela recusa dizendo que há alguém na sua escolha que não saiu neste cancelamento, ou que alguém já está de volta.",
      acao: "A sua tela está com a fotografia velha, porque a vaga andou enquanto a janela estava aberta. Recarregue a página, abra a janela de novo e escolha outra vez.",
    },
    {
      sintoma:
        "A tela recusa dizendo que trazer essas pessoas de volta passaria do limite de posições.",
      acao: "Quem ocupava posição volta ocupando posição, e a vaga não cabe todos. Traga menos gente agora: com a vaga reaberta, as posições voltam a ser editáveis, e você traz o resto pelo caminho de trazer o candidato de volta.",
    },
    {
      sintoma:
        "A tela recusa dizendo que a vaga ainda não tem o número de posições definido.",
      acao: "Sem número de posições não há limite a respeitar, então o sistema não devolve quem ocupava posição. Reabra a vaga sem trazer essas pessoas, informe as posições com a vaga já viva, e traga cada uma depois.",
    },
    {
      sintoma: "A janela mostra Falha ao carregar quem este cancelamento encerrou.",
      acao: "A leitura não voltou. Feche pelo Cancelar, abra de novo e, se repetir, recarregue a página e confira se a sua sessão continua aberta.",
    },
    {
      sintoma: "A tela mostra Só uma vaga CANCELADA é reaberta por aqui. Recarregue a página.",
      acao: "A vaga deixou de estar cancelada enquanto a janela estava aberta. Recarregue a página e confira a pill de status da linha.",
    },
  ],
  regras: [
    "Reabrir é ação de Master: cancelar uma vaga é do consultor, desfazer o cancelamento não é.",
    "Só vaga cancelada é reaberta. Vaga fechada e vaga em rascunho não passam por este caminho.",
    "A escolha de quem volta é pessoa a pessoa, sempre. Não existe marcar todas, porque escolher é a decisão que o sistema não toma no seu lugar.",
    "Quando o cancelamento registrou onde cada pessoa estava, quem for marcado volta exatamente para a situação em que estava.",
    "Quando o cancelamento é anterior a esse registro, o sistema não sabe onde cada pessoa estava nem se ela saiu por causa do cancelamento, e quem for marcado volta em seleção, sem posição na vaga.",
    "Cancelamento que não encerrou o processo de ninguém não oferece ninguém: a vaga volta sozinha.",
    "Quem já teve os dados apagados pelo prazo de retenção aparece na lista marcado e não volta ao processo.",
    "Reabrir sem trazer ninguém é pedido legítimo, e é o caminho normal quando não há quem restaurar.",
    "A vaga reaberta perde a data de encerramento, a contagem congelada do fechamento e os registros do cancelamento. O fato fica no histórico da vaga.",
    "Quem escolheu, quando, e quantas pessoas voltaram ficam registrados no histórico da vaga. No caminho em que o sistema não sabe a origem, fica registrado também o aceite de quem tomou a decisão.",
    "A pessoa volta para a etapa em que estava. Se aquela etapa saiu de circulação, ela volta para a etapa inicial do funil, e o histórico diz isso.",
  ],
  relacionados: [
    "cancelar-a-vaga",
    "fechar-a-vaga",
    "mover-o-status-da-vaga",
    "abrir-o-painel-da-vaga",
    "ler-a-central-de-vagas",
    "trazer-o-candidato-de-volta",
  ],
  fontes: [
    "apps/frontend/src/components/as/vagas/ReabrirVagaModal.tsx",
    "apps/frontend/src/lib/as-vaga-reabertura.ts",
    "apps/frontend/src/app/(app)/as/vagas/page.tsx",
    "apps/backend/src/as/vagas/vagas.service.ts",
  ],
  revisadoEm: "2026-09-30",
};
