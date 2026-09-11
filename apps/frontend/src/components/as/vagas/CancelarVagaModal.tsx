"use client";

/**
 * ─ CANCELAR VAGA: O ENCERRAMENTO QUE NÃO É ENTREGA ────────────────────────────────────────────
 *
 * FECHAR E CANCELAR SÃO DOIS FATOS DIFERENTES, e é por isso que este formulário não é o do
 * fechamento com outro título. Fechar é a vaga que ACABOU (quantas posições entregaram, com qual
 * salário, quando a pessoa começa). Cancelar é a vaga que NÃO VAI ACONTECER, e a única pergunta que
 * importa é POR QUÊ: o cliente desistiu, a demanda caiu, a posição foi remanejada. Perguntar
 * "quantas vagas fechadas" a quem está cancelando seria pedir o número de uma entrega que não houve.
 *
 * O MOTIVO É OBRIGATÓRIO E VEM DE CATÁLOGO, nunca de texto livre. Motivo digitado à mão vira seis
 * grafias da mesma coisa em três meses e não responde a pergunta que o cancelamento existe para
 * responder ("por que estas vagas caem?"). A OBSERVAÇÃO é o campo livre, e ela é opcional: é ali que
 * o caso específico é contado, sem contaminar a classificação.
 *
 * O SELETOR É O `Select` DO DESIGN SYSTEM, com busca (§A.35). O catálogo é do diretor e cresce; o
 * `<select>` cru abriria o dropdown do sistema operacional, que não obedece ao tema.
 *
 * §A.41: O MODAL NÃO FECHA AO CLICAR FORA (a regra mora no `ui/Modal`, e vale para os 58 usos). A
 * saída é o "Voltar" ou o "Cancelar a vaga", e as duas são visíveis no rodapé.
 *
 * ┌─ O CUIDADO COM O VERBO, e ele não é preciosismo ──────────────────────────────────────────────┐
 * │ Um botão "Cancelar" no rodapé de um modal cuja AÇÃO é "cancelar a vaga" é ambiguidade pronta:  │
 * │ os dois botões passariam a se chamar quase a mesma coisa, um desistindo e o outro executando.  │
 * │ Por isso o de desistir chama "Voltar", que é o único verbo que não colide com o assunto da     │
 * │ tela. §A.24: botão é AÇÃO, então escrita normal; o TÍTULO é que leva title case.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: catálogo de processo, data e texto do consultor. Nenhum dado de candidato entra aqui.
 * §A.11 (sem travessão), §A.24 (title case no título; botão é ação, escrita normal).
 */

import { CANDIDATURA_SITUACAO_LABEL, type AsMotivoCancelamentoVaga } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import {
  avisoDeProcessosEncerrados,
  type AsVagaCancelamentoPrevia,
} from "@/lib/as-vaga-cancelamento";

export interface CancelamentoForm {
  motivo: string;
  observacao: string;
  dataCancelamento: string;
}

export function CancelarVagaModal({
  vagaRotulo,
  codigo,
  form,
  motivos,
  carregandoMotivos,
  previa,
  previaFalhou,
  erro,
  cancelando,
  onChange,
  onVoltar,
  onConfirmar,
}: {
  vagaRotulo: string;
  /** Nulo no rascunho, e a tela diz "não informado" (§A.11) em vez de deixar a frase pela metade. */
  codigo: string | null;
  form: CancelamentoForm;
  /** Só os ATIVOS: quem foi inativado no catálogo não volta a ser escolhido, e o histórico fica. */
  motivos: AsMotivoCancelamentoVaga[];
  carregandoMotivos: boolean;
  /**
   * QUANTOS PROCESSOS DAQUELA VAGA JÁ ACABARAM (peça 1 da onda B3). Nulo enquanto a leitura está no
   * ar, e a tela NÃO desenha "carregando" no lugar: este bloco é complemento da decisão, e um
   * esqueleto piscando acima do formulário chamaria mais atenção do que a informação que ele traz.
   */
  previa: AsVagaCancelamentoPrevia | null;
  /**
   * A LEITURA FALHOU, E ISSO SE DIZ. Sumir em silêncio deixaria o consultor achando que a vaga não
   * tem processo encerrado nenhum, que é uma afirmação que ninguém fez. O cancelamento segue
   * disponível: o aviso INFORMA, não trava, e isso vale inclusive quando ele não consegue informar.
   */
  previaFalhou: boolean;
  erro: string | null;
  cancelando: boolean;
  onChange: (f: CancelamentoForm) => void;
  onVoltar: () => void;
  onConfirmar: () => void;
}) {
  const opcoes = motivos.map((m) => ({ value: m.nome, label: m.nome }));
  // O MOTIVO É A ÚNICA TRAVA DA TELA, e ela é espelho: quem recusa motivo vazio é o backend. Aqui
  // ela existe para o botão não oferecer uma ida ao servidor que já se sabe recusada.
  const podeConfirmar = Boolean(form.motivo) && Boolean(form.dataCancelamento) && !cancelando;
  /* A FRASE NÃO É ESCRITA AQUI, e o porquê está inteiro em `avisoDeProcessosEncerrados`: ela pode
     MENTIR (chamar de perda quem foi aprovado e enviado para a admissão), então ela é uma régua com
     teste, e não três ternários dentro de um componente. Nulo quer dizer "não há o que dizer". */
  const aviso = avisoDeProcessosEncerrados(previa);

  return (
    <Modal onClose={onVoltar} className="max-w-[560px] p-6" ariaLabel="Cancelar vaga">
      <div className="mb-5">
        <div className="eyebrow !mb-1">Atração e Seleção</div>
        <h2 className="text-lg font-semibold text-text">Cancelar Vaga</h2>
        <p className="mt-1 text-[12.5px] text-dim">
          {vagaRotulo}, código {codigo ?? "não informado"}. A vaga passa a Cancelada, sai das filas
          de trabalho e continua consultável no histórico com o motivo registrado.
        </p>
      </div>

      {/* ── O QUE JÁ ACONTECEU NESTA VAGA, ANTES DO CLIQUE (peça 1 da onda B3) ──────────────
          INFORMA, NÃO TRAVA (pedido do diretor): nada aqui desabilita o botão, muda a régua ou
          pede confirmação. É contexto para uma decisão que continua sendo do consultor.

          ELE FICA ACIMA DO FORMULÁRIO porque é o que se lê ANTES de escolher o motivo, e não uma
          nota de rodapé depois de a pessoa já ter decidido. Abaixo dos campos, ele chegaria tarde.

          O TOM É NEUTRO, e isso é escolha: `--surface-2` com o ícone de informação, e não o
          amarelo de atenção. Processo que já terminou não é problema nem risco, é fato, e pintar
          de amarelo ensinaria o time a ler alarme onde só há contexto. O amarelo desta tela é do
          forçamento, que é o único gesto com efeito irreversível. */}
      {aviso && (
        <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <Icon name="alert" className="mt-[3px] h-3.5 w-3.5 flex-none text-accent" />
            <div>
              <p className="text-[12.5px] leading-snug text-text">{aviso.frase}</p>
              <p className="mt-1 text-[12px] leading-snug text-dim">{aviso.nota}</p>
              {/* A QUEBRA, COM O RÓTULO DO VOCABULÁRIO E A COR DA SITUAÇÃO. É ela que responde
                  "terminou como?", e é dela que a frase acima foi derivada: as duas nunca
                  discordam porque saem do mesmo lugar. */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {aviso.linhas.map((l) => (
                  <StatusPill
                    key={l.situacao}
                    tone={tomDaSituacao(l.situacao)}
                    label={`${CANDIDATURA_SITUACAO_LABEL[l.situacao]}: ${l.quantos}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* A LEITURA QUE NÃO VOLTOU. Dito em tom apagado, e sem role de alerta: não conseguir contar
          não é erro do cancelamento, e o formulário abaixo continua inteiro. */}
      {previaFalhou && (
        <p className="mb-5 text-[12px] text-faint">
          Não foi possível conferir quantos processos desta vaga já terminaram. O cancelamento
          continua disponível.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-dim">
            Motivo do cancelamento
            <span className="ml-1 text-danger">*</span>
          </span>
          <Select
            className="w-full"
            ariaLabel="Motivo do cancelamento"
            placeholder={carregandoMotivos ? "Carregando os motivos…" : "Escolha o motivo"}
            value={form.motivo}
            options={opcoes}
            disabled={cancelando || carregandoMotivos}
            /* §A.35: busca ligada, e não deixada para o automático dos 8 itens. O catálogo é do
               diretor e cresce; ligar depois seria lembrar de voltar aqui no dia em que crescer. */
            searchable
            onChange={(v) => onChange({ ...form, motivo: v })}
          />
          {/* O CATÁLOGO VAZIO É DITO, e não escondido atrás de um seletor que não abre nada: sem
              motivo cadastrado o cancelamento não acontece, e quem lê precisa saber o caminho. */}
          {!carregandoMotivos && opcoes.length === 0 && (
            <span className="text-[12px] text-warn">
              Nenhum motivo de cancelamento está cadastrado. Cadastre em Menu Gerencial, Motivos De
              Cancelamento De Vaga.
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-dim">Observação</span>
          <textarea
            className="ds-input min-h-[74px] resize-y"
            value={form.observacao}
            disabled={cancelando}
            placeholder="O que aconteceu neste caso, se houver algo a registrar"
            onChange={(e) => onChange({ ...form, observacao: e.target.value })}
          />
          <span className="text-[12px] text-faint">
            Opcional. O motivo classifica, a observação conta o caso.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] text-dim">
            Data do cancelamento
            <span className="ml-1 text-danger">*</span>
          </span>
          {/* §A.35: `input type="date"` é controle do navegador, não lista de opção, e continua
              nativo como nos demais formulários desta tela. */}
          <input
            type="date"
            className="ds-input"
            value={form.dataCancelamento}
            disabled={cancelando}
            onChange={(e) => onChange({ ...form, dataCancelamento: e.target.value })}
          />
        </label>
      </div>

      {erro && (
        <p
          className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {erro}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onVoltar} disabled={cancelando}>
          Voltar
        </Button>
        <Button type="button" onClick={onConfirmar} disabled={!podeConfirmar}>
          {cancelando ? "Cancelando…" : "Cancelar a vaga"}
        </Button>
      </div>
    </Modal>
  );
}
