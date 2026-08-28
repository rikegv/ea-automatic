"use client";

/**
 * A FICHA DO CANDIDATO: a pessoa, as candidaturas dela agrupadas por vaga e o histórico de contato
 * de cada uma.
 *
 * §A.6, E ESTE É O ÚNICO LUGAR DA TELA EM QUE O CPF APARECE. A lista não traz o número (traz
 * `temCpf`, um booleano) porque ela é a superfície que mais circula: fica aberta, entra em captura
 * de tela, seria a primeira a virar exportação. A ficha é UMA pessoa por vez e por clique
 * deliberado, e é o único uso legítimo do número. O número chega aqui pela resposta de
 * `GET /as/candidatos/:id`, nunca por URL montada com CPF.
 *
 * O HISTÓRICO PENDE DA CANDIDATURA, não da pessoa, e a ficha respeita isso: cada vaga tem a sua
 * linha do tempo. Um contato sobre a vaga A não é história da vaga B.
 *
 * §A.11 (sem travessão), §A.24 (title case em título e tag).
 */

import { useCallback, useEffect, useState } from "react";
import {
  AS_CANDIDATO_ORIGEM_LABEL,
  AS_CONTATO_TIPO,
  AS_CONTATO_TIPO_LABEL,
  CANDIDATURA_ETAPA_LABEL,
  CANDIDATURA_SITUACAO_LABEL,
  type AsCandidaturaEtapaItem,
  candidaturaViva,
  type AsCandidatoFicha,
  type AsContatoItem,
  type VagaListItem,
} from "@ea/shared-types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { StatusPill } from "@/components/ui/StatusPill";
import { Icon } from "@/components/ui/Icon";
import {
  dataBr,
  dataHoraBr,
  fichaCandidato,
  formatCpf,
  listarContatos,
  listarHistoricoEtapas,
  mensagemDoErro,
  registrarContato,
} from "@/lib/as-candidatos";
import { tomDaEtapa, tomDaSituacao } from "@/lib/as-candidatos-visual";
import { VagaResumoModal } from "@/components/as/vagas/VagaResumoModal";

/**
 * A LINHA DO TEMPO DAS ETAPAS de uma candidatura (peça P3 do bug 1).
 *
 * POR QUE ELA EXISTE: desde a peça P1, a etapa some da leitura viva quando a candidatura encerra. O
 * caminho não podia sumir junto, e é aqui que ele fica. É esta lista que responde "passou por
 * triagem? chegou na entrevista com o cliente?" depois de a pessoa ter saído.
 *
 * VAZIA É ESTADO LEGÍTIMO E DIZ ISSO EM PALAVRAS. As candidaturas anteriores ao histórico receberam
 * do backfill UMA entrada, a etapa atual, e nada mais: ninguém sabe por onde elas passaram antes, e
 * a decisão do diretor foi não fabricar passagens. A frase avisa que o registro começou agora, em
 * vez de deixar o consultor achar que a pessoa nunca se moveu.
 */
function LinhaDoTempo({ eventos }: { eventos: AsCandidaturaEtapaItem[] }) {
  return (
    <div className="mt-3.5 border-t border-[var(--border)] pt-3">
      <div className="mb-2 text-[12px] font-semibold text-dim">Por Onde Passou</div>
      {eventos.length === 0 ? (
        <p className="text-[12.5px] text-faint">
          Sem movimentação registrada nesta candidatura.
        </p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
              <span className="text-faint tabular-nums">{dataHoraBr(e.ocorridoEm)}</span>
              {/* A TROCA DE VAGA (item 5), o quarto tipo de evento: ela NÃO mexe na etapa, então
                  mostrar a etapa aqui confundiria. O que ela conta é de onde para onde a
                  candidatura foi, e é isso que fica auditável depois. */}
              {e.tipo === "TROCA_VAGA" ? (
                <>
                  <StatusPill tone="in" label="Trocou De Vaga" />
                  <span className="text-dim">
                    de {e.vagaDeRotulo ?? "não informado"} para{" "}
                    {e.vagaParaRotulo ?? "não informado"}
                  </span>
                </>
              ) : e.tipo === "DESFECHO" && e.situacao ? (
                <>
                  <StatusPill
                    tone={tomDaSituacao(e.situacao)}
                    label={CANDIDATURA_SITUACAO_LABEL[e.situacao]}
                  />
                  {/* "descartado NA TRIAGEM": a etapa em que a decisão foi tomada é o que dá
                      sentido ao desfecho, e é ela que o evento guardou. */}
                  <span className="text-dim">
                    em {CANDIDATURA_ETAPA_LABEL[e.etapaPara]}
                  </span>
                </>
              ) : (
                <>
                  {e.etapaDe && (
                    <span className="text-faint">
                      {CANDIDATURA_ETAPA_LABEL[e.etapaDe]} para
                    </span>
                  )}
                  <StatusPill
                    tone={tomDaEtapa(e.etapaPara)}
                    label={CANDIDATURA_ETAPA_LABEL[e.etapaPara]}
                  />
                  {e.tipo === "ENTRADA" && <span className="text-dim">na entrada</span>}
                </>
              )}
              {e.porNome && <span className="text-faint">por {e.porNome}</span>}
              {e.motivo && <span className="text-dim">Motivo: {e.motivo}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function FichaCandidatoModal({
  candidatoId,
  token,
  onClose,
  onMudou,
  vagaPorId,
}: {
  candidatoId: string;
  token: string | null;
  onClose: () => void;
  /** Avisa a listagem de que algo mudou aqui dentro (contato novo entra na coluna de recência). */
  onMudou: () => void;
  /**
   * AS VAGAS QUE A PÁGINA JÁ CARREGOU, para o "Ver vaga" abrir o descritivo sem ir ao servidor. Vem
   * de cima, e não de uma busca própria, porque a Central de Candidatos já pede `GET /as/vagas` para
   * montar as colunas de cliente e cargo: buscar de novo aqui seria a mesma resposta, duas vezes.
   */
  vagaPorId: Map<string, VagaListItem>;
}) {
  const [ficha, setFicha] = useState<AsCandidatoFicha | null>(null);
  const [contatos, setContatos] = useState<Record<string, AsContatoItem[]>>({});
  /** A LINHA DO TEMPO DE ETAPAS por candidatura (peça P3 do bug 1), na mesma carga dos contatos. */
  const [etapas, setEtapas] = useState<Record<string, AsCandidaturaEtapaItem[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /**
   * A VAGA MOSTRADA POR CIMA (ajuste 4 do diretor). O "Ver vaga" NAVEGAVA para a Central de Vagas, e
   * navegar custava o contexto inteiro da triagem: era preciso voltar e reabrir a ficha. Agora o
   * descritivo chega sobreposto, e fechar devolve a ficha como ela estava.
   */
  const [vagaAberta, setVagaAberta] = useState<VagaListItem | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const f = await fichaCandidato(candidatoId, token);
      setFicha(f);
      // O HISTÓRICO DE CADA CANDIDATURA. São poucas por pessoa (o normal é uma), então buscar todas
      // aqui é barato e evita um segundo clique para ver a história que se veio ver.
      const pares = await Promise.all(
        f.candidaturas.map(async (c) => [c.id, await listarContatos(c.id, token)] as const),
      );
      setContatos(Object.fromEntries(pares));

      // A LINHA DO TEMPO vem junto, pelo mesmo argumento: são poucas candidaturas por pessoa, e o
      // caminho percorrido é justamente o que se veio ver ao abrir a ficha de um descartado.
      const trilhas = await Promise.all(
        f.candidaturas.map(async (c) => [c.id, await listarHistoricoEtapas(c.id, token)] as const),
      );
      setEtapas(Object.fromEntries(trilhas));
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao carregar a ficha."));
    } finally {
      setCarregando(false);
    }
  }, [candidatoId, token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <Modal onClose={onClose} className="max-w-[900px] p-0" ariaLabel="Ficha do candidato">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Atração e Seleção</div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-text">
              {ficha?.nome ?? (carregando ? "Carregando…" : "Candidato")}
            </h2>
            {ficha && (
              <span className="pill in whitespace-nowrap">
                <Icon name="tag" className="h-3 w-3 flex-none" />
                {AS_CANDIDATO_ORIGEM_LABEL[ficha.origem]}
              </span>
            )}
          </div>
          {ficha && (
            <p className="mt-1 text-[12.5px] text-dim">
              Cadastrado em {dataHoraBr(ficha.criadoEm)}.{" "}
              {ficha.candidaturas.length === 0
                ? "Sem candidatura registrada."
                : `${ficha.candidaturas.length} ${ficha.candidaturas.length === 1 ? "candidatura" : "candidaturas"}.`}
            </p>
          )}
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {erro && (
            <p
              className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {erro}
            </p>
          )}

          {ficha && (
            <>
              {ficha.anonimizadoEm && (
                <p className="mb-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2.5 text-[12.5px] text-dim">
                  A retenção desta pessoa venceu em {dataHoraBr(ficha.anonimizadoEm)} e os dados de
                  identificação foram descartados. O histórico das vagas continua aqui.
                </p>
              )}

              <section className="mb-5">
                <h3 className="mb-2.5 text-[13px] font-semibold text-text">A Pessoa</h3>
                <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 md:grid-cols-2">
                  {/* O CPF APARECE AQUI E SÓ AQUI (§A.6). Ele também é a resposta do "sem CPF" que
                      saiu da listagem no ajuste de 27/08: sem número cadastrado, esta linha diz
                      "não informado", que é a mesma informação sem ocupar a fila inteira. */}
                  <Linha rotulo="CPF" valor={ficha.cpf ? formatCpf(ficha.cpf) : null} />
                  {/* A ORIGEM NÃO É REPETIDA AQUI DE PROPÓSITO: ela já é a pill ao lado do nome, no
                      topo desta mesma ficha, e é lá que ela lê melhor (é identidade da pessoa, não
                      um campo de cadastro). O que saiu da listagem no ajuste de 27/08 continua todo
                      alcançável no olho: origem na pill acima, cidade e UF nas duas linhas abaixo,
                      e o "sem CPF" na linha de CPF. Repetir a origem numa segunda posição seria
                      dizer a mesma coisa duas vezes na mesma tela. */}
                  <Linha rotulo="Telefone" valor={ficha.telefone} />
                  <Linha rotulo="E-mail" valor={ficha.email} />
                  <Linha rotulo="Data de nascimento" valor={dataBrOuNulo(ficha.dataNascimento)} />
                  <Linha rotulo="Cidade" valor={ficha.cidade} />
                  <Linha rotulo="UF" valor={ficha.uf} />
                </div>
              </section>

              <section>
                <h3 className="mb-2.5 text-[13px] font-semibold text-text">As Candidaturas</h3>
                {ficha.candidaturas.length === 0 ? (
                  <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 text-[13px] text-dim">
                    Esta pessoa está na base e ainda não foi alocada em nenhuma vaga. Isso é um
                    estado normal, não um cadastro pela metade.
                  </p>
                ) : (
                  ficha.candidaturas.map((c) => (
                    <div
                      key={c.id}
                      className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 last:mb-0"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[13.5px] font-semibold text-text">
                            {c.vagaNome ?? "Vaga sem nome de divulgação"}
                          </div>
                          <div className="text-[11.5px] text-faint">
                            Código {c.vagaCodigo ?? "não informado"}. Alocada em{" "}
                            {dataHoraBr(c.alocadoEm)} por {c.alocadoPorNome ?? "não informado"}.
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {/* A ETAPA SÓ ENQUANTO VIVA (peça P1), igual à listagem: a coluna do banco
                              congela no último lugar, e mostrá-la depois do desfecho desenharia o
                              descartado dentro do funil. Onde ele passou está logo abaixo, na linha
                              do tempo, que é o lugar certo dessa informação. */}
                          {candidaturaViva(c.situacao) ? (
                            <StatusPill
                              tone={tomDaEtapa(c.etapa)}
                              label={CANDIDATURA_ETAPA_LABEL[c.etapa]}
                            />
                          ) : (
                            <StatusPill tone="nt" label="Fora Do Funil" />
                          )}
                          <StatusPill
                            tone={tomDaSituacao(c.situacao)}
                            label={CANDIDATURA_SITUACAO_LABEL[c.situacao]}
                          />
                          {/* VER VAGA (item 6): a ponte da Central de Candidatos para a Central de
                              Vagas, no sentido pessoa para vaga. Leva o código da vaga na URL, que a
                              Central de Vagas usa para abrir o descritivo completo daquela linha.
                              §A.6: o que viaja é o CÓDIGO DA VAGA, nunca dado da pessoa. */}
                          {/* VER VAGA: abre o descritivo POR CIMA desta ficha (ajuste 4). A vaga
                              vem do mapa que a página já tem em memória, então não há ida ao
                              servidor: a Central de Candidatos já carrega `GET /as/vagas` para
                              montar as colunas de cliente e cargo. */}
                          <Button
                            variant="secondary"
                            className="px-3 py-1.5 text-[12px]"
                            onClick={() => {
                              const v = vagaPorId.get(c.vagaId);
                              if (v) setVagaAberta(v);
                            }}
                            disabled={!vagaPorId.has(c.vagaId)}
                            title={
                              vagaPorId.has(c.vagaId)
                                ? "Ver o descritivo desta vaga"
                                : "O descritivo desta vaga não está carregado"
                            }
                          >
                            Ver vaga
                          </Button>
                        </div>
                      </div>

                      {c.motivoDescarte && (
                        <p className="mt-2 text-[12.5px] text-dim">
                          Motivo registrado: {c.motivoDescarte}
                        </p>
                      )}

                      <LinhaDoTempo eventos={etapas[c.id] ?? []} />

                      <Historico
                        contatos={contatos[c.id] ?? []}
                        candidaturaId={c.id}
                        token={token}
                        onRegistrado={() => {
                          void carregar();
                          onMudou();
                        }}
                      />
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex flex-none justify-end border-t border-[var(--border)] px-6 py-4">
          <Button variant="secondary" className="px-4 py-2.5" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      {/* SOBREPOSTO, e o empilhamento é por ORDEM DE DOM: o `Modal` do sistema é `z-[55]` fixo, e
          quem vem depois pinta por cima. Renderizar aqui DENTRO da ficha, e não lá na página, é o
          que garante essa ordem sem inventar um `z-[56]` que a próxima sobreposição teria de
          superar de novo. Fechar este devolve a ficha exatamente como estava. */}
      {vagaAberta && (
        <VagaResumoModal vaga={vagaAberta} onClose={() => setVagaAberta(null)} />
      )}
    </Modal>
  );
}

/** O histórico de UMA candidatura, mais o formulário de registrar contato novo. */
function Historico({
  contatos,
  candidaturaId,
  token,
  onRegistrado,
}: {
  contatos: AsContatoItem[];
  candidaturaId: string;
  token: string | null;
  onRegistrado: () => void;
}) {
  const [tipo, setTipo] = useState<string>("LIGACAO");
  const [resumo, setResumo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function registrar() {
    setErro(null);
    setSalvando(true);
    try {
      await registrarContato(candidaturaId, { tipo, resumo: resumo.trim() }, token);
      setResumo("");
      onRegistrado();
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao registrar o contato."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">
        Histórico De Contato
      </h4>

      {contatos.length === 0 ? (
        <p className="mb-3 text-[12.5px] text-faint">
          Nenhum contato registrado nesta candidatura ainda.
        </p>
      ) : (
        <ul className="mb-3 flex flex-col gap-2">
          {contatos.map((k) => (
            <li
              key={k.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="pill in whitespace-nowrap">
                  <span className="pd" />
                  {AS_CONTATO_TIPO_LABEL[k.tipo]}
                </span>
                <span className="text-[11.5px] text-faint">
                  {dataHoraBr(k.ocorridoEm)} por {k.registradoPorNome ?? "não informado"}
                </span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-text">
                {k.resumo}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <Combobox
          value={tipo}
          onChange={setTipo}
          options={AS_CONTATO_TIPO.map((t) => ({ value: t, label: AS_CONTATO_TIPO_LABEL[t] }))}
          ariaLabel="Tipo de contato"
          className="sm:w-48"
        />
        <input
          className="ds-input flex-1"
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          placeholder="O que aconteceu neste contato"
          aria-label="Resumo do contato"
        />
        <Button
          className="px-4 py-2.5"
          disabled={salvando || resumo.trim().length < 2}
          onClick={() => void registrar()}
        >
          Registrar contato
        </Button>
      </div>
      {erro && (
        <p className="mt-2 text-[12.5px] text-danger" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Linha da ficha. Vazio vira "não informado" (§A.11), nunca um glifo solto. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  const texto = valor?.trim() ? valor.trim() : "não informado";
  return (
    <div>
      <span className="block text-[11.5px] text-faint">{rotulo}</span>
      <span className="block whitespace-pre-wrap break-words text-[13px] text-text">{texto}</span>
    </div>
  );
}

function dataBrOuNulo(iso: string | null): string | null {
  return iso ? dataBr(iso) : null;
}
