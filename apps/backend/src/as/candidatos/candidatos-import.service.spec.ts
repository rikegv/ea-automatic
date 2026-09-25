import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosImportService } from "./candidatos-import.service";

/**
 * ─ IMPORTAÇÃO DE CANDIDATOS POR PLANILHA: as regras do diretor, e o §A.6 ───────────────────────
 *
 * O QUE ESTE ARQUIVO PROVA:
 *   1. CPF válido JÁ EXISTENTE reaproveita a pessoa (não cria, não sobrescreve) e reusa o id no vínculo;
 *   2. CPF vazio ou inválido importa mesmo assim, SEM CPF;
 *   3. linha sem nome é INVALIDO, entra no relatório e não importa;
 *   4. uma linha ruim NÃO derruba o lote;
 *   5. COM_VAGA vincula pela `adicionarEmLote` que já existe (etapa CAPTACAO), com os ids únicos;
 *   6. a staging (o Buffer do upload) é EXPURGADA ao fim, no sucesso E na falha.
 *
 * O SERVIÇO É EXERCITADO COM FAKES das portas que ele reusa (`CandidatosService.criar` e
 * `.adicionarEmLote`), porque o que se testa aqui é a ORQUESTRAÇÃO (de/para, higiene, dedup, tolerância
 * e expurgo). Que `criar` de fato deduplica e que `adicionarEmLote` de fato aloca na etapa inicial já é
 * coberto pelas specs daqueles métodos.
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

/** Um `CandidatosService` fingido: `criar` com dedup por CPF e `adicionarEmLote` que registra o vínculo. */
function fakeCandidatos(existentes: Record<string, string> = {}) {
  const porCpf = new Map(Object.entries(existentes));
  const criados: { id: string; dto: Record<string, unknown> }[] = [];
  const vinculacoes: { vagaId: string; ids: string[] }[] = [];
  let seq = 0;

  const criar = vi.fn(async (dto: Record<string, unknown>) => {
    // "EXPLODE" simula uma falha inesperada (não conflito): a linha vira INVALIDO, o lote segue.
    if (dto.nome === "EXPLODE") throw new Error("falha simulada de gravação");
    const cpf = dto.cpf as string | undefined;
    if (cpf && porCpf.has(cpf)) {
      // Mesma forma do `conflitoDeCpf` da produção: 409 COM `candidatoId` no corpo.
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

function fakeAi(sugestao: unknown = null) {
  return { mapearColunasCandidato: vi.fn(async () => sugestao) };
}

/** Monta o serviço com as quatro portas fingidas. */
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

/** CSV com cabeçalho, virado Buffer (o mesmo caminho do upload multipart). */
function planilha(linhas: string[]): Buffer {
  return Buffer.from(["Nome,CPF,Email,Nascimento,Cidade,UF", ...linhas].join("\n"), "utf8");
}

/** O de/para das colunas do CSV acima. */
const MAPA = { nome: 0, cpf: 1, email: 2, telefone: null, nascimento: 3, cidade: 4, uf: 5 };

describe("Regra do CPF: reaproveitar, criar, ou importar sem CPF", () => {
  it("CPF válido já existente REAPROVEITA a pessoa, sem criar nem sobrescrever", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([`Maria Souza,${CPF_EXISTENTE},maria@x.com,1990-05-10,São Paulo,SP`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("REAPROVEITADO");
    expect(r.reaproveitados).toBe(1);
    expect(r.contagem.duplicadosCpf).toBe(1);
    // NÃO CRIOU: o fake só registra em `criados` quando insere de verdade.
    expect(candidatos.criados).toHaveLength(0);
    // NÃO SOBRESCREVEU: nenhum update foi chamado (o serviço só tem a porta `criar`, que lançou antes).
    expect(candidatos.criar).toHaveBeenCalledTimes(1);
  });

  it("CPF válido e NOVO cria a pessoa com origem IMPORTACAO", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([`João Lima,${CPF_NOVO},,1985-01-02,Santos,SP`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("IMPORTADO");
    expect(r.contagem.novos).toBe(1);
    expect(candidatos.criados).toHaveLength(1);
    expect(candidatos.criados[0].dto.origem).toBe("IMPORTACAO");
    expect(candidatos.criados[0].dto.cpf).toBe(CPF_NOVO);
  });

  it("CPF vazio importa mesmo assim, SEM CPF", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([`Ana Prado,,ana@x.com,,Campinas,SP`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("SEM_CPF");
    expect(r.contagem.semCpf).toBe(1);
    expect(candidatos.criados).toHaveLength(1);
    // Criou SEM cpf (o campo não vai no dto), que é o que "importar sem CPF" quer dizer.
    expect(candidatos.criados[0].dto.cpf).toBeUndefined();
  });

  it("CPF INVÁLIDO (dígito não confere) importa como SEM CPF, não derruba a linha", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([`Beto Reis,12345678900,,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("SEM_CPF");
    expect(candidatos.criados[0].dto.cpf).toBeUndefined();
  });
});

describe("Nome obrigatório e tolerância a falha", () => {
  it("linha sem nome é INVALIDO, entra no relatório e não importa", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([`,${CPF_NOVO},sem-nome@x.com,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.linhas[0].status).toBe("INVALIDO");
    expect(r.contagem.invalidos).toBe(1);
    expect(r.ignorados).toBe(1);
    // Não chamou `criar` para a linha sem nome.
    expect(candidatos.criar).not.toHaveBeenCalled();
  });

  it("uma linha ruim NÃO trava o lote: as demais importam", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([
          `Boa Um,${CPF_NOVO},,,,`, // IMPORTADO
          `EXPLODE,${CPF_NOVO_2},,,,`, // falha inesperada no criar -> INVALIDO
          `,00000000000,sem-nome@x.com,,,`, // tem conteúdo mas SEM NOME -> INVALIDO
          `Reusada,${CPF_EXISTENTE},,,,`, // REAPROVEITADO
          `Boa Dois,,,,,`, // SEM_CPF
        ]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );

    expect(r.contagem.total).toBe(5);
    expect(r.contagem.novos).toBe(1);
    expect(r.contagem.semCpf).toBe(1);
    expect(r.contagem.duplicadosCpf).toBe(1);
    expect(r.contagem.invalidos).toBe(2);
    expect(r.importados).toBe(2); // novos + semCpf
    expect(r.reaproveitados).toBe(1);
    expect(r.ignorados).toBe(2);
    expect(r.linhas.map((l) => l.status)).toEqual([
      "IMPORTADO",
      "INVALIDO",
      "INVALIDO",
      "REAPROVEITADO",
      "SEM_CPF",
    ]);
  });
});

describe("Cenário COM_VAGA: vincula pela porta que já existe", () => {
  it("vincula novos + reaproveitados na vaga, com ids ÚNICOS, e conta os vinculados", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar({ candidatos });

    const r = await service.aplicar(
      {
        arquivo: planilha([
          `Nova Um,${CPF_NOVO},,,,`,
          `Reusada,${CPF_EXISTENTE},,,,`,
          `Reusada de novo,${CPF_EXISTENTE},,,,`, // mesma pessoa: id repetido, dedupe no vínculo
        ]),
        cenario: "COM_VAGA",
        vagaId: "vaga-1",
        mapa: MAPA,
      },
      USER,
    );

    // A vinculação reusa `adicionarEmLote` (a mesma de `candidaturas/lote`, que aloca em CAPTACAO).
    expect(candidatos.adicionarEmLote).toHaveBeenCalledTimes(1);
    const [vagaId, dto] = candidatos.adicionarEmLote.mock.calls[0];
    expect(vagaId).toBe("vaga-1");
    // Ids únicos: "novo-1" (o novo) e "existe-1" (o reaproveitado, uma vez só).
    expect([...dto.candidatoIds].sort()).toEqual(["existe-1", "novo-1"]);
    expect(r.vinculados).toBe(2);
  });

  it("COM_VAGA sem vagaId é recusado, e nada é criado", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos });

    await expect(
      service.aplicar(
        { arquivo: planilha([`Alguém,${CPF_NOVO},,,,`]), cenario: "COM_VAGA", mapa: MAPA },
        USER,
      ),
    ).rejects.toThrow(/vaga/i);
    expect(candidatos.criar).not.toHaveBeenCalled();
  });

  it("vaga que não recebe candidato é recusada ANTES de criar ninguém", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar({ candidatos, statusVaga: fakeStatusVaga(false) });

    await expect(
      service.aplicar(
        {
          arquivo: planilha([`Alguém,${CPF_NOVO},,,,`]),
          cenario: "COM_VAGA",
          vagaId: "vaga-1",
          mapa: MAPA,
        },
        USER,
      ),
    ).rejects.toThrow(/Fechada/i);
    expect(candidatos.criar).not.toHaveBeenCalled();
  });
});

describe("Staging efêmera: o Buffer do upload é EXPURGADO ao fim (§A.6)", () => {
  it("expurga no SUCESSO", async () => {
    const { service } = montar();
    const buf = planilha([`Zé,${CPF_NOVO},,,,`]);
    await service.aplicar({ arquivo: buf, cenario: "SEM_VAGA", mapa: MAPA }, USER);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it("expurga também na FALHA (vaga inexistente)", async () => {
    const { service } = montar({ db: fakeDb(null) });
    const buf = planilha([`Zé,${CPF_NOVO},,,,`]);
    await expect(
      service.aplicar(
        { arquivo: buf, cenario: "COM_VAGA", vagaId: "vaga-1", mapa: MAPA },
        USER,
      ),
    ).rejects.toThrow();
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it("a prévia também expurga o Buffer", async () => {
    const { service } = montar();
    const buf = planilha([`Zé,${CPF_NOVO},,,,`]);
    await service.previa(buf);
    expect(buf.every((b) => b === 0)).toBe(true);
  });
});

describe("Prévia: a IA sugere o de/para, e a falha da IA não impede o mapeamento manual", () => {
  it("com a IA respondendo, a sugestão reflete as colunas apontadas", async () => {
    const ai = fakeAi({
      colunaNome: 0,
      colunaCpf: 1,
      colunaEmail: 2,
      colunaTelefone: null,
      colunaNascimento: 3,
      colunaCidade: 4,
      colunaUf: 5,
      confianca: "ALTA",
      observacao: "colunas reconhecidas",
    });
    const { service } = montar({ ai });

    const previa = await service.previa(planilha([`Maria,${CPF_NOVO},m@x.com,1990-01-01,SP,SP`]));

    expect(previa.cabecalho).toEqual(["Nome", "CPF", "Email", "Nascimento", "Cidade", "UF"]);
    expect(previa.totalLinhas).toBe(1);
    expect(previa.sugestao.mapa).toEqual({
      nome: 0,
      cpf: 1,
      email: 2,
      telefone: null,
      nascimento: 3,
      cidade: 4,
      uf: 5,
    });
    expect(previa.sugestao.confianca).toBe("ALTA");
  });

  it("IA fora do ar devolve a prévia com o mapa VAZIO e confiança BAIXA", async () => {
    const { service } = montar({ ai: fakeAi(null) });

    const previa = await service.previa(planilha([`Maria,${CPF_NOVO},,,,`]));

    expect(previa.sugestao.mapa).toEqual({
      nome: null,
      cpf: null,
      email: null,
      telefone: null,
      nascimento: null,
      cidade: null,
      uf: null,
    });
    expect(previa.sugestao.confianca).toBe("BAIXA");
  });
});
