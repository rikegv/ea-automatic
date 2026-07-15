"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiDownload, apiFetch, apiUpload, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/cn";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { Select } from "@/components/ui/Select";

interface KitTipo {
  id: string;
  nome: string;
  ativo: boolean;
  documentos: number;
}
interface DicItem {
  titulo: string;
  ordem: number;
}
interface Documento {
  titulo: string;
  ordem: number;
  paginas: number[];
  arquivo: string;
}
interface Funcionario {
  nome: string;
  cpfMascarado: string | null;
  revisao: string | null;
  documentos: Documento[];
}
interface NaoReconhecido {
  arquivo: string;
  paginas: number[];
  motivo: string;
}
interface Resultado {
  dicionario: DicItem[];
  funcionarios: Funcionario[];
  naoReconhecidos: NaoReconhecido[];
  log: {
    pdfs: number;
    funcionarios: number;
    docsPorFuncionario: number[];
    semReconhecimento: number;
  };
}
interface JobStart {
  jobId: string;
  totalLotes: number;
}
interface JobStatus {
  status: "processando" | "concluido" | "erro";
  loteAtual: number;
  totalLotes: number;
  mensagem: string;
  retries: number;
  resultado: Resultado | null;
  erro: string | null;
}
interface Progresso {
  loteAtual: number;
  totalLotes: number;
  mensagem: string;
  retries: number;
}

function fmtTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtPaginas(p: number[]): string {
  return p.length === 1 ? `página ${p[0]}` : `páginas ${p.join(", ")}`;
}

// Retenção do resultado por 2h: guarda a referência do último job (sem PII) para reencontrar o
// resultado ao voltar à tela, sem reprocessar. O resultado em si vive no ai-service (efêmero, §A.6).
const RESULTADO_KEY = "ea_kit_ultimo_resultado";
const RESULTADO_TTL_MS = 2 * 60 * 60 * 1000; // 2h

interface ResultadoSalvo {
  jobId: string;
  kitNome: string;
  ts: number;
}

export default function ProcessarKitPage() {
  const { token, isAdmin } = useAuth();
  const [kits, setKits] = useState<KitTipo[]>([]);
  const [selKitId, setSelKitId] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [kitNome, setKitNome] = useState("kit");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelado = useRef(false);

  const loadKits = useCallback(async () => {
    if (!token) return;
    try {
      const rows = await apiFetch<KitTipo[]>("/admin/kit-tipos", { token });
      setKits(rows.filter((k) => k.ativo));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao carregar os kits.");
    }
  }, [token]);

  useEffect(() => {
    void loadKits();
  }, [loadKits]);

  // Cancela o polling se a página desmontar durante o processamento.
  useEffect(() => {
    return () => {
      cancelado.current = true;
    };
  }, []);

  // Retenção 2h: ao (re)entrar na tela, reencontra o último resultado processado, se ainda vivo.
  useEffect(() => {
    if (!token || !isAdmin) return;
    let vivo = true;
    (async () => {
      let salvo: ResultadoSalvo | null = null;
      try {
        salvo = JSON.parse(window.localStorage.getItem(RESULTADO_KEY) ?? "null");
      } catch {
        salvo = null;
      }
      if (!salvo?.jobId) return;
      if (Date.now() - (salvo.ts ?? 0) > RESULTADO_TTL_MS) {
        window.localStorage.removeItem(RESULTADO_KEY);
        return;
      }
      try {
        const st = await apiFetch<JobStatus>(`/kit/processar/status/${salvo.jobId}`, { token });
        if (!vivo) return;
        if (st.status === "concluido" && st.resultado) {
          setJobId(salvo.jobId);
          setKitNome(salvo.kitNome || "kit");
          setResultado(st.resultado);
        } else {
          window.localStorage.removeItem(RESULTADO_KEY);
        }
      } catch {
        if (vivo) window.localStorage.removeItem(RESULTADO_KEY);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token, isAdmin]);

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return;
    const pdfs = Array.from(lista).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    const rejeitados = lista.length - pdfs.length;
    if (rejeitados > 0) setError(`${rejeitados} arquivo(s) ignorado(s): apenas PDF é aceito.`);
    else setError(null);
    setArquivos((cur) => {
      const chaves = new Set(cur.map((f) => `${f.name}:${f.size}`));
      return [...cur, ...pdfs.filter((f) => !chaves.has(`${f.name}:${f.size}`))];
    });
  }

  function removerArquivo(i: number) {
    setArquivos((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function processar() {
    if (!selKitId || arquivos.length === 0) return;
    cancelado.current = false;
    setProcessando(true);
    setError(null);
    setResultado(null);
    setJobId(null);
    setKitNome(kits.find((k) => k.id === selKitId)?.nome ?? "kit");
    setProgresso({ loteAtual: 0, totalLotes: 0, mensagem: "Enviando os PDFs...", retries: 0 });
    try {
      const fd = new FormData();
      fd.append("kitTipoId", selKitId);
      for (const f of arquivos) fd.append("files", f);
      // 1. Inicia o job (upload dos PDFs). Rápido: só estaciona e devolve o id.
      const start = await apiUpload<JobStart>("/kit/processar", fd, token);
      setJobId(start.jobId);
      setProgresso({
        loteAtual: 0,
        totalLotes: start.totalLotes,
        mensagem: "Preparando...",
        retries: 0,
      });
      // 2. Acompanha o progresso por polling (a fila roda no servidor, com retry no 429).
      for (;;) {
        if (cancelado.current) return;
        await new Promise((r) => setTimeout(r, 1500));
        const st = await apiFetch<JobStatus>(`/kit/processar/status/${start.jobId}`, { token });
        setProgresso({
          loteAtual: st.loteAtual,
          totalLotes: st.totalLotes,
          mensagem: st.mensagem,
          retries: st.retries,
        });
        if (st.status === "concluido" && st.resultado) {
          setResultado(st.resultado);
          // Retenção 2h: guarda a referência do resultado (substitui a anterior, item 1e).
          try {
            const salvo: ResultadoSalvo = {
              jobId: start.jobId,
              kitNome: kits.find((k) => k.id === selKitId)?.nome ?? "kit",
              ts: Date.now(),
            };
            window.localStorage.setItem(RESULTADO_KEY, JSON.stringify(salvo));
          } catch {
            /* localStorage indisponível: segue sem persistir a referência */
          }
          break;
        }
        if (st.status === "erro") {
          setError(st.erro ?? "Falha ao processar o kit.");
          break;
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao processar o kit.");
    } finally {
      setProcessando(false);
      setProgresso(null);
    }
  }

  const podeProcessar = Boolean(selKitId) && arquivos.length > 0 && !processando;

  // Acesso restrito a Master / Super Admin (a tela saiu de Configurações, mantém o guard aqui).
  if (!isAdmin) {
    return (
      <>
        <PageHead eyebrow="Gerador de kit" title="Acesso restrito" />
        <GlassCard className="p-4">
          <p className="text-dim">O gerador de kit é exclusivo de Master / Super Admin.</p>
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Gerador de kit"
        title="Processar kit"
        subtitle="Escolha o kit, envie os PDFs do sistema de folha e o motor separa os documentos por funcionário. Baixe o kit consolidado, por funcionário ou tudo em um ZIP."
      />

      {error && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      <GlassCard className="mb-5 p-4">
        <div className="grid gap-4 md:grid-cols-[300px_1fr] md:items-start">
          {/* Seletor de kit */}
          <div>
            <span className="ds-label">Kit (tipo de vínculo)</span>
            <Select
              value={selKitId}
              onChange={setSelKitId}
              options={kits.map((k) => ({ value: k.id, label: `${k.nome} (${k.documentos})` }))}
              placeholder={kits.length ? "Selecione o kit…" : "Nenhum kit ativo"}
              ariaLabel="Kit"
              disabled={processando}
            />
            <p className="mt-1.5 text-[11.5px] text-faint">
              O motor usa o dicionário de títulos deste kit.
            </p>
          </div>

          {/* Upload */}
          <div>
            <span className="ds-label">PDFs do sistema de folha</span>
            <button
              type="button"
              disabled={!selKitId || processando}
              onClick={() => inputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 py-5 text-sm text-dim transition hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
              title={selKitId ? "Selecionar PDFs" : "Selecione um kit primeiro"}
            >
              <Icon name="doc" className="h-5 w-5" />
              Clique para selecionar os PDFs (só PDF, vários de uma vez)
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                adicionarArquivos(e.target.files);
                e.target.value = "";
              }}
            />
            {arquivos.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {arquivos.map((f, i) => (
                  <div
                    key={`${f.name}:${f.size}:${i}`}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  >
                    <Icon name="doc" className="h-4 w-4 flex-none text-faint" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{f.name}</span>
                    <span className="flex-none text-[12px] text-dim">{fmtTamanho(f.size)}</span>
                    <button
                      type="button"
                      disabled={processando}
                      className="grid h-7 w-7 flex-none place-items-center rounded-lg text-faint transition hover:bg-[rgba(214,69,69,0.12)] hover:text-danger disabled:opacity-50"
                      title="Remover"
                      onClick={() => removerArquivo(i)}
                    >
                      <Icon name="x" className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={processar} disabled={!podeProcessar} className="px-5 py-2.5">
            {processando ? "Processando…" : "Processar kit"}
          </Button>
          {!processando && arquivos.length > 0 && (
            <span className="text-[12.5px] text-dim">
              {arquivos.length} PDF{arquivos.length === 1 ? "" : "s"} selecionado
              {arquivos.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Progresso real do job (fila no servidor). O aviso de retry aparece na própria mensagem. */}
        {processando && progresso && (
          <div className="mt-3">
            {(() => {
              const emRetry = progresso.mensagem.includes("Aguardando disponibilidade");
              const pct =
                progresso.totalLotes > 0
                  ? Math.round((progresso.loteAtual / progresso.totalLotes) * 100)
                  : 0;
              return (
                <>
                  <div className="mb-1.5 flex items-center gap-2 text-[13px]">
                    <span
                      className={cn(
                        "h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
                        emRetry ? "text-warn-2" : "text-accent",
                      )}
                    />
                    <span className={cn(emRetry ? "text-warn-2" : "text-dim")}>
                      {progresso.mensagem}
                    </span>
                    {progresso.retries > 0 && (
                      <span className="text-[12px] text-faint">
                        ({progresso.retries} nova{progresso.retries === 1 ? "" : "s"} tentativa
                        {progresso.retries === 1 ? "" : "s"} até agora)
                      </span>
                    )}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-300",
                        emRetry ? "bg-[var(--warn-2)]" : "bg-[var(--accent)]",
                      )}
                      style={{ width: `${Math.max(pct, emRetry ? 6 : 2)}%` }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </GlassCard>

      {resultado && jobId && (
        <Resultado
          dados={resultado}
          jobId={jobId}
          kitNome={kitNome}
          token={token}
          onResultadoChange={setResultado}
        />
      )}
    </>
  );
}

/** Nome de arquivo seguro (sem acento, só [A-Za-z0-9_-]) para o download. */
function sanitizarNome(nome: string): string {
  const base = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "kit";
}

/** Normaliza para a busca por nome: sem acento, minúsculas. */
function normalizarBusca(s: string): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Aviso de retenção mostrado uma vez por sessão (sessionStorage). */
const RETENCAO_KEY = "ea_kit_retencao_ok";

type Confirmacao =
  | { tipo: "func"; indice: number; func: Funcionario }
  | { tipo: "zip"; revisao: number };

function Resultado({
  dados,
  jobId,
  kitNome,
  token,
  onResultadoChange,
}: {
  dados: Resultado;
  jobId: string;
  kitNome: string;
  token: string | null;
  onResultadoChange: (r: Resultado) => void;
}) {
  const { log } = dados;
  const [baixando, setBaixando] = useState<string | null>(null);
  const [erroDl, setErroDl] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [expandido, setExpandido] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState("");
  const [retencao, setRetencao] = useState<(() => void) | null>(null);
  const [reimportando, setReimportando] = useState<number | null>(null);
  const reimportInputRef = useRef<HTMLInputElement>(null);
  const alvoReimport = useRef<number | null>(null);

  function abrirReimport(indice: number) {
    alvoReimport.current = indice;
    reimportInputRef.current?.click();
  }

  async function aoSelecionarReimport(lista: FileList | null) {
    const indice = alvoReimport.current;
    if (indice == null) return;
    const pdfs = lista
      ? Array.from(lista).filter(
          (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
        )
      : [];
    if (reimportInputRef.current) reimportInputRef.current.value = "";
    if (pdfs.length === 0) {
      setErroDl("Selecione ao menos um PDF para reimportar.");
      return;
    }
    setErroDl(null);
    setReimportando(indice);
    try {
      const fd = new FormData();
      for (const f of pdfs) fd.append("files", f);
      const resp = await apiUpload<{ resultado: Resultado; anexados: string[] }>(
        `/kit/processar/${jobId}/funcionario/${indice}/reimportar`,
        fd,
        token,
      );
      onResultadoChange(resp.resultado);
      if (resp.anexados.length === 0) {
        setErroDl("O PDF não trouxe documentos novos para este funcionário.");
      }
    } catch (e) {
      setErroDl(e instanceof ApiError ? e.message : "Falha ao reimportar os documentos.");
    } finally {
      setReimportando(null);
    }
  }

  const revisaoTotal = dados.funcionarios.filter((f) => f.revisao).length;

  // Preserva o índice original (o download usa o índice do array da API) ao filtrar por nome.
  const termo = normalizarBusca(busca.trim());
  const visiveis = dados.funcionarios
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !termo || normalizarBusca(f.nome).includes(termo));

  function toggleExpandir(i: number) {
    setExpandido((cur) => {
      const prox = new Set(cur);
      if (prox.has(i)) prox.delete(i);
      else prox.add(i);
      return prox;
    });
  }

  // Aviso de retenção: só na PRIMEIRA vez que o usuário baixa algo na sessão atual (item 3).
  function comRetencao(acao: () => void) {
    const jaAvisou =
      typeof window !== "undefined" && window.sessionStorage.getItem(RETENCAO_KEY) === "1";
    if (jaAvisou) acao();
    else setRetencao(() => acao);
  }
  function confirmarRetencao() {
    if (typeof window !== "undefined") window.sessionStorage.setItem(RETENCAO_KEY, "1");
    const acao = retencao;
    setRetencao(null);
    acao?.();
  }

  async function baixarFuncionario(indice: number, func: Funcionario) {
    setErroDl(null);
    setBaixando(`f${indice}`);
    try {
      await apiDownload(
        `/kit/processar/${jobId}/funcionario/${indice}`,
        `kit_${sanitizarNome(func.nome)}.pdf`,
        token,
      );
    } catch (e) {
      setErroDl(e instanceof ApiError ? e.message : "Falha ao baixar o kit do funcionário.");
    } finally {
      setBaixando(null);
    }
  }

  async function baixarZip() {
    setErroDl(null);
    setBaixando("zip");
    try {
      await apiDownload(`/kit/processar/${jobId}/zip`, `kits_${sanitizarNome(kitNome)}.zip`, token);
    } catch (e) {
      setErroDl(e instanceof ApiError ? e.message : "Falha ao baixar os kits.");
    } finally {
      setBaixando(null);
    }
  }

  // Funcionário em revisão (nome duplicado sem CPF) exige confirmação antes de baixar (regra da OST).
  function pedirFuncionario(indice: number, func: Funcionario) {
    if (func.revisao) setConfirmar({ tipo: "func", indice, func });
    else void baixarFuncionario(indice, func);
  }
  function pedirZip() {
    if (revisaoTotal > 0) setConfirmar({ tipo: "zip", revisao: revisaoTotal });
    else void baixarZip();
  }
  function confirmarDownload() {
    const c = confirmar;
    setConfirmar(null);
    if (!c) return;
    if (c.tipo === "func") void baixarFuncionario(c.indice, c.func);
    else void baixarZip();
  }

  const mensagemConfirmacao =
    confirmar?.tipo === "func"
      ? `Este funcionário tem nome duplicado sem CPF para desambiguar. Confirme que os documentos a seguir pertencem à mesma pessoa antes de baixar: ${confirmar.func.documentos
          .map((d) => d.titulo)
          .join(", ")}.`
      : confirmar?.tipo === "zip"
        ? `${confirmar.revisao} funcionário(s) têm nome duplicado sem CPF para desambiguar. Confirme que revisou essas identidades antes de baixar todos os kits.`
        : "";

  return (
    <>
      {/* Log */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LogCard label="PDFs recebidos" valor={log.pdfs} icon="doc" />
        <LogCard label="Funcionários" valor={log.funcionarios} icon="users" />
        <LogCard
          label="Documentos"
          valor={log.docsPorFuncionario.reduce((a, b) => a + b, 0)}
          icon="layers"
        />
        <LogCard
          label="Não reconhecidos"
          valor={log.semReconhecimento}
          icon="alert"
          alerta={log.semReconhecimento > 0}
        />
      </div>

      {/* Não reconhecidos (destaque para revisar antes de baixar) */}
      {dados.naoReconhecidos.length > 0 && (
        <GlassCard className="mb-4 border-[var(--warn-2)] p-4">
          <div className="mb-2 flex items-center gap-2 text-warn-2">
            <Icon name="alert" className="h-4 w-4" />
            <span className="text-[13px] font-semibold">
              Não reconhecidos ({dados.naoReconhecidos.length}), revisar antes de baixar
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {dados.naoReconhecidos.map((n, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] bg-[rgba(234,88,12,0.08)] px-3 py-2 text-[12.5px]"
              >
                <span className="font-semibold text-text">{n.arquivo}</span>
                <span className="text-dim">{fmtPaginas(n.paginas)}</span>
                <span className="text-warn-2">{n.motivo}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Barra de download */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-text">
          Kits por funcionário ({dados.funcionarios.length})
        </h2>
        {dados.funcionarios.length > 0 && (
          <Button
            onClick={() => comRetencao(pedirZip)}
            disabled={baixando !== null}
            className="inline-flex items-center gap-2 px-4 py-2"
          >
            <Icon name="download" className="h-4 w-4" />
            {baixando === "zip" ? "Gerando ZIP…" : "Baixar todos (ZIP)"}
          </Button>
        )}
      </div>

      {erroDl && (
        <p
          className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erroDl}
        </p>
      )}

      {/* Busca por nome, no topo da lista de resultado */}
      {dados.funcionarios.length > 0 && (
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar funcionário por nome…"
          aria-label="Buscar funcionário por nome"
          className="mb-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-text placeholder:text-faint focus:border-[var(--border-strong)] focus:outline-none"
        />
      )}

      {/* Funcionários: linhas compactas e recolhíveis */}
      <div className="flex flex-col gap-2">
        {visiveis.length === 0 && (
          <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm text-dim">
            Nenhum funcionário encontrado para a busca.
          </p>
        )}
        {visiveis.map(({ f, i }) => {
          const encontrados = new Map(f.documentos.map((d) => [d.titulo, d]));
          const faltando = dados.dicionario.filter((d) => !encontrados.has(d.titulo)).length;
          const aberto = expandido.has(i);
          return (
            <GlassCard
              key={i}
              className={cn("overflow-hidden p-0", f.revisao && "border-[var(--warn-2)]")}
            >
              {/* Linha principal: clicável (menos o botão Baixar) para expandir/recolher */}
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => toggleExpandir(i)}
                  aria-expanded={aberto}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={cn(
                      "h-4 w-4 flex-none text-faint transition-transform",
                      aberto && "rotate-90",
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14.5px] font-semibold text-text">
                        {f.nome}
                      </span>
                      {faltando === 0 ? (
                        <Pill tone="ok">Completo</Pill>
                      ) : (
                        <Pill tone="wn">Faltam {faltando}</Pill>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12px] text-dim">
                      {f.cpfMascarado ? `CPF ${f.cpfMascarado}` : "sem CPF"} · {f.documentos.length}
                      /{dados.dicionario.length} documentos
                    </div>
                  </div>
                </button>
                {faltando > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() => abrirReimport(i)}
                    disabled={reimportando !== null || baixando !== null}
                    className="inline-flex flex-none items-center gap-1.5 px-3 py-1.5 text-[12.5px]"
                    title="Reimportar os documentos que faltam deste funcionário"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3.5 w-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 15V3M8 7l4-4 4 4M5 21h14" />
                    </svg>
                    {reimportando === i ? "Reimportando…" : "Reimportar"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => comRetencao(() => pedirFuncionario(i, f))}
                  disabled={baixando !== null || reimportando !== null}
                  className="inline-flex flex-none items-center gap-1.5 px-3 py-1.5 text-[12.5px]"
                  title="Baixar o kit"
                >
                  <Icon name="download" className="h-3.5 w-3.5" />
                  {baixando === `f${i}` ? "Baixando…" : "Baixar"}
                </Button>
              </div>

              {/* Área expansível: revisão (se houver) + a lista detalhada de documentos de hoje */}
              {aberto && (
                <div className="border-t border-[var(--border)] px-4 py-3">
                  {f.revisao && (
                    <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--warn-2)] bg-[rgba(234,88,12,0.1)] px-2.5 py-1 text-[12px] font-semibold text-warn-2">
                      <Icon name="alert" className="h-3.5 w-3.5" />
                      {f.revisao}
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    {dados.dicionario.map((d) => {
                      const doc = encontrados.get(d.titulo);
                      return (
                        <div
                          key={d.titulo}
                          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px]"
                        >
                          <span className="grid h-5 w-5 flex-none place-items-center rounded bg-[var(--surface-2)] text-[11px] font-semibold text-dim">
                            {d.ordem}
                          </span>
                          {doc ? (
                            <Icon name="check" className="h-4 w-4 flex-none text-ok" />
                          ) : (
                            <Icon name="x" className="h-4 w-4 flex-none text-danger" />
                          )}
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate",
                              doc ? "text-text" : "text-faint line-through",
                            )}
                          >
                            {d.titulo}
                          </span>
                          {doc && (
                            <span className="flex-none text-[11.5px] text-dim">
                              {fmtPaginas(doc.paginas)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmar !== null}
        tone="danger"
        title="Confirmar identidade antes de baixar"
        message={mensagemConfirmacao}
        confirmLabel="Confirmar e baixar"
        onConfirm={confirmarDownload}
        onCancel={() => setConfirmar(null)}
      />

      <ConfirmDialog
        open={retencao !== null}
        title="Baixe agora: os arquivos são temporários"
        message="Os documentos processados não ficam armazenados no sistema para download depois. Os arquivos são temporários e podem ser apagados a qualquer momento. Baixe agora o que precisar."
        confirmLabel="Entendi, baixar"
        onConfirm={confirmarRetencao}
        onCancel={() => setRetencao(null)}
      />

      {/* Upload oculto da reimportação por funcionário (os PDFs que faltam) */}
      <input
        ref={reimportInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => aoSelecionarReimport(e.target.files)}
      />
    </>
  );
}

function LogCard({
  label,
  valor,
  icon,
  alerta,
}: {
  label: string;
  valor: number;
  icon: "doc" | "users" | "layers" | "alert";
  alerta?: boolean;
}) {
  return (
    <GlassCard className={cn("fk", alerta && valor > 0 && "!border-[var(--warn-2)]")}>
      <div className="mb-0.5 flex items-center justify-between">
        <Icon
          name={icon}
          className={cn("h-4 w-4 opacity-70", alerta && valor > 0 && "text-warn-2 opacity-100")}
        />
      </div>
      <div className={cn("num", alerta && valor > 0 && "text-warn-2")}>{valor}</div>
      <div className="lbl">{label}</div>
    </GlassCard>
  );
}
