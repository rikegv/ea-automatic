// @vitest-environment happy-dom
/**
 * ─ A SENHA DO IFRACTAL MASCARADA NO PRODUTO (decisão do diretor, 28/09/2026) ─────────────────────
 *
 * ESCRITO PELO `tester` (§A.38). São 124 credenciais desenhadas em TEXTO CLARO na tabela de produção,
 * e o conserto pedido é de UMA linha: o `<input>` da coluna de senha da aba IFRACTAL passa a ter
 * `type="password"`.
 *
 * ┌─ AS DUAS ASSERÇÕES SÃO DE NATUREZAS DIFERENTES, E ISSO ESTÁ DITO SEM MAQUIAGEM ──────────────┐
 * │ 1. A da TELA é ASSERÇÃO DE FONTE, não de render: `esteira/page.tsx` é uma página gigante, com    │
 * │    sessão, `fetch` e catálogos, e montá-la num harness custaria mais do que ela protegeria hoje.  │
 * │    Ler a fonte prova o atributo no lugar certo, e não prova o que o browser pinta. É o que é.     │
 * │ 2. A do GATE é COMPORTAMENTAL, de verdade: `textoAuditavel` pula `input[type=password]`, então o  │
 * │    mesmo conserto que mascara o campo é o que destrava o print daquela aba. Essa metade é medida   │
 * │    num DOM real (happy-dom), com valor injetado.                                                 │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: a "senha" das fixtures é inventada e não é credencial de ninguém.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditarTexto, textoAuditavel, type AllowlistArnes } from "./pii";

/**
 * O CAMINHO SAI DE `import.meta.url` NA MÃO, e não de `fileURLToPath(new URL(...))`: neste arquivo o
 * ambiente é `happy-dom`, cujo `URL` global não é o do Node, e a conversão estoura com "The URL must
 * be of scheme file". Recortar o prefixo é feio e é o que funciona nos dois ambientes.
 */
const AQUI = path.dirname(import.meta.url.replace(/^file:\/\//, ""));
const RAIZ_REPO = path.resolve(AQUI, "../../../../");
const ESTEIRA = path.join(RAIZ_REPO, "apps/frontend/src/app/(app)/esteira/page.tsx");

/** O elemento JSX inteiro que contém um marcador, do `<input` até o `/>` que o fecha. */
function elementoQueContem(fonte: string, marcador: string): string {
  const pos = fonte.indexOf(marcador);
  if (pos === -1) return "";
  const abre = fonte.lastIndexOf("<input", pos);
  const fecha = fonte.indexOf("/>", pos);
  return abre === -1 || fecha === -1 ? "" : fonte.slice(abre, fecha + 2);
}

describe("ASSERÇÃO DE FONTE: o campo de senha da aba IFRACTAL é `type=password`", () => {
  const fonte = readFileSync(ESTEIRA, "utf8");

  it("o `<input>` da senha declara `type=\"password\"`", () => {
    const elemento = elementoQueContem(fonte, "Senha do iFractal");
    expect(elemento, "o input da senha do iFractal foi encontrado na fonte").not.toBe("");
    expect(elemento).toMatch(/type=\s*"password"/);
  });

  /**
   * O CAMPO DE LOGIN **NÃO** VIRA SENHA, e a asserção existe para travar o excesso de zelo: mascarar o
   * login tiraria da operação a única coluna pela qual ela reconhece a linha, e isso o diretor não
   * pediu (§A.14). O que ele pediu foi credencial, e credencial é a senha.
   */
  it("o campo de LOGIN continua em texto claro", () => {
    const elemento = elementoQueContem(fonte, "Login do iFractal");
    expect(elemento).not.toBe("");
    expect(elemento).not.toMatch(/type=\s*"password"/);
  });

  it("a senha continua EDITÁVEL: o conserto é de exibição, não de bloqueio", () => {
    const elemento = elementoQueContem(fonte, "Senha do iFractal");
    expect(elemento).toMatch(/onChange=/);
    expect(elemento).not.toMatch(/\bdisabled\b/);
    expect(elemento).not.toMatch(/\breadOnly\b/);
  });
});

describe("COMPORTAMENTO: o gate de PII não lê o valor de um campo de senha", () => {
  const ALLOWLIST: AllowlistArnes = {
    nomes: ["Mariana Alves Ribeiro"],
    cpfs: ["99900000191"],
    emails: ["mariana.alves@exemplo.invalid"],
  };
  const SENHA = "Tr0va-Inventada-99";

  const montar = (tipo: string) => {
    const raiz = document.createElement("div");
    const input = document.createElement("input");
    input.setAttribute("type", tipo);
    input.setAttribute("aria-label", "Senha do iFractal de Mariana Alves Ribeiro");
    input.value = SENHA;
    raiz.appendChild(input);
    return raiz;
  };

  it("`textoAuditavel` OMITE o valor quando o campo é de senha", () => {
    expect(textoAuditavel(montar("password"))).not.toContain(SENHA);
  });

  /**
   * O CONTRASTE É O PONTO: sem o `type`, o mesmo valor VAI para o texto auditado, e daí para o PNG. É
   * o estado anterior ao conserto, e é por isso que aquela aba não podia ser capturada.
   */
  it("sem `type=password`, o MESMO valor entra no texto auditado", () => {
    expect(textoAuditavel(montar("text"))).toContain(SENHA);
  });

  /**
   * A DECLARAÇÃO DE SENHA REAL NA ALLOWLIST É PROIBIDA, e este teste é o que impede a "solução" mais
   * tentadora: declarar a credencial em `senhas` para o gate parar de reclamar. A allowlist é o que
   * PODE APARECER no print, e credencial de gente não pode aparecer em lugar nenhum.
   */
  it("o gate recusa a senha quando ela aparece como TEXTO na tela", () => {
    const v = auditarTexto(`senha ${SENHA}`, { ...ALLOWLIST, senhas: [SENHA] });
    // Declarada, ela passa: é o arnês assumindo tê-la criado. O que não pode é a do CLIENTE ali.
    expect(v.aprovado).toBe(true);
    expect(auditarTexto(`senha ${SENHA}`, ALLOWLIST).aprovado).toBe(false);
  });
});
