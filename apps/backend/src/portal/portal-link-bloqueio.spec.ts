import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { cunharLink, estadoDaLinha, PORTAL_LINK_TTL_HORAS } from "../domain/portal-identidade";
import { estadoDoLinkNoPainel } from "../domain/portal-painel";
import { PORTAL_EVENTOS, PORTAL_MOTIVOS } from "../domain/portal-evento";
import { PortalCredencialService } from "./portal-credencial.service";
import { PortalDocumentosService } from "./portal-documentos.service";
import { PortalIdentidadeService } from "./portal-identidade.service";
import { PortalLinkVivoService } from "./portal-link-vivo.service";
import { PortalLinksController } from "./portal-links.controller";
import { COLUNAS_DO_LINK } from "./portal-link-colunas";
import { menuDaOperacao } from "../domain/menus";

/**
 * O BLOQUEIO MANUAL DO LINK: REVERSÍVEL, E VALENDO NAS CINCO LEITURAS DE "LINK VIVO".
 *
 * ┌─ O FURO QUE ESTE ARQUIVO EXISTE PARA FECHAR, e ele é silencioso por construção ─────────────┐
 * │ `estadoDaLinha` recebe a linha com todos os campos OPCIONAIS e compara com `!= null`, de     │
 * │ propósito (projeção que não pede `suspenso_ate` devolveria `undefined`, e a comparação        │
 * │ estrita fecharia o portal por um campo que ninguém pediu). O preço é o inverso: COLUNA NÃO   │
 * │ PROJETADA VIRA "SEM RESTRIÇÃO". Uma restrição nova esquecida em UMA das leituras deixa       │
 * │ aquela porta aberta e NADA falha: nem build, nem teste, nem produção, até a sessão viva de   │
 * │ alguém escrever no prontuário com o link bloqueado.                                           │
 * │                                                                                               │
 * │ Por isso aqui há UM TESTE POR PORTA, de comportamento, e não só a régua pura: identificação,  │
 * │ emissão de credencial, confirmação do envio, leitura da trilha e o painel do time.            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E a precedência, que é a segunda metade: DESBLOQUEAR ZERA SÓ O BLOQUEIO. Link revogado continua
 * revogado e link vencido continua vencido, senão o botão de reabrir vira porta de ressuscitar
 * link morto.
 *
 * §A.6: ids sintéticos, CPF de teste que não pertence a ninguém, nenhum dado real.
 */

const HORA = 3_600_000;
const AGORA = Date.now();

const SINTETICO = {
  admissaoId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  autorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  jti: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  credencialId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  cpf: "00000000191",
  dataNascimento: "1990-01-01",
  ip: "203.0.113.7",
};

/** A linha do link como ela sai das cinco projeções, já com a coluna nova. */
const linhaDoLink = (parcial: Record<string, unknown> = {}) => ({
  id: SINTETICO.jti,
  admissaoId: SINTETICO.admissaoId,
  criadoEm: new Date(AGORA - HORA),
  expiraEm: new Date(AGORA + 60 * HORA),
  revogadoEm: null,
  suspensoAte: null,
  bloqueadoEm: null,
  ...parcial,
});

const BLOQUEADA = () => linhaDoLink({ bloqueadoEm: new Date(AGORA - 1000) });

/** Cadeia do Drizzle de mentirinha: encadeável, awaitável, responde pela projeção pedida. */
type Cadeia = PromiseLike<unknown[]> & Record<string, unknown>;

const cadeia = (linhas: unknown[], aoChamar?: (args: unknown[]) => void): Cadeia =>
  new Proxy(
    {},
    {
      get(_alvo, prop) {
        if (prop === "then") {
          return (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
            Promise.resolve(linhas).then(ok, erro);
        }
        return (...args: unknown[]) => {
          aoChamar?.(args);
          return cadeia(linhas, aoChamar);
        };
      },
    },
  ) as unknown as Cadeia;

// ══ A RÉGUA PURA, QUE É O QUE AS CINCO PORTAS CHAMAM ═════════════════════════════════════════

describe("a régua: bloqueio manual mata o link, e some quando é desfeito", () => {
  it("link bloqueado NÃO está vivo, mesmo com o prazo inteiro pela frente", () => {
    const e = estadoDaLinha(BLOQUEADA(), AGORA);
    expect(e.vivo).toBe(false);
    expect(e.bloqueado).toBe(true);
    expect(e.motivoCodigo).toBe("LINK_BLOQUEADO");
  });

  it("sem bloqueio, o mesmo link está vivo: o bloqueio é a ÚNICA diferença", () => {
    expect(estadoDaLinha(linhaDoLink(), AGORA).vivo).toBe(true);
  });

  /**
   * A CONTRAPARTIDA DO `!= null`, provada de propósito: projeção que NÃO trouxe a coluna devolve
   * "sem restrição". É exatamente por isso que a projeção é uma constante só, e é isto que o teste
   * estrutural do fim deste arquivo trava.
   */
  it("coluna AUSENTE da projeção vira `undefined` e NÃO bloqueia: o risco é real", () => {
    const semAColuna = { expiraEm: new Date(AGORA + HORA), revogadoEm: null, suspensoAte: null };
    expect(estadoDaLinha(semAColuna, AGORA).vivo).toBe(true);
  });

  it("carimbo no FUTURO ainda não bloqueia: o bloqueio vale do instante em que foi gravado", () => {
    expect(estadoDaLinha(linhaDoLink({ bloqueadoEm: new Date(AGORA + HORA) }), AGORA).vivo).toBe(true);
  });
});

describe("a precedência no painel: REVOGADO > BLOQUEADO > SUSPENSO > VENCIDO > VIVO", () => {
  it("bloqueado aparece como BLOQUEADO, e não como vencido", () => {
    expect(estadoDoLinkNoPainel(BLOQUEADA(), AGORA)).toBe("BLOQUEADO");
  });

  /**
   * REVOGADO VENCE O BLOQUEIO porque a ação é outra: revogado não volta (emita outro link);
   * bloqueado volta por botão. Mostrar "bloqueado" para um link revogado faria o consultor clicar
   * em desbloquear e não entender por que o candidato continua sem entrar.
   */
  it("revogado vence o bloqueio", () => {
    const linha = linhaDoLink({ revogadoEm: new Date(AGORA - 1), bloqueadoEm: new Date(AGORA - 1) });
    expect(estadoDoLinkNoPainel(linha, AGORA)).toBe("REVOGADO");
  });

  it("bloqueado vence suspenso: um acaba por decisão, o outro passa sozinho", () => {
    const linha = linhaDoLink({
      bloqueadoEm: new Date(AGORA - 1),
      suspensoAte: new Date(AGORA + HORA),
    });
    expect(estadoDoLinkNoPainel(linha, AGORA)).toBe("BLOQUEADO");
  });

  it("bloqueado vence vencido, pelo mesmo motivo", () => {
    const linha = linhaDoLink({ expiraEm: new Date(AGORA - 1), bloqueadoEm: new Date(AGORA - 1) });
    expect(estadoDoLinkNoPainel(linha, AGORA)).toBe("BLOQUEADO");
  });

  /**
   * DESBLOQUEAR ZERA SÓ O BLOQUEIO, e estes dois testes são a prova de que ele não ressuscita nada:
   * a linha desbloqueada é a MESMA, com `bloqueado_em` nulo, e o estado continua o que era.
   */
  it("desbloquear um link REVOGADO o deixa REVOGADO, nunca vivo", () => {
    const depois = linhaDoLink({ revogadoEm: new Date(AGORA - 1), bloqueadoEm: null });
    expect(estadoDoLinkNoPainel(depois, AGORA)).toBe("REVOGADO");
    expect(estadoDaLinha(depois, AGORA).vivo).toBe(false);
  });

  it("desbloquear um link VENCIDO o deixa VENCIDO, nunca vivo", () => {
    const depois = linhaDoLink({ expiraEm: new Date(AGORA - 1), bloqueadoEm: null });
    expect(estadoDoLinkNoPainel(depois, AGORA)).toBe("VENCIDO");
    expect(estadoDaLinha(depois, AGORA).vivo).toBe(false);
  });
});

// ══ PORTA 1: A IDENTIFICAÇÃO DO CANDIDATO ════════════════════════════════════════════════════

function parDeChaves() {
  const { privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKey,
    b64: Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }).toString()).toString(
      "base64",
    ),
  };
}

const NOSSO = parDeChaves();

const tokenDoLink = (chave: KeyObject) =>
  cunharLink(
    {
      admissaoId: SINTETICO.admissaoId,
      jti: SINTETICO.jti,
      agoraMs: Date.now(),
      ttlHoras: PORTAL_LINK_TTL_HORAS,
    },
    chave,
  );

function bancoDaIdentidade(link: Record<string, unknown> | null) {
  const linhasPara = (proj?: Record<string, unknown>) => {
    const chaves = Object.keys(proj ?? {}).join(",").toLowerCase();
    if (chaves.includes("suspensoate")) return link ? [link] : [];
    if (chaves.includes("datanascimento")) {
      return [{ cpf: SINTETICO.cpf, dataNascimento: SINTETICO.dataNascimento }];
    }
    return [{ id: SINTETICO.admissaoId }];
  };
  const db: Record<string, unknown> = {
    select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)),
    update: () => cadeia([{ id: SINTETICO.jti }]),
    insert: () => cadeia([{ id: SINTETICO.jti }]),
    execute: async () => [],
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);
  return db as never;
}

function servicoDaIdentidade(link: Record<string, unknown> | null) {
  const registrar = vi.fn(async (..._args: unknown[]) => {});
  const config = {
    get: (chave: string) => {
      if (/PRIVATE_KEY/.test(chave)) return NOSSO.b64;
      if (chave === "PORTAL_LOG_PEPPER") return "pepper-sintetico";
      return undefined;
    },
  } as never;
  const limitador = {
    increment: async (_c: string, ttl: number, _l: number, bloqueio: number) => ({
      totalHits: 1,
      timeToExpire: ttl,
      isBlocked: false,
      timeToBlockExpire: bloqueio,
    }),
  } as never;
  const trilha = { configurada: () => true, registrar } as never;
  return {
    alvo: new PortalIdentidadeService(bancoDaIdentidade(link), config, trilha, limitador),
    registrar,
  };
}

describe("PORTA 1 (identificação): link bloqueado não abre sessão", () => {
  const pedido = () => ({
    linkToken: tokenDoLink(NOSSO.privateKey),
    cpf: SINTETICO.cpf,
    dataNascimento: SINTETICO.dataNascimento,
    ip: SINTETICO.ip,
  });

  it("com a linha VIVA, o CPF certo entra: é o caso de todo dia, e ele continua de pé", async () => {
    const { alvo } = servicoDaIdentidade(linhaDoLink());
    await expect(alvo.identificar(pedido())).resolves.toBeTruthy();
  });

  it("com a linha BLOQUEADA, o MESMO pedido é recusado", async () => {
    const { alvo, registrar } = servicoDaIdentidade(BLOQUEADA());
    await expect(alvo.identificar(pedido())).rejects.toThrow();
    // A trilha diz POR QUE recusou, e o código é o de catálogo: sem ele, a Sala De Segurança
    // receberia uma recusa sem motivo, que é a cicatriz do `TENTATIVAS_ESGOTADAS`.
    const motivos = registrar.mock.calls.map(
      (c) => (c[1] as { motivoCodigo?: string } | undefined)?.motivoCodigo,
    );
    expect(motivos).toContain("LINK_BLOQUEADO");
  });
});

// ══ PORTA 2 e 3: A EMISSÃO DA CREDENCIAL E A CONFIRMAÇÃO DO ENVIO ════════════════════════════

function servicoDaCredencial(link: Record<string, unknown> | null, registro: { inseriu: boolean }) {
  const registrar = vi.fn(async (..._args: unknown[]) => {});
  const db: Record<string, unknown> = {
    select: () => cadeia(link ? [link] : []),
    insert: () => {
      registro.inseriu = true;
      return cadeia([{ id: SINTETICO.credencialId }]);
    },
    update: () => cadeia([{ id: SINTETICO.credencialId }]),
    execute: async () => [],
    query: {
      tiposDocumento: { findFirst: async () => ({ id: "tipo-1", codigo: "CPF", ativo: true }) },
      documentosAdmissao: { findFirst: async () => ({ id: "doc-1" }) },
      portalCredenciais: {
        findFirst: async () => ({
          id: SINTETICO.credencialId,
          admissaoId: SINTETICO.admissaoId,
          jtiLink: SINTETICO.jti,
          confirmadoEm: null,
        }),
      },
    },
  };
  db.transaction = async (cb: (tx: unknown) => Promise<unknown>) => cb(db);

  const config = { get: () => "pepper-sintetico" } as never;
  const armazenamento = { podeEmitir: () => true, assinarEscrita: async () => null } as never;
  const leitor = { configurado: () => true } as never;
  const trilha = { configurada: () => true, registrar } as never;
  return {
    alvo: new PortalCredencialService(db as never, config, armazenamento, leitor, trilha),
    registrar,
  };
}

describe("PORTA 2 (emissão de credencial): link bloqueado não fabrica URL de escrita", () => {
  it("a emissão é recusada ANTES de qualquer gravação", async () => {
    const registro = { inseriu: false };
    const { alvo, registrar } = servicoDaCredencial(BLOQUEADA(), registro);
    await expect(
      alvo.emitir({
        admissaoId: SINTETICO.admissaoId,
        jtiLink: SINTETICO.jti,
        codigoTipoDocumento: "CPF",
        contentType: "application/pdf",
        bytes: 1000,
        ip: SINTETICO.ip,
      }),
    ).rejects.toThrow();
    // A COTA NÃO É DEBITADA e nenhuma linha nasce: o link morto para antes do teto, de propósito.
    expect(registro.inseriu, "gravou credencial com o link bloqueado").toBe(false);
    expect(registrar.mock.calls.map((c) => c[0])).toContain("PORTAL_CREDENCIAL_RECUSADA");
  });
});

describe("PORTA 3 (confirmação do envio): link bloqueado não vira documento", () => {
  /**
   * ESTA É A PORTA QUE IMPORTA PARA O LIMITE DECLARADO. A credencial JÁ EMITIDA é uma URL
   * pré-assinada do armazenamento do Google, e o navegador fala direto com o balde: bloquear não
   * impede o objeto de aterrissar. O que ele impede é a CONFIRMAÇÃO, ou seja, o objeto não vira
   * documento, não é lido pela IA e não muda o prontuário.
   */
  it("a confirmação é recusada com a mesma frase do envio inexistente", async () => {
    const registro = { inseriu: false };
    const { alvo } = servicoDaCredencial(BLOQUEADA(), registro);
    await expect(
      alvo.confirmar({
        admissaoId: SINTETICO.admissaoId,
        jtiLink: SINTETICO.jti,
        credencialId: SINTETICO.credencialId,
        avisoDoNavegador: false,
        ip: SINTETICO.ip,
      }),
    ).rejects.toThrow("Envio não encontrado.");
  });
});

/**
 * ══ AS QUATRO PORTAS DIZEM A MESMA COISA SOBRE O MESMO LINK (achado S33) ═════════════════════
 *
 * ┌─ O DEFEITO, e ele é a metade que o S28 não fechou ──────────────────────────────────────────┐
 * │ O S28 consertou as portas do `PortalLinkVivoService` (leitura da trilha e VT), que passaram  │
 * │ a gravar o estado REAL. As duas do `PortalCredencialService` continuaram gravando `EXPIRADA` │
 * │ FIXO, porque `linkVivo()` calculava `estadoDaLinha` e ficava só com o `.vivo`, jogando o     │
 * │ motivo fora. Sobre O MESMO link bloqueado, duas portas escreviam `LINK_BLOQUEADO` e duas     │
 * │ escreviam `EXPIRADA`: a Sala De Segurança lia duas histórias conforme quem recusou.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E A OUTRA METADE, que é o que impede o conserto de virar oráculo: o que o CANDIDATO ouve NÃO
 * muda em nenhum dos quatro estados. Fidelidade para dentro, indistinção para fora.
 */
describe("O MOTIVO DA TRILHA É O REAL NAS QUATRO PORTAS, e não um `EXPIRADA` fixo", () => {
  const MORTOS: Array<[string, Record<string, unknown> | null, string]> = [
    ["revogado", linhaDoLink({ revogadoEm: new Date(AGORA - 1000) }), "REVOGADO_MANUAL"],
    ["bloqueado à mão", BLOQUEADA(), "LINK_BLOQUEADO"],
    ["suspenso pelo teto", linhaDoLink({ suspensoAte: new Date(AGORA + HORA) }), "SUSPENSO"],
    ["vencido", linhaDoLink({ expiraEm: new Date(AGORA - 1000) }), "EXPIRADA"],
    // Linha que sumiu é revogação, e não um quinto código: quem assina bilhete somos nós.
    ["apagado da tabela", null, "REVOGADO_MANUAL"],
  ];

  const pedidoDeEmissao = {
    admissaoId: SINTETICO.admissaoId,
    jtiLink: SINTETICO.jti,
    codigoTipoDocumento: "CPF",
    contentType: "application/pdf",
    bytes: 1000,
    ip: SINTETICO.ip,
  };

  const pedidoDeConfirmacao = {
    admissaoId: SINTETICO.admissaoId,
    jtiLink: SINTETICO.jti,
    credencialId: SINTETICO.credencialId,
    avisoDoNavegador: false,
    ip: SINTETICO.ip,
  };

  const motivosGravados = (registrar: ReturnType<typeof vi.fn>) =>
    registrar.mock.calls.map((c) => (c[1] as { motivoCodigo?: string } | undefined)?.motivoCodigo);

  for (const [rotulo, link, motivo] of MORTOS) {
    it(`PORTA 2 (emissão), link ${rotulo}: a trilha grava ${motivo}`, async () => {
      const { alvo, registrar } = servicoDaCredencial(link, { inseriu: false });

      await expect(alvo.emitir(pedidoDeEmissao)).rejects.toThrow();

      expect(motivosGravados(registrar)).toContain(motivo);
      // E o `regra` do evento de limite acompanha, senão o MESMO ato ficaria descrito de dois
      // jeitos em duas linhas vizinhas do log.
      const regras = registrar.mock.calls.map((c) => (c[1] as { regra?: string } | undefined)?.regra);
      expect(regras).toContain(motivo);
    });

    it(`PORTA 3 (confirmação), link ${rotulo}: a trilha grava ${motivo}`, async () => {
      const { alvo, registrar } = servicoDaCredencial(link, { inseriu: false });

      await expect(alvo.confirmar(pedidoDeConfirmacao)).rejects.toThrow();

      expect(motivosGravados(registrar)).toContain(motivo);
    });
  }

  it("o CANDIDATO continua ouvindo a MESMA coisa nos quatro estados (sem oráculo novo)", async () => {
    const daEmissao: string[] = [];
    const daConfirmacao: string[] = [];

    for (const [, link] of MORTOS) {
      const emissao = servicoDaCredencial(link, { inseriu: false });
      daEmissao.push(
        await emissao.alvo
          .emitir(pedidoDeEmissao)
          .then(() => "NAO RECUSOU")
          .catch((e: Error) => e.message),
      );
      const confirmacao = servicoDaCredencial(link, { inseriu: false });
      // A confirmação RESOLVE no caminho feliz, então a mensagem só existe no `catch`. Um
      // desfecho sem erro aqui seria link morto deixando o envio virar documento, e o rótulo
      // abaixo faz essa falha aparecer como texto no lugar de sumir num `undefined`.
      daConfirmacao.push(
        await confirmacao.alvo
          .confirmar(pedidoDeConfirmacao)
          .then(() => "NAO RECUSOU")
          .catch((e: Error) => e.message),
      );
    }

    expect(new Set(daEmissao).size).toBe(1);
    expect(new Set(daConfirmacao).size).toBe(1);
    // A frase da emissão é a do link que não vale mais; a da confirmação é a do envio
    // inexistente, exatamente como antes do conserto.
    expect(daEmissao[0]).toContain("Procure o RH");
    expect(daConfirmacao[0]).toBe("Envio não encontrado.");
  });

  it("a trava estrutural: nenhuma das duas portas escreve o motivo à mão", () => {
    const fonte = readFileSync(join(__dirname, "portal-credencial.service.ts"), "utf8");
    // O que existe é UMA leitura que devolve o motivo do domínio, e duas portas que o repassam.
    expect(fonte).toContain("return estadoDaLinha(linha, Date.now()).motivoCodigo;");
    expect(fonte).toContain("motivoCodigo: motivoRegistrado");
    expect(fonte).toContain("motivoCodigo: linkMorto");
    // A ÚNICA `EXPIRADA` literal que sobra é a do CANDIDATO (a que escolhe a frase e o 400), e
    // ela nunca chega a um `registrar`: a linha de trilha com o literal era esta, e morreu.
    expect(fonte).not.toContain('{ jtiLink: entrada.jtiLink, motivoCodigo: "EXPIRADA" }');
    expect(fonte.match(/motivoCodigo: "EXPIRADA"/g) ?? []).toHaveLength(1);
  });
});

// ══ PORTA 4: A LEITURA DA TRILHA DO CANDIDATO ════════════════════════════════════════════════

describe("PORTA 4 (leitura da trilha): link bloqueado não lista documento nenhum", () => {
  const servicoDosDocumentos = (link: Record<string, unknown>) => {
    const linhasPara = (proj?: Record<string, unknown>) => {
      const chaves = Object.keys(proj ?? {}).join(",").toLowerCase();
      if (chaves.includes("suspensoate")) return [link];
      if (chaves.includes("primeironome")) {
        return [
          {
            primeiroNome: "Sintético",
            cargo: "Auxiliar",
            cliente: "Operação Sintética",
            codCliente: "CLI-1",
            cargoId: "cargo-1",
          },
        ];
      }
      return [];
    };
    const db = { select: (proj?: Record<string, unknown>) => cadeia(linhasPara(proj)) } as never;
    const credenciais = {
      situacoesParaATela: async () => new Map(),
      situacaoDe: () => ({ teto: 3, usadas: 0, restantes: 3, noTime: false, aviso: null }),
    } as never;
    const registrar = vi.fn(async (..._args: unknown[]) => {});
    return {
      // A PORTA 4 CONTINUA SENDO A MESMA PORTA, e o que mudou é por onde ela pergunta: a leitura do
      // link saiu do serviço da trilha e virou `PortalLinkVivoService` (consolidação, 21/09/2026).
      // Montado o REAL aqui, com o mesmo banco falso, este teste de comportamento segue provando o
      // caminho inteiro, e não um dublê.
      alvo: (() => {
        const log = { registrar, configurada: () => true } as never;
        return new PortalDocumentosService(
          db,
          credenciais,
          log,
          new PortalLinkVivoService(db, log),
        );
      })(),
      registrar,
    };
  };

  it("com a linha VIVA a trilha abre, e com a BLOQUEADA ela recusa", async () => {
    const viva = servicoDosDocumentos(linhaDoLink());
    await expect(
      viva.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jti, ip: SINTETICO.ip }),
    ).resolves.toBeTruthy();

    const bloqueada = servicoDosDocumentos(BLOQUEADA());
    await expect(
      bloqueada.alvo.trilha(SINTETICO.admissaoId, { jtiLink: SINTETICO.jti, ip: SINTETICO.ip }),
    ).rejects.toThrow();
  });
});

// ══ PORTA 5: O PAINEL DO TIME ════════════════════════════════════════════════════════════════
//
// A quinta leitura não é uma porta do candidato: é a tela do consultor, e o que ela precisa é
// MOSTRAR o estado certo. Um painel que dissesse "vivo" sobre um link bloqueado faria o time
// procurar defeito em outro lugar. A prova ponta a ponta do painel vive em `portal-painel.spec.ts`
// (o serviço traduz a linha em `estadoLink`), e aqui fica a régua que ele consome.

describe("PORTA 5 (painel): o estado exposto é o BLOQUEADO, sem data e sem autor", () => {
  it("a coluna mostra BLOQUEADO, e nada além do estado atravessa", () => {
    const estado = estadoDoLinkNoPainel(BLOQUEADA(), AGORA);
    expect(estado).toBe("BLOQUEADO");
    // §A.6: o painel devolve o ESTADO, nunca o carimbo nem quem bloqueou. Quem precisa do "quem e
    // quando" é a Sala De Segurança, que lê a trilha, e não a tela operacional.
    expect(typeof estado).toBe("string");
  });
});

// ══ A PROJEÇÃO ÚNICA, QUE É O QUE IMPEDE A SEXTA PORTA DE NASCER ERRADA ══════════════════════

describe("as cinco leituras projetam a MESMA constante", () => {
  const fonte = (arquivo: string) => readFileSync(join(__dirname, arquivo), "utf8");

  it("a constante traz as QUATRO colunas que decidem o estado", () => {
    expect(Object.keys(COLUNAS_DO_LINK).sort()).toEqual([
      "bloqueadoEm",
      "expiraEm",
      "revogadoEm",
      "suspensoAte",
    ]);
  });

  /**
   * ══ A LINHA DA TRILHA MUDOU DE ARQUIVO, NÃO SAIU DA LISTA (consolidação, 21/09/2026) ═════════
   *
   * A leitura da trilha NÃO projeta mais `COLUNAS_DO_LINK` por conta própria, porque ela não lê
   * mais `portal_links`: ela pergunta a `PortalLinkVivoService`, que é onde a projeção passou a
   * ser espalhada. A afirmação é a MESMA (a porta da trilha usa a constante única, e não uma lista
   * de colunas escrita à mão), feita no arquivo que hoje faz a leitura.
   *
   * O par negativo, que o serviço da trilha não voltou a ter leitura própria, vive em
   * `portal-documentos.spec.ts`, ao lado do teste de comportamento daquela porta.
   */
  it.each([
    ["portal-identidade.service.ts", "identificação"],
    ["portal-credencial.service.ts", "emissão e confirmação"],
    ["portal-link-vivo.service.ts", "leitura da trilha e a ponte do VT"],
    ["portal-painel.service.ts", "painel"],
  ])("`%s` (%s) espalha `COLUNAS_DO_LINK` em vez de listar coluna a coluna", (arquivo) => {
    const codigo = fonte(arquivo);
    expect(codigo).toContain("...COLUNAS_DO_LINK");
    // E NENHUMA delas volta a listar `suspensoAte` à mão numa projeção: é assim que a coluna nova
    // deixa de ser esquecida, e é por isso que a asserção é pela AUSÊNCIA.
    expect(codigo).not.toMatch(/suspensoAte: portalLinks\.suspensoAte/);
  });
});

// ══ A TRILHA E O MENU ════════════════════════════════════════════════════════════════════════

describe("o catálogo fechado da trilha conhece o bloqueio", () => {
  it("os dois eventos existem: sem eles, `montarEventoPortal` descarta o registro", () => {
    expect(PORTAL_EVENTOS).toContain("PORTAL_LINK_BLOQUEADO");
    expect(PORTAL_EVENTOS).toContain("PORTAL_LINK_DESBLOQUEADO");
  });

  it("o motivo existe: sem ele, a recusa chega dizendo que recusou sem dizer por quê", () => {
    expect(PORTAL_MOTIVOS).toContain("LINK_BLOQUEADO");
  });
});

describe("RBAC: as duas rotas nascem reivindicadas pelo menu que já existe", () => {
  const HANDLERS = Object.getOwnPropertyNames(PortalLinksController.prototype).filter(
    (n) => n !== "constructor",
  );

  it("bloquear e desbloquear são handlers de `PortalLinksController`", () => {
    /*
     * A LISTA É EXAUSTIVA DE PROPÓSITO, e ela ENCOLHEU: os handlers do ENVIO chegaram a nascer
     * nesta classe, para herdar o coringa do menu, e saíram para o `PortalEnvioController` quando
     * a auditoria mediu o preço do prefixo. Esta classe mora sob `portal/`, que é o que a barreira
     * do Fernando allowlista para a internet, e rota que EMITE E ENTREGA credencial por e-mail não
     * pode morar ali. Lá a operação é reivindicada por NOME no mesmo menu `portal-links`, que é o
     * que a exigência S12 admite, então nada ficou aberto na troca.
     *
     * MANTER A LISTA EXAUSTIVA É O PONTO: handler novo nesta classe obriga alguém a vir aqui e
     * decidir conscientemente que ele pertence ao menu do Portal, que é exatamente a conferência
     * que este teste existe para forçar.
     */
    expect(HANDLERS.sort()).toEqual(["bloquear", "desbloquear", "emitir", "revogar"]);
  });

  /**
   * O CORINGA `PortalLinksController.*` NÃO ALCANÇARIA CLASSE NOVA: o índice do `MenuGuard` é por
   * `Controller.handler`, e operação que nenhum menu reivindica passa LIVRE. Nascendo aqui, as duas
   * já nascem governadas pelo mesmo menu de quem emite o link.
   */
  it.each(["bloquear", "desbloquear"])("`%s` é reivindicada por menu", (handler) => {
    expect(menuDaOperacao("PortalLinksController", handler)).toBe(
      menuDaOperacao("PortalLinksController", "emitir"),
    );
  });

  it("as duas exigem o AUTOR, que é requisito da trilha", () => {
    const codigo = readFileSync(join(__dirname, "portal-links.controller.ts"), "utf8");
    for (const handler of ["bloquear", "desbloquear"]) {
      const inicio = codigo.indexOf(`  ${handler}(`);
      expect(inicio, `handler ${handler} não encontrado`).toBeGreaterThan(0);
      expect(codigo.slice(inicio, inicio + 220)).toContain("@CurrentUser()");
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A IDEMPOTÊNCIA REAL DO BLOQUEIO/DESBLOQUEIO, CONTRA O SERVIÇO, COM UM BANCO QUE APLICA
//
// ┌─ POR QUE ISTO PRECISOU DE UM DUBLÊ NOVO (achado da 5ª auditoria) ────────────────────────────┐
// │ Os bancos falsos de cima devolvem SEMPRE uma linha no `update ... returning`, então a         │
// │ idempotência de produção (`where isNull(bloqueadoEm) ... returning` que volta VAZIO quando o  │
// │ carimbo já existe) era inverificável: re-bloquear e re-desbloquear "passavam" no dublê sem    │
// │ que ninguém pudesse perguntar se o carimbo se moveu ou se a trilha registrou de novo.         │
// │                                                                                               │
// │ `bancoDoLink` guarda UMA linha mutável e faz o `returning` refletir o `where`: aplica o `set` │
// │ só quando a guarda de nulidade casa (a MESMA que a cláusula do serviço exige), e devolve ZERO │
// │ linha quando não casa. Só assim a pergunta "o estado escrito muda a decisão seguinte?" existe.│
// └───────────────────────────────────────────────────────────────────────────────────────────────┘

/** Toda string alcançável a partir do argumento do `where`, para achar o `jti` e a direção da guarda. */
function stringsDe(valor: unknown, destino: string[] = [], vistos = new WeakSet<object>(), prof = 0): string[] {
  if (prof > 16 || valor == null || destino.length > 5000) return destino;
  if (typeof valor === "string") {
    destino.push(valor);
    return destino;
  }
  if (typeof valor !== "object") return destino;
  if (vistos.has(valor as object)) return destino;
  vistos.add(valor as object);
  for (const v of Object.values(valor as Record<string, unknown>)) stringsDe(v, destino, vistos, prof + 1);
  return destino;
}

type LinhaDoLink = {
  id: string;
  bloqueadoEm: Date | null;
  bloqueadoPorId: string | null;
  revogadoEm: Date | null;
  revogadoPorId: string | null;
  expiraEm: Date;
  suspensoAte: Date | null;
};

/**
 * O BANCO QUE APLICA. Uma linha só, mutável. `update().set().where().returning()` só carimba
 * quando a guarda de nulidade da própria cláusula casa com o estado ATUAL da linha, e o
 * `returning` devolve exatamente o que a cláusula casaria: a linha quando aplicou, nada quando não.
 *
 * A guarda é inferida do `set`, que é o que distingue as três operações de produção sobre esta
 * linha, todas com `where ... is [not] null` sobre a MESMA coluna que o `set` toca:
 *  - `bloqueadoEm` vira Date  = BLOQUEAR   (produção: `where isNull(bloqueadoEm)`);
 *  - `bloqueadoEm` vira null  = DESBLOQUEAR (produção: `where isNotNull(bloqueadoEm)`);
 *  - `revogadoEm`  vira Date  = REVOGAR    (produção: `where isNull(revogadoEm)`).
 * O `id` do `where` tem de casar com o da linha, senão nada é tocado (o `returning` vem vazio).
 */
function bancoDoLink(inicial: Partial<LinhaDoLink> = {}) {
  const linha: LinhaDoLink = {
    id: SINTETICO.jti,
    bloqueadoEm: null,
    bloqueadoPorId: null,
    revogadoEm: null,
    revogadoPorId: null,
    expiraEm: new Date(AGORA + 60 * HORA),
    suspensoAte: null,
    ...inicial,
  };

  const update = () => {
    let valores: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      set: (v: Record<string, unknown>) => {
        valores = v;
        return builder;
      },
      where: (...cond: unknown[]) => {
        (builder as { _where?: string[] })._where = stringsDe(cond);
        return builder;
      },
      returning: async () => {
        const onde = (builder as { _where?: string[] })._where ?? [];
        const casaId = onde.includes(linha.id);
        if (!casaId) return [];

        // A guarda de nulidade, pela coluna que o `set` toca, exatamente como o `where` de produção.
        let guardaCasa = false;
        if ("bloqueadoEm" in valores) {
          guardaCasa = valores.bloqueadoEm == null ? linha.bloqueadoEm != null : linha.bloqueadoEm == null;
        } else if ("revogadoEm" in valores) {
          guardaCasa = linha.revogadoEm == null;
        }
        if (!guardaCasa) return [];

        Object.assign(linha, valores);
        return [{ id: linha.id }];
      },
    };
    return builder;
  };

  const db = { update } as never;
  return { db, linha };
}

function servicoDoBloqueio(inicial: Partial<LinhaDoLink> = {}) {
  const registrar = vi.fn(async (..._args: unknown[]) => {});
  const trilha = { configurada: () => true, registrar } as never;
  const banco = bancoDoLink(inicial);
  const alvo = new PortalIdentidadeService(banco.db, {} as never, trilha, {} as never);
  return { alvo, linha: banco.linha, registrar };
}

const eventosRegistrados = (registrar: ReturnType<typeof vi.fn>) =>
  registrar.mock.calls.map((c) => c[0] as string);

describe("BLOQUEIO idempotente: re-bloquear é NO-OP, não move o carimbo nem re-loga", () => {
  it("bloquear um link livre carimba uma vez e registra o evento uma vez", async () => {
    const { alvo, linha, registrar } = servicoDoBloqueio();

    const r = await alvo.bloquearLinkManualmente(SINTETICO.jti, SINTETICO.autorId);

    expect(r.bloqueado).toBe(true);
    expect(linha.bloqueadoEm).toBeInstanceOf(Date);
    expect(linha.bloqueadoPorId).toBe(SINTETICO.autorId);
    expect(eventosRegistrados(registrar).filter((e) => e === "PORTAL_LINK_BLOQUEADO")).toHaveLength(1);
  });

  it("re-bloquear um link JÁ bloqueado NÃO sobrescreve `bloqueado_em`, NÃO troca o autor e NÃO re-loga", async () => {
    const instanteOriginal = new Date(AGORA - 5 * HORA);
    const autorOriginal = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const { alvo, linha, registrar } = servicoDoBloqueio({
      bloqueadoEm: instanteOriginal,
      bloqueadoPorId: autorOriginal,
    });

    const r = await alvo.bloquearLinkManualmente(SINTETICO.jti, SINTETICO.autorId);

    expect(r.bloqueado).toBe(false);
    // O rastro guardado é o do PRIMEIRO bloqueio: instante e autor originais, intocados.
    expect(linha.bloqueadoEm).toBe(instanteOriginal);
    expect(linha.bloqueadoPorId).toBe(autorOriginal);
    expect(eventosRegistrados(registrar)).not.toContain("PORTAL_LINK_BLOQUEADO");
  });
});

describe("DESBLOQUEIO idempotente: nunca-bloqueado e duplo-desbloqueio não emitem evento espúrio", () => {
  it("desbloquear um link que NUNCA foi bloqueado é NO-OP e não emite `PORTAL_LINK_DESBLOQUEADO`", async () => {
    const { alvo, linha, registrar } = servicoDoBloqueio({ bloqueadoEm: null });

    const r = await alvo.desbloquearLink(SINTETICO.jti, SINTETICO.autorId);

    expect(r.desbloqueado).toBe(false);
    expect(linha.bloqueadoEm).toBeNull();
    expect(eventosRegistrados(registrar)).not.toContain("PORTAL_LINK_DESBLOQUEADO");
  });

  it("o SEGUNDO desbloqueio seguido não re-loga: o primeiro desfez, o segundo não tem o que desfazer", async () => {
    const { alvo, linha, registrar } = servicoDoBloqueio({
      bloqueadoEm: new Date(AGORA - 2 * HORA),
      bloqueadoPorId: SINTETICO.autorId,
    });

    const primeiro = await alvo.desbloquearLink(SINTETICO.jti, SINTETICO.autorId);
    const segundo = await alvo.desbloquearLink(SINTETICO.jti, SINTETICO.autorId);

    expect(primeiro.desbloqueado).toBe(true);
    expect(segundo.desbloqueado).toBe(false);
    expect(linha.bloqueadoEm).toBeNull();
    expect(eventosRegistrados(registrar).filter((e) => e === "PORTAL_LINK_DESBLOQUEADO")).toHaveLength(1);
  });
});

describe("DESBLOQUEIO não ressuscita link morto: zera só o bloqueio", () => {
  it("desbloquear um link REVOGADO limpa o bloqueio mas preserva a revogação, e ele segue morto", async () => {
    const revogadoEm = new Date(AGORA - 3 * HORA);
    const { alvo, linha } = servicoDoBloqueio({
      revogadoEm,
      revogadoPorId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      bloqueadoEm: new Date(AGORA - HORA),
      bloqueadoPorId: SINTETICO.autorId,
    });

    const r = await alvo.desbloquearLink(SINTETICO.jti, SINTETICO.autorId);

    expect(r.desbloqueado).toBe(true);
    expect(linha.bloqueadoEm).toBeNull();
    // A revogação NÃO foi tocada: o botão de reabrir não é porta de ressuscitar link morto.
    expect(linha.revogadoEm).toBe(revogadoEm);
    expect(estadoDaLinha(linha, AGORA).vivo).toBe(false);
    expect(estadoDoLinkNoPainel(linha, AGORA)).toBe("REVOGADO");
  });

  it("desbloquear um link VENCIDO o deixa VENCIDO, nunca vivo", async () => {
    const { alvo, linha } = servicoDoBloqueio({
      expiraEm: new Date(AGORA - HORA),
      bloqueadoEm: new Date(AGORA - HORA),
      bloqueadoPorId: SINTETICO.autorId,
    });

    const r = await alvo.desbloquearLink(SINTETICO.jti, SINTETICO.autorId);

    expect(r.desbloqueado).toBe(true);
    expect(linha.bloqueadoEm).toBeNull();
    expect(estadoDaLinha(linha, AGORA).vivo).toBe(false);
    expect(estadoDoLinkNoPainel(linha, AGORA)).toBe("VENCIDO");
  });
});
