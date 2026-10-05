"use client";

/**
 * EXCLUIR VAGA: só SUPER_ADMIN, e só a vaga sem candidatura nem shortlist (frente do CRUD da vaga
 * liberada, `docs/MAPA-CRUD-VAGA-LIBERADA.md`, seção 4 e emenda E-6).
 *
 * A CAIXA LÊ A PRÉVIA ANTES DE OFERECER O BOTÃO. Vaga com gente dentro não se exclui (o banco
 * recusa por RESTRICT, ninguém some em silêncio), e a tela diz quantas candidaturas e shortlists a
 * seguram, com "Fechar" como única saída. Vaga vinda do Pandapé pode RENASCER pela varredura, e o
 * aviso é destacado antes da confirmação (decisão 4: permitido, com aviso).
 *
 * QUEM VÊ O BOTÃO é decidido na Central de Vagas (`isSuperAdmin`). A autoridade é o servidor, que
 * recusa o DELETE de quem não é SUPER_ADMIN mesmo que alguém burle a tela.
 *
 * §A.41: modal de confirmação, sai por "Cancelar" ou pelo botão que exclui; no caminho em que não
 * pode excluir, é de leitura e sai por "Fechar". Nunca por clique fora.
 * §A.11 (sem travessão), §A.24 (título em title case; botão é ação, escrita normal).
 * §A.6: só contagens e o rótulo da vaga. Nenhum dado de candidato.
 */

import { useCallback, useEffect, useState } from "react";
import type { AsVagaExclusaoPrevia, VagaListItem } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { mensagemDoErro } from "@/lib/as-candidatos";
import { exclusaoPrevia, excluirVaga } from "@/lib/as-vaga-edicao";

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

export function ExcluirVagaModal({
  vaga,
  token,
  onFechar,
  onExcluida,
}: {
  vaga: VagaListItem;
  token: string | null;
  onFechar: () => void;
  /** A vaga saiu do banco. A Central de Vagas fecha o painel e relê a lista. */
  onExcluida: () => void;
}) {
  const [previa, setPrevia] = useState<AsVagaExclusaoPrevia | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPrevia(await exclusaoPrevia(vaga.id, token));
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao conferir se a vaga pode ser excluída."));
    } finally {
      setCarregando(false);
    }
  }, [vaga.id, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function confirmar() {
    if (excluindo || !previa?.podeExcluir) return;
    setExcluindo(true);
    setErroExcluir(null);
    try {
      await excluirVaga(vaga.id, token);
      onExcluida();
    } catch (err) {
      // A frase do servidor, inteira: ele recusa com o motivo (gente que entrou no meio, papel).
      setErroExcluir(mensagemDoErro(err, "Falha ao excluir a vaga."));
    } finally {
      setExcluindo(false);
    }
  }

  const rotulo = vaga.nomeDivulgacao ?? "Vaga Sem Nome";
  const podeExcluir = !!previa?.podeExcluir;

  return (
    <Modal
      /* Enquanto exclui, nem o Escape interrompe: a escrita já está a caminho do servidor. */
      onClose={excluindo ? () => undefined : onFechar}
      className="max-w-[560px] p-6"
      ariaLabel="Excluir vaga"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[rgba(214,69,69,0.12)] text-danger">
          <Icon name="trash" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Excluir Vaga</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            <span className="font-semibold text-text">{rotulo}</span>, código{" "}
            {vaga.codigo ?? "não informado"}.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {carregando && (
          <p className="text-[13px] text-faint">Conferindo se a vaga pode ser excluída.</p>
        )}

        {erro && (
          <p
            className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3.5 py-3 text-[13px] text-danger"
            role="alert"
          >
            {erro}
          </p>
        )}

        {previa && !carregando && !erro && !previa.podeExcluir && (
          <p
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-[12.5px] leading-snug text-dim"
            role="status"
          >
            Esta vaga tem {plural(previa.candidaturas, "candidatura", "candidaturas")} e{" "}
            {plural(previa.shortlists, "shortlist", "shortlists")}, e por isso não pode ser
            excluída. Para tirá-la do trabalho, cancele ou feche a vaga.
          </p>
        )}

        {previa && !carregando && !erro && previa.podeExcluir && (
          <>
            {previa.voltaPelaVarredura && (
              <p
                className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[rgba(245,196,81,0.12)] px-3.5 py-3 text-[12.5px] leading-snug text-warn"
                role="alert"
              >
                <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none" aria-hidden />
                <span>
                  Esta vaga veio do Pandapé. Se ela ainda estiver ativa lá, a varredura a recria na
                  fila de revisão em até 30 minutos.
                </span>
              </p>
            )}
            <p className="text-[12.5px] leading-snug text-dim">
              A exclusão é definitiva: a vaga sai da Central de Vagas e o registro de quem excluiu
              fica guardado.
            </p>
          </>
        )}

        {erroExcluir && (
          <p
            className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3.5 py-3 text-[13px] text-danger"
            role="alert"
          >
            {erroExcluir}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        {podeExcluir ? (
          <>
            <Button type="button" variant="secondary" onClick={onFechar} disabled={excluindo}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="[background:var(--danger)] !text-white"
              onClick={() => void confirmar()}
              disabled={excluindo || carregando || !podeExcluir}
            >
              {excluindo ? "Excluindo…" : "Excluir vaga"}
            </Button>
          </>
        ) : (
          <Button type="button" variant="secondary" onClick={onFechar}>
            Fechar
          </Button>
        )}
      </div>
    </Modal>
  );
}
