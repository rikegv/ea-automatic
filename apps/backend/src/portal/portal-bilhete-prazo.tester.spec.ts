import { readFileSync, existsSync } from "node:fs";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITES_PORTAL } from "../domain/portal-credencial";

/**
 * CONDICAO B4: O PRAZO EFETIVO DA CREDENCIAL NAO PODE VIRAR O PRAZO DA SESSAO.
 *
 * TESTE INDEPENDENTE (§A.38), escrito a partir do REQUISITO e em paralelo a construcao (§A.40
 * regra 2). O modulo `portal/portal-bilhete.ts` pode ainda nao existir quando este arquivo roda, e
 * falhar por ausencia dele e o comportamento esperado, nao defeito do teste.
 *
 * O FURO QUE ESTE ARQUIVO EXISTE PARA PEGAR, e ele e o mais sutil da frente. O emissor e SEM
 * ESTADO e confere o bilhete offline, entao o MESMO bilhete pode ser trocado por mais de uma URL
 * (`docs/DESENHO-PORTAL-HIBRIDO.md` secao 4). A consequencia, medida em
 * `docs/PARECER-SEGURANCA-MAPA-HIBRIDO.md` secao 4.2: quem guardou o bilhete pede uma URL NOVA
 * depois de a primeira expirar, quantas vezes quiser, ATE O BILHETE VENCER. O prazo efetivo da
 * credencial deixa de ser o da URL e passa a ser o do bilhete. Um bilhete com prazo de sessao
 * transforma uma credencial de dez minutos numa credencial de horas SEM QUE NADA FALHE e sem que
 * uma linha do Portal mude.
 *
 * A REGUA, entao, e numerica e e esta: nenhum instante que viaje dentro do bilhete pode ultrapassar
 * `LIMITES_PORTAL.TTL_MS` (dez minutos, `domain/portal-credencial.ts:45`) contado da emissao. O
 * bilhete em si vale 60 segundos, porque a unica viagem que ele faz e do EA ao emissor.
 *
 * CONTRATO ASSUMIDO (se a construcao usar outros nomes, e so alinhar aqui, a regua nao muda):
 *   `portal/portal-bilhete.ts` exporta uma funcao que CUNHA o bilhete e devolve um JWS compacto
 *   `base64url(header).base64url(claims).base64url(assinatura)`, com header `alg: "EdDSA"`.
 */

const NOMES_DE_CUNHAGEM = [
  "cunharBilhete",
  "gerarBilhete",
  "emitirBilhete",
  "assinarBilhete",
  "montarBilhete",
  "cunharBilhetePortal",
  "gerarBilhetePortal",
];

const { privateKey } = generateKeyPairSync("ed25519");
const PEM_PRIVADA = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const AGORA = new Date("2026-09-18T12:00:00.000Z");
const AGORA_MS = AGORA.getTime();
const OBJETO = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6/RG__0f9f1a2b3c4d4e5f8a9b0c1d2e3f4a5b.pdf";
const EXPIRA_CREDENCIAL_MS = AGORA_MS + LIMITES_PORTAL.TTL_MS;

/** Dado pessoal que NAO pode aparecer em claim nenhum. O emissor e um terceiro (§A.6). */
const PII = {
  admissaoId: "7f2a1c88-9b0e-4d31-8a55-2c6f0d9e4b11",
  cpf: "52998224725",
  cpfMascarado: "529.982.247-25",
  nome: "Fulano De Tal",
  email: "fulano@exemplo.com.br",
  nomeArquivo: "RG-fulano-de-tal.pdf",
};

/**
 * Entrada deliberadamente generosa em apelidos: a regua provada aqui e o VALOR do prazo, e nao o
 * nome do campo escolhido pela construcao.
 */
const ENTRADA: Record<string, unknown> = {
  destino: "assinar-escrita",
  acao: "ESCRITA",
  metodo: "PUT",
  balde: "ea-portal-entrada",
  bucket: "ea-portal-entrada",
  objeto: OBJETO,
  tipo: "application/pdf",
  contentType: "application/pdf",
  tipoAssinado: "application/pdf",
  bytes: 512_000,
  bytesMax: 512_000,
  cabecalhos: {
    "content-type": "application/pdf",
    "x-goog-content-length-range": "0,512000",
    "x-goog-if-generation-match": "0",
  },
  cabecalhosAssinados: {
    "content-type": "application/pdf",
    "x-goog-content-length-range": "0,512000",
    "x-goog-if-generation-match": "0",
  },
  absEpoch: Math.floor(EXPIRA_CREDENCIAL_MS / 1000),
  expiraEm: EXPIRA_CREDENCIAL_MS,
  credencialExpiraEm: EXPIRA_CREDENCIAL_MS,
  prazoFinal: EXPIRA_CREDENCIAL_MS,
  ate: EXPIRA_CREDENCIAL_MS,
  prazoSegundos: Math.floor(LIMITES_PORTAL.TTL_MS / 1000),
  ttlSegundos: Math.floor(LIMITES_PORTAL.TTL_MS / 1000),
  kid: "k1",
};

type Cunhagem = (...args: unknown[]) => unknown;

async function carregarModulo(): Promise<Record<string, unknown>> {
  return (await import("./portal-bilhete")) as unknown as Record<string, unknown>;
}

function ehJws(valor: unknown): valor is string {
  return typeof valor === "string" && valor.split(".").length === 3 && valor.split(".").every((p) => p.length > 0);
}

/** Tenta as formas plausiveis de chamada. A primeira que devolver um JWS vale. */
function cunhar(fn: Cunhagem, chave: KeyObject): string {
  const tentativas: unknown[][] = [
    [ENTRADA, chave, null, AGORA],
    [ENTRADA, chave, "k1", AGORA],
    [ENTRADA, chave, AGORA],
    [ENTRADA, chave],
    [ENTRADA, PEM_PRIVADA, AGORA],
    [ENTRADA, PEM_PRIVADA],
    [ENTRADA, Buffer.from(PEM_PRIVADA, "utf8").toString("base64"), AGORA],
    [{ ...ENTRADA, chavePrivada: chave, agoraMs: AGORA_MS }],
    [{ ...ENTRADA, chavePrivada: chave }, AGORA],
  ];
  const erros: string[] = [];
  for (const args of tentativas) {
    try {
      const saida = fn(...args);
      if (ehJws(saida)) return saida;
      if (saida && typeof saida === "object") {
        const candidato = Object.values(saida as Record<string, unknown>).find(ehJws);
        if (candidato) return candidato;
      }
    } catch (erro) {
      erros.push((erro as Error).message);
    }
  }
  throw new Error(`nenhuma forma de chamada devolveu um bilhete. Erros: ${erros.join(" | ")}`);
}

async function bilheteCunhado(): Promise<{ header: Record<string, unknown>; claims: Record<string, unknown>; bruto: string }> {
  const mod = await carregarModulo();
  const nome = NOMES_DE_CUNHAGEM.find((n) => typeof mod[n] === "function");
  expect(
    nome,
    `\`portal/portal-bilhete.ts\` precisa exportar a cunhagem do bilhete. Procurados: ${NOMES_DE_CUNHAGEM.join(", ")}`,
  ).toBeDefined();
  const bruto = cunhar(mod[nome as string] as Cunhagem, privateKey);
  const [h, p] = bruto.split(".");
  return {
    header: JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as Record<string, unknown>,
    claims: JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as Record<string, unknown>,
    bruto,
  };
}

/** Todo numero que se parece com instante, normalizado para milissegundos. */
function instantesEmMs(claims: Record<string, unknown>): { campo: string; ms: number }[] {
  const achados: { campo: string; ms: number }[] = [];
  for (const [campo, valor] of Object.entries(claims)) {
    if (typeof valor !== "number" || !Number.isFinite(valor)) continue;
    // Segundos de epoch (dez digitos) e milissegundos (treze) sao os dois formatos em uso na casa.
    if (valor > 1_000_000_000 && valor < 10_000_000_000) achados.push({ campo, ms: valor * 1000 });
    else if (valor > 1_000_000_000_000 && valor < 10_000_000_000_000) achados.push({ campo, ms: valor });
  }
  return achados;
}

describe("B4: o prazo que viaja no bilhete e o da CREDENCIAL, nunca o da sessao", () => {
  it("nenhum instante dentro do bilhete ultrapassa os dez minutos da credencial", async () => {
    const { claims } = await bilheteCunhado();
    const instantes = instantesEmMs(claims);
    expect(instantes.length, "o bilhete precisa carregar ao menos um instante").toBeGreaterThan(0);
    const tolerancia = 2_000;
    for (const { campo, ms } of instantes) {
      expect(
        ms,
        `o claim \`${campo}\` estende o prazo EFETIVO da credencial para ${(ms - AGORA_MS) / 60_000} minutos. O teto e ${LIMITES_PORTAL.TTL_MS / 60_000} minutos, porque o emissor e sem estado e troca o mesmo bilhete por quantas URLs couberem dentro dele`,
      ).toBeLessThanOrEqual(EXPIRA_CREDENCIAL_MS + tolerancia);
    }
  });

  it("o prazo absoluto da credencial viaja no bilhete, para o emissor poder limitar a URL", async () => {
    const { claims } = await bilheteCunhado();
    const instantes = instantesEmMs(claims);
    const bate = instantes.some(({ ms }) => Math.abs(ms - EXPIRA_CREDENCIAL_MS) <= 2_000);
    expect(
      bate,
      "sem o instante final da credencial dentro do bilhete o emissor nao tem como limitar a URL ao MENOR entre o pedido e o teto dele",
    ).toBe(true);
  });

  it("o bilhete em si vive 60 segundos, porque so viaja do EA ao emissor", async () => {
    const { claims } = await bilheteCunhado();
    const instantes = instantesEmMs(claims);
    const curto = instantes.some(({ ms }) => ms - AGORA_MS > 0 && ms - AGORA_MS <= 90_000);
    expect(curto, "o bilhete precisa de expiracao propria e curta, na casa dos 60 segundos").toBe(true);
  });

  it("o bilhete e assinado com Ed25519, e o header declara isso", async () => {
    const { header } = await bilheteCunhado();
    expect(header.alg).toBe("EdDSA");
  });

  it("nenhum claim carrega dado pessoal: o emissor e um terceiro", async () => {
    const { claims } = await bilheteCunhado();
    const texto = JSON.stringify(claims);
    for (const [rotulo, valor] of Object.entries(PII)) {
      expect(texto.includes(valor), `o bilhete carrega \`${rotulo}\`, e o emissor nao precisa saber de quem e o arquivo`).toBe(false);
    }
    // O nome do objeto atravessa porque e opaco com pepper. Isso e desenho (secao 3, passo 4).
    expect(texto.includes(OBJETO)).toBe(true);
  });
});

describe("B4, a outra metade: o bilhete de troca NAO e o bilhete de sessao", () => {
  const ARQUIVO = join(__dirname, "portal-bilhete.ts");

  it("o modulo do bilhete existe e nao le o segredo da sessao", () => {
    expect(existsSync(ARQUIVO), "`portal/portal-bilhete.ts` ainda nao existe").toBe(true);
    const fonte = readFileSync(ARQUIVO, "utf8");
    expect(fonte).not.toContain("PORTAL_SESSION_SECRET");
    expect(fonte).not.toContain("portal-sessao.guard");
    expect(
      /from\s+["'][^"']*vt-link-token["']/.test(fonte),
      "§A.26: o bilhete COPIA a forma do token do VT, e nao importa aquele arquivo, que e producao validada de outra frente",
    ).toBe(false);
  });

  it("o prazo do bilhete nasce do limite da credencial, nao de uma constante avulsa", () => {
    const fontes = ["portal-bilhete.ts", "portal-emissor.service.ts", "portal-armazenamento.service.ts"]
      .map((nome) => join(__dirname, nome))
      .filter((caminho) => existsSync(caminho))
      .map((caminho) => readFileSync(caminho, "utf8"))
      .join("\n");
    expect(
      /LIMITES_PORTAL|expiraEm/.test(fontes),
      "o instante final que vai ao emissor precisa vir da credencial (`LIMITES_PORTAL.TTL_MS` ou `credencial.expiraEm`), nunca de um prazo escrito a mao no caminho do bilhete",
    ).toBe(true);
  });
});

describe("B4: o teto de dez minutos precisa ser IMPOSTO, nao combinado", () => {
  /**
   * O teste acima prova que um bilhete BEM montado respeita os dez minutos. Ele nao prova o furo
   * de B4, que e outro: o furo aparece quando ALGUEM monta o bilhete com um prazo maior. Como o
   * emissor e sem estado e troca o bilhete por quantas URLs couberem no prazo dele, um `abs` de
   * horas vindo de um chamador distraido, ou copiado do token de SESSAO do candidato, vira uma
   * credencial de horas sem nada falhar. Por isso o teto precisa morar no CODIGO que cunha, e nao
   * na disciplina de quem chama.
   */
  it("cunhar com prazo de horas RECUSA, ou corta no teto da credencial", async () => {
    const mod = (await import("./portal-bilhete")) as unknown as Record<string, unknown>;
    const nome = NOMES_DE_CUNHAGEM.find((n) => typeof mod[n] === "function");
    expect(nome).toBeDefined();
    const fn = mod[nome as string] as Cunhagem;

    const oitoHoras = Math.floor((AGORA_MS + 8 * 60 * 60_000) / 1000);
    const esticado = { ...ENTRADA, absEpoch: oitoHoras, ate: oitoHoras, ttlSegundos: 8 * 3600 };

    let bruto: string | null = null;
    try {
      bruto = cunhar(fn, privateKey) && (fn(esticado, privateKey, null, AGORA) as string);
    } catch {
      // Recusar e o desfecho preferido: o prazo errado morre na origem.
      return;
    }
    expect(ehJws(bruto), "a cunhagem devolveu algo que nao e bilhete").toBe(true);
    const claims = JSON.parse(Buffer.from((bruto as string).split(".")[1], "base64url").toString("utf8")) as Record<string, unknown>;
    for (const { campo, ms } of instantesEmMs(claims)) {
      expect(
        ms,
        `o claim \`${campo}\` aceitou um prazo de horas. B4 exige que o teto dos ${LIMITES_PORTAL.TTL_MS / 60_000} minutos seja imposto por codigo, nao confiado ao chamador`,
      ).toBeLessThanOrEqual(EXPIRA_CREDENCIAL_MS + 2_000);
    }
  });

  it("quem monta o bilhete de escrita tira o prazo da CREDENCIAL, e nao da sessao", () => {
    const caminhos = ["portal-armazenamento.service.ts", "portal-emissor.service.ts", "portal-credencial.service.ts"]
      .map((nome) => join(__dirname, nome))
      .filter((caminho) => existsSync(caminho));
    const montadores = caminhos
      .map((caminho) => ({ caminho, fonte: readFileSync(caminho, "utf8") }))
      .filter(({ fonte }) => /absEpoch|abs:\s|prazoAbsoluto/.test(fonte));

    expect(
      montadores.length,
      "nenhum arquivo do Portal monta o prazo absoluto do bilhete: ou a troca ainda nao foi ligada, ou ela nasceu sem o campo que B4 exige",
    ).toBeGreaterThan(0);

    for (const { caminho, fonte } of montadores) {
      const usaCredencial = /LIMITES_PORTAL\.TTL_MS|credencial\.expiraEm|expiraEm/.test(fonte);
      expect(usaCredencial, `${caminho} monta o prazo do bilhete sem referencia ao prazo da credencial`).toBe(true);
      expect(fonte.includes("PORTAL_SESSION_SECRET"), `${caminho} nao pode misturar o bilhete de troca com o de sessao`).toBe(false);
    }
  });
});
