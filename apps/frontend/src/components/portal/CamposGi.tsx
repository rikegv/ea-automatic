"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CampoExtraidoPortal } from "@ea/shared-types";
import {
  CAMPOS_SEM_DOCUMENTO,
  rotuloDaOpcao,
  separarCampos,
  type CampoConfirmadoGi,
  type CampoFinal,
  type OpcaoGi,
} from "@/lib/portal-dados-gi";
import { dataParaCanonico, dataParaExibicao } from "@/lib/portal-data-br";
import { SolAvatar } from "@/components/portal/designer/Sol";
import { IconeAlerta, IconeCheck, IconeDica } from "@/components/portal/IconesPortal";

/**
 * PEÇA 1 DO PORTAL PARA O G.I: o candidato VÊ e VALIDA o que a IA extraiu. UX HÍBRIDA (A3, decisão
 * do diretor): conferência POR DOCUMENTO na hora (o contexto fresco), mais um passo FINAL curto com
 * o que ficou vazio e com os campos que não saem de documento (raça, grau, estado civil,
 * nacionalidade, naturalidade).
 *
 * ┌─ A REGRA, e ela é do motor, não uma opção da tela ──────────────────────────────────────────┐
 * │ O VÁLIDO É SEMPRE O QUE O CANDIDATO CONFIRMA, NUNCA O QUE A IA LEU. A IA é SUGESTÃO. Campo    │
 * │ lido (`lido=true`) vem preenchido, em realce cinza-confirmável, para o candidato conferir;    │
 * │ campo não lido (`lido=false`, valor vazio) vem branco, com atenção, pedindo que ele digite.   │
 * │ TODO campo é editável: `confianca`/`lido` só decidem o realce, nunca bloqueiam a edição.      │
 * │                                                                                              │
 * │ DEDUPLICAÇÃO: nome e nascimento aparecem em vários documentos. Confirma UMA vez (na primeira  │
 * │ casa que traz), e nas casas seguintes o campo só é EXIBIDO, nunca re-perguntado.              │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * TEMA CLARO FIXO, cores LITERAIS, como toda a trilha do candidato: o `Select` e o `Modal` do
 * design system vestem o tema do OPERADOR, que inverte no modo escuro, então esta tela reimplementa
 * o seletor com o mesmo cuidado de `ModalTermo`/`ModalDica` (o `<select>` nativo abriria o dropdown
 * do sistema operacional, cinza no escuro, §A.35). MOBILE-FIRST: um campo por linha, sem esmagar.
 *
 * §A.11 (sem travessão), §A.24 (Title Case em título e etiqueta; frase de apoio e botão de ação em
 * escrita normal), §A.41 (o dropdown fecha por clique-fora e Escape, mas o painel de preenchimento
 * não é modal e não se perde sozinho).
 */

// ── Cores literais (tema claro fixo, paleta Soulan do Designer, iguais às da trilha) ──
const AZUL = "#1A4895"; // portal-primaria
const VERDE = "#4A6400"; // portal-ok-tx
const AMARELO = "#A33F12"; // portal-at-tx

/**
 * O TIER DE LEITURA DE UM CAMPO, derivado NA TELA, display-only (decisão do diretor).
 *
 * O contrato traz `confianca: number` e `lido: boolean`, e o comentário do contrato é firme: a
 * confiança "só decide o realce, nunca bloqueia a edição". Aqui o realce ganha um TERCEIRO tier
 * (o "Confira" coral do Designer): campo LIDO mas com confiança abaixo do piso pede conferência
 * com destaque, sem travar nada.
 *
 * §A.6: o limiar é constante de tela, NÃO vai a log, NÃO persiste e NÃO toca o backend nem o
 * contrato. Campo `lido:false` segue no realce de "Não lido"; todo campo continua editável.
 */
const LIMIAR_CONFIRA = 0.85;
type TierCampo = "lido" | "confira" | "nao-lido";
function tierDoCampo(c: CampoExtraidoPortal): TierCampo {
  if (!c.lido) return "nao-lido";
  return c.confianca < LIMIAR_CONFIRA ? "confira" : "lido";
}

const CLASSE_BOTAO =
  "mt-6 w-full rounded-xl bg-[#1A4895] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#1A4895]/25 transition-all hover:bg-[#123670] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 lg:mx-auto lg:block lg:max-w-[420px]";

// ── O seletor do design system, reimplementado para o tema claro fixo ─────────
/**
 * O SELETOR DA TRILHA. Não é `<select>` nativo (§A.35: o nativo abre o dropdown do SO, cinza no
 * modo escuro) e não é o `Select` do design system (que veste o tema do operador). É o seletor da
 * tela do candidato: fundo branco, dropdown claro, e CAMPO DE BUSCA quando a lista é longa (>8
 * opções, o mesmo piso do design system), porque o grau de instrução tem 13.
 *
 * FECHA por clique-fora e por Escape. O dropdown fica no fluxo, ancorado ao gatilho, com rolagem
 * própria: os campos vivem num cartão branco sem overflow escondido, então não precisa de portal.
 */
function SelectPortal({
  value,
  onChange,
  opcoes,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  opcoes: readonly OpcaoGi[];
  placeholder: string;
  ariaLabel: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const wrap = useRef<HTMLDivElement | null>(null);
  const comBusca = opcoes.length > 8;

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const aoClicar = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoClicar);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoClicar);
    };
  }, [aberto]);

  useEffect(() => {
    if (!aberto) setBusca("");
  }, [aberto]);

  const filtradas = useMemo(() => {
    const q = busca
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
    if (q === "") return opcoes;
    return opcoes.filter((o) =>
      o.label
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .includes(q),
    );
  }, [opcoes, busca]);

  const rotulo = value ? rotuloDaOpcao(opcoes, value) : "";

  return (
    <div ref={wrap} className="relative" style={{ colorScheme: "light" }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-3 text-left text-sm transition-colors ${
          aberto ? "border-[#1A4895] ring-2 ring-[#1A4895]/20" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <span className={rotulo ? "font-medium text-slate-800" : "text-slate-400"}>
          {rotulo || placeholder}
        </span>
        <svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#64748b"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`flex-none transition-transform ${aberto ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {aberto ? (
        <div
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_50px_-18px_rgba(15,40,70,0.35)]"
        >
          {comBusca ? (
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar"
                className="w-full rounded-lg border border-slate-200 bg-[#f7fafc] px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#1A4895]"
              />
            </div>
          ) : null}
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <li className="px-3.5 py-2.5 text-sm text-slate-400">Nada encontrado.</li>
            ) : (
              filtradas.map((o) => {
                const ativo = o.value === value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={ativo}
                      onClick={() => {
                        onChange(o.value);
                        setAberto(false);
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm transition-colors ${
                        ativo ? "bg-[#EAF1FA] font-semibold text-[#1A4895]" : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {o.label}
                      {ativo ? <IconeCheck cor={AZUL} tamanho={16} /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ── Campo de texto da trilha (pele CampoLido do Designer) ─────────────────────
/**
 * O CAMPO DE CONFERÊNCIA, com a etiqueta de leitura do Designer no canto (Lido / Confira / Não
 * lido) e o realce coral quando pede atenção. O `estado` (o tier de leitura) só decide a PELE:
 * o campo é sempre editável, e a lógica de round-trip BR/ISO vive na `ConferenciaDocumento`.
 *
 * `atencao` é o realce legado (passo final, campo vazio que faltou), sem etiqueta de leitura.
 */
function CampoTextoGi({
  rotulo,
  valor,
  onChange,
  atencao,
  estado,
  ajuda,
  placeholder,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  /** Passo final: borda de atenção sem etiqueta de leitura. */
  atencao?: boolean;
  /** Conferência: o tier de leitura (Lido / Confira / Não lido) e o realce do campo. */
  estado?: TierCampo;
  ajuda?: string;
  placeholder?: string;
}) {
  const alerta = estado === "confira" || estado === "nao-lido" || (!estado && !!atencao);
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
          {rotulo}
          {!estado && atencao ? <IconeAlerta cor={AMARELO} tamanho={14} /> : null}
        </span>
        {estado === "lido" ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: VERDE }}>
            <IconeCheck cor={VERDE} tamanho={14} />
            Lido
          </span>
        ) : null}
        {estado === "confira" ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: AMARELO }}>
            <IconeAlerta cor={AMARELO} tamanho={14} />
            Confira
          </span>
        ) : null}
        {estado === "nao-lido" ? (
          <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: AMARELO }}>
            <IconeAlerta cor={AMARELO} tamanho={14} />
            Não lido
          </span>
        ) : null}
      </span>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={alerta || undefined}
        className={`w-full rounded-xl border-[1.5px] px-3.5 py-3 text-sm text-slate-800 outline-none transition-colors ${
          alerta
            ? "border-[#FF8864] bg-[#FFFBF8] focus:border-[#A33F12]"
            : valor
              ? "border-slate-300 bg-[#f5f8fa] focus:border-[#1A4895]"
              : "border-slate-300 bg-white focus:border-[#1A4895]"
        }`}
      />
      {ajuda ? (
        <span className={`mt-1 block text-[12px] ${alerta ? "text-[#A33F12]" : "text-slate-500"}`}>{ajuda}</span>
      ) : null}
    </label>
  );
}

function CampoFinalGi({
  campo,
  valor,
  onChange,
  atencao,
}: {
  campo: CampoFinal;
  valor: string;
  onChange: (v: string) => void;
  atencao?: boolean;
}) {
  if (campo.tipo === "select") {
    return (
      <div>
        <span className="mb-1 block text-[13px] font-semibold text-slate-700">{campo.rotulo}</span>
        <SelectPortal
          value={valor}
          onChange={onChange}
          opcoes={campo.opcoes}
          placeholder="Selecionar"
          ariaLabel={campo.rotulo}
        />
      </div>
    );
  }
  return (
    <CampoTextoGi
      rotulo={campo.rotulo}
      valor={valor}
      onChange={onChange}
      atencao={atencao}
      ajuda={campo.ajuda}
    />
  );
}

// ── A conferência POR DOCUMENTO ───────────────────────────────────────────────
/**
 * O passo curto que aparece assim que a IA lê o documento aceito. Mostra os campos DAQUELE
 * documento: os lidos preenchidos (cinza-confirmável), os não lidos vazios (atenção). Deduplica
 * contra o que já foi confirmado antes (nome, nascimento): repetido só é EXIBIDO, nunca
 * re-perguntado.
 */
export function ConferenciaDocumento({
  nomeDocumento,
  campos,
  jaConfirmados,
  aoConfirmar,
  aoAvancar,
  temProximo,
}: {
  nomeDocumento: string;
  campos: CampoExtraidoPortal[];
  /** campo -> valor já confirmado numa casa anterior. Presença = não pergunta de novo. */
  jaConfirmados: Record<string, string>;
  /** Grava os campos confirmados. Devolve true no sucesso. Lista vazia grava nada e devolve true. */
  aoConfirmar: (campos: CampoConfirmadoGi[]) => Promise<boolean>;
  aoAvancar: () => void;
  temProximo: boolean;
}) {
  const { novos, repetidos } = useMemo(
    () => separarCampos(campos, jaConfirmados),
    [campos, jaConfirmados],
  );

  // O valor ORIGINAL cru de cada campo, exatamente como o servidor mandou (ISO, quando é data). É o
  // que garante o round-trip: campo não editado é reenviado byte a byte, sem passar pela tradução.
  const originais = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of novos) m[c.campo] = c.lido ? c.valor : "";
    return m;
  }, [novos]);

  // O que o candidato VÊ e edita: o original já traduzido para BR (data vira DD/MM/AAAA; o resto,
  // RG, CPF, nome, vazio, volta intacto de `dataParaExibicao`).
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const inicial: Record<string, string> = {};
    for (const c of novos) inicial[c.campo] = dataParaExibicao(c.lido ? c.valor : "");
    return inicial;
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    // NÃO EDITADO submete o ORIGINAL cru (G.I inalterado); EDITADO submete o canônico ISO. Nunca BR.
    const confirmados: CampoConfirmadoGi[] = novos.map((c) => {
      const original = originais[c.campo] ?? "";
      const atual = valores[c.campo] ?? "";
      const naoEditado = atual === dataParaExibicao(original);
      return {
        campo: c.campo,
        valor: naoEditado ? original : dataParaCanonico(atual.trim()),
      };
    });
    const ok = await aoConfirmar(confirmados);
    setEnviando(false);
    if (ok) aoAvancar();
    else setErro("Não foi possível salvar agora. Tente de novo em alguns instantes.");
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-card lg:mx-auto lg:max-w-2xl lg:p-9">
      <div className="flex items-start gap-3">
        <SolAvatar tamanho={56} anel="verde" />
        <div className="flex-1 pt-1">
          <h1 className="text-lg font-bold leading-tight text-portal-ink lg:text-2xl">
            Confira O Que Lemos Do Seu {nomeDocumento}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
            Isto é o que eu li. Confira e corrija o que precisar. Vale sempre o que você confirmar.
          </p>
        </div>
      </div>

      {repetidos.length > 0 ? (
        <div className="mt-5 rounded-2xl bg-[#eef7dc] p-4">
          <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#5f7d18]">
            Você Já Confirmou
          </p>
          <ul className="flex flex-col gap-1.5">
            {repetidos.map((c) => (
              <li key={c.campo} className="flex items-center gap-2 text-[13px] text-slate-700">
                <IconeCheck cor={VERDE} tamanho={16} />
                <span className="font-semibold">{c.rotulo}:</span>
                <span className="truncate">
                  {dataParaExibicao(jaConfirmados[c.campo] ?? "") || "não informado"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {novos.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {novos.map((c) => {
            const tier = tierDoCampo(c);
            return (
              <div key={c.campo}>
                <CampoTextoGi
                  rotulo={c.rotulo}
                  valor={valores[c.campo] ?? ""}
                  onChange={(v) => setValores((atual) => ({ ...atual, [c.campo]: v }))}
                  estado={tier}
                  ajuda={
                    tier === "lido"
                      ? "Confira se está exatamente como no documento."
                      : tier === "confira"
                        ? "Não li com total certeza. Confira este campo com atenção."
                        : "Não consegui ler este campo. Digite você mesmo."
                  }
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#e6f5fb] p-4">
          <IconeDica cor={AZUL} tamanho={20} />
          <p className="text-[13px] font-medium leading-relaxed text-[#1A4895]">
            Não há nada novo para conferir neste documento. Pode seguir.
          </p>
        </div>
      )}

      {erro ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#fdf3d8] p-4" role="alert">
          <IconeAlerta cor={AMARELO} tamanho={20} />
          <p className="text-[13px] font-medium leading-relaxed text-[#8a6410]">{erro}</p>
        </div>
      ) : null}

      <button type="button" onClick={confirmar} disabled={enviando} className={CLASSE_BOTAO}>
        {enviando
          ? "Salvando..."
          : novos.length === 0
            ? temProximo
              ? "Continuar"
              : "Concluir"
            : temProximo
              ? "Confirmar e continuar"
              : "Confirmar e concluir"}
      </button>
    </div>
  );
}

// ── O passo FINAL ─────────────────────────────────────────────────────────────
/**
 * A última tela antes da conclusão: curta, só com o que ficou vazio no caminho mais os campos que
 * NÃO saem de documento (raça, grau de instrução, estado civil, nacionalidade, naturalidade). O
 * candidato preenche e conclui.
 */
export function PassoFinal({
  primeiroNome,
  vazios,
  aoConcluir,
}: {
  primeiroNome: string;
  /** Campos de documento que ficaram vazios no caminho, para uma segunda chance. campo -> rótulo. */
  vazios: { campo: string; rotulo: string }[];
  aoConcluir: (campos: CampoConfirmadoGi[]) => Promise<boolean>;
}) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function set(campo: string, v: string) {
    setValores((atual) => ({ ...atual, [campo]: v }));
  }

  async function concluir() {
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    // Envia todos os campos preenchidos: os que ficaram vazios e agora têm valor, e os do
    // catálogo (raça, grau, etc.). O que segue vazio não é enviado.
    const chaves = [...vazios.map((v) => v.campo), ...CAMPOS_SEM_DOCUMENTO.map((c) => c.campo)];
    const confirmados: CampoConfirmadoGi[] = [];
    for (const campo of chaves) {
      const valor = (valores[campo] ?? "").trim();
      if (valor !== "") confirmados.push({ campo, valor });
    }
    const ok = await aoConcluir(confirmados);
    setEnviando(false);
    if (!ok) setErro("Não foi possível salvar agora. Tente de novo em alguns instantes.");
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card lg:mx-auto lg:max-w-2xl lg:p-10">
      <div className="flex items-start gap-3">
        <SolAvatar tamanho={62} anel="verde" />
        <div className="flex-1 pt-1">
          <h1 className="text-xl font-bold leading-tight text-portal-ink lg:text-2xl">
            Quase Lá, {primeiroNome}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
            Faltam só alguns dados que não estão nos documentos. Preencha e a gente termina.
          </p>
        </div>
      </div>

      {vazios.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-[#8a6410]">
            <IconeAlerta cor={AMARELO} tamanho={14} />
            Ficou Faltando
          </p>
          <div className="flex flex-col gap-4">
            {vazios.map((v) => (
              <CampoTextoGi
                key={v.campo}
                rotulo={v.rotulo}
                valor={valores[v.campo] ?? ""}
                onChange={(valor) => set(v.campo, valor)}
                atencao
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-slate-500">Sobre Você</p>
        <div className="flex flex-col gap-4">
          {CAMPOS_SEM_DOCUMENTO.map((campo) => (
            <CampoFinalGi
              key={campo.campo}
              campo={campo}
              valor={valores[campo.campo] ?? ""}
              onChange={(v) => set(campo.campo, v)}
            />
          ))}
        </div>
      </div>

      {erro ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#fdf3d8] p-4" role="alert">
          <IconeAlerta cor={AMARELO} tamanho={20} />
          <p className="text-[13px] font-medium leading-relaxed text-[#8a6410]">{erro}</p>
        </div>
      ) : null}

      <button type="button" onClick={concluir} disabled={enviando} className={CLASSE_BOTAO}>
        {enviando ? "Salvando..." : "Concluir"}
      </button>
    </div>
  );
}
