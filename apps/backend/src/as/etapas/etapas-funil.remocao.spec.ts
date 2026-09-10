import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SITUACOES_VIVAS } from "../../domain/candidatura";
import { EtapasFunilService } from "./etapas-funil.service";
import {
  bancoFingido,
  etapasSemente,
  metodo,
  type Estado,
  type LinhaEtapa,
} from "./etapas-funil.fake-db";

/**
 * ─ AS TRÊS CAMADAS DO APAGAR UMA ETAPA DO FUNIL, e a que separa teste certo de teste ingênuo ────
 *
 * ESCRITO ANTES DO CÓDIGO (§A.40, regra 2). O que está guardado aqui é o REQUISITO, e é ele que a
 * construção tem de fazer passar.
 *
 * ┌─ A REGRA, em três camadas, na ordem em que são tentadas ───────────────────────────────────┐
 * │ 1. TEM CANDIDATURA VIVA NA ETAPA: RECUSA, e a frase traz O NÚMERO, para o time saber o      │
 * │    tamanho do trabalho antes de mover gente. Mesma frase-molde do iFractal, que já está em   │
 * │    produção e já provou que a contagem é a parte útil do recado.                             │
 * │ 2. NINGUÉM VIVO, MAS TEM HISTÓRICO: NÃO APAGA, INATIVA (`ativa = false`). A etapa some dos   │
 * │    seletores e continua resolvendo o rótulo da linha do tempo de quem passou por ela.        │
 * │ 3. ZERO VIVO E ZERO HISTÓRICO: APAGA DE VERDADE. É a "Trigem" digitada errada no primeiro    │
 * │    dia, e ela precisa sumir sem deixar lixo no catálogo.                                     │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CASO QUE ESTE ARQUIVO EXISTE PARA PEGAR, e ele passa por engano em teste ingênuo ────────┐
 * │ "VIVA" É `candidaturaViva`, o COMPLEMENTO de `ehSaidaSemExito`: ATIVO, APROVADO, ALOCADO e   │
 * │ ENVIADO_PARA_ADMISSAO. Uma implementação que conte só `situacao = 'ATIVO'` responde ZERO     │
 * │ para uma etapa cheia de gente ALOCADA e INATIVA a etapa por baixo dela. Um teste que só      │
 * │ montasse o cenário com ATIVO ficaria verde nas duas implementações e não travaria nada.      │
 * │                                                                                             │
 * │ POR ISSO O CENÁRIO CENTRAL AQUI TEM UMA ÚNICA CANDIDATURA `ALOCADO` E NENHUMA `ATIVO`, e o   │
 * │ fake aplica o filtro de verdade (ver o cabeçalho de `etapas-funil.fake-db.ts`): a régua       │
 * │ ingênua devolve zero e o teste cai.                                                          │
 * │                                                                                             │
 * │ AVISO AO CONSTRUTOR: o comentário de `domain/candidatura.ts:47-48` diz que o service só move │
 * │ quem está `ATIVO`. Ele está DEFASADO. A fonte é `candidatos.service.ts` (`moverEtapa`), que  │
 * │ desde a correção do modelo de posição pergunta `candidaturaViva`.                            │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * MAIS DUAS TRAVAS, que o catálogo do iFractal ensina por analogia:
 *   . não se remove NEM INATIVA a etapa marcada como `inicial` sem outra marcada antes, senão a
 *     próxima candidatura nasce sem lugar;
 *   . não se inativa a ÚLTIMA ATIVA: funil sem etapa não é funil, e a tela de mover fica vazia.
 *
 * §A.6: o catálogo não guarda dado pessoal, e a recusa diz QUANTAS pessoas estão na etapa, nunca
 * QUEM está.
 */

/** O serviço sobre o banco fingido, com o estado exposto para as afirmações depois da escrita. */
function comCatalogo(cenario: Partial<Estado>) {
  const { db, estado } = bancoFingido({
    etapas: cenario.etapas ?? etapasSemente(),
    candidaturas: cenario.candidaturas ?? [],
    historico: cenario.historico ?? [],
  });
  const service = new EtapasFunilService(db as never);
  return {
    estado,
    service,
    remover: metodo(service, ["remover", "remove", "excluir"]),
    definirInicial: metodo(service, [
      "definirInicial",
      "definirEtapaInicial",
      "marcarInicial",
      "definirInicialDoFunil",
    ]),
    etapa: (codigo: string) => estado.etapas.find((e) => e.codigo === codigo) as LinhaEtapa,
  };
}

function candidatura(etapa: string, situacao: string, i = 0) {
  return { id: `cand-${etapa}-${situacao}-${i}`, etapa, situacao };
}

function evento(etapaPara: string, etapaDe: string | null = null, i = 0) {
  return { id: `ev-${etapaPara}-${i}`, candidaturaId: `cand-${i}`, etapaDe, etapaPara };
}

/**
 * A RECUSA, capturada. Ela tem de ser uma resposta de HTTP com frase, e não um erro cru do banco:
 * a diferença entre as duas é a diferença entre "o time lê o que fazer" e "500 na cara de quem
 * clicou".
 */
async function recusaAo(fn: () => Promise<unknown>): Promise<HttpException> {
  try {
    await fn();
  } catch (e) {
    expect(e, `a recusa precisa ser HttpException, veio: ${String(e)}`).toBeInstanceOf(
      HttpException,
    );
    return e as HttpException;
  }
  throw new Error("esperava a recusa e a operação passou");
}

function frase(err: HttpException): string {
  const r = err.getResponse();
  return typeof r === "string" ? r : JSON.stringify(r);
}

/**
 * A INVARIANTE DO CATÁLOGO, conferida depois de toda recusa. Ela é o que as duas travas extras
 * existem para manter: sempre há onde a candidatura nova nascer e sempre há para onde mover gente.
 */
function catalogoSaudavel(estado: Estado): void {
  expect(estado.etapas.filter((e) => e.ativa).length, "o funil ficou sem etapa ativa").toBeGreaterThan(
    0,
  );
  expect(estado.etapas.filter((e) => e.inicial).length, "sobrou zero ou mais de uma inicial").toBe(1);
}

describe("camada 1: etapa com candidatura VIVA recusa, e a frase traz o número", () => {
  it("três pessoas na etapa: recusa, o número aparece no recado e a etapa continua ATIVA", async () => {
    const c = comCatalogo({
      candidaturas: [0, 1, 2].map((i) => candidatura("TRIAGEM", "ATIVO", i)),
      historico: [evento("TRIAGEM")],
    });

    const err = await recusaAo(() => c.remover(c.etapa("TRIAGEM").id));

    expect(frase(err)).toMatch(/\b3\b/);
    expect(c.etapa("TRIAGEM").ativa).toBe(true);
    expect(c.estado.etapas).toHaveLength(5);
    catalogoSaudavel(c.estado);
  });

  /**
   * ─ O CASO CENTRAL DO ARQUIVO ────────────────────────────────────────────────────────────────
   *
   * UMA CANDIDATURA `ALOCADO`, NENHUMA `ATIVO`. Quem foi ALOCADO preencheu a posição da vaga e
   * CONTINUA no funil (é o modelo de posição, decidido pelo diretor em 08/09), então a etapa dele
   * tem gente dentro. A régua ingênua devolve zero, inativa a etapa por baixo de uma pessoa em
   * processo, e nada falha: é exatamente a etapa fantasma que este teste existe para impedir.
   */
  it("uma única candidatura ALOCADA (e nenhuma ATIVO) BASTA para recusar", async () => {
    const c = comCatalogo({
      candidaturas: [candidatura("TRIAGEM", "ALOCADO")],
      historico: [evento("TRIAGEM")],
    });

    const err = await recusaAo(() => c.remover(c.etapa("TRIAGEM").id));

    expect(frase(err)).toMatch(/\b1\b/);
    expect(c.etapa("TRIAGEM").ativa, "a etapa foi inativada com gente viva dentro").toBe(true);
    catalogoSaudavel(c.estado);
  });

  /**
   * TODA SITUAÇÃO VIVA SEGURA A ETAPA, uma a uma, em laço sobre o VOCABULÁRIO. Escrito assim para
   * que a situação nova de amanhã já nasça coberta, sem ninguém lembrar de voltar aqui: é a mesma
   * direção fail-closed de `SITUACOES_VIVAS`, que é derivada e nunca redigitada.
   */
  it.each(SITUACOES_VIVAS)("a etapa com uma candidatura %s é recusada", async (situacao) => {
    const c = comCatalogo({
      candidaturas: [candidatura("TRIAGEM", situacao)],
      historico: [evento("TRIAGEM")],
    });

    await recusaAo(() => c.remover(c.etapa("TRIAGEM").id));

    expect(c.etapa("TRIAGEM").ativa).toBe(true);
  });

  /**
   * O CONTRASTE, sem o qual o teste acima viraria "recusa sempre": quem saiu SEM ÊXITO não segura
   * etapa nenhuma. Com histórico e sem ninguém vivo, a etapa cai na CAMADA 2 e é INATIVADA.
   */
  it("só DESCARTADO e DESISTIU na etapa: não recusa, INATIVA (camada 2)", async () => {
    const c = comCatalogo({
      candidaturas: [candidatura("TRIAGEM", "DESCARTADO", 1), candidatura("TRIAGEM", "DESISTIU", 2)],
      historico: [evento("TRIAGEM", null, 1), evento("TRIAGEM", "CAPTACAO", 2)],
    });

    await c.remover(c.etapa("TRIAGEM").id);

    expect(c.etapa("TRIAGEM")).toBeDefined();
    expect(c.etapa("TRIAGEM").ativa).toBe(false);
  });
});

describe("camada 2: sem ninguém vivo, com histórico, INATIVA em vez de apagar", () => {
  it("a linha CONTINUA no catálogo, com `ativa = false`, para o histórico seguir resolvendo o rótulo", async () => {
    const c = comCatalogo({ historico: [evento("TRIAGEM", "CAPTACAO")] });

    await c.remover(c.etapa("TRIAGEM").id);

    expect(c.estado.etapas, "a linha foi apagada com histórico apontando para ela").toHaveLength(5);
    expect(c.etapa("TRIAGEM").ativa).toBe(false);
    // O CÓDIGO É A IDENTIDADE e não muda: é ele que o evento do histórico guarda.
    expect(c.etapa("TRIAGEM").codigo).toBe("TRIAGEM");
  });

  it("o histórico que só cita a etapa em `etapa_de` também segura o apagar", async () => {
    const c = comCatalogo({ historico: [evento("APROVACAO", "TRIAGEM")] });

    await c.remover(c.etapa("TRIAGEM").id);

    expect(c.estado.etapas).toHaveLength(5);
    expect(c.etapa("TRIAGEM").ativa).toBe(false);
  });

  /**
   * A BORDA QUE A CHAVE ESTRANGEIRA COBRA: candidatura ENCERRADA continua com a coluna `etapa`
   * apontando para a linha, então o `DELETE` é fisicamente impossível (FK RESTRICT) mesmo sem
   * histórico nenhum. O que não pode acontecer é o serviço TENTAR apagar e devolver o erro cru do
   * banco. Inativar ou recusar com frase, os dois servem; explodir, não.
   */
  it("candidatura encerrada sem histórico: não apaga a linha e não estoura erro cru", async () => {
    const c = comCatalogo({ candidaturas: [candidatura("TRIAGEM", "DESCARTADO")] });

    try {
      await c.remover(c.etapa("TRIAGEM").id);
    } catch (e) {
      expect(e).toBeInstanceOf(HttpException);
    }

    expect(c.estado.etapas.some((e) => e.codigo === "TRIAGEM")).toBe(true);
  });
});

describe("camada 3: zero vivo e zero histórico apaga de verdade", () => {
  it('a "Trigem" digitada errada no primeiro dia some do catálogo', async () => {
    const etapas: LinhaEtapa[] = [
      ...etapasSemente(),
      { id: 99, codigo: "TRIGEM", rotulo: "Trigem", ordem: 6, tom: "nt", inicial: false, ativa: true },
    ];
    const c = comCatalogo({ etapas });

    await c.remover(99);

    expect(c.estado.etapas.some((e) => e.codigo === "TRIGEM")).toBe(false);
    expect(c.estado.etapas).toHaveLength(5);
    catalogoSaudavel(c.estado);
  });
});

describe("as duas travas extras: a inicial e a última ativa", () => {
  it("a etapa INICIAL não é removida, mesmo vazia, enquanto for a única marcada", async () => {
    const c = comCatalogo({});
    const inicial = c.estado.etapas.find((e) => e.inicial) as LinhaEtapa;

    const err = await recusaAo(() => c.remover(inicial.id));

    expect(frase(err)).toBeTruthy();
    expect(c.estado.etapas.some((e) => e.id === inicial.id)).toBe(true);
    catalogoSaudavel(c.estado);
  });

  /**
   * E O CAMINHO DE SAÍDA EXISTE, senão a trava viraria uma etapa imortal: marcada outra como
   * inicial, a antiga sai. A marcação é EXCLUSIVA (uma inicial por vez), igual ao `conclui` do
   * iFractal.
   */
  it("marcada OUTRA como inicial, a antiga passa a ser removível", async () => {
    const c = comCatalogo({});
    const antiga = c.estado.etapas.find((e) => e.inicial) as LinhaEtapa;
    const nova = c.estado.etapas.find((e) => !e.inicial) as LinhaEtapa;

    await c.definirInicial(nova.id);
    expect(c.estado.etapas.filter((e) => e.inicial).map((e) => e.id)).toEqual([nova.id]);

    await c.remover(antiga.id);

    expect(c.estado.etapas.some((e) => e.id === antiga.id)).toBe(false);
    catalogoSaudavel(c.estado);
  });

  it("a ÚLTIMA etapa ATIVA não é inativada: o funil nunca fica sem lugar nenhum", async () => {
    const etapas: LinhaEtapa[] = [
      { id: 1, codigo: "CAPTACAO", rotulo: "Captação", ordem: 1, tom: "nt", inicial: true, ativa: true },
      { id: 2, codigo: "TRIAGEM", rotulo: "Triagem", ordem: 2, tom: "in", inicial: false, ativa: false },
    ];
    const c = comCatalogo({ etapas, historico: [evento("CAPTACAO")] });

    await recusaAo(() => c.remover(1));

    expect(c.estado.etapas.filter((e) => e.ativa)).toHaveLength(1);
    catalogoSaudavel(c.estado);
  });
});
