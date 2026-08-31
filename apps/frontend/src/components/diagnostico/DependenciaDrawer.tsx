"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";

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
interface EstadoFilas {
  disponivel: boolean;
  contagem: { ativos: number; aguardando: number; falhados: number; atrasados: number };
  jobs: JobFalhado[];
  indisponiveis: string[];
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
  /** Job aguardando confirmação da limpeza (§A.26: destrutiva não acontece em um clique). */
  const [confirmarLimpeza, setConfirmarLimpeza] = useState<JobFalhado | null>(null);

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

  useEffect(() => {
    void carregarFilas();
  }, [carregarFilas]);

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

  async function agirNoJob(j: JobFalhado, rota: "limpar-job" | "reprocessar-job") {
    setEmVoo(`${rota}:${j.jobId}`);
    setErro(null);
    try {
      await apiFetch(`/diagnostico/acao/${rota}`, {
        method: "POST",
        token,
        body: { fila: j.fila, jobId: j.jobId },
      });
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
              {jobs.map((j) => {
                const alvo = alvos[j.jobId];
                return (
                  <div
                    key={`${j.fila}:${j.jobId}`}
                    className="rounded-xl border border-[var(--border)] px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[13px] font-semibold text-text">{j.alvo}</span>
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
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1 text-[12px]"
                        disabled={emVoo !== null}
                        onClick={() => void agirNoJob(j, "reprocessar-job")}
                      >
                        Reprocessar
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
