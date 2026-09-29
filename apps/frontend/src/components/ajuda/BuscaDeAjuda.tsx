"use client";

import { forwardRef, useMemo } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { ARTIGOS } from "@/ajuda/registro";
import { buscar, indexar, realcar, termosDaConsulta, type ResultadoBusca } from "@/ajuda/busca";
import { MODULO_AJUDA_LABEL } from "@/ajuda/tipos";

/**
 * ─ UMA RÉGUA DE BUSCA SÓ, DUAS SUPERFÍCIES ─────────────────────────────────────────────────────
 *
 * O sumário (`/ajuda`) e o painel lateral procuram no MESMO `busca.ts`: mesma normalização sem
 * acento, mesmos `termos` como sinônimo, mesmo ranking. Uma segunda régua escrita para o painel
 * divergiria no primeiro ajuste, e a mesma palavra passaria a achar coisas diferentes conforme a
 * porta por onde a pessoa entrou, que é pior do que o painel não ter busca nenhuma.
 *
 * O arquivo expõe as peças SEPARADAS porque as duas superfícies as arrumam diferente: no sumário o
 * campo e os resultados rolam juntos; no painel o CAMPO FICA PRESO no topo e só os resultados
 * rolam, que é o ponto inteiro de achar sem rolar.
 */

/**
 * O CAMPO. `aoLimpar` é opcional de propósito: quem o passa ganha o "limpar" escrito ali dentro, e
 * nesse caso o X nativo do navegador é escondido para não existirem dois botões com o mesmo gesto,
 * um deles sem nome acessível.
 */
export const CampoDeBuscaDeAjuda = forwardRef<
  HTMLInputElement,
  {
    consulta: string;
    aoDigitar: (valor: string) => void;
    aoLimpar?: () => void;
    autoFoco?: boolean;
  }
>(function CampoDeBuscaDeAjuda({ consulta, aoDigitar, aoLimpar, autoFoco = false }, ref) {
  return (
    <div className="relative">
      <Icon
        name="filter"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
      />
      <input
        ref={ref}
        type="search"
        value={consulta}
        autoFocus={autoFoco}
        onChange={(e) => aoDigitar(e.target.value)}
        placeholder="Procure pelo que você quer fazer"
        aria-label="Procurar na Central De Ajuda"
        className={cn(
          "ds-input w-full rounded-full pl-9",
          aoLimpar && "pr-10 [&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {aoLimpar && consulta !== "" && (
        <button
          type="button"
          onClick={aoLimpar}
          aria-label="Limpar a busca"
          title="Limpar a busca"
          className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-faint transition hover:bg-[var(--surface-2)] hover:text-accent"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
});

/**
 * OS RESULTADOS. Quando `aoEscolher` vem preenchido, cada resultado é um botão que abre o artigo ali
 * mesmo (é o caso do painel, que existe justamente para não tirar a pessoa da tela em que ela está
 * trabalhando). Sem ele, o resultado é um link para a página do artigo.
 *
 * Consulta vazia não renderiza nada: quem chama decide o que mostrar no lugar (o sumário na página,
 * o artigo da tela no painel).
 */
export function ResultadosDaBusca({
  consulta,
  aoEscolher,
}: {
  consulta: string;
  aoEscolher?: (slug: string) => void;
}) {
  // O índice é montado uma vez por montagem da tela: são três dezenas de campos de texto, e
  // recalcular a cada tecla digitada seria desperdício sem ganho nenhum de simplicidade.
  const indice = useMemo(() => indexar(ARTIGOS), []);
  const termos = useMemo(() => termosDaConsulta(consulta), [consulta]);
  const resultados = useMemo(() => buscar(consulta, indice), [consulta, indice]);

  const ensinam = useMemo(() => resultados.filter((r) => !r.mencaoIncidental), [resultados]);
  const mencoes = useMemo(() => resultados.filter((r) => r.mencaoIncidental), [resultados]);

  if (termos.length === 0) return null;

  const contagem =
    ensinam.length === 1 ? "1 artigo encontrado." : `${ensinam.length} artigos encontrados.`;

  return (
    <div className="flex flex-col gap-2">
      {ensinam.length > 0 && <p className="text-[12px] text-faint">{contagem}</p>}

      {ensinam.map((r) => (
        <CartaoDeResultado
          key={r.artigo.slug}
          resultado={r}
          termos={termos}
          aoEscolher={aoEscolher}
        />
      ))}

      {resultados.length === 0 && <VazioDaBusca consulta={consulta} />}
      {ensinam.length === 0 && mencoes.length > 0 && (
        <SoMencoes consulta={consulta} quantas={mencoes.length} />
      )}

      {mencoes.length > 0 && (
        <>
          {ensinam.length > 0 && (
            <div className="mt-2 border-t border-[var(--border)] pt-3">
              <p className="text-[12.5px] font-semibold">Menções Incidentais</p>
              <p className="mt-0.5 text-[12px] text-faint">
                {mencoes.length === 1
                  ? "Este artigo cita"
                  : `Estes ${mencoes.length} artigos citam`}{" "}
                o que você procurou, sem ensinar o assunto.
              </p>
            </div>
          )}
          {mencoes.map((r) => (
            <CartaoDeResultado
              key={r.artigo.slug}
              resultado={r}
              termos={termos}
              aoEscolher={aoEscolher}
            />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * ─ O CARTÃO DIZ DE ONDE VEIO O CASAMENTO, E A TAG É PARTE DA RESPOSTA ──────────────────────────
 *
 * O trecho grifado é o que responde "por que este artigo apareceu", e a tag responde a pergunta
 * seguinte, que é a que o diretor fez: "então ele ensina isso?". Menção sem tag entrega a lista com
 * uma promessa que o artigo não cumpre, e quem descobre isso depois de ler doze passos conclui que o
 * manual é ruim. Com a tag, a pessoa decide antes de clicar.
 */
function CartaoDeResultado({
  resultado,
  termos,
  aoEscolher,
}: {
  resultado: ResultadoBusca;
  termos: string[];
  aoEscolher?: (slug: string) => void;
}) {
  const { artigo, trecho, mencaoIncidental } = resultado;
  const conteudo = (
    <>
      <span className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-faint">
          {MODULO_AJUDA_LABEL[artigo.modulo]}
        </span>
        {mencaoIncidental && (
          <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
            Menção
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-[14px] font-semibold">
        <Realce texto={artigo.titulo} termos={termos} />
      </span>
      <span className="mt-1 block text-[12.5px] text-dim">
        <Realce texto={trecho} termos={termos} />
      </span>
      {mencaoIncidental && (
        <span className="mt-1 block text-[11.5px] text-faint">
          Aparece assim no texto deste artigo, que é sobre outro assunto.
        </span>
      )}
    </>
  );
  const classe = cn(
    "block rounded-xl border p-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-2)]",
    mencaoIncidental
      ? "border-dashed border-[var(--border)] bg-transparent"
      : "border-[var(--border)] bg-[var(--surface)]",
  );
  return aoEscolher ? (
    <button type="button" className={classe} onClick={() => aoEscolher(artigo.slug)}>
      {conteudo}
    </button>
  ) : (
    <Link href={`/ajuda/${artigo.slug}`} className={classe}>
      {conteudo}
    </Link>
  );
}

/**
 * ─ TODOS OS RESULTADOS SÃO MENÇÃO: ISSO NÃO PODE PARECER RESPOSTA ──────────────────────────────
 *
 * É o caso que o diretor viveu. A lista tinha resultado, então a tela dizia "1 artigo encontrado", e
 * a contagem sozinha já promete. Aqui a contagem de artigos encontrados NÃO é mostrada: o que vem
 * primeiro é a verdade, que o manual não ensina aquilo, e a lista de menções vem depois, oferecida
 * como contexto e não como resposta. Mesmo espírito do vazio: diz o tamanho real do manual, não
 * promete data e sugere o próximo passo.
 */
function SoMencoes({ consulta, quantas }: { consulta: string; quantas: number }) {
  const total = ARTIGOS.length;
  const citam =
    quantas === 1
      ? "1 artigo cita a palavra de passagem, dentro de outro assunto."
      : `${quantas} artigos citam a palavra de passagem, dentro de outro assunto.`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[13px] font-semibold">Nada Que Ensine Isso</p>
      <p className="mt-1 text-[12.5px] text-dim">
        Nenhum dos {total} artigos do manual ensina “{consulta.trim()}”. {citam}
      </p>
      <p className="mt-2 text-[12.5px] text-dim">
        Tente outra palavra, do jeito que você diria em voz alta. Se o assunto não estiver no
        manual, peça o artigo à equipe do sistema.
      </p>
    </div>
  );
}

/**
 * ─ O VAZIO DIZ O TAMANHO REAL DO MANUAL, E NÃO PROMETE NADA ────────────────────────────────────
 *
 * O manual está sendo escrito tela por tela, então procurar por um assunto que ainda não existe é o
 * resultado COMUM, e não a exceção. Um "nada encontrado" seco faz a pessoa concluir que a busca está
 * quebrada e não tentar de novo; um "em breve" promete data que ninguém tem.
 *
 * O número sai de `ARTIGOS.length`, nunca escrito à mão: o inventário cresce fora daqui, e frase com
 * número fixo vira mentira na primeira leva de artigos novos.
 */
function VazioDaBusca({ consulta }: { consulta: string }) {
  const total = ARTIGOS.length;
  const quantos =
    total === 1
      ? "O único artigo do manual não fala"
      : `Nenhum dos ${total} artigos do manual fala`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[13px] font-semibold">Nada Encontrado</p>
      <p className="mt-1 text-[12.5px] text-dim">
        {quantos} sobre “{consulta.trim()}”. O manual é escrito tela por tela e ainda não cobre o
        sistema inteiro.
      </p>
      <p className="mt-2 text-[12.5px] text-dim">
        Tente outra palavra, do jeito que você diria em voz alta. Se o assunto não estiver no
        manual, peça o artigo à equipe do sistema.
      </p>
    </div>
  );
}

/**
 * O CAMPO MAIS OS RESULTADOS, na arrumação do sumário: um embaixo do outro, rolando juntos.
 */
export function BuscaDeAjuda({
  consulta,
  aoDigitar,
  aoEscolher,
  autoFoco = false,
}: {
  consulta: string;
  aoDigitar: (valor: string) => void;
  aoEscolher?: (slug: string) => void;
  autoFoco?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <CampoDeBuscaDeAjuda consulta={consulta} aoDigitar={aoDigitar} autoFoco={autoFoco} />
      <ResultadosDaBusca consulta={consulta} aoEscolher={aoEscolher} />
    </div>
  );
}

/** Grifa no resultado exatamente o que a pessoa digitou, com acento ou sem. */
function Realce({ texto, termos }: { texto: string; termos: string[] }) {
  const pedacos = realcar(texto, termos);
  return (
    <>
      {pedacos.map((p, i) => (
        <span key={`${i}-${p.texto}`} className={cn(p.forte && "font-bold text-accent")}>
          {p.texto}
        </span>
      ))}
    </>
  );
}
