"use client";

/**
 * CENTRAL DE CANDIDATOS (A&S, onda 1): a fila de quem está em processo seletivo.
 *
 * ┌─ §A.6, E É O PONTO QUE MOLDA ESTA TELA INTEIRA ────────────────────────────────────────────┐
 * │ 1. O CPF NUNCA ENTRA NUMA URL. Nem em `router.push`, nem em `searchParams`, nem em link, nem│
 * │    na busca. A busca é `POST /as/candidatos/buscar` com o número NO CORPO, porque query      │
 * │    string aparece em log de proxy, em histórico de navegador e no cabeçalho `Referer`.       │
 * │ 2. A LISTA NÃO MOSTRA CPF, e nem sequer o recebe: o backend devolve `temCpf`, um booleano. A │
 * │    coluna Candidato mostra se a pessoa TEM o número, não qual é. O número sai só na FICHA.   │
 * │ 3. A TELA NÃO HIDRATA A LISTA COM FICHAS. Seria o caminho fácil para preencher as colunas de │
 * │    funil, e traria o CPF da base inteira para o navegador, desfazendo em uma linha a         │
 * │    minimização que o backend construiu. O funil vem da PRÓPRIA BUSCA, numa projeção mínima   │
 * │    (`AsCandidaturaNaLista`), que não devolve CPF nem texto livre de recusa.                  │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O 429, E POR QUE ELE ERA O MESMO DEFEITO DA TELA QUE JURAVA "VAGA NÃO ALOCADA" ────────────┐
 * │ A tela montava as colunas de funil com UMA CHAMADA POR VAGA (`painelDaVaga` em laço). Com   │
 * │ 481 vagas em produção isso dava 483 requisições por carregamento, contra um teto de 120 por  │
 * │ 60s, e cada mexida em filtro refazia tudo: da 121 em diante vinha 429. E o estouro caía no   │
 * │ `catch`, o estado de candidaturas ficava VAZIO, e a tabela pintava "Vaga Não Alocada" para   │
 * │ TODA pessoa, tenha vaga ou não. A ficha, que é uma chamada só, mostrava a etapa certa.       │
 * │ Agora são DUAS chamadas por carregamento, e o funil vem junto de cada pessoa da página.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * DE ONDE VEM CADA COLUNA (conserto da regressão, 06/10):
 *   - a PESSOA e as CANDIDATURAS dela (vaga, CLIENTE, CARGO, etapa, situação, último contato) vêm
 *     TODAS de `POST /buscar`, na projeção `AsCandidaturaNaLista`. Cliente e cargo deixaram de vir do
 *     cruzamento com `GET /as/vagas`: a Central de Vagas (05/10) passou a devolver só vaga LIBERADA,
 *     e a vaga em revisão (94% da base) sumia dali, apagando cliente e cargo de quase toda linha;
 *   - os FILTROS de cliente e vaga vêm de `GET /as/candidatos/opcoes` (§A.37), não de `/as/vagas`;
 *   - `GET /as/vagas` ainda é chamado, mas SÓ para a alocação manual (as vagas que recebem candidato)
 *     e para o "Ver vaga" da ficha. Nenhuma COLUNA nem FILTRO depende mais dele.
 * Uma linha é uma CANDIDATURA, e quem ainda não foi alocada aparece com a vaga em branco: pessoa sem
 * candidatura é pessoa NA BASE, não cadastro pela metade.
 *
 * ┌─ AUSENTE NÃO É VAZIO, E ESTA DISTINÇÃO É A LIÇÃO DO DEFEITO ACIMA ──────────────────────────┐
 * │ `candidaturas: []` quer dizer "esta pessoa não está em vaga nenhuma", que é estado legítimo  │
 * │ e vira "Vaga Não Alocada". `candidaturas` AUSENTE quer dizer "o funil não veio", e aí a tela │
 * │ DIZ isso, em texto, em vez de fingir que a pessoa não tem vaga. Era exatamente esse fingir   │
 * │ que fazia a lista mentir enquanto a ficha dizia a verdade.                                   │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.12 (máscara única de tabela: cabeçalho centralizado, divisória entre colunas, ícone dinâmico por
 * estado, KPI clicável como filtro), §A.11 (sem travessão), §A.24 (title case em título e tag).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CANDIDATO_ORIGEM_LABEL,
  CANDIDATURA_SITUACAO_LABEL,
  CANDIDATURA_SITUACOES,
  candidaturaViva,
  type AsCandidatoListItem,
  type AsCandidatoOrigem,
  type AsCandidatosKpis,
  type AsCandidatosOpcoes,
  type AsCandidaturaItem,
  type AsCandidaturaNaLista,
  type VagaListItem,
} from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import { ehDoPapelDaVaga, useStatusVaga } from "@/lib/as-status-vaga";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { Combobox } from "@/components/ui/Combobox";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { cn } from "@/lib/cn";
import {
  avisoDeCorte,
  buscarCandidatos,
  cardDaCandidatura,
  CARD_SEM_VAGA,
  CARD_TOTAL,
  dataHoraBr,
  filtroDeCard,
  fraseDeProgressoDeCarga,
  funilNaoVeio,
  mensagemDoErro,
  opcoesDeCandidatos,
  painelDaVaga,
} from "@/lib/as-candidatos";
import { cardsDeDesfecho, cardsDeEtapa, type CardDeFunil } from "@/lib/as-vagas-funil";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { ordemDaEtapa, rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { NovoCandidatoModal } from "@/components/as/candidatos/NovoCandidatoModal";
import { ImportarCandidatosModal } from "@/components/as/candidatos/ImportarCandidatosModal";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import { TrocarVagaModal } from "@/components/as/candidatos/TrocarVagaModal";
import { MoverCandidaturaModal } from "@/components/as/candidatos/MoverCandidaturaModal";
import { RegistrarContatoModal } from "@/components/as/candidatos/RegistrarContatoModal";

/**
 * ─ O FREIO DA CARGA INCREMENTAL (item 4 da Central de Candidatos) ────────────────────────────────
 *
 * A base tem dezenas de milhares de candidatos. A página 1 (200) continua abrindo a tela na hora
 * (item 1); as páginas SEGUINTES são pré-buscadas em SEGUNDO PLANO, uma a cada 1,5s, bem abaixo do
 * teto GLOBAL de 120 req/min que a VM compartilha (Pandapé, Digai, GI, Central de Vagas). O ritmo é
 * uma CADEIA DE setTimeout (nunca setInterval), que pausa quando a aba perde foco e retoma quando
 * volta, para de vez ao cobrir o `total`, e em 429 faz backoff em vez de martelar.
 */
const CARGA_INTERVALO_MS = 1500;
/** Página de fundo maior que a inicial: menos requisições para cobrir a base inteira (o backend
 *  aceita até 500). A página 1 segue em 200 e não muda. */
const CARGA_PAGINA_FUNDO = 500;
/** 429: espera e repete o MESMO offset, dobrando a espera até um teto. Nunca martela. */
const CARGA_BACKOFF_INICIAL_MS = 4000;
const CARGA_BACKOFF_MAX_MS = 60000;

/**
 * Uma linha da tabela: a pessoa mais, quando existe, a candidatura dela e a vaga correspondente.
 *
 * SÃO TRÊS ESTADOS, e não dois, porque "sem vaga" e "não sei" não são a mesma coisa:
 *   - `candidatura` preenchida: a pessoa está nesta vaga;
 *   - `candidatura` nula com `funilIndisponivel` falso: a pessoa não está em vaga nenhuma;
 *   - `candidatura` nula com `funilIndisponivel` VERDADEIRO: o funil desta pessoa não veio na
 *     resposta, e a tela não tem o que afirmar sobre vaga, etapa nem situação.
 */
interface Linha {
  chave: string;
  pessoa: AsCandidatoListItem;
  candidatura: AsCandidaturaNaLista | null;
  /** O funil desta pessoa não veio na busca. Diferente de "ela não tem vaga". */
  funilIndisponivel: boolean;
}

export default function CentralDeCandidatosPage() {
  // `isAdmin` é MASTER ou SUPER_ADMIN (`auth-context`), e governa SÓ a exibição da ação de trocar
  // vaga. A autoridade é o `@Roles` da rota: esconder aqui evita oferecer o que viraria 403.
  const { token, isAdmin } = useAuth();
  /*
   * O CATÁLOGO DE STATUS DA VAGA, LIDO EXPLICITAMENTE, e não pelo corrente implícito: esta tela não
   * o carregava, então a pergunta pelo papel cairia na SEMENTE enquanto nenhuma outra tela da sessão
   * tivesse buscado o catálogo. Com a semente a resposta é certa para os cinco status de origem e
   * ERRADA, em silêncio, para qualquer status que o diretor tenha criado depois. A requisição é a
   * mesma promessa memoizada que a Central de Vagas já usa: uma por carga de página, compartilhada.
   */
  const { status: catalogoStatusVaga } = useStatusVaga(token);

  const [vagas, setVagas] = useState<VagaListItem[]>([]);
  const [pessoas, setPessoas] = useState<AsCandidatoListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** O aviso do corte da busca: nulo é "a lista está inteira". */
  const [avisoCorte, setAvisoCorte] = useState<string | null>(null);
  /**
   * OS NÚMEROS REAIS DA BASE, e não a contagem das linhas carregadas (item 3 do diretor). `totalBase`
   * é quantos candidatos casam com o filtro; `kpisBase` é a quebra por etapa e por situação, ambos do
   * conjunto FILTRADO INTEIRO do servidor. O KPI deixou de mentir "só existem 200 candidatos".
   *
   * A TELA CONTINUA CARREGANDO SÓ A PÁGINA (200), com o aviso de corte: o teto é guarda deliberada de
   * §A.6 contra despejar a base inteira no navegador. O que muda é só o NÚMERO do card, que passa a
   * vir do servidor em vez de contar as linhas carregadas.
   */
  const [totalBase, setTotalBase] = useState(0);
  const [kpisBase, setKpisBase] = useState<AsCandidatosKpis | null>(null);
  /** AS OPÇÕES DOS FILTROS, da base de candidatos (§A.37), não de `/as/vagas`. */
  const [opcoes, setOpcoes] = useState<AsCandidatosOpcoes | null>(null);

  /**
   * ─ O CACHE DA CARGA INCREMENTAL VIVE SÓ AQUI, NA MEMÓRIA DO COMPONENTE (R1/R2) ────────────────
   *
   * O acumulado exibido é o próprio estado `pessoas`: a carga de fundo ANEXA a ele. `vistosRef` é o
   * conjunto de ids de candidato já anexados, para não duplicar linha ao emendar páginas. `cargaTimer`
   * guarda o setTimeout pendente da cadeia, para poder cancelá-lo.
   *
   * NADA DISTO ENCOSTA EM localStorage, sessionStorage, IndexedDB, Cache API NEM cookie: é estado e
   * ref de React, descartados quando a tela sai. O efeito de desmontagem logo abaixo ainda zera o
   * `vistosRef` e mata o timer de propósito, para a sessão não deixar rastro em memória (R2).
   */
  const vistosRef = useRef<Set<string>>(new Set());
  const cargaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * O GATILHO DA CARGA DE FUNDO, escrito SÓ quando a página 1 termina (ver `carregar`). Ele carrega
   * os filtros que produziram a página 1 e o `total` dela, e nunca os filtros VIVOS: estes mudam
   * 300ms antes de `carregar` rodar (a busca é adiada), e iniciar a carga de fundo a partir deles
   * emendaria páginas de um filtro novo sobre a lista do filtro antigo. `buscandoTexto` desliga a
   * carga de fundo: com busca por nome ou CPF ativa, a tela mantém o comportamento de hoje (item 4).
   */
  const [baseCarga, setBaseCarga] = useState<{
    origem?: AsCandidatoOrigem;
    vagaId?: string;
    /**
     * O FILTRO DO CARD VIAJA JUNTO, para a carga de fundo varrer o MESMO subconjunto que a página 1
     * trouxe. Sem ele aqui, o fundo emendaria a base inteira sobre uma lista que o card restringiu.
     */
    filtroCardEtapa?: string;
    filtroCardSituacao?: string;
    total: number;
    offsetInicial: number;
    buscandoTexto: boolean;
  } | null>(null);
  /**
   * ─ O TOTAL E O "SEM VAGA" DA BASE INTEIRA, QUE NÃO PODEM MUDAR AO CLICAR NUM CARD (§A.12) ─────
   *
   * Os cards de etapa e de desfecho vêm de `kpisBase`, que o backend conta SEM o filtro de card, e
   * por isso não zeram quando um card fica ativo. O Total e o "Sem Vaga" NÃO vêm do KPI: o Total era
   * o `total` da resposta e o "Sem Vaga" é contado nas linhas carregadas. Com o filtro de card, a
   * resposta passa a trazer só o subconjunto, então os dois encolheriam ao clicar em OUTRO card, que
   * é exatamente o que a §A.12 proíbe. Estes dois guardam o valor da BASE INTEIRA, capturado só
   * quando nenhum card de etapa/situação filtra o servidor (ver o efeito de captura logo abaixo).
   */
  const [totalSemCard, setTotalSemCard] = useState(0);
  const [semVagaSemCard, setSemVagaSemCard] = useState(0);

  // ── FILTROS. `nome`, `cpf` e `origem` vão para o backend (no CORPO do POST); `cliente` e `etapa`
  // são resolvidos aqui, porque a busca do backend não tem esses eixos e o volume da tela é pequeno.
  const [busca, setBusca] = useState("");
  /**
   * ─ FILTRO POR NOME, DE MÚLTIPLA SELEÇÃO (§A.28, pedido do diretor 27/08) ─────────────────────
   *
   * A caixa de busca no topo continua sendo a varredura por TEXTO (ela viaja no corpo do POST e
   * afunila a lista carregada). Este filtro é outra pergunta: "quero ver ESTAS pessoas", com várias
   * escolhidas ao mesmo tempo, que é o que o texto livre não faz.
   *
   * ELE GUARDA ID, E NÃO NOME. Dois candidatos podem se chamar igual, e casar por texto juntaria os
   * dois numa escolha só. O rótulo do chip é o nome, o valor é o id.
   *
   * §A.6: NOME pode entrar na busca, CPF NÃO. Este filtro roda no CLIENTE, sobre a lista já
   * carregada, então nem o nome nem o id entram em URL, em query string ou em log de proxy. A busca
   * por CPF continua onde estava, no CORPO do POST, e o número segue nunca aparecendo no endereço.
   */
  /*
   * O CATÁLOGO DE ETAPAS. `ativas` alimenta o filtro (não se filtra por etapa que saiu de
   * circulação) e `etapas`, a lista completa, resolve rótulo, cor e ORDEM de quem já está gravado,
   * inclusive numa etapa inativada depois.
   */
  const { etapas: catalogoEtapas, ativas: etapasAtivas } = useEtapas();
  // SÓ OS CÓDIGOS, memoizados, para `filtroDeCard` saber quando um card é de ETAPA (os demais são de
  // situação). Memoizado para não recriar `carregar` a cada render só por o catálogo mudar de forma.
  const codigosDeEtapa = useMemo(() => catalogoEtapas.map((e) => e.codigo), [catalogoEtapas]);
  const [fCandidatos, setFCandidatos] = useState<string[]>([]);
  const [cpfBusca, setCpfBusca] = useState("");
  const [fVaga, setFVaga] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fEtapa, setFEtapa] = useState("");
  const [fOrigem, setFOrigem] = useState<AsCandidatoOrigem | "">("");
  /**
   * ─ ESCOPO DA VISÃO (item 5): FRENTE DE TRABALHO × HISTÓRICO ──────────────────────────────────
   *
   * A visão padrão é a FRENTE DE TRABALHO: mostra só quem está EM ANDAMENTO (candidatura ATIVO) mais
   * quem ainda não foi alocado (sem vaga). Quem já recebeu desfecho (aprovado, alocado, enviado para
   * admissão, descartado, desistiu) SAI da visão padrão e aparece no HISTÓRICO, no molde da aba
   * Concluído do Gerenciador. O escopo recorta ANTES da conta dos cards, então card e tabela nunca
   * discordam: na frente, as etapas contam; no histórico, os desfechos contam.
   */
  const [escopo, setEscopo] = useState<"andamento" | "historico">("andamento");
  /**
   * O CARD ATIVO É UMA CHAVE CRUA (código de etapa, código de situação, ou um dos dois reservados),
   * e não mais um dos nove nomes escritos à mão: a lista de cards passou a vir do CATÁLOGO.
   */
  const [cardAtivo, setCardAtivo] = useState<string>(CARD_TOTAL);

  // ── MODAIS
  const [novoAberto, setNovoAberto] = useState(false);
  const [importarAberto, setImportarAberto] = useState(false);
  const [alocarAberto, setAlocarAberto] = useState(false);
  /**
   * TRAZER DE VOLTA (bug 2): quem é a pessoa e de qual vaga ela saiu. Enquanto isto existe, o modal
   * de alocação abre no modo "Trazer De Volta", com a pessoa fixa e a vaga anterior sugerida.
   */
  /** A candidatura cuja vaga está sendo corrigida (item 5). Só Master e Super Admin chegam aqui. */
  const [trocaAlvo, setTrocaAlvo] = useState<AsCandidaturaItem | null>(null);
  const [voltaAlvo, setVoltaAlvo] = useState<{
    pessoa: { id: string; nome: string };
    vagaId: string | null;
  } | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [moverAlvo, setMoverAlvo] = useState<AsCandidaturaItem | null>(null);
  const [contatoAlvo, setContatoAlvo] = useState<AsCandidaturaItem | null>(null);

  /**
   * A CARGA. DUAS leituras, em paralelo, e nenhuma delas depende da outra:
   *   1. as vagas (cliente, cargo, nome e status de cada uma), que alimentam os filtros e as
   *      colunas Cliente e Cargo;
   *   2. as pessoas da página, pela busca POST, JÁ COM AS CANDIDATURAS DE CADA UMA.
   *
   * ERAM TRÊS, e a terceira era um laço de uma chamada POR VAGA. Era ela que estourava o teto do
   * throttler (120 por 60s) com 483 requisições por carregamento e derrubava a tela inteira no 429.
   */
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    // O CARD ATIVO VIRA FILTRO DO SERVIDOR (bug do clique): o número do card vem da base inteira, e
    // o clique precisa trazer essas pessoas da base inteira, não só as linhas já carregadas. Total e
    // "Sem Vaga" não mandam filtro (ver `filtroDeCard`), então a busca deles segue a base completa.
    const cardFiltro = filtroDeCard(cardAtivo, codigosDeEtapa);
    try {
      const [listaVagas, listaPessoas] = await Promise.all([
        apiFetch<VagaListItem[]>("/as/vagas", { token }),
        buscarCandidatos(
          {
            nome: busca,
            cpf: cpfBusca.replace(/\D/g, ""),
            origem: fOrigem || undefined,
            vagaId: fVaga || undefined,
            ...cardFiltro,
          },
          token,
        ),
      ]);
      setVagas(listaVagas);
      // A BUSCA VIROU PÁGINA (Frente D, ponto 15): `itens` é a lista, e `truncado` diz se sobrou
      // gente além dela. A tela usa o aviso logo abaixo do contador de linhas.
      setPessoas(listaPessoas.itens);
      setAvisoCorte(avisoDeCorte(listaPessoas));
      // OS NÚMEROS REAIS DA BASE (item 3): `total` e `kpis` vêm do conjunto FILTRADO inteiro do
      // servidor, não da página carregada. `kpis` é opcional no contrato (o backend pode ainda não
      // enviar): ausente, o funil cai no fallback de contar as linhas carregadas, logo abaixo.
      setTotalBase(listaPessoas.total);
      setKpisBase(listaPessoas.kpis ?? null);
      // R1/R2: o acumulador de dedup é REDEFINIDO para os ids da página 1. É memória de componente,
      // nunca storage, e nasce de novo a cada carga para não arrastar ids de um filtro anterior.
      vistosRef.current = new Set(listaPessoas.itens.map((p) => p.id));
      // O GATILHO DA CARGA DE FUNDO só é escrito aqui, no fim da página 1, com os filtros que a
      // produziram. Isso evita a corrida de iniciar a carga com filtro novo sobre a lista antiga.
      setBaseCarga({
        origem: fOrigem || undefined,
        vagaId: fVaga || undefined,
        filtroCardEtapa: cardFiltro.filtroCardEtapa,
        filtroCardSituacao: cardFiltro.filtroCardSituacao,
        total: listaPessoas.total,
        offsetInicial: listaPessoas.itens.length,
        buscandoTexto: busca.trim() !== "" || cpfBusca.replace(/\D/g, "") !== "",
      });
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar a Central de Candidatos."));
    } finally {
      setCarregando(false);
    }
    // `cardAtivo` ENTRA NAS DEPENDÊNCIAS para a busca ser REFEITA ao clicar num card: antes o card só
    // filtrava no cliente, e quem não estava na página não aparecia. `codigosDeEtapa` entra porque
    // `filtroDeCard` precisa dele para saber se o card é de etapa ou de situação.
  }, [token, busca, cpfBusca, fOrigem, fVaga, cardAtivo, codigosDeEtapa]);

  /**
   * ─ OS MODAIS DE AÇÃO PEDEM A CANDIDATURA INTEIRA, E A LISTA NÃO A TEM MAIS ───────────────────
   *
   * `MoverCandidaturaModal`, `RegistrarContatoModal` e `TrocarVagaModal` são os MESMOS componentes
   * da tela da vaga, e leem campos que a projeção da lista NÃO carrega de propósito (§A.6): o nome
   * na candidatura, o motivo da recusa, a pretensão salarial, o lado da posição. Preencher esses
   * campos com nulo só para o tipo fechar faria o modal mentir em silêncio (o motivo registrado
   * desapareceria, o desvínculo perderia o lado da posição), então a tela vai BUSCAR a candidatura
   * inteira NO CLIQUE.
   *
   * É UMA CHAMADA, DEPOIS DE UM GESTO DELIBERADO, e é a diferença que define o conserto: o que
   * estourava o throttler era pedir o painel de TODAS as vagas a cada carregamento, não pedir o de
   * UMA vaga quando alguém abre uma linha. E o painel continua sendo a fonte sem CPF.
   *
   * ┌─ "UMA VAGA" É MÍNIMO EM CHAMADAS, NÃO EM REGISTROS, e o número tem de estar escrito aqui ──┐
   * │ A auditoria mediu em produção: o painel de uma vaga alcançável por esta tela traz, em        │
   * │ MÉDIA, 781 candidaturas (mediana 80, p95 867, máximo 2.460), com `candidatoNome` de cada    │
   * │ uma e 376 `motivoDescarte` em texto livre nas 13 vagas da primeira página. A tela descarta   │
   * │ tudo menos UMA linha, logo ela baixa ~780 registros que não usa.                             │
   * │                                                                                             │
   * │ POR QUE ISSO FOI APROVADO ASSIM MESMO: é a mesma superfície que o bloco §A.6 do              │
   * │ `AsCandidaturaItem` já autoriza ("as candidaturas de UMA vaga"), pelo mesmo endpoint         │
   * │ inalterado, alcançável pelo mesmo papel com um clique na tela da vaga. Nenhuma rota nova,    │
   * │ nenhum campo novo, nenhum público novo. E 781 é 0,8% dos 95.312 que esta tela baixava a      │
   * │ CADA carregamento, antes do conserto.                                                        │
   * │                                                                                             │
   * │ SEM ESTE NÚMERO ESCRITO, quem ler "uma vaga" entende "uma pessoa", e foi a auditoria que     │
   * │ exigiu o registro. A frente própria que zeraria os 780 excedentes é uma leitura estreita de  │
   * │ UMA candidatura: os campos estão todos na linha, mais um join para o nome.                    │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const [abrindo, setAbrindo] = useState<string | null>(null);

  async function abrirAcao(linha: Linha, destino: (cheia: AsCandidaturaItem) => void) {
    const resumo = linha.candidatura;
    if (!resumo) return;
    setAbrindo(linha.chave);
    setErro(null);
    try {
      const painel = await painelDaVaga(resumo.vagaId, token);
      const cheia = painel.candidaturas.find((c) => c.id === resumo.id);
      if (!cheia) {
        setErro(
          "Esta candidatura não está mais nesta vaga. Recarregue a lista para ver o estado atual.",
        );
        return;
      }
      destino(cheia);
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao abrir esta candidatura."));
    } finally {
      setAbrindo(null);
    }
  }

  // A busca por texto é adiada, para não disparar uma requisição por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => void carregar(), 300);
    return () => clearTimeout(t);
  }, [carregar]);

  /**
   * AS OPÇÕES DOS FILTROS, uma vez por sessão e não a cada tecla (§A.37): é o catálogo dos clientes,
   * cargos e vagas DISTINTOS da base de candidatos, independente do filtro de busca. Falhar aqui não
   * derruba a tela, só deixa os filtros de cliente e vaga sem opções, então o erro é silencioso e a
   * lista segue carregando normalmente.
   */
  useEffect(() => {
    let vivo = true;
    opcoesDeCandidatos(token)
      .then((o) => {
        if (vivo) setOpcoes(o);
      })
      .catch(() => {
        /* filtros sem opções não impedem a busca; §A.6 não entra aqui (só catálogo). */
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  /**
   * ─ A CARGA INCREMENTAL COM FREIO (item 4), E AS TRAVAS DE SEGURANÇA QUE ELA CARREGA ───────────
   *
   * Depois da página 1, esta cadeia pré-busca as páginas seguintes em segundo plano, EMENDANDO ao
   * cache em memória (`pessoas`), até cobrir o `total`. O efeito só começa quando `baseCarga` é
   * escrito (fim da página 1), então ele nunca corre contra o filtro vivo.
   *
   *   - FONTE ÚNICA (R3): só `POST /as/candidatos/buscar`, com offset/limite no CORPO (R4). A ficha
   *     e o painel da vaga NUNCA entram aqui, para a carga em massa não trazer CPF nenhum.
   *   - RITMO (R7): uma página a cada 1,5s por CADEIA de setTimeout, nunca setInterval.
   *   - PAUSA POR FOCO (R7): aba oculta (`visibilitychange`) ou janela desfocada (`blur`) param de
   *     agendar a próxima; `visibilitychange` visível e `focus` retomam. Um ciclo em voo quando o
   *     foco se perde confere `pausado()` antes de agendar o seguinte, então ele para sozinho.
   *   - 429 (R7): espera e repete o MESMO offset, dobrando o atraso até o teto. Não martela.
   *   - SILÊNCIO SEGURO (R5): nenhum nome, linha ou array vai para o log. O 429 loga só status e
   *     offset (números). Outro erro de fundo para a cadeia sem derrubar a tela (a página 1 fica).
   */
  useEffect(() => {
    if (!baseCarga || baseCarga.buscandoTexto) return;
    if (baseCarga.total <= baseCarga.offsetInicial) return;

    const { origem, vagaId, filtroCardEtapa, filtroCardSituacao } = baseCarga;
    let cancelado = false;
    let desfocado = false;
    let esperandoFoco = false;
    let proximoOffset = baseCarga.offsetInicial;
    let atrasoBackoff = CARGA_BACKOFF_INICIAL_MS;

    const pausado = () =>
      desfocado ||
      (typeof document !== "undefined" && document.visibilityState === "hidden");

    const agendar = (atraso: number) => {
      if (cancelado) return;
      if (pausado()) {
        esperandoFoco = true;
        return;
      }
      cargaTimer.current = setTimeout(() => void rodar(), atraso);
    };

    const rodar = async () => {
      if (cancelado) return;
      if (pausado()) {
        esperandoFoco = true;
        return;
      }
      try {
        const pagina = await buscarCandidatos(
          {
            origem,
            vagaId,
            filtroCardEtapa,
            filtroCardSituacao,
            offset: proximoOffset,
            limite: CARGA_PAGINA_FUNDO,
          },
          token,
        );
        if (cancelado) return;
        atrasoBackoff = CARGA_BACKOFF_INICIAL_MS;
        // DEDUP POR ID ao emendar: ordenação estável não deve sobrepor, mas a base é viva.
        setPessoas((atual) => {
          const resultado = atual.slice();
          for (const p of pagina.itens) {
            if (!vistosRef.current.has(p.id)) {
              vistosRef.current.add(p.id);
              resultado.push(p);
            }
          }
          return resultado;
        });
        proximoOffset += pagina.itens.length;
        // PARA de vez ao cobrir o total, ou quando a página vem incompleta (fim real da base).
        if (proximoOffset >= pagina.total || pagina.itens.length < CARGA_PAGINA_FUNDO) return;
        agendar(CARGA_INTERVALO_MS);
      } catch (err) {
        if (cancelado) return;
        const status = err instanceof ApiError ? err.status : 0;
        if (status !== 429) return; // outro erro de fundo: para em silêncio, a tela não cai.
        // R5: só status e offset (números) no log, nunca nome, linha nem o array carregado.
        console.warn(
          `[central-candidatos] carga incremental: 429 no offset ${proximoOffset}, aguardando ${atrasoBackoff}ms`,
        );
        const espera = atrasoBackoff;
        atrasoBackoff = Math.min(atrasoBackoff * 2, CARGA_BACKOFF_MAX_MS);
        agendar(espera);
      }
    };

    const retomar = () => {
      if (cancelado || !esperandoFoco || pausado()) return;
      esperandoFoco = false;
      agendar(CARGA_INTERVALO_MS);
    };
    const aoDesfocar = () => {
      desfocado = true;
      esperandoFoco = true;
      if (cargaTimer.current) {
        clearTimeout(cargaTimer.current);
        cargaTimer.current = null;
      }
    };
    const aoFocar = () => {
      desfocado = false;
      retomar();
    };
    const aoMudarVisibilidade = () => {
      if (pausado()) aoDesfocar();
      else retomar();
    };

    agendar(CARGA_INTERVALO_MS);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("focus", aoFocar);
    window.addEventListener("blur", aoDesfocar);

    return () => {
      cancelado = true;
      if (cargaTimer.current) {
        clearTimeout(cargaTimer.current);
        cargaTimer.current = null;
      }
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("focus", aoFocar);
      window.removeEventListener("blur", aoDesfocar);
    };
  }, [baseCarga, token]);

  /**
   * R2: NO FIM DA SESSÃO/TELA, O CACHE É DESCARTADO DE PROPÓSITO. O estado `pessoas` some com o
   * componente, mas o acumulador de dedup e o timer de fundo são zerados aqui explicitamente, para
   * nenhuma linha carregada sobreviver à desmontagem em memória.
   */
  useEffect(() => {
    return () => {
      vistosRef.current = new Set();
      if (cargaTimer.current) {
        clearTimeout(cargaTimer.current);
        cargaTimer.current = null;
      }
    };
  }, []);

  const vagaPorId = useMemo(() => new Map(vagas.map((v) => [v.id, v])), [vagas]);

  /**
   * AS OPÇÕES DO FILTRO DE NOME, tiradas das PESSOAS e não das LINHAS: quem está em três vagas tem
   * três linhas na tabela e uma pessoa só na base, e listá-la três vezes no seletor faria o
   * consultor escolher "a mesma" pessoa achando que são outras.
   *
   * Ordenadas por nome em pt-BR, porque quem procura alguém procura pela letra.
   */
  const optCandidatos = useMemo(
    () =>
      [...pessoas]
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
        .map((p) => ({ value: p.id, label: p.nome })),
    [pessoas],
  );

  /**
   * O FUNIL NÃO VEIO NESTA RESPOSTA? A pergunta é feita sobre a página inteira, porque o campo é da
   * projeção: ou a busca o envia para todo mundo, ou não o envia para ninguém.
   *
   * ELA EXISTE PARA A TELA NÃO MENTIR. Sem essa distinção, ausência de funil viraria "Vaga Não
   * Alocada" em todas as linhas, que foi o segundo sintoma do 429 e o motivo de a lista contradizer
   * a ficha da mesma pessoa.
   */
  const funilIndisponivel = useMemo(() => funilNaoVeio(pessoas), [pessoas]);

  /** As linhas, antes do card e dos filtros locais. Pessoa sem candidatura vira uma linha só. */
  const linhasBase = useMemo<Linha[]>(
    () =>
      pessoas.flatMap<Linha>((p) => {
        /*
         * AUSENTE x VAZIO. `undefined` é "a busca não mandou o funil desta pessoa", e a linha fica
         * em um terceiro estado, que a tabela mostra como tal. Lista VAZIA é "ela não está em vaga
         * nenhuma", que é estado legítimo e continua sendo "Vaga Não Alocada".
         */
        if (p.candidaturas === undefined) {
          return [{ chave: p.id, pessoa: p, candidatura: null, funilIndisponivel: true }];
        }
        const minhas = p.candidaturas.filter((c) => !fVaga || c.vagaId === fVaga);
        if (minhas.length === 0) {
          return fVaga
            ? []
            : [{ chave: p.id, pessoa: p, candidatura: null, funilIndisponivel: false }];
        }
        /*
         * CLIENTE, CARGO E VAGA VÊM TODOS DA PRÓPRIA PROJEÇÃO (`AsCandidaturaNaLista`), e não mais do
         * cruzamento com `GET /as/vagas` (conserto da regressão, 06/10). A Central de Vagas (05/10)
         * fez aquela rota devolver só vaga LIBERADA, então a vaga em revisão (94% da base) sumia da
         * lista e cliente/cargo pintavam vazio embora a vaga exista. A linha deixou de carregar o
         * objeto da vaga: a tabela lê `clienteNome`/`cargoNome`/`vagaNome` da candidatura.
         */
        return minhas.map((c) => ({
          chave: c.id,
          pessoa: p,
          candidatura: c,
          funilIndisponivel: false,
        }));
      }),
    [pessoas, fVaga],
  );

  /**
   * OS NÚMEROS DOS CARDS. Contados sobre as linhas já filtradas por cliente e etapa, mas ANTES do
   * card: o card é um filtro, e um filtro que altera o próprio número que ele mostra não serve de
   * nada (clicar zeraria os outros cards e a tela perderia a referência).
   */
  const linhasSemCard = useMemo(
    () =>
      linhasBase.filter((l) => {
        /*
         * ─ ESCOPO DA VISÃO (item 5): FRENTE DE TRABALHO × HISTÓRICO ──────────────────────────────
         *
         * EM ANDAMENTO é candidatura ATIVO, mais quem ainda não foi alocado (sem candidatura). Quem
         * já recebeu qualquer desfecho (aprovado, alocado, enviado para admissão, descartado,
         * desistiu) NÃO é frente de trabalho: sai da visão padrão e mora no HISTÓRICO. O recorte vem
         * ANTES da conta dos cards, de propósito, para o card sempre bater com a tabela.
         */
        // A LINHA SEM FUNIL FICA NA FRENTE DE TRABALHO, e não no Histórico: mandar para o
        // histórico quem a tela não conseguiu resolver seria decidir o desfecho dela no escuro.
        const emAndamento = l.candidatura === null || l.candidatura.situacao === "ATIVO";
        if (escopo === "andamento" && !emAndamento) return false;
        if (escopo === "historico" && emAndamento) return false;
        // LISTA VAZIA É "TODOS" (§A.28): sem isso a tela abriria vazia esperando alguém marcar.
        if (fCandidatos.length > 0 && !fCandidatos.includes(l.pessoa.id)) return false;
        // O FILTRO DE CLIENTE CASA PELO NOME DE EXIBIÇÃO, e não mais por `codCliente`: a projeção da
        // candidatura carrega `clienteNome` (coalesce operação/razão), não o código, e a opção do
        // filtro vem do mesmo nome, via `/as/candidatos/opcoes`. Linha sem candidatura não tem
        // cliente, então sai quando o filtro está ativo, que é o comportamento de antes.
        if (fCliente && l.candidatura?.clienteNome !== fCliente) return false;
        /*
         * O FILTRO DE ETAPA SÓ ALCANÇA QUEM ESTÁ VIVO (peça P1 do bug 1), e era aqui que a contagem
         * distorcia: a comparação olhava só `etapa`, então filtrar "Triagem" trazia junto quem foi
         * DESCARTADO na Triagem, e o filtro DISCORDAVA do card de mesmo nome.
         *
         * ELE CONTINUA COMO ESTAVA, e o recorte dele é `candidaturaViva` (todo mundo menos
         * DESCARTADO e DESISTIU), enquanto o CARD da etapa conta só quem está `ATIVO`. Os dois
         * concordam nas duas saídas sem êxito, que era o defeito corrigido, e ainda diferem nos três
         * desfechos BONS: filtrar "Triagem" traz junto quem foi APROVADO ou ALOCADO estando na
         * Triagem, e essas pessoas aparecem nos cards de desfecho. Está REGISTRADO e não foi mexido:
         * mudar o alcance do filtro é comportamento já validado e fora desta correção (§A.14/§A.26).
         */
        if (fEtapa && !(l.candidatura && candidaturaViva(l.candidatura.situacao))) return false;
        if (fEtapa && l.candidatura?.etapa !== fEtapa) return false;
        return true;
      }),
    [linhasBase, fCandidatos, fCliente, fEtapa, escopo],
  );

  /**
   * ─ A CONTA DOS CARDS, LIDA DO CATÁLOGO DE ETAPAS ─────────────────────────────────────────────
   *
   * ERAM CINCO BLOCOS ESCRITOS À MÃO, com rótulo, ícone e cor fixos no JSX, e o preço disso já
   * estava sendo pago: a etapa que o diretor cadastrasse não ganhava card e ia parar dentro do card
   * de Aprovação, em silêncio; e `ALOCADO` era fundido com `APROVADO`, escondendo quem já teve a
   * posição entregue atrás de quem só a tem reservada.
   *
   * A MONTAGEM É A MESMA PEÇA DA CENTRAL DE VAGAS (`lib/as-vagas-funil`), e não uma segunda régua:
   * `cardsDeEtapa` recebe o CATÁLOGO e o mapa de contagem, `cardsDeDesfecho` recebe o mapa das
   * situações. Daí saem, de graça, as quatro réguas que a outra fileira já cumpre: a lista vem do
   * catálogo (nunca das chaves do mapa), a etapa vazia aparece com ZERO, a cor é a que o diretor
   * escolheu, e a etapa fora de circulação COM GENTE DENTRO aparece marcada como inativa (a inativa
   * vazia fica de fora). O catálogo lido aqui é o completo, que é o que `useEtapas` já busca com
   * `?incluirInativas=1`.
   *
   * O QUE NÃO VEM DO CATÁLOGO SÃO OS DOIS CARDS QUE NÃO SAEM DE UMA CANDIDATURA: o `total` e o
   * "Sem Vaga", que é a pessoa na base ainda não alocada, ou seja, a AUSÊNCIA de candidatura.
   */
  /**
   * O "SEM VAGA" DAS LINHAS CARREGADAS: a pessoa na base que não está em vaga nenhuma (ausência de
   * candidatura), fora a linha cujo funil não veio (que não se sabe classificar). É a contagem LOCAL,
   * que o snapshot abaixo congela como número da base inteira quando nenhum card filtra o servidor.
   */
  const semVagaLocal = useMemo(
    () => linhasSemCard.filter((l) => !l.candidatura && !l.funilIndisponivel).length,
    [linhasSemCard],
  );

  /**
   * ─ O SNAPSHOT DA BASE INTEIRA PARA O TOTAL E O "SEM VAGA" (§A.12: card não muda ao clicar) ─────
   *
   * Sem card de etapa/situação ativo (Total ou "Sem Vaga"), a busca devolve a base inteira, então
   * `totalBase` e `semVagaLocal` são os números reais da base. Com um card ativo, a busca devolve só
   * o subconjunto, e recontá-los dali faria os dois encolherem ao clicar em OUTRO card. Capturados
   * aqui só quando o servidor NÃO está restringido por card, eles continuam mostrando a base inteira.
   */
  const semFiltroDeCardAtivo = cardAtivo === CARD_TOTAL || cardAtivo === CARD_SEM_VAGA;
  useEffect(() => {
    if (carregando || !semFiltroDeCardAtivo) return;
    setTotalSemCard(totalBase);
    setSemVagaSemCard(semVagaLocal);
  }, [carregando, semFiltroDeCardAtivo, totalBase, semVagaLocal]);

  // O NÚMERO EXIBIDO: vivo enquanto nenhum card de etapa/situação filtra o servidor; o snapshot da
  // base inteira quando um filtra. Assim clicar num card NÃO mexe no Total nem no "Sem Vaga".
  const totalExibido = semFiltroDeCardAtivo ? totalBase : totalSemCard;
  const semVagaExibido = semFiltroDeCardAtivo ? semVagaLocal : semVagaSemCard;

  const funil = useMemo(() => {
    /*
     * ─ OS NÚMEROS DOS CARDS SÃO OS REAIS DA BASE, E NÃO A CONTAGEM DAS LINHAS CARREGADAS (item 3) ─
     *
     * A tela carrega só a página (200), então contar as linhas faria o KPI dizer que existem 200
     * candidatos quando há dezenas de milhares. `kpisBase` (`porEtapa`/`porSituacao`) é a contagem
     * agregada do servidor sobre o conjunto FILTRADO inteiro, antes do corte de página, e o backend
     * NÃO aplica o filtro de card a ele: por isso clicar num card não zera as etapas nem os desfechos.
     *
     * A CONTAGEM LOCAL FICA DE FALLBACK: `kpis` é campo OPCIONAL no contrato (o backend desta frente
     * sobe em paralelo). Enquanto ele não vier, a fileira conta as linhas carregadas, como antes, em
     * vez de aparecer zerada.
     */
    const porEtapaLocal: Record<string, number> = {};
    const porDesfechoLocal: Record<string, number> = {};
    for (const l of linhasSemCard) {
      if (!l.candidatura) continue;
      const chave = cardDaCandidatura(l.candidatura.etapa, l.candidatura.situacao);
      // A SITUAÇÃO VENCE A ETAPA: quem já recebeu decisão sai da contagem de etapa e entra na de
      // desfecho, mesmo tendo uma etapa gravada na linha. É a régua do contrato do backend.
      const alvo = l.candidatura.situacao === "ATIVO" ? porEtapaLocal : porDesfechoLocal;
      alvo[chave] = (alvo[chave] ?? 0) + 1;
    }
    const porEtapa = kpisBase?.porEtapa ?? porEtapaLocal;
    const porDesfecho = kpisBase?.porSituacao ?? porDesfechoLocal;
    return {
      // TOTAL E "SEM VAGA" VÊM DO SNAPSHOT DA BASE INTEIRA (ver acima), nunca do subconjunto que o
      // filtro de card devolve: um filtro que muda o próprio número que mostra não serve de nada.
      total: totalExibido,
      semVaga: semVagaExibido,
      etapas: cardsDeEtapa(catalogoEtapas, porEtapa),
      desfechos: cardsDeDesfecho(porDesfecho),
    };
  }, [linhasSemCard, catalogoEtapas, kpisBase, totalExibido, semVagaExibido]);

  const linhas = useMemo(() => {
    if (cardAtivo === CARD_TOTAL) return linhasSemCard;
    // "Sem Vaga" é quem não está em vaga nenhuma, e não quem a tela não conseguiu resolver.
    if (cardAtivo === CARD_SEM_VAGA)
      return linhasSemCard.filter((l) => l.candidatura === null && !l.funilIndisponivel);
    // Nos demais, a chave do card é o próprio código (da etapa ou da situação), e a régua do filtro
    // é EXATAMENTE a que contou o número: card e tabela não têm como discordar.
    return linhasSemCard.filter(
      (l) =>
        l.candidatura !== null &&
        cardDaCandidatura(l.candidatura.etapa, l.candidatura.situacao) === cardAtivo,
    );
  }, [linhasSemCard, cardAtivo]);

  /**
   * ─ §A.29: A ORDENAÇÃO CLICÁVEL, reusando a peça que o resto do sistema já usa ────────────────
   *
   * `useOrdenacao` + `ColunaOrdenavel` são os mesmos da Integração e da Gestão Das Assinaturas. Nada
   * de ordenação escrita à mão aqui: um jeito só de ordenar no sistema inteiro.
   *
   * ELA ENVOLVE O FIM DA CADEIA, e é isso que faz filtro e ordenação CONVIVEREM. A cadeia da tela é
   * `linhasBase` (busca do backend) → `linhasSemCard` (cliente e etapa) → `linhas` (o card ativo) →
   * ORDENAÇÃO. Trocar de filtro só troca a lista que entra aqui, e a coluna escolhida continua de pé
   * porque ela mora no estado do `useOrdenacao`, não na lista; clicar no cabeçalho só reordena o que
   * o filtro deixou passar, sem tocar em filtro nenhum. Enquanto ninguém clica, a lista sai intacta.
   *
   * Client-side é honesto nesta tela: ela carrega o conjunto inteiro (a busca é POST sem paginação),
   * diferente do Gerenciador, que é paginado no servidor e por isso ficou de fora da peça.
   *
   * ETAPA E SITUAÇÃO ORDENAM PELO CATÁLOGO, não pelo rótulo. Alfabética, "Aprovação" viria antes de
   * "Captação" e o funil apareceria embaralhado; pelo índice do catálogo a coluna sobe na ordem do
   * processo, do começo para o fim, que é como o time lê o funil.
   *
   * ÚLTIMO CONTATO É DATA, e a candidatura sem contato registrado devolve `null`: o `useOrdenacao`
   * manda vazio para o FIM nas DUAS direções, então inverter a seta nunca traz um bando de "não
   * informado" para o topo empurrando o dado útil para longe. Vale igual para a linha SEM VAGA, que
   * não tem etapa, situação nem vaga para comparar.
   */
  const colunasOrdenaveis = useMemo<ColOrd<Linha>[]>(
    () => [
      { chave: "candidato", tipo: "texto", valor: (l) => l.pessoa.nome },
      {
        chave: "vaga",
        tipo: "texto",
        // O mesmo texto que a célula mostra: nome de divulgação e, na falta dele, o código.
        valor: (l) => l.candidatura?.vagaNome ?? l.candidatura?.vagaCodigo ?? null,
      },
      { chave: "cliente", tipo: "texto", valor: (l) => l.candidatura?.clienteNome ?? null },
      { chave: "cargo", tipo: "texto", valor: (l) => l.candidatura?.cargoNome ?? null },
      {
        chave: "etapa",
        tipo: "status",
        /*
         * ORDENA PELO QUE A CÉLULA MOSTRA (peça P1). A encerrada devolve `null`, que o `useOrdenacao`
         * manda para o FIM nas duas direções: ordenar o "Fora Do Funil" pelo índice da etapa
         * congelada espalharia os encerrados no meio do funil, e a coluna passaria a ordenar por um
         * dado que ela deixou de exibir.
         */
        valor: (l) =>
          l.candidatura && candidaturaViva(l.candidatura.situacao)
            ? ordemDaEtapa(l.candidatura.etapa, catalogoEtapas)
            : null,
      },
      {
        chave: "situacao",
        tipo: "status",
        valor: (l) =>
          l.candidatura ? CANDIDATURA_SITUACOES.indexOf(l.candidatura.situacao) : null,
      },
      { chave: "ultimoContato", tipo: "data", valor: (l) => l.candidatura?.ultimoContatoEm ?? null },
    ],
    // O CATÁLOGO ENTRA NAS DEPENDÊNCIAS: sem ele, a coluna Etapa ficaria congelada na ordem
    // calculada ANTES de a rota responder, ou seja, todo mundo empatado no fim da lista.
    [catalogoEtapas],
  );
  const ord = useOrdenacao(colunasOrdenaveis, linhas);
  const visiveis = ord.itens;

  /**
   * AS OPÇÕES DE VAGA E DE CLIENTE VÊM DE `/as/candidatos/opcoes` (§A.37), não de `/as/vagas`. A
   * Central de Vagas (05/10) fez `/as/vagas` devolver só vaga LIBERADA, e com isso estes dois filtros
   * encolhiam para as 6% liberadas, escondendo o cliente e a vaga de quase toda a base. O endpoint de
   * opções traz os DISTINTOS que de fato aparecem nas candidaturas, qualquer que seja o status.
   */
  const optVagas = useMemo(
    () =>
      (opcoes?.vagas ?? []).map((v) => ({
        value: v.id,
        label: v.nome ?? v.codigo ?? "Vaga sem nome",
        hint: v.codigo ?? undefined,
      })),
    [opcoes],
  );

  /**
   * O FILTRO DE CLIENTE CASA PELO NOME, porque a projeção da candidatura carrega `clienteNome` e não
   * o código (a opção por código não teria como ser aplicada na linha). Nomes repetidos são
   * deduplicados, para o mesmo rótulo não aparecer duas vezes no seletor.
   */
  const optClientes = useMemo(() => {
    const nomes = new Set<string>();
    for (const c of opcoes?.clientes ?? []) if (c.nome) nomes.add(c.nome);
    return [...nomes]
      .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
      .map((nome) => ({ value: nome, label: nome }));
  }, [opcoes]);

  /**
   * ─ AS VAGAS QUE PODEM RECEBER ALOCAÇÃO MANUAL, E A RÉGUA NÃO É "RECEBE CANDIDATO" ─────────────
   *
   * A CONDIÇÃO ERA O LITERAL `v.status === "ABERTA"`, herdado de quando status era uma união de
   * cinco literais. O literal pergunta pelo NOME da linha do catálogo, e quem decide é o PAPEL dela,
   * que é único e é o que o backend consulta. Trocado pelo papel `ABERTURA`, o comportamento de hoje
   * fica idêntico (o papel resolve exatamente para a linha "ABERTA") e um código novo de mesmo papel
   * passa a ser lido sem ninguém escrever o nome dele.
   *
   * ┌─ POR QUE NÃO `vagaRecebeCandidato`, QUE PARECE A PERGUNTA CERTA E NÃO É ───────────────────┐
   * │ Decisão da auditoria de segurança, e ela é o ponto mais delicado desta lista. A vaga        │
   * │ PENDENTE DE REVISÃO (papel `REVISAO`, espelhada do Pandapé pela varredura) TEM              │
   * │ `recebeCandidato = true`, e precisa ter: sem isso a ingestão não teria onde pendurar as     │
   * │ candidaturas que acabou de ler, e ela pararia de funcionar em silêncio.                     │
   * │                                                                                             │
   * │ MESMO ASSIM ELA FICA FORA DESTE SELETOR, e o motivo é o cliente. Enquanto `cod_cliente` for │
   * │ NULO, não há finalidade determinada para o dado das pessoas que forem alocadas ali: ninguém │
   * │ sabe para qual controlador aquele processo seletivo está trabalhando. RECEBER da ingestão   │
   * │ (um espelho do que já existe no ATS) e SER OFERECIDA para alocação manual (uma decisão nova │
   * │ que uma pessoa toma na tela) são duas coisas diferentes, e só a segunda passa por aqui.     │
   * │                                                                                             │
   * │ O caminho de quem precisa alocar numa vaga dessas é o mesmo de sempre: revisar a vaga na    │
   * │ tela de Vagas Pendentes De Revisão, vincular o cliente e liberar. Liberada, ela passa a ser │
   * │ do papel `ABERTURA` e aparece aqui sozinha.                                                 │
   * └─────────────────────────────────────────────────────────────────────────────────────────────┘
   */
  const vagasAbertas = useMemo(
    () =>
      /*
       * A LISTA VAZIA CAI NO CATÁLOGO CORRENTE, e isso não é detalhe: enquanto a leitura não voltou
       * (ou se ela falhar), `catalogoStatusVaga` é `[]`, e com ele o papel de TODA vaga responderia
       * `null`. O seletor de alocação ficaria vazio sem nada falhar, que é o modo de falha que esta
       * régua inteira existe para não ter. Sem o catálogo próprio, a pergunta usa o corrente, que é
       * o último lido na sessão ou a semente, exatamente como no resto do sistema.
       */
      vagas.filter((v) =>
        ehDoPapelDaVaga(v.status, "ABERTURA", catalogoStatusVaga.length ? catalogoStatusVaga : undefined),
      ),
    [vagas, catalogoStatusVaga],
  );

  const filtrosAtivos =
    (fCandidatos.length ? 1 : 0) +
    (cpfBusca ? 1 : 0) +
    (fVaga ? 1 : 0) +
    (fCliente ? 1 : 0) +
    (fEtapa ? 1 : 0) +
    (fOrigem ? 1 : 0);

  function limparFiltros() {
    setFCandidatos([]);
    setCpfBusca("");
    setFVaga("");
    setFCliente("");
    setFEtapa("");
    setFOrigem("");
  }

  /**
   * ─ O ESTADO DA CARGA, PARA O INDICADOR E PARA O AVISO DE CORTE (item 4) ──────────────────────
   *
   * Com busca por nome ou CPF ativa, a tela mantém o comportamento de hoje: a página do servidor,
   * com o aviso de corte quando sobra gente. SEM busca de texto, a carga de fundo acumula a base
   * inteira, então o indicador de progresso toma o lugar do aviso de corte, que diria "use a busca"
   * justamente quando a carga de fundo torna isso desnecessário.
   */
  const buscandoTexto = busca.trim() !== "" || cpfBusca.replace(/\D/g, "") !== "";
  const carregadosNaBase = Math.min(pessoas.length, totalBase);

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Central De Candidatos"
        subtitle="Cada linha é uma candidatura: a pessoa em uma vaga, com a etapa em que ela está no funil. Quem ainda não foi alocada aparece sem vaga, porque pessoa na base não é cadastro pela metade."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dim">
          {carregando
            ? "Carregando os candidatos."
            : `${linhas.length} ${linhas.length === 1 ? "linha na fila" : "linhas na fila"}.`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {/* §A.6: a busca por NOME também viaja no corpo do POST, junto com o resto. Nada desta
              tela monta URL com dado de pessoa. */}
          <input
            type="search"
            className="ds-input w-72 rounded-full"
            placeholder="Buscar por nome"
            aria-label="Buscar por nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
            {/* NOME VEM PRIMEIRO porque é como se procura gente. O CPF fica logo abaixo, e continua
                viajando no corpo do POST (§A.6). */}
            <FiltroCampo label="Candidato">
              <Combobox
                multiple
                value={fCandidatos}
                onChange={setFCandidatos}
                options={optCandidatos}
                placeholder="Todos"
                ariaLabel="Candidato"
                searchable
                limpavel
              />
              <p className="mt-1 text-[11.5px] text-faint">
                Dá para escolher vários de uma vez. A lista traz quem a busca por nome deixou passar,
                e o recorte é feito aqui na tela.
              </p>
            </FiltroCampo>
            <FiltroCampo label="Buscar por CPF">
              <input
                className="ds-input"
                value={cpfBusca}
                onChange={(e) => setCpfBusca(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
                aria-label="Buscar por CPF"
              />
              <p className="mt-1 text-[11.5px] text-faint">
                A busca por CPF é exata e o número viaja no corpo da requisição, nunca no endereço
                da página.
              </p>
            </FiltroCampo>
            <FiltroCampo label="Vaga">
              <Combobox
                value={fVaga}
                onChange={setFVaga}
                options={optVagas}
                placeholder="Todas"
                ariaLabel="Vaga"
                searchable
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Cliente">
              <Combobox
                value={fCliente}
                onChange={setFCliente}
                options={optClientes}
                placeholder="Todos"
                ariaLabel="Cliente"
                searchable
                limpavel
              />
            </FiltroCampo>
            <FiltroCampo label="Etapa">
              <Combobox
                value={fEtapa}
                onChange={setFEtapa}
                options={etapasAtivas.map((e) => ({
                  value: e.codigo,
                  label: e.rotulo,
                }))}
                placeholder="Todas"
                ariaLabel="Etapa"
                limpavel
              />
            </FiltroCampo>
            {/* ORIGEM É SÓ O SISTEMA DE ONDE A PESSOA VEIO. */}
            <FiltroCampo label="Origem">
              <Combobox
                value={fOrigem}
                onChange={(v) => setFOrigem(v as AsCandidatoOrigem | "")}
                options={AS_CANDIDATO_ORIGEM.map((o) => ({
                  value: o,
                  label: AS_CANDIDATO_ORIGEM_LABEL[o],
                }))}
                placeholder="Todas"
                ariaLabel="Origem"
                limpavel
              />
            </FiltroCampo>
          </FiltroTrigger>
          {/* A QUARTA AÇÃO DA TELA. Ela existe porque o único caminho de alocação passava pelo dedup
              por CPF, e quem foi cadastrado SEM CPF ficava em beco sem saída: existia na base e não
              entrava em vaga nenhuma. Aqui a escolha é pelo nome, e a alocação vai por id. */}
          <Button variant="secondary" onClick={() => setImportarAberto(true)} className="py-2.5">
            Importar Candidatos
          </Button>
          <Button variant="secondary" onClick={() => setAlocarAberto(true)} className="py-2.5">
            Adicionar à vaga
          </Button>
          <Button onClick={() => setNovoAberto(true)} className="py-2.5">
            Novo candidato
          </Button>
        </div>
      </div>

      {erro && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      {/* O CORTE DA BUSCA (Frente D, ponto 15). A lista sempre teve teto; o que não podia continuar
          é ele ser invisível, porque a tela passava a apresentar uma janela como se fosse a base.
          SÓ APARECE NA BUSCA POR TEXTO: sem ela, a carga de fundo acumula a base inteira e o
          indicador de progresso logo abaixo substitui este aviso (item 4). */}
      {buscandoTexto && avisoCorte && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-dim">
          {avisoCorte}
        </p>
      )}

      {/* O INDICADOR DE PROGRESSO DA CARGA INCREMENTAL (item 4). Mostra só a CONTAGEM (§A.6: nunca
          nome nem CPF): "Carregados X de N candidatos" enquanto a carga de fundo roda, e "Todos os N
          candidatos foram carregados" ao cobrir a base. §A.11 sem travessão, §A.24 frase de apoio. */}
      {!carregando && !buscandoTexto && totalBase > 0 && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-dim"
          role="status"
          aria-live="polite"
        >
          {fraseDeProgressoDeCarga(carregadosNaBase, totalBase)}
        </p>
      )}

      {/* O FUNIL NÃO VEIO. O aviso é obrigatório, e não decorativo: sem ele a tabela mostraria cinco
          colunas em branco e quem olha completaria a frase sozinho, concluindo que essas pessoas não
          estão em vaga nenhuma. É o aviso que separa "não tem" de "não sei".
          §A.11 sem travessão, §A.24 isto é frase de apoio, então só a primeira maiúscula. */}
      {funilIndisponivel && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-dim"
          role="status"
        >
          Não foi possível carregar o funil desta página: vaga, cliente, cargo, etapa e situação
          aparecem como não carregados nas linhas abaixo. As pessoas continuam listadas, e nenhuma
          delas está sendo apresentada como se não tivesse vaga. Recarregue a tela para tentar de
          novo.
        </p>
      )}

      {/* ESCOPO DA VISÃO (item 5): frente de trabalho (em andamento) × histórico (concluídos). O
          escopo recorta ANTES da conta dos cards, então trocar de aba muda cards e tabela juntos. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {(["andamento", "historico"] as const).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEscopo(e);
              setCardAtivo(CARD_TOTAL);
            }}
            className={cn(
              "rounded-full border px-3 py-1 transition",
              escopo === e
                ? "border-accent bg-[var(--surface-2)] text-accent"
                : "border-[var(--border)] text-dim hover:text-text",
            )}
          >
            {e === "andamento" ? "Em Andamento" : "Histórico"}
          </button>
        ))}
        <span className="text-[11.5px] text-faint">
          {escopo === "andamento"
            ? "A frente de trabalho: só quem está em andamento. Concluídos ficam no Histórico."
            : "Histórico: quem já recebeu desfecho (aprovado, alocado, enviado para admissão, descartado ou desistiu)."}
        </span>
      </div>

      {/* ── OS CARDS, EM DUAS FILEIRAS, E NENHUM ESTADO SEM NÚMERO À VISTA ───────────────────
          Fileira 1: o Total e as ETAPAS DO FUNIL, na ordem do funil, LIDAS DO CATÁLOGO DO DIRETOR.
          Lida da esquerda para a direita, ela mostra o afunilamento, que é o que as fusões antigas
          escondiam.
          Fileira 2: os DESFECHOS, um por situação do vocabulário do sistema (aprovado não é
          alocado, alocado não é contratado, descartado não é desistiu), mais o "Sem Vaga", que é a
          pessoa na base ainda não alocada.
          §A.12: todo card é clicável como FILTRO, em toggle (clicar no ativo volta ao Total).

          A GRADE É `auto-fit`, E NÃO UM NÚMERO DE COLUNAS ESCRITO AQUI: a fileira deixou de ter
          cinco cards fixos, então ela tem de caber seis etapas hoje e nove amanhã sem ninguém voltar
          neste bloco. O `minmax` impede o card estreito demais para o rótulo; passou do que cabe, a
          própria grade quebra a linha, com os cards ainda do mesmo tamanho. */}
      {/* A MARCA D'ÁGUA DE FUNIL SAIU (ajuste 4 do diretor): o desenho literal do funil atrás dos
          cards não ficou bom, e o sombreamento que o sistema já usa é a `.aurora` do `globals.css`,
          desenhada pelo `AppShell` atrás de TODAS as telas, com os três blobs e as variantes de tema
          claro e escuro já resolvidas. Não havia o que acrescentar aqui: bastou tirar a camada extra
          para a assinatura do sistema aparecer, que é o mesmo fundo das outras telas.
          O invólucro fica como agrupador das duas fileiras, sem `relative isolate`, que existiam só
          para prender o `-z-10` da marca que saiu. */}
      {/* CARD = FILTRO EM TODO CARD VISÍVEL (GAP 1): a fileira que não pertence ao escopo ativo é
          ESCONDIDA, não mostrada com número que filtra vazio. Os KPIs do servidor (`porEtapa` conta
          ATIVO, `porSituacao` conta desfecho) ignoram o escopo, que é recorte só da lista (linhas
          651-652); então, no escopo "Em Andamento", um card de DESFECHO mostrava total mas a lista,
          já recortada para só ATIVO, vinha vazia (e, simétrico, uma ETAPA no "Histórico"). A régua é
          a mesma do recorte da lista: em andamento valem Total, as ETAPAS e o "Sem Vaga" (linha sem
          candidatura é `emAndamento`, linha 650); no histórico valem Total e os DESFECHOS. Trocar de
          escopo já volta o card ativo ao Total (linha 1119), então nunca sobra filtro de card oculto. */}
      <div>
        <div
          className="mb-[12px] grid gap-[12px]"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
        >
          <Kpi id={CARD_TOTAL} rotulo="Total" valor={funil.total} icone="layers" />
          {escopo === "andamento" &&
            funil.etapas.map((c) => <Kpi key={c.chave} card={c} />)}
        </div>

        <div
          className="mb-[18px] grid gap-[12px]"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}
        >
          {escopo === "historico" &&
            funil.desfechos.map((c) => <Kpi key={c.chave} card={c} />)}
          {escopo === "andamento" && (
            <Kpi id={CARD_SEM_VAGA} rotulo="Sem Vaga" valor={funil.semVaga} icone="folder" />
          )}
        </div>
      </div>

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* §A.12/§A.20: cabeçalhos centralizados, divisória sutil entre colunas (vem do `ds-table`),
              larguras proporcionais que aproveitam a linha inteira sem esmagar nome nem pill. As
              colunas de pill (Etapa e Situação) recebem largura do rótulo mais longo do sistema
              ("Entrevista Soulan" e "Em Seleção"), então nenhuma delas quebra em duas linhas. */}
          {/* §A.20: a coluna Retenção SAIU (decisão do diretor) e as larguras foram REDISTRIBUÍDAS,
              não espremidas: os 11% dela voltaram para as oito colunas restantes, que somam 100% sem
              sobra e sem estouro. A largura mínima da tabela voltou para 1180, então nada encolhe:
              falta espaço, a tabela rola na horizontal, que é a régua da §A.12. */}
          <table className="ds-table min-w-[1180px]">
            <thead>
              <tr>
                {/* §A.29: todo cabeçalho que ordena vira `ColunaOrdenavel`. O `<th>` continua sendo
                    o mesmo elemento de antes, com a mesma largura e a mesma divisória, então o
                    layout do §A.12 não muda; o que entra é o botão com a seta dentro dele. Só Ações
                    fica de fora, porque não há o que comparar entre dois grupos de botões. */}
                <ColunaOrdenavel as="th" ord={ord} chave="candidato" className="w-[19%] text-center">
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="vaga" className="w-[15%] text-center">
                  Vaga
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[12%] text-center">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[12%] text-center">
                  Cargo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="etapa" className="w-[12%] text-center">
                  Etapa
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao" className="w-[11%] text-center">
                  Situação
                </ColunaOrdenavel>
                {/* §A.20: a coluna ganhou um ponto de largura porque o rótulo mais longo da tabela
                    passou a dividir a célula com a seta. Sem isso, "Último Contato" truncaria. */}
                <ColunaOrdenavel
                  as="th"
                  ord={ord}
                  chave="ultimoContato"
                  className="w-[12%] whitespace-nowrap text-center"
                >
                  Último Contato
                </ColunaOrdenavel>
                <th className="w-[7%] text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Nenhum candidato nesta fila. Use o botão Novo candidato ou limpe os filtros.
                  </td>
                </tr>
              ) : (
                visiveis.map((l) => (
                  <tr key={l.chave}>
                    {/* ─ A LINHA FICA COM O NOME, E SÓ (ajuste do diretor, 27/08) ──────────────
                        Cidade e "Cadastro Manual, sem CPF" moravam aqui embaixo do nome, em duas
                        linhas de apoio, e faziam cada linha da tabela ter três alturas para dizer
                        uma coisa que ninguém compara entre candidatos. O detalhe migrou inteiro
                        para a ficha (o olho), na seção A Pessoa, que é onde se olha UMA pessoa a
                        fundo. A listagem é para varrer a fila; a ficha é para estudar o caso. */}
                    <td>
                      <div className="font-semibold text-text">{l.pessoa.nome}</div>
                    </td>
                    {/* ─ "VAGA NÃO ALOCADA" NO LUGAR DE "não informado" (ajuste 2 do diretor) ────
                        As três células ficavam vazias pelo MESMO motivo, e diziam a coisa errada:
                        "Cliente não informado" manda o consultor procurar onde preencher o cliente,
                        quando não há campo nenhum a preencher. O que falta é ALOCAR a pessoa numa
                        vaga, e é a alocação que traz cliente e cargo de uma vez.
                        A DISTINÇÃO É ENTRE DUAS AUSÊNCIAS: sem candidatura, a resposta é "Vaga Não
                        Alocada"; COM candidatura e sem o dado, aí sim é "não informado" (§A.11), que
                        é campo em branco de verdade e continua sendo dito assim.
                        §A.24: é etiqueta de estado, então title case. */}
                    <td className="text-center">
                      {l.candidatura ? (
                        (l.candidatura.vagaNome ?? l.candidatura.vagaCodigo ?? "não informado")
                      ) : (
                        <CelulaSemCandidatura linha={l} />
                      )}
                    </td>
                    <td className="text-center">
                      {l.candidatura ? (
                        (l.candidatura.clienteNome ?? "não informado")
                      ) : (
                        <CelulaSemCandidatura linha={l} />
                      )}
                    </td>
                    <td className="text-center">
                      {l.candidatura ? (
                        (l.candidatura.cargoNome ?? "não informado")
                      ) : (
                        <CelulaSemCandidatura linha={l} />
                      )}
                    </td>
                    {/* ─ A ETAPA SÓ VALE ENQUANTO A CANDIDATURA ESTÁ VIVA (peça P1 do bug 1) ─────
                        A coluna `etapa` do banco NÃO é limpa quando alguém sai do processo: ela
                        congela no último lugar em que a pessoa esteve. Mostrá-la depois do desfecho
                        desenhava o descartado DENTRO do funil, e era exatamente o "preso na
                        Captação" que o diretor viu na tela.
                        ENCERRADA MOSTRA "Fora Do Funil", e não a etapa nem um vazio: vazio leria
                        como dado faltando, e a etapa lia como se a pessoa ainda estivesse lá. Por
                        onde ela passou não se perde, mudou de lugar: está na linha do tempo da
                        ficha, alimentada por `as_candidatura_etapas`. */}
                    <td className="text-center">
                      {l.candidatura ? (
                        <span className="inline-flex justify-center">
                          {candidaturaViva(l.candidatura.situacao) ? (
                            <StatusPill
                              tone={tomDaEtapa(l.candidatura.etapa, catalogoEtapas)}
                              label={rotuloDaEtapa(l.candidatura.etapa, catalogoEtapas)}
                            />
                          ) : (
                            <StatusPill tone="nt" label="Fora Do Funil" />
                          )}
                        </span>
                      ) : (
                        <CelulaSemCandidatura linha={l} />
                      )}
                    </td>
                    <td className="text-center">
                      {l.candidatura ? (
                        <span className="inline-flex justify-center">
                          <StatusPill
                            tone={tomDaSituacao(l.candidatura.situacao)}
                            label={CANDIDATURA_SITUACAO_LABEL[l.candidatura.situacao]}
                          />
                        </span>
                      ) : (
                        <CelulaSemCandidatura linha={l} />
                      )}
                    </td>
                    {/* ÚLTIMO CONTATO, e não "última movimentação": é a pergunta que a operação
                        faz ("quando falamos com essa pessoa?"). O carimbo é `ultimoContatoEm`, que
                        só anda quando um contato é registrado; `atualizadoEm` anda com etapa e com
                        saída, e por isso NÃO responde a essa pergunta. Sem contato registrado a
                        célula diz "não informado" (§A.11), que é diferente de uma data qualquer. */}
                    <td className="whitespace-nowrap text-center text-[12.5px]">
                      {l.candidatura?.ultimoContatoEm ? (
                        dataHoraBr(l.candidatura.ultimoContatoEm)
                      ) : (
                        <span className="text-faint">não informado</span>
                      )}
                    </td>
                    {/* AÇÕES SÓ EM ÍCONE, com o rótulo por extenso em `title` e `aria-label`: o ícone
                        é o atalho de quem conhece a tela, e o rótulo continua alcançável por quem
                        passa o mouse e por leitor de tela. */}
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        <AcaoIcone
                          icone="eye"
                          titulo="Ver a ficha"
                          descricao={`Ver a ficha de ${l.pessoa.nome}`}
                          onClick={() => setFichaId(l.pessoa.id)}
                        />
                        {l.candidatura && (
                          <>
                            {/* MOVER SÓ ENQUANTO A CANDIDATURA ESTÁ VIVA (peça P1 do bug 1).
                                O backend SEMPRE recusou mover quem já saiu ("Esta candidatura já
                                foi encerrada"), então a ação era um botão que só podia falhar. Com
                                o descartado fora do funil, oferecê-la contradiz a própria regra:
                                quem saiu não anda mais em etapa, volta pela ação ao lado.
                                REGISTRAR CONTATO CONTINUA em qualquer situação, de propósito:
                                ligar para quem foi descartado é conversa legítima e o histórico
                                dela tem valor. */}
                            {candidaturaViva(l.candidatura.situacao) && (
                              <AcaoIcone
                                icone="arr"
                                titulo="Mover de etapa"
                                descricao={`Mover ${l.pessoa.nome} de etapa`}
                                desabilitado={abrindo === l.chave}
                                onClick={() => void abrirAcao(l, setMoverAlvo)}
                              />
                            )}
                            {/* TELEFONE, e não mais o LÁPIS (correção do diretor, 27/08): o lápis
                                significa EDITAR no resto do sistema, e quem o via nesta linha
                                entendia "editar candidato" em vez de "anotar que falei com a
                                pessoa". O ícone novo é acréscimo ao catálogo; nenhum outro uso do
                                lápis foi tocado. */}
                            <AcaoIcone
                              icone="phone"
                              titulo="Registrar contato"
                              descricao={`Registrar contato com ${l.pessoa.nome}`}
                              desabilitado={abrindo === l.chave}
                              onClick={() => void abrirAcao(l, setContatoAlvo)}
                            />
                            {/* ─ TRAZER DE VOLTA, e ele aparece SÓ na linha encerrada (bug 2) ────
                                É a porta que faltava. A reentrada existia inteira no backend e só
                                era alcançável pelo botão "Adicionar à vaga", cuja lista exclui quem
                                tem candidatura viva: quem foi descartado numa vaga e segue vivo em
                                outra não aparecia em lugar nenhum. Agora a ação está onde o gesto
                                nasce, na linha da pessoa que saiu.
                                MESMA ROTA E MESMO MODAL DE CIÊNCIA de sempre: aqui não há caminho
                                novo, só um atalho para o que já existia. */}
                            {/* ─ TROCAR VAGA: corrigir a alocação errada (item 5) ───────────────
                                SÓ NA CANDIDATURA VIVA e SÓ PARA MASTER E SUPER ADMIN. Esconder aqui
                                é conveniência: quem manda é o `@Roles` da rota, que devolve 403 a
                                consultor comum mesmo se ele chamar direto.
                                CONVIVE COM O "TRAZER DE VOLTA", e os dois nunca aparecem juntos na
                                mesma linha: este só existe na viva, aquele só na encerrada. Um
                                CORRIGE mantendo a linha e a etapa, o outro RECOMEÇA criando outra. */}
                            {isAdmin && candidaturaViva(l.candidatura.situacao) && (
                              <AcaoIcone
                                icone="refresh"
                                titulo="Trocar vaga"
                                descricao={`Trocar a vaga de ${l.pessoa.nome}`}
                                desabilitado={abrindo === l.chave}
                                onClick={() => void abrirAcao(l, setTrocaAlvo)}
                              />
                            )}
                            {!candidaturaViva(l.candidatura.situacao) && (
                              <AcaoIcone
                                icone="undo"
                                titulo="Trazer de volta"
                                descricao={`Trazer ${l.pessoa.nome} de volta para uma vaga`}
                                onClick={() =>
                                  setVoltaAlvo({
                                    pessoa: { id: l.pessoa.id, nome: l.pessoa.nome },
                                    vagaId: l.candidatura?.vagaId ?? null,
                                  })
                                }
                              />
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {novoAberto && (
        <NovoCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setNovoAberto(false)}
          onSalvo={(id) => {
            setNovoAberto(false);
            setFichaId(id);
            void carregar();
          }}
        />
      )}

      {importarAberto && (
        <ImportarCandidatosModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setImportarAberto(false)}
          onImportado={() => void carregar()}
        />
      )}

      {alocarAberto && (
        <AlocarCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setAlocarAberto(false)}
          onAlocado={() => {
            setAlocarAberto(false);
            void carregar();
          }}
        />
      )}

      {trocaAlvo && (
        <TrocarVagaModal
          candidatura={trocaAlvo}
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setTrocaAlvo(null)}
          onTrocado={() => {
            setTrocaAlvo(null);
            void carregar();
          }}
        />
      )}

      {/* TRAZER DE VOLTA (bug 2): o MESMO modal, no modo com a pessoa fixa e a vaga anterior
          sugerida. Um componente só, uma rota só, um modal de ciência só. */}
      {voltaAlvo && (
        <AlocarCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          pessoaFixa={voltaAlvo.pessoa}
          vagaSugerida={voltaAlvo.vagaId}
          onClose={() => setVoltaAlvo(null)}
          onAlocado={() => {
            setVoltaAlvo(null);
            void carregar();
          }}
        />
      )}

      {fichaId && (
        <FichaCandidatoModal
          candidatoId={fichaId}
          token={token}
          vagaPorId={vagaPorId}
          onClose={() => setFichaId(null)}
          onMudou={() => void carregar()}
        />
      )}

      {moverAlvo && (
        <MoverCandidaturaModal
          candidatura={moverAlvo}
          token={token}
          onClose={() => setMoverAlvo(null)}
          onFeito={() => {
            setMoverAlvo(null);
            void carregar();
          }}
        />
      )}

      {contatoAlvo && (
        <RegistrarContatoModal
          candidatura={contatoAlvo}
          token={token}
          onClose={() => setContatoAlvo(null)}
          onRegistrado={() => {
            setContatoAlvo(null);
            void carregar();
          }}
        />
      )}
    </>
  );

  /**
   * ─ O CARD DE INDICADOR, QUE É O PRÓPRIO FILTRO (§A.12) ───────────────────────────────────────
   *
   * ELE RECEBE DE DUAS FORMAS, e as duas são o mesmo card na tela: um `CardDeFunil` já resolvido
   * pela peça compartilhada (as etapas do catálogo e os desfechos), ou os campos soltos dos DOIS
   * cards que não saem de candidatura nenhuma (o Total e o "Sem Vaga"). Sem essa segunda forma, os
   * dois precisariam de um `CardDeFunil` de mentira, com cor e ícone inventados só para caber.
   *
   * A COR VEM PRONTA no `card.cor`: nas etapas é a que o DIRETOR escolheu no gerenciador, nos
   * desfechos é a régua do §A.12 (verde é êxito, vermelho é saída sem êxito). Nenhuma cor de etapa
   * é decidida nesta tela, que era exatamente o defeito da fileira escrita à mão.
   *
   * A ETAPA FORA DE CIRCULAÇÃO NÃO PODE PARECER UMA ETAPA NORMAL: ela só aparece porque ainda tem
   * gente presa dentro, então ganha a borda tracejada e a tag "Inativa". Sem a marca, o card diria
   * que aquela fila está viva e recebendo gente, e ela não está.
   *
   * Clicar no card ativo volta para o Total, que é o toggle de sempre.
   */
  function Kpi(
    props:
      | { card: CardDeFunil }
      | { id: string; rotulo: string; valor: number; icone: IconName; tom?: string },
  ) {
    const card: CardDeFunil =
      "card" in props
        ? props.card
        : {
            chave: props.id,
            rotulo: props.rotulo,
            valor: props.valor,
            cor: props.tom ?? "",
            icone: props.icone,
          };
    const cor = card.cor || undefined;
    const ativo = cardAtivo === card.chave;
    return (
      <GlassCard
        as="button"
        className={cn(
          "fk !px-4 !py-3.5 text-left transition hover:bg-[var(--surface-2)]",
          ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
          card.inativa && "border-dashed opacity-80",
        )}
        onClick={() => setCardAtivo(ativo ? CARD_TOTAL : card.chave)}
        aria-pressed={ativo}
        title={card.inativa ? `${card.rotulo} está fora de circulação` : undefined}
      >
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <Icon
            name={card.icone}
            className="h-4 w-4 opacity-70"
            style={cor ? { color: cor } : undefined}
          />
          {card.inativa && (
            <span className="rounded-md border border-[var(--border)] px-1.5 py-px text-[10px] font-semibold text-faint">
              Inativa
            </span>
          )}
          {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
        </div>
        <div className="num" style={cor ? { color: cor } : undefined}>
          {carregando ? "…" : card.valor}
        </div>
        <div className="lbl">{card.rotulo}</div>
      </GlassCard>
    );
  }
}

/**
 * ─ O QUE A CÉLULA DIZ QUANDO NÃO HÁ CANDIDATURA, E SÃO DUAS RESPOSTAS DIFERENTES ───────────────
 *
 * "Vaga Não Alocada" é uma AFIRMAÇÃO: esta pessoa está na base e não está em vaga nenhuma. Dizê-la
 * quando o funil simplesmente não veio foi o segundo sintoma do 429, e o mais caro: a tela jurava
 * que ninguém tinha vaga, a ficha da mesma pessoa mostrava a etapa certa, e quem olhou concluiu que
 * o dado havia sumido. Ausência de resposta não é resposta, então a célula diz que não carregou.
 *
 * §A.24: as duas são etiqueta de estado, então title case.
 */
function CelulaSemCandidatura({ linha }: { linha: Linha }) {
  if (linha.funilIndisponivel) {
    return (
      <span className="text-faint" title="O funil desta pessoa não veio na resposta da busca.">
        Funil Não Carregado
      </span>
    );
  }
  return <span className="text-faint">Vaga Não Alocada</span>;
}

function AcaoIcone({
  icone,
  titulo,
  descricao,
  onClick,
  desabilitado,
}: {
  icone: IconName;
  titulo: string;
  descricao: string;
  onClick: () => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={descricao}
      onClick={onClick}
      disabled={desabilitado}
      className="rounded-lg border border-transparent p-2 text-dim transition hover:border-[var(--border)] hover:text-accent disabled:opacity-50"
    >
      <Icon name={icone} className="h-4 w-4" />
    </button>
  );
}
