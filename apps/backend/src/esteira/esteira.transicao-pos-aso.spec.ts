import { describe, expect, it, vi } from "vitest";
import { EsteiraService } from "./esteira.service";
import { admissoes, documentosAdmissao, frentesAdmissao } from "../db/schema";

/**
 * TRANSIÇÃO PÓS-ASO — a rede que faltava (incidente de 31/07/2026).
 *
 * A transição nasceu sem teste e quebrou de duas maneiras ao mesmo tempo, as duas visíveis só na
 * operação real:
 *   (a) exame em A_AGENDAR não virava APTO. A I.A validava o ASO, `aso_validado` virava `true` e a
 *       frente ficava parada, porque a lista de estados aceitos supunha que o agendamento sempre
 *       fosse registrado no EA antes do ASO chegar. Não é o que acontece: o consultor recebe o ASO
 *       da clínica e anexa sem ter agendado no sistema. 5 admissões travaram assim.
 *   (b) a frente CADASTRO_CONTRATO não nascia. A fila do Cadastro parte de `frentes_admissao` com
 *       INNER JOIN por tipo, então sem a linha a admissão não aparece na aba, mesmo APTA. 23
 *       admissões ficaram APTAS e invisíveis no Cadastro.
 *
 * Cada `it` aqui trava um dos dois furos, mais os limites que NÃO podem mudar (CANCELADO e frente
 * concluída ficam de fora; ASO reprovado pela I.A não conclui nada).
 *
 * Sem Postgres: db falso que devolve as frentes irmãs da fixture e grava o que foi escrito, então o
 * teste observa o comportamento REAL do serviço.
 */

const ADMISSAO_ID = "adm-1";
const FRENTE_EXAME_ID = "frente-exame-1";

interface Fixtures {
  /** Status atual da frente EXAME. */
  status: string;
  /** A frente EXAME já está concluída? */
  concluida?: boolean;
  /** A AUDITORIA já concluiu (é o outro lado do gate do Cadastro, regra 3)? */
  auditoriaConcluida?: boolean;
  /** Já existe frente CADASTRO_CONTRATO (nascimento lazy não repete)? */
  cadastroExiste?: boolean;
  /** O Cadastro existente já CONCLUIU? (só acontece com o Exame liberado sem ASO.) */
  cadastroConcluido?: boolean;
  /** Existe frente INTEGRACAO ainda ABERTA? */
  integracaoPendente?: boolean;
  /** Veredito da I.A sobre o ASO anexado. */
  vereditoIa?: "VALIDADO" | "INCONFORME";
  /** A I.A estoura (indisponível)? */
  iaFalha?: boolean;
}

interface Escrita {
  tabela: unknown;
  valores: Record<string, unknown>;
}

function montar(f: Fixtures) {
  const escritas: Escrita[] = [];
  const atualizacoes: Escrita[] = [];

  const irmas = [
    {
      id: FRENTE_EXAME_ID,
      tipo: "EXAME",
      status: f.status,
      concluida: f.concluida ?? false,
    },
    {
      id: "frente-auditoria-1",
      tipo: "AUDITORIA",
      status: "ANALISE_OK",
      concluida: f.auditoriaConcluida ?? true,
    },
    ...(f.cadastroExiste
      ? [
          {
            id: "frente-cadastro-1",
            tipo: "CADASTRO_CONTRATO",
            status: f.cadastroConcluido ? "CADASTRADO" : "A_CADASTRAR",
            concluida: f.cadastroConcluido ?? false,
          },
        ]
      : []),
    ...(f.integracaoPendente
      ? [
          {
            id: "frente-integracao-1",
            tipo: "INTEGRACAO",
            status: "A_AGENDAR",
            concluida: false,
          },
        ]
      : []),
  ];

  const chain = (): Record<string, unknown> => {
    let tabela: unknown = null;
    const b: Record<string, unknown> = {};
    b.from = (t: unknown) => {
      tabela = t;
      return b;
    };
    for (const m of ["innerJoin", "leftJoin", "orderBy", "groupBy", "limit", "where"]) {
      b[m] = () => b;
    }
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(tabela === frentesAdmissao ? irmas : []).then(res, rej);
    return b;
  };

  const escrita = (tabela: unknown, destino: Escrita[]) => {
    const b: Record<string, unknown> = {};
    b.values = (v: unknown) => {
      destino.push({ tabela, valores: v as Record<string, unknown> });
      return b;
    };
    b.set = (v: unknown) => {
      atualizacoes.push({ tabela, valores: v as Record<string, unknown> });
      return b;
    };
    b.where = () => b;
    b.onConflictDoUpdate = () => b;
    b.onConflictDoNothing = () => b;
    b.returning = () => Promise.resolve([{ id: "novo-1" }]);
    b.then = (res: (v: unknown[]) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej);
    return b;
  };

  const exec = {
    select: () => chain(),
    selectDistinct: () => chain(),
    insert: (t: unknown) => escrita(t, escritas),
    update: (t: unknown) => escrita(t, escritas),
    query: {
      admissoes: {
        findFirst: async () => ({
          id: ADMISSAO_ID,
          farolGlobal: "EM_ADMISSAO",
          dataAdmissao: "2026-08-10",
        }),
      },
      tiposDocumento: { findFirst: async () => ({ id: "tipo-aso", codigo: "ASO" }) },
      // Lido pelo arquivamento do ASO, para cobrir a ordem inversa (frente já APTA, ASO chegando
      // depois), em que não há transição nova para servir de gatilho.
      frentesAdmissao: { findFirst: async () => irmas.find((i) => i.tipo === "EXAME") },
      // Lido pelo caminho de falha da I.A, para devolver à tela o motivo que a rotina de falha
      // acabou de gravar (o consultor precisa saber por que o ASO não foi julgado).
      documentosAdmissao: {
        findFirst: async () => ({ observacao: "O motor de IA está fora do ar." }),
      },
    },
  } as Record<string, unknown>;
  (exec as { transaction: unknown }).transaction = async (cb: (tx: unknown) => Promise<unknown>) =>
    cb(exec);

  const auditoria = {
    classificarAso: async () => {
      if (f.iaFalha) throw new Error("I.A indisponível");
      const status = f.vereditoIa ?? "VALIDADO";
      return {
        tipoDocumentoId: "tipo-aso",
        status,
        valido: status === "VALIDADO",
        motivo: status === "VALIDADO" ? "Apto, dentro da validade." : MOTIVO_REPROVA,
      };
    },
    gravarFalhaDeAuditoria: async () => undefined,
    // A PORTA ESTREITA do sinalizador. `aplicarPosVeredito` NÃO entra no fake de propósito: se o
    // serviço um dia passar a chamá-lo daqui, o teste quebra com "is not a function", que é
    // exatamente o alarme que o diretor pediu (recalcular o sinalizador não pode criar gatilho de
    // conclusão nem de arquivamento).
    sinalizadorApenas: vi.fn(async () => "INCONFORMIDADE"),
    // O arquivamento do ASO no prontuário. É o mesmo método do APTO manual, de propósito.
    arquivarAso: vi.fn(async () => ({ pastaUrl: "https://drive.google.com/drive/folders/xyz" })),
  };

  const svc = new EsteiraService(exec as never, {} as never, auditoria as never);
  return { svc, escritas, atualizacoes, auditoria };
}

/** Motivo que a I.A devolve ao reprovar. É ele que tem de chegar ao banco e à tela. */
const MOTIVO_REPROVA = "Exame com data de emissão vencida: o ASO tem mais de 90 dias.";

/** Upload mínimo de ASO (o buffer nunca é persistido — regra 7 / §A.6). */
const ARQUIVO = {
  originalname: "aso.pdf",
  size: 1234,
  buffer: Buffer.from("%PDF-1.4 aso"),
} as unknown as Express.Multer.File;

/** As inserções na tabela de frentes (nascimento lazy do Cadastro). */
const frentesInseridas = (escritas: Escrita[]) =>
  escritas.filter((e) => e.tabela === frentesAdmissao).map((e) => e.valores);

describe("transição pós-ASO: o exame vira APTO quando a I.A valida", () => {
  it("A_AGENDAR vira APTO: o ASO validado prova o exame mesmo sem agendamento registrado", async () => {
    const { svc, atualizacoes } = montar({ status: "A_AGENDAR" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.asoValidado).toBe(true);
    expect(r.aptoAuto).toMatchObject({ de: "A_AGENDAR", para: "APTO" });
    // A frente foi de fato concluída no banco, não só no retorno.
    expect(atualizacoes).toContainEqual(
      expect.objectContaining({
        tabela: frentesAdmissao,
        valores: expect.objectContaining({ status: "APTO", concluida: true }),
      }),
    );
  });

  it.each(["AGENDADO", "AGUARDANDO_ASO", "ASO_PENDENTE"])(
    "%s vira APTO (os estados de espera continuam valendo)",
    async (status) => {
      const { svc } = montar({ status });
      const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;
      expect(r.aptoAuto).toMatchObject({ de: status, para: "APTO" });
    },
  );

  it("abre o Cadastro: a frente CADASTRO_CONTRATO nasce junto do APTO", async () => {
    const { svc, escritas } = montar({ status: "AGENDADO", auditoriaConcluida: true });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.aptoAuto).toMatchObject({ cadastroNasceu: true });
    expect(frentesInseridas(escritas)).toContainEqual(
      expect.objectContaining({
        admissaoId: ADMISSAO_ID,
        tipo: "CADASTRO_CONTRATO",
        status: "A_CADASTRAR",
        concluida: false,
      }),
    );
  });

  it("não abre o Cadastro com a AUDITORIA pendente (o gate da regra 3 continua de pé)", async () => {
    const { svc, escritas } = montar({ status: "AGENDADO", auditoriaConcluida: false });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.aptoAuto).toMatchObject({ para: "APTO" });
    expect(r.aptoAuto).not.toHaveProperty("cadastroNasceu");
    expect(frentesInseridas(escritas)).toHaveLength(0);
  });

  it("não duplica o Cadastro que já existe (nascimento lazy é idempotente)", async () => {
    const { svc, escritas } = montar({ status: "AGENDADO", cadastroExiste: true });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(frentesInseridas(escritas)).toHaveLength(0);
  });

  it("CANCELADO não vira APTO: encerramento humano não se desfaz por upload", async () => {
    const { svc } = montar({ status: "CANCELADO" });
    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;
    expect(r.asoValidado).toBe(true);
    expect(r).not.toHaveProperty("aptoAuto");
  });

  it("frente já concluída não gera evento novo (idempotente)", async () => {
    const { svc, escritas } = montar({ status: "APTO", concluida: true });
    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;
    expect(r).not.toHaveProperty("aptoAuto");
    expect(frentesInseridas(escritas)).toHaveLength(0);
  });

  it("ASO reprovado pela I.A não conclui a frente", async () => {
    const { svc } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });
    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;
    expect(r.asoValidado).toBe(false);
    expect(r).not.toHaveProperty("aptoAuto");
  });

  it("I.A indisponível deixa o ASO anexado e a frente parada (gate travado)", async () => {
    const { svc, escritas } = montar({ status: "AGENDADO", iaFalha: true });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.iaStatus).toBe("INDISPONIVEL");
    expect(r.asoValidado).toBe(false);
    expect(r).not.toHaveProperty("aptoAuto");
    // O ASO fica registrado (a coleta é gravada antes da I.A), agora SEM veredito: quem decide o
    // estado nesse caso é `gravarFalhaDeAuditoria`, a mesma rotina da régua. E o motivo da parada
    // volta para a tela, em vez do texto fixo de antes.
    expect(escritas.some((e) => e.tabela === documentosAdmissao)).toBe(true);
    expect(r.iaMotivo).toBe("O motor de IA está fora do ar.");
  });
});

/**
 * O MOTIVO REAL DA REPROVAÇÃO (OST do motivo do ASO). A I.A sempre produziu a razão da recusa
 * (campo obrigatório do schema do Gemini) e o caminho do ASO a descartava: `classificarAso`
 * devolvia só `{ status, valido }`, e a observação do documento ficava com "ASO anexado (N bytes)",
 * gravada ANTES da classificação e nunca reescrita. O consultor recebia "inconforme" sem saber o
 * que corrigir, e o ASO reprovado seguia ENTREGUE, isto é, verde e indistinguível de um aprovado.
 */
describe("o veredito da I.A vira estado e motivo do documento", () => {
  /** A última escrita feita na linha do documento (o veredito sobrescreve a coleta). */
  const vereditoGravado = (atualizacoes: Escrita[]) =>
    atualizacoes.filter((a) => a.tabela === documentosAdmissao).at(-1)?.valores;

  it("reprovado: grava INCONFORME com o motivo real, nunca ENTREGUE", async () => {
    const { svc, atualizacoes } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(vereditoGravado(atualizacoes)).toMatchObject({
      estado: "INCONFORME",
      observacao: MOTIVO_REPROVA,
    });
    // O motivo também volta para quem acabou de enviar, para o aviso da tela deixar de ser fixo.
    expect(r.iaMotivo).toBe(MOTIVO_REPROVA);
  });

  it("aprovado: grava ENTREGUE com o motivo, e o fluxo do apto segue intacto", async () => {
    const { svc, atualizacoes } = montar({ status: "AGENDADO", vereditoIa: "VALIDADO" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(vereditoGravado(atualizacoes)).toMatchObject({ estado: "ENTREGUE" });
    expect(r.asoValidado).toBe(true);
    expect(r.aptoAuto).toMatchObject({ para: "APTO" });
  });

  it("SINALIZADOR NA HORA: reprovado recalcula sem passar pelo pós-veredito", async () => {
    const { svc, auditoria, escritas } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    // Recalculou, e a tela recebe o valor novo sem precisar recarregar por fora.
    expect(auditoria.sinalizadorApenas).toHaveBeenCalledWith(ADMISSAO_ID);
    expect(r.sinalizador).toBe("INCONFORMIDADE");
    // A CONDIÇÃO DO DIRETOR (§A.26): nada de conclusão automática nem de arquivamento.
    expect(r).not.toHaveProperty("aptoAuto");
    expect(r).not.toHaveProperty("arquivado");
    expect(r).not.toHaveProperty("auditoriaAuto");
    expect(frentesInseridas(escritas)).toHaveLength(0);
  });

  it("SINALIZADOR NA HORA: aprovado também recalcula, e o fluxo do apto segue inteiro", async () => {
    const { svc, auditoria } = montar({ status: "AGENDADO", vereditoIa: "VALIDADO" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    // Simetria: o ASO reenviado e aprovado precisa LIMPAR a inconformidade no mesmo instante.
    expect(auditoria.sinalizadorApenas).toHaveBeenCalledWith(ADMISSAO_ID);
    // E o caminho do aprovado não perdeu nada: continua concluindo o exame em APTO.
    expect(r.aptoAuto).toMatchObject({ para: "APTO" });
  });

  it("falha ao recalcular o sinalizador NÃO derruba o upload já gravado", async () => {
    const { svc, auditoria } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });
    auditoria.sinalizadorApenas.mockRejectedValueOnce(new Error("banco fora"));

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.ok).toBe(true);
    expect(r.iaStatus).toBe("INCONFORME");
    expect(r.sinalizador).toBeUndefined();
  });

  it("a coleta é gravada ANTES da I.A, e sem fingir veredito", async () => {
    const { svc, escritas } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    const coleta = escritas.find((e) => e.tabela === documentosAdmissao)?.valores;
    // AGUARDANDO_AUDITORIA, não ENTREGUE: o arquivo chegou, o veredito ainda não.
    expect(coleta).toMatchObject({ estado: "AGUARDANDO_AUDITORIA" });
    expect(coleta?.observacao).toContain("1234 bytes");
  });
});

/**
 * O ASO VAI PARA O PRONTUÁRIO NO APTO (bug de produção, 13/08/2026).
 *
 * O ASO validado pela I.A concluía a frente e ficava só na staging, onde o TTL de 48h o apagava.
 * A crença registrada no item 12 era de que "a I.A já arquiva sozinha", e arquiva mesmo, mas no
 * caminho da RÉGUA (`auditarConjunto`, passo 4.5), que não é por onde o ASO da operação sobe: ele
 * sobe aqui, pelo `classificarAso`, que classifica e não arquiva. A medição na base fechou o
 * diagnóstico: 186 admissões APTAS com ASO validado, `drive_aso_url` nulo em TODAS as 186.
 *
 * O item 12 não tinha teste nenhum, e é por isso que a metade que faltava passou despercebida.
 * Estes `it` cobrem as duas ordens em que a operação chega ao APTO e, principalmente, os limites:
 * ASO reprovado e exame CANCELADO não arquivam nada.
 */
describe("arquivamento do ASO no prontuário", () => {
  it("ASO validado que conclui a frente vai para o prontuário", async () => {
    const { svc, auditoria } = montar({ status: "AGENDADO", vereditoIa: "VALIDADO" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.aptoAuto).toMatchObject({ para: "APTO" });
    expect(auditoria.arquivarAso).toHaveBeenCalledWith(ADMISSAO_ID);
  });

  it("ORDEM INVERSA: frente já APTA de antes, ASO chegando depois, também arquiva", async () => {
    // Aqui não há transição nova (`concluirExamePorAso` é idempotente e devolve undefined), então
    // sem a consulta da frente o arquivamento ficaria de fora justamente de quem já passou do APTO.
    const { svc, auditoria } = montar({ status: "APTO", concluida: true });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r).not.toHaveProperty("aptoAuto");
    expect(auditoria.arquivarAso).toHaveBeenCalledWith(ADMISSAO_ID);
  });

  it("ASO reprovado NÃO vai para o prontuário", async () => {
    const { svc, auditoria } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(auditoria.arquivarAso).not.toHaveBeenCalled();
  });

  it("I.A indisponível NÃO arquiva (sem veredito não há APTO)", async () => {
    const { svc, auditoria } = montar({ status: "AGENDADO", iaFalha: true });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(auditoria.arquivarAso).not.toHaveBeenCalled();
  });

  it("exame CANCELADO não arquiva: a frente não está APTA", async () => {
    const { svc, auditoria } = montar({ status: "CANCELADO" });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(auditoria.arquivarAso).not.toHaveBeenCalled();
  });

  it("falha no Drive NÃO derruba o upload já gravado e julgado", async () => {
    const { svc, auditoria } = montar({ status: "AGENDADO", vereditoIa: "VALIDADO" });
    auditoria.arquivarAso.mockRejectedValueOnce(new Error("Drive fora do ar"));

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    // A frente concluiu e o veredito está gravado: o arquivamento é consequência, não condição.
    expect(r.ok).toBe(true);
    expect(r.asoValidado).toBe(true);
    expect(r.aptoAuto).toMatchObject({ para: "APTO" });
  });
});

describe("a coleta do ASO", () => {
  it("é gravada ANTES da I.A, e sem fingir veredito", async () => {
    const { svc, escritas } = montar({ status: "AGENDADO", vereditoIa: "INCONFORME" });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    const coleta = escritas.find((e) => e.tabela === documentosAdmissao)?.valores;
    // AGUARDANDO_AUDITORIA, não ENTREGUE: o arquivo chegou, o veredito ainda não.
    expect(coleta).toMatchObject({ estado: "AGUARDANDO_AUDITORIA" });
    expect(coleta?.observacao).toContain("1234 bytes");
  });
});

/**
 * O FECHAMENTO DO "LIBERADO PARA CADASTRO SEM ASO" (OST do ADM).
 *
 * A admissão foi liberada JUSTAMENTE porque o ASO não existia. Quando ele chega, é este caminho que
 * a tira do limbo, e são estes testes que provam que ele funciona ponta a ponta.
 *
 * O SEGUNDO BLOCO é a peça que evita o defeito da Bienal (§A.27): o carimbo `ADMISSAO_CONCLUIDA` foi
 * SEGURADO lá atrás, quando a Integração fechou com o Exame ainda aberto. Se ninguém o recolocasse
 * aqui, a admissão terminaria a esteira inteira sem farol de conclusão, e Painel e Gerenciador
 * divergiriam em silêncio.
 */
describe("liberado sem ASO: o ASO chegando fecha o Exame de verdade", () => {
  it("LIBERADO_SEM_ASO vira APTO e conclui a frente", async () => {
    const { svc, atualizacoes } = montar({ status: "LIBERADO_SEM_ASO" });

    const r = (await svc.anexarAso(ADMISSAO_ID, ARQUIVO)) as Record<string, unknown>;

    expect(r.aptoAuto).toMatchObject({ de: "LIBERADO_SEM_ASO", para: "APTO" });
    expect(atualizacoes).toContainEqual(
      expect.objectContaining({
        tabela: frentesAdmissao,
        valores: expect.objectContaining({ status: "APTO", concluida: true }),
      }),
    );
  });

  it("o ASO é arquivado no prontuário, como em qualquer outro caminho do APTO", async () => {
    const { svc, auditoria } = montar({ status: "LIBERADO_SEM_ASO" });
    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);
    expect(auditoria.arquivarAso).toHaveBeenCalledWith(ADMISSAO_ID);
  });

  it("RECARIMBA o farol de conclusão quando o Cadastro já fechou e não há integração pendente", async () => {
    const { svc, atualizacoes } = montar({
      status: "LIBERADO_SEM_ASO",
      cadastroExiste: true,
      cadastroConcluido: true,
    });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(atualizacoes).toContainEqual(
      expect.objectContaining({
        tabela: admissoes,
        valores: expect.objectContaining({ farolGlobal: "ADMISSAO_CONCLUIDA" }),
      }),
    );
  });

  it("NÃO recarimba quando a INTEGRAÇÃO ainda está aberta (a esteira não acabou)", async () => {
    const { svc, atualizacoes } = montar({
      status: "LIBERADO_SEM_ASO",
      cadastroExiste: true,
      cadastroConcluido: true,
      integracaoPendente: true,
    });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(atualizacoes).not.toContainEqual(
      expect.objectContaining({
        tabela: admissoes,
        valores: expect.objectContaining({ farolGlobal: "ADMISSAO_CONCLUIDA" }),
      }),
    );
  });

  it("NÃO recarimba quando o Cadastro ainda está ABERTO", async () => {
    const { svc, atualizacoes } = montar({
      status: "LIBERADO_SEM_ASO",
      cadastroExiste: true,
      cadastroConcluido: false,
    });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(atualizacoes).not.toContainEqual(
      expect.objectContaining({
        tabela: admissoes,
        valores: expect.objectContaining({ farolGlobal: "ADMISSAO_CONCLUIDA" }),
      }),
    );
  });

  it("NÃO recarimba quem NUNCA foi liberado sem ASO (o recorte é estreito)", async () => {
    // Um exame em espera com o Cadastro concluído não existe pelo caminho normal, mas a guarda é
    // por status justamente para nenhum farol alheio ser reescrito por este caminho.
    const { svc, atualizacoes } = montar({
      status: "ASO_PENDENTE",
      cadastroExiste: true,
      cadastroConcluido: true,
    });

    await svc.anexarAso(ADMISSAO_ID, ARQUIVO);

    expect(atualizacoes).not.toContainEqual(
      expect.objectContaining({
        tabela: admissoes,
        valores: expect.objectContaining({ farolGlobal: "ADMISSAO_CONCLUIDA" }),
      }),
    );
  });
});
