import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { Papel } from "@ea/shared-types";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MenuGuard } from "../auth/guards/menu.guard";
import type { MenuAreasService } from "../auth/menu-areas.service";
import type { MenusService } from "../auth/menus.service";
import { menuDaOperacao } from "../domain/menus";
import { PORTAL_EVENTOS, PORTAL_MOTIVOS } from "../domain/portal-evento";
import { PortalPainelController } from "./portal-painel.controller";

/**
 * AS SETE TRAVAS DO ACESSO POR E-MAIL, escritas pelo `tester` INDEPENDENTE (§A.38).
 *
 * As seis primeiras são as condições que a auditoria de desenho exigiu e vai REAUDITAR; a sétima é
 * do coordenador. Elas não medem comportamento de função pura (isso é
 * `portal-acesso-email.tester.spec.ts`): medem INVARIANTES sobre o código que a porta nova
 * introduziu, no molde que `portal-suspensao-verificada.spec.ts` já usa, mais um teste
 * COMPORTAMENTAL de RBAC no molde de `as/motivos-cancelamento/...rbac-comportamental.spec.ts`.
 *
 * ┌─ POR QUE VARREDURA DE FONTE, E NÃO SÓ TESTE DE COMPORTAMENTO ────────────────────────────────┐
 * │ O que a auditoria vetou na v1 não foi um retorno errado: foi um CAMINHO existir. "Buscar a     │
 * │ admissão pelo CPF digitado" devolve o resultado certo em todo teste de caminho feliz, e erra   │
 * │ só quando quem tem a caixa de e-mail digita o CPF de um terceiro. Invariante de ausência       │
 * │ ("este padrão não existe em lugar nenhum do arquivo") é o que se pode PROVAR sem enumerar      │
 * │ todos os estados do banco, e é o que sobrevive ao próximo refactor.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ OS COMENTÁRIOS SAEM ANTES DE QUALQUER ASSERÇÃO, e isso é cicatriz ─────────────────────────┐
 * │ O teste estrutural anterior deste `tester` reprovou o módulo por ele DOCUMENTAR a própria      │
 * │ regra: a asserção lia o arquivo cru e casou com o comentário que PROÍBE `Math.random`. Código  │
 * │ que explica a regra não pode ser lido como violação dela, senão o teste ensina a não comentar. │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * O controller da porta nova pode ainda NÃO EXISTIR quando isto rodar. Falhar por ausência do
 * arquivo é o comportamento pedido: nada aqui é comentado e nenhum stub é criado.
 */

const DIR = __dirname;
const SERVICO = join(DIR, "portal-acesso-email.service.ts");
const CONTROLLER = join(DIR, "portal-acesso-email.controller.ts");
const PAINEL_CONTROLLER = join(DIR, "portal-painel.controller.ts");
const PORTAL_CONTROLLER = join(DIR, "portal.controller.ts");
const PORTAL_DTO = join(DIR, "portal.dto.ts");
const EVENTO = join(DIR, "../domain/portal-evento.ts");

/** Tira comentário de bloco e de linha. Ver o cabeçalho: a régua é sobre o CÓDIGO. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Lê a fonte sem comentários. Arquivo ausente é FALHA, com o caminho na mensagem. */
function fonteDe(caminho: string): string {
  expect(existsSync(caminho), `arquivo ainda não existe: ${caminho}`).toBe(true);
  return semComentarios(readFileSync(caminho, "utf8"));
}

/** Remove literais de texto entre aspas, mantendo o template literal (onde a interpolação mora). */
function semTextos(fonte: string): string {
  return fonte.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

/**
 * Esvazia o TEXTO dos templates e preserva só as interpolações.
 *
 * É a diferença entre a PALAVRA e o VALOR, e ela já produziu um vermelho injusto aqui: o serviço tem
 * um log legítimo que diz "falha ao emitir o codigo de acesso", e procurar a palavra reprovava a
 * mensagem que explica a falha. O que não pode atravessar é `${codigo}`, e é isso que sobra depois
 * desta limpeza.
 */
function semTextoDeTemplate(fonte: string): string {
  return fonte.replace(/`(?:[^`\\]|\\.)*`/g, (t) => {
    const partes = [...t.matchAll(/\$\{([^}]*)\}/g)].map((m) => `\${${m[1]}}`);
    return `\`${partes.join("")}\``;
  });
}

/**
 * Corpo de um método ou de uma classe, por contagem de chaves.
 *
 * A LISTA DE PARÂMETROS É PULADA DE PROPÓSITO: em `async solicitar(entrada: { email... })` o primeiro
 * `{` depois da assinatura é o TIPO DO PARÂMETRO, e a primeira versão deste helper leu o objeto de
 * entrada acreditando que era o corpo. O salto só acontece quando existe parêntese antes da chave,
 * para que `export class X` (que não tem lista de parâmetros) continue funcionando.
 */
function corpoDoMetodo(fonte: string, assinatura: string): string {
  const inicio = fonte.indexOf(assinatura);
  expect(inicio, `assinatura não encontrada: ${assinatura}`).toBeGreaterThan(-1);
  const proximoParen = fonte.indexOf("(", inicio);
  const proximaChave = fonte.indexOf("{", inicio);
  let desde = inicio;
  if (proximoParen !== -1 && (proximaChave === -1 || proximoParen < proximaChave)) {
    let nivelParen = 0;
    for (let i = proximoParen; i < fonte.length; i += 1) {
      if (fonte[i] === "(") nivelParen += 1;
      else if (fonte[i] === ")") {
        nivelParen -= 1;
        if (nivelParen === 0) {
          desde = i;
          break;
        }
      }
    }
  }
  const abre = fonte.indexOf("{", desde);
  let nivel = 0;
  for (let i = abre; i < fonte.length; i += 1) {
    if (fonte[i] === "{") nivel += 1;
    else if (fonte[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return fonte.slice(abre + 1, i);
    }
  }
  throw new Error(`fim do método não encontrado: ${assinatura}`);
}

/** Argumentos de cada chamada de `alvo` (que termina no parêntese de abertura). */
function chamadasDe(fonte: string, alvo: string): string[] {
  const achadas: string[] = [];
  let de = 0;
  for (;;) {
    const i = fonte.indexOf(alvo, de);
    if (i === -1) break;
    const abre = i + alvo.length - 1;
    let nivel = 0;
    let fim = abre;
    for (let j = abre; j < fonte.length; j += 1) {
      if (fonte[j] === "(") nivel += 1;
      else if (fonte[j] === ")") {
        nivel -= 1;
        if (nivel === 0) {
          fim = j;
          break;
        }
      }
    }
    achadas.push(fonte.slice(abre + 1, fim));
    de = fim + 1;
  }
  return achadas;
}

/**
 * Todos os blocos de uma chamada, com o intervalo que cada um ocupa no arquivo.
 *
 * Serve para perguntar "isto está DENTRO da mesma chamada que aquilo?" em vez de "isto está perto
 * daquilo?". Perto é distância, e distância muda em qualquer refactor; dentro é sintaxe.
 */
function blocosDeChamada(fonte: string, alvo: string): { inicio: number; fim: number; texto: string }[] {
  const blocos: { inicio: number; fim: number; texto: string }[] = [];
  let de = 0;
  for (;;) {
    const i = fonte.indexOf(alvo, de);
    if (i === -1) break;
    const abre = i + alvo.length - 1;
    let nivel = 0;
    let fim = abre;
    for (let j = abre; j < fonte.length; j += 1) {
      if (fonte[j] === "(") nivel += 1;
      else if (fonte[j] === ")") {
        nivel -= 1;
        if (nivel === 0) {
          fim = j;
          break;
        }
      }
    }
    blocos.push({ inicio: abre, fim, texto: fonte.slice(abre + 1, fim) });
    de = i + alvo.length;
  }
  return blocos;
}

/**
 * Todos os métodos da classe, com o intervalo que cada corpo ocupa.
 *
 * É a unidade de recorte das travas de CO-OCORRÊNCIA: "existe `travar` sem `registrar` NO MESMO
 * MÉTODO?" é uma pergunta que se responde sem banco, e é a que pega a linha de trilha apagada.
 */
function metodosDaClasse(fonte: string): { nome: string; inicio: number; fim: number; texto: string }[] {
  const metodos: { nome: string; inicio: number; fim: number; texto: string }[] = [];
  const naoSaoMetodos = new Set(["constructor", "if", "for", "while", "switch", "catch", "return"]);
  for (const m of fonte.matchAll(/^ {2}(?:private |public |protected )?(?:async )?([A-Za-z_$][\w$]*)\s*\(/gm)) {
    const nome = m[1];
    if (naoSaoMetodos.has(nome)) continue;
    const inicio = m.index ?? 0;
    const abreParen = fonte.indexOf("(", inicio);
    let nivelParen = 0;
    let fechaParen = abreParen;
    for (let i = abreParen; i < fonte.length; i += 1) {
      if (fonte[i] === "(") nivelParen += 1;
      else if (fonte[i] === ")") {
        nivelParen -= 1;
        if (nivelParen === 0) {
          fechaParen = i;
          break;
        }
      }
    }
    const abre = fonte.indexOf("{", fechaParen);
    if (abre === -1) continue;
    let nivel = 0;
    for (let i = abre; i < fonte.length; i += 1) {
      if (fonte[i] === "{") nivel += 1;
      else if (fonte[i] === "}") {
        nivel -= 1;
        if (nivel === 0) {
          metodos.push({ nome, inicio: abre, fim: i, texto: fonte.slice(abre + 1, i) });
          break;
        }
      }
    }
  }
  return metodos;
}

/** O método que contém um dado índice do arquivo, o mais interno deles. */
function metodoQueContem(
  metodos: { nome: string; inicio: number; fim: number; texto: string }[],
  indice: number,
): { nome: string; inicio: number; fim: number; texto: string } | undefined {
  return metodos
    .filter((mt) => indice > mt.inicio && indice < mt.fim)
    .sort((a, b) => b.inicio - a.inicio)[0];
}

/** Nomes de métodos da própria classe chamados dentro de um texto (`this.nome(`). */
function chamadosDentro(texto: string): string[] {
  return [...texto.matchAll(/this\.([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]);
}

/**
 * O ALCANCE de um trecho: ele mesmo, os métodos que ele chama e os métodos que o chamam.
 *
 * É o que torna a régua de co-ocorrência resistente a DELEGAÇÃO, e isso não é hipótese: enquanto eu
 * escrevia, o ramo do e-mail ambíguo passou a chamar um método novo, e uma régua que só olhasse o
 * ramo teria ficado vermelha sem haver defeito. A pergunta certa não é "a linha está aqui?", é "a
 * linha está no caminho?". As duas direções são necessárias: o travamento genérico registra no
 * CHAMADOR, e o travamento por ambiguidade registra no CHAMADO.
 */
function textoDoAlcance(
  metodos: { nome: string; texto: string }[],
  trecho: string,
  nome?: string,
): string {
  const chamados = chamadosDentro(trecho)
    .map((n) => metodos.find((mt) => mt.nome === n)?.texto ?? "")
    .join("\n");
  const chamadores = nome
    ? metodos.filter((mt) => mt.texto.includes(`this.${nome}(`)).map((mt) => mt.texto).join("\n")
    : "";
  return [trecho, chamados, chamadores].join("\n");
}

/** O bloco de um `if (condicao) { ... }`, recortado por contagem de chaves. */
function blocoDoIf(fonte: string, condicao: string): string {
  const i = fonte.indexOf(condicao);
  expect(i, `condição não encontrada: ${condicao}`).toBeGreaterThan(-1);
  const abre = fonte.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < fonte.length; j += 1) {
    if (fonte[j] === "{") nivel += 1;
    else if (fonte[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return fonte.slice(abre + 1, j);
    }
  }
  throw new Error(`fim do bloco não encontrado: ${condicao}`);
}

/** Nomes das chaves do ÚLTIMO objeto literal do texto, inclusive na forma abreviada. */
function chavesDoUltimoObjeto(texto: string): string[] {
  const abre = texto.lastIndexOf("{");
  const fecha = texto.lastIndexOf("}");
  if (abre === -1 || fecha === -1 || fecha < abre) return [];
  return texto
    .slice(abre + 1, fecha)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => /^([A-Za-z_$][\w$]*)/.exec(p)?.[1] ?? p);
}

/** Itens de um array de literais de texto declarado no arquivo, por nome da constante. */
function itensDaLista(fonte: string, nome: string): string[] {
  const i = fonte.indexOf(nome);
  expect(i, `constante não encontrada: ${nome}`).toBeGreaterThan(-1);
  const fim = fonte.indexOf("]", i);
  return [...fonte.slice(i, fim).matchAll(/"([A-Za-z_0-9]+)"/g)].map((m) => m[1]);
}

/** Nomes importados de um módulo, pelo caminho do import. */
function importadosDe(fonte: string, modulo: string): string[] {
  const re = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"${modulo.replace(/[./]/g, "\\$&")}"`);
  const m = re.exec(fonte);
  expect(m, `import de "${modulo}" não encontrado`).not.toBeNull();
  return (m as RegExpExecArray)[1]
    .split(",")
    .map((s) => s.replace(/^type\s+/, "").trim())
    .filter(Boolean);
}

// ══ TRAVA 1: ZERO BUSCA POR CPF ════════════════════════════════════════════════════════════════

describe("trava 1: a admissão vem do VÍNCULO, e o CPF do corpo NUNCA acha pessoa", () => {
  /**
   * ESTA É A CORREÇÃO DO VETO, e vale relembrar o que ela impede: na v1 quem tinha a caixa de e-mail
   * de um candidato do funil digitava o CPF de um TERCEIRO, a trava de divergência não acusava nada
   * (ficha sem CPF, e nulo não discorda de nada) e o Portal do terceiro abria. A defesa não é uma
   * condição a mais: é a busca por CPF DEIXAR DE EXISTIR.
   */
  it("o serviço não importa a tabela `candidatos` da esteira (não há por onde procurar por CPF nela)", () => {
    const importados = importadosDe(fonteDe(SERVICO), "../db/schema");
    expect(importados).not.toContain("candidatos");
    expect(importados).toContain("asCandidaturas");
    expect(importados).toContain("admissoes");
  });

  it("não existe igualdade de CPF contra `candidatos` nem contra `admissoes` em lugar nenhum", () => {
    const fonte = fonteDe(SERVICO);
    for (const padrao of [
      "candidatos.cpf",
      "candidatoCpf",
      "candidato_cpf",
      "from(candidatos)",
      "eq(admissoes.candidatoCpf",
    ]) {
      expect(fonte, `padrão de busca por CPF encontrado: ${padrao}`).not.toContain(padrao);
    }
  });

  it("TODA igualdade sobre `asCandidatos.cpf` é conferência de COLISÃO, nunca busca de pessoa", () => {
    // A diferença entre as duas coisas cabe em uma cláusula: colisão é `eq(cpf) and ne(id)`, sobre um
    // candidato JÁ determinado pelo bilhete; busca é `eq(cpf)` sozinha, que é o que devolve gente
    // que quem chamou não tinha o direito de alcançar. Se aparecer um `eq(asCandidatos.cpf` sem o
    // `ne(asCandidatos.id` por perto, é busca, e é o veto de volta.
    //
    // ┌─ A PRIMEIRA VERSÃO DESTA TRAVA ERA DRIBLÁVEL POR DISTÂNCIA (mutação M3 da auditoria) ─────┐
    // │ Ela fatiava 400 CARACTERES para a frente e procurava o `ne(...)` no pedaço. Um `eq(cpf)` de │
    // │ BUSCA plantado poucas linhas ANTES da conferência legítima passava verde, porque a janela   │
    // │ dele alcançava o `ne(...)` da consulta VIZINHA. A trava dependia de onde as coisas estão no │
    // │ arquivo, que é a primeira coisa que um refactor muda.                                       │
    // │                                                                                            │
    // │ A régua agora é SINTÁTICA: a igualdade tem de estar na MESMA cadeia `.where(...)` que a     │
    // │ cláusula de outro candidato, com o bloco recortado por contagem de parênteses. Duas         │
    // │ consultas vizinhas deixam de se cobrir, porque cada `.where(` é um bloco próprio.           │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    const fonte = fonteDe(SERVICO);
    const ocorrencias = [...fonte.matchAll(/eq\(\s*asCandidatos\.cpf/g)].map((m) => m.index ?? 0);
    expect(ocorrencias.length, "nenhuma igualdade de CPF encontrada, o teste perdeu o alvo").toBeGreaterThan(0);
    const wheres = blocosDeChamada(fonte, ".where(");
    for (const i of ocorrencias) {
      const dono = wheres
        .filter((b) => i > b.inicio && i < b.fim)
        .sort((a, b) => b.inicio - a.inicio)[0];
      expect(dono, "igualdade de CPF fora de qualquer `.where(...)`: é busca solta").toBeDefined();
      expect(
        dono.texto,
        "igualdade de CPF sem a cláusula de outro candidato NA MESMA consulta: isto é busca por CPF",
      ).toContain("ne(asCandidatos.id");
    }
  });

  it("não existe SQL CRU tocando a tabela de candidatos nem comparando CPF", () => {
    // ┌─ A SEGUNDA FRESTA (mutação M6 da auditoria): o Drizzle não é o único jeito de consultar ──┐
    // │ Uma busca escrita como sql`select id from as_candidatos where cpf = ${cpf}` é INVISÍVEL a   │
    // │ todo padrão que olhe a forma do Drizzle, e faria exatamente o que o veto proibiu. Hoje não  │
    // │ existe SQL cru assim neste arquivo, então este teste nasce VERDE e serve de CANÁRIO: ele    │
    // │ está aqui para impedir o RETORNO do padrão, que é a função da trava.                        │
    // │                                                                                            │
    // │ O DISCRIMINADOR É A CAIXA, e ele é preciso: nome de tabela em SQL cru é `as_candidatos`     │
    // │ (minúsculo, com sublinhado), e o símbolo do Drizzle é `asCandidatos` (com maiúscula). Buscar │
    // │ "candidatos" em minúsculas separa um do outro sem falso positivo.                            │
    // │                                                                                            │
    // │ O `pg_advisory_xact_lock(hashtextextended(${cpf}, 0))` é LEGÍTIMO e continua passando: ele   │
    // │ usa o CPF como CHAVE DE TRAVA do Postgres, exigência da seção 5 do contrato, e não compara  │
    // │ coluna nenhuma. Por isso a régua proíbe COMPARAÇÃO de cpf, não a palavra.                    │
    // └────────────────────────────────────────────────────────────────────────────────────────────┘
    const fonte = fonteDe(SERVICO);
    const templates = [...fonte.matchAll(/sql`([^`]*)`/g)].map((m) => m[1]);
    expect(templates.length, "nenhum template de SQL encontrado, o teste perdeu o alvo").toBeGreaterThan(0);
    for (const t of templates) {
      expect(t, `nome de tabela de candidato em SQL cru: ${t}`).not.toContain("candidatos");
      expect(t, `comparação de CPF em SQL cru: ${t}`).not.toMatch(/\bcpf\s*(=|==|in\b|like\b|~)/i);
      expect(t, `subconsulta em SQL cru: ${t}`).not.toMatch(/\bselect\b[\s\S]*\bfrom\b/i);
    }
  });

  it("a resolução da admissão passa pelo VÍNCULO `as_candidaturas` e junta `admissoes` pelo id", () => {
    const fonte = fonteDe(SERVICO);
    expect(fonte).toContain("from(asCandidaturas)");
    expect(fonte).toMatch(/innerJoin\(\s*admissoes,\s*eq\(admissoes\.id,\s*asCandidaturas\.admissaoId\)/);
    expect(fonte).toContain("eq(asCandidaturas.candidatoId");
  });

  it("a porta não devolve NADA da pessoa, nem nome, nem e-mail, nem e-mail MASCARADO", () => {
    // O `emailMascarado` foi TIRADO do contrato pela auditoria (condição 1): ele entrega o domínio de
    // um endereço cuja posse o chamador não provou. Tirar do TIPO não basta, e é o ponto desta trava:
    // campo montado por espalhamento (`...(x ? { emailMascarado: x } : {})`) NÃO é barrado por
    // verificação de propriedade excedente do TypeScript, então ele continua indo na resposta HTTP
    // com o tipo já limpo. A ausência precisa ser cobrada no CÓDIGO, não só no vocabulário.
    const fonte = fonteDe(SERVICO);
    for (const padrao of ["emailMascarado", "nomeParcial", "mascararNome", "nome: ficha"]) {
      expect(fonte, `dado da pessoa na resposta: ${padrao}`).not.toContain(padrao);
    }
  });

  it("a porta nova não emite sessão do Portal (o que a v1 fazia e a auditoria vetou)", () => {
    // A chave de acesso continua sendo link + CPF + nascimento em `POST portal/identificar`. Nenhuma
    // função de cunhagem de sessão pode ser alcançável daqui.
    const fonte = fonteDe(SERVICO);
    for (const padrao of ["cunharSessao", "minutosDaSessao", "PortalSessao", "sessao:"]) {
      expect(fonte, `caminho de sessão encontrado: ${padrao}`).not.toContain(padrao);
    }
  });
});

// ══ TRAVA 2: ZERO ESCRITA EM `portal_links` ════════════════════════════════════════════════════

describe("trava 2: `portal_links` tem UM ponto de escrita no sistema, e não é este", () => {
  it("o serviço não insere, não atualiza e não apaga `portal_links`", () => {
    // Ler para descobrir quem emitiu o link anterior é legítimo (é como esta porta acha o AUTOR do
    // envio). Escrever seria pôr um `insert` de CREDENCIAL num arquivo que roda para o público.
    const fonte = fonteDe(SERVICO);
    for (const padrao of ["insert(portalLinks", "update(portalLinks", "delete(portalLinks"]) {
      expect(fonte, `escrita em portal_links encontrada: ${padrao}`).not.toContain(padrao);
    }
  });

  it("a emissão é DELEGADA ao serviço de envio que já existe", () => {
    const fonte = fonteDe(SERVICO);
    expect(fonte).toContain("PortalEnvioService");
    expect(fonte).toMatch(/this\.envio\.enviarParaAdmissao\(/);
    // E não recunha o bilhete do link por conta própria.
    expect(fonte).not.toContain("cunharLink");
  });
});

// ══ TRAVA 3: RESPOSTA ÚNICA DE `solicitar` ═════════════════════════════════════════════════════

describe("trava 3: `solicitar` responde a mesma coisa para todo e-mail", () => {
  /**
   * OS CINCO CASOS QUE TÊM DE SER INDISTINGUÍVEIS: e-mail inexistente, existente, AMBÍGUO (duas
   * fichas), TRAVADO e ANONIMIZADO. Instanciar o serviço para medir os cinco exigiria banco, então a
   * prova aqui é de FORMA, e é mais forte do que cinco casos: se existe UM só ponto de retorno, e
   * ele é uma constante montada antes de qualquer consulta, então não há como os cinco diferirem,
   * inclusive nos casos que ninguém pensou em testar.
   */
  it("existe UM único valor de retorno, montado ANTES de qualquer consulta", () => {
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const declaracao = corpo.indexOf("const resposta");
    expect(declaracao, "a resposta não é montada em uma constante").toBeGreaterThan(-1);
    const primeiroAwait = corpo.indexOf("await");
    expect(primeiroAwait, "método sem await, o teste perdeu o alvo").toBeGreaterThan(-1);
    expect(declaracao, "a resposta é montada depois de uma consulta").toBeLessThan(primeiroAwait);
    expect(corpo).toMatch(/enviado:\s*true/);
    expect(corpo).toMatch(/expiraEmMinutos:\s*Math\.round\(CODIGO_TTL_MS/);
  });

  it("TODO `return` de `solicitar` devolve a MESMA constante, e nenhum devolve dado do candidato", () => {
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const retornos = [...corpo.matchAll(/return\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(retornos.length, "método sem retorno, o teste perdeu o alvo").toBeGreaterThan(1);
    for (const r of retornos) expect(r, `retorno diferente da constante única: ${r}`).toBe("resposta");
  });

  it("`solicitar` não lança nada por conta própria (status diferente também é resposta diferente)", () => {
    // Um `throw` no meio do método faria o e-mail que existe responder 200 e o outro responder 4xx,
    // que é o oráculo de enumeração com outra roupa. A única recusa permitida é a de CONFIGURAÇÃO
    // (503, igual para todo mundo), e ela mora em um método próprio chamado antes da resolução.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    expect(corpo).not.toContain("throw ");
    expect(corpo).toContain("this.exigirConfiguracao()");
  });

  it("o e-mail ambíguo TRAVA e nem chega a emitir código", () => {
    // O ramo ambíguo tem de SAIR antes da emissão, e a prova é a ordem no método mais o `return`
    // dentro do ramo. A régua olha a CHAMADA de travamento, não o literal do motivo: o ramo passou a
    // delegar para um método próprio enquanto isto era escrito, e o literal saiu daqui sem que nada
    // de errado tivesse acontecido.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const ramo = blocoDoIf(corpo, "candidatos.length > 1");
    expect(ramo, "o ramo ambíguo não trava ninguém").toMatch(/this\.travar[A-Za-z]*\(/);
    expect(ramo, "o ramo ambíguo não interrompe o fluxo").toContain("return resposta;");
    const posRamo = corpo.indexOf("candidatos.length > 1");
    const posEmissao = corpo.indexOf("emitirEEnviarCodigo");
    expect(posEmissao, "a emissão do código não existe").toBeGreaterThan(-1);
    expect(posRamo, "o ramo de ambiguidade vem depois da emissão").toBeLessThan(posEmissao);
  });

  it("a ficha ANONIMIZADA cai no mesmo silêncio, e a cláusula está no filtro da consulta", () => {
    // Ler a ficha expurgada para descartar depois é ler dado que a LGPD manda esquecer, e o
    // descarte posterior seria um ramo a mais, ou seja, mais uma chance de os caminhos diferirem.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    expect(corpo).toContain("isNull(asCandidatos.anonimizadoEm)");
  });
});

// ══ TRAVA 4: DIVERGÊNCIA E COLISÃO DE ÍNDICE DÃO A MESMA RESPOSTA ══════════════════════════════

describe("trava 4: divergência e violação de `uq_as_candidatos_cpf` desembocam na MESMA linha", () => {
  it("o `catch` do 23505 devolve o MESMO desfecho que a decisão de travar", () => {
    // Sem isto, a corrida (duas gravações no mesmo instante) sairia como 500 enquanto o caso normal
    // sai como recusa neutra, e a diferença de status conta a quem tentou que o CPF já existe.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async identidade(");
    expect(corpo).toContain("ehViolacaoDeUnique");
    const doCatch = corpo.slice(corpo.indexOf("ehViolacaoDeUnique"));
    expect(doCatch).toContain("CPF_DE_OUTRO_CANDIDATO");
    expect(doCatch).toMatch(/tipo:\s*"TRAVADO"/);
  });

  it("existe UM único tratamento do desfecho travado, e ele serve aos dois caminhos", () => {
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async identidade(");
    const tratamentos = [...corpo.matchAll(/desfecho\.tipo\s*===\s*"TRAVADO"/g)];
    expect(tratamentos.length, "mais de um tratamento do travado, eles podem divergir").toBe(1);
    expect(corpo).toContain("PORTAL_ACESSO_TRAVADO");
  });

  it("a frase da recusa é UMA, montada em um lugar só", () => {
    // Duas construções de recusa é o começo de duas frases, e duas frases é o oráculo de volta pela
    // porta do texto. A trava é: um único `new UnauthorizedException` no arquivo inteiro.
    const fonte = fonteDe(SERVICO);
    const construcoes = [...fonte.matchAll(/new\s+UnauthorizedException\(/g)];
    expect(construcoes.length, "mais de uma construção de recusa no serviço").toBe(1);
    expect(fonte).toMatch(/private recusa\(\)/);
    // E ela não é parametrizada: nenhum motivo, campo ou valor entra na mensagem.
    const corpoRecusa = corpoDoMetodo(fonte, "private recusa()");
    expect(corpoRecusa).not.toContain("motivo");
    expect(corpoRecusa).not.toContain("campo");
    expect(corpoRecusa).not.toContain("cpf");
  });

  it("nenhuma recusa NOMEIA o campo que divergiu", () => {
    // `divergentes:` NÃO entra nesta lista, e a distinção é a que importa: ele é o parâmetro de
    // ENTRADA de `decisaoDaIdentidade`, calculado e consumido dentro do serviço. O que não pode
    // existir é o nome do campo saindo daqui, para a resposta, para a trilha ou para a tabela.
    const fonte = fonteDe(SERVICO);
    for (const padrao of ["campoDivergente", "camposDivergentes", "valorEsperado", "valorInformado"]) {
      expect(fonte, `nome de campo divergente exposto: ${padrao}`).not.toContain(padrao);
    }
  });
});

// ══ TRAVA 5: A TRILHA NÃO FOI ALARGADA ═════════════════════════════════════════════════════════

describe("trava 5: nada novo atravessa `montarEventoPortal`", () => {
  const PROIBIDOS = [
    "email",
    "emailHash",
    "codigo",
    "codigoHash",
    "nome",
    "cpfInformado",
    "valorEsperado",
    "campoDivergente",
    "dataNascimento",
  ];

  /** As chaves que `montarEventoPortal` consome como COLUNA, fora da allowlist de `dados`. */
  const DERIVADOS = ["cpf", "ip", "userAgent", "jtiLink", "motivoCodigo", "resultado"];

  it("`CAMPOS_PERMITIDOS` não ganhou nenhum campo desta frente", () => {
    const permitidos = itensDaLista(fonteDe(EVENTO), "const CAMPOS_PERMITIDOS = [");
    for (const proibido of PROIBIDOS) {
      expect(permitidos, `campo proibido na allowlist: ${proibido}`).not.toContain(proibido);
    }
  });

  it("`CAMPOS_PERMITIDOS` continua sendo exatamente a lista auditada (alargar passa pelo `seguranca`)", () => {
    // Retrato da lista medida em 29/09/2026. Ela é a allowlist de tudo que entra no jsonb `dados` da
    // trilha do Portal, e o retrato existe para que alargá-la seja um ATO, com auditoria, e não um
    // efeito colateral de uma frente qualquer. Quem precisar de um campo novo vai ver este vermelho,
    // e é isso que se quer: a conversa acontece antes, não depois de o dado estar gravado.
    expect(itensDaLista(fonteDe(EVENTO), "const CAMPOS_PERMITIDOS = [")).toEqual([
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

  it("nenhuma chamada de trilha do serviço passa campo proibido", () => {
    const chamadas = chamadasDe(fonteDe(SERVICO), "this.registrar(");
    expect(chamadas.length, "nenhuma chamada de trilha encontrada, o teste perdeu o alvo").toBeGreaterThan(0);
    for (const chamada of chamadas) {
      for (const chave of chavesDoUltimoObjeto(chamada)) {
        expect(PROIBIDOS, `campo proibido na trilha: ${chave}`).not.toContain(chave);
      }
    }
  });

  it("toda chave passada à trilha é consumida de fato (a que não é cai em silêncio)", () => {
    // O modo de falha aqui não é vazamento, é o contrário: chave fora da allowlist e fora dos
    // derivados é DESCARTADA sem erro, então quem escreveu acredita que registrou e a Sala De
    // Segurança recebe o evento sem o dado. Já aconteceu no módulo (a cicatriz do
    // `TENTATIVAS_ESGOTADAS`, no catálogo de motivos).
    const permitidos = itensDaLista(fonteDe(EVENTO), "const CAMPOS_PERMITIDOS = [");
    const aceitas = new Set([...permitidos, ...DERIVADOS]);
    for (const chamada of chamadasDe(fonteDe(SERVICO), "this.registrar(")) {
      for (const chave of chavesDoUltimoObjeto(chamada)) {
        expect([...aceitas], `chave que a trilha descarta em silêncio: ${chave}`).toContain(chave);
      }
    }
  });

  it("todo tipo de evento usado pelo serviço está em `PORTAL_EVENTOS`", () => {
    const tipos = chamadasDe(fonteDe(SERVICO), "this.registrar(")
      .map((c) => /^\s*"([A-Z_]+)"/.exec(c)?.[1])
      .filter((t): t is string => !!t);
    expect(tipos.length).toBeGreaterThan(0);
    for (const tipo of tipos) expect([...PORTAL_EVENTOS], `evento fora do catálogo: ${tipo}`).toContain(tipo);
  });

  it("todo `motivoCodigo` literal do serviço está em `PORTAL_MOTIVOS`", () => {
    // ESTA É A ARMADILHA QUE O PRÓPRIO CATÁLOGO DOCUMENTA: código fora da lista não dá erro, vira
    // `motivo_codigo` NULO, e a trilha registra que recusou sem dizer por quê. Passa em todo teste
    // de caminho feliz e só aparece quando alguém precisa auditar um incidente.
    const fonte = fonteDe(SERVICO);
    const literais = [...fonte.matchAll(/motivoCodigo:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(literais.length, "nenhum motivo literal encontrado, o teste perdeu o alvo").toBeGreaterThan(0);
    for (const motivo of literais) {
      expect([...PORTAL_MOTIVOS], `motivo fora do catálogo: ${motivo}`).toContain(motivo);
    }
  });

  it("os motivos de trava do domínio também são motivos de trilha", () => {
    // O motivo da trava viaja para a trilha como `motivoCodigo` (`decisao.motivo`), então um motivo
    // que exista no domínio e não no catálogo de trilha grava trava e registra evento sem motivo.
    for (const motivo of ["DIVERGENCIA_CADASTRO", "CPF_DE_OUTRO_CANDIDATO", "EMAIL_AMBIGUO", "TRAVA_ANTERIOR"]) {
      expect([...PORTAL_MOTIVOS], `motivo de trava ausente do catálogo: ${motivo}`).toContain(motivo);
    }
  });

  it("o CÓDIGO nunca vai para log nem para a resposta (C9)", () => {
    // O TEXTO SAI ANTES, das aspas E dos templates, por um motivo concreto: o serviço tem logs
    // legítimos que dizem "pepper do codigo ausente" e "falha ao emitir o codigo de acesso", e a
    // PALAVRA codigo numa mensagem não é o VALOR do código. Procurar a palavra reprovava a mensagem
    // que explica a falha, o que ensinaria a piorar o log para agradar o teste. O que se procura é a
    // VARIÁVEL atravessando para um log ou para uma resposta.
    const fonte = semTextos(semTextoDeTemplate(fonteDe(SERVICO)));
    expect(fonte, "a variável do código é interpolada em algum texto").not.toMatch(/\$\{\s*codigo\s*\}/);
    expect(fonte, "a variável do código chega a uma linha de log").not.toMatch(/log\.[a-z]+\([^)]*\bcodigo\b/);
    expect(fonte).not.toMatch(/codigo:\s*codigo/);
    expect(fonte, "o código atravessa para um retorno").not.toMatch(/return\s*\{[^}]*\bcodigo\b/);
  });
});

// ══ TRAVA 5B: A TRILHA ACONTECE (co-ocorrência) ════════════════════════════════════════════════

/**
 * ┌─ O QUE ESTE BLOCO CONSERTA, e o achado é da REAUDITORIA, não meu ───────────────────────────┐
 * │ As travas da 5 provam que o que PASSA pela trilha é limpo (campo proibido fora, campo que a  │
 * │ allowlist descarta fora, tipo e motivo no catálogo). Nenhuma delas provava que a trilha       │
 * │ ACONTECE. A sonda de mutação mediu o buraco: apagar a linha de `registrar` do travamento, ou  │
 * │ a do sucesso do link, deixava os 129 testes VERDES e a suíte inteira de `src/portal` também.  │
 * │                                                                                             │
 * │ Higiene sem existência é meia trava, e a metade que falta é a que apaga o rastro.             │
 * │                                                                                             │
 * │ POR QUE ISSO IMPORTA MAIS DO QUE PARECE: trilha consertada e não travada volta a sumir no     │
 * │ próximo refactor, e o módulo já tem duas cicatrizes disso. O `notifications` da Clicksign     │
 * │ (§A.5) ficou faltando com o contrato válido e parado, e a própria trava de `EMAIL_AMBIGUO`    │
 * │ nasceu sem rastro: um POST anônimo fechava a porta de várias pessoas e a Sala De Segurança    │
 * │ não tinha uma linha para ler.                                                                │
 * │                                                                                             │
 * │ A régua é de CO-OCORRÊNCIA, no mesmo molde de leitura de fonte: dado o gesto que MUDA estado, │
 * │ o registro dele tem de estar no mesmo recorte sintático. Sem banco e sem instanciar serviço.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("trava 5B: o gesto que muda estado NÃO existe sem a linha de trilha", () => {
  it("todo método que CRIA trava tem `PORTAL_ACESSO_TRAVADO` no caminho", () => {
    // Travar é escrita durável que põe pessoa na fila do time e FECHA a porta para ela. Sem a linha,
    // a fila enche e ninguém sabe de onde veio, que é o oposto do log sensível permanente e
    // consultável que a §A.6 exige.
    //
    // O ALVO É O `insert`, e não a chamada de um método com nome bonito: é o `insert` que cria a
    // trava, e ele é o que sobra depois de qualquer renomeação ou delegação. Hoje há dois
    // escritores, e eles registram em pontos DIFERENTES do caminho (um no chamador, outro em si
    // mesmo), que é exatamente por que a régua olha o alcance e não a linha.
    //
    // O `update` de reforço NÃO entra aqui de propósito: ele incrementa tentativas de uma trava que
    // já existe, e quem o chama registra a RECUSA com `TRAVA_ANTERIOR`. Exigir o evento de
    // travamento ali faria a trilha dizer que travou de novo quem já estava travado.
    const fonte = fonteDe(SERVICO);
    const metodos = metodosDaClasse(fonte);
    const escritores = [...fonte.matchAll(/insert\(\s*portalAcessoTravas/g)].map((m) => m.index ?? 0);
    expect(escritores.length, "nenhuma criação de trava, o teste perdeu o alvo").toBeGreaterThan(0);
    for (const i of escritores) {
      const metodo = metodoQueContem(metodos, i);
      expect(metodo, "criação de trava fora de qualquer método, o recorte perdeu o alvo").toBeDefined();
      expect(
        textoDoAlcance(metodos, metodo!.texto, metodo!.nome),
        `criação de trava sem trilha no caminho de \`${metodo!.nome}\`: a trava fica invisível`,
      ).toMatch(/registrar\(\s*"PORTAL_ACESSO_TRAVADO"/);
    }
  });

  it("o caminho do e-mail AMBÍGUO registra o motivo `EMAIL_AMBIGUO`", () => {
    // É a trava de maior alcance da frente: um POST anônimo trava até o teto de candidatos de uma
    // vez. O motivo precisa estar NA LINHA, senão a Sala De Segurança lê "travou" sem saber que foi
    // ambiguidade, e ambiguidade é o único motivo que o time resolve sem falar com o candidato.
    const fonte = fonteDe(SERVICO);
    const metodos = metodosDaClasse(fonte);
    const ramo = blocoDoIf(corpoDoMetodo(fonte, "async solicitar("), "candidatos.length > 1");
    expect(
      textoDoAlcance(metodos, ramo),
      "o caminho do e-mail ambíguo trava sem registrar o motivo",
    ).toMatch(/registrar\([\s\S]*?motivoCodigo:\s*"EMAIL_AMBIGUO"/);
  });

  it("`despacharLink` carimba a origem `AUTOATENDIMENTO` e registra o sucesso", () => {
    // A ORIGEM é o que desfaz a autoria falsa: o link não foi pedido por um consultor, foi pedido
    // pelo próprio candidato, e o carimbo `AUTOMATICO` punha no registro um gesto humano que não
    // houve. E o sucesso precisa de linha própria, senão o único desfecho sem rastro da porta é
    // justamente o que ENTREGA a credencial.
    const metodo = corpoDoMetodo(fonteDe(SERVICO), "private async despacharLink(");
    expect(metodo).toMatch(/enviarParaAdmissao\([^)]*"AUTOATENDIMENTO"\s*\)/);
    expect(metodo, "o envio do link não registra sucesso").toMatch(
      /registrar\(\s*"PORTAL_ACESSO_LINK_ENVIADO"/,
    );
  });

  it("o link e o CÓDIGO têm tipos de evento DISTINTOS, um em cada método (veto V2)", () => {
    // As duas linhas saíam IDÊNTICAS, e a trilha não conseguia responder "saiu o código ou saiu o
    // link?", que é a primeira pergunta de qualquer apuração nesta porta. A exclusividade nos dois
    // sentidos é o que impede o tipo de voltar a ser compartilhado por descuido.
    const fonte = fonteDe(SERVICO);
    const doLink = corpoDoMetodo(fonte, "private async despacharLink(");
    const doCodigo = corpoDoMetodo(fonte, "private async emitirEEnviarCodigo(");
    expect(doLink, "o envio do LINK usa o evento do CÓDIGO").not.toContain("PORTAL_ACESSO_EMAIL_ENVIADO");
    expect(doCodigo).toMatch(/registrar\(\s*"PORTAL_ACESSO_EMAIL_ENVIADO"/);
    expect(doCodigo, "o envio do CÓDIGO usa o evento do LINK").not.toContain("PORTAL_ACESSO_LINK_ENVIADO");
  });

  it("`autorDoLink` exige usuário ATIVO nos DOIS degraus", () => {
    // Um degrau sem a cláusula credita a emissão a uma conta desligada, e emissão de credencial
    // atribuída a quem não está mais na empresa é rastro que aponta para a pessoa errada. São dois
    // degraus, então são duas cláusulas: a contagem é a trava, porque remover UMA não quebra nada
    // mais.
    const metodo = corpoDoMetodo(fonteDe(SERVICO), "private async autorDoLink(");
    const ativos = [...metodo.matchAll(/eq\(\s*usuarios\.ativo,\s*true\s*\)/g)];
    expect(ativos.length, "algum degrau do autor aceita usuário inativo").toBe(2);
  });
});

// ══ TRAVA 6: RBAC COMPORTAMENTAL DO DESTRAVE ═══════════════════════════════════════════════════

/**
 * O DESTRAVE É DE QUALQUER USUÁRIO DO SOUL ADM (decisão do diretor), e é por isso que ele não tem
 * `@Roles`. Só que "sem `@Roles`" é meio caminho: o `MenuGuard` é FAIL-OPEN para operação que
 * NINGUÉM reivindica, então tirar o papel sem a reivindicação do menu não abre a rota para o time,
 * abre para QUALQUER AUTENTICADO. A reivindicação aqui é o coringa `PortalPainelController.*` do
 * menu `portal-links`, e este bloco prova que ela está viva, com os guards de verdade.
 */
function handlersDe(controller: new (...args: never[]) => object): string[] {
  const proto = controller.prototype as object;
  return Object.getOwnPropertyNames(proto).filter(
    (n) => n !== "constructor" && typeof (proto as Record<string, unknown>)[n] === "function",
  );
}

const HANDLERS_DE_TRAVA = handlersDe(PortalPainelController as never).filter((n) => /trava/i.test(n));

function menuGuardReal(codigos: string[] = []): MenuGuard {
  const menus = {
    permissaoDoUsuario: async () => ({ codigos: new Set(codigos), areas: new Set(["PORTAL"]) }),
  } as unknown as MenusService;
  const areas = { visivel: async () => true } as unknown as MenuAreasService;
  return new MenuGuard(new Reflector(), menus, areas);
}

function jwtGuardReal(): JwtAuthGuard {
  // O token nem é lido: sem header `Authorization`, o guard recusa antes de qualquer verificação.
  const jwt = { verifyAsync: async () => ({}) } as unknown as JwtService;
  const config = { getOrThrow: () => "segredo-de-teste" } as unknown as ConfigService;
  return new JwtAuthGuard(new Reflector(), jwt, config);
}

function contexto(handler: string, papel: Papel | null, comHeader = false): ExecutionContext {
  const proto = PortalPainelController.prototype as unknown as Record<string, unknown>;
  return {
    getHandler: () => proto[handler],
    getClass: () => PortalPainelController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: papel ? { id: "u1", papel } : undefined,
        headers: comHeader ? { authorization: "Bearer qualquer" } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

describe("trava 6: quem destrava é qualquer usuário COM o menu, e mais ninguém", () => {
  it("os handlers da fila de travas e do destrave EXISTEM na controller do painel", () => {
    // O contrato v2 põe as duas operações em `PortalPainelController`, e não em controller nova, para
    // herdar a reivindicação do menu `portal-links` sem tocar em `domain/menus.ts`. Sem os handlers,
    // os casos abaixo não teriam sobre o que rodar, e um laço vazio passa em silêncio.
    expect(HANDLERS_DE_TRAVA.length, `handlers de trava encontrados: ${HANDLERS_DE_TRAVA.join(", ") || "(nenhum)"}`).toBeGreaterThanOrEqual(2);
  });

  it("a operação é REIVINDICADA pelo menu `portal-links` (sem isso o guard é fail-open)", () => {
    expect(HANDLERS_DE_TRAVA.length).toBeGreaterThan(0);
    for (const handler of HANDLERS_DE_TRAVA) {
      expect(menuDaOperacao("PortalPainelController", handler), handler).toBe("portal-links");
    }
  });

  it("SEM sessão dá 401 (é o `JwtAuthGuard` que barra, e a rota não pode ser pública)", async () => {
    // `canActivate` é assíncrono, então a recusa chega como PROMESSA REJEITADA. A primeira versão
    // deste teste usou `toThrow` e ele passou a acusar a si mesmo, além de deixar uma rejeição solta
    // no runner: é o tipo de defeito que faz um teste de segurança parecer quebrado quando o sistema
    // está certo.
    expect(HANDLERS_DE_TRAVA.length).toBeGreaterThan(0);
    for (const handler of HANDLERS_DE_TRAVA) {
      await expect(
        jwtGuardReal().canActivate(contexto(handler, null)),
        handler,
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });

  it("o COMUM SEM o menu `portal-links` é barrado com 403", async () => {
    expect(HANDLERS_DE_TRAVA.length).toBeGreaterThan(0);
    for (const handler of HANDLERS_DE_TRAVA) {
      // Ele tem UM menu na mão, só não este: faltando a reivindicação, o guard devolveria `true`.
      await expect(
        menuGuardReal(["esteira"]).canActivate(contexto(handler, "COMUM")),
        handler,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it("o COMUM COM o menu `portal-links` destrava", async () => {
    expect(HANDLERS_DE_TRAVA.length).toBeGreaterThan(0);
    for (const handler of HANDLERS_DE_TRAVA) {
      await expect(
        menuGuardReal(["portal-links"]).canActivate(contexto(handler, "COMUM")),
        handler,
      ).resolves.toBe(true);
    }
  });

  it("nenhum handler do painel é `@Public()` (rota de gestão exige sessão)", () => {
    const fonte = fonteDe(PAINEL_CONTROLLER);
    expect(fonte).not.toContain("@Public()");
  });

  it("o destrave não ganhou `@Roles` (o diretor decidiu: qualquer usuário do Soul ADM destrava)", () => {
    const fonte = fonteDe(PAINEL_CONTROLLER);
    expect(fonte).not.toContain("@Roles(");
  });

  it("a fila e o destrave ficam FORA do prefixo `portal/`, que a barreira do vhost allowlista", () => {
    const fonte = fonteDe(PAINEL_CONTROLLER);
    expect(fonte).toContain('@Controller("esteira/portal-painel")');
  });

  it("o destrave escolhe o motivo de um catálogo FECHADO, sem texto livre", () => {
    // Texto livre na tela do time é onde o nome e o telefone da pessoa acabam escritos, e a tabela de
    // travas não tem coluna para isso de propósito (as colunas de valor são proibidas nominalmente).
    const fonte = fonteDe(PAINEL_CONTROLLER);
    for (const padrao of ["observacao", "justificativa"]) {
      expect(fonte, `texto livre no destrave: ${padrao}`).not.toContain(padrao);
    }
    expect(fonte).toContain("motivoCodigo");
  });
});

// ══ TRAVA 7: O CAMINHO DE HOJE NÃO MUDOU ═══════════════════════════════════════════════════════

describe("trava 7: `POST portal/identificar` continua byte a byte o de hoje", () => {
  /**
   * É A REGRESSÃO QUE MAIS DÓI, porque quebraria a entrada de QUEM JÁ USA o Portal, e quebraria em
   * silêncio: a porta nova é que está em construção, ninguém iria olhar a antiga. E é uma regressão
   * plausível, não teórica: a porta nova mexe no mesmo módulo, no mesmo controller vizinho e no mesmo
   * DTO de identificação.
   */
  it("`IdentificarNoPortalDto` tem exatamente os três campos de sempre", () => {
    const corpo = corpoDoMetodo(fonteDe(PORTAL_DTO), "export class IdentificarNoPortalDto");
    const campos = [...corpo.matchAll(/^\s*([A-Za-z_$][\w$]*)!?\s*[:?]/gm)].map((m) => m[1]);
    expect(campos).toEqual(["linkToken", "cpf", "dataNascimento"]);
  });

  it("as validações dos três campos continuam de pé", () => {
    const corpo = corpoDoMetodo(fonteDe(PORTAL_DTO), "export class IdentificarNoPortalDto");
    expect([...corpo.matchAll(/@IsString\(\)/g)].length).toBe(3);
    // O CPF aceita dígitos com ou sem máscara, e a data é `yyyy-mm-dd`: as duas expressões são a
    // porta de entrada do dado e mudá-las muda quem consegue entrar.
    expect(corpo).toContain("\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}");
    expect(corpo).toContain("\\d{4}-\\d{2}-\\d{2}");
  });

  it("o handler `identificar` continua público e repassa os três campos", () => {
    const fonte = fonteDe(PORTAL_CONTROLLER);
    expect(fonte).toContain('@Post("identificar")');
    expect(fonte).toContain("IdentificarNoPortalDto");
    const corpo = corpoDoMetodo(fonte, "identificar(@Req()");
    for (const campo of ["linkToken: dto.linkToken", "cpf: dto.cpf", "dataNascimento: dto.dataNascimento"]) {
      expect(corpo, `campo deixou de ser repassado: ${campo}`).toContain(campo);
    }
  });

  it("a porta nova é um ARQUIVO SEPARADO, e não um ramo dentro da porta de hoje", () => {
    // Ramo novo dentro de `portal.controller.ts` poria o caminho em construção no mesmo arquivo do
    // caminho que já atende gente, e a §A.26 é exatamente sobre isso: tocar código validado.
    expect(existsSync(CONTROLLER), `o controller da porta nova ainda não existe: ${CONTROLLER}`).toBe(true);
    const fonte = fonteDe(PORTAL_CONTROLLER);
    expect(fonte).not.toContain("acesso-email");
  });

  it("o controller da porta nova é público, sem guard de sessão, e vive sob o prefixo `portal`", () => {
    const fonte = fonteDe(CONTROLLER);
    expect(fonte).toContain('@Controller("portal")');
    expect(fonte).toContain("@Public()");
    expect(fonte).not.toContain("PortalSessaoGuard");
    for (const rota of ["acesso-email/solicitar", "acesso-email/confirmar", "acesso-email/identidade"]) {
      expect(fonte, `rota ausente: ${rota}`).toContain(rota);
    }
  });

  it("o controller da porta nova não MONTA resposta: devolve o que o serviço devolveu", () => {
    // A forma da resposta é a dos tipos compartilhados, e é lá que a ausência de nome, de e-mail e de
    // sessão está trancada pelo outro arquivo deste `tester`. Um objeto literal montado aqui
    // escaparia daquela trava, porque o tipo do controller é inferido.
    //
    // `codigo:` NÃO é proibido aqui, e a distinção importa: `codigo: dto.codigo` é a ENTRADA do passo
    // de confirmação, o dado que o candidato digitou. Proibir a palavra confundiria o que ENTRA com o
    // que SAI, que é justamente o que a régua C9 separa.
    const fonte = fonteDe(CONTROLLER);
    const corpo = corpoDoMetodo(fonte, "export class PortalAcessoEmailController");
    const retornos = [...corpo.matchAll(/return\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(retornos.length, "controller sem retorno, o teste perdeu o alvo").toBeGreaterThan(0);
    const daPorta = retornos.filter((r) => r.startsWith("this."));
    for (const r of daPorta) {
      expect(r, `retorno que não é chamada direta ao serviço: ${r}`).toMatch(/^this\.\w+\.\w+\(/);
    }
    for (const padrao of ["nome", "sessao", "emailHash", "nomeParcial"]) {
      expect(fonte, `campo indevido no controller: ${padrao}`).not.toContain(padrao);
    }
  });
});
