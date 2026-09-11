"use client";

/**
 * ─ O PAINEL DA VAGA: A VAGA INTEIRA EM UM LUGAR SÓ (etapa 4 da tela unificada de vagas) ────────
 *
 * ┌─ O QUE ELE RESOLVE ─────────────────────────────────────────────────────────────────────────┐
 * │ Ver uma vaga custava três cliques em três lugares: o olho abria a ficha, o funil abria a      │
 * │ lista de candidatos, e "em que pé está o processo" não existia em lugar nenhum. Quem quisesse │
 * │ responder "esta vaga já entregou o que prometeu?" tinha de ler o cilindro da tabela, abrir a  │
 * │ lista de candidatos, contar na mão e lembrar se a vaga estava fechada. Agora é uma caixa só:  │
 * │ os DADOS da vaga, a TRILHA (em que pé ela está) e QUEM está nela.                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ETAPA 4 ENTREGOU A CASCA, SÓ DE LEITURA. A ETAPA 5 É A QUE AGE, e as ações nasceram exatamente
 * nas abas que aquela casca criou: alocar alguém na vaga, cadastrar quem ainda não está na base,
 * entregar uma posição, mover no funil e abrir a ficha. Entregar a forma antes das ações foi o que
 * permitiu validar o desenho sem arriscar a operação, e é por isso que nada aqui precisou mudar de
 * lugar para as ações caberem.
 *
 * TODA REGRA DE "ESTA AÇÃO ESTÁ DISPONÍVEL AGORA?" MORA EM `@/lib/as-vaga-acoes`, com teste, e não
 * dentro deste componente. Uma ação oferecida onde o backend recusa vira um botão que só sabe falhar;
 * uma ação escondida onde o backend aceita vira um beco. As duas falhas são invisíveis na revisão de
 * um componente de 400 linhas e triviais de afirmar em um teste de uma linha.
 *
 * AS AÇÕES REAPROVEITAM OS MODAIS DA CENTRAL DE CANDIDATOS, INTEIROS: alocar, cadastrar, mover e a
 * ficha são os MESMOS componentes daquela tela, com a vaga já escolhida. Reescrevê-los aqui daria
 * duas telas de cadastro de candidato, dois dedup de CPF e dois seletores de etapa de entrada, que
 * divergiriam no primeiro ajuste. O único componente novo é o de FINALIZAR POSIÇÃO, porque essa
 * operação não existia em tela nenhuma.
 *
 * A FICHA DA VAGA CONTINUA NA PÁGINA, E CHEGA COMO `children`. Ela é feita de 38 campos que dependem
 * de uma dúzia de formatadores locais da Central de Vagas (moeda, listas com escape, rótulo de tempo
 * de contrato, nome da UF). Arrastá-los para cá seria mover código VALIDADO de lugar para não
 * acrescentar nada (§A.26): o painel só decide ONDE a ficha aparece, e ela continua sendo escrita
 * onde sempre foi.
 *
 * A TRILHA NÃO TEM ROTA NOVA. Ela é derivada do que a listagem de vagas já trouxe, pela régua de
 * `@/lib/as-vaga-trilha`, que por sua vez lê a contagem de posições por `preenchidas`, a MESMA peça
 * que enche o cilindro da tabela. É isso que garante que a trilha nunca discorde da coluna Posições.
 *
 * OS CANDIDATOS SÃO CARREGADOS SÓ QUANDO A ABA É ABERTA, e a preguiça aqui tem duas razões
 * concretas. A primeira é que abrir a ficha de uma vaga não deveria custar uma consulta que talvez
 * ninguém queira. A segunda é de PERMISSÃO: a lista vem de `GET /as/candidatos/vaga/:id`, que
 * pertence ao menu `as-candidatos`, então um consultor que só tem a Central de Vagas recebe 403.
 * Carregando sob demanda, quem nunca abre a aba nunca vê erro nenhum, e quem abre recebe a mensagem
 * do próprio backend, que é a régua da casa para erro (`mensagemDoErro`).
 *
 * §A.6, E A MINIMIZAÇÃO NÃO AFROUXA AQUI: o painel da vaga NÃO devolve CPF. A lista mostra nome,
 * etapa, situação e datas do processo, e a tela NÃO hidrata as linhas com fichas: puxar a ficha de
 * todo mundo para preencher colunas traria o CPF da vaga inteira para o navegador e desfaria, em uma
 * linha, o que o backend construiu.
 *
 * A FICHA (que MOSTRA o CPF) SÓ ABRE POR CLIQUE DELIBERADO, UMA PESSOA POR VEZ, que é a mesma régua
 * da Central de Candidatos: o número sai do backend só na rota da ficha, e só de quem foi aberto.
 * Nenhuma URL desta tela carrega dado de pessoa, e nenhuma busca daqui manda CPF (a alocação segue
 * pelo `id`, que sempre foi a chave da tabela).
 *
 * §A.11 (sem travessão, célula vazia é "não informado"), §A.12 (máscara única de tabela: título
 * centralizado, divisória entre colunas, ícone dinâmico por estado), §A.20 (nada esmagado, a tabela
 * rola dentro do próprio contêiner), §A.24 (title case em título, aba e tag; botão é ação),
 * §A.29 (toda tabela nasce ordenável, pelo `useOrdenacao` que já existe).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CANDIDATURA_SITUACOES,
  CANDIDATURA_SITUACAO_LABEL,
  candidaturaViva,
  finalizaPosicao,
  type AsCandidaturaItem,
  type AsEtapaFunil,
  type CandidaturaSituacao,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { MultiSelect, type MultiOption } from "@/components/ui/MultiSelect";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { dataBr, dataHoraBr, mensagemDoErro, painelDaVaga } from "@/lib/as-candidatos";
import { tomDaSituacao, tomDoStatusVaga } from "@/lib/as-candidatos-visual";
import {
  etapasOrdenadas,
  ordemDaEtapa,
  rotuloDaEtapa,
  tomDaEtapa,
  useEtapas,
} from "@/lib/as-etapas";
import { podeMoverStatusDaVaga, rotuloDoStatusVaga, useStatusVaga } from "@/lib/as-status-vaga";
import { trilhaDaVaga } from "@/lib/as-vaga-trilha";
import { fraseDoFechamentoForcado } from "@/lib/as-vaga-fechamento";
import { fraseDaReducaoDeMeta } from "@/lib/as-vaga-meta";
import {
  POSICAO_LADOS,
  podeDecidir,
  podeFinalizarPosicao,
  podeMoverNoFunil,
  rotuloCurtoDoLado,
  rotuloDoLado,
  vagaRecebeCandidato,
} from "@/lib/as-vaga-acoes";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { NovoCandidatoModal } from "@/components/as/candidatos/NovoCandidatoModal";
import { MoverCandidaturaModal } from "@/components/as/candidatos/MoverCandidaturaModal";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import { FinalizarPosicaoModal } from "@/components/as/vagas/FinalizarPosicaoModal";
import { MoverStatusVagaModal } from "@/components/as/vagas/MoverStatusVagaModal";
import { AcoesEmMassaDaVaga } from "@/components/as/vagas/AcoesEmMassaDaVaga";
import { AdicionarCandidatosEmLoteModal } from "@/components/as/vagas/AdicionarCandidatosEmLoteModal";
import {
  aplicarRecorte,
  criteriosAtivos,
  recorteAtivo,
  selecaoNoRecorte,
  ETAPA_FORA_DO_FUNIL,
  RECORTE_VAZIO,
  type RecorteDoPainel,
} from "@/lib/as-painel-recorte";
import { cn } from "@/lib/cn";

type Aba = "vaga" | "candidatos" | "alocados";

const ABAS: { id: Aba; rotulo: string; icone: IconName }[] = [
  { id: "vaga", rotulo: "A Vaga", icone: "doc" },
  { id: "candidatos", rotulo: "Ver Candidatos", icone: "users" },
  { id: "alocados", rotulo: "Ver Candidatos Alocados", icone: "check" },
];

/*
 * ─ AS ABAS COMO BOTÃO DE TRABALHO, E NÃO COMO ENFEITE (decisão do diretor) ────────────────────
 *
 * ELAS ERAM O `.tab` DA ESTEIRA, que é discreto de propósito: fundo transparente, texto em tom
 * apagado, e um retângulo levemente preenchido só na ativa. Numa barra de navegação de página isso
 * basta, porque a barra fica sempre no mesmo lugar da tela. Dentro deste modal, onde as três abas
 * são o ÚNICO caminho para o que a caixa tem a oferecer, o mesmo desenho fazia o gesto principal
 * parecer legenda. Agora as três têm FUNDO e SOMBRA, e ficam CENTRALIZADAS.
 *
 * O `.tab` DA ESTEIRA NÃO FOI TOCADO, e isso é deliberado (§A.26): ele é a aba de outras telas já
 * validadas, e mudá-lo aqui mudaria todas elas de lado. O que existe aqui é uma variação LOCAL,
 * escrita nos MESMOS TOKENS do design system, então ela acompanha o tema em vez de brigar com ele.
 *
 * A DISTINÇÃO ENTRE ATIVA E INATIVA PRECISOU MUDAR DE MECANISMO, e é a consequência direta de todas
 * ganharem fundo: antes a ativa era "a que tem fundo", e com fundo em todas isso deixaria de
 * distinguir qualquer coisa. A ativa passa a ser a PREENCHIDA com o gradiente do botão primário
 * (`--btn-grad`, o mesmo do `btn-primary`), com texto branco e sombra de realce; a inativa é a
 * superfície elevada (`--surface-2`) com a borda e a sombra de vidro do sistema.
 *
 * NENHUMA COR ESCRITA À MÃO: `--btn-grad`, `--surface-2`, `--border`, `--border-strong` e
 * `--glass-shadow` são declarados nos DOIS temas, então o claro e o escuro saem certos pelo mesmo
 * código. Fosse um hexadecimal, ele ficaria bom em um tema e errado no outro, que é o defeito que a
 * regra pede para evitar.
 */
const ABA_BASE =
  "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition";
const ABA_ATIVA =
  "border-transparent [background:var(--btn-grad)] text-white shadow-[0_10px_22px_-8px_rgba(34,176,219,0.65)]";
const ABA_INATIVA =
  "border-[var(--border)] bg-[var(--surface-2)] text-dim shadow-[var(--glass-shadow)] hover:border-[var(--border-strong)] hover:text-text";

/*
 * ─ AS AÇÕES DA VAGA, NA MESMA BARRA DAS ABAS (peça 3 da onda B3, pedido do diretor) ────────────
 *
 * O QUE ELAS RESOLVEM: a coluna Ações da Central de Vagas carregava CINCO gestos por linha, e a
 * tabela pagava a conta em rolagem horizontal. Os gestos vieram para cá, onde sobra largura e onde
 * a pessoa já está quando pensa "o que eu faço com esta vaga". Na linha ficou só o botão que ABRE
 * este painel.
 *
 * MESMO FORMATO DAS ABAS, de propósito (pedido literal): a mesma altura, o mesmo raio, a mesma
 * tipografia e o mesmo par ícone + rótulo. Um segundo formato na mesma barra faria a linha parecer
 * duas barras empilhadas.
 *
 * E A DIFERENÇA ENTRE AS DUAS NATUREZAS PRECISA SER LEGÍVEL, porque elas fazem coisas diferentes: a
 * aba TROCA o que a caixa mostra e permanece marcada; a ação ABRE outra caixa e não fica marcada
 * nunca. Três sinais dizem isso sem nenhum rótulo explicativo:
 *
 *  1. UMA DIVISÓRIA de um pixel separa os dois grupos, a mesma hairline `--border` do §A.12.
 *  2. AS ABAS SÃO SÓLIDAS (superfície preenchida, com sombra de vidro; a ativa com o gradiente do
 *     botão primário) e AS AÇÕES SÃO VAZADAS (fundo transparente, só o contorno). Cheio é estado,
 *     contorno é comando, e a aba ativa continua sendo a única peça colorida da barra.
 *  3. O TEXTO SEGUE O §A.24 e reforça a leitura sem custo nenhum: aba é rótulo, então title case
 *     ("Ver Candidatos"); ação é comando, então escrita normal ("Fechar vaga").
 *
 * NENHUMA COR ESCRITA À MÃO, pelo mesmo motivo das abas: `--border`, `--border-strong`,
 * `--surface-2` e o `text-danger` do design system saem certos nos dois temas.
 */
const ACAO_BASE =
  "border-[var(--border)] bg-transparent text-dim hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-text";
/** O gesto DESTRUTIVO da barra, no mesmo vermelho que ele já tinha como ícone na tabela. */
const ACAO_PERIGO =
  "border-[var(--border)] bg-transparent text-dim hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] hover:text-danger";

/**
 * UMA AÇÃO DA VAGA OFERECIDA NA BARRA.
 *
 * QUEM DECIDE QUAIS EXISTEM É A CENTRAL DE VAGAS, e não este componente: as réguas de "esta ação
 * cabe nesta vaga?" e os modais que cada uma abre já moram lá, validados, e trazê-los para cá seria
 * mover código validado de lugar sem acrescentar nada (§A.26). O painel recebe a lista pronta e só
 * decide ONDE ela aparece.
 *
 * É POR ISSO QUE A BARRA NÃO TEM NÚMERO DE LUGARES. Ela desenha o que vier: hoje são quatro na vaga
 * ABERTA e duas no RASCUNHO, e o "Reabrir vaga" da vaga CANCELADA entra como mais um item da lista,
 * sem tocar em uma linha deste arquivo.
 */
export type AcaoDaVaga = {
  /** Chave de render, e nada mais. */
  id: string;
  /** O comando, em escrita normal (§A.24). */
  rotulo: string;
  icone: IconName;
  /** A frase inteira, para o mouse e para o leitor de tela. */
  descricao: string;
  /** `true` só no gesto destrutivo (cancelar a vaga). */
  perigo?: boolean;
  onClick: () => void;
};

export function VagaPainelModal({
  vaga,
  token,
  onClose,
  onMudou,
  abaInicial = "vaga",
  acoes = [],
  acaoAberta = false,
  children,
}: {
  vaga: VagaListItem;
  token: string | null;
  onClose: () => void;
  /**
   * EM QUE ABA O PAINEL ABRE. O padrão continua sendo "vaga", ou seja, quem abre pelo botão de
   * gestão não vê diferença nenhuma: este parâmetro existe para QUEM CHEGA AQUI COM UMA PERGUNTA
   * JÁ FEITA. A recusa do cancelamento lista quem ainda está em processo e precisa LEVAR o consultor
   * até essa lista; despejá-lo na ficha da vaga, com a aba certa a um clique de distância, é o
   * mesmo beco que a recusa existia para evitar.
   *
   * É SÓ O ESTADO INICIAL, e não uma aba travada: a troca continua sendo do consultor.
   */
  abaInicial?: Aba;
  /**
   * AVISA A CENTRAL DE VAGAS DE QUE A VAGA MUDOU, e não é enfeite: o cilindro de posições, a trilha
   * e os cards da tela lem `ocupacao`, que é DERIVADA das candidaturas. Entregar uma posição aqui
   * dentro sem avisar lá fora deixaria o cabeçalho deste painel (que também lê a trilha) discordando
   * da tabela atrás dele, na mesma tela e ao mesmo tempo.
   */
  onMudou: () => void;
  /**
   * AS AÇÕES DA VAGA, JÁ FILTRADAS PELO STATUS, na ordem em que a barra as mostra. Lista vazia é um
   * caso legítimo, e não um esquecimento: a vaga encerrada de hoje não oferece nenhuma, e a barra
   * volta a ser só as três abas.
   */
  acoes?: AcaoDaVaga[];
  /**
   * ─ "TEM UM MODAL DA CENTRAL DE VAGAS ABERTO POR CIMA DE MIM" ──────────────────────────────────
   *
   * O PAINEL PRECISA SABER DISSO POR CAUSA DA TECLA ESCAPE. O `ui/Modal` registra um `keydown` no
   * `document` POR INSTÂNCIA, então, com duas caixas abertas, um Escape dispara os DOIS `onClose`:
   * a pessoa fecharia o formulário de cancelamento e, junto, o painel inteiro que o abriu, perdendo
   * o contexto que ela levou três cliques para montar.
   *
   * §A.41 MANDA MANTER O ESCAPE (é a saída de teclado, e é gesto deliberado), então a correção não é
   * tirar a tecla: é o Escape fechar SÓ A CAIXA DE CIMA. O painel já sabe dos modais que ele mesmo
   * abre (alocar, cadastrar, mover, ficha); os que a Central de Vagas abre são estado DELA, e é por
   * isso que ela avisa por esta porta.
   *
   * O BOTÃO "Fechar" DO RODAPÉ NÃO É AFETADO: ele chama `onClose` direto. Com um modal por cima ele
   * está atrás do overlay e nem alcançável é.
   */
  acaoAberta?: boolean;
  /** A ficha completa da vaga, escrita na Central de Vagas. Vira o conteúdo da aba "A Vaga". */
  children: ReactNode;
}) {
  const [aba, setAba] = useState<Aba>(abaInicial);
  /*
   * O CATÁLOGO DE STATUS DA VAGA (onda B2), memoizado por carga de página e compartilhado com a
   * Central de Vagas atrás deste painel. Ele responde três coisas aqui: o RÓTULO e a COR da pill do
   * cabeçalho, se a vaga ainda RECEBE candidato novo, e se o status dela pode ser MOVIDO à mão.
   */
  const { status: catalogoStatus } = useStatusVaga(token);
  /**
   * O CATÁLOGO DE ETAPAS, para as OPÇÕES do filtro (§A.37: catálogo de ENDPOINT, nunca das linhas
   * carregadas, senão escolher uma etapa encolheria a lista de opções e não daria para somar a
   * segunda sem limpar o filtro). O hook é memoizado por carga de página e já é usado pela tabela
   * logo abaixo, então isto não acrescenta nenhuma requisição.
   */
  const { etapas: catalogoEtapas } = useEtapas();
  const [candidaturas, setCandidaturas] = useState<AsCandidaturaItem[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /*
   * ─ AS AÇÕES, CADA UMA COM O SEU ALVO ────────────────────────────────────────────────────────
   * Um estado por ação, e não um só com um discriminador: elas abrem componentes diferentes, com
   * argumentos diferentes, e um estado único obrigaria cada leitura a conferir de que tipo é o alvo
   * antes de usá-lo. `null` quer dizer fechado, em todos.
   */
  const [alocarAberto, setAlocarAberto] = useState(false);
  const [cadastrarAberto, setCadastrarAberto] = useState(false);
  const [adicionarLoteAberto, setAdicionarLoteAberto] = useState(false);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [moverAlvo, setMoverAlvo] = useState<AsCandidaturaItem | null>(null);
  /**
   * O MOVIMENTO DE STATUS DA VAGA (onda B2). É estado próprio, e não um `moverAlvo` reaproveitado:
   * um move a PESSOA de etapa, o outro move a VAGA de status, e são duas caixas diferentes com dois
   * alvos diferentes. Um estado só obrigaria cada leitura a conferir de que tipo é o alvo.
   */
  const [moverStatusAberto, setMoverStatusAberto] = useState(false);
  const [finalizarAlvo, setFinalizarAlvo] = useState<AsCandidaturaItem | null>(null);

  /**
   * ─ A SELEÇÃO MÚLTIPLA (grupo 1), COM O MESMO GESTO DO ALTO VOLUME ────────────────────────────
   *
   * IDS, E NÃO OBJETOS. A lista é RELIDA a cada ação (`carregar`), e as instâncias trocam a cada
   * leitura: guardar objetos deixaria a seleção apontando para fotografias antigas, com etapa e
   * situação de antes do lote. Guardando o id, a tela reencontra a linha ATUAL na lista atual.
   *
   * NADA SOBREVIVE À TROCA DE ABA. As duas abas mostram recortes diferentes das mesmas pessoas, e
   * uma seleção herdada da outra aba estaria, por definição, fora do que a pessoa está vendo. Marcar
   * em silêncio linha que ninguém está vendo é a receita do lote errado, e é a mesma régua que o
   * "selecionar todos" segue.
   */
  const [selecionados, setSelecionados] = useState<string[]>([]);

  /**
   * ─ O RECORTE DA ABA: busca por nome, situação e etapa (gestão completa, pedido do diretor) ──
   *
   * UM RECORTE SÓ, E ELE MORRE NA TROCA DE ABA, exatamente como a seleção: as duas abas mostram
   * conjuntos diferentes das mesmas pessoas, e um filtro herdado da outra aba seria um recorte que
   * ninguém escolheu ali, escondendo linha sem dizer por quê.
   *
   * ELE É CLIENTE, sobre a lista que o painel já carregou inteira: a maior vaga da homologação tem
   * 51 candidaturas. Isso resolve o §A.6 por construção (nenhum parâmetro novo de URL, nenhum
   * endpoint novo, nenhum CPF em lugar nenhum) e não toca uma linha de backend.
   */
  const [recorte, setRecorte] = useState<RecorteDoPainel>(RECORTE_VAZIO);

  const trilha = trilhaDaVaga(vaga);
  const precisaDaLista = aba === "candidatos" || aba === "alocados";

  /**
   * ─ A ABA PEDIDA DE FORA CHEGA COM O PAINEL JÁ ABERTO, e antes disso ela nunca chegava ──────────
   *
   * `abaInicial` nasceu como estado INICIAL porque o único jeito de pedir uma aba era abrindo o
   * painel: a recusa do cancelamento fechava o formulário e abria a caixa já na lista de candidatos,
   * e o componente montava naquele instante. COM O CANCELAMENTO DENTRO DO PAINEL, isso mudou: o
   * painel já está montado quando a recusa pede a aba, e um valor inicial não move mais nada. O
   * pedido chegaria e a pessoa continuaria olhando a ficha, que é exatamente o beco que a recusa
   * existe para evitar.
   *
   * O EFEITO SÓ REAGE À MUDANÇA DA PROP, então a aba continua sendo do consultor: trocar de aba aqui
   * dentro não é desfeito por nada, porque `abaInicial` não mudou. Quem muda é a Central de Vagas,
   * e só quando ela tem uma pergunta a fazer.
   */
  useEffect(() => {
    setAba(abaInicial);
  }, [abaInicial]);

  /**
   * TEM ALGUMA CAIXA POR CIMA DESTA? As do próprio painel ele conhece por estado; as da Central de
   * Vagas chegam por `acaoAberta`. É esta resposta que decide se o Escape fecha o painel ou só o que
   * está na frente dele (ver o comentário de `acaoAberta`).
   */
  const temModalPorCima =
    acaoAberta ||
    alocarAberto ||
    cadastrarAberto ||
    adicionarLoteAberto ||
    moverStatusAberto ||
    fichaId !== null ||
    moverAlvo !== null ||
    finalizarAlvo !== null;

  /**
   * ─ "HAVIA UM POPOVER DE SELETOR ABERTO QUANDO O ESCAPE DESCEU?" ─────────────────────────────
   *
   * Os dois `MultiSelect` da barra do recorte fecham o próprio menu no Escape, e o listener deles
   * mora no `document`, igual ao do `ui/Modal`. Sem esta guarda, um Escape para fechar a lista de
   * opções leva o painel inteiro junto, e quem estava filtrando perde o contexto por um gesto que
   * pedia só para fechar um menu. MEDIDO NA 3120, e foi assim que o defeito apareceu.
   *
   * ┌─ POR QUE UM REF NA CAPTURA, E NÃO UMA PERGUNTA AO DOCUMENTO NA HORA DE FECHAR ────────────┐
   * │ A PRIMEIRA VERSÃO PERGUNTAVA AO DOM dentro do `onClose` (`querySelector('[role=listbox]')`)│
   * │ e NÃO FUNCIONOU, medido: quando aquela linha rodava, o popover JÁ TINHA SIDO REMOVIDO.     │
   * │ O motivo é do HTML, não do React: entre dois listeners do MESMO evento a pilha de execução  │
   * │ esvazia, e o checkpoint de microtarefas roda ali, então a atualização que o `MultiSelect`   │
   * │ agendou é aplicada ANTES do listener seguinte. Perguntar depois é sempre tarde.            │
   * │                                                                                            │
   * │ NA CAPTURA NÃO HÁ ESSA CORRIDA: o `document` é o PRIMEIRO nó do caminho na descida, antes   │
   * │ do alvo e antes de qualquer listener de bolha. Ali o popover ainda está inteiro no          │
   * │ documento, e o que se guarda é a resposta daquele instante.                                │
   * └────────────────────────────────────────────────────────────────────────────────────────────┘
   *
   * O `MultiSelect` É COMPARTILHADO POR 8 TELAS e não foi tocado (§A.26): a guarda inteira vive
   * aqui dentro, e nenhuma outra tela muda de comportamento por causa dela.
   */
  const popoverAbertoNoEscape = useRef(false);
  useEffect(() => {
    function aoDescer(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      popoverAbertoNoEscape.current = Boolean(document.querySelector('[role="listbox"]'));
    }
    document.addEventListener("keydown", aoDescer, true);
    return () => document.removeEventListener("keydown", aoDescer, true);
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const painel = await painelDaVaga(vaga.id, token);
      setCandidaturas(painel.candidaturas);
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar os candidatos desta vaga."));
    } finally {
      setCarregando(false);
    }
  }, [vaga.id, token]);

  /*
   * UMA CONSULTA SÓ PARA AS DUAS ABAS. A lista de alocados é um RECORTE da mesma resposta, filtrado
   * por `finalizaPosicao`, e não uma segunda leitura: duas consultas para o mesmo dado dariam duas
   * fotografias, tiradas em instantes diferentes, que é como uma aba passa a discordar da outra.
   */
  useEffect(() => {
    if (precisaDaLista && candidaturas === null && !carregando && erro === null) void carregar();
  }, [precisaDaLista, candidaturas, carregando, erro, carregar]);

  /**
   * O QUE ACONTECE DEPOIS DE QUALQUER AÇÃO QUE ESCREVE, em um lugar só: fecha o que estava aberto,
   * relê a lista desta vaga e avisa a Central de Vagas.
   *
   * UMA FUNÇÃO SÓ PARA AS CINCO AÇÕES, e não um `onFeito` escrito em cada uma: a que esquecesse o
   * `onMudou` deixaria o cilindro da tabela parado enquanto a lista aqui dentro já tivesse andado, e
   * esse tipo de esquecimento não falha, só mente.
   */
  function aposAcao() {
    setAlocarAberto(false);
    setCadastrarAberto(false);
    setMoverAlvo(null);
    setFinalizarAlvo(null);
    // A SELEÇÃO MORRE COM A AÇÃO: as linhas que ela apontava acabaram de mudar de estado, e manter
    // as marcas convidaria a repetir o lote sobre um retrato que já não é o da tela.
    setSelecionados([]);
    void carregar();
    onMudou();
  }

  const lista = candidaturas ?? [];
  const alocados = lista.filter((c) => finalizaPosicao(c.situacao));

  /**
   * ─ A LISTA DA ABA, ANTES DO RECORTE ────────────────────────────────────────────────────────
   * A aba de alocados JÁ É um recorte (só quem entregou posição), e o filtro opera DENTRO dele,
   * nunca por cima: escolher uma situação ali não pode trazer de volta quem a aba exclui.
   */
  const baseDaAba = aba === "alocados" ? alocados : lista;
  /** O QUE A TABELA DESENHA: a base da aba depois da busca e dos dois filtros. */
  const visiveis = aplicarRecorte(baseDaAba, recorte);

  /**
   * ─ AS LINHAS MARCADAS, RESOLVIDAS NO QUE ESTÁ À VISTA (e não mais na lista inteira) ─────────
   *
   * ESTA LINHA É A REGRA CENTRAL DA FRENTE, e ela mudou de `lista` para `visiveis` de propósito.
   * Antes dos filtros as duas eram a mesma coisa, porque a seleção morria na troca de aba e não
   * havia outro jeito de esconder linha. Com busca e filtro passa a haver, e aí a diferença é o
   * bug: marcar 8, filtrar para 2 e agir mandaria os 8 para o servidor, SEIS DELES INVISÍVEIS.
   *
   * É `selecaoNoRecorte` quem responde, com teste, e ela é usada nos DOIS sentidos: aqui para
   * DERIVAR o que vai para a ação em massa (nem um estado atrasado consegue mandar id invisível),
   * e no efeito logo abaixo para PODAR o estado (o contador não guarda fantasma). Uma sozinha não
   * fecha: a derivação deixaria a marca escondida voltar ao limpar o filtro, e a poda depende de um
   * efeito rodar na hora certa.
   */
  /**
   * AS OPÇÕES DE ETAPA: só as ATIVAS do catálogo, na ordem do funil, mais as INATIVAS que ainda
   * aparecem nas linhas desta aba.
   *
   * A SEGUNDA METADE NÃO É ZELO: etapa inativada some do catálogo ativo e continua escrita nas
   * candidaturas antigas, que seguem sendo desenhadas na tabela com o rótulo dela. Sem elas, a
   * coluna mostraria uma pill que o filtro não sabe procurar, e quem visse "Entrevista Cliente" na
   * tela não a acharia na lista de opções.
   */
  const etapasDoFiltro = etapasOrdenadas(catalogoEtapas).filter(
    (e) => e.ativa || baseDaAba.some((c) => candidaturaViva(c.situacao) && c.etapa === e.codigo),
  );

  const idsNoRecorte = selecaoNoRecorte(selecionados, visiveis);
  const selecionadas = visiveis.filter((c) => idsNoRecorte.includes(c.id));

  /**
   * ─ A PODA DO ESTADO, NO ÚNICO MOMENTO EM QUE UMA LINHA PODE SAIR DA VISTA ───────────────────
   *
   * TODA MUDANÇA DE RECORTE PASSA POR AQUI, e é de propósito que não existe um efeito observando a
   * lista: o efeito precisaria de uma chave derivada dos ids para não rodar a cada render, e uma
   * poda que depende da ordem em que um efeito acorda é exatamente o tipo de garantia que falha
   * calada. Aqui a poda acontece NO MESMO gesto que escondeu a linha, com o recorte novo na mão.
   *
   * SEM ELA, filtrar esconderia a marca sem desmarcá-la, e limpar o filtro faria o contador da
   * barra saltar sozinho, com gente que ninguém marcou naquele recorte.
   */
  function mudarRecorte(proximo: RecorteDoPainel) {
    setRecorte(proximo);
    const aindaVisiveis = aplicarRecorte(baseDaAba, proximo);
    setSelecionados((atuais) => selecaoNoRecorte(atuais, aindaVisiveis));
  }

  function alternarSelecao(id: string) {
    setSelecionados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  /**
   * "SELECIONAR TODOS" OPERA SOBRE O QUE ESTÁ À VISTA, nunca sobre a lista inteira: os ids chegam da
   * própria tabela, já filtrados pela aba e na ordem em que ela está mostrando. Desmarcar tira SÓ os
   * visíveis, pelo mesmo motivo com o sinal trocado (é a régua do Alto Volume, palavra por palavra).
   */
  function alternarTodos(idsVisiveis: string[]) {
    const todosMarcados =
      idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.includes(id));
    setSelecionados((atual) =>
      todosMarcados
        ? atual.filter((id) => !idsVisiveis.includes(id))
        : [...new Set([...atual, ...idsVisiveis])],
    );
  }
  const titulo = vaga.nomeDivulgacao ?? "Vaga Sem Nome De Divulgação";
  /**
   * A VAGA QUE NÃO RECEBE CANDIDATO NOVO NEM OFERECE O BOTÃO (trava 2 do backend).
   *
   * A PERGUNTA PASSOU A SER O FLAG `recebeCandidato` DO CATÁLOGO (onda B2), e não mais a negação de
   * "encerrada": os dois valiam o mesmo nos cinco status fixos e DESCOLAM no primeiro status que o
   * diretor criar. Uma vaga pausada não capta gente nova e continua viva.
   */
  const recebeCandidato = vagaRecebeCandidato(vaga.status, catalogoStatus);

  return (
    /* ─ §A.20, A LARGURA DO PAINEL, MEDIDA E NÃO ESTIMADA (ajuste 2 de 10/09) ─────────────────
       O QUE O DIRETOR VIU ("o modal esconde a coluna de Ações") NÃO ERA SOBREPOSIÇÃO da tabela de
       baixo: era a tabela DE DENTRO do modal cortada. Com 1040px de painel, a área útil da lista
       era de 990px (1040 menos os 48px de `px-6` do miolo) e o conteúdo da lista pedia 1006,92px na
       aba de candidatos e 1008,08px na de alocados, medidos com doze candidaturas de nome real.
       Sobravam 17px e 18px de rolagem horizontal, e a coluna que ficava do lado de fora era
       exatamente AÇÕES, a última. No navegador de verdade o corte é maior: o miolo rola na vertical,
       e a barra do `ea-scroll` come mais 10px.

       1120px FECHA A CONTA COM FOLGA: 1120 menos 48 de respiro menos 10 da barra vertical dá
       1062px de área útil contra os 1008px que o conteúdo pede, e a lista volta a repartir a sobra
       entre as colunas em vez de ficar toda no piso.

       EM TELA MENOR NADA QUEBRA: o painel é `w-full` com teto, então abaixo do teto mais os 16px de
       respiro do overlay de cada lado ele encolhe junto com a tela e a lista volta a rolar na
       horizontal, que é o comportamento que o §A.12 manda ("rola em vez de espremer"). Modal largo
       demais para a janela nunca acontece.

       ─ §A.20, O TETO SUBIU DE 1120px PARA 1280px (peça 3 da onda B3), E FOI A BARRA QUE PEDIU ───
       As quatro ações da vaga vieram para a linha das abas, e a linha passou a pedir mais do que o
       painel tinha. MEDIDO NO BROWSER, na vaga ABERTA (a que oferece as quatro), a 1600px: os oito
       filhos da barra somam 1056,6px, mais 56px dos sete intervalos e 8px das margens da divisória,
       dá 1120,6px de conteúdo. Com o teto antigo sobravam 1072px úteis (1120 menos os 48px de
       `px-6`), e o "Clonar vaga" caía sozinho numa segunda linha: um botão órfão embaixo de sete.

       O NÚMERO NÃO É 1169px, QUE SERIA O QUE FECHA A CONTA DE HOJE, e a folga tem dois donos
       concretos. O primeiro são as CONTAGENS das abas, que só nascem depois de a lista chegar e
       engordam duas das três (a barra que cabe com o painel recém-aberto voltaria a quebrar três
       segundos depois, que é o pior jeito de não caber). O segundo é o "Reabrir vaga" da peça 2: ele
       aparece na vaga CANCELADA, onde fechar, cancelar e editar posições não aparecem, então não é
       ele o caso mais largo, mas contar com zero folga é escolher refazer a medição na frente
       seguinte. Com 1280px sobram 1232px úteis contra os 1120,6px pedidos, e a barra fecha em UMA
       linha com folga real.

       A LISTA DE DENTRO SÓ TEM A GANHAR: ela pedia 1008px e recebia 1062px; agora recebe 1222px, e
       volta a repartir a sobra entre as colunas em vez de ficar no piso. O teto mais alto não
       aperta nada, ele só deixa de apertar. */
    /* O `onClose` DAQUI É SÓ A TECLA ESCAPE (o clique fora não fecha, §A.41), e por isso ele é o
       lugar certo da guarda: com uma caixa por cima, o Escape é dela, e o painel fica onde está. O
       "Fechar" do rodapé continua chamando `onClose` direto, sem guarda nenhuma. */
    <Modal
      onClose={() => {
        if (temModalPorCima) return;
        /* O ESCAPE QUE PERTENCE AO POPOVER DO FILTRO, E NÃO AO PAINEL. A resposta foi colhida na
           CAPTURA, antes de o popover ter chance de sumir: ver `popoverAbertoNoEscape`, acima. */
        if (popoverAbertoNoEscape.current) return;
        onClose();
      }}
      className="max-w-[1280px] p-0"
      ariaLabel="Painel da vaga"
    >
      <div className="flex max-h-[88vh] flex-col">
        {/* ── TOPO FIXO: quem é a vaga e em que pé ela está ───────────────── */}
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">{titulo}</h2>
            <StatusPill
              tone={tomDoStatusVaga(vaga.status, catalogoStatus)}
              label={rotuloDoStatusVaga(vaga.status, catalogoStatus)}
            />
            {/* ─ MOVER O STATUS À MÃO (onda B2): O GESTO FICA COLADO NA PILL ──────────────────
                ELE MORA AQUI, E NÃO NA COLUNA AÇÕES DA TABELA, e a razão é medida: aquela coluna já
                carrega cinco gestos e a tabela já estoura a largura útil (§A.20). Um sexto botão
                pioraria o aperto de toda a Central de Vagas para servir a um gesto que é do PAINEL
                de UMA vaga. Ao lado da pill, ele fica exatamente onde a pessoa está olhando quando
                pensa "esta vaga precisa mudar de estado", e o estado atual está ali do lado.

                NOTA DE 11/09 (peça 3 da onda B3): o PARÊNTESE acima envelheceu, a DECISÃO não. A
                coluna Ações não carrega mais cinco gestos, porque eles vieram para a barra das abas
                logo abaixo, então o argumento do aperto deixou de valer. Este botão continua AQUI,
                colado na pill, e isso é escolha e não esquecimento: o pedido do diretor foi mover os
                gestos DA LINHA DA TABELA, e este nunca esteve lá. Levá-lo para a barra por conta
                própria seria mexer em código validado que ninguém pediu (§A.14/§A.31); a proposta
                foi registrada no relatório da peça, para o diretor decidir.

                ELE SÓ APARECE ONDE TEM O QUE FAZER (`podeMoverStatusDaVaga`): a vaga ENCERRADA não
                sai por aqui (reabrir é desfazer um encerramento, com régua própria) e o RASCUNHO
                também não (ele publica pela trilha de abertura, que confere os obrigatórios; o
                backend recusa este caminho com todas as letras). Botão que só sabe dar 409 é ruído,
                e o consultor aprende a ignorar a tela.

                §A.24: é AÇÃO, então escrita normal. */}
            {podeMoverStatusDaVaga(vaga.status, catalogoStatus) && (
              <button
                type="button"
                onClick={() => setMoverStatusAberto(true)}
                title="Mover esta vaga para outro status do catálogo. Não encerra a vaga: fechar e cancelar continuam sendo as únicas portas para isso."
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-2.5 py-[3px] text-[11.5px] font-semibold text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
              >
                <Icon name="arr" className="h-[11px] w-[11px]" />
                Mover status
              </button>
            )}
          </div>
          {/* A LINHA DE IDENTIFICAÇÃO É A MESMA DE ANTES, palavra por palavra (§A.14): ela é o único
              lugar da tela em que a data de abertura e quem abriu aparecem, e reescrevê-la para
              caber cliente e cargo (que a ficha já mostra) apagaria os dois. */}
          <p className="mt-1 text-[12.5px] text-dim">
            Código {vaga.codigo ?? "não informado"}. Aberta em {dataBr(vaga.dataAbertura)} por{" "}
            {vaga.abertoPorNome ?? "não informado"}.
          </p>

          {/* ── A TRILHA: OS DOIS EIXOS, LADO A LADO E NUNCA EM FILA ─────────
              Um em cima do outro pareceria sequência ("primeiro o processo, depois o desfecho"), e
              a régua diz o contrário: eles andam independentes. Lado a lado, a leitura é a que o
              desenho pede, "o processo está assim, e o desfecho está assado". */}
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <LadoTrilha
              titulo="Processo Seletivo"
              rotulo={trilha.processo.rotulo}
              tom={trilha.processo.tom}
              frase={trilha.processo.frase}
            />
            <LadoTrilha
              titulo="Desfecho"
              rotulo={trilha.desfecho.rotulo}
              tom={trilha.desfecho.tom}
              frase={trilha.desfecho.frase}
            />
          </div>

          {/* ── A TRILHA DO FECHAMENTO FORÇADO ────────────────────────────────
              SÓ APARECE QUANDO ALGUÉM FORÇOU, que é a exceção e não o normal: a imensa maioria das
              vagas fecha com as posições oficiais preenchidas e não tem nada a mostrar aqui. Uma
              linha vazia dizendo "não foi forçada" acrescentaria ruído em todas as vagas para
              informar sobre nenhuma.

              ELA FICA ABAIXO DOS DOIS EIXOS, E NÃO DENTRO DO "Desfecho", porque não é o estado da
              vaga: é COMO o estado foi alcançado. Dentro do card ela competiria com a frase que
              explica o desfecho; embaixo, ela qualifica os dois.

              §A.6: nome de usuário INTERNO, data e um número de posições. Nenhum dado de candidato. */}
          {vaga.fechamentoForcado && (
            <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                <span className="font-semibold text-text">Fechamento Forçado. </span>
                {fraseDoFechamentoForcado(
                  vaga.fechamentoForcado,
                  dataHoraBr(vaga.fechamentoForcado.quandoIso),
                )}
              </span>
            </p>
          )}

          {/* ── A TRILHA DA META REDUZIDA ─────────────────────────────────────
              MESMO LUGAR E MESMO TRATAMENTO VISUAL DO FECHAMENTO FORÇADO, porque é a MESMA natureza
              de informação: nenhum dos dois é o estado da vaga, os dois dizem COMO o estado foi
              alcançado. Separá-los em caixas diferentes faria a mesma pergunta ("esta vaga fechou
              porque entregou, ou porque encolheram a meta?") ser respondida em dois lugares.

              O ARRAY VAZIO É O CASO COMUM E NÃO OCUPA ESPAÇO NENHUM: a imensa maioria das vagas
              nunca teve a meta reduzida, e uma linha dizendo "a meta nunca mudou" acrescentaria
              ruído em todas para informar sobre nenhuma.

              TODAS AS REDUÇÕES APARECEM, da mais antiga para a mais recente, na ordem em que o
              contrato entrega. Guardar só a última contaria uma história falsa: quem baixou de 5
              para 3 e depois de 3 para 1 apareceria como quem baixou de 3 para 1.

              §A.6: nome de usuário INTERNO, data e quatro números de posições. Nenhum dado de
              candidato. */}
          {vaga.metaReducoes.length > 0 && (
            <p className="mt-2.5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12.5px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                <span className="font-semibold text-text">Meta Reduzida. </span>
                {vaga.metaReducoes.map((r, i) => (
                  <span key={`${r.quandoIso}-${i}`} className={i === 0 ? undefined : "mt-1 block"}>
                    {fraseDaReducaoDeMeta(r, dataHoraBr(r.quandoIso))}
                  </span>
                ))}
              </span>
            </p>
          )}

          {/* ── AS ABAS E AS AÇÕES, NA MESMA BARRA ───────────────────────────
              CENTRALIZADAS e PREENCHIDAS (decisão do diretor): elas são o caminho para tudo o que
              este modal oferece, então parecem botão de trabalho. O desenho e o porquê estão em
              `ABA_BASE`/`ABA_ATIVA`/`ABA_INATIVA`, no topo do arquivo, com os tokens dos dois temas.
              A contagem só aparece depois de a lista chegar, porque antes disso ela seria um número
              inventado.

              AS AÇÕES DA VAGA ENTRAM À DIREITA, no mesmo formato e separadas por uma divisória (o
              porquê de cada sinal está em `ACAO_BASE`, no topo). Elas vêm prontas da Central de
              Vagas: esta barra desenha o que receber, e é por isso que ela não tem número de
              lugares. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {ABAS.map((a) => {
              /* A CONTAGEM DA ABA É A DA LISTA INTEIRA, e continua sendo mesmo com filtro ligado:
                 ela responde "quanta gente esta vaga tem", que não muda porque alguém digitou algo
                 na busca. Quantos estão À VISTA é dito na barra do recorte, logo abaixo, onde a
                 pergunta é outra. Trocar este número pelo do recorte faria a aba mentir sobre o
                 tamanho da vaga. */
              const conta =
                candidaturas === null
                  ? null
                  : a.id === "candidatos"
                    ? lista.length
                    : a.id === "alocados"
                      ? alocados.length
                      : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  className={cn(ABA_BASE, aba === a.id ? ABA_ATIVA : ABA_INATIVA)}
                  onClick={() => {
                    setAba(a.id);
                    // Trocar de aba troca o recorte à vista, e seleção que sobrevive ao recorte é
                    // seleção invisível. Ver o comentário de `selecionados`.
                    setSelecionados([]);
                    // E O FILTRO VAI JUNTO: cada aba tem o SEU recorte. Um filtro herdado esconderia
                    // linha na aba nova sem que ninguém o tivesse escolhido ali.
                    setRecorte(RECORTE_VAZIO);
                  }}
                  aria-pressed={aba === a.id}
                >
                  <Icon name={a.icone} className="h-3.5 w-3.5 flex-none" />
                  {a.rotulo}
                  {/* A CONTAGEM SEGUE O FUNDO DA ABA: no gradiente da ativa ela é branca com
                      transparência, e no fundo claro da inativa ela é o tom apagado de sempre. Um
                      `text-faint` fixo sumiria por cima do azul, que é o jeito de um número virar
                      decoração sem ninguém perceber. */}
                  {conta !== null && (
                    <span
                      className={cn(
                        "tabular-nums",
                        aba === a.id ? "text-white/85" : "text-faint",
                      )}
                    >
                      {conta}
                    </span>
                  )}
                </button>
              );
            })}

            {/* A DIVISÓRIA, e ela só existe quando há os dois lados: numa vaga sem ação nenhuma
                (a encerrada de hoje), um risco solto no fim da barra separaria coisa de nada. É a
                mesma hairline `--border` das colunas de tabela (§A.12), e é decorativa, então sai
                da árvore de acessibilidade. */}
            {acoes.length > 0 && (
              <span
                aria-hidden="true"
                className="mx-1 h-9 w-px flex-none self-center bg-[var(--border)]"
              />
            )}

            {acoes.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.descricao}
                aria-label={a.descricao}
                onClick={a.onClick}
                className={cn(ABA_BASE, a.perigo ? ACAO_PERIGO : ACAO_BASE)}
              >
                <Icon name={a.icone} className="h-3.5 w-3.5 flex-none" />
                {a.rotulo}
              </button>
            ))}
          </div>
        </div>

        {/* ── MIOLO ROLANTE ───────────────────────────────────────────────── */}
        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {aba === "vaga" && children}

          {precisaDaLista && (
            <>
              {erro && (
                <p
                  className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
                  role="alert"
                >
                  {erro}
                </p>
              )}
              {carregando && (
                <p className="text-[13px] text-faint">Carregando quem está nesta vaga.</p>
              )}
              {/* ─ A BARRA DE AÇÕES DA VAGA, só na aba da lista completa ────────────────────
                  Ela não aparece na aba de alocados de propósito: lá a lista é o RECORTE de quem já
                  entregou posição, e trazer alguém novo não é uma operação daquele recorte, é da
                  vaga. Repetir os botões nas duas abas faria a mesma ação parecer duas.

                  DOIS CAMINHOS, PORQUE SÃO DUAS SITUAÇÕES DIFERENTES: a pessoa já está na base (e aí
                  é procurar) ou ainda não está (e aí é cadastrar). Um botão só obrigaria a procurar
                  antes de descobrir que não tem quem procurar, que é justamente o caminho mais comum
                  na captação. Os dois abrem os modais da Central de Candidatos, com ESTA vaga já
                  escolhida. */}
              {aba === "candidatos" && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12.5px] text-dim">
                    {recebeCandidato
                      ? "Traga alguém para esta vaga procurando na base ou cadastrando na hora."
                      : /* O RÓTULO É O DO CATÁLOGO (onda B2): a frase diz o nome que o diretor
                           escreveu, e não um rótulo fixo que ficaria desatualizado na primeira
                           renomeação. Status desconhecido cai no código cru, nunca em vazio. */
                        `Esta vaga está em ${rotuloDoStatusVaga(vaga.status, catalogoStatus)} e não recebe candidato novo. A lista abaixo continua consultável.`}
                  </p>
                  {recebeCandidato && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        className="px-3.5 py-2"
                        onClick={() => setCadastrarAberto(true)}
                      >
                        <Icon name="plus" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                        Cadastrar candidato
                      </Button>
                      <Button className="px-3.5 py-2" onClick={() => setAlocarAberto(true)}>
                        <Icon name="users" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                        Adicionar à vaga
                      </Button>
                      {/* ─ O TERCEIRO CAMINHO: TRAZER VÁRIOS DE UMA VEZ (grupo 1) ──────────────
                          Ele NÃO substitui o "Adicionar à vaga" ao lado, que continua sendo o
                          caminho de uma pessoa só, com a pergunta da reentrada e a escolha da vaga.
                          Este é o de captação em volume: marca-se a lista inteira e o backend
                          responde quem entrou e quem não entrou.

                          O RÓTULO DIZ "FUNIL" DE PROPÓSITO, e é a separação que o diretor pediu:
                          este botão NÃO consome posição da meta. Quem entrega a posição é
                          "Finalizar posição", que só aparece com linhas marcadas, na barra da
                          seleção, e é a ação que consome. */}
                      <Button
                        variant="secondary"
                        className="px-3.5 py-2"
                        title="Traz várias pessoas para o funil de uma vez. Não consome posição da meta."
                        onClick={() => setAdicionarLoteAberto(true)}
                      >
                        <Icon name="layers" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                        Adicionar vários ao funil
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ─ A BARRA DAS AÇÕES EM MASSA ─────────────────────────────────────────────────
                  SEMPRE MONTADA junto com a lista, nas DUAS abas, e não só quando há seleção: é ela
                  que guarda o RESULTADO do último lote, e o resultado precisa sobreviver à limpeza
                  da seleção que acontece logo depois de aplicar. Ela mesma se esconde quando não há
                  nada marcado.

                  AS AÇÕES OFERECIDAS DEPENDEM DO QUE ESTÁ MARCADO, pelas mesmas réguas dos ícones de
                  cada linha, então a aba de alocados simplesmente não mostra "Finalizar posição".

                  ─ E ELA NÃO PODE FICAR ATRÁS DO `!carregando`, medido na homologação ─────────────
                  A primeira versão a montava junto da tabela, dentro do mesmo `!carregando && ...`.
                  O resultado do lote NUNCA APARECIA: aplicar o lote chama `aposAcao`, que dispara
                  `carregar()`, e o `carregando` derruba o componente inteiro no mesmo instante em que
                  ele acabou de guardar o resultado. O estado morre com o desmonte, e a tela volta
                  como se nada tivesse acontecido, que é exatamente o "toast dizendo pronto" que esta
                  frente existe para não fazer. Montada sempre, ela atravessa a releitura. */}
              <AcoesEmMassaDaVaga
                vaga={vaga}
                selecionadas={selecionadas}
                token={token}
                onLimpar={() => setSelecionados([])}
                onFeito={aposAcao}
              />

              {/* ─ A BARRA DO RECORTE: buscar, filtrar, e então agir sobre o que apareceu ────
                  Ela fica ACIMA da barra de seleção e da tabela porque é a ordem do gesto que o
                  diretor descreveu: "buscar/filtrar, selecionar os que aparecem, agir em massa".
                  Abaixo da tabela ela chegaria depois da decisão.

                  ELA APARECE NAS DUAS ABAS, e só some enquanto não há lista carregada: filtro sobre
                  o nada é um controle que não faz nada.

                  NENHUM COMPONENTE NOVO DE FILTRO NASCEU AQUI: os dois são o `MultiSelect` do design
                  system, o mesmo de outras 8 telas, que já traz busca interna e chips (§A.28/§A.35).
                  A busca por nome é o `input type="search"` com `ds-input`, o mesmo padrão da
                  Central de Vagas. */}
              {!carregando && !erro && candidaturas !== null && (
                <BarraDoRecorte
                  recorte={recorte}
                  onMudar={mudarRecorte}
                  /* AS OPÇÕES DE SITUAÇÃO SAEM DO VOCABULÁRIO, e na aba de alocados são recortadas
                     pela MESMA régua que define a aba (`finalizaPosicao`). Oferecer "Descartado" num
                     recorte onde ele nunca aparece seria uma opção que só sabe devolver lista vazia.
                     Nenhuma lista nova de situação é escrita: é `CANDIDATURA_SITUACOES` filtrada
                     pela régua que já existe. */
                  situacoes={
                    aba === "alocados"
                      ? CANDIDATURA_SITUACOES.filter(finalizaPosicao)
                      : CANDIDATURA_SITUACOES
                  }
                  etapas={etapasDoFiltro}
                  /* O VALOR ESPECIAL DA COLUNA (§A.37) SÓ É OFERECIDO ONDE ELE PODE ACONTECER: na
                     aba de alocados toda linha está viva (quem entrega posição não é saída sem
                     êxito), então "Fora Do Funil" ali seria opção morta. A pergunta é feita ao
                     vocabulário, e não a uma lista escrita à mão. */
                  incluirForaDoFunil={
                    aba === "alocados"
                      ? CANDIDATURA_SITUACOES.filter(finalizaPosicao).some((x) => !candidaturaViva(x))
                      : true
                  }
                  quantosAVista={visiveis.length}
                  totalDaAba={baseDaAba.length}
                />
              )}

              {!carregando && !erro && candidaturas !== null && (
                <TabelaCandidaturas
                  /* O QUE A TABELA DESENHA É O RECORTE, e é daqui que sai o "selecionar todos": ela
                     recebe só o que está à vista, então o gesto de marcar tudo nunca alcança linha
                     escondida por busca ou filtro. */
                  itens={visiveis}
                  /* A COLUNA DE POSIÇÃO SÓ EXISTE NA ABA DE ALOCADOS (grupo 2), e é o recorte que
                     lhe dá sentido: lá, todo mundo ocupa uma posição, e a pergunta "oficial ou
                     banco?" é a que a aba existe para responder. Na lista completa, a esmagadora
                     maioria das linhas está no funil sem ocupar posição nenhuma, e a coluna seria
                     uma fileira de "não informado" tomando largura de quem tem texto. */
                  mostrarPosicao={aba === "alocados"}
                  /* A FRASE DE APOIO SEGUE FALANDO DA ABA INTEIRA, e não do recorte: ela é o
                     retrato da vaga ("51 candidaturas, sendo 51 ainda no processo"), e trocá-la
                     pelo número filtrado faria a mesma frase dizer coisas diferentes conforme o
                     que estivesse digitado na busca. Quantos estão à vista é dito na barra acima. */
                  apoio={
                    aba === "candidatos"
                      ? frasePainel(lista)
                      : "Quem preencheu uma posição desta vaga, contado pela situação da candidatura."
                  }
                  /* ─ DUAS AUSÊNCIAS DIFERENTES, DUAS FRASES DIFERENTES ──────────────────────
                     "Esta vaga não tem ninguém" e "o seu filtro escondeu todo mundo" são fatos
                     opostos, e a segunda tem saída: limpar. Dizer a primeira quando a verdade é a
                     segunda faz a pessoa procurar um problema que não existe. */
                  /* O BOTÃO DE LIMPAR NÃO SE REPETE AQUI, e a primeira versão repetia: ele já
                     está na barra do recorte, a sessenta pixels acima, e dois botões idênticos
                     empilhados leem como defeito. A barra é a casa dele, porque ela o oferece
                     SEMPRE que há recorte, com a lista cheia ou vazia; aqui ficaria só no caso
                     vazio, e a pessoa aprenderia dois lugares para o mesmo gesto. */
                  vazio={
                    recorteAtivo(recorte) ? (
                      `Nenhuma das ${baseDaAba.length} ${baseDaAba.length === 1 ? "candidatura" : "candidaturas"} desta aba passa pelo recorte atual. Ajuste a busca e os filtros acima, ou limpe o recorte.`
                    ) : aba === "candidatos" ? (
                      "Ninguém foi vinculado a esta vaga ainda."
                    ) : (
                      "Ninguém foi marcado como alocado nesta vaga ainda."
                    )
                  }
                  selecionados={selecionados}
                  onAlternar={alternarSelecao}
                  onAlternarTodos={alternarTodos}
                  onFicha={(c) => setFichaId(c.candidatoId)}
                  onMover={(c) => setMoverAlvo(c)}
                  onFinalizar={(c) => setFinalizarAlvo(c)}
                />
              )}
            </>
          )}
        </div>

        {/* ── RODAPÉ ──────────────────────────────────────────────────────────
            SÓ "Fechar". O clone da vaga vive na coluna Ações da Central de Vagas, e repeti-lo aqui
            era o MESMO `clonarVaga` chamado de dois lugares (decisão do diretor, 08/09/2026). */}
        <div className="flex flex-none items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      {/* ─ OS MODAIS DAS AÇÕES, SOBREPOSTOS AO PAINEL ────────────────────────────────────────
          Sobrepor, e não navegar, é a régua que a Central de Candidatos já usa (o "Ver vaga" da
          ficha virou modal por cima pelo mesmo motivo): navegar custa o contexto inteiro, e voltar
          obriga a reabrir a vaga, achar a aba e reencontrar a pessoa. Fechar devolve o painel do
          jeito que ele estava, com a aba e a ordenação preservadas.

          TODOS CHAMAM `aposAcao`, que relê a lista e avisa a Central de Vagas. */}
      {/* O MOVIMENTO DE STATUS DA VAGA. Ele NÃO chama `aposAcao`: nenhuma candidatura mudou, então
          reler a lista de gente seria trabalho à toa. O que precisa saber é a Central de Vagas, que
          desenha a pill, o cilindro (a vaga pode ter deixado de ser contada pela derivada) e o
          contador de dias, e é ela que `onMudou` avisa. O painel FECHA no sucesso, de propósito: a
          `vaga` que ele recebeu por prop é a fotografia antiga, com o status de antes, e deixá-lo
          aberto mostraria o cabeçalho velho até alguém reabrir. */}
      {moverStatusAberto && (
        <MoverStatusVagaModal
          vaga={vaga}
          catalogo={catalogoStatus}
          token={token}
          onClose={() => setMoverStatusAberto(false)}
          onMovido={() => {
            setMoverStatusAberto(false);
            onMudou();
            onClose();
          }}
        />
      )}

      {alocarAberto && (
        <AlocarCandidatoModal
          /* SÓ ESTA VAGA NA LISTA, e ela já vem escolhida: o painel é de UMA vaga, e oferecer as
             outras aqui seria abrir, de dentro do painel de uma vaga, a alocação em outra. */
          vagasAbertas={[vaga]}
          vagaSugerida={vaga.id}
          token={token}
          onClose={() => setAlocarAberto(false)}
          onAlocado={aposAcao}
        />
      )}

      {cadastrarAberto && (
        <NovoCandidatoModal
          vagasAbertas={[vaga]}
          vagaSugerida={vaga.id}
          token={token}
          onClose={() => setCadastrarAberto(false)}
          onSalvo={aposAcao}
        />
      )}

      {/* ADICIONAR VÁRIOS AO FUNIL: a versão em massa do "Adicionar à vaga", com a lista de quem
          está disponível na base e a seleção múltipla. Ela NÃO consome posição da meta. */}
      {adicionarLoteAberto && (
        <AdicionarCandidatosEmLoteModal
          vaga={vaga}
          token={token}
          onClose={() => setAdicionarLoteAberto(false)}
          /* NÃO FECHA SOZINHO: quem adicionou trinta pessoas costuma adicionar mais, e o resultado
             do lote é lido por cima desta mesma caixa. O que ele faz é reler a lista da vaga e
             avisar a Central de Vagas, que é o que `aposAcao` já garante. */
          onFeito={aposAcao}
        />
      )}

      {moverAlvo && (
        <MoverCandidaturaModal
          candidatura={moverAlvo}
          token={token}
          onClose={() => setMoverAlvo(null)}
          onFeito={aposAcao}
        />
      )}

      {finalizarAlvo && (
        <FinalizarPosicaoModal
          candidatura={finalizarAlvo}
          vaga={vaga}
          token={token}
          onClose={() => setFinalizarAlvo(null)}
          onFeito={aposAcao}
        />
      )}

      {fichaId && (
        <FichaCandidatoModal
          candidatoId={fichaId}
          token={token}
          onClose={() => setFichaId(null)}
          /* A FICHA TAMBÉM ESCREVE (registra contato), então ela avisa pelo mesmo caminho. Ela NÃO
             fecha sozinha: quem abriu a ficha está lendo, e fechá-la a cada anotação tiraria a
             pessoa de onde ela está. */
          onMudou={() => {
            void carregar();
            onMudou();
          }}
          /* SÓ A VAGA DESTE PAINEL. A ficha usa o mapa para oferecer o "Ver vaga" de cada
             candidatura da pessoa, e desabilita o botão de quem não está no mapa: quem tem processo
             em outra vaga vê a linha, e o descritivo daquela outra continua na Central de Vagas. */
          vagaPorId={new Map([[vaga.id, vaga]])}
        />
      )}
    </Modal>
  );
}

/**
 * ─ A BARRA DO RECORTE: BUSCAR, FILTRAR, E SÓ ENTÃO AGIR ────────────────────────────────────────
 *
 * O diretor pediu gestão completa dentro dos dois cards, pensando no volume: busca por nome, filtro
 * por situação e filtro por etapa, convivendo com a seleção múltipla e as ações em massa que já
 * existem. Esta barra é a primeira metade do gesto ("buscar/filtrar"), e ela fica fisicamente antes
 * da barra de seleção e da tabela pela mesma razão.
 *
 * ─ NENHUM COMPONENTE NOVO NASCEU AQUI, e isso é a regra e não a economia ──────────────────────
 * Os dois filtros são o `MultiSelect` do design system (o mesmo de outras 8 telas, inclusive da
 * Central de Vagas atrás deste painel), que já traz busca interna, chips e marca/desmarca: §A.28
 * (todo filtro é múltiplo) e §A.35 (nada de seletor nativo) saem resolvidos por reuso. A busca por
 * nome é o `input type="search"` com `ds-input`, o mesmo padrão da busca daquela tela.
 *
 * §A.6: A BUSCA É POR NOME, e o CPF não tem como vazar porque não está aqui: a lista do painel não
 * carrega CPF, o filtro é CLIENTE sobre o que já foi carregado, e nenhum parâmetro novo entra em
 * URL nenhuma. O pedido do diretor vira impossível de violar, em vez de virar disciplina.
 *
 * §A.20: a barra QUEBRA em vez de espremer (`flex-wrap`), e os controles têm largura própria. Ela
 * não pode empurrar nem apertar a tabela que vem logo abaixo.
 * §A.24: os rótulos acima dos campos são etiquetas (title case); o botão é ação (escrita normal).
 */
function BarraDoRecorte({
  recorte,
  onMudar,
  situacoes,
  etapas,
  incluirForaDoFunil,
  quantosAVista,
  totalDaAba,
}: {
  recorte: RecorteDoPainel;
  onMudar: (r: RecorteDoPainel) => void;
  /** As situações que PODEM aparecer nesta aba, já recortadas pela régua da própria aba. */
  situacoes: readonly CandidaturaSituacao[];
  etapas: AsEtapaFunil[];
  /** "Fora Do Funil" é opção só onde ele pode acontecer (§A.37, valor especial da coluna). */
  incluirForaDoFunil: boolean;
  quantosAVista: number;
  totalDaAba: number;
}) {
  const ativo = recorteAtivo(recorte);
  const quantos = criteriosAtivos(recorte);

  const opcoesSituacao: MultiOption[] = situacoes.map((sit) => ({
    value: sit,
    label: CANDIDATURA_SITUACAO_LABEL[sit],
  }));
  const opcoesEtapa: MultiOption[] = [
    ...etapas.map((e) => ({ value: e.codigo, label: e.rotulo })),
    /* O VALOR ESPECIAL VAI POR ÚLTIMO, depois das etapas do funil: ele não é uma etapa, é a
       ausência dela, e misturá-lo na ordem do funil sugeriria que é mais um passo. */
    ...(incluirForaDoFunil
      ? [{ value: ETAPA_FORA_DO_FUNIL, label: "Fora Do Funil" }]
      : []),
  ];

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
      {/* §A.20: ALINHADOS PELO TOPO, e não pela base. Com `items-end` os três rótulos ficavam em
          alturas diferentes, porque o campo que tem chip escolhido é mais alto que os outros dois e
          empurrava o próprio rótulo para cima. Pelo topo, os rótulos formam uma linha só e os chips
          crescem para baixo, que é o lado onde há espaço. */}
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Buscar Por Nome</span>
          {/* §A.6: NOME, e o `title` diz isso com todas as letras. A lista deste painel não traz
              CPF, e a ficha continua sendo a única superfície do módulo que o mostra. */}
          <input
            type="search"
            className="ds-input"
            placeholder="Digite parte do nome"
            aria-label="Buscar candidato por nome nesta vaga"
            title="A busca procura pelo nome do candidato. O CPF não é usado aqui e não viaja em nenhum endereço."
            value={recorte.busca}
            onChange={(e) => onMudar({ ...recorte, busca: e.target.value })}
          />
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Situação</span>
          <MultiSelect
            values={recorte.situacoes}
            onChange={(v) => onMudar({ ...recorte, situacoes: v })}
            options={opcoesSituacao}
            placeholder="Todas as situações"
            ariaLabel="Filtrar por situação da candidatura"
          />
        </label>

        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-dim">Etapa</span>
          <MultiSelect
            values={recorte.etapas}
            onChange={(v) => onMudar({ ...recorte, etapas: v })}
            options={opcoesEtapa}
            placeholder="Todas as etapas"
            ariaLabel="Filtrar por etapa do funil"
          />
        </label>
      </div>

      {/* ─ O QUE O RECORTE ESTÁ FAZENDO, DITO EM NÚMERO ─────────────────────────────────────
          SÓ APARECE COM RECORTE LIGADO: sem filtro, "mostrando 51 de 51" é ruído em toda vaga.
          E ele é o ÚNICO lugar que fala do recorte: a contagem da aba, logo acima, continua sendo
          a da vaga inteira, porque é outra pergunta. */}
      {ativo && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5">
          <p className="text-[12px] text-dim">
            Mostrando <span className="font-semibold text-text">{quantosAVista}</span> de{" "}
            {totalDaAba} {totalDaAba === 1 ? "candidatura" : "candidaturas"} desta aba, com{" "}
            {quantos === 1 ? "1 critério" : `${quantos} critérios`}. A seleção e as ações em massa
            valem só para quem está à vista.
          </p>
          <Button
            variant="secondary"
            className="flex-none px-3 py-1.5 text-[12.5px]"
            onClick={() => onMudar(RECORTE_VAZIO)}
          >
            Limpar o recorte
          </Button>
        </div>
      )}
    </div>
  );
}

/** Quantas pessoas estão na vaga e quantas seguem no processo. Texto de apoio, escrita normal. */
function frasePainel(lista: AsCandidaturaItem[]): string {
  if (lista.length === 0) return "Nenhuma candidatura registrada nesta vaga.";
  const vivos = lista.filter((c) => candidaturaViva(c.situacao)).length;
  const total =
    lista.length === 1 ? "1 candidatura registrada" : `${lista.length} candidaturas registradas`;
  return `${total}, sendo ${vivos} ainda no processo. Quem já saiu continua na lista, como histórico.`;
}

/** Um eixo da trilha: o que ele responde, a etiqueta do estado e a frase que explica o estado. */
function LadoTrilha({
  titulo,
  rotulo,
  tom,
  frase,
}: {
  titulo: string;
  rotulo: string;
  tom: Parameters<typeof StatusPill>[0]["tone"];
  frase: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] uppercase tracking-wide text-faint">{titulo}</span>
        <StatusPill tone={tom} label={rotulo} />
      </div>
      <p className="text-[12.5px] leading-snug text-dim">{frase}</p>
    </div>
  );
}

/**
 * A TABELA DE CANDIDATURAS, uma só, usada pelas DUAS abas com listas diferentes.
 *
 * DUAS TABELAS SERIAM DUAS MANUTENÇÕES: a aba de alocados mostra exatamente as mesmas colunas, com
 * um recorte a menos de linhas, e a segunda cópia divergiria da primeira no primeiro ajuste de
 * largura.
 *
 * A ORDENAÇÃO ESCOLHIDA ATRAVESSA AS DUAS ABAS, e isso é consequência de ser uma tabela só: React
 * reaproveita a mesma instância ao trocar de aba, então a coluna ordenada continua ordenada do outro
 * lado. É coerente, porque as colunas são as mesmas, e evita que a lista de alocados volte à ordem
 * padrão toda vez que alguém alterna para conferir a lista completa.
 *
 * §A.20: a tabela tem largura mínima e rola DENTRO do próprio contêiner. Sem isso, ela espremeria a
 * coluna de situação, que carrega o rótulo mais longo do vocabulário ("Enviado Para Admissão").
 */
function TabelaCandidaturas({
  itens,
  apoio,
  vazio,
  mostrarPosicao,
  selecionados,
  onAlternar,
  onAlternarTodos,
  onFicha,
  onMover,
  onFinalizar,
}: {
  itens: AsCandidaturaItem[];
  apoio: string;
  /** É NÓ, e não texto: o vazio POR FILTRO carrega o botão de limpar junto com a frase. */
  vazio: ReactNode;
  /** A coluna do lado da posição (oficial ou banco). Só a aba de alocados a pede (grupo 2). */
  mostrarPosicao: boolean;
  selecionados: string[];
  onAlternar: (id: string) => void;
  /** Recebe os ids VISÍVEIS, na ordem em que estão sendo mostrados. Ver `alternarTodos`. */
  onAlternarTodos: (idsVisiveis: string[]) => void;
  /** Abre a ficha da PESSOA (é a única superfície do módulo que mostra CPF, §A.6). */
  onFicha: (c: AsCandidaturaItem) => void;
  onMover: (c: AsCandidaturaItem) => void;
  onFinalizar: (c: AsCandidaturaItem) => void;
}) {
  const { etapas } = useEtapas();
  /*
   * §A.29: ordenação pelo `useOrdenacao` que já existe, nunca à mão.
   *
   * ETAPA E SITUAÇÃO ORDENAM PELO CATÁLOGO, e não pelo rótulo em ordem alfabética: o funil tem uma
   * ordem de vida (Captação antes de Triagem antes de Aprovação), e ordenar por texto colocaria
   * "Aprovação" na frente de "Captação", dizendo o contrário do processo.
   *
   * QUEM SAIU DO FUNIL VAI PARA O FIM da ordenação por etapa, pela mesma razão de a coluna não
   * mostrar etapa nenhuma nesse caso: a etapa dele é memória, e não posição atual.
   */
  const colunas: ColOrd<AsCandidaturaItem>[] = [
    { chave: "candidato", tipo: "texto", valor: (c) => c.candidatoNome },
    /*
     * A POSIÇÃO ORDENA PELO CATÁLOGO (oficial antes de banco), e não pelo rótulo: alfabeticamente
     * "Posição De Banco" viria antes de "Posição Oficial", desenhando a reserva na frente da meta.
     * QUEM NÃO OCUPA POSIÇÃO VAI PARA O FIM, pelo mesmo motivo de a célula dizer "não informado":
     * ausência de posição não é uma posição, e misturá-la na ordem sugeriria que é.
     */
    {
      chave: "posicao",
      tipo: "status",
      valor: (c) => {
        const i = c.posicaoLado ? POSICAO_LADOS.indexOf(c.posicaoLado) : -1;
        return i === -1 ? POSICAO_LADOS.length : i;
      },
    },
    {
      chave: "etapa",
      tipo: "status",
      /*
       * A ORDEM VEM DA COLUNA `ordem` DO CATÁLOGO, e o `indexOf` que estava aqui saiu por dois
       * motivos, sendo o segundo o perigoso: (1) a lista virou dado do diretor, e reordenar o funil
       * na tela dele tem de reordenar esta coluna; (2) `indexOf` de quem não está na lista devolve
       * `-1`, e `-1` ordena ANTES da primeira etapa, então uma etapa desconhecida ou inativada
       * subiria ao TOPO do funil em vez de descer. `ordemDaEtapa` manda o desconhecido para o fim,
       * que é o mesmo lugar de quem já saiu do funil.
       */
      valor: (c) =>
        candidaturaViva(c.situacao)
          ? ordemDaEtapa(c.etapa, etapas)
          : Number.MAX_SAFE_INTEGER,
    },
    {
      chave: "situacao",
      tipo: "status",
      valor: (c) => CANDIDATURA_SITUACOES.indexOf(c.situacao),
    },
    { chave: "entrou", tipo: "data", valor: (c) => c.alocadoEm },
    { chave: "movimentou", tipo: "data", valor: (c) => c.atualizadoEm },
  ];
  const ord = useOrdenacao(colunas, itens);

  if (itens.length === 0) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 text-[13px] text-dim">
        {vazio}
      </p>
    );
  }

  /*
   * OS IDS VISÍVEIS SAEM DAQUI, e não da lista crua: `ord.itens` é o que a tabela está DESENHANDO,
   * já com o recorte da aba e a ordenação escolhida. É esse o conjunto sobre o qual o "selecionar
   * todos" opera, e por isso ele nasce no mesmo lugar que produz as linhas.
   *
   * ─ E ELES SÃO SÓ OS QUE ACEITAM DECISÃO (conserto E da onda B) ───────────────────────────────
   *
   * QUEM JÁ SAIU DO PROCESSO NÃO ENTRA NA SELEÇÃO. A caixa da linha encerrada nasce desabilitada
   * (ver a `<tr>`), e o "selecionar todos" tem de respeitar a MESMA régua: sem isto, a caixa
   * individual ficaria cinza e a do cabeçalho marcaria a linha assim mesmo, que é a pior das duas
   * respostas, porque a tela diria uma coisa e a seleção faria outra.
   *
   * A RÉGUA É `podeDecidir`, a mesma que decide o ícone de ação da linha e a mesma com que a barra
   * de ações em massa conta os "parados". Uma segunda régua aqui concordaria com aquela por
   * coincidência e divergiria dela no primeiro ajuste.
   *
   * A LINHA CONTINUA VISÍVEL E CONTINUA CONTANDO NO TOTAL: ela é histórico da vaga, e some da
   * SELEÇÃO, não da lista. É o que o texto de apoio já promete ("quem já saiu continua na lista,
   * como histórico").
   */
  const idsVisiveis = ord.itens.filter((c) => podeDecidir(c.situacao)).map((c) => c.id);
  const todosVisiveisMarcados =
    idsVisiveis.length > 0 && idsVisiveis.every((id) => selecionados.includes(id));

  return (
    <>
      <p className="mb-3 text-[12.5px] text-dim">{apoio}</p>
      <div className="ea-scroll overflow-x-auto">
        <table className={cn("ds-table", mostrarPosicao ? "min-w-[960px]" : "min-w-[900px]")}>
          <thead>
            <tr>
              {/* A CAIXA DE "TODOS" FICA NO CABEÇALHO, fora da ordenação: ela não é um critério de
                  comparação, é um gesto. Largura fixa e pequena, para não tirar espaço de quem
                  carrega texto (§A.20). */}
              <th className="w-[44px] text-center">
                <input
                  type="checkbox"
                  checked={todosVisiveisMarcados}
                  onChange={() => onAlternarTodos(idsVisiveis)}
                  disabled={idsVisiveis.length === 0}
                  className="h-4 w-4 accent-[var(--accent)]"
                  aria-label="Selecionar todos os candidatos à vista que aceitam decisão"
                  title="Seleciona os que estão à vista e ainda aceitam decisão. Quem já saiu do processo fica de fora."
                />
              </th>
              {/* §A.20: as larguras foram redistribuídas para a coluna de Ações caber SEM tirar
                  espaço de quem carrega texto longo. Quem cedeu foram as duas colunas de data, que
                  têm largura de sobra para "08/09/2026 19:12", e a de situação continua com o
                  rótulo mais longo do vocabulário ("Enviado Para Admissão") sem quebrar.

                  COM A COLUNA DE POSIÇÃO (aba de alocados) a distribuição muda, e a largura mínima
                  da tabela sobe junto: a coluna nova não é espremida entre as outras, ela entra com
                  espaço próprio e a tabela ROLA se a caixa apertar, nunca esmaga. */}
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="candidato"
                className={cn("text-center", mostrarPosicao ? "w-[18%] min-w-[150px]" : "w-[22%] min-w-[160px]")}
              >
                Candidato
              </ColunaOrdenavel>
              {mostrarPosicao && (
                <ColunaOrdenavel as="th" ord={ord} chave="posicao" className="w-[11%] min-w-[104px] text-center">
                  Posição
                </ColunaOrdenavel>
              )}
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="etapa"
                className="w-[14%] text-center"
              >
                Etapa
              </ColunaOrdenavel>
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="situacao"
                className={cn("text-center", mostrarPosicao ? "w-[22%]" : "w-[23%]")}
              >
                Situação
              </ColunaOrdenavel>
              {/* Os rótulos das duas colunas de tempo quebram em duas linhas quando aperta, em vez
                  de pedir largura mínima grande e empurrar a tabela para fora (§A.20). */}
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="entrou"
                className={cn("text-center", mostrarPosicao ? "w-[13%]" : "w-[14%]")}
              >
                <span className="whitespace-normal">Entrou Em</span>
              </ColunaOrdenavel>
              <ColunaOrdenavel
                as="th"
                ord={ord}
                chave="movimentou"
                className={cn("text-center", mostrarPosicao ? "w-[13%]" : "w-[14%]")}
              >
                <span className="whitespace-normal">Última Movimentação</span>
              </ColunaOrdenavel>
              {/* AÇÕES FICA FORA DA ORDENAÇÃO (§A.29): não há o que comparar entre dois grupos de
                  botões, e a mesma exceção já vale na Central de Candidatos. */}
              <th className={mostrarPosicao ? "w-[10%] text-center" : "w-[11%] text-center"}>
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {ord.itens.map((c) => (
              <tr
                key={c.id}
                className={selecionados.includes(c.id) ? "bg-[var(--surface)]" : undefined}
              >
                {/* ─ A CAIXA DA LINHA ENCERRADA NASCE DESABILITADA (conserto E da onda B) ────
                    ELA NÃO OLHAVA A SITUAÇÃO, e qualquer linha entrava na seleção, inclusive quem
                    já saiu do processo e não aceita decisão nova. O resultado era uma seleção que
                    parecia válida e quebrava por linha lá no servidor.

                    A RÉGUA É `podeDecidir`, a mesma do ícone de ação desta linha e a mesma com que
                    a barra de ações conta os "parados": aqui a tela deixa de OFERECER o que aquela
                    barra já contava como impossível.

                    O `title` DIZ O PORQUÊ, e não some: caixa cinza sem explicação é a tela
                    recusando sem dizer o motivo, e quem opera conclui que o sistema travou. */}
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(c.id)}
                    onChange={() => onAlternar(c.id)}
                    disabled={!podeDecidir(c.situacao)}
                    className="h-4 w-4 accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={
                      podeDecidir(c.situacao)
                        ? `Selecionar ${c.candidatoNome}`
                        : `${c.candidatoNome} já saiu do processo e não entra na seleção`
                    }
                    title={
                      podeDecidir(c.situacao)
                        ? undefined
                        : "O processo desta pessoa já terminou, então ela não aceita decisão nova e fica fora das ações em massa. A linha segue na lista como histórico."
                    }
                  />
                </td>
                <td className="font-semibold">{c.candidatoNome}</td>
                {/* ─ A POSIÇÃO: OFICIAL, BANCO, OU NADA (grupo 2) ────────────────────────────
                    NULO NÃO É "OFICIAL POR OMISSÃO", e é a armadilha desta coluna: quem está no
                    funil sem ocupar posição tem nulo aqui, e inventar "Oficial" para ele diria que
                    a vaga entregou uma posição que ninguém entregou. §A.11: o vazio é a palavra
                    "não informado", nunca o travessão.

                    QUEM TRADUZ É `rotuloDoLado`, a mesma régua que a ficha do candidato usa, e ela
                    devolve nulo para valor desconhecido em vez de imprimir o valor cru. Sem ela, um
                    dia alguém leria "BANCO" em caixa alta no meio de uma tabela em português. */}
                {mostrarPosicao && (
                  <td className="text-center">
                    <span className="inline-flex justify-center">
                      {rotuloCurtoDoLado(c.posicaoLado) ? (
                        <StatusPill
                          tone={c.posicaoLado === "BANCO" ? "in" : "ok"}
                          label={rotuloCurtoDoLado(c.posicaoLado) as string}
                          /* O rótulo LONGO fica no `title`: a célula é curta porque a coluna já se
                             chama Posição, e quem quiser a frase inteira a tem no mouse. */
                          title={rotuloDoLado(c.posicaoLado) as string}
                        />
                      ) : (
                        <span className="text-faint">não informado</span>
                      )}
                    </span>
                  </td>
                )}
                {/* A ETAPA SÓ APARECE ENQUANTO A CANDIDATURA ESTÁ VIVA, a mesma régua da Central de
                    Candidatos: mostrá-la depois do desfecho desenharia o descartado dentro do
                    funil, como se ele ainda estivesse em seleção. */}
                <td className="text-center">
                  <span className="inline-flex justify-center">
                    {candidaturaViva(c.situacao) ? (
                      <StatusPill
                        tone={tomDaEtapa(c.etapa, etapas)}
                        label={rotuloDaEtapa(c.etapa, etapas)}
                      />
                    ) : (
                      <StatusPill tone="nt" label="Fora Do Funil" />
                    )}
                  </span>
                </td>
                <td className="text-center">
                  <span className="inline-flex justify-center">
                    <StatusPill
                      tone={tomDaSituacao(c.situacao)}
                      label={CANDIDATURA_SITUACAO_LABEL[c.situacao]}
                    />
                  </span>
                </td>
                {/* §A.20: a data fica em UMA linha enquanto sobra largura, e passa a quebrar em
                    duas na aba de alocados, que tem uma coluna a mais. Quebrar "09/09/2026," e
                    "14:54" custa uma linha de altura; manter tudo em uma só custaria 100px de
                    largura, e eles sairiam da coluna do nome ou empurrariam Ações para fora. */}
                <td className={cn("text-center tabular-nums", !mostrarPosicao && "whitespace-nowrap")}>
                  {dataHoraBr(c.alocadoEm)}
                </td>
                <td className={cn("text-center tabular-nums", !mostrarPosicao && "whitespace-nowrap")}>
                  {dataHoraBr(c.atualizadoEm)}
                </td>
                {/* AÇÕES SÓ EM ÍCONE, com o rótulo por extenso em `title` e `aria-label`, na mesma
                    forma da Central de Candidatos: o ícone é o atalho de quem conhece a tela, e o
                    rótulo continua alcançável pelo mouse e pelo leitor de tela.

                    CADA AÇÃO APARECE SÓ QUANDO EXISTE, e quem decide são as réguas testadas de
                    `as-vaga-acoes`. Botão que só sabe falhar é pior do que botão ausente: ele gasta
                    o clique, devolve uma recusa e não diz o que fazer no lugar. */}
                <td>
                  <div className="flex items-center justify-center gap-1">
                    <AcaoIcone
                      icone="eye"
                      titulo="Ver a ficha"
                      descricao={`Ver a ficha de ${c.candidatoNome}`}
                      onClick={() => onFicha(c)}
                    />
                    {/* A MESMA PORTA, COM O NOME DO QUE ELA ABRE AGORA. Para quem está em seleção
                        ela é o movimento no funil; para quem já foi entregue, o que resta lá dentro
                        é a decisão (encerrar ou enviar para a admissão), e chamá-la de "mover"
                        esconderia o passo seguinte do alocado atrás de uma palavra que não é a
                        dele. O modal é o mesmo, e é ele que mostra o que cabe em cada caso. */}
                    {podeDecidir(c.situacao) && (
                      <AcaoIcone
                        icone="arr"
                        titulo={
                          podeMoverNoFunil(c.situacao)
                            ? "Mover de etapa"
                            : "Encerrar ou enviar para a admissão"
                        }
                        descricao={
                          podeMoverNoFunil(c.situacao)
                            ? `Mover ${c.candidatoNome} de etapa`
                            : `Encerrar o processo de ${c.candidatoNome} ou enviar para a admissão`
                        }
                        onClick={() => onMover(c)}
                      />
                    )}
                    {podeFinalizarPosicao(c.situacao) && (
                      <AcaoIcone
                        icone="check"
                        titulo="Finalizar posição"
                        descricao={`Finalizar a posição da vaga com ${c.candidatoNome}`}
                        onClick={() => onFinalizar(c)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * O BOTÃO DE AÇÃO EM ÍCONE, na mesma forma da Central de Candidatos (`AcaoIcone` daquela página).
 *
 * ELE É REESCRITO AQUI, E ISSO É DELIBERADO: o de lá é uma função interna do `page.tsx` daquela tela,
 * não exportada, e movê-lo para o design system para reusar em dois lugares mexeria em código
 * VALIDADO fora do escopo desta etapa (§A.14/§A.26). São doze linhas sem estado nem regra; promovê-lo
 * a componente do DS é uma limpeza legítima, e fica PROPOSTA, não feita por conta própria.
 */
function AcaoIcone({
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: IconName;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={descricao}
      onClick={onClick}
      className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent"
    >
      <Icon name={icone} className="h-4 w-4" />
    </button>
  );
}
