import type { Artigo } from "../../tipos";

/**
 * N1 DA ABA INTEGRAÇÃO: CONCLUIR A ADMISSÃO SEM A INTEGRAÇÃO ACONTECER.
 *
 * ┌─ O EFEITO NO FAROL, MEDIDO NO CÓDIGO E NÃO DEDUZIDO (o ponto inteiro deste artigo) ───────────┐
 * │ Desconsiderar faz TRÊS escritas, na mesma transação:                                           │
 * │   1. a frente de Integração vai ao status Concluída Sem Integração e FECHA (sai da fila, conta  │
 * │      como concluída, recebe a data de conclusão e o nome de quem clicou);                      │
 * │   2. a passagem entra na trilha da frente, com o status de onde ela saiu;                      │
 * │   3. o FAROL da admissão é gravado como Admissão Concluída, que é EXATAMENTE o mesmo farol de   │
 * │      quem realizou a integração de verdade.                                                    │
 * │                                                                                                 │
 * │ ENTÃO O FAROL NÃO DISTINGUE OS DOIS CASOS, e quem distingue é o STATUS DA FRENTE. Isso é         │
 * │ decisão, e não descuido: um farol novo alcançaria toda lista, todo card e toda contagem do      │
 * │ sistema, e o status da frente não sai da frente. É por isso que o artigo manda procurar a        │
 * │ diferença no status, e não no farol.                                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESSA MEDIÇÃO IMPORTA TANTO (o histórico que a fábrica já pagou) ─────────────────────┐
 * │ A exigência de integração por cliente já quebrou a contagem de três telas ao mesmo tempo, em    │
 * │ agosto de 2026, porque o carimbo do farol dependia de a frente de integração NASCER: sem ela, a │
 * │ admissão terminava a esteira presa no estado inicial e passava a ser contada duas vezes. Este   │
 * │ artigo encosta no mesmo lugar, e por isso ele afirma só o que foi lido no código da ação.       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE FICOU DE FORA, e é escolha de escopo ─────────────────────────────────────────────────┐
 * │ Agendar e marcar como realizada é o caminho principal e tem artigo próprio. Aqui só a exceção.  │
 * │ O gesto de marcar várias linhas também tem artigo próprio, e este referencia em vez de repetir. │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * IMAGEM É PENDÊNCIA CONHECIDA: a fila e a confirmação mostram nome de pessoa, então a captura fica
 * suspensa enquanto a homologação não tiver dado sintético. O texto funciona sem imagem.
 *
 * §A.6: nenhum dado de pessoa. O botão da linha tem o nome do candidato no rótulo acessível, então
 * ele não é declarado em `controles`: o que entra é a parte estável, a da confirmação.
 */
export const artigo: Artigo = {
  slug: "desconsiderar-a-integracao",
  titulo: "Desconsiderar A Integração",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Como concluir uma admissão que não vai passar pela integração: onde está a ação, o que a confirmação avisa e o que exatamente acontece com a frente, com o farol e com a fila depois do clique.",
  termos: [
    "desconsiderar",
    "sem integracao",
    "nao vai fazer integracao",
    "concluir sem integracao",
    "tirar da fila da integracao",
    "nao precisa de integracao",
    "concluida sem integracao",
    "admitido sem integracao",
    "integracao dispensada",
  ],
  preRequisitos: [
    "A pessoa já precisa estar na fila da aba Integração: a ação só existe nessa aba.",
    "Ter certeza da decisão: a admissão é concluída pelo clique, e ela não volta para a fila depois.",
  ],
  passos: [
    {
      gesto: "Abra a Esteira Admissional e vá para a aba Integração.",
      controles: ["Esteira Admissional", "INTEGRAÇÃO"],
    },
    {
      gesto: "Ache a pessoa na fila.",
      detalhe:
        "A busca do topo e a ordenação pelo cabeçalho valem aqui como nas outras abas. Quem já concluiu a integração não está mais na lista.",
    },
    {
      gesto: "Na coluna Ações da linha, clique no X de desconsiderar.",
      detalhe:
        "O ícone fica entre o atalho do prontuário e o relógio de agendar, e o próprio sistema o descreve ao passar o ponteiro: desconsiderar, concluir sem integração.",
    },
    {
      gesto: "Leia a confirmação Concluir Sem Integração antes de confirmar.",
      detalhe:
        "Ela diz, com o nome da pessoa, que ela sai da fila da Integração e que a admissão é concluída sem ter passado por ela, e avisa que o registro fica no Gerenciador com o status Concluída Sem Integração.",
      controles: ["Concluir Sem Integração", "Desconsiderar"],
    },
    {
      gesto: "Clique em Desconsiderar para confirmar.",
      detalhe:
        "A frente de Integração fecha na hora, com a data de conclusão e o seu nome como responsável, e a passagem fica registrada na trilha da frente. A mensagem verde do topo confirma.",
    },
    {
      gesto:
        "Para uma turma inteira, marque as linhas e use o Desconsiderar da barra de seleção.",
      detalhe:
        "É a mesma ação, pelo mesmo caminho, com a contagem no rótulo do botão. A confirmação passa a falar em quantos candidatos, e não em um nome.",
      controles: ["Limpar seleção"],
    },
    {
      gesto: "Confira o resultado no Gerenciador.",
      detalhe:
        "O farol da admissão passa a ser Admissão Concluída, o mesmo de quem realizou a integração: não existe farol separado para este caso. Quem guarda a diferença é o status da frente, Concluída Sem Integração.",
      controles: ["Admissão Concluída", "Concluída Sem Integração"],
    },
  ],
  seDerErrado: [
    {
      sintoma:
        "O sistema responde: Nenhum dos selecionados está na frente de Integração.",
      acao: "Aquelas admissões não têm frente de integração, então não há o que desconsiderar. Integração só nasce para cliente que a exige. Confira a seleção e refaça só com quem está de fato na fila desta aba.",
    },
    {
      sintoma: "A mensagem diz Falha ao desconsiderar.",
      acao: "Nada foi gravado: a ação é feita de uma vez ou não é feita, justamente para não deixar metade da turma concluída e metade não. Recarregue a lista e tente de novo.",
    },
    {
      sintoma: "Desconsiderei alguém por engano.",
      acao: "A frente está fechada e a admissão está concluída: ela não volta para a fila por esta tela. Procure a admissão no Gerenciador e trate pelo status da frente; a trilha da frente guarda quem desconsiderou e quando.",
    },
    {
      sintoma: "Selecionei várias e o sistema desconsiderou menos do que eu marquei.",
      acao: "Quem já estava com a frente concluída fica de fora, seja por ter realizado a integração, seja por ter sido desconsiderado antes. Isso é de propósito: refechar não descreveria decisão nova e só sujaria a trilha.",
    },
    {
      sintoma:
        "Procuro no Gerenciador um farol que diga que a integração não aconteceu e não encontro.",
      acao: "Ele não existe. O farol é Admissão Concluída nos dois casos, e a diferença está no status da frente de Integração: Realizado quando aconteceu, Concluída Sem Integração quando foi desconsiderada.",
    },
    {
      sintoma: "O X de desconsiderar não aparece na linha.",
      acao: "Ele existe só na aba Integração. Nas outras abas a coluna Ações tem outros botões, e concluir sem integração não faz sentido fora dela.",
    },
  ],
  regras: [
    "Desconsiderar fecha a frente de Integração com o status Concluída Sem Integração, e a linha sai da fila.",
    "O farol da admissão vai para Admissão Concluída, o mesmo de quem realizou a integração. Não há farol próprio para este caso.",
    "Quem distingue os dois desfechos é o status da frente, e não o farol.",
    "A frente fechada recebe a data de conclusão e o nome de quem desconsiderou, e a passagem fica na trilha da frente.",
    "Quem já estava com a frente de integração concluída não é tocado pela ação.",
    "Em lote, tudo acontece de uma vez: ou todas as selecionadas são concluídas, ou nenhuma é.",
    "A ação existe só na aba Integração, na linha e na barra de seleção.",
    "Desconsiderar não é declínio: a admissão está concluída, não encerrada.",
  ],
  relacionados: [
    "acompanhar-a-integracao",
    "ler-o-farol-de-cor-da-fila-de-integracao",
    "o-mapa-das-frentes-da-admissao",
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "achar-uma-admissao-no-gerenciador",
    "agir-em-varias-linhas-de-uma-vez",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/domain/esteira.ts",
    "packages/shared-types/src/index.ts",
  ],
  revisadoEm: "2026-09-30",
};
