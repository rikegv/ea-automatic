import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANDIDATURA_SITUACOES } from "@ea/shared-types";
import { situacaoDeNascimentoDigai } from "../../domain/digai";

/**
 * ─ O DIGAI NUNCA CRIA ADMISSAO: A TRAVA DO FIO DESLIGADO (`tester`, §A.38) ─────────────────────
 *
 * A REGRA E A MESMA, e vale para TODA ATS:
 *
 *   "O UNICO GATILHO QUE ENVIA PARA ADMISSAO E O GATILHO DA ESTEIRA, E NAO DAS ATS."
 *
 * ┌─ O QUE EU MEDI, E E POR ISSO QUE ESTE ARQUIVO E DE FRONTEIRA E NAO DE CICLO ─────────────────┐
 * │ `as/digai/` NAO tem ponte: zero ocorrencia de `criarPreAdmissao`, zero de `AdmissoesService` e  │
 * │ zero escrita de `admissao_id` fora de comentario. A regra JA ESTA satisfeita la, entao nao ha   │
 * │ defeito a reproduzir: o que falta e a trava que impede alguem de LIGAR esse fio depois, no dia  │
 * │ em que a ingestao do Digai parecer "igual a do Pandape" para quem chegar sem o contexto.        │
 * │                                                                                                │
 * │ A TRAVA TEM DUAS CAMADAS, de proposito, porque uma so nao segura:                               │
 * │   . CONTRATO: a situacao em que a candidatura do Digai NASCE nunca e situacao que pede ponte,   │
 * │     para TODO valor do vocabulario, inclusive o hostil vindo de uma linha de de/para editada;   │
 * │   . FONTE: nenhum arquivo da pasta alcanca a API que cria admissao.                             │
 * │ A camada de contrato e a que vale mais: ela mede COMPORTAMENTO e sobrevive a refatoracao. A de  │
 * │ fonte e grosseira, mas e a unica que pega o import novo que ninguem pediu.                      │
 * └──────────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ARMADILHA JA PAGA PELA CASA, e ela custou tres vermelhos falsos numa frente: a varredura de fonte
 * CASA COMENTARIO, e `as/digai/` tem nove linhas de comentario e de texto de log que citam
 * "admissao" (a regua de triagem finalizada se chama "regua de admissao"). Sem tirar os comentarios
 * isto daria vermelho para sempre; e sem CANARIO, daria verde para qualquer coisa, inclusive para
 * uma leitura que leu a pasta errada ou que comeu o arquivo todo.
 */

const PASTA_DO_DIGAI = __dirname;
const RAIZ_DO_BACKEND_SRC = join(__dirname, "..", "..");

function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/(^|[^:/])\/\/.*$/, "$1"))
    .join("\n");
}

function fontesDaPasta(pasta: string): { nome: string; codigo: string }[] {
  return readdirSync(pasta)
    .filter((n) => n.endsWith(".ts"))
    .filter((n) => !n.includes(".spec.") && !n.includes("tester-fake"))
    .map((nome) => ({ nome, codigo: semComentarios(readFileSync(join(pasta, nome), "utf8")) }));
}

/**
 * A SITUACAO QUE ENVIA PARA A ADMISSAO, declarada AQUI e nao importada de
 * `SITUACOES_QUE_PEDEM_PONTE_PARA_ADMISSAO`.
 *
 * MEDIDO ANTES DE ESCREVER, e e por isso que o literal e local: aquela constante tem UM consumidor
 * de producao, `desfechoDaIngestaoExterna`, que por sua vez so e lido pelo ciclo da varredura. Com o
 * conserto, ela pode sair junto como sinal morto, e um teste pendurado nela PARARIA DE COMPILAR em
 * vez de medir. O canario abaixo cobre o risco que a importacao cobriria: o valor tem de continuar
 * existindo no vocabulario da candidatura.
 */
const SITUACAO_QUE_ENVIA_PARA_ADMISSAO = "ENVIADO_PARA_ADMISSAO";

describe("camada 1 (contrato): a candidatura do Digai nunca nasce pedindo admissao", () => {
  /*
   * TODO O VOCABULARIO, E NAO SO O CAMINHO FELIZ. A situacao chega da LINHA do de/para, que e DADO
   * editavel, e foi exatamente esse `??` sobre dado que o `seguranca` achou em 29/09/2026. Varrer o
   * enum inteiro e o que impede que um valor novo (o proximo a entrar em `CANDIDATURA_SITUACOES`)
   * passe a abrir ponte sem ninguem decidir isso.
   */
  for (const situacao of CANDIDATURA_SITUACOES) {
    it(`de/para dizendo "${situacao}" nao faz a candidatura nascer pedindo admissao`, () => {
      const { situacao: nascimento } = situacaoDeNascimentoDigai(situacao);
      expect(nascimento).not.toBe(SITUACAO_QUE_ENVIA_PARA_ADMISSAO);
    });
  }

  it("sem linha de de/para (nulo e indefinido) tambem nao nasce pedindo admissao", () => {
    for (const vazio of [null, undefined]) {
      const { situacao } = situacaoDeNascimentoDigai(vazio);
      expect(situacao).not.toBe(SITUACAO_QUE_ENVIA_PARA_ADMISSAO);
    }
  });

  /*
   * O CANARIO DESTA CAMADA. Sem ele, um `not.toBe` contra um literal que nao existe mais no
   * vocabulario (renomeado numa migration) passaria para sempre, medindo nada.
   */
  it("o canario: a situacao que envia para a admissao existe no vocabulario", () => {
    expect(CANDIDATURA_SITUACOES).toContain(SITUACAO_QUE_ENVIA_PARA_ADMISSAO);
  });
});

describe("camada 2 (fonte): a pasta do Digai nao alcanca a criacao de admissao", () => {
  /*
   * OS DOIS CANARIOS. O primeiro prova que o alvo da busca EXISTE e e encontravel fora de
   * comentario; o segundo prova que a leitura pegou a pasta certa e que ela nao esta vazia. Sem os
   * dois, um `toEqual([])` sobre lista vazia nao distingue "nao ha culpado" de "nao ha medicao".
   */
  it("canario 1: a API de criacao de admissao existe e e encontravel fora de comentario", () => {
    const servico = semComentarios(
      readFileSync(join(RAIZ_DO_BACKEND_SRC, "admissoes", "admissoes.service.ts"), "utf8"),
    );
    expect(servico).toContain("criarPreAdmissaoDoFunil");
  });

  it("canario 2: a varredura de fonte LE a pasta do Digai, e ela tem os arquivos esperados", () => {
    const nomes = fontesDaPasta(PASTA_DO_DIGAI).map((f) => f.nome);
    expect(nomes).toContain("digai-importacao.service.ts");
    expect(nomes).toContain("digai-varredura.service.ts");
    expect(nomes).toContain("digai-repositorio.ts");
    expect(nomes.length).toBeGreaterThan(8);
  });

  /*
   * CANARIO 3, E ELE E O QUE PROVA QUE A LIMPEZA DE COMENTARIO NAO COMEU O CODIGO. Um
   * `semComentarios` com regex errado devolveria string vazia e TODA asserção de ausencia passaria.
   * `export class DigaiVarreduraService` tem de sobreviver a limpeza.
   */
  it("canario 3: a limpeza de comentario nao apaga o codigo", () => {
    const varredura = fontesDaPasta(PASTA_DO_DIGAI).find(
      (f) => f.nome === "digai-varredura.service.ts",
    );
    expect(varredura?.codigo).toContain("export class DigaiVarreduraService");
    expect(varredura?.codigo.length).toBeGreaterThan(2000);
  });

  it("nenhum arquivo do Digai cita a API de criacao de admissao", () => {
    const culpados = fontesDaPasta(PASTA_DO_DIGAI)
      .filter((f) => /criarPreAdmissao|AdmissoesService|admissoes\.service/.test(f.codigo))
      .map((f) => f.nome);
    expect(culpados).toEqual([]);
  });

  it("nenhum arquivo do Digai escreve o elo admissao_id", () => {
    const culpados = fontesDaPasta(PASTA_DO_DIGAI)
      .filter((f) => /admissao_id|admissaoId/.test(f.codigo))
      .map((f) => f.nome);
    expect(culpados).toEqual([]);
  });

  /*
   * E A SITUACAO DE ENVIO NAO E ESCRITA A MAO EM LUGAR NENHUM DA PASTA. A camada de contrato cobre
   * o caminho que passa por `situacaoDeNascimentoDigai`; esta cobre o atalho, que e alguem escrever
   * o literal direto numa consulta e nunca atravessar o dominio.
   */
  it("nenhum arquivo do Digai escreve ENVIADO_PARA_ADMISSAO como literal", () => {
    const culpados = fontesDaPasta(PASTA_DO_DIGAI)
      .filter((f) => f.codigo.includes("ENVIADO_PARA_ADMISSAO"))
      .map((f) => f.nome);
    expect(culpados).toEqual([]);
  });
});
