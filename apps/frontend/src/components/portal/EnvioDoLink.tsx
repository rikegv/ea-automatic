"use client";

/**
 * ─ A CIÊNCIA DO ENVIO DO LINK DO PORTAL, desenhada UMA vez para as quatro superfícies ─────────
 *
 * O clique "Enviar Para Admissão" passou a ter um efeito colateral que o consultor não via: o
 * candidato recebe, por e-mail, uma CREDENCIAL DE ACESSO ao próprio prontuário. Este arquivo é o
 * lugar onde a tela conta isso antes do clique, e ele é um só porque o aviso aparece em três
 * modais diferentes (o individual do funil, o dos pendentes ao encerrar a vaga e o do lote) mais o
 * Gerenciador do Portal. Quatro desenhos da mesma ciência divergem no primeiro ajuste.
 *
 * §A.6: NADA aqui monta endereço. O que se desenha é o `destinoMascarado` que o servidor mandou,
 * e a frase da recusa vem do vocabulário testado (`lib/portal-envio-link`), onde nenhuma frase
 * contém arroba. §A.11 (sem travessão), §A.24 (title case em título e etiqueta).
 */

import type { DestinatarioDoLink } from "@ea/shared-types";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  destinoVisivel,
  etiquetaDaRecusa,
  fraseDaCienciaDoEnvio,
  frasePessoas,
  resumoDaPrevia,
  separarPrevia,
  type EstadoDaPrevia,
} from "@/lib/portal-envio-link";
import { cn } from "@/lib/cn";

/**
 * A ABSTENÇÃO NÃO SE PINTA DE PENDÊNCIA. São DOIS dos sete motivos, e nos dois nada falhou: o
 * sistema deixou de emitir DE PROPÓSITO. Amarelo de alerta neles diria o contrário do texto.
 *
 * `LINK_VIVO_EM_USO`: o candidato ESTÁ no portal com um link que vale, e reemitir derrubaria a
 * sessão de quem envia documento naquele instante.
 * `ENVIADO_HA_POUCO`: o e-mail acabou de sair e ele ainda não abriu, então reemitir revogaria a
 * mensagem que está a caminho e o candidato ficaria com duas, das quais a primeira morreu.
 *
 * SÃO DUAS SITUAÇÕES DIFERENTES COM A MESMA COR, e isso é deliberado: a cor responde "isto é
 * problema?", e a resposta é não nas duas. Quem diz o que fazer é o texto, que é diferente.
 *
 * O tom é o INFORMATIVO que o Design System já tem (`--sico` no fundo, `text-accent` no traço, o
 * mesmo par da pill `in`), e o ícone é o `link`, que nomeia o estado. Nenhum token novo.
 */
function ehAbstencao(motivo: string | null | undefined): boolean {
  return motivo === "LINK_VIVO_EM_USO" || motivo === "ENVIADO_HA_POUCO";
}

/**
 * O AVISO DO INDIVIDUAL. Ele tem QUATRO caras: conferindo, o caminho normal, a ABSTENÇÃO (azul
 * informativo, porque não há problema nenhum) e a recusa de verdade, amarela, que diz que o link
 * não vai sair em vez de sumir e deixar o consultor achar que o e-mail saiu.
 */
export function AvisoDoEnvioDoLink({
  destinatario,
  carregando,
}: {
  destinatario: DestinatarioDoLink | null;
  carregando: boolean;
}) {
  if (carregando) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-2.5 text-[12px] leading-snug text-dim">
        <Icon name="refresh" className="mt-[2px] h-3.5 w-3.5 flex-none animate-spin text-faint" />
        <span>Conferindo para onde o link do portal vai.</span>
      </p>
    );
  }

  const naoEnvia = destinatario !== null && !destinatario.podeEnviar;
  const abstencao = naoEnvia && ehAbstencao(destinatario.motivo);
  const recusado = naoEnvia && !abstencao;
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-[12px] leading-snug text-dim",
        recusado
          ? "bg-[var(--sico-warn)]"
          : abstencao
            ? "bg-[var(--sico)]"
            : "bg-[var(--surface-2)]",
      )}
    >
      <Icon
        name={recusado ? "alert" : "link"}
        className={cn("mt-[2px] h-3.5 w-3.5 flex-none", recusado ? "text-warn" : "text-accent")}
      />
      <span>{fraseDaCienciaDoEnvio(destinatario)}</span>
    </p>
  );
}

/**
 * A PRÉVIA DO LOTE, E ELA É EXIGÊNCIA DA AUDITORIA, não enfeite.
 *
 * "Confirmar uma vez e enviar N às cegas" foi vetado: em massa, um e-mail desatualizado no
 * cadastro entrega o prontuário de um candidato a um terceiro sem que nada falhe, e ninguém
 * repara porque o lote devolveu sucesso. Então o consultor vê, ANTES, NOME por NOME e destino
 * MASCARADO por destino, e vê SEPARADO quem fica de fora e por quê.
 */
export function PreviaDoEnvioEmLoteSecao({ estado }: { estado: EstadoDaPrevia }) {
  const { previa, carregando, falhou } = estado;
  const { recebem, ficamDeFora } = separarPrevia(previa);

  if (carregando) {
    return (
      <Caixa>
        <Icon name="refresh" className="mt-[2px] h-3.5 w-3.5 flex-none animate-spin text-faint" />
        <span>Conferindo quem vai receber o link do portal.</span>
      </Caixa>
    );
  }

  if (falhou || !previa) {
    return (
      <Caixa tom="warn">
        <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-warn" />
        <span>
          Não foi possível conferir quem recebe o link do portal agora. O envio para a admissão
          acontece do mesmo jeito, e o link pode ser enviado depois pelo Gerenciador do Portal.
        </span>
      </Caixa>
    );
  }

  return (
    <>
      <p className="mb-2.5 text-[12px] text-dim">{resumoDaPrevia(previa)}</p>

      {recebem.length > 0 && (
        <Grupo titulo={`Quem Vai Receber O Link (${recebem.length})`}>
          {recebem.map((p) => (
            <Linha key={chaveDa(p)} nome={p.nome}>
              <span className="text-[12px] text-dim">{destinoVisivel(p.destinoMascarado)}</span>
            </Linha>
          ))}
        </Grupo>
      )}

      {ficamDeFora.length > 0 && (
        <Grupo titulo={`Quem NÃO Vai Receber O Link (${ficamDeFora.length})`}>
          {ficamDeFora.map((p) => (
            <Linha key={chaveDa(p)} nome={p.nome}>
              {/* A ETIQUETA DIZ O MOTIVO EM UMA PALAVRA, e a frase inteira mora no vocabulário: a
                  lista em massa precisa caber na tela, e o consultor resolve um a um depois.
                  A ABSTENÇÃO sai do amarelo: tom `in` (azul informativo) e ícone de link, porque
                  ali não há pendência a resolver. Os outros cinco seguem amarelos. */}
              {ehAbstencao(p.motivo) ? (
                <StatusPill tone="in" icon="link" label={etiquetaDaRecusa(p.motivo)} />
              ) : (
                <StatusPill tone="wn" label={etiquetaDaRecusa(p.motivo)} />
              )}
            </Linha>
          ))}
        </Grupo>
      )}

      {recebem.length === 0 && ficamDeFora.length === 0 && (
        <Caixa>
          <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 flex-none text-faint" />
          <span>
            Ninguém desta seleção recebe o link do portal agora. O envio para a admissão acontece do
            mesmo jeito.
          </span>
        </Caixa>
      )}

      {ficamDeFora.length > 0 && (
        <p className="mt-2 text-[11.5px] text-faint">
          {frasePessoas(ficamDeFora.length)} não vão receber o e-mail. O envio para a admissão
          acontece para elas assim mesmo, e o link pode ser enviado depois pelo Gerenciador do
          Portal.
        </p>
      )}
    </>
  );
}

/** O id que a lista usa. A candidatura é o que o lote endereça; a admissão é a reserva. */
function chaveDa(p: DestinatarioDoLink): string {
  return p.candidaturaId ?? p.admissaoId ?? p.nome;
}

function Caixa({ tom, children }: { tom?: "warn"; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-[12px] leading-snug text-dim",
        tom === "warn" ? "bg-[var(--sico-warn)]" : "bg-[var(--surface-2)]",
      )}
    >
      {children}
    </p>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <h4 className="mb-1.5 text-[12px] font-semibold text-text">{titulo}</h4>
      <ul className="ea-scroll flex max-h-[168px] flex-col gap-1.5 overflow-y-auto">{children}</ul>
    </div>
  );
}

function Linha({ nome, children }: { nome: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <span className="text-[12.5px] font-semibold text-text">{nome}</span>
      {children}
    </li>
  );
}
