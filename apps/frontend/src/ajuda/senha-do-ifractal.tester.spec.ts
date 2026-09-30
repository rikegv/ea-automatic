// @vitest-environment happy-dom
/**
 * ─ A SENHA DO IFRACTAL FICA VISÍVEL NO PRODUTO (decisão do diretor, §A.45, 30/09/2026) ───────────
 *
 * ESTE ARQUIVO TROCOU DE LADO, e o registro fica aqui de propósito. Em 28/09 ele travava o
 * MASCARAMENTO (`type="password"`) do campo de senha da aba IFRACTAL, tratado como conserto de
 * segurança a partir da medição de 124 credenciais em texto claro. O mascaramento subiu, QUEBROU A
 * OPERAÇÃO (o time cadastra a senha e precisa LÊ-LA para repassar ao candidato) e foi REVERTIDO.
 *
 * Agora ele trava o contrário: a senha CONTINUA EM TEXTO CLARO. O fundamento é o da §A.45, a senha é
 * PROVISÓRIA e existe para ser repassada, e quem opera a tabela já acessa esses dados no dia a dia.
 * Auditoria futura que mascarar o campo de novo quebra este teste ANTES de chegar na operação.
 *
 * ┌─ AS DUAS ASSERÇÕES SÃO DE NATUREZAS DIFERENTES, E ISSO ESTÁ DITO SEM MAQUIAGEM ──────────────┐
 * │ 1. A da TELA é ASSERÇÃO DE FONTE, não de render: `esteira/page.tsx` é uma página gigante, com    │
 * │    sessão, `fetch` e catálogos, e montá-la num harness custaria mais do que ela protegeria hoje.  │
 * │    Ler a fonte prova o atributo no lugar certo, e não prova o que o browser pinta. É o que é.     │
 * │ 2. A do GATE é COMPORTAMENTAL e segue válida, porque é sobre `pii.ts` e não sobre o produto:     │
 * │    `textoAuditavel` pula `input[type=password]`. Com o campo visível, o valor ENTRA no texto     │
 * │    auditado, e é por isso que a captura desta aba precisa de tratamento próprio no arnês.        │
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

describe("ASSERÇÃO DE FONTE: o campo de senha da aba IFRACTAL fica VISÍVEL", () => {
  const fonte = readFileSync(ESTEIRA, "utf8");

  /**
   * A REGRA DURA DA §A.45: o `<input>` da senha NÃO declara `type="password"`. Mascarar este campo
   * quebra a operação, porque a senha do iFractal é provisória e o time precisa lê-la na linha para
   * repassar ao candidato. Quem tentar mascarar de novo quebra aqui.
   */
  it("o `<input>` da senha NÃO declara `type=\"password\"`", () => {
    const elemento = elementoQueContem(fonte, "Senha do iFractal");
    expect(elemento, "o input da senha do iFractal foi encontrado na fonte").not.toBe("");
    expect(elemento).not.toMatch(/type=\s*"password"/);
  });

  /**
   * O CAMPO DE LOGIN TAMBÉM CONTINUA EM TEXTO CLARO, pelo mesmo fundamento e por um a mais: ele é a
   * única coluna pela qual a operação reconhece a linha.
   */
  it("o campo de LOGIN continua em texto claro", () => {
    const elemento = elementoQueContem(fonte, "Login do iFractal");
    expect(elemento).not.toBe("");
    expect(elemento).not.toMatch(/type=\s*"password"/);
  });

  it("a senha continua EDITÁVEL e sem bloqueio de leitura", () => {
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
