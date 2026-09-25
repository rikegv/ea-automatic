import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosImportService } from "./candidatos-import.service";

/**
 * ─ COBERTURA INDEPENDENTE (§A.38): quem escreve o teste NÃO é quem escreveu o serviço ──────────────
 *
 * O `candidatos-import.service.spec.ts` (do autor) já prova as regras uma a uma com CSV. Este arquivo
 * fecha os GAPS que o teste do autor deixa, e que são justamente os de MAL-ENTENDIDO DE REQUISITO
 * (não os de regressão):
 *
 *   G1. FORMATO XLSX: o autor só exercita CSV; o requisito é "xlsx E csv" e o parser decide pelo
 *       MAGIC BYTE. Sem um teste com bytes de xlsx de verdade, o ramo `lerXlsxLojas` nunca roda.
 *   G2. SEM_VAGA NÃO VINCULA: o autor prova que COM_VAGA vincula, mas nunca afirma o contrário.
 *   G3. CPF DUPLICADO DENTRO DA MESMA PLANILHA: duas linhas com o MESMO CPF novo. Comportamento não
 *       coberto; é uma pergunta de requisito ("a segunda é criada de novo, ou reaproveitada?").
 *   G4. CONTAGEM COERENTE como INVARIANTE: total == novos + duplicadosCpf + semCpf + invalidos, num
 *       lote misto. O autor confere os contadores um a um, mas nunca a soma fechar com o total.
 *   G5. À IA SÓ CABEÇALHO + AMOSTRA (§A.6): num arquivo grande, o que chega em `mapearColunasCandidato`
 *       tem de ser o cabeçalho + no MÁXIMO 15 linhas, nunca a planilha inteira.
 *
 * Mesma estratégia do autor: FAKES das portas reusadas. O que se prova aqui é ORQUESTRAÇÃO.
 */

const CPF_EXISTENTE = "39053344705";
const CPF_NOVO = "11144477735";
const CPF_NOVO_2 = "52998224725";

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** `CandidatosService` fingido: `criar` deduplica por CPF (409 com `candidatoId`), `adicionarEmLote` registra. */
function fakeCandidatos(existentes: Record<string, string> = {}) {
  const porCpf = new Map(Object.entries(existentes));
  const criados: { id: string; dto: Record<string, unknown> }[] = [];
  let seq = 0;

  const criar = vi.fn(async (dto: Record<string, unknown>) => {
    const cpf = dto.cpf as string | undefined;
    if (cpf && porCpf.has(cpf)) {
      throw new ConflictException({
        statusCode: 409,
        error: "Conflict",
        message: "Já existe um candidato cadastrado com este CPF.",
        candidatoId: porCpf.get(cpf),
      });
    }
    const id = `novo-${++seq}`;
    if (cpf) porCpf.set(cpf, id);
    criados.push({ id, dto });
    return { id, nome: dto.nome } as never;
  });

  const adicionarEmLote = vi.fn(async (_vagaId: string, dto: { candidatoIds: string[] }) => ({
    aplicadas: dto.candidatoIds.length,
    falhas: [] as unknown[],
  }));

  return { criar, adicionarEmLote, criados };
}

function fakeStatusVaga(recebe = true) {
  return { regua: async () => ({ recebeCandidato: () => recebe }) };
}

function fakeDb(vaga: { id: string; status: string } | null = { id: "vaga-1", status: "ABERTA" }) {
  return { query: { vagas: { findFirst: async () => vaga } } };
}

function fakeAi(sugestao: unknown = null) {
  return { mapearColunasCandidato: vi.fn(async () => sugestao) };
}

function montar(over: {
  candidatos?: ReturnType<typeof fakeCandidatos>;
  ai?: ReturnType<typeof fakeAi>;
  statusVaga?: ReturnType<typeof fakeStatusVaga>;
  db?: ReturnType<typeof fakeDb>;
} = {}) {
  const candidatos = over.candidatos ?? fakeCandidatos();
  const ai = over.ai ?? fakeAi();
  const statusVaga = over.statusVaga ?? fakeStatusVaga();
  const db = over.db ?? fakeDb();
  const service = new CandidatosImportService(
    db as never,
    ai as never,
    candidatos as never,
    statusVaga as never,
  );
  return { service, candidatos, ai, statusVaga, db };
}

const MAPA = { nome: 0, cpf: 1, email: 2, telefone: null, nascimento: 3, cidade: 4, uf: 5 };
const CABECALHO = "Nome,CPF,Email,Nascimento,Cidade,UF";

/** CSV -> Buffer (o mesmo caminho do upload multipart). O primeiro byte NÃO é 0x50 0x4b, logo não é xlsx. */
function csv(linhas: string[]): Buffer {
  return Buffer.from([CABECALHO, ...linhas].join("\n"), "utf8");
}

/** XLSX de verdade: bytes de um workbook exceljs, cujo magic byte (PK) roteia para `lerXlsxLojas`. */
async function xlsx(linhas: string[][]): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("candidatos");
  ws.addRow(["Nome", "CPF", "Email", "Nascimento", "Cidade", "UF"]);
  for (const l of linhas) ws.addRow(l);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("G1: o requisito é xlsx E csv, e o formato é decidido pelo MAGIC BYTE", () => {
  it("importa a partir de BYTES DE XLSX de verdade (novo cria, existente reaproveita)", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const arquivo = await xlsx([
      ["Nova Um", CPF_NOVO, "", "1990-05-10", "São Paulo", "SP"],
      ["Reusada", CPF_EXISTENTE, "", "", "", ""],
    ]);
    // Sanidade: é MESMO um xlsx (PK), não um csv disfarçado.
    expect(arquivo[0]).toBe(0x50);
    expect(arquivo[1]).toBe(0x4b);

    const r = await service.aplicar({ arquivo, cenario: "SEM_VAGA", mapa: MAPA }, USER);

    expect(r.linhas.map((l) => l.status)).toEqual(["IMPORTADO", "REAPROVEITADO"]);
    expect(r.contagem.novos).toBe(1);
    expect(r.contagem.duplicadosCpf).toBe(1);
    expect(candidatos.criados).toHaveLength(1);
    // O xlsx guarda a célula como texto; o CPF não pode ter perdido dígito (zero à esquerda etc.).
    expect(candidatos.criados[0].dto.cpf).toBe(CPF_NOVO);
  });

  it("o MESMO conteúdo em CSV dá o MESMO resultado (paridade de formato)", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: csv([`Nova Um,${CPF_NOVO},,1990-05-10,São Paulo,SP`, `Reusada,${CPF_EXISTENTE},,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas.map((l) => l.status)).toEqual(["IMPORTADO", "REAPROVEITADO"]);
    expect(r.contagem.novos).toBe(1);
    expect(r.contagem.duplicadosCpf).toBe(1);
  });
});

describe("G2: SEM_VAGA NÃO vincula ninguém", () => {
  it("não chama adicionarEmLote e devolve vinculados = 0", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: csv([`Nova,${CPF_NOVO},,,,`, `Reusada,${CPF_EXISTENTE},,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(candidatos.adicionarEmLote).not.toHaveBeenCalled();
    expect(r.vinculados).toBe(0);
  });
});

describe("G3: CPF duplicado DENTRO da mesma planilha", () => {
  it("a primeira ocorrência CRIA, a segunda do MESMO CPF REAPROVEITA (não cria de novo)", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: csv([`Primeira,${CPF_NOVO},,,,`, `Segunda igual,${CPF_NOVO},,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas.map((l) => l.status)).toEqual(["IMPORTADO", "REAPROVEITADO"]);
    // Uma pessoa só foi criada, ainda que o CPF apareça duas vezes na planilha.
    expect(candidatos.criados).toHaveLength(1);
    expect(r.contagem.novos).toBe(1);
    expect(r.contagem.duplicadosCpf).toBe(1);
  });

  it("COM_VAGA: o CPF repetido na planilha vincula a pessoa UMA vez só", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: csv([`Primeira,${CPF_NOVO},,,,`, `Segunda igual,${CPF_NOVO},,,,`]),
        cenario: "COM_VAGA",
        vagaId: "vaga-1",
        mapa: MAPA,
      },
      USER,
    );

    expect(candidatos.adicionarEmLote).toHaveBeenCalledTimes(1);
    const [, dto] = candidatos.adicionarEmLote.mock.calls[0];
    expect(dto.candidatoIds).toEqual(["novo-1"]); // sem duplicar o vínculo
    expect(r.vinculados).toBe(1);
  });
});

describe("G4: contagem coerente é INVARIANTE (total == novos + duplicadosCpf + semCpf + invalidos)", () => {
  it("a soma dos quatro contadores fecha com o total, num lote misto", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: csv([
          `Nova A,${CPF_NOVO},,,,`, // IMPORTADO (novos)
          `Nova B,${CPF_NOVO_2},,,,`, // IMPORTADO (novos)
          `Reusada,${CPF_EXISTENTE},,,,`, // REAPROVEITADO (duplicadosCpf)
          `Sem doc,,,,,`, // SEM_CPF (semCpf)
          `Cpf ruim,12345678900,,,,`, // SEM_CPF (semCpf) - inválido importa sem cpf
          `,${CPF_NOVO},sem-nome@x.com,,,`, // INVALIDO (invalidos) - sem nome
        ]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    const { total, novos, duplicadosCpf, semCpf, invalidos } = r.contagem;
    expect(novos + duplicadosCpf + semCpf + invalidos).toBe(total);
    expect(total).toBe(6);
    expect({ novos, duplicadosCpf, semCpf, invalidos }).toEqual({
      novos: 2,
      duplicadosCpf: 1,
      semCpf: 2,
      invalidos: 1,
    });
    // E os campos derivados batem com os contadores.
    expect(r.importados).toBe(novos + semCpf);
    expect(r.reaproveitados).toBe(duplicadosCpf);
    expect(r.ignorados).toBe(invalidos);
  });
});

describe("G5: à IA vai só o cabeçalho + amostra, nunca a planilha inteira (§A.6)", () => {
  it("num arquivo com 20 linhas, a IA recebe o cabeçalho e no MÁXIMO 15 linhas de amostra", async () => {
    const ai = fakeAi(null);
    const { service } = montar({ ai });

    const linhas = Array.from({ length: 20 }, (_, i) => `Pessoa ${i + 1},${CPF_NOVO},,,,`);
    const previa = await service.previa(csv(linhas));

    expect(previa.totalLinhas).toBe(20);
    expect(ai.mapearColunasCandidato).toHaveBeenCalledTimes(1);
    const [cabecalho, amostra] = ai.mapearColunasCandidato.mock.calls[0] as unknown as [
      string[],
      string[][],
    ];
    expect(cabecalho).toEqual(["Nome", "CPF", "Email", "Nascimento", "Cidade", "UF"]);
    expect(Array.isArray(amostra)).toBe(true);
    // A planilha inteira (20) NUNCA sai do backend: a amostra é truncada em 15.
    expect((amostra as unknown[]).length).toBe(15);
    expect((amostra as unknown[]).length).toBeLessThan(20);
  });
});
