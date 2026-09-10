import { describe, expect, it } from "vitest";
import { EtapasFunilController } from "./etapas-funil.controller";
import { EtapasFunilService } from "./etapas-funil.service";
import {
  bancoFingido,
  comoLista,
  etapasSemente,
  metodo,
  TAB_CANDIDATURAS,
  type LinhaEtapa,
} from "./etapas-funil.fake-db";

/**
 * ─ A ROTA ABERTA DEVOLVE O CATÁLOGO, E SÓ O CATÁLOGO ────────────────────────────────────────────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2).
 *
 * ┌─ AS DUAS SUPERFÍCIES TÊM PAPÉIS DIFERENTES, e é essa diferença que este arquivo guarda ────┐
 * │ `GET /as/etapas` é LEITURA DE CATÁLOGO: autenticada, NÃO reivindicada por menu nenhum, do    │
 * │ mesmo jeito que as listas de clientes, cargos e escalas. Tem de ser aberta, senão o COMUM    │
 * │ toma 403 ao abrir o funil, que é a tela de trabalho dele.                                    │
 * │                                                                                             │
 * │ E É JUSTAMENTE POR SER ABERTA QUE O PAYLOAD DELA É CONGELADO. "Quantas pessoas estão em cada │
 * │ etapa" é VOLUME DE PIPELINE: número de gestão, que pertence à rota gatada e à tela de quem   │
 * │ tem o menu. Uma coluna a mais no `group by` é barata de escrever e passa despercebida na      │
 * │ revisão, e quando passa, todo autenticado do sistema lê o funil inteiro da operação.          │
 * │                                                                                             │
 * │ SÃO SETE CAMPOS, os de `AsEtapaFunil`: id, codigo, rotulo, ordem, tom, inicial, ativa.       │
 * │ O teste afirma o conjunto EXATO, e não "contém os sete": é o campo A MAIS que ele existe     │
 * │ para pegar, e "contém" não pega campo a mais nenhum.                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A ISCA: as linhas do banco fingido carregam um campo `candidaturasNaEtapa` que NÃO é do catálogo.
 * Uma implementação que devolva a linha crua (`select()` sem projeção, ou um `...linha`) entrega a
 * isca junto e cai aqui. Uma que projete os sete campos passa.
 *
 * §A.6: o catálogo não tem PII, e este arquivo garante que ele também não ganhe volume operacional
 * de carona.
 */

/** Os sete campos de `AsEtapaFunil`, e é este conjunto que a rota aberta pode devolver. */
const CAMPOS_DO_CATALOGO = ["ativa", "codigo", "id", "inicial", "ordem", "rotulo", "tom"];

/** O catálogo com a ISCA: um campo de contagem já pronto na linha, esperando ser vazado. */
function etapasComIsca(): LinhaEtapa[] {
  return etapasSemente().map((e, i) => ({ ...e, candidaturasNaEtapa: (i + 1) * 7 }));
}

function montar() {
  const { db, estado, consultas } = bancoFingido({
    etapas: etapasComIsca(),
    candidaturas: [
      { id: "c1", etapa: "TRIAGEM", situacao: "ATIVO" },
      { id: "c2", etapa: "TRIAGEM", situacao: "ALOCADO" },
      { id: "c3", etapa: "CAPTACAO", situacao: "ATIVO" },
    ],
    historico: [{ id: "ev1", candidaturaId: "c1", etapaDe: null, etapaPara: "CAPTACAO" }],
  });
  const service = new EtapasFunilService(db as never);
  const controller = new EtapasFunilController(service as never);
  return { estado, consultas, service, controller };
}

/**
 * A CHAMADA DA ROTA, sem depender da forma do parâmetro de query. O handler pode receber um DTO de
 * query, receber o valor solto ou não receber nada; a PROPRIEDADE medida é o payload, e ela não
 * pode ficar vermelha por causa da assinatura.
 */
async function abrirRota(controller: EtapasFunilController): Promise<Record<string, unknown>[]> {
  const chamar = metodo(controller, ["listar", "list", "index"]);
  try {
    return comoLista(await chamar());
  } catch {
    return comoLista(await chamar({}));
  }
}

describe("GET /as/etapas: o payload é o catálogo, congelado em sete campos", () => {
  it("cada item devolve EXATAMENTE os sete campos de `AsEtapaFunil`", async () => {
    const { controller } = montar();

    const itens = await abrirRota(controller);

    expect(itens.length).toBeGreaterThan(0);
    for (const item of itens) {
      expect(Object.keys(item).sort()).toEqual(CAMPOS_DO_CATALOGO);
    }
  });

  /**
   * A MESMA RÉGUA UM NÍVEL ABAIXO. Se o serviço já vazar a contagem, a controller entrega junto, e
   * um teste só na ponta diria onde consertar sem dizer de onde veio.
   */
  it("o serviço, sozinho, também devolve só os sete campos", async () => {
    const { service } = montar();

    const itens = comoLista(await metodo(service, ["listar", "list"])());

    for (const item of itens) {
      expect(Object.keys(item).sort()).toEqual(CAMPOS_DO_CATALOGO);
    }
  });

  /**
   * ESCRITO COMO PADRÃO, e não como lista de nomes proibidos, porque o campo que vai vazar amanhã
   * vai se chamar outra coisa: `total`, `emSelecao`, `pipeline`, `quantas`. O que eles têm em comum
   * é serem CONTAGEM, e é isso que a rota aberta não devolve.
   */
  it("nenhum campo de contagem entra no payload, com qualquer nome", async () => {
    const { controller } = montar();

    const itens = await abrirRota(controller);

    for (const item of itens) {
      for (const chave of Object.keys(item)) {
        expect(chave, `campo de volume vazou na rota aberta: ${chave}`).not.toMatch(
          /count|total|quant|candidat|pessoa|pipeline|selecao|volume/i,
        );
      }
    }
  });

  /**
   * A CORROBORAÇÃO, e ela pega o vazamento na origem: a leitura do catálogo não tem por que TOCAR
   * a tabela de candidaturas. Consulta que não existe é contagem que não vaza, e um `left join` com
   * `count` acrescentado "só para a tela ficar melhor" cai aqui antes de chegar ao payload.
   */
  it("a leitura do catálogo não consulta `as_candidaturas`", async () => {
    const { controller, consultas } = montar();

    await abrirRota(controller);

    expect(consultas.map((c) => c.tabela)).not.toContain(TAB_CANDIDATURAS);
  });

  it("os tipos são os do contrato: `id` e `ordem` números, `inicial` e `ativa` booleanos", async () => {
    const { controller } = montar();

    const itens = await abrirRota(controller);

    for (const item of itens) {
      expect(typeof item.id).toBe("number");
      expect(typeof item.ordem).toBe("number");
      expect(typeof item.inicial).toBe("boolean");
      expect(typeof item.ativa).toBe("boolean");
      expect(typeof item.codigo).toBe("string");
      expect(typeof item.rotulo).toBe("string");
    }
  });
});
