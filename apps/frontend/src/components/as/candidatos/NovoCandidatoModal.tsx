"use client";

/**
 * CADASTRO MANUAL DE CANDIDATO: um modal curto de 2 PASSOS, e não uma trilha.
 *
 * POR QUE NÃO A TRILHA DE 5 PASSOS DA CENTRAL DE VAGAS: a trilha existe lá porque a abertura de vaga
 * tem 38 campos, e 38 campos numa caixa só viram uma parede que ninguém lê. Aqui são dez. Aplicar a
 * trilha por semelhança seria copiar a FORMA e perder o MOTIVO dela.
 *
 * O PASSO 2 É PULÁVEL, e isso é regra de negócio, não conveniência: uma pessoa sem candidatura é uma
 * pessoa NA BASE, não um cadastro pela metade. Por isso o passo 1 já oferece salvar.
 *
 * O DEDUP POR CPF NÃO BLOQUEIA E NÃO DUPLICA EM SILÊNCIO. Achando quem já existe, a tela mostra a
 * pessoa e oferece ALOCAR ELA nesta vaga, em vez de criar outra. É o mesmo comportamento que o
 * wizard de admissão já tem no CPF duplicado.
 *
 * A REENTRADA EM VAGA JÁ ENCERRADA CAI JUSTAMENTE AQUI. É o passo 2 depois do dedup: a pessoa que o
 * CPF encontrou é, por definição, alguém que já tem passado na base, e às vezes esse passado é um
 * processo encerrado NESTA MESMA vaga. O backend recusa a primeira tentativa com um 409 estruturado,
 * a tela abre o modal de ciência com a data e o motivo do encerramento anterior, e o ciente reenvia
 * a MESMA alocação. O outro 409 da rota ("Esta pessoa já está nesta vaga.") continua sendo erro seco.
 *
 * §A.6: o CPF é digitado aqui e sai daqui SEMPRE no CORPO de um POST. Nenhuma URL desta tela carrega
 * o número, nem a da busca de dedup.
 * §A.11 (sem travessão), §A.24 (title case em título e rótulo de etapa).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM,
  AS_CANDIDATO_ORIGEM_LABEL,
  CANDIDATURA_ETAPAS,
  CANDIDATURA_ETAPA_LABEL,
  UFS,
  isValidCpf,
  normalizeCpf,
  type AsCandidaturaItem,
  type AsReentradaPrecisaCiencia,
  type CandidaturaEtapa,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Icon } from "@/components/ui/Icon";
import { calcIdade, ehMenorDeIdade, rotuloIdade } from "@/lib/idade";
import { Pill } from "@/components/ui/Pill";
import {
  alocarEmVaga,
  buscarCandidatos,
  caminhoAteEtapa,
  criarCandidato,
  formatCpf,
  mensagemDoErro,
  moverEtapa,
  reentradaPrecisaCiencia,
  registrarContato,
} from "@/lib/as-candidatos";
import { ConfirmarReentradaModal } from "@/components/as/candidatos/ConfirmarReentradaModal";

interface Form {
  nome: string;
  cpf: string;
  telefone: string;
  email: string;
  dataNascimento: string;
  cidade: string;
  uf: string;
  origem: string;
}

const VAZIO: Form = {
  nome: "",
  cpf: "",
  telefone: "",
  email: "",
  dataNascimento: "",
  cidade: "",
  uf: "",
  origem: "MANUAL",
};

/** A pessoa que o dedup encontrou. Só id e nome: §A.6, o número nunca volta na resposta. */
interface Existente {
  id: string;
  nome: string;
}

export function NovoCandidatoModal({
  vagasAbertas,
  token,
  onClose,
  onSalvo,
}: {
  vagasAbertas: VagaListItem[];
  token: string | null;
  onClose: () => void;
  onSalvo: (candidatoId: string) => void;
}) {
  const [passo, setPasso] = useState<1 | 2>(1);
  const [form, setForm] = useState<Form>(VAZIO);
  // A IDADE é DERIVADA do campo, nunca guardada em estado próprio: um estado paralelo ficaria para
  // trás no primeiro `set` que alguém esquecesse de acompanhar.
  const idade = calcIdade(form.dataNascimento);

  // O DEDUP: quem já existe com este CPF, e se o consultor decidiu seguir com essa pessoa.
  const [existente, setExistente] = useState<Existente | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [usarExistente, setUsarExistente] = useState<Existente | null>(null);

  const [vagaId, setVagaId] = useState("");
  const [etapa, setEtapa] = useState<CandidaturaEtapa>("CAPTACAO");
  const [observacao, setObservacao] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O AVISO DE REENTRADA. Enquanto ele existe, o modal de ciência está aberto e NADA foi alocado.
  const [reentrada, setReentrada] = useState<AsReentradaPrecisaCiencia | null>(null);
  /**
   * A PESSOA QUE JÁ FOI CRIADA NESTA SESSÃO DO MODAL.
   *
   * O aviso de reentrada interrompe o salvamento DEPOIS da criação e ANTES da alocação. Sem esta
   * memória, o "estou ciente" recomeçaria do zero e tentaria criar a pessoa outra vez, o que o
   * dedup do CPF recusaria com uma frase que não tem nada a ver com o que o consultor acabou de
   * fazer. Com ela, a segunda tentativa retoma exatamente de onde parou: a alocação.
   */
  const jaCriadoId = useRef<string | null>(null);

  const set = (campo: keyof Form, valor: string) => setForm((f) => ({ ...f, [campo]: valor }));

  const cpfLimpo = normalizeCpf(form.cpf);
  const cpfCompleto = cpfLimpo.length === 11;
  const cpfInvalido = cpfCompleto && !isValidCpf(cpfLimpo);

  /**
   * A PROCURA DO DEDUP, disparada quando o CPF fica completo e válido.
   *
   * §A.6: é `POST /as/candidatos/buscar` com o número NO CORPO. A alternativa óbvia (montar uma URL
   * com `?cpf=`) publicaria o número no log do proxy e no histórico do navegador, e é justamente o
   * que o backend fechou ao não expor listagem GET.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const procurar = useCallback(
    async (cpf: string) => {
      setProcurando(true);
      try {
        const achados = await buscarCandidatos({ cpf }, token);
        setExistente(achados.length > 0 ? { id: achados[0].id, nome: achados[0].nome } : null);
      } catch {
        // Falha de rede na procura não pode travar o cadastro: o backend tem a segunda camada do
        // dedup (o unique do banco) e recusa a duplicata de qualquer jeito, com frase pronta.
        setExistente(null);
      } finally {
        setProcurando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!cpfCompleto || cpfInvalido) {
      setExistente(null);
      return;
    }
    timer.current = setTimeout(() => void procurar(cpfLimpo), 350);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [cpfLimpo, cpfCompleto, cpfInvalido, procurar]);

  const optVagas = vagasAbertas.map((v) => ({
    value: v.id,
    label: v.nomeDivulgacao ?? v.codigo ?? "Vaga sem nome de divulgação",
    hint: v.clienteNome ?? v.codigo ?? undefined,
  }));

  const podeAvancar = form.nome.trim().length >= 3 && !cpfInvalido;

  /** A vaga escolhida, do jeito que a tela já a chama na lista. Serve ao modal de ciência. */
  const vagaEscolhida = vagasAbertas.find((v) => v.id === vagaId);
  const rotuloDaVagaEscolhida = vagaEscolhida
    ? (vagaEscolhida.nomeDivulgacao ?? vagaEscolhida.codigo ?? null)
    : null;

  /**
   * O SALVAMENTO, na ordem em que os fatos acontecem: a pessoa, a candidatura, a etapa de entrada e
   * a observação. Cada passo depende do anterior, então a falha para onde falhou e a mensagem é a
   * que o backend devolveu (as travas do módulo já vêm com o texto pronto).
   */
  async function salvar(comVaga: boolean, cienteReentrada = false) {
    setErro(null);
    setSalvando(true);
    try {
      let candidatoId = usarExistente?.id ?? jaCriadoId.current;

      if (!candidatoId) {
        const criado = await criarCandidato(
          {
            nome: form.nome.trim(),
            cpf: cpfLimpo || undefined,
            telefone: form.telefone.trim() || undefined,
            email: form.email.trim() || undefined,
            dataNascimento: form.dataNascimento || undefined,
            cidade: form.cidade.trim() || undefined,
            uf: form.uf || undefined,
            origem: form.origem || undefined,
          },
          token,
        );
        candidatoId = criado.id;
        jaCriadoId.current = criado.id;
      }

      if (comVaga && vagaId) {
        let candidatura: AsCandidaturaItem;
        try {
          candidatura = await alocarEmVaga(candidatoId, vagaId, token, { cienteReentrada });
        } catch (err) {
          // A REENTRADA É PERGUNTA, não erro: abre a ciência e PARA aqui, sem alocar nada. O
          // "estou ciente" reenvia esta mesma alocação, e só então o resto do salvamento segue.
          const aviso = reentradaPrecisaCiencia(err);
          if (!aviso) throw err;
          setReentrada(aviso);
          return;
        }
        setReentrada(null);
        // A ETAPA DE ENTRADA: a candidatura sempre nasce em Captação, e o backend só aceita avanço de
        // uma etapa por vez. A tela caminha até a etapa escolhida, um passo de cada vez.
        for (const proxima of caminhoAteEtapa(etapa)) {
          await moverEtapa(candidatura.id, proxima, token);
        }
        if (observacao.trim()) {
          await registrarContato(
            candidatura.id,
            { tipo: "OBSERVACAO", resumo: observacao.trim() },
            token,
          );
        }
      }

      onSalvo(candidatoId);
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao salvar o candidato."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal onClose={onClose} className="max-w-[720px] p-0" ariaLabel="Novo candidato">
      <div className="flex max-h-[88vh] flex-col">
        {/* CABEÇALHO: o passo em que se está, dito por extenso, para ninguém contar caixinha. */}
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Novo Candidato</h2>
          <div className="mt-3 flex items-center gap-2">
            <PassoChip n={1} rotulo="A Pessoa" atual={passo === 1} vencido={passo > 1} />
            <span className="h-px flex-1 bg-[var(--border)]" />
            <PassoChip n={2} rotulo="A Vaga" atual={passo === 2} vencido={false} />
          </div>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {passo === 1 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Campo rotulo="Nome completo" obrigatorio largo>
                <input
                  className="ds-input"
                  value={form.nome}
                  onChange={(e) => set("nome", e.target.value)}
                  placeholder="Nome de quem está sendo cadastrado"
                  autoFocus
                />
              </Campo>

              <Campo rotulo="CPF">
                <input
                  className="ds-input"
                  value={form.cpf}
                  onChange={(e) => set("cpf", formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  aria-invalid={cpfInvalido || undefined}
                />
                {/* O CPF É OPCIONAL de propósito: na captação a pessoa muitas vezes ainda não deu o
                    número, e exigi-lo produziria número inventado. Preenchido, o dígito é conferido. */}
                {cpfInvalido ? (
                  <span className="text-[12px] text-danger">
                    O CPF não confere. Confira os dígitos.
                  </span>
                ) : (
                  <span className="text-[12px] text-faint">
                    Opcional. Na captação a pessoa pode ainda não ter informado.
                  </span>
                )}
              </Campo>

              <Campo rotulo="Telefone">
                <input
                  className="ds-input"
                  value={form.telefone}
                  onChange={(e) => set("telefone", e.target.value)}
                  placeholder="(11) 90000-0000"
                />
              </Campo>

              <Campo rotulo="E-mail">
                <input
                  className="ds-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="nome@email.com"
                />
              </Campo>

              {/* A IDADE E O AVISO DE MENOR (ajuste 5 do diretor), pela MESMA régua do wizard de Nova
                  Admissão: `lib/idade.ts`, para onde as duas funções subiram sem alteração nenhuma
                  de comportamento nem de texto. Duas cópias da mesma conta divergiriam no primeiro
                  ajuste, e a idade é a que decide se alguém pode ser contratado. */}
              <Campo rotulo="Data de nascimento">
                <input
                  className="ds-input"
                  type="date"
                  value={form.dataNascimento}
                  onChange={(e) => set("dataNascimento", e.target.value)}
                />
                {/* Altura reservada para o texto não empurrar o campo seguinte ao aparecer. */}
                <div className="mt-1.5 min-h-5">
                  {rotuloIdade(idade) && (
                    <span className="text-[12px] text-dim">{rotuloIdade(idade)}</span>
                  )}
                </div>
              </Campo>

              <Campo rotulo="Cidade">
                <input
                  className="ds-input"
                  value={form.cidade}
                  onChange={(e) => set("cidade", e.target.value)}
                  placeholder="Cidade onde a pessoa mora"
                />
              </Campo>

              <Campo rotulo="UF">
                <Combobox
                  value={form.uf}
                  onChange={(v) => set("uf", v)}
                  options={UFS.map((u) => ({ value: u.uf, label: u.nome, hint: u.uf }))}
                  placeholder="Selecione a UF"
                  ariaLabel="UF"
                  limpavel
                />
              </Campo>

              <Campo rotulo="Origem" largo>
                <Combobox
                  value={form.origem}
                  onChange={(v) => set("origem", v)}
                  options={AS_CANDIDATO_ORIGEM.map((o) => ({
                    value: o,
                    label: AS_CANDIDATO_ORIGEM_LABEL[o],
                  }))}
                  placeholder="De onde veio esta pessoa"
                  ariaLabel="Origem"
                />
              </Campo>

              {/* O AVISO DE MENOR DE IDADE, com o MESMO enunciado do wizard (§A.26: o texto não foi
                  reescrito, foi reusado) e o mesmo desenho de faixa de atenção do sistema. */}
              {ehMenorDeIdade(idade) && (
                <div className="flex items-start gap-3 rounded-xl border border-[var(--warn-2)] bg-[rgba(249,115,22,0.1)] px-4 py-3 md:col-span-2">
                  <Icon name="alert" className="mt-0.5 h-5 w-5 flex-none text-warn-2" />
                  <p className="text-[13px] text-text">
                    <b>Candidato menor de idade ({idade} anos)</b>: verifique as restrições legais e o
                    tipo de contrato (Jovem Aprendiz).
                  </p>
                </div>
              )}

              {procurando && (
                <p className="text-[12.5px] text-faint md:col-span-2">
                  Procurando quem já está cadastrado com este CPF.
                </p>
              )}

              {/* O DEDUP NA ENTRADA: mostra a pessoa e oferece o caminho certo, sem bloquear a tela e
                  sem criar duplicata em silêncio. */}
              {existente && (
                <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] p-4 md:col-span-2">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[var(--sico-warn)] text-warn">
                        <Icon name="users" className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="font-semibold text-text">CPF Já Cadastrado</div>
                        <p className="text-[12.5px] text-dim">
                          {existente.nome} já está na base. Aloque esta pessoa na vaga em vez de
                          criar outro cadastro.
                        </p>
                      </div>
                    </div>
                    {usarExistente ? (
                      <Pill tone="ok">Pessoa Escolhida</Pill>
                    ) : (
                      <Button
                        variant="secondary"
                        className="px-3 py-2"
                        onClick={() => {
                          setUsarExistente(existente);
                          setPasso(2);
                        }}
                      >
                        Alocar esta pessoa
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {usarExistente && (
                <p className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] text-dim">
                  Alocando <span className="font-semibold text-text">{usarExistente.nome}</span>,
                  que já estava cadastrada. Nenhum cadastro novo será criado.
                </p>
              )}

              <Campo rotulo="Vaga">
                <Combobox
                  value={vagaId}
                  onChange={setVagaId}
                  options={optVagas}
                  placeholder={
                    optVagas.length === 0
                      ? "Nenhuma vaga aberta no momento"
                      : "Procure pelo nome ou pelo cliente"
                  }
                  ariaLabel="Vaga"
                  searchable
                  limpavel
                  disabled={optVagas.length === 0}
                />
                <span className="text-[12px] text-faint">
                  Só vagas abertas aparecem aqui: vaga encerrada não recebe candidato novo.
                </span>
              </Campo>

              <Campo rotulo="Etapa em que entra">
                <Combobox
                  value={etapa}
                  onChange={(v) => setEtapa(v as CandidaturaEtapa)}
                  options={CANDIDATURA_ETAPAS.map((e) => ({
                    value: e,
                    label: CANDIDATURA_ETAPA_LABEL[e],
                  }))}
                  ariaLabel="Etapa em que entra"
                  disabled={!vagaId}
                />
                <span className="text-[12px] text-faint">
                  Captação é o começo do funil. Escolha adiante quando a pessoa já chegou triada.
                </span>
              </Campo>

              <Campo rotulo="Observação inicial">
                <textarea
                  className="ds-input min-h-[84px] resize-y"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="O que já se sabe do processo desta pessoa. Vira a primeira linha do histórico."
                  disabled={!vagaId}
                />
              </Campo>

              {!vagaId && !usarExistente && (
                <p className="text-[12.5px] text-dim">
                  Este passo é opcional. Sem vaga, a pessoa entra na base e pode ser alocada depois.
                </p>
              )}
            </div>
          )}

          {erro && (
            <p
              className="mt-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}
        </div>

        <div className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-6 py-4">
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={() => (passo === 1 ? onClose() : setPasso(1))}
            disabled={salvando}
          >
            {passo === 1 ? "Cancelar" : "Voltar"}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {passo === 1 ? (
              <>
                {/* PULAR O PASSO 2 JÁ AQUI: quem só quer a pessoa na base não precisa passar pela
                    tela de vaga para descobrir que ela era opcional. */}
                <Button
                  variant="secondary"
                  className="px-4 py-2.5"
                  onClick={() => void salvar(false)}
                  disabled={!podeAvancar || salvando || Boolean(existente)}
                >
                  Salvar sem vaga
                </Button>
                <Button
                  className="px-4 py-2.5"
                  onClick={() => setPasso(2)}
                  disabled={!podeAvancar || salvando}
                >
                  Avançar
                </Button>
              </>
            ) : (
              <>
                {!usarExistente && (
                  <Button
                    variant="secondary"
                    className="px-4 py-2.5"
                    onClick={() => void salvar(false)}
                    disabled={salvando}
                  >
                    Salvar sem vaga
                  </Button>
                )}
                <Button
                  className="px-4 py-2.5"
                  onClick={() => void salvar(true)}
                  disabled={salvando || (Boolean(usarExistente) && !vagaId)}
                >
                  {salvando ? "Salvando…" : usarExistente ? "Alocar na vaga" : "Salvar candidato"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── A CIÊNCIA DA REENTRADA, quando o dedup achou alguém com processo encerrado na vaga ── */}
      {reentrada && (
        <ConfirmarReentradaModal
          aviso={reentrada}
          candidatoNome={usarExistente?.nome ?? (form.nome.trim() || null)}
          vagaRotulo={rotuloDaVagaEscolhida}
          confirmando={salvando}
          onCancelar={() => setReentrada(null)}
          onCiente={() => void salvar(true, true)}
        />
      )}
    </Modal>
  );
}

/** O chip do passo. É um rótulo de etapa, então vai em title case (§A.24). */
function PassoChip({
  n,
  rotulo,
  atual,
  vencido,
}: {
  n: number;
  rotulo: string;
  atual: boolean;
  vencido: boolean;
}) {
  return (
    <span
      className={
        atual
          ? "inline-flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[var(--surface-2)] px-3 py-1.5 text-[12.5px] font-semibold text-accent"
          : "inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px] text-dim"
      }
    >
      <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--surface)] text-[11px] font-bold">
        {vencido ? <Icon name="check" className="h-3 w-3 text-ok" /> : n}
      </span>
      {rotulo}
    </span>
  );
}

/** Rótulo + campo, com a marca de obrigatório onde ela é devida. */
function Campo({
  rotulo,
  children,
  largo = false,
  obrigatorio = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
  obrigatorio?: boolean;
}) {
  return (
    <label className={largo ? "flex flex-col gap-1.5 md:col-span-2" : "flex flex-col gap-1.5"}>
      <span className="text-[12.5px] text-dim">
        {rotulo}
        {obrigatorio && <span className="ml-1 text-danger">*</span>}
        {obrigatorio && <span className="sr-only"> (obrigatório)</span>}
      </span>
      {children}
    </label>
  );
}
