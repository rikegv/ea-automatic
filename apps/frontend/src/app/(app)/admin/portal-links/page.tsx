"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AbaDoPainelPortal,
  CatalogoDeFiltrosDoPainelPortal,
  ContadoresDoPainelPortal,
  EstadoLinkPainel,
  FiltrosDoPainelPortal,
  PaginaDoPainelPortal,
  PedidoDeAjudaDoPortal,
} from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { caixaAlta } from "@/lib/nome";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Pill } from "@/components/ui/Pill";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { CilindroMeta } from "@/components/ui/CilindroMeta";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";
import { copiarTexto, AVISO_COPIA_FALHOU } from "@/lib/copiar-texto";
import { EnviarLinkModal } from "@/components/portal/EnviarLinkModal";
import { enviarLinkDaAdmissao, fraseDoResultado } from "@/lib/portal-envio-link";
import {
  ABAS,
  ROTA_CANDIDATOS,
  ROTA_CATALOGO_FILTROS,
  ROTA_CONTADORES,
  ROTULO_DA_ORIGEM,
  acaoDoLink,
  camposDoDetalhe,
  coletaCompleta,
  contarFiltros,
  formatarDataAdmissao,
  formatarDataHora,
  identificadorDoLink,
  linkDaLinha,
  motivoSemAcaoDeLink,
  queryDoPainel,
  rankSituacao,
  rotaBloquear,
  rotaDesbloquear,
  rotaEmitir,
  rotuloDaOrigem,
  semRegua,
  situacaoDaLinha,
  tituloDoProgresso,
  type CardId,
  type LinhaComJtiOpcional,
  type Recorte,
} from "@/lib/portal-painel";

/**
 * GERENCIADOR DO PORTAL: o painel INTERNO onde o time acompanha a coleta de documentos.
 *
 * Ele é o par autenticado da tela pública do candidato (`/portal`): aqui o consultor EMITE o link,
 * BLOQUEIA e desbloqueia o acesso, lê o funil (quantos foram encaminhados, quantos acessaram,
 * quantos concluíram, quantos pararam esperando gente) e vê, candidato a candidato, onde cada um
 * está na trilha AGORA.
 *
 * ┌─ O QUE ESTA TELA NÃO MOSTRA, E ISSO É CONDIÇÃO DA AUDITORIA, NÃO ESTILO ────────────────────┐
 * │ Nada de IP, nada de navegador, nada de geografia, nenhuma contagem de tentativa de           │
 * │ identificação que falhou e nenhuma listagem de evento. Esse material é da Sala De Segurança, │
 * │ que é outra tela e de outro papel. O que passa por aqui é o ÚLTIMO ACESSO (data e hora) e um │
 * │ estado BINÁRIO de bloqueio temporário (`SUSPENSO`), sem número de tentativa e sem data de    │
 * │ fim. Também não existe busca por CPF nesta tela (§A.6): a busca é por NOME.                  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SEM AUTO-REFRESH E SEM POLLING, e isso também é condição de auditoria ─────────────────────┐
 * │ O balde de limite do sistema ainda é COMPARTILHADO com a tela pública do candidato. Um       │
 * │ painel que se atualiza sozinho, aberto a manhã inteira em várias mesas, competiria com o     │
 * │ candidato tentando entrar, e quem perde a disputa é justamente quem a tela existe para       │
 * │ atender. Atualização só por ação explícita: o botão "Atualizar", a troca de aba, de filtro e │
 * │ de página. Nenhum `setInterval` mora neste arquivo, de propósito.                            │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS ROTAS DE LEITURA NÃO MORAM SOB `portal/`, e a razão é de infraestrutura ────────────────┐
 * │ A barreira do Fernando allowlista caminhos sob `portal/` para o candidato na internet. Uma   │
 * │ rota de LEITURA EM MASSA ali dentro viraria, no dia em que alguém escrevesse a allowlist por │
 * │ prefixo em vez de por caminho, a lista nominal dos candidatos exposta ao mundo. Por isso o   │
 * │ painel vive sob `esteira/`, e só a ESCRITA de um link por vez (emitir, bloquear,             │
 * │ desbloquear) continua em `portal/links`.                                                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA (o que cada linha é, o que cada botão faz, o que vai na URL) mora em `@/lib/portal-painel`,
 * fora da tela, para poder ser testada sem montar a página inteira.
 */

/**
 * O TETO DA PÁGINA, pedido por inteiro (o padrão da rota é 25).
 *
 * TUDO O QUE RECORTA ESTA TELA É DO SERVIDOR: os filtros da barra, a ABA e, desde esta rodada,
 * também o CARD (`recorte`). Não sobrou nenhum recorte de tela, e é por isso que o total e a
 * paginação passaram a bater com o que a tabela mostra.
 */
const POR_PAGINA = 100;

/**
 * OS PEDIDOS DE AJUDA PARA ENTRAR (o candidato clicou "Não consigo entrar" no `/portal`).
 *
 * A rota é irmã das de leitura do painel: mora sob `esteira/`, território autenticado, e NÃO sob
 * `portal/` (que a barreira do Fernando allowlista para a internet). Mesmo RBAC do Gerenciador do
 * Portal, pelo menu `portal-links`. `apiFetch` prefixa `/api`, então o caminho é sem ele.
 */
const ROTA_PEDIDOS_AJUDA = "/esteira/portal-pedidos-ajuda";

const CONTADORES_ZERO: ContadoresDoPainelPortal = {
  encaminhados: 0,
  acessaram: 0,
  naoAcessaram: 0,
  concluiram: 0,
  intervencaoHumana: 0,
};

const CATALOGO_VAZIO: CatalogoDeFiltrosDoPainelPortal = {
  clientes: [],
  cargos: [],
  documentos: [],
  situacoes: [],
  estadosLink: [],
  origens: [],
};

/** O que a emissão devolve. A URL volta UMA vez e não é persistida em claro (§A.6). */
interface LinkEmitido {
  link: string;
  expiraEm: string;
}

export default function PortalLinksPage() {
  const { token } = useAuth();

  const [aba, setAba] = useState<AbaDoPainelPortal>("EM_ANDAMENTO");
  const [contadores, setContadores] = useState<ContadoresDoPainelPortal>(CONTADORES_ZERO);
  const [catalogo, setCatalogo] = useState<CatalogoDeFiltrosDoPainelPortal>(CATALOGO_VAZIO);
  const [itens, setItens] = useState<LinhaComJtiOpcional[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [recorte, setRecorte] = useState<Recorte>("");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // ── Filtros, TODOS múltiplos (§A.28) ─────────────────────────────────────────────────────────
  const [busca, setBusca] = useState("");
  const [nome, setNome] = useState("");
  const [clientes, setClientes] = useState<string[]>([]);
  const [cargos, setCargos] = useState<string[]>([]);
  const [documentos, setDocumentos] = useState<string[]>([]);
  const [situacoes, setSituacoes] = useState<string[]>([]);
  const [estadosLink, setEstadosLink] = useState<string[]>([]);
  const [origens, setOrigens] = useState<string[]>([]);
  const [ultimoAcessoDe, setUltimoAcessoDe] = useState("");
  const [ultimoAcessoAte, setUltimoAcessoAte] = useState("");
  const [dataAdmissaoDe, setDataAdmissaoDe] = useState("");
  const [dataAdmissaoAte, setDataAdmissaoAte] = useState("");

  // A busca por nome é digitada, então ela espera a pessoa parar de escrever antes de virar
  // consulta. Sem isto, cada tecla é uma ida ao servidor no mesmo balde do candidato.
  useEffect(() => {
    const h = setTimeout(() => {
      setNome(busca.trim());
      setPagina(1);
    }, 350);
    return () => clearTimeout(h);
  }, [busca]);

  const filtros = useMemo<FiltrosDoPainelPortal>(
    () => ({
      aba,
      nome: nome || undefined,
      clientes,
      cargos,
      documentos,
      situacoes,
      estadosLink: estadosLink as EstadoLinkPainel[],
      origens,
      // O CARD VIRA PARÂMETRO DA CONSULTA, e entra aqui junto dos demais: é isso que faz o recorte
      // atravessar a aba (a `queryDoPainel` deixa de mandar a aba quando há recorte) e o total e a
      // paginação passarem a refletir o que o card pediu.
      recorte,
      ultimoAcessoDe: ultimoAcessoDe || undefined,
      ultimoAcessoAte: ultimoAcessoAte || undefined,
      dataAdmissaoDe: dataAdmissaoDe || undefined,
      dataAdmissaoAte: dataAdmissaoAte || undefined,
    }),
    [
      aba,
      nome,
      clientes,
      cargos,
      documentos,
      situacoes,
      estadosLink,
      origens,
      recorte,
      ultimoAcessoDe,
      ultimoAcessoAte,
      dataAdmissaoDe,
      dataAdmissaoAte,
    ],
  );

  const filtrosAtivos = useMemo(() => contarFiltros(filtros), [filtros]);

  function limparFiltros() {
    setBusca("");
    setNome("");
    setClientes([]);
    setCargos([]);
    setDocumentos([]);
    setSituacoes([]);
    setEstadosLink([]);
    setOrigens([]);
    setUltimoAcessoDe("");
    setUltimoAcessoAte("");
    setDataAdmissaoDe("");
    setDataAdmissaoAte("");
    setPagina(1);
  }

  /** Trocar qualquer filtro volta para a primeira página: senão a pessoa cai numa página vazia. */
  const aoFiltrar =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPagina(1);
    };

  // Emissão do link: alvo em curso e o resultado, mostrado UMA vez no modal.
  const [emitindo, setEmitindo] = useState<string | null>(null);
  const [alternando, setAlternando] = useState<string | null>(null);
  const [emitido, setEmitido] = useState<{ nome: string; dados: LinkEmitido } | null>(null);
  const [copia, setCopia] = useState<"" | "copiado" | "falhou">("");
  /** O envio por e-mail em voo, por admissão, e o desfecho do último. */
  const [enviandoEmail, setEnviandoEmail] = useState<string | null>(null);
  const [envioFeito, setEnvioFeito] = useState<{ nome: string; ok: boolean; texto: string } | null>(
    null,
  );
  /** A busca de quem ainda NÃO tem link, que é a porta do primeiro envio. */
  const [buscandoSemLink, setBuscandoSemLink] = useState(false);
  /** A ficha de LEITURA do olho. É a própria linha da tabela: nada é buscado em outro lugar. */
  const [detalhe, setDetalhe] = useState<LinhaComJtiOpcional | null>(null);

  // ── PEDIDOS DE AJUDA PARA ENTRAR: a fila de quem clicou "Não consigo entrar" ──────────────────
  // É a segunda VISTA da tela, um aviso acionável para o RH. Vive ao lado do painel, com seu
  // próprio carregamento, para o badge da aba ter a contagem sem depender de a pessoa entrar nela.
  const [vista, setVista] = useState<"PAINEL" | "PEDIDOS">("PAINEL");
  const [pedidos, setPedidos] = useState<PedidoDeAjudaDoPortal[]>([]);
  const [pedidosCarregando, setPedidosCarregando] = useState(true);
  const [pedidosErro, setPedidosErro] = useState<string | null>(null);

  /**
   * O CATÁLOGO DOS FILTROS VEM DE ENDPOINT, NUNCA DAS LINHAS CARREGADAS (§A.37).
   *
   * Derivar as opções da página encolhe a lista assim que o primeiro valor é escolhido, e aí não há
   * como somar o segundo sem limpar o filtro. Ele é buscado UMA vez, na entrada: catálogo não muda
   * durante a sessão de trabalho e recarregá-lo a cada filtro gastaria o balde à toa.
   */
  useEffect(() => {
    if (!token) return;
    apiFetch<CatalogoDeFiltrosDoPainelPortal>(ROTA_CATALOGO_FILTROS, { token })
      .then((c) => setCatalogo(c ?? CATALOGO_VAZIO))
      // Catálogo indisponível não derruba a tela: a tabela continua, os filtros ficam vazios.
      .catch(() => setCatalogo(CATALOGO_VAZIO));
  }, [token]);

  /**
   * DUAS chamadas, em paralelo. Os CONTADORES contam o UNIVERSO INTEIRO e por isso NÃO levam a aba
   * nem os filtros: eles são o funil, não a aba (item 4 do diretor). A lista, essa, leva tudo.
   */
  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      const q = queryDoPainel({ ...filtros, pagina, tamanho: POR_PAGINA });
      const [c, p] = await Promise.all([
        apiFetch<ContadoresDoPainelPortal>(ROTA_CONTADORES, { token }),
        apiFetch<PaginaDoPainelPortal>(`${ROTA_CANDIDATOS}?${q}`, { token }),
      ]);
      setContadores(c ?? CONTADORES_ZERO);
      setItens((p?.itens ?? []) as LinhaComJtiOpcional[]);
      setTotal(p?.total ?? 0);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar o painel do portal.");
      setItens([]);
      setTotal(0);
      setContadores(CONTADORES_ZERO);
    } finally {
      setCarregando(false);
    }
  }, [token, pagina, filtros]);

  // Carrega na entrada e a cada troca de aba, filtro ou página. Nada de intervalo, nada de polling.
  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * A LISTA DOS PEDIDOS DE AJUDA. Vem ordenada do servidor pelo último pedido, e o `no-store` da
   * rota vale aqui também. Falha não derruba a tela: o painel segue, e o aviso mostra o erro.
   */
  const carregarPedidos = useCallback(async () => {
    if (!token) return;
    setPedidosCarregando(true);
    setPedidosErro(null);
    try {
      const p = await apiFetch<PedidoDeAjudaDoPortal[]>(ROTA_PEDIDOS_AJUDA, { token });
      setPedidos(p ?? []);
    } catch (e) {
      setPedidosErro(
        e instanceof ApiError ? e.message : "Falha ao carregar os pedidos de ajuda para entrar.",
      );
      setPedidos([]);
    } finally {
      setPedidosCarregando(false);
    }
  }, [token]);

  // Carrega na entrada, para o badge da aba já nascer com a contagem. Sem polling, como o resto.
  useEffect(() => {
    void carregarPedidos();
  }, [carregarPedidos]);

  function trocarAba(nova: AbaDoPainelPortal) {
    // Com card aceso a aba não se aplica, e o botão está desabilitado: esta guarda é o cinto de
    // segurança do teclado, para o estado não virar "aba trocada, recorte mandando" em silêncio.
    if (nova === aba || recorte !== "") return;
    setAba(nova);
    setPagina(1);
  }

  function selecionarCard(card: CardId) {
    // Reclicar o card ativo (ou clicar em Encaminhados, que é o conjunto inteiro) limpa o recorte.
    setRecorte((atual) => (card === "encaminhados" || card === atual ? "" : card));
    // O recorte é do SERVIDOR agora: trocá-lo é uma consulta nova, e a página volta para a
    // primeira. Sem isto, quem estivesse na página 3 cairia num vazio que não é vazio.
    setPagina(1);
  }

  const cardAtivo: CardId = recorte === "" ? "encaminhados" : recorte;
  /** Com card aceso, a ABA não se aplica: o recorte varre tudo, finalizados incluídos. */
  const abaSuspensa = recorte !== "";

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  /**
   * ORDENAÇÃO POR CLIQUE (§A.29), pela peça compartilhada, em TODAS as colunas. Ela é CLIENT-SIDE,
   * então vale sobre o conjunto CARREGADO: com o teto de 100 do servidor, o caso real do portal
   * cabe numa página só e a ordem é a global. No dia em que o painel passar de uma página, a
   * ordenação precisa ir para a API, como o Gerenciador já faz. O rodapé de paginação só aparece
   * nesse dia. O RECORTE DO CARD não está mais nesta lista: ele foi para o servidor.
   */
  const colunas = useMemo<ColOrd<LinhaComJtiOpcional>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (l) => l.nome },
      { chave: "cliente", tipo: "texto", valor: (l) => l.cliente },
      { chave: "cargo", tipo: "texto", valor: (l) => l.cargo },
      { chave: "dataAdmissao", tipo: "data", valor: (l) => l.dataAdmissao },
      { chave: "documento", tipo: "texto", valor: (l) => l.documentoAtual },
      // Progresso ordena pelo que FALTA, que é a pergunta de uma fila de cobrança.
      { chave: "progresso", tipo: "numero", valor: (l) => Math.max(0, l.obrigatorios - l.aceitos) },
      { chave: "situacao", tipo: "status", valor: (l) => rankSituacao(l) },
      { chave: "ultimoAcesso", tipo: "data", valor: (l) => l.ultimoAcessoEm },
      { chave: "link", tipo: "status", valor: (l) => linkDaLinha(l.estadoLink).rank },
      // Ordena pelo RÓTULO e não pelo código: é o que a pessoa lê na célula, e é o que faz
      // "não informado" (o link antigo, sem origem) ficar junto no fim da lista.
      { chave: "origem", tipo: "texto", valor: (l) => rotuloDaOrigem(l.origemEnvio) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, itens);
  const visiveis = ord.itens;

  /**
   * ORDENAÇÃO DA LISTA DE PEDIDOS (§A.29), pela mesma peça compartilhada. O padrão do servidor já é
   * o último pedido primeiro; aqui a pessoa reordena por qualquer coluna. É client-side sobre a
   * lista inteira, que é curta por natureza (é uma fila de incidente, não o universo de candidatos).
   */
  const colunasPedidos = useMemo<ColOrd<PedidoDeAjudaDoPortal>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (p) => p.nome },
      { chave: "cargo", tipo: "texto", valor: (p) => p.cargo },
      { chave: "cliente", tipo: "texto", valor: (p) => p.cliente },
      { chave: "ultimoPedidoEm", tipo: "data", valor: (p) => p.ultimoPedidoEm },
      { chave: "vezes", tipo: "numero", valor: (p) => p.vezes },
    ],
    [],
  );
  const ordPedidos = useOrdenacao(colunasPedidos, pedidos);
  const pedidosVisiveis = ordPedidos.itens;

  /**
   * EMITIR O LINK. Revoga os anteriores da mesma admissão e devolve a URL UMA vez.
   *
   * §A.6: a URL é CREDENCIAL de acesso aos documentos do candidato. Ela vive no estado desta tela
   * enquanto o modal estiver aberto e some quando ele fecha. Não vai para log, não vai para
   * armazenamento do navegador e não entra em nenhuma mensagem de erro.
   */
  const emitir = useCallback(
    // O tipo é o MÍNIMO que a emissão usa (id da admissão e nome, para o título do modal). Ele foi
    // afrouxado de `LinhaComJtiOpcional` para este par: a tabela do painel continua passando a linha
    // inteira (que satisfaz o par), e a lista de PEDIDOS reusa a MESMA emissão sem forjar uma linha.
    async (l: { admissaoId: string; nome: string }) => {
      if (!token) return;
      setEmitindo(l.admissaoId);
      setErro(null);
      setCopia("");
      try {
        const r = await apiFetch<LinkEmitido>(rotaEmitir(l.admissaoId), { method: "POST", token });
        setEmitido({ nome: l.nome, dados: r });
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : "Falha ao gerar o link do portal.");
      } finally {
        setEmitindo(null);
      }
    },
    [token],
  );

  /**
   * ENVIAR O LINK POR E-MAIL, que é o caminho manual da OST: o RH manda, o candidato recebe.
   *
   * ELE NÃO DEVOLVE URL, e essa é a diferença dele para a emissão acima. Aqui a credencial vai
   * direto ao candidato pelo canal do servidor, e o que volta para a tela é só o carimbo: para
   * qual destino MASCARADO foi e até quando o link vale (§A.6).
   *
   * RECUSA NÃO É ERRO DE TELA: candidato sem e-mail, e-mail inválido ou canal desligado voltam
   * como resposta legítima, com motivo, e a frase vem do vocabulário testado. Só a chamada que
   * não completa é tratada como falha.
   */
  const enviarPorEmail = useCallback(
    async (l: LinhaComJtiOpcional) => {
      if (!token) return;
      setEnviandoEmail(l.admissaoId);
      setErro(null);
      try {
        const r = await enviarLinkDaAdmissao(l.admissaoId, token);
        setEnvioFeito({
          nome: l.nome,
          ok: r.enviado,
          texto: fraseDoResultado(r, formatarDataHora(r.expiraEm)),
        });
        // O link nasceu (ou o anterior foi trocado): a linha mudou de estado e a lista relê.
        if (r.enviado) await carregar();
      } catch (e) {
        setErro(e instanceof ApiError ? e.message : "Falha ao enviar o link do portal.");
      } finally {
        setEnviandoEmail(null);
      }
    },
    [token, carregar],
  );

  /**
   * BLOQUEAR E DESBLOQUEAR, no MESMO botão, que alterna conforme o estado.
   *
   * Bloquear NÃO é revogar e NÃO é inativar: o link que o candidato tem no WhatsApp continua sendo
   * o mesmo, só para de abrir enquanto durar o bloqueio. É reversível de propósito, e é por isso
   * que não pede confirmação: desfazer é um clique no mesmo lugar.
   *
   * A lista recarrega depois, porque o estado daquela linha acabou de mudar.
   */
  const alternarBloqueio = useCallback(
    async (l: LinhaComJtiOpcional) => {
      if (!token) return;
      const acao = acaoDoLink(l.estadoLink);
      if (!acao) return;
      setAlternando(l.admissaoId);
      setErro(null);
      try {
        const id = identificadorDoLink(l);
        // Sem `jti` não há link vivo a bloquear. Mandar o `admissaoId` no lugar passaria no
        // `ParseUUIDPipe` do backend e agiria em silêncio sobre coisa nenhuma.
        if (!id) {
          setErro("Este candidato não tem link vivo para bloquear. Gere um link primeiro.");
          return;
        }
        await apiFetch(acao === "bloquear" ? rotaBloquear(id) : rotaDesbloquear(id), {
          method: "POST",
          token,
        });
        await carregar();
      } catch (e) {
        setErro(
          e instanceof ApiError
            ? e.message
            : acao === "bloquear"
              ? "Falha ao bloquear o link do portal."
              : "Falha ao desbloquear o link do portal.",
        );
      } finally {
        setAlternando(null);
      }
    },
    [token, carregar],
  );

  /** Fechar o modal recarrega: o estado do link daquela linha acabou de mudar. Ação explícita. */
  const fecharEmitido = useCallback(() => {
    setEmitido(null);
    setCopia("");
    void carregar();
  }, [carregar]);

  /**
   * COPIAR, COM CAMINHO DE RESERVA E ERRO HONESTO.
   *
   * `navigator.clipboard` NÃO EXISTE fora de contexto seguro, e a homologação é
   * `http://10.18.117.235:3120`: ali o botão não fazia nada e a tela não dizia nada. A régua dos
   * dois caminhos mora em `@/lib/copiar-texto`; aqui só se diz o que aconteceu.
   */
  async function copiarLink(url: string) {
    setCopia(await copiarTexto(url));
  }

  const Card = ({
    id,
    label,
    value,
    tone,
    icon,
  }: {
    id: CardId;
    label: string;
    value: number;
    tone?: string;
    icon: IconName;
  }) => {
    const ativo = cardAtivo === id;
    return (
      <GlassCard
        as="button"
        className={cn(
          "fk text-left transition hover:bg-[var(--surface-2)] !px-4 !py-3.5",
          ativo && "!border-[var(--accent)] ring-1 ring-[var(--accent)]",
        )}
        onClick={() => selecionarCard(id)}
        aria-pressed={ativo}
      >
        <div className="mb-0.5 flex items-center justify-between">
          <Icon
            name={icon}
            className="h-4 w-4 opacity-70"
            style={tone ? { color: tone } : undefined}
          />
          {ativo && <Icon name="check" className="h-3 w-3 text-accent" />}
        </div>
        <div className="num" style={tone ? { color: tone } : undefined}>
          {carregando && itens.length === 0 ? "…" : value}
        </div>
        <div className="lbl">{label}</div>
      </GlassCard>
    );
  };

  const abaAtual = ABAS.find((a) => a.id === aba) ?? ABAS[0];

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHead
          eyebrow="Portal do candidato"
          title="Gerenciador Do Portal"
          subtitle="Emissão do link, funil da coleta e onde cada candidato está na trilha agora."
        />
        {/* Os controles do painel (busca, filtros, atualizar) só valem para o painel: na vista de
            pedidos eles não têm o que recortar, então ficam de fora para não confundir. */}
        {vista === "PAINEL" && (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="search"
            className="ds-input w-72 rounded-full"
            placeholder="Buscar por nome do funcionário"
            aria-label="Buscar por nome do funcionário"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />

          {/* FILTROS, TODOS MÚLTIPLOS (§A.28), no componente compartilhado, com busca interna
              quando a lista é longa (§A.35). As opções vêm do endpoint de catálogo (§A.37). */}
          <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
            <FiltroCampo label="Cliente">
              <MultiSelect
                values={clientes}
                onChange={aoFiltrar(setClientes)}
                options={catalogo.clientes.map((o) => ({ value: o.valor, label: o.rotulo }))}
                placeholder="Todos"
                ariaLabel="Cliente"
              />
            </FiltroCampo>
            <FiltroCampo label="Cargo">
              <MultiSelect
                values={cargos}
                onChange={aoFiltrar(setCargos)}
                options={catalogo.cargos.map((o) => ({ value: o.valor, label: o.rotulo }))}
                placeholder="Todos"
                ariaLabel="Cargo"
              />
            </FiltroCampo>
            <FiltroCampo label="Documento Atual">
              <MultiSelect
                values={documentos}
                onChange={aoFiltrar(setDocumentos)}
                options={catalogo.documentos.map((o) => ({ value: o.valor, label: o.rotulo }))}
                placeholder="Todos"
                ariaLabel="Documento atual"
              />
            </FiltroCampo>
            <FiltroCampo label="Situação">
              <MultiSelect
                values={situacoes}
                onChange={aoFiltrar(setSituacoes)}
                options={catalogo.situacoes.map((o) => ({ value: o.valor, label: o.rotulo }))}
                placeholder="Todas"
                ariaLabel="Situação"
              />
            </FiltroCampo>
            <FiltroCampo label="Link">
              <MultiSelect
                values={estadosLink}
                onChange={aoFiltrar(setEstadosLink)}
                options={catalogo.estadosLink.map((o) => ({ value: o.valor, label: o.rotulo }))}
                placeholder="Todos"
                ariaLabel="Estado do link"
              />
            </FiltroCampo>

            {/* ORIGEM (§A.37): a coluna nova nasce com o filtro junto, e ele é MÚLTIPLO como
                todos os outros. As opções vêm do CATÁLOGO do endpoint, nunca das linhas
                carregadas, e incluem o valor especial de "sem origem", que é como se pergunta
                quem ainda está sem ela. O rótulo é o desta tela (§A.24), com o do backend como
                reserva para código que apareça depois. */}
            <FiltroCampo label="Origem Do Envio">
              <MultiSelect
                values={origens}
                onChange={aoFiltrar(setOrigens)}
                options={catalogo.origens.map((o) => ({
                  value: o.valor,
                  label: ROTULO_DA_ORIGEM[o.valor] ?? o.rotulo,
                }))}
                placeholder="Todas"
                ariaLabel="Origem do envio"
              />
            </FiltroCampo>

            {/* AS DUAS DATAS SÃO INTERVALO, e não lista: data em lista de opções seria uma lista
                infinita. `input type="date"` continua permitido pela §A.35 (é controle do
                navegador, não caixa de seleção). */}
            <FiltroCampo label="Último Acesso">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="ds-input"
                  aria-label="Último acesso a partir de"
                  value={ultimoAcessoDe}
                  onChange={(e) => aoFiltrar(setUltimoAcessoDe)(e.target.value)}
                />
                <input
                  type="date"
                  className="ds-input"
                  aria-label="Último acesso até"
                  value={ultimoAcessoAte}
                  onChange={(e) => aoFiltrar(setUltimoAcessoAte)(e.target.value)}
                />
              </div>
            </FiltroCampo>
            <FiltroCampo label="Data De Admissão">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  className="ds-input"
                  aria-label="Data de admissão a partir de"
                  value={dataAdmissaoDe}
                  onChange={(e) => aoFiltrar(setDataAdmissaoDe)(e.target.value)}
                />
                <input
                  type="date"
                  className="ds-input"
                  aria-label="Data de admissão até"
                  value={dataAdmissaoAte}
                  onChange={(e) => aoFiltrar(setDataAdmissaoAte)(e.target.value)}
                />
              </div>
            </FiltroCampo>
          </FiltroTrigger>

          {/* A PORTA DO PRIMEIRO LINK. A lista só mostra quem JÁ tem link, então sem este botão
              não existe tela por onde enviar o link de quem nunca recebeu nenhum. Ele abre uma
              BUSCA POR NOME em modal, e não altera o recorte da lista (§A.26). */}
          <Button
            variant="secondary"
            onClick={() => setBuscandoSemLink(true)}
            className="px-3 py-2"
            title="Buscar um candidato que ainda não tem link e enviar o link por e-mail"
          >
            <Icon name="arr" className="h-4 w-4" />
            Enviar link
          </Button>

          <Button variant="secondary" onClick={() => void carregar()} className="px-3 py-2">
            <Icon name="refresh" className={cn("h-4 w-4", carregando && "animate-spin")} />
            Atualizar
          </Button>
        </div>
        )}
      </div>

      {/* AS DUAS VISTAS DA TELA, no mesmo padrão de aba do painel (§A.24 Title Case). O badge é
          discreto e conta os pedidos abertos, para o RH notar sem precisar entrar na aba. */}
      <div className="mb-[18px] mt-[18px] flex gap-2">
        <button
          type="button"
          className={cn("tab", vista === "PAINEL" && "active")}
          onClick={() => setVista("PAINEL")}
          aria-pressed={vista === "PAINEL"}
        >
          <span className="dot" />
          <Icon name="table" className="mr-1 inline-block h-3.5 w-3.5 flex-none align-middle" />
          Painel Do Portal
        </button>
        <button
          type="button"
          className={cn("tab", vista === "PEDIDOS" && "active")}
          onClick={() => setVista("PEDIDOS")}
          aria-pressed={vista === "PEDIDOS"}
        >
          <span className="dot" />
          <Icon name="alert" className="mr-1 inline-block h-3.5 w-3.5 flex-none align-middle" />
          Pedidos De Ajuda Para Entrar
          {pedidos.length > 0 && (
            <span
              className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--warn)] px-1.5 py-0.5 text-[11px] font-bold text-black tabular-nums"
              aria-label={`${pedidos.length} pedidos de ajuda`}
            >
              {pedidos.length}
            </span>
          )}
        </button>
      </div>

      {vista === "PAINEL" && (
      <>
      {/* O painel não se atualiza sozinho, então dizer isso é parte da tela: sem esta linha alguém
          olha um número velho acreditando que ele acabou de chegar. */}
      <p className="mb-[14px] text-[12.5px] text-dim">
        Este painel não se atualiza sozinho. Use o botão Atualizar para buscar os números de agora.
      </p>

      {/* ── As duas abas. O recorte é do SERVIDOR (parâmetro `aba`), não filtro de tela ────────

          E ELAS FICAM SUSPENSAS ENQUANTO HÁ CARD ACESO, em vez de continuarem acesas mentindo. O
          card conta o universo inteiro e agora RECORTA o universo inteiro (finalizados incluídos),
          então a aba deixou de se aplicar: mantê-la clicável faria a pessoa trocar de aba e não
          ver nada mudar, que é a mesma confusão de antes com outro rosto. A saída é um clique no
          card aceso, e a frase logo abaixo diz isso. */}
      <div className="mb-[18px] flex gap-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={cn(
              "tab",
              a.id === aba && !abaSuspensa && "active",
              abaSuspensa && "cursor-not-allowed opacity-40",
            )}
            onClick={() => trocarAba(a.id)}
            disabled={abaSuspensa}
            title={
              abaSuspensa
                ? "O card selecionado recorta todos os candidatos, nas duas abas. Clique no card aceso para voltar a usar as abas."
                : undefined
            }
            aria-pressed={a.id === aba && !abaSuspensa}
          >
            <span className="dot" />
            <Icon name={a.icone} className="mr-1 inline-block h-3.5 w-3.5 flex-none align-middle" />
            {a.label}
          </button>
        ))}
      </div>

      {/* Cards do funil, clicáveis como filtro em toggle (§A.12). Eles contam o UNIVERSO INTEIRO,
          as duas abas somadas: são o funil, não a aba. */}
      <div className="mb-[18px] grid grid-cols-2 gap-[12px] sm:grid-cols-3 xl:grid-cols-5">
        <Card id="encaminhados" label="Encaminhados" value={contadores.encaminhados} icon="users" />
        <Card
          id="acessaram"
          label="Acessaram"
          value={contadores.acessaram}
          tone="var(--accent)"
          icon="eye"
        />
        <Card
          id="concluiram"
          label="Concluíram"
          value={contadores.concluiram}
          tone="var(--ok)"
          icon="check"
        />
        <Card
          id="intervencaoHumana"
          label="Intervenção Humana"
          value={contadores.intervencaoHumana}
          tone="var(--warn)"
          icon="alert"
        />
        <Card
          id="naoAcessaram"
          label="Não Acessaram"
          value={contadores.naoAcessaram}
          tone="var(--danger)"
          icon="clock"
        />
      </div>

      {/* HONESTIDADE DO RECORTE, e agora ela diz o CONTRÁRIO do que dizia: a tabela passou a
          concordar com o número. O card recorta no SERVIDOR, sobre tudo, e a aba sai de cena. */}
      {recorte !== "" && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-warn">
          O card selecionado está recortando todos os candidatos, nas duas abas, finalizados
          incluídos. As abas não se aplicam enquanto ele estiver aceso. Clique nele de novo para
          voltar a usar as abas.
        </p>
      )}

      {erro && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          {/* §A.20: as ONZE colunas fecham 100% e a tabela ROLA na horizontal abaixo da largura
              mínima, em vez de espremer o nome do candidato e o documento atual.

              A LARGURA MÍNIMA CONTINUA 1040px, e o número foi MEDIDO e não escolhido: com 1180 a
              coluna de AÇÕES, que é a razão desta tela existir, caía FORA da área visível num
              monitor de 1440 (a área útil ali é ~1110px depois do menu lateral). A coluna de Data
              De Admissão entrou tirando pontos das vizinhas largas (Candidato, Documento), e NÃO
              subindo o piso: subi-lo é justamente a regressão que o diretor mediu.

              ┌─ O REEQUILÍBRIO DESTA RODADA, e ele mexe em DUAS frentes de uma vez ────────────┐
              │ Entrou a coluna ORIGEM (7 pontos) e a coluna AÇÕES ganhou o QUARTO botão, o olho │
              │ (11 -> 13 pontos). Os 9 pontos saíram de UM ponto de cada coluna que sobrava     │
              │ folga (Candidato 15->13, que são DOIS, e Cliente, Cargo, Data, Documento,        │
              │ Progresso, Situação e Último Acesso, um de cada). Nenhuma coluna de pill perdeu  │
              │ mais de um ponto, e a de Link, que tem o rótulo mais longo do sistema ("Acesso   │
              │ Bloqueado Temporariamente"), não perdeu nada.                                    │
              │ O PISO CONTINUA EM 1040: o que pagou o quarto botão foi o próprio botão, que     │
              │ passou de 32px para 30px de largura e de `gap-1` para `gap-0.5` (4 x 30 + 3 x 2  │
              │ = 126px, contra os 140px que quatro botões de 32 com gap 4 pediriam). A ALTURA   │
              │ dos 32px ficou, que é o alvo de clique.                                          │
              └─────────────────────────────────────────────────────────────────────────────────┘ */}
          <table className="ds-table ds-table--densa min-w-[1040px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="nome" className="w-[13%]">
                  Candidato
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cliente" className="w-[8%]">
                  Cliente
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="cargo" className="w-[9%]">
                  Cargo
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="dataAdmissao" className="w-[7%]">
                  Data De Admissão
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="documento" className="w-[10%]">
                  Documento Atual
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="progresso" className="w-[8%]">
                  Progresso
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="situacao" className="w-[9%]">
                  Situação
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="ultimoAcesso" className="w-[8%]">
                  Último Acesso
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="link" className="w-[8%]">
                  Link
                </ColunaOrdenavel>
                {/* A COLUNA NOVA (§A.37): célula, ordenação e filtro na mesma entrega. */}
                <ColunaOrdenavel as="th" ord={ord} chave="origem" className="w-[7%]">
                  Origem
                </ColunaOrdenavel>
                {/* QUATRO BOTÕES CABEM AQUI DESDE O OLHO, e por isso a coluna foi de 11% para
                    13%: o nome do cliente QUEBRA em duas linhas e o cilindro escala, mas botão
                    espremido some (§A.20). Ver o reequilíbrio inteiro no bloco acima. */}
                <th className="w-[13%]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {carregando && itens.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : visiveis.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-faint">
                    {recorte
                      ? "Nenhum candidato neste recorte. Clique no card ativo para ver todos."
                      : filtrosAtivos > 0
                        ? "Nenhum candidato com os filtros aplicados. Limpe os filtros para ver todos."
                        : abaAtual.vazio}
                  </td>
                </tr>
              ) : (
                visiveis.map((l) => {
                  const sit = situacaoDaLinha(l);
                  const link = linkDaLinha(l.estadoLink);
                  const vazia = semRegua(l);
                  const rodando = emitindo === l.admissaoId;
                  const trocando = alternando === l.admissaoId;
                  const mandando = enviandoEmail === l.admissaoId;
                  const acao = acaoDoLink(l.estadoLink);
                  return (
                    <tr key={l.admissaoId}>
                      <td className="font-semibold">{caixaAlta(l.nome)}</td>
                      {/* §A.12, MÁSCARA ÚNICA: estas três centralizam como as demais. Ficaram à
                          esquerda por herança da primeira versão, quando a tabela tinha menos
                          colunas e ninguém reparou na fileira desalinhada. Só o ALINHAMENTO
                          mudou: nenhuma largura foi tocada aqui. */}
                      <td className="text-center text-dim">{l.cliente || "não informado"}</td>
                      <td className="text-center text-dim">{l.cargo || "não informado"}</td>

                      {/* DATA DE ADMISSÃO: `null` NÃO é erro (admissão de banco não tem data) e a
                          célula diz "não informado" (§A.11), nunca traço. */}
                      <td className="text-center text-[12.5px] text-dim tabular-nums">
                        {formatarDataAdmissao(l.dataAdmissao)}
                      </td>

                      <td className="text-center text-dim">
                        {l.documentoAtual || "não informado"}
                      </td>

                      {/* PROGRESSO EM CILINDRO, a MESMA peça da Central de Vagas. O texto "7 de 7"
                          virou barra que enche, e o número continua no fim dela.

                          A RÉGUA VAZIA NÃO GANHA CILINDRO, e isso é a distinção auditada: "0 de 0"
                          com barra afirmaria entrega completa a quem não enviou nada. Sem cor de
                          êxito, sem barra e sem a frase de tudo aceito. */}
                      <td>
                        {vazia ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-faint"
                            title={tituloDoProgresso(l)}
                          >
                            <Icon name="doc" className="h-3.5 w-3.5 flex-none" />
                            nada a enviar
                          </span>
                        ) : (
                          <CilindroMeta
                            className="min-w-[84px]"
                            rotulo="Aceitos"
                            meta={l.obrigatorios}
                            feitas={l.aceitos}
                            /* "Completa" e não "Régua Completa": medido a 1440, onde a coluna
                               fica com 84px e o rótulo longo era CORTADO dentro da própria barra
                               cheia, aparecendo como "RÉGUA" (§A.20). A coluna já se chama
                               Progresso e a barra já está cheia: a palavra que falta é a que
                               qualifica, não a que repete. */
                            rotuloCheia="Completa"
                            title={tituloDoProgresso(l)}
                          />
                        )}
                      </td>

                      <td className="text-center">
                        <Pill tone={sit.tone}>{sit.label}</Pill>
                      </td>

                      {/* DATA E HORA EM DUAS LINHAS, e não por estética: com as onze colunas desta
                          tela, "20/09/2026 19:34" numa linha só custava ~60px de largura, que era
                          exatamente o que faltava para a coluna de Ações caber em 1440 (medido no
                          navegador, §A.20). Quebrar entre a data e a hora não esconde nada. */}
                      <td className="text-center text-[12.5px] leading-tight text-dim tabular-nums">
                        {(() => {
                          const t = formatarDataHora(l.ultimoAcessoEm);
                          const [dia, hora] = t.split(" ");
                          return hora ? (
                            <>
                              <span className="block">{dia}</span>
                              <span className="block text-faint">{hora}</span>
                            </>
                          ) : (
                            t
                          );
                        })()}
                      </td>

                      <td className="text-center">
                        <Pill tone={link.tone}>{link.label}</Pill>
                      </td>

                      {/* ORIGEM DO ENVIO. Link emitido antes desta frente não tem origem, e isso
                          NÃO é defeito: a célula diz "não informado" (§A.11), nunca traço. */}
                      <td className="text-center text-[12.5px] text-dim">
                        {rotuloDaOrigem(l.origemEnvio)}
                      </td>

                      <td>
                        <div className="flex items-center justify-center gap-0.5">
                          {/* O OLHO: ficha de LEITURA da linha, e só de leitura. Ele não é
                              desabilitado enquanto uma ação está em voo, porque não disputa nada
                              com ela: o modal lê a linha que já está na tela e não faz chamada
                              nenhuma. */}
                          <button
                            type="button"
                            title="Ver as informações deste candidato"
                            aria-label={`Ver as informações de ${l.nome}`}
                            onClick={() => setDetalhe(l)}
                            className={cn(
                              "grid h-8 w-[30px] flex-none place-items-center rounded-lg text-faint transition",
                              "hover:bg-[var(--surface-2)] hover:text-accent",
                            )}
                          >
                            <Icon name="eye" className="h-[17px] w-[17px]" />
                          </button>

                          <button
                            type="button"
                            title="Gerar um link novo do portal, o anterior deixa de valer"
                            aria-label={`Gerar link do portal para ${l.nome}`}
                            disabled={rodando || trocando || mandando}
                            onClick={() => void emitir(l)}
                            className={cn(
                              "grid h-8 w-[30px] flex-none place-items-center rounded-lg text-faint transition",
                              "hover:bg-[var(--surface-2)] hover:text-accent disabled:cursor-not-allowed disabled:opacity-40",
                            )}
                          >
                            <Icon
                              name={rodando ? "refresh" : "link"}
                              className={cn("h-[17px] w-[17px]", rodando && "animate-spin")}
                            />
                          </button>

                          {/* ENVIAR POR E-MAIL, que é o caminho manual da OST. Ele é IRMÃO do
                              botão ao lado e não o substitui: um COPIA a URL para quem vai passar
                              o link por outro canal, o outro MANDA o e-mail. Os dois emitem link
                              novo, e o anterior deixa de valer. */}
                          <button
                            type="button"
                            title="Enviar o link do portal por e-mail para o candidato"
                            aria-label={`Enviar o link do portal por e-mail para ${l.nome}`}
                            disabled={rodando || trocando || mandando}
                            onClick={() => void enviarPorEmail(l)}
                            className={cn(
                              "grid h-8 w-[30px] flex-none place-items-center rounded-lg text-faint transition",
                              "hover:bg-[var(--surface-2)] hover:text-accent disabled:cursor-not-allowed disabled:opacity-40",
                            )}
                          >
                            <Icon
                              name={mandando ? "refresh" : "arr"}
                              className={cn("h-[17px] w-[17px]", mandando && "animate-spin")}
                            />
                          </button>

                          {/* UM BOTÃO SÓ, QUE ALTERNA: bloqueia o que está vivo, desbloqueia o que
                              está bloqueado. Sem ação possível, ele fica apagado DIZENDO POR QUÊ,
                              em vez de sumir e deixar a pessoa procurando. */}
                          <button
                            type="button"
                            title={
                              acao === "bloquear"
                                ? "Bloquear o acesso do candidato, sem trocar o link que ele já tem"
                                : acao === "desbloquear"
                                  ? "Liberar de novo o acesso do candidato pelo mesmo link"
                                  : motivoSemAcaoDeLink(l.estadoLink)
                            }
                            aria-label={
                              acao === "desbloquear"
                                ? `Desbloquear o acesso de ${l.nome}`
                                : `Bloquear o acesso de ${l.nome}`
                            }
                            disabled={!acao || rodando || trocando || mandando}
                            onClick={() => void alternarBloqueio(l)}
                            className={cn(
                              "grid h-8 w-[30px] flex-none place-items-center rounded-lg transition",
                              "hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-40",
                              acao === "desbloquear"
                                ? "text-ok hover:text-ok"
                                : "text-faint hover:text-danger",
                            )}
                          >
                            <Icon
                              name={trocando ? "refresh" : acao === "desbloquear" ? "undo" : "lock"}
                              className={cn("h-[17px] w-[17px]", trocando && "animate-spin")}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de paginação: só existe quando há mais de uma página. Ver a nota da ordenação. */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-3 px-3 py-3 text-[13px] text-dim">
            <span>
              Página {pagina} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-[13px] disabled:opacity-50"
                disabled={pagina <= 1 || carregando}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <Icon name="left" className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn-secondary px-3 py-2 text-[13px] disabled:opacity-50"
                disabled={pagina >= totalPaginas || carregando}
                onClick={() => setPagina((p) => p + 1)}
                aria-label="Próxima página"
              >
                <Icon name="right" className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </GlassCard>
      </>
      )}

      {/* ── PEDIDOS DE AJUDA PARA ENTRAR: a fila do "Não consigo entrar" ────────────────────────
          É um AVISO acionável: quem pediu ajuda, quando pediu (o último pedido) e quantas vezes. A
          ação do RH reusa o que a tela já faz por admissão: gerar um link novo (o modal de sempre)
          e ir ver a linha daquele candidato no painel. §A.12/§A.20/§A.29. */}
      {vista === "PEDIDOS" && (
        <GlassCard className="overflow-hidden p-2">
          {pedidosErro && (
            <p
              className="m-2 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {pedidosErro}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-[12.5px] text-dim">
              Quem clicou "Não consigo entrar" no portal e ainda precisa de ação. Não se atualiza
              sozinho: use o botão ao lado para buscar os pedidos de agora.
            </p>
            <Button
              variant="secondary"
              onClick={() => void carregarPedidos()}
              className="shrink-0 px-3 py-2"
            >
              <Icon name="refresh" className={cn("h-4 w-4", pedidosCarregando && "animate-spin")} />
              Atualizar
            </Button>
          </div>

          <div className="ea-scroll overflow-x-auto">
            <table className="ds-table ds-table--densa min-w-[880px]">
              <thead>
                <tr>
                  <ColunaOrdenavel as="th" ord={ordPedidos} chave="nome" className="w-[24%]">
                    Candidato
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordPedidos} chave="cargo" className="w-[18%]">
                    Cargo
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordPedidos} chave="cliente" className="w-[18%]">
                    Cliente
                  </ColunaOrdenavel>
                  <ColunaOrdenavel
                    as="th"
                    ord={ordPedidos}
                    chave="ultimoPedidoEm"
                    className="w-[16%]"
                  >
                    Pediu Em
                  </ColunaOrdenavel>
                  <ColunaOrdenavel as="th" ord={ordPedidos} chave="vezes" className="w-[10%]">
                    Vezes
                  </ColunaOrdenavel>
                  <th className="w-[14%]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pedidosCarregando && pedidos.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-faint">
                      Carregando…
                    </td>
                  </tr>
                ) : pedidosVisiveis.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-faint">
                      Nenhum pedido de ajuda no momento.
                    </td>
                  </tr>
                ) : (
                  pedidosVisiveis.map((p) => {
                    const rodando = emitindo === p.admissaoId;
                    return (
                      <tr key={p.linkJti}>
                        <td className="font-semibold">{caixaAlta(p.nome)}</td>
                        <td className="text-center text-dim">{p.cargo || "não informado"}</td>
                        <td className="text-center text-dim">{p.cliente || "não informado"}</td>
                        {/* Data e hora brasileiras, sem travessão (§A.11). O primeiro pedido fica
                            no título, para o RH ver desde quando o candidato está preso. */}
                        <td
                          className="text-center text-[12.5px] text-dim tabular-nums"
                          title={`Primeiro pedido em ${formatarDataHora(p.primeiroPedidoEm)}`}
                        >
                          {formatarDataHora(p.ultimoPedidoEm)}
                        </td>
                        <td className="text-center">
                          {p.vezes > 1 ? (
                            <Pill tone="wn">Pediu {p.vezes} Vezes</Pill>
                          ) : (
                            <span className="text-[12.5px] text-dim">1 vez</span>
                          )}
                        </td>
                        <td>
                          <div className="flex items-center justify-center gap-0.5">
                            {/* GERAR LINK NOVO: reusa a emissão de sempre (o modal com a URL para
                                copiar e enviar). O anterior deixa de valer. */}
                            <button
                              type="button"
                              title="Gerar um link novo do portal para este candidato"
                              aria-label={`Gerar link do portal para ${p.nome}`}
                              disabled={rodando}
                              onClick={() =>
                                void emitir({ admissaoId: p.admissaoId, nome: p.nome })
                              }
                              className={cn(
                                "grid h-8 w-[30px] flex-none place-items-center rounded-lg text-faint transition",
                                "hover:bg-[var(--surface-2)] hover:text-accent disabled:cursor-not-allowed disabled:opacity-40",
                              )}
                            >
                              <Icon
                                name={rodando ? "refresh" : "link"}
                                className={cn("h-[17px] w-[17px]", rodando && "animate-spin")}
                              />
                            </button>
                            {/* VER NO PAINEL: leva ao painel já filtrado pelo nome, para o RH ver a
                                linha do candidato e suas ações completas. Reusa a busca por nome. */}
                            <button
                              type="button"
                              title="Ver este candidato no painel"
                              aria-label={`Ver ${p.nome} no painel`}
                              onClick={() => {
                                setBusca(p.nome);
                                setVista("PAINEL");
                              }}
                              className={cn(
                                "grid h-8 w-[30px] flex-none place-items-center rounded-lg text-faint transition",
                                "hover:bg-[var(--surface-2)] hover:text-accent",
                              )}
                            >
                              <Icon name="eye" className="h-[17px] w-[17px]" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* O LINK APARECE UMA VEZ. Quem o perder emite outro, que é barato e mata o anterior.
          §A.41: o modal não fecha por clique fora, e tem "Fechar" no rodapé. */}
      {emitido && (
        <Modal onClose={fecharEmitido} className="max-w-xl" ariaLabel="Link Do Portal">
          <h3>Link Do Portal</h3>
          <p className="psub mt-1">{caixaAlta(emitido.nome)}</p>
          <p className="mt-3 text-[12.5px] text-dim">
            Copie e envie ao candidato. O link vale até {formatarDataHora(emitido.dados.expiraEm)} e
            some desta tela quando você fechar esta janela. Qualquer link anterior deste candidato
            deixou de valer agora.
          </p>

          <div className="mt-4 flex items-center gap-2">
            <input
              readOnly
              value={emitido.dados.link}
              aria-label="Link do portal"
              onFocus={(e) => e.currentTarget.select()}
              className="ds-input w-full py-2 text-[12.5px]"
            />
            <Button
              variant="secondary"
              onClick={() => void copiarLink(emitido.dados.link)}
              className="shrink-0 px-3 py-2"
            >
              <Icon name="copy" className="h-4 w-4" />
              {copia === "copiado" ? "Copiado" : "Copiar"}
            </Button>
          </div>

          {/* ERRO HONESTO: quando nem a reserva copia, a tela DIZ, e diz o que fazer. Antes disto o
              botão simplesmente não fazia nada fora de contexto seguro. */}
          {copia === "falhou" && (
            <p className="mt-2 text-[12.5px] text-warn" role="alert">
              {AVISO_COPIA_FALHOU}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={fecharEmitido} className="px-4 py-2.5">
              Fechar
            </Button>
          </div>
        </Modal>
      )}

      {/* O DESFECHO DO ENVIO POR E-MAIL. A URL NÃO APARECE AQUI, e isso é o desenho: ela foi
          direto ao candidato pelo servidor, e o que a tela precisa dizer é para qual destino
          MASCARADO ela foi e até quando vale (§A.6). §A.41: saída visível no rodapé. */}
      {envioFeito && (
        <Modal
          onClose={() => setEnvioFeito(null)}
          className="max-w-lg"
          ariaLabel="Envio Do Link Do Portal"
        >
          <h3>{envioFeito.ok ? "Link Do Portal Enviado" : "O Link Não Foi Enviado"}</h3>
          <p className="psub mt-1">{caixaAlta(envioFeito.nome)}</p>
          <p className="mt-3 text-[12.5px] text-dim">{envioFeito.texto}</p>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setEnvioFeito(null)} className="px-4 py-2.5">
              Fechar
            </Button>
          </div>
        </Modal>
      )}

      {/* A FICHA ENXUTA DO CANDIDATO, de LEITURA.

          §A.6, e esta é a linha dura: NADA de CPF, nada de e-mail em claro, nada de telefone e
          nada da URL do link. A lista dos campos é fechada e mora em `camposDoDetalhe`, fora da
          tela, justamente para ser auditável num lugar só: aqui não há chamada, não há token e
          não há como buscar campo em outro endpoint, então o modal não tem por onde crescer sem
          que o contrato da LISTA cresça antes.

          §A.41: modal de leitura nasce com "Fechar", não fecha por clique fora, e o Escape
          continua fechando (o `ui/Modal` garante os três). */}
      {detalhe && (
        <Modal
          onClose={() => setDetalhe(null)}
          className="max-w-lg"
          ariaLabel="Informações Do Candidato"
        >
          <h3>{caixaAlta(detalhe.nome)}</h3>
          <p className="psub mt-1">Informações Do Candidato</p>

          <dl className="mt-4 divide-y divide-[var(--border)]">
            {camposDoDetalhe(detalhe).map((c) => (
              <div key={c.rotulo} className="flex items-center justify-between gap-4 py-2">
                <dt className="text-[12.5px] text-dim">{c.rotulo}</dt>
                <dd className="text-right text-[13px]">
                  {c.tom ? <Pill tone={c.tom}>{c.valor}</Pill> : c.valor}
                </dd>
              </div>
            ))}
          </dl>

          {/* A EXPLICAÇÃO DA COMBINAÇÃO QUE PARECE DEFEITO E NÃO É: régua COMPLETA e Último
              Acesso VAZIO. Medido ao vivo na homologação: o carimbo de acesso funciona (uma
              identificação de verdade gravou no mesmo segundo), então quem aparece assim
              simplesmente nunca entrou no portal, e a régua fechou porque o consultor entregou
              os documentos pela Esteira.

              ELA MORA NO RODAPÉ, e não na célula da tabela: a coluna já está no limite de
              largura (§A.20), e um texto de duas linhas ali esmagaria a tabela inteira para
              explicar um caso que só se lê com a ficha aberta.

              A CONDIÇÃO É EXATA, as duas partes juntas: `coletaCompleta` (a mesma régua do
              painel, obrigatórios > 0 e todos aceitos) E nenhum acesso. Régua incompleta sem
              acesso é o caso comum de quem ainda não entrou, e ali não há nada a explicar.

              §A.11 sem travessão. §A.24: corpo de modal é texto normal, não título. O tom é de
              explicação: não é pendência, não é alerta e não é defeito. */}
          {coletaCompleta(detalhe) && detalhe.ultimoAcessoEm === null && (
            <p className="mt-4 rounded-glass border border-[var(--border)] bg-[var(--surface-2)] p-3 text-[12.5px] leading-relaxed text-dim">
              Este candidato ainda não acessou o portal, e isso é esperado aqui: a régua aparece
              completa porque os documentos foram entregues pelo consultor na Esteira. O carimbo de
              último acesso registra só a entrada no portal, então ele fica vazio nesse caminho.
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={() => setDetalhe(null)} className="px-4 py-2.5">
              Fechar
            </Button>
          </div>
        </Modal>
      )}

      {buscandoSemLink && (
        <EnviarLinkModal
          token={token}
          onClose={() => setBuscandoSemLink(false)}
          onEnviou={() => void carregar()}
        />
      )}
    </>
  );
}
