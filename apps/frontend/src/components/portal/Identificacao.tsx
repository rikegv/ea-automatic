"use client";

import { useCallback, useState, type FormEvent } from "react";
import { ArrowRight, Calendar, Check, CircleHelp, Lock, TriangleAlert, User } from "lucide-react";
import { IconeWhatsApp } from "@/components/portal/IconesPortal";
import { SolAvatar } from "@/components/portal/designer/Sol";
import { Botao, Nota, Sobretitulo } from "@/components/portal/designer/ui";

/**
 * PORTAL DO CANDIDATO: a tela de IDENTIFICAÇÃO, a porta da trilha da Sol. PELE do Designer (o painel
 * azul da Sol + o painel branco do formulário), LÓGICA do motor intacta.
 *
 * O QUE ELA É: o candidato chega pelo link de 72 horas que o RH enviou e prova quem é com CPF e
 * data de nascimento. O casamento acontece contra a admissão DO LINK, e não por busca global de
 * CPF: sem link, não há o que enumerar (é a diferença deliberada em relação ao `/vt`).
 *
 * §A.6, E ESTE É O PONTO MAIS SENSÍVEL DA TELA: CPF e data de nascimento existem só no estado deste
 * formulário e no corpo da requisição. NUNCA em `localStorage`, NUNCA em `sessionStorage`, NUNCA na
 * URL e NUNCA em `console.log`. Obtida a sessão, os dois campos são APAGADOS do estado pelo
 * `limpar()`, e o componente sai de cena. O `autoComplete="off"` existe pelo mesmo motivo: o
 * aparelho pode ser compartilhado, e o navegador guardaria o CPF para a próxima pessoa.
 *
 * A MENSAGEM DE ERRO VEM PRONTA DO SERVIDOR E É EXIBIDA COMO VEIO. Esta tela NÃO distingue "CPF não
 * existe" de "data errada", porque o servidor responde igual de propósito: qualquer variação de
 * texto aqui recria o oráculo de enumeração que o desenho de segurança fecha (veto V7).
 *
 * A VÁLVULA "NÃO CONSIGO ENTRAR" é decisão do diretor e não é enfeite: o candidato cuja data de
 * nascimento está errada na NOSSA base ficaria trancado para sempre, e não há RH atrás do balcão.
 *
 * A DATA É MASCARADA dd/mm/aaaa (pele do Designer, `mascaraData`), NÃO o `<input type="date">`
 * nativo (que no celular mostra mm/dd/yyyy e destoa da marca). O motor continua recebendo a data em
 * `yyyy-mm-dd`: `isoDaData` traduz no envio, e o contrato de `/portal/identificar` não muda.
 *
 * §A.11 (sem travessão), §A.24 (Title Case em título e etiqueta; frase de apoio e texto de botão de
 * AÇÃO em escrita normal).
 */

/**
 * A MÁSCARA É SÓ DE EXIBIÇÃO. O estado guarda DÍGITO, e é dígito que vai no corpo: o candidato
 * digita com ou sem pontuação, e o servidor recebe sempre os mesmos 11 caracteres.
 */
export function formatarCpf(digitos: string): string {
  const d = digitos.replace(/\D/g, "").slice(0, 11);
  const blocos = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(".");
  const verificador = d.slice(9, 11);
  return verificador ? `${blocos}-${verificador}` : blocos;
}

/** Só os dígitos, que é o que o contrato pede em `IdentificacaoDoCandidato.cpf`. */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 11);
}

/** Máscara de exibição dd/mm/aaaa. O candidato digita só números; a barra entra sozinha. */
export function mascaraData(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 8);
  return d
    .replace(/(\d{2})(\d)/, "$1/$2")
    .replace(/(\d{2})(\d)/, "$1/$2");
}

/**
 * dd/mm/aaaa (o que o candidato vê) para yyyy-mm-dd (o que o motor manda a `/portal/identificar`).
 * Devolve "" quando não há uma data completa e válida de calendário, e é isso que o `completo`
 * consome: sem data válida, o botão nem habilita.
 */
export function isoDaData(br: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br.trim());
  if (!m) return "";
  const [, dd, mm, aaaa] = m;
  const dia = Number(dd);
  const mes = Number(mm);
  const ano = Number(aaaa);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
  // O `Date` valida o calendário (31/02 não existe): o dia de volta tem de bater com o digitado.
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) return "";
  return `${aaaa}-${mm}-${dd}`;
}

/**
 * O BOTÃO "FALAR COM O RH", pelo WhatsApp. Aprovado pelo diretor.
 *
 * ELE MORA AQUI E É IMPORTADO PELA PÁGINA DA TRILHA (`app/portal/page.tsx`), pelo banner
 * (`components/portal/Banner.tsx`) e pelo cabeçalho do Designer. Um lugar só, porque o botão aparece
 * em TODAS as telas mais os pontos em que o candidato trava, e duas cópias divergiriam no primeiro
 * ajuste de texto.
 *
 * §A.6, E ESTA É A PARTE QUE NÃO PODE ESCORREGAR: o texto pré-preenchido NÃO carrega CPF, nome, id
 * de admissão nem nada que identifique a pessoa. A mensagem vai parar no histórico do WhatsApp do
 * aparelho, que pode ser compartilhado, e num link que o navegador pode registrar. Quem diz quem
 * ele é, é ele mesmo, na conversa.
 *
 * O NÚMERO VEM DE VARIÁVEL DE AMBIENTE, `NEXT_PUBLIC_WHATSAPP_RH`. ATENÇÃO: por ser `NEXT_PUBLIC_`,
 * o valor é INLINADO NO BUILD, então trocar o número exige BUILD NOVO do frontend.
 */
const WHATSAPP_RH = (process.env.NEXT_PUBLIC_WHATSAPP_RH ?? "551135496446").replace(/\D/g, "");

const TEXTO_WHATSAPP_RH = "Olá, preciso de ajuda com o envio dos meus documentos de admissão";

/**
 * AS DUAS FORMAS DO MESMO BOTÃO, e é UM componente só (decisão do diretor: reusar, nunca duplicar).
 *
 * `bloco` é o de sempre, largura cheia, onde o candidato TRAVA (a identificação e a casa que caiu
 * para o consultor). `compacto` é o do cabeçalho, que existe porque o diretor pediu o caminho humano
 * em TODAS as telas.
 *
 * §A.24: "Fale com o RH" é AÇÃO, então escrita normal, e não etiqueta.
 */
export function BotaoFalarComRh({
  className = "",
  variante = "bloco",
}: {
  className?: string;
  variante?: "bloco" | "compacto";
}) {
  const href = `https://wa.me/${WHATSAPP_RH}?text=${encodeURIComponent(TEXTO_WHATSAPP_RH)}`;
  if (variante === "compacto") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className={`inline-flex flex-none flex-col items-center gap-0.5 rounded-xl border border-[#25D366] bg-white px-3 py-1.5 text-[10px] font-bold leading-tight text-[#128C4A] transition-colors hover:bg-[#f2fbf5] lg:px-4 lg:py-2 lg:text-[12px] ${className}`}
      >
        <IconeWhatsApp cor="#128C4A" tamanho={18} />
        Fale com o RH
      </a>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      /* CINTO REDUNDANTE, e de propósito: o `noreferrer` acima já é normativo, e o bilhete do
         candidato vive no FRAGMENTO da URL, que não entra em `Referer` nenhum. As duas garantias
         são de naturezas diferentes, e formato de URL muda. O atributo custa nada. */
      referrerPolicy="no-referrer"
      className={`inline-flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-[#25D366] bg-white px-6 py-3 text-sm font-bold text-[#128C4A] transition-colors hover:bg-[#f2fbf5] ${className}`}
    >
      <IconeWhatsApp cor="#128C4A" tamanho={22} />
      Fale com o RH
    </a>
  );
}

const BENEFICIOS = [
  "Pelo celular ou pelo computador",
  "Conferência na hora, sem espera",
  "Pause e volte quando quiser",
];

const CAMPO =
  "h-[54px] w-full rounded-btn border-[1.5px] border-[#CBD6E1] bg-white pl-4 pr-12 text-base text-portal-ink outline-none transition-colors placeholder:text-portal-muted/70 focus:border-portal-primaria focus:ring-4 focus:ring-portal-primaria-tint disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

interface Props {
  /** Manda CPF (11 dígitos) e data `yyyy-mm-dd`. Resolve `true` quando a sessão foi obtida. */
  aoIdentificar: (cpf: string, dataNascimento: string) => Promise<boolean>;
  /** A válvula: avisa o RH. Devolve a mensagem que o candidato lê, como veio do servidor. */
  aoPedirAjuda: () => Promise<string>;
  /** Mensagem de não casamento, do servidor, exibida sem reescrita. */
  erro: string | null;
  /** Uma linha só, quando a tela reabriu porque a sessão de 30 minutos venceu. */
  aviso: string | null;
  /**
   * `BLOQUEADO` do contrato: a mensagem do servidor continua à vista e a tentativa fecha. Os campos
   * e o botão saem de cena; a válvula do RH continua aberta, porque ela é a única saída que resta.
   */
  bloqueado?: boolean;
}

export function TelaDeIdentificacao({
  aoIdentificar,
  aoPedirAjuda,
  erro,
  aviso,
  bloqueado = false,
}: Props) {
  const [cpf, setCpf] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedindoAjuda, setPedindoAjuda] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);

  const iso = isoDaData(dataNascimento);
  const completo = cpf.length === 11 && iso !== "" && !bloqueado;

  const enviar = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!completo || enviando || bloqueado) return;
      setEnviando(true);
      try {
        const entrou = await aoIdentificar(cpf, iso);
        if (entrou) {
          // §A.6: obtida a sessão, os dados pessoais saem do estado. Não esperam o desmonte.
          setCpf("");
          setDataNascimento("");
        }
      } finally {
        setEnviando(false);
      }
    },
    [aoIdentificar, bloqueado, completo, cpf, enviando, iso],
  );

  const pedirAjuda = useCallback(async () => {
    if (pedindoAjuda) return;
    setPedindoAjuda(true);
    try {
      setRecado(await aoPedirAjuda());
    } finally {
      setPedindoAjuda(false);
    }
  }, [aoPedirAjuda, pedindoAjuda]);

  return (
    <div className="flex grow justify-center px-4 py-5 md:p-14">
      <section className="flex w-full max-w-[1120px] flex-col gap-4 overflow-hidden md:flex-row md:gap-0 md:rounded-card md:border md:border-portal-linha md:bg-white md:shadow-card">
        {/* Painel da Sol */}
        <div className="relative flex items-center gap-4 overflow-hidden rounded-[22px] bg-soulan-azul-escuro p-6 md:w-[500px] md:shrink-0 md:flex-col md:items-start md:gap-8 md:rounded-none md:px-12 md:py-14">
          <div
            className="absolute -bottom-16 -right-12 size-40 rounded-full bg-[#0B3561] md:-bottom-[120px] md:-right-[120px] md:size-[360px]"
            aria-hidden
          />
          <div className="absolute right-10 top-12 hidden size-3.5 rounded-full bg-soulan-verde md:block" aria-hidden />
          <div className="absolute right-20 top-[92px] hidden size-2 rounded-full bg-soulan-azul-claro md:block" aria-hidden />
          <SolAvatar
            tamanho={168}
            anel="nenhum"
            fundo="bg-portal-primaria"
            className="relative !size-[84px] shadow-[0_0_0_4px_#AAD12F] md:!size-[168px] md:shadow-[0_0_0_6px_rgba(170,209,47,0.9)]"
          />
          <div className="relative flex flex-col gap-1.5 md:gap-3.5">
            <h2 className="m-0 text-xl font-bold text-white md:text-[34px] md:leading-tight">
              Oi! Eu sou a Sol.
            </h2>
            <p className="m-0 text-sm leading-normal text-soulan-azul-suave md:text-[17px] md:leading-relaxed">
              Vou acompanhar você em cada passo da entrega dos documentos da sua admissão.
            </p>
          </div>
          <ul className="relative m-0 hidden list-none flex-col gap-4 p-0 md:flex">
            {BENEFICIOS.map((b) => (
              <li key={b} className="flex items-center gap-3 text-[15px] text-white">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-soulan-verde">
                  <Check className="size-[15px] text-portal-ink" strokeWidth={3} aria-hidden />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* Formulário */}
        <div className="flex grow flex-col gap-5 px-1 pt-2 md:gap-7 md:px-[72px] md:py-16">
          <div className="flex flex-col gap-2 md:gap-2.5">
            <span className="hidden md:block">
              <Sobretitulo>Portal Do Candidato</Sobretitulo>
            </span>
            <h1 className="m-0 text-[26px] font-bold leading-tight md:text-4xl">Vamos Começar?</h1>
            <p className="m-0 text-[15px] leading-relaxed text-portal-texto md:text-base">
              Para abrir a sua lista de documentos, confirme dois dados seus.
            </p>
          </div>

          {aviso ? (
            <div
              className="flex items-start gap-3 rounded-btn border border-portal-at-ln bg-portal-at-bg px-4 py-3.5"
              role="status"
              aria-live="polite"
            >
              <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-portal-at-tx" aria-hidden />
              <p className="m-0 text-[13px] font-medium leading-relaxed text-portal-at-tx">{aviso}</p>
            </div>
          ) : null}

          {bloqueado ? (
            erro ? (
              <div
                className="flex items-start gap-3 rounded-btn border border-portal-at-ln bg-portal-at-bg px-4 py-3.5"
                role="alert"
                aria-live="assertive"
              >
                <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-portal-at-tx" aria-hidden />
                <p className="m-0 text-[13px] font-medium leading-relaxed text-portal-at-tx">{erro}</p>
              </div>
            ) : null
          ) : (
            <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
              <div className="flex flex-col gap-2">
                <label htmlFor="portal-cpf" className="text-sm font-semibold">
                  CPF
                </label>
                <div className="relative">
                  <input
                    id="portal-cpf"
                    name="portal-cpf"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="000.000.000-00"
                    value={formatarCpf(cpf)}
                    onChange={(e) => setCpf(somenteDigitos(e.target.value))}
                    className={CAMPO}
                    aria-describedby="portal-cpf-ajuda"
                  />
                  <User className="pointer-events-none absolute right-4 top-4 size-5 text-portal-muted" aria-hidden />
                </div>
                <span id="portal-cpf-ajuda" className="text-xs text-portal-muted">
                  Pode digitar com ou sem pontos.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="portal-nascimento" className="text-sm font-semibold">
                  Data de nascimento
                </label>
                <div className="relative">
                  <input
                    id="portal-nascimento"
                    name="portal-nascimento"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="dd/mm/aaaa"
                    value={dataNascimento}
                    onChange={(e) => setDataNascimento(mascaraData(e.target.value))}
                    className={CAMPO}
                  />
                  <Calendar className="pointer-events-none absolute right-4 top-4 size-5 text-portal-muted" aria-hidden />
                </div>
              </div>

              {erro ? (
                <p role="alert" aria-live="assertive" className="m-0 text-sm font-medium text-portal-at-tx">
                  {erro}
                </p>
              ) : null}

              <Botao
                type="submit"
                icone={ArrowRight}
                iconeDireita
                largo
                className="h-14"
                disabled={!completo || enviando}
              >
                {enviando ? "Conferindo..." : "Entrar"}
              </Botao>
            </form>
          )}

          <Nota icone={Lock}>
            Pedimos esses dados só para confirmar que é você. Este link é pessoal: guarde só para
            você.
          </Nota>

          <div className="flex flex-col items-center gap-3 border-t border-portal-linha pt-4 md:flex-row md:justify-between">
            {recado ? (
              <p className="m-0 text-[13px] font-medium leading-relaxed text-portal-agua-tx" role="status" aria-live="polite">
                {recado}
              </p>
            ) : (
              <button
                type="button"
                onClick={pedirAjuda}
                disabled={pedindoAjuda}
                className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-portal-primaria disabled:opacity-50"
              >
                <CircleHelp className="size-4" aria-hidden />
                {pedindoAjuda ? "Avisando o RH..." : "Não consigo entrar"}
              </button>
            )}
            <BotaoFalarComRh variante="compacto" className="md:!flex-row md:gap-1.5" />
          </div>
        </div>
      </section>
    </div>
  );
}
