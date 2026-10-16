import type { Artigo } from "../../tipos";

/**
 * ─ REABRIR A VAGA CANCELADA: o único caminho que DESFAZ um encerramento ─────────────────────────
 *
 * O QUE ESTA PEÇA COBRE: achar a vaga, os três pontos de partida (cancelada, entregue e fechada), a
 * escolha pessoa a pessoa no caminho da cancelada, o que a janela pode e o que ela NÃO pode prometer,
 * e o que a vaga recebe de volta ao ser reaberta. Reabrir é de consultor pra cima, igual a fechar e
 * cancelar (16/10): não há mais gate de Master.
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
/**
 * ─ ESTE ARTIGO ESTÁ EM TRANSIÇÃO: o slug e os sinônimos JÁ foram trocados, o CORPO ainda NÃO ────
 *
 * ┌─ POR QUE O NOME MUDOU, e por que ele mudou ANTES do texto ──────────────────────────────────┐
 * │ Ele nasceu como "Reabrir A Vaga Cancelada", e o gatilho era um só. O diretor ALARGOU: a vaga  │
 * │ passa a reabrir também de ENTREGUE, e esse é o caso que ele quer atender de verdade, a vaga    │
 * │ que foi entregue e voltou porque o cliente reprovou o candidato. A reabertura de cancelada     │
 * │ continua existindo, intacta. São DOIS pontos de partida para o mesmo gesto.                    │
 * │                                                                                                │
 * │ O NOME FOI TROCADO PRIMEIRO DE PROPÓSITO. Renomear arquivo, slug e sinônimos custa pouco       │
 * │ enquanto o texto não foi escrito em volta do nome velho, e custa duas reescritas depois.       │
 * │                                                                                                │
 * │ E HÁ UM EFEITO DE BUSCA QUE SOZINHO JÁ JUSTIFICARIA: quem tem o problema real procura por      │
 * │ "cliente reprovou", "reabrir vaga entregue" ou "refazer triagem", e NUNCA por "vaga cancelada".│
 * │ Com o slug antigo, a pessoa com o caso mais comum não achava o artigo. Os sinônimos novos já    │
 * │ estão em `termos`, então a busca acha a peça antes mesmo de o corpo estar completo.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE JÁ É CERTO, por decisão do diretor, e vai para o corpo sem depender de implementação ─┐
 * │   . a vaga reaberta volta para ABERTA, não continua entregue;                                 │
 * │   . os candidatos voltam para TRIAGEM, porque o time refaz a triagem;                          │
 * │   . a reabertura pede uma PREVISÃO DE ENTREGA NOVA, e o prazo passa a contar até ela.          │
 * │                                                                                                │
 * │ UMA RESSALVA MEDIDA, para o texto não inventar regra: devolver os candidatos para triagem já   │
 * │ devolve a vaga para aberta SOZINHO, pela régua que já está no ar (triagem não é etapa de       │
 * │ entrega ao cliente). Não é comportamento novo, e descrever como novidade o que já existia faz  │
 * │ o leitor procurar um botão que nunca houve.                                                    │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FALTA, e por que o corpo NÃO foi escrito ainda ──────────────────────────────────────┐
 * │ Duas coisas dependem do código da frente vizinha e serão pedidas a ela ANTES de escrever, em   │
 * │ vez de parafraseadas: o RÓTULO EXATO do campo de previsão nova, e se o aceite de reabertura    │
 * │ continua como está hoje. Passo escrito contra paráfrase é passo que manda clicar num botão com │
 * │ o nome errado.                                                                                 │
 * │                                                                                                │
 * │ ENTÃO O CORPO ABAIXO AINDA DESCREVE SÓ O CAMINHO DA VAGA CANCELADA, que continua verdadeiro e  │
 * │ continua no ar. Ele não mente: ele está incompleto, e a incompletude está declarada aqui.      │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const artigo: Artigo = {
  slug: "reabrir-uma-vaga",
  titulo: "Reabrir Uma Vaga",
  modulo: "SOUTALENT",
  rotas: ["/as/vagas"],
  menus: ["as-vagas"],
  familia: "as-vagas",
  publico: "AMBOS",
  nivel: "N2",
  resumo:
    "Como trazer uma vaga de volta ao trabalho, pelos três caminhos que levam a isso: a que foi cancelada, a que já tinha sido entregue e voltou porque o cliente reprovou, e a que foi fechada. Quem pode, o que o sistema pede, e como escolher pessoa a pessoa quem volta para o processo.",
  termos: [
    "cliente reprovou",
    "cliente reprovou o candidato",
    "reabrir vaga entregue",
    "reabrir vaga fechada",
    "refazer triagem",
    "a vaga voltou do cliente",
    "cancelei sem querer",
    "fechei sem querer",
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
    "A vaga precisa estar CANCELADA, ENTREGUE ou FECHADA. São os três pontos de partida, e o que acontece depois é diferente em cada um.",
    "Vindo de uma vaga entregue, ter em mãos a data nova de entrega combinada: o sistema não conclui sem ela. Vindo de uma vaga cancelada ou fechada, não há data nova a informar.",
  ],
  passos: [
    {
      gesto: "Saiba de qual dos três casos você está vindo, porque o caminho muda.",
      detalhe:
        "Vaga CANCELADA é o cancelamento que se desfaz, e nela você escolhe pessoa a pessoa quem volta. Vaga ENTREGUE é a que voltou do cliente, em geral porque ele reprovou o candidato, e nela VOLTAM TODAS as pessoas que estavam com o cliente, sem escolha, e o sistema pede uma data nova de entrega. Vaga FECHADA é o caso mais simples: ela volta para Aberta com os candidatos e o histórico preservados, sem escolha pessoa a pessoa e sem data nova. O resto desta página está na ordem: primeiro o que vale para os três, depois o que muda em cada um.",
    },
    {
      gesto: "Encontre a vaga na lista da Central De Vagas.",
      detalhe:
        "Os cards do topo são filtro: clique em Cancelada, em Entregue ou em Fechada para deixar na tabela só as vagas daquele estado.",
      controles: ["Cancelada", "Entregue", "Fechada"],
    },
    {
      gesto: "Clique em Gestão Da Vaga, na linha da vaga.",
      detalhe: "Os gestos da vaga ficam na barra logo acima das abas do painel.",
      controles: ["Gestão Da Vaga"],
    },
    {
      gesto: "Clique em Reabrir vaga.",
      detalhe:
        "A ação está disponível para quem trabalha a Central De Vagas, de consultor pra cima, igual a fechar e a cancelar. A janela abre e mostra o que vai acontecer antes de você confirmar, e o que ela pede muda conforme a vaga estava cancelada, entregue ou fechada.",
      controles: ["Reabrir vaga"],
    },
    {
      gesto: "Vindo de uma vaga CANCELADA, leia o aviso do topo antes de marcar qualquer pessoa.",
      detalhe:
        "É ele que diz o que esta reabertura pode prometer. Quando o cancelamento registrou onde cada pessoa estava, quem for marcado volta exatamente para a situação em que estava. Quando o cancelamento é anterior a esse registro, o aviso fica amarelo e diz que o sistema não sabe onde cada pessoa estava nem se ela saiu por causa do cancelamento: ali quem for marcado volta em seleção, sem posição na vaga.",
      controles: ["Reabrir Vaga"],
    },
    {
      gesto: "Ainda na vaga cancelada, marque uma a uma as pessoas que voltam para o processo.",
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
      gesto:
        "Vindo de uma vaga ENTREGUE, informe a Previsão de entrega nova. Ela é obrigatória.",
      detalhe:
        "O campo nasce vazio e o botão de confirmar fica desligado enquanto ele não for preenchido, com a frase dizendo o que falta. É a partir dessa data que o prazo volta a contar. Na vaga cancelada este campo não aparece, e aquele caminho continua como sempre foi.",
      controles: ["Previsão de entrega nova"],
    },
    {
      gesto:
        "Confira quem volta: na vaga entregue, voltam TODAS as pessoas que estavam com o cliente, e não há o que marcar.",
      detalhe:
        "Não é limitação de tela, é o que mantém a vaga honesta: se sobrasse uma pessoa com o cliente, o sistema continuaria entendendo a vaga como entregue, e a reabertura ficaria registrada como uma coisa que não aconteceu. Elas voltam para o começo do funil, que hoje é a Triagem, porque a ideia é justamente refazer a triagem.",
    },
    {
      gesto: "Vindo de uma vaga FECHADA, confira a explicação e confirme: é o caminho mais simples.",
      detalhe:
        "Fechar uma vaga não descarta ninguém, então aqui não há lista para marcar nem data nova a informar. A janela só diz que a vaga volta para Aberta, com os candidatos e o histórico preservados exatamente como estão. É só confirmar.",
    },
    {
      gesto: "Clique em Reabrir vaga para confirmar.",
      detalhe:
        "A vaga volta para o status de abertura e deixa de estar encerrada. Vindo do cancelamento, a data de fechamento, a contagem congelada e os registros do cancelamento saem da linha. Vindo da entrega, o prazo volta a contar até a data nova que você informou. Vindo do fechamento, a vaga volta para Aberta e os candidatos e o histórico seguem como estavam. Nos três casos o fato não se perde: ele fica no histórico da vaga.",
    },
    {
      gesto: "Confira a linha na lista: a vaga saiu de Cancelada, de Entregue ou de Fechada e voltou para o status de abertura.",
    },
  ],
  seDerErrado: [
    {
      sintoma: "O botão de confirmar está desligado e você não vê por quê.",
      acao: "Vindo de uma vaga entregue, é a Previsão de entrega nova que falta: ela é obrigatória e o campo nasce vazio. A frase ao lado do botão diz o que está faltando. Vindo de uma vaga cancelada, esse campo nem existe, então o motivo é outro.",
    },
    {
      sintoma: "O sistema recusou a reabertura da vaga entregue dizendo que a lista está incompleta.",
      acao: "Na vaga entregue voltam TODAS as pessoas que estavam com o cliente, e o sistema recusa uma lista parcial em vez de completar por conta própria. Recarregue a página e repita: se sobrasse alguém com o cliente, a vaga continuaria valendo como entregue e a reabertura ficaria registrada como uma coisa que não aconteceu.",
    },
    {
      sintoma: "A reabertura recusa dizendo que não há etapa de destino.",
      acao: "Alguém inativou no catálogo a etapa marcada como começo do funil e não marcou outra no lugar, então a reabertura não tem para onde mandar as pessoas. Quem resolve é a diretoria, no catálogo de etapas do funil: marcar uma etapa ativa como o começo. Enquanto isso não for feito, nenhuma vaga reabre, e o problema não está na vaga.",
    },
    {
      sintoma: "As pessoas voltaram numa etapa diferente da que você esperava.",
      acao: "Elas voltam para a etapa marcada no catálogo como o começo do funil, que hoje é a Triagem. Se a diretoria mudar essa marcação no catálogo de etapas, o destino muda junto, e a tela passa a dizer o nome novo.",
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
      sintoma: "A tela recusa a reabertura dizendo que a vaga não está mais num estado reabrível. Recarregue a página.",
      acao: "A vaga deixou de estar cancelada, entregue ou fechada enquanto a janela estava aberta. Recarregue a página e confira a pill de status da linha.",
    },
  ],
  regras: [
    "A reabertura tem TRÊS pontos de partida, e eles não se comportam igual: na vaga cancelada você escolhe quem volta, na vaga entregue voltam todos os que estavam com o cliente sem escolha, e na vaga fechada a vaga volta para Aberta com os candidatos e o histórico preservados, sem escolha e sem prazo novo.",
    "Na vaga entregue, a previsão de entrega nova é obrigatória, e é dela que o prazo passa a contar.",
    "Quem volta vai para a etapa marcada como começo do funil no catálogo, que HOJE é a Triagem. O destino é configurável pela diretoria, então confira a tela em vez de decorar o nome.",
    "Vaga entregue não fica com o prazo correndo enquanto espera o cliente: a coluna de prazo mostra que ela está entregue, em vez de vencer sozinha.",
    "Reabrir é ação de quem trabalha a Central De Vagas, de consultor pra cima, igual a fechar e a cancelar.",
    "Reabrem a vaga cancelada, a entregue e a fechada. A vaga em rascunho não passa por este caminho: ela é publicada pela trilha de abertura.",
    "A escolha de quem volta é pessoa a pessoa, sempre. Não existe marcar todas, porque escolher é a decisão que o sistema não toma no seu lugar.",
    "Quando o cancelamento registrou onde cada pessoa estava, quem for marcado volta exatamente para a situação em que estava.",
    "Quando o cancelamento é anterior a esse registro, o sistema não sabe onde cada pessoa estava nem se ela saiu por causa do cancelamento, e quem for marcado volta em seleção, sem posição na vaga.",
    "Cancelamento que não encerrou o processo de ninguém não oferece ninguém: a vaga volta sozinha.",
    "Quem já teve os dados apagados pelo prazo de retenção aparece na lista marcado e não volta ao processo.",
    "Reabrir sem trazer ninguém é pedido legítimo, e é o caminho normal quando não há quem restaurar.",
    "Vaga fechada reaberta não escolhe pessoa a pessoa e não pede prazo novo: fechar não descartou ninguém, então os candidatos e o histórico seguem como estão e a vaga volta para Aberta. É o caminho mais simples dos três.",
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
  revisadoEm: "2026-10-16",
};
