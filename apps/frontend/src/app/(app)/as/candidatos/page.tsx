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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CANDIDATO_ORIGEM_LABEL,
  CANDIDATURA_SITUACAO_LABEL,
  candidaturaViva,
  type AsCandidatoListItem,
  type AsCandidatoOrdenarPor,
  type AsCandidatoOrigem,
  type AsCandidatosKpis,
  type AsCandidatosOpcoes,
  type AsCandidaturaItem,
  type AsCandidaturaNaLista,
  type VagaListItem,
} from "@ea/shared-types";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { ehDoPapelDaVaga, useStatusVaga } from "@/lib/as-status-vaga";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { Combobox } from "@/components/ui/Combobox";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import type { Ordenacao } from "@/lib/ordenacao";
import {
  usePaginacaoServidor,
  type BuscadorDePagina,
} from "@/lib/usePaginacaoServidor";
import { cn } from "@/lib/cn";
import {
  buscarCandidatos,
  cardDaCandidatura,
  CARD_SEM_VAGA,
  CARD_TOTAL,
  dataHoraBr,
  filtroDeCard,
  funilNaoVeio,
  mensagemDoErro,
  opcoesDeCandidatos,
  painelDaVaga,
} from "@/lib/as-candidatos";
import { cardsDeDesfecho, cardsDeEtapa, type CardDeFunil } from "@/lib/as-vagas-funil";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { NovoCandidatoModal } from "@/components/as/candidatos/NovoCandidatoModal";
import { ImportarCandidatosModal } from "@/components/as/candidatos/ImportarCandidatosModal";
import { AlocarCandidatoModal } from "@/components/as/candidatos/AlocarCandidatoModal";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import { TrocarVagaModal } from "@/components/as/candidatos/TrocarVagaModal";
import { MoverCandidaturaModal } from "@/components/as/candidatos/MoverCandidaturaModal";
import { RegistrarContatoModal } from "@/components/as/candidatos/RegistrarContatoModal";

/**
 * ─ A PAGINACAO NO SERVIDOR SUBSTITUIU A CARGA DE FUNDO (07/10/2026) ──────────────────────────────
 *
 * A tela carregava a pagina 1 e pre-buscava TODAS as paginas seguintes em segundo plano, acumulando
 * ate ~83 mil candidatos no navegador para ordenar e filtrar no cliente. A base nunca mais cabe no
 * navegador: a carga de fundo inteira SAIU (constantes, `vistosRef`, `cargaTimer`, `baseCarga`, os
 * dois `useEffect` e o indicador de progresso), e o navegador segura SO a pagina atual, via
 * `usePaginacaoServidor`. Filtro e ordenacao viajam ao servidor; os KPIs vem uma vez por filtro.
 */

/** O tamanho da pagina servida ao navegador. */
const LINHAS_POR_PAGINA = 100;

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

/**
 * O FILTRO QUE VIAJA AO SERVIDOR. Reúne os eixos que antes eram client-side (escopo, cliente, etapa)
 * com os que já iam no corpo (nome, cpf, origem, vaga) e a régua do card (filtroCardEtapa/Situacao,
 * mais `semCandidatura` para o card Sem Vaga). O `fCandidatos` (multi-seleção por id) NÃO entra aqui:
 * ele continua recortando a lista no cliente, sobre a página carregada.
 */
interface FiltroCentral {
  nome?: string;
  cpf?: string;
  origem?: AsCandidatoOrigem;
  vagaId?: string;
  escopo: "andamento" | "historico";
  cliente?: string;
  etapa?: string;
  filtroCardEtapa?: string;
  filtroCardSituacao?: string;
  /** O card "Sem Vaga" vira este filtro de servidor (ausência de candidatura viva). */
  semCandidatura?: boolean;
}

/**
 * O FETCHER DO HOOK: traduz os parâmetros de paginação para a chamada `buscarCandidatos` e a resposta
 * `AsCandidatosPagina` para o contrato genérico do hook (`itens`/`total`/`truncado`/`kpis`). Fica em
 * escopo de módulo para ter identidade estável (o hook mantém o fetcher num ref, então nem precisaria,
 * mas assim fica explícito que ele não fecha sobre nada do componente). §A.6: tudo no corpo do POST.
 */
const buscarPaginaDeCandidatos: BuscadorDePagina<
  AsCandidatoListItem,
  FiltroCentral,
  AsCandidatosKpis
> = async (params, token) => {
  const f = params.filtro;
  const resp = await buscarCandidatos(
    {
      nome: f.nome,
      cpf: f.cpf,
      origem: f.origem,
      vagaId: f.vagaId,
      escopo: f.escopo,
      cliente: f.cliente,
      etapa: f.etapa,
      filtroCardEtapa: f.filtroCardEtapa,
      filtroCardSituacao: f.filtroCardSituacao,
      semCandidatura: f.semCandidatura,
      ordenarPor: params.ordenarPor as AsCandidatoOrdenarPor | undefined,
      direcao: params.direcao,
      offset: params.offset,
      limite: params.limite,
    },
    token,
  );
  return { itens: resp.itens, total: resp.total, truncado: resp.truncado, kpis: resp.kpis };
};

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
  // ERRO DE AÇÃO (abrir candidatura, etc.), separado do erro da paginação: o do carregamento vem do
  // hook (`paginacao.erro`); este é dos gestos da tela, e os dois aparecem no mesmo lugar.
  const [erro, setErro] = useState<string | null>(null);
  /** AS OPÇÕES DOS FILTROS, da base de candidatos (§A.37), não de `/as/vagas`. */
  const [opcoes, setOpcoes] = useState<AsCandidatosOpcoes | null>(null);
  /**
   * ─ O TOTAL DA BASE, QUE NÃO PODE MUDAR AO CLICAR NUM CARD (§A.12) ──────────────────────────────
   *
   * Os cards de etapa e de desfecho vêm de `paginacao.kpis`, que o backend conta SEM o filtro de card,
   * então não zeram quando um card fica ativo. O `total` do hook, porém, É a contagem da lista COM o
   * filtro de card, logo encolhe ao clicar num card. O card Total precisa continuar mostrando a BASE
   * inteira: este estado guarda o `total` capturado SÓ enquanto nenhum card de etapa/situação/sem-vaga
   * filtra o servidor (ver o efeito de captura logo abaixo). Começa na página Total, então nasce certo.
   */
  const [totalBaseSnapshot, setTotalBaseSnapshot] = useState(0);
  /**
   * ─ O "SEM VAGA", QUE A PÁGINA SOZINHA NÃO SABE CONTAR ─────────────────────────────────────────
   *
   * "Sem Vaga" é a pessoa na base ainda não alocada (ausência de candidatura). Antes a carga de fundo
   * trazia todo mundo e a tela contava localmente; sem ela, a página só tem 100 linhas e não dá para
   * contar a base inteira no cliente. O backend não devolve esse número nos KPIs, então um `useEffect`
   * dedicado pergunta o `total` de uma busca `semCandidatura: true` (limite 1, só o contador), uma vez
   * por filtro. É UMA requisição leve por filtro, não a varredura da base inteira que saiu.
   */
  const [semVagaCount, setSemVagaCount] = useState(0);
  // Bump manual para o Total/Sem Vaga e a lista reavaliarem após uma mutação (mover, alocar, etc.).
  const [revalidacao, setRevalidacao] = useState(0);

  // ── FILTROS. `nome`, `cpf`, `origem`, `vagaId`, `escopo`, `cliente` e `etapa` viajam ao SERVIDOR
  // (no CORPO do POST). O `fCandidatos` (multi-seleção por id) segue recortando a lista no cliente.
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

  /**
   * ─ A PAGINAÇÃO NO SERVIDOR (o coração desta frente) ──────────────────────────────────────────
   *
   * O hook segura SÓ a página atual, nunca a base inteira. Ele é a fonte de `itens` (as pessoas da
   * página), `total`, `kpis` (cacheado, só troca quando o filtro muda), página/navegação e ordenação.
   * O `token` o hook lê sozinho da sessão e repassa ao fetcher.
   */
  const paginacao = usePaginacaoServidor<AsCandidatoListItem, FiltroCentral, AsCandidatosKpis>({
    buscarPagina: buscarPaginaDeCandidatos,
    filtroInicial: { escopo: "andamento" },
    limitePadrao: LINHAS_POR_PAGINA,
  });
  const { setFiltro: aplicarFiltro, setOrdenacao } = paginacao;
  // Nomes antigos preservados para o resto da tela ler sem reescrever cada ponto de uso.
  const pessoas = paginacao.itens;
  const carregando = paginacao.carregando;
  const totalBase = paginacao.total;
  const kpisBase = paginacao.kpis;

  /**
   * ─ CARD → FILTRO DE SERVIDOR, a régua `filtroDeCard` mais o caso do "Sem Vaga" ────────────────
   *
   * As etapas e os desfechos passam por `filtroDeCard` (igual à versão client-side). O "Sem Vaga" é
   * o reservado que `filtroDeCard` devolve vazio: aqui ele vira `semCandidatura: true`, que DENTRO do
   * escopo "andamento" (o único em que o card aparece) casa exatamente quem não tem candidatura viva,
   * ou seja, a pessoa na base ainda não alocada. O Total não manda nada: é a base inteira.
   */
  const filtroDoCardAtivo = useMemo((): Pick<
    FiltroCentral,
    "filtroCardEtapa" | "filtroCardSituacao" | "semCandidatura"
  > => {
    if (cardAtivo === CARD_SEM_VAGA) return { semCandidatura: true };
    return filtroDeCard(cardAtivo, codigosDeEtapa);
  }, [cardAtivo, codigosDeEtapa]);

  /**
   * SINCRONIA UI → SERVIDOR: os filtros da tela viram o `filtro` do hook, com a MESMA espera de 300ms
   * de antes (não dispara uma requisição por tecla). `setFiltro` reseta para a página 1 e refaz o KPI,
   * que é exatamente o comportamento desejado quando qualquer filtro muda. A navegação de páginas não
   * passa por aqui (ela mexe no estado interno do hook), então mudar de página não zera o filtro.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      aplicarFiltro({
        nome: busca.trim() || undefined,
        cpf: cpfBusca.replace(/\D/g, "") || undefined,
        origem: fOrigem || undefined,
        vagaId: fVaga || undefined,
        escopo,
        cliente: fCliente || undefined,
        etapa: fEtapa || undefined,
        filtroCardEtapa: filtroDoCardAtivo.filtroCardEtapa,
        filtroCardSituacao: filtroDoCardAtivo.filtroCardSituacao,
        semCandidatura: filtroDoCardAtivo.semCandidatura,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [busca, cpfBusca, fOrigem, fVaga, escopo, fCliente, fEtapa, filtroDoCardAtivo, aplicarFiltro]);

  /**
   * RECARREGAR APÓS UMA MUTAÇÃO. O hook não expõe um "refetch" explícito; reaplicar o filtro (merge
   * vazio) cria um novo objeto de filtro, o que refaz a busca e volta à página 1 (aceitável depois de
   * mover/alocar). O `revalidacao++` reavalia o Total e o Sem Vaga, e recarrega as vagas dos modais.
   */
  const recarregar = useCallback(() => {
    aplicarFiltro({});
    setRevalidacao((n) => n + 1);
  }, [aplicarFiltro]);

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
   * AS VAGAS, numa leitura PRÓPRIA (não mais junto da busca de candidatos). Elas alimentam a alocação
   * manual (`vagasAbertas`) e a ficha (`vagaPorId`), não COLUNA nem FILTRO da lista (cliente/cargo vêm
   * da própria projeção da candidatura, e os filtros vêm de `/as/candidatos/opcoes`). Falhar aqui não
   * derruba a tela: a lista de candidatos segue pelo hook, só a alocação fica sem opções de vaga.
   */
  const carregarVagas = useCallback(async () => {
    try {
      setVagas(await apiFetch<VagaListItem[]>("/as/vagas", { token }));
    } catch {
      /* a lista de candidatos não depende disto; a alocação apenas fica sem vagas para escolher. */
    }
  }, [token]);
  useEffect(() => {
    void carregarVagas();
  }, [carregarVagas, revalidacao]);

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
   * ─ O TOTAL DA BASE, CONGELADO ENQUANTO UM CARD FILTRA (§A.12) ─────────────────────────────────
   *
   * Sem card de etapa/situação/sem-vaga ativo (só o Total), o `total` do hook JÁ é a base inteira,
   * então ele é capturado aqui. Com um card ativo, o `total` encolhe para o subconjunto do card, e
   * NÃO é capturado: o snapshot segue mostrando a base, e clicar num card não mexe no card Total. Na
   * abertura o card ativo é o Total, então o snapshot nasce correto na primeira resposta.
   */
  const semCardQueFiltra =
    cardAtivo === CARD_TOTAL &&
    !filtroDoCardAtivo.filtroCardEtapa &&
    !filtroDoCardAtivo.filtroCardSituacao &&
    !filtroDoCardAtivo.semCandidatura;
  useEffect(() => {
    if (carregando || !semCardQueFiltra) return;
    setTotalBaseSnapshot(totalBase);
  }, [carregando, semCardQueFiltra, totalBase]);

  /**
   * ─ O CONTADOR DO "SEM VAGA", UMA REQUISIÇÃO LEVE POR FILTRO ───────────────────────────────────
   *
   * O card só aparece em "andamento", e lá `semCandidatura: true` casa exatamente a pessoa na base
   * sem candidatura. O backend não devolve esse número nos KPIs, então aqui ele vem de uma busca
   * `limite: 1` (só o `total`), refeita quando a base do filtro muda ou após uma mutação. É UMA
   * requisição pequena, nunca a varredura de fundo que saiu. Fora de "andamento", o card não existe,
   * então o contador nem é buscado. §A.6: tudo no corpo do POST, e a resposta é só um número.
   */
  useEffect(() => {
    if (escopo !== "andamento") {
      setSemVagaCount(0);
      return;
    }
    let vivo = true;
    buscarCandidatos(
      {
        nome: busca.trim() || undefined,
        cpf: cpfBusca.replace(/\D/g, "") || undefined,
        origem: fOrigem || undefined,
        vagaId: fVaga || undefined,
        escopo: "andamento",
        cliente: fCliente || undefined,
        etapa: fEtapa || undefined,
        semCandidatura: true,
        limite: 1,
      },
      token,
    )
      .then((p) => {
        if (vivo) setSemVagaCount(p.total);
      })
      .catch(() => {
        /* o contador do card não derruba a tela; mantém o valor anterior. */
      });
    return () => {
      vivo = false;
    };
  }, [escopo, busca, cpfBusca, fOrigem, fVaga, fCliente, fEtapa, token, revalidacao]);

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
   * ─ QUANDO O CARD "SEM VAGA" ESTÁ ATIVO, O FUNIL AUSENTE É ESPERADO, NÃO FALHA ─────────────────
   *
   * O card "Sem Vaga" filtra no servidor por `semCandidatura: true`, e nesse modo o backend OMITE o
   * funil de propósito (quem não tem candidatura viva não tem o que mostrar). Dentro do escopo
   * "andamento" (o único em que o card aparece), essas pessoas têm ZERO candidatura, então a linha é
   * uma "Vaga Não Alocada" legítima, NÃO um "Funil Não Carregado". Esta flag separa os dois casos.
   */
  const semVagaCardAtivo = cardAtivo === CARD_SEM_VAGA;

  /**
   * O FUNIL NÃO VEIO NESTA RESPOSTA? A pergunta é feita sobre a página inteira, porque o campo é da
   * projeção: ou a busca o envia para todo mundo, ou não o envia para ninguém.
   *
   * ELA EXISTE PARA A TELA NÃO MENTIR. Sem essa distinção, ausência de funil viraria "Vaga Não
   * Alocada" em todas as linhas, que foi o segundo sintoma do 429 e o motivo de a lista contradizer
   * a ficha da mesma pessoa. No card "Sem Vaga" o funil ausente é esperado (ver acima), então ali
   * NÃO é falha.
   */
  const funilIndisponivel = useMemo(
    () => !semVagaCardAtivo && funilNaoVeio(pessoas),
    [pessoas, semVagaCardAtivo],
  );

  /** As linhas, antes do card e dos filtros locais. Pessoa sem candidatura vira uma linha só. */
  const linhasBase = useMemo<Linha[]>(
    () =>
      pessoas.flatMap<Linha>((p) => {
        /*
         * AUSENTE x VAZIO. `undefined` é "a busca não mandou o funil desta pessoa", e a linha fica
         * em um terceiro estado, que a tabela mostra como tal. Lista VAZIA é "ela não está em vaga
         * nenhuma", que é estado legítimo e continua sendo "Vaga Não Alocada".
         *
         * NO CARD "SEM VAGA", o funil ausente é esperado (`semCandidatura: true` omite o funil no
         * servidor) e a pessoa não tem vaga por definição: a linha é "Vaga Não Alocada", não o
         * terceiro estado de falha.
         */
        if (p.candidaturas === undefined) {
          return [
            {
              chave: p.id,
              pessoa: p,
              candidatura: null,
              funilIndisponivel: !semVagaCardAtivo,
            },
          ];
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
    [pessoas, fVaga, semVagaCardAtivo],
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
  const funil = useMemo(() => {
    /*
     * ─ OS NÚMEROS DOS CARDS VÊM DO SERVIDOR (paginação no servidor): `paginacao.kpis` ────────────
     *
     * A tela carrega só a página (100), então contar as linhas faria o KPI dizer que existem 100
     * candidatos quando há dezenas de milhares. `kpis` (`porEtapa`/`porSituacao`) é a contagem
     * agregada do servidor sobre o conjunto FILTRADO inteiro, antes do corte de página, e o backend
     * NÃO aplica o filtro de card a ele: por isso clicar num card não zera as etapas nem os desfechos.
     *
     * A CONTAGEM LOCAL FICA DE FALLBACK: enquanto o KPI da primeira página não chegou (`kpisBase`
     * nulo), a fileira conta as linhas da página em vez de aparecer zerada. É transitório, só até a
     * primeira resposta.
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
      // TOTAL: o snapshot da base inteira, congelado enquanto um card filtra (§A.12). SEM VAGA: o
      // contador dedicado (`semCandidatura: true`), que a página sozinha não teria como calcular.
      total: totalBaseSnapshot,
      semVaga: semVagaCount,
      etapas: cardsDeEtapa(catalogoEtapas, porEtapa),
      desfechos: cardsDeDesfecho(porDesfecho),
    };
  }, [linhasSemCard, catalogoEtapas, kpisBase, totalBaseSnapshot, semVagaCount]);

  /**
   * ─ AS LINHAS EXIBIDAS, E O RECORTE QUE A PAGINAÇÃO POR PESSOA EXIGE (§A.27) ───────────────────
   *
   * O servidor pagina por PESSOA e filtra cliente/etapa por `exists` de candidatura: uma pessoa que
   * casa o filtro vem com TODAS as candidaturas dela, inclusive as que NÃO casam. `linhasSemCard` já
   * recorta as LINHAS pelos mesmos cliente/etapa/escopo no cliente, então a tabela mostra só as
   * candidaturas pedidas, como antes. Aqui só aplicamos o CARD ativo por cima, igual à versão antiga.
   *
   * O "Sem Vaga" já vem do servidor (`semCandidatura: true` manda só gente sem candidatura viva), mas
   * o recorte por linha é mantido para pintar exatamente a ausência de candidatura e descartar a
   * linha cujo funil não veio.
   */
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
   * ─ §A.29: A ORDENAÇÃO CLICÁVEL, AGORA NO SERVIDOR (paginação no servidor) ─────────────────────
   *
   * Nunca houve como ordenar no navegador as dezenas de milhares de linhas que ele não segura mais, e
   * `useOrdenacao` só é honesto em tabela que carrega o conjunto inteiro (o próprio limite registrado
   * na peça). A ordenação passou ao servidor: o clique no cabeçalho chama `setOrdenacao` do hook, que
   * manda a coluna e a direção na busca. Etapa e situação ordenam pelo CATÁLOGO lá (ordem do funil,
   * `array_position` da situação) e os nulos vão ao fim, as mesmas réguas de antes, só do lado certo.
   *
   * `ColunaOrdenavel` (§A.29) continua sendo o cabeçalho clicável, sem reescrever a tabela: ele só
   * precisa de `ord.ordem` (a coluna/direção ativa) e de `ord.alternar` (o clique). Este adaptador os
   * liga ao hook; `itens` não é usado pelo cabeçalho (a lista exibida é `linhas`), então vai vazio.
   */
  const ord = useMemo<Ordenacao<Linha>>(
    () => ({
      itens: [],
      ordem: paginacao.ordenarPor
        ? { chave: paginacao.ordenarPor, dir: paginacao.direcao ?? "asc" }
        : null,
      alternar: (chave: string) => setOrdenacao(chave),
    }),
    [paginacao.ordenarPor, paginacao.direcao, setOrdenacao],
  );
  // A LISTA EXIBIDA já vem ordenada do servidor; aqui só passa pelos recortes de linha do cliente.
  const visiveis = linhas;

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

  // O ERRO EXIBIDO: o do carregamento (hook) ou o de uma ação; qualquer um aparece no mesmo lugar.
  const erroExibido = paginacao.erro ?? erro;
  // "X de N": a página atual sobre o total REAL de candidatos (pessoas) do filtro. Formato pt-BR.
  const fmtNumero = useMemo(() => new Intl.NumberFormat("pt-BR"), []);

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
            : `${fmtNumero.format(totalBase)} ${totalBase === 1 ? "candidato no filtro" : "candidatos no filtro"}.`}
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

      {erroExibido && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erroExibido}
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

      {/* ─ NAVEGAÇÃO DE PÁGINAS (paginação no servidor) ───────────────────────────────────────────
          "X de N" é a página atual sobre o total REAL de candidatos do filtro, não as linhas da tela
          (uma pessoa em três vagas rende três linhas e um candidato só). Os botões ficam desligados
          nas pontas. §A.11 sem travessão; os rótulos são ações, escrita normal (§A.24). */}
      {!carregando && paginacao.totalPaginas > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-dim">
            Página {fmtNumero.format(paginacao.pagina)} de {fmtNumero.format(paginacao.totalPaginas)}
            <span className="text-faint">
              {" · "}
              {fmtNumero.format(totalBase)} candidatos no filtro
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              className="py-2"
              onClick={() => paginacao.irParaPagina(1)}
              disabled={paginacao.pagina <= 1}
            >
              Primeira
            </Button>
            <Button
              variant="secondary"
              className="py-2"
              onClick={() => paginacao.anterior()}
              disabled={paginacao.pagina <= 1}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              className="py-2"
              onClick={() => paginacao.proxima()}
              disabled={paginacao.pagina >= paginacao.totalPaginas}
            >
              Próxima
            </Button>
            <Button
              variant="secondary"
              className="py-2"
              onClick={() => paginacao.irParaPagina(paginacao.totalPaginas)}
              disabled={paginacao.pagina >= paginacao.totalPaginas}
            >
              Última
            </Button>
          </div>
        </div>
      )}

      {novoAberto && (
        <NovoCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setNovoAberto(false)}
          onSalvo={(id) => {
            setNovoAberto(false);
            setFichaId(id);
            recarregar();
          }}
        />
      )}

      {importarAberto && (
        <ImportarCandidatosModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setImportarAberto(false)}
          onImportado={() => recarregar()}
        />
      )}

      {alocarAberto && (
        <AlocarCandidatoModal
          vagasAbertas={vagasAbertas}
          token={token}
          onClose={() => setAlocarAberto(false)}
          onAlocado={() => {
            setAlocarAberto(false);
            recarregar();
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
            recarregar();
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
            recarregar();
          }}
        />
      )}

      {fichaId && (
        <FichaCandidatoModal
          candidatoId={fichaId}
          token={token}
          vagaPorId={vagaPorId}
          onClose={() => setFichaId(null)}
          onMudou={() => recarregar()}
        />
      )}

      {moverAlvo && (
        <MoverCandidaturaModal
          candidatura={moverAlvo}
          token={token}
          onClose={() => setMoverAlvo(null)}
          /* NÃO FECHA A CADA AÇÃO (§A.41): o fluxo aprovar -> enviar acontece no MESMO modal, que
             re-aponta para a linha fresca sozinho. Aqui só recarrega a lista de fundo; quem fecha é
             o "Fechar" do modal (onClose). */
          onFeito={() => recarregar()}
        />
      )}

      {contatoAlvo && (
        <RegistrarContatoModal
          candidatura={contatoAlvo}
          token={token}
          onClose={() => setContatoAlvo(null)}
          onRegistrado={() => {
            setContatoAlvo(null);
            recarregar();
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
