import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { portalPendenciasNoTime } from "../db/schema";
import { PortalPainelService } from "./portal-painel.service";
import { PortalPendenciasService } from "./portal-pendencias.service";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO (§A.40 regra 2) — AJUSTE 1, "RESOLVIDO".
 *
 * REQUISITO. O time RESOLVE a intervenção humana de uma admissão: todas as pendências que caíram para
 * a fila do time (`caiu_em is not null`) e ainda não foram reabertas (`liberado_em is null`) ganham um
 * carimbo `resolvido_em`/`resolvido_por_id` NUM CLIQUE, e a admissão deixa de contar como "Intervenção
 * Humana" no Gerenciador do Portal. "Resolvido" NÃO reabre o envio, NÃO devolve tentativa e NÃO mexe no
 * documento (é o OPOSTO de `liberado_em`, que é reabertura): ele só ENCERRA a intervenção.
 *
 * ┌─ O MAL-ENTENDIDO QUE ESTE ARQUIVO EXISTE PARA PEGAR ─────────────────────────────────────────────┐
 * │ "Resolver" é fácil de confundir com "reabrir": as duas tiram a admissão do card. Mas reabrir     │
 * │ (`liberado_em`) devolve tentativa e reabre a porta do candidato; resolver NÃO. Se a construção   │
 * │ carimbasse `liberado_em` para "resolver", zeraria o teto de reprovações como efeito colateral e  │
 * │ reabriria o envio, que é exatamente o que NÃO foi pedido. Por isso o teste mede os DOIS carimbos │
 * │ como colunas SEPARADAS, e a saída do card é medida pela MESMA consulta que o painel usa          │
 * │ (`admissoesNoTime`), nunca por um retorno fabricado só por este arquivo.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O BANCO FINGIDO LÊ A CLÁUSULA, NÃO ADIVINHA A REGRA (mesma filosofia de `portal-painel.spec.ts` e
 * `portal-reabertura-da-pendencia.tester.spec.ts`). Ele conta e atualiza o que a consulta PEDIU: se a
 * cláusula do `resolver` esquecer `liberado_em is null`, o fingido tocará a linha reaberta e o teste
 * denuncia; se a consulta do painel esquecer `resolvido_em is null`, a admissão resolvida continua no
 * recorte e o teste denuncia. Um dublê que aplicasse a regra certa sozinho esconderia esses dois furos.
 *
 * §A.6: identificadores técnicos e carimbos de tempo. Nenhum dado pessoal nos fixtures.
 *
 * ESTADO ESPERADO AO RODAR HOJE: VERMELHO. O schema já tem as colunas `resolvido_em`/`resolvido_por_id`
 * (migration + CHECK), mas o MÉTODO `PortalPendenciasService.resolver`, o filtro `resolvido_em is null`
 * em `PortalPainelService.admissoesNoTime` e a rota `POST .../:admissaoId/resolver` ainda NÃO existem
 * (código construído em paralelo). A falha, portanto, é por AUSÊNCIA de método/consulta, não de harness.
 */

const ARQUIVO_CONTROLLER = readFileSync(
  join(__dirname, "portal-pendencias.controller.ts"),
  "utf8",
);
const ARQUIVO_PAINEL = readFileSync(join(__dirname, "portal-painel.service.ts"), "utf8");

const USER: AuthUser = {
  id: "user-consultor",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const OUTRO_USER: AuthUser = { ...USER, id: "user-outro" };

const ADM = "adm-1";
const OUTRA_ADM = "adm-2";
const RG = "tipo-rg";
const CPF = "tipo-cpf";

/**
 * O CONTRATO do método novo, por CAST: ele ainda não existe na classe, e tipar o cast aqui documenta
 * a assinatura combinada com o coordenador sem acoplar o teste ao resto da classe. (§A.38: escrevo
 * contra o contrato, não contra o código, que outro agente constrói.)
 */
type ComResolver = { resolver(admissaoId: string, user: AuthUser): Promise<{ resolvidas: number }> };
/** `admissoesNoTime` é privado: a mesma técnica de `portal-reabertura-da-pendencia.tester.spec.ts`. */
type ComNoTime = { admissoesNoTime(ids: string[]): Promise<Set<string>> };

interface Pend {
  id: string;
  admissaoId: string;
  tipoDocumentoId: string;
  caiuEm: Date | null;
  liberadoEm: Date | null;
  resolvidoEm: Date | null;
  resolvidoPorId: string | null;
}

/** Texto de um nó SQL do drizzle (idêntico ao de `portal-reabertura-da-pendencia.tester.spec.ts`). */
function serializar(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (no instanceof Date) return no.toISOString();
  if (Array.isArray(no)) return no.map(serializar).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(serializar).join(" ");
  if ("value" in o && "encoder" in o) return serializar(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(serializar).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/**
 * As linhas que a cláusula SELECIONA, lendo da cláusula os predicados que ela de fato tem. Não aplica
 * nenhum predicado que a consulta não expresse: é assim que o esquecimento vira vermelho em vez de
 * passar despercebido.
 */
function selecionadas(rows: Pend[], texto: string): Pend[] {
  let r = rows.filter((p) => texto.includes(p.admissaoId));
  if (/caiu_em\s+is\s+not\s+null/i.test(texto)) r = r.filter((p) => p.caiuEm != null);
  if (/liberado_em\s+is\s+null/i.test(texto)) r = r.filter((p) => p.liberadoEm == null);
  if (/resolvido_em\s+is\s+null/i.test(texto)) r = r.filter((p) => p.resolvidoEm == null);
  return r;
}

/**
 * O MUNDO COMPARTILHADO pelos dois serviços, e é esse compartilhamento o ponto do arquivo: o `resolver`
 * ESCREVE o carimbo e o `admissoesNoTime` LÊ o MESMO estado logo depois. As duas metades são obrigadas a
 * concordar, do mesmo jeito que `portal-reabertura-da-pendencia.tester.spec.ts` obriga reabrir e conceder
 * a concordar.
 */
function mundo(pendencias: Pend[]) {
  const db: Record<string, unknown> = {
    execute: async () => [{ agora: new Date() }],
    query: {
      admissoes: { findFirst: async () => ({ id: ADM }) },
    },
    // O `resolver`: UPDATE ... SET resolvido_em/resolvido_por_id ... WHERE (predicados) RETURNING.
    update: (_t: unknown) => ({
      set: (valores: Record<string, unknown>) => ({
        where: (clausula: unknown) => {
          const texto = serializar(clausula);
          const atingidas = selecionadas(pendencias, texto);
          for (const p of atingidas) {
            p.resolvidoEm = new Date();
            p.resolvidoPorId = (valores.resolvidoPorId as string) ?? p.resolvidoPorId;
          }
          const linhas = atingidas.map((p) => ({ id: p.id }));
          const fim = {
            returning: async () => linhas,
            then: (ok: (v: unknown) => unknown) => Promise.resolve(linhas).then(ok),
          };
          return fim;
        },
      }),
    }),
    // O `admissoesNoTime` do painel: selectDistinct(admissao_id) ... where(predicados).
    selectDistinct: (_proj?: Record<string, unknown>) => {
      const b: Record<string, unknown> = {};
      const resolver = (texto: string) => {
        const atingidas = selecionadas(pendencias, texto).filter((p) => p.caiuEm != null);
        const ids = [...new Set(atingidas.map((p) => p.admissaoId))];
        return Promise.resolve(ids.map((admissaoId) => ({ admissaoId })));
      };
      b.from = () => b;
      b.where = (c: unknown) => resolver(serializar(c));
      return b;
    },
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);

  const pendenciasSvc = new PortalPendenciasService(db as never, {} as never);
  const painelSvc = new PortalPainelService(db as never, {} as never);
  return { pendencias, pendenciasSvc, painelSvc };
}

const resolver = (svc: PortalPendenciasService, admissaoId = ADM, user = USER) =>
  (svc as unknown as ComResolver).resolver(admissaoId, user);
const noTime = (svc: PortalPainelService, ids: string[]) =>
  (svc as unknown as ComNoTime).admissoesNoTime(ids);

const caida = (admissaoId: string, tipo: string): Pend => ({
  id: `${admissaoId}-${tipo}`,
  admissaoId,
  tipoDocumentoId: tipo,
  caiuEm: new Date("2026-10-01T10:00:00.000Z"),
  liberadoEm: null,
  resolvidoEm: null,
  resolvidoPorId: null,
});

const reaberta = (admissaoId: string, tipo: string): Pend => ({
  ...caida(admissaoId, tipo),
  liberadoEm: new Date("2026-10-02T10:00:00.000Z"),
});

// ══ CASO 1: UMA PENDÊNCIA CAÍDA, UM CLIQUE, SAI DO CARD ══════════════════════════════════════════

describe("caso 1: a admissão com uma pendência caída resolve e sai da Intervenção Humana", () => {
  it("resolver devolve 1 e a admissão some de admissoesNoTime", async () => {
    const m = mundo([caida(ADM, RG)]);

    // Antes de resolver, ela ESTÁ no card (o cenário é real).
    expect((await noTime(m.painelSvc, [ADM])).has(ADM)).toBe(true);

    const r = await resolver(m.pendenciasSvc);
    expect(r.resolvidas).toBe(1);

    // Depois de resolver, saiu do recorte/contagem (mesma consulta alimenta o número e a lista).
    expect(
      (await noTime(m.painelSvc, [ADM])).has(ADM),
      "a pendência foi resolvida mas a admissão continua no card: admissoesNoTime não filtra resolvido_em",
    ).toBe(false);
  });
});

// ══ CASO 2: DUAS PENDÊNCIAS, UM CLIQUE SÓ ════════════════════════════════════════════════════════

describe("caso 2: duas pendências caídas da mesma admissão caem juntas num clique", () => {
  it("resolver devolve 2 e a admissão sai", async () => {
    const m = mundo([caida(ADM, RG), caida(ADM, CPF)]);

    const r = await resolver(m.pendenciasSvc);
    expect(r.resolvidas, "resolver tratou só uma das duas pendências da admissão").toBe(2);

    expect((await noTime(m.painelSvc, [ADM])).has(ADM)).toBe(false);
    // As DUAS linhas receberam o carimbo, não só uma.
    expect(m.pendencias.filter((p) => p.resolvidoEm != null)).toHaveLength(2);
  });
});

// ══ CASO 3: NADA EM ABERTO ═══════════════════════════════════════════════════════════════════════

describe("caso 3: sem intervenção em aberto, resolver recusa e não escreve nada", () => {
  it("lança BadRequestException e nenhuma linha é carimbada", async () => {
    const m = mundo([]);

    await expect(resolver(m.pendenciasSvc)).rejects.toBeInstanceOf(BadRequestException);
    expect(m.pendencias.some((p) => p.resolvidoEm != null)).toBe(false);
  });
});

// ══ CASO 4: ESCOPO — RESOLVER NÃO VAZA PARA OUTRA ADMISSÃO ═══════════════════════════════════════

describe("caso 4: resolver uma admissão não resolve a outra", () => {
  it("só a admissão pedida sai; a outra continua no card e sem carimbo", async () => {
    const m = mundo([caida(ADM, RG), caida(OUTRA_ADM, RG)]);

    const r = await resolver(m.pendenciasSvc, ADM);
    expect(r.resolvidas).toBe(1);

    const set = await noTime(m.painelSvc, [ADM, OUTRA_ADM]);
    expect(set.has(ADM)).toBe(false);
    expect(set.has(OUTRA_ADM), "resolver(adm-1) resolveu a pendência de adm-2: escopo errado").toBe(
      true,
    );
    expect(m.pendencias.find((p) => p.admissaoId === OUTRA_ADM)!.resolvidoEm).toBeNull();
  });
});

// ══ CASO 5: PENDÊNCIA JÁ REABERTA (SÓ liberado_em) NÃO É TOCADA ══════════════════════════════════

describe("caso 5: pendência já reaberta (liberado_em preenchido) não é resolvida nem conta como no-time", () => {
  it("resolver recusa (nada a resolver) e a linha reaberta fica intacta", async () => {
    const m = mundo([reaberta(ADM, RG)]);

    // Reaberta já NÃO conta como intervenção humana (liberado_em preenchido).
    expect((await noTime(m.painelSvc, [ADM])).has(ADM)).toBe(false);

    await expect(resolver(m.pendenciasSvc)).rejects.toBeInstanceOf(BadRequestException);
    // `resolver` não pode carimbar uma pendência que já foi reaberta (ela não está na fila do time).
    expect(
      m.pendencias[0].resolvidoEm,
      "resolver carimbou uma pendência reaberta: faltou o guard liberado_em is null",
    ).toBeNull();
  });
});

// ══ CASO 6: IDEMPOTÊNCIA ═════════════════════════════════════════════════════════════════════════

describe("caso 6: resolver duas vezes não re-resolve o que já está resolvido", () => {
  it("a segunda passagem resolve zero (lança ou devolve 0) e não recarimba", async () => {
    const m = mundo([caida(ADM, RG)]);

    const primeiro = await resolver(m.pendenciasSvc);
    expect(primeiro.resolvidas).toBe(1);
    const carimbo = m.pendencias[0].resolvidoEm;
    expect(carimbo).toBeInstanceOf(Date);

    // A 2ª passagem: o contrato admite "lança OU zero". As duas são aceitas; o que NÃO se admite é
    // recarimbar (contar de novo a mesma resolução).
    let resolvidasNaSegunda = 0;
    try {
      resolvidasNaSegunda = (await resolver(m.pendenciasSvc)).resolvidas;
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
    }
    expect(resolvidasNaSegunda).toBe(0);
    expect(
      m.pendencias[0].resolvidoEm,
      "a segunda passagem recarimbou a resolução: faltou o guard resolvido_em is null",
    ).toBe(carimbo);
  });
});

// ══ CASO 7: AUTOR ════════════════════════════════════════════════════════════════════════════════

describe("caso 7: resolvido_por_id guarda quem resolveu", () => {
  it("a linha resolvida recebe o id do usuário que clicou", async () => {
    const m = mundo([caida(ADM, RG)]);

    await resolver(m.pendenciasSvc, ADM, OUTRO_USER);

    expect(m.pendencias[0].resolvidoPorId).toBe(OUTRO_USER.id);
  });
});

// ══ A ROTA, E A CONSULTA DO PAINEL, PROVADAS ESTRUTURALMENTE ═════════════════════════════════════

describe("a rota de resolver é operacional e mora sob esteira/", () => {
  it("existe `POST esteira/pendencias-portal/:admissaoId/resolver`", () => {
    expect(ARQUIVO_CONTROLLER).toContain('@Controller("esteira/pendencias-portal")');
    expect(ARQUIVO_CONTROLLER).toContain(":admissaoId/resolver");
  });

  /**
   * SEM `@Roles`: resolver a intervenção é FLUXO NORMAL do time (consultor), como `solicitar-reenvio`,
   * e NÃO a exceção de Master do `zerar-tentativas`. O único `@Roles` da controller é o do destrave.
   */
  it("resolver NÃO é restrito por papel (sem @Roles logo acima da rota)", () => {
    const m = ARQUIVO_CONTROLLER.match(/([\s\S]{0,160})@Post\([^)]*:admissaoId\/resolver/);
    expect(m, "rota resolver não encontrada na controller").toBeTruthy();
    expect(m![1]).not.toContain("@Roles");
  });

  it("resolver delega ao serviço com a admissão e o usuário autenticado", () => {
    expect(ARQUIVO_CONTROLLER).toMatch(/\.resolver\(\s*admissaoId\s*,\s*user\s*\)/);
  });
});

describe("contagem e recorte do card saem da MESMA consulta, com resolvido_em de fora", () => {
  /**
   * `admissoesNoTime` é a consulta única que alimenta o número "Intervenção Humana" E o recorte do card
   * (o comentário da coluna `resolvido_em` em `schema/tables.ts` fixa isso). Travar o `resolvido_em is
   * null` AQUI garante que resolver tira a admissão das DUAS superfícies de uma vez, não de uma só.
   */
  it("a consulta admissoesNoTime exclui as pendências resolvidas", () => {
    const corpo = ARQUIVO_PAINEL.slice(ARQUIVO_PAINEL.indexOf("private async admissoesNoTime"));
    // `lastIndexOf`, não `indexOf`: o método ABRE com o guard `if (ids.length === 0) return new
    // Set();`, então o primeiro "return new Set" é o guard e cortaria o corpo ANTES do `where`.
    // O último "return new Set" é o retorno final (`return new Set(linhas...)`), e é entre a
    // declaração e ele que mora a cláusula que precisa citar `resolvido_em`.
    const ate = corpo.slice(0, corpo.lastIndexOf("return new Set"));
    expect(ate).toMatch(/resolvido_em|resolvidoEm/);
  });
});

/** A coluna existe no schema (migration + CHECK), e é a âncora do fingido não ser fantasia. */
describe("as colunas do carimbo existem no schema", () => {
  it("portal_pendencias_no_time tem resolvido_em e resolvido_por_id", () => {
    const cols = Object.keys(portalPendenciasNoTime);
    expect(cols).toContain("resolvidoEm");
    expect(cols).toContain("resolvidoPorId");
  });
});
