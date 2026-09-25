import { generateKeyPairSync, createHmac, type KeyObject, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PortalSessaoGuard } from "./portal-sessao.guard";

/**
 * CONDICAO B5: O GUARD DA SESSAO MIGRA PARA Ed25519 E FIXA O ALGORITMO, NO MESMO ATO.
 *
 * TESTE INDEPENDENTE (§A.38), escrito a partir do REQUISITO e em paralelo a construcao (§A.40
 * regra 2). Ele FALHA enquanto a migracao nao acontecer, e isso e o esperado.
 *
 * POR QUE AS DUAS COISAS JUNTAS, e este e o ponto que o teste do proprio autor tende a nao cobrir.
 * Hoje o guard verifica passando SO o segredo, sem lista de algoritmos aceitos
 * (`portal-sessao.guard.ts:58`). Enquanto a chave e um segredo simetrico, a propria biblioteca
 * contem o estrago. NO DIA EM QUE O SEGUNDO ARGUMENTO VIRAR UMA CHAVE PUBLICA, verificar sem fixar
 * o algoritmo e confusao de algoritmo classica: o atacante assina com HMAC usando a CHAVE PUBLICA,
 * que e publica por definicao, e o verificador aceita. O bilhete forjado passa a valer, e nada
 * falha. Ver `docs/PARECER-SEGURANCA-MAPA-HIBRIDO.md` secao 4.1 e a condicao B5 da secao 6.
 *
 * O QUE NAO PODE SE PERDER NA MIGRACAO, e por isso esta testado junto: fail-closed sem chave, sem
 * queda para o segredo do sistema, e zero dado pessoal no bilhete.
 */

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const outra = generateKeyPairSync("ed25519");
const PEM_PUBLICA = publicKey.export({ type: "spki", format: "pem" }).toString();
const PEM_PUBLICA_B64 = Buffer.from(PEM_PUBLICA, "utf8").toString("base64");

const SEGREDO_DO_SISTEMA = "segredo-interno-do-ea-que-nunca-pode-abrir-o-portal";

const CLAIMS = {
  sub: "7f2a1c88-9b0e-4d31-8a55-2c6f0d9e4b11",
  jti: "8b1d0f3a-2c4e-4a7b-9f10-33aa55bb77cc",
  typ: "portal",
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

function b64url(valor: string | Buffer): string {
  return Buffer.from(valor as never).toString("base64url");
}

function partes(header: Record<string, unknown>, claims: Record<string, unknown>): string {
  return `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
}

function bilheteEd25519(chave: KeyObject = privateKey, claims: Record<string, unknown> = CLAIMS): string {
  const entrada = partes({ alg: "EdDSA", typ: "JWT" }, claims);
  return `${entrada}.${b64url(sign(null, Buffer.from(entrada, "utf8"), chave))}`;
}

/** O ataque: HMAC com a CHAVE PUBLICA como segredo. E o unico teste que importa em B5. */
function bilheteSimetricoForjado(segredo: string): string {
  const entrada = partes({ alg: "HS256", typ: "JWT" }, CLAIMS);
  const mac = createHmac("sha256", segredo).update(entrada).digest();
  return `${entrada}.${b64url(mac)}`;
}

function bilheteSemAlgoritmo(): string {
  return `${partes({ alg: "none", typ: "JWT" }, CLAIMS)}.`;
}

/** ConfigService falso que responde por NOME de variavel, para nao amarrar o teste a um nome so. */
function config(valores: Record<string, string>): { get: (chave: string) => string | undefined } {
  return { get: (chave: string) => valores[chave] };
}

const NOMES_DE_CHAVE_PUBLICA = [
  "PORTAL_SESSION_PUBLIC_KEY",
  "PORTAL_SESSION_PUBLICA",
  "PORTAL_SESSAO_PUBLIC_KEY",
  "PORTAL_SESSION_ED25519_PUBLIC_KEY",
  "PORTAL_SESSION_KEY",
];

/** Todas as formas plausiveis de entregar a chave publica ao guard. Uma delas tem de funcionar. */
function ambientesComChavePublica(): Record<string, string>[] {
  const formas = [PEM_PUBLICA_B64, PEM_PUBLICA];
  const ambientes: Record<string, string>[] = [];
  for (const forma of formas) {
    const todos: Record<string, string> = {};
    for (const nome of NOMES_DE_CHAVE_PUBLICA) todos[nome] = forma;
    ambientes.push(todos);
  }
  return ambientes;
}

function guardsPossiveis(valores: Record<string, string>): PortalSessaoGuard[] {
  const cfg = config(valores);
  const Classe = PortalSessaoGuard as unknown as new (...args: unknown[]) => PortalSessaoGuard;
  // A migracao pode dispensar o `JwtService` (a biblioteca do Nest nao verifica EdDSA), entao a
  // forma do construtor nao e amarrada aqui: o requisito e o comportamento. Todas as formas
  // plausiveis sao construidas, e basta UMA conceder para o teste positivo valer; nos testes de
  // recusa, NENHUMA pode conceder.
  const combinacoes: unknown[][] = [[cfg], [cfg, {}], [{}, cfg], [{}, cfg, {}]];
  const guards: PortalSessaoGuard[] = [];
  for (const args of combinacoes) {
    try {
      guards.push(new Classe(...args));
    } catch {
      /* forma incompativel, segue */
    }
  }
  if (guards.length === 0) throw new Error("nao foi possivel construir o guard em nenhuma forma");
  return guards;
}

function requisicao(token: string): { headers: { authorization: string }; portal?: unknown } {
  return { headers: { authorization: `Bearer ${token}` } };
}

function contexto(req: unknown) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as never;
}

async function passa(valores: Record<string, string>, token: string): Promise<boolean> {
  for (const guard of guardsPossiveis(valores)) {
    try {
      if ((await guard.canActivate(contexto(requisicao(token)))) === true) return true;
    } catch {
      /* proxima forma */
    }
  }
  return false;
}

describe("B5: o guard verifica com chave publica Ed25519", () => {
  it("aceita o bilhete Ed25519 legitimo", async () => {
    const aceitou: boolean[] = [];
    for (const ambiente of ambientesComChavePublica()) {
      aceitou.push(await passa(ambiente, bilheteEd25519()));
    }
    expect(
      aceitou.some(Boolean),
      `o guard nao aceitou bilhete Ed25519 em nenhuma forma de configuracao (${NOMES_DE_CHAVE_PUBLICA.join(", ")}, PEM cru ou base64). Enquanto ele verificar HS256 com segredo compartilhado, a condicao B5 esta aberta`,
    ).toBe(true);
  });

  it("preenche a requisicao com admissao e link quando aceita", async () => {
    let preenchida: unknown;
    for (const ambiente of ambientesComChavePublica()) {
      for (const guard of guardsPossiveis(ambiente)) {
        const req = requisicao(bilheteEd25519());
        try {
          const ok = await guard.canActivate(contexto(req));
          if (ok) preenchida = (req as { portal?: unknown }).portal;
        } catch {
          /* proxima forma */
        }
      }
    }
    expect(preenchida).toEqual({ admissaoId: CLAIMS.sub, jtiLink: CLAIMS.jti });
  });
});

describe("B5: confusao de algoritmo, as tres recusas", () => {
  it("RECUSA bilhete simetrico forjado com a chave publica como segredo", async () => {
    for (const ambiente of ambientesComChavePublica()) {
      for (const segredo of [PEM_PUBLICA, PEM_PUBLICA_B64]) {
        expect(
          await passa(ambiente, bilheteSimetricoForjado(segredo)),
          "HMAC assinado com a chave PUBLICA foi aceito: e confusao de algoritmo, e qualquer um forja sessao de qualquer admissao",
        ).toBe(false);
      }
    }
  });

  it("RECUSA bilhete com algoritmo nenhum", async () => {
    for (const ambiente of ambientesComChavePublica()) {
      expect(await passa(ambiente, bilheteSemAlgoritmo()), "`alg: none` foi aceito").toBe(false);
    }
  });

  it("RECUSA bilhete Ed25519 assinado por outra chave", async () => {
    for (const ambiente of ambientesComChavePublica()) {
      expect(await passa(ambiente, bilheteEd25519(outra.privateKey)), "assinatura de outra chave foi aceita").toBe(false);
    }
  });

  it("RECUSA bilhete com tipo diferente de portal", async () => {
    const tokenDeOutroTipo = bilheteEd25519(privateKey, { ...CLAIMS, typ: "access" });
    for (const ambiente of ambientesComChavePublica()) {
      expect(await passa(ambiente, tokenDeOutroTipo), "token de outro tipo abriria rota do portal com credencial interna").toBe(false);
    }
  });
});

describe("B5: o que nao pode se perder na migracao", () => {
  it("sem chave configurada, fail-closed", async () => {
    expect(await passa({}, bilheteEd25519()), "sem chave o portal precisa nascer fechado").toBe(false);
  });

  it("sem chave, NAO cai para o segredo do sistema", async () => {
    const ambiente = { JWT_ACCESS_SECRET: SEGREDO_DO_SISTEMA, JWT_SECRET: SEGREDO_DO_SISTEMA };
    expect(
      await passa(ambiente, bilheteSimetricoForjado(SEGREDO_DO_SISTEMA)),
      "queda para o segredo do sistema ligaria o portal externo a autenticacao interna",
    ).toBe(false);
  });

  it("segredo simetrico proprio deixa de abrir o portal depois da migracao", async () => {
    const ambiente = { PORTAL_SESSION_SECRET: SEGREDO_DO_SISTEMA };
    expect(
      await passa(ambiente, bilheteSimetricoForjado(SEGREDO_DO_SISTEMA)),
      "com o guard em Ed25519, bilhete HS256 nao pode mais valer: dois algoritmos aceitos ao mesmo tempo e exatamente a convivencia que B5 existe para evitar",
    ).toBe(false);
  });

  it("sem cabecalho de autorizacao, recusa", async () => {
    for (const ambiente of ambientesComChavePublica()) {
      for (const guard of guardsPossiveis(ambiente)) {
        await expect(guard.canActivate(contexto({ headers: {} }))).rejects.toThrow();
      }
    }
  });
});
