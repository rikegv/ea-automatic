"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ArtigoCorpo } from "./ArtigoCorpo";
import { CampoDeBuscaDeAjuda, ResultadosDaBusca } from "./BuscaDeAjuda";
import { artigoPorSlug } from "@/ajuda/registro";
import { MODULO_AJUDA_LABEL, type Artigo } from "@/ajuda/tipos";

/** Largura do painel. Fora daqui só existe a conta de quanto o conteúdo recua. */
const LARGURA = 460;

/**
 * ─ O PAINEL ABRE AO LADO, NUNCA POR CIMA ───────────────────────────────────────────────────────
 *
 * Decisão do diretor, e a razão é de uso: o manual existe para a pessoa EXECUTAR enquanto lê. Uma
 * janela sobreposta esconde justamente a tela que ela está tentando operar, e a pessoa passa a ler
 * um passo, fechar, tentar, reabrir, procurar o passo de novo. Por isso o conteúdo da tela RECUA
 * para o lado enquanto o painel está aberto, em vez de ficar coberto por ele.
 *
 * ┌─ AS DUAS SAÍDAS, E NENHUMA DELAS É O CLIQUE FORA (§A.41) ────────────────────────────────────┐
 * │ O painel sai pelo "Fechar", que está sempre à vista no cabeçalho, e pela tecla Escape, que é  │
 * │ gesto deliberado. Fechar por encostar fora seria o mesmo escorregão que apagava formulário    │
 * │ preenchido, e aqui ele tiraria da tela o passo que a pessoa está seguindo, no meio do gesto.  │
 * │ Nenhum painel do sistema fica sem saída visível, e esta é a razão de o "Fechar" ser um botão  │
 * │ escrito, e não só um X.                                                                       │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A BUSCA MORA AQUI DENTRO, E O CAMPO FICA PRESO NO TOPO ─────────────────────────────────────┐
 * │ O painel abre com o artigo DAQUELA tela, que é o comportamento certo, e por isso mesmo a      │
 * │ busca precisava existir aqui: sem ela, achar qualquer outro assunto exigia rolar o manual     │
 * │ inteiro, no meio de uma tarefa, que é justamente o atrito que a ajuda deveria eliminar. A     │
 * │ página `/ajuda` já tinha busca, mas quem opera não passa por ela: passa por este painel.      │
 * │                                                                                               │
 * │ O campo é FLEX-NONE, fora da área rolável: digitar, ver o resultado e apagar tem de acontecer │
 * │ sem a pessoa perder de vista onde ela escreveu.                                               │
 * │                                                                                               │
 * │ A BUSCA É UMA SEGUNDA CAMADA, NÃO UM MODO: o artigo da tela continua embaixo dela, intacto.   │
 * │ Limpou a busca, o painel volta a ele sozinho, sem fechar e sem a pessoa procurar o caminho    │
 * │ de volta.                                                                                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function PainelDeAjuda({
  artigos,
  aoFechar,
}: {
  artigos: Artigo[];
  aoFechar: () => void;
}) {
  // Com um artigo só não há o que escolher, então ele abre direto. Com vários, a lista aparece
  // primeiro: adivinhar qual deles a pessoa queria é pior do que perguntar.
  const [slugAberto, setSlugAberto] = useState<string | null>(
    artigos.length === 1 ? artigos[0].slug : null,
  );
  const [consulta, setConsulta] = useState("");
  // O que a BUSCA abriu mora separado do que a TELA abriu, e é isso que faz a busca ser uma camada
  // em cima do painel em vez de um modo que substitui o conteúdo dele: limpar a consulta devolve a
  // pessoa exatamente ao artigo em que ela estava, sem o painel ter de lembrar de nada.
  const [slugDoResultado, setSlugDoResultado] = useState<string | null>(null);
  const painel = useRef<HTMLElement | null>(null);
  const campo = useRef<HTMLInputElement | null>(null);

  const procurando = consulta.trim() !== "";
  const slugNaTela = procurando ? slugDoResultado : slugAberto;
  const artigo = slugNaTela ? artigoPorSlug(slugNaTela) : undefined;

  /** Digitar de novo volta para os resultados: quem mexe na pergunta quer a resposta nova. */
  const aoDigitar = useCallback((valor: string) => {
    setConsulta(valor);
    setSlugDoResultado(null);
  }, []);

  /**
   * SAIR DA BUSCA É VOLTAR AO PONTO DE PARTIDA, e não ficar num painel em branco: apaga a consulta e
   * o painel reaparece no artigo da tela, com o foco de volta no campo para a pessoa digitar outra
   * coisa na hora.
   */
  const limparBusca = useCallback(() => {
    setConsulta("");
    setSlugDoResultado(null);
    campo.current?.focus();
  }, []);

  /**
   * ─ ESCAPE EM DOIS ESTÁGIOS ───────────────────────────────────────────────────────────────────
   *
   * Com busca escrita, Escape LIMPA A BUSCA e o painel continua aberto no artigo da tela. Com o
   * campo vazio, Escape FECHA o painel, que é a saída de teclado da §A.41 e não pode sumir.
   *
   * A ordem é esta porque Escape é o gesto que a pessoa já usa para desfazer o que digitou, e
   * fechar o painel inteiro nesse gesto tiraria da tela o passo que ela estava seguindo. Um Escape
   * limpa, o Escape seguinte fecha: as duas saídas continuam a um toque.
   *
   * O `preventDefault` existe porque o campo é um `input[type=search]`, e o navegador também limpa
   * sozinho no Escape: sem isto, o gesto seria tratado duas vezes.
   */
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (procurando) {
        e.preventDefault();
        limparBusca();
        return;
      }
      aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar, procurando, limparBusca]);

  /**
   * O RECUO DO CONTEÚDO, e por que ele é feito no elemento em vez de numa classe.
   *
   * A área rolável da aplicação usa espaçamento de utilitário, que vence qualquer regra de folha de
   * estilo por ordem de camada; escrever a regra em CSS exigiria forçar prioridade, que é o tipo de
   * remendo que a próxima pessoa não entende. O estilo direto no elemento vence sem briga e é
   * desfeito na saída, sem deixar rastro.
   *
   * Em tela estreita o recuo não acontece: não haveria largura útil sobrando para trabalhar, e o
   * painel passa a se comportar como uma sobreposição comum.
   */
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const cabe = window.innerWidth >= 1280;
    if (!cabe) return;
    const anterior = main.style.paddingRight;
    main.style.paddingRight = `${LARGURA + 32}px`;
    return () => {
      main.style.paddingRight = anterior;
    };
  }, []);

  /**
   * ─ O FOCO ABRE NO CAMPO DE BUSCA ─────────────────────────────────────────────────────────────
   *
   * Quem abre a ajuda no meio de uma tarefa está com a mão no teclado e tem uma pergunta na cabeça:
   * o gesto seguinte é digitar. Levando o foco ao campo, "achar" custa uma tecla, e não um Tab pelo
   * painel inteiro. Quem queria só LER o artigo da tela não perde nada, porque ele já está aberto
   * embaixo do campo, e o painel rola por roda, PageDown ou um Tab.
   *
   * O painel segue focável (`tabIndex={-1}`) para o caso de o campo não existir por qualquer motivo:
   * abertura sem foco nenhum deixaria o leitor de tela na tela de trás.
   */
  useEffect(() => {
    (campo.current ?? painel.current)?.focus();
  }, []);

  return createPortal(
    <aside
      ref={painel}
      tabIndex={-1}
      role="complementary"
      aria-label="Central De Ajuda"
      className="glass !bg-[var(--surface-2)] fixed right-0 top-0 z-[54] flex h-screen w-full max-w-full flex-col rounded-none border-l border-[var(--border)] outline-none sm:w-[460px]"
    >
      <header className="flex flex-none items-start gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Ajuda Da Tela</div>
          <h2 className="truncate font-display text-[17px] font-extrabold">
            {artigo ? artigo.titulo : "Central De Ajuda"}
          </h2>
          {artigo && (
            <p className="mt-0.5 text-[11.5px] text-faint">
              {MODULO_AJUDA_LABEL[artigo.modulo]}
            </p>
          )}
        </div>
        <Button variant="secondary" onClick={aoFechar} className="flex-none px-3 py-2 text-[13px]">
          Fechar
        </Button>
      </header>

      {/* O campo fica FORA da área rolável: digitar e ver o resultado sem perder de vista onde se
          escreveu é o ponto inteiro desta entrega. */}
      <div className="flex-none border-b border-[var(--border)] px-5 py-3">
        <CampoDeBuscaDeAjuda
          ref={campo}
          consulta={consulta}
          aoDigitar={aoDigitar}
          aoLimpar={limparBusca}
        />
      </div>

      {/* A volta é sempre para o passo anterior do caminho da pessoa: dos resultados, se ela chegou
          ao artigo procurando; da lista da tela, se ela chegou escolhendo. */}
      {artigo && procurando ? (
        <button
          type="button"
          onClick={() => setSlugDoResultado(null)}
          className="flex flex-none items-center gap-1.5 border-b border-[var(--border)] px-5 py-2 text-left text-[12.5px] font-semibold text-accent hover:underline"
        >
          <Icon name="left" className="h-4 w-4" />
          Voltar aos resultados
        </button>
      ) : (
        artigo &&
        artigos.length > 1 && (
          <button
            type="button"
            onClick={() => setSlugAberto(null)}
            className="flex flex-none items-center gap-1.5 border-b border-[var(--border)] px-5 py-2 text-left text-[12.5px] font-semibold text-accent hover:underline"
          >
            <Icon name="left" className="h-4 w-4" />
            Ver os artigos desta tela
          </button>
        )
      )}

      <div className="ea-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {procurando && !artigo ? (
          <ResultadosDaBusca consulta={consulta} aoEscolher={(slug) => setSlugDoResultado(slug)} />
        ) : artigo ? (
          <>
            <ArtigoCorpo artigo={artigo} compacto />
            <Link
              href={`/ajuda/${artigo.slug}`}
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
            >
              <Icon name="arr" className="h-4 w-4" />
              Abrir em tela cheia
            </Link>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="mb-2 font-display text-[14px] font-bold">Artigos Desta Tela</h3>
              <div className="flex flex-col gap-2">
                {artigos.map((a) => (
                  <button
                    key={a.slug}
                    type="button"
                    onClick={() => setSlugAberto(a.slug)}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)]"
                  >
                    <span className="block text-[14px] font-semibold">{a.titulo}</span>
                    <span className="mt-1 block text-[12.5px] text-dim">{a.resumo}</span>
                  </button>
                ))}
              </div>
            </section>

            <Link
              href="/ajuda"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
            >
              <Icon name="arr" className="h-4 w-4" />
              Abrir a Central De Ajuda
            </Link>
          </div>
        )}
      </div>
    </aside>,
    document.body,
  );
}
