import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosImportService } from "./candidatos-import.service";

/**
 * A IMPORTAÇÃO DE CANDIDATOS CONTRA OS FORMATOS REAIS, do lado do SERVIÇO.
 *
 * O `leitor.spec.ts` prova a leitura da grade. Este arquivo prova o que o serviço faz com ela, que é
 * onde a falha aparecia para o usuário:
 *  - `.xls` LEGADO importa (era o formato da base do diretor, e ele virava mojibake em silêncio);
 *  - a prévia DIZ o que entendeu (aba, abas disponíveis, linha do cabeçalho), em vez de esconder;
 *  - o `aplicar` usa a MESMA aba da prévia, senão o mapa conferido numa aba cairia na grade de outra;
 *  - a RECUSA vira 400 com mensagem acionável, e não 500 nem importação de lixo;
 *  - o número da linha do relatório acompanha o cabeçalho na linha 2.
 *
 * FIXTURES SINTÉTICAS (§A.6): os CPFs abaixo são válidos no dígito e não pertencem a ninguém da base
 * real, que não entra no repositório.
 */

const CPF_NOVO = "11144477735";
const CPF_NOVO_2 = "52998224725";

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

function fakeCandidatos() {
  const criados: { id: string; dto: Record<string, unknown> }[] = [];
  let seq = 0;
  const criar = vi.fn(async (dto: Record<string, unknown>) => {
    const id = `novo-${++seq}`;
    criados.push({ id, dto });
    return { id, nome: dto.nome } as never;
  });
  const adicionarEmLote = vi.fn(async (_v: string, dto: { candidatoIds: string[] }) => ({
    aplicadas: dto.candidatoIds.length,
    falhas: [] as unknown[],
  }));
  return { criar, adicionarEmLote, criados };
}

function montar(sugestaoDaIa: unknown = null) {
  const candidatos = fakeCandidatos();
  const ai = { mapearColunasCandidato: vi.fn(async () => sugestaoDaIa) };
  const service = new CandidatosImportService(
    { query: { vagas: { findFirst: async () => ({ id: "vaga-1", status: "ABERTA" }) } } } as never,
    ai as never,
    candidatos as never,
    { regua: async () => ({ recebeCandidato: () => true }) } as never,
  );
  return { service, candidatos, ai };
}

/** `.xls` LEGADO (BIFF8/OLE2) na FORMA da base real: título na linha 1, cabeçalho na 2, duas abas. */
function xlsComoABaseReal(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Dados: Candidatos"],
      ["Cod_cand", "Nome_cand", "Cpf_cand", "Email_cand"],
      ["1", "Fulano De Teste", CPF_NOVO, "fulano@exemplo.com"],
      ["2", "Ciclana De Teste", CPF_NOVO_2, "ciclana@exemplo.com"],
    ]),
    "Candidatos",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Dados: Carimbos"], ["CodCand_carimbo", "Nome_carimbo"], ["1", "Fulano De Teste"]]),
    "Carimbos",
  );
  return XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer;
}

/** O de/para da forma acima: nome na coluna 1, CPF na 2, e-mail na 3. */
const MAPA_BASE_REAL = {
  nome: 1,
  cpf: 2,
  email: 3,
  telefone: null,
  nascimento: null,
  cidade: null,
  uf: null,
};

describe("o `.xls` LEGADO importa, e é o formato que estava quebrado", () => {
  it("a prévia devolve o cabeçalho de verdade, a aba usada, as abas e a linha do cabeçalho", async () => {
    const { service, ai } = montar();
    const previa = await service.previa(xlsComoABaseReal());

    expect(previa.cabecalho).toEqual(["Cod_cand", "Nome_cand", "Cpf_cand", "Email_cand"]);
    expect(previa.totalLinhas).toBe(2);
    expect(previa.abaUsada).toBe("Candidatos");
    expect(previa.abasDisponiveis).toEqual(["Candidatos", "Carimbos"]);
    expect(previa.linhaCabecalho).toBe(2);
    // À IA vai só cabeçalho + amostra (§A.6), e o cabeçalho é o CERTO, não o título.
    expect(ai.mapearColunasCandidato).toHaveBeenCalledWith(previa.cabecalho, previa.amostra);
  });

  it("o `aplicar` cria os candidatos do `.xls`, com o CPF inteiro", async () => {
    const { service, candidatos } = montar();
    const r = await service.aplicar(
      { arquivo: xlsComoABaseReal(), cenario: "SEM_VAGA", mapa: MAPA_BASE_REAL },
      USER,
    );

    expect(r.contagem.total).toBe(2);
    expect(r.contagem.novos).toBe(2);
    expect(r.contagem.invalidos).toBe(0);
    expect(candidatos.criados.map((c) => c.dto.cpf)).toEqual([CPF_NOVO, CPF_NOVO_2]);
    expect(candidatos.criados.map((c) => c.dto.nome)).toEqual(["Fulano De Teste", "Ciclana De Teste"]);
  });

  it("o número da linha do relatório é o do ARQUIVO, com o cabeçalho na linha 2", async () => {
    const { service } = montar();
    const r = await service.aplicar(
      { arquivo: xlsComoABaseReal(), cenario: "SEM_VAGA", mapa: MAPA_BASE_REAL },
      USER,
    );
    // Título na 1, cabeçalho na 2, dados na 3 e na 4.
    expect(r.linhas.map((l) => l.linha)).toEqual([3, 4]);
  });

  it("a aba PEDIDA vale na prévia e no aplicar, senão o mapa cairia na grade da outra aba", async () => {
    const { service, candidatos } = montar();

    const previa = await service.previa(xlsComoABaseReal(), "Carimbos");
    expect(previa.abaUsada).toBe("Carimbos");
    expect(previa.cabecalho).toEqual(["CodCand_carimbo", "Nome_carimbo"]);

    const r = await service.aplicar(
      {
        arquivo: xlsComoABaseReal(),
        cenario: "SEM_VAGA",
        mapa: { ...MAPA_BASE_REAL, cpf: null, email: null },
        aba: "Carimbos",
      },
      USER,
    );
    expect(r.contagem.total).toBe(1);
    expect(candidatos.criados[0]?.dto.nome).toBe("Fulano De Teste");
  });
});

describe("a FALHA SILENCIOSA morreu: arquivo ruim é 400 com mensagem, nunca lixo importado", () => {
  const casos: { nome: string; arquivo: () => Buffer; contem: string }[] = [
    {
      nome: "um PNG (formato não suportado)",
      arquivo: () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]),
      contem: ".xlsx",
    },
    {
      nome: "um zip que não é planilha (ilegível)",
      arquivo: () => Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x99, 0x88, 0x77, 0x66, 0x55]),
      contem: "corrompido",
    },
    {
      nome: "uma planilha vazia",
      arquivo: () => Buffer.from("\n \n", "utf8"),
      contem: "vazia",
    },
    {
      nome: "um arquivo com conteúdo e sem cabeçalho utilizável",
      arquivo: () => Buffer.from("Relatorio de Candidatos\n", "utf8"),
      contem: "cabeçalho",
    },
  ];

  for (const caso of casos) {
    it(`recusa ${caso.nome} na PRÉVIA, com 400`, async () => {
      const { service } = montar();
      await expect(service.previa(caso.arquivo())).rejects.toBeInstanceOf(BadRequestException);
    });

    it(`recusa ${caso.nome} no APLICAR, e a mensagem diz o que fazer`, async () => {
      const { service, candidatos } = montar();
      await expect(
        service.aplicar(
          { arquivo: caso.arquivo(), cenario: "SEM_VAGA", mapa: MAPA_BASE_REAL },
          USER,
        ),
      ).rejects.toThrow(new RegExp(caso.contem, "i"));
      // O ponto INTEIRO da frente: nada foi criado a partir de um arquivo que não se sabe ler.
      expect(candidatos.criar).not.toHaveBeenCalled();
    });
  }

  it("aba inexistente é recusada, e não substituída pela primeira em silêncio", async () => {
    const { service } = montar();
    await expect(service.previa(xlsComoABaseReal(), "Funcionarios")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("CSV segue funcionando, inclusive com acento de Windows (cp1252)", async () => {
    const { service, candidatos } = montar();
    const csv = Buffer.from(`Nome;CPF;Email\nJosé Da Silva;${CPF_NOVO};jose@exemplo.com\n`, "latin1");
    const r = await service.aplicar(
      {
        arquivo: csv,
        cenario: "SEM_VAGA",
        mapa: { nome: 0, cpf: 1, email: 2, telefone: null, nascimento: null, cidade: null, uf: null },
      },
      USER,
    );
    expect(r.contagem.novos).toBe(1);
    expect(candidatos.criados[0]?.dto.nome).toBe("José Da Silva");
  });
});
