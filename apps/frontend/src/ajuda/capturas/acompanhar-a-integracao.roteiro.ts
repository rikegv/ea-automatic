/**
 * ROTEIRO DE CAPTURA: "Acompanhar A Integração".
 *
 * ┌─ A BUSCA POR `999000` É A MEDIDA DE PRIVACIDADE, E AQUI ELA É OBRIGATÓRIA ───────────────────┐
 * │ As três imagens têm linha de pessoa, e a terceira mostra o nome dela no alto da janela de          │
 * │ agendamento. Os candidatos do arnês têm CPF da família 999 e a busca do topo casa CPF por pedaço,  │
 * │ então digitar `999000` deixa a fila sintética.                                                     │
 * │                                                                                                   │
 * │ SEM A BUSCA, O GATE DE DADO PESSOAL **REPROVA** esta aba, com 3 achados (medido em 28/09/2026 com  │
 * │ `pnpm ajuda:conferir`). Foi por isso que ela não foi retirada aqui, ao contrário do que se fez nos  │
 * │ roteiros do Cadastro e do iFractal, em que o gate aprovou a fila real. A busca não é enfeite de     │
 * │ consistência neste arquivo: é o que impede a imagem de existir com nome de gente dentro.          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A FILA DA INTEGRAÇÃO É POVOADA PELO ARNÊS, E ELA PRECISOU DE UMA LINHA NOVA ───────────────┐
 * │ Com a busca, esta aba ficava VAZIA e a captura era recusada por LISTA VAZIA (medido em             │
 * │ 28/09/2026: 1 lista, 0 linha). A frente de Integração só nasce quando Auditoria e Exame fecham, e  │
 * │ as quatro linhas originais do `arnes-seed-manual` param na Auditoria de propósito.                 │
 * │                                                                                                   │
 * │ O CONSERTO FOI NO ARNÊS, não aqui: a linha `SIMULADO ECHO` entra com Auditoria, Exame e Cadastro   │
 * │ concluídos e a Integração ABERTA, que é o estado que esta aba fotografa. Ela NÃO aparece nas filas  │
 * │ das outras abas, porque a lista de itens de cada uma filtra `concluida = false`.                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ROLAGEM HORIZONTAL É PARTE DO PREPARO, E ISSO NÃO É ENFEITE ──────────────────────────────┐
 * │ A tabela desta aba é mais larga que a viewport de 1600px, e o motor resolve a caixa de cada alvo  │
 * │ ANTES de desenhar: quando um alvo mais à direita força a rolagem, a caixa já medida do alvo        │
 * │ anterior fica velha e a seta sai apontando para a coluna errada. Medido na primeira gravação: a    │
 * │ elipse de "Data adm." saiu por cima da coluna Status.                                             │
 * │                                                                                                   │
 * │ Rolar até a coluna mais à direita ANTES da captura deixa a tabela na posição final, e as duas      │
 * │ colunas de data são medidas onde elas realmente aparecem na imagem.                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O AGENDAMENTO EM MASSA FICA **SEM** IMAGEM, DE PROPÓSITO ───────────────────────────────────┐
 * │ A barra com "Agendar em massa" só existe DEPOIS de alguma linha estar marcada, e marcar linha     │
 * │ pede um clique na caixa da esquerda, cujo rótulo acessível carrega o NOME da pessoa              │
 * │ ("Selecionar <NOME>"). Daria para contornar clicando no "Selecionar todos os candidatos da fila", │
 * │ mas a imagem que sairia seria a barra de seleção múltipla, que é o assunto de outro artigo (o dos │
 * │ padrões do sistema, referenciado em `relacionados`), e não o agendamento da integração.           │
 * │                                                                                                  │
 * │ Então o passo 7 fica escrito e sem print: os rótulos estão declarados nos `controles` (a busca e o │
 * │ índice "Nesta Tela" os acham) e o gesto de selecionar várias linhas é ensinado onde ele mora.     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE A FILA PRECISA TER: uma admissão na frente de Integração, que nasce quando a Auditoria e o
 * Exame fecham e só para cliente que exige integração. Sem uma linha dessas o relógio da coluna Ações
 * não existe, o alvo não resolve e o motor FALHA em vez de gravar imagem sem seta, que é o
 * comportamento certo.
 *
 * NENHUM PNG É GRAVADO POR ESTE ARQUIVO. Ele descreve a captura; quem executa é o motor.
 */
import type { Roteiro } from "../tipos";

/** O relógio da coluna Ações. O rótulo acessível dele carrega o nome da pessoa, o aviso do mouse não. */
const BOTAO_AGENDAR = 'button[title="Agendar integração"]';

export const roteiro: Roteiro = {
  slug: "acompanhar-a-integracao",
  url: "/esteira",
  arnes: "arnes-seed-manual",
  preparo: [
    { acao: "clicar", alvo: { papel: "button", nome: "INTEGRAÇÃO", texto: "" } },
    {
      acao: "digitar",
      alvo: { seletor: 'input[aria-label="Buscar por nome, CPF ou cliente"]', texto: "" },
      valor: "999000",
    },
    // A tabela é mais larga que a viewport: ver o bloco da rolagem horizontal, acima.
    { acao: "rolarAte", alvo: { papel: "button", nome: "Data de Agendamento", texto: "" } },
  ],
  capturas: [
    {
      arquivo: "01-aba-integracao.png",
      legenda: "Passo 1: a aba Integração aberta, com a fila e o farol de cor nas linhas.",
      alvos: [
        { papel: "button", nome: "INTEGRAÇÃO", texto: "1. Abra a aba Integração", lado: "abaixo" },
        // As duas colunas de data que o passo 4 existe para separar.
        // ACIMA, e não abaixo: abaixo o rótulo cai em cima da própria célula da data, que é o valor
        // que o passo manda comparar com a data de agendamento.
        { papel: "button", nome: "Data adm.", texto: "4. Data da admissão", lado: "acima" },
        {
          papel: "button",
          nome: "Data de Agendamento",
          texto: "O dia marcado",
          lado: "abaixo",
        },
      ],
    },
    {
      arquivo: "02-botao-agendar.png",
      legenda: "Passo 5: o relógio da coluna Ações, que abre o agendamento da integração.",
      alvos: [
        {
          seletor: BOTAO_AGENDAR,
          texto: "5. Abra o agendamento",
          forma: "elipse",
          lado: "esquerda",
        },
      ],
    },
    {
      arquivo: "03-janela-de-agendamento.png",
      legenda: "Passo 6: a janela Agendamento Da Integração, com os quatro campos obrigatórios.",
      preparo: [{ acao: "clicar", alvo: { seletor: BOTAO_AGENDAR, texto: "" } }],
      alvos: [
        {
          papel: "button",
          nome: "Tipo da integração",
          texto: "6. Online ou presencial",
          lado: "direita",
        },
        {
          papel: "button",
          nome: "Consultor responsável pela integração",
          texto: "Quem conduz",
          lado: "direita",
        },
        {
          papel: "button",
          nome: "Salvar e agendar",
          texto: "Salvar já deixa Agendado",
          lado: "acima",
        },
      ],
    },
  ],
};
