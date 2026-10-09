"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Lock,
  Mail,
  ShieldCheck,
  TriangleAlert,
  User,
  Wrench,
} from "lucide-react";
import type {
  ConfirmacaoDeCodigoResposta,
  IdentidadeDoAcessoResposta,
  SolicitacaoDeCodigoResposta,
} from "@ea/shared-types";
import { ApiError, apiFetch } from "@/lib/api";
import { Botao, Nota, Sobretitulo } from "@/components/portal/designer/ui";
import {
  BotaoFalarComRh,
  formatarCpf,
  isoDaData,
  mascaraData,
  somenteDigitos,
} from "@/components/portal/Identificacao";
import {
  FRASE_CODIGO_NAO_CONFERE,
  FRASE_DA_RECUSA,
  FRASE_PEDIDO_NO_TETO,
  ROTA_CONFIRMAR_CODIGO,
  ROTA_IDENTIDADE_DO_ACESSO,
  ROTA_SOLICITAR_CODIGO,
  TAMANHO_DO_CODIGO,
  codigoCompleto,
  contagemRegressiva,
  desfechoDaRecusa,
  digitosDoCodigo,
  emailAparentaValido,
  mensagemDaRecusa,
  normalizarEmail,
  prazoVencido,
} from "@/lib/portal-acesso-email";

/**
 * PORTAL DO CANDIDATO: ENTRAR COM O E-MAIL, para quem NÃO tem o link em mãos.
 *
 * ┌─ O QUE ESTA TELA FAZ, E O QUE ELA NUNCA FAZ ────────────────────────────────────────────────┐
 * │ Ela NÃO entra no Portal. O sucesso dela é "enviamos um link de acesso para o seu e-mail", e  │
 * │ ponto: não existe, em nenhum estado, botão que leve para dentro da trilha. A chave de acesso │
 * │ continua sendo o link mais CPF mais nascimento em `POST portal/identificar`, byte a byte como│
 * │ antes desta frente. Um botão "entrar agora" aqui seria a v1 do desenho, que foi VETADA.      │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS RÉGUAS DE SEGURANÇA QUE A AUDITORIA FIXOU, e cada uma tem endereço nesta tela ─────┐
 * │ 1. NENHUM ORÁCULO DE ENUMERAÇÃO. O passo do e-mail avança para o código SEMPRE, exista ou    │
 * │    não o endereço. Não há, e não pode haver, "e-mail não cadastrado": a resposta do servidor │
 * │    é a mesma para todo e-mail, por desenho, e a tela não inventa uma diferença que o         │
 * │    servidor se recusa a dar.                                                                │
 * │ 2. NENHUM DADO DA PESSOA ANTES DA IDENTIDADE PROVADA. O passo da identidade pede CPF e data  │
 * │    de nascimento e NÃO mostra nome, nem mascarado, nem cliente, nem cargo. Posse de caixa de │
 * │    e-mail não prova identidade: 6 e-mails medidos em produção são compartilhados por 12 CPFs,│
 * │    e 5 deles carregam dois nomes diferentes. Não existe "confirme que é você, MARIA S.".     │
 * │ 3. NENHUMA RECUSA EXPLICADA. Código errado não diz quantas tentativas restam; trava não diz  │
 * │    qual campo divergiu nem que o CPF já é de outra pessoa. As frases vêm de                  │
 * │    `lib/portal-acesso-email`, todas neutras, e a tela não as reescreve.                      │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: e-mail, código, CPF e data de nascimento vivem SÓ no estado deste formulário e no corpo da
 * requisição. Nunca em `localStorage`, nunca em `sessionStorage`, nunca na URL e nunca em console. O
 * CPF e a data saem do estado assim que o desfecho chega, e o `autoComplete="off"` existe porque o
 * aparelho pode ser compartilhado.
 *
 * MOBILE FIRST: o candidato entra pelo celular. A pele é a que o Portal já usa (os componentes de
 * `designer/ui` e as máscaras de `Identificacao`), sem identidade visual nova.
 *
 * §A.11 sem travessão. §A.24 Title Case em título; frase de apoio, erro e texto de botão de AÇÃO em
 * escrita normal.
 */

export type PassoDoAcessoPorEmail =
  | "EMAIL"
  | "CODIGO"
  | "IDENTIDADE"
  | "LINK_ENVIADO"
  | "DADOS_RECEBIDOS"
  | "TRAVADO";

/**
 * A MESMA CASCA DE CAMPO DA IDENTIFICAÇÃO, repetida aqui por uma razão de processo, não de estilo:
 * a constante de lá é local àquele arquivo, que é código já validado, e exportá-la seria mexer nele
 * (§A.26). O valor é o mesmo, e quem unificar os dois no futuro mexe em um lugar só.
 */
const CAMPO =
  "h-[54px] w-full rounded-btn border-[1.5px] border-[#CBD6E1] bg-white pl-4 pr-12 text-base text-portal-ink outline-none transition-colors placeholder:text-portal-muted/70 focus:border-portal-primaria focus:ring-4 focus:ring-portal-primaria-tint disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

/**
 * "E-MAIL" NÃO QUEBRA NO MEIO, e a régua mora num lugar só.
 *
 * ┌─ O DEFEITO MEDIDO, a 390px ────────────────────────────────────────────────────────────────┐
 * │ O navegador trata o hífen de "E-mail" como ponto de quebra legítimo, então o rótulo do botão │
 * │ principal desta frente virava "Entrar Com Meu E-" numa linha e "mail" na outra, com cara de   │
 * │ texto quebrado justo na porta de entrada.                                                   │
 * │                                                                                            │
 * │ O CONSERTO É A PALAVRA, E NÃO O CARACTERE: envolver só "e-mail" em `whitespace-nowrap` mantém │
 * │ o texto igual (§A.24, title case preservado) e o GLIFO igual. Trocar o hífen por um hífen não │
 * │ separável resolveria a linha e estragaria duas coisas que importam mais: a busca da página    │
 * │ (procurar "e-mail" deixaria de achar) e o leitor de tela, que lê outro caractere.             │
 * │                                                                                            │
 * │ E É UMA FUNÇÃO, e não um `<span>` espalhado pelas frases: a palavra aparece em dezenas de     │
 * │ textos desta tela, e um `<span>` por frase é a próxima frase que alguém escreve sem ele.      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const RECORTE_DO_EMAIL = /(e-mail)/gi;
const SO_O_EMAIL = /^e-mail$/i;

export function emailInteiro(texto: string): ReactNode {
  // `split` com grupo de captura devolve os separadores junto, então a frase é remontada inteira.
  const partes = texto.split(RECORTE_DO_EMAIL);
  if (partes.length === 1) return texto;
  return partes.map((parte, i) =>
    SO_O_EMAIL.test(parte) ? (
      <span key={i} className="whitespace-nowrap">
        {parte}
      </span>
    ) : (
      parte
    ),
  );
}

function Aviso({ tom, children }: { tom: "atencao" | "ok"; children: ReactNode }) {
  const atencao = tom === "atencao";
  return (
    <div
      className={
        atencao
          ? "flex items-start gap-3 rounded-btn border border-portal-at-ln bg-portal-at-bg px-4 py-3.5"
          : "flex items-start gap-3 rounded-btn border border-[#C6EAE3] bg-portal-agua-tint px-4 py-3.5"
      }
      role={atencao ? "alert" : "status"}
      aria-live={atencao ? "assertive" : "polite"}
    >
      {atencao ? (
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0 text-portal-at-tx" aria-hidden />
      ) : (
        <CheckCircle2 className="mt-0.5 size-[18px] shrink-0 text-portal-agua-tx" aria-hidden />
      )}
      <p
        className={`m-0 text-[13px] font-medium leading-relaxed ${
          atencao ? "text-portal-at-tx" : "text-portal-agua-tx"
        }`}
      >
        {/* A frase pode vir do servidor, e ela também não deve quebrar "e-mail" no hífen. */}
        {typeof children === "string" ? emailInteiro(children) : children}
      </p>
    </div>
  );
}

/**
 * O AVISO DE MANUTENÇÃO da porta desligada (503), CALMO e NÃO vermelho.
 *
 * Tom `status` (e não `alert`): isto não é erro de quem está na tela, é o sistema que ainda não
 * ligou o caminho do e-mail. A palheta é a bege do Portal, de espera serena, e o texto diz o que a
 * pessoa pode fazer agora: falar com o RH para receber o link. §A.24: título em Title Case, apoio em
 * escrita normal. §A.11: sem travessão.
 */
function AvisoManutencao() {
  return (
    <div
      className="flex items-start gap-3 rounded-btn border border-[#F0E2C8] bg-portal-bege-tint px-4 py-3.5"
      role="status"
      aria-live="polite"
    >
      <Wrench className="mt-0.5 size-[18px] shrink-0 text-portal-bege-tx" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="m-0 text-[14px] font-bold leading-snug text-portal-bege-tx">
          Esta Opção Está Em Manutenção
        </p>
        <p className="m-0 text-[13px] leading-relaxed text-portal-bege-tx">
          Fale com o RH que está acompanhando a sua admissão para receber o seu link.
        </p>
      </div>
    </div>
  );
}

function Titulo({ titulo, apoio }: { titulo: string; apoio: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Sobretitulo>Portal Do Candidato</Sobretitulo>
      <h1 className="m-0 text-[22px] font-bold leading-tight text-portal-ink md:text-[26px]">
        {emailInteiro(titulo)}
      </h1>
      <p className="m-0 text-[15px] leading-relaxed text-portal-texto">{emailInteiro(apoio)}</p>
    </div>
  );
}

export function AcessoPorEmail({ aoIrParaLink }: { aoIrParaLink?: () => void }) {
  const [passo, setPasso] = useState<PassoDoAcessoPorEmail>("EMAIL");

  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [cpf, setCpf] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");

  const [bilhete, setBilhete] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A PORTA DESLIGADA (503) é AVISO DE MANUTENÇÃO, não erro vermelho.
   *
   * O 503 não é culpa de quem digitou: a porta de e-mail ainda não foi ligada. Mostrá-lo como erro
   * (vermelho, `role="alert"`) faz o candidato achar que errou algo. Este sinalizador troca só a
   * APRESENTAÇÃO: o GATILHO continua sendo o mesmo 503 (`desfechoDaRecusa`), e o comportamento de
   * NÃO avançar o passo continua idêntico. Ele some assim que a pessoa tenta de novo.
   */
  const [manutencao, setManutencao] = useState(false);
  /** Recado neutro que não é erro (o teto do pedido de código, por exemplo). */
  const [recado, setRecado] = useState<string | null>(null);

  /**
   * O PRAZO DO CÓDIGO, EM CARIMBO ABSOLUTO, e `null` quando o servidor não nos disse.
   *
   * Ele só existe quando a resposta chegou de verdade: inventar "10 minutos" quando a chamada falhou
   * mostraria uma contagem que não corresponde a nada, e a pessoa confiaria nela.
   */
  const [expiraEm, setExpiraEm] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  // O relógio só bate enquanto há prazo à vista. Nada de intervalo vivo nos outros passos.
  useEffect(() => {
    if (passo !== "CODIGO" || expiraEm === null) return;
    const h = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(h);
  }, [passo, expiraEm]);

  const restante = expiraEm === null ? null : expiraEm - agora;
  const venceu = restante !== null && prazoVencido(restante);

  const emailPronto = useMemo(() => emailAparentaValido(email), [email]);
  const isoNascimento = isoDaData(dataNascimento);
  const identidadePronta = cpf.length === 11 && isoNascimento !== "";

  /** §A.6: o que é dado pessoal sai do estado assim que deixa de ser necessário. */
  const limparDadosPessoais = useCallback(() => {
    setCodigo("");
    setCpf("");
    setDataNascimento("");
  }, []);

  /**
   * PEDIR O CÓDIGO, e a regra mais importante desta tela mora nestas linhas: a tela AVANÇA SEMPRE.
   *
   * O servidor responde igual para todo e-mail, exista ou não, e é isso que fecha o oráculo de
   * enumeração. Mesmo uma falha de rede avança: parar no passo do e-mail só porque a chamada não
   * completou faria a tela se comportar de um jeito para um endereço e de outro para outro, que é
   * justamente a diferença observável que o desenho existe para não dar.
   *
   * A ÚNICA EXCEÇÃO É A PORTA DESLIGADA (503). Ali nenhum código será enviado nunca, e mandar a
   * pessoa digitar um código que não vai chegar é cruel sem ser seguro: ela fica no passo do e-mail
   * com a frase que manda falar com o RH. Isso não vaza nada sobre o endereço, é sobre o sistema.
   */
  const pedirCodigo = useCallback(
    async (reenvio: boolean) => {
      if (enviando) return;
      setEnviando(true);
      setErro(null);
      setRecado(null);
      setManutencao(false);
      try {
        const r = await apiFetch<SolicitacaoDeCodigoResposta>(ROTA_SOLICITAR_CODIGO, {
          method: "POST",
          body: { email: normalizarEmail(email) },
        });
        const minutos = Number(r?.expiraEmMinutos);
        setExpiraEm(Number.isFinite(minutos) && minutos > 0 ? Date.now() + minutos * 60_000 : null);
        setAgora(Date.now());
        setCodigo("");
        setPasso("CODIGO");
        if (reenvio) setRecado("Pedimos um código novo. Confira o seu e-mail.");
      } catch (e) {
        const desfecho = e instanceof ApiError ? desfechoDaRecusa(e.status) : "FALHA";
        if (desfecho === "INDISPONIVEL") {
          setManutencao(true);
          return;
        }
        // O prazo deixa de valer: não sabemos se, nem quando, um código novo nasceu.
        setExpiraEm(null);
        setPasso("CODIGO");
        setRecado(desfecho === "MUITAS_TENTATIVAS" ? FRASE_PEDIDO_NO_TETO : null);
        setErro(desfecho === "MUITAS_TENTATIVAS" ? null : FRASE_DA_RECUSA.FALHA);
      } finally {
        setEnviando(false);
      }
    },
    [email, enviando],
  );

  /**
   * CONFIRMAR O CÓDIGO. O que volta é um BILHETE e NADA da pessoa (proibição 2 do cabeçalho), e é
   * por isso que o passo seguinte não tem como mostrar nome: não existe nome para mostrar.
   */
  const confirmarCodigo = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!codigoCompleto(codigo) || enviando) return;
      setEnviando(true);
      setErro(null);
      setRecado(null);
      setManutencao(false);
      try {
        const r = await apiFetch<ConfirmacaoDeCodigoResposta>(ROTA_CONFIRMAR_CODIGO, {
          method: "POST",
          body: { email: normalizarEmail(email), codigo: digitosDoCodigo(codigo) },
        });
        setBilhete(r?.bilhete ?? "");
        // O código cumpriu o papel dele e sai do estado (§A.6).
        setCodigo("");
        setPasso("IDENTIDADE");
      } catch (err) {
        const desfecho = err instanceof ApiError ? desfechoDaRecusa(err.status) : "FALHA";
        if (desfecho === "TRAVADO") {
          setPasso("TRAVADO");
          limparDadosPessoais();
          return;
        }
        if (desfecho === "MUITAS_TENTATIVAS") {
          setErro(FRASE_DA_RECUSA.MUITAS_TENTATIVAS);
          return;
        }
        if (desfecho === "INDISPONIVEL") {
          setManutencao(true);
          return;
        }
        // CÓDIGO ERRADO E CÓDIGO VENCIDO TÊM A MESMA FRASE, e sem contador: dizer "faltam 2
        // tentativas" ajuda quem está chutando e não ajuda quem digitou errado. Aqui a frase é da
        // TELA (e não a do servidor) porque este passo tem um conserto concreto a oferecer, que é
        // conferir o e-mail ou pedir outro código.
        setErro(FRASE_CODIGO_NAO_CONFERE);
      } finally {
        setEnviando(false);
      }
    },
    [codigo, email, enviando, limparDadosPessoais],
  );

  /**
   * A IDENTIDADE. Os dois desfechos de sucesso são "o link foi para o seu e-mail" e "recebemos os
   * seus dados", e NENHUM dos dois entra no Portal.
   */
  const confirmarIdentidade = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!identidadePronta || enviando) return;
      setEnviando(true);
      setErro(null);
      setRecado(null);
      setManutencao(false);
      try {
        const r = await apiFetch<IdentidadeDoAcessoResposta>(ROTA_IDENTIDADE_DO_ACESSO, {
          method: "POST",
          body: { bilhete, cpf, dataNascimento: isoNascimento },
        });
        // §A.6: CPF e data saem do estado no mesmo instante em que o desfecho chega.
        limparDadosPessoais();
        setPasso(r?.situacao === "DADOS_RECEBIDOS" ? "DADOS_RECEBIDOS" : "LINK_ENVIADO");
      } catch (err) {
        const desfecho = err instanceof ApiError ? desfechoDaRecusa(err.status) : "FALHA";
        if (desfecho === "TRAVADO") {
          setPasso("TRAVADO");
          limparDadosPessoais();
          return;
        }
        if (desfecho === "INDISPONIVEL") {
          setManutencao(true);
          return;
        }
        // A RECUSA É UMA SÓ, e a frase é a DO SERVIDOR, exibida como veio. A tela não sabe, e não
        // pode saber, se o que houve foi dado que não bateu, bilhete vencido ou trava: a frase única
        // cobre os três e é justamente ela que fecha o oráculo. Quem reescreve recusa aqui reabre.
        setErro(err instanceof ApiError ? mensagemDaRecusa(err) : FRASE_DA_RECUSA.FALHA);
      } finally {
        setEnviando(false);
      }
    },
    [bilhete, cpf, enviando, identidadePronta, isoNascimento, limparDadosPessoais],
  );

  // ── EMAIL ─────────────────────────────────────────────────────────────────────────────────────
  if (passo === "EMAIL") {
    return (
      <div className="flex flex-col gap-5">
        <Titulo
          titulo="Entrar Com Meu E-mail"
          apoio="Informe o e-mail que você usou na sua candidatura. Se ele estiver cadastrado, enviamos um código de 6 números para essa caixa."
        />

        {manutencao ? <AvisoManutencao /> : erro ? <Aviso tom="atencao">{erro}</Aviso> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (emailPronto) void pedirCodigo(false);
          }}
          className="flex flex-col gap-5"
          noValidate
        >
          <div className="flex flex-col gap-2">
            <label
              htmlFor="portal-acesso-email"
              className="whitespace-nowrap text-sm font-semibold"
            >
              E-mail
            </label>
            <div className="relative">
              <input
                id="portal-acesso-email"
                name="portal-acesso-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="send"
                placeholder="seuemail@exemplo.com"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                className={CAMPO}
              />
              <Mail
                className="pointer-events-none absolute right-4 top-4 size-5 text-portal-muted"
                aria-hidden
              />
            </div>
          </div>

          <Botao
            type="submit"
            icone={ArrowRight}
            iconeDireita
            largo
            className="h-14"
            disabled={!emailPronto || enviando}
          >
            {enviando ? "Enviando..." : "Enviar código"}
          </Botao>
        </form>

        <Nota icone={ShieldCheck}>
          O código chega no seu <span className="whitespace-nowrap">e-mail</span> e vale por poucos
          minutos. Depois de conferir, pedimos o seu CPF e a sua data de nascimento para confirmar
          que é você.
        </Nota>

        <Rodape aoIrParaLink={aoIrParaLink} />
      </div>
    );
  }

  // ── CODIGO ────────────────────────────────────────────────────────────────────────────────────
  if (passo === "CODIGO") {
    return (
      <div className="flex flex-col gap-5">
        <Titulo
          titulo="Digite O Código"
          apoio="Se o e-mail estiver cadastrado, o código de 6 números chegou nele. Confira também a caixa de spam."
        />

        {recado ? <Aviso tom="ok">{recado}</Aviso> : null}
        {manutencao ? <AvisoManutencao /> : erro ? <Aviso tom="atencao">{erro}</Aviso> : null}

        {/* O PRAZO À VISTA. Sem ele a pessoa fica olhando um código morto e conclui que o sistema
            quebrou. Quando o servidor não nos deu o prazo, dizemos o que sabemos e nada mais. */}
        <div className="flex items-center gap-2 text-[13px] font-semibold text-portal-muted">
          <Clock className="size-[17px] shrink-0" aria-hidden />
          {restante === null ? (
            <span>O código vale por alguns minutos.</span>
          ) : venceu ? (
            <span className="text-portal-at-tx">O código venceu. Peça outro para continuar.</span>
          ) : (
            <span aria-live="polite">
              O código vale por mais{" "}
              <span className="tabular-nums">{contagemRegressiva(restante)}</span>
            </span>
          )}
        </div>

        <form onSubmit={confirmarCodigo} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="portal-acesso-codigo" className="text-sm font-semibold">
              Código de {TAMANHO_DO_CODIGO} números
            </label>
            <input
              id="portal-acesso-codigo"
              name="portal-acesso-codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              enterKeyHint="send"
              placeholder="000000"
              maxLength={TAMANHO_DO_CODIGO}
              value={codigo}
              onChange={(ev) => setCodigo(digitosDoCodigo(ev.target.value))}
              className={`${CAMPO} pr-4 text-center text-[26px] font-bold tracking-[0.35em] tabular-nums`}
            />
          </div>

          <Botao
            type="submit"
            icone={ArrowRight}
            iconeDireita
            largo
            className="h-14"
            disabled={!codigoCompleto(codigo) || enviando || venceu}
          >
            {enviando ? "Conferindo..." : "Confirmar código"}
          </Botao>
        </form>

        <div className="flex flex-col gap-3 border-t border-portal-linha pt-4">
          <button
            type="button"
            onClick={() => void pedirCodigo(true)}
            disabled={enviando}
            className="min-h-11 text-sm font-semibold text-portal-primaria disabled:opacity-50"
          >
            {enviando ? "Pedindo..." : "Pedir outro código"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPasso("EMAIL");
              setCodigo("");
              setErro(null);
              setRecado(null);
              setExpiraEm(null);
            }}
            className="min-h-11 text-sm font-semibold text-portal-muted"
          >
            Trocar o <span className="whitespace-nowrap">e-mail</span>
          </button>
        </div>

        <Rodape />
      </div>
    );
  }

  // ── IDENTIDADE ────────────────────────────────────────────────────────────────────────────────
  // NADA DA PESSOA APARECE AQUI, e isso é condição da auditoria, não simplicidade de tela: o passo
  // anterior devolveu um bilhete e nada mais, porque posse de caixa de e-mail não prova identidade.
  if (passo === "IDENTIDADE") {
    return (
      <div className="flex flex-col gap-5">
        <Titulo
          titulo="Criar Cadastro"
          apoio="Para criar o seu cadastro, informe o CPF e a data de nascimento."
        />

        {manutencao ? <AvisoManutencao /> : erro ? <Aviso tom="atencao">{erro}</Aviso> : null}

        <form onSubmit={confirmarIdentidade} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <label htmlFor="portal-acesso-cpf" className="text-sm font-semibold">
              CPF
            </label>
            <div className="relative">
              <input
                id="portal-acesso-cpf"
                name="portal-acesso-cpf"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="next"
                placeholder="000.000.000-00"
                value={formatarCpf(cpf)}
                onChange={(ev) => setCpf(somenteDigitos(ev.target.value))}
                className={CAMPO}
                aria-describedby="portal-acesso-cpf-ajuda"
              />
              <User
                className="pointer-events-none absolute right-4 top-4 size-5 text-portal-muted"
                aria-hidden
              />
            </div>
            <span id="portal-acesso-cpf-ajuda" className="text-xs text-portal-muted">
              Pode digitar com ou sem pontos.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="portal-acesso-nascimento" className="text-sm font-semibold">
              Data de nascimento
            </label>
            <div className="relative">
              <input
                id="portal-acesso-nascimento"
                name="portal-acesso-nascimento"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="dd/mm/aaaa"
                value={dataNascimento}
                onChange={(ev) => setDataNascimento(mascaraData(ev.target.value))}
                className={CAMPO}
              />
              <Calendar
                className="pointer-events-none absolute right-4 top-4 size-5 text-portal-muted"
                aria-hidden
              />
            </div>
          </div>

          <Botao
            type="submit"
            icone={ArrowRight}
            iconeDireita
            largo
            className="h-14"
            disabled={!identidadePronta || enviando}
          >
            {enviando ? "Confirmando..." : "Confirmar"}
          </Botao>
        </form>

        <Nota icone={Lock}>
          Pedimos esses dados só para confirmar que é você. Eles não ficam guardados neste aparelho.
        </Nota>

        {/* A SAÍDA DE QUEM DEMOROU. A recusa é uma só, então a tela não tem como saber se o que
            houve foi dado que não bateu ou prazo que venceu no meio do preenchimento. Sem este
            botão, quem passou do prazo tentaria para sempre na mesma tela. */}
        <button
          type="button"
          onClick={() => {
            limparDadosPessoais();
            setBilhete("");
            setExpiraEm(null);
            setErro(null);
            setRecado(null);
            setPasso("EMAIL");
          }}
          className="min-h-11 text-sm font-semibold text-portal-muted"
        >
          Começar de novo
        </button>

        <Rodape />
      </div>
    );
  }

  // ── LINK_ENVIADO ──────────────────────────────────────────────────────────────────────────────
  // O SUCESSO NÃO ENTRA NO PORTAL, e não existe botão que finja entrar: a chave de acesso continua
  // sendo o link mais CPF mais nascimento, e o link acabou de ir para a caixa da admissão.
  //
  // ┌─ NENHUM CARACTERE DO ENDEREÇO APARECE AQUI, e a razão é fina ──────────────────────────────┐
  // │ O link é enviado para `candidatos.email`, que é a ficha da ADMISSÃO. Quem chegou até aqui    │
  // │ provou a posse de `as_candidatos.email`, que é a ficha do FUNIL. OS DOIS PODEM SER           │
  // │ ENDEREÇOS DIFERENTES, e no caso-alvo desta porta (ficha com `cpf` nulo) ele não provou posse │
  // │ de mais nada. Mostrar primeira letra, última letra e o DOMÍNIO INTEIRO de um endereço cuja   │
  // │ posse ninguém provou é entregar dado de terceiro, que é a mesma família do achado que matou  │
  // │ a v1 do desenho.                                                                            │
  // │                                                                                            │
  // │ O FATO NECESSÁRIO CONTINUA DITO: a pessoa precisa saber em QUAL caixa procurar, e "o e-mail  │
  // │ cadastrado na sua admissão" diz isso inteiro. Os caracteres nunca foram necessários para      │
  // │ isso, e é por isso que a resposta do servidor deixou de trazê-los.                            │
  // └────────────────────────────────────────────────────────────────────────────────────────────┘
  if (passo === "LINK_ENVIADO") {
    return (
      <Desfecho
        tom="ok"
        titulo="Enviamos O Seu Link"
        texto="Enviamos um link de acesso para o e-mail cadastrado na sua admissão. Abra esse link para entrar no portal e enviar os seus documentos."
        rodape="O link é pessoal, guarde só para você. Se não encontrar a mensagem, confira a caixa de spam e as outras pastas do seu e-mail."
      />
    );
  }

  // ── DADOS_RECEBIDOS ───────────────────────────────────────────────────────────────────────────
  if (passo === "DADOS_RECEBIDOS") {
    return (
      <Desfecho
        tom="ok"
        titulo="Recebemos Os Seus Dados"
        texto="Recebemos os seus dados, o time vai seguir com a sua admissão."
        rodape="Quando a sua lista de documentos estiver pronta, você recebe o link de acesso no seu e-mail."
      />
    );
  }

  // ── TRAVADO ───────────────────────────────────────────────────────────────────────────────────
  // FRASE NEUTRA, e nenhuma palavra sobre o que divergiu: a tela não diz qual campo, não diz que o
  // CPF já existe e não diz de quem ele é. Quem resolve é o time, com a pessoa.
  return (
    <Desfecho
      tom="atencao"
      titulo="Precisamos Conferir Com Você"
      texto={FRASE_DA_RECUSA.TRAVADO}
      rodape="Fale com o RH pelo WhatsApp abaixo. Eles conferem os seus dados e liberam o seu acesso."
    />
  );
}

function Desfecho({
  tom,
  titulo,
  texto,
  rodape,
}: {
  tom: "ok" | "atencao";
  titulo: string;
  texto: string;
  rodape: string;
}) {
  const ok = tom === "ok";
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span
        className={`grid size-14 place-items-center rounded-full ${
          ok ? "bg-portal-agua-tint text-portal-agua-tx" : "bg-portal-at-bg text-portal-at-tx"
        }`}
      >
        {ok ? (
          <Mail className="size-7" aria-hidden />
        ) : (
          <TriangleAlert className="size-7" aria-hidden />
        )}
      </span>
      <h1 className="font-display m-0 text-xl font-bold text-portal-ink">{emailInteiro(titulo)}</h1>
      <p className="m-0 text-sm leading-relaxed text-portal-texto" role="status" aria-live="polite">
        {emailInteiro(texto)}
      </p>
      <p className="m-0 text-[13px] leading-relaxed text-portal-muted">{emailInteiro(rodape)}</p>
      <BotaoFalarComRh className="mt-1" />
    </div>
  );
}

/**
 * A saída humana em toda tela (o RH), mais o ATALHO SECUNDÁRIO de quem já tem o link.
 *
 * O "Já tenho o link" é a opção da MINORIA (ver `EntradaSemLink`): o e-mail é o caminho principal, e
 * este atalho leva quem tem o link em mãos para a instrução de sempre. Ele só aparece no passo do
 * e-mail (a entrada), onde o `aoIrParaLink` é passado; nos passos seguintes a volta já é "Trocar o
 * e-mail" e "Começar de novo". §A.24: ação de navegação, escrita normal.
 */
function Rodape({ aoIrParaLink }: { aoIrParaLink?: () => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-portal-linha pt-4">
      <BotaoFalarComRh />
      {aoIrParaLink ? (
        <button
          type="button"
          onClick={aoIrParaLink}
          className="min-h-11 text-sm font-semibold text-portal-primaria"
        >
          Já tenho o link
        </button>
      ) : null}
    </div>
  );
}
