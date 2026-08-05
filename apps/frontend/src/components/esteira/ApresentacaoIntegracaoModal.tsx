"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/Icon";
import { caixaAlta } from "@/lib/nome";

interface Apresentacao {
  candidato: string;
  contrato: {
    cargo: string | null;
    cliente: string | null;
    tipoContrato: string | null;
    dataAdmissao: string | null;
    matricula: string | null;
    salario: string | null;
    escala: string | null;
    localTrabalho: string | null;
    centroCusto: string | null;
    departamento: string | null;
    gestorBp: string | null;
    tempoContrato: string | null;
  };
  beneficios: { nome: string; valor: string | null }[];
  beneficiosTexto: string | null;
}

function fmtData(d?: string | null): string | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

function fmtDinheiro(v?: string | null): string | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

/** Uma linha do bloco. Valor ausente vira hífen discreto, no mesmo tom da tabela da aba. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)]/60 py-2 last:border-0">
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-faint">
        {rotulo}
      </span>
      <span className="min-w-0 truncate text-right text-sm text-text" title={valor ?? undefined}>
        {valor ?? <span className="text-faint/60">—</span>}
      </span>
    </div>
  );
}

/**
 * FICHA DE APRESENTAÇÃO DA INTEGRAÇÃO (olho da aba INTEGRAÇÃO). SOMENTE LEITURA.
 *
 * É o que o consultor mostra ao candidato no dia da integração: o que foi contratado e o que ele
 * recebe. Por isso o recorte é CURTO, contrato mais benefícios, e não a ficha completa da admissão,
 * que tem trilha, documentos, pausas e histórico que não se apresenta a ninguém.
 *
 * Não edita NADA de propósito: é tela de apresentação, e um campo editável aqui convidaria a alterar
 * contrato na frente do candidato. A edição continua onde sempre esteve, no Gerenciador.
 *
 * BENEFÍCIOS de duas fontes, porque a base tem as duas: o pacote ESTRUTURADO das admissões novas e o
 * texto ACHATADO das 2.188 importadas. Mostrar só o estruturado deixaria a ficha vazia para quase
 * toda a base atual, então o backend devolve o texto quando não há pacote.
 */
export function ApresentacaoIntegracaoModal({
  admissaoId,
  onClose,
}: {
  admissaoId: string;
  onClose: () => void;
}) {
  const { token } = useAuth();
  const [dados, setDados] = useState<Apresentacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    apiFetch<Apresentacao>(`/esteira/integracao/${admissaoId}/apresentacao`, { token })
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof ApiError ? e.message : "Falha ao carregar a ficha.");
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [admissaoId, token]);

  const c = dados?.contrato;

  return (
    <Modal onClose={onClose} ariaLabel="Ficha de apresentação da integração" className="max-w-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">Ficha Da Integração</h2>
          {dados && (
            <p className="mt-0.5 truncate text-sm text-faint" title={caixaAlta(dados.candidato)}>
              {caixaAlta(dados.candidato)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded-md p-1 text-faint transition hover:text-text"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-faint">Carregando…</div>
      ) : erro ? (
        <div className="px-5 py-10 text-center text-sm text-danger">{erro}</div>
      ) : !dados || !c ? (
        <div className="px-5 py-10 text-center text-sm text-faint">Ficha indisponível.</div>
      ) : (
        <div className="ea-scroll max-h-[70vh] overflow-auto px-5 py-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-text">Contrato De Trabalho</h3>
            <div className="rounded-lg border border-[var(--border)] px-4 py-1">
              <Linha rotulo="Cliente" valor={c.cliente} />
              <Linha rotulo="Cargo" valor={c.cargo} />
              <Linha rotulo="Tipo de contrato" valor={c.tipoContrato} />
              <Linha rotulo="Tempo de contrato" valor={c.tempoContrato} />
              <Linha rotulo="Data de admissão" valor={fmtData(c.dataAdmissao)} />
              <Linha rotulo="Salário" valor={fmtDinheiro(c.salario)} />
              <Linha rotulo="Escala" valor={c.escala} />
              <Linha rotulo="Local de trabalho" valor={c.localTrabalho} />
              <Linha rotulo="Centro de custo" valor={c.centroCusto} />
              <Linha rotulo="Departamento" valor={c.departamento} />
              <Linha rotulo="Gestor BP" valor={c.gestorBp} />
              <Linha rotulo="Matrícula" valor={c.matricula} />
            </div>
          </section>

          <section className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-text">Benefícios</h3>
            <div className="rounded-lg border border-[var(--border)] px-4 py-1">
              {dados.beneficios.length > 0 ? (
                dados.beneficios.map((b) => (
                  <Linha key={b.nome} rotulo={b.nome} valor={fmtDinheiro(b.valor) ?? "Concedido"} />
                ))
              ) : dados.beneficiosTexto ? (
                // Admissões importadas: o pacote veio achatado em texto, sem linha no catálogo.
                <p className="py-3 text-sm text-text">{dados.beneficiosTexto}</p>
              ) : (
                <p className="py-3 text-sm text-faint">Nenhum benefício cadastrado.</p>
              )}
            </div>
          </section>

          <p className="mt-4 text-xs text-faint">
            Visualização apenas. Alterações de contrato e benefícios são feitas no Gerenciador.
          </p>
        </div>
      )}
    </Modal>
  );
}
