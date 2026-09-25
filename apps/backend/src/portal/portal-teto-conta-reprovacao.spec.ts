import { describe, expect, it, vi } from "vitest";
import { PortalCredencialService } from "./portal-credencial.service";
import { portalCredenciais, portalPendenciasNoTime } from "../db/schema";

/**
 * O TETO CONTA REPROVAÇÃO, NUNCA ENVIO, e é este arquivo que trava a distinção.
 *
 * O ATALHO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR: contar envio é uma linha mais curta e transforma a
 * proteção contra laço em negação de serviço contra o próprio candidato. Um celular lento, uma foto
 * grande e um leitor fora do ar queimariam as três tentativas sem que ninguém jamais tivesse dito
 * que o documento estava errado.
 *
 * O QUE SE PROVA AQUI:
 *  1. reprovação carimba a linha da credencial (é o contador durável) e vai à trilha;
 *  2. aprovação, falha de infraestrutura e recusa técnica NÃO carimbam nada;
 *  3. a terceira reprovação registra a queda para a fila do time, com quantas e quando;
 *  4. o estado do documento NÃO é tocado pelo teto: nenhuma fila nova nasce dele.
 *
 * §A.6: fixtures sem dado pessoal de verdade.
 */

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

/**
 * `reprovacoesDepois` é quanto a contagem passa a valer DEPOIS do carimbo, que é o que o serviço
 * relê do banco para saber se a pendência acabou de cair para o time.
 */
function montar(opts: {
  resposta?: Record<string, unknown>;
  leitorForaDoAr?: boolean;
  reprovacoesDepois?: number;
  /** O tipo de documento não tem regra de auditoria ativa: é escalada, não reprovação (§A.9). */
  semRegraAtiva?: boolean;
}) {
  const updates: Escrita[] = [];
  const inserts: Escrita[] = [];
  /**
   * O ESTADO QUE O DUBLÊ PRECISAVA APLICAR PARA A CLASSE FICAR ENUNCIÁVEL (achado da 5ª auditoria).
   *
   * Produção carimba a reprovação com `update ... set reprovado_em = now() where id = ? AND
   * reprovado_em is null ... returning`, e volta VAZIO quando a linha JÁ estava carimbada: é a
   * transição `null -> carimbo` que conta uma tentativa, não o ato de processar a confirmação. O
   * dublê antigo devolvia SEMPRE uma linha, então "a mesma confirmação processada duas vezes conta
   * duas?" era impossível de perguntar. Aqui a linha guarda se já foi carimbada e o `returning`
   * reflete o `where`: a segunda passagem sobre a MESMA linha volta vazia, no-op.
   */
  let reprovadoEmCarimbado = false;

  const select = (proj: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {});
    // O LINK VIVO, conferido pela confirmação desde a frente da IDENTIDADE. Sempre em pé aqui.
    const linhas = chaves.includes("suspensoAte")
      ? [{ expiraEm: new Date(Date.now() + 3_600_000), revogadoEm: null, suspensoAte: null }]
      : chaves.includes("reprovacoes")
      ? [{ reprovacoes: opts.reprovacoesDepois ?? 1 }]
      : chaves.includes("descricaoRegra")
        ? opts.semRegraAtiva
          ? []
          : [{ descricaoRegra: "regra qualquer" }]
        : chaves.includes("nome") && chaves.includes("cpf")
          ? [{ nome: "CANDIDATO TESTE", cpf: "00000000000" }]
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
        // O carimbo da reprovação é o ÚNICO `update` com guarda de nulidade (`reprovado_em is
        // null`): só a transição aplica, e o `returning` só então traz linha. Os demais `update`
        // (o `estado` da chegada) não têm guarda e seguem aplicando como antes.
        const ehCarimboDeReprovacao = "reprovadoEm" in valores;
        let aplicou = true;
        if (ehCarimboDeReprovacao) {
          aplicou = !reprovadoEmCarimbado;
          if (aplicou) reprovadoEmCarimbado = true;
        }
        // Uma escrita que não aplicou não é carimbo: não entra no rastro que `carimbos()` conta.
        if (aplicou) updates.push({ tabela, valores });
        const fim = {
          where: () => fim,
          returning: async () => (aplicou ? [{ id: LINHA.id }] : []),
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
        return fim;
      },
    }),
    insert: (tabela: unknown) => ({
      values: (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
        // `onConflictDoUpdate` entrou junto com a REABERTURA da pendência (itens 5 e 6): a pendência
        // reaberta pode cair de novo, e a linha precisa recarimbar a queda nova em vez de ignorar o
        // conflito. O `setWhere` é que preserva a idempotência de quem nunca foi reaberto.
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
    configurado: () => !opts.leitorForaDoAr,
    ler: async () => {
      if (opts.leitorForaDoAr) throw new Error("leitor fora");
      return {
        aceito: true,
        chegada: { tamanhoBytes: 1024 },
        auditoria: null,
        sugestoes: null,
        ...(opts.resposta ?? {}),
      };
    },
  };

  const registrar = vi.fn(async () => {});
  const trilha = { configurada: () => true, registrar };

  const svc = new PortalCredencialService(
    db as never,
    { get: () => "pepper" } as never,
    armazenamento as never,
    leitor as never,
    trilha as never,
  );
  return { svc, updates, inserts, registrar };
}

const confirmar = (svc: PortalCredencialService) =>
  svc.confirmar({
    admissaoId: "adm-1",
    jtiLink: "jti-1",
    credencialId: "cred-1",
    avisoDoNavegador: true,
  });

/** As escritas que carimbam a reprovação na linha da credencial. */
const carimbos = (updates: Escrita[]) =>
  updates.filter((u) => u.tabela === portalCredenciais && "reprovadoEm" in u.valores);

describe("O QUE QUEIMA: o documento julgado e reprovado", () => {
  it("veredito negativo carimba a linha da credencial, que é o contador durável", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: false, status: "INCONFORME", motivo: "fora do prazo" } },
    });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(1);
  });

  it("a tentativa queimada vai à trilha com o código fechado e a contagem, sem o motivo da IA", async () => {
    const ctx = montar({
      resposta: {
        auditoria: { valido: false, status: "PENDENTE", motivo: "documento ilegivel de fulano" },
      },
      reprovacoesDepois: 2,
    });

    await confirmar(ctx.svc);

    const evento = ctx.registrar.mock.calls.find(
      (c) => (c as unknown as [string, Record<string, unknown>])[1]?.motivoCodigo === "REPROVADO",
    ) as unknown as [string, Record<string, unknown>] | undefined;
    expect(evento).toBeTruthy();
    expect(evento![1].tentativaN).toBe(2);
    // O motivo escrito pela IA é texto livre e fica fora da trilha (§A.6).
    expect(JSON.stringify(evento![1])).not.toContain("fulano");
  });
});

describe("O QUE NÃO QUEIMA: e cada um seria negação de serviço contra o candidato", () => {
  it("documento APROVADO não carimba nada", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: true, status: "VALIDADO", motivo: "ok" } },
    });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(0);
  });

  it("LEITOR FORA DO AR não queima: ninguém julgou documento nenhum", async () => {
    const ctx = montar({ leitorForaDoAr: true });

    const r = await confirmar(ctx.svc);

    // O documento chegou e está confirmado; o que faltou foi a leitura.
    expect(r.entregue).toBe(true);
    expect(carimbos(ctx.updates)).toHaveLength(0);
  });

  it("RECUSA TÉCNICA (páginas demais) não queima: é o arquivo que não coube", async () => {
    const ctx = montar({ resposta: { aceito: false, recusa: "PAGINAS" } });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(0);
  });

  it("PDF com SENHA queima, porque aí é o documento que não serve", async () => {
    const ctx = montar({ resposta: { aceito: false, recusa: "PROTEGIDO_SENHA" } });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(1);
  });

  it("sem bloco de auditoria nenhum, nada é contado", async () => {
    const ctx = montar({ resposta: { auditoria: null } });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(0);
  });

  it("TIPO SEM REGRA ATIVA é ESCALADA, não reprovação, e não queima tentativa", async () => {
    // Medido contra o serviço de IA real: sem regra cadastrada ele devolve um bloco de auditoria
    // PRESENTE, com `valido=false` e `status=PENDENTE`, cujo motivo é "validação manual
    // necessária" (§A.9). Guardar pela presença do bloco fazia esse caso queimar as três tentativas
    // e derrubar a pessoa para a fila do time sem uma única reprovação de verdade.
    const ctx = montar({
      semRegraAtiva: true,
      resposta: {
        auditoria: {
          valido: false,
          status: "PENDENTE",
          motivo: "Não há regras de auditoria ativas para este tipo de documento; validação manual necessária.",
        },
      },
    });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(0);
  });

  it("com regra ativa, o MESMO veredito negativo queima: o que muda é a existência de critério", async () => {
    const ctx = montar({
      semRegraAtiva: false,
      resposta: { auditoria: { valido: false, status: "PENDENTE", motivo: "ilegivel" } },
    });

    await confirmar(ctx.svc);

    expect(carimbos(ctx.updates)).toHaveLength(1);
  });
});

describe("A QUEDA PARA A FILA DO TIME", () => {
  it("na TERCEIRA reprovação, registra quantas tentativas houve e quando caiu", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: false, status: "INCONFORME", motivo: "x" } },
      reprovacoesDepois: 3,
    });

    await confirmar(ctx.svc);

    const queda = ctx.inserts.find((i) => i.tabela === portalPendenciasNoTime);
    expect(queda?.valores).toMatchObject({
      admissaoId: "adm-1",
      tipoDocumentoId: "tipo-1",
      tentativas: 3,
    });
    const evento = ctx.registrar.mock.calls.find(
      (c) =>
        (c as unknown as [string, Record<string, unknown>])[1]?.motivoCodigo ===
        "TENTATIVAS_ESGOTADAS",
    );
    expect(evento).toBeTruthy();
  });

  it("na SEGUNDA, ainda não cai: o carimbo da queda é da queda, não do último clique", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: false, status: "INCONFORME", motivo: "x" } },
      reprovacoesDepois: 2,
    });

    await confirmar(ctx.svc);

    expect(ctx.inserts.find((i) => i.tabela === portalPendenciasNoTime)).toBeUndefined();
  });

  it("depois de cair, reprovação repetida não cria linha nova nem reescreve a data", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: false, status: "INCONFORME", motivo: "x" } },
      reprovacoesDepois: 4,
    });

    await confirmar(ctx.svc);

    expect(ctx.inserts.find((i) => i.tabela === portalPendenciasNoTime)).toBeUndefined();
  });
});

describe("O TETO NÃO CRIA FILA NOVA E NÃO MEXE NO DOCUMENTO", () => {
  it("nenhuma escrita de estado de documento sai do caminho do teto", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: false, status: "INCONFORME", motivo: "x" } },
      reprovacoesDepois: 3,
    });

    await confirmar(ctx.svc);

    // O único `estado` escrito no caminho é o AGUARDANDO_AUDITORIA da chegada, que já existia antes
    // desta frente e é quem põe o documento na fila humana de sempre.
    const estados = ctx.updates
      .map((u) => u.valores.estado)
      .filter((e): e is string => typeof e === "string");
    expect(estados).toEqual(["AGUARDANDO_AUDITORIA"]);
  });
});

describe("A MESMA CONFIRMAÇÃO PROCESSADA DUAS VEZES conta UMA tentativa (retry / duplo-clique / corrida)", () => {
  /**
   * A CLASSE QUE O DUBLÊ QUE APLICA TORNOU ENUNCIÁVEL: o teto conta a TRANSIÇÃO (`null -> carimbo`),
   * nunca o ato de processar. Um retry, um duplo-clique ou duas instâncias correndo sobre a MESMA
   * confirmação não podem queimar duas tentativas de uma só, nem derrubar o candidato para a fila
   * do time antes das três reprovações REAIS. Quem garante isso é o `where reprovado_em is null ...
   * returning` vazio na segunda passagem, e é exatamente isso que o `returning` do dublê agora
   * reflete. Com o dublê antigo (uma linha sempre), este teste não podia sequer ser escrito.
   */
  it("o segundo processamento é NO-OP: não recarimba, não re-registra e não cria segunda queda", async () => {
    const ctx = montar({
      resposta: { auditoria: { valido: false, status: "INCONFORME", motivo: "x" } },
      reprovacoesDepois: 3,
    });

    await confirmar(ctx.svc);
    await confirmar(ctx.svc);

    // UMA transição carimbada, não duas: a segunda passagem casou `returning` vazio.
    expect(carimbos(ctx.updates)).toHaveLength(1);

    const reprovadosNaTrilha = ctx.registrar.mock.calls.filter(
      (c) => (c as unknown as [string, Record<string, unknown>])[1]?.motivoCodigo === "REPROVADO",
    );
    expect(reprovadosNaTrilha).toHaveLength(1);

    // A queda para a fila do time acontece UMA vez, não a cada reprocessamento do mesmo veredito.
    const quedas = ctx.inserts.filter((i) => i.tabela === portalPendenciasNoTime);
    expect(quedas).toHaveLength(1);
    const limiteAtingido = ctx.registrar.mock.calls.filter(
      (c) => (c as unknown as [string, Record<string, unknown>])[1]?.motivoCodigo === "TENTATIVAS_ESGOTADAS",
    );
    expect(limiteAtingido).toHaveLength(1);
  });
});
