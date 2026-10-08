import type { VagaListItem } from "@ea/shared-types";
import { StatusPill } from "@/components/ui/StatusPill";
import { codigoDaVagaNaTela, tagDoStatusNoAts } from "@/lib/as-vaga-codigo";

/** O que a célula precisa da vaga, e nada além: dois números e o status no ATS. */
type VagaDaCelula = Pick<VagaListItem, "codigo" | "idVacancyPandape" | "statusPandape">;

/**
 * ─ O CÓDIGO DA VAGA NA LINHA, NAS DUAS TELAS QUE O MOSTRAM ─────────────────────────────────────
 *
 * UM COMPONENTE SÓ, e não a mesma condição escrita duas vezes: a Central de Vagas e a fila de Vagas
 * Pendentes De Revisão mostram as MESMAS vagas do Digai (`PENDENTE_REVISAO` não é status que encerra,
 * então a fila padrão da Central também as desenha), e duas cópias da régua divergiriam no primeiro
 * ajuste. A régua mora em `lib/as-vaga-codigo`, que a busca e a ordenação das duas telas também leem.
 *
 * O PREFIXO "ATS" É DIM E O NÚMERO É MONO: o olho bate no número, que é o que se procura, e o
 * prefixo fica como qualificador. O `title` carrega a frase por extenso para quem passa o mouse.
 *
 * ┌─ A TAG DO STATUS NO ATS MORA AQUI, E NÃO NUMA COLUNA NOVA ──────────────────────────────────┐
 * │ Ela é a MESMA identidade: fala da vaga no ATS, exatamente como o número ao lado. Numa coluna │
 * │ própria ela custaria largura nas duas tabelas (§A.20) e pediria filtro e ordenação próprios  │
 * │ (§A.37) para um dado que hoje só a vaga rastreada tem. Dentro da célula, ela aparece onde a   │
 * │ pergunta nasce: "que número é este, e esta vaga ainda existe lá?".                            │
 * │                                                                                               │
 * │ NULO NÃO RENDERIZA NADA: a vaga que nunca foi rastreada não ganha linha a mais.               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.11: nenhum travessão; ausência é "não informado".
 */
export function CodigoDaVaga({ vaga }: { vaga: VagaDaCelula }) {
  const c = codigoDaVagaNaTela(vaga);
  const tag = tagDoStatusNoAts(vaga.statusPandape);
  return (
    <span className="inline-flex flex-col items-center gap-1">
      {c.tipo === "ATS" ? (
        <span className="whitespace-nowrap" title={c.ajuda ?? undefined}>
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            ATS
          </span>
          <span className="font-mono text-[12.5px]">{c.numero}</span>
        </span>
      ) : (
        <span className="whitespace-nowrap font-mono text-[12.5px]">{c.texto}</span>
      )}
      {/* O ícone é o dinâmico do tom (§A.12): a encerrada sai com a exclamação de alerta, e a ativa
          com o check. A frase de apoio vai no `title`, que o `StatusPill` já expõe. */}
      {tag && <StatusPill tone={tag.tom} label={tag.rotulo} title={tag.ajuda ?? tag.rotulo} />}
    </span>
  );
}
