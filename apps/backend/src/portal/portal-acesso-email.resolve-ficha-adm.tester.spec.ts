import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * TROCA DA RESOLUÇÃO DA PORTA DE E-MAIL (diretor Rike, 2026-10-14): a porta passa a IDENTIFICAR o
 * candidato pela ficha da ADMISSÃO (`candidatos.email`), NÃO mais pela ficha do funil
 * (`as_candidatos.email`). O gatilho do link é a liberação admissional, e é lá que o time cadastra o
 * e-mail; a porta tinha de olhar a mesma ficha. Casos reais medidos em produção que a v2 deixava em
 * "E-mail não identificado": Cristian, Cleiton, o padrão de "assimetria D2".
 *
 * POR QUE A CONSULTA MORA NO `AdmissoesService`, E NÃO NA PORTA. A porta de e-mail tem a trava 1
 * (`portal-acesso-email.travas.tester.spec.ts`): ela NÃO importa `candidatos` e NÃO toca
 * `candidato_cpf`, porque "achar pessoa por CPF do corpo" foi o veto da v1. A ficha da admissão vive
 * em `candidatos` (chave CPF), então a leitura foi para o serviço de admissões, dono da relação
 * admissão<->ficha, e a porta só CONSOME o id do FUNIL que ele devolve. Assim a trava 1 continua
 * inteira e, por construção, a porta segue incapaz de resolver por CPF.
 *
 * A prova é de FORMA sobre a fonte (sem comentários), no mesmo molde de `.travas` e `.resolve-vivo`:
 * instanciar exigiria banco, e a invariante estrutural sobrevive ao próximo refactor.
 */

const PORTA = join(__dirname, "portal-acesso-email.service.ts");
const ADMISSOES = join(__dirname, "../admissoes/admissoes.service.ts");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function fonteDe(caminho: string): string {
  expect(existsSync(caminho), `arquivo não existe: ${caminho}`).toBe(true);
  return semComentarios(readFileSync(caminho, "utf8"));
}

/** Corpo de `async solicitar(...)` pela contagem de chaves, pulando o grupo de parâmetros. */
function corpoSolicitar(fonte: string): string {
  const inicio = fonte.indexOf("async solicitar(");
  expect(inicio, "método solicitar não encontrado").toBeGreaterThan(-1);
  let nivelParen = 0;
  let i = fonte.indexOf("(", inicio);
  for (; i < fonte.length; i += 1) {
    if (fonte[i] === "(") nivelParen += 1;
    else if (fonte[i] === ")") {
      nivelParen -= 1;
      if (nivelParen === 0) break;
    }
  }
  const abre = fonte.indexOf("{", i);
  let nivel = 0;
  for (let j = abre; j < fonte.length; j += 1) {
    if (fonte[j] === "{") nivel += 1;
    else if (fonte[j] === "}") {
      nivel -= 1;
      if (nivel === 0) return fonte.slice(abre, j + 1);
    }
  }
  throw new Error("corpo de solicitar não fechou");
}

/**
 * O corpo do resolver, do nome até o seu `.limit(limite)` (o `corpoDoMetodo` por chaves casaria com o
 * `{` do retorno `Promise<{ id: string }[]>`). O recorte termina no `.limit(limite)` do próprio método,
 * para o teste §A.6 (sem log) NÃO sangrar para o método vizinho e virar falso-vermelho.
 */
function trechoDoResolver(fonteAdm: string): string {
  const i = fonteAdm.indexOf("candidatosDeFunilPorEmailDaFichaDeAdmissao(");
  expect(i, "resolver da ficha de admissão não encontrado").toBeGreaterThan(-1);
  const fim = fonteAdm.indexOf(".limit(limite)", i);
  expect(fim, "o resolver não termina em .limit(limite)").toBeGreaterThan(i);
  return fonteAdm.slice(i, fim + ".limit(limite)".length);
}

describe("porta de e-mail: resolução pela ficha da ADMISSÃO (não pelo funil)", () => {
  it("o `solicitar` DELEGA a resolução e PASSA DE FATO a régua de farol viva e o teto de ambiguidade", () => {
    const corpo = corpoSolicitar(fonteDe(PORTA));
    const chamada = corpo.indexOf("this.admissoes.candidatosDeFunilPorEmailDaFichaDeAdmissao(");
    expect(chamada, "o solicitar não delega ao resolver da ficha").toBeGreaterThan(-1);
    // Recorta os ARGUMENTOS de fato (coexistência de token em outro ponto do método não basta): do
    // `(` da chamada até o `)` que o fecha.
    let nivel = 0;
    let fim = chamada;
    for (let k = corpo.indexOf("(", chamada); k < corpo.length; k += 1) {
      if (corpo[k] === "(") nivel += 1;
      else if (corpo[k] === ")") {
        nivel -= 1;
        if (nivel === 0) {
          fim = k;
          break;
        }
      }
    }
    const args = corpo.slice(chamada, fim + 1);
    expect(args, "a régua de farol viva não é o argumento passado").toContain("FAROIS_FORA_DO_PAINEL");
    expect(args, "o teto de ambiguidade não é passado").toContain("TRAVA_AMBIGUO_TETO + 1");
  });

  it("o `solicitar` NÃO resolve mais pelo e-mail do FUNIL (a consulta antiga saiu)", () => {
    const corpo = corpoSolicitar(fonteDe(PORTA));
    // A v2 fazia `from(asCandidatos) ... lower(trim(asCandidatos.email)) = email`. Isso não existe mais
    // no `solicitar`: a resolução agora é delegada e casa pela ficha da admissão.
    expect(corpo).not.toContain("asCandidatos.email");
    expect(corpo).not.toMatch(/\.from\(\s*asCandidatos\s*\)/);
  });

  it("o resolver casa pela ficha da ADMISSÃO (`candidatos.email`), de uma ADMISSÃO VIVA", () => {
    const trecho = trechoDoResolver(fonteDe(ADMISSOES));
    // Casa o e-mail contra a coluna da ficha da admissão.
    expect(trecho).toMatch(/lower\(trim\(\$\{candidatos\.email\}\)\)/);
    // Só admissão viva: régua de farol recebida do chamador, aplicada com notInArray.
    expect(trecho).toMatch(/notInArray\(\s*admissoes\.farolGlobal/);
    // E NÃO casa mais pelo e-mail do FUNIL: o miolo da troca é abandonar `as_candidatos.email`. Um
    // resolver que casasse pelos DOIS passaria sem esta negativa (gap que o tester apontou).
    expect(trecho, "o resolver ainda casa pelo e-mail do funil").not.toContain("asCandidatos.email");
    // Teto do chamador respeitado.
    expect(trecho).toContain(".limit(limite)");
  });

  it("a COMPOSIÇÃO é a certa: três innerJoin e um `and` (não leftJoin, não or)", () => {
    // Presença de token não prova composição; estas asserções viram vermelhas se alguém trocar o
    // `and` por `or` (abriria o filtro) ou um `innerJoin` por `leftJoin` (deixaria passar linha sem
    // candidatura/admissão/ficha). O caminho de runtime está provado em
    // `admissoes/candidatos-por-ficha-admissao.integra.spec.ts`.
    const trecho = trechoDoResolver(fonteDe(ADMISSOES));
    expect(trecho).toContain(".innerJoin(asCandidaturas");
    expect(trecho).toContain(".innerJoin(admissoes");
    expect(trecho).toContain(".innerJoin(candidatos");
    expect(trecho).not.toContain("leftJoin");
    expect(trecho).toMatch(/\.where\(\s*and\(/);
  });

  it("o join admissão<->ficha é FK (coluna com coluna), nunca igualdade contra valor do corpo", () => {
    const trecho = trechoDoResolver(fonteDe(ADMISSOES));
    // O único vínculo por CPF é a chave estrangeira entre as duas tabelas; o CPF NUNCA vem da
    // requisição (o corpo de `solicitar` só tem e-mail). É isto que mantém o veto da v1 fechado.
    expect(trecho).toContain("eq(candidatos.cpf, admissoes.candidatoCpf)");
  });

  it("o resolver devolve o id do FUNIL (`as_candidatos.id`), que é onde o pipeline está chaveado", () => {
    const trecho = trechoDoResolver(fonteDe(ADMISSOES));
    // `portal_acesso_codigos.as_candidato_id`, a gravação de CPF e a reconciliação do PROV são todas
    // pelo id do funil; a resolução desce até ele pela candidatura.
    expect(trecho).toMatch(/selectDistinct\(\s*\{\s*id:\s*asCandidatos\.id\s*\}\s*\)/);
    expect(trecho).toContain("asCandidaturas.candidatoId");
    expect(trecho).toContain("asCandidaturas.admissaoId");
  });

  it("§A.6: o resolver devolve só ids e não loga (nenhum e-mail, CPF nem nome)", () => {
    const trecho = trechoDoResolver(fonteDe(ADMISSOES));
    expect(trecho).not.toMatch(/this\.log\./);
  });
});
