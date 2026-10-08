import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asCandidaturas,
  portalLinks,
  portalPendenciasNoTime,
  portalTermoAceite,
  usuarios,
} from "../db/schema";
import { FAROIS_FORA_DO_PAINEL, PortalPainelService } from "./portal-painel.service";

/**
 * COBERTURA INDEPENDENTE (§A.38/§A.39) DO NOVO RECORTE DO GERENCIADOR DO PORTAL: "TEM LINK VIVO".
 *
 * Escrita a partir do REQUISITO, não do código: o recorte deixou de excluir o Fluxo 2 pela ORIGEM
 * (o antigo `SO_FLUXO_DO_FUNIL_DE_AS`: Pandapé-sem-candidatura saía por ser Pandapé) e passou a ser
 * "a admissão aparece SSE tem pelo menos um link NÃO-revogado" (EXISTS de `portal_links.revogado_em
 * is null`). O único critério passa a ser o link vivo; origem e candidatura não recortam mais.
 *
 * ┌─ POR QUE O BANCO DE MENTIRINHA DESTE ARQUIVO HONRA O `where`, E NÃO SÓ O RECEBE ───────────────┐
 * │ Um fake que monta as linhas prontas daria VERDE para um serviço que esquecesse o recorte, e o  │
 * │ defeito (Fluxo 2 reaparecendo, ou só-revogado vazando) só surgiria na tela. Aqui o fake LÊ a   │
 * │ cláusula que o serviço realmente manda: detecta `revogado_em` (a regra nova) e, se estiver      │
 * │ presente, exige link vivo; detecta `origem`/`PANDAPE` (a regra ANTIGA) e, se estiver presente,  │
 * │ aplica a exclusão de origem. Assim os dois casos-chave (o "Ismael" e o "só-revogado") são       │
 * │ COMPORTAMENTO dependente do serviço, não tautologia: sob o recorte antigo eles ficariam         │
 * │ VERMELHOS, sob o novo ficam verdes. É o teste que "deveria falhar" caso a troca regredisse.     │
 * └────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: tudo aqui é id técnico, contagem, carimbo e nome SINTÉTICO. Nenhum CPF, nenhum dado real.
 */

const CODIGO_SERVICO = semComentarios(
  readFileSync(join(__dirname, "portal-painel.service.ts"), "utf8"),
);

const HOJE = Date.now();
const rel = (ms: number) => new Date(HOJE + ms);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// O BANCO DE MENTIRINHA, QUE HONRA O PREDICADO QUE O SERVIÇO MANDA
// ══════════════════════════════════════════════════════════════════════════════════════════════

interface LinkFake {
  id?: string;
  admissaoId: string;
  criadoEm: Date;
  expiraEm: Date;
  revogadoEm?: Date | null;
  suspensoAte?: Date | null;
  primeiroAcessoEm?: Date | null;
  ultimoAcessoEm?: Date | null;
  envioOrigem?: string | null;
}

interface MetaFake {
  codCliente: string;
  cliente: string;
  cargoId: string;
  cargo: string;
}

interface DadosFake {
  links: LinkFake[];
  /** Farol por admissão. Ausente = `EM_ADMISSAO` (viva). */
  farol?: Record<string, string>;
  /** `admissoes.origem`. Ausente = `MANUAL` (não-Pandapé). Modela o lado do recorte ANTIGO. */
  origem?: Record<string, string>;
  /** Quem tem `as_candidaturas` ligada: vira `origemAdmissao="ATRACAO_SELECAO"`, e salva do antigo recorte. */
  candidaturasAS?: string[];
  noTime?: string[];
  termosAceitos?: string[];
  cabecalhos?: {
    admissaoId: string;
    nome: string;
    cargo: string;
    cliente: string;
    dataAdmissao?: string | null;
  }[];
  /** Por admissão: o par (cliente, cargo) que a consulta do CATÁLOGO (§A.37) devolveria. */
  meta?: Record<string, MetaFake>;
  /** Eventos `ENVIADO_PARA_ADMISSAO` do funil: o autor do envio (consultor), com carimbo. */
  enviosParaAdmissao?: { admissaoId: string; consultor: string; ocorridoEm: Date }[];
  /**
   * O LIBERADOR DO LINK (`portal_links.criado_por_id` -> `usuarios.nome`), por admissão. É o
   * fallback do requisito 6. Só é consultado SE o serviço fizer a consulta que projeta
   * `{ admissaoId: portalLinks.admissaoId, nome: usuarios.nome }`. Se não fizer, fica inerte e o
   * `consultorQueEnviou` cai em `null`, que é o estado que a ausência do fallback produz.
   */
  liberadores?: { admissaoId: string; nome: string }[];
}

/** O `inArray(portalLinks.admissaoId, [...])` lido da árvore do Drizzle (recorte derivado). */
function idsExigidos(condicao: unknown): string[] | null {
  const chunks = (no: unknown): unknown[] | null => {
    const alvo = no as { queryChunks?: unknown[] } | null;
    return alvo && Array.isArray(alvo.queryChunks) ? alvo.queryChunks : null;
  };
  const textoDoChunk = (no: unknown): string | null => {
    const alvo = no as { value?: unknown } | null;
    if (alvo && Array.isArray(alvo.value) && typeof alvo.value[0] === "string") {
      return alvo.value[0];
    }
    return null;
  };
  const nomeDaColuna = (no: unknown): string | null => {
    const alvo = no as { name?: unknown; columnType?: unknown } | null;
    return alvo && typeof alvo.name === "string" && alvo.columnType ? alvo.name : null;
  };
  const visitar = (no: unknown): string[] | null => {
    const filhos = chunks(no);
    if (!filhos) return null;
    for (let i = 0; i < filhos.length; i += 1) {
      if (textoDoChunk(filhos[i]) === "false") return [];
      if (
        nomeDaColuna(filhos[i]) === "admissao_id" &&
        textoDoChunk(filhos[i + 1]) === " in " &&
        Array.isArray(filhos[i + 2])
      ) {
        return (filhos[i + 2] as { value?: unknown }[])
          .map((p) => p.value)
          .filter((v): v is string => typeof v === "string");
      }
    }
    for (const filho of filhos) {
      const achado = visitar(filho);
      if (achado !== null) return achado;
    }
    return null;
  };
  return visitar(condicao);
}

/**
 * A CONDIÇÃO CITA `termo`? Procura por COLUNA de nome `termo` OU por TEXTO que o contenha, em
 * qualquer ponto da árvore. É isto que permite ao fake saber QUAL regra o serviço aplicou:
 * `revogado_em` (regra nova) ou `origem`/`PANDAPE` (regra antiga).
 */
function citaNaCondicao(condicao: unknown, termo: string): boolean {
  const visitar = (no: unknown): boolean => {
    if (no == null) return false;
    if (Array.isArray(no)) return no.some(visitar);
    if (typeof no !== "object") return false;
    const alvo = no as { name?: unknown; columnType?: unknown; value?: unknown; queryChunks?: unknown[] };
    if (typeof alvo.name === "string" && alvo.columnType && alvo.name === termo) return true;
    if (
      Array.isArray(alvo.value) &&
      alvo.value.some((v) => typeof v === "string" && v.includes(termo))
    ) {
      return true;
    }
    if (Array.isArray(alvo.queryChunks) && alvo.queryChunks.some(visitar)) return true;
    return false;
  };
  return visitar(condicao);
}

function banco(dados: DadosFake) {
  const links = dados.links;
  const farolDe = (id: string) => dados.farol?.[id] ?? "EM_ADMISSAO";
  const origemDe = (id: string) => dados.origem?.[id] ?? "MANUAL";
  const comCandidatura = new Set(dados.candidaturasAS ?? []);

  const todas = [...new Set(links.map((l) => l.admissaoId))];
  const temAlgumLink = (id: string) => links.some((l) => l.admissaoId === id);
  const temLinkVivo = (id: string) =>
    links.some((l) => l.admissaoId === id && (l.revogadoEm === null || l.revogadoEm === undefined));
  const farolVivo = (id: string) =>
    !(FAROIS_FORA_DO_PAINEL as readonly string[]).includes(farolDe(id));
  const permaneceNoFluxoAntigo = (id: string) =>
    origemDe(id) !== "PANDAPE" || comCandidatura.has(id);

  /**
   * A VISIBILIDADE, DADA A CONDIÇÃO QUE O SERVIÇO MANDOU. Ela aplica SÓ o que a cláusula realmente
   * contém, então o resultado reflete o recorte vigente do serviço (novo ou antigo), não o do fake.
   */
  const visivel = (id: string, condicao: unknown): boolean => {
    if (!temAlgumLink(id)) return false; // o FROM é `portal_links`: sem link, não há linha
    if (!farolVivo(id)) return false; // §A.16: o filtro de farol permanece e é separado
    if (citaNaCondicao(condicao, "revogado_em") && !temLinkVivo(id)) return false; // REGRA NOVA
    if (
      (citaNaCondicao(condicao, "origem") || citaNaCondicao(condicao, "PANDAPE")) &&
      !permaneceNoFluxoAntigo(id)
    ) {
      return false; // REGRA ANTIGA (só dispara se o serviço regredir e voltar a filtrar por origem)
    }
    const exigidos = idsExigidos(condicao);
    if (exigidos !== null && !exigidos.includes(id)) return false; // recorte derivado (aba, etc.)
    return true;
  };

  const linksDe = (id: string) => links.filter((l) => l.admissaoId === id);
  const ultimoAcessoDe = (id: string): Date | null => {
    const acessos = linksDe(id)
      .map((l) => l.ultimoAcessoEm)
      .filter((d): d is Date => d instanceof Date);
    return acessos.length ? new Date(Math.max(...acessos.map((d) => d.getTime()))) : null;
  };

  const resolver = (
    projecao: Record<string, unknown>,
    condicao: unknown,
    local: { limites: number[]; deslocamentos: number[] },
  ): unknown[] => {
    const tem = (c: string) => Object.keys(projecao ?? {}).includes(c);
    const visiveis = todas.filter((id) => visivel(id, condicao));

    if (tem("total")) return [{ total: visiveis.length }];
    if (tem("codCliente")) {
      // O CATÁLOGO (§A.37) sai do recorte: só pares de admissões que PERMANECEM entram.
      const vistos = new Set<string>();
      const out: MetaFake[] = [];
      for (const id of visiveis) {
        const m = dados.meta?.[id];
        if (!m) continue;
        const chave = `${m.codCliente}|${m.cargoId}`;
        if (!vistos.has(chave)) {
          vistos.add(chave);
          out.push(m);
        }
      }
      return out;
    }
    if (tem("acessou")) {
      // O RECORTE do funil (sem `inArray`): agrega sobre TODOS os links da admissão.
      return visiveis.map((admissaoId) => ({
        admissaoId,
        acessou: linksDe(admissaoId).some((l) => l.primeiroAcessoEm != null),
        ultimoAcessoEm: ultimoAcessoDe(admissaoId),
      }));
    }
    if (tem("encaminhadoEm")) {
      const linhas = visiveis
        .map((admissaoId) => ({
          admissaoId,
          ultimoAcessoEm: ultimoAcessoDe(admissaoId),
          encaminhadoEm: new Date(Math.max(...linksDe(admissaoId).map((l) => l.criadoEm.getTime()))),
        }))
        .sort((a, b) => b.encaminhadoEm.getTime() - a.encaminhadoEm.getTime());
      const inicio = local.deslocamentos.at(-1) ?? 0;
      const limite = local.limites.at(-1) ?? linhas.length;
      return linhas.slice(inicio, inicio + limite);
    }
    // CONSULTAS QUE PROJETAM `usuarios.nome`: o funil (asCandidaturas) e o liberador (portalLinks).
    // A distinção é pela COLUNA do `admissaoId`, nunca pela forma: as duas projetam `nome`.
    if (projecao?.nome === usuarios.nome) {
      if (projecao?.admissaoId === portalLinks.admissaoId) {
        return (dados.liberadores ?? []).map((l) => ({ admissaoId: l.admissaoId, nome: l.nome }));
      }
      return [...(dados.enviosParaAdmissao ?? [])]
        .sort((a, b) => b.ocorridoEm.getTime() - a.ocorridoEm.getTime())
        .map((e) => ({ admissaoId: e.admissaoId, nome: e.consultor }));
    }
    if (tem("nome")) return dados.cabecalhos ?? [];
    if (tem("expiraEm")) {
      const ex = idsExigidos(condicao);
      return ex === null ? links : links.filter((l) => ex.includes(l.admissaoId));
    }
    // AS TRÊS CONSULTAS QUE PROJETAM SÓ `admissaoId`, distinguidas pela TABELA (a coluna projetada).
    if (projecao?.admissaoId === portalTermoAceite.admissaoId) {
      return (dados.termosAceitos ?? []).map((admissaoId) => ({ admissaoId }));
    }
    if (projecao?.admissaoId === portalPendenciasNoTime.admissaoId) {
      return (dados.noTime ?? []).map((admissaoId) => ({ admissaoId }));
    }
    if (projecao?.admissaoId === asCandidaturas.admissaoId) {
      return (dados.candidaturasAS ?? []).map((admissaoId) => ({ admissaoId }));
    }
    return [];
  };

  const cadeia = (projecao: Record<string, unknown>): unknown => {
    const local = { limites: [] as number[], deslocamentos: [] as number[] };
    let condicao: unknown;
    const proxy: unknown = new Proxy(
      {},
      {
        get(_alvo, prop) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resolver(projecao, condicao, local)).then(ok, erro);
          }
          if (prop === "where") {
            return (c: unknown) => {
              condicao = c;
              return proxy;
            };
          }
          if (prop === "limit") {
            return (n: number) => {
              local.limites.push(n);
              return proxy;
            };
          }
          if (prop === "offset") {
            return (n: number) => {
              local.deslocamentos.push(n);
              return proxy;
            };
          }
          return () => proxy;
        },
      },
    );
    return proxy;
  };

  return {
    select: (p: Record<string, unknown> = {}) => cadeia(p),
    selectDistinct: (p: Record<string, unknown> = {}) => cadeia(p),
  } as never;
}

/** A régua é do `ReguaCompletudeService` (§A.19); o painel só consome. Padrão: 10 obrigatórios pendentes. */
function regua(dados: {
  progresso?: Record<string, { entregues: number; total: number }>;
  proximo?: Record<string, string | null>;
}) {
  return {
    progressoObrigatoriosMap: async (ids: string[]) =>
      new Map(ids.map((id) => [id, dados.progresso?.[id] ?? { entregues: 0, total: 10 }])),
    proximoObrigatorioPendenteMap: async (ids: string[]) =>
      new Map(ids.map((id) => [id, dados.proximo?.[id] ?? null])),
  } as never;
}

const servico = (dados: DadosFake, r = regua({})) => new PortalPainelService(banco(dados), r);

/** Um link vivo (não-revogado, prazo no futuro), a casa normal da fila. */
const linkVivo = (admissaoId: string, extra: Partial<LinkFake> = {}): LinkFake => ({
  admissaoId,
  criadoEm: rel(-10_000),
  expiraEm: rel(3_600_000),
  ...extra,
});

/** Um link cujo único destino é estar revogado: carrega a data de revogação. */
const linkRevogado = (admissaoId: string, extra: Partial<LinkFake> = {}): LinkFake => ({
  admissaoId,
  criadoEm: rel(-20_000),
  expiraEm: rel(3_600_000),
  revogadoEm: rel(-5_000),
  ...extra,
});

// ══ A. A TROCA ACONTECEU, EM CÓDIGO (o recorte é link vivo, não mais origem) ═════════════════════

describe("A troca do recorte está no código do serviço", () => {
  it("o recorte novo existe: `TEM_LINK_VIVO`, um EXISTS com `revogado_em is null`", () => {
    expect(CODIGO_SERVICO).toMatch(/const TEM_LINK_VIVO\b/);
    expect(CODIGO_SERVICO).toMatch(/exists\s*\(/i);
    expect(CODIGO_SERVICO).toMatch(/revogado_em is null/);
  });

  it("o recorte ANTIGO por origem saiu: nem `SO_FLUXO_DO_FUNIL_DE_AS`, nem `PANDAPE`, nem `admissoes.origem` no filtro", () => {
    expect(CODIGO_SERVICO).not.toContain("SO_FLUXO_DO_FUNIL_DE_AS");
    expect(CODIGO_SERVICO).not.toContain("PANDAPE");
    // A origem ainda é DERIVADA (origemAdmissao/origemEnvio), mas a COLUNA `admissoes.origem` não é
    // mais lida: era só ela que o recorte antigo usava para excluir o Fluxo 2.
    expect(CODIGO_SERVICO).not.toMatch(/admissoes\.origem\b/);
  });

  it("o recorte novo é aplicado em TODA consulta que define o universo, igual ao filtro de farol", () => {
    const vivo = (CODIGO_SERVICO.match(/TEM_LINK_VIVO/g) ?? []).length - 1; // menos a declaração
    const farol = (CODIGO_SERVICO.match(/notInArray\(admissoes\.farolGlobal/g) ?? []).length;
    expect(farol).toBe(4); // recorte do funil, total, página e catálogo
    expect(vivo).toBe(farol); // onde o farol recorta, o link vivo também recorta
  });

  it.each([
    ["o recorte do funil", "acessou: sql<boolean>"],
    ["o total da lista", "total: sql<number>"],
    ["a página", "encaminhadoEm: sql<Date>"],
    ["o catálogo de filtros", "codCliente: admissoes.codCliente"],
  ])("%s aplica `TEM_LINK_VIVO`", (_nome, ancora) => {
    const inicio = CODIGO_SERVICO.indexOf(ancora);
    expect(inicio).toBeGreaterThan(0);
    expect(CODIGO_SERVICO.slice(inicio, inicio + 900)).toContain("TEM_LINK_VIVO");
  });
});

// ══ B. REQUISITO 1: LINK SÓ REVOGADO NÃO APARECE EM LUGAR NENHUM ═════════════════════════════════

describe("requisito 1: a admissão cujo único link está revogado some de tudo", () => {
  it("sozinha, ela não lista, zera os cinco contadores e não entra no catálogo", async () => {
    const dados: DadosFake = {
      links: [linkRevogado("so-revogada", { primeiroAcessoEm: rel(-8_000), ultimoAcessoEm: rel(-8_000) })],
      meta: { "so-revogada": { codCliente: "C1", cliente: "Loja 1", cargoId: "G1", cargo: "Aux" } },
    };
    expect(await servico(dados).resumo()).toEqual({
      encaminhados: 0,
      acessaram: 0,
      naoAcessaram: 0,
      concluiram: 0,
      intervencaoHumana: 0,
    });
    const pagina = await servico(dados).listar({});
    expect(pagina.total).toBe(0);
    expect(pagina.itens).toEqual([]);
    const catalogo = await servico(dados).catalogoDeFiltros();
    expect(catalogo.clientes).toEqual([]);
    expect(catalogo.cargos).toEqual([]);
  });

  it("ao lado de uma viva, não infla nenhum número: a conta é só a da viva", async () => {
    const dados: DadosFake = {
      links: [
        linkRevogado("so-revogada"),
        ...[linkRevogado("tambem-so-revogada", { criadoEm: rel(-30_000) })],
        linkVivo("viva", { primeiroAcessoEm: rel(-4_000), ultimoAcessoEm: rel(-4_000) }),
      ],
      meta: {
        "so-revogada": { codCliente: "C1", cliente: "Loja 1", cargoId: "G1", cargo: "Aux" },
        "tambem-so-revogada": { codCliente: "C9", cliente: "Loja 9", cargoId: "G9", cargo: "Op" },
        viva: { codCliente: "C2", cliente: "Loja 2", cargoId: "G2", cargo: "Op" },
      },
    };
    const r = await servico(dados).resumo();
    expect(r.encaminhados).toBe(1);
    expect(r.acessaram).toBe(1);
    const pagina = await servico(dados).listar({});
    expect(pagina.total).toBe(1);
    expect(pagina.itens.map((i) => i.admissaoId)).toEqual(["viva"]);
    const catalogo = await servico(dados).catalogoDeFiltros();
    expect(catalogo.clientes.map((c) => c.valor)).toEqual(["C2"]);
  });
});

// ══ C. REQUISITO 2: ≥1 LINK VIVO APARECE, NAS DUAS FORMAS ════════════════════════════════════════

describe("requisito 2: a admissão com pelo menos um link vivo aparece", () => {
  it("(a) origem MANUAL com candidatura de A&S aparece, com a tag ATRACAO_SELECAO", async () => {
    const dados: DadosFake = {
      links: [linkVivo("manual-as")],
      origem: { "manual-as": "MANUAL" },
      candidaturasAS: ["manual-as"],
      cabecalhos: [{ admissaoId: "manual-as", nome: "Sintético A", cargo: "Aux", cliente: "Loja 1" }],
    };
    expect((await servico(dados).resumo()).encaminhados).toBe(1);
    const [linha] = (await servico(dados).listar({})).itens;
    expect(linha.admissaoId).toBe("manual-as");
    expect(linha.origemAdmissao).toBe("ATRACAO_SELECAO");
  });

  /**
   * (b) O CASO "ISMAEL", QUE É O CORAÇÃO DA TROCA: origem PANDAPE, SEM candidatura de A&S, com link
   * vivo. O recorte ANTIGO a excluía pela origem; o novo tem de INCLUÍ-LA, porque ela tem link vivo.
   * A tag de origem continua `MANUAL` (não há candidatura), e isso é certo: a origem da ADMISSÃO é
   * derivada da candidatura, não é o que decide o recorte.
   */
  it("(b) origem PANDAPE SEM candidatura, com link vivo, APARECE (o caso Ismael)", async () => {
    const dados: DadosFake = {
      links: [linkVivo("ismael")],
      origem: { ismael: "PANDAPE" },
      candidaturasAS: [],
      cabecalhos: [{ admissaoId: "ismael", nome: "Sintético Ismael", cargo: "Op", cliente: "Loja 3" }],
      meta: { ismael: { codCliente: "C3", cliente: "Loja 3", cargoId: "G3", cargo: "Op" } },
    };
    expect((await servico(dados).resumo()).encaminhados).toBe(1);
    const pagina = await servico(dados).listar({});
    expect(pagina.total).toBe(1);
    expect(pagina.itens.map((i) => i.admissaoId)).toEqual(["ismael"]);
    expect(pagina.itens[0].origemAdmissao).toBe("MANUAL");
    const catalogo = await servico(dados).catalogoDeFiltros();
    expect(catalogo.clientes.map((c) => c.valor)).toEqual(["C3"]);
  });
});

// ══ D. REQUISITO 3: NÃO HÁ MAIS EXCLUSÃO POR FLUXO 2 / ORIGEM ═══════════════════════════════════

describe("requisito 3: o único critério é ter link vivo, não a origem nem a candidatura", () => {
  /**
   * Quatro admissões, as quatro combinações de (origem × candidatura), TODAS com link vivo. Sob o
   * recorte antigo, a PANDAPE-sem-candidatura cairia; sob o novo, as quatro permanecem, porque a
   * origem deixou de recortar.
   */
  it("com link vivo, as quatro combinações de origem e candidatura permanecem", async () => {
    const dados: DadosFake = {
      links: [
        linkVivo("manual-com"),
        linkVivo("manual-sem"),
        linkVivo("pandape-com"),
        linkVivo("pandape-sem"),
      ],
      origem: {
        "manual-com": "MANUAL",
        "manual-sem": "MANUAL",
        "pandape-com": "PANDAPE",
        "pandape-sem": "PANDAPE",
      },
      candidaturasAS: ["manual-com", "pandape-com"],
    };
    expect((await servico(dados).resumo()).encaminhados).toBe(4);
    const ids = (await servico(dados).listar({})).itens.map((i) => i.admissaoId).sort();
    expect(ids).toEqual(["manual-com", "manual-sem", "pandape-com", "pandape-sem"]);
  });

  /**
   * O OUTRO LADO: a candidatura NÃO salva quem não tem link vivo. Uma MANUAL com candidatura, mas de
   * link só revogado, SAI; uma PANDAPE sem candidatura, de link vivo, FICA. É a prova de que o link
   * vivo é o único eixo, e não um "OU" com o antigo.
   */
  it("a candidatura não salva o link só-revogado, e a falta dela não derruba o link vivo", async () => {
    const dados: DadosFake = {
      links: [linkRevogado("manual-com-revogada"), linkVivo("pandape-sem-viva")],
      origem: { "manual-com-revogada": "MANUAL", "pandape-sem-viva": "PANDAPE" },
      candidaturasAS: ["manual-com-revogada"],
    };
    const ids = (await servico(dados).listar({})).itens.map((i) => i.admissaoId);
    expect(ids).toEqual(["pandape-sem-viva"]);
    expect((await servico(dados).resumo()).encaminhados).toBe(1);
  });
});

// ══ E. REQUISITO 4: VIVO + REVOGADO (REEMISSÃO) APARECE UMA VEZ, AGREGANDO TODOS OS LINKS ════════

describe("requisito 4: reemissão (um link vivo, um revogado) aparece uma vez", () => {
  const reemitida: LinkFake[] = [
    linkRevogado("reemitida", {
      criadoEm: rel(-30_000),
      primeiroAcessoEm: rel(-25_000),
      ultimoAcessoEm: rel(-24_000),
    }),
    linkVivo("reemitida", { id: "link-vigente", criadoEm: rel(-1_000), envioOrigem: "MANUAL" }),
  ];

  it("uma linha só, com o acesso do link REVOGADO ainda contando e o estado do VIGENTE", async () => {
    const pagina = await servico({ links: reemitida }).listar({});
    expect(pagina.total).toBe(1);
    expect(pagina.itens).toHaveLength(1);
    const [linha] = pagina.itens;
    expect(linha.admissaoId).toBe("reemitida");
    // O agregado de acesso considera TODOS os links: o carimbo veio do revogado, não do vigente.
    expect(linha.ultimoAcessoEm).toBe(rel(-24_000).toISOString());
    // O estado é o do link VIGENTE (o vivo mais recente), que é o que o consultor usa agora.
    expect(linha.estadoLink).toBe("VIVO");
    expect(linha.linkJti).toBe("link-vigente");
  });

  it("no funil, conta como UMA pessoa e como UM acesso", async () => {
    const r = await servico({ links: reemitida }).resumo();
    expect(r.encaminhados).toBe(1);
    expect(r.acessaram).toBe(1);
    expect(r.naoAcessaram).toBe(0);
  });

  it("com vizinhos, o total da lista continua batendo com o funil", async () => {
    const dados: DadosFake = {
      links: [...reemitida, linkVivo("vizinha"), linkRevogado("vizinha-morta", { criadoEm: rel(-40_000) })],
    };
    const r = await servico(dados).resumo();
    const pagina = await servico(dados).listar({});
    expect(r.encaminhados).toBe(2); // reemitida + vizinha; vizinha-morta sai
    expect(pagina.total).toBe(r.encaminhados);
    expect(new Set(pagina.itens.map((i) => i.admissaoId))).toEqual(new Set(["reemitida", "vizinha"]));
  });
});

// ══ F. REQUISITO 5: LISTA, CONTADORES E CATÁLOGO CONCORDAM (§A.37) ══════════════════════════════

describe("requisito 5: lista, contadores e catálogo mostram exatamente a mesma gente", () => {
  it("ninguém é mostrado por uma superfície e escondido por outra", async () => {
    const dados: DadosFake = {
      links: [
        linkVivo("v1"),
        linkVivo("v2", { primeiroAcessoEm: rel(-3_000), ultimoAcessoEm: rel(-3_000) }),
        linkVivo("v3", { id: "jti-v3" }),
        linkRevogado("morta-1"),
        linkRevogado("morta-2", { criadoEm: rel(-50_000) }),
        linkVivo("declinada"),
      ],
      farol: { declinada: "DECLINOU" },
      meta: {
        v1: { codCliente: "C1", cliente: "Loja 1", cargoId: "G1", cargo: "Aux" },
        v2: { codCliente: "C2", cliente: "Loja 2", cargoId: "G2", cargo: "Op" },
        v3: { codCliente: "C3", cliente: "Loja 3", cargoId: "G1", cargo: "Aux" },
        // As que não entram também têm meta, para provar que elas NÃO vazam para o catálogo.
        "morta-1": { codCliente: "C8", cliente: "Loja 8", cargoId: "G8", cargo: "X" },
        "morta-2": { codCliente: "C7", cliente: "Loja 7", cargoId: "G7", cargo: "Y" },
        declinada: { codCliente: "C6", cliente: "Loja 6", cargoId: "G6", cargo: "Z" },
      },
    };
    const esperado = new Set(["v1", "v2", "v3"]);

    const r = await servico(dados).resumo();
    const pagina = await servico(dados).listar({});
    const catalogo = await servico(dados).catalogoDeFiltros();

    // Contadores: só as três vivas-com-link-vivo entram.
    expect(r.encaminhados).toBe(3);
    // Lista: os mesmos três ids, e o total bate com o funil.
    expect(new Set(pagina.itens.map((i) => i.admissaoId))).toEqual(esperado);
    expect(pagina.total).toBe(r.encaminhados);
    // Catálogo: só os clientes/cargos das três; nada das mortas nem da declinada.
    expect(catalogo.clientes.map((c) => c.valor).sort()).toEqual(["C1", "C2", "C3"]);
    expect(catalogo.cargos.map((c) => c.valor).sort()).toEqual(["G1", "G2"]);
    for (const fantasma of ["C6", "C7", "C8"]) {
      expect(catalogo.clientes.map((c) => c.valor)).not.toContain(fantasma);
    }
  });
});

// ══ G. REQUISITO 6: A TAG DE ORIGEM E O CONSULTOR (SE O CONTRATO EXPÕE) ═════════════════════════

describe("requisito 6: origemAdmissao vem como tag, e o consultor sai do funil", () => {
  it("origemAdmissao é ATRACAO_SELECAO com candidatura e MANUAL sem ela", async () => {
    const dados: DadosFake = {
      links: [linkVivo("com-cand"), linkVivo("sem-cand")],
      candidaturasAS: ["com-cand"],
      cabecalhos: [
        { admissaoId: "com-cand", nome: "Sintético A", cargo: "Aux", cliente: "Loja 1" },
        { admissaoId: "sem-cand", nome: "Sintético B", cargo: "Aux", cliente: "Loja 1" },
      ],
    };
    const itens = (await servico(dados).listar({})).itens;
    const porId = new Map(itens.map((i) => [i.admissaoId, i]));
    expect(porId.get("com-cand")?.origemAdmissao).toBe("ATRACAO_SELECAO");
    expect(porId.get("sem-cand")?.origemAdmissao).toBe("MANUAL");
  });

  it("consultorQueEnviou é o NOME DO USUÁRIO do envio do funil, nunca o do candidato", async () => {
    const dados: DadosFake = {
      links: [linkVivo("com-cand")],
      candidaturasAS: ["com-cand"],
      cabecalhos: [{ admissaoId: "com-cand", nome: "Candidato Alvo", cargo: "Aux", cliente: "Loja 1" }],
      enviosParaAdmissao: [
        { admissaoId: "com-cand", consultor: "Consultora Beltrana", ocorridoEm: rel(-2_000) },
      ],
    };
    const [linha] = (await servico(dados).listar({})).itens;
    expect(linha.consultorQueEnviou).toBe("Consultora Beltrana");
    expect(linha.consultorQueEnviou).not.toBe("Candidato Alvo");
  });

  /**
   * O FALLBACK DO LIBERADOR (parte do requisito 6): "sem autor de saída do funil, o
   * consultorQueEnviou cai no liberador (`portal_links.criado_por_id`)". Este teste modela o
   * liberador e um "Ismael" sem candidatura e sem envio de funil. Se o serviço NÃO buscar o
   * liberador, `consultorQueEnviou` fica `null`, e o teste fica VERMELHO: é o requisito ainda não
   * atendido, e o tester o entrega como GAP (não conserta o serviço).
   */
  it("GAP(requisito 6): sem envio do funil, consultorQueEnviou deveria cair no liberador do link", async () => {
    const dados: DadosFake = {
      links: [linkVivo("ismael")],
      origem: { ismael: "PANDAPE" },
      candidaturasAS: [],
      cabecalhos: [{ admissaoId: "ismael", nome: "Sintético Ismael", cargo: "Op", cliente: "Loja 3" }],
      liberadores: [{ admissaoId: "ismael", nome: "Liberador Sintético" }],
    };
    const [linha] = (await servico(dados).listar({})).itens;
    expect(linha.consultorQueEnviou).toBe("Liberador Sintético");
  });
});

/** O código sem comentários: as asserções de "não contém" não podem casar a EXPLICAÇÃO do que saiu. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
