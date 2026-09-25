import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EXIGENCIA 3, A CONTAGEM NA EMISSAO, E A PROVA DE QUE O CAMINHO NOVO NAO A CONTORNA.
 *
 * TESTE INDEPENDENTE (§A.38), escrito a partir do REQUISITO e em paralelo a construcao (§A.40
 * regra 2). Quem escreve o codigo do hibrido nao escreveu este arquivo.
 *
 * O QUE ESTE ARQUIVO PROVA, e por que ele e de FONTE e nao de comportamento: a exigencia 3 nao e
 * um valor de retorno, e uma ORDEM de atos em volta de uma transacao travada. O teste de
 * comportamento dela ja existe e e a linha de base (`portal-corrida.spec.ts` e
 * `portal-durabilidade.spec.ts`). O que NENHUM deles pega e a SEGUNDA PORTA: um caminho novo que
 * emita credencial sem passar pela trava, ou uma chamada externa que entre para dentro da
 * transacao e passe a decidir se a cota e gravada. Os dois sao invisiveis para teste de unidade e
 * os dois degradam a exigencia sem nada falhar.
 *
 * Regua: `docs/DESENHO-PORTAL-HIBRIDO.md` secao 3 passo 2 e 3, item 7 da secao 11.1, e
 * `docs/PARECER-SEGURANCA-MAPA-HIBRIDO.md` secao 1.2.
 */

const SRC = resolve(__dirname, "..");
const SERVICO = join(__dirname, "portal-credencial.service.ts");

function lerServico(): string {
  return readFileSync(SERVICO, "utf8");
}

/** Corpo do `this.db.transaction(...)` da emissao, recortado por contagem de chaves. */
function corpoDaTransacaoDaEmissao(fonte: string): string {
  const inicio = fonte.indexOf("this.db.transaction");
  expect(inicio, "a emissao precisa continuar acontecendo dentro de `this.db.transaction`").toBeGreaterThan(-1);
  const abre = fonte.indexOf("{", inicio);
  let profundidade = 0;
  for (let i = abre; i < fonte.length; i += 1) {
    if (fonte[i] === "{") profundidade += 1;
    if (fonte[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return fonte.slice(abre, i + 1);
    }
  }
  throw new Error("transacao da emissao sem fechamento");
}

describe("Exigencia 3: a contagem continua sendo a EMISSAO, dentro da trava", () => {
  it("a trava de aviso existe, e existe UMA vez so", () => {
    const fonte = lerServico();
    const ocorrencias = fonte
      .split("\n")
      // O `*` entra no filtro junto com o `//`, e a falta dele era um defeito do proprio teste:
      // comentario de BLOCO (`/** ... */`) tambem e comentario, e citar o nome da trava dentro de
      // uma docstring passou a fazer este teste contar documentacao como codigo.
      .filter(
        (linha) =>
          linha.includes("pg_advisory_xact_lock") &&
          !linha.trim().startsWith("//") &&
          !linha.trim().startsWith("*"),
      );
    expect(
      ocorrencias.length,
      "a trava por `jti` do link serializa INSTANCIAS do backend, nao so requisicoes do mesmo processo",
    ).toBe(1);
  });

  it("a trava, a leitura do consumo, a regua pura e o INSERT vivem todos dentro da mesma transacao", () => {
    const corpo = corpoDaTransacaoDaEmissao(lerServico());
    expect(corpo).toContain("pg_advisory_xact_lock");
    expect(corpo).toContain("estadoDoLink");
    expect(corpo).toContain("emitirCredencialEscrita");
    expect(corpo).toMatch(/insert\(\s*portalCredenciais\s*\)/);
  });

  it("a ordem dentro da transacao e trava, leitura, regua, gravacao", () => {
    const corpo = corpoDaTransacaoDaEmissao(lerServico());
    const trava = corpo.indexOf("pg_advisory_xact_lock");
    const leitura = corpo.indexOf("estadoDoLink");
    const regua = corpo.indexOf("emitirCredencialEscrita");
    const gravacao = corpo.search(/insert\(\s*portalCredenciais\s*\)/);
    expect(trava).toBeLessThan(leitura);
    expect(leitura).toBeLessThan(regua);
    expect(regua).toBeLessThan(gravacao);
  });

  it("NENHUMA conversa externa entra para dentro da transacao", () => {
    // O emissor roda no projeto do Google e fala por rede. Chamada de rede dentro de uma transacao
    // travada por `jti` segura a trava pelo tempo do tempo limite do emissor, e faz a cota do
    // candidato depender de um terceiro. O bilhete e a assinatura acontecem DEPOIS do commit.
    const corpo = corpoDaTransacaoDaEmissao(lerServico());
    for (const proibido of ["fetch(", "assinarEscrita", "emissor", "bilhete", "armazenamento."]) {
      expect(
        corpo.toLowerCase().includes(proibido.toLowerCase()),
        `a transacao da emissao nao pode conter \`${proibido}\`: e chamada externa dentro da trava`,
      ).toBe(false);
    }
  });

  it("a linha de cota e gravada MESMO que o emissor falhe depois", () => {
    // O ato contado e a EMISSAO, nao a URL. Desfazer a linha quando o emissor devolve erro
    // transforma emissor instavel em cota infinita: 26 pedidos, 26 falhas do emissor, cota zerada.
    // Ver o GAP registrado no relatorio: o R3 do desenho diz o contrario desta linha.
    const fonte = lerServico();
    const fimDaTransacao = fonte.indexOf(corpoDaTransacaoDaEmissao(fonte)) + corpoDaTransacaoDaEmissao(fonte).length;
    const depois = fonte.slice(fimDaTransacao);
    expect(
      /assinarEscrita|emissor/i.test(depois),
      "a chamada que produz a URL precisa acontecer DEPOIS do commit da linha de cota",
    ).toBe(true);
    expect(
      /delete\(\s*portalCredenciais\s*\)/.test(fonte),
      "nenhum caminho apaga a linha de cota ja gravada",
    ).toBe(false);
  });

  it("a tabela da cota continua com UM escritor so em todo o backend", () => {
    // §A.40 regra 3, a pergunta fixa do briefing: quem mais escreve este dado. Hoje a resposta e
    // `portal-credencial.service.ts` e mais ninguem, e o hibrido nao pode abrir uma segunda porta.
    const arquivos: string[] = [];
    (function varrer(dir: string) {
      for (const nome of readdirSync(dir)) {
        const alvo = join(dir, nome);
        if (statSync(alvo).isDirectory()) varrer(alvo);
        else if (alvo.endsWith(".ts") && !alvo.endsWith(".spec.ts")) arquivos.push(alvo);
      }
    })(SRC);

    const escritores = arquivos.filter((arquivo) => {
      const fonte = readFileSync(arquivo, "utf8");
      return /(insert|update|delete)\(\s*portalCredenciais\s*\)/.test(fonte);
    });

    expect(escritores.map((a) => a.replace(`${SRC}/`, "")).sort()).toEqual([
      "portal/portal-credencial.service.ts",
    ]);
  });
});

describe("A linha de base nao pode ter sido editada", () => {
  // Item 11 da secao 11.1 do desenho: `portal-corrida.spec.ts` e `portal-durabilidade.spec.ts`
  // devem continuar verdes SEM alteracao. Precisar edita-los e o sinal de que a exigencia 3
  // degradou, e e motivo de parar. A impressao abaixo foi tirada ANTES do primeiro commit do
  // hibrido, com o modulo no estado auditado.
  const IMPRESSOES: Record<string, string> = {
    // IMPRESSAO ATUALIZADA UMA VEZ, em 20/09/2026, pelo COORDENADOR, e o porque fica registrado
    // aqui porque o proprio tripwire manda parar e reportar em vez de atualizar.
    //
    // O QUE MUDOU, e nao foi a exigencia 3: a frente da IDENTIDADE acrescentou UMA leitura dentro
    // da transacao da emissao, a linha viva de `portal_links`. Ela entrou por condicao de saida da
    // auditoria previa, que achou o furo antes de existir codigo: sem ela, a sessao de 30 minutos
    // sobrevive ao link REVOGADO, e quem tem a sessao continua escrevendo no armazenamento depois
    // de o consultor ter matado o link.
    //
    // O QUE FOI CONFERIDO ANTES DE APROVAR: a edicao no `portal-corrida.spec.ts` ensina o banco de
    // mentirinha a reconhecer a consulta nova PELA PROJECAO, deixando-a FORA da contagem ordinal.
    // Os tres testes de corrida continuam medindo exatamente o que mediam (a trava por link e a
    // cota que nao degrada), e nenhuma assercao foi afrouxada. Se a proxima edicao afrouxar uma
    // asercao, a regra continua valendo: parar e reportar.
    "portal-corrida.spec.ts": "7f0a816e9dc7d388592784b1db0c750340e5687a178da34c88189148285e01e2",
    "portal-durabilidade.spec.ts": "b3c53c6d02b20c348c9bf57af8d9b193f02413a7547838b2767ebd3420f197ec",
    "portal-leitor.spec.ts": "a55638ec568e01ad6233505542b0d69856e312ff85813b2229a9a5b7d7202916",
  };

  for (const [nome, impressao] of Object.entries(IMPRESSOES)) {
    it(`${nome} intacto`, () => {
      const alvo = join(__dirname, nome);
      expect(existsSync(alvo), `${nome} nao pode ser removido`).toBe(true);
      const atual = createHash("sha256").update(readFileSync(alvo)).digest("hex");
      expect(
        atual,
        `${nome} foi editado. Se a edicao foi necessaria, a exigencia 3 ou o contrato das portas mudou, e isso e motivo de parar e reportar, nao de atualizar esta impressao`,
      ).toBe(impressao);
    });
  }
});
