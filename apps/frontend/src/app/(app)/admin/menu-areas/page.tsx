"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AREA, AREA_LABEL, type Area } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

/**
 * ÁREA POR MENU (Administração, exclusiva do SUPER_ADMIN).
 *
 * O QUE ESTA TELA DECIDE: quais áreas enxergam cada menu do sistema. É a FONTE da autorização por
 * área; antes ela vivia em código e mudar exigia a fábrica e uma subida de versão. O caso real que a
 * originou é o dashboard de Alto Volume, que interessa à Admissão e à Atração e Seleção ao mesmo
 * tempo.
 *
 * POR QUE ELA É SÓ DO SUPER_ADMIN, e isso é mais forte que a régua de sempre: quem a alcança
 * redefine o que cada time enxerga no sistema inteiro, sem tocar em usuário nenhum. Um Master aqui
 * poderia marcar toda a Admissão como sendo também de A&S e desfazer a segmentação.
 *
 * A PRÉVIA DE IMPACTO É OBRIGATÓRIA no fluxo (decisão do diretor): mudar área TIRA acesso, e tirar
 * acesso não pode ser feito às cegas. O botão de salvar só aparece depois de a tela dizer quem perde.
 */
interface MenuArea {
  codigo: string;
  rotulo: string;
  href: string;
  grupo: string;
  ordem: number;
  areas: Area[];
  /** O Início: não pode ser restrito, senão uma área inteira fica sem item na barra. */
  protegido: boolean;
}

interface Impacto {
  perdem: { id: string; nome: string; papel: string }[];
  ganham: number;
}

const ROTULO_GRUPO: Record<string, string> = {
  OPERACAO: "Operação",
  ADMIN: "Administração",
};

export default function MenuAreasPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<MenuArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  /** Menu em edição, a marcação que o diretor montou e o impacto calculado pelo backend. */
  const [alvo, setAlvo] = useState<MenuArea | null>(null);
  const [marcadas, setMarcadas] = useState<Set<Area>>(new Set());
  const [impacto, setImpacto] = useState<Impacto | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows(await apiFetch<MenuArea[]>("/admin/menu-areas", { token }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao carregar os menus.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const grupos = useMemo(() => {
    const g: Record<string, MenuArea[]> = {};
    for (const m of rows) (g[m.grupo] ??= []).push(m);
    return g;
  }, [rows]);

  function abrir(m: MenuArea) {
    setAlvo(m);
    setMarcadas(new Set(m.areas));
    setImpacto(null);
    setErro(null);
  }

  function alterna(a: Area) {
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });
    // Qualquer mudança invalida a prévia: salvar com um impacto calculado para outra marcação seria
    // exatamente o "às cegas" que esta tela existe para impedir.
    setImpacto(null);
  }

  /** Pede ao backend quem deixa de ver o menu com a marcação atual. NÃO escreve nada. */
  const calcular = useCallback(async () => {
    if (!alvo) return;
    setCalculando(true);
    setErro(null);
    try {
      setImpacto(
        await apiFetch<Impacto>(`/admin/menu-areas/${alvo.codigo}/impacto`, {
          method: "POST",
          token,
          body: { areas: [...marcadas] },
        }),
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao calcular o impacto.");
    } finally {
      setCalculando(false);
    }
  }, [alvo, marcadas, token]);

  const salvar = useCallback(async () => {
    if (!alvo) return;
    setSalvando(true);
    setErro(null);
    try {
      await apiFetch(`/admin/menu-areas/${alvo.codigo}`, {
        method: "PUT",
        token,
        body: { areas: [...marcadas] },
      });
      setAviso(`Áreas de "${alvo.rotulo}" atualizadas. A mudança já está valendo.`);
      setAlvo(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Erro ao salvar as áreas.");
    } finally {
      setSalvando(false);
    }
  }, [alvo, marcadas, token, carregar]);

  const mudou = alvo ? [...marcadas].sort().join(",") !== [...alvo.areas].sort().join(",") : false;
  const vazio = marcadas.size === 0;
  // O Início atende todas as áreas e não pode ser restrito (o backend recusa; a tela explica antes).
  const violaProtegido = !!alvo?.protegido && marcadas.size < AREA.length;

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Área Por Menu"
        subtitle="Defina quais áreas enxergam cada menu. A mudança vale na hora, para todo mundo."
      />

      {aviso && (
        <p className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(46,160,67,0.10)] px-3 py-2 text-[13px] text-ok">
          <Icon name="check" className="mt-0.5 h-4 w-4 flex-none" />
          {aviso}
        </p>
      )}
      {erro && !alvo && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <table className="ds-table">
          <thead>
            <tr>
              {/* §A.20: larguras somam 100% e aproveitam a linha inteira, sem sobra à direita nem
                  coluna espremida. A de ação é a menor possível para caber o botão. */}
              <th className="w-[30%]">Menu</th>
              <th className="w-[26%]">Rota</th>
              <th className="w-[15%]">Grupo</th>
              <th className="w-[23%]">Áreas</th>
              <th className="w-[6%]" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-faint">
                  Carregando menus…
                </td>
              </tr>
            ) : (
              rows.map((m) => (
                <tr key={m.codigo}>
                  <td className="align-top">
                    <span className="text-text">{m.rotulo}</span>
                    {m.protegido && (
                      <span className="ml-2 text-[11.5px] text-faint">sempre visível</span>
                    )}
                  </td>
                  <td className="align-top text-[13px] text-dim">{m.href}</td>
                  <td className="align-top text-[13px] text-dim">
                    {ROTULO_GRUPO[m.grupo] ?? m.grupo}
                  </td>
                  <td className="align-top">
                    <div className="flex flex-wrap gap-1">
                      {m.areas.length === AREA.length ? (
                        <Pill tone="ok">Todas As Áreas</Pill>
                      ) : (
                        m.areas.map((a) => (
                          <Pill key={a} tone="nt">
                            {AREA_LABEL[a]}
                          </Pill>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="align-top text-right">
                    <button
                      type="button"
                      onClick={() => abrir(m)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                      title="Alterar áreas deste menu"
                      aria-label={`Alterar áreas de ${m.rotulo}`}
                    >
                      <Icon name="pen" className="h-[17px] w-[17px]" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>

      {/* Contagem por grupo, só para o diretor conferir o tamanho do catálogo de relance. */}
      {!loading && (
        <p className="mt-3 text-[12.5px] text-faint">
          {Object.entries(grupos)
            .map(([g, itens]) => `${ROTULO_GRUPO[g] ?? g}: ${itens.length}`)
            .join(" · ")}
        </p>
      )}

      {alvo && (
        <Modal onClose={() => setAlvo(null)} className="max-w-lg" ariaLabel="Alterar áreas do menu">
          <div className="mb-4">
            <div className="eyebrow !mb-1">Área Por Menu</div>
            <h2 className="text-lg font-semibold text-text">{alvo.rotulo}</h2>
            <p className="mt-1 text-[12.5px] text-dim">
              Quem estiver em alguma das áreas marcadas enxerga este menu. Fora delas, ele deixa de
              existir, mesmo para quem já o tinha liberado.
            </p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {AREA.map((a) => (
              <label
                key={a}
                className={
                  "flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-[13px] transition " +
                  (marcadas.has(a)
                    ? "bg-[var(--surface-2)] text-text"
                    : "text-dim hover:bg-[var(--surface-2)]")
                }
              >
                <input
                  type="checkbox"
                  checked={marcadas.has(a)}
                  onChange={() => alterna(a)}
                  className="h-4 w-4 flex-none accent-[var(--accent)]"
                />
                {AREA_LABEL[a]}
              </label>
            ))}
          </div>

          {vazio && (
            <p className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger">
              <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
              Um menu precisa de pelo menos uma área. Sem área, ele deixa de existir para todo mundo.
            </p>
          )}
          {violaProtegido && !vazio && (
            <p className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger">
              <Icon name="alert" className="mt-0.5 h-4 w-4 flex-none" />
              O menu Início atende todas as áreas e não pode ser restrito: sem ele, uma área inteira
              ficaria sem nenhum item na barra lateral.
            </p>
          )}

          {/* PRÉVIA DO IMPACTO: quem deixa de ver o menu. É o passo que impede a mudança às cegas. */}
          {impacto && (
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
              <div className="nav-label !mb-1.5">Impacto Da Mudança</div>
              {impacto.perdem.length === 0 ? (
                <p className="text-[12.5px] text-ok">Ninguém deixa de ver este menu.</p>
              ) : (
                <>
                  <p className="text-[12.5px] text-danger">
                    {impacto.perdem.length === 1
                      ? "1 usuário deixa de ver este menu:"
                      : `${impacto.perdem.length} usuários deixam de ver este menu:`}
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {impacto.perdem.map((u) => (
                      <li key={u.id} className="text-[12.5px] text-dim">
                        {u.nome}
                        <span className="ml-1.5 text-faint">({u.papel})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {impacto.ganham > 0 && (
                <p className="mt-1.5 text-[12.5px] text-dim">
                  {impacto.ganham === 1
                    ? "1 usuário passa a ver este menu."
                    : `${impacto.ganham} usuários passam a ver este menu.`}
                </p>
              )}
            </div>
          )}

          {erro && (
            <p
              className="mb-3 rounded-lg border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-faint">
              {!mudou
                ? "Nada alterado"
                : impacto
                  ? "Impacto conferido"
                  : "Confira o impacto antes de salvar"}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setAlvo(null)}
                disabled={salvando}
                className="py-2"
              >
                Cancelar
              </Button>
              {/* SALVAR SÓ DEPOIS DA PRÉVIA (decisão do diretor): enquanto não houver impacto
                  calculado para ESTA marcação, o botão é o de conferir. */}
              {!impacto ? (
                <Button onClick={calcular} disabled={!mudou || calculando} className="py-2">
                  {calculando ? "Conferindo…" : "Conferir impacto"}
                </Button>
              ) : (
                <Button
                  onClick={salvar}
                  disabled={salvando || vazio || violaProtegido}
                  className="py-2"
                >
                  {salvando ? "Salvando…" : "Salvar áreas"}
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
