import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { resolvePastaPaiId } from "../ai/drive-routing";
import { admissoes } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * REQUISITO: O ARQUIVAMENTO SÓ SOBE O APROVADO.
 *
 * O buraco medido e registrado em `docs/FLUXO-AUDITORIA-HOJE-E-O-PORTAL.md`, seção 2, achado 1:
 * `auditoria.service.ts` lista TODOS os arquivos da pasta temporária e os transforma na lista de
 * envio ao Drive SEM CONSULTAR O ESTADO DE NENHUM DELES. Um documento que a IA REPROVOU, cujos
 * bytes ainda estejam na pasta quando a régua fechar, vai para o prontuário do funcionário junto
 * com os aprovados. O comentário do próprio código diz outra coisa; vale o código.
 *
 * A PROVA É DE DOIS LADOS, e a ordem importa. A que o diretor chamou de mais importante é a
 * SEGUNDA: provar que o aprovado continua subindo EXATAMENTE como hoje, com o mesmo nome final e a
 * mesma subpasta. Filtro que também derruba o aprovado não corrige nada, troca um dano por outro.
 *
 * ESTADOS, e é aqui que um mal-entendido de requisito se esconde (`db/schema/enums.ts`):
 *  - `ENTREGUE`            aprovado (pela IA ou À MÃO). É o ÚNICO que sobe.
 *  - `INCONFORME`          reprovado pela IA. NÃO sobe.
 *  - `PENDENTE`            ilegível, insuficiente, ou nunca auditado. NÃO sobe.
 *  - `AGUARDANDO_AUDITORIA` chegou e a IA ainda não olhou. NÃO sobe: subir o não auditado é a mesma
 *                          falha do achado 1, só que mais cedo. É a §A.33 aplicada ao prontuário,
 *                          abster-se é o comportamento seguro.
 *
 * ESTE ARQUIVO NÃO CONSERTA NADA. Ele é vermelho enquanto o filtro não existir, e isso é o
 * comportamento esperado.
 */

const drivePastaPaiFake = {
  resolver: async (t: string | null | undefined, c: string | null | undefined) =>
    resolvePastaPaiId(t, c, {}),
};

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
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null,
  driveAsoUrl: null,
  candidatoNome: "Fulano de Tal",
  candidatoCpf: "52998224725",
  candidatoSexo: null,
  clienteOperacao: "Operação X",
};

const FRENTES = [
  { id: "frente-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
  { id: "frente-exa", tipo: "EXAME", status: "APTO", concluida: true },
];

/** Catálogo código -> nome, lido pelo arquivamento para montar o nome final do arquivo. */
const CATALOGO = [
  { codigo: "RG", nome: "RG" },
  { codigo: "CPF", nome: "CPF" },
  { codigo: "COMPROVANTE_RESIDENCIA", nome: "Comprovante de Residência" },
  { codigo: "CARTEIRA_TRABALHO", nome: "Carteira de Trabalho" },
  { codigo: "CARTAO_SUS", nome: "Cartão SUS" },
  { codigo: "CERTIDAO_NASCIMENTO", nome: "Certidão de Nascimento" },
];

/** Uma linha de `documentos_admissao` como o arquivamento precisa enxergar: tipo + veredito. */
interface DocDaRegua {
  codigo: string;
  estado: "PENDENTE" | "ENTREGUE" | "INCONFORME" | "AGUARDANDO_AUDITORIA";
  /** Preenchido quando uma PESSOA validou. Validação humana é intocável e sobe igual. */
  validadoEm?: Date | null;
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

/**
 * O fake reconhece a consulta pela PROJEÇÃO pedida, mesmo truque das demais suítes de auditoria.
 *
 * ELE ACEITA AS TRÊS FORMAS PLAUSÍVEIS de o filtro novo perguntar "qual o veredito de cada tipo?",
 * de propósito: o teste trava o COMPORTAMENTO (o reprovado não sobe), não a consulta que o autor
 * vai escolher escrever. Qualquer uma das três recebe a mesma verdade.
 */
function makeDb(opts: { docs: DocDaRegua[]; idPrecollaborator?: string }) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const entregues = opts.docs.filter((d) => d.estado === "ENTREGUE");

  const select = vi.fn((proj: Record<string, unknown>) => {
    const keys = Object.keys(proj ?? {});
    const temCodigo = keys.includes("codigo");
    const rows = keys.includes("descricaoRegra")
      ? []
      : keys.includes("concluida")
        ? FRENTES
        : temCodigo && keys.includes("nome")
          ? CATALOGO
          : // FORMA A: código + estado de TODOS os documentos da régua (a mais direta).
            temCodigo && keys.includes("estado")
            ? opts.docs.map((d) => ({ codigo: d.codigo, estado: d.estado }))
            : // FORMA B: a consulta que JÁ existe, código + validadoEm dos ENTREGUES.
              temCodigo && keys.includes("validadoEm")
              ? entregues.map((d) => ({ codigo: d.codigo, validadoEm: d.validadoEm ?? null }))
              : // FORMA C: só os códigos aprovados.
                temCodigo && keys.length === 1
                ? entregues.map((d) => ({ codigo: d.codigo }))
                : keys.includes("estado") && keys.length === 1
                  ? [{ estado: "ENTREGUE" }]
                  : keys.length === 1 && keys.includes("id")
                    ? opts.idPrecollaborator
                      ? [{ id: opts.idPrecollaborator }]
                      : []
                    : [ADM];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      leftJoin: () => builder,
      where: () => Promise.resolve(rows),
      orderBy: () => Promise.resolve(rows),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return builder;
  });

  const registrar = (lista: Escrita[]) => (tabela: unknown) => ({
    set: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return { where: async () => undefined };
    },
    values: (valores: Record<string, unknown>) => {
      lista.push({ tabela, valores });
      return {
        onConflictDoUpdate: async () => undefined,
        onConflictDoNothing: () => ({ returning: async () => [{ id: "frente-nova" }] }),
      };
    },
  });

  const tx = { update: vi.fn(registrar(updates)), insert: vi.fn(registrar(inserts)) };

  const db = {
    select,
    update: vi.fn(registrar(updates)),
    insert: vi.fn(registrar(inserts)),
    transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    query: {
      tiposDocumento: {
        findFirst: vi.fn().mockResolvedValue({ id: "tipo-rg", codigo: "RG", nome: "RG" }),
      },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      admissoes: { findFirst: vi.fn().mockResolvedValue(ADM) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Bruna" }) },
    },
  };
  return { db, updates, inserts };
}

/** Staging COM ESTADO, como o disco real: `salvar` grava e `listar` devolve o que está lá agora. */
function makeStaging(inicial: string[]) {
  const arquivos = inicial.map((codigoTipo, i) => ({
    codigoTipo,
    caminho: `/staging/adm-1/${codigoTipo}__${i}`,
  }));
  return {
    arquivos,
    salvar: vi.fn(async (_adm: string, codigoTipo: string) => {
      const caminho = `/staging/adm-1/${codigoTipo}__novo-${arquivos.length}`;
      arquivos.push({ codigoTipo, caminho });
      return caminho;
    }),
    listar: vi.fn(async () => [...arquivos]),
    removerArquivo: vi.fn().mockResolvedValue(undefined),
    removerAdmissao: vi.fn().mockResolvedValue(undefined),
  };
}

function montar(opts: { docs: DocDaRegua[]; naStaging: string[]; idPrecollaborator?: string }) {
  const { db, updates, inserts } = makeDb({
    docs: opts.docs,
    idPrecollaborator: opts.idPrecollaborator,
  });
  const staging = makeStaging(opts.naStaging);
  const ai = {
    auditarDocumento: vi.fn(),
    arquivarDrive: vi.fn().mockResolvedValue({
      pastaUrl: "https://drive.google.com/drive/folders/REAL-1",
      arquivados: 2,
    }),
  };
  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa: true,
      obrigatoriosTotal: 2,
      obrigatoriosEntregues: 2,
      faltantes: [],
    }),
  };
  const pandapeArquivos = {
    baixarArquivosDosTipos: vi
      .fn()
      .mockResolvedValue({ arquivos: [], semRetorno: [], chamadasApi: 1 }),
  };
  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    regua as never,
    drivePastaPaiFake as never,
    pandapeArquivos as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );
  return { svc, db, updates, inserts, staging, ai, pandapeArquivos };
}

/** O que foi de fato entregue ao Drive, em código de tipo, lido da chamada real do serviço. */
function tiposEnviados(ai: { arquivarDrive: ReturnType<typeof vi.fn> }): string[] {
  expect(ai.arquivarDrive).toHaveBeenCalledTimes(1);
  const arquivos = ai.arquivarDrive.mock.calls[0][0].arquivos as Array<{ stagingPath: string }>;
  // O caminho na pasta temporária é `{codigoTipo}__{sufixo}`, que é a única identificação de tipo
  // que o lote carrega. §A.6: nenhum nome de pessoa entra nesta leitura.
  return arquivos.map((a) => a.stagingPath.split("/").pop()!.split("__")[0]);
}

const emAdmissoes = (escritas: Escrita[]) => escritas.filter((e) => e.tabela === admissoes);

afterEach(() => vi.restoreAllMocks());

describe("LADO 1: o REPROVADO não chega ao prontuário", () => {
  it("INCONFORME e PENDENTE com bytes na pasta NÃO são enviados ao Drive", async () => {
    // Exatamente o cenário do achado 1: a régua fechou, e a pasta temporária ainda tem os bytes de
    // um documento que a IA reprovou e de um que ela não conseguiu ler.
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE" },
        { codigo: "CPF", estado: "ENTREGUE" },
        { codigo: "COMPROVANTE_RESIDENCIA", estado: "INCONFORME" },
        { codigo: "CARTEIRA_TRABALHO", estado: "PENDENTE" },
      ],
      naStaging: ["RG", "CPF", "COMPROVANTE_RESIDENCIA", "CARTEIRA_TRABALHO"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    const enviados = tiposEnviados(ctx.ai);
    expect(enviados).not.toContain("COMPROVANTE_RESIDENCIA");
    expect(enviados).not.toContain("CARTEIRA_TRABALHO");
  });

  it("AGUARDANDO_AUDITORIA não sobe: o que ninguém auditou não vira prontuário", async () => {
    // O documento chegou pelo Portal ou pela coleta e a IA ainda não olhou. Subir aqui é a mesma
    // falha do achado 1, antecipada: o prontuário passaria a guardar o não julgado.
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE" },
        { codigo: "CPF", estado: "AGUARDANDO_AUDITORIA" },
      ],
      naStaging: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(tiposEnviados(ctx.ai)).toEqual(["RG"]);
  });

  it("tipo que está na pasta e NÃO tem linha na régua não sobe (órfão da staging)", async () => {
    // Sobra de reclassificação de tipo: o arquivo ficou na pasta e nenhum documento o reivindica.
    // Sem veredito nenhum, ele não é aprovado, então não entra no prontuário.
    const ctx = montar({
      docs: [{ codigo: "RG", estado: "ENTREGUE" }],
      naStaging: ["RG", "CERTIDAO_NASCIMENTO"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(tiposEnviados(ctx.ai)).toEqual(["RG"]);
  });
});

describe("LADO 2, O QUE MAIS IMPORTA: o APROVADO continua subindo exatamente como hoje", () => {
  it("todos os ENTREGUE sobem, com o MESMO nome final e a MESMA subpasta de sempre", async () => {
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE" },
        { codigo: "CPF", estado: "ENTREGUE" },
        { codigo: "COMPROVANTE_RESIDENCIA", estado: "INCONFORME" },
      ],
      naStaging: ["RG", "CPF", "COMPROVANTE_RESIDENCIA"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    const arquivos = ctx.ai.arquivarDrive.mock.calls[0][0].arquivos;
    // Nome final e subpasta são o contrato de hoje, e o filtro não pode encostar em nenhum dos dois.
    expect(arquivos).toEqual([
      expect.objectContaining({
        nomeFinal: "RG_FULANO DE TAL",
        subpasta: "DOCUMENTOS_PESSOAIS",
        stagingPath: "/staging/adm-1/RG__0",
      }),
      expect.objectContaining({
        nomeFinal: "CPF_FULANO DE TAL",
        subpasta: "DOCUMENTOS_PESSOAIS",
        stagingPath: "/staging/adm-1/CPF__1",
      }),
    ]);
    // E a pasta continua sendo gravada na admissão, como sempre foi.
    expect(emAdmissoes(ctx.updates)).toContainEqual(
      expect.objectContaining({
        valores: expect.objectContaining({
          drivePastaUrl: "https://drive.google.com/drive/folders/REAL-1",
        }),
      }),
    );
  });

  it("régua inteiramente aprovada envia TUDO: o filtro não tira nada de quem passou", async () => {
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE" },
        { codigo: "CPF", estado: "ENTREGUE" },
        { codigo: "CARTAO_SUS", estado: "ENTREGUE" },
      ],
      naStaging: ["RG", "CPF", "CARTAO_SUS"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(tiposEnviados(ctx.ai).sort()).toEqual(["CARTAO_SUS", "CPF", "RG"]);
  });

  it("REQUISITO 4: documento validado À MÃO sobe, porque o estado dele é ENTREGUE", async () => {
    // A mudança não pode punir a validação humana. `validadoEm` preenchido é a marca de que uma
    // pessoa decidiu por cima da IA, e a precedência dela sobre a automação é regra da casa.
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE", validadoEm: new Date("2026-09-01T10:00:00Z") },
        { codigo: "CPF", estado: "INCONFORME" },
      ],
      naStaging: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(tiposEnviados(ctx.ai)).toEqual(["RG"]);
  });
});

describe("REQUISITO 5: FACULTATIVO reprovado também não sobe (consequência intencional)", () => {
  it("o critério é o VEREDITO, nunca a obrigatoriedade da régua", async () => {
    // Trava deliberada: um facultativo reprovado é um documento reprovado, e prontuário não guarda
    // documento reprovado. Quem um dia quiser "consertar" isto abrindo exceção para o facultativo
    // derruba este teste antes de chegar em produção.
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE" },
        { codigo: "CARTAO_SUS", estado: "INCONFORME" },
      ],
      naStaging: ["RG", "CARTAO_SUS"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(tiposEnviados(ctx.ai)).not.toContain("CARTAO_SUS");
  });

  it("facultativo APROVADO continua subindo (o prontuário leva tudo que passou)", async () => {
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "ENTREGUE" },
        { codigo: "CARTAO_SUS", estado: "ENTREGUE" },
      ],
      naStaging: ["RG", "CARTAO_SUS"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(tiposEnviados(ctx.ai)).toContain("CARTAO_SUS");
  });
});

describe("REQUISITO 3: régua fechada = PRONTUÁRIO CRIADO SEMPRE, mesmo com a lista vazia", () => {
  it("todos reprovados: a pasta NASCE assim mesmo e o motivo de incompleto fica gravado", async () => {
    // Esta é a regressão mais fácil de introduzir junto com o filtro: bastaria o autor voltar com
    // `if (arquivos.length === 0) return`. A decisão do diretor é a oposta, e é anterior a esta OST:
    // documento ausente NÃO pode impedir a criação da pasta.
    const ctx = montar({
      docs: [
        { codigo: "RG", estado: "INCONFORME" },
        { codigo: "CPF", estado: "PENDENTE" },
      ],
      naStaging: ["RG", "CPF"],
      idPrecollaborator: "PC-1",
    });

    const pos = await ctx.svc.aplicarPosVeredito("adm-1", USER);

    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(ctx.ai.arquivarDrive.mock.calls[0][0].arquivos).toEqual([]);
    expect(pos.arquivado?.pastaUrl).toContain("/folders/REAL-1");

    const gravacao = emAdmissoes(ctx.updates).find((u) => u.valores.drivePastaUrl);
    expect(gravacao).toBeDefined();
    // O prontuário nasceu incompleto, e isso tem de ficar dito. Pasta vazia e silêncio é o
    // desfecho que a OST do "fim do silêncio" existe para não voltar a acontecer.
    expect(gravacao?.valores.driveFalhaMotivo).toBeTruthy();
    expect(gravacao?.valores.driveFalhaEm).toBeInstanceOf(Date);
  });

  it("o motivo gravado NÃO carrega PII: só código de tipo e texto de sistema (§A.6)", async () => {
    const ctx = montar({
      docs: [{ codigo: "RG", estado: "INCONFORME" }],
      naStaging: ["RG"],
      idPrecollaborator: "PC-1",
    });

    await ctx.svc.aplicarPosVeredito("adm-1", USER);

    for (const escrita of emAdmissoes(ctx.updates)) {
      const motivo = String(escrita.valores.driveFalhaMotivo ?? "");
      expect(motivo).not.toContain(ADM.candidatoCpf);
      expect(motivo.toUpperCase()).not.toContain("FULANO");
    }
  });
});

describe("REQUISITO 6: o caminho que RE-BAIXA do Pandapé não passa a julgar documento", () => {
  /**
   * A trava é ESTRUTURAL, não de disciplina: o `PandapeArquivosService` não tem `Database`
   * injetado, e é isso que garante que re-baixar um binário jamais reescreve veredito, nem o da IA
   * nem o da validação humana. Este teste lê o ARQUIVO de produção e prova que continua assim.
   *
   * Ele é de LEITURA. A fronteira desta sessão proíbe editar `src/pandape/**`, e nada aqui edita.
   */
  const fonte = readFileSync(
    join(__dirname, "..", "pandape", "pandape-arquivos.service.ts"),
    "utf8",
  );

  it("o service continua SEM banco injetado: um único parâmetro no construtor, a API", () => {
    const construtor = fonte.match(/constructor\(([^)]*)\)/)?.[1] ?? "";
    expect(construtor).toContain("PandapeApiService");
    expect(construtor.split(",").filter((p) => p.trim().length > 0)).toHaveLength(1);
  });

  it("não importa o banco, nem o schema, nem a tabela de documentos", () => {
    for (const proibido of ["db/client", "DRIZZLE", "drizzle-orm", "documentosAdmissao", "db/schema"]) {
      expect(fonte).not.toContain(proibido);
    }
  });

  it("o filtro por veredito NÃO foi parar aqui: nenhum estado de documento no arquivo", () => {
    // Se alguém resolver o requisito 1 filtrando DENTRO do re-baixar, o veredito passa a ser
    // decidido num service que não enxerga o banco, e a régua vira suposição sobre o Pandapé.
    for (const estado of ["INCONFORME", "AGUARDANDO_AUDITORIA", "ENTREGUE"]) {
      expect(fonte).not.toContain(estado);
    }
  });
});
