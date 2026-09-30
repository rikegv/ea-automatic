import { describe, expect, it } from "vitest";
import {
  decidirPrecedencia,
  ponteDeveDisparar,
  valorDeComparacao,
} from "./as-precedencia-ingestao";

/**
 * ─ A REGUA DE PRECEDENCIA, MEDIDA COMO DOMINIO PURO ────────────────────────────────────────────
 *
 * Nenhum Postgres, nenhum Nest, nenhuma fila. É aqui que a decisão "escreve ou vira divergência" é
 * afirmada, porque é aqui que ela mora: os dois lados que a consultam (a candidatura, por linha, e a
 * vaga, por papel de status) chamam a MESMA função, e um `if` em cada um deles concordaria por
 * coincidência até o dia em que alguém corrigisse um só.
 *
 * §A.6: nenhum valor aqui é dado pessoal. São códigos de etapa, códigos de situação, números e um
 * rótulo de vaga sintético.
 */

describe("a régua de precedência: dado o valor do EA e o do ATS", () => {
  it("ESCREVE quando o ponto NÃO é protegido (nascimento, ou vaga em revisão)", () => {
    // O QUE ISTO PROVA: na entrada nova o ATS manda, porque não há trabalho humano a proteger. Sem
    // este ramo, a ingestão não conseguiria criar candidatura nem espelhar vaga nenhuma.
    expect(decidirPrecedencia({ protegido: false, valorEa: null, valorAts: "CAPTACAO" })).toBe(
      "ESCREVER",
    );
    expect(
      decidirPrecedencia({ protegido: false, valorEa: "CAPTACAO", valorAts: "ENTREVISTA_SOULAN" }),
    ).toBe("ESCREVER");
  });

  it("DIVERGE quando o ponto é protegido e os lados discordam", () => {
    // O QUE ISTO PROVA: o defeito medido em 30/09. O time move a pessoa para ENTREVISTA_CLIENTE, o
    // ATS insiste em CAPTACAO, e a resposta passa a ser "não escreve, abre linha de revisão" em vez
    // de "sobrescreve porque o valor é diferente", que era o que o `is distinct from` autorizava.
    expect(
      decidirPrecedencia({
        protegido: true,
        valorEa: "ENTREVISTA_CLIENTE",
        valorAts: "CAPTACAO",
      }),
    ).toBe("DIVERGIR");
  });

  it("NAO FAZ NADA quando os dois lados concordam, INCLUSIVE em ponto protegido", () => {
    /*
     * O QUE ISTO PROVA, e é a metade que impede a fila de virar log: a comparação vem ANTES da
     * proteção. Sem esta ordem, 48 voltas por dia abririam linha de revisão para toda candidatura em
     * que o ATS concorda com o EA, que é a MAIORIA, e a fila de trabalho seria inútil no primeiro dia.
     */
    expect(
      decidirPrecedencia({ protegido: true, valorEa: "CAPTACAO", valorAts: "CAPTACAO" }),
    ).toBe("NADA");
    expect(decidirPrecedencia({ protegido: true, valorEa: null, valorAts: null })).toBe("NADA");
  });

  it("trata VAZIO e NULO como a MESMA ausência, e não como discordância", () => {
    /*
     * O QUE ISTO PROVA: a divergência FANTASMA. O ATS entrega string vazia onde o EA tem nulo (e
     * vice-versa) em campo de texto, e sem esta normalização a fila ganharia uma linha por volta,
     * para sempre, dizendo que "" é diferente de nada.
     */
    expect(decidirPrecedencia({ protegido: true, valorEa: null, valorAts: "" })).toBe("NADA");
    expect(decidirPrecedencia({ protegido: true, valorEa: "   ", valorAts: undefined })).toBe(
      "NADA",
    );
  });

  it("compara NUMERO com TEXTO sem inventar diferença", () => {
    /*
     * O QUE ISTO PROVA: `posicoes_oficiais` é inteiro no banco e chega da API como número ou texto,
     * e `cidade_id` é inteiro. Sem a normalização, `3` seria diferente de `"3"` e a vaga liberada
     * divergiria em toda volta nos dois campos numéricos.
     */
    expect(decidirPrecedencia({ protegido: true, valorEa: 3, valorAts: "3" })).toBe("NADA");
    expect(decidirPrecedencia({ protegido: true, valorEa: 3, valorAts: 4 })).toBe("DIVERGIR");
  });

  it("o valor de comparação é TEXTO ou NULO, sempre", () => {
    expect(valorDeComparacao(7)).toBe("7");
    expect(valorDeComparacao(" CAPTACAO ")).toBe("CAPTACAO");
    expect(valorDeComparacao("")).toBeNull();
    expect(valorDeComparacao(null)).toBeNull();
    expect(valorDeComparacao(undefined)).toBeNull();
    // NaN NAO VIRA "NaN": número que não é número é ausência, e escrever o texto "NaN" na fila faria
    // a tela mostrar uma divergência ilegível que o time não teria como decidir.
    expect(valorDeComparacao(Number.NaN)).toBeNull();
  });
});

describe("a régua do QUANDO a ponte para a admissão dispara", () => {
  it("dispara no NASCIMENTO, quando o desfecho pede", () => {
    expect(ponteDeveDisparar({ desfechoPedePonte: true, criada: true })).toBe(true);
  });

  it("NAO dispara quando o desfecho não pede, nem mesmo no nascimento", () => {
    // O QUE ISTO PROVA: a ponte é do desfecho `ENVIADO_PARA_ADMISSAO`, e não de toda entrada nova.
    // Sem esta recusa, a varredura abriria admissão para 137 mil inscritos.
    expect(ponteDeveDisparar({ desfechoPedePonte: false, criada: true })).toBe(false);
  });

  it("RETENTA na candidatura que JA EXISTE com `ENVIADO_PARA_ADMISSAO` e sem admissão", () => {
    /*
     * O QUE ISTO PROVA, e é o item 6 do diretor resolvido de graça: com a trava de precedência, o ATS
     * nunca mais escreve `situacao` em linha existente, então este par só pode ter vindo do INSERT da
     * própria ingestão numa volta em que a ponte não se completou (CPF ausente, falha de rede).
     * Antes da trava esta MESMA condição seria um furo, porque era o ATS quem escrevia a situação.
     */
    expect(
      ponteDeveDisparar({
        desfechoPedePonte: true,
        criada: false,
        situacaoNoEa: "ENVIADO_PARA_ADMISSAO",
        jaTemAdmissao: false,
      }),
    ).toBe(true);
  });

  it("NAO retenta quando a candidatura JA APONTA para uma admissão", () => {
    // O QUE ISTO PROVA: a volta de 30 minutos não pede ponte por candidatura já ligada. A
    // idempotência de verdade continua no adaptador (ele lê `admissao_id` antes de escrever); esta
    // régua evita a chamada inútil, 48 vezes por dia, por pessoa.
    expect(
      ponteDeveDisparar({
        desfechoPedePonte: true,
        criada: false,
        situacaoNoEa: "ENVIADO_PARA_ADMISSAO",
        jaTemAdmissao: true,
      }),
    ).toBe(false);
  });

  it("NAO retenta em candidatura existente com OUTRA situação", () => {
    // O QUE ISTO PROVA: a retentativa é só do caso da ponte incompleta. Quem está ATIVO no funil do
    // EA não vira admissão por sinal do ATS, que é a garantia que a régua antiga dava e que esta
    // mantém inteira.
    expect(
      ponteDeveDisparar({
        desfechoPedePonte: true,
        criada: false,
        situacaoNoEa: "ATIVO",
        jaTemAdmissao: false,
      }),
    ).toBe(false);
    expect(
      ponteDeveDisparar({
        desfechoPedePonte: true,
        criada: false,
        situacaoNoEa: "DESCARTADO",
        jaTemAdmissao: false,
      }),
    ).toBe(false);
  });

  it("é FAIL-CLOSED em todo `nao sei`", () => {
    /*
     * O QUE ISTO PROVA: adaptador que não sabe dizer se a linha nasceu, ou qual a situação dela, cai
     * para o lado de NÃO criar admissão. É a direção da frente inteira: admissão criada por engano é
     * muito mais caro de desfazer do que admissão que não nasceu numa volta.
     */
    expect(ponteDeveDisparar({ desfechoPedePonte: true })).toBe(false);
    expect(
      ponteDeveDisparar({ desfechoPedePonte: true, situacaoNoEa: "ENVIADO_PARA_ADMISSAO" }),
    ).toBe(false);
  });
});
