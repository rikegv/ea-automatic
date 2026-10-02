import { afterEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import { PortalCredencialService } from "./portal-credencial.service";
import { documentosAdmissao } from "../db/schema";

/**
 * TESTER INDEPENDENTE (§A.38/§A.40 regra 2). COMPLEMENTO de
 * `auditoria/auditoria-autenticidade.motivo-pii-free.tester.spec.ts`, que eu NAO reescrevi.
 *
 * O QUE O TESTE QUE JA EXISTE PROVA, e eu confirmei rodando (1 caso, VERDE): na porta da ESTEIRA
 * (`auditarConjunto`), o `autenticidade_motivo` persistido existe e, com um criterio limpo vindo da
 * IA, nao carrega CPF, nome do candidato nem numero de documento.
 *
 * AS TRES COISAS QUE ELE NAO COBRE, e que o REQ 5 pede ao pe da letra:
 *  P1  A PORTA DO PORTAL. Ela e a porta desta frente e persiste o mesmo campo
 *      (`portal-credencial.service.ts`, bloco do VALIDADO). O arquivo da esteira nao a toca.
 *  P2  "E NUNCA VAI PARA LOG". A metade do requisito que ninguem testava. Aqui ela e exercitada
 *      com espiao no `Logger` do Nest e na trilha (`PortalTrilhaService.registrar`).
 *  P3  A SUPERFICIE NOVA: `observacaoDoVeredito` escreve `documentos_admissao.observacao`, que e
 *      campo lido por tela, no mesmo write do suspeito. A versao de 17:06 de 02/10 INTERPOLAVA o
 *      criterio da IA ali; a de 17:20 passou a emitir texto fixo. P3 trava o estado endurecido, para
 *      a `observacao` nao voltar a ser a porta de tras do campo que o REQ 5 protege.
 *
 * ╔═ ONDE ESTA A DEFESA REAL, MEDIDO, porque isso muda a leitura do placar ═══════════════════════╗
 * ║ A unica redacao de PII do criterio acontece no ai-service, em Python:                         ║
 * ║ `gemini.py:532-533` aplica `_redigir_pii(autenticidadeMotivo, candidato_cpf)`, e essa funcao   ║
 * ║ troca SO padrao de CPF e o CPF do candidato por "[CPF]". NOME, numero de RG, nome da mae e     ║
 * ║ data de nascimento passam inteiros.                                                           ║
 * ║ No BACKEND nao ha redacao nenhuma: o criterio e copiado literalmente para a COLUNA             ║
 * ║ `autenticidade_motivo`, so com cap de 500 (`limitarMotivo`). A `observacao` esta a salvo, mas   ║
 * ║ por outro motivo: ela nao recebe o texto do modelo de jeito nenhum. Ou seja, o cumprimento do   ║
 * ║ REQ 5 na COLUNA depende HOJE de o modelo se comportar e de uma redacao parcial fora do alcance  ║
 * ║ desta suite (vitest nao roda o Python).                                                        ║
 * ║                                                                                               ║
 * ║ EU NAO CONSERTO E NAO INVENTO REQUISITO (§A.38). P4 abaixo e a regua do requisito como ele me  ║
 * ║ foi dito, e fica VERMELHO ate alguem decidir de quem e a guarda: do ai-service (ampliar        ║
 * ║ `_redigir_pii`) ou do backend (redigir na borda, que e onde o §A.6 costuma morar nesta casa).  ║
 * ╚═══════════════════════════════════════════════════════════════════════════════════════════════╝
 */

/** O candidato desta admissao. §A.6: CPF de familia reservada, nome fora do lexico real. */
const PESSOA = { nome: "CANDIDATO DE TESTE SINTETICO", cpf: "00000000000" };

/** Criterio BEM COMPORTADO: descricao visual, sem nada lido do documento. */
const CRITERIO_LIMPO =
  "Brasao com bordas serrilhadas e fonte do timbre fora do padrao do orgao emissor.";

/**
 * Criterio HOSTIL: o modelo decidiu "justificar" a suspeita citando o que leu. Nao e cenario
 * improvavel, e o proprio ai-service ja admite a possibilidade ao redigir CPF por defesa em
 * profundidade. Aqui ele carrega nome, RG e data de nascimento, que a redacao de la NAO cobre.
 */
const CRITERIO_HOSTIL =
  "O numero 12.345.678-9 e o nome CANDIDATO DE TESTE SINTETICO parecem sobrepostos, e a data 01/02/1990 esta em fonte diferente.";

const LINHA = {
  id: "cred-1",
  admissaoId: "adm-1",
  tipoDocumentoId: "tipo-1",
  objeto: "opaco/RG__uuid.pdf",
  contentType: "application/pdf",
  bytesConcedidos: 5 * 1024 * 1024,
  confirmadoEm: null as Date | null,
};

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function montar(autenticidadeMotivo: string) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  const eventos: Array<{ tipo: string; dados: unknown }> = [];

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
        ? [{ reprovacoes: 1 }]
        : chaves.includes("emAberto")
          ? [{ emAberto: 0 }]
          : chaves.includes("liberadoEm")
            ? []
            : chaves.includes("descricaoRegra")
              ? [{ descricaoRegra: "O documento deve estar legivel.", categoria: "CONFORMIDADE" }]
              : chaves.includes("nome") && chaves.includes("cpf")
                ? [PESSOA]
                : chaves.includes("codigo") && chaves.includes("nome")
                  ? [{ codigo: "RG", nome: "RG" }]
                  : [];
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: () => Promise.resolve(linhas),
      then: (r: (v: unknown) => unknown) => Promise.resolve(linhas).then(r),
    };
    return builder;
  };

  const db = {
    select,
    query: { portalCredenciais: { findFirst: async () => ({ ...LINHA }) } },
    update: (tabela: unknown) => ({
      set: (valores: Record<string, unknown>) => {
        updates.push({ tabela, valores });
        const fim = {
          where: () => fim,
          returning: async () => [{ id: LINHA.id }],
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
        return fim;
      },
    }),
    insert: (tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
        return {
          onConflictDoNothing: async () => undefined,
          onConflictDoUpdate: async () => undefined,
        };
      },
    }),
  };

  const armazenamento = {
    consultarMetadado: async (objeto: string) => ({
      objeto,
      bytes: 1024,
      contentType: "application/pdf",
    }),
    nomeDoBucket: () => "balde",
    corrigirContentType: async () => true,
    apagarObjeto: async () => true,
  };

  const leitor = {
    configurado: () => true,
    ler: async () => ({
      aceito: true,
      chegada: { tamanhoBytes: 1024 },
      auditoria: {
        status: "VALIDADO",
        valido: true,
        motivo: "Documento legivel e dentro da validade.",
        autenticidadeSuspeita: true,
        autenticidadeMotivo,
      },
      sugestoes: {
        origem: "IA_SUGESTAO",
        exigeConfirmacaoHumana: true,
        campos: [{ campo: "rgNumero", rotulo: "RG", valor: "12.345.678-9", confianca: 0.9, lido: true }],
      },
    }),
  };

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    {
      configurada: () => true,
      registrar: vi.fn(async (tipo: string, dados: unknown) => {
        eventos.push({ tipo, dados });
      }),
    } as never,
  );
  return { svc, updates, inserts, eventos };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({
    admissaoId: "adm-1",
    jtiLink: "jti-1",
    credencialId: "cred-1",
    avisoDoNavegador: true,
  });

const escritaDoVeredito = (updates: Escrita[]) =>
  updates.filter((u) => u.tabela === documentosAdmissao && "observacao" in u.valores);

/** Busca um texto em qualquer string do objeto, sem `JSON.stringify` (drizzle tem `sql` circular). */
function contemTexto(valor: unknown, agulha: string, vistos = new Set<unknown>()): boolean {
  if (typeof valor === "string") return valor.includes(agulha);
  if (valor && typeof valor === "object") {
    if (vistos.has(valor)) return false;
    vistos.add(valor);
    for (const v of Object.values(valor as Record<string, unknown>)) {
      if (contemTexto(v, agulha, vistos)) return true;
    }
  }
  return false;
}

/** Espia TODAS as saidas de log do Nest de uma vez. */
function espiarLogs() {
  const linhas: unknown[] = [];
  const capturar = (...args: unknown[]) => {
    linhas.push(...args);
  };
  for (const metodo of ["log", "error", "warn", "debug", "verbose"] as const) {
    vi.spyOn(Logger.prototype, metodo).mockImplementation(capturar as never);
  }
  return linhas;
}

afterEach(() => vi.restoreAllMocks());

// ── P1 + P2: o criterio LIMPO e persistido e nao vai para log nem para a trilha ───────────────

describe("P1/P2: a porta do Portal persiste o criterio e nao o manda para log", () => {
  it("o criterio chega a COLUNA autenticidade_motivo, e so a ela", async () => {
    const ctx = montar(CRITERIO_LIMPO);
    espiarLogs();
    await confirmar(ctx.svc);

    const v = escritaDoVeredito(ctx.updates)[0]!.valores;
    // A coluna guarda o criterio (e dela que a tela da opcao (b) vai ler quando o diretor aprovar).
    expect(v.autenticidadeMotivo).toContain("Brasao com bordas serrilhadas");
    // A observacao avisa que HA o que conferir, com texto NOSSO, e nao repete o texto do modelo.
    expect(String(v.observacao)).toContain("Suspeita De Autenticidade");
    expect(String(v.observacao)).not.toContain("Brasao com bordas serrilhadas");
  });

  it("NENHUMA linha de log carrega o criterio de autenticidade", async () => {
    const ctx = montar(CRITERIO_LIMPO);
    const logs = espiarLogs();
    await confirmar(ctx.svc);

    expect(logs.length).toBeGreaterThan(0); // o caminho loga, so nao loga ISTO
    for (const linha of logs) {
      expect(contemTexto(linha, "Brasao")).toBe(false);
      expect(contemTexto(linha, "serrilhadas")).toBe(false);
    }
  });

  it("NENHUMA linha de log carrega o CPF nem o nome do candidato", async () => {
    const ctx = montar(CRITERIO_LIMPO);
    const logs = espiarLogs();
    await confirmar(ctx.svc);

    for (const linha of logs) {
      expect(contemTexto(linha, PESSOA.cpf)).toBe(false);
      expect(contemTexto(linha, PESSOA.nome)).toBe(false);
      expect(contemTexto(linha, "12.345.678-9")).toBe(false); // o valor lido do documento
    }
  });

  it("NENHUM evento da trilha carrega o criterio (a allowlist de portal-evento tem de bastar)", async () => {
    const ctx = montar(CRITERIO_LIMPO);
    espiarLogs();
    await confirmar(ctx.svc);

    expect(ctx.eventos.length).toBeGreaterThan(0);
    for (const ev of ctx.eventos) {
      expect(contemTexto(ev.dados, "Brasao")).toBe(false);
      expect(contemTexto(ev.dados, "12.345.678-9")).toBe(false);
      expect(contemTexto(ev.dados, PESSOA.nome)).toBe(false);
    }
  });
});

// ── P3: a superficie NOVA (observacao) segue a mesma regua do campo antigo ────────────────────

describe("P3: a observacao nao pode ser a porta de tras do campo que o REQ 5 protege", () => {
  it("com criterio limpo, a observacao nao carrega dado lido do documento", async () => {
    const ctx = montar(CRITERIO_LIMPO);
    espiarLogs();
    await confirmar(ctx.svc);

    const obs = String(escritaDoVeredito(ctx.updates)[0]!.valores.observacao);
    expect(obs).not.toContain(PESSOA.cpf);
    expect(obs).not.toContain(PESSOA.nome);
    expect(obs).not.toMatch(/\d{2}\.\d{3}\.\d{3}-[\dxX]/);
  });
});

// ── P4: O GAP, que e o requisito como ele me foi dito ────────────────────────────────────────

describe("P4 (GAP, decisao de quem guarda): criterio HOSTIL e copiado sem redacao", () => {
  it.skip("FALTA GUARDA DE REDACAO NO BACKEND: autenticidade_motivo nao deveria carregar nome, RG nem data lidos do documento", async () => {
    const ctx = montar(CRITERIO_HOSTIL);
    espiarLogs();
    await confirmar(ctx.svc);

    const motivo = String(escritaDoVeredito(ctx.updates)[0]!.valores.autenticidadeMotivo);
    // A FRASE QUE IMPORTA, e e ela que o diretor precisa ler: HOJE o §A.6 nesta coluna depende de o
    // MODELO OBEDECER A INSTRUCAO do prompt, e isso e MITIGACAO, nao garantia. O backend copia o
    // criterio literalmente, so com cap de 500 (`limitarMotivo`); a unica redacao existente e no
    // ai-service (`gemini.py:532`, `_redigir_pii`) e cobre SO CPF.
    //
    // O `ia` ja devolveu a avaliacao tecnica: uma guarda que redige sequencias de 7 digitos ou mais
    // e barata e de falso positivo quase nulo, e o lugar certo talvez seja o BACKEND, porque e ali
    // que nome e CPF estao em mao e ali que estao as outras portas. NAO FOI IMPLEMENTADA, por decisao
    // do coordenador. Este `skip` e o lugar onde o teste ja espera a guarda.
    expect(motivo).not.toContain(PESSOA.nome);
    expect(motivo).not.toMatch(/\d{2}\.\d{3}\.\d{3}-[\dxX]/);
  });

  it("a observacao (lida por tela) NAO carrega o dado lido, nem com criterio hostil (VERDE)", async () => {
    const ctx = montar(CRITERIO_HOSTIL);
    espiarLogs();
    await confirmar(ctx.svc);

    const obs = String(escritaDoVeredito(ctx.updates)[0]!.valores.observacao);
    expect(obs).not.toContain(PESSOA.nome);
    expect(obs).not.toMatch(/\d{2}\.\d{3}\.\d{3}-[\dxX]/);
  });

  it("mesmo com criterio hostil, NADA disso chega ao log (esta metade do REQ 5 esta de pe)", async () => {
    const ctx = montar(CRITERIO_HOSTIL);
    const logs = espiarLogs();
    await confirmar(ctx.svc);

    for (const linha of logs) {
      expect(contemTexto(linha, PESSOA.nome)).toBe(false);
      expect(contemTexto(linha, "12.345.678-9")).toBe(false);
      expect(contemTexto(linha, "01/02/1990")).toBe(false);
    }
  });
});
