"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AREA, AREA_LABEL, type Area, type Papel } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Configuração de MENUS de um usuário (OST permissão de menu, Bloco 4). Lista os menus do catálogo
 * (lidos da tabela `menus` pelo backend) com marcação, e salva a associação. A tela é restrita a
 * MASTER/SUPER_ADMIN (a própria rota de Usuários é @Roles admin no backend).
 *
 * A ÁREA VEM NO TOPO (segmentação do módulo de A&S) porque é ela que GOVERNA a lista abaixo: menu
 * fora da área do usuário não é acessível nem que esteja marcado. Pôr a área depois da lista faria a
 * pessoa marcar primeiro e descobrir a regra depois.
 */
interface MenuCat {
  codigo: string;
  rotulo: string;
  href: string;
  grupo: string;
  ordem: number;
  /** Áreas que enxergam este menu. Vem do registro em código, via backend. */
  areas?: Area[];
}

/**
 * Menus que NÃO podem ser marcados para um COMUM: Diagnóstico e Usuários têm a controller @Roles
 * admin-only no backend, então marcar aqui só faria o menu aparecer e a tela barrar os dados. O
 * backend também filtra ao salvar (defesa em profundidade); aqui a caixa nasce desabilitada.
 */
const BLOQUEADOS_COMUM = new Set<string>(["diagnostico", "usuarios"]);

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
  const [areas, setAreas] = useState<Set<Area>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const ehAdmin = usuario.papel === "MASTER" || usuario.papel === "SUPER_ADMIN";
  // O SUPER_ADMIN está ACIMA da segmentação: a área não o limita, e a tela diz isso em vez de fingir
  // que a marcação vale para ele.
  const ehSuperAdmin = usuario.papel === "SUPER_ADMIN";

  useEffect(() => {
    let vivo = true;
    Promise.all([
      apiFetch<MenuCat[]>("/admin/usuarios/menus/catalogo", { token }),
      apiFetch<{ codigos: string[]; areas: Area[] }>(`/admin/usuarios/${usuario.id}/menus`, {
        token,
      }),
    ])
      .then(([cat, atual]) => {
        if (!vivo) return;
        setCatalogo([...cat].sort((a, b) => a.ordem - b.ordem));
        setSel(new Set(atual.codigos));
        setAreas(new Set(atual.areas ?? []));
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

  function alternaArea(area: Area) {
    setAreas((s) => {
      const n = new Set(s);
      if (n.has(area)) n.delete(area);
      else n.add(area);
      return n;
    });
  }

  /**
   * O menu está na área do usuário? Menu sem `areas` declarado é da Admissão (o default do registro).
   * O SUPER_ADMIN nunca é limitado por área.
   */
  function naArea(m: MenuCat): boolean {
    if (ehSuperAdmin) return true;
    const doMenu = m.areas ?? ["ADM"];
    return doMenu.some((a) => areas.has(a));
  }

  const salvar = useCallback(async () => {
    setSalvando(true);
    setErro(null);
    try {
      // `conhecidos` é o catálogo que ESTA tela exibiu. O backend só remove dentro desse escopo, então
      // um menu que nasceu depois de a página carregar é preservado em vez de sumir no salvamento.
      await apiFetch(`/admin/usuarios/${usuario.id}/menus`, {
        method: "PUT",
        token,
        // ÁREAS VÃO NO MESMO ENVIO da marcação, porque é a área que recorta os menus: em duas
        // requisições, a marcação seria avaliada contra a área antiga e o resultado dependeria da
        // ordem de chegada.
        body: {
          menus: [...sel],
          conhecidos: (catalogo ?? []).map((m) => m.codigo),
          areas: [...areas],
        },
      });
      onClose(true);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar os menus.");
    } finally {
      setSalvando(false);
    }
  }, [usuario.id, token, sel, areas, catalogo, onClose]);

  // SELECAO entra com o grupo novo do módulo de A&S: sem o rótulo, a tela do diretor mostraria o
  // código cru "SELECAO" como cabeçalho da seção.
  const rotuloGrupo: Record<string, string> = {
    OPERACAO: "Operação",
    ADMIN: "Administração",
    SELECAO: "Atração e Seleção",
  };

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

      {/* ÁREA NO TOPO: governa a lista de menus abaixo, então vem antes dela. */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <div className="nav-label !mb-1.5">Área De Atuação</div>
        <div className="flex flex-wrap gap-2">
          {AREA.map((a) => (
            <label
              key={a}
              className={
                "flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] transition " +
                (areas.has(a)
                  ? "bg-[var(--surface-2)] text-text"
                  : "text-dim hover:bg-[var(--surface-2)]")
              }
            >
              <input
                type="checkbox"
                checked={areas.has(a)}
                onChange={() => alternaArea(a)}
                className="h-4 w-4 flex-none accent-[var(--accent)]"
              />
              {AREA_LABEL[a]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-faint">
          {ehSuperAdmin
            ? "Super Admin enxerga todas as áreas, independentemente desta marcação."
            : areas.size === 0
              ? "Sem área, este usuário enxerga apenas o Início. Marque ao menos uma área."
              : "A área limita o que este usuário alcança. Menu de outra área não fica acessível nem marcado."}
        </p>
      </div>

      {ehAdmin && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-dim">
          <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
          {/* O TEXTO MUDOU com a segmentação de área. Ele dizia que Master enxerga TODOS os menus
              sempre, e isso virou mentira: o Master passou a enxergar todos os menus DA ÁREA dele. */}
          {ehSuperAdmin
            ? "Este usuário é Super Admin e enxerga TODOS os menus, de todas as áreas, independentemente desta marcação."
            : "Este usuário é Master e enxerga TODOS os menus DA ÁREA dele, independentemente desta marcação. Fora da área, não alcança nada. A configuração por menu vale para o perfil Comum."}
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
                {grupos[grupo].map((m) => {
                  // DESABILITA, NÃO ESCONDE, pelo mesmo motivo dos menus restritos à administração:
                  // sumir sem explicação vira chamado, e a pessoa não entende por que o menu que ela
                  // procura não está na lista. Aqui o motivo aparece no `title` e no rótulo lateral.
                  const foraDaArea = !naArea(m);
                  const bloqueado = foraDaArea || (!ehAdmin && BLOQUEADOS_COMUM.has(m.codigo));
                  return (
                    <label
                      key={m.codigo}
                      className={
                        "flex items-center gap-2.5 rounded-lg border border-[var(--border)] px-3 py-2 text-[13.5px] transition " +
                        (bloqueado
                          ? "cursor-not-allowed text-faint opacity-60"
                          : "cursor-pointer text-text hover:bg-[var(--surface-2)]")
                      }
                      title={
                        foraDaArea
                          ? "Este menu é de outra área. Marque a área correspondente acima para liberá-lo."
                          : bloqueado
                            ? "Restrito à administração: não pode ser liberado para o perfil Comum."
                            : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={sel.has(m.codigo) && !bloqueado}
                        onChange={() => alterna(m.codigo)}
                        disabled={bloqueado}
                        className="h-4 w-4 flex-none accent-[var(--accent)]"
                      />
                      <span className="font-semibold">{m.rotulo}</span>
                      <span className="ml-auto text-[11.5px] text-faint">
                        {foraDaArea
                          ? "outra área"
                          : bloqueado
                            ? "somente administração"
                            : m.href}
                      </span>
                    </label>
                  );
                })}
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
