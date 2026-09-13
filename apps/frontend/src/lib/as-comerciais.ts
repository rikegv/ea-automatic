"use client";

/**
 * ─ O CATÁLOGO DE COMERCIAIS, DO LADO DA TELA (Onda E, peça 2) ─────────────────────────────────
 *
 * COMERCIAL AQUI É PESSOA: quem do comercial atende aquele cliente. O cliente aponta para um
 * comercial, e a vaga o herda dele.
 *
 * ┌─ ESTA É A PRIMEIRA TABELA DA ONDA COM DADO PESSOAL, e a régua é curta de propósito (§A.6) ──┐
 * │ O que se guarda é O NOME, e mais nada: nem e-mail, nem telefone, nem documento. Minimização  │
 * │ não é cerimônia aqui, é a diferença entre um catálogo de rótulo e um cadastro de pessoa, que │
 * │ é outra coisa e teria outras obrigações.                                                     │
 * │                                                                                              │
 * │ O NOME NÃO ENTRA EM LOG. As mensagens desta tela (que citam o nome para dizer de quem se     │
 * │ trata) são de TELA, para quem já está autenticado e já está olhando a lista inteira; nada    │
 * │ daqui é escrito em log de aplicação.                                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MOLDE DE `as-linhas-servico`, linha a linha, pelo mesmo motivo de lá: funções puras que recebem o
 * catálogo explicitamente, uma promessa memoizada por carga de página, e um gancho em volta dela.
 *
 * §A.11 (sem travessão), §A.24 (o nome vem do diretor já escrito).
 */

import { useCallback, useEffect, useState } from "react";
import type { AsComercial } from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/**
 * O TIPO É O DO `shared-types` (`AsComercial`), escrito lá pelo COORDENADOR, que é o dono único
 * daquele arquivo nesta frente (§A.39). Este módulo o consome e reexporta, para quem importa o
 * catálogo não precisar importar de dois lugares.
 *
 * `rotulo` É O NOME DA PESSOA. O campo se chama `rotulo`, e não `nome`, porque este catálogo é o
 * molde do catálogo de linhas de serviço inteiro, do backend à tela, e um nome de campo diferente
 * aqui obrigaria uma tradução em cada ponto que hoje é cópia.
 */
export type { AsComercial };

/**
 * ─ ESTE CATÁLOGO NÃO TEM ROTA DE LEITURA ABERTA, E A AUSÊNCIA É A DEFESA ───────────────────────
 *
 * ┌─ O QUE A AUDITORIA VETOU, e por que a cópia do molde não servia aqui ──────────────────────┐
 * │ O molde (`as-linhas-servico`, `as-etapas`) publica um `GET /as/<catalogo>` numa controller  │
 * │ que NENHUM menu reivindica, e essa ausência de reivindicação é o que a deixa ABERTA a       │
 * │ qualquer sessão válida. Para "Varejo" e "RPO & BPO" isso é dado de trabalho e está certo.   │
 * │ Para uma lista de NOMES DE PESSOAS, a mesma ausência entrega a folha do time comercial a    │
 * │ qualquer um dos consultores da Admissão com um `curl` (§A.6).                                │
 * │                                                                                             │
 * │ `GET /as/comerciais` NÃO EXISTE, e não é para ser criada. Cada superfície que precisa da    │
 * │ lista lê por uma porta que JÁ é governada por quem tem direito a ela.                       │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O NOME DO PARÂMETRO PRECISA BATER COM O DO BACKEND, E O ERRO AQUI É SILENCIOSO ───────────┐
 * │ O molde usa `incluirInativas`, no feminino, porque lá o substantivo é "linha" e "etapa".    │
 * │ Aqui é `incluirInativos`, no masculino. Errando o nome, o backend NÃO devolve erro: ele     │
 * │ ignora o parâmetro desconhecido e manda só os ATIVOS, e a tela passa a mostrar vazio no     │
 * │ lugar do comercial que saiu da empresa, sem nada falhar e sem ninguém notar.                │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */

/**
 * A LEITURA DO GERENCIADOR, de SUPER_ADMIN: é a MESMA rota da escrita, e é assim de propósito.
 * Quem administra o catálogo já é quem pode vê-lo inteiro, então não há uma segunda porta.
 */
export const ROTA_LEITURA_GERENCIADOR = "/admin/as/comerciais?incluirInativos=1";

/**
 * A LEITURA DO SELETOR DA TELA DE CLIENTES, governada pelo menu `clientes`.
 *
 * O HANDLER MORA NA `ClientesController`, e não numa controller de catálogo, porque é a
 * reivindicação de menu dela que faz a lista de nomes ser vista só por quem administra cliente. Sair
 * daqui para uma controller de catálogo devolveria exatamente a porta aberta que a auditoria vetou.
 */
export const ROTA_LEITURA_CLIENTES = "/admin/clientes/comerciais?incluirInativos=1";

/** A ESCRITA, de SUPER_ADMIN, na camada `/admin` como todo catálogo gerenciável. */
export const ROTA_ADMIN = "/admin/as/comerciais";

/** NA ORDEM DO DIRETOR, e o desempate é o id: dois comerciais com a mesma ordem não podem dançar. */
export function comerciaisOrdenados(catalogo: readonly AsComercial[]): AsComercial[] {
  return [...catalogo].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

/** Só os que podem ser ESCOLHIDOS num cliente. */
export function comerciaisAtivos(catalogo: readonly AsComercial[]): AsComercial[] {
  return comerciaisOrdenados(catalogo).filter((c) => c.ativo);
}

/**
 * O NOME PELO ID DO CATÁLOGO, que é como o CLIENTE guarda o comercial.
 *
 * A QUEDA É PARA NULO, e não para o número: "12" não diz nada a quem lê a ficha, e a célula tem uma
 * resposta melhor para a ausência, que é o "não informado" (§A.11) que ela já escreve.
 */
export function nomeDoComercialPorId(
  id: number | string | null | undefined,
  catalogo: readonly AsComercial[],
): string | null {
  if (id === null || id === undefined || String(id).trim() === "") return null;
  const alvo = Number(id);
  return catalogo.find((c) => c.id === alvo)?.rotulo ?? null;
}

/* ── A PROMESSA MEMOIZADA: uma requisição por carga de página ─────────────────────────────────
   ELA SERVE O SELETOR DA TELA DE CLIENTES, e por isso lê pela `ROTA_LEITURA_CLIENTES`, governada
   pelo menu `clientes`. O GERENCIADOR não passa por aqui: ele lê a rota de SUPER_ADMIN direto, e
   invalida esta memória a cada escrita, senão o seletor aberto na mesma carga de página continuaria
   oferecendo quem acabou de ser inativado. */

let emVoo: Promise<AsComercial[]> | null = null;

export function carregarComerciais(token?: string | null): Promise<AsComercial[]> {
  if (!emVoo) {
    emVoo = apiFetch<AsComercial[]>(ROTA_LEITURA_CLIENTES, { token }).catch((e) => {
      // A FALHA NÃO FICA GRUDADA: uma requisição que caia com a sessão renovando condenaria a
      // página inteira a nunca mais ter catálogo até alguém recarregar.
      emVoo = null;
      throw e;
    });
  }
  return emVoo;
}

/** Depois de escrever no catálogo (a tela de administração), a memória tem de morrer. */
export function invalidarCatalogoDeComerciais(): void {
  emVoo = null;
}

export interface CatalogoDeComerciais {
  /** TODOS, na ordem, inativos incluídos. É esta lista que o `PATCH /ordem` exige. */
  comerciais: AsComercial[];
  /** Só os escolhíveis. É esta que alimenta o seletor do cadastro de cliente. */
  ativos: AsComercial[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useComerciais(token?: string | null): CatalogoDeComerciais {
  const [comerciais, setComerciais] = useState<AsComercial[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(
    async (recarregando: boolean) => {
      if (recarregando) invalidarCatalogoDeComerciais();
      setCarregando(true);
      setErro(null);
      try {
        setComerciais(comerciaisOrdenados(await carregarComerciais(token)));
      } catch {
        /* A TELA NÃO MORRE POR FALTA DE CATÁLOGO. Com a lista vazia, o seletor fica vazio e diz o
           motivo, e o resto do cadastro de cliente continua servindo. O comercial é opcional. */
        setErro("Não foi possível carregar os comerciais.");
      } finally {
        setCarregando(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void buscar(false);
  }, [buscar]);

  const recarregar = useCallback(() => buscar(true), [buscar]);

  return { comerciais, ativos: comerciais.filter((c) => c.ativo), carregando, erro, recarregar };
}
