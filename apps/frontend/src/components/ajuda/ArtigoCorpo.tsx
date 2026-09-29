"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { artigoPorSlug } from "@/ajuda/registro";
import type { Artigo, Passo, PublicoAjuda } from "@/ajuda/tipos";

/**
 * ─ A CARA DO ARTIGO, UMA SÓ ────────────────────────────────────────────────────────────────────
 *
 * A MESMA peça desenha o artigo na página inteira e dentro do painel lateral. Duas renderizações do
 * mesmo conteúdo divergem no primeiro ajuste, e aí o manual passa a ensinar diferente dependendo de
 * por onde a pessoa entrou.
 *
 * A ORDEM DAS SEÇÕES É FIXA, e ela é parte do desenho: quem já sabe pula direto para os passos, e
 * quem não sabe lê o topo. Por isso o passo a passo vem antes das regras, e "Se Der Errado" vem
 * antes de qualquer explicação: é a parte que o time mais usa.
 */

const PUBLICO_LABEL: Record<PublicoAjuda, string> = {
  OPERACAO: "Operação",
  GESTAO: "Gestão",
  AMBOS: "Operação E Gestão",
};

export function ArtigoCorpo({ artigo, compacto = false }: { artigo: Artigo; compacto?: boolean }) {
  return (
    <article className={cn("flex flex-col", compacto ? "gap-5" : "gap-7")}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="in">{PUBLICO_LABEL[artigo.publico]}</Pill>
        </div>
        <p className={cn("text-dim", compacto ? "text-[13.5px]" : "text-[15px]")}>{artigo.resumo}</p>
      </header>

      {artigo.preRequisitos.length > 0 && (
        <Secao titulo="Antes De Começar" icone="check" compacto={compacto}>
          <ul className="flex flex-col gap-2">
            {artigo.preRequisitos.map((item) => (
              <li key={item} className="flex gap-2 text-[13.5px] text-dim">
                <span className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-[var(--accent)]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Passo A Passo" icone="layers" compacto={compacto}>
        <ol className="flex flex-col gap-4">
          {artigo.passos.map((passo, i) => (
            <PassoItem key={passo.gesto} passo={passo} numero={i + 1} slug={artigo.slug} />
          ))}
        </ol>
      </Secao>

      {artigo.seDerErrado.length > 0 && (
        <Secao titulo="Se Der Errado" icone="alert" compacto={compacto}>
          <div className="flex flex-col gap-3">
            {artigo.seDerErrado.map((caso) => (
              <div
                key={caso.sintoma}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <p className="text-[13.5px] font-semibold">{caso.sintoma}</p>
                <p className="mt-1 text-[13px] text-dim">{caso.acao}</p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {artigo.regras.length > 0 && (
        <Secao titulo="Regras Que Valem Aqui" icone="lock" compacto={compacto}>
          <ul className="flex flex-col gap-2">
            {artigo.regras.map((regra) => (
              <li key={regra} className="flex gap-2 text-[13.5px] text-dim">
                <Icon name="check" className="mt-[3px] h-4 w-4 flex-none text-ok" />
                <span>{regra}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {artigo.relacionados.length > 0 && (
        <Secao titulo="Artigos Relacionados" icone="link" compacto={compacto}>
          <div className="flex flex-col gap-2">
            {artigo.relacionados.map((slug) => {
              const irmao = artigoPorSlug(slug);
              if (!irmao) return null;
              return (
                <Link
                  key={slug}
                  href={`/ajuda/${slug}`}
                  className="flex items-center gap-2 text-[13.5px] font-semibold text-accent hover:underline"
                >
                  <Icon name="arr" className="h-4 w-4" />
                  {irmao.titulo}
                </Link>
              );
            })}
          </div>
        </Secao>
      )}

      <p className="text-[11.5px] text-faint">
        Conteúdo conferido em {formatarData(artigo.revisadoEm)}.
      </p>
    </article>
  );
}

function Secao({
  titulo,
  icone,
  compacto,
  children,
}: {
  titulo: string;
  icone: "check" | "layers" | "alert" | "lock" | "link";
  compacto: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2
        className={cn(
          "mb-3 flex items-center gap-2 font-display font-bold",
          compacto ? "text-[15px]" : "text-[18px]",
        )}
      >
        <Icon name={icone} className="h-[18px] w-[18px] text-accent" />
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** Um passo: o número, o gesto no imperativo, o porquê quando houver, e a imagem quando houver. */
function PassoItem({ passo, numero, slug }: { passo: Passo; numero: number; slug: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 flex-none place-items-center rounded-full border border-[var(--accent)] text-[12.5px] font-bold text-accent">
        {numero}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">{passo.gesto}</p>
        {passo.detalhe && <p className="mt-1 text-[13px] text-dim">{passo.detalhe}</p>}
        {passo.print && (
          <PrintDoPasso
            src={`/ajuda/${slug}/${passo.print.arquivo}`}
            legenda={passo.print.legenda}
          />
        )}
      </div>
    </li>
  );
}

/**
 * A IMAGEM DO PASSO, E O QUE ACONTECE QUANDO ELA AINDA NÃO EXISTE.
 *
 * O texto do artigo e a captura da imagem são trabalhos separados, e a captura em lote depende da
 * auditoria do gate de dado pessoal. Sem tratamento, o passo mostraria o ícone de imagem quebrada do
 * navegador, que lê como defeito da tela. O aviso abaixo diz a verdade em uma linha, e sai sozinho no
 * dia em que o arquivo aparecer.
 */
function PrintDoPasso({ src, legenda }: { src: string; legenda: string }) {
  const [faltando, setFaltando] = useState(false);

  if (faltando) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-3 py-4 text-center">
        <p className="text-[12.5px] text-faint">Imagem deste passo ainda não capturada.</p>
        <p className="mt-1 text-[12px] text-dim">{legenda}</p>
      </div>
    );
  }

  return (
    <figure className="mt-3">
      {/* `img` cru de propósito: a imagem é estática, servida da própria pasta pública, e o
          componente de imagem do framework traria otimização que aqui não tem o que otimizar. */}
      <img
        src={src}
        alt={legenda}
        onError={() => setFaltando(true)}
        className="w-full rounded-xl border border-[var(--border)]"
      />
      <figcaption className="mt-1.5 text-[12px] text-faint">{legenda}</figcaption>
    </figure>
  );
}

/** Data por extenso curta, no formato que o resto do sistema usa. */
function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  if (!ano || !mes || !dia) return iso;
  return `${dia}/${mes}/${ano}`;
}
