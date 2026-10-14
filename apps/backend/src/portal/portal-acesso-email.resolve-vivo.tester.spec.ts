import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AJUSTE 1 (diretor Rike, 2026-10-13): A PORTA DE E-MAIL RESOLVE O CANDIDATO PELO REGISTRO VIVO.
 *
 * O problema medido em produção: dois registros `as_candidatos` com o MESMO e-mail (a pessoa
 * duplicada no funil, só um ligado à admissão viva) faziam a porta de e-mail TRAVAR por ambiguidade,
 * e o código nunca saía (casos reais: Claudia, Brenda). A decisão do diretor foi resolver pela
 * identidade do admissional, isto é, pelo registro com ADMISSÃO VIVA no Gerenciador, único por
 * pessoa, sem tocar no registro fantasma (nada de inativar, apagar nem anonimizar).
 *
 * CRITÉRIO SEGURO, e é a parte que a auditoria tem de PROVAR que o código respeita: só resolve
 * automaticamente quando houver EXATAMENTE UMA admissão viva entre os homônimos de e-mail. Zero
 * vivas, ou mais de uma, CONTINUAM TRAVANDO, porque escolher entre dois vivos seria escolher a
 * identidade de alguém.
 *
 * Como o resto da suíte desta porta (`.travas.tester.spec.ts`), a prova é de FORMA sobre o código:
 * instanciar o serviço exigiria banco, e invariante estrutural sobrevive ao próximo refactor. A
 * régua é lida sobre a fonte SEM COMENTÁRIOS, para o teste nunca casar com o texto que documenta a
 * própria regra.
 */

const SERVICO = join(__dirname, "portal-acesso-email.service.ts");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function fonteDe(caminho: string): string {
  expect(existsSync(caminho), `arquivo não existe: ${caminho}`).toBe(true);
  return semComentarios(readFileSync(caminho, "utf8"));
}

/**
 * O corpo de um método, recortado por contagem de chaves. Pula o grupo de parênteses da assinatura
 * primeiro, porque um parâmetro desestruturado (`entrada: { ... }`) tem `{` antes do corpo.
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

describe("AJUSTE 1: desempate por admissão viva na porta de e-mail", () => {
  it("existe o método `candidatosComAdmissaoViva`, que recebe uma lista de ids e devolve ids", () => {
    const fonte = fonteDe(SERVICO);
    expect(
      fonte,
      "o desempate precisa de um método próprio, não de lógica solta no `solicitar`",
    ).toMatch(/private\s+async\s+candidatosComAdmissaoViva\s*\(/);
  });

  it("o desempate usa a MESMA régua de farol de `admissaoVivaDoCandidato` (reuso de `FAROIS_FORA_DO_PAINEL`)", () => {
    // Uma cópia da lista de farol diverge da original no primeiro ajuste, e a divergência apareceria
    // como código enviado para quem declinou. Os dois métodos têm de ler a MESMA constante.
    const fonte = fonteDe(SERVICO);
    const desempate = corpoDoMetodo(fonte, "private async candidatosComAdmissaoViva(");
    const vivoUnico = corpoDoMetodo(fonte, "private async admissaoVivaDoCandidato(");
    expect(desempate).toContain("FAROIS_FORA_DO_PAINEL");
    expect(desempate).toMatch(/notInArray\(\s*admissoes\.farolGlobal/);
    expect(vivoUnico).toMatch(/notInArray\(\s*admissoes\.farolGlobal/);
    // O vínculo é o mesmo: candidatura -> admissão, nunca CPF.
    expect(desempate).toMatch(/innerJoin\(\s*admissoes/);
    expect(desempate).toMatch(/isNotNull\(\s*asCandidaturas\.admissaoId/);
    expect(desempate).toMatch(/inArray\(\s*asCandidaturas\.candidatoId/);
  });

  it("o desempate NÃO escreve nada: não inativa, não apaga e não anonimiza o fantasma", () => {
    // A ordem do diretor foi explícita: o registro fantasma fica intocado. O método de desempate é
    // só leitura.
    const desempate = corpoDoMetodo(fonteDe(SERVICO), "private async candidatosComAdmissaoViva(");
    expect(desempate).not.toMatch(/\.update\(/);
    expect(desempate).not.toMatch(/\.delete\(/);
    expect(desempate).not.toMatch(/\.insert\(/);
    expect(desempate).not.toContain("anonimizadoEm");
  });

  it("§A.6: o desempate devolve só ids, e não loga (nenhum e-mail, CPF nem dado pessoal)", () => {
    const desempate = corpoDoMetodo(fonteDe(SERVICO), "private async candidatosComAdmissaoViva(");
    expect(desempate).not.toMatch(/this\.log\./);
    // Seleciona só o id do candidato, nenhuma coluna de pessoa.
    expect(desempate).toMatch(/select\(\s*\{\s*candidatoId:/);
    expect(desempate).not.toContain("email");
    expect(desempate).not.toContain("nome");
    expect(desempate).not.toContain("cpf");
  });

  it("o ramo de e-mail ambíguo CHAMA o desempate antes de decidir travar", () => {
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const ramo = blocoDoIf(corpo, "candidatos.length > 1");
    expect(ramo, "o ramo ambíguo não consulta a admissão viva").toContain(
      "candidatosComAdmissaoViva",
    );
  });

  it("resolve SÓ quando há exatamente UMA admissão viva, e trava em zero ou em mais de uma", () => {
    // A trava continua existindo (`travarAmbiguo` + `return resposta`), mas agora ela é condicionada
    // a NÃO haver exatamente um vivo. O número exato é a trava: `!== 1` (ou um `=== 1` que resolve e
    // o resto trava) é o que separa "é a pessoa" de "está em disputa".
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const ramo = blocoDoIf(corpo, "candidatos.length > 1");
    expect(ramo).toMatch(/vivos\.length\s*!==\s*1|vivos\.length\s*===\s*1/);
    // Quando resolve, o candidato escolhido é o único vivo.
    expect(ramo).toMatch(/candidatoId\s*=\s*vivos\[0\]/);
    // E quando não resolve, continua travando e saindo sem emitir.
    expect(ramo).toMatch(/this\.travarAmbiguo\(/);
    expect(ramo).toContain("return resposta;");
  });

  it("resolvido o vivo, o envio segue pelo MESMO caminho único (a emissão vem depois do ramo)", () => {
    // Não há segunda porta de emissão: o vivo cai no mesmo `emitirEEnviarCodigo` do caso de um só
    // candidato, então a trava anterior e o canal de tempo valem igual para ele.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const posRamo = corpo.indexOf("candidatos.length > 1");
    const posEmissao = corpo.indexOf("emitirEEnviarCodigo");
    expect(posEmissao, "a emissão do código sumiu").toBeGreaterThan(-1);
    expect(posRamo).toBeLessThan(posEmissao);
    // A emissão é chamada UMA vez (um caminho só), não uma por ramo.
    const chamadas = [...corpo.matchAll(/this\.emitirEEnviarCodigo\(/g)];
    expect(chamadas.length, "a emissão foi duplicada em ramos diferentes").toBe(1);
  });

  it("o desfecho da porta continua sendo a MESMA constante única (anti-enumeração intacta)", () => {
    // O AJUSTE 1 muda QUEM é resolvido, nunca O QUE a porta responde: todo `return` é `resposta`.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const retornos = [...corpo.matchAll(/return\s+([^;]+);/g)].map((m) => m[1].trim());
    expect(retornos.length).toBeGreaterThan(1);
    for (const r of retornos) expect(r, `retorno fora da constante: ${r}`).toBe("resposta");
  });

  // ── Endurecimentos pedidos pelo `tester` independente (§A.38): o estrutural tem de pegar o
  //    refactor plausível que quebra o requisito com a suíte verde. ──────────────────────────────

  it("o desempate DEDUP por candidato (uma pessoa com DUAS admissões vivas conta como UMA)", () => {
    // Sem o `Set`, uma pessoa REAL com 2 admissões vivas, homônima de e-mail com 1 fantasma, voltaria
    // [realId, realId] => length 2 => TRAVA, e o candidato legítimo nunca receberia o código.
    const desempate = corpoDoMetodo(fonteDe(SERVICO), "private async candidatosComAdmissaoViva(");
    expect(desempate, "o desempate não dedup por candidato").toMatch(/new Set\(/);
    expect(desempate, "o Set não é sobre o candidatoId").toMatch(/\.candidatoId\b/);
  });

  it("`FAROIS_FORA_DO_PAINEL` é IMPORTADA do painel, nunca redefinida localmente (reuso, não cópia)", () => {
    // Uma cópia local satisfaria `toContain` e divergiria da original no primeiro ajuste, voltando a
    // emitir para quem declinou. A régua tem de vir de UM lugar só.
    const fonte = fonteDe(SERVICO);
    expect(fonte, "a constante de farol não é importada do painel").toMatch(
      /import\s*\{[^}]*FAROIS_FORA_DO_PAINEL[^}]*\}\s*from\s*"\.\/portal-painel\.service"/,
    );
    expect(fonte, "a constante de farol foi recopiada dentro do serviço").not.toMatch(
      /const\s+FAROIS_FORA_DO_PAINEL\s*=/,
    );
  });

  it("os DOIS resolvedores de admissão viva leem a MESMA constante de farol", () => {
    // O desempate novo e o `admissaoVivaDoCandidato` já existente têm de citar `FAROIS_FORA_DO_PAINEL`
    // os dois: trocar um por um literal `["DECLINOU","RESCISAO"]` cria a divergência que o requisito
    // proíbe, e passaria num teste que só olha `notInArray`.
    const fonte = fonteDe(SERVICO);
    expect(corpoDoMetodo(fonte, "private async candidatosComAdmissaoViva(")).toContain(
      "FAROIS_FORA_DO_PAINEL",
    );
    expect(corpoDoMetodo(fonte, "private async admissaoVivaDoCandidato(")).toContain(
      "FAROIS_FORA_DO_PAINEL",
    );
  });

  it("a FIAÇÃO é a certa: TRAVA mora no bloco `vivos.length !== 1`, e a resolução fica FORA dele", () => {
    // Uma condição invertida (travar no `=== 1`, resolver no else) passaria num teste que só vê os
    // tokens coexistindo no ramo. Aqui o bloco de trava é recortado e provado.
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const ramo = blocoDoIf(corpo, "candidatos.length > 1");
    const blocoTrava = blocoDoIf(ramo, "vivos.length !== 1");
    expect(blocoTrava, "a trava não está no ramo de zero-ou-vários").toMatch(/this\.travarAmbiguo\(/);
    expect(blocoTrava, "a trava não interrompe o fluxo").toContain("return resposta;");
    const ramoSemTrava = ramo.replace(blocoTrava, "");
    expect(ramoSemTrava, "a resolução para o vivo está dentro do bloco de trava").toMatch(
      /candidatoId\s*=\s*vivos\[0\]/,
    );
  });

  it("§A.6: o log do ramo ambíguo carrega só CONTAGEM, nunca um id nem o e-mail", () => {
    const ramo = blocoDoIf(corpoDoMetodo(fonteDe(SERVICO), "async solicitar("), "candidatos.length > 1");
    expect(ramo).toMatch(/this\.log\.error\(/);
    // nem índice de id (ex.: idsCompartilhados[0]) nem e-mail no template do log.
    expect(ramo).not.toMatch(/idsCompartilhados\[\d/);
    expect(ramo).not.toContain("email");
  });

  it("o vivo resolvido NÃO pula a própria `travaAtiva` (a guarda fica entre o ramo e a emissão)", () => {
    const corpo = corpoDoMetodo(fonteDe(SERVICO), "async solicitar(");
    const posRamo = corpo.indexOf("candidatos.length > 1");
    const posTrava = corpo.indexOf("travaAtiva(this.db, candidatoId)");
    const posEmissao = corpo.indexOf("emitirEEnviarCodigo");
    expect(posTrava, "a guarda de trava ativa sumiu").toBeGreaterThan(-1);
    expect(posRamo).toBeLessThan(posTrava);
    expect(posTrava).toBeLessThan(posEmissao);
  });
});
