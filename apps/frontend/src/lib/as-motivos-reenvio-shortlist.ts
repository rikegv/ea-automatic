"use client";

import { useCallback, useEffect, useState } from "react";
import type { AsMotivoReenvioShortlist } from "@ea/shared-types";
import { apiFetch, ApiError } from "@/lib/api";

/**
 * ─ O CATÁLOGO DE MOTIVOS DE REENVIO DA SHORTLIST, DO LADO DA TELA (decisão do diretor) ─────────
 *
 * ┌─ POR QUE O CAMPO DEIXOU DE SER TEXTO LIVRE ─────────────────────────────────────────────────┐
 * │ 1. INDICADOR. O diretor quer contar POR QUE as listas voltam, e frase digitada não conta:    │
 * │    "cliente pediu mais nomes", "Cliente pediu + nomes" e "+ nomes" seriam três linhas de um  │
 * │    relatório que deveriam ser uma.                                                           │
 * │ 2. §A.6. Texto livre pendurado na VAGA não é alcançado por varredura nenhuma (a retenção é   │
 * │    chaveada por candidato), e quem digitasse ali um telefone deixaria esse dado fora do      │
 * │    expurgo. Catálogo resolve por construção: não há onde digitar dado pessoal.               │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MOLDE: `as-motivos-descarte`, letra por letra, e a repetição é deliberada. São DOIS catálogos com
 * DUAS rotas e DOIS ciclos de vida (um classifica por que a PESSOA saiu, o outro por que a LISTA
 * voltou), e colapsá-los num módulo genérico faria um ajuste em um mexer no outro sem ninguém pedir.
 *
 * A LEITURA É A ROTA ABERTA (`GET /as/motivos-reenvio-shortlist`), que devolve **só os ativos** e é
 * autorizada a qualquer autenticado de propósito: quem reenvia a shortlist é o consultor COMUM, e a
 * rota de administração (`/admin/as/motivos-reenvio-shortlist`) é `@Roles("SUPER_ADMIN")`. Ler pela
 * rota de administração aqui daria 403 exatamente para quem precisa do seletor.
 *
 * O QUE VAI NO CORPO DO ENVIO É O **ID**, e não o nome, ao contrário do motivo de descarte: a
 * shortlist guarda a chave (`motivoReenvioId`) e lê o nome por junção, para a contagem sobreviver ao
 * diretor renomear a linha.
 *
 * SEM MEMOIZAÇÃO POR CARGA DE PÁGINA, pelo mesmo motivo do catálogo de descarte: a lista só é lida
 * quando alguém ABRE o formulário de envio, e guardá-la em módulo faria o motivo recém-cadastrado só
 * aparecer depois de um F5, em troca de uma requisição de dez linhas.
 *
 * §A.6: nomes de motivo de processo e um flag. Nenhum dado pessoal entra ou sai daqui.
 */
export function listarMotivosReenvioAtivos(
  token: string | null,
): Promise<AsMotivoReenvioShortlist[]> {
  return apiFetch<AsMotivoReenvioShortlist[]>("/as/motivos-reenvio-shortlist", { token });
}

/**
 * O CATÁLOGO PARA O CAMPO DE MOTIVO DO REENVIO, carregado SÓ QUANDO ELE EXISTE (`ativo`).
 *
 * `ativo` é a pergunta "este envio pede motivo?", e quem responde é `exigeMotivoDeReenvio`, nunca
 * uma comparação escrita na tela. Com `false` nada é pedido: no PRIMEIRO envio o campo nem aparece,
 * porque o servidor RECUSA o motivo ali ("não há envio anterior a justificar").
 *
 * `erro` É DEVOLVIDO, e não engolido: sem a lista o consultor não tem o que escolher, e um seletor
 * vazio sem explicação é o beco que esta frente existe para não criar.
 */
export function useMotivosReenvioShortlist(token: string | null, ativo: boolean) {
  const [motivos, setMotivos] = useState<AsMotivoReenvioShortlist[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!ativo) return;
    setCarregando(true);
    setErro(null);
    try {
      setMotivos(await listarMotivosReenvioAtivos(token));
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao carregar os motivos de reenvio.");
    } finally {
      setCarregando(false);
    }
  }, [token, ativo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { motivos, carregando, erro };
}
