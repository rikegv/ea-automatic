"use client";

import { useCallback, useEffect, useState } from "react";
import type { AsMotivoDescarte } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE DESCARTE, DO LADO DA TELA (Frente A, ponto 7) ───────────────────────
 *
 * ┌─ POR QUE ESTE MÓDULO EXISTE, E ELE NASCE CONSERTANDO UM ERRO DE RUNTIME ────────────────────┐
 * │ O backend passou a CONFERIR o motivo da saída contra `motivos_descarte`                      │
 * │ (`CandidatosService.exigirMotivoDoCatalogo`), e a tela continuava mandando TEXTO LIVRE: todo  │
 * │ descarte voltava 400 ("Motivo de saída inválido. Escolha um motivo da lista."). O seletor é   │
 * │ o que fecha essa fresta, e ele precisa de uma fonte só para a lista.                          │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A LEITURA É A ROTA ABERTA (`GET /as/motivos-descarte`), que devolve **só os ativos** e é
 * autorizada a qualquer autenticado de propósito: quem descarta candidato é o consultor COMUM.
 *
 * A ROTA DE ADMINISTRAÇÃO (`/admin/as/motivos-descarte`) É OUTRA, E QUEM A GUARDA É O MENU, NÃO O
 * PAPEL (decisão do diretor, 26/09/2026): ela deixou de ser `@Roles("SUPER_ADMIN")` e passou a
 * exigir o menu `as-motivos-descarte`, marcado usuário a usuário pelo diretor, inclusive para o
 * MASTER. O time inteiro USA os motivos por aqui; só quem ele liberar EDITA o catálogo.
 *
 * LER PELA ROTA DE ADMINISTRAÇÃO AQUI CONTINUA SENDO ERRADO, e a razão só mudou de nome: antes daria
 * 403 por papel, agora dá por menu, e nos dois casos o 403 cairia exatamente sobre quem precisa do
 * seletor para trabalhar.
 *
 * O QUE VAI NO CORPO DA SAÍDA É O **NOME**, e não o id: é o nome que o backend compara e é o nome
 * que fica gravado na candidatura (mesmo desenho do motivo de cancelamento da vaga). Por isso o
 * `value` das opções é o nome, e não a chave da tabela.
 *
 * SEM MEMOIZAÇÃO POR CARGA DE PÁGINA, ao contrário de `as-etapas`/`as-status-vaga`, e a diferença é
 * o ciclo de vida: aquelas listas são desenhadas em toda linha de toda tabela, e esta só é lida
 * quando alguém ABRE o campo de motivo de um desvínculo. Guardar em módulo faria o motivo que o
 * diretor acabou de cadastrar só aparecer depois de um F5, em troca de uma requisição de dez linhas.
 *
 * §A.6: nomes de motivo e um flag. Nenhum dado pessoal entra ou sai daqui.
 */
export function listarMotivosDescarteAtivos(token: string | null): Promise<AsMotivoDescarte[]> {
  return apiFetch<AsMotivoDescarte[]>("/as/motivos-descarte", { token });
}

/**
 * O CATÁLOGO PARA UM CAMPO DE MOTIVO, carregado SÓ QUANDO ELE É NECESSÁRIO.
 *
 * `ativo` é a pergunta "este campo é seletor de catálogo agora?", e quem responde é
 * `motivoVemDoCatalogo` do vocabulário compartilhado, nunca uma comparação escrita na tela. Com
 * `false` nada é pedido: um desfecho que escreve prosa (desistência, envio para a admissão) não tem
 * por que consultar catálogo nenhum.
 *
 * `erro` É DEVOLVIDO, e não engolido: sem a lista o consultor não tem o que escolher, e um seletor
 * vazio sem explicação é o beco que esta frente existe para não criar.
 */
export function useMotivosDescarte(token: string | null, ativo: boolean) {
  const [motivos, setMotivos] = useState<AsMotivoDescarte[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    setCarregando(true);
    setErro(null);
    try {
      setMotivos(await listarMotivosDescarteAtivos(token));
    } catch (e) {
      setErro(
        e instanceof ApiError ? e.message : "Falha ao carregar os motivos de descarte.",
      );
    } finally {
      setCarregando(false);
    }
  }, [token, ativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { motivos, carregando, erro };
}
