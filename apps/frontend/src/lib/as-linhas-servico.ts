/**
 * ─ O CATÁLOGO DE LINHAS DE SERVIÇO, DO LADO DA TELA (Onda C, peça 1) ───────────────────────────
 *
 * A LINHA DE SERVIÇO É DADO DO DIRETOR, e não uma lista escrita na tela: Pontuais & Estratégicas,
 * RPO & BPO, Alto Volume, SouFast, OneShot são o catálogo de HOJE, e ele muda. Uma constante no
 * código obrigaria uma publicação a cada renomeação, e é exatamente por isso que a tela de
 * administração existe.
 *
 * ┌─ ELA NÃO É O "PROJETO" DO ALTO VOLUME, e a colisão de nome é real ─────────────────────────┐
 * │ `projetos_alto_volume` guarda EVENTOS ("BIENAL DOS LIVROS", "Temporada De Setembro 2026"),  │
 * │ campanhas com data DENTRO da operação de alto volume. Isto aqui é outro eixo: uma vaga da   │
 * │ LINHA "Alto Volume" pode ou não pertencer a um evento de alto volume. Quem escrever         │
 * │ `projeto` sem qualificar, daqui a seis meses, vai ler a tabela errada.                      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE MÓDULO É O MOLDE DE `as-etapas`, DE PROPÓSITO: funções puras que recebem o catálogo
 * explicitamente, mais uma promessa memoizada por carga de página e um gancho em volta dela. Régua
 * se testa sem rede; o gancho é conveniência. Duas telas montando ao mesmo tempo dividem UMA
 * requisição, porque o que se guarda é a promessa e não o resultado.
 *
 * AS ROTAS FICAM DECLARADAS AQUI, EM UM LUGAR SÓ (`ROTA_LEITURA` e `ROTA_ADMIN`), e isso não é
 * enfeite: a leitura é aberta a quem abre vaga e a escrita é de SUPER_ADMIN, então elas moram em
 * controllers diferentes. Espalhar os caminhos pelas telas faria a próxima renomeação virar uma
 * caça, e faria a divisão de papel virar detalhe invisível.
 *
 * §A.11 (sem travessão), §A.24 (rótulo do catálogo é etiqueta, e vem do diretor já escrito).
 */

import { useCallback, useEffect, useState } from "react";
import {
  vagaPendencias,
  VAGA_OBRIGATORIOS,
  type AsLinhaDeServico,
  type VagaCamposObrigatorios,
  type VagaPendencia,
} from "@ea/shared-types";
import { apiFetch } from "@/lib/api";

/**
 * A LEITURA, aberta a qualquer autenticado, pelo mesmo motivo da leitura das etapas: o rótulo da
 * linha de serviço aparece na ficha e na abertura de vaga, e quem só abre vaga precisa dele.
 * `incluirInativas=1` porque a vaga antiga pode apontar para uma linha que saiu de circulação, e
 * sem ela a ficha mostraria o código cru no lugar do nome.
 */
export const ROTA_LEITURA = "/as/linhas-servico?incluirInativas=1";
/** A ESCRITA, de SUPER_ADMIN, na camada `/admin` como todo catálogo gerenciável. */
export const ROTA_ADMIN = "/admin/as/linhas-servico";

/** NA ORDEM DO DIRETOR, e o desempate é o id: duas linhas com a mesma ordem não podem dançar. */
export function linhasOrdenadas(catalogo: readonly AsLinhaDeServico[]): AsLinhaDeServico[] {
  return [...catalogo].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
}

/** Só as que podem ser ESCOLHIDAS numa vaga nova. */
export function linhasAtivas(catalogo: readonly AsLinhaDeServico[]): AsLinhaDeServico[] {
  return linhasOrdenadas(catalogo).filter((l) => l.ativo);
}

/**
 * A LINHA DE UM CÓDIGO, ou nada.
 *
 * DEVOLVE `undefined` PARA CÓDIGO DESCONHECIDO, e nunca um objeto inventado: é o chamador que
 * decide o que fazer com a ausência, e cada um decide diferente (o seletor ignora, o rótulo cai no
 * código cru).
 */
export function linhaDoCodigo(
  codigo: string | null | undefined,
  catalogo: readonly AsLinhaDeServico[],
): AsLinhaDeServico | undefined {
  if (!codigo) return undefined;
  return catalogo.find((l) => l.codigo === codigo);
}

/**
 * O RÓTULO DE UM CÓDIGO, com queda para o CÓDIGO CRU e não para vazio.
 *
 * Uma célula vazia faz o leitor achar que a vaga não tem linha de serviço, o que é diferente de "o
 * catálogo ainda não chegou" e de "esta linha foi apagada". O código cru diz a verdade nos três
 * casos. Ausência de verdade é "não informado" (§A.11), e quem responde isso é a célula, não aqui.
 */
export function rotuloDaLinha(
  codigo: string | null | undefined,
  catalogo: readonly AsLinhaDeServico[],
): string | null {
  if (!codigo) return null;
  return linhaDoCodigo(codigo, catalogo)?.rotulo ?? codigo;
}

/**
 * O RÓTULO PELO ID DO CATÁLOGO, que é como a VAGA guarda a linha de serviço.
 *
 * ┌─ POR QUE DUAS FUNÇÕES DE RÓTULO, E A DIFERENÇA NÃO É COSMÉTICA ───────────────────────────┐
 * │ A vaga grava `linha_servico_id`, um INTEIRO, e não o código. `rotuloDaLinha` (acima) casa   │
 * │ por CÓDIGO, e chamá-la com um id nunca acharia nada: ela cairia no fallback e a ficha       │
 * │ imprimiria o número cru no lugar do nome, sem erro nenhum e sem ninguém notar. Foi          │
 * │ exatamente esse o engano na primeira escrita desta tela, pego antes de subir.               │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A QUEDA É PARA NULO, e não para o número: "12" não diz nada a quem lê a ficha, e a célula tem
 * uma resposta melhor para a ausência, que é o "não informado" (§A.11) que ela já escreve.
 */
export function rotuloDaLinhaPorId(
  id: number | string | null | undefined,
  catalogo: readonly AsLinhaDeServico[],
): string | null {
  if (id === null || id === undefined || String(id).trim() === "") return null;
  const alvo = Number(id);
  return catalogo.find((l) => l.id === alvo)?.rotulo ?? null;
}

// ── A PROMESSA MEMOIZADA: uma requisição por carga de página ────────────────

let emVoo: Promise<AsLinhaDeServico[]> | null = null;

export function carregarLinhasServico(token?: string | null): Promise<AsLinhaDeServico[]> {
  if (!emVoo) {
    emVoo = apiFetch<AsLinhaDeServico[]>(ROTA_LEITURA, { token }).catch((e) => {
      // A FALHA NÃO FICA GRUDADA: uma requisição que caia com a sessão renovando condenaria a
      // página inteira a nunca mais ter catálogo até alguém recarregar.
      emVoo = null;
      throw e;
    });
  }
  return emVoo;
}

/** Depois de escrever no catálogo (a tela de administração), a memória tem de morrer. */
export function invalidarCatalogoDeLinhas(): void {
  emVoo = null;
}

export interface CatalogoDeLinhas {
  /** TODAS, na ordem, inativas incluídas. É esta lista que o `PATCH /ordem` exige. */
  linhas: AsLinhaDeServico[];
  /** Só as escolhíveis. É esta que alimenta o seletor da abertura de vaga. */
  ativas: AsLinhaDeServico[];
  carregando: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
}

export function useLinhasServico(token?: string | null): CatalogoDeLinhas {
  const [linhas, setLinhas] = useState<AsLinhaDeServico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const buscar = useCallback(
    async (recarregando: boolean) => {
      if (recarregando) invalidarCatalogoDeLinhas();
      setCarregando(true);
      setErro(null);
      try {
        setLinhas(linhasOrdenadas(await carregarLinhasServico(token)));
      } catch {
        /* A TELA NÃO MORRE POR FALTA DE CATÁLOGO. Com a lista vazia, o seletor fica vazio e diz o
           motivo, e o resto da abertura de vaga (38 campos) continua servindo. */
        setErro("Não foi possível carregar as linhas de serviço.");
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

  return { linhas, ativas: linhas.filter((l) => l.ativo), carregando, erro, recarregar };
}

// ── A RÉGUA DOS OBRIGATÓRIOS, COM A LINHA DE SERVIÇO ───────────────────────

/**
 * ─ A LINHA DE SERVIÇO É OBRIGATÓRIA PARA PUBLICAR, e a régua é a MESMA dos dois lados ──────────
 *
 * A régua da vaga é DECLARATIVA por desenho (`VAGA_OBRIGATORIOS`, no shared-types): a tela desenha o
 * asterisco a partir dela, lista as pendências clicáveis a partir dela, e o servidor recusa a
 * publicação a partir da MESMA lista. Acrescentar um obrigatório é acrescentar UMA entrada.
 *
 * ┌─ POR QUE A ENTRADA NASCE AQUI, E NÃO EM `VAGA_OBRIGATORIOS` ───────────────────────────────┐
 * │ `packages/shared-types/src/index.ts` tem DONO ÚNICO nesta frente, o coordenador (§A.39), e  │
 * │ dois agentes escrevendo o mesmo arquivo se sobrescrevem em silêncio. O backend fez o mesmo   │
 * │ movimento do lado dele (`domain/vaga-obrigatorios.ts`), com a MESMA entrada, campo por campo:│
 * │ `campo: "linhaServicoId"`, artigo "a", passo 0, âncora `vaga-linha-servico`. As duas cópias  │
 * │ existem porque o arquivo comum está fechado, e não porque a régua seja duas.                 │
 * │                                                                                              │
 * │ A COMPOSIÇÃO É IDEMPOTENTE: no dia em que a entrada subir para o shared-types, esta função   │
 * │ NÃO passa a cobrar duas vezes, porque confere se o campo já está lá. A migração é apagar     │
 * │ estas linhas e voltar a chamar `vagaPendencias` direto.                                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export const PENDENCIA_LINHA_SERVICO: VagaPendencia = {
  campo: "linhaServicoId",
  rotulo: "Linha de serviço",
  artigo: "a",
  passo: 0,
  passoRotulo: "A Vaga",
  ancora: "vaga-linha-servico",
};

export type CamposObrigatoriosComLinha = VagaCamposObrigatorios & {
  linhaServicoId?: number | string | null;
};

/**
 * O QUE FALTA PARA PUBLICAR, com a linha de serviço dentro.
 *
 * A POSIÇÃO É LOGO DEPOIS DE `sazonalidade`, e não no fim: as pendências são lidas na ordem em que
 * a tela pergunta, e jogar a linha para depois de "Data de abertura" faria a lista saltar do passo
 * 2 de volta para o passo 1. É a mesma inserção posicional que o backend faz.
 */
export function pendenciasComLinhaDeServico(v: CamposObrigatoriosComLinha): VagaPendencia[] {
  const pendencias = vagaPendencias(v);
  if (VAGA_OBRIGATORIOS.some((p) => p.campo === PENDENCIA_LINHA_SERVICO.campo)) return pendencias;

  const vazio =
    v.linhaServicoId === null ||
    v.linhaServicoId === undefined ||
    String(v.linhaServicoId).trim() === "";
  if (!vazio) return pendencias;

  const depoisDe = pendencias.findIndex((p) => p.campo === "sazonalidade");
  const ultimoDoPasso0 = pendencias.reduce((i, p, idx) => (p.passo === 0 ? idx : i), -1);
  const alvo = (depoisDe >= 0 ? depoisDe : ultimoDoPasso0) + 1;
  return [...pendencias.slice(0, alvo), PENDENCIA_LINHA_SERVICO, ...pendencias.slice(alvo)];
}
