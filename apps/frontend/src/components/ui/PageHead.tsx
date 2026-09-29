import { BotaoDeAjuda } from "@/components/ajuda/BotaoDeAjuda";

/**
 * Cabeçalho de página: eyebrow (accent, opcional) + título (Manrope) + subtítulo (opcional).
 *
 * ─ O BOTÃO DE AJUDA ENTRA AQUI, E NÃO EM CADA TELA ─────────────────────────────────────────────
 *
 * Este cabeçalho é usado por 45 das 52 telas, então o botão de ajuda contextual nasce nessas 45 sem
 * nenhuma delas ser tocada, e a próxima tela que nascer já vem com ele. Ele se RESOLVE sozinho: lê a
 * rota atual e só aparece quando existe artigo que ensine aquela tela, então nada muda de lugar nas
 * telas que ainda não têm artigo.
 *
 * O botão é filho de um `flex` ao lado do título. Quando ele não aparece, o `gap` não tem entre o que
 * espaçar e o cabeçalho fica exatamente como era.
 */
export function PageHead({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-[26px]">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-extrabold">{title}</h1>
        <BotaoDeAjuda />
      </div>
      {subtitle && <p className="mt-[5px] text-sm text-dim">{subtitle}</p>}
    </div>
  );
}
