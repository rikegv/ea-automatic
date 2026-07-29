import { ConfigService } from "@nestjs/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClicksignSyncService } from "./clicksign-sync.service";
import {
  grupoDaOrdem,
  resolverAssinantes,
  cpfValido,
  nomeSignatarioValido,
  type AssinanteEmpresa,
} from "../domain/assinante-empresa";

/**
 * DOIS SIGNATÁRIOS NO ENVELOPE (INT-4).
 *
 * Um contrato de trabalho tem o FUNCIONÁRIO e a EMPRESA. Até aqui o EA mandava só o funcionário, com
 * papel genérico `sign`. Estes testes travam o desenho aprovado: papéis `employee`/`employer`, grupos
 * 1 e 2 (funcionário primeiro, empresa depois) e `refusable` distinto por signatário.
 *
 * A resolução de QUEM assina pela empresa (exceção do cliente, senão padrão) é testada como função
 * pura, sem banco.
 */

const drivePastaPaiFake = { resolver: async () => "PASTA_PAI" };

function selectChain<T>(result: T) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "groupBy"]) b[m] = () => b;
  b.then = (res: (v: T) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(result).then(res, rej);
  return b;
}

const REPRESENTANTE: AssinanteEmpresa = {
  codCliente: null,
  nome: "Representante Soulan",
  email: "representante@soulan.com.br",
  cpf: "11144477735",
  ordem: 1,
  ativo: true,
};

/** Monta o service com a Clicksign toda mockada e o kit presente na staging. */
function montar(over: { assinantes?: AssinanteEmpresa[] } = {}) {
  let seqSigner = 0;
  const api = {
    estaAtivo: () => true,
    criarEnvelope: vi.fn().mockResolvedValue({ id: "env-1" }),
    anexarDocumento: vi.fn().mockResolvedValue({ id: "doc-1" }),
    adicionarSigner: vi
      .fn()
      .mockImplementation(async () => ({ id: `sig-${++seqSigner}` })),
    criarRequirement: vi.fn().mockResolvedValue(undefined),
    ativarEnvelope: vi.fn().mockResolvedValue(undefined),
  };

  const adm = {
    id: "adm-1",
    codCliente: "631",
    tipoContrato: "Temporário",
    clicksignEnvelopeId: null,
    candidatoNome: "Maria Silva",
    candidatoCpf: "52998224725",
    candidatoEmail: "maria@e.com",
    clienteOperacao: "SOULAN",
    pausadaEm: null,
  };
  const resultados: unknown[] = [
    [adm],
    [
      { tipo: "AUDITORIA", concluida: true },
      { tipo: "EXAME", concluida: true },
      { tipo: "CADASTRO_CONTRATO", concluida: true },
    ],
  ];
  let i = 0;
  const select = vi.fn().mockImplementation(() => selectChain(resultados[i++] ?? []));
  const setCalls: Record<string, unknown>[] = [];
  const update = vi.fn().mockImplementation(() => ({
    set: (v: Record<string, unknown>) => {
      setCalls.push(v);
      return { where: () => Promise.resolve(undefined) };
    },
  }));

  const assinantes = {
    resolverConjunto: vi.fn().mockResolvedValue(over.assinantes ?? [REPRESENTANTE]),
  };

  const svc = new ClicksignSyncService(
    { select, update, query: {} } as never,
    {} as ConfigService,
    api as never,
    { enfileirarTick: vi.fn(), enfileirarCriarEnvelope: vi.fn() } as never,
    { dentroDaRaiz: vi.fn().mockReturnValue(true), salvar: vi.fn(), removerArquivo: vi.fn() } as never,
    { arquivarDrive: vi.fn() } as never,
    { gerar: vi.fn() } as never,
    drivePastaPaiFake as never,
    { marcarInicioCiclo: vi.fn(), registrarCiclo: vi.fn() } as never,
    assinantes as never,
  );
  const warn = vi
    .spyOn((svc as unknown as { logger: { warn: (m: string) => void } }).logger, "warn")
    .mockImplementation(() => undefined);
  return { svc, api, assinantes, setCalls, warn };
}

/**
 * O kit precisa existir no disco: o service lê o arquivo antes de falar com a Clicksign.
 *
 * E precisa ser um PDF ESTRUTURALMENTE VÁLIDO. O `criarEnvelope` passou a validar o arquivo antes de
 * anexar (`domain/pdf-kit`, proteção da virada de produção), então o stub de uma linha que este mock
 * usava antes é justamente o que a nova defesa recusa. Um PDF de mentira aqui faria estes testes
 * passarem por engano, exercitando o caminho de recusa em vez do fluxo dos signatários.
 */
const KIT_PDF_FAKE = Buffer.from(
  `%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
    `3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n% ${"kit de teste ".repeat(80)}\n` +
    `xref\n0 4\ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n9\n%%EOF\n`,
);

/** O que o disco devolve neste teste. Mutável para o caso do kit corrompido, no fim do arquivo. */
let kitNoDisco: Buffer = KIT_PDF_FAKE;

vi.mock("node:fs", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, existsSync: () => true };
});
vi.mock("node:fs/promises", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, readFile: async () => kitNoDisco };
});

describe("criarEnvelope monta os DOIS signatários com papel e ordem corretos", () => {
  afterEach(() => vi.restoreAllMocks());

  it("funcionário: papel employee, grupo 1, pode recusar", async () => {
    const { svc, api } = montar();
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");

    const [envId, func] = api.adicionarSigner.mock.calls[0];
    expect(envId).toBe("env-1");
    expect(func).toMatchObject({
      nome: "Maria Silva",
      email: "maria@e.com",
      cpf: "52998224725",
      group: 1,
      refusable: true,
    });
    expect(api.criarRequirement).toHaveBeenNthCalledWith(1, "env-1", {
      documentId: "doc-1",
      signerId: "sig-1",
      role: "employee",
    });
  });

  it("empresa: papel employer, grupo 2, NÃO pode recusar", async () => {
    const { svc, api } = montar();
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");

    const [, empresa] = api.adicionarSigner.mock.calls[1];
    expect(empresa).toMatchObject({
      nome: REPRESENTANTE.nome,
      email: REPRESENTANTE.email,
      cpf: REPRESENTANTE.cpf,
      group: 2,
      refusable: false,
    });
    expect(api.criarRequirement).toHaveBeenNthCalledWith(2, "env-1", {
      documentId: "doc-1",
      signerId: "sig-2",
      role: "employer",
    });
  });

  it("são exatamente DOIS signatários e DOIS requirements, e o envelope é ativado", async () => {
    const { svc, api } = montar();
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    expect(api.adicionarSigner).toHaveBeenCalledTimes(2);
    expect(api.criarRequirement).toHaveBeenCalledTimes(2);
    expect(api.ativarEnvelope).toHaveBeenCalledWith("env-1");
  });

  it("o papel genérico `sign` NÃO é mais usado", async () => {
    const { svc, api } = montar();
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    const papeis = api.criarRequirement.mock.calls.map((c) => (c[1] as { role: string }).role);
    expect(papeis).toEqual(["employee", "employer"]);
    expect(papeis).not.toContain("sign");
  });

  it("a resolução do assinante recebe o cod_cliente da admissão (para achar a exceção)", async () => {
    const { svc, assinantes } = montar();
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    expect(assinantes.resolverConjunto).toHaveBeenCalledWith("631");
  });

  /**
   * O caso que protege contra envelope pela metade: sem representante cadastrado, o EA não pode
   * criar um envelope só com o funcionário. Um draft órfão ficaria vivo na Clicksign e não seria
   * assinável, então o corte tem de acontecer ANTES de qualquer chamada.
   */
  it("SEM representante cadastrado: não cria nada na Clicksign e avisa onde cadastrar", async () => {
    const { svc, api, setCalls, warn } = montar({ assinantes: [] });
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");

    expect(api.criarEnvelope).not.toHaveBeenCalled();
    expect(api.adicionarSigner).not.toHaveBeenCalled();
    expect(api.ativarEnvelope).not.toHaveBeenCalled();
    expect(setCalls).toHaveLength(0);
    expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).toMatch(/representante da empresa/i);
  });

  it("§A.6: nenhum CPF aparece em log", async () => {
    const { svc, warn } = montar({ assinantes: [] });
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    const tudo = warn.mock.calls.map((c) => String(c[0])).join(" | ");
    expect(tudo).not.toContain("11144477735");
    expect(tudo).not.toContain("52998224725");
  });
});

describe("N representantes: paralelo na mesma ordem, sequência em ordens diferentes", () => {
  afterEach(() => vi.restoreAllMocks());

  const CONJUNTO: AssinanteEmpresa[] = [
    { codCliente: "631", nome: "Ana Paralela", email: "ana@x.com", cpf: "11144477735", ordem: 1, ativo: true },
    { codCliente: "631", nome: "Bruno Paralelo", email: "bruno@x.com", cpf: "52998224725", ordem: 1, ativo: true },
    { codCliente: "631", nome: "Carla Sequencia", email: "carla@x.com", cpf: "39053344705", ordem: 2, ativo: true },
  ];

  it("funcionário no grupo 1, os dois de ordem 1 no MESMO grupo 2, o de ordem 2 no grupo 3", async () => {
    const { svc, api } = montar({ assinantes: CONJUNTO });
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");

    const enviados = api.adicionarSigner.mock.calls.map((c) => {
      const s = c[1] as { nome: string; group: number; refusable: boolean };
      return [s.nome, s.group, s.refusable];
    });
    expect(enviados).toEqual([
      ["Maria Silva", 1, true],
      ["Ana Paralela", 2, false],
      ["Bruno Paralelo", 2, false],
      ["Carla Sequencia", 3, false],
    ]);
  });

  it("papéis: um employee e N employer", async () => {
    const { svc, api } = montar({ assinantes: CONJUNTO });
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    const papeis = api.criarRequirement.mock.calls.map((c) => (c[1] as { role: string }).role);
    expect(papeis).toEqual(["employee", "employer", "employer", "employer"]);
  });

  /**
   * A armadilha da API (sondagem de 28/07): omitir `group` NÃO cai no grupo 1, vai para `max+1`, o
   * que jogaria o signatário para o fim da fila sem ninguém perceber. Por isso todo signatário sai
   * daqui com o grupo EXPLÍCITO.
   */
  it("TODO signatário sai com o group explícito (nunca omitido)", async () => {
    const { svc, api } = montar({ assinantes: CONJUNTO });
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    for (const c of api.adicionarSigner.mock.calls) {
      const s = c[1] as { group?: number };
      expect(typeof s.group).toBe("number");
    }
  });

  it("o CPF de cada representante vai junto (obrigatório por decisão do diretor)", async () => {
    const { svc, api } = montar({ assinantes: CONJUNTO });
    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");
    const cpfs = api.adicionarSigner.mock.calls.slice(1).map((c) => (c[1] as { cpf: string }).cpf);
    expect(cpfs).toEqual(["11144477735", "52998224725", "39053344705"]);
  });
});

describe("resolverAssinantes: conjunto do cliente OU conjunto padrão, nunca misturado", () => {
  const padraoA: AssinanteEmpresa = { ...REPRESENTANTE, nome: "Padrao Um", cpf: "11144477735", ordem: 1 };
  const padraoB: AssinanteEmpresa = { ...REPRESENTANTE, nome: "Padrao Dois", cpf: "52998224725", ordem: 2 };
  const cli1: AssinanteEmpresa = {
    codCliente: "631", nome: "Cliente Um", email: "c1@x.com", cpf: "11144477735", ordem: 1, ativo: true,
  };
  const cli2: AssinanteEmpresa = {
    codCliente: "631", nome: "Cliente Dois", email: "c2@x.com", cpf: "52998224725", ordem: 1, ativo: true,
  };
  const cli3: AssinanteEmpresa = {
    codCliente: "631", nome: "Cliente Tres", email: "c3@x.com", cpf: "39053344705", ordem: 2, ativo: true,
  };
  const todos = [padraoA, padraoB, cli1, cli2, cli3];

  it("cliente COM representantes próprios usa o conjunto DELE por inteiro", () => {
    const r = resolverAssinantes(todos, "631");
    expect(r.map((x) => x.nome)).toEqual(["Cliente Dois", "Cliente Um", "Cliente Tres"]);
  });

  /** O ponto do "tudo ou nada": o padrão NÃO entra junto para completar o conjunto do cliente. */
  it("o conjunto do cliente NÃO é misturado com o padrão", () => {
    const r = resolverAssinantes(todos, "631");
    expect(r.some((x) => x.codCliente === null)).toBe(false);
  });

  it("cliente SEM representante próprio usa o conjunto PADRÃO inteiro", () => {
    const r = resolverAssinantes(todos, "999");
    expect(r.map((x) => x.nome)).toEqual(["Padrao Um", "Padrao Dois"]);
  });

  it("ordena por ordem e desempata por nome (o envelope sai sempre igual)", () => {
    const r = resolverAssinantes([cli3, cli2, cli1], "631");
    expect(r.map((x) => [x.ordem, x.nome])).toEqual([
      [1, "Cliente Dois"],
      [1, "Cliente Um"],
      [2, "Cliente Tres"],
    ]);
  });

  it("desativar TODOS do cliente devolve o padrão (a exceção deixou de existir)", () => {
    const inativos = [cli1, cli2, cli3].map((c) => ({ ...c, ativo: false }));
    const r = resolverAssinantes([padraoA, ...inativos], "631");
    expect(r.map((x) => x.nome)).toEqual(["Padrao Um"]);
  });

  it("sem padrão e sem exceção devolve lista vazia (o chamador não monta envelope)", () => {
    expect(resolverAssinantes([], "631")).toEqual([]);
  });
});

describe("grupoDaOrdem: a ordem da tela vira o group da Clicksign", () => {
  it("o funcionário é o grupo 1, então a ordem N do representante vira grupo N+1", () => {
    expect(grupoDaOrdem(1)).toBe(2);
    expect(grupoDaOrdem(2)).toBe(3);
    expect(grupoDaOrdem(5)).toBe(6);
  });

  it("MESMA ordem gera o MESMO grupo (é isso que faz assinarem em paralelo)", () => {
    expect(grupoDaOrdem(1)).toBe(grupoDaOrdem(1));
  });

  it("nunca devolve grupo menor que 2 (a API recusa group 0 e o 1 é do funcionário)", () => {
    expect(grupoDaOrdem(0)).toBe(2);
    expect(grupoDaOrdem(-3)).toBe(2);
  });
});

describe("cpfValido: o CPF do representante é exigido e conferido", () => {
  it("aceita CPF com dígito verificador correto", () => {
    expect(cpfValido("11144477735")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
  });

  it("recusa dígito verificador errado, tamanho errado e vazio", () => {
    expect(cpfValido("11144477736")).toBe(false);
    expect(cpfValido("1114447773")).toBe(false);
    expect(cpfValido("")).toBe(false);
    expect(cpfValido(null)).toBe(false);
  });

  it("recusa sequência repetida (passa no cálculo, mas não é CPF)", () => {
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
  });
});

describe("nomeSignatarioValido: a régua de nome é da Clicksign (levantada contra a API)", () => {
  it("aceita nome e sobrenome, com acento, hífen e apóstrofo", () => {
    expect(nomeSignatarioValido("Representante Soulan")).toBe(true);
    expect(nomeSignatarioValido("José D'Ávila Menezes")).toBe(true);
    expect(nomeSignatarioValido("Ana-Clara Souza")).toBe(true);
  });

  it("recusa uma palavra só (a Clicksign exige nome E sobrenome)", () => {
    expect(nomeSignatarioValido("Joao")).toBe(false);
    expect(nomeSignatarioValido("  Representante  ")).toBe(false);
  });

  it("recusa nome com DÍGITO (o caso que quebrou a primeira prova ponta a ponta)", () => {
    expect(nomeSignatarioValido("Representante Cliente 631")).toBe(false);
    expect(nomeSignatarioValido("Joao Silva 2")).toBe(false);
  });

  it("recusa vazio", () => {
    expect(nomeSignatarioValido("")).toBe(false);
    expect(nomeSignatarioValido(null)).toBe(false);
  });
});

/**
 * DEFESA FINAL DO PDF, no worker (proteção da virada de produção).
 *
 * O disparo já valida o arquivo na tela, mas esta é a última porta antes de o kit virar documento de
 * envelope, e a Clicksign aceita PDF quebrado sem devolver erro nenhum: o envelope entra em
 * `running`, o convite sai por e-mail e a falha só aparece quando o signatário abre o visualizador.
 * Em produção esse signatário é um candidato real, e o e-mail não volta atrás.
 */
describe("PDF corrompido não vira envelope (defesa final do worker)", () => {
  afterEach(() => {
    kitNoDisco = KIT_PDF_FAKE;
    vi.restoreAllMocks();
  });

  it("com o stub de 45 bytes no disco, NADA é criado na Clicksign", async () => {
    kitNoDisco = Buffer.from("%PDF-1.4\n");
    const { svc, api } = montar();
    const erro = vi
      .spyOn((svc as unknown as { logger: { error: (m: string) => void } }).logger, "error")
      .mockImplementation(() => undefined);

    await svc.criarEnvelope("adm-1", "/staging/kit.pdf");

    expect(api.criarEnvelope).not.toHaveBeenCalled();
    expect(api.anexarDocumento).not.toHaveBeenCalled();
    expect(api.adicionarSigner).not.toHaveBeenCalled();
    expect(api.ativarEnvelope).not.toHaveBeenCalled();
    expect(erro.mock.calls.map((c) => String(c[0])).join(" ")).toMatch(/PDF do kit inválido/i);
  });

  it("NÃO lança: arquivo corrompido não melhora com backoff, retentar só atrasaria o diagnóstico", async () => {
    kitNoDisco = Buffer.from("nem PDF isso e");
    const { svc } = montar();
    vi.spyOn((svc as unknown as { logger: { error: (m: string) => void } }).logger, "error")
      .mockImplementation(() => undefined);
    await expect(svc.criarEnvelope("adm-1", "/staging/kit.pdf")).resolves.toBeUndefined();
  });
});
