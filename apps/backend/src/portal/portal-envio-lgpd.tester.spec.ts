import { describe, expect, it } from "vitest";
import { portalLinks } from "../db/schema";
import { fonteOuNulo, semComentarios } from "./portal-envio.tester-fake";

/**
 * ─ §A.6 DO ENVIO DO LINK, PROVADO NO ASSERT E NÃO NO COMENTÁRIO ────────────────────────────────
 *
 * Cobertura independente (§A.38/§A.40), escrita antes do código. Parte deste arquivo já roda VERDE
 * hoje, de propósito: ele é o CANÁRIO das allowlists que existem, e canário que só nasce junto com
 * o código não protege a semana em que o código está sendo escrito.
 *
 * O que ele protege, e o que acontece na produção se cair: a trilha do Portal é consultada por
 * humano e exportada; um campo `email` ou `url` acrescentado à allowlist põe credencial de acesso
 * a prontuário e dado pessoal dentro de um registro permanente, de onde não se tira mais.
 */

const FONTE_EVENTO = fonteOuNulo("domain", "portal-evento.ts") ?? "";

/** A allowlist de verdade, lida do código executável (comentário fora: ele usa as mesmas palavras). */
function camposPermitidos(): string[] {
  const limpo = semComentarios(FONTE_EVENTO);
  const bloco = limpo.match(/const CAMPOS_PERMITIDOS\s*=\s*\[([\s\S]*?)\]\s*as const/);
  return [...(bloco?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("CAMPOS_PERMITIDOS da trilha continua fechada (S2/S3/S4)", () => {
  it("a allowlist foi encontrada: sem isto, o resto deste bloco passaria vazio", () => {
    expect(FONTE_EVENTO.length, "`domain/portal-evento.ts` sumiu").toBeGreaterThan(0);
    expect(camposPermitidos().length).toBeGreaterThan(0);
  });

  /**
   * A LISTA EXATA É O CANÁRIO. Não é rigidez: acrescentar campo à trilha é decisão de segurança, e
   * ela tem de passar por uma linha vermelha antes de passar por uma revisão.
   */
  it("a lista é EXATAMENTE a de hoje: campo novo obriga uma decisão explícita", () => {
    expect(camposPermitidos()).toEqual([
      "codigoTipoDocumento",
      "bytes",
      "bytesMax",
      "tipoPermitido",
      "formato",
      "exp",
      "tentativaN",
      "janela",
      "ate",
      "regra",
      "acao",
      "assinatura",
      "autorId",
      "origem",
      "metodo",
    ]);
  });

  it.each(["email", "destino", "para", "url", "link", "token", "cpf", "telefone", "nome"])(
    "`%s` NÃO entrou na allowlist da trilha",
    (proibido) => {
      const achado = camposPermitidos().find((c) => c.toLowerCase().includes(proibido));
      expect(achado, `campo proibido na trilha: ${achado}`).toBeUndefined();
    },
  );
});

describe("`portal_links` guarda CARIMBO do envio, e nunca o endereço (S5/S6/S7)", () => {
  const colunas = Object.keys(portalLinks as unknown as Record<string, unknown>);

  /**
   * S6: endereço em claro em QUALQUER tabela é veto. O destino é derivado na hora, mascarado, a
   * partir do cadastro.
   */
  it.each(["email", "destino", "para", "url", "token", "telefone"])(
    "não existe coluna `%s`",
    (proibida) => {
      const achada = colunas.find((c) => c.toLowerCase().includes(proibida));
      expect(achada, `coluna proibida: ${achada}`).toBeUndefined();
    },
  );

  /**
   * S5/S7: o registro OPERACIONAL do envio mora aqui, e não só na trilha, que tem retenção e
   * sumiria do Gerenciador. Sem estas colunas, o item 4 da OST ("todo link aparece no Gerenciador,
   * independente da origem") não tem de onde sair, e o painel não sabe dizer se o link foi ou não
   * entregue ao candidato.
   */
  it("existe o carimbo do envio: quando, por qual canal e por qual origem", () => {
    const tem = (regex: RegExp) => colunas.some((c) => regex.test(c));
    expect(tem(/enviad/i), "falta a coluna do carimbo do envio").toBe(true);
    expect(tem(/canal/i), "falta a coluna do canal").toBe(true);
    expect(tem(/origem/i), "falta a coluna da origem (AUTOMATICO/MANUAL)").toBe(true);
  });
});

describe("os arquivos novos não logam, não persistem e não enfileiram PII (S2/S3/S4/S9)", () => {
  const ARQUIVOS = [
    ["domain", "portal-envio.ts"],
    ["portal", "portal-correio.service.ts"],
    ["portal", "portal-envio.service.ts"],
  ];

  it.each(ARQUIVOS)("%s/%s existe", (dir, arquivo) => {
    expect(fonteOuNulo(dir, arquivo), "arquivo de produção ainda não existe").not.toBeNull();
  });

  /**
   * LOG É O CAMINHO MAIS CURTO DE VOLTA PARA A PII, e ele não falha nada quando dá errado: o
   * endereço vai para o journald e fica. A leitura é por LINHA de código executável.
   */
  /**
   * O QUE SE PROCURA É O VALOR INTERPOLADO, e não a palavra.
   *
   * Uma primeira redação deste teste marcava QUALQUER linha de log que contivesse "token", e
   * pegou `this.log.error("o Google nao devolveu token de acesso")`, que é texto fixo e não vaza
   * nada. Falso positivo em teste de segurança custa caro duas vezes: some com o sinal e ensina
   * quem lê a ignorá-lo. O que vaza é o VALOR: `${email}`, `${url}`, ou a variável passada como
   * argumento.
   */
  it.each(ARQUIVOS)("nenhum log de %s/%s INTERPOLA endereço, URL ou token", (dir, arquivo) => {
    const fonte = fonteOuNulo(dir, arquivo);
    expect(fonte, "arquivo de produção ainda não existe").not.toBeNull();
    const suspeitas = semComentarios(fonte ?? "")
      .split("\n")
      .filter((l) => /(this\.log|logger|console)\s*\.\s*\w+\s*\(/i.test(l))
      .filter(
        (l) =>
          /\$\{[^}]*(email|destino|url|link|token|cpf)/i.test(l) ||
          /[,(]\s*\w*(email|destino|url|token|cpf)\w*\s*[,)]/i.test(l),
      );
    expect(suspeitas, "log com dado pessoal ou credencial interpolada").toEqual([]);
  });

  /** S9: o job leva `admissaoId`/`jti`. URL em payload de fila fica no Redis, legível. */
  it.each(ARQUIVOS)("nada em %s/%s enfileira endereço ou URL", (dir, arquivo) => {
    const fonte = semComentarios(fonteOuNulo(dir, arquivo) ?? "");
    const filas = fonte.split("\n").filter((l) => /\.\s*add\s*\(/.test(l));
    for (const linha of filas) {
      expect(linha, "payload de fila com PII").not.toMatch(/email|destino|url|link|token/i);
    }
  });

  /** O que se GRAVA: nenhum `values(...)`/`set(...)` pode carregar endereço nem URL. */
  it.each(ARQUIVOS)("nenhuma escrita de %s/%s grava endereço, URL ou token", (dir, arquivo) => {
    const fonte = semComentarios(fonteOuNulo(dir, arquivo) ?? "");
    const escritas = [...fonte.matchAll(/\.\s*(values|set)\s*\(\s*\{([\s\S]{0,400}?)\}/g)].map(
      (m) => m[2],
    );
    for (const bloco of escritas) {
      const chaves = [...bloco.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
      for (const chave of chaves) {
        expect(chave, `coluna proibida na escrita: ${chave}`).not.toMatch(
          /^(email|destino|para|url|link|token|cpf)$/i,
        );
      }
    }
  });
});
