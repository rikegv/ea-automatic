import {
  BadRequestException,
  Controller,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from "@nestjs/common";
import type { AsAgendaDia, AsAgendaHorario } from "@ea/shared-types";
import { AgendaEntrevistasService } from "./agenda-entrevistas.service";

/**
 * ─ AGENDA DE ENTREVISTAS (A&S, Central das Vagas) ───────────────────────────────────────────────
 *
 * SEM `@Roles`, no mesmo padrão já declarado para `VagasController`: quem restringe é o MENU. A
 * controller inteira é reivindicada pelo menu `as-agenda-entrevistas` em `domain/menus.ts`, e o
 * `MenuGuard` barra quem não o tem, inclusive por `curl`. "Sem `@Roles`" não é "sem guarda": é o
 * menu que guarda. O `MenuGuard` é FAIL-OPEN para operação não-reivindicada, por isso a reivindicação
 * do menu é obrigatória e não opcional.
 *
 * LEITURA PURA. Dois passos de navegação, duas rotas: o MÊS (só contagem por dia, sem PII) e o DIA
 * (os horários com as pessoas e a vaga de cada uma, que é onde a tela mostra o nome).
 */
@Controller("as/agenda-entrevistas")
export class AgendaEntrevistasController {
  constructor(private readonly agenda: AgendaEntrevistasService) {}

  @Get("mes")
  mes(
    @Query("consultorId", ParseUUIDPipe) consultorId: string,
    @Query("ano", ParseIntPipe) ano: number,
    @Query("mes", ParseIntPipe) mes: number,
  ): Promise<AsAgendaDia[]> {
    if (mes < 1 || mes > 12) throw new BadRequestException("Mês fora da faixa 1 a 12.");
    if (ano < 2000 || ano > 2100) throw new BadRequestException("Ano fora da faixa.");
    return this.agenda.agendaDoMes(consultorId, ano, mes);
  }

  @Get("dia")
  dia(
    @Query("consultorId", ParseUUIDPipe) consultorId: string,
    @Query("data") data: string,
  ): Promise<AsAgendaHorario[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? "")) {
      throw new BadRequestException("Data deve estar no formato AAAA-MM-DD.");
    }
    return this.agenda.diaDoConsultor(consultorId, data);
  }
}
