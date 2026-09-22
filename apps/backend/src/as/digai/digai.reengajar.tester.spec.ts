import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { expect, it } from "vitest";
import { AS_MAXIMO_POR_LOTE } from "@ea/shared-types";
import { ROLES_KEY } from "../../auth/decorators";
import {
  CPF_SINTETICO,
  exigirExport,
  exigirPeca,
  fonteExigida,
  piiNaSaida,
  describeSuspenso,
  sentinelaDoDigai,
} from "./digai.tester-fake";

/**
 * ┌─ SUITE SUSPENSA: A IMPLEMENTACAO DO DIGAI AINDA NAO EXISTE ─────────────────────────────────┐
 * │ Nada aqui foi apagado. Cada assercao, cada caso e cada `it` continua escrito, palavra por   │
 * │ palavra: este arquivo e o CONTRATO que a construcao vai ter de satisfazer, escrito antes do │
 * │ codigo de proposito (secao A.38 e secao A.40, regra 2). A frente esta parada por insumo do  │
 * │ diretor (o token do Digai, docs/PLATAFORMA-UNIFICADORA-DECISOES.md, secao 5).               │
 * │                                                                                             │
 * │ O QUE MUDA E SO QUANDO RODA. Os blocos abaixo usam `describeSuspenso`, que e `describe.skip` │
 * │ enquanto NENHUMA peca do Digai existir no disco, e vira `describe` de verdade sozinho no     │
 * │ minuto em que a primeira peca nascer. Nao ha interruptor para alguem esquecer de virar: a    │
 * │ suspensao e DERIVADA da ausencia medida (`pecasPresentes`, em digai.tester-fake.ts).         │
 * │                                                                                             │
 * │ A SENTINELA ABAIXO RODA SEMPRE, e e ela que impede este trabalho de dormir para sempre: no   │
 * │ dia em que a implementacao chegar, ela FICA VERMELHA dizendo o que fazer. `skip` puro        │
 * │ ninguem lembra de reativar, e cobertura esquecida e pior do que cobertura que nao existe,    │
 * │ porque parece que existe.                                                                   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
sentinelaDoDigai("digai.reengajar.tester.spec.ts");


/**
 * ─ O REENGAJAR: REENVIO DO LINK, DO NOSSO LADO, SEM ESCRITA NO TERCEIRO ─────────────────────────
 *
 * ESTE ARQUIVO E DO `tester`, escrito ANTES do codigo (secao A.38, secao A.40 regra 2).
 *
 * ┌─ A RAZAO DE O REENGAJAR SER O CAMINHO ESCOLHIDO, e ela e a REGRA ZERO do protocolo ─────────┐
 * │ "Se da para NAO escrever, nao escreve" (protocolo, secao 6). O link de triagem               │
 * │ (`webAccessLink` / `whatsappAccessLink`) e FIXO POR VAGA: reenvia-lo e acao NOSSA, com dado  │
 * │ que ja temos, e por isso NAO se abre caminho de escrita no Digai. Se um `POST` aparecer      │
 * │ neste modulo, a razao de o desenho ter sido aprovado deixou de valer.                         │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O CONTRATO DE CONSTRUCAO, dito aqui porque ele e PROPOSTA e nao leitura ───────────────────┐
 * │ `new DigaiReengajarService(deps)`, com `deps` = { db, cliente, envio, relogio }. Um objeto   │
 * │ de dependencias e nomeado e nao tem ordem para errar. Se a construcao preferir argumentos    │
 * │ posicionais, e AQUI que se ajusta, numa funcao so (`servico()`), e nao em oito testes.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */

const USUARIO_AUTORIZADO = { id: "user-1", email: "master@soulan.com.br", papel: "MASTER" as const };
const USUARIO_COMUM = { id: "user-2", email: "consultor@soulan.com.br", papel: "COMUM" as const };

/** Um candidato fingido, com PII sintetica, para provar que ela NAO aparece no rastro. */
const ALVO = {
  candidaturaId: "11111111-1111-4111-8111-111111111111",
  candidatoId: "22222222-2222-4222-8222-222222222222",
  vagaId: "33333333-3333-4333-8333-333333333333",
  nome: "Fulano De Teste",
  email: "fulano.teste@exemplo.invalido",
  telefone: "11900000001",
  cpf: CPF_SINTETICO.finalizou,
  linkDaVaga: "https://app.digai.ai/s/sc1",
};

const PII_DO_ALVO = [ALVO.nome, ALVO.email, ALVO.telefone, ALVO.cpf] as const;

/** Tudo o que o servico tocou numa passada: chamadas ao Digai, envios e escritas no banco. */
interface Bancada {
  chamadasAoDigai: Array<{ nome: string; args: unknown[] }>;
  envios: Array<Record<string, unknown>>;
  escritas: Array<Record<string, unknown>>;
  /** A ORDEM em que rastro e envio aconteceram, que e o que a regra da INT-4 cobra. */
  ordem: string[];
  servico: {
    reengajar(usuario: unknown, candidaturaId: string): Promise<unknown>;
    reengajarEmLote(usuario: unknown, corpo: unknown): Promise<unknown>;
  };
}

async function bancada(): Promise<Bancada> {
  const Servico = await exigirExport<new (deps: unknown) => Bancada["servico"]>(
    "reengajar",
    "DigaiReengajarService",
  );

  const chamadasAoDigai: Bancada["chamadasAoDigai"] = [];
  const envios: Bancada["envios"] = [];
  const escritas: Bancada["escritas"] = [];
  const ordem: string[] = [];

  /**
   * O CLIENTE E UM PROXY QUE ACEITA QUALQUER METODO, de proposito: um dublê que so tivesse `ler`
   * faria uma chamada de ESCRITA estourar com "nao e funcao", e o teste ficaria vermelho pelo
   * motivo errado, escondendo QUAL porta foi usada. Aqui tudo passa, e tudo fica anotado.
   */
  const cliente = new Proxy(
    {},
    {
      get:
        (_alvo, nome: string) =>
        (...args: unknown[]) => {
          chamadasAoDigai.push({ nome, args });
          return Promise.resolve({ ok: true });
        },
    },
  );

  const db = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        escritas.push(v);
        ordem.push("rastro");
        return { returning: async () => [{ id: "rastro-1" }], onConflictDoNothing: () => ({ returning: async () => [] }) };
      },
    }),
    /** A leitura devolve o alvo inteiro, COM PII: e a unica forma de provar que ela nao vaza. */
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [ALVO] }) }) }),
    execute: async () => [ALVO],
  };

  const servico = new Servico({
    db,
    cliente,
    envio: {
      enviarLink: async (p: Record<string, unknown>) => {
        envios.push(p);
        ordem.push("envio");
        return { ok: true };
      },
    },
    relogio: () => new Date("2026-09-17T12:00:00.000Z"),
  });

  return { chamadasAoDigai, envios, escritas, ordem, servico };
}

// ── 1. RBAC: a autoridade mora na ROTA, e ela e explicita ──────────────────

describeSuspenso("RBAC: quem nao tem o papel nao reengaja, nem sozinho nem em massa", () => {
  const ROTAS = ["reengajar", "reengajarEmLote"] as const;

  it("a controller do Digai existe", async () => {
    const mod = await exigirPeca("controller");
    expect(
      mod.DigaiController,
      "FALTA IMPLEMENTAR: `DigaiController`. Toda rota sensivel com guard (secao A.6).",
    ).toBeDefined();
  });

  for (const rota of ROTAS) {
    it(`a rota ${rota} declara @Roles explicitamente`, async () => {
      const mod = await exigirPeca("controller");
      const Controller = mod.DigaiController as { prototype: Record<string, object> };
      const handler = Controller.prototype?.[rota];
      expect(handler, `FALTA IMPLEMENTAR: o handler '${rota}' na controller.`).toBeDefined();

      const papeis = Reflect.getMetadata(ROLES_KEY, handler) as string[] | undefined;
      expect(
        papeis,
        "SEM `@Roles`, QUALQUER usuario autenticado passa (ver `auth/decorators.ts`). Reengajar dispara comunicacao a candidato REAL em nome da empresa: a autoridade tem de ser dita, nao presumida.",
      ).toBeDefined();
      expect(papeis?.length, "a lista de papeis nao pode ser vazia: lista vazia nao autoriza ninguem e nao barra ninguem.").toBeGreaterThan(0);
    });
  }

  it("o service tambem recusa quem nao tem papel, e nao confia so no guard", async () => {
    /**
     * Esconder a acao na tela e conveniencia; o guard e a autoridade. Mas o lote e disparado por um
     * caminho proprio, e esta casa ja viu o desvinculo em lote depender do service linha a linha
     * (`candidatos.controller.ts`). O service afirmar o papel de novo e barato e fecha o caminho
     * de quem chame o metodo de dentro do processo.
     */
    const b = await bancada();
    await expect(
      b.servico.reengajar(USUARIO_COMUM, ALVO.candidaturaId),
      "o service aceitou um papel sem autoridade.",
    ).rejects.toThrow();
    expect(b.envios, "recusado, nada pode ter sido enviado ao candidato.").toEqual([]);
  });
});

// ── 2. ZERO ESCRITA NO DIGAI ───────────────────────────────────────────────

describeSuspenso("o reengajar NAO escreve no Digai", () => {
  it("nenhum POST, PUT ou PATCH sai numa passada individual", async () => {
    const b = await bancada();
    await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);

    const escritas = b.chamadasAoDigai.filter(({ nome, args }) => {
      const texto = `${nome} ${JSON.stringify(args)}`.toUpperCase();
      return /\b(POST|PUT|PATCH|DELETE)\b/.test(texto) || /GRAVAR|ESCREVER|CRIAR|ATUALIZAR/.test(texto);
    });
    expect(
      escritas,
      "REGRA ZERO DO PROTOCOLO (secao 6): se da para NAO escrever, nao escreve. O link e FIXO POR VAGA e o envio e NOSSO. Escrever errado em producao de terceiro muda a vida de alguem e NAO TEM DESFAZER.",
    ).toEqual([]);
  });

  it("nenhum POST sai tampouco no lote", async () => {
    const b = await bancada();
    await b.servico.reengajarEmLote(USUARIO_AUTORIZADO, {
      candidaturaIds: [ALVO.candidaturaId],
      aceite: true,
    });
    const escritas = b.chamadasAoDigai.filter(({ nome, args }) =>
      /\b(POST|PUT|PATCH|DELETE)\b/.test(`${nome} ${JSON.stringify(args)}`.toUpperCase()),
    );
    expect(escritas, "o lote multiplica o dano pelo tamanho da selecao, de uma vez so.").toEqual([]);
  });

  it("o modulo inteiro nao tem porta de escrita, e quem afirma isso e a inspecao adversarial", async () => {
    const inspecionar = await exigirExport<(texto: string) => string[]>("grade", "inspecionarFonte");
    expect(
      inspecionar(fonteExigida()),
      "a inspecao (que o veto 3 obrigou a receber o TEXTO por parametro) acusou porta de rede ou de escrita fora do ponto unico.",
    ).toEqual([]);
  });
});

// ── 3. O ACEITE EXPLICITO SOBRE A LISTA ────────────────────────────────────

describeSuspenso("lote so dispara com aceite explicito sobre a lista", () => {
  async function corpo(valores: Record<string, unknown>) {
    const mod = await exigirPeca("dto");
    const Classe = mod.ReengajarEmLoteDto as { new (): object } | undefined;
    expect(
      Classe,
      "FALTA IMPLEMENTAR: `ReengajarEmLoteDto`. REGRA QUE VIVE APENAS NO NAVEGADOR NAO E REGRA: sem o aceite no corpo, qualquer chamada direta a rota dispara o lote inteiro sem ninguem ver a lista.",
    ).toBeDefined();
    return validateSync(plainToInstance(Classe as never, valores));
  }

  it("recusa o lote SEM aceite", async () => {
    expect(
      await corpo({ candidaturaIds: [ALVO.candidaturaId] }),
      "acao em massa mostra a lista do que vai fazer e EXIGE aceite explicito sobre AQUELA lista (protocolo, secao 6, item 4).",
    ).not.toEqual([]);
  });

  it("recusa o lote com aceite FALSO", async () => {
    expect(await corpo({ candidaturaIds: [ALVO.candidaturaId], aceite: false })).not.toEqual([]);
  });

  it("recusa lista vazia e lista acima do teto do Alto Volume", async () => {
    expect(await corpo({ candidaturaIds: [], aceite: true }), "lote vazio e erro de tela.").not.toEqual([]);
    const demais = Array.from({ length: AS_MAXIMO_POR_LOTE + 1 }, () => ALVO.candidaturaId);
    expect(
      await corpo({ candidaturaIds: demais, aceite: true }),
      "o teto e o mesmo do Alto Volume (`AS_MAXIMO_POR_LOTE`), lido da fonte unica e nunca redigitado, senao os dois tetos divergem em silencio.",
    ).not.toEqual([]);
  });

  it("aceita o lote com a lista e o aceite", async () => {
    expect(await corpo({ candidaturaIds: [ALVO.candidaturaId], aceite: true })).toEqual([]);
  });

  it("o service tambem recusa o lote sem aceite, e nao confia so no DTO", async () => {
    const b = await bancada();
    await expect(
      b.servico.reengajarEmLote(USUARIO_AUTORIZADO, { candidaturaIds: [ALVO.candidaturaId] }),
    ).rejects.toThrow();
    expect(b.envios, "sem aceite, nenhum candidato pode ter sido alcancado.").toEqual([]);
  });
});

// ── 4. RASTRO: quem, o que, quando. NUNCA o valor ──────────────────────────

describeSuspenso("ha rastro de quem reengajou, quando e qual o alvo tecnico", () => {
  it("o rastro grava autor, alvo tecnico, carimbo e resultado", async () => {
    const b = await bancada();
    await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);

    expect(
      b.escritas.length,
      "toda leitura e toda escrita de dado pessoal por integracao deixa registro (protocolo, secao 4). O rastro e permanente e consultavel: ele responde 'quem viu o que', que e a pergunta que a LGPD faz.",
    ).toBeGreaterThan(0);

    const rastro = b.escritas[b.escritas.length - 1];
    const chaves = Object.keys(rastro).join(" ").toLowerCase();
    for (const esperado of ["usuario", "candidatura", "resultado"]) {
      expect(
        chaves.includes(esperado),
        `o rastro nao tem como responder '${esperado}'. Campos gravados: ${Object.keys(rastro).join(", ")}.`,
      ).toBe(true);
    }
    expect(
      JSON.stringify(rastro).includes(USUARIO_AUTORIZADO.id),
      "sem o AUTOR, o rastro nao responde quem.",
    ).toBe(true);
  });

  it("o rastro NAO guarda o valor do dado pessoal", async () => {
    const b = await bancada();
    await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);
    expect(
      piiNaSaida(b.escritas, PII_DO_ALVO),
      "rastro que guarda o VALOR deixa de ser rastro e vira uma SEGUNDA COPIA do dado pessoal (protocolo, secao 4). O que se grava e o id tecnico.",
    ).toEqual([]);
  });

  it("o retorno da acao tambem nao devolve PII", async () => {
    const b = await bancada();
    const saida = await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);
    expect(
      piiNaSaida(saida, PII_DO_ALVO),
      "o retorno da rota nao carrega identificador direto (protocolo, secao 1).",
    ).toEqual([]);
  });
});

// ── 5. IDEMPOTENCIA: repetir nao duplica efeito ───────────────────────────

describeSuspenso("reengajar duas vezes nao duplica o efeito", () => {
  it("a segunda chamada imediata nao dispara um segundo envio", async () => {
    /**
     * ┌─ POR QUE A GUARDA E NOSSA ───────────────────────────────────────────────────────────────┐
     * │ O terceiro nao garante idempotencia nenhuma aqui, porque o envio nem passa por ele. Dois │
     * │ cliques no botao, ou uma retentativa de fila, viram DOIS convites para a mesma pessoa,   │
     * │ e a pessoa nao tem como saber qual e o certo. A ordem e a mesma da INT-4 (secao A.5):    │
     * │ GRAVAR antes de NOTIFICAR, senao uma falha vira duplicata na retentativa.                │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const b = await bancada();
    await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);
    await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);
    expect(
      b.envios.length,
      "repetir a mesma acao nao duplica efeito (protocolo, secao 6, item 5).",
    ).toBe(1);
  });

  it("o lote com o id repetido alcanca a pessoa UMA vez", async () => {
    const b = await bancada();
    await b.servico.reengajarEmLote(USUARIO_AUTORIZADO, {
      candidaturaIds: [ALVO.candidaturaId, ALVO.candidaturaId],
      aceite: true,
    });
    expect(b.envios.length, "id repetido dentro do mesmo lote e o caminho mais curto para a duplicata.").toBe(1);
  });

  it("grava o rastro ANTES de enviar, e nao depois", async () => {
    const b = await bancada();
    await b.servico.reengajar(USUARIO_AUTORIZADO, ALVO.candidaturaId);
    expect(
      b.ordem,
      "a ordem e GRAVAR o rastro e so entao ENVIAR. Notificar antes de gravar faz uma falha virar duplicata na retentativa, e foi assim que a INT-4 produziu envelope duplicado (secao A.5).",
    ).toEqual(["rastro", "envio"]);
  });
});
