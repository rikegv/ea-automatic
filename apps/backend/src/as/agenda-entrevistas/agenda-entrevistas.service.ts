import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { AsAgendaDia, AsAgendaHorario, AsAgendaPessoa } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import {
  asCandidaturaEntrevistas,
  asCandidaturas,
  asCandidatos,
  usuarios,
  vagas,
} from "../../db/schema";

/**
 * ─ A AGENDA DE ENTREVISTAS, POR CONSULTOR (OST da Central das Vagas, livro) ──────────────────────
 *
 * LEITURA PURA sobre `as_candidatura_entrevistas`. O consultor da agenda é `consultor_id` (quem a
 * entrevista é PARA, escolhido no agendamento), e o rastreio de QUEM ATRIBUIU é `agendada_por_id`.
 * Só linhas com `agendada_em` existem, então "só agendados aparecem" sai da própria fonte, sem
 * filtro de status a mais.
 *
 * O FUSO É O DA OPERAÇÃO (`America/Sao_Paulo`), e o agrupamento por DIA e por HORÁRIO é feito nele:
 * um instante gravado perto da meia-noite cai no dia certo de quem lê, e não no dia UTC. A janela de
 * consulta é calculada no mesmo fuso, e a formatação de dia/horário usa `Intl`, que é robusto a
 * qualquer mudança futura de regra de horário.
 */
const FUSO = "America/Sao_Paulo";

/** O dia civil (YYYY-MM-DD) de um instante, no fuso da operação. */
const diaNoFuso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** O horário (HH:MM, 24h) de um instante, no fuso da operação. */
const horaNoFuso = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/**
 * O início do dia civil `ano-mes-dia` do fuso, como instante UTC. `America/Sao_Paulo` é UTC-3 fixo
 * (o Brasil encerrou o horário de verão em 2019), então a meia-noite local é 03:00 UTC. A leitura e
 * a formatação continuam passando por `Intl`, que corrige sozinho se a regra mudar; só a janela de
 * consulta usa o deslocamento, e um dia inteiro de folga em cada ponta a tornaria imune de todo modo.
 */
function inicioDoDiaUtc(ano: number, mes1a12: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes1a12 - 1, dia, 3, 0, 0));
}

@Injectable()
export class AgendaEntrevistasService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * OS DIAS COM ENTREVISTA no mês pedido, para aquele consultor, com a contagem de PESSOAS por dia.
   * Sem nome de ninguém (§A.6): o mês é só a bolinha. A janela cobre o mês civil do fuso, e o
   * agrupamento final confere o dia por `Intl` para não deixar escapar nada na borda.
   */
  async agendaDoMes(consultorId: string, ano: number, mes1a12: number): Promise<AsAgendaDia[]> {
    const inicio = inicioDoDiaUtc(ano, mes1a12, 1);
    const fim = inicioDoDiaUtc(mes1a12 === 12 ? ano + 1 : ano, mes1a12 === 12 ? 1 : mes1a12 + 1, 1);

    const linhas = await this.db
      .select({ agendadaEm: asCandidaturaEntrevistas.agendadaEm })
      .from(asCandidaturaEntrevistas)
      .where(
        and(
          eq(asCandidaturaEntrevistas.consultorId, consultorId),
          gte(asCandidaturaEntrevistas.agendadaEm, inicio),
          lt(asCandidaturaEntrevistas.agendadaEm, fim),
        ),
      );

    const prefixo = `${ano}-${String(mes1a12).padStart(2, "0")}`;
    const porDia = new Map<string, number>();
    for (const l of linhas) {
      const dia = diaNoFuso.format(l.agendadaEm);
      if (!dia.startsWith(prefixo)) continue; // guarda da borda do fuso
      porDia.set(dia, (porDia.get(dia) ?? 0) + 1);
    }

    return [...porDia.entries()]
      .map(([data, pessoas]) => ({ data, pessoas }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }

  /**
   * OS HORÁRIOS de um dia, para aquele consultor, cada um com as PESSOAS daquele horário, a vaga de
   * cada uma e o RASTREIO de quem atribuiu. Aqui, e só aqui, o nome do candidato viaja (§A.6): é a
   * página que a tela mostra. O atalho "abrir o candidato" precisa do `candidatoId`, por isso ele
   * vem junto.
   */
  async diaDoConsultor(consultorId: string, dataIso: string): Promise<AsAgendaHorario[]> {
    const [ano, mes, dia] = dataIso.split("-").map((n) => Number(n));
    const inicio = inicioDoDiaUtc(ano, mes, dia);
    const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);

    const linhas = await this.db
      .select({
        agendadaEm: asCandidaturaEntrevistas.agendadaEm,
        atribuidoEm: asCandidaturaEntrevistas.atualizadoEm,
        atribuidoPorNome: usuarios.nome,
        candidaturaId: asCandidaturas.id,
        candidatoId: asCandidatos.id,
        candidatoNome: asCandidatos.nome,
        vagaId: vagas.id,
        vagaNome: vagas.nomeDivulgacao,
        vagaCodigo: vagas.codigo,
      })
      .from(asCandidaturaEntrevistas)
      .innerJoin(asCandidaturas, eq(asCandidaturas.id, asCandidaturaEntrevistas.candidaturaId))
      .innerJoin(asCandidatos, eq(asCandidatos.id, asCandidaturas.candidatoId))
      .innerJoin(vagas, eq(vagas.id, asCandidaturas.vagaId))
      .leftJoin(usuarios, eq(usuarios.id, asCandidaturaEntrevistas.agendadaPorId))
      .where(
        and(
          eq(asCandidaturaEntrevistas.consultorId, consultorId),
          gte(asCandidaturaEntrevistas.agendadaEm, inicio),
          lt(asCandidaturaEntrevistas.agendadaEm, fim),
        ),
      )
      .orderBy(asc(asCandidaturaEntrevistas.agendadaEm), asc(asCandidatos.nome));

    const porHorario = new Map<string, AsAgendaHorario>();
    for (const l of linhas) {
      const instante = l.agendadaEm.toISOString();
      let horario = porHorario.get(instante);
      if (!horario) {
        horario = { instante, hora: horaNoFuso.format(l.agendadaEm), pessoas: [] };
        porHorario.set(instante, horario);
      }
      const pessoa: AsAgendaPessoa = {
        candidaturaId: l.candidaturaId,
        candidatoId: l.candidatoId,
        candidatoNome: l.candidatoNome,
        vagaId: l.vagaId,
        // A vaga pode ter nome/código ainda não preenchidos (espelho do Pandapé); a tela mostra o
        // que houver, e o vazio vira "não informado" lá, nunca travessão (§A.11).
        vagaNome: l.vagaNome ?? "",
        vagaCodigo: l.vagaCodigo ?? "",
        atribuidoPorNome: l.atribuidoPorNome,
        atribuidoEm: l.atribuidoEm.toISOString(),
      };
      horario.pessoas.push(pessoa);
    }

    return [...porHorario.values()].sort((a, b) => a.instante.localeCompare(b.instante));
  }
}
