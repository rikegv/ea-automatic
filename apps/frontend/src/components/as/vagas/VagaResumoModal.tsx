"use client";

/**
 * O DESCRITIVO DA VAGA, SOBREPOSTO À FICHA DO CANDIDATO (ajuste 4 do diretor).
 *
 * ┌─ O QUE MUDOU, E POR QUE ISSO IMPORTA NA TRIAGEM ────────────────────────────────────────────┐
 * │ ANTES o "Ver vaga" NAVEGAVA para a Central de Vagas, e navegar custa o contexto inteiro: o   │
 * │ consultor está no meio de uma triagem, com a ficha aberta, e sair para conferir o horário    │
 * │ obriga a voltar e reabrir tudo. Agora o descritivo chega POR CIMA, e fechar devolve a ficha  │
 * │ exatamente como ela estava.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE MODAL NÃO BUSCA NADA, e é de propósito: a Central de Candidatos já carrega `GET /as/vagas`
 * para montar as colunas de cliente e cargo, então a vaga inteira JÁ ESTÁ em memória. Criar uma rota
 * `GET /as/vagas/:id` só para isto seria uma segunda fonte do mesmo dado, e uma ida ao servidor para
 * buscar o que a tela tem na mão.
 *
 * É UM RESUMO, E ASSUME ISSO. O diretor foi explícito: aqui fica o que a triagem precisa (horário,
 * local, salário, benefícios, escolaridade, requisitos), e quem quiser o detalhe completo vai à
 * Central de Vagas pelo rodapé. Clonar a tela inteira aqui dentro criaria uma segunda versão do
 * descritivo, que envelheceria no primeiro campo novo que a vaga ganhasse.
 *
 * O EMPILHAMENTO É POR ORDEM DE DOM, e não por z-index novo: o `Modal` do sistema é `z-[55]` fixo, e
 * dois irmãos no mesmo nível empilham pelo que vem depois. Este é renderizado DEPOIS do modal da
 * ficha, dentro dele, então ele fica por cima sem que ninguém precise inventar um `z-[56]` que a
 * próxima sobreposição teria de superar de novo.
 *
 * §A.11 (sem travessão, "não informado" na célula vazia), §A.24 (title case no título e nos rótulos).
 */

import {
  VAGA_STATUS_LABEL,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/StatusPill";
import { tomDoStatusVaga } from "@/lib/as-candidatos-visual";

/** Uma linha de dado. `null` e vazio caem no mesmo "não informado" (§A.11). */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  const texto = valor && valor.trim() ? valor : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11.5px] uppercase tracking-wide text-faint">{rotulo}</span>
      <span className={texto ? "text-[13.5px] text-text" : "text-[13.5px] text-faint"}>
        {texto ?? "não informado"}
      </span>
    </div>
  );
}

/** Reais a partir da forma canônica do `numeric` ("2500.00"). */
function moeda(v: string | null): string | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;
}

export function VagaResumoModal({
  vaga,
  onClose,
}: {
  vaga: VagaListItem;
  onClose: () => void;
}) {
  const titulo = vaga.nomeDivulgacao ?? vaga.codigo ?? "Vaga sem nome de divulgação";

  return (
    <Modal onClose={onClose} className="max-w-[720px] p-0" ariaLabel="Descritivo da vaga">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">{titulo}</h2>
            <StatusPill tone={tomDoStatusVaga(vaga.status)} label={VAGA_STATUS_LABEL[vaga.status]} />
          </div>
          <p className="mt-1 text-[12.5px] text-dim">
            Código {vaga.codigo ?? "não informado"}. {vaga.clienteNome ?? "Cliente não informado"}.
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          <section className="mb-5">
            <h3 className="mb-2.5 text-[13px] font-semibold text-text">O Trabalho</h3>
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2">
              <Campo rotulo="Cargo" valor={vaga.cargoNome} />
              {/* O HORÁRIO É O CAMPO QUE MOTIVOU ESTE MODAL: é a primeira pergunta que o candidato
                  faz na triagem, e era justamente por ele que se saía da tela. */}
              <Campo rotulo="Horário E Escala" valor={vaga.horarioEscala} />
              <Campo rotulo="Local De Trabalho" valor={vaga.localTrabalho} />
              <Campo rotulo="Modelo De Trabalho" valor={vaga.modeloTrabalho} />
              <Campo rotulo="Vínculo" valor={vaga.vinculo} />
              <Campo rotulo="Tempo De Contrato" valor={vaga.tempoContrato} />
            </div>
          </section>

          <section className="mb-5">
            <h3 className="mb-2.5 text-[13px] font-semibold text-text">A Proposta</h3>
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2">
              <Campo rotulo="Salário De Abertura" valor={moeda(vaga.salarioAbertura)} />
              <Campo rotulo="Escolaridade" valor={vaga.escolaridade} />
              <div className="sm:col-span-2">
                <span className="text-[11.5px] uppercase tracking-wide text-faint">Benefícios</span>
                {vaga.beneficios.length === 0 ? (
                  <p className="text-[13.5px] text-faint">não informado</p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {vaga.beneficios.map((b) => (
                      <li
                        key={b.id}
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[12.5px] text-text"
                      >
                        {b.nome}
                        {b.valor ? ` ${moeda(b.valor)}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section>
            <h3 className="mb-2.5 text-[13px] font-semibold text-text">O Processo</h3>
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 sm:grid-cols-2">
              {/* AS POSIÇÕES SÃO A META DA VAGA, não a ocupação: quem conta quem já está dentro é o
                  painel da vaga, e misturar os dois números aqui criaria uma terceira contagem. */}
              <Campo
                rotulo="Posições Oficiais"
                valor={vaga.posicoesOficiais === null ? null : String(vaga.posicoesOficiais)}
              />
              <Campo rotulo="Posições Banco" valor={String(vaga.posicoesBanco)} />
              <Campo rotulo="Consultor" valor={vaga.consultorNome} />
              <Campo rotulo="Recruiter" valor={vaga.recruiterNome} />
            </div>
          </section>
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] px-6 py-4">
          {/* O CAMINHO PARA O DETALHE COMPLETO CONTINUA EXISTINDO, e agora é escolha e não trajeto
              obrigatório: quem quer só o horário fecha aqui, quem quer a vaga inteira clica. */}
          <a
            href={vaga.codigo ? `/as/vagas?vaga=${encodeURIComponent(vaga.codigo)}` : "/as/vagas"}
            className="text-[12.5px] text-accent underline underline-offset-2"
          >
            Abrir na Central De Vagas
          </a>
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
