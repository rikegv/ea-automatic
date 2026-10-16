import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosImportService } from "./candidatos-import.service";

/**
 * ─ ITEM 1: DEDUP DA IMPORTAÇÃO DE CANDIDATOS SEM CPF ───────────────────────────────────────────
 *   parte 1 (DENTRO DO LOTE), na ORQUESTRAÇÃO do import. Cobertura independente §A.38/§A.40.
 *
 * ESTE ARQUIVO cobre SÓ o que é responsabilidade do IMPORT SERVICE e observável sem banco: o
 * COLAPSO DENTRO DO MESMO UPLOAD. As regras de banco (auto-merge histórico, guarda `anonimizado_em`,
 * overwrite, telefone-nunca-funde no histórico) ficam no `.integra.spec.ts` irmão, contra o Postgres.
 *
 * O REQUISITO (OST Alto Volume, item 1): três linhas IDÊNTICAS sem CPF no MESMO upload para a MESMA
 * vaga viram 1 PESSOA e 1 CANDIDATURA, não 3. A chave do colapso é NOME NORMALIZADO + (E-MAIL OU
 * TELEFONE), tudo sem acento/caixa/espaço.
 *
 * ┌─ A PREMISSA DE ARQUITETURA, DECLARADA (ajuste se a construção escolher outra) ──────────────────┐
 * │ O colapso DENTRO DO LOTE é do IMPORT SERVICE, ANTES de chamar `criar`: um termo sem e-mail       │
 * │ (só telefone) tem de colapsar, e o auto-merge por banco é por NOME+E-MAIL (item 2), que não      │
 * │ pegaria o par só-telefone. Logo o import precisa de um mapa de lote por NOME+(E-MAIL OU          │
 * │ TELEFONE). Por isso o `criar` fingido aqui é BURRO para sem-CPF (cria um id novo a cada chamada); │
 * │ se o colapso de lote existir, `criar` é chamado UMA vez por pessoa distinta. Hoje ele é chamado  │
 * │ uma vez por LINHA: é esse o vermelho esperado.                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.43/§A.6: tudo sintético. E-mail de domínio de exemplo, telefone que não fecha verificador,
 * nome sem palavra do léxico real. Nenhum CPF real; o CPF de regressão é de família reservada válida.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

/** `CandidatosService` fingido: `criar` deduplica SÓ por CPF (burro para sem-CPF, de propósito). */
function fakeCandidatos(existentesPorCpf: Record<string, string> = {}) {
  const porCpf = new Map(Object.entries(existentesPorCpf));
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

  // O AUTO-MERGE HISTÓRICO (régua 2) é porta PRÓPRIA. Aqui ele devolve `null` por padrão (nada no
  // histórico), para o foco ser o COLAPSO DENTRO DO LOTE (régua 1), que é do import service. As
  // semânticas de banco do reaproveitamento histórico vivem no `.reaproveitar-captura.tester.spec.ts`.
  const reaproveitarCapturaSemCpf = vi.fn(async () => null);

  return { criar, adicionarEmLote, reaproveitarCapturaSemCpf, criados };
}

const fakeStatusVaga = (recebe = true) => ({ regua: async () => ({ recebeCandidato: () => recebe }) });
const fakeDb = (vaga: { id: string; status: string } | null = { id: "vaga-1", status: "ABERTA" }) => ({
  query: { vagas: { findFirst: async () => vaga } },
});
const fakeAi = (sugestao: unknown = null) => ({ mapearColunasCandidato: vi.fn(async () => sugestao) });

function montar(candidatos = fakeCandidatos()) {
  const service = new CandidatosImportService(
    fakeDb() as never,
    fakeAi() as never,
    candidatos as never,
    fakeStatusVaga() as never,
  );
  return { service, candidatos };
}

// Nome, CPF, Email, Telefone, Nascimento, Cidade, UF (telefone ganhou coluna propria aqui).
const MAPA = { nome: 0, cpf: 1, email: 2, telefone: 3, nascimento: 4, cidade: 5, uf: 6 };
const CABECALHO = "Nome,CPF,Email,Telefone,Nascimento,Cidade,UF";
const csv = (linhas: string[]): Buffer => Buffer.from([CABECALHO, ...linhas].join("\n"), "utf8");

describe("ITEM 1.1: três linhas idênticas sem CPF no MESMO upload viram UMA pessoa", () => {
  it("por NOME + E-MAIL (variando acento/caixa/espaço): `criar` é chamado UMA vez", async () => {
    const { service, candidatos } = montar();
    await service.aplicar(
      {
        arquivo: csv([
          "João Silva,,joao.silva@exemplo.com,,,,",
          "joao silva,,JOAO.SILVA@EXEMPLO.COM,,,,",
          "  JOÃO   SILVA ,, joao.silva@exemplo.com ,,,,",
        ]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(
      candidatos.criar.mock.calls.length,
      "três linhas idênticas sem CPF criaram mais de uma pessoa: faltou o colapso de lote por nome+e-mail.",
    ).toBe(1);
    expect(candidatos.criados).toHaveLength(1);
  });

  it("por NOME + TELEFONE, SEM e-mail (variando a máscara do número): UMA pessoa", async () => {
    const { service, candidatos } = montar();
    await service.aplicar(
      {
        arquivo: csv([
          "Marina Souza,,,11 98765-4321,,,",
          "marina souza,,,(11) 98765 4321,,,",
          "MARINA SOUZA,,,11987654321,,,",
        ]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(
      candidatos.criar.mock.calls.length,
      "o par só-telefone não colapsou: a chave de lote tem de aceitar TELEFONE, não só e-mail (item 1).",
    ).toBe(1);
  });

  it("mesmo NOME + MESMO telefone, e-mail diferente: colapsa (é OR, telefone OU e-mail)", async () => {
    const { service, candidatos } = montar();
    await service.aplicar(
      {
        arquivo: csv([
          "Ana Lima,,ana@exemplo.com,11 90000-0001,,,",
          "ana lima,,outra@exemplo.com,(11) 90000 0001,,,",
        ]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(
      candidatos.criar.mock.calls.length,
      "nome igual + telefone igual tem de colapsar DENTRO do lote, mesmo com e-mail diferente (OR).",
    ).toBe(1);
  });
});

describe("ITEM 1.1: o colapso NÃO pode fundir pessoas distintas", () => {
  it("mesmo nome, e-mail diferente e SEM telefone: são DUAS pessoas (nome sozinho não funde)", async () => {
    const { service, candidatos } = montar();
    await service.aplicar(
      {
        arquivo: csv(["Ana Lima,,ana@exemplo.com,,,,", "Ana Lima,,outra-ana@exemplo.com,,,,"]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(
      candidatos.criar.mock.calls.length,
      "nome igual com e-mail diferente e sem telefone NÃO é a mesma pessoa: o nome sozinho não pode fundir.",
    ).toBe(2);
  });

  it("nomes diferentes com o mesmo e-mail digitado por engano: NÃO funde (nome entra na chave)", async () => {
    const { service, candidatos } = montar();
    await service.aplicar(
      {
        arquivo: csv(["Bruno Alves,,contato@exemplo.com,,,,", "Carla Dias,,contato@exemplo.com,,,,"]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(candidatos.criar.mock.calls.length).toBe(2);
  });
});

describe("ITEM 1.1 (COM_VAGA): três idênticas sem CPF viram UMA candidatura", () => {
  it("vincula UMA pessoa só e `vinculados` = 1", async () => {
    const { service, candidatos } = montar();
    const r = await service.aplicar(
      {
        arquivo: csv([
          "Pedro Nunes,,pedro@exemplo.com,,,,",
          "pedro nunes,,pedro@exemplo.com,,,,",
          "PEDRO NUNES,,pedro@exemplo.com,,,,",
        ]),
        cenario: "COM_VAGA",
        vagaId: "vaga-1",
        mapa: MAPA,
      },
      USER,
    );
    expect(candidatos.adicionarEmLote).toHaveBeenCalledTimes(1);
    const [, dto] = candidatos.adicionarEmLote.mock.calls[0] as unknown as [
      string,
      { candidatoIds: string[] },
    ];
    expect(dto.candidatoIds.length, "três idênticas sem CPF vincularam mais de uma candidatura.").toBe(1);
    expect(r.vinculados).toBe(1);
  });
});

describe("REGRESSÃO: o caminho COM CPF (reaproveitamento por CPF, §A.3) continua intacto", () => {
  const CPF_EXISTENTE = "39053344705"; // válido, família de teste
  const CPF_NOVO = "11144477735";

  it("CPF existente REAPROVEITA (não cria); CPF novo cria", async () => {
    const candidatos = fakeCandidatos({ [CPF_EXISTENTE]: "existe-1" });
    const { service } = montar(candidatos);
    const r = await service.aplicar(
      {
        arquivo: csv([`Nova Um,${CPF_NOVO},,,,,`, `Reusada,${CPF_EXISTENTE},,,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(r.linhas.map((l) => l.status)).toEqual(["IMPORTADO", "REAPROVEITADO"]);
    expect(r.contagem.novos).toBe(1);
    expect(r.contagem.duplicadosCpf).toBe(1);
    expect(candidatos.criados).toHaveLength(1);
    expect(candidatos.criados[0].dto.cpf).toBe(CPF_NOVO);
  });

  it("CPF repetido na MESMA planilha cria UMA vez (dedup por CPF já existia)", async () => {
    const candidatos = fakeCandidatos();
    const { service } = montar(candidatos);
    const r = await service.aplicar(
      {
        arquivo: csv([`Primeira,${CPF_NOVO},,,,,`, `Segunda,${CPF_NOVO},,,,,`]),
        cenario: "SEM_VAGA",
        mapa: MAPA,
      },
      USER,
    );
    expect(r.linhas.map((l) => l.status)).toEqual(["IMPORTADO", "REAPROVEITADO"]);
    expect(candidatos.criados).toHaveLength(1);
  });
});
