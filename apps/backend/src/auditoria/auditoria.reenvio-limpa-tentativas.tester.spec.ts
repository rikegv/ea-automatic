import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { AuditoriaService } from "./auditoria.service";
import { StagingService } from "../staging/staging.service";
import { resolvePastaPaiId } from "../ai/drive-routing";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * REQUISITO R3: AO REENVIAR UM DOCUMENTO DE UM TIPO, AS TENTATIVAS ANTERIORES DAQUELE TIPO SÃO
 * APAGADAS DA PASTA TEMPORÁRIA.
 *
 * ┌─ O QUE FALHA HOJE, medido no código ────────────────────────────────────────────────────────┐
 * │ `auditarConjunto` grava TODO arquivo do conjunto na pasta temporária e NÃO apaga nada do que  │
 * │ já estava lá para aquele tipo. Só o reenvio do ASO (`classificarAso`) limpa antes, e ele é o  │
 * │ único. Reenviar um RG corrigido deixa as duas versões na pasta, e quem monta o prontuário     │
 * │ lista a pasta: sobe a errada junto com a certa.                                               │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CASO QUE MAIS IMPORTA, E É ONDE O AUTOR ERRA: O DOCUMENTO É UM CONJUNTO ────────────────┐
 * │ Frente e verso de um RG chegam numa chamada só, e a pasta é a MESMA para os dois, porque a  │
 * │ chave é (admissão + tipo), nunca o arquivo. A limpeza tem de acontecer UMA VEZ, ANTES de     │
 * │ salvar o conjunto inteiro.                                                                   │
 * │                                                                                              │
 * │ O atalho é uma linha mais curta e é a que a mão escreve sozinha:                              │
 * │                                                                                              │
 * │     for (const f of arquivos) {                                                              │
 * │       await this.limparStagingDoTipo(admissaoId, tipo.codigo);   // DENTRO do laço            │
 * │       stagingPaths.push(await this.staging.salvar(admissaoId, tipo.codigo, f));               │
 * │     }                                                                                        │
 * │                                                                                              │
 * │ Com ela, o segundo arquivo APAGA O PRIMEIRO e o sistema guarda só o verso. O veredito da IA   │
 * │ continua vindo do conjunto inteiro (os buffers estão em memória), então nada fica vermelho e  │
 * │ nada parece errado: o prontuário é que fica com meio documento, e isso só aparece quando      │
 * │ alguém abrir a pasta do funcionário meses depois. `stagingPaths` também passa a apontar para  │
 * │ um arquivo apagado, que é o que a visualização do consultor abre.                             │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * A PASTA É DE VERDADE, e isso é escolha, não conveniência: um dublê de staging com lista em
 * memória deixaria o defeito acima passar VERDE quando a ordem das chamadas fosse a certa mas o
 * efeito no disco não. O que se mede aqui são os arquivos que sobraram no diretório.
 *
 * §A.6: fixtures sem dado pessoal de verdade; nada é logado.
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
  tipoContrato: "Temporário",
  dataAdmissao: null,
  drivePastaUrl: null,
  driveAsoUrl: null,
  driveDuplicatasBaixadas: null,
  candidatoNome: "Candidato Teste",
  candidatoCpf: "52998224725",
  candidatoSexo: null,
  candidatoBanco: null,
  candidatoAgencia: null,
  candidatoConta: null,
  clienteOperacao: "Operação X",
};

const TIPOS: Record<string, { id: string; codigo: string; nome: string }> = {
  RG: { id: "tipo-rg", codigo: "RG", nome: "RG" },
  ASO: { id: "tipo-aso", codigo: "ASO", nome: "ASO" },
  CPF: { id: "tipo-cpf", codigo: "CPF", nome: "CPF" },
};

/** PDF de verdade nos magic bytes: é o que a triagem de conteúdo exige para mandar à IA. */
const pdf = (marca: string) => ({
  buffer: Buffer.from(`%PDF-1.4\n% ${marca}\n%%EOF\n`, "utf8"),
  originalname: `${marca}.pdf`,
});

/** Os arquivos que estão na pasta AGORA, por tipo, lidos do disco. */
function naPasta(dir: string, admissaoId = "adm-1"): { tipo: string; marca: string }[] {
  let nomes: string[];
  try {
    nomes = readdirSync(join(dir, admissaoId));
  } catch {
    return [];
  }
  return nomes.map((nome) => ({
    tipo: nome.split("__")[0] ?? "",
    // A marca identifica QUAL tentativa sobreviveu, e ela vem do conteúdo, nunca do nome (o nome
    // carrega um uuid). É assim que "sobrou o verso" se distingue de "sobrou a frente".
    marca: readFileSync(join(dir, admissaoId, nome), "utf8").split("% ")[1]?.split("\n")[0] ?? "",
  }));
}

/**
 * Texto de um nó SQL do drizzle, parâmetros incluídos. `JSON.stringify` não serve: a coluna aponta
 * para a tabela, que aponta de volta para a coluna, e o ciclo derruba a serialização.
 */
function serializar(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (Array.isArray(no)) return no.map(serializar).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(serializar).join(" ");
  if ("value" in o && "encoder" in o) return serializar(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(serializar).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

const marcasDoTipo = (dir: string, tipo: string) =>
  naPasta(dir)
    .filter((a) => a.tipo === tipo)
    .map((a) => a.marca)
    .sort();

function montar(opts: { completa?: boolean } = {}) {
  /** As MARCAS dos arquivos que de fato subiram ao prontuário, capturadas na chamada. */
  const enviadosAoDrive: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), "ea-tester-reenvio-"));
  const staging = new StagingService({ get: () => dir } as never);

  const select = vi.fn((proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("descricaoRegra")
      ? [{ descricaoRegra: "o documento tem de estar legível" }]
      : chaves.includes("concluida")
        ? [
            { id: "f-aud", tipo: "AUDITORIA", status: "ANALISE_PENDENTE", concluida: false },
            { id: "f-exa", tipo: "EXAME", status: "APTO", concluida: true },
          ]
        : chaves.includes("codigo") && chaves.includes("nome")
          ? Object.values(TIPOS).map((t) => ({ codigo: t.codigo, nome: t.nome }))
          : chaves.includes("codigo")
            ? Object.values(TIPOS).map((t) => ({ codigo: t.codigo, estado: "ENTREGUE", validadoEm: null }))
            : chaves.includes("estado") && chaves.length === 1
              ? [{ estado: "ENTREGUE" }]
              : chaves.includes("candidatoNome")
                ? [ADM]
                : [];
    const b: Record<string, unknown> = {};
    b.from = () => b;
    b.innerJoin = () => b;
    b.leftJoin = () => b;
    b.where = () => Promise.resolve(linhas);
    b.orderBy = () => Promise.resolve(linhas);
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve(linhas).then(ok);
    return b;
  });

  const escrever = () => (_tabela: unknown) => ({
    set: () => ({ where: async () => undefined }),
    where: async () => undefined,
    values: () => ({
      onConflictDoUpdate: async () => undefined,
      onConflictDoNothing: () => ({ returning: async () => [{ id: "novo" }] }),
    }),
  });

  const db = {
    select,
    update: vi.fn(escrever()),
    insert: vi.fn(escrever()),
    delete: vi.fn(escrever()),
    transaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({ update: vi.fn(escrever()), insert: vi.fn(escrever()), delete: vi.fn(escrever()) }),
    query: {
      tiposDocumento: {
        findFirst: vi.fn(async (args?: { where?: unknown }) => {
          const alvo = serializar(args?.where);
          const porId = Object.values(TIPOS).find((t) => alvo.includes(t.id));
          if (porId) return porId;
          // `classificarAso` procura pelo CÓDIGO, não pelo id. A comparação é por palavra inteira
          // para um código não casar por ser prefixo de outro.
          return (
            Object.values(TIPOS).find((t) =>
              new RegExp(`(^|[^A-Za-z0-9_])${t.codigo}([^A-Za-z0-9_]|$)`).test(alvo),
            ) ?? TIPOS.RG
          );
        }),
      },
      admissoes: { findFirst: vi.fn().mockResolvedValue(ADM) },
      dadosVagaFolha: { findFirst: vi.fn().mockResolvedValue({ salario: "2000" }) },
      documentosAdmissao: { findFirst: vi.fn().mockResolvedValue({ estado: "ENTREGUE" }) },
      usuarios: { findFirst: vi.fn().mockResolvedValue({ id: USER.id, nome: "Bruna" }) },
    },
  };

  const ai = {
    auditarDocumento: vi.fn().mockResolvedValue({
      valido: true,
      status: "VALIDADO",
      motivo: "documento legível",
      camposConferidos: [],
    }),
    // O CONTEÚDO É LIDO NA HORA DA CHAMADA, de propósito: o arquivamento EXPURGA a pasta logo
    // depois de subir (§A.6), então ler o disco na asserção acharia o vazio.
    arquivarDrive: vi.fn(async (pedido: { arquivos: Array<{ stagingPath: string }> }) => {
      enviadosAoDrive.push(
        ...pedido.arquivos.map((a) => readFileSync(a.stagingPath, "utf8").split("% ")[1]?.split("\n")[0] ?? ""),
      );
      return { pastaUrl: "https://drive.google.com/drive/folders/REAL-1", arquivados: pedido.arquivos.length };
    }),
  };

  const regua = {
    progresso: vi.fn().mockResolvedValue({
      completa: opts.completa === true,
      obrigatoriosTotal: 1,
      obrigatoriosEntregues: opts.completa === true ? 1 : 0,
      faltantes: [],
    }),
  };

  const svc = new AuditoriaService(
    db as never,
    staging as never,
    ai as never,
    regua as never,
    { resolver: async (t: string | null, c: string | null) => resolvePastaPaiId(t, c, {}) } as never,
    { baixarArquivosDosTipos: vi.fn().mockResolvedValue({ arquivos: [], semRetorno: [], chamadasApi: 0 }) } as never,
    { enviar: async () => ({ enviado: false, motivo: "GI_NAO_CONFIGURADO" }) } as never,
  );

  return { svc, staging, dir, ai, enviadosAoDrive, limpar: () => rmSync(dir, { recursive: true, force: true }) };
}

const lixeira: Array<() => void> = [];
afterEach(() => {
  while (lixeira.length) lixeira.pop()!();
  vi.restoreAllMocks();
});

function contexto(opts: { completa?: boolean } = {}) {
  const ctx = montar(opts);
  lixeira.push(ctx.limpar);
  return ctx;
}

describe("R3.1: reenviou, a tentativa velha SUMIU da pasta temporária", () => {
  it("o RG reenviado substitui o anterior: sobra UM arquivo, e é o novo", async () => {
    const ctx = contexto();
    // A primeira tentativa, que a IA reprovou e o candidato refez.
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-tentativa-velha"));
    expect(marcasDoTipo(ctx.dir, "RG")).toEqual(["rg-tentativa-velha"]);

    await ctx.svc.auditarConjunto("adm-1", "tipo-rg", [pdf("rg-tentativa-nova")], USER);

    expect(
      marcasDoTipo(ctx.dir, "RG"),
      "a tentativa velha continua na pasta: o prontuário vai receber as duas versões",
    ).toEqual(["rg-tentativa-nova"]);
  });

  it("SÓ O NOVO sobe ao prontuário quando a régua fecha", async () => {
    const ctx = contexto({ completa: true });
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-tentativa-velha"));

    await ctx.svc.auditarConjunto("adm-1", "tipo-rg", [pdf("rg-tentativa-nova")], USER);

    expect(ctx.ai.arquivarDrive).toHaveBeenCalledTimes(1);
    expect(
      ctx.enviadosAoDrive,
      "a tentativa velha subiu junto: o prontuário do funcionário ficou com duas versões do RG",
    ).toEqual(["rg-tentativa-nova"]);
  });
});

describe("R3.2, O QUE MAIS IMPORTA: o documento é um CONJUNTO, e a limpeza é UMA VEZ SÓ", () => {
  /**
   * A limpeza por ARQUIVO faz o verso apagar a frente, e o sistema guarda meio documento sem que
   * nada fique vermelho. Este é o teste que pega o atalho descrito no topo do arquivo.
   */
  it("frente E verso do RG sobrevivem ao reenvio: a limpeza NÃO roda por arquivo", async () => {
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-conjunto-velho"));

    await ctx.svc.auditarConjunto(
      "adm-1",
      "tipo-rg",
      [pdf("rg-frente"), pdf("rg-verso")],
      USER,
    );

    expect(
      marcasDoTipo(ctx.dir, "RG"),
      "a limpeza rodou POR ARQUIVO: o segundo apagou o primeiro e sobrou meio documento",
    ).toEqual(["rg-frente", "rg-verso"]);
  });

  it("as três páginas de uma CTPS sobrevivem, e a tentativa velha não", async () => {
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "RG", pdf("velha-1"));
    await ctx.staging.salvar("adm-1", "RG", pdf("velha-2"));

    await ctx.svc.auditarConjunto(
      "adm-1",
      "tipo-rg",
      [pdf("pagina-1"), pdf("pagina-2"), pdf("pagina-3")],
      USER,
    );

    expect(marcasDoTipo(ctx.dir, "RG")).toEqual(["pagina-1", "pagina-2", "pagina-3"]);
  });

  /**
   * O CAMINHO QUE O CONSULTOR ABRE. `stagingPaths` alimenta a chamada à IA e a visualização do
   * documento recebido: apontar para arquivo apagado é o mesmo defeito visto do outro lado, e ele
   * passaria despercebido por uma asserção que só contasse arquivos na pasta.
   */
  it("todo caminho entregue à IA continua existindo no disco depois da gravação", async () => {
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-velho"));

    await ctx.svc.auditarConjunto("adm-1", "tipo-rg", [pdf("rg-frente"), pdf("rg-verso")], USER);

    const caminhos = (ctx.ai.auditarDocumento.mock.calls[0][0] as { stagingPaths: string[] })
      .stagingPaths;
    expect(caminhos).toHaveLength(2);
    for (const caminho of caminhos) {
      expect(() => readFileSync(caminho), `caminho entregue à IA já não existe: ${caminho}`).not.toThrow();
    }
  });
});

describe("R3.3: apagar as tentativas de UM tipo não encosta nos outros tipos", () => {
  it("reenviar o RG preserva o CPF e o ASO da MESMA admissão", async () => {
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-velho"));
    await ctx.staging.salvar("adm-1", "CPF", pdf("cpf-bom"));
    await ctx.staging.salvar("adm-1", "ASO", pdf("aso-bom"));

    await ctx.svc.auditarConjunto("adm-1", "tipo-rg", [pdf("rg-novo")], USER);

    expect(marcasDoTipo(ctx.dir, "RG")).toEqual(["rg-novo"]);
    expect(
      marcasDoTipo(ctx.dir, "CPF"),
      "a limpeza varreu a pasta inteira em vez de um tipo só",
    ).toEqual(["cpf-bom"]);
    expect(marcasDoTipo(ctx.dir, "ASO")).toEqual(["aso-bom"]);
  });

  it("prefixo parecido NÃO é o mesmo tipo: limpar RG não apaga RG_ANTIGO", async () => {
    // A pasta identifica o tipo pelo pedaço antes de `__`, então a comparação tem de ser por
    // igualdade. `startsWith` derrubaria todo tipo cujo código comece com o mesmo texto.
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "RG_ANTIGO", pdf("outro-tipo"));
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-velho"));

    await ctx.svc.auditarConjunto("adm-1", "tipo-rg", [pdf("rg-novo")], USER);

    expect(marcasDoTipo(ctx.dir, "RG_ANTIGO")).toEqual(["outro-tipo"]);
  });
});

describe("R3.4: o reenvio do ASO, que já limpava antes, continua funcionando igual", () => {
  it("classificarAso substitui o ASO anterior e deixa UM arquivo", async () => {
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "ASO", pdf("aso-velho"));

    await ctx.svc.classificarAso("adm-1", pdf("aso-novo"));

    expect(marcasDoTipo(ctx.dir, "ASO")).toEqual(["aso-novo"]);
  });

  it("e não encosta nos documentos da régua que estão na mesma pasta", async () => {
    const ctx = contexto();
    await ctx.staging.salvar("adm-1", "ASO", pdf("aso-velho"));
    await ctx.staging.salvar("adm-1", "RG", pdf("rg-bom"));

    await ctx.svc.classificarAso("adm-1", pdf("aso-novo"));

    expect(marcasDoTipo(ctx.dir, "RG")).toEqual(["rg-bom"]);
  });

  it("o motivo do veredito continua voltando ao consultor", async () => {
    const ctx = contexto();
    const r = await ctx.svc.classificarAso("adm-1", pdf("aso-novo"));
    expect(r.motivo).toBe("documento legível");
    expect(r.valido).toBe(true);
  });
});

/**
 * A GUARDA DA GUARDA: teste verde só vale se ele soubesse ficar vermelho.
 *
 * O bloco R3.2 passou a verde no MESMO turno em que a construção landou, e teste que nasce verde é
 * indistinguível de teste que não mede nada. Aqui o defeito é FABRICADO por fora da produção (a
 * gravação passa a limpar o tipo antes de CADA arquivo, que é o atalho do laço) e se confere que a
 * invariante quebra. Nenhuma linha de produção é tocada.
 */
describe("prova de que o detector do conjunto tem dente", () => {
  it("com a limpeza POR ARQUIVO, frente e verso viram só o verso", async () => {
    const ctx = contexto();
    const salvarDeVerdade = ctx.staging.salvar.bind(ctx.staging);
    vi.spyOn(ctx.staging, "salvar").mockImplementation(async (adm, codigoTipo, file) => {
      // O defeito: limpar dentro do laço, uma vez por arquivo do MESMO conjunto.
      for (const a of await ctx.staging.listar(adm)) {
        if (a.codigoTipo === codigoTipo) await ctx.staging.removerArquivo(a.caminho);
      }
      return salvarDeVerdade(adm, codigoTipo, file);
    });

    await ctx.svc.auditarConjunto("adm-1", "tipo-rg", [pdf("rg-frente"), pdf("rg-verso")], USER);

    expect(marcasDoTipo(ctx.dir, "RG")).toEqual(["rg-verso"]);
  });
});
