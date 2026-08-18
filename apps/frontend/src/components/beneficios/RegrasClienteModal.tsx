"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/** Um grupo do modal. `texto: null` = grupo sem regra cadastrada. */
interface Regra {
  beneficio: string;
  rotulo: string;
  texto: string | null;
  atualizadoEm: string | null;
}
interface RegrasCliente {
  codCliente: string;
  razaoSocial: string;
  regras: Regra[];
}

/**
 * PRINCIPAIS INFORMAÇÕES: as REGRAS de benefício do CLIENTE, agrupadas por benefício.
 *
 * É REGRA DO CLIENTE, e não da pessoa. O modal abre pelo `codCliente` da linha, então as 40 pessoas
 * de um mesmo cliente mostram exatamente a mesma coisa, e escrever a regra uma vez serve a todas.
 * É por isso que o aviso antes de salvar existe: sem ele, alguém edita achando que ajusta uma pessoa.
 *
 * A LEITURA vem sempre com os seis grupos, inclusive os vazios, e o vazio aparece como "não
 * informado" (a mesma régua das demais telas). O backend é quem devolve a lista completa: a tela não
 * reconstrói grupo nenhum por conta própria.
 */
export function RegrasClienteModal({
  codCliente,
  clienteRotulo,
  onClose,
}: {
  codCliente: string;
  /** Rótulo já formatado pela lista ("57269 · CIA DAS LETRAS"), para o título não divergir da tabela. */
  clienteRotulo: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [dados, setDados] = useState<RegrasCliente | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Edição: fechada por padrão. O modal nasce como consulta, e editar é um passo deliberado.
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const carregar = useCallback(() => {
    let vivo = true;
    apiFetch<RegrasCliente>(`/beneficios-regras/${encodeURIComponent(codCliente)}`, { token })
      .then((r) => vivo && setDados(r))
      .catch((e) => {
        if (!vivo) return;
        setErro(
          e instanceof ApiError && e.status === 403
            ? "Seu usuário não tem permissão para ver as regras de benefício."
            : "Não foi possível carregar as regras deste cliente.",
        );
      });
    return () => {
      vivo = false;
    };
  }, [codCliente, token]);

  useEffect(() => carregar(), [carregar]);

  /** Abre a edição já com o que está gravado, para o time corrigir e não redigitar. */
  function abrirEdicao() {
    setRascunho(Object.fromEntries((dados?.regras ?? []).map((r) => [r.beneficio, r.texto ?? ""])));
    setFlash(null);
    setEditando(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await apiFetch<RegrasCliente>(
        `/beneficios-regras/${encodeURIComponent(codCliente)}`,
        {
          method: "PUT",
          token,
          // A lista COMPLETA, inclusive os vazios: campo esvaziado APAGA a regra daquele grupo.
          body: {
            regras: (dados?.regras ?? []).map((r) => ({
              beneficio: r.beneficio,
              texto: rascunho[r.beneficio] ?? "",
            })),
          },
        },
      );
      setDados(atualizado);
      setConfirmando(false);
      setEditando(false);
      setFlash("Regras salvas para todas as pessoas deste cliente.");
    } catch (e) {
      setConfirmando(false);
      setErro(
        e instanceof ApiError && e.status === 403
          ? "Seu usuário não tem permissão para editar as regras de benefício."
          : "Não foi possível salvar as regras. Tente de novo.",
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Principais informações do cliente">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Principais Informações</div>
          <h3 className="truncate text-[18px] font-extrabold">{clienteRotulo}</h3>
          <p className="psub !mb-0 mt-1">
            Regras de benefício deste cliente, iguais para todas as pessoas dele.
          </p>
        </div>
        <button
          type="button"
          className="grid h-9 w-9 flex-none place-items-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
          onClick={onClose}
          aria-label="Fechar"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>

      {erro && (
        <p
          className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}
      {flash && (
        <p className="mb-4 inline-flex items-center gap-1.5 text-[12.5px] text-ok">
          <Icon name="check" className="h-3.5 w-3.5" /> {flash}
        </p>
      )}

      {!dados ? (
        !erro && <p className="py-8 text-center text-sm text-faint">Carregando regras…</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {dados.regras.map((r) => (
              <div
                key={r.beneficio}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
              >
                <div className="text-[11px] uppercase tracking-wide text-faint">{r.rotulo}</div>
                {editando ? (
                  <textarea
                    value={rascunho[r.beneficio] ?? ""}
                    onChange={(e) =>
                      setRascunho((atual) => ({ ...atual, [r.beneficio]: e.target.value }))
                    }
                    rows={2}
                    maxLength={2000}
                    placeholder="Sem regra cadastrada. Deixe vazio para não ter regra."
                    aria-label={`Regra de ${r.rotulo}`}
                    className="ds-input mt-1.5 w-full resize-y"
                  />
                ) : r.texto ? (
                  /* `whitespace-pre-wrap`: o time escreve em linhas, e a leitura preserva o que ele
                     digitou em vez de colar tudo num parágrafo só. */
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] text-text">{r.texto}</p>
                ) : (
                  <p className="mt-1 text-[13.5px] text-faint">não informado</p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {editando ? (
              <>
                <Button variant="secondary" onClick={() => setEditando(false)} disabled={salvando}>
                  Cancelar
                </Button>
                <Button onClick={() => setConfirmando(true)} disabled={salvando}>
                  Salvar regras
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={abrirEdicao}>
                Editar regras
              </Button>
            )}
          </div>
        </>
      )}

      {/* AVISO OBRIGATÓRIO ANTES DE SALVAR (decisão do diretor). Não é um confirm genérico: diz o
          NOME do cliente e que a mudança vale para TODAS as pessoas dele, na hora. É o único ponto
          da tela em que uma edição alcança mais de uma linha, e ninguém pode descobrir isso depois.
          Modal próprio, e não o ConfirmDialog compartilhado, porque este precisa citar o cliente. */}
      {confirmando && (
        <Modal
          onClose={() => !salvando && setConfirmando(false)}
          className="max-w-[520px] p-6"
          ariaLabel="Confirmar as regras do cliente"
        >
          <div className="mb-4">
            <div className="eyebrow !mb-1">Confirmar Alteração</div>
            <h2 className="font-display text-xl font-bold">Vale Para Todo O Cliente</h2>
          </div>
          <p className="text-[13.5px] text-text">
            Estas regras são do cliente <span className="font-semibold">{clienteRotulo}</span>, e não
            de uma pessoa. Ao salvar, elas passam a valer imediatamente para{" "}
            <span className="font-semibold">todas as pessoas deste cliente</span> na fila de
            benefícios, inclusive as que já estão cadastradas.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setConfirmando(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Entendi, salvar para todos"}
            </Button>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
