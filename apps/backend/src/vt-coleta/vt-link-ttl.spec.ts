import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { Database } from "../db/client";
import { VtLinkService } from "./vt-link.service";
import { VT_LINK_TTL_DIAS_PADRAO, verificarTokenVt } from "./vt-link-token";

/**
 * ══ O PRAZO DO TOKEN DO VT, TRAVADO NOS DOIS CAMINHOS (veto F2 da auditoria da ponte) ════════
 *
 * O QUE ESTAVA SOLTO, e é o que originou o veto: NENHUM teste travava o TTL. O comentário da ponte
 * afirmava "7 dias", que é o padrão de CÓDIGO, enquanto a produção roda com `VT_LINK_TTL_DIAS=30`,
 * medido no `.env`. Ou seja: a rota pública do candidato cunhava, num clique, sem trilha e sem
 * revogação possível, uma credencial com CPF e nome em claro que vivia um mês, dentro de um produto
 * cujo link vale 72 horas e cuja sessão vale 30 minutos.
 *
 * SÃO DOIS CAMINHOS COM PRAZOS DIFERENTES DE PROPÓSITO, e este arquivo prova os dois:
 *  · o do CONSULTOR (`POST vt-coleta/admissao/:id/gerar-link` e o registro de solicitação do time)
 *    manda o link por e-mail e precisa do prazo longo. Ele NÃO mudou: continua lendo o ambiente,
 *    com queda para o padrão de código, e os dois chamadores continuam sem passar opção nenhuma;
 *  · o do CANDIDATO (a ponte do portal) pede HORAS na chamada.
 *
 * §A.6: os fixtures são sintéticos e não pertencem a ninguém. O token não é impresso em lugar
 * nenhum deste arquivo, só conferido.
 */

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const PUBLICA_PEM = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIVADA_B64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  "utf8",
).toString("base64");

const ADMISSAO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HORA = 60 * 60;
const DIA = 24 * HORA;

/** Banco mínimo: a admissão e o candidato que o emissor carrega antes de assinar. */
function banco(): Database {
  return {
    query: {
      admissoes: { findFirst: async () => ({ id: ADMISSAO, candidatoCpf: "11122233344" }) },
      candidatos: {
        findFirst: async () => ({
          nome: "Candidato Sintético",
          cpf: "11122233344",
          dataNascimento: "1990-05-17",
        }),
      },
    },
  } as unknown as Database;
}

function servico(env: Record<string, string | undefined>): VtLinkService {
  const config = {
    get: (chave: string) => ({ VT_LINK_PRIVATE_KEY: PRIVADA_B64, ...env })[chave],
  } as unknown as ConfigService;
  return new VtLinkService(banco(), config);
}

/** Quantos segundos de vida o token emitido tem, lidos do próprio token. */
async function vidaEmSegundos(alvo: VtLinkService, opcoes?: { ttlHoras?: number }) {
  const { link, expiraEm } = await alvo.gerarParaAdmissao(ADMISSAO, opcoes);
  // O token viaja no FRAGMENTO (`#t=`), não na query (vazamento 3, OST 3 vazamentos): lê do hash.
  const token = new URLSearchParams(new URL(link).hash.slice(1)).get("t") ?? "";
  const claims = verificarTokenVt(token, PUBLICA_PEM, new Date(claimsIat(token) * 1000));
  // O carimbo devolvido ao chamador e o `exp` assinado precisam falar do mesmo instante: é o
  // carimbo que a tela mostra e o `exp` que o app do Firebase obedece.
  expect(Math.floor(new Date(expiraEm).getTime() / 1000)).toBe(claims.exp);
  return claims.exp - claims.iat;
}

/** `iat` cru do token, só para dar um "agora" válido ao verificador. */
function claimsIat(token: string): number {
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  return payload.iat as number;
}

describe("o caminho do CONSULTOR: prazo do ambiente, e ele NÃO mudou", () => {
  it("com `VT_LINK_TTL_DIAS=30` (o valor real da produção), o token vive 30 dias", async () => {
    // É a medição que a auditoria fez e que nenhum teste guardava: o default de 7 está
    // sobrescrito, então qualquer comentário que afirme "7 dias" está errado no ar.
    expect(await vidaEmSegundos(servico({ VT_LINK_TTL_DIAS: "30" }))).toBe(30 * DIA);
  });

  it("sem a variável, cai no padrão de código, e é ESSE o único lugar onde o 7 vale", async () => {
    expect(await vidaEmSegundos(servico({ VT_LINK_TTL_DIAS: undefined }))).toBe(
      VT_LINK_TTL_DIAS_PADRAO * DIA,
    );
  });

  it("valor inválido também cai no padrão, em vez de virar token eterno ou instantâneo", async () => {
    expect(await vidaEmSegundos(servico({ VT_LINK_TTL_DIAS: "abacaxi" }))).toBe(
      VT_LINK_TTL_DIAS_PADRAO * DIA,
    );
    expect(await vidaEmSegundos(servico({ VT_LINK_TTL_DIAS: "0" }))).toBe(
      VT_LINK_TTL_DIAS_PADRAO * DIA,
    );
  });

  it("os dois chamadores do time continuam chamando SEM opção, byte a byte como antes", () => {
    const fonte = (arquivo: string) => readFileSync(join(__dirname, arquivo), "utf8");
    expect(fonte("vt-coleta.controller.ts")).toContain("gerarParaAdmissao(id)");
    expect(fonte("solicitacao-vt.service.ts")).toContain("gerarParaAdmissao(admissaoId)");
  });
});

describe("o caminho do CANDIDATO: prazo em horas, pedido na chamada", () => {
  it("`ttlHoras` manda, mesmo com o ambiente em 30 dias", async () => {
    const alvo = servico({ VT_LINK_TTL_DIAS: "30" });
    expect(await vidaEmSegundos(alvo, { ttlHoras: 6 })).toBe(6 * HORA);
  });

  it("horas quebradas não viram prazo torto: a conta fecha no segundo", async () => {
    const alvo = servico({ VT_LINK_TTL_DIAS: "30" });
    expect(await vidaEmSegundos(alvo, { ttlHoras: 7 })).toBe(7 * HORA);
    expect(await vidaEmSegundos(alvo, { ttlHoras: 1 })).toBe(1 * HORA);
  });

  it("opção vazia ou inválida NÃO encurta nem alonga: volta ao prazo do ambiente", async () => {
    const alvo = servico({ VT_LINK_TTL_DIAS: "30" });
    expect(await vidaEmSegundos(alvo, {})).toBe(30 * DIA);
    expect(await vidaEmSegundos(alvo, { ttlHoras: 0 })).toBe(30 * DIA);
    expect(await vidaEmSegundos(alvo, { ttlHoras: Number.NaN })).toBe(30 * DIA);
  });
});
