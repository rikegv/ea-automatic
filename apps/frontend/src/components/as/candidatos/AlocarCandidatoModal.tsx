"use client";

/**
 * ALOCAR CANDIDATO EM VAGA: o caminho que NÃO passa pelo CPF.
 *
 * O BECO SEM SAÍDA QUE ISTO ABRE. Até aqui, alocar alguém que já estava na base só era possível pelo
 * dedup do cadastro: digita-se o CPF, o sistema encontra a pessoa e oferece alocá-la. Quem foi
 * cadastrado SEM CPF (caso normal em seleção, a pessoa muitas vezes ainda não deu o número) não era
 * achável por esse caminho: existia na base e não entrava em vaga nenhuma.
 *
 * COMO A PORTA ABRE. `POST /as/candidatos/buscar` com `semCandidatura: true` devolve exatamente quem
 * está na base e não está em vaga nenhuma; o consultor escolhe a pessoa pelo NOME e a alocação segue
 * por `id`, que sempre foi a chave da tabela. O CPF não é exigido, não é digitado e não é lido em
 * nenhum ponto deste fluxo.
 *
 * OS DOIS 409 DESTA ROTA NÃO SÃO A MESMA COISA, e esta tela lê a diferença. "Esta pessoa já está
 * nesta vaga." é erro seco (ela está VIVA na vaga agora, não há o que confirmar) e continua caindo
 * na faixa vermelha de erro. A reentrada em vaga JÁ ENCERRADA vem com corpo estruturado, é uma
 * PERGUNTA, e abre o modal de ciência com a data e o motivo do processo anterior. Quem separa os
 * dois é o `reason` do corpo, nunca o texto da mensagem.
 *
 * §A.6: a lista devolve nome, cidade/UF, origem e `temCpf`, um BOOLEANO. O número não trafega aqui, e
 * nada nesta tela monta URL com dado de pessoa (a busca é POST, com o corpo).
 * §A.11 (sem travessão), §A.24 (title case no título; o botão é AÇÃO e segue escrita normal).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM_LABEL,
  type AsCandidatoListItem,
  type AsReentradaPrecisaCiencia,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import {
  alocarEmVaga,
  buscarCandidatos,
  mensagemDoErro,
  reentradaPrecisaCiencia,
} from "@/lib/as-candidatos";
import { ConfirmarReentradaModal } from "@/components/as/candidatos/ConfirmarReentradaModal";

/**
 * ─ TRAZER DE VOLTA: A MESMA PORTA, ABERTA NO LUGAR CERTO (bug 2 do diretor) ───────────────────
 *
 * O QUE ESTAVA ACONTECENDO. A reentrada existia inteira (o 409 estruturado, o modal de ciência) e
 * era INALCANÇÁVEL na prática, por dois motivos somados: a única entrada era o botão "Alocar
 * candidato", e a lista dele (`semCandidatura: true`) só oferece quem não tem candidatura VIVA em
 * lugar nenhum. Quem foi descartado numa vaga e segue vivo em outra não aparecia ali, e não havia
 * outra porta. O diretor procurou na LINHA do descartado, que é o lugar óbvio, e lá não tinha nada.
 *
 * A DECISÃO: UM CAMINHO SÓ, e ele é a REENTRADA. Não existe "reativar" no sistema. Reativar viraria
 * a linha encerrada de volta para ATIVO, sobrescrevendo `situacao` e `motivo_descarte`, ou seja,
 * apagando exatamente o histórico que o bug 1 acabou de criar. A reentrada cria uma candidatura NOVA
 * e deixa a encerrada de pé como registro do que aconteceu. O banco já suportava isso desde a 0085
 * (`uq_as_candidaturas_viva` permite N encerradas convivendo com uma viva), então não há tabela nova
 * nem conceito novo: só a porta.
 *
 * `pessoaFixa` É O QUE MUDA O MODO DESTA TELA. Com ela, a pessoa já vem escolhida (veio da linha) e
 * a lista `semCandidatura` NÃO é carregada, porque é justamente ela que fechava a porta. Sem ela, a
 * tela é a de sempre. A rota, o 409 e o modal de ciência são os MESMOS nos dois modos.
 *
 * O VOCABULÁRIO NA TELA É UMA PALAVRA SÓ (decisão do diretor): "Trazer De Volta". As palavras
 * "reentrada" e "reativação" não aparecem juntas em lugar nenhum da interface.
 */
export function AlocarCandidatoModal({
  vagasAbertas,
  token,
  onClose,
  onAlocado,
  pessoaFixa,
  vagaSugerida,
}: {
  vagasAbertas: VagaListItem[];
  token: string | null;
  onClose: () => void;
  onAlocado: () => void;
  /** Quando presente, a tela vira "Trazer De Volta": a pessoa já está escolhida. */
  pessoaFixa?: { id: string; nome: string } | null;
  /** A vaga de onde a pessoa saiu, pré-selecionada e TROCÁVEL: voltar noutra vaga é legítimo. */
  vagaSugerida?: string | null;
}) {
  const [disponiveis, setDisponiveis] = useState<AsCandidatoListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [candidatoId, setCandidatoId] = useState(pessoaFixa?.id ?? "");
  const [vagaId, setVagaId] = useState(vagaSugerida ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O AVISO DE REENTRADA, quando a primeira tentativa esbarra no processo anterior daquela pessoa
  // NAQUELA vaga. Enquanto ele existe, o modal de ciência está aberto e nada foi alocado.
  const [reentrada, setReentrada] = useState<AsReentradaPrecisaCiencia | null>(null);

  const carregar = useCallback(async () => {
    // NO MODO "TRAZER DE VOLTA" A LISTA NEM É PEDIDA: a pessoa veio da linha, e o filtro
    // `semCandidatura` é exatamente o que a excluiria. Buscar para depois ignorar seria uma
    // requisição inútil e uma lista vazia atrás de um formulário já preenchido.
    if (pessoaFixa) {
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      setDisponiveis(await buscarCandidatos({ semCandidatura: true }, token));
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar os candidatos disponíveis."));
    } finally {
      setCarregando(false);
    }
  }, [token, pessoaFixa]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * O APOIO DE CADA PESSOA NA LISTA: cidade/UF, origem e SE ela tem CPF, nunca qual é. É o que o
   * consultor precisa para distinguir dois homônimos sem que o número apareça na tela.
   */
  const optCandidatos = disponiveis.map((c) => {
    const lugar = c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ""}` : "Cidade não informada";
    return {
      value: c.id,
      label: c.nome,
      hint: `${lugar} · ${AS_CANDIDATO_ORIGEM_LABEL[c.origem]}${c.temCpf ? "" : " · sem CPF"}`,
    };
  });

  const optVagas = vagasAbertas.map((v) => ({
    value: v.id,
    label: v.nomeDivulgacao ?? v.codigo ?? "Vaga sem nome de divulgação",
    hint: v.clienteNome ?? v.codigo ?? undefined,
  }));

  /**
   * A ALOCAÇÃO, E A SEGUNDA TENTATIVA QUE É A MESMA ALOCAÇÃO.
   *
   * `cienteReentrada` entra só quando o consultor clicou no ciente. A primeira tentativa vai SEMPRE
   * sem o campo, que é o que faz o aviso existir: a tela não decide por ele antes de perguntar.
   */
  async function alocar(cienteReentrada = false) {
    if (!candidatoId || !vagaId) return;
    setErro(null);
    setSalvando(true);
    try {
      await alocarEmVaga(candidatoId, vagaId, token, { cienteReentrada });
      setReentrada(null);
      onAlocado();
    } catch (err) {
      // A REENTRADA É PERGUNTA, não erro: vira modal de ciência com o processo anterior à vista.
      const aviso = reentradaPrecisaCiencia(err);
      if (aviso) {
        setReentrada(aviso);
        return;
      }
      // As demais travas (vaga encerrada, pessoa JÁ VIVA na vaga) chegam com a frase pronta e
      // seguem sendo erro seco: não há "confirmar mesmo assim" para elas.
      setReentrada(null);
      setErro(mensagemDoErro(err, "Falha ao alocar o candidato na vaga."));
    } finally {
      setSalvando(false);
    }
  }

  const nomeEscolhido = pessoaFixa?.nome ?? disponiveis.find((c) => c.id === candidatoId)?.nome ?? null;
  const vagaEscolhida = vagasAbertas.find((v) => v.id === vagaId);
  const rotuloDaVaga = vagaEscolhida
    ? (vagaEscolhida.nomeDivulgacao ?? vagaEscolhida.codigo ?? null)
    : null;

  return (
    <Modal onClose={onClose} className="max-w-[620px] p-0" ariaLabel="Alocar candidato em vaga">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">
            {pessoaFixa ? "Trazer De Volta" : "Alocar Candidato Em Vaga"}
          </h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {pessoaFixa
              ? `${pessoaFixa.nome} teve o processo encerrado. Escolha a vaga em que ela volta a entrar: a vaga anterior já vem sugerida, e trocar é permitido. O processo encerrado continua registrado no histórico.`
              : "A lista traz quem está na base e não está em vaga nenhuma, inclusive quem foi cadastrado sem CPF. A alocação é feita pelo cadastro da pessoa, e o CPF não é exigido em ponto nenhum deste caminho."}
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {carregando ? (
            <p className="text-[13px] text-faint">Carregando os candidatos disponíveis.</p>
          ) : !pessoaFixa && disponiveis.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
              Todo mundo que está na base já foi alocado em alguma vaga. Para trazer alguém novo, use
              o botão Novo candidato.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {/* NO MODO "TRAZER DE VOLTA" A PESSOA NÃO É ESCOLHIDA, ela veio da linha. Um seletor
                  com uma opção só seria uma decisão de mentira, e um seletor VAZIO (que é o que a
                  lista `semCandidatura` devolveria para quem já tem candidatura) seria um beco. */}
              {pessoaFixa ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] text-dim">Candidato</span>
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[13.5px] font-semibold text-text">
                    {pessoaFixa.nome}
                  </div>
                </div>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="text-[12.5px] text-dim">
                    Candidato <span className="text-danger">*</span>
                  </span>
                  <Combobox
                    value={candidatoId}
                    onChange={setCandidatoId}
                    options={optCandidatos}
                    placeholder="Escolha quem vai entrar na vaga"
                    ariaLabel="Candidato"
                    searchable
                    limpavel
                  />
                  <span className="text-[11.5px] text-faint">
                    {optCandidatos.length}{" "}
                    {optCandidatos.length === 1
                      ? "pessoa disponível na base"
                      : "pessoas disponíveis na base"}
                    .
                  </span>
                </label>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-dim">
                  Vaga <span className="text-danger">*</span>
                </span>
                <Combobox
                  value={vagaId}
                  onChange={setVagaId}
                  options={optVagas}
                  placeholder="Escolha a vaga aberta"
                  ariaLabel="Vaga"
                  searchable
                  limpavel
                />
                <span className="text-[11.5px] text-faint">
                  Só vaga aberta recebe candidato novo. A candidatura nasce em Captação, e mover no
                  funil é a ação da própria linha.
                </span>
              </label>
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

        <div className="flex flex-none justify-end gap-2 border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose} disabled={salvando}>
            Cancelar
          </Button>
          <Button
            className="px-4 py-2.5"
            disabled={salvando || !candidatoId || !vagaId}
            onClick={() => void alocar(false)}
          >
            {salvando ? "Alocando…" : "Alocar em vaga"}
          </Button>
        </div>
      </div>

      {/* ── A CIÊNCIA DA REENTRADA, quando a pessoa já teve processo encerrado NESTA vaga ── */}
      {reentrada && (
        <ConfirmarReentradaModal
          aviso={reentrada}
          candidatoNome={nomeEscolhido}
          vagaRotulo={rotuloDaVaga}
          confirmando={salvando}
          onCancelar={() => setReentrada(null)}
          onCiente={() => void alocar(true)}
        />
      )}
    </Modal>
  );
}
