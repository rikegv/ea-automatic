"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { caixaAlta } from "@/lib/nome";

const TIPOS = [
  { value: "ONLINE", label: "Online" },
  { value: "PRESENCIAL", label: "Presencial" },
];

/**
 * AGENDAMENTO EM MASSA da integração (decisão do diretor).
 *
 * COMPONENTE SEPARADO do agendamento individual, de propósito (§A.26): o individual acabou de ser
 * validado e não pode regredir. Aqui as regras são OUTRAS, e misturar os dois num componente só
 * criaria ramos condicionais dentro de cada campo:
 *  - todos os campos são OBRIGATÓRIOS, porque o lote leva as frentes para AGENDADO de uma vez;
 *  - salvar AVANÇA o status, ao contrário do individual, onde o consultor avança pelo seletor;
 *  - existe o passo de confirmação de sobreposição, que o individual não tem.
 *
 * MULTI-CLIENTE por desenho: a seleção não trava por cliente, porque uma integração das 14h atende
 * gente de clientes diferentes.
 *
 * A SOBREPOSIÇÃO é decidida pelo BACKEND, não aqui. Ele devolve 409 com os nomes de quem já tem
 * agendamento, e só então a tela pede a confirmação expressa. Perguntar antes, na tela, obrigaria o
 * frontend a saber quem já tem agendamento e a confiar nesse cálculo, que é justamente o tipo de
 * regra que não deve morar na tela.
 */
export function AgendamentoIntegracaoLoteModal({
  admissaoIds,
  onClose,
}: {
  admissaoIds: string[];
  onClose: (salvou: boolean) => void;
}) {
  const { token } = useAuth();

  const [consultores, setConsultores] = useState<{ id: string; nome: string }[]>([]);
  const [data, setData] = useState("");
  const [horario, setHorario] = useState("");
  const [tipo, setTipo] = useState("");
  const [link, setLink] = useState("");
  const [consultorId, setConsultorId] = useState("");

  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Nomes devolvidos pelo backend quando há sobreposição. Enquanto houver, o botão pede confirmação. */
  const [sobrepostos, setSobrepostos] = useState<string[] | null>(null);

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    apiFetch<{ id: string; nome: string }[]>("/catalogos/consultores", { token })
      .then((lista) => {
        if (vivo) setConsultores(lista);
      })
      .catch(() => setConsultores([]));
    return () => {
      vivo = false;
    };
  }, [token]);

  const completo = Boolean(data && horario && tipo && consultorId);

  async function salvar(sobrescrever: boolean) {
    setSaving(true);
    setErro(null);
    try {
      await apiFetch("/esteira/integracao/agendamento-lote", {
        token,
        method: "POST",
        body: {
          admissaoIds,
          data,
          horario,
          tipo,
          // A MESMA URL vale para o grupo inteiro (decisão do diretor).
          link: tipo === "ONLINE" && link ? link : undefined,
          consultorId,
          sobrescrever,
        },
      });
      onClose(true);
    } catch (e) {
      // 409 com `reason: "sobreposicao"` não é erro: é o pedido de confirmação expressa.
      const corpo = e instanceof ApiError ? (e.data as { reason?: string; nomes?: string[] }) : null;
      if (corpo?.reason === "sobreposicao") {
        setSobrepostos(corpo.nomes ?? []);
      } else {
        setErro(e instanceof ApiError ? e.message : "Falha ao agendar o lote.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={() => onClose(false)}
      ariaLabel="Agendamento em massa da integração"
      className="max-w-lg"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text">Agendar Em Massa</h2>
          <p className="mt-0.5 text-sm text-faint">
            {admissaoIds.length} candidato{admissaoIds.length > 1 ? "s" : ""} selecionado
            {admissaoIds.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onClose(false)}
          aria-label="Fechar"
          className="rounded-md p-1 text-faint transition hover:text-text"
        >
          <Icon name="x" className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-faint">Data</span>
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="ds-input w-full"
              aria-label="Data da integração"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-faint">Horário</span>
            <input
              type="time"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              className="ds-input w-full"
              aria-label="Horário da integração"
            />
          </label>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Tipo</span>
          <Select
            value={tipo}
            onChange={(v) => setTipo(v)}
            options={TIPOS}
            placeholder="Selecionar…"
            ariaLabel="Tipo da integração"
            menuFit
          />
        </div>


        {/* LINK só no ONLINE (decisão do diretor). Opcional: a sala costuma ser criada depois de
            marcada a data, então exigir aqui travaria o agendamento por um dado que ainda não
            existe. Trocar para Presencial limpa o link no backend. */}
        {tipo === "ONLINE" && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-faint">
              Link da reunião <span className="text-faint/70">(opcional)</span>
            </span>
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://meet.google.com/..."
              className="ds-input w-full"
              aria-label="Link da reunião online"
            />
          </label>
        )}

        <div>
          <span className="mb-1 block text-xs font-medium text-faint">Consultor responsável</span>
          <Select
            value={consultorId}
            onChange={(v) => setConsultorId(v)}
            options={consultores.map((c) => ({ value: c.id, label: c.nome }))}
            placeholder="Selecionar…"
            ariaLabel="Consultor responsável pela integração"
            searchable
            menuFit
          />
        </div>

        <p className="text-xs text-faint">
          Os mesmos dados são aplicados a todos os selecionados, que passam a Agendado. Candidatos de
          clientes diferentes podem ser agendados juntos.
        </p>

        {/* ALERTA DE SOBREPOSIÇÃO: lista os NOMES e exige confirmação expressa. Sem ela, o backend
            não sobrescreve nada. */}
        {sobrepostos && (
          <div
            className="rounded-xl border border-[var(--border)] bg-[rgba(214,142,69,0.12)] px-3 py-3"
            role="alert"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-warn">
              <Icon name="alert" className="h-4 w-4" />
              {sobrepostos.length} já {sobrepostos.length > 1 ? "têm" : "tem"} agendamento
            </p>
            <ul className="mt-2 max-h-40 overflow-auto text-sm text-text">
              {sobrepostos.map((n) => (
                <li key={n} className="truncate py-0.5">
                  {caixaAlta(n)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-faint">
              Confirmar substitui a data, o horário, o tipo e o consultor atuais deles.
            </p>
          </div>
        )}

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={() => onClose(false)} disabled={saving}>
            Cancelar
          </Button>
          {sobrepostos ? (
            <Button onClick={() => void salvar(true)} disabled={saving}>
              {saving ? "Aplicando…" : "Confirmar e sobrescrever"}
            </Button>
          ) : (
            <Button onClick={() => void salvar(false)} disabled={saving || !completo}>
              {saving ? "Agendando…" : "Agendar"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
