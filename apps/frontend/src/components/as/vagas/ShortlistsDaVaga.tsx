"use client";

/**
 * ─ AS SHORTLISTS QUE ESTA VAGA JÁ MANDOU (Frente E, pontos 10 e 11) ───────────────────────────
 *
 * LEITURA PURA, E ISSO É O DESENHO: a lista enviada é congelada, não existe editar nem apagar. O
 * que se faz depois de um envio é outro envio, com número, data e motivo próprios, e quem faz isso é
 * a barra da seleção, na aba dos candidatos.
 *
 * O `etapaAtual` DE CADA LINHA É O ESTADO DE HOJE, e não o do envio, e é assim que o servidor o
 * monta de propósito: é isto que responde a pergunta que a tela faz ("dos seis que mandei, quantos o
 * cliente entrevistou?"). QUEM estava na lista é que continua congelado.
 *
 * §A.24 (title case em título e tag), §A.11 (sem travessão, e célula vazia diz "não informado").
 * §A.6: números, datas, motivo de processo e os NOMES de quem foi apresentado ao cliente, que é do
 * que a shortlist é feita. Nenhum CPF, e-mail ou telefone.
 */

import type { AsEtapaFunil, AsShortlist } from "@ea/shared-types";
import { CANDIDATURA_SITUACAO_LABEL } from "@ea/shared-types";
import { StatusPill } from "@/components/ui/StatusPill";
import { dataBr } from "@/lib/as-candidatos";
import { tomDaSituacao } from "@/lib/as-candidatos-visual";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import { rotuloDaShortlist, useShortlists } from "@/lib/as-shortlists";

export function ShortlistsDaVaga({ vagaId, token }: { vagaId: string; token: string | null }) {
  const { shortlists, carregando, erro } = useShortlists(vagaId, token);
  /* O CATÁLOGO COMPLETO, INATIVAS INCLUÍDAS: a pessoa da lista pode estar parada numa etapa que o
     diretor inativou depois, e lendo só as ativas a pill sairia em branco. */
  const { etapas } = useEtapas();

  return (
    <section className="mt-5 border-t border-[var(--border)] pt-4">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">Shortlists Enviadas</h3>

      {erro && (
        <p className="text-[12.5px] text-danger" role="alert">
          {erro}
        </p>
      )}
      {!erro && carregando && (
        <p className="text-[12.5px] text-faint">Carregando as shortlists desta vaga.</p>
      )}
      {!erro && !carregando && shortlists.length === 0 && (
        <p className="text-[12.5px] text-faint">
          Nenhuma shortlist foi enviada ao cliente nesta vaga. O envio parte da seleção de
          candidatos, na aba Candidatos.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {shortlists.map((s) => (
          <ShortlistCard key={s.id} shortlist={s} etapas={etapas} />
        ))}
      </div>
    </section>
  );
}

function ShortlistCard({
  shortlist: s,
  etapas,
}: {
  shortlist: AsShortlist;
  etapas: readonly AsEtapaFunil[];
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={s.numero === 1 ? "in" : "wn"} label={rotuloDaShortlist(s.numero)} />
        <span className="text-[12.5px] font-semibold tabular-nums text-text">
          {dataBr(s.enviadaEm)}
        </span>
        <span className="text-[12px] text-faint">
          por {s.enviadaPorNome ?? "não informado"}, {s.itens.length === 1
            ? "1 candidato"
            : `${s.itens.length} candidatos`}
        </span>
        {/* O ACEITE DA LISTA CURTA É TRILHA, e ela aparece: guarda atravessada sem registro visível
            é guarda que ninguém confere depois. */}
        {s.avisoCurtaAceito && <StatusPill tone="wn" label="Lista Curta Confirmada" />}
      </div>

      {/* O NOME VEM DO SERVIDOR, e a tela não vai buscar o catálogo para escrever esta linha: o
          motivo já foi resolvido na leitura. E é o NOME que se mostra, nunca o id, do mesmo jeito
          que é o ID que se conta, nunca o nome. Motivo inativado pelo diretor continua aparecendo
          aqui: quem resolve o nome é a leitura do servidor, e ela não filtra por ativo. */}
      {s.motivoReenvioNome && (
        <p className="mt-2 text-[12px] text-dim">Motivo do reenvio: {s.motivoReenvioNome}</p>
      )}

      <ul className="mt-2.5 flex flex-col gap-1.5">
        {s.itens.map((i) => (
          <li
            key={i.candidaturaId}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12.5px]"
          >
            <span className="font-semibold text-text">{i.candidatoNome}</span>
            <StatusPill tone={tomDaEtapa(i.etapaAtual, etapas)} label={rotuloDaEtapa(i.etapaAtual, etapas)} />
            <StatusPill
              tone={tomDaSituacao(i.situacaoAtual)}
              label={CANDIDATURA_SITUACAO_LABEL[i.situacaoAtual]}
            />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11.5px] text-faint">
        A etapa e a situação de cada pessoa são as de hoje. Quem estava na lista é o que fica
        congelado no envio.
      </p>
    </div>
  );
}
