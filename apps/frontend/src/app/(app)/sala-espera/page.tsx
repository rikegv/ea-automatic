"use client";

/**
 * SALA DE ESPERA (onda 2): o candidato anunciado pelo cliente ou pela Seleção ANTES de se candidatar
 * no Pandapé. É a fase que hoje ninguém enxerga.
 *
 * NÃO É ADMISSÃO: não tem CPF, não entra na esteira e não aparece em KPI nenhum. Vira admissão
 * quando o operador fizer o match na Liberação (onda 3), e aí o registro sai daqui sozinho.
 *
 * A FILA MOSTRA SÓ O QUE ESTÁ EM ABERTO. Quem recebe um status terminal (Declinou, Desistiu ou o que
 * o diretor marcar no Gerencial) some da lista, e o filtro de status terminal vem do CATÁLOGO, não
 * de nomes escritos aqui.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { StatusPill } from "@/components/ui/StatusPill";
import { caixaAlta } from "@/lib/nome";

interface Registro {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  dataNascimento: string | null;
  email: string | null;
  dataRecebimento: string;
  origem: "CLIENTE" | "SELECAO";
  codCliente: string;
  clienteRazao: string | null;
  clienteOperacao: string | null;
  cargoId: string;
  cargoNome: string | null;
  statusId: string;
  statusNome: string;
  statusEncerra: boolean;
}
interface StatusAtivo {
  id: string;
  nome: string;
  encerra: boolean;
}

const COLS =
  "minmax(180px,1.2fr) minmax(150px,1fr) minmax(160px,1fr) 130px 120px 110px minmax(200px,1.1fr) 70px";
const ORIGEM_ROTULO: Record<string, string> = { CLIENTE: "Cliente", SELECAO: "Seleção" };

/**
 * Cliente SEMPRE com o código na frente ("0060 - AVL"), regra permanente do design system.
 *
 * O motivo é operacional: o time trabalha por código e o mesmo nome de operação se repete entre
 * unidades (há quatro "RAIA CAGC" distintas na base), então sem o código não dá para saber qual foi
 * escolhida.
 */
function rotuloCliente(cod: string, operacao?: string | null, razao?: string | null): string {
  const nome = operacao || razao || "";
  return nome ? `${cod} - ${nome}` : cod;
}

function fmtData(d?: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

const VAZIO = {
  nome: "",
  codCliente: "",
  cargoId: "",
  telefone: "",
  cpf: "",
  dataNascimento: "",
  email: "",
  dataRecebimento: "",
  origem: "CLIENTE" as "CLIENTE" | "SELECAO",
  statusId: "",
};

export default function SalaEsperaPage() {
  const { token } = useAuth();
  const [linhas, setLinhas] = useState<Registro[]>([]);
  const [statusAtivos, setStatusAtivos] = useState<StatusAtivo[]>([]);
  const [clientes, setClientes] = useState<
    { codCliente: string; razaoSocial: string; nomeOperacao: string | null }[]
  >([]);
  const [cargos, setCargos] = useState<{ id: string; nome: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<Registro | null>(null);
  const [form, setForm] = useState({ ...VAZIO });
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const [fila, sts] = await Promise.all([
        apiFetch<Registro[]>("/sala-espera", { token }),
        apiFetch<StatusAtivo[]>("/sala-espera/status/ativos", { token }),
      ]);
      setLinhas(fila);
      setStatusAtivos(sts);
      setErro(null);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar a Sala de Espera.");
    } finally {
      setCarregando(false);
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Catálogos do formulário, carregados uma vez.
  useEffect(() => {
    if (!token) return;
    void apiFetch<{ codCliente: string; razaoSocial: string; nomeOperacao: string | null }[]>(
      "/catalogos/clientes",
      { token },
    )
      .then(setClientes)
      .catch(() => setClientes([]));
    void apiFetch<{ id: string; nome: string }[]>("/catalogos/cargos", { token })
      .then(setCargos)
      .catch(() => setCargos([]));
  }, [token]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return linhas;
    return linhas.filter(
      (l) =>
        l.nome.toLowerCase().includes(q) ||
        (l.clienteOperacao ?? l.clienteRazao ?? "").toLowerCase().includes(q) ||
        (l.cargoNome ?? "").toLowerCase().includes(q) ||
        (l.telefone ?? "").includes(q),
    );
  }, [linhas, busca]);

  function abrirNovo() {
    const primeiroAberto = statusAtivos.find((s) => !s.encerra);
    setEditando(null);
    setForm({
      ...VAZIO,
      // Data de hoje e o primeiro status não terminal: o caso comum já vem preenchido.
      dataRecebimento: new Date().toISOString().slice(0, 10),
      statusId: primeiroAberto?.id ?? "",
    });
    setErroForm(null);
    setAberto(true);
  }

  function abrirEdicao(r: Registro) {
    setEditando(r);
    setForm({
      nome: r.nome,
      codCliente: r.codCliente,
      cargoId: r.cargoId,
      telefone: r.telefone ?? "",
      cpf: r.cpf ?? "",
      dataNascimento: r.dataNascimento ?? "",
      email: r.email ?? "",
      dataRecebimento: r.dataRecebimento,
      origem: r.origem,
      statusId: r.statusId,
    });
    setErroForm(null);
    setAberto(true);
  }

  const completo = Boolean(
    form.nome.trim() && form.codCliente && form.cargoId && form.dataRecebimento && form.statusId,
  );

  async function salvar() {
    setSalvando(true);
    setErroForm(null);
    try {
      // Opcionais viram `undefined` quando vazios: o backend distingue "não informado" de "vazio".
      const body = {
        ...form,
        telefone: form.telefone || undefined,
        cpf: form.cpf || undefined,
        dataNascimento: form.dataNascimento || undefined,
        email: form.email || undefined,
      };
      if (editando) {
        await apiFetch(`/sala-espera/${editando.id}`, { token, method: "PUT", body });
      } else {
        await apiFetch("/sala-espera", { token, method: "POST", body });
      }
      setAberto(false);
      await carregar();
    } catch (e) {
      setErroForm(e instanceof ApiError ? e.message : "Falha ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        title="Sala De Espera"
        subtitle="Candidatos anunciados pelo cliente ou pela Seleção, antes da candidatura no Pandapé."
      />

      <GlassCard className="mb-3 flex flex-wrap items-center gap-3 px-4 py-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por candidato, cliente, cargo ou telefone"
          className="ds-input min-w-[280px] flex-1"
          aria-label="Buscar na Sala de Espera"
        />
        <span className="text-sm text-faint">
          {linhas.length} em aberto
        </span>
        <Button onClick={abrirNovo}>
          <Icon name="plus" className="h-4 w-4" />
          Novo Registro
        </Button>
      </GlassCard>

      {erro && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger">
          {erro}
        </p>
      )}

      <GlassCard className="list flex min-h-0 flex-1 flex-col">
        <div className="ea-scroll min-h-0 flex-1 overflow-auto">
          <div className="min-w-[1180px]">
            <div className="list-head" style={{ gridTemplateColumns: COLS }}>
              <span>Candidato</span>
              <span>Cliente</span>
              <span>Cargo</span>
              <span>Telefone</span>
              <span>Recebido Em</span>
              <span>Origem</span>
              <span>Status</span>
              <span className="col-fix">Ações</span>
            </div>

            {carregando ? (
              <div className="px-4 py-10 text-center text-sm text-faint">Carregando…</div>
            ) : filtradas.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-faint">
                {busca
                  ? "Nenhum registro com esse filtro."
                  : "Nenhum candidato aguardando. Use Novo Registro para incluir."}
              </div>
            ) : (
              filtradas.map((l) => (
                <div key={l.id} className="row" style={{ gridTemplateColumns: COLS }}>
                  <div className="min-w-0 text-left">
                    <div className="nm truncate" title={caixaAlta(l.nome)}>
                      {caixaAlta(l.nome)}
                    </div>
                  </div>
                  <div
                    className="meta truncate text-center"
                    title={rotuloCliente(l.codCliente, l.clienteOperacao, l.clienteRazao)}
                  >
                    {rotuloCliente(l.codCliente, l.clienteOperacao, l.clienteRazao)}
                  </div>
                  <div className="meta truncate text-center" title={l.cargoNome ?? ""}>
                    {l.cargoNome ?? <span className="text-faint/60">—</span>}
                  </div>
                  <div className="meta text-center">
                    {l.telefone || <span className="text-faint/60">—</span>}
                  </div>
                  <div className="meta text-center tabular-nums">{fmtData(l.dataRecebimento)}</div>
                  <div className="meta text-center">{ORIGEM_ROTULO[l.origem] ?? l.origem}</div>
                  <div className="flex min-w-0 items-center justify-center">
                    <StatusPill tone="wn" label={l.statusNome} />
                  </div>
                  <div className="col-fix flex items-center justify-center">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
                      title="Editar registro"
                      aria-label={`Editar ${l.nome}`}
                      onClick={() => abrirEdicao(l)}
                    >
                      <Icon name="pen" className="h-[16px] w-[16px]" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </GlassCard>

      {aberto && (
        <Modal
          onClose={() => setAberto(false)}
          ariaLabel={editando ? "Editar registro" : "Novo registro"}
          className="max-w-2xl"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <h2 className="text-base font-semibold text-text">
              {editando ? "Editar Registro" : "Novo Registro"}
            </h2>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="rounded-md p-1 text-faint transition hover:text-text"
            >
              <Icon name="x" className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            {/* Nome ocupa a LINHA INTEIRA (design system): é o campo mais longo do cadastro e o
                que mais sofre com corte. */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">Nome do candidato</span>
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="ds-input w-full"
                aria-label="Nome do candidato"
              />
            </label>

            {/* CPF, nascimento e e-mail: TODOS OPCIONAIS. Servem ao match da Liberação (onda 3), que
                casa por identidade quando o CPF existe, em vez de casar por nome. */}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-faint">
                  CPF <span className="text-faint/70">(opcional)</span>
                </span>
                <input
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                  className="ds-input w-full"
                  aria-label="CPF do candidato"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-faint">
                  Data de nascimento <span className="text-faint/70">(opcional)</span>
                </span>
                <input
                  type="date"
                  value={form.dataNascimento}
                  onChange={(e) => setForm({ ...form, dataNascimento: e.target.value })}
                  className="ds-input w-full"
                  aria-label="Data de nascimento"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-faint">
                E-mail <span className="text-faint/70">(opcional)</span>
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="ds-input w-full"
                aria-label="E-mail do candidato"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mb-1 block text-xs font-medium text-faint">Cliente</span>
                <Select
                  value={form.codCliente}
                  onChange={(v) => setForm({ ...form, codCliente: v })}
                  options={clientes.map((c) => ({
                    value: c.codCliente,
                    label: rotuloCliente(c.codCliente, c.nomeOperacao, c.razaoSocial),
                  }))}
                  placeholder="Selecionar…"
                  ariaLabel="Cliente"
                  searchable
                  menuFit
                />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-faint">Cargo</span>
                <Select
                  value={form.cargoId}
                  onChange={(v) => setForm({ ...form, cargoId: v })}
                  options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
                  placeholder="Selecionar…"
                  ariaLabel="Cargo"
                  searchable
                  menuFit
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-faint">
                  Telefone <span className="text-faint/70">(opcional)</span>
                </span>
                <input
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: e.target.value })}
                  className="ds-input w-full"
                  aria-label="Telefone"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-faint">Data de recebimento</span>
                <input
                  type="date"
                  value={form.dataRecebimento}
                  onChange={(e) => setForm({ ...form, dataRecebimento: e.target.value })}
                  className="ds-input w-full"
                  aria-label="Data de recebimento"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="mb-1 block text-xs font-medium text-faint">Origem</span>
                <Select
                  value={form.origem}
                  onChange={(v) => setForm({ ...form, origem: v as "CLIENTE" | "SELECAO" })}
                  options={[
                    { value: "CLIENTE", label: "Cliente" },
                    { value: "SELECAO", label: "Seleção" },
                  ]}
                  ariaLabel="Origem"
                  menuFit
                />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium text-faint">Status</span>
                <Select
                  value={form.statusId}
                  onChange={(v) => setForm({ ...form, statusId: v })}
                  options={statusAtivos.map((s) => ({
                    value: s.id,
                    // O rótulo avisa que o status TIRA da fila: a consequência fica visível na hora
                    // da escolha, não depois que a linha some.
                    label: s.encerra ? `${s.nome} (encerra)` : s.nome,
                  }))}
                  placeholder="Selecionar…"
                  ariaLabel="Status"
                  menuFit
                />
              </div>
            </div>

            <p className="text-xs text-faint">
              CPF, nascimento e e-mail são opcionais e ajudam a casar o registro com a admissão
              depois. Status que encerra tira o registro da fila.
            </p>

            {erroForm && <p className="text-sm text-danger">{erroForm}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setAberto(false)} disabled={salvando}>
                Cancelar
              </Button>
              <Button onClick={() => void salvar()} disabled={salvando || !completo}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
