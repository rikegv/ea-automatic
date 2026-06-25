"use client";

import { useState } from "react";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

const ABAS = ["Auditoria", "Exame", "Cadastro / Contrato"];

const FAROL_KPIS = [
  { value: 53, label: "Na frente", color: undefined as string | undefined },
  { value: 31, label: "Documentação completa", color: "var(--ok)" },
  { value: 18, label: "Pendência de documento", color: "var(--warn)" },
  { value: 4, label: "Aguardando reenvio", color: "var(--danger)" },
];

interface Linha {
  nome: string;
  recebido: string;
  cliente: string;
  cargo: string;
  status: string;
  tone: PillTone;
}

// Dados MOCK — casca visual. A operação real dos faróis (F8/F12) é de OST posterior.
const LINHAS: Linha[] = [
  { nome: "Alessandra A. de Freitas", recebido: "recebido há 2 dias", cliente: "PETZ", cargo: "Ajudante Geral", status: "Análise ok", tone: "ok" },
  { nome: "Marcos Guilherme Molinari", recebido: "recebido há 1 dia", cliente: "Blue Skies", cargo: "Operador", status: "Pendente", tone: "wn" },
  { nome: "Cláudio N. Miranda", recebido: "recebido hoje", cliente: "AutoZone", cargo: "Estoquista", status: "Aguard. reenvio", tone: "dg" },
  { nome: "Patrícia Souza Lima", recebido: "recebido há 3 dias", cliente: "BMB Obramax", cargo: "Vendedora", status: "Análise ok", tone: "ok" },
];

export default function EsteiraPage() {
  const [aba, setAba] = useState(0);

  return (
    <>
      <PageHead
        eyebrow="Esteira admissional"
        title="Faróis por frente"
        subtitle="Cada frente opera de forma independente. Todos os consultores enxergam todas."
      />

      <div className="mb-[22px] flex gap-2">
        {ABAS.map((a, i) => (
          <button key={a} type="button" className={cn("tab", i === aba && "active")} onClick={() => setAba(i)}>
            <span className="dot" />
            {a}
          </button>
        ))}
      </div>

      <div className="mb-[22px] grid grid-cols-2 gap-[14px] xl:grid-cols-4">
        {FAROL_KPIS.map((k) => (
          <GlassCard key={k.label} className="fk">
            <div className="num" style={k.color ? { color: k.color } : undefined}>
              {k.value}
            </div>
            <div className="lbl">{k.label}</div>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="list">
        <div className="list-head">
          <span>Candidato</span>
          <span>Cliente</span>
          <span>Cargo</span>
          <span>Status</span>
          <span />
        </div>
        {LINHAS.map((l) => (
          <div key={l.nome} className="row">
            <div>
              <div className="nm">{l.nome}</div>
              <div className="meta">{l.recebido}</div>
            </div>
            <div className="meta">{l.cliente}</div>
            <div className="meta">{l.cargo}</div>
            <div>
              <Pill tone={l.tone}>{l.status}</Pill>
            </div>
            <div className="go">
              <Icon name="arr" width={18} height={18} />
            </div>
          </div>
        ))}
      </GlassCard>
    </>
  );
}
