import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/auth.types";
import { CandidatosImportService } from "./candidatos-import.service";

/**
 * A ASSINATURA DO CABEÇALHO, e o defeito que ela fecha: "MAPA DA ABA A APLICADO NA ABA B".
 *
 * A conferência do de/para acontece na PRÉVIA, e a gravação é OUTRA requisição, com OUTRO upload e com
 * a `aba` vinda do cliente. Sem esta guarda, mandar no `aplicar` uma aba diferente da conferida fazia a
 * importação ler a grade errada e gravar a COLUNA ERRADA (nome no campo de e-mail, telefone no de CPF)
 * SEM NENHUM ERRO, que é a parte grave. Aqui a divergência é recusa explícita.
 *
 * §A.6: planilha sintética, CPF de teste com dígito válido, nenhum dado real. A assinatura é hash de
 * rótulo de coluna e nome de aba, nunca de conteúdo de célula.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const MAPA = { nome: 0, cpf: 1, email: 2, telefone: null, nascimento: null, cidade: null, uf: null };

function montar() {
  const criados: Record<string, unknown>[] = [];
  const candidatos = {
    criar: vi.fn(async (dto: Record<string, unknown>) => {
      criados.push(dto);
      return { id: `novo-${criados.length}` } as never;
    }),
    adicionarEmLote: vi.fn(async () => ({ aplicadas: 0, falhas: [] })),
  };
  const service = new CandidatosImportService(
    { query: { vagas: { findFirst: async () => null } } } as never,
    { mapearColunasCandidato: vi.fn(async () => null) } as never,
    candidatos as never,
    { regua: async () => ({ recebeCandidato: () => true }) } as never,
  );
  return { service, candidatos, criados };
}

/**
 * Um xlsx com DUAS abas de cabeçalhos DIFERENTES, que é a base real do diretor (`Candidatos` e
 * `Carimbos` no mesmo arquivo) e o cenário exato do defeito.
 */
async function arquivoDeDuasAbas(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet("Candidatos");
  a.addRow(["Nome", "CPF", "Email"]);
  a.addRow(["Maria Souza", "39053344705", "maria@x.com"]);
  const b = wb.addWorksheet("Carimbos");
  b.addRow(["Email", "Nome", "CPF"]);
  b.addRow(["jose@x.com", "Jose Lima", "11144477735"]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("assinatura do cabeçalho: o aplicar só grava a grade que foi conferida", () => {
  it("a PRÉVIA devolve a assinatura da aba que leu, e ela muda de aba para aba", async () => {
    const { service } = montar();
    const arquivo = await arquivoDeDuasAbas();

    const pa = await service.previa(Buffer.from(arquivo), "Candidatos");
    const pb = await service.previa(Buffer.from(arquivo), "Carimbos");

    expect(pa.assinaturaCabecalho).toMatch(/^[0-9a-f]{32}$/);
    expect(pa.assinaturaCabecalho).not.toBe(pb.assinaturaCabecalho);
  });

  it("MESMA aba conferida: grava normalmente", async () => {
    const { service, criados } = montar();
    const arquivo = await arquivoDeDuasAbas();
    const previa = await service.previa(Buffer.from(arquivo), "Candidatos");

    const r = await service.aplicar(
      {
        arquivo: Buffer.from(arquivo),
        cenario: "SEM_VAGA",
        mapa: MAPA,
        aba: "Candidatos",
        assinaturaCabecalho: previa.assinaturaCabecalho,
      },
      USER,
    );

    expect(r.importados).toBe(1);
    expect(criados[0]?.nome).toBe("Maria Souza");
  });

  it("ABA TROCADA depois da conferência: RECUSA com 400 e NÃO grava ninguém", async () => {
    const { service, candidatos } = montar();
    const arquivo = await arquivoDeDuasAbas();
    const previa = await service.previa(Buffer.from(arquivo), "Candidatos");

    await expect(
      service.aplicar(
        {
          arquivo: Buffer.from(arquivo),
          cenario: "SEM_VAGA",
          mapa: MAPA,
          // A aba B, com o mapa conferido na aba A: antes, isto importava a coluna errada em silêncio.
          aba: "Carimbos",
          assinaturaCabecalho: previa.assinaturaCabecalho,
        },
        USER,
      ),
    ).rejects.toMatchObject({ status: 400 });

    expect(candidatos.criar).not.toHaveBeenCalled();
  });

  it("a mensagem da recusa diz o que fazer, sem PII e sem travessão (§A.6, §A.11)", async () => {
    const { service } = montar();
    const arquivo = await arquivoDeDuasAbas();

    let mensagem = "";
    try {
      await service.aplicar(
        {
          arquivo: Buffer.from(arquivo),
          cenario: "SEM_VAGA",
          mapa: MAPA,
          aba: "Candidatos",
          assinaturaCabecalho: "assinatura-de-outra-planilha",
        },
        USER,
      );
    } catch (err) {
      mensagem = (err as Error).message;
    }

    expect(mensagem).toMatch(/Refaça a importação/i);
    expect(mensagem).not.toContain("—");
    expect(mensagem).not.toContain("Maria");
    expect(mensagem).not.toContain("39053344705");
  });

  it("CLIENTE SEM A ASSINATURA mantém o comportamento de antes (compatibilidade deliberada)", async () => {
    const { service, criados } = montar();
    const arquivo = await arquivoDeDuasAbas();

    const r = await service.aplicar(
      { arquivo: Buffer.from(arquivo), cenario: "SEM_VAGA", mapa: MAPA, aba: "Candidatos" },
      USER,
    );

    expect(r.importados).toBe(1);
    expect(criados).toHaveLength(1);
  });

  it("a STAGING é expurgada mesmo quando a assinatura divergiu (§A.6)", async () => {
    const { service } = montar();
    const arquivo = await arquivoDeDuasAbas();
    const buffer = Buffer.from(arquivo);

    await expect(
      service.aplicar(
        {
          arquivo: buffer,
          cenario: "SEM_VAGA",
          mapa: MAPA,
          aba: "Candidatos",
          assinaturaCabecalho: "nao-corresponde",
        },
        USER,
      ),
    ).rejects.toBeTruthy();

    expect(buffer.every((b) => b === 0)).toBe(true);
  });
});
