import { BadRequestException, NotFoundException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../db/client";
import { LinhasServicoService, linhaDeServicoEscolhida } from "./linhas-servico.service";

/**
 * ─ O CATÁLOGO DAS LINHAS DE SERVIÇO, CONTRA UM BANCO COM MEMÓRIA ──────────────────────────────
 *
 * ┌─ POR QUE O FAKE TEM MEMÓRIA, e não devolve linhas prontas ──────────────────────────────────┐
 * │ "Criar aparece na leitura seguinte" e "inativar tira da lista" são afirmações sobre DUAS     │
 * │ chamadas. Um fake sem memória responde a segunda com o mundo de antes da primeira, e o       │
 * │ defeito clássico deste desenho (o CACHE que não invalida) passaria VERDE.                    │
 * │                                                                                              │
 * │ O CACHE É O RISCO REAL AQUI: o serviço guarda a lista por 60s, e toda mutação depende de     │
 * │ chamar `invalidar()`. Esquecer UM `invalidar()` faz a tela de administração mostrar o estado │
 * │ velho por um minuto depois de cada edição, que vira "salvei e não salvou".                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * INFRAESTRUTURA DE TESTE: nada aqui roda em produção.
 *
 * §A.6: código, rótulo, ordem e um booleano. Nenhum dado pessoal.
 */

interface Linha {
  id: number;
  codigo: string;
  rotulo: string;
  ordem: number;
  ativo: boolean;
  [extra: string]: unknown;
}

/**
 * O VALOR DO `where`, extraído do objeto SQL do drizzle. Todas as cláusulas deste serviço são
 * `eq(coluna, valor)`, então o PRIMEIRO parâmetro é o que interessa. Cru de propósito: um
 * interpretador completo de SQL seria mais código do que o serviço que ele testa.
 */
function valorDoWhere(no: unknown): unknown {
  if (no === null || typeof no !== "object") return undefined;
  const o = no as Record<string, unknown>;
  if ("value" in o && "encoder" in o) return o.value;
  for (const chunk of (o.queryChunks as unknown[]) ?? []) {
    const achado = valorDoWhere(chunk);
    if (achado !== undefined) return achado;
  }
  return undefined;
}

function bancoFingido(inicial: Linha[], usosPorLinha: Record<number, number> = {}) {
  const estado = { linhas: inicial.map((l) => ({ ...l })), proximoId: 100 };

  const selecionar = (campos: Record<string, unknown>) => ({
    from: (tabela: unknown) => {
      // A CONTAGEM (`max(ordem)` e `count(*)` sobre vagas) é reconhecida pelos APELIDOS pedidos, que
      // é o que o serviço realmente usa. Sem isto, o fake teria de interpretar agregação.
      if ("max" in campos) {
        return Promise.resolve([
          { max: estado.linhas.reduce((m, l) => Math.max(m, l.ordem), 0) },
        ]);
      }
      if ("usos" in campos) {
        const encadeado = {
          where: (cond: unknown) =>
            Promise.resolve([{ usos: usosPorLinha[Number(valorDoWhere(cond))] ?? 0 }]),
        };
        return encadeado;
      }
      const linhas = [...estado.linhas].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
      return Object.assign(Promise.resolve(linhas), {
        orderBy: () => Promise.resolve(linhas),
      });
      void tabela;
    },
  });

  const db = {
    select: selecionar,
    insert: () => ({
      values: (v: Partial<Linha>) => ({
        returning: () => {
          if (estado.linhas.some((l) => l.codigo === v.codigo)) {
            // O UNIQUE DO BANCO, fingido: é ele que decide na corrida de dois cliques.
            throw new Error("duplicate key value violates unique constraint");
          }
          const nova: Linha = {
            id: estado.proximoId++,
            codigo: String(v.codigo),
            rotulo: String(v.rotulo),
            ordem: Number(v.ordem),
            ativo: v.ativo ?? true,
          };
          estado.linhas.push(nova);
          return Promise.resolve([{ ...nova }]);
        },
      }),
    }),
    update: () => ({
      set: (patch: Partial<Linha>) => ({
        where: (cond: unknown) => {
          const id = Number(valorDoWhere(cond));
          const alvo = estado.linhas.find((l) => l.id === id);
          if (alvo) Object.assign(alvo, patch);
          const resultado = alvo ? [{ ...alvo }] : [];
          return Object.assign(Promise.resolve(resultado), {
            returning: () => Promise.resolve(resultado),
          });
        },
      }),
    }),
    delete: () => ({
      where: (cond: unknown) => {
        const id = Number(valorDoWhere(cond));
        estado.linhas = estado.linhas.filter((l) => l.id !== id);
        return Promise.resolve([]);
      },
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(db),
  };

  return { db: db as unknown as Database, estado };
}

const SEMENTE: Linha[] = [
  { id: 1, codigo: "PONTUAIS_ESTRATEGICAS", rotulo: "Pontuais & Estratégicas", ordem: 1, ativo: true },
  { id: 2, codigo: "RPO_BPO", rotulo: "RPO & BPO", ordem: 2, ativo: true },
  { id: 3, codigo: "ALTO_VOLUME", rotulo: "Alto Volume", ordem: 3, ativo: true },
];

let banco = bancoFingido(SEMENTE);
let service = new LinhasServicoService(banco.db);

beforeEach(() => {
  banco = bancoFingido(SEMENTE);
  service = new LinhasServicoService(banco.db);
});

describe("a leitura do catálogo", () => {
  it("devolve as ativas, na ordem do catálogo", async () => {
    expect((await service.listar()).map((l) => l.codigo)).toEqual([
      "PONTUAIS_ESTRATEGICAS",
      "RPO_BPO",
      "ALTO_VOLUME",
    ]);
  });

  /**
   * A INATIVA SOME DO SELETOR E CONTINUA NO HISTÓRICO. Sem `incluirInativas`, a ficha de uma vaga
   * antiga mostraria vazio no lugar da classificação que ela tinha.
   */
  it("esconde a inativa por padrão, e a devolve quando pedida", async () => {
    await service.inativar(3);
    expect((await service.listar()).map((l) => l.id)).toEqual([1, 2]);
    expect((await service.listar(true)).map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it("o rótulo continua resolvendo para a linha inativada", async () => {
    await service.inativar(3);
    expect((await service.rotuloPorId()).get(3)).toBe("Alto Volume");
  });
});

describe("criar", () => {
  it("nasce no fim da fila, com código derivado do rótulo", async () => {
    const nova = await service.criar({ rotulo: "SouFast" });
    expect(nova.codigo).toBe("SOUFAST");
    expect(nova.ordem).toBe(4);
    expect((await service.listar()).at(-1)?.codigo).toBe("SOUFAST");
  });

  it("recusa nome repetido", async () => {
    await expect(service.criar({ rotulo: "RPO & BPO" })).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * ─ O CASO QUE VIRARIA 500 SE NINGUÉM PENSASSE NELE ───────────────────────────────────────────
   * Digitar de novo o nome de uma linha INATIVADA produz o mesmo código, que continua na tabela
   * segurando o rótulo das vagas antigas. Um `INSERT` direto estouraria o unique e a tela mostraria
   * erro de banco. A recusa aqui DIZ O QUE FAZER, e não reativa sozinha.
   */
  it("recusa recriar uma inativada, e manda reativar", async () => {
    await service.inativar(3);
    const erro = await service.criar({ rotulo: "Alto Volume" }).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("Reative-a");
  });

  it("recusa rótulo sem letra nem número", async () => {
    await expect(service.criar({ rotulo: "---" })).rejects.toBeInstanceOf(BadRequestException);
  });

  /** O CACHE não pode esconder a linha recém-criada da leitura seguinte. */
  it("aparece na leitura IMEDIATAMENTE depois de criada (o cache invalida)", async () => {
    await service.listar();
    await service.criar({ rotulo: "OneShot" });
    expect((await service.listar()).some((l) => l.codigo === "ONESHOT")).toBe(true);
  });
});

describe("renomear", () => {
  it("troca o rótulo e MANTÉM o código", async () => {
    const r = await service.renomear(2, { rotulo: "RPO e BPO" });
    expect(r.rotulo).toBe("RPO e BPO");
    expect(r.codigo).toBe("RPO_BPO");
  });

  it("a leitura seguinte já mostra o nome novo", async () => {
    await service.listar();
    await service.renomear(2, { rotulo: "RPO e BPO" });
    expect((await service.listar()).find((l) => l.id === 2)?.rotulo).toBe("RPO e BPO");
  });

  it("404 em linha que não existe", async () => {
    await expect(service.renomear(99, { rotulo: "X" })).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("a ordem", () => {
  it("reescreve 1..N a partir da lista completa", async () => {
    await service.reordenar([3, 1, 2]);
    expect((await service.listar()).map((l) => l.id)).toEqual([3, 1, 2]);
  });

  /**
   * A LISTA TEM DE VIR INTEIRA. Faltando uma, ela ficaria com a ordem antiga no meio da nova, e o
   * seletor passaria a mostrar duas linhas na mesma posição.
   */
  it("recusa lista incompleta", async () => {
    await expect(service.reordenar([3, 1])).rejects.toBeInstanceOf(BadRequestException);
  });

  it("recusa id desconhecido", async () => {
    await expect(service.reordenar([1, 2, 3, 99])).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("inativar e reativar", () => {
  it("inativar tira do seletor sem apagar", async () => {
    await service.inativar(3);
    expect((await service.listar(true)).find((l) => l.id === 3)?.ativo).toBe(false);
  });

  /**
   * ─ A TRAVA QUE PROTEGE A ABERTURA DE VAGA ────────────────────────────────────────────────────
   * A linha de serviço é OBRIGATÓRIA para publicar. Zerar o catálogo não deixaria uma tela feia:
   * trancaria a publicação de TODA vaga nova, e o time descobriria isso no meio de uma abertura.
   */
  it("recusa inativar a ÚLTIMA ativa", async () => {
    await service.inativar(2);
    await service.inativar(3);
    const erro = await service.inativar(1).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("última linha de serviço ativa");
  });

  it("inativar duas vezes é no-op, e não erro", async () => {
    await service.inativar(3);
    expect((await service.inativar(3)).ativo).toBe(false);
  });

  it("reativar traz de volta com o MESMO código", async () => {
    await service.inativar(3);
    const r = await service.reativar(3);
    expect(r.ativo).toBe(true);
    expect(r.codigo).toBe("ALTO_VOLUME");
  });
});

describe("remover", () => {
  it("apaga a linha que nunca foi usada", async () => {
    await service.remover(3);
    expect((await service.listar(true)).map((l) => l.id)).toEqual([1, 2]);
  });

  /**
   * ─ A RECUSA QUE PRESERVA O HISTÓRICO ─────────────────────────────────────────────────────────
   * Apagar uma linha usada apagaria a resposta de "de que linha era aquela vaga", que é o dado que
   * o diretor vai usar para medir a operação por linha. A FK RESTRICT recusaria de qualquer forma;
   * o que esta camada acrescenta é a frase que diz o que fazer no lugar.
   */
  it("recusa apagar linha JÁ USADA, com o número de vagas e o caminho alternativo", async () => {
    const comUso = bancoFingido(SEMENTE, { 3: 7 });
    const s = new LinhasServicoService(comUso.db);
    const erro = await s.remover(3).catch((e) => e);
    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String(erro.message)).toContain("7 vagas");
    expect(String(erro.message)).toContain("Desative-a");
  });

  /** §A.6: a frase conta VAGAS, e não diz QUAIS. Número não identifica ninguém. */
  it("a recusa não vaza identificador de vaga nenhum", async () => {
    const comUso = bancoFingido(SEMENTE, { 3: 1 });
    const s = new LinhasServicoService(comUso.db);
    const erro = await s.remover(3).catch((e) => e);
    expect(String(erro.message)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });
});

describe("a régua da escolha, pura, que o VagasService também usa", () => {
  const linhas = SEMENTE.map((l) => ({ ...l }));

  it("ausente PASSA: é o rascunho sem linha escolhida", () => {
    expect(linhaDeServicoEscolhida(linhas, null)).toBeNull();
    expect(linhaDeServicoEscolhida(linhas, undefined)).toBeNull();
  });

  it("devolve a linha ativa escolhida", () => {
    expect(linhaDeServicoEscolhida(linhas, 2)?.codigo).toBe("RPO_BPO");
  });

  it("recusa id inexistente", () => {
    expect(() => linhaDeServicoEscolhida(linhas, 99)).toThrow(BadRequestException);
  });

  /**
   * A INATIVA É RECUSADA, e este é o caso que a FK NÃO pega: a linha existe na tabela, então o banco
   * aceitaria a referência sem reclamar. Quem recusa é esta régua, e é por isso que ela precisa ser
   * a MESMA nos dois lados (o catálogo e a gravação da vaga).
   */
  it("recusa a INATIVA, que a FK deixaria passar", () => {
    const comInativa = linhas.map((l) => (l.id === 3 ? { ...l, ativo: false } : l));
    expect(() => linhaDeServicoEscolhida(comInativa, 3)).toThrow(BadRequestException);
  });
});
