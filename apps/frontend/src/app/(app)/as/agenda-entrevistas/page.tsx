"use client";

/**
 * ─ AGENDA DE ENTREVISTAS (A&S, Central das Vagas): o livro ──────────────────────────────────────
 *
 * UM LIVRO NA HORIZONTAL, página 1 fixa à esquerda (o consultor), página direita virando de 2 (o
 * mês) para 3 (os horários do dia), e um modal menor no fim (as pessoas de um horário). A navegação
 * é de UM consultor por vez (não há visão de todos juntos), e a agenda mostra SÓ quem tem data e
 * horário marcados: a fonte é `as_candidatura_entrevistas`, filtrada pelo CONSULTOR escolhido no
 * agendamento (não por quem agendou, que fica como rastreio).
 *
 * §A.11 (sem travessão), §A.24 (title case nos títulos/tags; o rótulo do mês é descrição, não tag).
 * §A.6: o nome do candidato aparece na tela (função pedida); só a página do dia o traz da rede.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AsAgendaDia, AsAgendaHorario } from "@ea/shared-types";
import { PageHead } from "@/components/ui/PageHead";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { dataHoraBr, mensagemDoErro } from "@/lib/as-candidatos";
import {
  carregarAgendaDoMes,
  carregarDiaDoConsultor,
  useConsultoresDaAgenda,
  type ConsultorDaAgenda,
} from "@/lib/as-agenda-entrevistas";
import { FichaCandidatoModal } from "@/components/as/candidatos/FichaCandidatoModal";
import type { VagaListItem } from "@ea/shared-types";

const DIAS_DA_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** O mês/ano civis. Guardados como números para a navegação não depender de fuso. */
interface MesRef {
  ano: number;
  mes: number; // 1 a 12
}

function mesAtual(): MesRef {
  const agora = new Date();
  return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
}

function mesAnterior(m: MesRef): MesRef {
  return m.mes === 1 ? { ano: m.ano - 1, mes: 12 } : { ano: m.ano, mes: m.mes - 1 };
}

function mesSeguinte(m: MesRef): MesRef {
  return m.mes === 12 ? { ano: m.ano + 1, mes: 1 } : { ano: m.ano, mes: m.mes + 1 };
}

function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

function rotuloDoMes(m: MesRef): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return capitalizar(fmt.format(new Date(Date.UTC(m.ano, m.mes - 1, 1))));
}

function rotuloDoDia(dataIso: string): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  });
  return capitalizar(fmt.format(new Date(`${dataIso}T12:00:00.000Z`)));
}

function diasDoMes(m: MesRef): number {
  return new Date(Date.UTC(m.ano, m.mes, 0)).getUTCDate();
}

function primeiroDiaDaSemana(m: MesRef): number {
  return new Date(Date.UTC(m.ano, m.mes - 1, 1)).getUTCDay();
}

function dataIsoDoDia(m: MesRef, dia: number): string {
  return `${m.ano}-${String(m.mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function frasePessoas(n: number): string {
  return n === 1 ? "1 pessoa" : `${n} pessoas`;
}

export default function AgendaDeEntrevistasPage() {
  const { token } = useAuth();
  const { consultores, carregando: carregandoConsultores, erro: erroConsultores } =
    useConsultoresDaAgenda(token);

  const [busca, setBusca] = useState("");
  const [consultor, setConsultor] = useState<ConsultorDaAgenda | null>(null);
  const [mes, setMes] = useState<MesRef>(mesAtual);
  const [dias, setDias] = useState<AsAgendaDia[]>([]);
  const [carregandoMes, setCarregandoMes] = useState(false);

  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<AsAgendaHorario[]>([]);
  const [carregandoDia, setCarregandoDia] = useState(false);

  const [horarioAberto, setHorarioAberto] = useState<AsAgendaHorario | null>(null);
  const [fichaId, setFichaId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // A AGENDA DO MÊS do consultor escolhido. Recarrega ao trocar de consultor ou de mês.
  useEffect(() => {
    if (!consultor) return;
    let vivo = true;
    setCarregandoMes(true);
    setErro(null);
    carregarAgendaDoMes(consultor.id, mes.ano, mes.mes, token)
      .then((d) => {
        if (vivo) setDias(d);
      })
      .catch((e) => {
        if (vivo) setErro(mensagemDoErro(e, "Falha ao carregar a agenda do mês."));
      })
      .finally(() => {
        if (vivo) setCarregandoMes(false);
      });
    return () => {
      vivo = false;
    };
  }, [consultor, mes, token]);

  // OS HORÁRIOS do dia escolhido. Só busca quando um dia está aberto (página 3).
  useEffect(() => {
    if (!consultor || !diaSel) return;
    let vivo = true;
    setCarregandoDia(true);
    setErro(null);
    carregarDiaDoConsultor(consultor.id, diaSel, token)
      .then((h) => {
        if (vivo) setHorarios(h);
      })
      .catch((e) => {
        if (vivo) setErro(mensagemDoErro(e, "Falha ao carregar os horários do dia."));
      })
      .finally(() => {
        if (vivo) setCarregandoDia(false);
      });
    return () => {
      vivo = false;
    };
  }, [consultor, diaSel, token]);

  const escolherConsultor = useCallback((c: ConsultorDaAgenda) => {
    setConsultor(c);
    setMes(mesAtual());
    setDiaSel(null);
    setHorarios([]);
    setHorarioAberto(null);
  }, []);

  const trocarMes = useCallback((proximo: MesRef) => {
    setMes(proximo);
    setDiaSel(null);
    setHorarios([]);
    setHorarioAberto(null);
  }, []);

  const consultoresFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return consultores;
    return consultores.filter((c) => c.nome.toLowerCase().includes(termo));
  }, [consultores, busca]);

  /** Dia (número) -> total de pessoas, para a bolinha e o destaque das células do mês. */
  const pessoasPorDia = useMemo(() => {
    const mapa = new Map<number, number>();
    for (const d of dias) {
      const dia = Number(d.data.slice(8, 10));
      mapa.set(dia, d.pessoas);
    }
    return mapa;
  }, [dias]);

  return (
    <>
      <PageHead
        eyebrow="Atração e Seleção"
        title="Agenda De Entrevistas"
        subtitle="A agenda de cada consultor, só com quem tem data e horário de entrevista marcados. Escolha um consultor, navegue pelo mês e abra um dia para ver os horários e quem está agendado."
      />

      {erroConsultores && (
        <p className="mb-4 text-[12.5px] text-danger" role="alert">
          {erroConsultores}
        </p>
      )}

      {/* O LIVRO: página 1 (consultor) fixa à esquerda, página direita virando de 2 (mês) para 3
          (horários). Em telas estreitas, as páginas empilham. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
        {/* ─ PÁGINA 1: O CONSULTOR ───────────────────────────────────────────── */}
        <aside className="glass panel w-full shrink-0 p-4 lg:w-[320px]">
          <h2 className="mb-3 text-[13px] font-semibold text-text">Consultores</h2>
          <input
            type="search"
            className="ds-input mb-3 w-full"
            placeholder="Procurar consultor pelo nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Procurar consultor"
          />
          {carregandoConsultores ? (
            <p className="text-[12.5px] text-faint">Carregando a lista de consultores.</p>
          ) : consultoresFiltrados.length === 0 ? (
            <p className="text-[12.5px] text-faint">Nenhum consultor encontrado.</p>
          ) : (
            <ul className="flex max-h-[60vh] flex-col gap-1 overflow-auto">
              {consultoresFiltrados.map((c) => {
                const ativo = consultor?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => escolherConsultor(c)}
                      className={[
                        "w-full rounded-xl px-3 py-2 text-left text-[13px] transition",
                        ativo
                          ? "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-semibold text-text"
                          : "text-dim hover:bg-[var(--surface-2)]",
                      ].join(" ")}
                      aria-pressed={ativo}
                    >
                      {c.nome}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* ─ PÁGINA DIREITA: 2 (mês) OU 3 (horários do dia) ──────────────────── */}
        <section className="glass panel min-h-[420px] w-full flex-1 p-4">
          {!consultor ? (
            <div className="grid h-full min-h-[380px] place-items-center text-center">
              <p className="max-w-sm text-[13px] text-faint">
                Escolha um consultor na lista à esquerda para abrir a agenda dele.
              </p>
            </div>
          ) : erro ? (
            <p className="text-[12.5px] text-danger" role="alert">
              {erro}
            </p>
          ) : diaSel ? (
            <PaginaDoDia
              dia={diaSel}
              consultorNome={consultor.nome}
              horarios={horarios}
              carregando={carregandoDia}
              onVoltar={() => {
                setDiaSel(null);
                setHorarioAberto(null);
              }}
              onAbrirHorario={(h) => setHorarioAberto(h)}
            />
          ) : (
            <PaginaDoMes
              mes={mes}
              consultorNome={consultor.nome}
              pessoasPorDia={pessoasPorDia}
              carregando={carregandoMes}
              onAnterior={() => trocarMes(mesAnterior(mes))}
              onSeguinte={() => trocarMes(mesSeguinte(mes))}
              onAbrirDia={(dia) => setDiaSel(dataIsoDoDia(mes, dia))}
            />
          )}
        </section>
      </div>

      {/* ─ MODAL: AS PESSOAS DE UM HORÁRIO ─────────────────────────────────── */}
      {horarioAberto && (
        <Modal
          onClose={() => setHorarioAberto(null)}
          className="max-w-lg p-5"
          ariaLabel="Pessoas agendadas no horário"
        >
          <h3 className="mb-1 text-[15px] font-semibold text-text">
            Agendados Às {horarioAberto.hora}
          </h3>
          <p className="mb-4 text-[12.5px] text-dim">
            {frasePessoas(horarioAberto.pessoas.length)} neste horário. Clique no nome para abrir o
            candidato.
          </p>
          <ul className="flex flex-col gap-2">
            {horarioAberto.pessoas.map((p) => (
              <li
                key={p.candidaturaId}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => setFichaId(p.candidatoId)}
                  className="text-[13px] font-semibold text-accent hover:underline"
                >
                  {p.candidatoNome}
                </button>
                <p className="mt-0.5 text-[12px] text-dim">
                  {p.vagaNome || "Vaga não informada"}
                  {p.vagaCodigo ? ` (${p.vagaCodigo})` : ""}
                </p>
                <p className="mt-0.5 text-[11.5px] text-faint">
                  {p.atribuidoPorNome
                    ? `Atribuída por ${p.atribuidoPorNome} em ${dataHoraBr(p.atribuidoEm)}`
                    : `Atribuída em ${dataHoraBr(p.atribuidoEm)}`}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" className="px-4 py-2" onClick={() => setHorarioAberto(null)}>
              Fechar
            </Button>
          </div>
        </Modal>
      )}

      {fichaId && (
        <FichaCandidatoModal
          candidatoId={fichaId}
          token={token}
          // A agenda não carrega o descritivo das vagas; o atalho "Ver vaga" dentro da ficha fica
          // desabilitado (ele depende deste mapa), e o resto da ficha abre inteiro.
          vagaPorId={new Map<string, VagaListItem>()}
          onClose={() => setFichaId(null)}
          onMudou={() => {}}
        />
      )}
    </>
  );
}

// ── PÁGINA 2: O MÊS ───────────────────────────────────────────────────────────

function PaginaDoMes({
  mes,
  consultorNome,
  pessoasPorDia,
  carregando,
  onAnterior,
  onSeguinte,
  onAbrirDia,
}: {
  mes: MesRef;
  consultorNome: string;
  pessoasPorDia: Map<number, number>;
  carregando: boolean;
  onAnterior: () => void;
  onSeguinte: () => void;
  onAbrirDia: (dia: number) => void;
}) {
  const total = diasDoMes(mes);
  const offset = primeiroDiaDaSemana(mes);
  const celulas: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Button variant="secondary" className="px-2.5 py-2" onClick={onAnterior} aria-label="Mês anterior">
          <Icon name="left" className="h-4 w-4" />
        </Button>
        <h2 className="text-center text-[15px] font-semibold text-text">{rotuloDoMes(mes)}</h2>
        <Button variant="secondary" className="px-2.5 py-2" onClick={onSeguinte} aria-label="Próximo mês">
          <Icon name="right" className="h-4 w-4" />
        </Button>
      </div>
      <p className="mb-3 text-center text-[12px] text-faint">Agenda de {consultorNome}</p>

      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {DIAS_DA_SEMANA.map((d) => (
          <div key={d} className="py-1 text-center text-[11px] font-semibold text-faint">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {celulas.map((dia, i) => {
          if (dia === null) return <div key={`vazio-${i}`} />;
          const pessoas = pessoasPorDia.get(dia) ?? 0;
          const temAgenda = pessoas > 0;
          return (
            <button
              key={dia}
              type="button"
              disabled={!temAgenda}
              onClick={() => temAgenda && onAbrirDia(dia)}
              className={[
                "relative flex aspect-square flex-col items-center justify-center rounded-xl border text-[13px] transition",
                temAgenda
                  ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-semibold text-text hover:brightness-110"
                  : "border-[var(--border)] text-faint",
              ].join(" ")}
              aria-label={temAgenda ? `Dia ${dia}, ${frasePessoas(pessoas)}` : `Dia ${dia}`}
            >
              <span>{dia}</span>
              {temAgenda && (
                <span className="mt-0.5 inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold leading-5 text-white tabular-nums">
                  {pessoas}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-[11.5px] text-faint">
        {carregando
          ? "Carregando a agenda do mês."
          : "A bolinha mostra o total de pessoas agendadas no dia. Clique num dia para ver os horários."}
      </p>
    </div>
  );
}

// ── PÁGINA 3: OS HORÁRIOS DO DIA ────────────────────────────────────────────────

function PaginaDoDia({
  dia,
  consultorNome,
  horarios,
  carregando,
  onVoltar,
  onAbrirHorario,
}: {
  dia: string;
  consultorNome: string;
  horarios: AsAgendaHorario[];
  carregando: boolean;
  onVoltar: () => void;
  onAbrirHorario: (h: AsAgendaHorario) => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Button variant="secondary" className="px-3 py-2" onClick={onVoltar}>
          <Icon name="left" className="mr-1.5 inline h-3.5 w-3.5 align-middle" />
          Voltar à agenda do mês
        </Button>
      </div>
      <h2 className="text-[15px] font-semibold text-text">{rotuloDoDia(dia)}</h2>
      <p className="mb-4 text-[12px] text-faint">Agenda de {consultorNome}</p>

      {carregando ? (
        <p className="text-[12.5px] text-faint">Carregando os horários.</p>
      ) : horarios.length === 0 ? (
        <p className="text-[12.5px] text-faint">Nenhuma entrevista marcada neste dia.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {horarios.map((h) => (
            <li key={h.instante}>
              <button
                type="button"
                onClick={() => onAbrirHorario(h)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3.5 py-3 text-left transition hover:brightness-110"
              >
                <span className="flex items-center gap-2.5">
                  <Icon name="clock" className="h-4 w-4 text-accent" />
                  <span className="text-[14px] font-semibold tabular-nums text-text">{h.hora}</span>
                </span>
                <span className="text-[12.5px] text-dim">{frasePessoas(h.pessoas.length)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
