"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AREA_LABEL,
  PAPEL_AS_LABEL,
  type Area,
  type Papel,
  type PapelAs,
} from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { FiltroTrigger, FiltroCampo } from "@/components/ui/FiltroTrigger";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { ConfigMenusModal } from "@/components/admin/ConfigMenusModal";
import { GestaoUsuarioModal } from "@/components/admin/GestaoUsuarioModal";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  /**
   * PAPEL DE A&S: Consultor ou Recruiter, o lado da vaga que a pessoa ocupa. `null` é o estado de
   * quem não trabalha em A&S, que é a maioria, e vira a tag "Sem Papel De A&S".
   */
  papelAs?: PapelAs | null;
  /** Áreas do usuário. VAZIO é estado real e visível: vira a tag "Sem Área" (fail-closed). */
  areas?: Area[];
}

const PAPEL_ROTULO: Record<Papel, string> = {
  SUPER_ADMIN: "Super Admin",
  MASTER: "Master",
  COMUM: "Comum",
};

// Rank do papel para a ordenação clicável: hierarquia real, do mais poderoso para o menos. Ordenar
// "Comum/Master/Super Admin" por alfabética não diz nada sobre o nível de acesso.
const PAPEL_RANK: Record<Papel, number> = { SUPER_ADMIN: 0, MASTER: 1, COMUM: 2 };

// Ordenação da coluna Papel De A&S: quem tem lado primeiro, sem papel por último, porque a coluna
// existe para achar as pessoas da frente de vagas no meio da lista inteira.
const PAPEL_AS_RANK: Record<string, number> = { CONSULTOR: 0, RECRUITER: 1 };
function rankPapelAs(p?: PapelAs | null): number {
  return p ? PAPEL_AS_RANK[p] : 2;
}

// Ordenação da coluna Área: quem está sem área primeiro, porque é o estado que pede ação.
function rankArea(areas?: Area[]): number {
  if (!areas || areas.length === 0) return 0;
  return areas.length === 1 ? (areas[0] === "ADM" ? 1 : 2) : 3;
}

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const dt = new Date(d);
  return Number.isNaN(+dt) ? "não informado" : dt.toLocaleDateString("pt-BR");
}

/** Normaliza para busca: minúsculas, sem acento. Mesma régua da busca dos seletores do sistema. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// ── Opções dos filtros (CONSTANTES, enums fixos; não derivam das linhas carregadas, §A.37) ──────
const FILTRO_PAPEL_OPTS = [
  { value: "COMUM", label: "Comum" },
  { value: "MASTER", label: "Master" },
  { value: "SUPER_ADMIN", label: "Super Admin" },
];
// "SEM" é opção de verdade: é como se pergunta "quem não tem papel de A&S", metade da pergunta.
const FILTRO_PAPEL_AS_OPTS = [
  { value: "CONSULTOR", label: "Consultor" },
  { value: "RECRUITER", label: "Recruiter" },
  { value: "SEM", label: "Sem Papel De A&S" },
];
const FILTRO_STATUS_OPTS = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
];
// "SEM" casa com quem tem `areas` vazio (o fail-closed visível).
const FILTRO_AREA_OPTS = [
  { value: "ADM", label: AREA_LABEL.ADM },
  { value: "AS", label: AREA_LABEL.AS },
  { value: "SEM", label: "Sem Área" },
];

/**
 * A ÁREA do filtro, por usuário. O SUPER_ADMIN enxerga "Todas As Áreas", então casa com qualquer área
 * concreta selecionada (ADM/AS), mas NÃO com "Sem Área", porque "todas" não é o mesmo que "nenhuma".
 * "Sem Área" casa só com quem de fato tem `areas` vazio.
 */
function casaArea(u: Usuario, sel: string[]): boolean {
  if (sel.length === 0) return true;
  return sel.some((s) => {
    if (s === "SEM") return u.papel !== "SUPER_ADMIN" && (u.areas ?? []).length === 0;
    if (u.papel === "SUPER_ADMIN") return true; // todas as áreas casa com qualquer área concreta
    return (u.areas ?? []).includes(s as Area);
  });
}

/**
 * Bloco copiável da senha temporária: aparece após criar usuário ou resetar senha. A senha só é
 * exibida uma vez (o backend não a persiste em claro): o admin a entrega por fora do sistema.
 */
function SenhaTemporaria({ senha, onFechar }: { senha: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard indisponível, o admin pode selecionar o texto manualmente */
    }
  }
  return (
    <GlassCard className="mb-5 border-2 border-accent p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-text">Senha temporária gerada</h3>
          <p className="mt-0.5 text-[12.5px] text-dim">
            Entregue esta senha por fora do sistema; ela não será exibida de novo. No primeiro
            acesso, o usuário será obrigado a trocá-la.
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="grid h-8 w-8 flex-none place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-text"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-[15px] tracking-wide text-text">
          {senha}
        </code>
        <Button onClick={copiar} className="flex-none gap-1.5 py-2.5">
          <Icon name={copiado ? "check" : "doc"} className="h-4 w-4" />
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </GlassCard>
  );
}

/**
 * Admin: Gestão de usuários (OST-EA-GESTAO-USUARIOS). Criação com senha temporária, edição de
 * dados/papel, ativar/desativar (soft delete = bloqueio de login, preserva histórico) e reset de
 * senha. Restrito a Master / Super Admin (gating herdado do AdminLayout).
 *
 * Frente "Melhorias no Menu de Usuários": a criação e a edição deixaram de ser um formulário no topo
 * e uma edição inline na linha, e passaram para um MODAL (`GestaoUsuarioModal`), aberto pelo botão
 * "Criar Novo Usuário" e pelo ícone de editar da linha. A tela ganhou busca por nome/e-mail e filtros
 * avançados (Papel, Área, Papel De A&S, Status), todos client-side sobre as linhas já carregadas.
 */
export default function UsuariosPage() {
  const { token, user: atual } = useAuth();
  const [rows, setRows] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Senha temporária a exibir (criação ou reset)
  const [senhaGerada, setSenhaGerada] = useState<string | null>(null);

  // Modal de criar/editar: null = fechado; senão o modo, e o usuário quando é edição.
  const [modal, setModal] = useState<{ modo: "criar" | "editar"; usuario?: Usuario } | null>(null);

  // ── Busca + filtros (client-side, sobre as linhas já carregadas) ───────────────────────────────
  const [busca, setBusca] = useState("");
  const [fPapel, setFPapel] = useState<string[]>([]);
  const [fArea, setFArea] = useState<string[]>([]);
  const [fPapelAs, setFPapelAs] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);

  // ConfirmDialogs
  const [toggleAlvo, setToggleAlvo] = useState<Usuario | null>(null);
  const [resetAlvo, setResetAlvo] = useState<Usuario | null>(null);
  // OST permissão de menu: usuário cujo conjunto de menus está sendo configurado (null = modal fechado).
  const [configAlvo, setConfigAlvo] = useState<Usuario | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setRows(await apiFetch<Usuario[]>("/admin/usuarios", { token }));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Contagem de filtros ativos (grupos com ao menos uma seleção): alimenta o badge do FiltroTrigger.
  const filtrosAtivos = [fPapel, fArea, fPapelAs, fStatus].filter((f) => f.length > 0).length;
  function limparFiltros() {
    setFPapel([]);
    setFArea([]);
    setFPapelAs([]);
    setFStatus([]);
  }

  // LINHAS FILTRADAS: busca (nome+e-mail, normalizando acento/caixa) e os quatro filtros. É esta lista
  // que alimenta a ordenação; a tabela, as colunas e a ordenação seguem exatamente como antes.
  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    return rows.filter((u) => {
      if (q && !norm(u.nome).includes(q) && !norm(u.email).includes(q)) return false;
      if (fPapel.length > 0 && !fPapel.includes(u.papel)) return false;
      if (fStatus.length > 0 && !fStatus.includes(u.ativo ? "ativo" : "inativo")) return false;
      if (fPapelAs.length > 0 && !fPapelAs.includes(u.papelAs ?? "SEM")) return false;
      if (!casaArea(u, fArea)) return false;
      return true;
    });
  }, [rows, busca, fPapel, fStatus, fPapelAs, fArea]);

  // Ordenação clicável (OST visual, leva das 11 tabelas). Papel e Status ordenam por RANK, não
  // alfabética. A coluna de ações não entra: é controle, não dado.
  const colunas = useMemo<ColOrd<Usuario>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (u) => u.nome },
      { chave: "email", tipo: "texto", valor: (u) => u.email },
      { chave: "papel", tipo: "status", valor: (u) => PAPEL_RANK[u.papel] },
      { chave: "papelAs", tipo: "status", valor: (u) => rankPapelAs(u.papelAs) },
      // Ordena por RANK e não pelo texto: "Sem Área" primeiro, porque é o estado que pede ação.
      { chave: "area", tipo: "status", valor: (u) => rankArea(u.areas) },
      { chave: "status", tipo: "status", valor: (u) => (u.ativo ? 0 : 1) },
      { chave: "criadoEm", tipo: "data", valor: (u) => u.criadoEm },
    ],
    [],
  );
  const ord = useOrdenacao(colunas, filtradas);

  async function confirmarToggle() {
    if (!toggleAlvo) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/usuarios/${toggleAlvo.id}`, {
        method: "PATCH",
        token,
        body: { ativo: !toggleAlvo.ativo },
      });
      setToggleAlvo(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao alterar o status do usuário.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmarReset() {
    if (!resetAlvo) return;
    setConfirmBusy(true);
    setError(null);
    try {
      const r = await apiFetch<{ senhaTemporaria: string }>(
        `/admin/usuarios/${resetAlvo.id}/reset-senha`,
        { method: "POST", token },
      );
      setResetAlvo(null);
      setSenhaGerada(r.senhaTemporaria);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao resetar a senha.");
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Administração"
        title="Usuários"
        subtitle="Cadastro, papéis e acesso: senha temporária na criação e no reset; desativar bloqueia o login sem apagar o histórico."
      />

      {senhaGerada && <SenhaTemporaria senha={senhaGerada} onFechar={() => setSenhaGerada(null)} />}

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* ── Barra: busca + filtros + criar ─────────────────────────────────────────────────────────
          No lugar do antigo formulário do topo. A busca ocupa a largura; o ícone de filtro com o badge
          de ativos e o botão de criar ficam na ponta. */}
      <div className="mb-5 flex items-center gap-3">
        <div className="relative flex-1">
          {/* Lupa inline: o conjunto de ícones do design system (`Icon`) não tem uma, e esta é
              puramente decorativa (o input já tem aria-label). currentColor + traço, no mesmo tom dos
              demais ícones, para não destoar. */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3.5 text-sm text-text outline-none transition placeholder:text-faint focus:border-[var(--accent)]"
          />
        </div>

        <FiltroTrigger count={filtrosAtivos} onLimpar={limparFiltros}>
          <FiltroCampo label="Papel">
            <MultiSelect
              values={fPapel}
              onChange={setFPapel}
              options={FILTRO_PAPEL_OPTS}
              placeholder="Todos os papéis"
              ariaLabel="Filtrar por papel"
            />
          </FiltroCampo>
          <FiltroCampo label="Área">
            <MultiSelect
              values={fArea}
              onChange={setFArea}
              options={FILTRO_AREA_OPTS}
              placeholder="Todas as áreas"
              ariaLabel="Filtrar por área"
            />
          </FiltroCampo>
          <FiltroCampo label="Papel De A&S">
            <MultiSelect
              values={fPapelAs}
              onChange={setFPapelAs}
              options={FILTRO_PAPEL_AS_OPTS}
              placeholder="Qualquer um"
              ariaLabel="Filtrar por papel de A&S"
            />
          </FiltroCampo>
          <FiltroCampo label="Status">
            <MultiSelect
              values={fStatus}
              onChange={setFStatus}
              options={FILTRO_STATUS_OPTS}
              placeholder="Todos os status"
              ariaLabel="Filtrar por status"
            />
          </FiltroCampo>
        </FiltroTrigger>

        <Button
          onClick={() => setModal({ modo: "criar" })}
          className="flex-none gap-1.5 py-2.5"
        >
          <Icon name="plus" className="h-4 w-4" />
          Criar Novo Usuário
        </Button>
      </div>

      {/* ── Lista de usuários ──────────────────────────────────────────── */}
      <GlassCard className="overflow-hidden p-2">
        {/* A COLUNA NOVA APERTOU A TABELA, então ela passa a rolar na horizontal em vez de espremer
            (§A.20). Rolar é o que a §A.13 manda fazer no lugar de encolher. */}
        <div className="overflow-x-auto">
          <table className="ds-table min-w-[1280px]">
            <thead>
              <tr>
                <ColunaOrdenavel as="th" ord={ord} chave="nome">
                  Nome
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="email">
                  E-mail
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="papel" className="w-[150px]">
                  Papel
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="area" className="w-[190px]">
                  Área
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="papelAs" className="w-[205px]">
                  Papel De A&S
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="status" className="w-[110px]">
                  Status
                </ColunaOrdenavel>
                <ColunaOrdenavel as="th" ord={ord} chave="criadoEm" className="w-[135px]">
                  Criado em
                </ColunaOrdenavel>
                <th className="w-[170px]" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Carregando usuários…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Nenhum usuário cadastrado.
                  </td>
                </tr>
              ) : ord.itens.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-faint">
                    Nenhum usuário encontrado para a busca ou os filtros.
                  </td>
                </tr>
              ) : (
                ord.itens.map((u) => {
                  const ehAtual = atual?.id === u.id;
                  return (
                    <tr key={u.id}>
                      <td className="align-top">
                        <span className="text-text">{u.nome}</span>
                      </td>
                      <td className="align-top">
                        <span className="text-dim">{u.email}</span>
                      </td>
                      <td className="align-top">
                        <span className="text-[13.5px] text-text">{PAPEL_ROTULO[u.papel]}</span>
                      </td>
                      {/* ÁREA: só LEITURA aqui, para o diretor auditar de relance quem está em quê sem
                        abrir um modal por pessoa. A edição vive no modal de permissão, junto dos
                        menus que ela governa. O Super Admin está acima da segmentação. */}
                      <td className="align-top">
                        <div className="flex flex-wrap gap-1">
                          {u.papel === "SUPER_ADMIN" ? (
                            <Pill tone="ok">Todas As Áreas</Pill>
                          ) : !u.areas || u.areas.length === 0 ? (
                            // O estado que torna o fail-closed seguro em vez de silencioso.
                            <Pill tone="wn">Sem Área</Pill>
                          ) : (
                            u.areas.map((a) => (
                              <Pill key={a} tone="nt">
                                {AREA_LABEL[a]}
                              </Pill>
                            ))
                          )}
                        </div>
                      </td>
                      {/* PAPEL DE A&S: "Sem Papel De A&S" é estado normal, não pendência, então a tag é
                        neutra e não amarela: quem não trabalha em A&S não tem nada a resolver. */}
                      <td className="align-top">
                        {u.papelAs ? (
                          <Pill tone="in">{PAPEL_AS_LABEL[u.papelAs]}</Pill>
                        ) : (
                          <Pill tone="nt">Sem Papel De A&S</Pill>
                        )}
                      </td>
                      <td className="align-top">
                        <Pill tone={u.ativo ? "ok" : "nt"}>{u.ativo ? "Ativo" : "Inativo"}</Pill>
                      </td>
                      <td className="align-top text-[13px] text-dim">{fmtData(u.criadoEm)}</td>
                      <td className="align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setModal({ modo: "editar", usuario: u })}
                            className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                            title="Editar"
                            aria-label="Editar usuário"
                          >
                            <Icon name="pen" className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfigAlvo(u)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                            title="Configurar menus de acesso"
                            aria-label="Configurar menus de acesso"
                          >
                            <Icon name="layers" className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setResetAlvo(u)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-accent"
                            title="Resetar Senha"
                            aria-label="Resetar Senha"
                          >
                            <Icon name="clock" className="h-[17px] w-[17px]" />
                          </button>
                          <button
                            type="button"
                            disabled={ehAtual}
                            onClick={() => setToggleAlvo(u)}
                            className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:bg-[var(--surface-2)] hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                            title={
                              ehAtual
                                ? "Você não pode desativar a própria conta"
                                : u.ativo
                                  ? "Desativar (bloquear login)"
                                  : "Reativar"
                            }
                            aria-label={u.ativo ? "Desativar usuário" : "Reativar usuário"}
                          >
                            <Icon
                              name={u.ativo ? "logout" : "check"}
                              className="h-[17px] w-[17px]"
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Modal de criar / editar usuário (frente "Melhorias no Menu de Usuários") */}
      {modal && (
        <GestaoUsuarioModal
          modo={modal.modo}
          usuario={modal.usuario}
          usuarios={rows}
          token={token ?? undefined}
          onClose={() => setModal(null)}
          onSalvo={(senha) => {
            setModal(null);
            if (senha) setSenhaGerada(senha);
            void load();
          }}
        />
      )}

      {/* Ativar / desativar (soft delete = bloqueio de login, preserva histórico) */}
      <ConfirmDialog
        open={Boolean(toggleAlvo)}
        title={toggleAlvo?.ativo ? "Desativar usuário" : "Reativar usuário"}
        message={
          toggleAlvo?.ativo
            ? `Desativar "${toggleAlvo?.nome}"? O login fica bloqueado, mas o histórico é preservado (não é exclusão). Pode reativar depois.`
            : `Reativar "${toggleAlvo?.nome}"? O usuário volta a poder entrar no sistema.`
        }
        confirmLabel={toggleAlvo?.ativo ? "Desativar" : "Reativar"}
        tone={toggleAlvo?.ativo ? "danger" : "default"}
        busy={confirmBusy}
        onConfirm={confirmarToggle}
        onCancel={() => setToggleAlvo(null)}
      />

      {/* Reset de senha */}
      <ConfirmDialog
        open={Boolean(resetAlvo)}
        title="Resetar Senha"
        message={`Gerar uma nova senha temporária para "${resetAlvo?.nome}"? A senha atual deixa de valer e o usuário terá de trocá-la no próximo acesso.`}
        confirmLabel="Gerar nova senha"
        busy={confirmBusy}
        onConfirm={confirmarReset}
        onCancel={() => setResetAlvo(null)}
      />

      {/* Configuração de menus por usuário (OST permissão de menu, Bloco 4) */}
      {configAlvo && (
        <ConfigMenusModal
          usuario={configAlvo}
          token={token ?? undefined}
          onClose={() => setConfigAlvo(null)}
        />
      )}
    </>
  );
}
