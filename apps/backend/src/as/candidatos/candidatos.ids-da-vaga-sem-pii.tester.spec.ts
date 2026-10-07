import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { CandidatosService } from "./candidatos.service";
import { catalogoDeEtapasFingido } from "../etapas/etapas-funil-catalogo.fake";
import { catalogoDeStatusFingido } from "../vaga-status/vaga-status-catalogo.fake";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ O ENDPOINT IDS-ONLY DA VAGA DEVOLVE SO UUIDs, SEM NENHUM DADO PESSOAL (§A.6) ─────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38), escrita ANTES do codigo a partir do REQUISITO do mapa
 * (`docs/MAPA-ALCANCE-PAGINACAO-SERVIDOR-CANDIDATOS-VAGAS.md`, secoes 2, 3.2 e risco 8).
 *
 * ┌─ PARA QUE ELE EXISTE, E POR QUE SO PODE DEVOLVER ID ──────────────────────────────────────────┐
 * │ "Selecionar todos do filtro" na aba Ver Candidatos NAO baixa as linhas (seriam ate 2.509, com   │
 * │ CPF, pretensao, motivo de descarte). Quando a acao em massa dispara, a tela chama este endpoint │
 * │ ids-only para resolver o CONJUNTO INTEIRO como uma lista de UUID, e passa so os ids. E a unica   │
 * │ forma de agir sobre o conjunto inteiro sem despejar dado pessoal de 2.509 pessoas no navegador.  │
 * │                                                                                                 │
 * │ ENTAO O RETORNO E `string[]` DE UUID, e nada mais. Se a implementacao reusar a projecao da       │
 * │ listagem (`AsCandidaturaItem`) e devolver objetos, desce CPF/email/telefone/motivoDescarte/      │
 * │ pretensaoSalarial numa superficie de SELECAO, que e o precedente do `substituidoCpf` (desceu cru │
 * │ por meses porque nenhuma coluna o mostrava). Este arquivo acende se isso acontecer.             │
 * └─────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O NOME `idsDaVaga` E PROPOSTA (como em `candidatos.lote-dto`): o contrato e o RETORNO (so UUID,
 * sem PII), nao o nome. Ajuste em uma linha se a construcao escolher outro.
 */

const VAGA_ID = randomUUID();

/** As ISCAS de §A.6: elas existem no banco do fake; a assercao e que NENHUMA aparece no retorno. */
const CPF = "52998224725";
const EMAIL = "marina.ferreira@exemplo.com.br";
const TELEFONE = "11987654321";
const MOTIVO = "nao compareceu a entrevista marcada";
const PRETENSAO = "3450.00";

/** Candidaturas da vaga, COM dado pessoal pendurado, para o teste ter o que vazar. */
const CANDIDATURAS = [
  { id: randomUUID(), candidatoId: randomUUID() },
  { id: randomUUID(), candidatoId: randomUUID() },
  { id: randomUUID(), candidatoId: randomUUID() },
].map((c) => ({
  ...c,
  vagaId: VAGA_ID,
  etapa: "CAPTACAO",
  situacao: "ATIVO",
  motivoDescarte: MOTIVO,
  pretensaoSalarial: PRETENSAO,
  cpf: CPF,
  email: EMAIL,
  telefone: TELEFONE,
  candidatoNome: "Marina Ferreira",
}));

/**
 * UM BANCO FINGIDO PERMISSIVO: qualquer `select(...).from(...)....` resolve para as candidaturas da
 * vaga, com TODAS as colunas (inclusive as de PII) disponiveis. Permissivo de proposito: se o metodo
 * ids-only selecionar demais e devolver objetos, o PII estara nas linhas e o teste o pega. Um metodo
 * correto seleciona so o `id` e devolve `string[]`, e ai nada de PII tem como descer.
 */
function bancoDaVaga() {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    const mesmo = () => c;
    c.from = mesmo;
    c.innerJoin = mesmo;
    c.leftJoin = mesmo;
    c.where = mesmo;
    c.orderBy = mesmo;
    c.groupBy = mesmo;
    c.having = mesmo;
    c.limit = mesmo;
    c.offset = mesmo;
    c.then = (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(CANDIDATURAS).then(ok, falha);
    return c;
  };

  const db = {
    select: vi.fn(() => chain()),
    selectDistinct: vi.fn(() => chain()),
    query: {
      asCandidaturas: { findMany: vi.fn(async () => CANDIDATURAS) },
      vagas: { findFirst: vi.fn(async () => ({ id: VAGA_ID, status: "ABERTA" })) },
    },
  };

  return new CandidatosService(
    db as never,
    catalogoDeEtapasFingido() as never,
    catalogoDeStatusFingido() as never,
    envioDoPortalFingido() as never,
  );
}

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("o endpoint ids-only da vaga existe e devolve SO uuid, sem PII", () => {
  it("o service expoe `idsDaVaga`", () => {
    const svc = bancoDaVaga() as unknown as Record<string, unknown>;
    expect(
      typeof svc["idsDaVaga"],
      "O endpoint ids-only `idsDaVaga(vagaId, filtro?) => Promise<string[]>` ainda nao existe. Ele resolve o CONJUNTO INTEIRO do filtro da vaga como uma lista de UUID, para o 'selecionar todos' agir sem baixar PII. Enquanto nao existir, este teste e a especificacao dele.",
    ).toBe("function");
  });

  it("devolve um array de UUID, e NENHUM campo de dado pessoal", async () => {
    const svc = bancoDaVaga() as unknown as {
      idsDaVaga?: (vagaId: string, filtro?: unknown) => Promise<unknown>;
    };
    if (typeof svc.idsDaVaga !== "function") {
      // A ausencia ja esta dita no teste acima; aqui so evitamos um TypeError que esconderia a causa.
      expect(typeof svc.idsDaVaga, "`idsDaVaga` ainda nao existe (ver o teste acima).").toBe("function");
      return;
    }

    const resultado = await svc.idsDaVaga(VAGA_ID);

    expect(Array.isArray(resultado), "o retorno e uma lista").toBe(true);
    const lista = resultado as unknown[];
    expect(lista.length, "a vaga tem candidaturas, entao a lista nao e vazia").toBeGreaterThan(0);

    for (const item of lista) {
      expect(
        typeof item === "string" && UUID_RX.test(item),
        "cada item tem de ser um UUID cru. Objeto aqui quer dizer que a projecao da listagem (com PII) desceu.",
      ).toBe(true);
    }

    // A PROVA DIRETA DO §A.6: nenhuma das iscas aparece no texto serializado do retorno.
    const texto = JSON.stringify(lista);
    for (const isca of [CPF, EMAIL, TELEFONE, MOTIVO, PRETENSAO]) {
      expect(
        texto.includes(isca),
        "um dado pessoal vazou no endpoint ids-only (CPF/email/telefone/motivo/pretensao).",
      ).toBe(false);
    }
  });
});
