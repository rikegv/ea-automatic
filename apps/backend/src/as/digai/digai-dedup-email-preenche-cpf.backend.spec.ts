import { describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { DigaiImportacaoService } from "./digai-importacao.service";
import { DigaiRepositorio } from "./digai-repositorio";
import type { ResultadoDigai } from "../../domain/digai";

/**
 * ─ A DECISAO 5b DO DIRETOR (07/10/2026) x O QUE O CODIGO DE FATO FAZ (medido aqui) ─────────────
 *
 * ┌─ O QUE O DIRETOR DECIDIU ───────────────────────────────────────────────────────────────────┐
 * │ E-mail LIMPO (uma ficha): PODE preencher o CPF vazio. E-mail AMBIGUO (duas fichas): NUNCA      │
 * │ preenche e NUNCA mexe (vira o conflito do 5a).                                                 │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O ACHADO (07/10): A PREMISSA DE COMO O LIMPO PREENCHERIA ESTA ERRADA ───────────────────────┐
 * │ O MAPA-VERDE (E-4) afirmava que o e-mail limpo anexa a identidade e, "no ciclo seguinte", o    │
 * │ degrau 1 preenche o CPF via `coalesce(cpf, novo)`. ESSE CICLO SEGUINTE NAO ACONTECE: o         │
 * │ registro de `userId` ja conhecido e IGNORADO em `chavesConhecidas`/`planoDaImportacao` ANTES   │
 * │ de `gravar`, entao o degrau 1 nunca roda na reentrega normal (so na CORRIDA entre as duas      │
 * │ leituras). O teste existente `digai-dedup-ordem-das-chaves` ja afirma "identidade conhecida: o │
 * │ registro e IGNORADO".                                                                          │
 * │                                                                                                │
 * │ CONSEQUENCIA: HOJE o e-mail LIMPO anexa a identidade e o CPF vazio da ficha PERMANECE vazio. A  │
 * │ ingestao do Digai NAO preenche o CPF por este caminho em ciclo nenhum. Isso e o lado SEGURO (a │
 * │ chave fraca nunca escreve CPF), mas DIVERGE do que o diretor espera do 5b. Fazer o              │
 * │ preenchimento acontecer e mudanca de COMPORTAMENTO (RISCO ALTO, 117 casos) e decisao do        │
 * │ coordenador/diretor. Este arquivo trava o que o codigo FAZ hoje, e nao o que a premissa dizia. │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE O DUBLE E ESTATAL, E NAO O DOS OUTROS SPECS ────────────────────────────────────────┐
 * │ A pergunta e sobre o CICLO SEGUINTE: a identidade anexada num ciclo muda o que a base responde │
 * │ no ciclo que vem, e muda SE o registro e sequer processado. Um duble de retorno fixo nao mede  │
 * │ isso. Este duble SIMULA a base: guarda fichas e identidades em memoria, `atualizarCandidato`   │
 * │ espelha o `coalesce(cpf, novo)` real (enche vazio, nunca troca), e `candidatoPorIdentidade`    │
 * │ passa a achar a identidade anexada. Assim o ciclo seguinte e MEDIDO de ponta a ponta.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SUFIXO `.backend.spec.ts`: cobertura do backend sobre o que construiu (§A.39, dono unico).
 * §A.6: nada de pessoa real. CPFs sinteticos com verificador valido, e-mail no TLD `.invalido`.
 */

const CPF_REGISTRO = "11122233396";
const EMAIL = "pessoa.sintetica@exemplo.invalido";

const FICHA_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FICHA_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

interface FichaSimulada {
  cpf: string | null;
  email: string | null;
}

/**
 * ─ A BASE SIMULADA, QUE MUDA ENTRE OS CICLOS ──────────────────────────────────────────────────
 *
 * `candidatoPorEmail` espelha a regra do repositorio real: zero fichas = `null`, mais de uma =
 * `{ ambiguo: true }`, e uma so com a guarda E-4 (CPF nulo num lado ou igual) = `{ id }`.
 * `atualizarCandidato` espelha o `coalesce(cpf, novo)`: enche vazio, nunca troca o nao nulo.
 */
function baseSimulada(fichasIniciais: Record<string, FichaSimulada>) {
  const fichas = new Map<string, FichaSimulada>(Object.entries(fichasIniciais));
  const identidades = new Map<string, string>(); // userId -> fichaId (as_identidades_externas DIGAI)
  const conflitos: { candidatoId: string; userId: string }[] = [];
  const escritas: { metodo: string; id: string; dados?: unknown }[] = [];

  const repo = {
    deParaEtapa: vi.fn(async () => ({ etapaCodigo: "CAPTACAO", situacao: null, ativo: true })),
    candidatoPorIdentidade: vi.fn(async (userId: string) => {
      const id = identidades.get(userId);
      return id === undefined ? null : { id };
    }),
    candidatoPorDocumento: vi.fn(async (cpf: string) => {
      for (const [id, f] of fichas) if (f.cpf === cpf) return { id };
      return null;
    }),
    candidatoPorEmail: vi.fn(async (email: string, cpfDoRegistro: string | null) => {
      const casam = [...fichas].filter(([, f]) => f.email === email);
      if (casam.length === 0) return null;
      if (casam.length > 1) return { ambiguo: true as const };
      const [id, f] = casam[0]!;
      const passa = cpfDoRegistro === null || f.cpf === null || f.cpf === cpfDoRegistro;
      return passa ? { id } : null;
    }),
    atualizarCandidato: vi.fn(
      async (id: string, dados: { cpf: string | null; email: string | null }) => {
        escritas.push({ metodo: "atualizarCandidato", id, dados });
        const f = fichas.get(id);
        if (f !== undefined) {
          if (f.cpf === null && dados.cpf !== null) f.cpf = dados.cpf; // coalesce(cpf, novo)
          if (f.email === null && dados.email !== null) f.email = dados.email;
        }
        return { linhasAfetadas: 1 };
      },
    ),
    anexarIdentidade: vi.fn(async (candidatoId: string, userId: string) => {
      escritas.push({ metodo: "anexarIdentidade", id: candidatoId });
      if (!identidades.has(userId)) identidades.set(userId, candidatoId);
    }),
    registrarConflito: vi.fn(async (candidatoId: string, userId: string) => {
      conflitos.push({ candidatoId, userId });
    }),
    criarCandidato: vi.fn(async (dados: { cpf: string | null; email: string | null }) => {
      const id = `nova-${fichas.size}`;
      fichas.set(id, { cpf: dados.cpf, email: dados.email });
      escritas.push({ metodo: "criarCandidato", id, dados });
      return { id };
    }),
    espelharVaga: vi.fn(async () => ({ id: "22222222-2222-4222-8222-222222222222" })),
    garantirCandidatura: vi.fn(async () => ({
      criada: true,
      id: "33333333-3333-4333-8333-333333333333",
    })),
  };

  return { repo, fichas, identidades, conflitos, escritas };
}

const AMBIENTE_LIGADO: Record<string, string> = {
  DIGAI_API_TOKEN: "token-sintetico-de-teste-000000",
  DIGAI_INGESTAO_ATIVA: "true",
};

function servico(repo: ReturnType<typeof baseSimulada>["repo"]) {
  const config = {
    get: <T,>(c: string) => AMBIENTE_LIGADO[c] as unknown as T,
  } as ConfigService;
  return new DigaiImportacaoService(config, repo as unknown as DigaiRepositorio);
}

function registro(over: Partial<ResultadoDigai> = {}): ResultadoDigai {
  return {
    userId: "usr-sintetico-5b-1",
    partnerJobId: "1234567",
    name: "Fulano De Teste",
    cpf: CPF_REGISTRO,
    email: EMAIL,
    phoneNumber: "11900000001",
    appliedAt: "2026-09-10T12:00:00.000Z",
    ...over,
  };
}

describe("5b (a): e-mail LIMPO so ANEXA a identidade, e o CPF vazio NAO e preenchido (achado 07/10)", () => {
  it("o ciclo do e-mail so anexa a identidade, e NAO escreve o CPF", async () => {
    const base = baseSimulada({ [FICHA_B]: { cpf: null, email: EMAIL } });
    await servico(base.repo).importar([registro()]);

    expect(
      base.fichas.get(FICHA_B)?.cpf,
      "O DEGRAU 3 NAO ESCREVE DADO (veto V-2): escrever o CPF por decisao da chave fraca envenenaria " +
        "`uq_as_candidatos_cpf`. No ciclo do e-mail a ficha so recebe a identidade anexada.",
    ).toBeNull();
    expect(base.identidades.get("usr-sintetico-5b-1"), "a identidade foi anexada a ficha B.").toBe(
      FICHA_B,
    );
    expect(
      base.repo.atualizarCandidato.mock.calls.length,
      "nenhuma atualizacao de ficha neste ciclo: o degrau 3 so anexa identidade.",
    ).toBe(0);
  });

  it("no CICLO SEGUINTE o registro e IGNORADO (identidade conhecida), entao o CPF NUNCA e preenchido", async () => {
    /*
     * ESTE E O ACHADO DE 07/10: a premissa do MAPA-VERDE E-4 (o degrau 1 preenche o CPF no ciclo
     * seguinte) NAO se realiza. O `userId` ja conhecido cai em `plano.ignorar` ANTES de `gravar`,
     * entao `resolverPessoa` nao e chamado de novo e o `coalesce` do degrau 1 nunca roda. O CPF
     * vazio da ficha que o e-mail escolheu PERMANECE vazio. E o lado seguro (a chave fraca nunca
     * escreve CPF), mas DIVERGE do 5b; mudar isso e decisao do coordenador/diretor.
     */
    const base = baseSimulada({ [FICHA_B]: { cpf: null, email: EMAIL } });
    await servico(base.repo).importar([registro()]); // ciclo 1: anexa identidade
    expect(base.fichas.get(FICHA_B)?.cpf, "controle: nulo depois do ciclo 1.").toBeNull();

    const r2 = await servico(base.repo).importar([registro()]); // ciclo 2
    expect(
      r2.ignorados,
      "identidade ja conhecida: o registro e IGNORADO no plano, e `gravar`/`resolverPessoa` nem " +
        "rodam (mesma regra do teste `digai-dedup-ordem-das-chaves`).",
    ).toBe(1);
    expect(
      base.fichas.get(FICHA_B)?.cpf,
      "O CPF CONTINUA NULO: o degrau 1 nao roda na reentrega (so na corrida), entao a ingestao do " +
        "Digai NAO preenche o CPF por este caminho. DIVERGE do 5b (diretor espera preenchimento).",
    ).toBeNull();
    expect(
      base.repo.atualizarCandidato.mock.calls.length,
      "nenhuma atualizacao em ciclo nenhum: o ciclo 2 ignorou o registro antes de qualquer escrita.",
    ).toBe(0);
  });

  it("nenhuma ficha NOVA nasce em ciclo nenhum: a ficha que ja existe e reusada", async () => {
    const base = baseSimulada({ [FICHA_B]: { cpf: null, email: EMAIL } });
    await servico(base.repo).importar([registro()]);
    await servico(base.repo).importar([registro()]);
    expect(
      base.repo.criarCandidato.mock.calls.length,
      "casou por e-mail e depois foi ignorado: criar ficha seria a duplicata que o degrau evita.",
    ).toBe(0);
  });
});

describe("5b (b1): e-mail AMBIGUO sem ancora de CPF NUNCA preenche, em ciclo nenhum", () => {
  it("nao anexa identidade, nao atualiza ficha, e os CPFs ficam intactos nos dois ciclos", async () => {
    const base = baseSimulada({
      [FICHA_B]: { cpf: null, email: EMAIL },
      [FICHA_C]: { cpf: null, email: EMAIL },
    });
    const semCpf = registro({ cpf: null }); // o CPF nem existe: nao ha ancora forte

    for (const ciclo of [1, 2]) {
      await servico(base.repo).importar([semCpf]);
      expect(
        base.identidades.get("usr-sintetico-5b-1"),
        `ciclo ${ciclo}: o ambiguo NAO anexa identidade, entao nunca casa por identidade depois.`,
      ).toBeUndefined();
      expect(base.fichas.get(FICHA_B)?.cpf, `ciclo ${ciclo}: ficha B intacta.`).toBeNull();
      expect(base.fichas.get(FICHA_C)?.cpf, `ciclo ${ciclo}: ficha C intacta.`).toBeNull();
    }
    expect(
      base.repo.atualizarCandidato.mock.calls.length,
      "o ambiguo sem ancora abstem: nenhuma escrita de ficha, logo nenhum CPF preenchido NUNCA.",
    ).toBe(0);
    expect(
      base.conflitos.length,
      "sem ancora NOT NULL nao ha linha de conflito a gravar: fica so o aviso (§A.6).",
    ).toBe(0);
  });
});

describe("5b (b2): e-mail AMBIGUO com ancora de CPF resolve pelo CPF, vira conflito, e nao preenche pelo e-mail", () => {
  it("o CPF casou direto, o endereco NAO e propagado, e a ambiguidade vira conflito", async () => {
    // A ficha do CPF ja tem o CPF (casou por documento). Outras duas fichas dividem o e-mail.
    const base = baseSimulada({
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": { cpf: CPF_REGISTRO, email: null },
      [FICHA_B]: { cpf: null, email: EMAIL },
      [FICHA_C]: { cpf: null, email: EMAIL },
    });
    await servico(base.repo).importar([registro()]);

    const fichaCpf = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(
      base.fichas.get(fichaCpf)?.email,
      "O ENDERECO AMBIGUO NAO E PROPAGADO: grava-lo na ficha do CPF criaria uma TERCEIRA ficha com " +
        "o mesmo e-mail e pioraria a ambiguidade detectada.",
    ).toBeNull();
    expect(
      base.conflitos.map((c) => c.candidatoId),
      "a ambiguidade vira conflito ancorado na ficha do CPF (a chave forte que resolveu).",
    ).toEqual([fichaCpf]);
    expect(
      base.conflitos[0]?.userId,
      "§A.6: o identificador do conflito e o `userId`, e nunca o endereco.",
    ).toBe("usr-sintetico-5b-1");
    // O CPF nao foi "preenchido pelo e-mail": ele ja estava la, casou direto.
    expect(base.fichas.get(FICHA_B)?.cpf, "ficha ambigua B intacta.").toBeNull();
    expect(base.fichas.get(FICHA_C)?.cpf, "ficha ambigua C intacta.").toBeNull();
  });
});
