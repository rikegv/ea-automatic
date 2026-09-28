"use client";

/**
 * ─ ENVIAR OU COPIAR O LINK DO PORTAL: a porta por onde nasce o PRIMEIRO link de alguém ─────────
 *
 * ┌─ O QUE ISTO RESOLVE, e é um ovo e galinha que estava fechado dos dois lados ────────────────┐
 * │ A lista do Gerenciador do Portal sai de `portal_links`: ela só mostra quem JÁ tem link. E a  │
 * │ emissão só é clicável a partir de uma linha dessa lista. Ou seja: quem nunca recebeu link    │
 * │ não aparecia em tela nenhuma, e não havia por onde emitir o primeiro (os links da            │
 * │ homologação nasceram de script). O caminho manual da OST pede exatamente esta porta.         │
 * │                                                                                              │
 * │ ELA É UMA BUSCA EM MODAL, E NÃO UM ALARGAMENTO DA LISTA (§A.26): mexer no recorte da lista   │
 * │ mexeria nos cinco contadores, nos filtros e na paginação, que são código validado e que      │
 * │ ninguém pediu para mudar.                                                                    │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ SÃO DUAS AÇÕES POR LINHA, E COPIAR É A QUE FUNCIONA HOJE ──────────────────────────────────┐
 * │ O correio do Portal NÃO está configurado, então o envio por e-mail recusa com               │
 * │ `CANAL_INDISPONIVEL` e nada é emitido. COPIAR O LINK não depende de canal nenhum: o          │
 * │ consultor pega a URL e manda pelo caminho que o time já usa. Por isso copiar está SEMPRE     │
 * │ disponível, inclusive para quem tem `podeEnviar: false` por falta de e-mail: a régua do      │
 * │ `podeEnviar` é do E-MAIL, e não do link.                                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A ABSTENÇÃO É DESFECHO NORMAL, NUNCA ERRO (condição da auditoria) ─────────────────────────┐
 * │ `gerado: false` com `LINK_VIVO_EM_USO` quer dizer que o candidato está com o portal ABERTO   │
 * │ neste instante. Emitir outro derrubaria a sessão de quem está enviando documento. A tela     │
 * │ diz isso em voz alta, em tom neutro: nada de vermelho, nada de "falha", nada de `role`       │
 * │ de alerta.                                                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: A BUSCA É POR NOME, NUNCA POR CPF. Busca por CPF em tela operacional é oráculo de
 * existência, e é o que a identificação do candidato fecha desde o primeiro dia. O endereço do
 * candidato aparece só MASCARADO, como o servidor o manda, e nenhuma mensagem de erro daqui o
 * carrega dentro. A URL é CREDENCIAL: ela vive no estado deste modal, não vai para log, não vai
 * para telemetria, não vai para `localStorage` e some quando o modal fecha.
 *
 * §A.41: o modal não fecha por clique fora (é o `Modal` do design system) e tem "Fechar" no
 * rodapé. §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação).
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AdmissaoSemLinkDoPortal,
  LinkDoPortalParaCopiar,
  ResultadoDoEnvioDoLink,
} from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { caixaAlta } from "@/lib/nome";
import { copiarTexto, AVISO_COPIA_FALHOU, type ResultadoDaCopia } from "@/lib/copiar-texto";
import {
  destinoVisivel,
  enviarLinkDaAdmissao,
  etiquetaDaRecusa,
  fraseDaRecusa,
  fraseDoLinkParaCopiar,
  fraseDoResultado,
  gerarLinkParaCopiar,
  mensagemDaFalha,
  rotaSemLink,
  tituloDoLinkParaCopiar,
} from "@/lib/portal-envio-link";
import { formatarDataHora } from "@/lib/portal-painel";

/** O que já foi enviado nesta sessão do modal, por admissão. Some quando o modal fecha. */
type Desfecho = { ok: boolean; texto: string };

/**
 * O QUE A EMISSÃO DEVOLVEU, por admissão, e SÓ enquanto o modal está aberto.
 *
 * `url` é credencial: ela não sai daqui. `titulo` e `texto` já vêm prontos do vocabulário testado,
 * para a abstenção e a emissão falarem a mesma língua em todas as superfícies.
 */
type LinkNaTela = { url: string | null; titulo: string; texto: string };

export function EnviarLinkModal({
  token,
  onClose,
  onEnviou,
}: {
  token: string | null;
  onClose: () => void;
  /** Alguém recebeu link: a lista de trás precisa reler, porque a linha passou a existir nela. */
  onEnviou: () => void;
}) {
  const [nome, setNome] = useState("");
  const [itens, setItens] = useState<AdmissaoSemLinkDoPortal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [desfechos, setDesfechos] = useState<Record<string, Desfecho>>({});
  const [links, setLinks] = useState<Record<string, LinkNaTela>>({});
  const [copias, setCopias] = useState<Record<string, ResultadoDaCopia | undefined>>({});

  const buscar = useCallback(
    async (termo: string) => {
      setCarregando(true);
      setErro(null);
      try {
        setItens(await apiFetch<AdmissaoSemLinkDoPortal[]>(rotaSemLink(termo), { token }));
      } catch (e) {
        setItens([]);
        setErro(mensagemDaFalha(e, "Falha ao buscar os candidatos sem link do portal."));
      } finally {
        setCarregando(false);
      }
    },
    [token],
  );

  /**
   * A BUSCA ESPERA A PESSOA PARAR DE DIGITAR. Sem a espera, cada tecla vira uma consulta, e as
   * respostas voltam fora de ordem: a lista pisca e às vezes assenta no resultado de um termo que
   * a pessoa já apagou.
   */
  useEffect(() => {
    const t = setTimeout(() => void buscar(nome), 300);
    return () => clearTimeout(t);
  }, [nome, buscar]);

  async function enviar(a: AdmissaoSemLinkDoPortal) {
    setEnviando(a.admissaoId);
    try {
      const r: ResultadoDoEnvioDoLink = await enviarLinkDaAdmissao(a.admissaoId, token);
      setDesfechos((d) => ({
        ...d,
        [a.admissaoId]: {
          ok: r.enviado,
          texto: fraseDoResultado(r, formatarDataHora(r.expiraEm)),
        },
      }));
      // SÓ RELÊ A LISTA DE TRÁS QUANDO ALGO NASCEU. Recusa não cria link, e reler à toa faria a
      // tela piscar por baixo do modal sem nada ter mudado.
      if (r.enviado) onEnviou();
    } catch (e) {
      setDesfechos((d) => ({
        ...d,
        [a.admissaoId]: {
          ok: false,
          texto: mensagemDaFalha(e, "Falha ao enviar o link do portal."),
        },
      }));
    } finally {
      setEnviando(null);
    }
  }

  /**
   * GERAR O LINK PARA COPIAR. A abstenção volta por aqui como desfecho NORMAL, com a frase do
   * próprio motivo, e não como erro.
   */
  async function gerar(a: AdmissaoSemLinkDoPortal) {
    setGerando(a.admissaoId);
    // O aviso de cópia da emissão ANTERIOR não pode sobreviver à emissão nova: a URL mudou, e
    // "Copiado" ao lado de um link recém-gerado diria que a pessoa já tem na mão o que ela não tem.
    setCopias((c) => ({ ...c, [a.admissaoId]: undefined }));
    try {
      const r: LinkDoPortalParaCopiar = await gerarLinkParaCopiar(a.admissaoId, token);
      setLinks((l) => ({
        ...l,
        [a.admissaoId]: {
          url: r.link,
          titulo: tituloDoLinkParaCopiar(r),
          texto: fraseDoLinkParaCopiar(r, formatarDataHora(r.expiraEm)),
        },
      }));
      // Nasceu link: a linha passou a existir na lista de trás, que relê. Abstenção não cria nada.
      if (r.gerado) onEnviou();
    } catch (e) {
      setLinks((l) => ({
        ...l,
        [a.admissaoId]: {
          url: null,
          titulo: "Nenhum Link Novo Foi Gerado",
          texto: mensagemDaFalha(e, "Falha ao gerar o link do portal."),
        },
      }));
    } finally {
      setGerando(null);
    }
  }

  /**
   * COPIAR, COM CAMINHO DE RESERVA E ERRO HONESTO. `navigator.clipboard` não existe fora de
   * contexto seguro (a homologação é `http://`), e a régua dos dois caminhos mora em
   * `@/lib/copiar-texto`; aqui só se diz o que aconteceu.
   */
  async function copiar(admissaoId: string, url: string) {
    const r = await copiarTexto(url);
    setCopias((c) => ({ ...c, [admissaoId]: r }));
  }

  return (
    <Modal onClose={onClose} className="max-w-[760px] p-0" ariaLabel="Enviar Link Do Portal">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Portal do candidato</div>
          <h2 className="text-lg font-semibold text-text">Enviar Link Do Portal</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            Busque pelo nome do candidato e copie o link para mandar pelo canal que você preferir,
            ou envie por e-mail. Aqui aparece quem ainda não tem link nenhum; quem já tem é
            atendido pela própria linha da lista.
          </p>
          <input
            type="search"
            className="ds-input mt-3 w-full rounded-full"
            placeholder="Buscar por nome do candidato"
            aria-label="Buscar por nome do candidato"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
          />
        </div>

        <div className="ea-scroll flex-1 overflow-y-auto px-6 py-5">
          {carregando ? (
            <p className="py-6 text-center text-[13px] text-faint">Carregando…</p>
          ) : erro ? (
            <p
              className="rounded-xl border border-[var(--border)] bg-[rgba(214,69,69,0.1)] px-3 py-2 text-[12.5px] text-danger"
              role="alert"
            >
              {erro}
            </p>
          ) : itens.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-[13px] text-dim">
              {nome.trim()
                ? "Nenhum candidato sem link com esse nome. Quem já tem link aparece na lista do Gerenciador."
                : "Nenhuma admissão viva está sem link do portal."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {itens.map((a) => {
                const desfecho = desfechos[a.admissaoId];
                const link = links[a.admissaoId];
                const copia = copias[a.admissaoId];
                const rodando = enviando === a.admissaoId;
                const gerandoEsta = gerando === a.admissaoId;
                return (
                  <li
                    key={a.admissaoId}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block text-[13px] font-semibold text-text">
                          {caixaAlta(a.nome)}
                        </span>
                        <span className="block text-[11.5px] text-faint">
                          {a.cargo || "não informado"} · {a.cliente || "não informado"}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-dim">
                          {destinoVisivel(a.destinoMascarado)}
                        </span>
                      </div>

                      <div className="flex flex-none items-center gap-2">
                        {/* QUEM NÃO PODE RECEBER POR E-MAIL MOSTRA A ETIQUETA DO MOTIVO, e o botão
                            do e-mail fica apagado DIZENDO POR QUÊ no `title`, em vez de sumir e
                            deixar a pessoa procurando o que fazer. A etiqueta NÃO apaga o copiar:
                            ela é da régua do e-mail, e o link continua podendo ser gerado. */}
                        {!a.podeEnviar && (
                          <StatusPill tone="wn" label={etiquetaDaRecusa(a.motivo)} />
                        )}

                        {/* COPIAR SEMPRE DISPONÍVEL: é o caminho que não depende de correio. */}
                        <Button
                          className="px-3 py-2"
                          disabled={gerandoEsta || rodando}
                          title="Gerar o link do portal e copiar para mandar pelo canal que você preferir"
                          onClick={() => void gerar(a)}
                        >
                          <Icon
                            name={gerandoEsta ? "refresh" : "link"}
                            className={
                              gerandoEsta
                                ? "mr-1.5 inline h-3.5 w-3.5 animate-spin align-middle"
                                : "mr-1.5 inline h-3.5 w-3.5 align-middle"
                            }
                          />
                          {gerandoEsta ? "Gerando…" : link ? "Gerar de novo" : "Copiar link"}
                        </Button>

                        <Button
                          variant="secondary"
                          className="px-3 py-2"
                          disabled={
                            !a.podeEnviar || rodando || gerandoEsta || desfecho?.ok === true
                          }
                          title={a.podeEnviar ? undefined : fraseDaRecusa(a.motivo)}
                          onClick={() => void enviar(a)}
                        >
                          <Icon
                            name={rodando ? "refresh" : desfecho?.ok ? "check" : "arr"}
                            className={
                              rodando
                                ? "mr-1.5 inline h-3.5 w-3.5 animate-spin align-middle"
                                : "mr-1.5 inline h-3.5 w-3.5 align-middle"
                            }
                          />
                          {rodando ? "Enviando…" : desfecho?.ok ? "Enviado" : "Enviar por e-mail"}
                        </Button>
                      </div>
                    </div>

                    {/* A CAIXA DO LINK, e ela serve aos DOIS desfechos no mesmo tom neutro: a
                        emissão que deu certo e a ABSTENÇÃO. Nada de vermelho aqui: abster-se
                        porque o candidato está usando o link dele é o comportamento certo. */}
                    {link && (
                      <div className="mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                        <p className="text-[12.5px] font-semibold text-text">{link.titulo}</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-dim">{link.texto}</p>

                        {link.url && (
                          <>
                            <div className="mt-2.5 flex items-center gap-2">
                              <input
                                readOnly
                                value={link.url}
                                aria-label={`Link do portal de ${a.nome}`}
                                onFocus={(e) => e.currentTarget.select()}
                                className="ds-input w-full py-2 text-[12px]"
                              />
                              <Button
                                variant="secondary"
                                className="shrink-0 px-3 py-2"
                                onClick={() => void copiar(a.admissaoId, link.url as string)}
                              >
                                <Icon name="copy" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
                                {copia === "copiado" ? "Copiado" : "Copiar"}
                              </Button>
                            </div>
                            {copia === "falhou" && (
                              <p className="mt-2 text-[12px] text-warn" role="alert">
                                {AVISO_COPIA_FALHOU}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {desfecho && (
                      <p
                        className={
                          desfecho.ok
                            ? "mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12px] text-dim"
                            : "mt-2.5 rounded-xl border border-[var(--border)] bg-[var(--sico-warn)] px-3 py-2 text-[12px] text-dim"
                        }
                        role={desfecho.ok ? undefined : "alert"}
                      >
                        {desfecho.texto}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-none justify-end border-t border-[var(--border)] px-6 py-4">
          <Button onClick={onClose} className="px-4 py-2.5">
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
