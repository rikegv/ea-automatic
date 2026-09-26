"use client";

/**
 * ─ REPROVADO PELO CLIENTE: a pessoa volta para a etapa inicial (Frente E, ponto 12) ────────────
 *
 * ┌─ POR QUE ISTO NÃO É "MOVER PARA A CAPTAÇÃO" ────────────────────────────────────────────────┐
 * │ O EFEITO é parecido (a pessoa volta ao começo do funil), o FATO não: "voltou para Captação" e │
 * │ "o cliente reprovou, voltou para Captação" são coisas diferentes para quem lê o histórico da  │
 * │ vaga seis meses depois. Por isso o evento ganha MARCADOR próprio na linha do tempo, e por     │
 * │ isso o gesto tem porta própria, e não um card a mais no seletor de etapas.                    │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * REPROVAR NÃO ENCERRA NINGUÉM: a pessoa segue VIVA, volta ao começo do funil e pode ser
 * apresentada de novo. É por isso que o tom é de atenção, e não de perigo, e é por isso que o
 * motivo é OPCIONAL: exigir texto aqui só faria o consultor escrever "reprovado" toda vez, que é
 * ruído e não trilha.
 *
 * O DESTINO NÃO É ESCOLHIDO AQUI. Ele é a etapa marcada `inicial` no catálogo, resolvida no
 * servidor. Um seletor de destino faria deste gesto um segundo "mover etapa" com nome bonito, e a
 * pessoa poderia ser "reprovada pelo cliente" para qualquer lugar do funil.
 *
 * A RÉGUA FINA (estar numa etapa de ENTREGA AO CLIENTE) MORA NO SERVIDOR, que é quem conhece a
 * marca `entrega_ao_cliente` do catálogo: ela NÃO é publicada para a tela por rota nenhuma. Quando
 * a etapa não serve, a recusa de lá já diz o que fazer, com todas as letras, e é ela que aparece
 * aqui dentro.
 *
 * §A.41: modal de preenchimento, com Cancelar e a ação, e ele NÃO fecha ao clicar fora.
 * §A.24 (title case no título; botão é ação), §A.11 (sem travessão).
 * §A.6: id de candidatura e um texto de processo. Nenhum dado pessoal novo.
 */

import { useState } from "react";
import type { AsCandidaturaItem } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { mensagemDoErro, reprovarPeloCliente } from "@/lib/as-candidatos";

export function ReprovarPeloClienteModal({
  candidatura,
  token,
  onCancelar,
  onFeito,
}: {
  candidatura: AsCandidaturaItem;
  token: string | null;
  onCancelar: () => void;
  onFeito: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function registrar() {
    setErro(null);
    setSalvando(true);
    try {
      await reprovarPeloCliente(candidatura.id, motivo.trim() || undefined, token);
      onFeito();
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao registrar a reprovação pelo cliente."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      onClose={onCancelar}
      className="max-w-[560px] p-0"
      ariaLabel="Registrar Reprovação Pelo Cliente"
    >
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Registrar Reprovação Pelo Cliente</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {candidatura.candidatoNome} volta para a etapa inicial do funil e continua no processo:
            ela pode ser apresentada de novo. A reprovação fica marcada no histórico, com quem
            registrou.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-dim">O que o cliente disse (opcional)</span>
            <textarea
              className="ds-input min-h-[90px] w-full resize-y"
              value={motivo}
              disabled={salvando}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="O que o cliente disse ao reprovar"
              aria-label="O que o cliente disse ao reprovar"
            />
          </label>
          <p className="mt-2 text-[11.5px] text-faint">
            O texto é opcional e entra no rastro da candidatura. O registro vale para quem está numa
            etapa de entrega ao cliente.
          </p>

          {erro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={onCancelar}
            disabled={salvando}
          >
            Cancelar
          </Button>
          <Button className="px-4 py-2.5" disabled={salvando} onClick={() => void registrar()}>
            {salvando ? "Registrando…" : "Registrar reprovação"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
