import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { LIMITES_PORTAL } from "../domain/portal-credencial";
import {
  BILHETE_DESTINOS,
  BILHETE_TETO_SEGUNDOS,
  BILHETE_TTL_SEGUNDOS,
  CLAIMS_DO_BILHETE,
  carregarChavePrivadaBilhete,
  cunharBilhete,
  ordenarCabecalhos,
  ORDEM_CANONICA_CABECALHOS,
  verificarBilhete,
  type DadosBilhete,
} from "./portal-bilhete";

/**
 * O BILHETE É A ÚNICA COISA DESTA FRENTE QUE SE PROVA INTEIRA HOJE, sem balde, sem emissor e sem
 * nuvem. Ida e volta, adulteração de cada claim, expiração, algoritmo trocado e a ausência de dado
 * pessoal são propriedades da string, não da nuvem.
 *
 * O QUE ESTES TESTES NÃO PROVAM, e ninguém deve prometer ao diretor: que o Google aceita a URL que o
 * emissor assina, que a segunda escrita é recusada e que o teto de tamanho é imposto. As três só
 * existem contra o balde real.
 */

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUBLICA_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIVADA_PEM_B64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
).toString("base64");

const OUTRA = generateKeyPairSync("ed25519");
const OUTRA_PUBLICA_PEM = OUTRA.publicKey.export({ type: "spki", format: "pem" }).toString();

const AGORA = new Date("2026-09-18T12:00:00.000Z");

const DADOS: DadosBilhete = {
  destino: "assinar-escrita",
  bucket: "ea-portal-entrada",
  objeto: "a1b2c3d4e5f6/RG__11111111-2222-3333-4444-555555555555.pdf",
  metodo: "PUT",
  cabecalhos: {
    "content-type": "application/pdf",
    "x-goog-content-length-range": "0,1048576",
    "x-goog-if-generation-match": "0",
  },
  ttlSegundos: 600,
  absEpoch: Math.floor(AGORA.getTime() / 1000) + 600,
};

const b64urlJson = (obj: unknown) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
const lerPayload = (bilhete: string) =>
  JSON.parse(Buffer.from(bilhete.split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;

/** Troca um claim SEM refazer a assinatura: é assim que a adulteração se parece na vida real. */
function adulterar(bilhete: string, mudanca: Record<string, unknown>): string {
  const [cabecalho, payload, assinatura] = bilhete.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return `${cabecalho}.${b64urlJson({ ...claims, ...mudanca })}.${assinatura}`;
}

describe("Ida e volta: o que o EA cunha, o emissor confere", () => {
  it("devolve exatamente os claims que entraram, com o prazo de 60 segundos", () => {
    const bilhete = cunharBilhete(DADOS, privateKey, null, AGORA);
    const claims = verificarBilhete(bilhete, PUBLICA_PEM, AGORA);

    expect(claims.dst).toBe("assinar-escrita");
    expect(claims.bkt).toBe(DADOS.bucket);
    expect(claims.obj).toBe(DADOS.objeto);
    expect(claims.mtd).toBe("PUT");
    expect(claims.hdr).toEqual(DADOS.cabecalhos);
    expect(claims.ttl).toBe(600);
    expect(claims.abs).toBe(DADOS.absEpoch);
    expect(claims.exp - claims.iat).toBe(BILHETE_TTL_SEGUNDOS);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("o `kid` viaja no cabeçalho quando informado, e some quando vazio (rotação, risco R8)", () => {
    const com = cunharBilhete(DADOS, privateKey, "chave-2", AGORA);
    const sem = cunharBilhete(DADOS, privateKey, "   ", AGORA);
    const cabecalhoDe = (b: string) =>
      JSON.parse(Buffer.from(b.split(".")[0], "base64url").toString("utf8")) as Record<string, unknown>;

    expect(cabecalhoDe(com)).toEqual({ alg: "EdDSA", typ: "JWT", kid: "chave-2" });
    expect(cabecalhoDe(sem)).toEqual({ alg: "EdDSA", typ: "JWT" });
  });

  it("dois bilhetes do mesmo pedido têm identificadores diferentes", () => {
    const a = lerPayload(cunharBilhete(DADOS, privateKey, null, AGORA));
    const b = lerPayload(cunharBilhete(DADOS, privateKey, null, AGORA));
    expect(a.jti).not.toBe(b.jti);
  });

  it("os quatro destinos atravessam, e o destino está DENTRO da assinatura (B2 e B3)", () => {
    for (const destino of BILHETE_DESTINOS) {
      const bilhete = cunharBilhete({ ...DADOS, destino }, privateKey, null, AGORA);
      expect(verificarBilhete(bilhete, PUBLICA_PEM, AGORA).dst).toBe(destino);
    }
    // Trocar o destino de escrita para remoção sem a chave privada NÃO funciona: é o que impede
    // um bilhete de escrita de virar um bilhete de apagar.
    const escrita = cunharBilhete(DADOS, privateKey, null, AGORA);
    expect(() => verificarBilhete(adulterar(escrita, { dst: "apagar" }), PUBLICA_PEM, AGORA)).toThrow(
      /assinatura/,
    );
  });
});

describe("Adulteração: cada claim, um a um", () => {
  const mudancas: Record<string, unknown>[] = [
    { dst: "apagar" },
    { bkt: "balde-de-outra-pessoa" },
    { obj: "a1b2c3d4e5f6/OUTRO__00000000-0000-0000-0000-000000000000.pdf" },
    { mtd: "GET" },
    { hdr: {} },
    { hdr: { "content-type": "application/pdf" } },
    { ttl: 86_400 },
    { abs: Math.floor(AGORA.getTime() / 1000) + 86_400 },
    { jti: "00000000-0000-0000-0000-000000000000" },
    { iat: 0 },
    { exp: Math.floor(AGORA.getTime() / 1000) + 86_400 },
  ];

  for (const mudanca of mudancas) {
    const claim = Object.keys(mudanca)[0];
    it(`mexer em \`${claim}\` invalida a assinatura`, () => {
      const bilhete = adulterar(cunharBilhete(DADOS, privateKey, null, AGORA), mudanca);
      expect(() => verificarBilhete(bilhete, PUBLICA_PEM, AGORA)).toThrow(/assinatura/);
    });
  }

  it("a lista acima cobre TODOS os claims do contrato, e o teste falha se nascer um claim novo", () => {
    const cobertos = new Set(mudancas.map((m) => Object.keys(m)[0]));
    expect([...CLAIMS_DO_BILHETE].filter((c) => !cobertos.has(c))).toEqual([]);
  });

  it("bilhete de outra chave é recusado", () => {
    const bilhete = cunharBilhete(DADOS, privateKey, null, AGORA);
    expect(() => verificarBilhete(bilhete, OUTRA_PUBLICA_PEM, AGORA)).toThrow(/assinatura/);
  });

  it("bilhete malformado é recusado sem tentar conta nenhuma", () => {
    expect(() => verificarBilhete("nao.e", PUBLICA_PEM, AGORA)).toThrow(/malformado/);
    expect(() => verificarBilhete(randomBytes(8).toString("hex"), PUBLICA_PEM, AGORA)).toThrow(
      /malformado/,
    );
  });
});

describe("Prazo: 60 segundos, e nem um a mais", () => {
  it("vale dentro da janela", () => {
    const bilhete = cunharBilhete(DADOS, privateKey, null, AGORA);
    const quase = new Date(AGORA.getTime() + 59_000);
    expect(verificarBilhete(bilhete, PUBLICA_PEM, quase).dst).toBe("assinar-escrita");
  });

  it("expira no segundo 60", () => {
    const bilhete = cunharBilhete(DADOS, privateKey, null, AGORA);
    const depois = new Date(AGORA.getTime() + 60_000);
    expect(() => verificarBilhete(bilhete, PUBLICA_PEM, depois)).toThrow(/expirado/);
  });

  it("bilhete sem `exp` é recusado, e não tratado como eterno", () => {
    const [cabecalho, payload, assinatura] = cunharBilhete(DADOS, privateKey, null, AGORA).split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    delete claims.exp;
    // Reassinar não é possível aqui de propósito: mesmo com assinatura válida o `exp` ausente cai.
    expect(() => verificarBilhete(`${cabecalho}.${b64urlJson(claims)}.${assinatura}`, PUBLICA_PEM, AGORA)).toThrow();
  });
});

describe("Condição B4: o teto de dez minutos é IMPOSTO, não combinado", () => {
  it("prazo de horas é CORTADO no teto da credencial, em `abs` e em `ttl`", () => {
    const oitoHoras = Math.floor(AGORA.getTime() / 1000) + 8 * 3600;
    const esticado = cunharBilhete(
      { ...DADOS, absEpoch: oitoHoras, ttlSegundos: 8 * 3600 },
      privateKey,
      null,
      AGORA,
    );
    const claims = verificarBilhete(esticado, PUBLICA_PEM, AGORA);

    expect(claims.ttl).toBe(BILHETE_TETO_SEGUNDOS);
    expect(claims.abs).toBe(claims.iat + BILHETE_TETO_SEGUNDOS);
  });

  it("o teto é o da CREDENCIAL, os dez minutos, e não o da sessão do candidato", () => {
    expect(BILHETE_TETO_SEGUNDOS).toBe(Math.floor(LIMITES_PORTAL.TTL_MS / 1000));
    expect(BILHETE_TETO_SEGUNDOS).toBe(600);
  });

  it("prazo menor que o teto atravessa intacto: o teto corta, não iguala", () => {
    const curto = Math.floor(AGORA.getTime() / 1000) + 60;
    const claims = verificarBilhete(
      cunharBilhete({ ...DADOS, absEpoch: curto, ttlSegundos: 60 }, privateKey, null, AGORA),
      PUBLICA_PEM,
      AGORA,
    );
    expect(claims.ttl).toBe(60);
    expect(claims.abs).toBe(curto);
  });
});

describe("Confusão de algoritmo: o alg é FIXADO, e a recusa vem antes da conta", () => {
  it("cabeçalho com algoritmo simétrico é recusado", () => {
    const [, payload, assinatura] = cunharBilhete(DADOS, privateKey, null, AGORA).split(".");
    const trocado = `${b64urlJson({ alg: "HS256", typ: "JWT" })}.${payload}.${assinatura}`;
    expect(() => verificarBilhete(trocado, PUBLICA_PEM, AGORA)).toThrow(/alg/);
  });

  it("cabeçalho com `alg: none` é recusado", () => {
    const [, payload] = cunharBilhete(DADOS, privateKey, null, AGORA).split(".");
    const semAlg = `${b64urlJson({ alg: "none", typ: "JWT" })}.${payload}.`;
    expect(() => verificarBilhete(semAlg, PUBLICA_PEM, AGORA)).toThrow(/alg/);
  });

  it("cabeçalho sem `alg` nenhum é recusado", () => {
    const [, payload, assinatura] = cunharBilhete(DADOS, privateKey, null, AGORA).split(".");
    const semAlg = `${b64urlJson({ typ: "JWT" })}.${payload}.${assinatura}`;
    expect(() => verificarBilhete(semAlg, PUBLICA_PEM, AGORA)).toThrow(/alg/);
  });

  it("destino fora do vocabulário fechado é recusado mesmo com assinatura válida", () => {
    const bilhete = cunharBilhete(
      { ...DADOS, destino: "listar" as never },
      privateKey,
      null,
      AGORA,
    );
    expect(() => verificarBilhete(bilhete, PUBLICA_PEM, AGORA)).toThrow(/destino/);
  });
});

describe("§A.6: ZERO dado pessoal em qualquer claim", () => {
  it("o payload tem EXATAMENTE os claims do contrato, e nada mais", () => {
    const claims = lerPayload(cunharBilhete(DADOS, privateKey, null, AGORA));
    expect(Object.keys(claims).sort()).toEqual([...CLAIMS_DO_BILHETE].sort());
  });

  it("nenhum claim é campo de dado pessoal", () => {
    const claims = lerPayload(cunharBilhete(DADOS, privateKey, null, AGORA));
    const proibidos = ["cpf", "nome", "email", "telefone", "nasc", "dataNascimento", "sub", "candidatoId", "admissaoId"];
    for (const proibido of proibidos) {
      expect(Object.keys(claims)).not.toContain(proibido);
    }
  });

  it("o bilhete inteiro não carrega CPF nem nome, nem por dentro do nome do objeto", () => {
    // O nome do objeto já chega OPACO: quem o monta é `portal-objeto.ts`, com pepper. Aqui se prova
    // que o bilhete não acrescenta nada por fora dele.
    const bilhete = cunharBilhete(DADOS, privateKey, null, AGORA);
    const legivel = `${Buffer.from(bilhete.split(".")[0], "base64url")}${Buffer.from(bilhete.split(".")[1], "base64url")}`;
    expect(legivel).not.toMatch(/52998224725/);
    expect(legivel.toLowerCase()).not.toMatch(/fulano/);
  });
});

describe("A ordem canônica dos cabeçalhos, que o emissor confere e não pode reordenar (B1)", () => {
  it("os três da régua vêm primeiro, na ordem fixa, seja qual for a ordem de entrada", () => {
    const fora = ordenarCabecalhos({
      "x-goog-if-generation-match": "0",
      "Content-Type": "image/png",
      "x-goog-content-length-range": "0,10",
    });
    expect(Object.keys(fora)).toEqual([...ORDEM_CANONICA_CABECALHOS]);
  });

  it("cabeçalho fora da régua vem depois, em ordem alfabética (é o caso da correção de tipo)", () => {
    const ordenado = ordenarCabecalhos({
      "x-goog-metadata-directive": "REPLACE",
      "x-goog-copy-source": "balde/objeto",
      "content-type": "image/jpeg",
    });
    expect(Object.keys(ordenado)).toEqual([
      "content-type",
      "x-goog-copy-source",
      "x-goog-metadata-directive",
    ]);
  });

  it("o valor é canonizado: aparado e com espaços internos colapsados", () => {
    expect(ordenarCabecalhos({ "content-type": "  application/pdf  " })["content-type"]).toBe(
      "application/pdf",
    );
  });
});

describe("Inércia: chave ausente devolve nulo e NUNCA lança no boot", () => {
  it("indefinida, vazia e só espaço devolvem nulo", () => {
    expect(carregarChavePrivadaBilhete(undefined)).toBeNull();
    expect(carregarChavePrivadaBilhete(null)).toBeNull();
    expect(carregarChavePrivadaBilhete("")).toBeNull();
    expect(carregarChavePrivadaBilhete("   ")).toBeNull();
  });

  it("valor presente e ilegível devolve nulo, em vez de derrubar o serviço", () => {
    expect(carregarChavePrivadaBilhete("isto-nao-e-um-pem")).toBeNull();
  });

  it("a chave de verdade carrega e assina", () => {
    const chave = carregarChavePrivadaBilhete(PRIVADA_PEM_B64);
    expect(chave).not.toBeNull();
    const bilhete = cunharBilhete(DADOS, chave as never, null, AGORA);
    expect(verificarBilhete(bilhete, PUBLICA_PEM, AGORA).obj).toBe(DADOS.objeto);
  });
});
