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
import { VincularAdmissaoLivreto } from "@/components/sala-espera/VincularAdmissaoLivreto";
import { ColunaOrdenavel } from "@/components/ui/ColunaOrdenavel";
import { useOrdenacao, type ColunaOrdenavel as ColOrd } from "@/lib/ordenacao";

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
  admissaoId: string | null;
  vinculadoEm: string | null;
}
interface StatusAtivo {
  id: string;
  nome: string;
  encerra: boolean;
}

/**
 * TABELA AUTO-RESPONSIVA (decisão do diretor): as colunas são PROPORCIONAIS e o `minmax(0, Nfr)`
 * garante que elas encolham juntas em vez de estourar a largura. Assim a tabela ocupa 100% do espaço
 * disponível em qualquer tela, sem rolagem horizontal como saída e sem coluna espremida.
 *
 * Os pesos vêm do conteúdo real, não de chute: Status é o maior (1.7) porque o pill mais longo do
 * catálogo é "Aguardando confirmação do link"; Candidato e Cliente vêm logo atrás (nome de pessoa e
 * "código - nome operacional" são os textos mais longos); Origem é o menor (só "Cliente" ou
 * "Seleção"). A coluna de Ações é a única fixa, porque botão não estica.
 */
const COLS =
  "minmax(0,1.5fr) minmax(0,1.35fr) minmax(0,1fr) minmax(0,0.85fr) minmax(0,0.75fr) minmax(0,0.6fr) minmax(0,1.7fr) 130px";
/** Na aba Vinculadas o Status dá lugar a QUANDO foi vinculado, e sobra a coluna do botão de vínculo. */
const COLS_VINC =
  "minmax(0,1.5fr) minmax(0,1.35fr) minmax(0,1fr) minmax(0,0.85fr) minmax(0,0.75fr) minmax(0,0.6fr) minmax(0,1.2fr) 56px";
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

/** Data e hora do vínculo: o minuto importa para conferir contra a Liberação. */
function fmtDataHora(iso?: string | null): string {
  if (!iso) return "não informado";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "não informado";
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function fmtData(d?: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

/** As três abas da estrutura definitiva. A ordem é a do fluxo: espera, desfecho bom, desfecho ruim. */
type Aba = "aguardando" | "vinculadas" | "inativadas";
const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "aguardando", rotulo: "Aguardando" },
  { chave: "vinculadas", rotulo: "Admissões Vinculadas" },
  { chave: "inativadas", rotulo: "Admissões Inativadas" },
];
const CONTAGEM: Record<Aba, string> = {
  aguardando: "em aberto",
  vinculadas: "vinculada(s)",
  inativadas: "inativada(s)",
};
const VAZIO_ABA: Record<Aba, string> = {
  aguardando: "Nenhum candidato aguardando. Use Novo Registro para incluir.",
  vinculadas:
    "Nenhum registro vinculado ainda. O vínculo acontece pelo botão Vincular, na aba Aguardando.",
  inativadas:
    "Nenhum registro inativado. Quem recebe um status de encerramento (Declinou, Desistiu ou Canceladas) aparece aqui, sem ser apagado.",
};
/**
 * A aba Aguardando é a única com o botão de vínculo, então é a única que precisa da coluna larga de
 * Ações. Nas outras duas sobra espaço, e ele volta para as colunas de conteúdo.
 */
const COLUNAS: Record<Aba, string> = {
  aguardando: COLS,
  vinculadas: COLS_VINC,
  inativadas: COLS_VINC,
};

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
  /**
   * AS TRÊS ABAS (estrutura definitiva, decisão do diretor):
   *  - "Aguardando": a fila viva, quem ainda espera tratativa;
   *  - "Admissões Vinculadas": quem virou admissão (o desfecho bom);
   *  - "Admissões Inativadas": quem parou no caminho (Declinou, Desistiu, Canceladas).
   *
   * A terceira existe porque o terminal SUMIA da tela: saía da fila e não ia para lugar nenhum
   * visível. NADA é apagado do banco em nenhuma das três (decisão do diretor: inativar, nunca
   * deletar), então o histórico segue inteiro e consultável.
   */
  const [aba, setAba] = useState<Aba>("aguardando");
  /** Registro com o livreto do match aberto. */
  const [vinculando, setVinculando] = useState<Registro | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!token) return;
    setCarregando(true);
    try {
      const [fila, sts] = await Promise.all([
        apiFetch<Registro[]>(
          aba === "aguardando" ? "/sala-espera" : `/sala-espera?recorte=${aba}`,
          { token },
        ),
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
  }, [token, aba]);

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

  /**
   * Ordenação clicável (§A.12). A tela carrega a fila inteira, então ordenar aqui é honesto.
   *
   * A ÚLTIMA COLUNA MUDA COM A ABA (Vinculado Em nas vinculadas, Status nas demais), e a chave
   * acompanha: são duas perguntas diferentes, e uma chave só faria a seta continuar acesa apontando
   * para uma coluna que não é mais a mesma.
   */
  const colunasOrd = useMemo<ColOrd<Registro>[]>(
    () => [
      { chave: "nome", tipo: "texto", valor: (l) => l.nome },
      { chave: "cliente", tipo: "texto", valor: (l) => l.clienteOperacao ?? l.clienteRazao },
      { chave: "cargo", tipo: "texto", valor: (l) => l.cargoNome },
      { chave: "telefone", tipo: "texto", valor: (l) => l.telefone },
      { chave: "recebido", tipo: "data", valor: (l) => l.dataRecebimento },
      { chave: "origem", tipo: "texto", valor: (l) => l.origem },
      { chave: "status", tipo: "texto", valor: (l) => l.statusNome },
      { chave: "vinculadoEm", tipo: "data", valor: (l) => l.vinculadoEm },
    ],
    [],
  );
  const ord = useOrdenacao(colunasOrd, filtradas);

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

      {/* ABAS: a fila viva e o histórico do que já foi vinculado. */}
      <div className="mb-3 flex gap-2">
        {ABAS.map((t) => (
          <button
            key={t.chave}
            type="button"
            onClick={() => setAba(t.chave)}
            className={
              "rounded-full border px-4 py-1.5 text-[13px] font-semibold transition " +
              (aba === t.chave
                ? "border-[var(--accent)] text-accent"
                : "border-[var(--border)] text-faint hover:text-text")
            }
          >
            {t.rotulo}
          </button>
        ))}
      </div>

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
          {linhas.length} {CONTAGEM[aba]}
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
      {okMsg && (
        <p className="mb-3 rounded-xl border border-[var(--border)] bg-[rgba(45,138,86,0.1)] px-3 py-2 text-sm text-ok">
          {okMsg}
        </p>
      )}

      <GlassCard className="list flex min-h-0 flex-1 flex-col">
        <div className="ea-scroll min-h-0 flex-1 overflow-auto">
          {/* Piso, não régua: a tabela se ajusta ao espaço disponível e só rola em tela muito
              estreita, onde qualquer distribuição espremeria alguma coluna. */}
          <div className="min-w-[880px]">
            <div
              className="list-head"
              style={{ gridTemplateColumns: COLUNAS[aba], gap: "10px" }}
            >
              <ColunaOrdenavel ord={ord} chave="nome">
                Candidato
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="cliente">
                Cliente
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="cargo">
                Cargo
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="telefone">
                Telefone
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="recebido">
                Recebido Em
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave="origem">
                Origem
              </ColunaOrdenavel>
              <ColunaOrdenavel ord={ord} chave={aba === "vinculadas" ? "vinculadoEm" : "status"}>
                {aba === "vinculadas" ? "Vinculado Em" : "Status"}
              </ColunaOrdenavel>
              <span className="col-fix">Ações</span>
            </div>

            {carregando ? (
              <div className="px-4 py-10 text-center text-sm text-faint">Carregando…</div>
            ) : filtradas.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-faint">
                {busca ? "Nenhum registro com esse filtro." : VAZIO_ABA[aba]}
              </div>
            ) : (
              ord.itens.map((l) => (
                <div
                  key={l.id}
                  className="row"
                  style={{ gridTemplateColumns: COLUNAS[aba], gap: "10px" }}
                >
                  <div className="min-w-0 text-left">
                    {/* QUEBRA a linha em vez de cortar (§A.20): a linha cresce, o nome fica inteiro. */}
                    <div className="nm !text-[13.5px] leading-tight break-words" title={caixaAlta(l.nome)}>
                      {caixaAlta(l.nome)}
                    </div>
                  </div>
                  <div
                    className="meta !text-[12px] leading-tight break-words text-center"
                    title={rotuloCliente(l.codCliente, l.clienteOperacao, l.clienteRazao)}
                  >
                    {rotuloCliente(l.codCliente, l.clienteOperacao, l.clienteRazao)}
                  </div>
                  <div className="meta !text-[12px] leading-tight break-words text-center" title={l.cargoNome ?? ""}>
                    {l.cargoNome ?? <span className="text-faint/60">—</span>}
                  </div>
                  <div className="meta !text-[12px] text-center">
                    {l.telefone || <span className="text-faint/60">—</span>}
                  </div>
                  <div className="meta !text-[12px] text-center tabular-nums">
                    {fmtData(l.dataRecebimento)}
                  </div>
                  <div className="meta !text-[12px] text-center">
                    {ORIGEM_ROTULO[l.origem] ?? l.origem}
                  </div>
                  <div className="flex min-w-0 items-center justify-center">
                    {aba === "vinculadas" ? (
                      <span className="meta tabular-nums">{fmtDataHora(l.vinculadoEm)}</span>
                    ) : (
                      /* O pill QUEBRA em vez de vazar por cima da coluna vizinha em tela estreita:
                         o padrão dele é `whitespace-nowrap`, que é certo em coluna larga e vira
                         sobreposição quando o espaço aperta (§A.20). */
                      <StatusPill
                        /* Na aba Inativadas o estado é de encerramento, não de espera: o tom muda
                           junto, senão a mesma cor amarela contaria duas histórias diferentes. */
                        tone={l.statusEncerra ? "dg" : "wn"}
                        label={l.statusNome}
                        className="!whitespace-normal text-center leading-tight"
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1.5">
                    {/* VINCULAR ADMISSÃO: só na fila viva. Na aba Vinculadas o trabalho já foi feito,
                        e oferecer o botão de novo convidaria a vincular duas vezes (o backend recusa,
                        mas o certo é a tela não convidar). */}
                    {aba === "aguardando" && (
                      <Button
                        variant="secondary"
                        className="!px-2.5 !py-1.5 text-[12px] whitespace-nowrap"
                        title={`Vincular ${l.nome} a uma admissão da Liberação`}
                        aria-label={`Vincular admissão de ${l.nome}`}
                        onClick={() => setVinculando(l)}
                      >
                        Vincular
                      </Button>
                    )}
                    <button
                      type="button"
                      className="grid h-8 w-8 flex-none place-items-center rounded-lg text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
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
      {/* LIVRETO DO MATCH: a Sala de um lado, a fila da Liberação do outro. Vincular NÃO libera. */}
      {vinculando && (
        <VincularAdmissaoLivreto
          registro={vinculando}
          onFechar={() => setVinculando(null)}
          onVinculado={(nomeAdmissao) => {
            setVinculando(null);
            setOkMsg(
              `${caixaAlta(vinculando.nome)} vinculado a ${caixaAlta(nomeAdmissao)}. O cliente foi sugerido na admissão; a liberação continua sendo passo à parte, na tela de Liberação.`,
            );
            void carregar();
          }}
        />
      )}

    </div>
  );
}
