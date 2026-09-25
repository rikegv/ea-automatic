import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  cunharLink,
  cunharSessao,
  decisaoDaIdentificacao,
  verificarLink,
} from "../domain/portal-identidade";
import { PortalSessaoGuard } from "./portal-sessao.guard";

/**
 * TESTER INDEPENDENTE (§A.38), ESCRITO A PARTIR DO REQUISITO E ANTES DO CÓDIGO (§A.40 regra 2).
 *
 * O ALVO: as funções PURAS da camada de IDENTIDADE do Portal, que o backend vai criar em
 * `domain/portal-identidade.ts`. Quem escreve o módulo é outro agente; este arquivo NÃO o cria, e
 * rodado hoje FALHA por módulo inexistente, que é o esperado.
 *
 * A FONTE DO REQUISITO: `docs/DESENHO-PORTAL-REGRAS-DE-SEGURANCA.md`, decisões 2 (prazo de 72
 * horas), 3 (o link NÃO é de uso único), 4 (revogação) e 5 (limite de tentativas), mais o item L6
 * da seção 9 (o motivo da falha de identificação é SEMPRE `NAO_CASOU`).
 *
 * POR QUE ESTA CAMADA É O PONTO DE RISCO DA FRENTE. Ela é a única coisa entre um link que anda pelo
 * WhatsApp e a trilha documental de uma pessoa. São quatro modos de falha, e os quatro são
 * silenciosos:
 *
 *  a) CONFUSÃO DE TIPO. O portal passa a ter DOIS bilhetes assinados pela mesma chave, o do LINK e
 *     o da SESSÃO, e eles se distinguem só pelo claim `typ`. Verificador que não confira o tipo
 *     aceita um no lugar do outro: um link de 72 horas viraria sessão de 72 horas, e a sessão curta
 *     deixaria de ser curta sem que nada falhasse.
 *  b) CONFUSÃO DE ALGORITMO. Com chave pública em circulação, verificar sem FIXAR o algoritmo
 *     aceita um bilhete forjado com HMAC sobre a própria chave pública. Por isso a recusa de `alg`
 *     é conferida ANTES da conta da assinatura, e este arquivo prova a ORDEM, não só a recusa.
 *  c) ORÁCULO DE CPF. Distinguir "este CPF não existe" de "a data está errada" transforma a rota
 *     numa consulta de CPF válido, movida por um laço de repetição. O item L6 fecha isso no log; a
 *     decisão fecha no que volta para fora. Um código só, `NAO_CASOU`, para todo não casamento.
 *  d) ORÁCULO DE LINK. Se o link morto responder diferente conforme o CPF ter casado ou não, o
 *     oráculo do item (c) volta pela porta do link. Por isso a decisão com link morto é a MESMA
 *     com `casou` verdadeiro e com `casou` falso, e isso está travado abaixo.
 *
 * §A.6: os valores são SINTÉTICOS, inventados para este arquivo. O "CPF" é uma sequência que não
 * pertence a ninguém, e existe aqui com um propósito único: ser PROCURADA dentro dos bilhetes, para
 * provar o veto V5 (o token do portal não carrega CPF nem nome).
 */

// Valores SINTÉTICOS (nenhum dado real; §A.6).
const SINTETICO = {
  admissaoId: "11111111-1111-4111-8111-111111111111",
  jti: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  /** Sequência SINTÉTICA no formato de CPF. Não é de ninguém: serve para ser buscada nos tokens. */
  cpf: "00000000191",
  nome: "Candidata Sintetica De Teste",
};

const HORA_MS = 60 * 60 * 1000;
/** Decisão 2 do documento de regras. */
const TTL_LINK_HORAS = 72;
/** Prazo curto da sessão, combinado para esta frente. */
const TTL_SESSAO_MINUTOS = 30;

/** Um instante fixo, para o teste não depender do relógio. */
const AGORA = Date.UTC(2026, 8, 20, 12, 0, 0);

function parDeChaves() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { privada: privateKey, publica: publicKey };
}

const CHAVES = parDeChaves();
const OUTRAS_CHAVES = parDeChaves();

/**
 * NOTA PARA QUEM FOR IMPLEMENTAR: aqui a chave pública é passada como `KeyObject`, que é a forma
 * usada pelo `PortalSessaoGuard` em produção. Se a assinatura final receber o PEM em texto, ajuste
 * ESTE auxiliar, nunca as asserções: o que este arquivo afirma é o COMPORTAMENTO.
 */
const verificar = (token: string, agoraMs = AGORA, chave: KeyObject = CHAVES.publica) =>
  verificarLink(token, chave, agoraMs);

const linkPadrao = (agoraMs = AGORA, ttlHoras = TTL_LINK_HORAS) =>
  cunharLink(
    { admissaoId: SINTETICO.admissaoId, jti: SINTETICO.jti, agoraMs, ttlHoras },
    CHAVES.privada,
  );

const sessaoPadrao = (agoraMs = AGORA, ttlMinutos = TTL_SESSAO_MINUTOS) =>
  cunharSessao(
    { admissaoId: SINTETICO.admissaoId, jti: SINTETICO.jti, agoraMs, ttlMinutos },
    CHAVES.privada,
  );

function partes(token: string) {
  const [cabecalhoB64, payloadB64, assinaturaB64] = token.split(".");
  return {
    cabecalho: JSON.parse(Buffer.from(cabecalhoB64, "base64url").toString("utf8")) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Record<string, unknown>,
    cabecalhoB64,
    payloadB64,
    assinaturaB64,
  };
}

/** Texto inteiro do bilhete, com as três partes já decodificadas. Para a varredura de PII. */
function tokenEmClaro(token: string): string {
  return token
    .split(".")
    .map((p) => {
      try {
        return Buffer.from(p, "base64url").toString("utf8");
      } catch {
        return p;
      }
    })
    .join("|");
}

/** Cunha um bilhete com o cabeçalho que o teste quiser, assinado DE VERDADE com a chave boa. */
function bilheteComCabecalho(cabecalho: Record<string, unknown>, payload: Record<string, unknown>): string {
  const cabecalhoB64 = Buffer.from(JSON.stringify(cabecalho), "utf8").toString("base64url");
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const entrada = `${cabecalhoB64}.${payloadB64}`;
  const assinatura = sign(null, Buffer.from(entrada, "utf8"), CHAVES.privada);
  return `${entrada}.${assinatura.toString("base64url")}`;
}

function payloadDeLinkValido(agoraMs = AGORA) {
  return partes(linkPadrao(agoraMs)).payload;
}

describe("O LINK CUNHADO É VERIFICÁVEL, e diz de quem ele é", () => {
  it("ida e volta: devolve a admissão e o jti que entraram", () => {
    const r = verificar(linkPadrao());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.admissaoId).toBe(SINTETICO.admissaoId);
    expect(r.jti).toBe(SINTETICO.jti);
  });

  it("o bilhete é um JWS compacto de três partes, alg EdDSA, no molde da casa", () => {
    const { cabecalho } = partes(linkPadrao());
    expect(linkPadrao().split(".")).toHaveLength(3);
    expect(cabecalho.alg).toBe("EdDSA");
  });

  it("o tipo do LINK é `portal-link`, e é ele que separa os dois bilhetes", () => {
    expect(partes(linkPadrao()).payload.typ).toBe("portal-link");
  });

  it("o prazo é exatamente o pedido, em horas (decisão 2: 72)", () => {
    const { payload } = partes(linkPadrao(AGORA, TTL_LINK_HORAS));
    const iat = Math.floor(AGORA / 1000);
    expect(payload.exp).toBe(iat + TTL_LINK_HORAS * 3600);
  });

  it("vale até o fim das 72 horas, e não vale depois", () => {
    const token = linkPadrao();
    expect(verificar(token, AGORA + TTL_LINK_HORAS * HORA_MS - 1000).ok).toBe(true);
    expect(verificar(token, AGORA + TTL_LINK_HORAS * HORA_MS + 1000)).toEqual({
      ok: false,
      motivo: "EXPIRADO",
    });
  });

  it("NÃO é de uso único: verificar duas vezes dá o mesmo resultado (decisão 3)", () => {
    const token = linkPadrao();
    expect(verificar(token)).toEqual(verificar(token));
  });
});

describe("O BILHETE ADULTERADO NÃO PASSA", () => {
  it("payload trocado por outro, com a assinatura antiga, é recusado", () => {
    const { cabecalhoB64, assinaturaB64, payload } = partes(linkPadrao());
    const outro = Buffer.from(
      JSON.stringify({ ...payload, sub: "22222222-2222-4222-8222-222222222222" }),
      "utf8",
    ).toString("base64url");
    expect(verificar(`${cabecalhoB64}.${outro}.${assinaturaB64}`)).toEqual({
      ok: false,
      motivo: "ASSINATURA",
    });
  });

  it("um byte da assinatura trocado é recusado", () => {
    const token = linkPadrao();
    const [c, p, s] = token.split(".");
    const trocado = `${s.slice(0, -1)}${s.endsWith("A") ? "B" : "A"}`;
    expect(verificar(`${c}.${p}.${trocado}`)).toEqual({ ok: false, motivo: "ASSINATURA" });
  });

  it("bilhete assinado por OUTRA chave é recusado (chave privada de um terceiro)", () => {
    const token = cunharLink(
      { admissaoId: SINTETICO.admissaoId, jti: SINTETICO.jti, agoraMs: AGORA, ttlHoras: TTL_LINK_HORAS },
      OUTRAS_CHAVES.privada,
    );
    expect(verificar(token)).toEqual({ ok: false, motivo: "ASSINATURA" });
  });

  it("o que não é bilhete nenhum devolve FORMATO, e não estoura", () => {
    for (const lixo of ["", "abc", "a.b", "a.b.c.d", "...", "naoebase64.naoebase64.naoebase64"]) {
      const r = verificar(lixo);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("FORMATO");
    }
  });
});

describe("O ALGORITMO É FIXADO, E A RECUSA VEM ANTES DA CONTA DA ASSINATURA", () => {
  it("alg HS256 é recusado por ALG, mesmo com a assinatura Ed25519 CORRETA", () => {
    // Este é o caso que distingue "fixar o algoritmo" de "ter sorte": a assinatura fecha, e ainda
    // assim o bilhete tem de morrer no cabeçalho.
    const token = bilheteComCabecalho({ alg: "HS256", typ: "JWT" }, payloadDeLinkValido());
    expect(verificar(token)).toEqual({ ok: false, motivo: "ALG" });
  });

  it("alg `none` é recusado por ALG, não por assinatura vazia", () => {
    const cabecalhoB64 = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" }), "utf8").toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payloadDeLinkValido()), "utf8").toString("base64url");
    expect(verificar(`${cabecalhoB64}.${payloadB64}.`)).toEqual({ ok: false, motivo: "ALG" });
  });

  it("A ORDEM: alg errado E assinatura errada devolve ALG, nunca ASSINATURA", () => {
    const cabecalhoB64 = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" }), "utf8").toString("base64url");
    const payloadB64 = Buffer.from(JSON.stringify(payloadDeLinkValido()), "utf8").toString("base64url");
    const r = verificar(`${cabecalhoB64}.${payloadB64}.${Buffer.from("lixo", "utf8").toString("base64url")}`);
    expect(r).toEqual({ ok: false, motivo: "ALG" });
  });

  it("alg ausente também é recusado por ALG", () => {
    const token = bilheteComCabecalho({ typ: "JWT" }, payloadDeLinkValido());
    expect(verificar(token)).toEqual({ ok: false, motivo: "ALG" });
  });
});

describe("UMA SESSÃO NÃO SERVE DE LINK, E UM LINK NÃO SERVE DE SESSÃO", () => {
  it("o verificador do LINK recusa o bilhete de SESSÃO por TIPO", () => {
    // A assinatura fecha (mesma chave) e o prazo está em pé: o que barra é o `typ`.
    expect(verificar(sessaoPadrao())).toEqual({ ok: false, motivo: "TIPO" });
  });

  it("o verificador do LINK recusa qualquer outro `typ`, inclusive `access`", () => {
    for (const typ of ["access", "portal", "vt", "", "portal-Link"]) {
      const token = bilheteComCabecalho(
        { alg: "EdDSA", typ: "JWT" },
        { ...payloadDeLinkValido(), typ },
      );
      const r = verificar(token);
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.motivo).toBe("TIPO");
    }
  });

  it("o GUARD que já existe ACEITA a sessão cunhada aqui", async () => {
    // O emissor da sessão é novo; o verificador é o `PortalSessaoGuard` em produção. Se os dois não
    // conversarem, o candidato se identifica e mesmo assim não entra.
    const guard = new PortalSessaoGuard({
      get: () => Buffer.from(CHAVES.publica.export({ type: "spki", format: "pem" }) as string).toString("base64"),
    } as never);
    const req: Record<string, unknown> = {
      headers: { authorization: `Bearer ${sessaoPadrao(Date.now())}` },
    };
    const contexto = { switchToHttp: () => ({ getRequest: () => req }) } as never;

    await expect(guard.canActivate(contexto)).resolves.toBe(true);
    expect(req.portal).toEqual({ admissaoId: SINTETICO.admissaoId, jtiLink: SINTETICO.jti });
  });

  it("o GUARD que já existe RECUSA o bilhete de LINK", async () => {
    const guard = new PortalSessaoGuard({
      get: () => Buffer.from(CHAVES.publica.export({ type: "spki", format: "pem" }) as string).toString("base64"),
    } as never);
    const contexto = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: `Bearer ${linkPadrao(Date.now())}` } }) }),
    } as never;

    await expect(guard.canActivate(contexto)).rejects.toThrow();
  });
});

describe("A SESSÃO É CURTA, e carrega o link que a originou", () => {
  it("o prazo é em MINUTOS, e são 30", () => {
    const { payload } = partes(sessaoPadrao(AGORA, TTL_SESSAO_MINUTOS));
    expect(payload.exp).toBe(Math.floor(AGORA / 1000) + TTL_SESSAO_MINUTOS * 60);
  });

  it("o `jti` do LINK viaja na sessão: é por ele que a cota de arquivos é contada", () => {
    const { payload } = partes(sessaoPadrao());
    expect(payload.jti).toBe(SINTETICO.jti);
    expect(payload.sub).toBe(SINTETICO.admissaoId);
    expect(payload.typ).toBe("portal");
  });
});

describe("VETO V5: nenhum dos dois bilhetes carrega CPF nem nome", () => {
  it("o payload do LINK tem só os claims técnicos", () => {
    const chaves = Object.keys(partes(linkPadrao()).payload).sort();
    expect(chaves.filter((c) => !["sub", "jti", "typ", "iat", "exp"].includes(c))).toEqual([]);
  });

  it("o payload da SESSÃO tem só os claims técnicos", () => {
    const chaves = Object.keys(partes(sessaoPadrao()).payload).sort();
    expect(chaves.filter((c) => !["sub", "jti", "typ", "iat", "exp"].includes(c))).toEqual([]);
  });

  it("o CPF sintético e o nome não aparecem em lugar nenhum dos bilhetes", () => {
    for (const token of [linkPadrao(), sessaoPadrao()]) {
      const claro = tokenEmClaro(token);
      expect(claro).not.toContain(SINTETICO.cpf);
      expect(claro).not.toContain(SINTETICO.nome);
      expect(claro.toLowerCase()).not.toContain("cpf");
      expect(claro.toLowerCase()).not.toContain("nome");
      expect(claro.toLowerCase()).not.toContain("nasc");
    }
  });
});

describe("A DECISÃO DA IDENTIFICAÇÃO: um código só para todo não casamento", () => {
  const base = { linkVivo: true, revogado: false, expirado: false, casou: true, bloqueado: false };

  it("tudo em ordem: passa, e sem motivo", () => {
    expect(decisaoDaIdentificacao(base)).toEqual({ ok: true, motivoCodigo: null });
  });

  it("não casou: NAO_CASOU, e nada além disso", () => {
    expect(decisaoDaIdentificacao({ ...base, casou: false })).toEqual({
      ok: false,
      motivoCodigo: "NAO_CASOU",
    });
  });

  it("BLOQUEADO tem código PRÓPRIO, diferente de NAO_CASOU", () => {
    const r = decisaoDaIdentificacao({ ...base, bloqueado: true });
    expect(r.ok).toBe(false);
    expect(r.motivoCodigo).not.toBe("NAO_CASOU");
    expect(r.motivoCodigo).toBeTruthy();
  });

  it("o bloqueio VENCE o casamento: quem está bloqueado não descobre se acertou", () => {
    // Se o bloqueado que acerta o CPF recebesse resposta diferente do bloqueado que erra, o teto de
    // tentativas viraria o próprio oráculo que ele existe para fechar.
    expect(decisaoDaIdentificacao({ ...base, bloqueado: true, casou: true })).toEqual(
      decisaoDaIdentificacao({ ...base, bloqueado: true, casou: false }),
    );
  });

  it("REVOGADO, EXPIRADO e INEXISTENTE dão a MESMA resposta para fora", () => {
    const revogado = decisaoDaIdentificacao({ ...base, revogado: true });
    const expirado = decisaoDaIdentificacao({ ...base, expirado: true });
    const inexistente = decisaoDaIdentificacao({ ...base, linkVivo: false });
    expect(revogado.ok).toBe(false);
    expect(revogado).toEqual(expirado);
    expect(revogado).toEqual(inexistente);
  });

  it("com o link morto, a resposta NÃO depende de o CPF ter casado", () => {
    // O oráculo de CPF pela porta do link: se a resposta variar, um link vencido vira consulta de
    // CPF válido, e a decisão 5 (limite de tentativas) não cobre isso.
    for (const morto of [{ revogado: true }, { expirado: true }, { linkVivo: false }]) {
      expect(decisaoDaIdentificacao({ ...base, ...morto, casou: true })).toEqual(
        decisaoDaIdentificacao({ ...base, ...morto, casou: false }),
      );
    }
  });

  it("VARREDURA DAS 32 COMBINAÇÕES: nenhum código conta qual metade falhou", () => {
    const bools = [false, true];
    let bloqueadoCodigo: string | null = null;
    for (const linkVivo of bools) {
      for (const revogado of bools) {
        for (const expirado of bools) {
          for (const casou of bools) {
            for (const bloqueado of bools) {
              const entrada = { linkVivo, revogado, expirado, casou, bloqueado };
              const r = decisaoDaIdentificacao(entrada);
              const deveriaPassar = linkVivo && !revogado && !expirado && casou && !bloqueado;

              expect(r.ok, JSON.stringify(entrada)).toBe(deveriaPassar);
              // Motivo existe se, e somente se, recusou. Recusa sem código é log mudo.
              expect(r.motivoCodigo === null, JSON.stringify(entrada)).toBe(deveriaPassar);

              if (r.motivoCodigo !== null) {
                // Código de catálogo, curto, nunca frase (seção 9: enum curto, nunca texto livre).
                expect(r.motivoCodigo, JSON.stringify(entrada)).toMatch(/^[A-Z][A-Z_]{2,29}$/);
                // E o código nunca nomeia a metade que falhou.
                expect(r.motivoCodigo).not.toMatch(/CPF|DATA|NASC|INEXIST|NAO_ENCONTR|SENHA/);
              }
              if (bloqueado) {
                bloqueadoCodigo ??= r.motivoCodigo;
                expect(r.motivoCodigo, JSON.stringify(entrada)).toBe(bloqueadoCodigo);
              }
            }
          }
        }
      }
    }
  });
});

describe("A CHAVE DO PORTAL É PRÓPRIA (decisão 10), e a do sistema não abre o link", () => {
  it("chave pública de outro par não verifica o bilhete deste par", () => {
    expect(verificar(linkPadrao(), AGORA, OUTRAS_CHAVES.publica)).toEqual({
      ok: false,
      motivo: "ASSINATURA",
    });
  });

  it("a chave privada é aceita como KeyObject importado de PEM, como no resto da casa", () => {
    const pem = CHAVES.privada.export({ type: "pkcs8", format: "pem" }) as string;
    const token = cunharLink(
      { admissaoId: SINTETICO.admissaoId, jti: SINTETICO.jti, agoraMs: AGORA, ttlHoras: TTL_LINK_HORAS },
      createPrivateKey(pem),
    );
    expect(verificar(token, AGORA, createPublicKey(pem)).ok).toBe(true);
  });
});
