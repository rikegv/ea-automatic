import { BadRequestException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditoriaService } from "../auditoria/auditoria.service";
import type { AuthUser } from "../auth/auth.types";

/**
 * QA do refactor de equivalência que a Fase 5 depende (DoD §3): `auditarDocumento` (upload manual,
 * multipart) valida a presença do arquivo e DELEGA a `auditarBuffer` (núcleo desacoplado que o pull
 * do Pandapé reusa). Chamar os dois com o MESMO {buffer, originalname} produz o MESMO caminho:
 * `staging.salvar` recebe o mesmo arquivo e o retorno é idêntico. IA/Drive/staging são mockados.
 */

const USER: AuthUser = {
  id: "user-1",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};

const ADM = {
  id: "adm-1",
  codCliente: "C-10",
  cargoId: "cargo-1",
  tipoContrato: "CLT",
  dataAdmissao: null,
  drivePastaUrl: null,
  driveAsoUrl: null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  clienteOperacao: "Operação X",
};

/** db mock roteado pela projeção do select (carregarAdmissao / regras / docs). */
function makeDb() {
  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const rows = keys.includes("descricaoRegra")
      ? [] // regras ativas
      : keys.includes("estado")
        ? [] // docs p/ recalcular sinalizador
        : [ADM]; // carregarAdmissao
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
    };
    return builder;
  });
  const insert = vi.fn(() => ({
    values: () => ({ onConflictDoUpdate: () => Promise.resolve(undefined) }),
  }));
  const update = vi.fn(() => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }));
  const db = {
    select,
    insert,
    update,
    query: {
      tiposDocumento: {
        findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG", nome: "RG" }),
      },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
    },
  };
  return { db, select, insert, update };
}

function makeService() {
  const { db } = makeDb();
  const staging = {
    salvar: vi.fn().mockResolvedValue("/staging/adm-1/RG.bin"),
    listar: vi.fn().mockResolvedValue([]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
  const ai = {
    auditarDocumento: vi
      .fn()
      .mockResolvedValue({ status: "VALIDADO", motivo: "Documento legível" }),
    arquivarDrive: vi.fn(),
  };
  const reguaCompletude = {
    // régua NÃO completa → não dispara auto-conclusão nem arquivamento (caminho simples e estável).
    progresso: vi
      .fn()
      .mockResolvedValue({ completa: false, obrigatoriosTotal: 5, obrigatoriosOk: 2 }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    reguaCompletude as never,
  );
  return { svc, staging, ai };
}

afterEach(() => vi.restoreAllMocks());

describe("AuditoriaService — equivalência auditarDocumento ↔ auditarBuffer (DoD §3)", () => {
  it("ambos passam o MESMO arquivo a staging.salvar e retornam o MESMO resultado", async () => {
    const { svc, staging } = makeService();
    // Magic bytes de JPEG de verdade: desde a OST do motivo verdadeiro, conteúdo que NÃO é
    // documento é reprovado na triagem e nem chega à IA (ver `auditoria/conteudo-documento`).
    // Este teste é sobre a equivalência dos dois caminhos, então o insumo tem de ser um documento.
    const arquivo = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: "RG" };

    // caminho manual (multipart) — passa o file Multer-like.
    const viaDocumento = await svc.auditarDocumento(
      "adm-1",
      "tipo-rg",
      arquivo as Express.Multer.File,
      USER,
    );
    // caminho do pull (Pandapé) — passa {buffer, originalname}.
    const viaBuffer = await svc.auditarBuffer("adm-1", "tipo-rg", arquivo, USER);

    // staging.salvar recebeu o MESMO (admissaoId, codigoTipo, arquivo) nas duas chamadas.
    expect(staging.salvar).toHaveBeenCalledTimes(2);
    expect(staging.salvar.mock.calls[0]).toEqual(staging.salvar.mock.calls[1]);
    expect(staging.salvar.mock.calls[0][2]).toBe(arquivo);

    // mesmo veredito/estado/progresso/sinalizador.
    expect(viaDocumento).toEqual(viaBuffer);
    // veredito VALIDADO da IA → estado persistido ENTREGUE (mapa do domínio).
    expect(viaDocumento.documento).toMatchObject({
      tipoDocumentoId: "tipo-rg",
      estado: "ENTREGUE",
    });
  });

  it("auditarDocumento sem arquivo → BadRequest (guard do multipart); auditarBuffer não é alcançado", async () => {
    const { svc, staging } = makeService();

    await expect(svc.auditarDocumento("adm-1", "tipo-rg", undefined, USER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(staging.salvar).not.toHaveBeenCalled();
  });

  it("o CPF do candidato vai SÓ para a IA e NÃO aparece no que é persistido (§A.6)", async () => {
    const { svc, ai, staging } = makeService();
    const arquivo = { buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), originalname: "RG" };

    await svc.auditarBuffer("adm-1", "tipo-rg", arquivo, USER);

    // a IA recebe o CPF (necessário para auditar) ...
    expect((ai.auditarDocumento as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({
      candidato: { cpf: "52998224725" },
    });
    // ... mas o nome do arquivo na staging é o CÓDIGO do tipo, não o CPF.
    expect(staging.salvar.mock.calls[0][1]).toBe("RG");
  });
});
