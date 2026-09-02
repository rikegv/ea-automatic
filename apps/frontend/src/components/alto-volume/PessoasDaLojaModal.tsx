"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

/**
 * QUEM ESTÁ NESTA LOJA, no projeto (pedido do diretor, 02/09/2026).
 *
 * O painel responde "quantos", e a pergunta seguinte é sempre "quem". Até aqui, para descobrir, era
 * preciso sair do Alto Volume, abrir o Gerenciador e filtrar. O modal responde no lugar onde a
 * pergunta nasce.
 *
 * TRÊS FRENTES, e só elas: AUDITORIA, EXAME e CADASTRO. Integração e iFractal ficam de fora por
 * decisão do diretor, porque acontecem depois de a pessoa já estar contratada, e este painel é sobre
 * encher a vaga.
 *
 * FRENTE NULA é diferente de frente pendente: o Cadastro só nasce quando Auditoria e Exame fecham
 * (regra 3 do domínio), então antes disso ele não existe, e a tela diz "não começou" em vez de
 * inventar um status.
 *
 * §A.11: sem travessão. §A.24: títulos e tags em Title Case.
 */

interface EstadoFrente {
  rotulo: string;
  concluida: boolean;
}

interface Pessoa {
  admissaoId: string;
  nome: string;
  cargo: string | null;
  dataAdmissao: string | null;
  farol: string;
  frentes: {
    AUDITORIA: EstadoFrente | null;
    EXAME: EstadoFrente | null;
    CADASTRO_CONTRATO: EstadoFrente | null;
  };
}

const FRENTES: { chave: keyof Pessoa["frentes"]; rotulo: string }[] = [
  { chave: "AUDITORIA", rotulo: "Auditoria" },
  { chave: "EXAME", rotulo: "Exame" },
  { chave: "CADASTRO_CONTRATO", rotulo: "Cadastro" },
];

/** Data pura, sem fuso: `2026-09-15` vira `15/09/2026` sem passar por `Date` (que recuaria um dia). */
function dataBr(iso: string | null): string {
  if (!iso) return "não informado";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : "não informado";
}

function Frente({ estado }: { estado: EstadoFrente | null }) {
  if (!estado) return <span className="text-faint">não começou</span>;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        estado.concluida
          ? "bg-[rgba(120,190,60,0.15)] text-[var(--ok)]"
          : "bg-[var(--surface-2)] text-dim"
      }`}
    >
      {estado.rotulo}
    </span>
  );
}

export function PessoasDaLojaModal({
  projetoId,
  loja,
  onClose,
}: {
  projetoId: string;
  /** `null` é a linha Sem Loja: quem está no projeto sem loja vinculada. */
  loja: string | null;
  onClose: () => void;
}) {
  const [pessoas, setPessoas] = useState<Pessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let cancelado = false;
    const q = loja === null ? "" : `?loja=${encodeURIComponent(loja)}`;
    apiFetch<Pessoa[]>(`/admin/alto-volume/${projetoId}/lojas/pessoas${q}`)
      .then((r) => {
        if (!cancelado) setPessoas(r);
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível carregar as pessoas desta loja.");
      });
    return () => {
      cancelado = true;
    };
  }, [projetoId, loja]);

  const termo = busca.trim().toLowerCase();
  const visiveis = (pessoas ?? []).filter(
    (p) => !termo || p.nome.toLowerCase().includes(termo) || (p.cargo ?? "").toLowerCase().includes(termo),
  );

  return (
    <Modal onClose={onClose} ariaLabel="Pessoas da loja" className="max-w-[900px] p-6">
      <div className="mb-4">
        <div className="eyebrow !mb-1">Alto Volume</div>
        <h2 className="font-display text-xl font-bold">{loja ?? "Sem Loja"}</h2>
        <p className="mt-1 text-[13px] text-dim">
          {loja
            ? "Quem está vinculado a este projeto nesta loja, com o andamento de cada frente."
            : "Quem está vinculado a este projeto sem loja na ficha. Vincular a loja certa na ficha da pessoa tira ela desta lista."}
        </p>
      </div>

      {/* BUSCA por nome ou cargo: a lista de uma loja grande passa de trinta linhas, e rolar até
          achar é o atrito que este modal existe para eliminar. */}
      {(pessoas?.length ?? 0) > 8 && (
        <input
          className="ds-input mb-3"
          placeholder="Buscar por nome ou cargo"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          aria-label="Buscar pessoa"
        />
      )}

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
      {!pessoas && !erro && <p className="text-sm text-dim">carregando</p>}

      {pessoas && pessoas.length === 0 && (
        <p className="py-6 text-center text-faint">
          Ninguém vinculado a este projeto {loja ? "nesta loja" : "sem loja"} ainda.
        </p>
      )}

      {pessoas && pessoas.length > 0 && (
        <div className="max-h-[440px] overflow-auto rounded-xl border border-[var(--border)]">
          <table className="ds-table w-full text-sm">
            <thead>
              <tr>
                <th className="text-center">Candidato</th>
                <th className="text-center">Cargo</th>
                <th className="text-center">Data Adm.</th>
                {FRENTES.map((f) => (
                  <th key={f.chave} className="text-center">
                    {f.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.admissaoId}>
                  <td className="font-semibold">{p.nome}</td>
                  <td className="text-dim">
                    {p.cargo ?? <span className="text-faint">não informado</span>}
                  </td>
                  <td className="text-center tabular-nums">{dataBr(p.dataAdmissao)}</td>
                  {FRENTES.map((f) => (
                    <td key={f.chave} className="text-center">
                      <Frente estado={p.frentes[f.chave]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pessoas && termo && visiveis.length === 0 && (
        <p className="py-4 text-center text-faint">Nenhuma pessoa encontrada para essa busca.</p>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-sm text-dim">
          {visiveis.length}
          {termo && pessoas ? ` de ${pessoas.length}` : ""} pessoa
          {visiveis.length === 1 ? "" : "s"}
        </span>
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
