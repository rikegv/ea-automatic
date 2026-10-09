import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import {
  CandidatosImportCurriculoService,
  type ArquivoCurriculo,
} from "./candidatos-import-curriculo.service";

/**
 * ─ IMPORTAÇÃO DE CANDIDATOS POR CURRÍCULO: extração por IA, multi-telefone e o §A.6 ────────────
 *
 * O QUE ESTE ARQUIVO PROVA:
 *   1. a PRÉVIA chama a IA por arquivo e agrega; cada item carrega o que foi lido e a confiança;
 *   2. formato NÃO aceito vira `erroLeitura` daquele item, SEM derrubar o lote nem chamar a IA;
 *   3. a IA fora do ar vira `erroLeitura` daquele item (candidato em branco), e o lote continua;
 *   4. o Buffer de CADA currículo é EXPURGADO (fill 0), no sucesso E na falha;
 *   5. o APLICAR persiste pela porta `criar` com telefones = LISTA e origem IMPORTACAO;
 *   6. CPF já existente REAPROVEITA (não cria), e COM_VAGA vincula pela `adicionarEmLote`.
 *
 * A IA e as portas de escrita são FAKES: o que se testa é a ORQUESTRAÇÃO (alçada, tolerância,
 * expurgo, de/para do telefone múltiplo). A IA REAL nunca é chamada.
 */

const CPF_EXISTENTE = "39053344705";
const CPF_NOVO = "11144477735";
const MIME_PDF = "application/pdf";
const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** Um arquivo de currículo fingido (o que o `FilesInterceptor` entrega). */
function arquivo(nome: string, mime: string, conteudo = "bytes-do-curriculo"): ArquivoCurriculo {
  return { originalname: nome, mimetype: mime, buffer: Buffer.from(conteudo, "utf8") };
}

/** Um `CandidatosService` fingido: `criar` com dedup por CPF; registra o dto recebido. */
function fakeCandidatos(existentes: Record<string, string> = {}) {
  const porCpf = new Map(Object.entries(existentes));
  const criados: { id: string; dto: Record<string, unknown> }[] = [];
  let seq = 0;
  const criar = vi.fn(async (dto: Record<string, unknown>) => {
    if (dto.nome === "EXPLODE") throw new Error("falha simulada");
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
  const vinculacoes: { vagaId: string; ids: string[] }[] = [];
  const adicionarEmLote = vi.fn(async (vagaId: string, dto: { candidatoIds: string[] }) => {
    vinculacoes.push({ vagaId, ids: dto.candidatoIds });
    return { aplicadas: dto.candidatoIds.length, falhas: [] };
  });
  return { criar, adicionarEmLote, criados, vinculacoes };
}

function fakeStatusVaga(recebe = true) {
  return { regua: async () => ({ recebeCandidato: () => recebe }) };
}

function fakeDb(vaga: { id: string; status: string } | null = { id: "vaga-1", status: "ABERTA" }) {
  return { query: { vagas: { findFirst: async () => vaga } } };
}

/** A IA fingida: devolve um extrato por arquivo, ou lança (serviço fora). NUNCA a IA real. */
function fakeAi(extrair: (bytes: Buffer, nome: string) => Promise<unknown>) {
  return { extrairCurriculo: vi.fn(extrair) };
}

function montar(over: {
  candidatos?: ReturnType<typeof fakeCandidatos>;
  ai?: ReturnType<typeof fakeAi>;
  statusVaga?: ReturnType<typeof fakeStatusVaga>;
  db?: ReturnType<typeof fakeDb>;
} = {}) {
  const candidatos = over.candidatos ?? fakeCandidatos();
  const ai = over.ai ?? fakeAi(async () => ({ candidato: { nome: "" }, confianca: {} }));
  const statusVaga = over.statusVaga ?? fakeStatusVaga();
  const db = over.db ?? fakeDb();
  const service = new CandidatosImportCurriculoService(
    db as never,
    ai as never,
    candidatos as never,
    statusVaga as never,
  );
  return { service, candidatos, ai, statusVaga, db };
}

describe("Prévia por currículo: extração, alçada de formato e tolerância a falha", () => {
  it("lê cada currículo pela IA e agrega candidato + confiança por item", async () => {
    const ai = fakeAi(async (_b, nome) => ({
      candidato: {
        nome: nome.includes("maria") ? "Maria Souza" : "João Lima",
        cpf: "",
        email: "maria@x.com",
        telefones: ["11 90000-0001", "11 90000-0002"],
        nascimento: "1990-05-10",
        cidade: "São Paulo",
        uf: "SP",
      },
      confianca: { nome: "ALTA", telefones: "MEDIA", lixo: "INVALIDO" },
    }));
    const { service } = montar({ ai });

    const previa = await service.previa([
      arquivo("maria.pdf", MIME_PDF),
      arquivo("joao.docx", MIME_DOCX),
    ]);

    expect(previa.itens).toHaveLength(2);
    expect(previa.itens[0].indice).toBe(0);
    expect(previa.itens[0].arquivo).toBe("maria.pdf");
    expect(previa.itens[0].candidato.nome).toBe("Maria Souza");
    expect(previa.itens[0].candidato.telefones).toEqual(["11 90000-0001", "11 90000-0002"]);
    // A confiança só mantém chaves conhecidas e valores do vocabulário fechado.
    expect(previa.itens[0].confianca.nome).toBe("ALTA");
    expect(previa.itens[0].confianca.telefones).toBe("MEDIA");
    expect((previa.itens[0].confianca as Record<string, unknown>).lixo).toBeUndefined();
    expect(previa.itens[0].erroLeitura).toBeUndefined();
  });

  it("formato NÃO aceito vira erroLeitura do item, SEM chamar a IA e SEM derrubar o lote", async () => {
    const ai = fakeAi(async () => ({
      candidato: { nome: "Ok", telefones: [] },
      confianca: {},
    }));
    const { service } = montar({ ai });

    const previa = await service.previa([
      arquivo("foto.jpg", "image/jpeg"), // recusado
      arquivo("ok.pdf", MIME_PDF), // aceito
    ]);

    expect(previa.itens[0].erroLeitura).toMatch(/PDF.*docx|Formato/i);
    expect(previa.itens[0].candidato.nome).toBe("");
    expect(previa.itens[1].erroLeitura).toBeUndefined();
    expect(previa.itens[1].candidato.nome).toBe("Ok");
    // A IA só foi chamada para o arquivo aceito.
    expect(ai.extrairCurriculo).toHaveBeenCalledTimes(1);
  });

  it("IA fora do ar vira erroLeitura do item (candidato em branco), e o lote continua", async () => {
    const ai = fakeAi(async (_b, nome) => {
      if (nome.includes("cai")) throw new ServiceUnavailableException("Motor de IA indisponível");
      return { candidato: { nome: "Sobreviveu", telefones: [] }, confianca: {} };
    });
    const { service } = montar({ ai });

    const previa = await service.previa([
      arquivo("cai.pdf", MIME_PDF),
      arquivo("vive.pdf", MIME_PDF),
    ]);

    expect(previa.itens[0].erroLeitura).toBeTruthy();
    expect(previa.itens[0].candidato.nome).toBe("");
    expect(previa.itens[1].erroLeitura).toBeUndefined();
    expect(previa.itens[1].candidato.nome).toBe("Sobreviveu");
  });

  it("EXPURGA o Buffer de cada currículo, no sucesso E na falha (§A.6)", async () => {
    const ai = fakeAi(async (_b, nome) => {
      if (nome.includes("cai")) throw new ServiceUnavailableException("fora");
      return { candidato: { nome: "X", telefones: [] }, confianca: {} };
    });
    const { service } = montar({ ai });
    const ok = arquivo("vive.pdf", MIME_PDF);
    const falha = arquivo("cai.pdf", MIME_PDF);
    const recusado = arquivo("foto.jpg", "image/jpeg");

    await service.previa([ok, falha, recusado]);

    expect(ok.buffer.every((b) => b === 0)).toBe(true);
    expect(falha.buffer.every((b) => b === 0)).toBe(true);
    expect(recusado.buffer.every((b) => b === 0)).toBe(true);
  });

  it("lote vazio é recusado", async () => {
    const { service } = montar();
    await expect(service.previa([])).rejects.toThrow(/currículo/i);
  });
});

describe("Aplicar por currículo: persistência, multi-telefone, dedup e vínculo", () => {
  it("persiste com telefones = LISTA e origem IMPORTACAO", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        cenario: "SEM_VAGA",
        candidatos: [
          {
            nome: "Maria Souza",
            cpf: CPF_NOVO,
            email: "maria@x.com",
            telefones: ["11 90000-0001", "11 90000-0002", ""],
            nascimento: "1990-05-10",
            cidade: "São Paulo",
            uf: "SP",
          },
        ],
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("IMPORTADO");
    expect(r.linhas[0].indice).toBe(0);
    expect(r.contagem.novos).toBe(1);
    expect(candidatos.criados).toHaveLength(1);
    const dto = candidatos.criados[0].dto;
    expect(dto.origem).toBe("IMPORTACAO");
    // A LISTA chega ao `criar` sem o vazio; o `criar` deriva o escalar `telefone = telefones[0]`.
    expect(dto.telefones).toEqual(["11 90000-0001", "11 90000-0002"]);
    expect(dto.cpf).toBe(CPF_NOVO);
    expect(dto.uf).toBe("SP");
  });

  it("CPF já existente REAPROVEITA (não cria), keyed por indice", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        cenario: "SEM_VAGA",
        candidatos: [
          { nome: "Reusada", cpf: CPF_EXISTENTE, email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
        ],
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("REAPROVEITADO");
    expect(r.reaproveitados).toBe(1);
    expect(candidatos.criados).toHaveLength(0);
  });

  it("um currículo ruim NÃO derruba o lote, e sem nome é INVALIDO", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        cenario: "SEM_VAGA",
        candidatos: [
          { nome: "Boa Um", cpf: CPF_NOVO, email: "", telefones: ["11 1"], nascimento: "", cidade: "", uf: "" },
          { nome: "EXPLODE", cpf: "", email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
          { nome: "", cpf: "", email: "x@x.com", telefones: [], nascimento: "", cidade: "", uf: "" },
          { nome: "Reusada", cpf: CPF_EXISTENTE, email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
        ],
      },
      USER,
    );

    expect(r.contagem.total).toBe(4);
    expect(r.linhas.map((l) => l.status)).toEqual([
      "IMPORTADO",
      "INVALIDO",
      "INVALIDO",
      "REAPROVEITADO",
    ]);
    expect(r.linhas.map((l) => l.indice)).toEqual([0, 1, 2, 3]);
  });

  it("COM_VAGA vincula novos + reaproveitados pela adicionarEmLote, ids únicos", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        cenario: "COM_VAGA",
        vagaId: "vaga-1",
        candidatos: [
          { nome: "Nova", cpf: CPF_NOVO, email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
          { nome: "Reusada", cpf: CPF_EXISTENTE, email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
          { nome: "Reusada de novo", cpf: CPF_EXISTENTE, email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
        ],
      },
      USER,
    );

    expect(candidatos.adicionarEmLote).toHaveBeenCalledTimes(1);
    const [vagaId, dto] = candidatos.adicionarEmLote.mock.calls[0];
    expect(vagaId).toBe("vaga-1");
    expect([...dto.candidatoIds].sort()).toEqual(["existe-1", "novo-1"]);
    expect(r.vinculados).toBe(2);
  });

  it("COM_VAGA com vaga que não recebe é recusado ANTES de criar ninguém", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos, statusVaga: fakeStatusVaga(false) });

    await expect(
      service.aplicar(
        {
          cenario: "COM_VAGA",
          vagaId: "vaga-1",
          candidatos: [
            { nome: "Alguém", cpf: CPF_NOVO, email: "", telefones: [], nascimento: "", cidade: "", uf: "" },
          ],
        },
        USER,
      ),
    ).rejects.toThrow(/Fechada/i);
    expect(candidatos.criar).not.toHaveBeenCalled();
  });
});
