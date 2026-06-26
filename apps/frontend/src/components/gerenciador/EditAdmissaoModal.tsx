"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";

interface VagaFolha {
  salario: string | null;
  beneficios: string | null;
  escala: string | null;
  centroCusto: string | null;
  departamento: string | null;
  gestorBp: string | null;
  motivo: string | null;
  tempoContrato: string | null;
  endereco: string | null;
}
interface AdmissaoEdit {
  admissaoId: string;
  tipoContrato: string | null;
  dataAdmissao: string | null;
  matricula: string | null;
  farolGlobal: string;
  vagaFolha: VagaFolha;
}

const FAROL_OPTS = [
  { value: "ATIVO", label: "Ativo" },
  { value: "DECLINOU", label: "Declinou" },
  { value: "RESCISAO", label: "Rescisão" },
  { value: "BANCO_PAUSADA", label: "Banco / pausada" },
];

const s = (v: string | null | undefined) => v ?? "";

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <span className="ds-label">{rotulo}</span>
      {children}
    </div>
  );
}

/**
 * F10 — edição de uma admissão (Gerenciador). Edita vaga/folha + contrato/data/matrícula/farol.
 * NÃO edita CPF nem cliente (identidade — §A.3). Persiste via PATCH /admissoes/:id.
 */
export function EditAdmissaoModal({
  admissaoId,
  candidatoNome,
  onClose,
  onSaved,
  camposFiltro,
}: {
  admissaoId: string;
  candidatoNome: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
  /** Chaves de campo a exibir (S2 — "preencher pendências"); ausente = formulário inteiro. */
  camposFiltro?: string[];
}) {
  const mostra = (campo: string) => !camposFiltro || camposFiltro.includes(campo);
  const verProcesso = ["tipoContrato", "dataAdmissao", "matricula", "farol"].some(mostra);
  const verFolha = [
    "salario",
    "escala",
    "centroCusto",
    "departamento",
    "gestorBp",
    "tempoContrato",
    "motivo",
    "beneficios",
    "endereco",
  ].some(mostra);
  const { token } = useAuth();
  const [data, setData] = useState<AdmissaoEdit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // form fields
  const [tipoContrato, setTipoContrato] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [matricula, setMatricula] = useState("");
  const [farol, setFarol] = useState("ATIVO");
  const [vf, setVf] = useState<VagaFolha>({
    salario: "",
    beneficios: "",
    escala: "",
    centroCusto: "",
    departamento: "",
    gestorBp: "",
    motivo: "",
    tempoContrato: "",
    endereco: "",
  });

  useEffect(() => {
    apiFetch<AdmissaoEdit>(`/admissoes/${admissaoId}`, { token })
      .then((r) => {
        setData(r);
        setTipoContrato(s(r.tipoContrato));
        setDataAdmissao(s(r.dataAdmissao).slice(0, 10));
        setMatricula(s(r.matricula));
        setFarol(r.farolGlobal);
        setVf({
          salario: s(r.vagaFolha.salario),
          beneficios: s(r.vagaFolha.beneficios),
          escala: s(r.vagaFolha.escala),
          centroCusto: s(r.vagaFolha.centroCusto),
          departamento: s(r.vagaFolha.departamento),
          gestorBp: s(r.vagaFolha.gestorBp),
          motivo: s(r.vagaFolha.motivo),
          tempoContrato: s(r.vagaFolha.tempoContrato),
          endereco: s(r.vagaFolha.endereco),
        });
      })
      .catch((e) =>
        setLoadError(e instanceof ApiError ? e.message : "Falha ao carregar a admissão."),
      );
  }, [admissaoId, token]);

  const setVfField = (k: keyof VagaFolha) => (v: string) => setVf((f) => ({ ...f, [k]: v }));

  async function salvar() {
    setBusy(true);
    setErro(null);
    try {
      await apiFetch(`/admissoes/${admissaoId}`, {
        method: "PATCH",
        token,
        body: {
          tipoContrato,
          dataAdmissao: dataAdmissao || "",
          matricula,
          farolGlobal: farol,
          vagaFolha: vf,
        },
      });
      onSaved(`Admissão de ${candidatoNome} atualizada.`);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-2xl" ariaLabel="Editar admissão">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow !mb-1">Editar admissão</div>
            <h3 className="truncate text-[18px] font-extrabold">{candidatoNome}</h3>
            <p className="psub !mb-0 mt-1">CPF e cliente não são editáveis (identidade).</p>
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

        {loadError ? (
          <p className="py-8 text-center text-sm text-danger">{loadError}</p>
        ) : !data ? (
          <p className="py-8 text-center text-sm text-faint">Carregando…</p>
        ) : (
          <div className="space-y-5">
            {camposFiltro && (
              <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-dim">
                Preenchendo apenas as pendências obrigatórias.
              </p>
            )}
            {verProcesso && (
            <section>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Processo</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {mostra("tipoContrato") && (
                <Campo rotulo="Tipo de contrato">
                  <input className="ds-input" value={tipoContrato} onChange={(e) => setTipoContrato(e.target.value)} />
                </Campo>
                )}
                {mostra("dataAdmissao") && (
                <Campo rotulo="Data de admissão">
                  <input type="date" className="ds-input" value={dataAdmissao} onChange={(e) => setDataAdmissao(e.target.value)} />
                </Campo>
                )}
                {mostra("matricula") && (
                <Campo rotulo="Matrícula">
                  <input className="ds-input" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
                </Campo>
                )}
                {mostra("farol") && (
                <Campo rotulo="Status (farol)">
                  <Select value={farol} onChange={setFarol} options={FAROL_OPTS} ariaLabel="Farol" />
                </Campo>
                )}
              </div>
            </section>
            )}

            {verFolha && (
            <section>
              <div className="mb-2 text-[11px] uppercase tracking-wide text-faint">Vaga / folha</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {mostra("salario") && (
                <Campo rotulo="Salário">
                  <input className="ds-input" inputMode="decimal" value={vf.salario ?? ""} onChange={(e) => setVfField("salario")(e.target.value)} placeholder="0,00" />
                </Campo>
                )}
                {mostra("escala") && (
                <Campo rotulo="Escala">
                  <input className="ds-input" value={vf.escala ?? ""} onChange={(e) => setVfField("escala")(e.target.value)} />
                </Campo>
                )}
                {mostra("centroCusto") && (
                <Campo rotulo="Centro de custo">
                  <input className="ds-input" value={vf.centroCusto ?? ""} onChange={(e) => setVfField("centroCusto")(e.target.value)} />
                </Campo>
                )}
                {mostra("departamento") && (
                <Campo rotulo="Departamento">
                  <input className="ds-input" value={vf.departamento ?? ""} onChange={(e) => setVfField("departamento")(e.target.value)} />
                </Campo>
                )}
                {mostra("gestorBp") && (
                <Campo rotulo="Gestor / BP">
                  <input className="ds-input" value={vf.gestorBp ?? ""} onChange={(e) => setVfField("gestorBp")(e.target.value)} />
                </Campo>
                )}
                {mostra("tempoContrato") && (
                <Campo rotulo="Tempo de contrato">
                  <input className="ds-input" value={vf.tempoContrato ?? ""} onChange={(e) => setVfField("tempoContrato")(e.target.value)} />
                </Campo>
                )}
                {mostra("motivo") && (
                <Campo rotulo="Motivo">
                  <input className="ds-input" value={vf.motivo ?? ""} onChange={(e) => setVfField("motivo")(e.target.value)} />
                </Campo>
                )}
              </div>
              <div className="mt-3 grid gap-3">
                {mostra("beneficios") && (
                <Campo rotulo="Benefícios">
                  <textarea className="ds-input min-h-[64px] resize-y" value={vf.beneficios ?? ""} onChange={(e) => setVfField("beneficios")(e.target.value)} />
                </Campo>
                )}
                {mostra("endereco") && (
                <Campo rotulo="Endereço">
                  <textarea className="ds-input min-h-[64px] resize-y" value={vf.endereco ?? ""} onChange={(e) => setVfField("endereco")(e.target.value)} />
                </Campo>
                )}
              </div>
            </section>
            )}

            {erro && <p className="text-sm text-danger">{erro}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button className="px-4 py-2.5" onClick={salvar} disabled={busy}>
                {busy ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        )}
    </Modal>
  );
}
