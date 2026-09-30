"use client";

/**
 * ─ A CONFIRMAÇÃO DE "ADOTAR O PANDAPÉ", e por que ela é obrigatória ────────────────────────────
 *
 * "Manter o EA" só fecha a linha: não escreve nada no dado, então errar ali custa reabrir a fila.
 * "Adotar o Pandapé" faz o oposto, e é isso que este painel existe para dizer em palavras: ele
 * APLICA A MUDANÇA DE VERDADE, pelo caminho normal do sistema (a pessoa é movida de etapa, a vaga
 * dela é TROCADA, ou o número de posições da vaga é alterado), com autor e com trilha. Os dois
 * valores aparecem lado a lado, de onde para onde, porque quem confirma tem de ver o que vai ser
 * substituído, não só o nome do campo.
 *
 * TROCAR, e não alocar de novo: a adoção da vaga do candidato MOVE a candidatura que existe, em vez
 * de abrir uma segunda viva, que era a duplicata que esta fila existe para matar. É por isso que o
 * texto abaixo fala em passar de um valor para o outro, e nunca em criar processo novo.
 *
 * §A.41: o painel NÃO fecha ao clicar fora (o `ui/Modal` da casa já não fecha), sai pelo "Cancelar"
 * ou pelo botão de confirmação, e não ganha "X" no cabeçalho. Escape continua fechando.
 * §A.6: os dois valores exibidos são código, rótulo de vaga ou número. Nenhum dado pessoal.
 */

import type { DivergenciaDaIngestaoItem } from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { NAO_INFORMADO, valorExibido } from "@/lib/divergencias-ingestao";

export function AdotarDivergenciaModal({
  item,
  ocupado,
  onCancelar,
  onConfirmar,
}: {
  item: DivergenciaDaIngestaoItem;
  ocupado: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  return (
    <Modal onClose={onCancelar} className="max-w-xl" ariaLabel="Adotar O Pandapé">
      <div className="mb-4 flex items-center gap-2">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico)] text-accent">
          <Icon name="alert" className="h-4 w-4" />
        </span>
        {/* §A.24: é TÍTULO, então title case. */}
        <h3 className="!mb-0">Adotar O Pandapé</h3>
      </div>

      <p className="mb-3 text-sm text-dim">
        Confirmar aplica a mudança de verdade no sistema. O valor do Pandapé passa a valer no EA pelo
        caminho normal, com o seu nome como autor e com registro na trilha. Enquanto você não
        confirmar, nada é alterado: até aqui o EA venceu e nenhum dado foi sobrescrito.
      </p>

      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
          {item.campoRotulo}
        </p>
        <p className="mb-2 text-sm text-dim">
          {item.candidatoNome ?? NAO_INFORMADO}
          {item.vagaNome ? `, na vaga ${item.vagaNome}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 font-semibold">
            {valorExibido(item.valorEa)}
          </span>
          <Icon name="right" className="h-4 w-4 flex-none text-dim" aria-hidden="true" />
          <span className="rounded-lg border border-[var(--accent)] bg-[var(--surface-2)] px-2.5 py-1 font-semibold text-accent">
            {valorExibido(item.valorAts)}
          </span>
        </div>
        <p className="mt-2 text-[12px] text-faint">
          O que está hoje no EA, à esquerda, passa a ser o valor do Pandapé, à direita.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        {/* §A.41: saída visível. Texto de BOTÃO é ação, escrita normal (§A.24). */}
        <Button variant="secondary" onClick={onCancelar} disabled={ocupado} className="px-5 py-2.5">
          Cancelar
        </Button>
        <Button onClick={onConfirmar} disabled={ocupado} className="px-5 py-2.5">
          {ocupado ? "Aplicando…" : "Adotar o Pandapé"}
        </Button>
      </div>
    </Modal>
  );
}
