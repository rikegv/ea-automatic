import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../auth/auth.types";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalPendenciasService } from "./portal-pendencias.service";
import { AVISO_PENDENCIA_NO_TIME, TETO_REPROVACOES_POR_PENDENCIA } from "../domain/portal-tentativas";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO (§A.40 regra 2).
 *
 * REQUISITO R5: O TIME SOLICITA REENVIO. Pendência caída na fila do time é reaberta pelo consultor,
 * e o candidato VOLTA A PODER ENVIAR.
 * REQUISITO R6: O MASTER DESTRAVA. Zerar as tentativas é de Master e de Super Admin.
 *
 * ┌─ O MAL-ENTENDIDO QUE ESTE ARQUIVO EXISTE PARA PEGAR: DUAS CONTAGENS, DOIS LUGARES ──────────┐
 * │ Quem REABRE e quem CONCEDE não são o mesmo objeto. `PortalPendenciasService` move o marco;    │
 * │ quem decide se o candidato recebe credencial é `PortalCredencialService.emitir`, que conta as │
 * │ reprovações por conta própria, na sua própria consulta, dentro da sua própria transação.      │
 * │                                                                                               │
 * │ Reabrir sem ensinar a SEGUNDA contagem sobre o marco produz o pior desfecho possível: a tela  │
 * │ do time diz "reaberta", o consultor avisa o candidato, e o candidato continua recebendo "a    │
 * │ equipe vai analisar". Ninguém percebe do lado de cá, porque o lado de cá ficou verde.         │
 * │                                                                                               │
 * │ Por isso o item 8 NÃO é testado pelo retorno de quem reabre. Ele é testado RODANDO O `emitir` │
 * │ DE VERDADE contra o MESMO estado, depois da reabertura. É o único jeito de as duas contagens  │
 * │ serem obrigadas a concordar.                                                                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O BANCO FINGIDO LÊ A CLÁUSULA, NÃO ADIVINHA A REGRA. Ele conta o que a consulta PEDIU: se a
 * cláusula não mencionar o marco da reabertura, ele não aplica marco nenhum. Um dublê que aplicasse
 * a regra certa sozinho deixaria passar verde exatamente a consulta que esqueceu o marco, que é o
 * defeito que se está procurando.
 *
 * §A.6: identificadores técnicos, contagem e carimbo. Nenhum dado pessoal nos fixtures.
 */

const MB = 1024 * 1024;
const ADM = "adm-1";
const RG = "tipo-rg";
const CPF = "tipo-cpf";

const CONSULTOR: AuthUser = {
  id: "user-consultor",
  email: "consultor@soulan.com.br",
  papel: "COMUM",
  senhaTemporaria: false,
};
const MASTER: AuthUser = { ...CONSULTOR, id: "user-master", papel: "MASTER" };

const TIPOS: Record<string, { id: string; codigo: string; nome: string }> = {
  [RG]: { id: RG, codigo: "RG", nome: "RG" },
  [CPF]: { id: CPF, codigo: "CPF", nome: "CPF" },
};

/** Texto de um nó SQL do drizzle. `JSON.stringify` não serve: coluna e tabela fecham um ciclo. */
function serializar(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (no instanceof Date) return no.toISOString();
  if (Array.isArray(no)) return no.map(serializar).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(serializar).join(" ");
  if ("value" in o && "encoder" in o) return serializar(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(serializar).join("");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

interface Credencial {
  admissaoId: string;
  tipoDocumentoId: string;
  reprovadoEm: Date | null;
}
interface Pendencia {
  admissaoId: string;
  tipoDocumentoId: string;
  tentativas: number;
  caiuEm: Date | null;
  liberadoEm: Date | null;
  liberadoPorId: string | null;
  liberadoTipo: string | null;
}

/** O estado compartilhado pelos dois serviços, que é o ponto inteiro deste arquivo. */
function mundo(inicial: { credenciais?: Credencial[]; pendencias?: Pendencia[] } = {}) {
  const credenciais: Credencial[] = inicial.credenciais ?? [];
  const pendencias: Pendencia[] = inicial.pendencias ?? [];
  const emitidas: Record<string, unknown>[] = [];
  const eventos: Array<{ tipo: string; dados: Record<string, unknown> }> = [];

  const pendenciaDe = (adm: string, tipo: string) =>
    pendencias.find((p) => p.admissaoId === adm && p.tipoDocumentoId === tipo);

  /**
   * A CONTAGEM, FEITA A PARTIR DO QUE A CLÁUSULA PEDIU, e nunca da regra que o teste gostaria que
   * existisse. Um dublê que aplicasse o marco por conta própria deixaria verde exatamente a
   * consulta que esqueceu de aplicá-lo, que é o defeito procurado.
   *
   *  - cita `reprovado_em is not null`? conta só quem tem carimbo;
   *  - traz o MARCO? desconta o que veio antes dele. O marco aparece de duas formas legítimas, e as
   *    duas são aceitas: a subconsulta escalar a `portal_pendencias_no_time` e a comparação direta
   *    com um carimbo já lido (`gt(reprovado_em, <data>)`), que é a forma que sobrevive a uma
   *    leitura em dois passos.
   *
   * Não veio de jeito nenhum, não aplica.
   */
  const contarReprovacoes = (clausula: string): number => {
    const adm = [ADM].find((a) => clausula.includes(a)) ?? ADM;
    const tipo = [RG, CPF].find((t) => clausula.includes(t)) ?? RG;
    let linhas = credenciais.filter((c) => c.admissaoId === adm && c.tipoDocumentoId === tipo);
    if (/reprovado_em\s+is\s+not\s+null/i.test(clausula)) linhas = linhas.filter((c) => c.reprovadoEm);

    const porSubconsulta = /liberado_em|portal_pendencias_no_time/i.test(clausula)
      ? (pendenciaDe(adm, tipo)?.liberadoEm ?? null)
      : null;
    // O carimbo que a consulta CARREGA como parâmetro: é o marco lido no passo anterior.
    const carimbos = [...clausula.matchAll(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g)].map((m) => new Date(m[0]));
    const porParametro = carimbos.length ? new Date(Math.max(...carimbos.map((d) => d.getTime()))) : null;
    const marco = porParametro ?? porSubconsulta;
    if (marco) linhas = linhas.filter((c) => c.reprovadoEm && c.reprovadoEm > marco);
    return linhas.length;
  };

  const leitura = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    let clausula = "";
    const b: Record<string, unknown> = {};
    const resolver = () => {
      // O LINK VIVO, conferido pela emissao desde a frente da IDENTIDADE: a revogacao precisa
      // valer na hora, e nao so quando a sessao do candidato vencer. Sempre em pe aqui, porque o
      // assunto deste arquivo e a reabertura da pendencia.
      if (chaves.includes("suspensoAte")) {
        return Promise.resolve([
          { expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null },
        ]);
      }
      if (chaves.includes("reprovacoes")) return Promise.resolve([{ reprovacoes: contarReprovacoes(clausula) }]);
      // A leitura do MARCO em passo próprio, que é a forma que a construção escolheu.
      if (chaves.includes("liberadoEm")) {
        const tipo = [RG, CPF].find((t) => clausula.includes(t)) ?? RG;
        const p = pendenciaDe(ADM, tipo);
        return Promise.resolve(p ? [{ liberadoEm: p.liberadoEm, liberadoTipo: p.liberadoTipo }] : []);
      }
      if (chaves.includes("emitidas")) return Promise.resolve([{ emitidas: 0, bytes: 0, extracoes: 0 }]);
      if (chaves.includes("codigo") && chaves.includes("nome")) {
        const achado = Object.values(TIPOS).find((t) => clausula.includes(t.id)) ?? TIPOS[RG];
        return Promise.resolve([achado]);
      }
      return Promise.resolve([]);
    };
    b.from = () => b;
    b.innerJoin = () => b;
    b.where = (c: unknown) => {
      clausula += ` ${serializar(c)}`;
      return resolver();
    };
    b.then = (ok: (v: unknown) => unknown) => resolver().then(ok);
    return b;
  };

  const escrita = () => ({
    insert: (_t: unknown) => ({
      values: (v: Record<string, unknown>) => {
        const alvo = v as unknown as Pendencia & { id?: string };
        const fim = {
          returning: async () => {
            emitidas.push(v);
            return [{ id: `cred-${emitidas.length}` }];
          },
          onConflictDoUpdate: async (args: { set?: Record<string, unknown> }) => {
            const ja = pendenciaDe(alvo.admissaoId, alvo.tipoDocumentoId);
            if (ja) Object.assign(ja, args?.set ?? {});
            else pendencias.push({ ...alvo });
          },
          onConflictDoNothing: async () => undefined,
          then: (ok: (v: unknown) => unknown) => {
            emitidas.push(v);
            return Promise.resolve(undefined).then(ok);
          },
        };
        return fim;
      },
    }),
    update: (_t: unknown) => ({
      set: () => {
        const fim = {
          where: () => fim,
          returning: async () => [{ id: "cred-x" }],
          then: (ok: (v: unknown) => unknown) => Promise.resolve(undefined).then(ok),
        };
        return fim;
      },
    }),
    select: leitura,
    execute: async () => [],
  });

  const db = {
    ...escrita(),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(escrita()),
    query: {
      admissoes: { findFirst: async () => ({ id: ADM }) },
      documentosAdmissao: { findFirst: async () => ({ id: "doc-1" }) },
      tiposDocumento: {
        findFirst: async (args?: { where?: unknown }) => {
          const alvo = serializar(args?.where);
          return (
            Object.values(TIPOS).find((t) => alvo.includes(t.id) || alvo.includes(t.codigo)) ?? TIPOS[RG]
          );
        },
      },
      portalPendenciasNoTime: {
        findFirst: async (args?: { where?: unknown }) => {
          const alvo = serializar(args?.where);
          const tipo = [RG, CPF].find((t) => alvo.includes(t)) ?? RG;
          return pendenciaDe(ADM, tipo);
        },
      },
      portalCredenciais: { findFirst: async () => undefined },
    },
  };

  const trilha = {
    configurada: () => true,
    registrar: vi.fn(async (tipo: string, dados: Record<string, unknown>) => {
      eventos.push({ tipo, dados: dados ?? {} });
    }),
  };

  const pendenciasSvc = new PortalPendenciasService(db as never, trilha as never);
  const credencialSvc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    {
      podeEmitir: () => true,
      assinarEscrita: async () => ({ url: "https://storage.googleapis.com/b/o?X-Goog-Signature=x" }),
    } as never,
    {} as never,
    trilha as never,
  );

  return { credenciais, pendencias, emitidas, eventos, pendenciasSvc, credencialSvc, trilha };
}

const reprovada = (tipo: string, quando: Date): Credencial => ({
  admissaoId: ADM,
  tipoDocumentoId: tipo,
  reprovadoEm: quando,
});

const caiu = (tipo: string): Pendencia => ({
  admissaoId: ADM,
  tipoDocumentoId: tipo,
  tentativas: TETO_REPROVACOES_POR_PENDENCIA,
  caiuEm: new Date("2026-09-10T10:00:00Z"),
  liberadoEm: null,
  liberadoPorId: null,
  liberadoTipo: null,
});

/** Três reprovações antigas: a pendência caiu para a fila do time. */
const TRES_VELHAS = [
  reprovada(RG, new Date("2026-09-10T09:00:00Z")),
  reprovada(RG, new Date("2026-09-10T09:30:00Z")),
  reprovada(RG, new Date("2026-09-10T10:00:00Z")),
];

const pedir = (svc: PortalCredencialService, codigo = "RG") =>
  svc.emitir({
    admissaoId: ADM,
    jtiLink: "jti-1",
    codigoTipoDocumento: codigo,
    contentType: "application/pdf",
    bytes: 1 * MB,
  });

describe("R5.8, O TESTE QUE MEDE O CICLO INTEIRO: o candidato volta a receber credencial", () => {
  it("antes da solicitação, o candidato é barrado (o cenário existe de verdade)", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    await expect(pedir(m.credencialSvc)).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
  });

  it("DEPOIS da solicitação do consultor, o MESMO pedido passa", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    const r = await pedir(m.credencialSvc);
    expect(
      r.url,
      "a pendência foi reaberta na tela do time e o candidato continua barrado: as duas contagens discordam",
    ).toContain("X-Goog-Signature");
  });

  it("e a liberação não vale para a vida toda: três reprovações NOVAS derrubam de novo", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    const depois = m.pendencias[0].liberadoEm!;
    for (let i = 1; i <= TETO_REPROVACOES_POR_PENDENCIA; i += 1) {
      m.credenciais.push(reprovada(RG, new Date(depois.getTime() + i * 60_000)));
    }

    await expect(pedir(m.credencialSvc)).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
  });

  it("solicitar reenvio de quem AINDA pode enviar sozinho não reabre nada", async () => {
    const m = mundo({ credenciais: [reprovada(RG, new Date("2026-09-10T09:00:00Z"))] });
    await expect(m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR)).rejects.toThrow();
    expect(m.pendencias).toHaveLength(0);
  });
});

describe("R5.9: fica registrado QUEM solicitou e QUANDO", () => {
  it("a linha da pendência guarda o autor, o carimbo e o tipo de reabertura", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    const linha = m.pendencias[0];
    expect(linha.liberadoPorId, "sem autor, ninguém responde pela reabertura").toBe(CONSULTOR.id);
    expect(linha.liberadoEm, "sem carimbo, não há quando").toBeInstanceOf(Date);
    expect(linha.liberadoTipo).toBe("SOLICITACAO_REENVIO");
  });

  it("a queda anterior NÃO é apagada: a reabertura é marco, não borracha", async () => {
    // Quem apaga o histórico perde a pergunta que decide se o problema é a pessoa ou a régua.
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    expect(m.pendencias[0].tentativas).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(m.pendencias[0].caiuEm).toBeInstanceOf(Date);
    expect(m.credenciais.filter((c) => c.reprovadoEm)).toHaveLength(3);
  });

  it("a trilha recebe o evento com o autor, e SEM dado pessoal", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    const evento = m.eventos.find((e) => /REENVIO|REABERT|SOLICIT/i.test(e.tipo));
    expect(evento, `nenhum evento de reabertura na trilha. Vistos: ${m.eventos.map((e) => e.tipo).join(", ")}`).toBeTruthy();
    expect(evento!.dados.autorId).toBe(CONSULTOR.id);
    const texto = JSON.stringify(evento);
    expect(texto).not.toMatch(/\d{11}/);
  });
});

describe("R5.10: reabrir UM tipo não reabre os outros da mesma admissão", () => {
  it("o CPF continua barrado depois de o RG ser reaberto", async () => {
    const m = mundo({
      credenciais: [
        ...TRES_VELHAS,
        reprovada(CPF, new Date("2026-09-10T08:00:00Z")),
        reprovada(CPF, new Date("2026-09-10T08:30:00Z")),
        reprovada(CPF, new Date("2026-09-10T09:00:00Z")),
      ],
      pendencias: [caiu(RG), caiu(CPF)],
    });

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    await expect(pedir(m.credencialSvc, "RG")).resolves.toBeTruthy();
    await expect(
      pedir(m.credencialSvc, "CPF"),
      "reabrir o RG soltou o CPF junto: a chave da reabertura não é a pendência",
    ).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
  });

  it("e a linha do outro tipo não ganha marco nenhum", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG), caiu(CPF)] });

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    expect(m.pendencias.find((p) => p.tipoDocumentoId === CPF)!.liberadoEm).toBeNull();
  });
});

describe("R6.13: fica registrado QUEM destravou e QUANDO", () => {
  it("o destravamento do Master é gravado com autor, carimbo e tipo PRÓPRIO", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });

    await m.pendenciasSvc.zerarTentativas(ADM, RG, MASTER);

    const linha = m.pendencias[0];
    expect(linha.liberadoPorId).toBe(MASTER.id);
    expect(linha.liberadoEm).toBeInstanceOf(Date);
    expect(
      linha.liberadoTipo,
      "o destrave do Master ficou indistinguível do reenvio do consultor: some o número de vezes que a régua precisou ser desmentida",
    ).not.toBe("SOLICITACAO_REENVIO");
  });

  it("e a trilha distingue o destrave do reenvio por EVENTO, não só por texto", async () => {
    const reenvio = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    await reenvio.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);
    const destrave = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    await destrave.pendenciasSvc.zerarTentativas(ADM, RG, MASTER);

    const tipoDe = (m: ReturnType<typeof mundo>) =>
      m.eventos.map((e) => e.tipo).filter((t) => /REENVIO|REABERT|DESTRAV|TETO/i.test(t));
    expect(tipoDe(reenvio)).not.toEqual(tipoDe(destrave));
  });
});

describe("R6.14: zerado, o candidato volta a ter as TRÊS tentativas. Nem mais, nem menos", () => {
  it("logo após o destrave, restam exatamente três", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });

    const r = await m.pendenciasSvc.zerarTentativas(ADM, RG, MASTER);

    expect(r.tentativas.restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA);
    expect(r.tentativas.usadas).toBe(0);
    expect(r.tentativas.noTime).toBe(false);
  });

  /**
   * O TESTE DO "NEM MAIS, NEM MENOS", e ele é feito pelo `emitir`, que é quem concede de verdade.
   * Uma a menos seria uma reprovação velha continuar contando; uma a mais seria a terceira nova
   * ainda passar.
   */
  it("a 1ª e a 2ª reprovações NOVAS ainda deixam o candidato enviar; a 3ª fecha", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    await m.pendenciasSvc.zerarTentativas(ADM, RG, MASTER);
    const marco = m.pendencias[0].liberadoEm!;

    m.credenciais.push(reprovada(RG, new Date(marco.getTime() + 1_000)));
    await expect(pedir(m.credencialSvc), "uma a menos: reprovação velha ainda conta").resolves.toBeTruthy();

    m.credenciais.push(reprovada(RG, new Date(marco.getTime() + 2_000)));
    await expect(pedir(m.credencialSvc), "uma a menos: reprovação velha ainda conta").resolves.toBeTruthy();

    m.credenciais.push(reprovada(RG, new Date(marco.getTime() + 3_000)));
    await expect(
      pedir(m.credencialSvc),
      "uma a mais: a terceira reprovação depois do destrave não fechou a pendência",
    ).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
  });

  /**
   * AJUSTADO À DECISÃO DO DIRETOR (o destrave vale só depois da QUEDA), e a AFIRMAÇÃO É A MESMA: o
   * segundo destrave não ACUMULA crédito.
   *
   * O que mudou foi o cenário, não a pergunta. Antes bastava destravar duas vezes seguidas; agora o
   * segundo destrave exige que a pendência tenha CAÍDO DE NOVO, então as três reprovações novas
   * entram entre um destrave e outro. Se o crédito acumulasse, restariam mais de três aqui.
   */
  it("destravar duas vezes não acumula crédito: continua sendo três", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    await m.pendenciasSvc.zerarTentativas(ADM, RG, MASTER);
    const marco1 = m.pendencias[0].liberadoEm!;

    // A pendência cai OUTRA VEZ: três reprovações novas, todas depois do primeiro marco.
    for (let i = 1; i <= TETO_REPROVACOES_POR_PENDENCIA; i += 1) {
      m.credenciais.push(reprovada(RG, new Date(marco1.getTime() + i * 1_000)));
    }

    const r = await m.pendenciasSvc.zerarTentativas(ADM, RG, MASTER);

    expect(r.tentativas.restantes).toBe(TETO_REPROVACOES_POR_PENDENCIA);
  });

  /**
   * A TRAVA NOVA, medida contra o MESMO mundo: destravar ANTES da queda é recusado pelo servidor.
   * A tela esconde o botão, e esconder não é impedir.
   */
  it("destravar ANTES da queda é recusado, com o número e o caminho na mensagem", async () => {
    const m = mundo({ credenciais: [reprovada(RG, new Date("2026-09-10T09:00:00Z"))] });

    await expect(m.pendenciasSvc.zerarTentativas(ADM, RG, MASTER)).rejects.toThrow(
      /1 de 3 reprovações/i,
    );
    expect(m.pendencias, "o marco foi gravado mesmo com a recusa").toHaveLength(0);
  });
});

/**
 * A GUARDA DA GUARDA. O bloco R5.8 nasceu verde porque a construção landou no mesmo turno, e teste
 * que nasce verde é indistinguível de teste que não mede nada.
 *
 * Aqui o defeito do cabeçalho é FABRICADO por fora da produção: a contagem de quem CONCEDE volta a
 * ignorar o marco da reabertura, exatamente como fazia antes do item 5 existir. Se o dublê de banco
 * estivesse aplicando a regra por conta própria, este teste ficaria verde e denunciaria o dublê.
 * Nenhuma linha de produção é tocada.
 */
describe("prova de que o ciclo do item 8 tem dente", () => {
  it("se a contagem de quem CONCEDE esquecer o marco, o candidato segue barrado", async () => {
    const m = mundo({ credenciais: [...TRES_VELHAS], pendencias: [caiu(RG)] });
    const interno = m.credencialSvc as unknown as {
      reprovacoesDaPendencia: (l: { select: unknown }, a: string, t: string) => Promise<number>;
    };
    const comMarco = interno.reprovacoesDaPendencia.bind(m.credencialSvc);
    interno.reprovacoesDaPendencia = async (leitor, adm, tipo) => {
      // A consulta SEM o marco: conta toda reprovação carimbada, reaberta ou não.
      const [linha] = (await (leitor as { select: (p: unknown) => { from: () => { where: (c: unknown) => Promise<unknown[]> } } })
        .select({ reprovacoes: 0 })
        .from()
        .where(`${adm} ${tipo} reprovado_em is not null`)) as Array<{ reprovacoes: number }>;
      void comMarco;
      return linha?.reprovacoes ?? 0;
    };

    await m.pendenciasSvc.solicitarReenvio(ADM, RG, CONSULTOR);

    await expect(pedir(m.credencialSvc)).rejects.toThrow(AVISO_PENDENCIA_NO_TIME);
  });
});
