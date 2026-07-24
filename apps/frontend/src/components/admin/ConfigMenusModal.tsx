"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Papel } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Configuração de MENUS de um usuário (OST permissão de menu, Bloco 4). Lista os menus do catálogo
 * (lidos da tabela `menus` pelo backend) com marcação, e salva a associação. A tela é restrita a
 * MASTER/SUPER_ADMIN (a própria rota de Usuários é @Roles admin no backend).
 *
 * Deixa CLARO na tela que MASTER e SUPER_ADMIN NÃO dependem de marcação (o backend os libera por
 * bypass), então marcar aqui um usuário admin não muda nada para ele.
 */
interface MenuCat {
  codigo: string;
  rotulo: string;
  href: string;
  grupo: string;
  ordem: number;
}

export function ConfigMenusModal({
  usuario,
  token,
  onClose,
}: {
  usuario: { id: string; nome: string; papel: Papel };
  token?: string;
  onClose: (mudou: boolean) => void;
}) {
  const [catalogo, setCatalogo] = useState<MenuCat[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ehAdmin = usuario.papel === "MASTER" || usuario.papel === "SUPER_ADMIN";

  useEffect(() => {
    let vivo = true;
    Promise.all([
      apiFetch<MenuCat[]>("/admin/usuarios/menus/catalogo", { token }),
      apiFetch<{ codigos: string[] }>(`/admin/usuarios/${usuario.id}/menus`, { token }),
    ])
      .then(([cat, atual]) => {
        if (!vivo) return;
        setCatalogo([...cat].sort((a, b) => a.ordem - b.ordem));
        setSel(new Set(atual.codigos));
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : "Falha ao carregar os menus.");
      });
    return () => {
      vivo = false;
    };
  }, [usuario.id, token]);

  const grupos = useMemo(() => {
    const g: Record<string, MenuCat[]> = {};
    for (const m of catalogo ?? []) (g[m.grupo] ??= []).push(m);
    return g;
  }, [catalogo]);

  function alterna(codigo: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(codigo)) n.delete(codigo);
      else n.add(codigo);
      return n;
    });
  }

  const salvar = useCallback(async () => {
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch(`/admin/usuarios/${usuario.id}/menus`, {
        method: "PUT",
        token,
        body: { menus: [...sel] },
      });
      onClose(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar os menus.");
    } finally {
      setSalvando(false);
    }
  }, [usuario.id, token, sel, onClose]);

  const rotuloGrupo: Record<string, string> = { OPERACAO: "Operação", ADMIN: "Administração" };

  return (
    <Modal onClose={() => onClose(false)} className="max-w-lg" ariaLabel="Configurar menus do usuário">
      <div className="mb-4">
        <div className="eyebrow !mb-1">Permissão de menu</div>
        <h2 className="text-lg font-semibold text-text">Menus de {usuario.nome}</h2>
        <p className="mt-1 text-[12.5px] text-dim">
          Marque os menus que este usuário acessa. Ao entrar, a barra lateral mostra só os marcados, e
          o sistema barra as telas não liberadas.
        </p>
      </div>

      {ehAdmin && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-dim">
          <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
          Este usuário é {usuario.papel === "MASTER" ? "Master" : "Super Admin"} e enxerga TODOS os
          menus sempre, independentemente desta marcação. A configuração por menu vale para o perfil
          Comum.
        </p>
      )}

      {erro && (
        <p className="mb-3 rounded-lg border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger" role="alert">
          {erro}
        </p>
      )}

      {!catalogo ? (
        <p className="py-6 text-center text-sm text-faint">Carregando menus…</p>
      ) : (
        <div className="max-h-[46vh] space-y-4 overflow-y-auto pr-1">
          {Object.keys(grupos).map((grupo) => (
            <div key={grupo}>
              <div className="nav-label !mb-1.5">{rotuloGrupo[grupo] ?? grupo}</div>
              <div className="space-y-1">
                {grupos[grupo].map((m) => (
                  <label
                    key={m.codigo}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13.5px] text-text transition hover:bg-[var(--surface-2)]"
                  >
                    <input
                      type="checkbox"
                      checked={sel.has(m.codigo)}
                      onChange={() => alterna(m.codigo)}
                      className="h-4 w-4 flex-none accent-[var(--accent)]"
                    />
                    <span className="font-semibold">{m.rotulo}</span>
                    <span className="ml-auto text-[11.5px] text-faint">{m.href}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-faint">{sel.size} menu(s) marcado(s)</span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => onClose(false)} disabled={salvando} className="py-2">
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando || !catalogo} className="py-2">
            {salvando ? "Salvando…" : "Salvar menus"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
