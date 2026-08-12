"use client";

/**
 * STATUS DA SALA DE ESPERA (Gerencial).
 *
 * A lista é EDITÁVEL pelo diretor, e é por isso que existe a marca "encerra a fila": o sistema não
 * pode deduzir pelo nome que "Declinou" encerra e "Aguardando retorno" não. Status marcado como
 * terminal tira o registro da fila ativa da Sala.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface StatusRow {
  id: string;
  nome: string;
  encerra: boolean;
  ativo: boolean;
  ordem: number;
}

const COLS = "minmax(240px,1.6fr) 150px 120px 110px";

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

export default function SalaEsperaStatusPage() {
  const { token } = useAuth();
  const [linhas, setLinhas] = useState<StatusRow[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [novo, setNovo] = useState("");
  const [novoEncerra, setNovoEncerra] = useState(false);

  // Ordenação clicável (§A.12). Encerra e Ativo são RANK (o que encerra e o que está ativo primeiro),
  // não texto: ordenar "sim/não" alfabeticamente colocaria "Não" na frente e diria o contrário do
  // que a coluna significa. A tela carrega a lista inteira, então ordenar aqui é honesto.
  const colunas = useMemo<ColOrd<StatusRow>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (l) => l.nome },
      { chave: "encerra", tipo: "status", valor: (l) => (l.encerra ? 0 : 1) },
      { chave: "ativo", tipo: "status", valor: (l) => (l.ativo ? 0 : 1) },
      { chave: "ordem", tipo: "numero", valor: (l) => l.ordem },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, linhas);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      setLinhas(await apiFetch<StatusRow[]>("/sala-espera/status", { token }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os status.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar() {
    if (!novo.trim()) return;
    setSalvando(true);
    try {
      await apiFetch("/sala-espera/status", {
        token,
        method: "POST",
        body: { nome: novo.trim(), encerra: novoEncerra, ordem: linhas.length },
      });
      setNovo("");
      setNovoEncerra(false);
      setErro(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao criar o status.");
    } finally {
      setSalvando(false);
    }
  }

  async function alterar(id: string, campos: Partial<StatusRow>) {
    setSalvando(true);
    try {
      await apiFetch(`/sala-espera/status/${id}`, { token, method: "PATCH", body: campos });
      setErro(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        title="Status Da Sala De Espera"
        subtitle="A lista que a Sala de Espera usa. Status marcado como terminal tira o registro da fila ativa."
      />

      <GlassCard className="mb-3 flex flex-wrap items-end gap-3 px-4 py-3">
        <label className="min-w-[260px] flex-1">
          <span className="mb-1 block text-xs font-medium text-faint">Novo status</span>
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Nome do status"
            className="ds-input w-full"
            aria-label="Nome do novo status"
          />
        </label>
        <label className="flex items-center gap-2 pb-1">
          <Chave
            ligado={novoEncerra}
            onToggle={() => setNovoEncerra((v) => !v)}
            rotulo="O novo status encerra a fila"
          />
          <span className="text-sm text-text">Encerra a fila</span>
        </label>
        <Button onClick={() => void criar()} disabled={salvando || !novo.trim()}>
          <Icon name="plus" className="h-4 w-4" />
          Adicionar
        </Button>
      </GlassCard>

      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <GlassCard className="list flex min-h-0 flex-1 flex-col">
        <div className="ea-scroll min-h-0 flex-1 overflow-auto">
          <div className="min-w-[640px]">
            <div className="list-head" style={{ gridTemplateColumns: COLS }}>
              <ColunaOrdenavel ord={ord} chave="nome">
                Status
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="encerra">
                Encerra A Fila
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="ativo">
                Ativo
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="ordem">
                Ordem
              </ColunaOrdenavel>
            </div>
            {carregando ? (
              <div className="px-4 py-10 text-center text-sm text-faint">Carregando…</div>
            ) : linhas.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-faint">
                Nenhum status cadastrado.
              </div>
            ) : (
              ord.itens.map((l) => (
                <div key={l.id} className="row" style={{ gridTemplateColumns: COLS }}>
                  <div className="min-w-0 text-left">
                    <input
                      defaultValue={l.nome}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== l.nome) void alterar(l.id, { nome: v });
                      }}
                      className="ds-input w-full"
                      aria-label={`Nome do status ${l.nome}`}
                    />
                  </div>
                  <div className="flex items-center justify-center">
                    <Chave
                      ligado={l.encerra}
                      disabled={salvando}
                      rotulo={`${l.nome} encerra a fila`}
                      onToggle={() => void alterar(l.id, { encerra: !l.encerra })}
                    />
                  </div>
                  <div className="flex items-center justify-center">
                    <Chave
                      ligado={l.ativo}
                      disabled={salvando}
                      rotulo={`${l.nome} ativo`}
                      onToggle={() => void alterar(l.id, { ativo: !l.ativo })}
                    />
                  </div>
                  <div className="meta text-center tabular-nums">{l.ordem}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
