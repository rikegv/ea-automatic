"use client";

/**
 * TROCAR A VAGA DA CANDIDATURA (item 5 do diretor), só para MASTER e SUPER_ADMIN.
 *
 * ┌─ CORRIGIR NÃO É RECOMEÇAR, e é essa a distinção que este modal existe para deixar clara ────┐
 * │ O "Trazer De Volta" cria uma candidatura NOVA e devolve a pessoa para a Captação: é o        │
 * │ caminho de quem RECOMEÇA um processo encerrado. Esta tela conserta a MESMA candidatura, que  │
 * │ só estava anotada na vaga errada, e por isso MANTÉM A ETAPA em que a pessoa já está.         │
 * │                                                                                             │
 * │ A tela DIZ isso em palavras, e não só faz: sem o aviso, os dois caminhos parecem o mesmo     │
 * │ botão com nomes diferentes, e quem escolher errado ou perde o histórico ou duplica a linha.  │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O SELETOR OFERECE SÓ VAGA ABERTA, porque `vagaRecebeCandidato` barra FECHADA, CANCELADA e
 * ENTREGUE no backend. Oferecer o que a rota vai recusar é convidar o erro.
 *
 * AS MENSAGENS DE TRAVA VÊM DO BACKEND, PRONTAS. As quatro (vaga encerrada, vaga cheia com alguém
 * que ocupa posição, pessoa já viva no destino, candidatura encerrada) já explicam o que aconteceu e
 * o que fazer. Reescrevê-las aqui daria duas versões da mesma regra, e a da tela envelheceria antes.
 *
 * O `@Roles("MASTER","SUPER_ADMIN")` DA ROTA É A AUTORIDADE. Este componente nem chega a ser
 * renderizado para consultor comum, mas se chegasse, a rota devolveria 403 do mesmo jeito.
 *
 * §A.11 (sem travessão), §A.24 (title case no título; o botão é AÇÃO e segue escrita normal).
 */

import { useState } from "react";
import {
  CANDIDATURA_ETAPA_LABEL,
  type AsCandidaturaItem,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { mensagemDoErro, trocarVagaDaCandidatura } from "@/lib/as-candidatos";

export function TrocarVagaModal({
  candidatura,
  vagasAbertas,
  token,
  onClose,
  onTrocado,
}: {
  candidatura: AsCandidaturaItem;
  vagasAbertas: VagaListItem[];
  token: string | null;
  onClose: () => void;
  onTrocado: () => void;
}) {
  const [vagaId, setVagaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // A VAGA ATUAL SAI DA LISTA: trocar para onde já se está não é troca, e o backend recusa. Tirar a
  // opção é melhor que oferecê-la para depois explicar por que ela não valia.
  const opcoes = vagasAbertas
    .filter((v) => v.id !== candidatura.vagaId)
    .map((v) => ({
      value: v.id,
      label: v.nomeDivulgacao ?? v.codigo ?? "Vaga sem nome de divulgação",
      hint: v.clienteNome ?? v.codigo ?? undefined,
    }));

  async function salvar() {
    if (!vagaId) return;
    setErro(null);
    setSalvando(true);
    try {
      await trocarVagaDaCandidatura(candidatura.id, vagaId, motivo.trim() || undefined, token);
      onTrocado();
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao trocar a vaga desta candidatura."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-[620px] p-0" ariaLabel="Trocar a vaga da candidatura">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Trocar Vaga</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {candidatura.candidatoNome} está em{" "}
            <b>{candidatura.vagaNome ?? candidatura.vagaCodigo ?? "vaga sem nome"}</b>. A troca
            corrige a vaga desta mesma candidatura e{" "}
            <b>mantém a etapa {CANDIDATURA_ETAPA_LABEL[candidatura.etapa]}</b>, sem abrir processo
            novo.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-dim">
                Vaga de destino <span className="text-danger">*</span>
              </span>
              <Combobox
                value={vagaId}
                onChange={setVagaId}
                options={opcoes}
                placeholder="Escolha a vaga certa"
                ariaLabel="Vaga de destino"
                searchable
                limpavel
              />
              <span className="text-[11.5px] text-faint">
                Só vaga aberta recebe candidato. Se a pessoa já estiver aprovada, a vaga de destino
                precisa ter posição livre.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] text-dim">Motivo</span>
              <textarea
                className="ds-input min-h-[70px] resize-y"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Opcional. Por que a vaga estava errada."
              />
              <span className="text-[11.5px] text-faint">
                A troca fica registrada na linha do tempo da ficha com quem fez e quando, mesmo sem
                motivo escrito.
              </span>
            </label>

            {/* O AVISO QUE SEPARA OS DOIS CAMINHOS. Sem ele, "Trocar Vaga" e "Trazer De Volta"
                parecem o mesmo botão com nomes diferentes. */}
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[12.5px] text-dim">
              Isto <b>corrige</b> a alocação, não recomeça o processo: a candidatura é a mesma, o
              histórico segue inteiro e a etapa não volta para a Captação. Para recomeçar do zero,
              o caminho é Trazer De Volta, na linha de quem já saiu.
            </p>

            {erro && (
              <p
                className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
                role="alert"
              >
                {erro}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="px-4 py-2.5" onClick={() => void salvar()} disabled={!vagaId || salvando}>
            Trocar vaga
          </Button>
        </div>
      </div>
    </Modal>
  );
}
