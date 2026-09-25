"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CODIGOS_ERRO_IDENTIFICACAO,
  PORTAL_IDENTIFICACAO_NAO_CASOU,
  PORTAL_FRAGMENTO_LINK,
  type ErroDaIdentificacao,
  type ExigenciaDocumento,
  type LinkDoVtParaOCandidato,
  type PassoDaTrilhaPortal,
  type PedidoDeRecuperacao,
  type RecusaDoArquivo,
  type SessaoDoCandidato,
  type SugestaoExtraida,
  type TentativasDaPendencia,
  type TermoAceiteResposta,
  type TrilhaDoCandidato,
  type VereditoDoDocumento,
} from "@ea/shared-types";
import { ApiError, apiFetch } from "@/lib/api";
import { ConferenciaDocumento, PassoFinal } from "@/components/portal/CamposGi";
import {
  camposVaziosDe,
  valoresConfirmadosDe,
  type CampoConfirmadoGi,
  type CorpoDadosGi,
} from "@/lib/portal-dados-gi";
import { dicaDoPasso } from "@/lib/dicas-documento";
import { BotaoFalarComRh, TelaDeIdentificacao } from "@/components/portal/Identificacao";
import { PortalHeader, PortalFooter } from "@/components/portal/designer/PortalHeader";
import { PalcoAnalise } from "@/components/portal/designer/Analise";
import { SolAvatar, SolMensagem } from "@/components/portal/designer/Sol";
import {
  BarraProgresso,
  Botao,
  Card,
  Nota,
  Sobretitulo,
  Tag,
} from "@/components/portal/designer/ui";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Camera,
  Check,
  Clock,
  FileCheck2,
  File as FileIcon,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Sun,
  User as UserIcon,
} from "lucide-react";
import type { Candidato } from "@/lib/portal/types";
import {
  IconeAlerta,
  IconeCadeado,
  IconeCamera,
  IconeCheck,
  IconeDica,
  IconeDocumento,
  IconeLink,
  IconePessoa,
  IconeSeta,
  IconeUpload,
} from "@/components/portal/IconesPortal";
import {
  deveRecarregarAoVoltar,
  estadoDaCasa,
  podeEnviar,
  proximoPasso,
  resumoFinal,
  tetoDeEnvioEmMb,
  validarArquivo,
  type EstadoDaCasa,
  type LimitesDeArquivo,
  type Visita,
} from "@/lib/portal-trilha";
import {
  MSG_VT_FALHA_GENERICA,
  abrirEmAbaNova,
  ehCasaDoVt,
  mensagemDaFalhaDoVt,
  rotuloDoEscape,
} from "@/lib/portal-vt";

/**
 * PORTAL DO CANDIDATO: a trilha guiada da Sol. Mockup aprovado pelo diretor.
 *
 * PÁGINA PÚBLICA, fora do route group `(app)`, mesmo desenho do `/vt`: sem AppShell, sem guard de
 * sessão do EA e sem menu, porque quem opera é o CANDIDATO, que não é usuário do sistema.
 *
 * TEMA CLARO SEMPRE (decisão do diretor, já valendo no `/vt`): cores LITERAIS, nunca `var(--...)`
 * do design system, que inverte por tema, e `colorScheme: light` no container, que é o que impede o
 * celular em modo escuro de escurecer os controles nativos. A tela é do candidato, não do operador.
 *
 * O QUE CHEGA NO LINK É O LINK, NÃO A SESSÃO. A página lê `#t=<linkToken>` (o prefixo é o do
 * contrato, `PORTAL_FRAGMENTO_LINK`), que é o link de 72
 * horas que o RH envia, e NÃO um bilhete de sessão pronto. Quem emite a sessão é o servidor, depois
 * que o candidato prova quem é. O fragmento continua sendo fragmento por §A.6: não é enviado ao
 * servidor em requisição nenhuma, não entra em log de proxy e não entra em `Referer`. Ele é lido no
 * primeiro render e REMOVIDO da barra.
 *
 * O LINK E A SESSÃO VIVEM NO `sessionStorage` DA ABA, para o refresh retomar (decisão do diretor).
 * O `sessionStorage` morre ao fechar a aba, então nada sobrevive à aba fechada, e o link é PII-free
 * (só admissão mais `jti`, veto V5 confirmado no contrato), então guardá-lo é seguro. NUNCA em
 * `localStorage`, que atravessaria o fechamento da aba no aparelho compartilhado. No primeiro render:
 * havendo sessão guardada, a tela retoma a trilha SEM re-identificar; expirada a sessão (401), o link
 * guardado leva o candidato de volta à identificação sem expulsão, e o progresso vem do servidor.
 *
 * A PRIMEIRA TELA É A IDENTIFICAÇÃO: CPF e data de nascimento, contra a admissão DO LINK.
 * `POST /portal/identificar` devolve `SessaoDoCandidato`, e é essa sessão que autentica tudo o que
 * vem depois. CPF e data de nascimento vivem só no estado do formulário e no corpo da requisição, e
 * saem do estado assim que a sessão chega (ver `components/portal/Identificacao.tsx`).
 *
 * A SESSÃO DURA 30 MINUTOS, E O 401 NO MEIO DE UM ENVIO É ESPERADO, não defeito: ela é a credencial
 * que autoriza escrita no nosso armazenamento, e por isso é curta de propósito. Quando ele acontece,
 * a tela LIMPA a sessão do `sessionStorage`, REABRE A IDENTIFICAÇÃO com o link que ainda tem guardado
 * e o candidato só confirma os dados de novo. Nada de progresso se perde: o que já foi enviado, as
 * tentativas e o que a IA leu vivem no servidor, por link, e voltam na próxima leitura da trilha. Sem
 * link guardado (aba nunca aberta pelo link nesta sessão), a tela pede que ele ABRA DE NOVO o link que
 * recebeu, e não declara o link inválido.
 *
 * AS MENSAGENS DE NÃO CASAMENTO SAEM COMO VIERAM DO SERVIDOR. A tela não distingue "CPF não existe"
 * de "data errada", porque o servidor responde igual de propósito: variação de texto aqui recria o
 * oráculo de enumeração que o desenho de segurança fecha.
 *
 * A TELA NÃO GUARDA CPF, não conhece nome completo, id de admissão nem id de tipo de documento. O
 * contrato não os traz, e é por isso que a régua vem pronta do servidor: a tela pede credencial pelo
 * CÓDIGO do tipo, e a admissão sai da sessão.
 *
 * A TELA NUNCA REMONTA FRASE DE REPROVAÇÃO. O que o candidato lê em `veredito.mensagem` e em
 * `recusa.mensagem` sai como veio, da lista fechada do servidor. Inventar frase aqui é exatamente o
 * que o motor existe para impedir, e a tela seria a segunda verdade.
 *
 * §A.11 (sem travessão), §A.24 (Title Case em título, aba e etiqueta; frase de apoio e botão de
 * AÇÃO em escrita normal), §A.35 (nenhum `<select>` cru: os seletores do passo final, raça, grau e
 * estado civil, usam o `SelectPortal` de `components/portal/CamposGi`, com o tema claro fixo) e
 * §A.41 (o modal não fecha ao clicar fora, e tem saída visível).
 */

// ── Cores literais da trilha (tema claro fixo, paleta Soulan do Designer) ─────
// Hex LITERAIS, nunca `var(--...)` do design system (inverteria no modo escuro do aparelho). Os
// valores espelham os tokens `portal-*`/`soulan-*` do preset (a pele do Designer), aplicados sobre
// o motor validado: o que muda e a cor, nunca a logica.
const AZUL = "#1A4895"; // portal-primaria (azul-medio da marca)
const VERDE = "#4A6400"; // portal-ok-tx
const AMARELO = "#A33F12"; // portal-at-tx (atencao da marca)
const ROXO = "#5B3FC9"; // "Com O Consultor": sem equivalente na marca, herda o roxo
const CINZA = "#5B6F86"; // portal-muted
const AZUL_CLARO = "#2E7CA8"; // agua/azul-claro com contraste de rotulo
const VERMELHO = "#B4341A"; // "Aguardando Sua Validação": coral-vermelho da marca

interface Pintura {
  /** Cor do traço e do texto da casa. */
  cor: string;
  /** Preenchimento da casa no tabuleiro. */
  fundo: string;
  /** Etiqueta curta. §A.24: Title Case, porque etiqueta é etiqueta. */
  rotulo: string;
}

// Exportado para o tester independente (§A.38/§A.40) afirmar os 8 estados sem renderizar a página
// inteira. É o MESMO objeto que o JSX consome (fonte única, nunca uma segunda verdade no teste).
export const PINTURA: Record<EstadoDaCasa, Pintura> = {
  ACEITO: { cor: VERDE, fundo: "#F2F9DC", rotulo: "Enviado" },
  ATUAL: { cor: AZUL, fundo: "#EAF1FA", rotulo: "Agora" },
  PULADO: { cor: AMARELO, fundo: "#FFF1EA", rotulo: "Pulado" },
  NO_TIME: { cor: ROXO, fundo: "#EEE9FB", rotulo: "Com O Consultor" },
  PENDENTE: { cor: CINZA, fundo: "#EEF1F4", rotulo: "A Enviar" },
  EM_ANALISE: { cor: AZUL_CLARO, fundo: "#E7F6F3", rotulo: "Em Análise" },
  AGUARDANDO_VALIDACAO: { cor: VERMELHO, fundo: "#FFECE6", rotulo: "Aguardando Sua Validação" },
  AJUSTAR: { cor: AMARELO, fundo: "#FFF1EA", rotulo: "Precisa De Ajuste" },
};

/**
 * A ETIQUETA DA EXIGÊNCIA, e as TRÊS são distintas de propósito.
 *
 * O contrato traz três valores (`ExigenciaDocumento`), e a régua do EA trata `FACULTATIVO` e
 * `NAO_OBRIGATORIO` como coisas diferentes. Imprimir "Facultativo" em tudo o que não é obrigatório
 * diz ao candidato que o documento é escolha dele, quando o que a régua disse foi outra coisa.
 *
 * §A.24: são etiquetas, então Title Case. A cor é a da exigência: azul só no obrigatório, e as duas
 * outras na neutra que já existe, porque o que precisa saltar na lista é o que trava a admissão.
 */
const ROTULO_EXIGENCIA: Record<ExigenciaDocumento, string> = {
  OBRIGATORIO: "Obrigatório",
  FACULTATIVO: "Facultativo",
  NAO_OBRIGATORIO: "Não Obrigatório",
};

function EtiquetaExigencia({ exigencia }: { exigencia: ExigenciaDocumento }) {
  const obrigatorio = exigencia === "OBRIGATORIO";
  return (
    <Etiqueta
      cor={obrigatorio ? AZUL : CINZA}
      fundo={obrigatorio ? "#EAF1FA" : "#eef2f6"}
      texto={ROTULO_EXIGENCIA[exigencia] ?? ROTULO_EXIGENCIA.NAO_OBRIGATORIO}
    />
  );
}

/** As quatro telas do mockup, na ordem aprovada. */
type Tela = "BOAS_VINDAS" | "REUNIR" | "COMO_FUNCIONA" | "TRILHA";

/** O que a tela mostra sobre o envio da casa atual. Um estado só, nunca três flags soltas. */
type Envio =
  | { fase: "parado" }
  | { fase: "analisando" }
  | { fase: "aceito" }
  /**
   * O DOCUMENTO FOI ACEITO E A IA LEU CAMPOS PARA CONFERIR. Peça 1 do Portal para o G.I: em vez de
   * seguir direto, a casa abre a conferência daquele documento. `sugestao` é SUGESTÃO, nunca dado
   * final: o válido é o que o candidato confirma.
   */
  | { fase: "conferir"; sugestao: SugestaoExtraida }
  | { fase: "ajustar"; mensagem: string; tentativas: TentativasDaPendencia }
  | { fase: "noTime"; mensagem: string }
  | { fase: "erro"; mensagem: string };

/**
 * O QUE A PONTE DO VT DEVOLVE À CASA, e repare no que NÃO está aqui: o link.
 *
 * A casa precisa saber apenas se a aba saiu, se a sessão caiu (e aí a tela inteira já voltou para
 * a identificação, então ela não tem nada a dizer) ou o que mostrar quando falhou. Devolver o
 * endereço faria o componente guardá-lo em estado, que é exatamente o que a §A.6 proíbe aqui.
 */
type AberturaDoVt = { fase: "abriu" } | { fase: "sessao" } | { fase: "erro"; mensagem: string };

interface RespostaCredencial {
  credencialId: string;
  url: string;
  cabecalhos: Record<string, string>;
  metodo: string;
  expiraEm: string;
  bytesMax: number;
}

interface RespostaConfirmacao {
  entregue: boolean;
  jaConfirmado?: boolean;
  veredito: VereditoDoDocumento | null;
  recusa: RecusaDoArquivo | null;
  tentativas: TentativasDaPendencia;
  /**
   * O QUE A IA EXTRAIU DO DOCUMENTO, para o candidato CONFERIR (peça 1). Já viajava no corpo de
   * `/portal/confirmar` e a tela o ignorava; agora ela o lê. `null`/ausente quando não há nada a
   * conferir (documento recusado, tipo sem campos mapeados, ou o backend do G.I ainda não subiu o
   * campo nesta janela de rollout paralelo). §A.6: é sugestão efêmera, nunca vai a log.
   */
  sugestao?: SugestaoExtraida | null;
}

/**
 * A LINHA ÚNICA DO 401 ESPERADO. Ela não é erro: é o desenho da sessão curta, dito em uma frase, e
 * por isso convida a continuar em vez de mandar procurar alguém.
 */
const MSG_SESSAO_CURTA_VENCEU =
  "Sua sessão expirou por segurança. Confirme os seus dados de novo para continuar de onde parou.";

/** O que a válvula "Não consigo entrar" responde quando o servidor não manda texto próprio. */
const MSG_RECUPERACAO =
  "Avisamos o RH que você não conseguiu entrar. Procure o RH que está acompanhando a sua admissão para receber um link novo.";

/** Erro de rede ou de servidor, que não é não casamento e não é link morto. */
const MSG_INDISPONIVEL =
  "Não foi possível conferir os seus dados agora. Tente de novo em alguns minutos.";

/**
 * O ERRO DA IDENTIFICAÇÃO SAI DO CORPO DA RESPOSTA, pelo `codigo`, e NUNCA de comparação de texto.
 *
 * POR QUE O CORPO E NÃO A MENSAGEM PRONTA: o cliente HTTP compartilhado troca a mensagem de TODO
 * 401 pela frase de sessão do OPERADOR ("Sua sessão expirou. Entre novamente..."), que fala de um
 * login que o candidato não tem. O corpo bruto (`ApiError.data`) preserva `ErroDaIdentificacao`
 * inteiro, e é ele que a tela lê.
 *
 * POR QUE O `codigo` E NÃO A `mensagem`: decidir o caminho da tela comparando o texto amarra o
 * comportamento à letra da frase, e uma vírgula a mais no servidor faria link morto virar tentativa
 * nova em silêncio. O código é o contrato; a mensagem é o que o candidato lê, exibida como veio.
 */
function erroDaIdentificacao(err: unknown): ErroDaIdentificacao | null {
  if (!(err instanceof ApiError)) return null;
  const corpo = err.data as { codigo?: unknown; mensagem?: unknown } | null | undefined;
  const codigo = corpo?.codigo;
  if (typeof codigo !== "string") return null;
  if (!(CODIGOS_ERRO_IDENTIFICACAO as readonly string[]).includes(codigo)) return null;
  const mensagem = typeof corpo?.mensagem === "string" ? corpo.mensagem.trim() : "";
  return {
    codigo: codigo as ErroDaIdentificacao["codigo"],
    // Código conhecido sem texto é caso degenerado, e a frase única de não casamento é a saída
    // conservadora: ela não revela nada sobre o que falhou.
    mensagem: mensagem !== "" ? mensagem : PORTAL_IDENTIFICACAO_NAO_CASOU,
  };
}

/** 401 e 403 são os dois códigos em que a identificação/sessão é a causa, e não a rede. */
function ehNegativaDeAcesso(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

/**
 * A CONSULTA DE MÍDIA, VIVA, e ela é a ÚNICA fonte da diferença entre celular e PC nesta tela.
 *
 * MOBILE-FIRST DE VERDADE: o valor inicial é lido do próprio navegador (inicializador preguiçoso),
 * e não `false` seguido de um efeito, porque `false` faria o celular pintar um quadro com o botão
 * de arquivo antes de trocar pela câmera. Isso é seguro aqui por um motivo concreto: no servidor e
 * na hidratação esta página ainda está em "Abrindo...", esperando o fragmento do link, então a
 * árvore que depende disto só existe depois que o navegador já é o navegador.
 *
 * O ouvinte fica ligado porque a janela do PC muda de tamanho, e a trilha tem de ir e voltar entre
 * a coluna vertical e a faixa de cima sem recarregar.
 */
function useConsultaDeMidia(consulta: string): boolean {
  const [combina, setCombina] = useState(
    () => typeof window !== "undefined" && window.matchMedia(consulta).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const aplicar = () => setCombina(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [consulta]);
  return combina;
}

/**
 * A CÂMERA EXISTE? Duas condições, e as duas são necessárias.
 *
 * 1. `capture` SUPORTADO no `<input type="file">`. Sozinho ele NÃO serve de teste: o Chrome do PC
 *    também tem a propriedade no protótipo, e o atributo simplesmente é ignorado lá. Ele entra
 *    como piso, para nunca oferecermos um botão que o navegador ignoraria em silêncio.
 * 2. PONTEIRO GROSSEIRO (`pointer: coarse`), que é o dedo. É este que separa de fato: notebook com
 *    webcam tem ponteiro fino e o `capture` não abre câmera nenhuma ali, abre o seletor de arquivo,
 *    que é exatamente o botão que já existe ao lado.
 *
 * POR QUE NÃO DETECTAR A CÂMERA DE VERDADE (`enumerateDevices`): ela pede permissão ou devolve
 * lista cega sem permissão, e trocaria um botão por um pedido de acesso que ninguém pediu. O que
 * importa aqui não é "existe uma webcam", é "tirar foto é o gesto natural deste aparelho".
 */
function useTemCamera(): boolean {
  const ponteiroGrosseiro = useConsultaDeMidia("(pointer: coarse)");
  return (
    ponteiroGrosseiro &&
    typeof document !== "undefined" &&
    "capture" in document.createElement("input")
  );
}

/**
 * O LINK E A SESSÃO NO `sessionStorage` DA ABA, para o refresh retomar (decisão do diretor).
 *
 * §A.6: o `sessionStorage` morre ao fechar a aba, e o link é PII-free (só admissão mais `jti`, veto
 * V5), então guardá-lo é seguro; a sessão também não carrega dado pessoal. NUNCA `localStorage`, que
 * sobreviveria ao fechamento da aba no aparelho compartilhado. Toda leitura e escrita é protegida:
 * em aba anônima com armazenamento bloqueado, o acesso lança, e a tela cai para o comportamento de
 * antes (sem retomada) em vez de quebrar.
 */
const CHAVE_LINK = "portal:link";
const CHAVE_SESSAO = "portal:sessao";

function lerGuardado(chave: string): string {
  try {
    return window.sessionStorage.getItem(chave) ?? "";
  } catch {
    return "";
  }
}

function guardar(chave: string, valor: string): void {
  try {
    window.sessionStorage.setItem(chave, valor);
  } catch {
    /* armazenamento indisponível: segue sem retomada, nunca quebra. */
  }
}

function limparGuardado(chave: string): void {
  try {
    window.sessionStorage.removeItem(chave);
  } catch {
    /* idem. */
  }
}

// ── Página ───────────────────────────────────────────────────────────────────
export default function PortalDoCandidatoPage() {
  /**
   * O LINK DE 72 HORAS. Vive no `sessionStorage` da aba (some ao fechá-la) e é ele que sobrevive à
   * expiração da sessão: com ele em mãos a tela reabre a identificação em vez de mandar o candidato
   * procurar o RH por um vencimento que o desenho previu.
   * `null` = ainda não lemos o fragmento nem o guardado; `""` = lemos e não havia link.
   */
  const [linkToken, setLinkToken] = useState<string | null>(null);
  /**
   * O LINK EM REF, para as funções que decidem "temos link?" lerem o valor CORRENTE, sem depender do
   * momento em que o `setLinkToken` propaga. É o que faz o 401 da retomada no primeiro render reabrir
   * a identificação em vez de cair no "abra o link de novo" com o estado ainda em `null`.
   */
  const linkRef = useRef<string>("");
  /** A sessão de 30 minutos, emitida pela identificação. `""` = ainda não identificado. */
  const [sessao, setSessao] = useState("");
  const [trilha, setTrilha] = useState<TrilhaDoCandidato | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroFatal, setErroFatal] = useState<string | null>(null);
  /**
   * A PÁGINA ABRIU SEM FRAGMENTO NENHUM, e isto NÃO é link inválido.
   *
   * O fragmento é apagado da barra no primeiro render (proteção, §A.6), então basta o celular
   * DESCARTAR A ABA (o que ele faz quando a pessoa sai para outro aplicativo e volta depois, e a
   * ponte do VT manda o candidato para fora de propósito) para o recarregamento chegar aqui sem
   * `#t=`. O link dele continua valendo as 72 horas, parado no WhatsApp: declarar o link morto
   * nesse caminho manda a pessoa incomodar o RH por nada.
   *
   * É por isso que este estado existe SEPARADO do `erroFatal`: quando o SERVIDOR recusa o link
   * (revogado, bloqueado, vencido), aí ele acabou mesmo, e a frase de link inválido está certa.
   */
  const [semFragmento, setSemFragmento] = useState(false);
  /** Mensagem do servidor no não casamento, exibida na identificação sem nenhuma reescrita. */
  const [erroIdentificacao, setErroIdentificacao] = useState<string | null>(null);
  /** A linha da sessão vencida, só quando a identificação reabre no meio do caminho. */
  const [avisoSessao, setAvisoSessao] = useState<string | null>(null);
  /** `BLOQUEADO`: a tela mostra a mensagem do servidor e não deixa tentar de novo agora. */
  const [bloqueado, setBloqueado] = useState(false);

  /**
   * O PC É ACRÉSCIMO, NUNCA BASE. A partir de 1024px a MESMA trilha vira duas colunas: o tabuleiro
   * some do topo e desce pela esquerda, e o documento da vez ocupa a direita. Nada de componente
   * paralelo de PC: é uma bandeira, lida pelos mesmos `Tabuleiro` e `CasaAtual`, com a mesma régua
   * pura de `lib/portal-trilha` e os mesmos estados. Abaixo de 1024px nada muda.
   */
  const ehTelaLarga = useConsultaDeMidia("(min-width: 1024px)");
  const temCamera = useTemCamera();

  const [tela, setTela] = useState<Tela>("BOAS_VINDAS");
  const [aceitouTermo, setAceitouTermo] = useState(false);
  const [termoAberto, setTermoAberto] = useState(false);
  /** O aceite do termo está sendo gravado (`POST /portal/termo`), para travar o duplo clique. */
  const [salvandoTermo, setSalvandoTermo] = useState(false);
  /** Falha ao gravar o aceite: a tela não avança e mostra a linha para o candidato tentar de novo. */
  const [erroTermo, setErroTermo] = useState<string | null>(null);

  const [indice, setIndice] = useState(0);
  const [visita, setVisita] = useState<Visita>(() => ({ pulados: new Set<string>() }));
  const [envio, setEnvio] = useState<Envio>({ fase: "parado" });
  /**
   * A PILHA DE VISITA, e ela NÃO é o inverso do `proximoPasso`.
   *
   * `proximoPasso` é a régua VALIDADA do AVANÇO (a varredura circular, o inédito antes do pulado),
   * e ela continua intocada. Isto aqui é outra coisa: a lista das casas por onde o candidato
   * PASSOU, na ordem em que passou. Voltar é desfazer o último movimento dele, não perguntar à
   * régua qual seria o passo anterior, que é pergunta sem resposta única (a régua dá a volta no
   * círculo, então "o anterior" dela pode ser uma casa que ele nunca viu).
   *
   * Ela vive só na sessão, como o pulado: fechou a aba, some. Nenhum dado pessoal, só índices.
   */
  const [historico, setHistorico] = useState<number[]>([]);

  /**
   * OS CAMPOS DO G.I QUE O CANDIDATO JÁ VIU NA TRILHA (peça 1). `campo -> { rotulo, valor }`, o valor
   * sendo o que ELE confirmou (nunca o chute da IA). Serve para deduplicar (nome e nascimento se
   * confirmam UMA vez) e para montar o passo final (o que ficou vazio). Vive só na sessão, como o
   * pulado e o histórico: fechou a aba, some. §A.6: nada disto persiste no aparelho.
   */
  const [camposVistos, setCamposVistos] = useState<Record<string, { rotulo: string; valor: string }>>(
    {},
  );
  /** O passo final foi concluído. Antes dele a tela mostra o passo final; depois, a conclusão. */
  const [finalConcluido, setFinalConcluido] = useState(false);

  /**
   * A SESSÃO VENCEU NO MEIO DO CAMINHO, que é o 401 ESPERADO: derruba a sessão, LIMPA a sessão do
   * sessionStorage, reabre a identificação e diz por quê, em uma linha. O link continua guardado,
   * então o candidato não é mandado a lugar nenhum. Sem link (aba nunca aberta pelo link), aí sim a
   * tela para na mensagem de link morto, porque não há como emitir sessão nova sem ele.
   *
   * Usa `linkRef.current`, e não o estado `linkToken`, para funcionar já na retomada do primeiro
   * render, quando o `setLinkToken` ainda não propagou.
   */
  const reabrirIdentificacao = useCallback(() => {
    setSessao("");
    limparGuardado(CHAVE_SESSAO);
    setEnvio({ fase: "parado" });
    setErroIdentificacao(null);
    if (linkRef.current) setAvisoSessao(MSG_SESSAO_CURTA_VENCEU);
    else setSemFragmento(true);
  }, []);

  const carregarTrilha = useCallback(
    async (token: string, opcoes?: { silencioso?: boolean }) => {
      // A LEITURA SILENCIOSA NÃO ACENDE A TELA DE "ABRINDO...". Ela existe para a volta da aba
      // (`visibilitychange`): trocar a trilha inteira por um aviso de carregamento a cada vez que
      // o candidato volta do formulário do VT seria piscar a tela em cima de quem só voltou.
      const silencioso = opcoes?.silencioso === true;
      if (!silencioso) setCarregando(true);
      try {
        const dados = await apiFetch<TrilhaDoCandidato>("/portal/documentos", { token });
        setTrilha(dados);
        setErroFatal(null);
        // BUG 1: o termo já aceito nesta admissão pula BOAS_VINDAS. Só desvia quando ainda estamos
        // na tela de abertura: numa releitura de fundo (volta da aba) o candidato já pode ter
        // avançado, e forçar REUNIR o jogaria para trás.
        if (dados.termoAceito) {
          setAceitouTermo(true);
          setTela((t) => (t === "BOAS_VINDAS" ? "REUNIR" : t));
        }
        // BUGS 4/5/6: reidrata os campos do G.I já confirmados (de `admissao_dados_gi`), para o
        // dedup e o passo final não perderem, no reload, o que o candidato já validou. O servidor é
        // a verdade; o que veio dele prevalece sobre a memória local do mesmo campo.
        if (dados.dadosGiConfirmados.length > 0) {
          setCamposVistos((atual) => {
            const novo = { ...atual };
            for (const d of dados.dadosGiConfirmados) {
              novo[d.campo] = { rotulo: d.rotulo, valor: d.valor };
            }
            return novo;
          });
        }
      } catch (err) {
        // O 401 É O MESMO 401 DE SEMPRE, inclusive na leitura silenciosa, e ele é o caminho MAIS
        // provável de quem volta do formulário do VT: preencher aquilo passa dos 30 minutos da
        // sessão. Quem trata é `reabrirIdentificacao`, com o link que continua em memória, e o
        // candidato só confirma os dados de novo. Nunca uma tela de erro.
        if (ehNegativaDeAcesso(err)) {
          reabrirIdentificacao();
          return;
        }
        // Falha de rede numa leitura SILENCIOSA é ignorada de propósito: ela não foi pedida pelo
        // candidato, e trocar a trilha que ele está vendo por uma tela de erro seria punir quem só
        // voltou para a aba. A trilha antiga continua na frente dele, que é o que ele já tinha.
        if (silencioso) return;
        setErroFatal(
          "Não foi possível abrir a sua lista de documentos agora. Tente de novo em alguns minutos.",
        );
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [reabrirIdentificacao],
  );

  // ── 1. O link e a retomada: fragmento OU sessionStorage, no primeiro render ────────────────
  // Roda UMA vez (o `retomouRef` trava o disparo duplo do StrictMode em dev). O link decidido vai
  // para o `linkRef` ANTES da leitura, para o 401 da retomada reabrir a identificação com o link em
  // mãos, mesmo antes de o `setLinkToken` propagar.
  const retomouRef = useRef(false);
  useEffect(() => {
    if (retomouRef.current) return;
    retomouRef.current = true;
    const bruto = window.location.hash ?? "";
    // O PREFIXO VEM DO CONTRATO, e não de uma letra escrita aqui: o backend emitia `#t=` e esta
    // linha lia `#l=`, os dois lados verdes em teste, e nenhum link abria. Quem tem de ser dono do
    // vocabulário compartilhado é o contrato (§A.39).
    const achado = new RegExp(`(?:^#|&)${PORTAL_FRAGMENTO_LINK}=([^&]+)`).exec(bruto);
    const doFragmento = achado ? decodeURIComponent(achado[1]) : "";
    if (bruto) {
      // Some da barra para não sobreviver em histórico, em captura de tela e em link recompartilhado.
      // A retomada usa o sessionStorage, nunca a barra (§A.6).
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    // O link vem do fragmento (primeira entrada pelo WhatsApp) ou do sessionStorage (refresh da aba).
    const link = doFragmento || lerGuardado(CHAVE_LINK);
    if (link) guardar(CHAVE_LINK, link);
    linkRef.current = link;
    setLinkToken(link);

    // A SESSÃO GUARDADA RETOMA SEM RE-IDENTIFICAR. Se ela expirou, o 401 da leitura reabre a
    // identificação com o link em mãos (progresso vem do servidor). Sem sessão e sem link, é a tela
    // de "abra o link de novo": não há como emitir sessão nova.
    const sessaoGuardada = lerGuardado(CHAVE_SESSAO);
    if (sessaoGuardada) {
      setSessao(sessaoGuardada);
      void carregarTrilha(sessaoGuardada);
    } else if (!link) {
      setSemFragmento(true);
    }
  }, [carregarTrilha]);

  /**
   * A IDENTIFICAÇÃO. CPF e data de nascimento entram aqui, vão no corpo e NÃO ficam: o que sobra no
   * estado desta página é a sessão, que não carrega dado pessoal nenhum (veto V5 do contrato).
   */
  const identificar = useCallback(
    async (cpf: string, dataNascimento: string): Promise<boolean> => {
      if (!linkToken) {
        setSemFragmento(true);
        return false;
      }
      if (bloqueado) return false;
      setErroIdentificacao(null);
      try {
        const emitida = await apiFetch<SessaoDoCandidato>("/portal/identificar", {
          method: "POST",
          body: { linkToken, cpf, dataNascimento },
        });
        setAvisoSessao(null);
        setSessao(emitida.sessao);
        // Guarda a sessão para o refresh retomar sem re-identificar (bug 2). §A.6: a sessão não
        // carrega dado pessoal (veto V5), e o sessionStorage morre ao fechar a aba.
        guardar(CHAVE_SESSAO, emitida.sessao);
        await carregarTrilha(emitida.sessao);
        return true;
      } catch (err) {
        const doContrato = erroDaIdentificacao(err);
        if (doContrato) {
          // LINK_MORTO é TERMINAL: não há formulário que resolva, então a tela para na mensagem do
          // servidor, que é a mesma para revogado, expirado e inexistente.
          if (doContrato.codigo === "LINK_MORTO") {
            setErroFatal(doContrato.mensagem);
            return false;
          }
          // BLOQUEADO: a mensagem aparece e a tentativa fecha. Insistir aqui é o que o bloqueio
          // existe para impedir, e a saída que continua aberta é a válvula do RH.
          if (doContrato.codigo === "BLOQUEADO") setBloqueado(true);
          setErroIdentificacao(doContrato.mensagem);
          return false;
        }
        // Sem código do contrato: 401/403 é não casamento pela frase única (nunca a do cliente HTTP,
        // que fala do login do operador); o resto é rede ou servidor fora do ar.
        setErroIdentificacao(
          ehNegativaDeAcesso(err) ? PORTAL_IDENTIFICACAO_NAO_CASOU : MSG_INDISPONIVEL,
        );
        return false;
      }
    },
    [linkToken, carregarTrilha, bloqueado],
  );

  /**
   * A VÁLVULA DE RECUPERAÇÃO, e ela não é enfeite: o candidato cuja data de nascimento está errada
   * na NOSSA base ficaria trancado para sempre, e não há RH atrás do balcão. Ela nunca confirma nem
   * nega que o link existe, então falha de rede também termina na mesma frase.
   */
  const pedirAjuda = useCallback(async (): Promise<string> => {
    try {
      const pedido: PedidoDeRecuperacao = { linkToken: linkToken ?? "" };
      const resposta = await apiFetch<{ mensagem?: string }>("/portal/recuperacao", {
        method: "POST",
        body: pedido,
      });
      return resposta?.mensagem ?? MSG_RECUPERACAO;
    } catch {
      return MSG_RECUPERACAO;
    }
  }, [linkToken]);

  const passos = useMemo(() => trilha?.passos ?? [], [trilha]);
  const passoAtual: PassoDaTrilhaPortal | undefined = passos[indice];
  const resumo = useMemo(() => resumoFinal(passos, visita), [passos, visita]);
  const terminou = passos.length > 0 && passos.every((p) => !podeEnviar(p));

  /** O que já foi confirmado com valor (dedup) e o que ficou vazio (volta no passo final). */
  const valoresConfirmados = useMemo(() => valoresConfirmadosDe(camposVistos), [camposVistos]);
  const camposVazios = useMemo(() => camposVaziosDe(camposVistos), [camposVistos]);

  /**
   * BUGS 4/5/6: O ENVIO QUE A CASA MOSTRA, reconstruído a partir do que o servidor PERSISTIU. O
   * estado React `envio` só existe durante um envio ativo (do toque à resposta) e some ao navegar ou
   * recarregar; quando ele está "parado", a casa reflete a `conferencia` daquele passo, então
   * navegar, voltar e recarregar NÃO regridem para "processando" nem perdem o que a IA leu. Um envio
   * em curso sempre ganha (é o gesto do candidato na hora).
   */
  const envioEfetivo = useMemo<Envio>(
    () => (envio.fase === "parado" ? reconstruirEnvio(passoAtual) : envio),
    [envio, passoAtual],
  );

  /**
   * GRAVA OS CAMPOS CONFIRMADOS via `POST /portal/dados-gi`. O corpo é só a lista dos campos; a
   * admissão vem da SESSÃO, nunca do corpo (§A.6). Lista vazia não chama o servidor (não há nada a
   * gravar). O 401 é a sessão de 30 minutos vencendo, tratado como em todo lugar: reabre a
   * identificação com o link em memória.
   */
  const gravarDadosGi = useCallback(
    async (campos: CampoConfirmadoGi[]): Promise<boolean> => {
      if (!sessao) return false;
      if (campos.length === 0) return true;
      try {
        const corpo: CorpoDadosGi = { campos };
        await apiFetch("/portal/dados-gi", { method: "POST", token: sessao, body: corpo });
        return true;
      } catch (err) {
        if (ehNegativaDeAcesso(err)) {
          reabrirIdentificacao();
          return false;
        }
        return false;
      }
    },
    [sessao, reabrirIdentificacao],
  );

  /**
   * A CONFIRMAÇÃO DE UM DOCUMENTO: grava os campos novos e registra TODOS (rótulo e valor) em
   * `camposVistos`, para deduplicar e montar o passo final. Só os novos vão ao servidor; os já
   * confirmados antes não são reenviados.
   */
  const gravarConferencia = useCallback(
    async (itens: { campo: string; rotulo: string; valor: string }[]): Promise<boolean> => {
      const ok = await gravarDadosGi(itens.map(({ campo, valor }) => ({ campo, valor })));
      if (!ok) return false;
      setCamposVistos((atual) => {
        const novo = { ...atual };
        for (const it of itens) novo[it.campo] = { rotulo: it.rotulo, valor: it.valor };
        return novo;
      });
      // A verdade da casa é do servidor: relê a trilha para a `conferencia` daquela casa deixar de
      // pedir confirmação (o backend anula os campos após confirmar), então voltar a ela mostra o
      // aceito, não a conferência de novo. Sem sessão a releitura é no-op.
      if (sessao) await carregarTrilha(sessao);
      return true;
    },
    [gravarDadosGi, sessao, carregarTrilha],
  );

  /** O passo final: grava o que o candidato preencheu e encerra a coleta de dados. */
  const concluirFinal = useCallback(
    async (campos: CampoConfirmadoGi[]): Promise<boolean> => {
      const ok = await gravarDadosGi(campos);
      if (ok) setFinalConcluido(true);
      return ok;
    },
    [gravarDadosGi],
  );

  /** Ao abrir a trilha, a primeira casa é a primeira que é DELE, nunca a casa zero por posição. */
  const comecarTrilha = useCallback(() => {
    // A LISTA PODE VIR VAZIA, e não é caso teórico: a pré-admissão que entra pelo Pandapé chega sem
    // cliente e sem cargo, e sem cargo não há régua, então a admissão existe e não tem documento
    // nenhum. Sem esta guarda, `passos[0]` é indefinido e a tela quebra no primeiro toque.
    const primeira = passos.length === 0
      ? 0
      : podeEnviar(passos[0]!)
        ? 0
        : (proximoPasso(passos, 0, visita) ?? 0);
    setIndice(primeira);
    setHistorico([]);
    setEnvio({ fase: "parado" });
    setTela("TRILHA");
  }, [passos, visita]);

  /**
   * BUG 1: O ACEITE DO TERMO, gravado UMA vez por `POST /portal/termo`. A admissão vem da SESSÃO,
   * nunca do corpo (§A.6: registro de consentimento LGPD). O 401 é a sessão vencendo, tratado como
   * em todo lugar. Já aceito antes (trilha `termoAceito`), nem chega aqui: a tela pula BOAS_VINDAS.
   */
  const registrarTermo = useCallback(async (): Promise<boolean> => {
    if (!sessao) return false;
    try {
      await apiFetch<TermoAceiteResposta>("/portal/termo", { method: "POST", token: sessao });
      return true;
    } catch (err) {
      if (ehNegativaDeAcesso(err)) {
        reabrirIdentificacao();
        return false;
      }
      return false;
    }
  }, [sessao, reabrirIdentificacao]);

  /**
   * O CLIQUE EM "COMEÇAR" (BOAS_VINDAS): grava o aceite antes de avançar. Se a trilha já traz o
   * termo aceito, esta tela nem aparece; a guarda é defensiva. Falha de gravação não avança e mostra
   * a linha para tentar de novo, porque o consentimento precisa ficar registrado.
   */
  const comecarComTermo = useCallback(async () => {
    if (salvandoTermo) return;
    setErroTermo(null);
    if (!trilha?.termoAceito) {
      setSalvandoTermo(true);
      const ok = await registrarTermo();
      setSalvandoTermo(false);
      if (!ok) {
        // Sessão vencida já reabriu a identificação; aqui é a falha de rede/servidor.
        if (sessao) setErroTermo("Não foi possível registrar o seu aceite agora. Tente de novo.");
        return;
      }
      setAceitouTermo(true);
    }
    setTela("REUNIR");
  }, [salvandoTermo, trilha, registrarTermo, sessao]);

  /** TODO movimento passa por aqui, e é o que mantém a pilha de visita honesta. */
  const irPara = useCallback(
    (destino: number) => {
      if (destino === indice) return;
      setHistorico((h) => [...h, indice]);
      setIndice(destino);
      setEnvio({ fase: "parado" });
    },
    [indice],
  );

  /**
   * VOLTAR: desfaz o último movimento, e é NAVEGAÇÃO, não avanço. Ele não consulta `podeEnviar`
   * de propósito, e é aí que ele resolve a casa que caiu para o consultor: aquela casa é a única
   * que o candidato via e nunca mais alcançava, porque a régua do avanço só oferece casa em que
   * ainda dá para enviar. Voltar alcança qualquer casa por onde ele passou, no estado que ela
   * estiver. A cor e o que a casa deixa fazer continuam sendo do servidor (`estadoDaCasa` já
   * ignora a posição quando a casa não é movível), então ninguém promete envio onde não há.
   */
  const voltar = useCallback(() => {
    if (historico.length === 0) return;
    const anterior = historico[historico.length - 1]!;
    setHistorico(historico.slice(0, -1));
    setIndice(anterior);
    setEnvio({ fase: "parado" });
  }, [historico]);

  const avancar = useCallback(() => {
    const proximo = proximoPasso(passos, indice, visita);
    if (proximo !== null) irPara(proximo);
    else setEnvio({ fase: "parado" });
  }, [passos, indice, visita, irPara]);

  const pular = useCallback(() => {
    if (!passoAtual) return;
    const codigo = passoAtual.codigoTipoDocumento;
    const nova: Visita = { pulados: new Set(visita.pulados).add(codigo) };
    setVisita(nova);
    const proximo = proximoPasso(passos, indice, nova);
    if (proximo !== null) irPara(proximo);
    else setEnvio({ fase: "parado" });
  }, [passoAtual, passos, indice, visita, irPara]);

  // ── 2. O envio: credencial, PUT direto no armazenamento, confirmação ──────────────────────
  const enviarArquivo = useCallback(
    async (arquivo: File) => {
      if (!sessao || !passoAtual) return;

      // Recusa ANTES de gastar uma credencial: a cota do link é finita e a tentativa é do candidato.
      // Os limites são os DO SERVIDOR (`trilha.limites`), nunca os números locais: recusar por uma
      // régua que não é a dele é barrar envio legítimo ou queimar tentativa com o que ele recusaria.
      const local = validarArquivo({ type: arquivo.type, size: arquivo.size }, trilha?.limites);
      if (!local.ok) {
        setEnvio({ fase: "erro", mensagem: local.mensagem });
        return;
      }

      setEnvio({ fase: "analisando" });
      try {
        const credencial = await apiFetch<RespostaCredencial>("/portal/credencial", {
          method: "POST",
          token: sessao,
          body: {
            codigoTipoDocumento: passoAtual.codigoTipoDocumento,
            contentType: arquivo.type,
            bytes: arquivo.size,
          },
        });

        // O arquivo NÃO passa pelo EA: vai do navegador direto para o armazenamento, com exatamente
        // os cabeçalhos assinados. Faltou um, a assinatura não confere e o envio é recusado lá.
        const subida = await fetch(credencial.url, {
          method: credencial.metodo || "PUT",
          headers: credencial.cabecalhos,
          body: arquivo,
        });
        if (!subida.ok) {
          setEnvio({
            fase: "erro",
            mensagem: "O envio não chegou ao fim. Confira a sua conexão e tente de novo.",
          });
          return;
        }

        const confirmacao = await apiFetch<RespostaConfirmacao>("/portal/confirmar", {
          method: "POST",
          token: sessao,
          body: { credencialId: credencial.credencialId },
        });

        setEnvio(lerConfirmacao(confirmacao));
        // A verdade da casa é do servidor: relemos a trilha inteira em vez de pintar por dedução.
        await carregarTrilha(sessao);
      } catch (err) {
        // 401 aqui é a sessão de 30 minutos vencendo no meio do envio, que é ESPERADO: reabre a
        // identificação com o link que ainda está em memória. O que já subiu continua no servidor.
        if (ehNegativaDeAcesso(err)) {
          reabrirIdentificacao();
          return;
        }
        // SÓ a mensagem do NOSSO servidor chega ao candidato. O texto de um erro qualquer de rede
        // ("Failed to fetch") é da biblioteca, está em inglês e não diz o que fazer em seguida.
        setEnvio({
          fase: "erro",
          mensagem:
            err instanceof ApiError && err.message
              ? err.message
              : "Não foi possível enviar agora. Tente de novo em alguns minutos.",
        });
      }
    },
    [sessao, passoAtual, carregarTrilha, reabrirIdentificacao, trilha?.limites],
  );

  // ── 3. A ponte para o formulário de VT ────────────────────────────────────────────────────
  /**
   * PEDE O ENDEREÇO E ABRE, NO MESMO GESTO. O link nasce e morre DENTRO desta função.
   *
   * O PEDIDO É NO CLIQUE, NUNCA NA MONTAGEM DA TELA: o link é uma credencial com CPF, nome e data
   * de nascimento, e não se cunha credencial para quem talvez nem toque no botão. Buscar cedo
   * tornaria todo candidato com a casa do VT na régua um emissor de token, tenha ele clicado ou
   * não.
   *
   * §A.6: `resposta.link` é uma constante local e some com a pilha de chamada. Ele não vai para
   * estado, não vai para `ref`, não vai para armazenamento, não é renderizado em `href` nenhum
   * (o `<a>` que navega é criado e removido no mesmo turno síncrono, em `abrirEmAbaNova`) e não
   * entra em mensagem de erro. A resposta também não é logada, em ramo nenhum.
   *
   * O PRAZO DO LINK (`expiraEm`) CHEGA E NÃO É USADO, de propósito: o número ainda vai mudar, e
   * escrever prazo na tela é prometer ao candidato uma data que a tela não controla.
   *
   * O 401 É O MESMO 401 DE SEMPRE: a sessão de 30 minutos venceu, e quem trata é
   * `reabrirIdentificacao`, com o link do portal que continua em memória. A tela não mostra erro
   * nesse caminho, ela volta a pedir CPF e data de nascimento.
   */
  const abrirFormularioVt = useCallback(async (): Promise<AberturaDoVt> => {
    if (!sessao) return { fase: "sessao" };
    try {
      const resposta = await apiFetch<LinkDoVtParaOCandidato>("/portal/vt-link", { token: sessao });
      if (!resposta?.link) return { fase: "erro", mensagem: MSG_VT_FALHA_GENERICA };
      abrirEmAbaNova(resposta.link);
      return { fase: "abriu" };
    } catch (err) {
      if (ehNegativaDeAcesso(err)) {
        reabrirIdentificacao();
        return { fase: "sessao" };
      }
      return { fase: "erro", mensagem: mensagemDaFalhaDoVt(err) };
    }
  }, [sessao, reabrirIdentificacao]);

  // ── 4. A volta para a aba: uma releitura da trilha, e só ──────────────────────────────────
  /**
   * O CANDIDATO SAI PARA O FORMULÁRIO DO VT E VOLTA, e quem dá baixa naquela casa é a varredura da
   * coleta, do outro lado, minutos depois. Sem isto a tela só muda no próximo carregamento da
   * página, e ele fica olhando uma casa pendente que já foi resolvida.
   *
   * `visibilitychange`, NUNCA `focus`. O `focus` dispara em situações demais (fechar um modal,
   * clicar de volta na janela, voltar do seletor de arquivo do sistema), e cada uma delas viraria
   * uma releitura. A aba VOLTAR A FICAR VISÍVEL é o único gesto que significa "eu estava fora".
   *
   * QUANDO NÃO RECARREGAR é o que decide de verdade, e está em `deveRecarregarAoVoltar`, pura e
   * testada: só na trilha, nunca na conclusão, nunca sem sessão, nunca por cima de um envio em
   * andamento e nunca em cima de uma leitura já em voo.
   *
   * UM EVENTO, UMA LEITURA: nada de intervalo e nada de repetição. O `emVoo` é a trava do
   * disparo repetido (o navegador dispara o evento de novo se a pessoa sair e voltar antes de a
   * resposta chegar), e o ouvinte sai no desmonte.
   */
  const leituraEmVoo = useRef(false);
  useEffect(() => {
    const aoVoltarAVisivel = () => {
      const liberado = deveRecarregarAoVoltar({
        tela,
        terminou,
        temSessao: sessao !== "",
        envioEmAndamento: envio.fase === "analisando",
        jaCarregando: carregando || leituraEmVoo.current,
        visivel: document.visibilityState === "visible",
      });
      if (!liberado) return;
      leituraEmVoo.current = true;
      void carregarTrilha(sessao, { silencioso: true }).finally(() => {
        leituraEmVoo.current = false;
      });
    };
    document.addEventListener("visibilitychange", aoVoltarAVisivel);
    return () => document.removeEventListener("visibilitychange", aoVoltarAVisivel);
  }, [tela, terminou, sessao, envio.fase, carregando, carregarTrilha]);

  // CONCLUÍDA A TRILHA, o link e a sessão saem do sessionStorage: não há mais o que retomar e o
  // aparelho pode ser compartilhado. §A.6: minimização, e o link só permanece até o fim da trilha.
  useEffect(() => {
    if (!finalConcluido) return;
    limparGuardado(CHAVE_SESSAO);
    limparGuardado(CHAVE_LINK);
  }, [finalConcluido]);

  // ── Render ────────────────────────────────────────────────────────────────────────────────
  // A ORDEM IMPORTA: a falta de fragmento e o erro fatal vêm antes de tudo, porque nenhum dos dois
  // tem identificação que resolva; a identificação vem antes da trilha, porque sem sessão não há
  // lista para abrir.
  // SEM FRAGMENTO: instrução, nunca erro. O link dele está vivo, só não chegou até aqui, e o que
  // resolve é ele tocar de novo no mesmo link que já tem. O RH é a segunda saída, não a primeira.
  if (semFragmento) {
    return (
      <Casca centralizado>
        <div className="flex flex-col items-center text-center">
          <IconeLink cor={AZUL} tamanho={38} />
          <h1 className="font-display mt-4 text-xl font-bold text-slate-900">Abra O Link De Novo</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Esta página só abre pelo link que você recebeu no WhatsApp ou no e-mail. Toque nesse
            mesmo link de novo e você continua de onde parou.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-slate-500">
            Se o link não abrir, fale com o RH que está acompanhando a sua admissão.
          </p>
        </div>
      </Casca>
    );
  }

  if (erroFatal) {
    return (
      <Casca centralizado>
        <div className="flex flex-col items-center text-center">
          <IconeCadeado cor={AZUL} tamanho={38} />
          <h1 className="font-display mt-4 text-xl font-bold text-slate-900">Link Inválido</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{erroFatal}</p>
        </div>
      </Casca>
    );
  }

  // O fragmento ainda não foi lido: um piscar, e sem ele a identificação apareceria por um quadro
  // antes de sabermos se existe link.
  if (linkToken === null) {
    return (
      <Casca centralizado>
        <p className="text-center text-sm text-slate-500">Abrindo...</p>
      </Casca>
    );
  }

  if (!sessao) {
    return (
      <Casca semCartao>
        <TelaDeIdentificacao
          aoIdentificar={identificar}
          aoPedirAjuda={pedirAjuda}
          erro={erroIdentificacao}
          aviso={avisoSessao}
          bloqueado={bloqueado}
        />
      </Casca>
    );
  }

  if (carregando) {
    return (
      <Casca centralizado>
        <p className="text-center text-sm text-slate-500">Abrindo a sua lista de documentos...</p>
      </Casca>
    );
  }

  if (!trilha) return null;

  // Dado do cabecalho do Designer, derivado da trilha e V5-safe (so primeiro nome + cargo +
  // cliente). E valor de render, nao estado: nao toca a maquina nem a sessao.
  const candidato: Candidato = {
    primeiroNome: trilha.primeiroNome,
    cargo: trilha.cargo,
    cliente: trilha.cliente,
  };

  if (tela === "BOAS_VINDAS") {
    return (
      <Casca semCartao candidato={candidato}>
        <div className="flex w-full justify-center px-4 py-5 md:px-14 md:py-12">
          <Card className="w-full max-w-[920px] md:p-12">
            <div className="flex flex-col items-center gap-4 text-center md:flex-row md:items-center md:gap-8 md:text-left">
              <SolAvatar tamanho={132} anel="verde" className="max-md:!size-28" />
              <div className="flex flex-col items-center gap-3 md:items-start">
                <h1 className="m-0 text-[26px] font-bold leading-tight md:text-[34px]">
                  Olá, {trilha.primeiroNome}! Que bom ter você aqui.
                </h1>
                <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-portal-texto md:text-base">
                  Sou a Sol e vou acompanhar a entrega dos documentos da sua admissão. Você faz tudo
                  por aqui, e eu fico com você do início ao fim.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <span className="flex h-9 items-center gap-2 rounded-[10px] bg-portal-primaria-tint px-3.5 text-sm font-semibold text-portal-primaria">
                    <Briefcase className="size-4" aria-hidden />
                    {trilha.cargo}
                  </span>
                  <span className="flex h-9 items-center rounded-[10px] bg-[#EEF1F4] px-3.5 text-sm font-semibold text-portal-texto">
                    {trilha.cliente}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8 h-px bg-portal-linha md:mt-9" />

            <div className="mt-7 flex flex-col gap-3.5 rounded-2xl border border-portal-linha bg-[#FAFBFC] px-5 py-[18px]">
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 shrink-0 text-portal-primaria" aria-hidden />
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] font-bold">Termo De Privacidade</span>
                  <span className="text-sm leading-normal text-portal-texto">
                    Os documentos que você enviar são usados só para a sua admissão.{" "}
                    <button
                      type="button"
                      onClick={() => setTermoAberto(true)}
                      className="font-semibold text-portal-primaria underline underline-offset-2"
                    >
                      Ler o termo completo
                    </button>
                  </span>
                </div>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-portal-linha bg-white px-3.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={aceitouTermo}
                  onChange={(e) => setAceitouTermo(e.target.checked)}
                  className="size-5 shrink-0 accent-portal-primaria"
                />
                Li e aceito o termo de privacidade.
              </label>
            </div>

            {erroTermo ? (
              <p
                className="mt-4 rounded-btn border border-portal-at-ln bg-portal-at-bg px-4 py-3 text-[13px] font-medium text-portal-at-tx"
                role="alert"
              >
                {erroTermo}
              </p>
            ) : null}

            <div className="mt-7 flex md:justify-end">
              <Botao
                icone={ArrowRight}
                iconeDireita
                disabled={!aceitouTermo || salvandoTermo}
                onClick={() => void comecarComTermo()}
                className="max-md:w-full"
              >
                {salvandoTermo ? "Salvando..." : "Começar"}
              </Botao>
            </div>
          </Card>
        </div>

        {termoAberto ? <ModalTermo aoFechar={() => setTermoAberto(false)} /> : null}
      </Casca>
    );
  }

  if (tela === "REUNIR") {
    const obrigatorios = passos.filter((p) => p.exigencia === "OBRIGATORIO").length;
    const naoObrigatorios = passos.length - obrigatorios;
    return (
      <Casca semCartao candidato={candidato}>
        <div className="flex w-full justify-center px-4 py-5 md:px-14 md:py-12">
          <Card className="w-full max-w-[1040px] md:p-12">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
              <div className="flex flex-col gap-2 md:gap-2.5">
                <Sobretitulo>Antes De Começar</Sobretitulo>
                <h1 className="m-0 text-[26px] font-bold md:text-[32px]">O Que Reunir</h1>
                <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-portal-texto md:text-base">
                  Estes são os documentos da sua vaga. Deixe as fotos ou os arquivos à mão, assim
                  você não precisa parar no meio.
                </p>
              </div>
              {passos.length > 0 ? (
                <div className="flex shrink-0 gap-2.5">
                  <Tag tom="necessario">{obrigatorios} obrigatórios</Tag>
                  {naoObrigatorios > 0 ? <Tag tom="opcional">{naoObrigatorios} não obrigatórios</Tag> : null}
                </div>
              ) : null}
            </div>

            {/* Lista vazia é estado REAL (admissão ainda sem cargo, logo sem régua), e a tela
                precisa dizer isso em vez de mostrar um espaço em branco e um botão de continuar. */}
            {passos.length === 0 ? (
              <p className="mt-6 rounded-2xl border border-portal-linha bg-[#FAFBFC] p-4 text-[13px] leading-relaxed text-portal-texto">
                A sua lista de documentos ainda está sendo preparada. Fale com o RH antes de
                continuar.
              </p>
            ) : (
              <ul className="my-6 grid list-none grid-cols-1 gap-2.5 p-0 md:mb-6 md:mt-8 md:grid-cols-2 md:gap-3">
                {passos.map((passo) => {
                  const obrigatorio = passo.exigencia === "OBRIGATORIO";
                  return (
                    <li
                      key={passo.codigoTipoDocumento}
                      className="flex items-center gap-3.5 rounded-2xl border border-portal-linha bg-white px-[18px] py-4"
                    >
                      <div
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${obrigatorio ? "bg-[#F4F8FC]" : "bg-[#F4F5F7]"}`}
                      >
                        <FileIcon
                          className={`size-5 ${obrigatorio ? "text-portal-primaria" : "text-portal-muted"}`}
                          aria-hidden
                        />
                      </div>
                      <span className="flex min-w-0 grow text-[15px] font-semibold">{passo.nome}</span>
                      <EtiquetaExigencia exigencia={passo.exigencia} />
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex items-start gap-4 rounded-[18px] border border-[#F0E2C8] bg-portal-bege-tint px-4 py-4 md:items-center md:gap-5 md:px-[22px]">
              <SolAvatar tamanho={52} className="max-md:!size-10" />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">Dica Da Sol Para Fotos Nítidas</span>
                <div className="flex flex-col gap-1.5 text-sm text-portal-bege-tx md:flex-row md:flex-wrap md:gap-5">
                  <span className="flex items-center gap-1.5">
                    <Sun className="size-4" aria-hidden />
                    Boa luz, sem flash
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="size-4" aria-hidden />
                    Documento inteiro na foto
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileIcon className="size-4" aria-hidden />
                    PDF, JPG ou PNG
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-7 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
              <Botao
                variante="fantasma"
                icone={ArrowLeft}
                onClick={() => setTela("BOAS_VINDAS")}
                className="hidden md:inline-flex"
              >
                Voltar
              </Botao>
              <Botao
                icone={ArrowRight}
                iconeDireita
                onClick={() => setTela("COMO_FUNCIONA")}
                className="max-md:w-full"
              >
                Tudo pronto, continuar
              </Botao>
            </div>
          </Card>
        </div>
      </Casca>
    );
  }

  if (tela === "COMO_FUNCIONA") {
    const passosComoFunciona = [
      {
        icone: Camera,
        tom: "bg-portal-primaria-tint text-portal-primaria",
        titulo: "Você Envia",
        texto: "Tire uma foto ou escolha o arquivo do documento, um de cada vez.",
      },
      {
        icone: FileCheck2,
        tom: "bg-portal-ok-bg text-portal-ok-tx",
        titulo: "A Conferência Acontece Na Hora",
        texto: "Eu confiro o documento assim que ele chega e te digo o resultado aqui mesmo.",
      },
      {
        icone: RefreshCw,
        tom: "bg-portal-at-bg text-portal-at-tx",
        titulo: "Se Precisar, Você Corrige",
        texto:
          "Quando algo não estiver legível ou faltar, eu explico o que ajustar e você envia de novo.",
      },
    ];
    return (
      <Casca semCartao candidato={candidato}>
        <div className="flex w-full justify-center px-4 py-5 md:px-14 md:py-12">
          <Card className="w-full max-w-[860px] md:p-12">
            <div className="flex items-center gap-4 md:gap-6">
              <SolAvatar tamanho={88} anel="verde" className="max-md:!size-[72px]" />
              <div className="flex flex-col gap-1.5">
                <h1 className="m-0 text-2xl font-bold md:text-[30px]">Como Funciona</h1>
                <p className="m-0 text-sm leading-normal text-portal-texto md:text-base">
                  São três passos, e eu fico com você em todos eles.
                </p>
              </div>
            </div>

            <ol className="mt-6 flex list-none flex-col gap-3 p-0 md:mt-8 md:gap-3.5">
              {passosComoFunciona.map((p, i) => {
                const I = p.icone;
                return (
                  <li
                    key={p.titulo}
                    className="flex items-start gap-[18px] rounded-[18px] border border-portal-linha bg-white p-4 md:px-[22px] md:py-5"
                  >
                    <div
                      className={`relative flex size-12 shrink-0 items-center justify-center rounded-[14px] ${p.tom}`}
                    >
                      <I className="size-[22px]" aria-hidden />
                      <span className="absolute -left-2 -top-2 flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-portal-ink text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <h2 className="m-0 text-base font-bold">{p.titulo}</h2>
                      <p className="m-0 text-sm leading-relaxed text-portal-texto">{p.texto}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 grid grid-cols-1 gap-3.5 md:mt-5 md:grid-cols-2">
              <Nota icone={UserIcon} tom="agua">
                Cada documento tem até 3 tentativas de envio. Depois disso, um consultor assume o seu
                caso e fala com você.
              </Nota>
              <Nota icone={Clock} tom="bege">
                Não tem um documento agora? Pule e volte nele depois para completar a entrega dos
                documentos, lembrando que o seu início depende de todas as etapas concluídas.
              </Nota>
            </div>

            <div className="mt-7 flex flex-col gap-2.5 md:mt-8 md:flex-row md:items-center md:justify-between">
              <Botao
                variante="fantasma"
                icone={ArrowLeft}
                onClick={() => setTela("REUNIR")}
                className="hidden md:inline-flex"
              >
                Voltar
              </Botao>
              <Botao
                icone={ArrowRight}
                iconeDireita
                onClick={comecarTrilha}
                className="max-md:w-full"
              >
                Começar a enviar
              </Botao>
            </div>
          </Card>
        </div>
      </Casca>
    );
  }

  // ── A trilha ──────────────────────────────────────────────────────────────────────────────
  return (
    <Casca semCartao candidato={candidato}>
      {/* O PC GANHOU LAYOUT PRÓPRIO NESTA RODADA (o diretor mediu e disse que a tela anterior
          "ainda parecia mobile esticado", e estava certo: em 1920 sobrava mais de metade do
          monitor). O container vai a 1600px, o tabuleiro vira um PAINEL com respiro e o cartão de
          envio ocupa o resto em duas colunas internas (o que ler à esquerda, o que fazer à
          direita). Não há coluna de leitura longa aqui: esta é a tela de TRABALHO, não de texto.
          Abaixo de 1024px todas as classes `lg:` são inertes e o celular é o mesmo de sempre. */}
      <div className="lg:mx-auto lg:flex lg:w-full lg:max-w-[1600px] lg:items-start lg:gap-8 lg:px-10 lg:py-8 xl:gap-12">
        <Tabuleiro
          passos={passos}
          indice={indice}
          visita={visita}
          vertical={ehTelaLarga}
          /* A CASA VIRA CONTROLE, e este é o outro meio caminho até a casa que caiu para o
             consultor: quem reabre o link dias depois nunca PASSOU por ela, então nem o voltar a
             alcançaria. Clicar é só VISITA (muda a posição, nada mais), e some quando a trilha
             terminou, que é quando a tela deixa de ser a trilha. */
          aoEscolher={terminou ? undefined : irPara}
        />

        <div className="mx-auto w-full max-w-md px-4 pb-16 pt-5 lg:mx-0 lg:flex lg:min-h-[calc(100vh-12rem)] lg:max-w-none lg:flex-1 lg:items-start lg:px-0 lg:py-0">
          <div className="w-full">
            {/* A CONFERÊNCIA DO DOCUMENTO tem prioridade sobre o fim da trilha: no ÚLTIMO documento,
                o `carregarTrilha` já marcou tudo concluído (`terminou`), mas os campos que a IA leu
                dele ainda precisam ser conferidos. Sem esta precedência, o último documento pularia
                a conferência direto para o passo final. */}
            {envioEfetivo.fase === "conferir" && passoAtual ? (
              <ConferenciaDocumento
                nomeDocumento={passoAtual.nome}
                campos={envioEfetivo.sugestao.campos}
                jaConfirmados={valoresConfirmados}
                aoConfirmar={async (confirmados) => {
                  // Os rótulos saem da própria sugestão desta casa, para registrar em `camposVistos`.
                  const itens = confirmados.map((c) => ({
                    campo: c.campo,
                    valor: c.valor,
                    rotulo:
                      envioEfetivo.sugestao.campos.find((s) => s.campo === c.campo)?.rotulo ?? c.campo,
                  }));
                  return gravarConferencia(itens);
                }}
                aoAvancar={avancar}
                temProximo={proximoPasso(passos, indice, visita) !== null}
              />
            ) : terminou ? (
              finalConcluido ? (
                <Conclusao primeiroNome={trilha.primeiroNome} resumo={resumo} />
              ) : (
                <PassoFinal
                  primeiroNome={trilha.primeiroNome}
                  vazios={camposVazios}
                  aoConcluir={concluirFinal}
                />
              )
            ) : !passoAtual ? (
              <Conclusao primeiroNome={trilha.primeiroNome} resumo={resumo} />
            ) : (
              <CasaAtual
                passo={passoAtual}
                limites={trilha.limites}
                envio={envioEfetivo}
                aoEnviar={enviarArquivo}
                aoAbrirVt={abrirFormularioVt}
                aoAvancar={avancar}
                aoPular={pular}
                aoVoltar={voltar}
                temAnterior={historico.length > 0}
                temProximo={proximoPasso(passos, indice, visita) !== null}
                temCamera={temCamera}
                aceitaArrastar={ehTelaLarga}
              />
            )}
          </div>
        </div>
      </div>
    </Casca>
  );
}

/**
 * RECONSTRÓI O ENVIO DE UMA CASA a partir do que o servidor PERSISTIU (`passo.conferencia`), para a
 * tela reabrir "conferir" / "ajustar" ao navegar e ao recarregar, sem depender do estado React que
 * some (bugs 4/5/6). SEM reescrever frase nenhuma: o veredito sai como veio da lista fechada do EA.
 *
 *  - `aguardandoConfirmacao` com campos: a IA leu campos válidos a conferir, volta para "conferir".
 *  - `veredito` reprovado: a casa pede ajuste, com a mensagem do servidor e o placar de tentativas.
 *  - senão: "parado", e a casa segue o `passo.estado` (aceito, em análise, pendente).
 */
function reconstruirEnvio(passo: PassoDaTrilhaPortal | undefined): Envio {
  const conferencia = passo?.conferencia;
  if (!passo || !conferencia) return { fase: "parado" };
  if (conferencia.aguardandoConfirmacao && conferencia.campos.length > 0) {
    return {
      fase: "conferir",
      sugestao: { campos: conferencia.campos, origem: "IA", confirmadoPorHumano: false },
    };
  }
  if (conferencia.veredito && !conferencia.veredito.valido) {
    return { fase: "ajustar", mensagem: conferencia.veredito.mensagem, tentativas: passo.tentativas };
  }
  return { fase: "parado" };
}

/** Traduz a resposta do servidor em estado de tela, SEM reescrever nenhuma frase de reprovação. */
function lerConfirmacao(resposta: RespostaConfirmacao): Envio {
  const { tentativas } = resposta;

  if (tentativas?.noTime) {
    return {
      fase: "noTime",
      mensagem:
        tentativas.aviso ??
        "Um consultor vai assumir este documento e falar com você. Você pode seguir com os outros.",
    };
  }
  if (resposta.recusa) {
    return { fase: "ajustar", mensagem: resposta.recusa.mensagem, tentativas };
  }
  if (resposta.veredito && !resposta.veredito.valido) {
    return { fase: "ajustar", mensagem: resposta.veredito.mensagem, tentativas };
  }
  if (resposta.entregue) {
    // ACEITO E COM CAMPOS PARA CONFERIR: a casa abre a conferência do documento (peça 1). Sem
    // campos (tipo não mapeado, ou sugestão vazia), segue o aceito de sempre, sem tela nova.
    if (resposta.sugestao && resposta.sugestao.campos.length > 0) {
      return { fase: "conferir", sugestao: resposta.sugestao };
    }
    return { fase: "aceito" };
  }
  return {
    fase: "erro",
    mensagem: "Não foi possível confirmar o envio deste documento. Tente de novo.",
  };
}

// ── O tabuleiro ──────────────────────────────────────────────────────────────
/**
 * A FAIXA DE CASAS, FIXA NO TOPO (`sticky`), com a Sol em pé na casa atual.
 *
 * COMO A ROLAGEM CENTRA A SOL: a faixa é o container que rola na horizontal e é `relative`, então
 * `offsetLeft` da casa atual já vem em coordenada de CONTEÚDO dela. O destino é
 * `offsetLeft - metade da largura visível + metade da casa`, preso em zero para não puxar antes do
 * começo, e aplicado com `scrollTo` suave a cada troca de casa. O navegador cuida do fim da faixa
 * sozinho (ele satura no `scrollWidth`), então a última casa encosta à direita em vez de ficar
 * pendurada no vazio. Nenhuma biblioteca e nenhum `scrollIntoView`: o `scrollIntoView` rolaria
 * também a PÁGINA, e o tabuleiro é justamente a parte que não pode se mexer.
 */
/**
 * O RÓTULO DA CASA, e ele não é o nome inteiro de propósito.
 *
 * MEDIDO na prova visual com a régua real: a casa tem 74px, e "Comprovante de Residência" e
 * "Comprovante de Escolaridade" chegavam as duas como "Comprovante de...", indistinguíveis. O
 * tabuleiro existe para a pessoa saber ONDE está, e duas casas com o mesmo texto desfazem isso.
 *
 * O prefixo genérico sai e fica a palavra que distingue ("Residência", "Escolaridade", "Conta
 * Bancária"). O nome COMPLETO continua inteiro no cartão da casa atual, que é onde ele decide o que
 * enviar. Nada é traduzido nem reescrito: só o prefixo comum é omitido no rótulo curto.
 */
function rotuloCurto(nome: string): string {
  const curto = nome.replace(/^(Comprovante de|Carteira de|Certidão de|Cartão do|Cartão de)\s+/i, "");
  return curto.charAt(0).toUpperCase() + curto.slice(1);
}

/**
 * O MESMO TABULEIRO, EM DOIS EIXOS (`vertical`), e não dois tabuleiros.
 *
 * No celular ele é a FAIXA FIXA NO TOPO que rola na horizontal, exatamente como foi validado. A
 * partir de 1024px ele vira a COLUNA DA ESQUERDA: as casas descem, o nome COMPLETO do documento
 * aparece ao lado de cada uma (no celular o espaço é de 74px e o nome vai embaixo, curto), e a Sol
 * cresce para 100px e anda de cima para baixo pela calha, acompanhando a casa atual.
 *
 * A CENTRAGEM É A MESMA CONTA, SÓ QUE NO OUTRO EIXO. O container é `relative`, então `offsetTop` e
 * `offsetLeft` da casa atual já vêm em coordenada de conteúdo dele. Continua sem `scrollIntoView`,
 * pelo motivo de sempre: ele rolaria a PÁGINA junto, e o tabuleiro é a parte que não pode se mexer.
 */
function Tabuleiro({
  passos,
  indice,
  visita,
  vertical = false,
  aoEscolher,
}: {
  passos: PassoDaTrilhaPortal[];
  indice: number;
  visita: Visita;
  vertical?: boolean;
  /**
   * Clicar numa casa é VISITA, e só. Não envia, não muda estado de documento e não mexe na régua
   * do avanço: muda a posição. Ausente, as casas viram só desenho, que é o que elas eram antes.
   */
  aoEscolher?: (indice: number) => void;
}) {
  const faixaRef = useRef<HTMLDivElement | null>(null);
  // A casa atual, para a rolagem centrá-la. Tipada como `HTMLElement` porque no PC ela é um `<li>` e
  // no celular um `<div>`; o callback ref grava os dois sem brigar com o tipo do elemento.
  const casaRef = useRef<HTMLElement | null>(null);
  // ENTREGUES = casas já ACEITAS (verdade do servidor, não o estado de exibição): a casa aceita que
  // por acaso é a atual mostra ATUAL na pintura, mas continua entregue para o progresso.
  const entregues = passos.filter((p) => p.estado === "ACEITO").length;

  useEffect(() => {
    const faixa = faixaRef.current;
    const casa = casaRef.current;
    if (!faixa || !casa) return;
    if (vertical) {
      const destino = casa.offsetTop - faixa.clientHeight / 2 + casa.offsetHeight / 2;
      faixa.scrollTo({ top: Math.max(0, destino), behavior: "smooth" });
      return;
    }
    const destino = casa.offsetLeft - faixa.clientWidth / 2 + casa.offsetWidth / 2;
    faixa.scrollTo({ left: Math.max(0, destino), behavior: "smooth" });
  }, [indice, passos, vertical]);

  if (vertical) {
    // A TRILHA DO DESIGNER (PC): painel branco lateral, cabeçalho, barra de progresso e as casas em
    // coluna. A Sol NÃO sobe mais a trilha (o floreio da boneca andando saiu, o protótipo não o
    // tem); a paleta das casas continua vindo do PINTURA, com os OITO estados intactos.
    return (
      <aside
        className="sticky top-6 hidden w-[340px] shrink-0 flex-col gap-5 self-start rounded-card border border-portal-linha bg-white px-5 py-7 shadow-card lg:flex xl:w-[380px]"
        aria-label="A sua trilha de documentos"
      >
        <div className="flex flex-col gap-1 px-2.5">
          <span className="text-xs font-semibold uppercase tracking-[0.08em] text-portal-muted">
            A Sua Trilha
          </span>
          <span className="text-lg font-bold">Documentos Da Admissão</span>
        </div>
        {passos.length > 0 ? (
          <div className="px-2.5">
            <BarraProgresso entregues={entregues} total={passos.length} />
          </div>
        ) : null}
        <div
          ref={faixaRef}
          className="relative max-h-[calc(100vh-18rem)] overflow-y-auto"
          style={{ scrollbarWidth: "none" }}
          role="list"
        >
          <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
            {passos.map((passo, i) => {
              const estado = estadoDaCasa(passo, i === indice, visita);
              const pintura = PINTURA[estado];
              const ehAtual = i === indice;
              return (
                <li
                  key={passo.codigoTipoDocumento}
                  ref={ehAtual ? (el) => { casaRef.current = el; } : undefined}
                  role="listitem"
                  aria-current={ehAtual ? "step" : undefined}
                  className={`rounded-xl ${ehAtual ? "bg-portal-primaria-tint" : ""}`}
                >
                  <button
                    type="button"
                    onClick={aoEscolher ? () => aoEscolher(i) : undefined}
                    disabled={!aoEscolher}
                    aria-label={`Ir para ${passo.nome}`}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors disabled:cursor-default enabled:hover:bg-slate-50"
                  >
                    <MarcadorCasa estado={estado} pintura={pintura} numero={i + 1} ehAtual={ehAtual} tamanho={8} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className="block text-sm font-semibold leading-tight"
                        style={{ color: pintura.cor }}
                      >
                        {passo.nome}
                      </span>
                      <span className="block text-xs font-bold" style={{ color: pintura.cor }}>
                        {pintura.rotulo}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </aside>
    );
  }

  // A TRILHA DO DESIGNER (celular): barra de progresso fixa no topo mais a faixa de casas rolável,
  // que É a navegação (tocar numa casa vai até ela). A Sol andando saiu daqui também.
  return (
    <div className="sticky top-0 z-20 border-b border-portal-linha bg-white/95 backdrop-blur">
      {passos.length > 0 ? (
        <div className="px-4 pt-3">
          <BarraProgresso entregues={entregues} total={passos.length} />
        </div>
      ) : null}
      <div
        ref={faixaRef}
        className="relative flex gap-3 overflow-x-auto px-4 pb-3 pt-3"
        style={{ scrollbarWidth: "none" }}
        role="list"
        aria-label="A sua trilha de documentos"
      >
        {passos.map((passo, i) => {
          const estado = estadoDaCasa(passo, i === indice, visita);
          const pintura = PINTURA[estado];
          const ehAtual = i === indice;
          return (
            <div
              key={passo.codigoTipoDocumento}
              ref={ehAtual ? (el) => { casaRef.current = el; } : undefined}
              role="listitem"
              aria-current={ehAtual ? "step" : undefined}
              className="flex w-[74px] flex-none flex-col items-center"
            >
              <button
                type="button"
                onClick={aoEscolher ? () => aoEscolher(i) : undefined}
                disabled={!aoEscolher}
                aria-label={`Ir para ${passo.nome}`}
                className="flex w-full flex-col items-center gap-1 disabled:cursor-default"
              >
                <MarcadorCasa estado={estado} pintura={pintura} numero={i + 1} ehAtual={ehAtual} tamanho={9} />
                <span
                  className="line-clamp-2 text-center text-[10px] font-semibold leading-tight"
                  style={{ color: pintura.cor }}
                >
                  {rotuloCurto(passo.nome)}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * O MARCADOR DA CASA, painado pelo PINTURA (os OITO estados). Círculo com borda na cor do estado;
 * ACEITO troca o número pelo check. `tamanho` é a classe de tamanho (8 no PC, 9 no celular).
 */
function MarcadorCasa({
  estado,
  pintura,
  numero,
  ehAtual,
  tamanho,
}: {
  estado: EstadoDaCasa;
  pintura: Pintura;
  numero: number;
  ehAtual: boolean;
  tamanho: 8 | 9;
}) {
  return (
    <div
      className={`flex ${tamanho === 8 ? "size-8" : "size-9"} shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold`}
      style={{
        borderColor: pintura.cor,
        backgroundColor: pintura.fundo,
        color: pintura.cor,
        boxShadow: ehAtual ? `0 0 0 4px ${pintura.cor}22` : undefined,
      }}
    >
      {estado === "ACEITO" ? (
        <Check className="size-4" strokeWidth={3} style={{ color: pintura.cor }} aria-hidden />
      ) : (
        numero
      )}
    </div>
  );
}

// ── A casa atual ─────────────────────────────────────────────────────────────
function CasaAtual({
  passo,
  limites,
  envio,
  aoEnviar,
  aoAbrirVt,
  aoAvancar,
  aoPular,
  aoVoltar,
  temAnterior,
  temProximo,
  temCamera,
  aceitaArrastar,
}: {
  passo: PassoDaTrilhaPortal;
  limites?: LimitesDeArquivo | null;
  envio: Envio;
  aoEnviar: (arquivo: File) => void | Promise<void>;
  /** A ponte do VT. Devolve o que aconteceu, NUNCA o endereço (§A.6). */
  aoAbrirVt: () => Promise<AberturaDoVt>;
  aoAvancar: () => void;
  aoPular: () => void;
  /** Desfaz o último movimento da visita. Navegação, nunca envio. */
  aoVoltar: () => void;
  /** Só há para onde voltar depois do primeiro movimento, e aí o botão nem aparece. */
  temAnterior: boolean;
  temProximo: boolean;
  /** Sem câmera, o botão da câmera não existe: escolher o arquivo passa a ser o botão principal. */
  temCamera: boolean;
  /** Arrastar e soltar, o gesto de quem está no PC. No celular não existe arrastar arquivo. */
  aceitaArrastar: boolean;
}) {
  const camera = useRef<HTMLInputElement | null>(null);
  const arquivo = useRef<HTMLInputElement | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [dicaAberta, setDicaAberta] = useState(false);
  /**
   * A CASA DO VT NÃO RECEBE ARQUIVO, ELA ABRE UMA PORTA. O formulário de vale-transporte vive num
   * app externo que já está em produção, e o candidato o preenche lá (decisão do diretor: trazê-lo
   * para dentro do Portal foi medido e é caro). Quem dá baixa nesta casa é a varredura da coleta,
   * sozinha, alguns minutos depois. Aqui o upload dá lugar ao botão, e nada mais muda.
   */
  const ehVt = ehCasaDoVt(passo.codigoTipoDocumento);
  /** O estado do BOTÃO do VT, e ele nunca guarda o endereço, só o que aconteceu com ele. */
  const [vt, setVt] = useState<{ fase: "parado" | "abrindo" | "aberto" } | { fase: "erro"; mensagem: string }>({
    fase: "parado",
  });
  /* A dica vem PRONTA do servidor, dentro do passo da trilha, e é texto puro escrito por outra
     pessoa no Menu Gerencial. A tela não a formata, não a interpreta e não a completa. */
  const dica = dicaDoPasso(passo);

  /* TROCAR DE DOCUMENTO FECHA O PAINEL. O cartão não é remontado a cada casa (não há `key` por
     passo), então sem isto o painel aberto sobreviveria ao avanço e mostraria a dica do documento
     ANTERIOR sob o título do atual, que é a pior forma de errar: parece certa. */
  useEffect(() => {
    setDicaAberta(false);
    // Pelo mesmo motivo: o recado de "abri o formulário" pertence à casa do VT, e ficar de pé
    // sobre o documento seguinte diria que algo foi aberto para um documento que não tem página
    // nenhuma para abrir.
    setVt({ fase: "parado" });
  }, [passo.codigoTipoDocumento]);
  const analisando = envio.fase === "analisando";
  const podeAgir = podeEnviar(passo) && !analisando && envio.fase !== "aceito";
  // ARRASTAR NÃO VALE NA CASA DO VT: não há arquivo a receber ali, e soltar um PDF em cima dela
  // gastaria uma tentativa do candidato num envio que a casa deixou de pedir.
  const soltarLigado = aceitaArrastar && podeAgir && !ehVt;

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    // O input é zerado para o mesmo arquivo poder ser reescolhido depois de uma recusa.
    e.target.value = "";
    if (f) void aoEnviar(f);
  }

  /**
   * SOLTAR É O MESMO ENVIO, e é isso que importa: cai no MESMO `aoEnviar`, que já roda o
   * `validarArquivo` com os limites DO SERVIDOR antes de gastar credencial. Nenhum caminho
   * paralelo, nenhuma régua nova, nenhuma tentativa queimada por um atalho.
   */
  /**
   * O TOQUE NO BOTÃO DO VT. Pede o endereço e sai, no mesmo gesto, e o endereço não volta para cá.
   *
   * A trava do duplo toque é o `fase: "abrindo"`: sem ela, dois toques seguidos cunhariam dois
   * tokens e abririam duas abas.
   */
  async function abrirVt() {
    if (vt.fase === "abrindo") return;
    setVt({ fase: "abrindo" });
    const resultado = await aoAbrirVt();
    // Sessão vencida: a tela inteira já voltou para a identificação, então não há recado a dar
    // aqui. Deixar um erro de pé seria falar de uma casa que não está mais na frente do candidato.
    if (resultado.fase === "sessao") return;
    setVt(resultado.fase === "abriu" ? { fase: "aberto" } : resultado);
  }

  function soltar(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    if (!soltarLigado) return;
    const f = e.dataTransfer?.files?.[0];
    if (f) void aoEnviar(f);
  }

  return (
    <div
      onDragOver={soltarLigado ? (e) => { e.preventDefault(); setArrastando(true); } : undefined}
      onDragLeave={soltarLigado ? () => setArrastando(false) : undefined}
      onDrop={soltarLigado ? soltar : undefined}
      className={`rounded-card border bg-white p-5 shadow-card transition-colors lg:p-9 ${
        arrastando ? "border-portal-primaria bg-[#f4fbfd]" : "border-portal-linha"
      }`}
    >
      <div className="flex items-center gap-4">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-portal-primaria-tint">
          <IconeDocumento cor={AZUL} tamanho={24} />
        </span>
        <div className="flex-1">
          <h1 className="text-[22px] font-bold leading-tight text-portal-ink lg:text-[28px]">
            {passo.nome}
          </h1>
          {/* A ETIQUETA E O BOTÃO DE DICAS DIVIDEM A MESMA LINHA, e isso é medida, não estética:
              no celular o que não pode acontecer é a ação principal (enviar o documento) descer
              para fora da dobra. Numa linha que já existia, o botão custa ZERO altura nova. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <EtiquetaExigencia exigencia={passo.exigencia} />
            {/* SEM DICA CADASTRADA, O BOTÃO NÃO EXISTE. Nada de ícone desabilitado nem de painel
                vazio: prometer ajuda e abrir o silêncio é pior do que não prometer. */}
            {dica ? (
              <button
                type="button"
                onClick={() => setDicaAberta(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#f0d9a4] bg-[#fdf3d8] px-2.5 py-1 text-[12px] font-bold text-[#8a6410] transition-colors hover:bg-[#fbe9bd]"
              >
                <IconeDica cor="#d99413" tamanho={14} />
                Dicas
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* A SOL EM TODA TELA (pele do Designer): um balão de fala com a orientação do documento,
          quando há o que fazer. Na casa do VT a fala explica que o preenchimento é fora daqui. */}
      {podeAgir ? (
        <div className="mt-6">
          <SolMensagem>
            {ehVt
              ? "O vale-transporte é preenchido em outra página. Toque no botão, informe as suas conduções e envie por lá. Este item é marcado sozinho alguns minutos depois."
              : "Envie a frente e o verso no mesmo arquivo, com o documento inteiro na foto. Assim que chegar, eu confiro e mostro o resultado aqui mesmo."}
          </SolMensagem>
        </div>
      ) : null}

      {/* NO PC O CORPO VIRA DUAS COLUNAS: o que LER à esquerda, o que FAZER à direita. Foi assim
          que a horizontal passou a ser usada de verdade, sem esticar o texto de ponta a ponta.
          Só quando há o que fazer: sem ação, a coluna da direita ficaria vazia e o cartão
          pareceria quebrado, então ele volta a ser uma coluna só.
          No celular a grade não existe e a ordem empilhada é a mesma de sempre. */}
      <div
        className={
          podeAgir ? "lg:mt-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 xl:gap-10" : ""
        }
      >
        <div className="lg:min-w-0">
          {passo.estado === "ACEITO" ? (
            <Recado cor={VERDE} fundo="#eef7dc" icone={<IconeCheck cor={VERDE} tamanho={20} />}>
              Este documento já foi enviado e aceito. Não precisa enviar de novo.
            </Recado>
          ) : null}

          {passo.estado === "AJUSTAR" && envio.fase === "parado" ? (
            <Recado cor={AMARELO} fundo="#fdf3d8" icone={<IconeAlerta cor={AMARELO} tamanho={20} />}>
              Este documento precisa de ajuste. Envie de novo quando puder.
            </Recado>
          ) : null}

          {passo.estado === "EM_ANALISE" ? (
            <Recado cor={VERDE} fundo="#eef7dc" icone={<IconeCheck cor={VERDE} tamanho={20} />}>
              {/* REPOUSO, não spinner: este documento foi recebido e segue com o time. A copy não
                  promete mudança na tela para o candidato não ficar olhando à espera de algo aqui. */}
              <strong className="block text-[15px] font-bold">Documento recebido.</strong>
              <span className="mt-1.5 block text-[13px]">
                Seguimos com a conferência por aqui. Você já pode enviar o próximo, e a gente avisa
                se algum precisar de ajuste.
              </span>
            </Recado>
          ) : null}

          {/* A CASA QUE CAIU PARA O CONSULTOR é o outro ponto sem saída da tela: ela diz que alguém
              vai falar com o candidato e não dava caminho nenhum para ele falar primeiro. O botão
              do WhatsApp é esse caminho, e vale nos dois momentos da mesma casa, no que acabou de
              cair (`envio.fase`) e no que já chegou caído do servidor (`passo.estado`). */}
          {passo.estado === "NO_TIME" ? (
            <Recado cor={ROXO} fundo="#eee9fb" icone={<IconePessoa cor={ROXO} tamanho={20} />}>
              {passo.tentativas.aviso ??
                "Um consultor assumiu este documento e vai falar com você. Siga com os outros."}
              <BotaoFalarComRh className="mt-3" />
            </Recado>
          ) : null}

          {/* ANIMAÇÃO COSMÉTICA sobre a chamada SÍNCRONA (`POST /portal/confirmar` em voo). A órbita
              do Designer cobre o tempo do Gemini SEM barra de porcentagem por etapa (que mentiria
              sobre um progresso que a resposta síncrona não reporta). `PalcoAnalise` é `aria-hidden`;
              o texto de status é o que o leitor de tela anuncia. Nada aqui toca a lógica do envio. */}
          {envio.fase === "analisando" ? (
            <div
              className="mt-4 flex flex-col items-center gap-4 rounded-card bg-[#F4F8FC] p-5 text-center"
              role="status"
              aria-live="polite"
            >
              <PalcoAnalise concluido={false} compacto />
              <div>
                <p className="text-[15px] font-bold text-portal-ink">Estou conferindo o seu documento</p>
                <p className="mt-1 text-[13px] leading-relaxed text-portal-muted">
                  Leva só alguns segundos. Não feche esta tela.
                </p>
              </div>
            </div>
          ) : null}

          {envio.fase === "aceito" ? (
            <Recado cor={VERDE} fundo="#eef7dc" icone={<IconeCheck cor={VERDE} tamanho={20} />}>
              Documento aceito. Pode seguir.
            </Recado>
          ) : null}

          {envio.fase === "ajustar" ? (
            <Recado cor={AMARELO} fundo="#fdf3d8" icone={<IconeAlerta cor={AMARELO} tamanho={20} />}>
              {/* A frase vem PRONTA do servidor e sai como veio. A tela só acrescenta a contagem. */}
              {envio.mensagem}
              <span className="mt-1.5 block text-[12px] font-semibold opacity-80">
                Tentativa {envio.tentativas.usadas} de {envio.tentativas.teto}
              </span>
            </Recado>
          ) : null}

          {envio.fase === "noTime" ? (
            <Recado cor={ROXO} fundo="#eee9fb" icone={<IconePessoa cor={ROXO} tamanho={20} />}>
              {envio.mensagem}
              <BotaoFalarComRh className="mt-3" />
            </Recado>
          ) : null}

          {envio.fase === "erro" ? (
            <Recado cor={AMARELO} fundo="#fdf3d8" icone={<IconeAlerta cor={AMARELO} tamanho={20} />}>
              {envio.mensagem}
            </Recado>
          ) : null}

          {/* O QUE ACONTECEU COM A ABA DO VT. O aviso de "não abriu" não é zelo excessivo: o
              navegador do celular pode barrar a abertura de uma página nova, e nesse caso a tela
              ficaria idêntica a antes do toque, sem nada a dizer ao candidato. */}
          {ehVt && vt.fase === "aberto" ? (
            <Recado cor={AZUL} fundo="#e6f5fb" icone={<IconeLink cor={AZUL} tamanho={20} />}>
              Abri o formulário de vale-transporte em outra página. Preencha lá e depois volte para
              cá pelo mesmo link que você recebeu. Este item é marcado sozinho alguns minutos
              depois que o seu formulário chegar.
              <span className="mt-1.5 block text-[12px] font-semibold opacity-80">
                Não abriu nada? Toque de novo no botão.
              </span>
            </Recado>
          ) : null}

          {ehVt && vt.fase === "erro" ? (
            <Recado cor={AMARELO} fundo="#fdf3d8" icone={<IconeAlerta cor={AMARELO} tamanho={20} />}>
              {vt.mensagem}
              <BotaoFalarComRh className="mt-3" />
            </Recado>
          ) : null}

          {/* O teto sai da MESMA régua que recusa o arquivo, nunca escrito à mão: prometer 10 MB e
              recusar em 8 é a tela desmentindo a si mesma no gesto seguinte. No PC ele deixa de ser
              texto miúdo e vira o bloco de instrução da coluna da esquerda. */}
          {podeAgir ? (
            <div className="mt-5 lg:mt-0 lg:rounded-2xl lg:bg-[#f7fafc] lg:p-5">
              {/* A INSTRUÇÃO DA CASA DO VT DIZ O QUE VAI ACONTECER, inclusive a parte chata: ele
                  sai daqui, e esta casa NÃO fica verde na hora. Prometer conferência imediata,
                  como nas outras casas, faria o candidato voltar, olhar o item cinza e concluir
                  que o preenchimento dele se perdeu. */}
              {ehVt ? (
                <>
                  <p className="text-[13px] leading-relaxed text-slate-600 lg:text-[15px]">
                    O vale-transporte é preenchido em outra página, fora daqui. Toque no botão,
                    informe as suas conduções e envie por lá mesmo.
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-600 lg:text-[15px]">
                    Depois volte para cá pelo mesmo link que você recebeu. Este item é marcado
                    sozinho alguns minutos depois que o seu formulário chegar, e você não precisa
                    enviar nenhum arquivo aqui.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[13px] leading-relaxed text-slate-600 lg:text-[15px]">
                    {temCamera ? "Tire uma foto do documento ou escolha" : "Escolha"} um arquivo em
                    PDF, JPG ou PNG, de até {tetoDeEnvioEmMb(limites)}.
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-600 lg:text-[15px]">
                    Frente e verso no mesmo arquivo, e o documento inteiro dentro da foto.
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* A CASA DO VT TROCA O BLOCO INTEIRO DE ENVIO POR UM BOTÃO. Nada de área de arrastar,
            nada de câmera e nada de seletor de arquivo: não há arquivo a receber aqui, e deixar
            qualquer um deles de pé convidaria a um envio que a casa não pede mais.
            O mesmo quadro do PC (altura, borda, centragem) é reaproveitado sem a borda tracejada,
            que ali significa "solte o arquivo" e aqui não significaria nada. */}
        {podeAgir && ehVt ? (
          <div className="mt-5 lg:mt-0 lg:flex lg:min-h-[280px] lg:flex-col lg:items-center lg:justify-center lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-[#fbfdfe] lg:p-8 lg:text-center">
            <div className="hidden lg:flex lg:flex-col lg:items-center">
              <IconeLink cor={AZUL} tamanho={38} />
              <p className="font-display mt-3 text-[17px] font-bold text-slate-800">
                O formulário abre em outra página
              </p>
              <p className="mt-1 text-[13px] text-slate-500">e volta para cá sozinho</p>
            </div>
            <button
              type="button"
              onClick={() => void abrirVt()}
              disabled={vt.fase === "abrindo"}
              className={`${CLASSE_BOTAO} lg:max-w-[320px]`}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <IconeLink cor="#ffffff" tamanho={18} />
                {vt.fase === "abrindo"
                  ? "Abrindo o formulário..."
                  : vt.fase === "aberto"
                    ? "Abrir o formulário de novo"
                    : "Abrir o formulário de vale-transporte"}
              </span>
            </button>
          </div>
        ) : null}

        {podeAgir && !ehVt ? (
          <div
            className={`mt-5 lg:mt-0 lg:flex lg:min-h-[280px] lg:flex-col lg:items-center lg:justify-center lg:rounded-2xl lg:border-2 lg:border-dashed lg:p-8 lg:text-center lg:transition-colors ${
              arrastando ? "lg:border-[#1A4895] lg:bg-[#f4fbfd]" : "lg:border-slate-300 lg:bg-[#fbfdfe]"
            }`}
          >
            {/* A ÁREA DE ARRASTAR só existe onde arrastar existe: no celular não há de onde
                arrastar um arquivo, então ela nem é desenhada e o bloco é só os botões. */}
            {aceitaArrastar ? (
              <div className="hidden lg:flex lg:flex-col lg:items-center">
                <IconeUpload cor={AZUL} tamanho={38} />
                <p className="font-display mt-3 text-[17px] font-bold text-slate-800">
                  Arraste o arquivo para cá
                </p>
                <p className="mt-1 text-[13px] text-slate-500">ou use o botão abaixo</p>
              </div>
            ) : null}

            {temCamera ? (
              <input
                ref={camera}
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                onChange={escolher}
                className="hidden"
              />
            ) : null}
            <input
              ref={arquivo}
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={escolher}
              className="hidden"
            />

            {/* A ORDEM SE INVERTE COM O APARELHO. No celular a foto é o gesto natural e é ela que
                fica com o peso do botão principal. No PC, onde câmera é a exceção, o botão da foto
                some e escolher o arquivo assume o principal: oferecer "tirar foto" num aparelho sem
                câmera é mandar a pessoa para um seletor de arquivo com o nome errado. */}
            {temCamera ? (
              <>
                <button
                  type="button"
                  onClick={() => camera.current?.click()}
                  className={`${CLASSE_BOTAO} lg:max-w-[320px]`}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <IconeCamera cor="#ffffff" tamanho={18} />
                    Tirar foto do documento
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => arquivo.current?.click()}
                  className={`${CLASSE_BOTAO_SECUNDARIO} lg:max-w-[320px]`}
                >
                  Escolher um arquivo
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => arquivo.current?.click()}
                className={`${CLASSE_BOTAO} lg:max-w-[320px]`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  <IconeDocumento cor="#ffffff" tamanho={18} />
                  Escolher um arquivo
                </span>
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* DEPOIS DE ABRIR O VT, A CASA PRECISA TER SAÍDA. Nas outras casas quem libera o avanço é
          o envio aceito, e aqui não há envio: o candidato abriu a página do vale-transporte, e
          esta casa só fica verde quando a varredura der baixa, minutos depois. Sem este botão a
          única continuação visível seria o link discreto de escape ("preencher depois"), que diz
          o contrário do que acabou de acontecer: ele acabou de abrir. A casa segue pendente e
          continua na roda do avanço, que é a verdade: a baixa ainda não chegou. */}
      {ehVt && vt.fase === "aberto" && podeEnviar(passo) && temProximo ? (
        <button
          type="button"
          onClick={aoAvancar}
          className={`${CLASSE_BOTAO_SECUNDARIO} lg:mx-auto lg:max-w-[420px]`}
        >
          Ir para o próximo documento
        </button>
      ) : null}

      {envio.fase === "aceito" || envio.fase === "noTime" || !podeEnviar(passo) ? (
        <button
          type="button"
          onClick={aoAvancar}
          className={`${CLASSE_BOTAO} lg:mx-auto lg:max-w-[420px]`}
          disabled={!temProximo}
        >
          {temProximo ? "Ir para o próximo documento" : "Concluir"}
        </button>
      ) : null}

      {/* O RODAPÉ DE NAVEGAÇÃO. VOLTAR é movimento de VISITA (desfaz o último passo dado), e por
          isso aparece em qualquer estado da casa, inclusive nas que não aceitam envio.
          PULAR CONTINUA DISCRETO (decisão do diretor): link pequeno, nunca com peso de botão
          principal. O candidato deve entregar; pular é a exceção de quem não tem o documento.
          O TEXTO TEM UM RAMO, e ele é da casa do VT: ali não falta arquivo nenhum, porque o
          vale-transporte é preenchimento (ver `rotuloDoEscape`). As demais casas seguem iguais. */}
      {temAnterior || (podeAgir && temProximo) ? (
        <div className="mt-5 flex flex-col items-center gap-3 border-t border-slate-100 pt-4 lg:mt-7 lg:flex-row lg:justify-between lg:gap-6">
          {temAnterior ? (
            <button
              type="button"
              onClick={aoVoltar}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <IconeSeta cor="currentColor" tamanho={16} />
              Voltar para o documento anterior
            </button>
          ) : (
            <span aria-hidden="true" className="hidden lg:block" />
          )}
          {podeAgir && temProximo ? (
            <button
              type="button"
              onClick={aoPular}
              className="text-[12px] text-slate-400 underline underline-offset-2"
            >
              {rotuloDoEscape(passo.codigoTipoDocumento)}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* O PAINEL DE DICAS, pequeno e por cima. Ele é SOBREPOSTO de propósito: no celular, empurrar
          o botão de enviar para baixo para caber um texto de ajuda é trocar a ação pelo conselho. */}
      {dica && dicaAberta ? (
        <ModalDica
          nomeDoDocumento={passo.nome}
          texto={dica}
          aoFechar={() => setDicaAberta(false)}
        />
      ) : null}
    </div>
  );
}

function Conclusao({
  primeiroNome,
  resumo,
}: {
  primeiroNome: string;
  resumo: { aceitos: number; pulados: number; noTime: number; pendentes: number };
}) {
  const faltando = resumo.pulados + resumo.pendentes;
  const confete = [
    { x: 24, y: 24, s: 12, r: "rounded-full", c: "bg-soulan-verde", rot: 0 },
    { x: 210, y: 12, s: 10, r: "rounded-[3px]", c: "bg-soulan-azul-claro", rot: 20 },
    { x: 236, y: 120, s: 14, r: "rounded-full", c: "bg-soulan-coral", rot: 0 },
    { x: 8, y: 138, s: 9, r: "rounded-[3px]", c: "bg-soulan-verde-agua", rot: 35 },
    { x: 60, y: 200, s: 10, r: "rounded-[3px]", c: "bg-soulan-azul-suave", rot: 15 },
  ];
  return (
    <Card className="text-center lg:mx-auto lg:max-w-3xl lg:p-12">
      <div className="flex flex-col items-center gap-4 md:flex-row md:justify-center md:gap-10 md:text-left">
        <div className="relative h-[220px] w-[260px] shrink-0" aria-hidden>
          {confete.map((k, i) => (
            <div
              key={i}
              className={`absolute ${k.r} ${k.c}`}
              style={{ left: k.x, top: k.y, width: k.s, height: k.s, transform: `rotate(${k.rot}deg)` }}
            />
          ))}
          <SolAvatar
            tamanho={168}
            anel="nenhum"
            fundo="bg-portal-ok-bg"
            className="absolute left-[46px] top-6 shadow-[0_0_0_8px_#fff,0_0_0_10px_#AAD12F]"
          />
          <div className="absolute left-[176px] top-[150px] flex size-14 items-center justify-center rounded-full border-4 border-white bg-soulan-verde">
            <Check className="size-7 text-portal-ink" strokeWidth={3} aria-hidden />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2.5 md:items-start">
          <Sobretitulo>Trilha Concluída</Sobretitulo>
          <h1 className="m-0 text-[24px] font-bold leading-tight lg:text-[34px]">
            Pronto, {primeiroNome}! Seus documentos foram entregues.
          </h1>
          <p className="m-0 max-w-[520px] text-[15px] leading-relaxed text-portal-texto">
            Obrigada pela parceria. Agora é com a gente: nossa equipe revisa tudo e avisa você sobre
            os próximos passos.
          </p>
        </div>
      </div>

      {/* Os quatro baldes lado a lado no PC: em duas colunas eles ficavam empilhados no meio de um
          cartão largo, com o olho subindo e descendo para ler quatro números. */}
      <dl className="mt-7 grid grid-cols-2 gap-2 text-left lg:mt-8 lg:grid-cols-4 lg:gap-4">
        <Placar cor={VERDE} fundo="#eef7dc" numero={resumo.aceitos} rotulo="Aceitos" />
        <Placar cor={ROXO} fundo="#eee9fb" numero={resumo.noTime} rotulo="Com O Consultor" />
        <Placar cor={AMARELO} fundo="#fdf3d8" numero={resumo.pulados} rotulo="Pulados" />
        <Placar cor={CINZA} fundo="#eef2f6" numero={resumo.pendentes} rotulo="Aguardando" />
      </dl>

      {faltando > 0 ? (
        <p className="mt-4 text-[13px] leading-relaxed text-portal-muted lg:mt-6 lg:text-sm">
          O que ficou para depois continua te esperando: é só abrir este mesmo link de novo.
        </p>
      ) : null}
    </Card>
  );
}

// ── Peças visuais (tema claro fixo) ──────────────────────────────────────────
const CLASSE_BOTAO =
  "mt-5 w-full rounded-xl bg-[#1A4895] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#1A4895]/25 transition-all hover:bg-[#123670] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50";

const CLASSE_BOTAO_SECUNDARIO =
  "mt-3 w-full rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.985]";

/**
 * A CASCA, e ela mudou em duas coisas nesta rodada.
 *
 * 1. O BANNER passou a existir em TODA tela (pedido do diretor), e com ele a logo centrada de
 *    dentro do cartão saiu: a marca já está no topo, e repeti-la empurrava o conteúdo para baixo
 *    sem dizer nada a mais, justo no celular, que é onde a primeira dobra é curta.
 * 2. O CARTÃO RESPIRA NO PC (`lg:max-w-2xl`, mais recheio). Continua sendo uma coluna de LEITURA,
 *    e não a tela inteira: boas-vindas, o que reunir e como funciona são texto, e texto que
 *    atravessa 1920px deixa de ser lido. Quem usa a horizontal de verdade é a TRILHA, que é a tela
 *    de trabalho, e ela entra por `semCartao`.
 *
 * Abaixo de 1024px nada disto muda: todas as classes `lg:` são inertes.
 */
function Casca({
  children,
  centralizado,
  semCartao,
  candidato,
}: {
  children: ReactNode;
  centralizado?: boolean;
  semCartao?: boolean;
  /** Alimenta o `PortalHeader` do Designer (so primeiro nome + cargo + cliente, V5-safe). */
  candidato?: Candidato;
}) {
  return (
    <div
      style={{ colorScheme: "light" }}
      className="relative flex min-h-screen w-full flex-col bg-soulan-fundo text-portal-texto antialiased"
    >
      <PortalHeader candidato={candidato} />
      {semCartao ? (
        <main className="relative z-10 w-full flex-1">{children}</main>
      ) : (
        <main
          className={`relative z-10 mx-auto w-full max-w-md px-4 py-8 lg:max-w-2xl lg:py-10 ${
            centralizado ? "flex flex-1 flex-col justify-center" : ""
          }`}
        >
          <div className="rounded-card border border-portal-linha bg-white p-6 shadow-card lg:p-10">
            {children}
          </div>
        </main>
      )}
      <PortalFooter />
    </div>
  );
}

function Etiqueta({ cor, fundo, texto }: { cor: string; fundo: string; texto: string }) {
  return (
    <span
      className="inline-block rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ color: cor, backgroundColor: fundo }}
    >
      {texto}
    </span>
  );
}

function Recado({
  cor,
  fundo,
  icone,
  children,
}: {
  cor: string;
  fundo: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className="mt-4 flex items-start gap-3 rounded-2xl p-4"
      style={{ backgroundColor: fundo }}
      role="status"
      aria-live="polite"
    >
      <span className="flex-none pt-0.5">{icone}</span>
      <div className="text-[13px] font-medium leading-relaxed" style={{ color: cor }}>
        {children}
      </div>
    </div>
  );
}

function Placar({
  cor,
  fundo,
  numero,
  rotulo,
}: {
  cor: string;
  fundo: string;
  numero: number;
  rotulo: string;
}) {
  return (
    <div className="rounded-2xl p-3 lg:p-5" style={{ backgroundColor: fundo }}>
      <dt className="text-[11px] font-bold lg:text-[13px]" style={{ color: cor }}>
        {rotulo}
      </dt>
      <dd className="text-xl font-bold lg:text-3xl" style={{ color: cor }}>
        {numero}
      </dd>
    </div>
  );
}

/**
 * O PAINEL DE DICAS DE UM DOCUMENTO. Modal de LEITURA, pequeno, e desenhado para o CELULAR.
 *
 * ONDE ELE COUBE, e as larguras foram raciocinadas uma a uma:
 *  - 360px (Android pequeno) e 390px (iPhone 12 a 15, o aparelho mais comum da base): o painel é
 *    FOLHA DE BAIXO (`items-end`, cantos arredondados só em cima), colado no rodapé, que é onde o
 *    polegar está. Ele NÃO empurra nada: é sobreposto, então o botão de enviar continua onde
 *    estava, atrás dele, e reaparece intacto ao fechar.
 *  - o corpo do texto rola sozinho (`max-h`), e o rodapé com o "Fechar" fica FORA da rolagem, em
 *    `flex-none`: numa dica longa, a saída não pode ser o que a pessoa precisa caçar rolando.
 *  - a partir de 640px (`sm`) ele vira cartão centrado de 420px, que é o tamanho de um texto de
 *    ajuda legível sem virar coluna larga. No PC (`lg`) o cartão de envio já é de duas colunas e o
 *    painel continua o mesmo: ele é ajuda pontual, não conteúdo da tela.
 *
 * O TEXTO VEM DO BANCO, ESCRITO POR OUTRA PESSOA, E É RENDERIZADO COMO TEXTO. Nada de HTML cru,
 * nada de `dangerouslySetInnerHTML`: esta é uma tela PÚBLICA, e o React escapa por construção. A
 * única concessão de formatação é `whitespace-pre-line`, que preserva as quebras de linha que quem
 * escreveu digitou, e não interpreta marcação nenhuma.
 *
 * §A.41: NÃO fecha ao clicar fora, fecha por Escape, e nasce com "Fechar" visível no rodapé.
 * §A.24: "Dicas" é etiqueta e o título é título, então Title Case; "Fechar" é ação.
 */
function ModalDica({
  nomeDoDocumento,
  texto,
  aoFechar,
}: {
  nomeDoDocumento: string;
  texto: string;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dicas Do Documento"
      style={{ colorScheme: "light" }}
    >
      <div className="flex max-h-[80vh] w-full max-w-[420px] flex-col rounded-t-3xl bg-white sm:rounded-3xl">
        <div className="flex flex-none items-center gap-2.5 border-b border-slate-100 px-5 pb-3 pt-5">
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#fdf3d8]">
            <IconeDica cor="#d99413" tamanho={20} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[15px] font-bold leading-tight text-slate-900">
              Dicas Para Este Documento
            </h2>
            <p className="truncate text-[12px] text-slate-500">{nomeDoDocumento}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-700">{texto}</p>
        </div>

        <div className="flex-none border-t border-slate-100 px-5 pb-5 pt-1">
          <button type="button" onClick={aoFechar} className={CLASSE_BOTAO}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O termo, em modal PRÓPRIO desta tela (o `ui/Modal` do sistema veste o tema do operador, que
 * inverte no modo escuro). §A.41 valendo igual: NÃO fecha ao clicar fora, fecha por Escape e tem
 * saída visível no rodapé, porque modal de leitura sem "Fechar" prende quem usa o dedo.
 */
function ModalTermo({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Termo De Privacidade"
      style={{ colorScheme: "light" }}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl">
        <h2 className="font-display text-lg font-bold text-slate-900">Termo De Privacidade</h2>
        <div className="mt-3 flex flex-col gap-3 text-[13px] leading-relaxed text-slate-600">
          <p>
            Os documentos que você enviar por este link são usados apenas para conferir a sua
            admissão no Grupo Soulan.
          </p>
          <p>
            O envio é feito por um link pessoal e temporário. Não peça nem compartilhe este link com
            outra pessoa.
          </p>
          <p>
            Em caso de dúvida sobre os seus dados, fale com o RH que está acompanhando a sua
            admissão.
          </p>
        </div>
        <button type="button" onClick={aoFechar} className={CLASSE_BOTAO}>
          Fechar
        </button>
      </div>
    </div>
  );
}
