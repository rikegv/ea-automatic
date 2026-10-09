import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosService } from "./candidatos.service";
import {
  CandidatosImportCurriculoService,
  type ArquivoCurriculo,
} from "./candidatos-import-curriculo.service";
import { envioDoPortalFingido } from "../../portal/portal-envio.fake";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38): os dois SEAMS que as specs do autor deixam sem prova ─────────
 *
 * Escrito pelo `tester`, que NÃO escreveu o código, a partir dos REQUISITOS do import por currículo
 * (`docs/MAPA-IMPORT-CURRICULO-IA.md`, R2 e R4). Nenhuma linha do código de produção é lida como
 * definição; o que se afirma é o requisito.
 *
 * ┌─ POR QUE ESTE ARQUIVO EXISTE, e o que ele pega que os outros não pegam ─────────────────────┐
 * │                                                                                              │
 * │ R4 ("telefones[] guarda TODOS; telefone = telefones[0]"). As specs do autor provam o helper  │
 * │   `telefonesEPrincipal` ISOLADO e o DTO que o serviço de currículo monta, mas NENHUMA prova  │
 * │   que o INSERT de `criar` carrega as DUAS colunas. Tirar `telefones` dos `values()` do insert │
 * │   deixaria o helper verde, deixaria o DTO verde, e a LISTA deixaria de ser persistida: o      │
 * │   requisito quebraria em silêncio. Este arquivo trava a porta de escrita de verdade.          │
 * │                                                                                              │
 * │ R2 ("vários de uma vez, TODOS processados; um ilegível não derruba o lote"). A prévia do      │
 * │   autor roda com 2 arquivos, e a concorrência é 4: cada trabalhador pega UM e o laço de       │
 * │   recarga (`proximo++`) nunca gira. Um lote MAIOR que a concorrência, com um arquivo ruim no  │
 * │   MEIO, é o que prova que todos os índices são atendidos e que a falha fica contida no item.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todo dado é SINTÉTICO. A IA e as portas de escrita são FAKES; a IA real nunca é chamada.
 */

const USER: AuthUser = {
  id: "00000000-0000-4000-8000-0000000000a1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R4 — O INSERT DE `criar` CARREGA AS DUAS COLUNAS: o escalar espelho E a lista inteira
// ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Uma cadeia drizzle que resolve no resultado dado, aceitando qualquer encadeamento (select/insert). */
function cadeia(resultado: unknown[]): unknown {
  const alvo = (() => undefined) as unknown as object;
  return new Proxy(alvo, {
    get(_t, prop) {
      if (prop === "then")
        return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(resultado).then(ok, err);
      if (prop === "catch") return (f: (e: unknown) => unknown) => Promise.resolve(resultado).catch(f);
      if (prop === "finally") return (f: () => void) => Promise.resolve(resultado).finally(f);
      return () => cadeia(resultado);
    },
    apply() {
      return cadeia(resultado);
    },
  });
}

/** Banco fingido que ANOTA o objeto `values()` de cada insert e não acha ninguém no dedup. */
function bancoQueCapturaInsert() {
  const inserts: Record<string, unknown>[] = [];
  const db: Record<string, unknown> = {
    select: () => cadeia([]), // dedup por CPF: ninguém existe
    execute: () => Promise.resolve([]),
    insert: () => ({
      values: (v: unknown) => {
        inserts.push((Array.isArray(v) ? v[0] : v) as Record<string, unknown>);
        return cadeia([{ id: "novo-1" }]);
      },
    }),
  };
  db.transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return { db, inserts };
}

async function inserirCandidato(dto: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { db, inserts } = bancoQueCapturaInsert();
  const s = new CandidatosService(
    db as never,
    {} as never,
    {} as never,
    envioDoPortalFingido() as never,
  );
  // `ficha(id)` monta a resposta com consultas que este fake não serve e não é o objeto do teste.
  vi.spyOn(s as unknown as { ficha: () => Promise<unknown> }, "ficha").mockResolvedValue({} as never);
  await s.criar(dto as never, USER);
  expect(inserts, "`criar` deve inserir o candidato exatamente uma vez").toHaveLength(1);
  return inserts[0];
}

describe("R4 persistência: o insert de `criar` grava telefone = telefones[0] E a lista toda", () => {
  it("LISTA de currículo: o primeiro vira o escalar e a coluna `telefones` guarda todos (aparada)", async () => {
    const valores = await inserirCandidato({
      nome: "Maria Sintetica",
      telefones: [" 11 90000-0001 ", "11 90000-0002", "11 90000-0001", ""],
    });
    // O espelho: o escalar é o primeiro não vazio.
    expect(valores.telefone).toBe("11 90000-0001");
    // A LISTA inteira chega ao insert, aparada e deduplicada. Se alguém tirar `telefones` dos
    // `values()`, este `expect` fica vermelho, e é a única prova de que o requisito R4 persiste.
    expect(valores.telefones).toEqual(["11 90000-0001", "11 90000-0002"]);
  });

  it("ESCALAR (planilha/manual): a coluna `telefones` também é populada, como [telefone]", async () => {
    const valores = await inserirCandidato({ nome: "Fulano Sintetico", telefone: "11 98888-7777" });
    expect(valores.telefone).toBe("11 98888-7777");
    expect(valores.telefones).toEqual(["11 98888-7777"]);
  });

  it("sem telefone nenhum: escalar null e lista vazia (não bloqueia o cadastro)", async () => {
    const valores = await inserirCandidato({ nome: "Sem Telefone" });
    expect(valores.telefone).toBeNull();
    expect(valores.telefones).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// R2 — LOTE MAIOR QUE A CONCORRÊNCIA: TODOS processados, o ruim do MEIO não derruba os de depois
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const MIME_PDF = "application/pdf";

function arquivo(nome: string, mime: string): ArquivoCurriculo {
  return { originalname: nome, mimetype: mime, buffer: Buffer.from("bytes-do-curriculo", "utf8") };
}

function montarCurriculo(
  extrair: (bytes: Buffer, nome: string) => Promise<unknown>,
): { service: CandidatosImportCurriculoService; ai: { extrairCurriculo: ReturnType<typeof vi.fn> } } {
  const ai = { extrairCurriculo: vi.fn(extrair) };
  const candidatos = { criar: vi.fn(), adicionarEmLote: vi.fn() };
  const statusVaga = { regua: async () => ({ recebeCandidato: () => true }) };
  const db = { query: { vagas: { findFirst: async () => ({ id: "v", status: "ABERTA" }) } } };
  const service = new CandidatosImportCurriculoService(
    db as never,
    ai as never,
    candidatos as never,
    statusVaga as never,
  );
  return { service, ai };
}

describe("R2 lote: 7 currículos (> concorrência 4), um ilegível no meio", () => {
  it("processa TODOS os índices, em ordem, e a falha fica contida no item ruim", async () => {
    const { service, ai } = montarCurriculo(async (_b, nome) => ({
      candidato: { nome: `lido-${nome}`, telefones: [] },
      confianca: {},
    }));

    const arquivos: ArquivoCurriculo[] = [
      arquivo("c0.pdf", MIME_PDF),
      arquivo("c1.pdf", MIME_PDF),
      arquivo("c2.pdf", MIME_PDF),
      arquivo("ruim.jpg", "image/jpeg"), // índice 3: formato recusado, NÃO chama a IA
      arquivo("c4.pdf", MIME_PDF),
      arquivo("c5.pdf", MIME_PDF),
      arquivo("c6.pdf", MIME_PDF),
    ];

    const previa = await service.previa(arquivos);

    // TODOS entraram, e os índices saem na ordem do lote (o laço de recarga do pool não pula nenhum).
    expect(previa.itens).toHaveLength(7);
    expect(previa.itens.map((i) => i.indice)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    // O ruim do meio carrega erroLeitura e candidato vazio; TODOS os outros 6 foram lidos.
    const comErro = previa.itens.filter((i) => i.erroLeitura);
    expect(comErro).toHaveLength(1);
    expect(comErro[0].indice).toBe(3);
    expect(comErro[0].candidato.nome).toBe("");

    for (const i of [0, 1, 2, 4, 5, 6]) {
      expect(previa.itens[i].erroLeitura).toBeUndefined();
      expect(previa.itens[i].candidato.nome).toBe(`lido-c${i}.pdf`);
    }
    // A IA foi chamada para os 6 aceitos, nunca para o formato recusado.
    expect(ai.extrairCurriculo).toHaveBeenCalledTimes(6);

    // §A.6: o buffer de CADA arquivo (inclusive o recusado) foi expurgado.
    for (const a of arquivos) expect(a.buffer.every((b) => b === 0)).toBe(true);
  });
});
