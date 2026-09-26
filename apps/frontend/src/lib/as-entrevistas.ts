"use client";

/**
 * ─ A ENTREVISTA MARCADA, DO LADO DA TELA (Frente E, ponto 8) ───────────────────────────────────
 *
 * ┌─ QUAIS ETAPAS OFERECEM O CONTROLE VEM DO CATÁLOGO, E NUNCA DE UM LITERAL ───────────────────┐
 * │ A lista é `GET /as/etapas/com-entrevista`, que devolve os CÓDIGOS marcados                   │
 * │ `as_etapas_funil.tem_entrevista`. A tela NÃO compara com `"ENTREVISTA_SOULAN"` nem com       │
 * │ rótulo: o catálogo é do diretor, que renomeia e acrescenta etapa sem deploy, e uma           │
 * │ comparação por nome pararia de funcionar em silêncio na primeira correção de grafia.         │
 * │ O mesmo desenho do `pedePretensao` dos motivos de descarte e do `entrega_ao_cliente`.        │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MARCAR E REMARCAR SÃO A MESMA CHAMADA, como no servidor: é o mesmo fato dito uma ou duas vezes
 * ("a entrevista desta pessoa, nesta etapa, é neste dia e nesta hora"). A rota devolve a LISTA
 * INTEIRA da candidatura, então a tela redesenha com o que voltou, sem uma segunda leitura.
 *
 * `agendadaEm` É UM INSTANTE (ISO com fuso), e o campo da tela é um `datetime-local`, que fala
 * "YYYY-MM-DDTHH:mm" no fuso de quem digita. As duas conversões moram aqui, juntas, porque elas são
 * inversas uma da outra e separá-las é como um lado passa a truncar segundo e o outro não.
 *
 * §A.6: id de candidatura, código de etapa, um instante e o nome de quem MARCOU (usuário interno).
 * Nenhum dado pessoal de candidato passa por este módulo.
 */

import { useCallback, useEffect, useState } from "react";
import type { AsCandidaturaEntrevista, CandidaturaEtapa } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";

// ── AS CHAMADAS ─────────────────────────────────────────────────────────────

export function listarEntrevistas(
  candidaturaId: string,
  token: string | null,
): Promise<AsCandidaturaEntrevista[]> {
  return apiFetch<AsCandidaturaEntrevista[]>(
    `/as/candidatos/candidaturas/${candidaturaId}/entrevistas`,
    { token },
  );
}

/** Marca OU remarca: uma rota para os dois gestos, e ela devolve a lista inteira de volta. */
export function marcarEntrevista(
  candidaturaId: string,
  entrevista: { etapa: CandidaturaEtapa; agendadaEm: string },
  token: string | null,
): Promise<AsCandidaturaEntrevista[]> {
  return apiFetch<AsCandidaturaEntrevista[]>(
    `/as/candidatos/candidaturas/${candidaturaId}/entrevista`,
    { method: "POST", token, body: entrevista },
  );
}

// ── AS RÉGUAS PURAS: testáveis sem rede ─────────────────────────────────────

/**
 * ESTA ETAPA OFERECE O CONTROLE DE ENTREVISTA?
 *
 * A PERGUNTA TEM NOME PRÓPRIO porque ela é feita em dois lugares (mostrar a seção e travar o
 * salvamento), e `codigos.includes(...)` espalhado seria a mesma régua escrita duas vezes. Com a
 * lista VAZIA a resposta é NÃO, e isso é o comportamento certo para os dois casos em que ela chega
 * vazia: o diretor não marcou nenhuma etapa, ou a leitura falhou. Nos dois, oferecer um campo que o
 * servidor vai recusar gasta o clique e ensina o consultor a ignorar a tela.
 */
export function etapaAceitaEntrevista(
  codigo: string | null | undefined,
  codigosComEntrevista: readonly string[],
): boolean {
  if (!codigo) return false;
  return codigosComEntrevista.includes(codigo);
}

/** A entrevista JÁ MARCADA naquela etapa, se houver. É ela que faz "Marcar" virar "Remarcar". */
export function entrevistaDaEtapa(
  entrevistas: readonly AsCandidaturaEntrevista[],
  etapa: string | null | undefined,
): AsCandidaturaEntrevista | null {
  if (!etapa) return null;
  return entrevistas.find((e) => e.etapa === etapa) ?? null;
}

/** As entrevistas na ordem da agenda, da mais próxima para a mais distante. */
export function entrevistasEmOrdem(
  entrevistas: readonly AsCandidaturaEntrevista[],
): AsCandidaturaEntrevista[] {
  return [...entrevistas].sort((a, b) => a.agendadaEm.localeCompare(b.agendadaEm));
}

/**
 * O CAMPO DA TELA VIRA INSTANTE. "2026-09-26T14:30" (no fuso de quem digita) vira ISO com fuso, que
 * é o que o `@IsISO8601` do servidor espera e o que a coluna guarda.
 *
 * VAZIO DEVOLVE NULO, e quem chama não envia: um campo em branco não é um instante, e mandar
 * `Invalid Date` ao servidor daria um 400 que a tela poderia ter evitado sem gastar a viagem.
 */
export function instanteDoCampo(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * O INSTANTE VIRA O CAMPO DA TELA, no fuso de quem lê: é a inversa da função acima, e é ela que faz
 * "Remarcar" abrir já preenchido com o que está valendo, em vez de em branco.
 */
export function campoDoInstante(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ── O CATÁLOGO DAS ETAPAS COM ENTREVISTA ────────────────────────────────────

let emVoo: Promise<string[]> | null = null;

/**
 * A LISTA DE CÓDIGOS, MEMOIZADA POR CARGA DE PÁGINA, no mesmo desenho de `carregarEtapas`: o que se
 * guarda é a PROMESSA, então N modais montando ao mesmo tempo dividem UMA requisição.
 *
 * A FALHA NÃO FICA GRUDADA: no erro a memória morre, senão a primeira requisição que caísse
 * (sessão renovando) condenaria a página a nunca mais oferecer o controle até alguém recarregar.
 */
export function carregarEtapasComEntrevista(): Promise<string[]> {
  if (!emVoo) {
    emVoo = apiFetch<string[]>("/as/etapas/com-entrevista").catch((e) => {
      emVoo = null;
      throw e;
    });
  }
  return emVoo;
}

/** Depois de escrever no catálogo de etapas, a memória tem de morrer. */
export function invalidarEtapasComEntrevista(): void {
  emVoo = null;
}

export interface EtapasComEntrevista {
  codigos: string[];
  carregando: boolean;
  erro: string | null;
}

export function useEtapasComEntrevista(): EtapasComEntrevista {
  const [codigos, setCodigos] = useState<string[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    carregarEtapasComEntrevista()
      .then((lista) => {
        if (vivo) setCodigos(lista);
      })
      .catch(() => {
        // A TELA NÃO MORRE POR FALTA DESTE CATÁLOGO: sem a lista, o controle de entrevista
        // simplesmente não é oferecido, e o resto do modal continua servindo.
        if (vivo) setErro("Não foi possível carregar quais etapas têm entrevista.");
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  return { codigos, carregando, erro };
}

// ── O ESTADO DAS ENTREVISTAS DE UMA CANDIDATURA ─────────────────────────────

export interface EstadoDasEntrevistas {
  entrevistas: AsCandidaturaEntrevista[];
  carregando: boolean;
  erro: string | null;
  /** Troca a lista inteira pela que a gravação devolveu. Ver o cabeçalho deste módulo. */
  substituir: (lista: AsCandidaturaEntrevista[]) => void;
}

export function useEntrevistas(
  candidaturaId: string,
  token: string | null,
  ativo = true,
): EstadoDasEntrevistas {
  const [entrevistas, setEntrevistas] = useState<AsCandidaturaEntrevista[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    setCarregando(true);
    setErro(null);
    try {
      setEntrevistas(await listarEntrevistas(candidaturaId, token));
    } catch (e) {
      setErro(
        e instanceof ApiError ? e.message : "Não foi possível carregar as entrevistas marcadas.",
      );
    } finally {
      setCarregando(false);
    }
  }, [candidaturaId, token, ativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { entrevistas, carregando, erro, substituir: setEntrevistas };
}
