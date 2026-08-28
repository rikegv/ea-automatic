"use client";

/**
 * CANDIDATOS PENDENTES AO ENCERRAR A VAGA: a recusa vira uma FILA DE TRABALHO, e não um aviso.
 *
 * POR QUE ESTE MODAL EXISTE. A vaga não fecha com gente EM SELEÇÃO dentro (trava do backend), e quem
 * foi entrevistado e nunca soube do resultado sumiria junto com a vaga. Só que uma frase do tipo
 * "há 3 candidatos pendentes" manda o consultor procurar quem são, em outra tela, e voltar. Por isso
 * a recusa chega como 409 ESTRUTURADO, com a LISTA dos pendentes: aqui ele trata cada um ALI MESMO,
 * a linha sai da lista, e quando a lista zera ele fecha a vaga sem sair da tela.
 *
 * A ORDEM DA LISTA É DO BACKEND, da etapa mais avançada para a mais inicial: quem está na Aprovação
 * é o mais caro de esquecer, e quem está na Captação é o descarte em massa que se faz por último.
 *
 * ┌─ O CASO DA VAGA CHEIA, e é o motivo de este arquivo traduzir UMA mensagem ───────────────────┐
 * │ Aprovar (ou contratar) daqui de dentro esbarra na trava de posições quando a vaga já está     │
 * │ cheia, e o backend responde: "Esta vaga tem N posições e as N já estão preenchidas. Reprove   │
 * │ alguém ou aumente as posições da vaga." A frase está CERTA onde nasceu e fica AMBÍGUA aqui:   │
 * │ "reprove" não é verbo de botão nenhum do sistema (as saídas se chamam Descartado, Desistiu e  │
 * │ Contratado), e "aumente as posições" é conselho ruim para quem está ENCERRANDO, ainda mais    │
 * │ porque a edição de posições recusa vaga encerrada. Então a TELA traduz para o contexto dela. A │
 * │ mensagem do backend NÃO é alterada: ela continua correta no lugar de origem, e todas as outras │
 * │ travas seguem exibindo o texto do backend, sem reescrita.                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a lista traz nome, etapa e os ids. Sem CPF, sem contato, sem identificador direto.
 * §A.11 (sem travessão), §A.24 (title case no título e nas tags; botão é AÇÃO e segue escrita normal).
 */

import { useState } from "react";
import {
  CANDIDATURA_ETAPA_LABEL,
  type AsCandidaturaPendente,
  type CandidaturaEtapa,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  aprovarCandidatura,
  ehTravaDeVagaCheia,
  mensagemDoErro,
  registrarSaida,
} from "@/lib/as-candidatos";
import { tomDaEtapa } from "@/lib/as-candidatos-visual";

/** O texto próprio DESTA tela para a vaga cheia. Ver o bloco no topo do arquivo. */
const VAGA_CHEIA =
  "A vaga já está com todas as posições preenchidas. Para encerrar, registre este candidato como Descartado ou Desistiu.";

type Acao = "APROVAR" | "CONTRATADO" | "DESCARTADO" | "DESISTIU";

/**
 * O MOTIVO PASSOU A SER OBRIGATÓRIO NOS TRÊS DESFECHOS (ajuste 7 do diretor), e esta tela precisou
 * acompanhar por NECESSIDADE, não por simetria: ela é a SEGUNDA porta das mesmas três operações, e o
 * DTO agora recusa desfecho sem motivo. "Contratar" deixou de disparar no clique aqui pelo mesmo
 * motivo, e passou a abrir o campo como os outros dois; sem isso, tratar alguém por este caminho
 * voltaria 400 no meio do encerramento da vaga.
 *
 * `APROVAR` CONTINUA IMEDIATO: aprovar não é desfecho de saída, não tem motivo no contrato da rota e
 * nada nele mudou.
 */
const PLACEHOLDER: Record<Exclude<Acao, "APROVAR">, string> = {
  DESCARTADO: "Por que esta pessoa foi descartada",
  DESISTIU: "O que a pessoa disse ao desistir",
  CONTRATADO: "Para qual posição, e o que fechou a contratação",
};

const ACAO_ROTULO: Record<Exclude<Acao, "APROVAR">, string> = {
  DESCARTADO: "Registrar descarte",
  DESISTIU: "Registrar desistência",
  CONTRATADO: "Registrar contratação",
};

export function CandidatosPendentesModal({
  vagaRotulo,
  pendentes,
  token,
  fechando,
  onClose,
  onTratou,
  onFecharVaga,
}: {
  vagaRotulo: string;
  pendentes: AsCandidaturaPendente[];
  token: string | null;
  /** O fechamento da vaga está em voo (estado da página, que é quem manda o formulário). */
  fechando: boolean;
  onClose: () => void;
  /** Alguém foi tratado: a página recarrega a listagem de vagas, para os números acompanharem. */
  onTratou: () => void;
  /** A lista zerou e o consultor mandou fechar: reenvia o MESMO formulário de fechamento. */
  onFecharVaga: () => void;
}) {
  // A LISTA VIVE AQUI. Ela nasce da resposta do backend e encolhe a cada tratamento, para o
  // consultor ver o trabalho diminuindo sem precisar refazer a tentativa de fechamento.
  const [lista, setLista] = useState<AsCandidaturaPendente[]>(pendentes);
  const [acao, setAcao] = useState<{ id: string; tipo: Acao } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<{ id: string; texto: string } | null>(null);

  function escolher(id: string, tipo: Acao) {
    setErro(null);
    setMotivo("");
    setAcao(acao?.id === id && acao.tipo === tipo ? null : { id, tipo });
  }

  async function executar(p: AsCandidaturaPendente, tipo: Acao) {
    setErro(null);
    setOcupado(true);
    try {
      if (tipo === "APROVAR") {
        await aprovarCandidatura(p.candidaturaId, token);
      } else {
        await registrarSaida(p.candidaturaId, tipo, motivo.trim(), token);
      }
      setLista((atual) => atual.filter((x) => x.candidaturaId !== p.candidaturaId));
      setAcao(null);
      setMotivo("");
      onTratou();
    } catch (err) {
      const bruta = mensagemDoErro(err, "Falha ao tratar este candidato.");
      // A ÚNICA tradução do arquivo: a frase da vaga cheia, que fica ambígua neste contexto.
      setErro({ id: p.candidaturaId, texto: ehTravaDeVagaCheia(bruta) ? VAGA_CHEIA : bruta });
    } finally {
      setOcupado(false);
    }
  }

  const zerou = lista.length === 0;

  return (
    <Modal onClose={onClose} className="max-w-[720px] p-0" ariaLabel="Candidatos pendentes">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Candidatos Pendentes</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {zerou
              ? `Todos os candidatos de ${vagaRotulo} foram tratados. A vaga já pode ser encerrada.`
              : `${vagaRotulo} ainda tem ${lista.length} ${lista.length === 1 ? "candidato em seleção" : "candidatos em seleção"}. Trate cada um aqui mesmo, e a vaga encerra em seguida.`}
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {zerou ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
              Ninguém ficou pendurado no funil. Ninguém desta vaga segue esperando resposta.
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {lista.map((p) => (
                <li
                  key={p.candidaturaId}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-[13px] font-semibold text-text">{p.candidatoNome}</span>
                      <StatusPill
                        tone={tomDaEtapa(p.etapa as CandidaturaEtapa)}
                        label={CANDIDATURA_ETAPA_LABEL[p.etapa]}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Aprovar e Contratar consomem posição, e é por isso que os dois podem
                          esbarrar na vaga cheia. Descartar e Desistiu nunca esbarram. */}
                      <MiniBotao
                        rotulo="Aprovar"
                        ativo={false}
                        disabled={ocupado}
                        onClick={() => void executar(p, "APROVAR")}
                      />
                      <MiniBotao
                        rotulo="Contratar"
                        ativo={acao?.id === p.candidaturaId && acao.tipo === "CONTRATADO"}
                        disabled={ocupado}
                        onClick={() => escolher(p.candidaturaId, "CONTRATADO")}
                      />
                      <MiniBotao
                        rotulo="Descartar"
                        ativo={acao?.id === p.candidaturaId && acao.tipo === "DESCARTADO"}
                        disabled={ocupado}
                        onClick={() => escolher(p.candidaturaId, "DESCARTADO")}
                      />
                      <MiniBotao
                        rotulo="Desistiu"
                        ativo={acao?.id === p.candidaturaId && acao.tipo === "DESISTIU"}
                        disabled={ocupado}
                        onClick={() => escolher(p.candidaturaId, "DESISTIU")}
                      />
                    </div>
                  </div>

                  {acao?.id === p.candidaturaId && acao.tipo !== "APROVAR" && (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-[12.5px] text-dim">
                            Motivo
                            <span className="ml-1 text-danger">*</span>
                          </span>
                          <textarea
                            className="ds-input min-h-[62px] resize-y"
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder={PLACEHOLDER[acao.tipo]}
                          />
                        </label>
                        <div className="mt-2.5 flex justify-end">
                          <Button
                            className="px-4 py-2"
                            disabled={ocupado || motivo.trim().length < 2}
                            onClick={() => void executar(p, acao.tipo)}
                          >
                            {ACAO_ROTULO[acao.tipo]}
                          </Button>
                        </div>
                      </div>
                  )}

                  {erro?.id === p.candidaturaId && (
                    <p
                      className="mt-3 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
                      role="alert"
                    >
                      {erro.texto}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={fechando}>
            Cancelar
          </Button>
          <Button
            className="px-4 py-2.5"
            disabled={!zerou || fechando}
            onClick={onFecharVaga}
            title={zerou ? undefined : "Trate todos os candidatos para encerrar a vaga"}
          >
            {fechando ? "Fechando…" : "Fechar a vaga"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MiniBotao({
  rotulo,
  ativo,
  disabled,
  onClick,
}: {
  rotulo: string;
  ativo: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={ativo}
      className={
        ativo
          ? "rounded-lg border border-[var(--accent)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] font-semibold text-text disabled:opacity-50"
          : "rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] text-dim transition hover:border-[var(--border-strong)] hover:text-text disabled:opacity-50"
      }
    >
      {rotulo}
    </button>
  );
}
