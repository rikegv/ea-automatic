"use client";

/**
 * OBRIGATORIEDADE DE PENDÊNCIAS POR CLIENTE (OST da tela de obrigatoriedade).
 *
 * O PROBLEMA que ela resolve: a régua de pendências obrigatórias era GLOBAL. Cliente que não trabalha
 * com Centro de Custo era cobrado por ele e aparecia "parcial" sem nada de errado no processo dele.
 *
 * DUAS FORMAS DE EDITAR, e a de massa é a que torna a tela viável: são 233 clientes, então existe
 * seleção múltipla com busca (nome, código) para aplicar a MESMA alteração a dezenas de uma vez, com
 * confirmação dizendo quantos clientes e o que muda. A edição individual fica para o ajuste fino.
 *
 * PADRÃO: tudo obrigatório. Cliente que o diretor não configurou aparece com todos os interruptores
 * ligados e se comporta exatamente como antes desta tela existir.
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

interface ItemConfig {
  chave: string;
  rotulo: string;
  ajuda: string;
  obrigatorio: boolean;
}
interface LinhaCliente {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  desligados: number;
  itens: ItemConfig[];
}

/** Interruptor tipo chave (decisão do diretor). Acessível: é um botão com `aria-pressed`. */
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

export default function PendenciasClientePage() {
  const { token } = useAuth();
  const [linhas, setLinhas] = useState<LinhaCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  /** Alteração em massa pendente de confirmação: a chave e para onde ela vai. */
  const [confirmar, setConfirmar] = useState<{ chave: string; rotulo: string; obrigatorio: boolean } | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    setErro(null);
    try {
      setLinhas(await apiFetch<LinhaCliente[]>("/admin/pendencias-cliente", { token }));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Busca por nome, operação ou CÓDIGO: os três jeitos de o diretor achar o cliente que quer.
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

  const itensBase = linhas[0]?.itens ?? [];
  const todosFiltradosSelecionados =
    filtradas.length > 0 && filtradas.every((l) => selecionados.has(l.codCliente));

  function alternarSelecao(cod: string) {
    setSelecionados((cur) => {
      const next = new Set(cur);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  function alternarTodosFiltrados() {
    setSelecionados((cur) => {
      const next = new Set(cur);
      if (todosFiltradosSelecionados) filtradas.forEach((l) => next.delete(l.codCliente));
      else filtradas.forEach((l) => next.add(l.codCliente));
      return next;
    });
  }

  /** Edição INDIVIDUAL: um cliente, um item. */
  async function alternarItem(cod: string, item: ItemConfig) {
    if (!token || salvando) return;
    setSalvando(true);
    setAviso(null);
    try {
      const atualizado = await apiFetch<LinhaCliente>(`/admin/pendencias-cliente/${encodeURIComponent(cod)}`, {
        method: "PATCH",
        token,
        body: { itens: [{ chave: item.chave, obrigatorio: !item.obrigatorio }] },
      });
      setLinhas((cur) => cur.map((l) => (l.codCliente === cod ? atualizado : l)));
      setAviso(
        `${item.rotulo} ${item.obrigatorio ? "desligado" : "religado"} para ${atualizado.razaoSocial}.`,
      );
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  /** Aplicação EM MASSA, depois da confirmação. */
  async function aplicarMassa() {
    if (!token || !confirmar) return;
    setSalvando(true);
    try {
      const r = await apiFetch<{ clientesAfetados: number }>("/admin/pendencias-cliente/massa", {
        method: "POST",
        token,
        body: {
          codClientes: [...selecionados],
          itens: [{ chave: confirmar.chave, obrigatorio: confirmar.obrigatorio }],
        },
      });
      setAviso(
        `${confirmar.rotulo} ${confirmar.obrigatorio ? "religado" : "desligado"} para ${r.clientesAfetados} cliente(s).`,
      );
      setConfirmar(null);
      await carregar();
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : "Falha ao aplicar em massa.");
      setConfirmar(null);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Obrigatoriedade Por Cliente"
        subtitle="Liga e desliga cada pendência obrigatória por cliente. Cliente sem configuração cobra tudo, como sempre foi. Só campos de cadastro: a régua de documentos fica na Régua Documental."
      />

      {erro && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-dim">
          {aviso}
        </p>
      )}

      <GlassCard className="mb-4 !p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="ds-input max-w-[320px]"
            placeholder="Buscar por nome, operação ou código…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Button variant="secondary" className="!py-2" onClick={alternarTodosFiltrados}>
            {todosFiltradosSelecionados ? "Desmarcar os filtrados" : `Selecionar os ${filtradas.length} filtrados`}
          </Button>
          <span className="text-[13px] text-dim">
            {selecionados.size} cliente(s) selecionado(s)
          </span>
          {selecionados.size > 0 && (
            <Button variant="secondary" className="!py-2" onClick={() => setSelecionados(new Set())}>
              Limpar seleção
            </Button>
          )}
        </div>

        {/* AÇÃO EM MASSA: só aparece com seleção, e cada item vira dois botões (desligar/religar),
            porque em massa não existe "alternar": os selecionados podem estar em estados diferentes. */}
        {selecionados.size > 0 && (
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <div className="mb-2 text-[12px] uppercase tracking-wide text-faint">
              Aplicar aos {selecionados.size} selecionados
            </div>
            <div className="flex flex-wrap gap-2">
              {itensBase.map((i) => (
                <span key={i.chave} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1">
                  <span className="text-[12.5px] text-text">{i.rotulo}</span>
                  <button
                    type="button"
                    className="rounded px-1.5 text-[11px] text-danger hover:bg-[rgba(214,69,69,0.12)]"
                    onClick={() => setConfirmar({ chave: i.chave, rotulo: i.rotulo, obrigatorio: false })}
                    title={`Desligar ${i.rotulo} para os selecionados`}
                  >
                    desligar
                  </button>
                  <button
                    type="button"
                    className="rounded px-1.5 text-[11px] text-ok hover:bg-[rgba(46,158,99,0.12)]"
                    onClick={() => setConfirmar({ chave: i.chave, rotulo: i.rotulo, obrigatorio: true })}
                    title={`Religar ${i.rotulo} para os selecionados`}
                  >
                    religar
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </GlassCard>

      {carregando ? (
        <p className="py-10 text-center text-sm text-faint">Carregando clientes…</p>
      ) : (
        <div className="space-y-2">
          {filtradas.map((l) => {
            const expandido = aberto === l.codCliente;
            return (
              <GlassCard key={l.codCliente} className="!p-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selecionados.has(l.codCliente)}
                    onChange={() => alternarSelecao(l.codCliente)}
                    aria-label={`Selecionar ${l.razaoSocial}`}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setAberto(expandido ? null : l.codCliente)}
                  >
                    <div className="truncate text-[13.5px] text-text">
                      {l.nomeOperacao || l.razaoSocial}
                    </div>
                    <div className="text-[11.5px] text-faint">
                      {l.codCliente}
                      {l.desligados > 0
                        ? ` · ${l.desligados} item(ns) desligado(s)`
                        : " · tudo obrigatório"}
                    </div>
                  </button>
                  <Icon
                    name="arr"
                    className={cn("h-4 w-4 flex-none text-faint transition", expandido && "rotate-90")}
                  />
                </div>

                {expandido && (
                  <div className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3 sm:grid-cols-2">
                    {l.itens.map((i) => (
                      <div key={i.chave} className="flex items-center gap-3">
                        <Chave
                          ligado={i.obrigatorio}
                          disabled={salvando}
                          rotulo={`${i.rotulo} obrigatório`}
                          onToggle={() => void alternarItem(l.codCliente, i)}
                        />
                        <div className="min-w-0">
                          <div className="text-[13px] text-text">{i.rotulo}</div>
                          <div className="text-[11.5px] text-faint">{i.ajuda}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            );
          })}
          {filtradas.length === 0 && (
            <p className="py-8 text-center text-sm text-faint">Nenhum cliente com essa busca.</p>
          )}
        </div>
      )}

      {/* CONFIRMAÇÃO da massa: diz o que muda e em quantos, antes de aplicar. */}
      {confirmar && (
        <Modal onClose={() => setConfirmar(null)} className="max-w-md" ariaLabel="Confirmar Aplicação Em Massa">
          <div className="text-[15px] font-semibold text-text">
            {confirmar.obrigatorio ? "Religar" : "Desligar"} {confirmar.rotulo}?
          </div>
          <p className="mt-2 text-[13.5px] text-dim">
            A alteração vale para <strong>{selecionados.size} cliente(s)</strong> selecionado(s).
            {confirmar.obrigatorio
              ? " Eles voltam a cobrar este item nas admissões."
              : " Eles deixam de cobrar este item, e as admissões que estavam pendentes só por ele passam a contar como completas."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmar(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void aplicarMassa()} disabled={salvando}>
              {salvando ? "Aplicando…" : "Aplicar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
