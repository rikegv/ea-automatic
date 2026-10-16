import { useEffect, useState } from "react";
import type { AsAgendaDia, AsAgendaHorario } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";
import { carregarConsultores } from "@/lib/as-vaga-edicao";

export type { AsAgendaDia, AsAgendaHorario, AsAgendaPessoa } from "@ea/shared-types";

/**
 * ─ A LEITURA DA AGENDA DE ENTREVISTAS (OST da Central das Vagas, livro) ──────────────────────────
 *
 * DUAS CHAMADAS, UMA POR PÁGINA DO LIVRO: o MÊS (só a contagem por dia, a bolinha) e o DIA (os
 * horários com as pessoas, que é quando o nome entra, §A.6). A agenda é sempre a de UM consultor.
 */
export function carregarAgendaDoMes(
  consultorId: string,
  ano: number,
  mes: number,
  token: string | null,
): Promise<AsAgendaDia[]> {
  const q = new URLSearchParams({ consultorId, ano: String(ano), mes: String(mes) });
  return apiFetch<AsAgendaDia[]>(`/as/agenda-entrevistas/mes?${q.toString()}`, { token });
}

export function carregarDiaDoConsultor(
  consultorId: string,
  data: string,
  token: string | null,
): Promise<AsAgendaHorario[]> {
  const q = new URLSearchParams({ consultorId, data });
  return apiFetch<AsAgendaHorario[]>(`/as/agenda-entrevistas/dia?${q.toString()}`, { token });
}

export interface ConsultorDaAgenda {
  id: string;
  nome: string;
}

/**
 * A LISTA DE CONSULTORES da página 1 e do campo "Consultor da entrevista" (complemento): a MESMA do
 * seletor de transferência de responsável (`GET /as/vagas/consultores`, os usuários ativos com papel
 * de consultor de A&S). Reaproveita o catálogo que já existe, não cria um segundo.
 */
export function useConsultoresDaAgenda(token: string | null): {
  consultores: ConsultorDaAgenda[];
  carregando: boolean;
  erro: string | null;
} {
  const [consultores, setConsultores] = useState<ConsultorDaAgenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    carregarConsultores(token)
      .then((lista) => {
        if (vivo) setConsultores(lista);
      })
      .catch(() => {
        if (vivo) setErro("Não foi possível carregar a lista de consultores.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  return { consultores, carregando, erro };
}
