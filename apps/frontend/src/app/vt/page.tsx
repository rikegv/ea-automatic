"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

/**
 * Formulário de VT online do candidato (§A.17 etapa 2). Página PÚBLICA e mobile-first: vive fora
 * do route group (app), então não herda o AppShell nem o guard de sessão do sistema. Quem preenche
 * é o candidato, que não é usuário do EA.
 *
 * TEMA CLARO SEMPRE (decisão do diretor): esta tela é do candidato e não acompanha o dark mode do
 * aparelho. As cores são literais (nunca var(--...) do design system, que inverte por tema) e o
 * container declara `color-scheme: light`, que é o que força os controles NATIVOS (date, select)
 * a renderizarem claros mesmo com o celular em modo escuro.
 *
 * §A.6: CPF e data de nascimento são CREDENCIAL. Ficam só no estado da identificação, não são
 * regravados depois e nunca vão para log. Da identificação em diante o que autentica é o token
 * curto devolvido pelo backend.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Tarifa {
  cidade: string;
  tipoTransporte: string;
  valor: number;
}

type Sentido = "IDA" | "VOLTA";
type Cartao = "BILHETE_UNICO" | "CARTAO_TOP" | "OUTRO";

interface Conducao {
  /** Chave estável de render (a lista é reordenável por remoção). */
  uid: string;
  sentido: Sentido;
  /** Nome da cidade OU o sentinela OUTRA (cidade sem tarifa cadastrada). */
  cidade: string;
  /** Preenchido só quando `cidade` = OUTRA. */
  cidadeOutra: string;
  tipoTransporte: string;
  cartao: Cartao | "";
  cartaoOutro: string;
  /** Texto do input: o candidato pode ajustar a sugestão da tabela. */
  valor: string;
}

interface Opcao {
  valor: string;
  rotulo: string;
}

/** Sentinela de "cidade fora da tabela". Não colide com nome real (cidades não têm underscore). */
const OUTRA = "__OUTRA__";

const CARTOES: Opcao[] = [
  { valor: "BILHETE_UNICO", rotulo: "Bilhete Único" },
  { valor: "CARTAO_TOP", rotulo: "Cartão TOP" },
  { valor: "OUTRO", rotulo: "Outro" },
];

/**
 * Os 3 avisos exibidos ANTES do envio (§A.17 Parte C), um por vez. O texto é o aprovado pelo
 * diretor; o envio só acontece depois do "Estou ciente das informações passadas".
 */
const AVISOS: { titulo: string; texto: string }[] = [
  {
    titulo: "Assinatura digital",
    texto: "Você vai assinar este formulário digitalmente junto com o seu contrato de trabalho.",
  },
  {
    titulo: "Veracidade das informações",
    texto: "Você declara que todas as informações preenchidas são verdadeiras.",
  },
  {
    titulo: "Uso do vale-transporte",
    texto:
      "O vale-transporte é para uso no deslocamento casa-trabalho e trabalho-casa, em transporte público.",
  },
];

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Aceita "6,10" e "6.10". Zero é válido (gratuidade). */
function parseValor(entrada: string): number {
  const n = Number((entrada ?? "").trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

function mascararCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

function mascararCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.replace(/^(\d{5})(\d)/, "$1-$2");
}

let seq = 0;
const novaConducao = (sentido: Sentido): Conducao => ({
  uid: `c${++seq}`,
  sentido,
  cidade: "",
  cidadeOutra: "",
  tipoTransporte: "",
  cartao: "",
  cartaoOutro: "",
  valor: "",
});

// ── Página ───────────────────────────────────────────────────────────────────
export default function FormularioVtPage() {
  // Etapa A: identificação. Etapa B: formulário.
  const [token, setToken] = useState<string | null>(null);
  const [nome, setNome] = useState("");

  const [cpf, setCpf] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [identificando, setIdentificando] = useState(false);
  const [erroId, setErroId] = useState<string | null>(null);

  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [optante, setOptante] = useState<boolean | null>(null);

  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  // Cidade do endereço: seleção na lista (ou OUTRA) + o nome digitado quando OUTRA.
  const [cidadeSel, setCidadeSel] = useState("");
  const [cidadeLivre, setCidadeLivre] = useState("");
  const [uf, setUf] = useState("");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);

  const [conducoes, setConducoes] = useState<Conducao[]>([]);

  // Parte C: modal sequencial dos avisos + envio.
  const [aviso, setAviso] = useState<number | null>(null); // null = modal fechado
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  /** Cidade do endereço já resolvida (o que vai ao backend). */
  const cidade = cidadeSel === OUTRA ? cidadeLivre : cidadeSel;

  // ── Etapa A: identificação ────────────────────────────────────────────────
  async function identificar(e: FormEvent) {
    e.preventDefault();
    setErroId(null);
    setIdentificando(true);
    try {
      const r = await apiFetch<{ token: string; nome: string }>("/vt/identificar", {
        method: "POST",
        body: { cpf: cpf.replace(/\D/g, ""), dataNascimento },
      });
      setToken(r.token);
      setNome(r.nome);
    } catch (err) {
      setErroId(
        err instanceof Error
          ? err.message
          : "Dados não encontrados. Confira o CPF e a data de nascimento, ou procure o RH.",
      );
    } finally {
      setIdentificando(false);
    }
  }

  // Tarifas chegam depois da identificação (a rota exige a sessão do candidato).
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        setTarifas(await apiFetch<Tarifa[]>("/vt/tarifas", { token }));
      } catch {
        // Sem tarifa a tela ainda funciona: tudo cai em "Outra" e o candidato digita.
        setTarifas([]);
      }
    })();
  }, [token]);

  // ── Listas ────────────────────────────────────────────────────────────────
  const cidades = useMemo(
    () =>
      Array.from(new Set(tarifas.map((t) => t.cidade))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [tarifas],
  );
  /** Opções de cidade: as cadastradas em tarifas_transporte + "Outra" (decisão do diretor). */
  const opcoesCidade: Opcao[] = useMemo(
    () => [...cidades.map((c) => ({ valor: c, rotulo: c })), { valor: OUTRA, rotulo: "Outra" }],
    [cidades],
  );
  const tiposDaCidade = useCallback(
    (c: string): Opcao[] =>
      tarifas
        .filter((t) => t.cidade === c)
        .map((t) => ({ valor: t.tipoTransporte, rotulo: t.tipoTransporte })),
    [tarifas],
  );
  const sugestao = useCallback(
    (c: string, tipo: string) => tarifas.find((t) => t.cidade === c && t.tipoTransporte === tipo),
    [tarifas],
  );

  // ── CEP ───────────────────────────────────────────────────────────────────
  const buscarCep = useCallback(async () => {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8 || !token) return;
    setBuscandoCep(true);
    setErroCep(null);
    try {
      const r = await apiFetch<{
        logradouro: string;
        bairro: string;
        cidade: string;
        uf: string;
      }>(`/vt/cep/${limpo}`, { token });
      setLogradouro(r.logradouro);
      setBairro(r.bairro);
      setUf(r.uf);
      // A cidade do CEP cai na lista quando existe tarifa para ela; senão vira "Outra" já
      // preenchida, para o candidato não ter que redigitar o que o CEP já resolveu.
      if (cidades.includes(r.cidade)) {
        setCidadeSel(r.cidade);
        setCidadeLivre("");
      } else {
        setCidadeSel(OUTRA);
        setCidadeLivre(r.cidade);
      }
    } catch (err) {
      setErroCep(err instanceof Error ? err.message : "Não foi possível consultar o CEP.");
    } finally {
      setBuscandoCep(false);
    }
  }, [cep, token, cidades]);

  // Autocompleta assim que o CEP fica completo, sem o candidato precisar clicar em nada.
  useEffect(() => {
    if (cep.replace(/\D/g, "").length === 8) void buscarCep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cep]);

  // ── Itinerários ───────────────────────────────────────────────────────────
  function atualizar(uid: string, patch: Partial<Conducao>) {
    setConducoes((lista) =>
      lista.map((c) => {
        if (c.uid !== uid) return c;
        const nova = { ...c, ...patch };
        // Trocar a cidade invalida o transporte escolhido (a lista de tipos muda).
        if (patch.cidade !== undefined && patch.cidade !== c.cidade) {
          nova.tipoTransporte = "";
          nova.valor = "";
          if (patch.cidade !== OUTRA) nova.cidadeOutra = "";
        }
        // Escolher o transporte SUGERE a tarifa vigente; o candidato pode sobrescrever depois.
        // Cidade "Outra" não tem tarifa cadastrada, então não há o que sugerir: ele digita.
        if (patch.tipoTransporte !== undefined && patch.tipoTransporte && nova.cidade !== OUTRA) {
          const t = sugestao(nova.cidade, patch.tipoTransporte);
          if (t) nova.valor = t.valor.toFixed(2).replace(".", ",");
        }
        return nova;
      }),
    );
  }

  const totalDe = useCallback(
    (sentido: Sentido) =>
      conducoes.filter((c) => c.sentido === sentido).reduce((s, c) => s + parseValor(c.valor), 0),
    [conducoes],
  );
  const totalIda = totalDe("IDA");
  const totalVolta = totalDe("VOLTA");
  const totalDia = totalIda + totalVolta;

  // ── Parte C: validação de tela, avisos e envio ────────────────────────────
  /** Impede abrir os avisos com o formulário obviamente incompleto. O backend revalida tudo. */
  function pendencia(): string | null {
    if (optante === null) return "Escolha se você quer ou não o vale-transporte.";
    if (cep.replace(/\D/g, "").length !== 8) return "Informe o seu CEP.";
    if (!logradouro.trim()) return "Informe o seu endereço.";
    if (!numero.trim()) return "Informe o número do seu endereço.";
    if (!bairro.trim()) return "Informe o seu bairro.";
    if (!cidade.trim()) return "Informe a sua cidade.";
    if (uf.trim().length !== 2) return "Informe a UF (2 letras).";
    if (optante) {
      if (conducoes.length === 0) return "Adicione pelo menos uma condução.";
      for (const c of conducoes) {
        if (!c.cidade) return "Escolha a cidade de cada condução.";
        if (c.cidade === OUTRA && !c.cidadeOutra.trim()) return "Informe qual é a cidade.";
        if (!c.tipoTransporte.trim()) return "Informe o transporte de cada condução.";
        if (!c.cartao) return "Escolha o cartão utilizado em cada condução.";
        if (c.cartao === "OUTRO" && !c.cartaoOutro.trim()) return "Informe qual é o cartão.";
      }
    }
    return null;
  }

  function abrirAvisos() {
    const p = pendencia();
    if (p) {
      setErroEnvio(p);
      return;
    }
    setErroEnvio(null);
    setAviso(0); // começa no primeiro aviso
  }

  /** Chamado só no "Estou ciente das informações passadas" (último aviso). */
  async function enviar() {
    setEnviando(true);
    setErroEnvio(null);
    try {
      await apiFetch("/vt/formulario", {
        method: "POST",
        token,
        body: {
          optante,
          cep: cep.replace(/\D/g, ""),
          logradouro,
          numero,
          complemento,
          bairro,
          cidade,
          uf,
          conducoes: optante
            ? conducoes.map((c) => ({
                sentido: c.sentido,
                // O sentinela nunca vai ao backend: vira o nome que o candidato digitou.
                cidade: c.cidade === OUTRA ? c.cidadeOutra : c.cidade,
                tipoTransporte: c.tipoTransporte,
                cartao: c.cartao,
                cartaoOutro: c.cartao === "OUTRO" ? c.cartaoOutro : undefined,
                valor: parseValor(c.valor),
              }))
            : [],
        },
      });
      setAviso(null);
      setEnviado(true);
    } catch (err) {
      setAviso(null);
      setErroEnvio(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  /** Baixa o PDF do documento (optante ou recusa). Vai com o token, então não é um <a> simples. */
  async function baixarPdf() {
    setBaixando(true);
    try {
      const res = await fetch("/api/vt/documento", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Não foi possível gerar o documento agora.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "formulario-vt.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : "Erro ao baixar o documento.");
    } finally {
      setBaixando(false);
    }
  }

  // ── Render: etapa A (centralizada na tela) ────────────────────────────────
  if (!token) {
    return (
      <Casca centralizado>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Formulário de vale-transporte
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Para começar, confirme quem é você. Informe o seu CPF e a sua data de nascimento.
        </p>

        <form onSubmit={identificar} className="mt-7 flex flex-col gap-4" noValidate>
          <Campo rotulo="CPF">
            <input
              inputMode="numeric"
              autoComplete="off"
              required
              value={mascararCpf(cpf)}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
              className={CLASSE_INPUT}
            />
          </Campo>
          <Campo rotulo="Data de nascimento">
            <input
              type="date"
              required
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
              className={CLASSE_INPUT}
            />
          </Campo>

          <button type="submit" disabled={identificando} className={CLASSE_BOTAO}>
            {identificando ? "Verificando…" : "Continuar"}
          </button>
        </form>

        {erroId && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold leading-relaxed text-red-700"
          >
            {erroId}
          </p>
        )}
      </Casca>
    );
  }

  // ── Render: enviado (confirmação + documento) ─────────────────────────────
  if (enviado) {
    return (
      <Casca centralizado>
        <div className="py-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#AAD12F]/20 text-[#6D8B14]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-7 w-7"
            >
              <path d="m5 12 5 5L20 7" />
            </svg>
          </div>
          <h1 className="mt-5 font-display text-xl font-bold text-slate-900">Formulário enviado</h1>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
            {optante
              ? "Recebemos o seu vale-transporte. Ele será anexado ao seu kit de admissão para assinatura junto com o contrato."
              : "Registramos que você não optou pelo vale-transporte. A sua declaração será anexada ao kit de admissão."}
          </p>

          <button onClick={baixarPdf} disabled={baixando} className={`${CLASSE_BOTAO} mt-7`}>
            {baixando ? "Gerando…" : "Ver o meu documento"}
          </button>

          {erroEnvio && (
            <p role="alert" className="mt-4 text-xs font-semibold text-red-600">
              {erroEnvio}
            </p>
          )}
        </div>
      </Casca>
    );
  }

  // ── Render: etapa B ───────────────────────────────────────────────────────
  return (
    <Casca>
      <header className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#1D8FB4]">
          Vale-transporte
        </p>
        <h1 className="mt-2 font-display text-xl font-bold leading-tight text-slate-900">
          Olá, {nome.split(" ")[0]}
        </h1>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{nome}</p>
      </header>

      <Secao titulo="Seu endereço">
        <Campo rotulo="CEP">
          <div className="relative">
            <input
              inputMode="numeric"
              value={mascararCep(cep)}
              onChange={(e) => setCep(e.target.value)}
              placeholder="00000-000"
              className={CLASSE_INPUT}
            />
            {buscandoCep && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-widest text-[#1D8FB4]">
                buscando
              </span>
            )}
          </div>
          {erroCep && <p className="mt-1.5 text-[11px] font-semibold text-red-600">{erroCep}</p>}
        </Campo>

        <Campo rotulo="Endereço">
          <input
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
            placeholder="Rua, avenida…"
            className={CLASSE_INPUT}
          />
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Número">
            <input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="123"
              className={CLASSE_INPUT}
            />
          </Campo>
          <Campo rotulo="Complemento">
            <input
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              placeholder="apto, bloco"
              className={CLASSE_INPUT}
            />
          </Campo>
        </div>

        <Campo rotulo="Bairro">
          <input
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            className={CLASSE_INPUT}
          />
        </Campo>

        <div className="grid grid-cols-[1fr_88px] gap-3">
          <Campo rotulo="Cidade">
            <SelectBusca
              valor={cidadeSel}
              opcoes={opcoesCidade}
              aoEscolher={(v) => {
                setCidadeSel(v);
                if (v !== OUTRA) setCidadeLivre("");
              }}
              placeholder="Selecione"
              buscaPlaceholder="Busque a sua cidade"
            />
          </Campo>
          <Campo rotulo="UF">
            <input
              value={uf}
              maxLength={2}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              className={CLASSE_INPUT}
            />
          </Campo>
        </div>

        {cidadeSel === OUTRA && (
          <Campo rotulo="Qual cidade?">
            <input
              value={cidadeLivre}
              onChange={(e) => setCidadeLivre(e.target.value)}
              placeholder="Nome da cidade"
              maxLength={120}
              className={CLASSE_INPUT}
            />
          </Campo>
        )}
      </Secao>

      <Secao titulo="Você quer o vale-transporte?">
        <div className="grid grid-cols-2 gap-3">
          <BotaoOpcao
            ativo={optante === true}
            onClick={() => {
              setOptante(true);
              // Nasce com uma condução em cada trajeto: o caminho comum é ida e volta.
              if (conducoes.length === 0) setConducoes([novaConducao("IDA"), novaConducao("VOLTA")]);
            }}
            titulo="Sim, quero"
            desc="Vou usar transporte público."
          />
          <BotaoOpcao
            ativo={optante === false}
            onClick={() => {
              setOptante(false);
              setConducoes([]);
            }}
            titulo="Não quero"
            desc="Uso meios próprios."
          />
        </div>
      </Secao>

      {optante === true && (
        <>
          {(["IDA", "VOLTA"] as Sentido[]).map((sentido) => (
            <Secao
              key={sentido}
              titulo={sentido === "IDA" ? "Itinerário de ida" : "Itinerário de volta"}
              acessorio={
                <span className="text-xs font-bold tabular-nums text-[#6D8B14]">
                  {BRL.format(totalDe(sentido))}
                </span>
              }
            >
              <p className="-mt-1 mb-1 text-[11px] leading-relaxed text-slate-400">
                {sentido === "IDA"
                  ? "Da sua casa até o trabalho. Adicione uma condução para cada transporte que você pega."
                  : "Do trabalho até a sua casa."}
              </p>

              {conducoes
                .filter((c) => c.sentido === sentido)
                .map((c, i) => (
                  <div key={c.uid} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                        Condução {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setConducoes((l) => l.filter((x) => x.uid !== c.uid))}
                        className="text-[11px] font-bold text-red-500 transition hover:text-red-600"
                      >
                        remover
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Campo rotulo="Cidade">
                        <SelectBusca
                          valor={c.cidade}
                          opcoes={opcoesCidade}
                          aoEscolher={(v) => atualizar(c.uid, { cidade: v })}
                          placeholder="Selecione"
                          buscaPlaceholder="Busque a cidade"
                        />
                      </Campo>

                      {c.cidade === OUTRA && (
                        <Campo rotulo="Qual cidade?">
                          <input
                            value={c.cidadeOutra}
                            onChange={(e) => atualizar(c.uid, { cidadeOutra: e.target.value })}
                            placeholder="Nome da cidade"
                            maxLength={120}
                            className={CLASSE_INPUT}
                          />
                        </Campo>
                      )}

                      <Campo rotulo="Tipo de transporte">
                        {c.cidade === OUTRA ? (
                          // Cidade fora da tabela não tem tipos cadastrados: o candidato digita.
                          <input
                            value={c.tipoTransporte}
                            onChange={(e) => atualizar(c.uid, { tipoTransporte: e.target.value })}
                            placeholder="Ex.: Ônibus municipal"
                            maxLength={120}
                            className={CLASSE_INPUT}
                          />
                        ) : (
                          <SelectBusca
                            valor={c.tipoTransporte}
                            opcoes={tiposDaCidade(c.cidade)}
                            aoEscolher={(v) => atualizar(c.uid, { tipoTransporte: v })}
                            placeholder={c.cidade ? "Selecione" : "Escolha a cidade antes"}
                            buscaPlaceholder="Busque o transporte"
                            desabilitado={!c.cidade}
                          />
                        )}
                      </Campo>

                      <Campo rotulo="Cartão utilizado">
                        <SelectBusca
                          valor={c.cartao}
                          opcoes={CARTOES}
                          aoEscolher={(v) =>
                            atualizar(c.uid, { cartao: v as Cartao, cartaoOutro: "" })
                          }
                          placeholder="Selecione"
                          buscaPlaceholder="Busque o cartão"
                        />
                      </Campo>

                      {c.cartao === "OUTRO" && (
                        <Campo rotulo="Qual cartão?">
                          <input
                            value={c.cartaoOutro}
                            onChange={(e) => atualizar(c.uid, { cartaoOutro: e.target.value })}
                            placeholder="Nome do cartão"
                            maxLength={60}
                            className={CLASSE_INPUT}
                          />
                        </Campo>
                      )}

                      <Campo rotulo="Valor da passagem">
                        <input
                          inputMode="decimal"
                          value={c.valor}
                          onChange={(e) => atualizar(c.uid, { valor: e.target.value })}
                          placeholder="0,00"
                          className={CLASSE_INPUT}
                        />
                        {c.tipoTransporte && c.cidade !== OUTRA && (
                          <p className="mt-1.5 text-[11px] text-slate-400">
                            Sugerido pela tabela. Ajuste se o seu valor for diferente.
                          </p>
                        )}
                      </Campo>
                    </div>
                  </div>
                ))}

              <button
                type="button"
                onClick={() => setConducoes((l) => [...l, novaConducao(sentido)])}
                className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-bold text-slate-500 transition hover:border-[#22B0DB] hover:text-[#1D8FB4]"
              >
                + Adicionar condução
              </button>
            </Secao>
          ))}

          <div className="mt-6 rounded-2xl border border-[#AAD12F]/40 bg-[#AAD12F]/[0.12] p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Total da ida</span>
              <span className="font-bold tabular-nums text-slate-700">{BRL.format(totalIda)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>Total da volta</span>
              <span className="font-bold tabular-nums text-slate-700">{BRL.format(totalVolta)}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#AAD12F]/40 pt-3">
              <span className="text-sm font-bold text-slate-800">Total do dia</span>
              <span className="font-display text-xl font-extrabold tabular-nums text-[#5F7D0C]">
                {BRL.format(totalDia)}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Envio: só habilita depois de escolher optante/não-optante. */}
      {optante !== null && (
        <>
          <button onClick={abrirAvisos} disabled={enviando} className={`${CLASSE_BOTAO} mt-7`}>
            Enviar formulário
          </button>
          {erroEnvio && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold leading-relaxed text-red-700"
            >
              {erroEnvio}
            </p>
          )}
        </>
      )}

      {/* Parte C: modal sequencial dos 3 avisos. "Avançar" entre eles; no último, o aceite. */}
      {aviso !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-aviso"
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-1.5">
              {AVISOS.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 flex-1 rounded-full transition ${
                    i <= aviso ? "bg-[#22B0DB]" : "bg-slate-200"
                  }`}
                />
              ))}
            </div>

            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#1D8FB4]">
              Aviso {aviso + 1} de {AVISOS.length}
            </p>
            <h2 id="titulo-aviso" className="mt-2 font-display text-lg font-bold text-slate-900">
              {AVISOS[aviso].titulo}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">{AVISOS[aviso].texto}</p>

            <div className="mt-7 flex flex-col gap-2">
              {aviso < AVISOS.length - 1 ? (
                <button onClick={() => setAviso(aviso + 1)} className={CLASSE_BOTAO}>
                  Avançar
                </button>
              ) : (
                <button onClick={enviar} disabled={enviando} className={CLASSE_BOTAO}>
                  {enviando ? "Enviando…" : "Estou ciente das informações passadas"}
                </button>
              )}
              <button
                onClick={() => setAviso(null)}
                disabled={enviando}
                className="rounded-xl py-2.5 text-xs font-bold text-slate-400 transition hover:text-slate-600"
              >
                Voltar ao formulário
              </button>
            </div>
          </div>
        </div>
      )}
    </Casca>
  );
}

// ── Peças visuais (tema claro fixo) ──────────────────────────────────────────
const CLASSE_INPUT =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#22B0DB] focus:ring-2 focus:ring-[#22B0DB]/25 disabled:bg-slate-100 disabled:text-slate-400";

const CLASSE_BOTAO =
  "mt-2 w-full rounded-xl bg-[#22B0DB] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#22B0DB]/25 transition-all hover:bg-[#1D9EC4] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Casca da página. `centralizado` centra o cartão (e o logo junto) no meio da tela: usado na
 * identificação e na confirmação, que são telas curtas. O formulário longo fica no fluxo normal.
 *
 * `colorScheme: light` é o que impede o celular em dark mode de escurecer os controles nativos.
 */
function Casca({ children, centralizado }: { children: ReactNode; centralizado?: boolean }) {
  return (
    <div
      style={{ colorScheme: "light" }}
      className={`relative w-full overflow-hidden bg-[#EEF3F7] px-4 py-8 text-slate-800 antialiased ${
        centralizado ? "flex min-h-screen items-center justify-center" : "min-h-screen"
      }`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#22B0DB]/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-32 h-[420px] w-[420px] rounded-full bg-[#AAD12F]/10 blur-[120px]" />
      </div>
      <main className="relative z-10 mx-auto w-full max-w-md">
        {/* Logo SOULAN (não o do EA): quem preenche é o candidato, que conhece a Soulan, não o nome
            interno do sistema. Mesmo logo do cabeçalho dos PDFs (decisão do diretor).
            `animate-float` é a animação que já existe no projeto (usada no logo do /login). */}
        <img
          src="/logo-soulan.png"
          alt="Soulan Recursos Humanos"
          className="mx-auto mb-6 h-14 w-auto animate-float object-contain"
        />
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-20px_rgba(15,40,70,0.25)]">
          {children}
        </div>
        <p className="mt-6 text-center text-[11px] text-slate-400">
          &copy; 2026 EA Automatic · Grupo Soulan
        </p>
      </main>
    </div>
  );
}

function Secao({
  titulo,
  acessorio,
  children,
}: {
  titulo: string;
  acessorio?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-600">{titulo}</h2>
        {acessorio}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {rotulo}
      </span>
      {children}
    </div>
  );
}

function BotaoOpcao({
  ativo,
  onClick,
  titulo,
  desc,
}: {
  ativo: boolean;
  onClick: () => void;
  titulo: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`rounded-2xl border p-4 text-left transition ${
        ativo
          ? "border-[#22B0DB] bg-[#22B0DB]/10 shadow-[0_0_0_1px_rgba(34,176,219,0.35)]"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <span className="block text-sm font-bold text-slate-900">{titulo}</span>
      <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{desc}</span>
    </button>
  );
}

/**
 * Lista pesquisável (decisão do diretor): o candidato busca e escolhe, em vez de digitar. Evita
 * erro de digitação e mantém o dado normalizado. Não usa <select> nativo porque ele não tem busca.
 */
function SelectBusca({
  valor,
  opcoes,
  aoEscolher,
  placeholder,
  buscaPlaceholder,
  desabilitado,
}: {
  valor: string;
  opcoes: Opcao[];
  aoEscolher: (v: string) => void;
  placeholder: string;
  buscaPlaceholder: string;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return opcoes;
    return opcoes.filter((o) => o.rotulo.toLowerCase().includes(q));
  }, [opcoes, busca]);

  const rotulo = opcoes.find((o) => o.valor === valor)?.rotulo ?? "";

  return (
    <div className="relative">
      <button
        type="button"
        disabled={desabilitado}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => {
          setBusca("");
          setAberto((v) => !v);
        }}
        className={`${CLASSE_INPUT} flex items-center justify-between gap-2 text-left`}
      >
        <span className={rotulo ? "truncate" : "truncate text-slate-400"}>
          {rotulo || placeholder}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`h-4 w-4 flex-none text-slate-400 transition ${aberto ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {aberto && !desabilitado && (
        <>
          {/* Camada de clique-fora: fecha sem precisar de listener global. */}
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} />
          <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={buscaPlaceholder}
              className="w-full border-b border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
            />
            <ul role="listbox" className="max-h-52 overflow-y-auto overscroll-contain">
              {filtradas.length === 0 && (
                <li className="px-3.5 py-3 text-sm text-slate-400">Nenhuma opção encontrada.</li>
              )}
              {filtradas.map((o) => (
                <li key={o.valor}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.valor === valor}
                    onClick={() => {
                      aoEscolher(o.valor);
                      setAberto(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-left text-sm transition hover:bg-slate-50 ${
                      o.valor === valor ? "font-bold text-[#1D8FB4]" : "text-slate-700"
                    }`}
                  >
                    {o.rotulo}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
