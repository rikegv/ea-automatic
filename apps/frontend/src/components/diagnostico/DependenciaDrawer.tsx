"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { normBusca } from "@/lib/busca-nome";

export interface Dependencia {
  nome: string;
  estado: "ok" | "fora" | "degradado" | "indisponivel";
  detalhe: string;
  verificadoEm: string;
  ultimoErro?: string;
}

interface JobFalhado {
  fila: string;
  jobId: string;
  nome: string;
  alvo: string;
  motivo: string;
  tentativas: number;
  falhouEm: string | null;
  horas: number | null;
}
/**
 * O NOME DE TODAS AS LINHAS DE UMA VEZ, resolvido ao abrir o modal.
 *
 * É POST com `jobIds` no corpo, e não GET com query, por exigência da auditoria: quem deriva o
 * identificador de pré-colaborador é o servidor, a partir do `job.data`. Cliente que pudesse mandar
 * esse identificador seria um oráculo de enumeração. O corpo também mantém NOME fora de query string,
 * que atravessaria o proxy same-origin do Next e cairia em log de acesso (§A.6).
 *
 * A linha do job desenha o alvo cru ("Candidato do Pandápé <id>"), e o nome só aparecia depois de um
 * clique em "Ver dados do alvo", um por um. Sem nome na linha não existe busca por nome: é por isso
 * que o lote vem no abrir, e não por clique.
 *
 * Só `jobId` e `nome`, nunca CPF (§A.6). Job cujo nome não resolveu simplesmente não vem na lista.
 */
interface NomesDoLote {
  nomes: Array<{ jobId: string; nome: string }>;
  /**
   * Quantos ficaram SEM resolver porque o freio de cota do backend recusou o excedente (§A.5: a cota
   * do Pandápé é compartilhada com o webhook que alimenta a folha). Maior que zero, a tela diz e
   * oferece pedir o restante A PEDIDO. Nunca em laço automático: laço transforma freio em tempestade.
   */
  restantes: number;
}

interface EstadoFilas {
  disponivel: boolean;
  contagem: { ativos: number; aguardando: number; falhados: number; atrasados: number };
  jobs: JobFalhado[];
  indisponiveis: string[];
}
/**
 * BLOCO C: o estado de cada origem de CPF do pré-colaborador, como o Pandapé devolve AGORA. O NÚMERO
 * nunca vem (§A.6): vem o rótulo do campo, se ele fecha o dígito, e se o EA olha para ele.
 */
interface EstadoCampoCpf {
  origem: string;
  estado: "válido" | "inválido" | "ausente";
  lidoPeloEa: boolean;
  observacao?: string;
}

interface AlvoResolvido {
  tipo: string;
  id: string;
  nome?: string;
  vaga?: string;
  etapa?: string;
  cliente?: string;
  admissaoPrevista?: string | null;
  indisponivel?: string;
  cpf?: EstadoCampoCpf[];
  cpfResumo?: string;
}

/**
 * BLOCO B: o desfecho REAL do reprocessamento. Três estados, nunca dois: voltar para a fila não é
 * sucesso, e era exatamente isso que a tela dizia sem querer (caso Zelda, 05/09/2026).
 */
interface ResultadoReprocesso {
  fila: string;
  jobId: string;
  nome: string;
  desfecho: "CONCLUIDO" | "FALHOU" | "EM_PROCESSAMENTO";
  motivo?: string;
  motivoLegivel?: string;
  mensagem: string;
  esperouSegundos: number;
}

/**
 * O PADRÃO ÚNICO DE 4 BLOCOS, e a razão dele existir.
 *
 * O card dizia "degradado" e parava aí. Quando aconteceu de verdade, o diretor não tinha como saber
 * O QUE estava degradado nem o que fazer, e precisou acionar a fábrica para descobrir que era um job
 * falhado por CPF inválido. A tela sabia o número e escondia o resto.
 *
 * Todo card passa a abrir a MESMA estrutura, sempre nesta ordem: o que é, o que está acontecendo,
 * desde quando, o que fazer. O texto é de operação, não de sistema: quem lê precisa decidir, não
 * traduzir. Os dois primeiros blocos são o diagnóstico, o terceiro é a urgência, o quarto é a saída.
 */
const COPY: Record<string, { oQueE: string; oQueFazer: string }> = {
  "Fila (BullMQ)": {
    oQueE:
      "A fila de trabalho em segundo plano. É por ela que passam a entrada de candidatos do Pandapé, a consulta das assinaturas na Clicksign e a varredura da coleta de VT. Quando um job falha, aquele trabalho específico não aconteceu.",
    oQueFazer:
      "Corrija a causa na origem (por exemplo o dado errado no Pandapé) e use Reprocessar. Se o caso não vale mais, use Limpar, que descarta o job de vez. Antes de limpar, veja os dados do alvo: o job costuma ser o único rastro de quem ficou de fora.",
  },
  "Vertex AI (auditoria)": {
    oQueE:
      "O motor de IA que lê e audita os documentos. Fora do ar, a auditoria documental para de avançar sozinha e os documentos ficam aguardando.",
    oQueFazer:
      "Confira a credencial e a quota do projeto no Google Cloud. Depois de mexer, use Testar agora para saber na hora se voltou.",
  },
  "Google Drive": {
    oQueE:
      "Onde os prontuários e os contratos assinados são arquivados. Fora do ar, o arquivamento não acontece e o contrato assinado não fecha o ciclo.",
    oQueFazer:
      "Confira a conta de serviço e as permissões da pasta. Depois de mexer, use Testar agora.",
  },
  "Pandapé (API)": {
    oQueE:
      "A porta de entrada dos candidatos. Fora do ar, candidato novo não entra sozinho no SOUOperações e a fila de Liberação para de crescer.",
    oQueFazer:
      "Confira as credenciais do OAuth2 no ambiente. Depois de mexer, use Testar agora. Enquanto estiver fora, dá para cadastrar pelo Nova Admissão.",
  },
  "Banco de dados": {
    oQueE: "O banco do sistema. Fora do ar, nada funciona, e a própria tela não abriria.",
    oQueFazer: "Se acender, é caso de infraestrutura na VM, não de operação.",
  },
};

/**
 * A fila cujos jobs carregam PESSOA. As outras (assinatura, coleta de VT) não têm nome para resolver,
 * e a linha delas segue exibindo o alvo cru, como sempre exibiu.
 */
const FILA_COM_NOME = "pandape-sync";

/** Mesmos tons da faixa 2 da tela, para o pill do drawer não contar história diferente do card. */
const TOM: Record<Dependencia["estado"], "ok" | "dg" | "wn" | "nt"> = {
  ok: "ok",
  degradado: "wn",
  fora: "dg",
  indisponivel: "nt",
};

function quando(iso: string | null | undefined): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

/** "há 16h", "há 2 dias". O tempo decorrido é o que dá urgência ao item. */
function haQuanto(horas: number | null): string {
  if (horas === null) return "";
  if (horas < 1) return "há menos de 1h";
  if (horas < 48) return `há ${horas}h`;
  return `há ${Math.floor(horas / 24)} dias`;
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--border)] pt-3 first:border-0 first:pt-0">
      <div className="eyebrow !mb-1.5">{titulo}</div>
      <div className="text-[13px] text-dim">{children}</div>
    </div>
  );
}

export function DependenciaDrawer({
  dependencia,
  onClose,
  onMudou,
}: {
  dependencia: Dependencia;
  onClose: () => void;
  /** Recarrega o snapshot quando uma ação mudou o estado do sistema. */
  onMudou: () => void;
}) {
  const { token } = useAuth();
  const [dep, setDep] = useState(dependencia);
  const [filas, setFilas] = useState<EstadoFilas | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emVoo, setEmVoo] = useState<string | null>(null);
  const [alvos, setAlvos] = useState<Record<string, AlvoResolvido>>({});
  /** jobId -> nome do candidato, do lote resolvido ao abrir. Vazio = ainda não chegou ou não resolveu. */
  const [nomes, setNomes] = useState<Record<string, string>>({});
  /**
   * O lote de nomes falhou INTEIRO. Não é erro de tela: a lista de jobs continua lá, com o alvo cru, e
   * o único efeito é a busca avisar que não tem nome para procurar. Perder a lista por causa do nome
   * seria trocar um incómodo por um apagão.
   */
  const [nomesFalhou, setNomesFalhou] = useState(false);
  /** Quantos nomes o freio de cota do backend recusou resolver. Ver `NomesDoLote.restantes`. */
  const [restantes, setRestantes] = useState(0);
  /** Lote de nomes em voo. Segura o clique repetido no pedido do restante, sem travar o resto. */
  const [pedindoNomes, setPedindoNomes] = useState(false);
  /**
   * jobIds já PEDIDOS ao servidor, resolvidos ou não. É o que garante uma resolução por job, e não uma
   * por ação: `carregarFilas()` roda de novo depois de CADA limpar, reprocessar e "Testar agora", e
   * pendurar o lote nele refaria as 132 chamadas à API do Pandápé a cada clique, na cota da folha.
   */
  const pedidos = useRef<Set<string>>(new Set());
  /** Filtro na tela, conforme digita. NUNCA vai ao servidor, e o nome não sai da memória da página. */
  const [busca, setBusca] = useState("");
  /** Job aguardando confirmação da limpeza (§A.26: destrutiva não acontece em um clique). */
  const [confirmarLimpeza, setConfirmarLimpeza] = useState<JobFalhado | null>(null);
  /**
   * O desfecho do ÚLTIMO reprocessamento, mostrado FORA do card do job de propósito: quando o
   * reprocesso dá certo, o job some da lista (que é só de falhados) e o card desapareceria levando a
   * resposta junto. Era esse sumiço que a tela lia como sucesso, calada.
   */
  const [resultado, setResultado] = useState<ResultadoReprocesso | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  /**
   * TRAZ A RESPOSTA PARA A VISTA. Quando o reprocesso dá certo, o job SAI da lista, a lista encolhe e
   * o banner pode acabar acima da dobra: a pessoa clicaria e continuaria sem ver resposta, que é o
   * defeito inteiro que esta entrega existe para corrigir. Rolar até ele fecha o ciclo do clique.
   */
  useEffect(() => {
    if (resultado) bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [resultado]);

  const ehFila = dep.nome === "Fila (BullMQ)";
  const copy = COPY[dep.nome] ?? { oQueE: dep.nome, oQueFazer: "Sem ação disponível nesta tela." };

  const carregarFilas = useCallback(async () => {
    if (!ehFila) return;
    setCarregando(true);
    try {
      setFilas(await apiFetch<EstadoFilas>("/diagnostico/filas", { token }));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao ler as filas.");
    } finally {
      setCarregando(false);
    }
  }, [ehFila, token]);

  /**
   * Resolve o nome dos jobIds pedidos e ACUMULA no mapa. Nunca derruba a tela: falha do lote deixa a
   * lista de jobs onde está, com o identificador do Pandápé na linha, e quem avisa é a área da busca.
   */
  const resolverNomes = useCallback(
    async (jobIds: string[]) => {
      if (!jobIds.length) return;
      for (const id of jobIds) pedidos.current.add(id);
      setPedindoNomes(true);
      try {
        const r = await apiFetch<NomesDoLote>("/diagnostico/filas/nomes", {
          method: "POST",
          token,
          body: { jobIds },
        });
        setNomes((m) => {
          const proximo = { ...m };
          for (const n of r?.nomes ?? []) if (n?.jobId && n?.nome) proximo[n.jobId] = n.nome;
          return proximo;
        });
        setRestantes(r?.restantes ?? 0);
        setNomesFalhou(false);
      } catch {
        // Silêncio de propósito: o nome é conforto, a lista é o trabalho.
        setNomesFalhou(true);
      } finally {
        setPedindoNomes(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void carregarFilas();
  }, [carregarFilas]);

  /**
   * UMA RESOLUÇÃO POR JOB, ao aparecer. Pede só o jobId que ainda não foi pedido, então reabrir a
   * lista depois de uma ação não repete nada: job que continua na lista já está no mapa, e job que
   * saiu não é pedido de novo.
   */
  useEffect(() => {
    if (!ehFila || !filas) return;
    const novos = filas.jobs
      .filter((j) => j.fila === FILA_COM_NOME && !pedidos.current.has(j.jobId))
      .map((j) => j.jobId);
    void resolverNomes(novos);
  }, [ehFila, filas, resolverNomes]);

  /**
   * Re-checa a dependência e atualiza o CABEÇALHO do drawer.
   *
   * Existe porque a primeira versão deixava o cabeçalho mentindo: limpar o último job falhado
   * esvaziava a lista, mas o pill seguia "degradado" e o texto seguia "falhados 1", porque eram o
   * retrato de quando o drawer abriu. Quem age precisa VER o efeito da ação, senão age duas vezes.
   */
  const recarregarDep = useCallback(async () => {
    const r = await apiFetch<Dependencia | undefined>("/diagnostico/acao/testar-dependencia", {
      method: "POST",
      token,
      body: { nome: dependencia.nome },
    }).catch(() => undefined);
    if (r) setDep(r);
  }, [token, dependencia.nome]);

  async function testarAgora() {
    setEmVoo("testar");
    setErro(null);
    try {
      await recarregarDep();
      if (ehFila) await carregarFilas();
      onMudou();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao testar.");
    } finally {
      setEmVoo(null);
    }
  }

  async function verAlvo(j: JobFalhado) {
    setEmVoo(`alvo:${j.jobId}`);
    setErro(null);
    try {
      const r = await apiFetch<AlvoResolvido>(
        `/diagnostico/filas/${encodeURIComponent(j.fila)}/${encodeURIComponent(j.jobId)}/alvo`,
        { token },
      );
      setAlvos((a) => ({ ...a, [j.jobId]: r }));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao resolver o alvo.");
    } finally {
      setEmVoo(null);
    }
  }

  /**
   * O REPROCESSAR AGORA ESPERA. A chamada só volta quando o job termina, ou quando o teto de 25s do
   * backend estoura, e a resposta traz o desfecho de verdade. Enquanto isso o botão diz que está
   * aguardando, senão a tela parece travada.
   */
  async function agirNoJob(j: JobFalhado, rota: "limpar-job" | "reprocessar-job") {
    setEmVoo(`${rota}:${j.jobId}`);
    setErro(null);
    if (rota === "reprocessar-job") setResultado(null);
    try {
      const r = await apiFetch<ResultadoReprocesso>(`/diagnostico/acao/${rota}`, {
        method: "POST",
        token,
        body: { fila: j.fila, jobId: j.jobId },
      });
      if (rota === "reprocessar-job" && r?.desfecho) setResultado(r);
      setConfirmarLimpeza(null);
      await carregarFilas();
      await recarregarDep();
      onMudou();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha na ação.");
    } finally {
      setEmVoo(null);
    }
  }

  // O BLOCO 2 é o que o card sozinho nunca disse: o item específico e o motivo real.
  const jobs = filas?.jobs ?? [];
  const maisAntigo = jobs.reduce<JobFalhado | null>(
    (a, j) => (a === null || (j.horas ?? 0) > (a.horas ?? 0) ? j : a),
    null,
  );

  /**
   * O FILTRO, só por nome (o diretor dispensou o CPF), sem acento e sem caixa pela régua única do
   * `normBusca`. Busca vazia devolve a lista INTEIRA, intacta: o filtro nunca é o estado padrão.
   */
  const termo = normBusca(busca);
  const jobsVisiveis = termo
    ? jobs.filter((j) => normBusca(nomes[j.jobId] ?? "").includes(termo))
    : jobs;
  /**
   * Job SEM nome resolvido não pode casar com busca por nome, então sai da lista enquanto se procura.
   * Dizer QUANTOS saíram evita a leitura de que eles desapareceram da fila.
   */
  const jobsSemNome = jobs
    .filter((j) => j.fila === FILA_COM_NOME && !nomes[j.jobId])
    .map((j) => j.jobId);
  /**
   * AS DUAS CONTAS SÃO DIFERENTES DE PROPÓSITO, E ISSO CUSTOU UMA IDA E VOLTA.
   *
   * `jobsSemNome` (acima) é quem PODE ter nome e não tem: só a fila do Pandapé, e é ela que alimenta
   * o botão de resolver o que faltou. Pedir nome de um ciclo automático não faria sentido.
   *
   * Esta conta é outra pergunta: quem SAIU DA VISTA por causa da busca. Aqui entram TODOS os sem
   * nome, inclusive os de Clicksign e de VT, porque o risco é o mesmo e é o que esta tela existe para
   * não repetir: lista que encolhe calada. A primeira correção contou só os do Pandapé e silenciou o
   * job de assinatura, trocando um defeito de TEXTO por um defeito de OMISSÃO. O texto é que não pode
   * afirmar a causa: quem é ciclo automático nunca teve nome a resolver, então a frase diz "sem
   * nome", o fato, e não "sem nome resolvido", que seria acusar uma falha que não houve.
   */
  const escondidosSemNome = termo ? jobs.filter((j) => !nomes[j.jobId]).length : 0;

  return (
    <Modal onClose={onClose} ariaLabel={`Detalhe: ${dep.nome}`} className="max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Dependência</div>
          <h2 className="text-lg font-semibold text-text">{dep.nome}</h2>
        </div>
        <StatusPill tone={TOM[dep.estado]} label={dep.estado} />
      </div>

      {erro && <p className="mb-3 text-[13px] text-danger">{erro}</p>}

      {/*
        BUSCA POR NOME, visível assim que o modal abre e FORA do container que rola, de propósito:
        dentro dele o campo sumiria da vista assim que a pessoa rolasse a lista, que é justamente
        quando ela ainda está procurando. Mesmo desenho do outro modal desta tela.
      */}
      {ehFila && jobs.length > 0 && (
        <div className="mb-3">
          <input
            className="ds-input"
            placeholder="Buscar por nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar candidato pelo nome"
          />
          {nomesFalhou && (
            <p className="mt-1.5 text-[12px] text-warn">
              Os nomes não carregaram agora, então não há nome para buscar. A lista de jobs abaixo
              segue completa.
            </p>
          )}
          {/*
            O FREIO DE COTA RECUSOU parte dos nomes. A tela diz quantos faltaram e o restante é pedido
            por CLIQUE. Sem retentativa automática: laço em cima de um freio de cota vira tempestade
            de chamadas na cota que alimenta a folha (§A.5).
          */}
          {/*
            O AVISO É PELO ESTADO DA TELA, NÃO PELA CAUSA DA FALTA, e isso conserta um silêncio real:
            `restantes` conta só o que o FREIO recusou, então o Pandapé respondendo erro para três de
            cento e trinta deixava três linhas "não informado" com `restantes` em zero, sem aviso e
            sem o botão. Agora o gatilho é "há job desta fila sem nome", qualquer que seja o motivo, e
            o texto separa os dois casos sem afirmar o que não se sabe.
          */}
          {jobsSemNome.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-warn">
                {restantes > 0
                  ? `Faltou resolver ${restantes} nome${restantes === 1 ? "" : "s"}, por limite de consultas ao Pandapé, e o limite libera em alguns minutos.`
                  : `Ficou ${jobsSemNome.length === 1 ? "1 job sem nome" : `${jobsSemNome.length} jobs sem nome`}, porque a consulta ao Pandapé não respondeu para ${jobsSemNome.length === 1 ? "ele" : "eles"}.`}{" "}
                Quem está sem nome aparece como não informado e não é encontrado pela busca.
              </span>
              <Button
                variant="secondary"
                className="!px-2.5 !py-1 text-[12px]"
                disabled={pedindoNomes}
                onClick={() => void resolverNomes(jobsSemNome)}
              >
                {pedindoNomes ? "Resolvendo…" : "Resolver os nomes que faltaram"}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="max-h-[62vh] space-y-3.5 overflow-y-auto pr-1">
        <Bloco titulo="O que é">{copy.oQueE}</Bloco>

        <Bloco titulo="O que está acontecendo">
          {dep.estado === "ok" && !jobs.length ? (
            <span className="text-ok">Tudo certo. {dep.detalhe}.</span>
          ) : (
            <div className="space-y-2">
              <p>{dep.detalhe}.</p>
              {dep.ultimoErro && <p className="text-danger">Último erro: {dep.ultimoErro}</p>}
              {ehFila && filas?.indisponiveis.length ? (
                <p className="text-warn">
                  Sem leitura de {filas.indisponiveis.join(" e ")}: essa parte não foi verificada.
                </p>
              ) : null}
              {ehFila && carregando && <p className="text-faint">Lendo as filas…</p>}

              {/*
                O DESFECHO DO REPROCESSAMENTO, em destaque e fora do card do job. Verde só quando
                puxou de verdade; amarelo quando o job voltou para a fila e ainda roda; vermelho com o
                motivo real quando não puxou. Nunca os três viram "sucesso".
              */}
              {resultado && (
                <div
                  ref={bannerRef}
                  className={`rounded-xl border px-3 py-2.5 text-[13px] ${
                    resultado.desfecho === "CONCLUIDO"
                      ? "border-ok/40 bg-ok/10 text-ok"
                      : resultado.desfecho === "FALHOU"
                        ? "border-danger/40 bg-danger/10 text-danger"
                        : "border-warn/40 bg-warn/10 text-warn"
                  }`}
                >
                  <div className="font-semibold">
                    {resultado.desfecho === "CONCLUIDO"
                      ? "Puxou"
                      : resultado.desfecho === "FALHOU"
                        ? "Não Puxou"
                        : "Em Processamento"}
                  </div>
                  <p className="mt-0.5">{resultado.mensagem}</p>
                  <p className="mt-1 text-[11.5px] opacity-80">
                    {resultado.fila} · {resultado.nome}, acompanhado por {resultado.esperouSegundos}s
                  </p>
                </div>
              )}
              {/*
                LISTA VAZIA POR CAUSA DA BUSCA. Aqui o risco é pior que no outro modal: lista vazia
                neste modal se leria como "a fila ficou saudável", e ela não ficou. Por isso a
                mensagem repete o total real de falhados.
              */}
              {/*
                O CORTE DA LISTA NÃO PODE SER SILENCIOSO. A lista tem teto (o servidor devolve até 500
                por fila) e a contagem é a real, então quando os dois divergem a tela DIZ, em vez de
                deixar a pessoa procurar alguém que existe e não está desenhado. É exatamente o
                defeito que originou esta busca: eram 132 falhados e a lista mostrava 50, calada.
              */}
              {ehFila && filas && filas.contagem.falhados > jobs.length && (
                <p className="text-[11.5px] text-warn">
                  A fila tem {filas.contagem.falhados} jobs falhados e esta lista mostra os{" "}
                  {jobs.length} mais recentes, então a busca não alcança o restante.
                </p>
              )}
              {termo !== "" && jobsVisiveis.length === 0 && (
                <p className="py-6 text-center text-[13px] text-faint">
                  Nenhum nome encontrado para esta busca. A fila segue com {jobs.length} job
                  {jobs.length === 1 ? "" : "s"} falhado{jobs.length === 1 ? "" : "s"}.
                </p>
              )}
              {termo !== "" && jobsVisiveis.length > 0 && escondidosSemNome > 0 && (
                <p className="text-[11.5px] text-faint">
                  {escondidosSemNome === 1
                    ? "1 job sem nome ficou fora desta busca."
                    : `${escondidosSemNome} jobs sem nome ficaram fora desta busca.`}{" "}
                  Limpe a busca para ver a fila inteira.
                </p>
              )}
              {jobsVisiveis.map((j) => {
                const alvo = alvos[j.jobId];
                /**
                 * Enquanto o nome não chegou (ou não resolveu), a linha mostra "não informado", que é o
                 * marcador da casa (§A.11 proíbe o travessão, inclusive como marcador de vazio). Nada de
                 * espaço em branco e nada de "carregando" piscando por linha. O identificador do
                 * Pandápé fica visível nos DOIS estados, sempre no mesmo lugar: é por ele que se acha o
                 * candidato no ATS.
                 */
                const nomeDoJob = nomes[j.jobId];
                return (
                  <div
                    key={`${j.fila}:${j.jobId}`}
                    className="rounded-xl border border-[var(--border)] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-text">
                        {nomeDoJob ?? "não informado"}
                      </span>
                      <span className="text-[12px] text-dim">{j.alvo}</span>
                      <span className="text-[11.5px] text-faint">
                        {j.fila} · {j.nome}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-danger">{j.motivo}</p>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      {j.tentativas} tentativa{j.tentativas === 1 ? "" : "s"}
                      {j.falhouEm ? `, falhou em ${quando(j.falhouEm)} ${haQuanto(j.horas)}` : ""}
                    </p>

                    {alvo && (
                      <div className="mt-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[12.5px]">
                        {alvo.indisponivel ? (
                          <span className="text-warn">{alvo.indisponivel}</span>
                        ) : (
                          <>
                            <div className="font-semibold text-text">{alvo.nome}</div>
                            {alvo.vaga && <div className="text-dim">Vaga: {alvo.vaga}</div>}
                            {alvo.etapa && <div className="text-dim">Etapa: {alvo.etapa}</div>}
                            {alvo.cliente && <div className="text-dim">Cliente: {alvo.cliente}</div>}
                            {alvo.admissaoPrevista && (
                              <div className="text-dim">
                                Admissão prevista:{" "}
                                {new Date(alvo.admissaoPrevista).toLocaleDateString("pt-BR")}
                              </div>
                            )}

                            {/*
                              BLOCO C: o que o Pandapé devolve AGORA, por origem de CPF. Sem o número
                              (§A.6): só onde ele está, se fecha o dígito e se o EA olha para ali. É o
                              que responde "por que não puxa" sem ninguém abrir o Redis.
                            */}
                            {alvo.cpf?.length ? (
                              <div className="mt-2 border-t border-[var(--border)] pt-2">
                                <div className="mb-1 font-semibold text-text">
                                  O Que O Pandapé Devolve Agora
                                </div>
                                <ul className="space-y-1">
                                  {alvo.cpf.map((c, i) => (
                                    <li key={`${c.origem}:${i}`} className="flex flex-wrap gap-x-2">
                                      <span className="text-dim">{c.origem}:</span>
                                      {/*
                                        Campo que o EA NÃO lê nunca sai verde, mesmo válido: verde ali
                                        seria sinal de que dá para usar, e é justamente o contrário.
                                      */}
                                      <span
                                        className={
                                          !c.lidoPeloEa
                                            ? "font-semibold text-faint"
                                            : c.estado === "válido"
                                              ? "font-semibold text-ok"
                                              : c.estado === "inválido"
                                                ? "font-semibold text-danger"
                                                : "font-semibold text-faint"
                                        }
                                      >
                                        {c.estado}
                                      </span>
                                      {!c.lidoPeloEa && (
                                        <span className="text-faint">
                                          (o EA não lê: {c.observacao ?? "campo recusado"})
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                                {alvo.cpfResumo && (
                                  <p className="mt-1.5 text-dim">{alvo.cpfResumo}</p>
                                )}
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-[12px]"
                        disabled={emVoo !== null}
                        onClick={() => void verAlvo(j)}
                      >
                        Ver dados do alvo
                      </Button>
                      {/*
                        O botão espera o desfecho (até 25s). Sem dizer isso, a tela parece travada e
                        alguém clica de novo, que era metade do problema.
                      */}
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-[12px]"
                        disabled={emVoo !== null}
                        onClick={() => void agirNoJob(j, "reprocessar-job")}
                      >
                        {emVoo === `reprocessar-job:${j.jobId}`
                          ? "Aguardando o resultado…"
                          : "Reprocessar"}
                      </Button>
                      {/* DESTRUTIVA: confirma antes (§A.26). O job é o único rastro do que carregava. */}
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-[12px] !text-danger"
                        disabled={emVoo !== null}
                        onClick={() => setConfirmarLimpeza(j)}
                      >
                        Limpar job
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Desde quando">
          {ehFila && maisAntigo?.falhouEm
            ? `A falha mais antiga é de ${quando(maisAntigo.falhouEm)}, ${haQuanto(maisAntigo.horas)}.`
            : `Verificado em ${quando(dep.verificadoEm)}. O histórico de quando o estado mudou entra na próxima onda.`}
        </Bloco>

        <Bloco titulo="O que fazer">{copy.oQueFazer}</Bloco>
      </div>

      <div className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-3">
        <Button variant="secondary" onClick={onClose} disabled={emVoo !== null}>
          Fechar
        </Button>
        <Button onClick={() => void testarAgora()} disabled={emVoo !== null}>
          {emVoo === "testar" ? "Testando…" : "Testar agora"}
        </Button>
      </div>

      {/* CONFIRMAÇÃO da limpeza: modal de texto e botões, então segue estreito (design system). */}
      {confirmarLimpeza && (
        <Modal
          onClose={() => setConfirmarLimpeza(null)}
          ariaLabel="Confirmar limpeza do job"
          className="max-w-md p-5"
        >
          <div className="mb-2 flex items-center gap-2">
            <Icon name="alert" className="h-4 w-4 text-danger" />
            <h3 className="text-base font-semibold text-text">Limpar Este Job</h3>
          </div>
          <p className="text-[13px] text-dim">
            O job é descartado e não volta. Ele costuma ser o único registro do que ficou de fora, e
            depois disso não há como recuperar o que ele carregava.
          </p>
          <p className="mt-2 text-[13px] text-dim">
            Alvo: <span className="font-semibold text-text">{confirmarLimpeza.alvo}</span>, por{" "}
            {confirmarLimpeza.motivo}.
          </p>
          <p className="mt-2 text-[12.5px] text-faint">
            Se a causa foi corrigida na origem, o certo é Reprocessar, não limpar.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmarLimpeza(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void agirNoJob(confirmarLimpeza, "limpar-job")}
              disabled={emVoo !== null}
            >
              {emVoo?.startsWith("limpar-job") ? "Limpando…" : "Limpar mesmo assim"}
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
