import type { Artigo } from "../../tipos";

/**
 * A REGRA DE DOMÍNIO DA ESTEIRA, ESCRITA COMO ARTIGO.
 *
 * ┌─ POR QUE ESTA PEÇA É A MAIS IMPORTANTE DO CONJUNTO ──────────────────────────────────────────┐
 * │ Ela não descreve um recurso de tela, descreve uma REGRA do sistema: todo avanço de frente com  │
 * │ obrigatório pendente exige aceite explícito de quem avança, e gera registro PERMANENTE e        │
 * │ consultável com autor, data e quais itens estavam pendentes. É trilha de PASSAGEM, não punição: │
 * │ o que acontece com aquele registro é decidido em outra tela.                                    │
 * │                                                                                                 │
 * │ Quem não entende isso interpreta a janela como um obstáculo a driblar e clica no que destrava    │
 * │ mais rápido. As duas respostas da segunda janela são, exatamente, a diferença entre assumir a    │
 * │ não conformidade e declarar que houve determinação da diretoria, e escolher no automático é      │
 * │ assinar em nome próprio algo que era da diretoria, ou o contrário.                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO DUAS JANELAS DIFERENTES, e o artigo tem de separá-las sem assustar ─────────────────────┐
 * │ 1. "Avançar Com Pendências?" (`ConfirmDialog`, `esteira/page.tsx`): CAMPO obrigatório da        │
 * │    admissão em branco (cliente, cargo, salário, contrato, data, benefícios, escala, centro de   │
 * │    custo, setor, gestor, uniforme). Uma pergunta só, e a trilha de passagem é escrita.          │
 * │ 2. "Auditoria com pendência" (`AceiteLiberacaoModal`): DOCUMENTO obrigatório faltando na régua. │
 * │    Esta é a que oferece as DUAS respostas e pede motivo na segunda.                             │
 * │ Elas podem aparecer em sequência no MESMO clique, porque as duas causas são independentes.      │
 * │                                                                                                  │
 * │ NÃO COBRE, de propósito: auditar documento (artigo próprio, e a janela de auditoria é de outra   │
 * │ frente), o apto sem atestado validado ("liberar-apto-sem-aso-validado") e o julgamento do        │
 * │ registro depois, que é a tela de Não Conformidades.                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SEM IMAGEM, E É PENDÊNCIA CONHECIDA, NÃO ESQUECIMENTO: as duas janelas nascem sobre a fila, que
 * mostra pessoas, e a captura dessas telas está vetada enquanto a homologação não tiver arnês
 * sintético. Os prints entram em entrega própria.
 *
 * §A.11: nenhum travessão. §A.6: nenhum dado de pessoa. A trilha é descrita pelos CAMPOS que ela
 * guarda, nunca por um registro de alguém.
 */
export const artigo: Artigo = {
  slug: "aceitar-o-avanco-com-pendencias",
  titulo: "Aceitar O Avanço Com Pendências",
  modulo: "SOUL_ADM",
  rotas: ["/esteira"],
  menus: ["esteira"],
  publico: "AMBOS",
  nivel: "N1",
  familia: "esteira",
  resumo:
    "Por que o sistema pede o seu aceite para concluir uma frente com obrigatório pendente, as duas respostas que a janela da auditoria oferece, o que fica registrado para sempre e onde essa trilha é consultada depois.",
  termos: [
    "avancei com pendencia",
    "avancar com pendencias",
    "estou ciente",
    "assinei o aceite",
    "liberei sem documento",
    "aceite de passagem",
    "trilha de passagem",
    "concluir com pendencia",
    "nao conformidade",
    "determinacao da diretoria",
    "pedido da diretoria",
    "motivo da liberacao",
    "quem liberou",
    "ficou no meu nome",
    "o sistema pediu ciencia",
  ],
  preRequisitos: [
    "Estar concluindo a Auditoria ou o Exame de uma admissão que ainda tem obrigatório pendente. Sem pendência nenhuma, nenhuma dessas janelas aparece.",
    "Saber de quem partiu a decisão de avançar assim. É essa a pergunta que a janela da auditoria faz, e a resposta muda em nome de quem o registro nasce.",
  ],
  passos: [
    {
      gesto: "Na aba Auditoria ou na aba Exame, mude o status da frente para a situação que conclui.",
      detalhe:
        "O aceite não é um botão separado: ele aparece por cima do gesto normal de concluir, e só quando há obrigatório pendente.",
      controles: ["AUDITORIA", "EXAME"],
    },
    {
      gesto: "Aparecendo Avançar Com Pendências?, leia o que a janela declara.",
      detalhe:
        "Ela diz que você está ciente de avançar a admissão com pendências obrigatórias não preenchidas, e que isso fica registrado na trilha de passagem. A causa aqui é campo em branco na admissão, não documento.",
    },
    {
      gesto: "Decida: Cancelar, ou Estou ciente, avançar.",
      detalhe:
        "Cancelar não muda nada, e o caminho sem registro é preencher o que falta pela etiqueta de pendências da linha. Avançando, a frente conclui e a trilha é escrita na hora.",
      controles: ["Estou ciente, avançar", "Cancelar"],
    },
    {
      gesto:
        "Aparecendo Auditoria com pendência, responda Esta liberação foi a pedido da diretoria?",
      detalhe:
        "Esta janela é a do documento obrigatório faltando na régua, e ela oferece duas respostas, com efeitos diferentes. Escolha a que corresponde ao que aconteceu de verdade: é essa escolha que define em nome de quem o registro nasce.",
      controles: ["Esta liberação foi a pedido da diretoria?"],
    },
    {
      gesto: "Escolhendo Não, não conformidade do consultor, confirme em Estou ciente, liberar.",
      detalhe:
        "É a resposta de quem decidiu avançar por conta própria. O registro nasce como não conformidade do consultor responsável, e a mensagem verde do topo confirma que ela foi registrada.",
      controles: ["Não, não conformidade do consultor", "Estou ciente, liberar"],
    },
    {
      gesto:
        "Escolhendo Sim, liberação por determinação da diretoria, escreva o Motivo e clique em Enviar à supervisão.",
      detalhe:
        "O motivo é obrigatório nesta resposta, e sem ele o botão não acende. O registro vai à supervisão para aprovação, e não penaliza o consultor se for aprovado. Escreva qual foi a determinação, não apenas que houve uma.",
      controles: [
        "Sim, liberação por determinação da diretoria",
        "Motivo",
        "Descreva a determinação da diretoria…",
        "Enviar à supervisão",
        "Cancelar",
      ],
    },
    {
      gesto: "Depois, consulte a trilha na ficha da admissão.",
      detalhe:
        "Abra a admissão pelo olho da linha e procure o bloco da trilha de passagem: ele lista cada avanço com pendência, com o autor, a data e quais itens estavam pendentes naquele momento. A trilha é permanente e não é apagada por ninguém.",
      controles: ["Trilha de passagem (avanços com pendência)"],
    },
  ],
  seDerErrado: [
    {
      sintoma: "Eu só queria mudar o status e o sistema pediu que eu me declarasse ciente.",
      acao: "Há obrigatório pendente naquela admissão. Não é erro nem falta de permissão: é o aceite que a regra exige. Querendo avançar sem registro, cancele, preencha o que falta pela etiqueta de pendências da linha e mude o status depois.",
    },
    {
      sintoma: "A janela não diz quais são as pendências.",
      acao: "Cancele e clique na etiqueta da coluna de pendências obrigatórias daquela linha: ela lista campo por campo o que está em branco. A lista completa também fica gravada na trilha depois do aceite.",
    },
    {
      sintoma: "Escolhi Sim e o botão Enviar à supervisão não acende.",
      acao: "O motivo está vazio. Ele é obrigatório nessa resposta, porque é ele que a supervisão vai ler para aprovar ou não.",
    },
    {
      sintoma: "Escolhi a resposta errada e já confirmei.",
      acao: "O registro nasceu como você respondeu e não se refaz pela esteira. Avise a supervisão do que aconteceu: a decisão sobre aquele registro é tomada na tela de Não Conformidades.",
    },
    {
      sintoma: "Preenchi as pendências depois e quero que a trilha saia.",
      acao: "Ela não sai. A trilha é o registro de que a passagem aconteceu com pendência naquele momento, e preencher depois muda a admissão, não o histórico.",
    },
    {
      sintoma: "Apareceram duas janelas seguidas no mesmo clique.",
      acao: "É o esperado quando faltam as duas coisas: documento obrigatório na régua e campo obrigatório da admissão. São causas independentes, então cada uma pede o seu aceite e gera o seu registro.",
    },
    {
      sintoma: "Aparece Falha ao mudar o status.",
      acao: "Nada foi gravado e a frente ficou como estava. Recarregue a página e repita: a admissão pode ter sido alterada por outra pessoa enquanto a sua janela estava aberta.",
    },
    {
      sintoma: "A janela não fecha ao clicar fora dela.",
      acao: "É assim de propósito, para um clique torto não confirmar nem descartar um aceite. Saia pelo Cancelar ou pela tecla Esc.",
    },
  ],
  regras: [
    "Todo avanço de frente com obrigatório pendente exige aceite explícito de quem avança. O sistema não avança calado.",
    "O aceite gera registro PERMANENTE e consultável, com quem avançou, quando e quais itens estavam pendentes.",
    "Isso é trilha de passagem, não punição. O que acontece com o registro é decidido na tela de Não Conformidades, nunca na esteira.",
    "Campo obrigatório em branco abre a janela de ciência simples, com uma resposta só.",
    "Documento obrigatório faltando na régua abre a janela com duas respostas, e a escolha define em nome de quem o registro nasce.",
    "Respondendo que não houve determinação da diretoria, o registro nasce como não conformidade do consultor responsável.",
    "Respondendo que houve determinação da diretoria, o motivo é obrigatório e o registro vai à supervisão para aprovação.",
    "As duas janelas podem aparecer em sequência no mesmo clique, porque as duas causas são independentes.",
    "Pendência sinaliza, ela não bloqueia: a admissão anda com campo em branco, e o que o sistema cobra é o aceite registrado.",
    "Preencher a pendência depois não apaga a trilha.",
    "A trilha é consultada na ficha da admissão, pelo olho da linha.",
  ],
  relacionados: [
    "entender-o-farol-e-as-pendencias-obrigatorias",
    "liberar-apto-sem-aso-validado",
    "auditar-os-documentos-da-admissao",
    "concluir-o-cadastro-e-o-contrato",
    "salvar-com-campo-obrigatorio-vazio",
    "ler-a-ficha-da-admissao",
  ],
  fontes: [
    "apps/frontend/src/app/(app)/esteira/page.tsx",
    "apps/frontend/src/components/esteira/AceiteLiberacaoModal.tsx",
    "apps/frontend/src/components/esteira/AdmissaoDetalheModal.tsx",
    "apps/backend/src/esteira/esteira.service.ts",
    "apps/backend/src/domain/admissao.ts",
  ],
  revisadoEm: "2026-09-30",
};
