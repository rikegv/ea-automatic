import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { VagasService } from "./vagas.service";

/**
 * ─ OS CONSULTORES DA AGENDA DE ENTREVISTAS (OST Central das Vagas, 16/10/2026) ──────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38): este arquivo NÃO foi escrito por quem escreveu
 * `consultoresDaAgendaDeEntrevistas`, e a sua régua sai do REQUISITO, não do código. O requisito,
 * nas palavras da OST:
 *
 *   consultor ATIVO, com papel de A&S de CONSULTOR, **E com acesso de A&S** (área `AS` em
 *   `usuario_areas`, OU SUPER_ADMIN, que está acima da segmentação). Quem só tem ADM liberado SAI.
 *   Ausência de área é FAIL-CLOSED: sem `AS`, não entra.
 *
 * ┌─ POR QUE ESTE TESTE AVALIA A CLÁUSULA REAL, E NÃO UMA CÓPIA DELA ──────────────────────────────┐
 * │ Não há Postgres em memória nesta suíte (nem pglite nem pg-mem nas dependências, conferido, o   │
 * │ mesmo registro de `retencao-sem-candidatura` e da fundação). Um banco fingido que             │
 * │ RE-IMPLEMENTASSE o filtro em JS testaria a suposição do teste, não a do código: se o autor    │
 * │ trocou `or` por `and`, ou `AS` por `ADM`, a cópia continuaria verde (a armadilha que a §A.38  │
 * │ existe para pegar: teste do autor codifica o mesmo mal-entendido do código).                  │
 * │                                                                                                │
 * │ ENTÃO O BANCO FINGIDO AQUI NÃO FILTRA: ele CAPTURA a cláusula `where` que o serviço MONTA e a  │
 * │ AVALIA, nó a nó, contra cada usuário semeado. Trocar `or` por `and`, `AS` por `ADM`, remover  │
 * │ o bypass do SUPER_ADMIN ou a guarda de `ativo`/`papel_as` muda a árvore avaliada e derruba    │
 * │ este arquivo. O `describe` final ainda SERIALIZA a cláusula e crava a forma do `EXISTS`.      │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: id, nome de usuário INTERNO, papel e área. Nenhum dado de candidato, nenhum CPF. Nomes
 * sintéticos, sem palavra do léxico real.
 */

type Papel = "COMUM" | "MASTER" | "SUPER_ADMIN";
type PapelAs = "CONSULTOR" | "RECRUITER" | null;

interface Pessoa {
  id: string;
  nome: string;
  ativo: boolean;
  papel: Papel;
  papelAs: PapelAs;
  areas: Set<"AS" | "ADM">;
}

/** O nome da coluna do schema → a propriedade da pessoa semeada. */
const COLUNA_PARA_CAMPO: Record<string, keyof Pessoa> = {
  id: "id",
  nome: "nome",
  ativo: "ativo",
  papel: "papel",
  papel_as: "papelAs",
};

// ── Predicados sobre os nós da árvore SQL do drizzle (medidos, não supostos) ──
const nomeDoCtor = (c: unknown): string =>
  (c as { constructor?: { name?: string } })?.constructor?.name ?? "";
const ehSql = (c: unknown): boolean => Array.isArray((c as { queryChunks?: unknown })?.queryChunks);
const ehStringChunk = (c: unknown): boolean => nomeDoCtor(c) === "StringChunk";
const ehParam = (c: unknown): boolean => nomeDoCtor(c) === "Param";
const ehColuna = (c: unknown): boolean =>
  typeof (c as { name?: unknown })?.name === "string" && "table" in (c as object) && !ehSql(c);
const textoDoStringChunk = (c: unknown): string => {
  const v = (c as { value?: unknown }).value;
  return Array.isArray(v) ? v.join("") : String(v ?? "");
};

/**
 * AVALIA a cláusula `where` que o serviço montou, contra UMA pessoa semeada. Caminha a árvore:
 * subconsulta EXISTS (lê a área exigida do próprio SQL), comparação `coluna = valor`, e nós lógicos
 * `and`/`or` (lê o conectivo do próprio SQL). Não há régua codificada aqui: tudo vem do nó.
 */
function avaliar(no: unknown, p: Pessoa): boolean {
  if (!ehSql(no)) throw new Error(`nó inesperado no topo da cláusula: ${nomeDoCtor(no)}`);
  const chunks = (no as { queryChunks: unknown[] }).queryChunks;
  const textoColado = chunks.filter(ehStringChunk).map(textoDoStringChunk).join(" ");

  // 1. Subconsulta EXISTS: a área exigida é lida do literal `ua.area = 'XX'`.
  if (/EXISTS/i.test(textoColado)) {
    const m = textoColado.match(/area\s*=\s*'([^']+)'/i);
    if (!m) throw new Error(`EXISTS sem literal de área reconhecível: ${textoColado}`);
    return p.areas.has(m[1] as "AS" | "ADM");
  }

  // 2. Comparação folha `coluna = valor`.
  const col = chunks.find(ehColuna) as { name: string } | undefined;
  const par = chunks.find(ehParam) as { value: unknown } | undefined;
  if (col && par) {
    const campo = COLUNA_PARA_CAMPO[col.name];
    if (!campo) throw new Error(`coluna não mapeada na comparação: ${col.name}`);
    return p[campo] === par.value;
  }

  // 3. Nó lógico: combina os filhos SQL pelo conectivo que o próprio nó carrega.
  const filhos = chunks.filter(ehSql);
  if (filhos.length === 0) throw new Error(`nó sem comparação nem filhos: ${textoColado}`);
  if (/\bor\b/i.test(textoColado)) return filhos.some((f) => avaliar(f, p));
  return filhos.every((f) => avaliar(f, p));
}

/**
 * O BANCO FINGIDO, que NÃO filtra: captura a projeção, a cláusula e a ordem que o serviço pede, e
 * resolve avaliando a cláusula REAL contra os semeados. A ordem é a que o serviço pediu (serializada
 * e conferida), não uma imposta aqui: serviço que esquecer o `orderBy` perde a ordenação no teste.
 */
function bancoDeUsuarios(pessoas: Pessoa[]) {
  const dialect = new PgDialect();
  const capturas: { cond: unknown; ordem: unknown }[] = [];
  const db = {
    select(projecao: Record<string, { name: string }>) {
      let cond: unknown = null;
      let ordem: unknown = null;
      const resolver = () => {
        capturas.push({ cond, ordem });
        let linhas = pessoas.filter((p) => avaliar(cond, p));
        const ordemSql = ordem ? dialect.sqlToQuery(ordem as never).sql : "";
        if (/nome"?\s+asc/i.test(ordemSql)) {
          linhas = [...linhas].sort((a, b) => a.nome.localeCompare(b.nome));
        } else if (/nome"?\s+desc/i.test(ordemSql)) {
          linhas = [...linhas].sort((a, b) => b.nome.localeCompare(a.nome));
        }
        return linhas.map((p) => {
          const r: Record<string, unknown> = {};
          for (const chave of Object.keys(projecao)) {
            const campo = COLUNA_PARA_CAMPO[projecao[chave].name] ?? (projecao[chave].name as keyof Pessoa);
            r[chave] = p[campo as keyof Pessoa];
          }
          return r;
        });
      };
      const chain = {
        from: () => chain,
        where: (c: unknown) => {
          cond = c;
          return chain;
        },
        orderBy: (o: unknown) => {
          ordem = o;
          return Promise.resolve(resolver());
        },
      };
      return chain;
    },
  };
  return { db, capturas };
}

function montar(pessoas: Pessoa[]) {
  const { db, capturas } = bancoDeUsuarios(pessoas);
  const service = new VagasService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
  );
  return { service, capturas };
}

// ── A população semeada, uma pessoa por caso que a OST distingue ──────────────
const CONSULTOR_AS: Pessoa = {
  id: "u-consultor-as",
  nome: "Bruna Consultora Acesso",
  ativo: true,
  papel: "COMUM",
  papelAs: "CONSULTOR",
  areas: new Set(["AS"]),
};
const SO_ADM: Pessoa = {
  id: "u-so-adm",
  nome: "Carla Somente Adm",
  ativo: true,
  papel: "COMUM",
  papelAs: "CONSULTOR",
  areas: new Set(["ADM"]),
};
const SEM_AREA: Pessoa = {
  id: "u-sem-area",
  nome: "Diego Sem Area",
  ativo: true,
  papel: "COMUM",
  papelAs: "CONSULTOR",
  areas: new Set(),
};
const SUPER_SEM_AS: Pessoa = {
  id: "u-super",
  nome: "Alice Super Admin",
  ativo: true,
  papel: "SUPER_ADMIN",
  papelAs: "CONSULTOR",
  areas: new Set(),
};
const HIBRIDO: Pessoa = {
  id: "u-hibrido",
  nome: "Bianca Hibrida Duas Areas",
  ativo: true,
  papel: "COMUM",
  papelAs: "CONSULTOR",
  areas: new Set(["ADM", "AS"]),
};
const INATIVO_AS: Pessoa = {
  id: "u-inativo",
  nome: "Eduarda Inativa",
  ativo: false,
  papel: "COMUM",
  papelAs: "CONSULTOR",
  areas: new Set(["AS"]),
};
const RECRUITER_AS: Pessoa = {
  id: "u-recruiter",
  nome: "Fabio Recruiter",
  ativo: true,
  papel: "COMUM",
  papelAs: "RECRUITER",
  areas: new Set(["AS"]),
};
const SEM_PAPEL_AS: Pessoa = {
  id: "u-sem-papel",
  nome: "Gisele Sem Papel As",
  ativo: true,
  papel: "COMUM",
  papelAs: null,
  areas: new Set(["AS"]),
};

const POPULACAO: Pessoa[] = [
  CONSULTOR_AS,
  SO_ADM,
  SEM_AREA,
  SUPER_SEM_AS,
  HIBRIDO,
  INATIVO_AS,
  RECRUITER_AS,
  SEM_PAPEL_AS,
];

const ids = (lista: { id: string }[]) => lista.map((x) => x.id);

describe("A agenda só lista o consultor ATIVO, de A&S, COM acesso de A&S", () => {
  it("o consultor ativo COM área AS aparece", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).toContain(CONSULTOR_AS.id);
  });

  /** O BUG QUE A OST CONSERTA: quem só tem ADM liberado entrava, e não podia. */
  it("o consultor que só tem ADM NÃO aparece", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).not.toContain(SO_ADM.id);
  });

  /** FAIL-CLOSED: sem nenhuma área, não entra (o oposto seria fail-open, §A.3 do schema). */
  it("o consultor SEM nenhuma área NÃO aparece", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).not.toContain(SEM_AREA.id);
  });

  /** BYPASS: SUPER_ADMIN está acima da segmentação de área e enxerga A&S por construção. */
  it("o SUPER_ADMIN consultor aparece mesmo SEM área AS", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).toContain(SUPER_SEM_AS.id);
  });

  /** O híbrido (ADM + AS) aparece: basta ter a área AS entre as suas. */
  it("o consultor híbrido (ADM e AS) aparece", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).toContain(HIBRIDO.id);
  });

  it("o consultor INATIVO não aparece, mesmo com área AS", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).not.toContain(INATIVO_AS.id);
  });

  it("o RECRUITER não aparece, mesmo com área AS", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).not.toContain(RECRUITER_AS.id);
  });

  it("quem não tem papel de A&S não aparece, mesmo com área AS", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresDaAgendaDeEntrevistas())).not.toContain(SEM_PAPEL_AS.id);
  });

  it("a lista é EXATAMENTE os três elegíveis, e nada mais", async () => {
    const { service } = montar(POPULACAO);
    const lista = await service.consultoresDaAgendaDeEntrevistas();
    expect(ids(lista).sort()).toEqual([SUPER_SEM_AS.id, HIBRIDO.id, CONSULTOR_AS.id].sort());
  });

  it("ordena por nome ASC (a ordem que o serviço pede, não a de inserção)", async () => {
    const { service } = montar(POPULACAO);
    const lista = await service.consultoresDaAgendaDeEntrevistas();
    expect(lista.map((x) => (x as { nome: string }).nome)).toEqual([
      "Alice Super Admin",
      "Bianca Hibrida Duas Areas",
      "Bruna Consultora Acesso",
    ]);
  });

  it("devolve id e nome, e mais nada (§A.6)", async () => {
    const { service } = montar(POPULACAO);
    const lista = await service.consultoresDaAgendaDeEntrevistas();
    for (const p of lista) expect(Object.keys(p as object).sort()).toEqual(["id", "nome"]);
  });
});

describe("REGRESSÃO (§A.14): a lista da TRANSFERÊNCIA segue com o critério antigo, intacta", () => {
  /**
   * `consultoresParaTransferencia` NÃO foi tocada pela OST e NÃO segmenta por área: ativo + papel
   * de A&S de CONSULTOR, e pronto. O consultor que só tem ADM, que a AGENDA passa a excluir,
   * continua elegível AQUI. Se a OST tivesse mexido na lista errada, este caso ficaria vermelho.
   */
  it("o consultor que só tem ADM AINDA aparece na transferência", async () => {
    const { service } = montar(POPULACAO);
    expect(ids(await service.consultoresParaTransferencia())).toContain(SO_ADM.id);
  });

  it("a transferência ignora área: o sem-área e o só-ADM entram; o RECRUITER e o inativo não", async () => {
    const { service } = montar(POPULACAO);
    const transferencia = ids(await service.consultoresParaTransferencia());
    expect(transferencia.sort()).toEqual(
      [CONSULTOR_AS.id, SO_ADM.id, SEM_AREA.id, SUPER_SEM_AS.id, HIBRIDO.id].sort(),
    );
    expect(transferencia).not.toContain(RECRUITER_AS.id);
    expect(transferencia).not.toContain(INATIVO_AS.id);
  });

  it("a agenda é um SUBCONJUNTO ESTRITO da transferência (segmenta a mais, nunca a menos)", async () => {
    const { service } = montar(POPULACAO);
    const agenda = ids(await service.consultoresDaAgendaDeEntrevistas());
    const transferencia = ids(await service.consultoresParaTransferencia());
    for (const id of agenda) expect(transferencia).toContain(id);
    expect(agenda.length).toBeLessThan(transferencia.length);
  });
});

describe("A FORMA do SQL que a agenda monta (o EXISTS é sobre usuario_areas, área 'AS')", () => {
  const condicaoDaAgenda = async () => {
    const { service, capturas } = montar(POPULACAO);
    await service.consultoresDaAgendaDeEntrevistas();
    return new PgDialect().sqlToQuery(capturas[0].cond as never);
  };

  it("exige ativo, papel_as = CONSULTOR e o par SUPER_ADMIN / EXISTS", async () => {
    const { sql, params } = await condicaoDaAgenda();
    expect(sql).toContain('"usuarios"."ativo"');
    expect(sql).toContain('"usuarios"."papel_as"');
    expect(sql).toContain('"usuarios"."papel"');
    expect(params).toContain(true);
    expect(params).toContain("CONSULTOR");
    expect(params).toContain("SUPER_ADMIN");
  });

  it("o acesso de A&S é um EXISTS sobre usuario_areas, correlacionado por usuarios.id, área 'AS'", async () => {
    const { sql } = await condicaoDaAgenda();
    expect(sql).toMatch(/EXISTS \(SELECT 1 FROM "usuario_areas"/i);
    expect(sql).toMatch(/ua\.usuario_id = "usuarios"\."id"/i);
    expect(sql).toMatch(/ua\.area = 'AS'/i);
    // o bug seria 'ADM': crava que NÃO é.
    expect(sql).not.toMatch(/ua\.area = 'ADM'/i);
  });

  it("o SUPER_ADMIN e o EXISTS estão em OR (bypass), não em AND", async () => {
    const { sql } = await condicaoDaAgenda();
    expect(sql).toMatch(/"usuarios"\."papel" = \$3 or EXISTS/i);
  });
});
