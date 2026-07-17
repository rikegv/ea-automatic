"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";

interface PreAdmissao {
  admissaoId: string;
  candidatoNome: string;
  candidatoCpf: string;
  telefone: string | null;
  dataNascimento: string | null;
  sexo: string | null;
  origem: string;
  criadoEm: string;
  idVacancy: string | null;
  possivelDuplicata: boolean;
}
interface Cliente {
  codCliente: string;
  razaoSocial: string;
  // Nome operacional (fantasia): o time reconhece o cliente por ele, não pela razão social.
  nomeOperacao: string | null;
}
interface Cargo {
  id: string;
  nome: string;
}

const ROTULO_SEXO: Record<string, string> = {
  MASCULINO: "Masculino",
  FEMININO: "Feminino",
};

function fmtData(d?: string | null): string {
  if (!d) return "não informado";
  const iso = d.slice(0, 10);
  const [a, m, dia] = iso.split("-");
  return a && m && dia ? `${dia}/${m}/${a}` : "não informado";
}
function fmtCpf(cpf: string): string {
  return cpf.length === 11
    ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`
    : cpf;
}
/**
 * Rótulo do cliente no seletor: "código · nome operacional" (o time reconhece por ele). Sem nome
 * operacional, cai para "código · razão social". A razão social NÃO entra quando há nome operacional
 * (é longa e polui).
 */
function rotuloCliente(c: Cliente): string {
  return `${c.codCliente} · ${c.nomeOperacao ?? c.razaoSocial}`;
}

// Tempo parado desde a CHEGADA (criadoEm) até agora. Duas leituras do MESMO total: dias (piso, dias
// completos decorridos) e horas (piso). `nowMs` vem do estado, atualizado no load/liberar.
function paradoMs(criadoEm: string, nowMs: number): number {
  return Math.max(0, nowMs - new Date(criadoEm).getTime());
}
function paradoDias(criadoEm: string, nowMs: number): string {
  const d = Math.floor(paradoMs(criadoEm, nowMs) / 86_400_000);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}
// Total ACUMULADO desde a chegada em hh:mm (não reinicia às 24h: 36h30 → "36:30"). Minutos por piso.
function paradoHoras(criadoEm: string, nowMs: number): string {
  const totalMin = Math.floor(paradoMs(criadoEm, nowMs) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function LiberacaoPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PreAdmissao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  // "Agora" fixado no carregamento — as colunas de tempo parado calculam a partir daqui.
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Modal de liberação: a pré-admissão alvo (null = fechado) + a escolha de cliente/cargo do modal.
  const [alvo, setAlvo] = useState<PreAdmissao | null>(null);
  const [codCliente, setCodCliente] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [liberando, setLiberando] = useState(false);
  const [modalErro, setModalErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [pre, cli, car] = await Promise.all([
        apiFetch<PreAdmissao[]>("/admissoes/aguardando-liberacao", { token }),
        apiFetch<Cliente[]>("/admin/clientes", { token }),
        apiFetch<Cargo[]>("/admin/cargos", { token }),
      ]);
      setRows(pre);
      setClientes(cli);
      setCargos(car);
      setNowMs(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar a fila de liberação");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function abrirModal(r: PreAdmissao) {
    setAlvo(r);
    setCodCliente("");
    setCargoId("");
    setModalErro(null);
  }
  function fecharModal() {
    if (liberando) return;
    setAlvo(null);
  }

  async function liberar() {
    if (!alvo || !codCliente || !cargoId) return;
    setLiberando(true);
    setModalErro(null);
    setError(null);
    setOkMsg(null);
    try {
      const r = await apiFetch<{ temRegua: boolean }>(
        `/admissoes/${encodeURIComponent(alvo.admissaoId)}/liberar`,
        { method: "PATCH", token, body: { codCliente, cargoId } },
      );
      setOkMsg(
        r.temRegua
          ? `${alvo.candidatoNome} liberado. A admissão entrou na esteira com a régua documental do par.`
          : `${alvo.candidatoNome} liberado e na esteira. Atenção: este par cliente e cargo não tem régua documental cadastrada, então a admissão nasceu sem checklist de documentos.`,
      );
      setAlvo(null);
      await load();
    } catch (e) {
      const msg =
        e instanceof ApiError && typeof e.data === "object" && e.data
          ? ((e.data as { message?: string }).message ?? e.message)
          : e instanceof Error
            ? e.message
            : "Erro ao liberar";
      setModalErro(msg);
    } finally {
      setLiberando(false);
    }
  }

  const podeLiberar = Boolean(codCliente && cargoId);

  return (
    <>
      <PageHead
        eyebrow="Operação"
        title="Liberação Admissional"
        subtitle="Pré-admissões que chegaram pelo Pandapé e aguardam cliente e cargo. Atribua os dois para a admissão entrar na esteira."
      />

      {error && (
        <p
          className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
      {okMsg && (
        <p className="mb-5 rounded-xl border border-[var(--border)] bg-[rgba(46,158,99,0.12)] px-3 py-2 text-sm text-ok">
          {okMsg}
        </p>
      )}

      <GlassCard className="overflow-hidden p-2">
        <div className="ea-scroll overflow-x-auto">
          <table className="ds-table min-w-[900px]">
            <thead>
              <tr>
                <th>Candidato</th>
                <th className="w-[150px]">CPF</th>
                <th className="w-[130px]">Telefone</th>
                <th className="w-[120px]">Nascimento</th>
                <th className="w-[100px]">Sexo</th>
                <th className="w-[110px]">Chegada</th>
                <th className="w-[100px]">Parado (dias)</th>
                <th className="w-[110px]">Parado (horas)</th>
                <th className="w-[120px]">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint">
                    Carregando…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint">
                    Nenhuma pré-admissão aguardando liberação.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.admissaoId}>
                    <td className="font-semibold">
                      <span className="inline-flex items-center gap-2">
                        {r.candidatoNome}
                        {r.possivelDuplicata && (
                          <span
                            className="inline-flex items-center rounded-full border border-[rgba(234,88,12,0.35)] bg-[rgba(234,88,12,0.12)] px-2 py-0.5 text-[11px] font-semibold text-warn-2"
                            title="Já existe admissão viva deste CPF sem vaga comparável. Confirme se não é duplicata antes de liberar."
                          >
                            Possível duplicata
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[12.5px]">
                      {fmtCpf(r.candidatoCpf)}
                    </td>
                    <td className="whitespace-nowrap text-[12.5px]">
                      {r.telefone ?? "não informado"}
                    </td>
                    <td className="whitespace-nowrap text-[12.5px]">{fmtData(r.dataNascimento)}</td>
                    <td className="text-[12.5px]">
                      {r.sexo ? (ROTULO_SEXO[r.sexo] ?? r.sexo) : "não informado"}
                    </td>
                    <td className="whitespace-nowrap text-[12.5px]">{fmtData(r.criadoEm)}</td>
                    <td className="whitespace-nowrap text-[12.5px]">
                      {paradoDias(r.criadoEm, nowMs)}
                    </td>
                    <td className="whitespace-nowrap text-[12.5px]">
                      {paradoHoras(r.criadoEm, nowMs)}
                    </td>
                    <td>
                      <Button onClick={() => abrirModal(r)} className="w-full py-2">
                        Liberar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {alvo && (
        <Modal onClose={fecharModal} ariaLabel="Liberar admissão" className="max-w-[560px] p-6">
          <div className="mb-5">
            <div className="eyebrow !mb-1">Liberação Admissional</div>
            <h2 className="font-display text-xl font-bold">{alvo.candidatoNome}</h2>
            <p className="mt-0.5 font-mono text-[13px] text-dim">{fmtCpf(alvo.candidatoCpf)}</p>
          </div>

          {/* Cliente + cargo: o que ESTA OST entrega e a única trava de liberação. A próxima OST
              (pendências obrigatórias) adiciona campos ABAIXO deste bloco, sem refazer o modal. */}
          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <span className="ds-label">Cliente</span>
              <Select
                value={codCliente}
                onChange={setCodCliente}
                placeholder="Selecione o cliente…"
                ariaLabel="Cliente"
                searchable
                menuFit
                options={clientes.map((c) => ({ value: c.codCliente, label: rotuloCliente(c) }))}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="ds-label">Cargo</span>
              <Select
                value={cargoId}
                onChange={setCargoId}
                placeholder="Selecione o cargo…"
                ariaLabel="Cargo"
                searchable
                menuFit
                options={cargos.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </label>
            {/* PRÓXIMA OST (item 4): campos de pendências obrigatórias entram aqui, abaixo de
                cliente/cargo. A trava de liberação continua sendo só cliente+cargo. */}
          </div>

          {modalErro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {modalErro}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={fecharModal} disabled={liberando}>
              Cancelar
            </Button>
            <Button onClick={() => void liberar()} disabled={!podeLiberar || liberando}>
              {liberando ? "Liberando…" : "Liberar"}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
