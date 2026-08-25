"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import type { PillTone } from "@/components/ui/Pill";
import { caixaAlta } from "@/lib/nome";

/**
 * VT ÓRFÃO: o formulário chegou ao bucket e não casou com admissão nenhuma.
 *
 * POR QUE ESTE PAINEL EXISTE, em vez de a lista genérica de sinais servir: o genérico mostrava um
 * prefixo de digest e a frase "sem admissão viva para o CPF". Ninguém consegue agir com isso, porque
 * não dá para saber DE QUEM é o formulário nem POR QUE ele não casou, e aquela frase cobre três
 * situações que se resolvem de maneiras diferentes.
 *
 * NENHUM BOTÃO AGE NO ESCURO (decisão do diretor): cada motivo traz a explicação do que aconteceu, e
 * o casamento manual pede confirmação dizendo, com nome e admissão, o que vai acontecer.
 *
 * §A.6: nome e CPF vêm LIDOS DO BUCKET NA HORA pelo backend e não são persistidos em lugar nenhum.
 * Eles existem enquanto esta tela está aberta.
 */

interface AdmissaoCandidata {
  id: string;
  farolGlobal: string;
  cliente: string | null;
  cargo: string | null;
  dataAdmissao: string | null;
  aceitaVt: boolean;
}

interface Orfao {
  md5: string;
  objetoId: string | null;
  nome: string | null;
  cpf: string | null;
  chegouEm: string | null;
  motivo:
    | "RESOLVE_SOZINHO"
    | "SEM_CANDIDATO"
    | "ADMISSAO_ENCERRADA"
    | "CPF_NAO_IDENTIFICADO"
    | "ARQUIVO_SUMIU";
  explicacao: string;
  admissoesCandidatas: AdmissaoCandidata[];
}

interface AdmissaoBusca {
  id: string;
  nome: string;
  cpf: string;
  farolGlobal: string;
  cliente: string | null;
  cargo: string | null;
  dataAdmissao: string | null;
}

/**
 * Tom do motivo. `RESOLVE_SOZINHO` é OK DE PROPÓSITO: não é problema, é a fila andando, e pintá-lo
 * de amarelo faria o time tratar como pendência algo que o próximo ciclo resolve sem ninguém.
 */
const TOM: Record<Orfao["motivo"], PillTone> = {
  RESOLVE_SOZINHO: "ok",
  SEM_CANDIDATO: "wn",
  ADMISSAO_ENCERRADA: "wn",
  CPF_NAO_IDENTIFICADO: "wn",
  ARQUIVO_SUMIU: "dg",
};

const ROTULO: Record<Orfao["motivo"], string> = {
  RESOLVE_SOZINHO: "Resolve Sozinho",
  SEM_CANDIDATO: "Sem Candidato",
  ADMISSAO_ENCERRADA: "Admissão Encerrada",
  CPF_NAO_IDENTIFICADO: "CPF Não Identificado",
  ARQUIVO_SUMIU: "Arquivo Sumiu",
};

function fmtCpf(cpf: string | null): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  if (d.length !== 11) return "não identificado";
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtQuando(iso: string | null): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function PainelVtOrfaos() {
  const [itens, setItens] = useState<Orfao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [casando, setCasando] = useState<Orfao | null>(null);
  const [resolvendo, setResolvendo] = useState<Orfao | null>(null);
  const [salvandoResolver, setSalvandoResolver] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setItens(await apiFetch<Orfao[]>("/vt-coleta/orfaos"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar os formulários órfãos.");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) {
    return (
      <p className="py-6 text-center text-[13px] text-danger" role="alert">
        {erro}
      </p>
    );
  }
  if (!itens) return <p className="py-6 text-center text-[13px] text-faint">Carregando…</p>;
  if (itens.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-faint">
        Nenhum formulário órfão. Todos casaram com a pessoa certa.
      </p>
    );
  }

  return (
    <>
      {flash && (
        <p className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-ok">
          {flash}
        </p>
      )}
      <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
        {itens.map((o) => (
          <div key={o.md5} className="rounded-xl border border-[var(--border)] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13.5px] font-semibold text-text">
                {o.nome ? caixaAlta(o.nome) : "Nome não identificado"}
              </span>
              <span className="text-[12.5px] tabular-nums text-dim">{fmtCpf(o.cpf)}</span>
              <StatusPill tone={TOM[o.motivo]} label={ROTULO[o.motivo]} />
              <span className="ml-auto text-[12px] text-faint">
                Chegou em {fmtQuando(o.chegouEm)}
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-dim">{o.explicacao}</p>

            {/* O casamento manual NÃO é oferecido para quem resolve sozinho: dar o botão ali faria o
                time agir à toa e concorrer com o automático. */}
            {/* DOIS BOTÕES, DOIS EFEITOS. Casar TRATA o órfão (o formulário entra na pessoa certa);
                resolver só DISPENSA o alerta, sem tratar nada. Cada um diz o que faz antes de
                confirmar, e nenhum age no escuro. */}
            <div className="mt-2.5 flex flex-wrap gap-2">
              {o.motivo !== "RESOLVE_SOZINHO" && o.motivo !== "ARQUIVO_SUMIU" && (
                <Button
                  variant="secondary"
                  className="!py-1 !px-2.5 text-[12px]"
                  onClick={() => {
                    setFlash(null);
                    setCasando(o);
                  }}
                >
                  Casar com uma admissão
                </Button>
              )}
              {/* Vale para TODOS os motivos, inclusive "resolve sozinho" e "arquivo sumiu": são
                  justamente os casos em que não há o que tratar e o alerta só ocupa espaço. */}
              <Button
                variant="secondary"
                className="!py-1 !px-2.5 text-[12px]"
                onClick={() => {
                  setFlash(null);
                  setResolvendo(o);
                }}
              >
                Resolver Sinal
              </Button>
            </div>
          </div>
        ))}
      </div>

      {resolvendo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resolver sinal do formulário de VT"
          className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(7,17,31,0.55)] p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="text-[17px] font-semibold text-text">Resolver Sinal</h2>
            <p className="mt-2 text-[13.5px] text-text">
              O alerta deste formulário some da tela e <strong>não volta</strong> nos próximos ciclos.
            </p>
            {/* O QUE NÃO ACONTECE, dito antes de confirmar: é a diferença entre dispensar e tratar, e
                sem isso alguém clicaria aqui achando que resolveu o formulário. */}
            <ul className="mt-3 flex flex-col gap-1 text-[12.5px] text-dim">
              <li>O arquivo continua no bucket, intacto.</li>
              <li>O formulário continua sem dono: nada é vinculado a ninguém.</li>
              <li>Para tratar de verdade, use "Casar com uma admissão".</li>
            </ul>
            <div className="mt-5 flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setResolvendo(null)}
                disabled={salvandoResolver}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  const alvo = resolvendo;
                  setSalvandoResolver(true);
                  void apiFetch("/vt-coleta/orfaos/resolver", {
                    method: "POST",
                    body: { md5: alvo.md5 },
                  })
                    .then(async () => {
                      setResolvendo(null);
                      setFlash("Sinal resolvido. O alerta não vai mais aparecer para este formulário.");
                      await carregar();
                    })
                    .catch((e) =>
                      setErro(e instanceof Error ? e.message : "Não foi possível resolver o sinal."),
                    )
                    .finally(() => setSalvandoResolver(false));
                }}
                disabled={salvandoResolver}
              >
                {salvandoResolver ? "Resolvendo…" : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {casando && (
        <ModalCasar
          orfao={casando}
          onFechar={() => setCasando(null)}
          onCasado={async (mensagem) => {
            setCasando(null);
            setFlash(mensagem);
            await carregar();
          }}
        />
      )}
    </>
  );
}

/**
 * Escolha da admissão e confirmação do casamento.
 *
 * A BUSCA ACEITA NOME, e não só CPF, porque o caso mais comum é justamente o CPF digitado diferente:
 * procurar pelo número que não bate com ninguém não levaria a lugar nenhum.
 *
 * A CONFIRMAÇÃO DIZ O QUE VAI ACONTECER antes de acontecer, inclusive a consequência que o time não
 * teria como adivinhar: se a admissão está concluída, o VT entra sem dar baixa na régua e sem
 * reabrir nada.
 */
function ModalCasar({
  orfao,
  onFechar,
  onCasado,
}: {
  orfao: Orfao;
  onFechar: () => void;
  onCasado: (mensagem: string) => void | Promise<void>;
}) {
  const [termo, setTermo] = useState(orfao.nome ?? "");
  const [achados, setAchados] = useState<AdmissaoBusca[]>([]);
  const [escolhida, setEscolhida] = useState<AdmissaoBusca | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function buscar() {
    setBuscando(true);
    setErro(null);
    try {
      setAchados(
        await apiFetch<AdmissaoBusca[]>(
          `/vt-coleta/orfaos/buscar-admissao?q=${encodeURIComponent(termo)}`,
        ),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Busca falhou.");
    } finally {
      setBuscando(false);
    }
  }

  async function confirmar() {
    if (!escolhida) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch("/vt-coleta/orfaos/casar", {
        method: "POST",
        body: { md5: orfao.md5, admissaoId: escolhida.id },
      });
      await onCasado(
        `Formulário vinculado a ${caixaAlta(escolhida.nome)}. O documento foi arquivado na pasta dela.`,
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível vincular.");
    } finally {
      setSalvando(false);
    }
  }

  const concluida = escolhida?.farolGlobal === "ADMISSAO_CONCLUIDA";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Casar formulário de VT com uma admissão"
      className="fixed inset-0 z-[70] grid place-items-center bg-[rgba(7,17,31,0.55)] p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="text-[17px] font-semibold text-text">Casar Formulário Com Uma Admissão</h2>
        <p className="mt-1 text-[13px] text-dim">
          Formulário de {orfao.nome ? caixaAlta(orfao.nome) : "pessoa não identificada"}, CPF{" "}
          {fmtCpf(orfao.cpf)}, recebido em {fmtQuando(orfao.chegouEm)}.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void buscar()}
            placeholder="Nome ou CPF da pessoa certa"
            aria-label="Buscar admissão"
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[13.5px] text-text"
          />
          <Button variant="secondary" onClick={() => void buscar()} disabled={buscando}>
            {buscando ? "Buscando…" : "Buscar"}
          </Button>
        </div>

        {achados.length > 0 && (
          <ul className="mt-3 max-h-[38vh] space-y-1.5 overflow-y-auto pr-1">
            {achados.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setEscolhida(a)}
                  className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                    escolhida?.id === a.id
                      ? "border-[var(--accent)] bg-[var(--surface-2)]"
                      : "border-[var(--border)] hover:bg-[var(--surface-2)]"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13.5px] font-semibold text-text">
                      {caixaAlta(a.nome)}
                    </span>
                    <span className="text-[12px] tabular-nums text-dim">{fmtCpf(a.cpf)}</span>
                    <span className="ml-auto text-[11.5px] text-faint">{a.farolGlobal}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-dim">
                    {a.cliente ?? "cliente não informado"} · {a.cargo ?? "cargo não informado"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {escolhida && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
            <p className="text-[13px] text-text">
              O formulário passa a ser de <strong>{caixaAlta(escolhida.nome)}</strong>. O PDF vai para
              a pasta dela no Drive e os valores entram na coluna VT da tela de Benefícios.
            </p>
            {concluida && (
              <p className="mt-1.5 text-[12.5px] text-dim">
                A admissão dela está concluída, então o VT entra <strong>sem dar baixa na régua</strong>{" "}
                e <strong>sem reabrir</strong> nenhuma frente. Nada do processo dela se mexe.
              </p>
            )}
          </div>
        )}

        {erro && (
          <p className="mt-3 text-[13px] text-danger" role="alert">
            {erro}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={() => void confirmar()} disabled={!escolhida || salvando}>
            {salvando ? "Vinculando…" : "Confirmar Vínculo"}
          </Button>
        </div>
      </div>
    </div>
  );
}
