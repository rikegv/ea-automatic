"use client";

/**
 * INTEGRAÇÃO OBRIGATÓRIA POR CLIENTE (onda 5 da frente Integração).
 *
 * A REGRA (decisão do diretor): todo cliente NASCE exigindo integração, e a equipe DESMARCA quem não
 * exige. Cliente desmarcado nem avança para a frente: a admissão fecha no Cadastro e vai para o
 * Gerenciador, sem passar pela aba de Integração.
 *
 * SELEÇÃO MÚLTIPLA com busca, pelo mesmo motivo da tela de obrigatoriedade de campos: são mais de
 * 200 clientes ativos, e desmarcar um a um seria inviável. A confirmação diz quantos e o quê.
 *
 * PADRÃO: cliente que ninguém configurou aparece LIGADO e se comporta como antes desta tela existir.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface LinhaCliente {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  exigeIntegracao: boolean;
}

/** Interruptor tipo chave, o mesmo padrão da tela de obrigatoriedade por cliente. */
function Chave({
  ligado,
  onToggle,
  rotulo,
  disabled,
}: {
  ligado: boolean;
  onToggle: () => void;
  rotulo: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-[22px] w-[40px] flex-none rounded-full border transition",
        ligado
          ? "border-[var(--ok)] bg-[rgba(46,158,99,0.35)]"
          : "border-[var(--border)] bg-[var(--surface-2)]",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[16px] w-[16px] rounded-full bg-white transition-all",
          ligado ? "left-[21px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

export default function IntegracaoClientesPage() {
  const { token } = useAuth();
  const [linhas, setLinhas] = useState<LinhaCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  /** Alteração em massa pendente de confirmação. */
  const [confirmar, setConfirmar] = useState<{ exige: boolean } | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await apiFetch<LinhaCliente[]>("/admin/integracao-clientes", { token }));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        l.razaoSocial.toLowerCase().includes(q) ||
        (l.nomeOperacao ?? "").toLowerCase().includes(q) ||
        l.codCliente.toLowerCase().includes(q),
    );
  }, [linhas, busca]);

  // Ordenação clicável (§A.12). "Exige integração" é RANK (quem exige primeiro), não texto: é a
  // pergunta da tela, e ordenar "sim/não" alfabeticamente responderia ao contrário.
  const colunas = useMemo<ColOrd<LinhaCliente>[]>(
    () => [
      { chave: "codCliente", tipo: "texto", valor: (l) => l.codCliente },
      { chave: "razaoSocial", tipo: "texto", valor: (l) => l.razaoSocial },
      { chave: "nomeOperacao", tipo: "texto", valor: (l) => l.nomeOperacao },
      { chave: "exige", tipo: "status", valor: (l) => (l.exigeIntegracao ? 0 : 1) },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, filtradas);

  const semIntegracao = useMemo(() => linhas.filter((l) => !l.exigeIntegracao).length, [linhas]);

  async function aplicar(codClientes: string[], exige: boolean) {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      await apiFetch("/admin/integracao-clientes", {
        token,
        method: "POST",
        body: { codClientes, exige },
      });
      setAviso(
        `${codClientes.length} cliente${codClientes.length > 1 ? "s" : ""} ${
          exige ? "voltaram a exigir" : "deixaram de exigir"
        } integração.`,
      );
      setSelecionados(new Set());
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
      setConfirmar(null);
    }
  }

  function toggleSel(cod: string) {
    setSelecionados((cur) => {
      const next = new Set(cur);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        title="Integração Por Cliente"
        subtitle="Quem exige integração na esteira. Todos exigem por padrão; desmarque quem não exige."
      />

      <GlassCard className="mb-3 flex flex-wrap items-center gap-3 px-4 py-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, operação ou código"
          className="ds-input min-w-[280px] flex-1"
          aria-label="Buscar cliente"
        />
        <span className="text-sm text-faint">
          {linhas.length} clientes ativos, {semIntegracao} sem integração
        </span>
        {selecionados.size > 0 && (
          <>
            <Button onClick={() => setConfirmar({ exige: false })} disabled={salvando}>
              Não exigir ({selecionados.size})
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmar({ exige: true })}
              disabled={salvando}
            >
              Exigir ({selecionados.size})
            </Button>
            <button
              type="button"
              className="text-[13px] text-dim underline-offset-2 hover:underline"
              onClick={() => setSelecionados(new Set())}
            >
              Limpar seleção
            </button>
          </>
        )}
      </GlassCard>

      {aviso && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(91,214,138,0.12)] px-3 py-2 text-sm text-ok">
          <Icon name="check" className="h-4 w-4" /> {aviso}
        </p>
      )}
      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <GlassCard className="list flex min-h-0 flex-1 flex-col">
        <div className="ea-scroll min-h-0 flex-1 overflow-auto">
          <div className="min-w-[720px]">
            <div
              className="list-head"
              style={{ gridTemplateColumns: "40px 120px minmax(240px,1.4fr) minmax(180px,1fr) 150px" }}
            >
              <span />
              <ColunaOrdenavel ord={ord} chave="codCliente">
                Código
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="razaoSocial">
                Razão Social
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="nomeOperacao">
                Operação
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="exige">
                Exige Integração
              </ColunaOrdenavel>
            </div>

            {carregando ? (
              <div className="px-4 py-10 text-center text-sm text-faint">Carregando clientes…</div>
            ) : filtradas.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-faint">
                Nenhum cliente com esse filtro.
              </div>
            ) : (
              ord.itens.map((l) => (
                <div
                  key={l.codCliente}
                  className="row"
                  style={{
                    gridTemplateColumns: "40px 120px minmax(240px,1.4fr) minmax(180px,1fr) 150px",
                  }}
                >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                      aria-label={`Selecionar ${l.razaoSocial}`}
                      checked={selecionados.has(l.codCliente)}
                      onChange={() => toggleSel(l.codCliente)}
                    />
                  </div>
                  <div className="meta text-center tabular-nums">{l.codCliente}</div>
                  <div className="min-w-0 text-left">
                    <div className="nm truncate" title={l.razaoSocial}>
                      {l.razaoSocial}
                    </div>
                  </div>
                  <div className="meta truncate text-center" title={l.nomeOperacao ?? undefined}>
                    {l.nomeOperacao ?? <span className="text-faint/60">—</span>}
                  </div>
                  <div className="flex items-center justify-center">
                    <Chave
                      ligado={l.exigeIntegracao}
                      disabled={salvando}
                      rotulo={`Integração obrigatória para ${l.razaoSocial}`}
                      onToggle={() => void aplicar([l.codCliente], !l.exigeIntegracao)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </GlassCard>

      {confirmar && (
        <Modal onClose={() => setConfirmar(null)} ariaLabel="Confirmar alteração" className="max-w-md">
          <div className="px-5 py-5">
            <h2 className="text-base font-semibold text-text">Confirmar Alteração</h2>
            <p className="mt-2 text-sm text-text">
              {selecionados.size} cliente{selecionados.size > 1 ? "s" : ""}{" "}
              {confirmar.exige ? "voltarão a exigir" : "deixarão de exigir"} integração.
            </p>
            <p className="mt-2 text-xs text-faint">
              {confirmar.exige
                ? "As próximas admissões deles passarão a criar a frente de Integração ao concluir o Cadastro."
                : "As próximas admissões deles fecharão no Cadastro, sem passar pela Integração. As que já estão na frente não são afetadas."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirmar(null)} disabled={salvando}>
                Cancelar
              </Button>
              <Button
                onClick={() => void aplicar([...selecionados], confirmar.exige)}
                disabled={salvando}
              >
                {salvando ? "Aplicando…" : "Confirmar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
