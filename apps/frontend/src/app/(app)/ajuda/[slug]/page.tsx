"use client";

/**
 * O ARTIGO EM TELA CHEIA. O mesmo conteúdo que o painel lateral desenha, pela MESMA peça
 * (`ArtigoCorpo`): duas renderizações do mesmo artigo divergiriam no primeiro ajuste, e o manual
 * passaria a ensinar diferente conforme a porta por onde a pessoa entrou.
 */

import Link from "next/link";
import { PageHead } from "@/components/ui/PageHead";
import { GlassCard } from "@/components/ui/GlassCard";
import { Icon } from "@/components/ui/Icon";
import { ArtigoCorpo } from "@/components/ajuda/ArtigoCorpo";
import { artigoPorSlug } from "@/ajuda/registro";
import { MODULO_AJUDA_LABEL } from "@/ajuda/tipos";

export default function ArtigoPage({ params }: { params: { slug: string } }) {
  const artigo = artigoPorSlug(params.slug);

  if (!artigo) {
    return (
      <>
        <PageHead eyebrow="Ajuda" title="Artigo Não Encontrado" />
        <GlassCard className="panel">
          <p className="text-dim">
            Este artigo não existe ou foi renomeado.{" "}
            <Link href="/ajuda" className="text-accent underline">
              Voltar à Central De Ajuda
            </Link>
            .
          </p>
        </GlassCard>
      </>
    );
  }

  return (
    <>
      <div className="mb-[18px]">
        <Link
          href="/ajuda"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-dim transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)] hover:text-accent"
        >
          <Icon name="left" className="h-[18px] w-[18px]" />
          Central De Ajuda
        </Link>
      </div>

      <PageHead eyebrow={MODULO_AJUDA_LABEL[artigo.modulo]} title={artigo.titulo} />

      <GlassCard className="panel max-w-[900px]">
        <ArtigoCorpo artigo={artigo} />
      </GlassCard>
    </>
  );
}
