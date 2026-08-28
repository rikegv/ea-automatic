"use client";

/**
 * OS CANDIDATOS VINCULADOS A UMA VAGA (item 6 do diretor), no sentido vaga para pessoa.
 *
 * ┌─ POR QUE ELE EXISTE, e por que não é o modal que já havia ──────────────────────────────────┐
 * │ A Central de Vagas já tinha o `CandidatosPendentesModal`, e ele NÃO serve aqui: aquele é a   │
 * │ fila de TRABALHO do encerramento (só quem está EM SELEÇÃO, com botões de tratar cada um) e   │
 * │ só nasce a partir do 409 da trava 5. Este responde outra pergunta, de consulta: "quem está    │
 * │ nesta vaga, em que etapa e com que desfecho", incluindo quem já saiu. Fundir os dois faria a  │
 * │ fila de encerramento listar gente já tratada, que é exatamente o que ela existe para não      │
 * │ fazer.                                                                                       │
 * │                                                                                              │
 * │ O QUE É REUSADO É A LEITURA, que é o que importa: a MESMA rota `GET /as/candidatos/vaga/:id`  │
 * │ (`painelDaVaga`) que a Central de Candidatos já usa para montar as colunas de funil. Nenhuma  │
 * │ consulta nova, nenhum campo novo no backend.                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6, E É POR ISSO QUE A LEITURA É ESTA E NÃO A BUSCA DE CANDIDATOS: o painel da vaga devolve
 * nome, etapa e situação e NÃO devolve CPF. Puxar a ficha de cada pessoa para enriquecer a lista
 * traria o CPF da vaga inteira para o navegador, desfazendo a minimização que o backend construiu.
 * Quem precisa da ficha abre a Central De Candidatos, uma pessoa por vez.
 *
 * A ETAPA SÓ APARECE ENQUANTO A CANDIDATURA ESTÁ VIVA (peça P1 do bug 1), pela mesma razão da
 * listagem: a coluna congela no último lugar em que a pessoa esteve, e mostrá-la depois do desfecho
 * desenharia o descartado dentro do funil.
 *
 * §A.11 (sem travessão), §A.24 (title case no título e nas etiquetas; o botão é AÇÃO).
 */

import { useCallback, useEffect, useState } from "react";
import {
  CANDIDATURA_ETAPA_LABEL,
  CANDIDATURA_SITUACAO_LABEL,
  candidaturaViva,
  type AsCandidaturaItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { mensagemDoErro, painelDaVaga } from "@/lib/as-candidatos";
import { tomDaEtapa, tomDaSituacao } from "@/lib/as-candidatos-visual";

export function CandidatosDaVagaModal({
  vagaId,
  vagaRotulo,
  token,
  onClose,
}: {
  vagaId: string;
  vagaRotulo: string;
  token: string | null;
  onClose: () => void;
}) {
  const [lista, setLista] = useState<AsCandidaturaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const p = await painelDaVaga(vagaId, token);
      setLista(p.candidaturas);
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar os candidatos desta vaga."));
    } finally {
      setCarregando(false);
    }
  }, [vagaId, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // VIVOS PRIMEIRO, e é a ordem que a pergunta pede: quem está no processo agora interessa mais que
  // quem saiu, e quem saiu continua visível logo abaixo em vez de desaparecer da consulta.
  const ordenada = [...lista].sort((a, b) => {
    const va = candidaturaViva(a.situacao) ? 0 : 1;
    const vb = candidaturaViva(b.situacao) ? 0 : 1;
    return va !== vb ? va - vb : a.candidatoNome.localeCompare(b.candidatoNome, "pt-BR");
  });

  const vivos = ordenada.filter((c) => candidaturaViva(c.situacao)).length;

  return (
    <Modal onClose={onClose} className="max-w-[760px] p-0" ariaLabel="Candidatos vinculados à vaga">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Candidatos Vinculados</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {carregando
              ? `Carregando quem está em ${vagaRotulo}.`
              : lista.length === 0
                ? `${vagaRotulo} ainda não tem candidato vinculado.`
                : `${vagaRotulo} tem ${lista.length} ${lista.length === 1 ? "candidatura" : "candidaturas"}, sendo ${vivos} no processo. Quem já saiu continua na lista, como histórico.`}
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {erro && (
            <p
              className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}

          {!carregando && lista.length === 0 && !erro && (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 text-[13px] text-dim">
              Ninguém foi alocado nesta vaga ainda. A alocação é feita na Central De Candidatos.
            </p>
          )}

          {ordenada.length > 0 && (
            <ul className="flex flex-col gap-2">
              {ordenada.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
                >
                  <span className="text-[13.5px] font-semibold text-text">{c.candidatoNome}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {candidaturaViva(c.situacao) ? (
                      <StatusPill tone={tomDaEtapa(c.etapa)} label={CANDIDATURA_ETAPA_LABEL[c.etapa]} />
                    ) : (
                      <StatusPill tone="nt" label="Fora Do Funil" />
                    )}
                    <StatusPill
                      tone={tomDaSituacao(c.situacao)}
                      label={CANDIDATURA_SITUACAO_LABEL[c.situacao]}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-none justify-end border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
