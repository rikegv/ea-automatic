import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { asc, eq, inArray } from "drizzle-orm";
import { UFS, type AsCidade } from "@ea/shared-types";
import type { Database } from "../../db/client";
import { DRIZZLE } from "../../db/drizzle.module";
import { asCidades } from "../../db/schema";

/** As 27 siglas válidas, do shared-types. Sigla fora daqui não chega a virar consulta. */
const SIGLAS = new Set(UFS.map((u) => u.uf));

/**
 * ─ AS CIDADES DO IBGE: LEITURA POR UF, E NADA ALÉM ──────────────────────────────────────────────
 *
 * A BASE VEM DO BANCO, SEMPRE. O IBGE é consultado UMA vez, por um script de carga
 * (`db/carga-cidades-ibge.ts`), e nunca em tempo de request: a abertura de vaga não pode depender de
 * um servidor externo estar no ar. Este serviço só lê o que a carga gravou.
 *
 * NÃO EXISTE ESCRITA AQUI, e a ausência é deliberada: não há CRUD de município. A fonte é oficial,
 * o dado é público e estável, e uma tela de manutenção só criaria a chance de alguém "corrigir" o
 * nome de uma cidade e quebrar o casamento com o código do IBGE, que é o que qualquer integração
 * futura (eSocial, folha, ATS) vai falar.
 *
 * §A.6: nome de cidade, sigla de estado e um código público. Nenhum dado pessoal.
 */
@Injectable()
export class CidadesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * AS CIDADES DE UMA UF, em ordem alfabética. É o que a tela chama ao escolher o estado.
   *
   * A UF É CONFERIDA ANTES DE CONSULTAR, e a recusa é explícita em vez de uma lista vazia: lista
   * vazia para "SX" e lista vazia para um estado cuja carga não rodou são a mesma tela e dois
   * problemas completamente diferentes.
   *
   * SEM PAGINAÇÃO de propósito: a maior UF tem 853 municípios (Minas Gerais), que é uma resposta
   * pequena e cacheável pelo navegador, e o seletor da tela tem busca (§A.35). Paginar obrigaria o
   * campo de busca a ir ao servidor a cada tecla para achar "Xambioá".
   */
  async porUf(uf: string): Promise<AsCidade[]> {
    const sigla = (uf ?? "").trim().toUpperCase();
    if (!SIGLAS.has(sigla)) {
      throw new BadRequestException("Estado inválido. Escolha uma das 27 unidades da federação.");
    }

    return this.db
      .select({ id: asCidades.id, nome: asCidades.nome, uf: asCidades.uf })
      .from(asCidades)
      .where(eq(asCidades.uf, sigla))
      .orderBy(asc(asCidades.nome));
  }

  /**
   * AS CIDADES DE UM CONJUNTO DE IDS, para a listagem resolver nome e UF de uma vez.
   *
   * UMA CONSULTA PARA A PÁGINA INTEIRA, e não uma por vaga: a Central de Vagas não pagina, então
   * buscar a cidade linha a linha viraria centenas de idas ao banco. É a mesma decisão já tomada
   * para a ocupação e para o rastro de redução de meta na mesma listagem.
   */
  async porIds(ids: number[]): Promise<Map<number, AsCidade>> {
    const unicos = [...new Set(ids)];
    if (unicos.length === 0) return new Map();
    const linhas = await this.db
      .select({ id: asCidades.id, nome: asCidades.nome, uf: asCidades.uf })
      .from(asCidades)
      .where(inArray(asCidades.id, unicos));
    return new Map(linhas.map((c) => [c.id, c]));
  }

  /**
   * A CIDADE ESCOLHIDA NA VAGA, conferida contra a base.
   *
   * `null` PASSA, e isso é o rascunho: a vaga salva pela metade pode ainda não ter cidade. Quem
   * decide se a ausência é pendência é a régua dos obrigatórios, não esta função.
   *
   * DEVOLVE A CIDADE INTEIRA porque quem chama precisa da UF: é ela que passa a alimentar
   * `vagas.regiao_estado`, que deixou de ser digitada e virou dado derivado da cidade.
   */
  async exigirCidade(id: number | null | undefined): Promise<AsCidade | null> {
    if (id === null || id === undefined) return null;
    const [cidade] = await this.db
      .select({ id: asCidades.id, nome: asCidades.nome, uf: asCidades.uf })
      .from(asCidades)
      .where(eq(asCidades.id, id))
      .limit(1);
    if (!cidade) {
      throw new BadRequestException("Esta cidade não existe na base do IBGE. Recarregue a página.");
    }
    return cidade;
  }

}
