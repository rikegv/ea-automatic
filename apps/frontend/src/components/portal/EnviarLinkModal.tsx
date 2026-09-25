"use client";

/**
 * ─ ENVIAR O LINK DO PORTAL: a porta por onde nasce o PRIMEIRO link de alguém ──────────────────
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
 * §A.6: A BUSCA É POR NOME, NUNCA POR CPF. Busca por CPF em tela operacional é oráculo de
 * existência, e é o que a identificação do candidato fecha desde o primeiro dia. O endereço do
 * candidato aparece só MASCARADO, como o servidor o manda, e nenhuma mensagem de erro daqui o
 * carrega dentro.
 *
 * §A.41: o modal não fecha por clique fora (é o `Modal` do design system) e tem "Fechar" no
 * rodapé. §A.11 (sem travessão), §A.24 (title case em título e etiqueta; botão é ação).
 */

import { useCallback, useEffect, useState } from "react";
import type { AdmissaoSemLinkDoPortal, ResultadoDoEnvioDoLink } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { caixaAlta } from "@/lib/nome";
import {
  destinoVisivel,
  enviarLinkDaAdmissao,
  etiquetaDaRecusa,
  fraseDaRecusa,
  fraseDoResultado,
  mensagemDaFalha,
  rotaSemLink,
} from "@/lib/portal-envio-link";
import { formatarDataHora } from "@/lib/portal-painel";

/** O que já foi enviado nesta sessão do modal, por admissão. Some quando o modal fecha. */
type Desfecho = { ok: boolean; texto: string };

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
  const [desfechos, setDesfechos] = useState<Record<string, Desfecho>>({});

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

  return (
    <Modal onClose={onClose} className="max-w-[720px] p-0" ariaLabel="Enviar Link Do Portal">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex-none border-b border-[var(--border)] px-6 pb-4 pt-6">
          <div className="eyebrow !mb-1">Portal do candidato</div>
          <h2 className="text-lg font-semibold text-text">Enviar Link Do Portal</h2>
          <p className="mt-1 text-[12.5px] text-dim">
            Busque pelo nome do candidato e envie o link por e-mail. Aqui aparece quem ainda não
            tem link nenhum; quem já tem é enviado pela própria linha da lista.
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
                const rodando = enviando === a.admissaoId;
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
                        {/* QUEM NÃO PODE RECEBER MOSTRA A ETIQUETA DO MOTIVO, e o botão fica
                            apagado DIZENDO POR QUÊ no `title`, em vez de sumir e deixar a pessoa
                            procurando o que fazer. */}
                        {!a.podeEnviar && (
                          <StatusPill tone="wn" label={etiquetaDaRecusa(a.motivo)} />
                        )}
                        <Button
                          variant="secondary"
                          className="px-3 py-2"
                          disabled={!a.podeEnviar || rodando || desfecho?.ok === true}
                          title={a.podeEnviar ? undefined : fraseDaRecusa(a.motivo)}
                          onClick={() => void enviar(a)}
                        >
                          <Icon
                            name={rodando ? "refresh" : desfecho?.ok ? "check" : "arr"}
                            className={rodando ? "mr-1.5 inline h-3.5 w-3.5 animate-spin align-middle" : "mr-1.5 inline h-3.5 w-3.5 align-middle"}
                          />
                          {rodando ? "Enviando…" : desfecho?.ok ? "Enviado" : "Enviar por e-mail"}
                        </Button>
                      </div>
                    </div>

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
