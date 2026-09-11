/**
 * ─ AS CIDADES DO IBGE, CARREGADAS POR ESTADO (Onda C, peça 2) ─────────────────────────────────
 *
 * ┌─ POR QUE POR ESTADO, E NÃO TUDO DE UMA VEZ ────────────────────────────────────────────────┐
 * │ São 5.570 municípios. Baixar a lista inteira para preencher um campo é meio megabyte de     │
 * │ JSON em toda abertura de vaga, e a esmagadora maioria dela é de estados que aquela vaga     │
 * │ nunca vai citar. Carregando por UF, o maior estado (Minas Gerais, 853) é uma fração disso,  │
 * │ e a requisição só acontece quando alguém de fato escolheu o estado.                          │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A MEMÓRIA É POR UF, e ela importa mais do que parece: trocar o estado ida e volta no formulário
 * (que é o gesto de quem está conferindo) não pode custar uma requisição a cada troca. O que se
 * guarda é a PROMESSA, então dois campos pedindo o mesmo estado ao mesmo tempo dividem uma ida.
 *
 * A TELA NÃO FALA COM O IBGE. A base é carregada UMA vez por um seed no banco (decisão do diretor),
 * e esta rota lê do banco: se o serviço do IBGE estiver fora do ar, a abertura de vaga continua
 * funcionando. Chamar o IBGE em tempo de request seria pendurar o cadastro de vaga num serviço de
 * terceiro.
 *
 * §A.6: município não é dado pessoal, e nenhum identificador de pessoa entra aqui.
 * §A.11 (sem travessão), §A.24 (nome de cidade vem do IBGE, escrito como ele escreve).
 */

import { useEffect, useState } from "react";
import type { AsCidade } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/** A rota declarada em um lugar só, pelo mesmo motivo do catálogo de linhas de serviço. */
export function rotaDasCidades(uf: string): string {
  return `/as/cidades?uf=${encodeURIComponent(uf)}`;
}

const porUf = new Map<string, Promise<AsCidade[]>>();

export function carregarCidades(uf: string, token?: string | null): Promise<AsCidade[]> {
  const chave = uf.toUpperCase();
  const memorizada = porUf.get(chave);
  if (memorizada) return memorizada;
  const promessa = apiFetch<AsCidade[]>(rotaDasCidades(chave), { token }).catch((e) => {
    // A falha não fica grudada: ver o mesmo cuidado em `as-etapas` e `as-linhas-servico`.
    porUf.delete(chave);
    throw e;
  });
  porUf.set(chave, promessa);
  return promessa;
}

/** Usado pelos testes e por quem precise forçar releitura. Não é chamado pela abertura de vaga. */
export function invalidarCidades(): void {
  porUf.clear();
}

export interface CidadesDaUf {
  cidades: AsCidade[];
  carregando: boolean;
  erro: string | null;
}

/**
 * AS CIDADES DO ESTADO ESCOLHIDO. UF vazia devolve lista vazia SEM requisição nenhuma: antes de
 * escolher o estado não há o que perguntar, e disparar uma busca "de aquecimento" seria tráfego
 * para uma resposta que ninguém pediu.
 *
 * A CORRIDA É TRATADA, e ela é real: trocar de estado duas vezes rápido dispara duas buscas, e a
 * primeira pode voltar depois da segunda. Sem a guarda, o campo do estado novo mostraria as cidades
 * do estado antigo, e nada falharia.
 */
export function useCidades(uf: string | null | undefined, token?: string | null): CidadesDaUf {
  const [cidades, setCidades] = useState<AsCidade[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!uf) {
      setCidades([]);
      setCarregando(false);
      setErro(null);
      return;
    }
    let valeAinda = true;
    setCarregando(true);
    setErro(null);
    carregarCidades(uf, token)
      .then((lista) => {
        if (!valeAinda) return;
        setCidades(lista);
      })
      .catch(() => {
        if (!valeAinda) return;
        setCidades([]);
        setErro("Não foi possível carregar as cidades deste estado.");
      })
      .finally(() => {
        if (valeAinda) setCarregando(false);
      });
    return () => {
      valeAinda = false;
    };
  }, [uf, token]);

  return { cidades, carregando, erro };
}
