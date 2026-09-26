"use client";

/**
 * ─ ENVIAR A SHORTLIST AO CLIENTE (Frente E, pontos 10 e 11) ────────────────────────────────────
 *
 * ┌─ O QUE ESTE GESTO É, E O QUE ELE NÃO É ────────────────────────────────────────────────────┐
 * │ ELE CONGELA UM CONJUNTO: quem foi apresentado ao cliente naquele dia é FATO, e fato não se  │
 * │ edita. NÃO existe rascunho de shortlist e não existe editar a lista enviada: mudou a lista, │
 * │ é REENVIO, com número próprio, motivo próprio e data própria. É a mesma disciplina do       │
 * │ histórico de etapas, e é o que o servidor grava.                                             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O AVISO DA LISTA CURTA AVISA E NÃO IMPEDE (decisão do diretor): a primeira tentativa vai sem
 * ciência nenhuma, o servidor devolve 409 com a CONTAGEM MEDIDA POR ELE, a tela mostra a pergunta e
 * o mesmo botão REENVIA com `cienteShortlistCurta`. A tela não antecipa a recusa a partir do que
 * está marcado: a contagem que vale é a de lá, feita sob a trava e só com quem ainda está vivo.
 *
 * ┌─ E ELE VALE PARA TODO ENVIO, NÃO SÓ PARA O PRIMEIRO (decisão do diretor) ───────────────────┐
 * │ "Primeira tentativa" é a do CLIQUE, e não a da Shortlist 1: o reenvio curto recebe a mesma  │
 * │ pergunta. A razão é a operação, não a simetria: DEPOIS DE TRANSFERÊNCIA E DESCARTE, REENVIO │
 * │ CURTO É O CASO NORMAL, e justamente a lista que encolheu porque a vaga perdeu gente é a que │
 * │ precisa da pergunta. Era exatamente ela que a régua antiga deixava passar calada.            │
 * │                                                                                             │
 * │ POR ISSO O TEXTO DESTA TELA NÃO DIZ "PRIMEIRA SHORTLIST" EM LUGAR NENHUM: a frase de apoio  │
 * │ fala de "esta lista", que é verdade nos dois casos, e o número vem do servidor.              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O MÍNIMO SUGERIDO NÃO É ESCRITO AQUI: ele vem de `SHORTLIST_MINIMO_SUGERIDO`, do vocabulário
 * compartilhado, o mesmo que o servidor lê. Um "3" digitado nesta tela faria ela avisar sobre um
 * limite que a rota não conhece no dia em que o diretor pedir quatro.
 *
 * O MOTIVO DO REENVIO É EXIGIDO A PARTIR DO SEGUNDO ENVIO, e o PRIMEIRO o RECUSA em vez de
 * ignorá-lo ("não há envio anterior a justificar"): por isso o campo nem existe no primeiro.
 *
 * ELE DEIXOU DE SER TEXTO DIGITADO E VIROU CATÁLOGO (decisão do diretor): o que viaja é o ID da
 * linha escolhida, para a contagem por motivo existir e para não haver onde digitar dado pessoal
 * num campo que a varredura de retenção não alcança (§A.6). Quem mantém a lista é a administração,
 * em Motivos De Reenvio Da Shortlist.
 *
 * §A.41: modal de preenchimento, com Cancelar e Enviar, e ele NÃO fecha ao clicar fora (o `ui/Modal`
 * já garante, e nenhum `onClick` foi reintroduzido no overlay). §A.24 (title case em título e tag;
 * botão é ação), §A.11 (sem travessão), §A.35 (nenhum `<select>` cru).
 *
 * §A.6: ids de candidatura, uma data e um motivo de processo. Os NOMES aparecem porque a shortlist é,
 * por definição, a lista de nomes que vai ao cliente, e eles vêm da memória da tela, nunca de busca
 * nova. Nenhum CPF, e-mail ou telefone passa por aqui.
 */

import { useState } from "react";
import {
  SHORTLIST_MINIMO_SUGERIDO,
  candidaturaViva,
  type AsCandidaturaItem,
  type AsShortlist,
  type AsShortlistCurtaPrecisaCiencia,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Select";
import { mensagemDoErro } from "@/lib/as-candidatos";
import { useMotivosReenvioShortlist } from "@/lib/as-motivos-reenvio-shortlist";
import {
  enviarShortlist,
  exigeMotivoDeReenvio,
  proximoNumeroDeShortlist,
  rotuloDaShortlist,
  shortlistCurtaPrecisaCiencia,
} from "@/lib/as-shortlists";

/** Hoje, no formato do campo de data. É o padrão do envio: a lista sai no dia em que se manda. */
function hoje(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function EnviarShortlistModal({
  vagaId,
  selecionadas,
  enviadas,
  carregandoEnviadas,
  token,
  onCancelar,
  onEnviada,
}: {
  vagaId: string;
  /** As candidaturas MARCADAS, inteiras: é delas que sai a lista de nomes da conferência. */
  selecionadas: AsCandidaturaItem[];
  /** As shortlists que esta vaga já mandou. É delas que sai o número deste envio. */
  enviadas: AsShortlist[];
  carregandoEnviadas: boolean;
  token: string | null;
  onCancelar: () => void;
  onEnviada: () => void;
}) {
  const [data, setData] = useState(hoje());
  /** O ID da linha do catálogo, que é o que viaja no corpo. Vazio enquanto ninguém escolheu. */
  const [motivoReenvioId, setMotivoReenvioId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** O aviso da lista curta, como o servidor o devolveu. Enquanto ele existe, o botão confirma. */
  const [aviso, setAviso] = useState<AsShortlistCurtaPrecisaCiencia | null>(null);

  const numero = proximoNumeroDeShortlist(enviadas);
  const pedeMotivo = exigeMotivoDeReenvio(numero);
  /* O CATÁLOGO SÓ É PEDIDO QUANDO O CAMPO EXISTE. No primeiro envio não há motivo a escolher, e
     buscar a lista ali seria uma requisição para alimentar um campo que não é desenhado. */
  const {
    motivos: motivosDeReenvio,
    carregando: carregandoMotivos,
    erro: erroDosMotivos,
  } = useMotivosReenvioShortlist(token, pedeMotivo);
  /* QUEM JÁ SAIU DO PROCESSO NÃO VAI AO CLIENTE, e o servidor recusa o envio INTEIRO por causa de
     uma linha assim. A tela diz isso antes, porque a recusa de lá é por CONTAGEM e não nominal
     (§A.6), e sozinha ela não mostra QUEM tirar da seleção. */
  const forasDoFunil = selecionadas.filter((c) => !candidaturaViva(c.situacao));
  /* ESCOLHIDO OU NÃO ESCOLHIDO, e nada de contar caracteres: a régua antiga media o comprimento do
     texto digitado, e com catálogo a única pergunta possível é se alguma linha foi escolhida. */
  const motivoOk = !pedeMotivo || motivoReenvioId !== "";
  const impedido =
    enviando ||
    carregandoEnviadas ||
    selecionadas.length === 0 ||
    forasDoFunil.length > 0 ||
    !data ||
    !motivoOk;

  async function enviar(comCiencia: boolean) {
    setErro(null);
    setEnviando(true);
    try {
      await enviarShortlist(
        vagaId,
        {
          candidaturaIds: selecionadas.map((c) => c.id),
          enviadaEm: data,
          motivoReenvioId: pedeMotivo ? motivoReenvioId : undefined,
          cienteShortlistCurta: comCiencia,
        },
        token,
      );
      onEnviada();
    } catch (err) {
      // A LISTA CURTA NÃO É ERRO: é a pergunta que o servidor faz uma vez, com o número dentro. Ela
      // vira aviso na tela, e o MESMO botão reenvia com a ciência. Qualquer outro 409 (a vaga saiu
      // do processo entre a abertura e o clique) continua sendo erro, e é por isso que a conferência
      // do corpo é campo a campo.
      const curta = shortlistCurtaPrecisaCiencia(err);
      if (curta) setAviso(curta);
      else setErro(mensagemDoErro(err, "Falha ao enviar a shortlist."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal onClose={onCancelar} className="max-w-[620px] p-0" ariaLabel="Enviar Shortlist Ao Cliente">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <h2 className="text-lg font-semibold text-text">Enviar Shortlist Ao Cliente</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            {carregandoEnviadas
              ? "Conferindo as shortlists que esta vaga já mandou."
              : `Este é o envio ${rotuloDaShortlist(numero)}, com ${selecionadas.length === 1 ? "1 candidato" : `${selecionadas.length} candidatos`}. A lista enviada fica congelada: para mudar quem vai, o caminho é um reenvio.`}
          </p>
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          <Secao titulo="Data Do Envio">
            <input
              type="date"
              className="ds-input w-full sm:w-[220px]"
              value={data}
              disabled={enviando}
              onChange={(e) => setData(e.target.value)}
              aria-label="Data do envio da shortlist"
            />
            <p className="mt-2 text-[11.5px] text-faint">
              É esta data que passa a responder pelo campo Envio da shortlist na ficha da vaga.
            </p>
          </Secao>

          {/* O MOTIVO SÓ EXISTE A PARTIR DO SEGUNDO ENVIO. No primeiro o servidor RECUSA o campo, e
              um campo que só sabe gerar 400 é pior do que campo nenhum. */}
          {pedeMotivo && (
            <Secao titulo="Motivo Do Reenvio">
              {/* §A.35: `Select` do design system, com busca ligada explicitamente. O `<select>` cru
                  abriria o dropdown do sistema operacional, que não obedece ao tema, e o catálogo é
                  do diretor e cresce: ligar a busca depois seria lembrar de voltar aqui. */}
              <Select
                className="w-full"
                ariaLabel="Motivo do reenvio"
                placeholder={
                  carregandoMotivos ? "Carregando os motivos…" : "Escolha o motivo do reenvio"
                }
                value={motivoReenvioId}
                options={motivosDeReenvio.map((m) => ({ value: m.id, label: m.nome }))}
                disabled={enviando || carregandoMotivos || motivosDeReenvio.length === 0}
                searchable
                onChange={setMotivoReenvioId}
              />
              {/* ─ AS DUAS AUSÊNCIAS SÃO FATOS DIFERENTES, E CADA UMA TEM A SUA FRASE ───────────
                  "não consegui ler a lista" e "a lista está vazia" mandam a pessoa fazer coisas
                  opostas, e um seletor mudo no lugar das duas a faria procurar defeito onde não há. */}
              {erroDosMotivos ? (
                <p className="mt-2 text-[12px] text-danger" role="alert">
                  {erroDosMotivos} Sem a lista não é possível registrar o reenvio. Tente novamente em
                  instantes.
                </p>
              ) : !carregandoMotivos && motivosDeReenvio.length === 0 ? (
                <p className="mt-2 text-[12px] text-warn">
                  Nenhum motivo de reenvio está cadastrado. Enquanto isso, o reenvio não pode ser
                  registrado. Peça o cadastro em Motivos De Reenvio Da Shortlist, na administração.
                </p>
              ) : (
                <p className="mt-2 text-[11.5px] text-faint">
                  Obrigatório a partir do segundo envio. É o que explica, depois, por que a lista
                  mudou, e é por ele que o reenvio é contado. A lista é a do catálogo mantido pela
                  administração.
                </p>
              )}
            </Secao>
          )}

          <Secao titulo="Quem Vai Na Lista">
            <ul className="ea-scroll flex max-h-[168px] flex-col gap-1.5 overflow-y-auto">
              {selecionadas.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
                >
                  <span className="text-[12.5px] font-semibold text-text">{c.candidatoNome}</span>
                </li>
              ))}
            </ul>
          </Secao>

          {forasDoFunil.length > 0 && (
            <p className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                {forasDoFunil.length === 1
                  ? "1 pessoa da seleção já saiu do processo"
                  : `${forasDoFunil.length} pessoas da seleção já saíram do processo`}{" "}
                e não pode ir ao cliente: {forasDoFunil.map((c) => c.candidatoNome).join(", ")}.
                Tire quem saiu da seleção antes de enviar.
              </span>
            </p>
          )}

          {/* ─ A PERGUNTA DA LISTA CURTA, COM O NÚMERO NA FRENTE ────────────────────────────────
              "Tem certeza?" não é aviso: avisar com DOIS candidatos e avisar com UM são conversas
              diferentes, e é o número que distingue as duas. A frase vem pronta do servidor, e o
              mínimo sugerido sai do vocabulário compartilhado, nunca digitado aqui.

              ELA APARECE EM QUALQUER ENVIO, e é por isso que o texto daqui fala em "este envio", e
              não em "primeira shortlist": o reenvio curto recebe a mesma pergunta, e uma frase que
              dissesse "primeira" mentiria exatamente no caso que o diretor mandou passar a avisar. */}
          {aviso && (
            <p className="mb-5 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3.5 py-2.5 text-[12px] leading-snug text-dim">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
              <span>
                {aviso.mensagem} O sugerido é {SHORTLIST_MINIMO_SUGERIDO}. Enviar assim é permitido,
                e a confirmação fica registrada neste envio.
              </span>
            </p>
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
          <Button
            variant="secondary"
            className="px-4 py-2.5"
            onClick={onCancelar}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button
            className="px-4 py-2.5"
            disabled={impedido}
            onClick={() => void enviar(aviso !== null)}
          >
            {enviando ? "Enviando…" : aviso ? "Enviar assim mesmo" : "Enviar shortlist"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">{titulo}</h3>
      {children}
    </section>
  );
}
