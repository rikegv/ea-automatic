"use client";

/**
 * ─ A ENTREVISTA DESTA PESSOA: marcar, remarcar e ver o que está marcado (Frente E, ponto 8) ────
 *
 * ┌─ ONDE ELE VIVE, E POR QUÊ ──────────────────────────────────────────────────────────────────┐
 * │ DENTRO DO MODAL DO FUNIL, logo abaixo do seletor de etapas: é ali que a pessoa aparece no    │
 * │ funil, e é ali que a pergunta "que dia é a entrevista dela?" nasce. Uma coluna na tabela      │
 * │ custaria uma requisição POR LINHA (a entrevista é leitura de UMA candidatura, e não desce no  │
 * │ item da lista), e a lista da vaga carrega dezenas de linhas de uma vez.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * QUAIS ETAPAS OFERECEM O CONTROLE VEM DO CATÁLOGO (`GET /as/etapas/com-entrevista`), NUNCA de um
 * literal: quem responde é `etapaAceitaEntrevista`, e o código `"ENTREVISTA_SOULAN"` não está
 * escrito em lugar nenhum desta tela. O diretor marca a etapa na tela de Etapas Do Funil, e o
 * controle passa a aparecer nela sem deploy.
 *
 * AS MARCADAS APARECEM MESMO QUANDO A ETAPA ATUAL NÃO OFERECE O CONTROLE, e isso é deliberado: o
 * time marca a entrevista do cliente ENQUANTO a pessoa ainda está na etapa Soulan, e quem volta ao
 * modal depois precisa ver as duas datas lado a lado. Esconder o que já foi marcado faria a tela
 * parecer ter perdido o agendamento.
 *
 * UMA LINHA POR ETAPA: marcar de novo na MESMA etapa é REMARCAR (a rota é a mesma), e o campo abre
 * já preenchido com o que está valendo. Marcar noutra etapa acrescenta, não substitui.
 *
 * SEM CONFIRMAÇÃO EM DIÁLOGO, ao contrário dos gestos vizinhos deste modal, e a diferença é real:
 * mover, aprovar e desvincular mudam o ESTADO da pessoa no processo (e o desvínculo não se desfaz);
 * marcar entrevista escreve uma DATA que o mesmo controle reescreve no clique seguinte, sem mover
 * ninguém no funil e sem consumir posição nenhuma.
 *
 * §A.11 (sem travessão), §A.24 (title case em título e tag; botão é ação, escrita normal).
 * §A.6: o que trafega é id de candidatura, código de etapa e um instante. Nenhum dado pessoal.
 */

import { useEffect, useState } from "react";
import type { AsCandidaturaItem, CandidaturaEtapa } from "@ea/shared-types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusPill } from "@/components/ui/StatusPill";
import { dataHoraBr, mensagemDoErro } from "@/lib/as-candidatos";
import { rotuloDaEtapa, tomDaEtapa, useEtapas } from "@/lib/as-etapas";
import {
  campoDoInstante,
  entrevistaDaEtapa,
  entrevistasEmOrdem,
  etapaAceitaEntrevista,
  instanteDoCampo,
  marcarEntrevista,
  useEntrevistas,
  useEtapasComEntrevista,
} from "@/lib/as-entrevistas";

export function EntrevistaDaCandidatura({
  candidatura,
  token,
  desabilitado = false,
}: {
  candidatura: AsCandidaturaItem;
  token: string | null;
  desabilitado?: boolean;
}) {
  const { etapas } = useEtapas();
  const { codigos } = useEtapasComEntrevista();
  const { entrevistas, erro: erroLeitura, substituir } = useEntrevistas(candidatura.id, token);

  const [quando, setQuando] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const oferece = etapaAceitaEntrevista(candidatura.etapa, codigos);
  const jaMarcada = entrevistaDaEtapa(entrevistas, candidatura.etapa);

  /*
   * O CAMPO NASCE COM O QUE ESTÁ VALENDO. Sem isto, "Remarcar" abriria em branco e o consultor
   * teria de redigitar o dia inteiro para mudar a hora, que é o caso mais comum do remarcar.
   * O efeito segue a entrevista da etapa ATUAL: mover a pessoa de etapa troca o alvo do campo.
   */
  useEffect(() => {
    setQuando(campoDoInstante(jaMarcada?.agendadaEm));
    setErro(null);
  }, [jaMarcada?.id, jaMarcada?.agendadaEm]);

  const marcadas = entrevistasEmOrdem(entrevistas);
  if (!oferece && marcadas.length === 0) return null;

  const instante = instanteDoCampo(quando);

  async function salvar() {
    if (!instante) return;
    setErro(null);
    setSalvando(true);
    try {
      // A ROTA DEVOLVE A LISTA INTEIRA da candidatura, e é ela que substitui o estado: uma segunda
      // leitura só para redesenhar o que já voltou seria uma viagem a mais por marcação.
      substituir(
        await marcarEntrevista(
          candidatura.id,
          { etapa: candidatura.etapa as CandidaturaEtapa, agendadaEm: instante },
          token,
        ),
      );
    } catch (err) {
      setErro(mensagemDoErro(err, "Falha ao marcar a entrevista."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mb-5 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-text">Entrevista</h3>

      {marcadas.length > 0 && (
        <ul className="mb-2.5 flex flex-col gap-1.5">
          {marcadas.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-[12.5px]"
            >
              <StatusPill tone={tomDaEtapa(e.etapa, etapas)} label={rotuloDaEtapa(e.etapa, etapas)} />
              <span className="font-semibold tabular-nums text-text">
                {dataHoraBr(e.agendadaEm)}
              </span>
              {e.agendadaPorNome && (
                <span className="text-faint">marcada por {e.agendadaPorNome}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {oferece ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] text-dim">
              {jaMarcada
                ? `Nova data e horário da entrevista em ${rotuloDaEtapa(candidatura.etapa, etapas)}`
                : `Data e horário da entrevista em ${rotuloDaEtapa(candidatura.etapa, etapas)}`}
            </span>
            {/* O CONTROLE DE DATA E HORA DO NAVEGADOR É PERMITIDO (§A.35 recorta o `<select>` cru,
                que abre o menu do sistema operacional; `datetime-local` é controle de entrada, com
                comportamento próprio, e é o mesmo tratamento que `type="date"` já tem no sistema).
                UM CAMPO SÓ, e não um de data e um de hora, pela mesma razão do servidor: dois
                campos admitem hora sem dia, que é estado impossível. */}
            <input
              type="datetime-local"
              className="ds-input w-full sm:w-[280px]"
              value={quando}
              disabled={desabilitado || salvando}
              onChange={(ev) => setQuando(ev.target.value)}
              aria-label="Data e horário da entrevista"
            />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              className="px-4 py-2.5"
              disabled={desabilitado || salvando || instante === null}
              onClick={() => void salvar()}
            >
              <Icon name="check" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
              {salvando
                ? "Salvando…"
                : jaMarcada
                  ? "Remarcar entrevista"
                  : "Marcar entrevista"}
            </Button>
            <span className="text-[11.5px] text-faint">
              {/* DATA PASSADA É ACEITA, e dizer isso evita o consultor inventar uma data futura
                  para conseguir salvar: registrar hoje a entrevista de ontem é caso normal. */}
              Registrar uma entrevista que já aconteceu é permitido. Marcar de novo nesta etapa
              substitui a data anterior.
            </span>
          </div>
        </div>
      ) : (
        <p className="text-[12px] text-faint">
          A etapa atual não tem entrevista. O controle aparece nas etapas marcadas com entrevista na
          tela de Etapas Do Funil.
        </p>
      )}

      {(erro ?? erroLeitura) && (
        <p className="mt-2 text-[12px] text-danger" role="alert">
          {erro ?? erroLeitura}
        </p>
      )}
    </section>
  );
}
