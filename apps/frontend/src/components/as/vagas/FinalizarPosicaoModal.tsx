"use client";

/**
 * ─ FINALIZAR A POSIÇÃO: "esta vaga foi entregue com o candidato X" (etapa 5) ──────────────────
 *
 * ┌─ O QUE ELE RESOLVE ─────────────────────────────────────────────────────────────────────────┐
 * │ O cilindro de posições da vaga contava a ENTREGA, e nada na tela sabia entregar: o número só  │
 * │ subia pelo campo digitado no fechamento. Aqui a entrega vira um gesto do processo, no lugar   │
 * │ onde ela acontece, com a pessoa e a vaga na frente.                                           │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ALOCAR NÃO É ENCERRAR, e a tela precisa dizer isso com todas as letras: o candidato alocado
 * PREENCHE a posição e CONTINUA no funil. A frase que explica cada situação vem de
 * `CANDIDATURA_SITUACAO_AJUDA`, o vocabulário compartilhado, e NÃO é reescrita aqui: `ALOCADO` e
 * `ENVIADO_PARA_ADMISSAO` são vizinhos, parecidos e fáceis de trocar, e trocar um pelo outro grava no
 * banco um fato que não aconteceu. Duas redações da mesma diferença divergem no primeiro ajuste.
 *
 * ─ POR QUE O LADO É ESCOLHIDO EM DOIS CARTÕES, e não num seletor ────────────────────────────────
 *
 * A escolha tem só DUAS opções e cada uma carrega um NÚMERO que decide a resposta ("oficial: 1 de 5
 * preenchidas", "banco: 0 de 20"). Num seletor recolhido, esses números só apareceriam depois de
 * abrir a lista, que é exatamente quando eles deixam de ajudar. Os cartões são o mesmo desenho do
 * seletor de etapa do funil, então nenhum padrão novo entra no sistema por causa desta tela. Nenhum
 * `<select>` cru é usado em ponto nenhum deste arquivo (§A.35).
 *
 * ─ O AVISO DO BANCO: AVISA, NÃO BLOQUEIA (decisão do diretor) ───────────────────────────────────
 *
 * Alocar no banco enquanto sobra posição OFICIAL é decisão legítima e cara de reverter. O backend
 * recusa a PRIMEIRA tentativa com um 409 estruturado que diz QUANTAS oficiais continuam abertas, a
 * tela pergunta com o número na frente, e o consultor decide. A ciência volta no corpo e o backend
 * grava o log do aceite. O consultor é quem decide, e o número é o que impede a confirmação de virar
 * clique automático.
 *
 * §A.6: nada de PII neste arquivo. O que trafega é o id da candidatura, o lado da posição e um
 * booleano de ciência; o nome do candidato já veio no painel e não é enviado a lugar nenhum.
 * §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação, escrita normal).
 */

import { useState } from "react";
import {
  CANDIDATURA_SITUACAO_AJUDA,
  CANDIDATURA_SITUACAO_LABEL,
  type AsCandidaturaItem,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  bancoPrecisaCiencia,
  finalizarPosicaoDaCandidatura,
  mensagemDoErro,
  type AsBancoPrecisaCiencia,
} from "@/lib/as-candidatos";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import {
  POSICAO_LADOS,
  POSICAO_LADO_LABEL,
  metaDoLado,
  oficiaisAbertas,
  preenchidasDoLado,
  type PosicaoLado,
} from "@/lib/as-vaga-acoes";
import { ConfirmarBancoModal } from "@/components/as/vagas/ConfirmarBancoModal";
import { cn } from "@/lib/cn";

export function FinalizarPosicaoModal({
  candidatura,
  vaga,
  token,
  onClose,
  onFeito,
}: {
  candidatura: AsCandidaturaItem;
  vaga: VagaListItem;
  token: string | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  /**
   * O LADO NASCE `OFICIAL`, que é o caso comum e o que o backend assume quando o campo não vem. Não
   * nasce vazio de propósito: um estado sem escolha obrigaria um clique a mais em toda entrega normal
   * para dizer o óbvio, e a reserva continua sendo uma decisão explícita, com aviso próprio.
   */
  const [lado, setLado] = useState<PosicaoLado>("OFICIAL");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O aviso do banco. Enquanto ele existe, a pergunta está na tela e NADA foi gravado. */
  const [aviso, setAviso] = useState<AsBancoPrecisaCiencia | null>(null);

  const abertas = oficiaisAbertas(vaga);

  /**
   * A ENTREGA, E A SEGUNDA TENTATIVA QUE É A MESMA ENTREGA.
   *
   * A primeira vai SEMPRE sem a ciência, que é o que faz o aviso existir. A segunda leva o campo
   * porque o consultor clicou no ciente, e não porque a tela decidiu insistir.
   */
  async function finalizar(ciente = false) {
    setErro(null);
    setSalvando(true);
    try {
      await finalizarPosicaoDaCandidatura(candidatura.id, token, {
        lado,
        cienteBancoComOficiaisAbertas: ciente,
      });
      setAviso(null);
      onFeito();
    } catch (err) {
      // O AVISO DO BANCO É PERGUNTA, não erro: vira diálogo de ciência com o número na frente.
      const pergunta = bancoPrecisaCiencia(err);
      if (pergunta) {
        setAviso(pergunta);
        return;
      }
      // As demais recusas (vaga cheia, meta ausente, candidatura já encerrada) chegam com a frase
      // pronta do backend e seguem sendo erro seco: não há "confirmar mesmo assim" para elas.
      setAviso(null);
      setErro(mensagemDoErro(err, "Falha ao finalizar a posição."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-[620px] p-0" ariaLabel="Finalizar a posição da vaga">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Finalizar Posição</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            Esta vaga é entregue com {candidatura.candidatoNome}. Escolha de qual lado da meta a
            posição sai.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {/* QUEM É A PESSOA E ONDE ELA ESTÁ AGORA. Sem esta linha, "finalizar posição" seria uma
              decisão tomada sobre um nome no cabeçalho, sem a situação de onde ela parte. */}
          <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3">
            <span className="text-[13.5px] font-semibold text-text">
              {candidatura.candidatoNome}
            </span>
            <StatusPill
              tone={tomDaSituacao(candidatura.situacao)}
              label={CANDIDATURA_SITUACAO_LABEL[candidatura.situacao]}
            />
          </div>

          <Secao titulo="De Qual Lado Da Meta">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {POSICAO_LADOS.map((l) => {
                const meta = metaDoLado(vaga, l);
                const feitas = preenchidasDoLado(vaga, l);
                const escolhido = l === lado;
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={salvando}
                    aria-pressed={escolhido}
                    onClick={() => setLado(l)}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border px-3.5 py-3 text-left transition",
                      escolhido
                        ? "border-[var(--accent)] bg-[var(--surface-2)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
                      salvando && "opacity-60",
                    )}
                  >
                    <span className="flex items-start justify-between gap-1.5">
                      <span className="text-[13px] font-semibold leading-tight text-text">
                        {POSICAO_LADO_LABEL[l]}
                      </span>
                      {escolhido && (
                        <Icon name="check" className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
                      )}
                    </span>
                    {/* O NÚMERO DE CADA LADO, lido da MESMA régua que enche o cilindro da tabela.
                        Meta ausente é dita como ausência (§A.11), e não como zero: vaga sem meta é
                        vaga que ninguém dimensionou, e o backend recusa a entrega com frase própria. */}
                    <span className="block text-[11.5px] text-faint">
                      {meta === null
                        ? "meta não informada"
                        : `${feitas} de ${meta} ${meta === 1 ? "posição preenchida" : "posições preenchidas"}`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* O AVISO ANTES DO CLIQUE, quando ele já é previsível. O número é o MESMO que o backend
                mede (a ocupação oficial contra a meta oficial), então a tela não inventa uma segunda
                conta: ela adianta a que existe. Quem decide continua sendo o 409, medido dentro da
                transação, e é a ele que a confirmação responde. */}
            {lado === "BANCO" && abertas !== null && abertas > 0 && (
              <p className="mt-2.5 rounded-xl border border-[var(--border)] bg-[rgba(214,168,69,0.12)] px-3 py-2 text-[12px] text-dim">
                Esta vaga ainda tem {abertas}{" "}
                {abertas === 1 ? "posição oficial aberta" : "posições oficiais abertas"}. Alocar no
                banco deixa a posição oficial em aberto, e o sistema vai pedir a sua confirmação.
              </p>
            )}
          </Secao>

          {/* ─ A DIFERENÇA ENTRE ALOCADO E ENVIADO PARA ADMISSÃO, DITA ANTES DA DECISÃO ─────────
              As duas frases vêm de `CANDIDATURA_SITUACAO_AJUDA`, no vocabulário compartilhado. É a
              única forma de a tela de vagas e a de candidatos explicarem a mesma coisa do mesmo
              jeito, e de a explicação acompanhar o dia em que o modelo mudar. */}
          <Secao titulo="O Que Muda Para Esta Pessoa">
            <ul className="flex flex-col gap-2">
              <Ajuda situacao="ALOCADO" />
              <Ajuda situacao="ENVIADO_PARA_ADMISSAO" />
            </ul>
            <p className="mt-2 text-[12px] text-faint">
              Finalizar a posição não envia ninguém para a admissão. O envio é o passo seguinte, e é
              feito em Mover de etapa.
            </p>
          </Secao>

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
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button className="px-4 py-2.5" disabled={salvando} onClick={() => void finalizar(false)}>
            {salvando ? "Finalizando…" : "Finalizar posição"}
          </Button>
        </div>
      </div>

      {/* A CIÊNCIA DO BANCO, no MESMO desenho do outro 409 com ciência deste módulo (a reentrada em
          vaga encerrada): amarelo de atenção, a frase do backend inteira e o botão que assume a
          decisão. O `ConfirmDialog` do design system não serve aqui porque os tons dele são o check
          verde e o alerta vermelho, e este aviso não é nem uma coisa nem outra. */}
      {aviso && (
        <ConfirmarBancoModal
          aviso={aviso}
          candidatoNome={candidatura.candidatoNome}
          confirmando={salvando}
          onCancelar={() => setAviso(null)}
          onCiente={() => void finalizar(true)}
        />
      )}
    </Modal>
  );
}

/** Uma frase de ajuda do vocabulário compartilhado, com a etiqueta da situação ao lado. */
function Ajuda({ situacao }: { situacao: "ALOCADO" | "ENVIADO_PARA_ADMISSAO" }) {
  return (
    <li className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5">
      <span className="inline-flex">
        <StatusPill
          tone={tomDaSituacao(situacao)}
          label={CANDIDATURA_SITUACAO_LABEL[situacao]}
        />
      </span>
      <span className="text-[12.5px] leading-snug text-dim">
        {CANDIDATURA_SITUACAO_AJUDA[situacao]}
      </span>
    </li>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">{titulo}</h3>
      {children}
    </section>
  );
}
