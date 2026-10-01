import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  CasoDaPropostaDeCliente,
  EstadoDaPropostaDeCliente,
  OrigemDaPropostaDeCliente,
} from "@ea/shared-types";

/**
 * ─ A LINHA FIXA DO BRIEFING (§A.40, regra 3): QUEM MAIS ESCREVE O QUE EU VOU ESCREVER ──────────
 *
 * ┌─ POR QUE ESTA PERGUNTA É UM TESTE, E NÃO UM PARÁGRAFO DO RELATÓRIO ─────────────────────────┐
 * │ A auditoria desta casa já enumerou os escritores de `vagas.cod_cliente` e achou NOVE onde o   │
 * │ coordenador havia listado quatro, e achou a segunda porta de `posicoes_oficiais` DEPOIS de o  │
 * │ código existir. Um parágrafo de relatório responde a pergunta UMA vez, no dia da entrega; um  │
 * │ teste a responde em toda rodada, inclusive na da próxima sessão, que é quando a segunda porta │
 * │ costuma nascer. A segunda porta é sempre a que não tem a trava.                               │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE EU PROVO AQUI, E É EXATAMENTE A LISTA FECHADA DOS ESCRITORES ────────────────────────┐
 * │ A proposta tem DOIS escritores, e eles são DISJUNTOS por coluna:                             │
 * │   1. `as/ingestao-pandape/ingestao-depara-cliente.service.ts` grava a proposta (código, nome, │
 * │      origem) e o estado `PROPOSTO`;                                                           │
 * │   2. `as/vagas/vagas-revisao-proposta.ts` grava SÓ o estado `CONFIRMADO`, quando uma pessoa   │
 * │      aceita na liberação exatamente o valor proposto.                                         │
 * │ Nenhum terceiro, e nenhum dos dois toca `cod_cliente`.                                        │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * E O QUE ACONTECE SE A TRILHA FOR SALVA: nada. A resposta é a asserção do bloco 3, e ela é a razão
 * de o bloco existir: `camposDaTrilha` (`as/vagas/vagas.service.ts`) é espalhado no `set` do
 * `update`, e a regra declarada da casa é "o corpo é COMPLETO, campo ausente é campo LIMPO". Se
 * qualquer coluna da proposta entrar naquele mapeamento, TODO salvamento da trilha a apaga em
 * silêncio, e a condição C3 da auditoria cai.
 *
 * A VARREDURA RODA SOBRE A FONTE SEM COMENTÁRIO, pelo mesmo motivo do arquivo do `tester`: os
 * arquivos desta frente FALAM de `cod_cliente` em prosa, longamente, para explicar por que não a
 * escrevem. Varredura ingênua sobre o texto cru dá falso vermelho e manda consertar o que está certo.
 */

const RAIZ_SRC = join(__dirname, "..", "..");

/** Tira comentário de bloco e de linha. Cru NUNCA é asserido neste arquivo. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

const ler = (caminho: string) => readFileSync(caminho, "utf8");
const codigoDe = (caminho: string) => semComentarios(ler(caminho));

function arquivosTs(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === "dist") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosTs(caminho, achados);
    else if (nome.endsWith(".ts") && !nome.includes(".spec.")) achados.push(caminho);
  }
  return achados;
}

/**
 * O VOCABULÁRIO COMPARTILHADO, CONSUMIDO PELO TIPO E NÃO PELO VALOR.
 *
 * ┌─ POR QUE NÃO SE IMPORTA A CONSTANTE ─────────────────────────────────────────────────────────┐
 * │ `const` NOVA do `@ea/shared-types` chega `undefined` em tempo de execução até o pacote ser    │
 * │ construído, e o typecheck passa (o alias resolve o FONTE): o sintoma vira "bug de lógica" num │
 * │ teste que parecia trivial. A construção do pacote é passo de PUBLICAÇÃO, de quem publica.     │
 * │                                                                                               │
 * │ AS LISTAS ABAIXO SÃO TIPADAS CONTRA O VOCABULÁRIO, e é isso que mantém a trava: acrescentar,   │
 * │ renomear ou remover um valor lá quebra ESTE arquivo no typecheck, sem depender de build.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
const ORIGENS: readonly OrigemDaPropostaDeCliente[] = ["PLANILHA_ID_VAGA", "PLANILHA_REQUISICAO"];
const ESTADOS: readonly EstadoDaPropostaDeCliente[] = ["PROPOSTO", "CONFIRMADO"];
const CASOS: readonly CasoDaPropostaDeCliente[] = ["COM_CODIGO", "SO_NOME"];

/**
 * OS `set` DE TODO `update vagas` DO ARQUIVO, que é onde a ESCRITA mora.
 *
 * O recorte vai do `set` até o `where` da mesma instrução: é o único trecho em que um nome de coluna
 * seguido de `=` significa "esta coluna está sendo escrita". Fora dele, o mesmo texto é condição de
 * junção ou de filtro, e as duas coisas são legítimas e necessárias.
 */
function setsDeUpdateDeVaga(codigo: string): string[] {
  return [...codigo.matchAll(/update\s+vagas([\s\S]*?)\bwhere\b/gi)].map((m) => m[1] ?? "");
}

const AS_QUATRO_COLUNAS = [
  "cliente_proposto",
  "cliente_proposto_nome",
  "cliente_proposto_origem",
  "cliente_proposto_estado",
] as const;

const ESCRITOR_DA_PROPOSTA = join(
  RAIZ_SRC,
  "as",
  "ingestao-pandape",
  "ingestao-depara-cliente.service.ts",
);
const ESCRITOR_DO_ACEITE = join(RAIZ_SRC, "as", "vagas", "vagas-revisao-proposta.ts");
const VAGAS_SERVICE = join(RAIZ_SRC, "as", "vagas", "vagas.service.ts");

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 0. O CANÁRIO DA PRÓPRIA FERRAMENTA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("a limpeza de comentários funciona, senão todo teste deste arquivo é vácuo", () => {
  it("o escritor FALA de `cod_cliente` em prosa, e o código limpo fala menos", () => {
    const cru = ler(ESCRITOR_DA_PROPOSTA);
    const limpo = semComentarios(cru);
    const conta = (t: string) => t.split("cod_cliente").length - 1;

    expect(conta(cru), "a prosa sobre `cod_cliente` desapareceu do arquivo").toBeGreaterThan(1);
    expect(conta(limpo)).toBeLessThan(conta(cru));
  });

  it("e a limpeza não come o código: o que sobra ainda é o escritor", () => {
    const limpo = codigoDe(ESCRITOR_DA_PROPOSTA);
    expect(limpo).toContain("resolverERegistrar");
    expect(limpo).toContain("update vagas");
    expect(limpo.length).toBeGreaterThan(1500);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 1. A LISTA DE ESCRITORES É FECHADA, E TEM DOIS NOMES
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("quem ESCREVE as colunas da proposta, em lista fechada", () => {
  /** Quem ESCREVE: a atribuição (`coluna = `) dentro de um `update`, e não a menção ao nome. */
  const escrevem = () =>
    arquivosTs(RAIZ_SRC)
      .filter((caminho) => {
        const codigo = codigoDe(caminho);
        if (!/update\s+vagas/i.test(codigo)) return false;
        return AS_QUATRO_COLUNAS.some((c) => new RegExp(`${c}\\s*=`).test(codigo));
      })
      .map((c) => c.slice(RAIZ_SRC.length + 1).replace(/\\/g, "/"));

  it("são DOIS, e são estes dois", () => {
    /*
     * MUTANTE QUE ISTO MATA: um terceiro caminho de escrita, em qualquer lugar da base. É o defeito
     * que a auditoria mediu em `posicoes_oficiais` (a liberação era o TERCEIRO escritor, e foi o que
     * ficou sem trava) e em `vagas.cod_cliente` (nove escritores onde se havia listado quatro).
     */
    expect(escrevem().sort()).toEqual(
      [
        "as/ingestao-pandape/ingestao-depara-cliente.service.ts",
        "as/vagas/vagas-revisao-proposta.ts",
      ].sort(),
    );
  });

  it("os dois são DISJUNTOS: a ingestão não carimba o aceite, e o aceite não reescreve a proposta", () => {
    /*
     * ┌─ POR QUE A DISJUNÇÃO IMPORTA, E NÃO É ARRUMAÇÃO ──────────────────────────────────────┐
     * │ Se a ingestão escrevesse `CONFIRMADO`, a planilha passaria a afirmar que uma pessoa     │
     * │ conferiu o que ninguém viu. Se o aceite reescrevesse nome, código ou origem, o registro  │
     * │ do que FOI PROPOSTO seria sobrescrito pelo que foi aceito, e a pergunta do item 8        │
     * │ ("escolhido ou aceito?") perderia o lado de comparação.                                  │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     */
    const ingestao = codigoDe(ESCRITOR_DA_PROPOSTA);
    expect(ingestao, "a ingestão carimbou o aceite de uma pessoa").not.toContain("'CONFIRMADO'");

    const aceite = codigoDe(ESCRITOR_DO_ACEITE);
    for (const coluna of ["cliente_proposto_nome =", "cliente_proposto_origem ="]) {
      expect(aceite, `o aceite reescreveu ${coluna}`).not.toContain(coluna);
    }
    expect(aceite).toContain("cliente_proposto_estado = 'CONFIRMADO'");
  });

  it("nenhum dos dois escreve `cod_cliente`, que é a coluna irreversível", () => {
    /*
     * A COLUNA É IRREVERSÍVEL porque ela desce para a pré-admissão SEM FILTRO DE STATUS
     * (`candidatos.service.ts`, medido pela auditoria) e de lá decide a régua documental e o NOME DA
     * PASTA do prontuário no Drive. Cliente errado é controlador errado (§A.6), e arquivamento no
     * Drive não se desfaz (§A.33).
     */
    /*
     * A ASSERÇÃO É SOBRE O `set` DO `update`, E ISSO ME CUSTOU UMA EXECUÇÃO: o escritor LÊ o
     * de/para com `left join clientes c on c.cod_cliente = d.cod_cliente`, que é uma CONDIÇÃO DE
     * JUNÇÃO e tem de continuar existindo (é ela que confere o código contra o catálogo, bloqueio 5
     * da auditoria). Uma varredura por `cod_cliente =` no arquivo inteiro fica vermelha contra uma
     * implementação CORRETA, que é o pior defeito que um teste pode ter: manda consertar o certo.
     */
    for (const caminho of [ESCRITOR_DA_PROPOSTA, ESCRITOR_DO_ACEITE]) {
      for (const atribuicoes of setsDeUpdateDeVaga(codigoDe(caminho))) {
        expect(atribuicoes.match(/\bcod_cliente\s*=[^=]/g) ?? [], caminho).toEqual([]);
      }
    }
  });

  it("nenhum dos dois empurra `atualizado_em` da vaga", () => {
    /*
     * O RELÓGIO DO EXPURGO de quem está dentro da vaga. A ingestão roda 48 vezes por dia sobre 470
     * vagas: um `atualizado_em = now()` aqui renovaria a retenção de todo mundo, para sempre, e
     * nada ficaria vermelho. Violação de §A.6 por efeito colateral.
     */
    for (const caminho of [ESCRITOR_DA_PROPOSTA, ESCRITOR_DO_ACEITE]) {
      expect(codigoDe(caminho), caminho).not.toContain("atualizado_em");
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 2. A CONDIÇÃO C3 DA AUDITORIA: A PROPOSTA FICA FORA DE `camposDaTrilha`
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("salvar a trilha da vaga NÃO apaga a proposta", () => {
  it("`camposDaTrilha` não mapeia nenhuma das quatro colunas", () => {
    /*
     * ┌─ O DEFEITO QUE ISTO IMPEDE É SILENCIOSO, E É O MAIS FÁCIL DE COMETER ────────────────────┐
     * │ `camposDaTrilha` é o mapeamento do corpo do formulário para as colunas, e ele é ESPALHADO │
     * │ no `set` do `update` (`...campos`). A regra declarada da casa, escrita no próprio arquivo, │
     * │ é "O CORPO É COMPLETO: campo ausente é campo LIMPO", e é assim que o idioma, o escape de  │
     * │ "Outros" e o detalhe do híbrido somem quando a pessoa desmarca a opção.                    │
     * │                                                                                          │
     * │ Com a proposta dentro daquele mapeamento, ela entraria no `set` como `null` em TODO        │
     * │ salvamento de trilha, porque o formulário nunca a manda: a tela de revisão mostraria a     │
     * │ proposta, a pessoa salvaria qualquer campo, e a proposta sumiria sem ninguém notar.         │
     * └──────────────────────────────────────────────────────────────────────────────────────────┘
     *
     * A ASSERÇÃO É SOBRE O BLOCO, e não sobre o arquivo: o arquivo inteiro já é coberto pelo teste
     * de inércia do `tester` (a `VagasService` está FORA da lista branca de quem pode citar a
     * proposta). Aqui o alvo é o mapeamento, para a mensagem de falha dizer ao próximo exatamente
     * onde ele acabou de mexer.
     */
    const codigo = codigoDe(VAGAS_SERVICE);
    const i = codigo.indexOf("camposDaTrilha(");
    expect(i, "`camposDaTrilha` não foi encontrado: o arquivo mudou de forma").toBeGreaterThan(-1);
    const bloco = codigo.slice(i, codigo.indexOf("\n  }", i));

    for (const marca of ["clienteProposto", "cliente_proposto"]) {
      expect(bloco, `\`camposDaTrilha\` passou a mapear a proposta (${marca})`).not.toContain(marca);
    }
  });

  it("a `VagasService` não cita a proposta em lugar nenhum, nem para ler", () => {
    /*
     * A FORMA FORTE, e ela é a razão de a procedência do item 8 morar em módulo separado: o
     * `coalesce(cod_cliente, cliente_proposto)` de boa-fé ("se não tem cliente, usa o proposto")
     * escrito dentro deste arquivo é o furo inteiro, e seria invisível na revisão de código.
     */
    const codigo = codigoDe(VAGAS_SERVICE);
    for (const marca of ["clienteProposto", "cliente_proposto"]) {
      expect(codigo, `a \`VagasService\` passou a citar a proposta (${marca})`).not.toContain(marca);
    }
  });

  it("e a liberação continua gravando a PROCEDÊNCIA na trilha (item 8)", () => {
    /*
     * A CONTRAPARTIDA: o teste acima prova que este arquivo não LÊ a proposta; sem este, a forma
     * mais fácil de ficar verde ali seria apagar o registro da procedência, e a pergunta do item 8
     * voltaria a não ter resposta.
     */
    const codigo = codigoDe(VAGAS_SERVICE);
    expect(codigo).toContain("procedenciaDoClienteNaLiberacao");
    expect(codigo).toContain("fraseDaProcedenciaDoCliente");
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────
// 3. O VOCABULÁRIO É O COMPARTILHADO, E NÃO UMA SEGUNDA CÓPIA
// ────────────────────────────────────────────────────────────────────────────────────────────────

describe("as colunas só aceitam os valores que o `shared-types` declara", () => {
  it("as origens gravadas pela ingestão são as do vocabulário", () => {
    /*
     * DEFEITO QUE PEGA: um literal digitado à mão (`PLANILHA_ID`, `ID_VAGA`) que o CHECK do banco
     * recusa. O teste com banco fingido passaria, e a escrita falharia em produção, de 30 em 30
     * minutos, engolida pelo `catch` que protege a ingestão.
     */
    const codigo = codigoDe(ESCRITOR_DA_PROPOSTA);
    for (const origem of ORIGENS) {
      expect(codigo, `a ingestão não grava a origem ${origem}`).toContain(origem);
    }
    const escritos = codigo.match(/"PLANILHA_[A-Z_]+"/g) ?? [];
    for (const literal of escritos) {
      expect(ORIGENS as readonly string[], `origem fora do vocabulário: ${literal}`).toContain(
        literal.replaceAll('"', ""),
      );
    }
  });

  it("os dois estados existem, e cada um tem UM escritor", () => {
    expect([...ESTADOS].sort()).toEqual(["CONFIRMADO", "PROPOSTO"]);
    expect(codigoDe(ESCRITOR_DA_PROPOSTA)).toContain("'PROPOSTO'");
    expect(codigoDe(ESCRITOR_DO_ACEITE)).toContain("'CONFIRMADO'");
  });

  it("os dois casos da proposta são os do vocabulário compartilhado", () => {
    /*
     * A TELA PRECISA DOS DOIS (medido): 158 das 470 vagas recebem proposta COM código e 154 recebem
     * NOME SEM código, porque 59 dos 95 nomes não existem no catálogo da Admissão. Dizer "66%
     * resolvido" misturaria os dois, e a validação visual pareceria regressão.
     */
    expect([...CASOS].sort()).toEqual(["COM_CODIGO", "SO_NOME"]);
    const dominio = codigoDe(join(RAIZ_SRC, "domain", "as-depara-cliente-vaga.ts"));
    for (const caso of CASOS) {
      expect(dominio, `o domínio não resolve o caso ${caso}`).toContain(`"${caso}"`);
    }
  });
});
