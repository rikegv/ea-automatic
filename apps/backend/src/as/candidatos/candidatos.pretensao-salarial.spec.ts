import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { asCandidaturas } from "../../db/schema";
import {
  bancoFingido,
  linhaFingida,
  usuarioFingido,
} from "./fronteira-encerrada.tester-fake";
import {
  MOTIVO_DE_DESCARTE_VALIDO,
  MOTIVO_QUE_PEDE_PRETENSAO,
} from "../motivos-descarte/motivos-descarte.fake";

/**
 * ─ A PRETENSÃO SALARIAL, PEDIDA PELA MARCA DO CATÁLOGO (Frente E, ponto 9) ──────────────────────
 *
 * ┌─ A PROPRIEDADE CENTRAL, E ELA É SOBRE O QUE O CÓDIGO **NÃO** FAZ ────────────────────────────┐
 * │ A ligação entre "este desfecho pede o valor" e "este motivo" é uma MARCA no catálogo          │
 * │ (`motivos_descarte.pede_pretensao`), e NUNCA uma comparação com o NOME do motivo. O catálogo  │
 * │ é gerenciável: o diretor cria, RENOMEIA e inativa pela tela, e um `=== "Pretensão Salarial"`  │
 * │ pararia de funcionar na primeira correção de grafia SEM NADA FALHAR (o campo simplesmente     │
 * │ deixaria de ser pedido). O último bloco deste arquivo varre o código-fonte e prova que a      │
 * │ comparação por nome não existe em lugar nenhum.                                                │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS DUAS METADES DA RÉGUA, E A SEGUNDA É A QUE SE ESQUECE ───────────────────────────────────┐
 * │ 1. O MOTIVO PEDE E O VALOR NÃO VEIO -> 400. Sem isto a regra viveria só no navegador.         │
 * │ 2. O MOTIVO NÃO PEDE E O VALOR VEIO -> 400. Isto é §A.6: sem ela o campo é uma gaveta de      │
 * │    salário aberta em QUALQUER desfecho, coletando dado financeiro que ninguém mandou coletar. │
 * │    Minimização é RECUSAR o que não se pediu, e não só deixar de pedir.                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: os valores usados aqui são inventados, e nenhuma asserção deste arquivo exige que o número
 * apareça numa MENSAGEM de erro. É de propósito: erro que repete o valor o manda para a resposta e,
 * dali, para qualquer log de cliente HTTP.
 */

const CONSULTOR = usuarioFingido("COMUM");
const PRETENSAO = "2500.00";

function cenarioVivo() {
  return bancoFingido({ candidaturas: [linhaFingida({ situacao: "ATIVO" })] });
}

describe("1. o motivo MARCADO exige a pretensão, e ela é gravada com o desfecho", () => {
  it("grava o valor na candidatura, na mesma transação da saída", async () => {
    const b = cenarioVivo();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO, pretensaoSalarial: PRETENSAO },
      CONSULTOR,
    );

    expect(b.updateDa("cand-1")).toMatchObject({
      situacao: "DESCARTADO",
      motivoDescarte: MOTIVO_QUE_PEDE_PRETENSAO,
      pretensaoSalarial: PRETENSAO,
    });
  });

  it("RECUSA o desfecho quando o motivo pede e o valor não veio", async () => {
    const b = cenarioVivo();

    const erro = await b.service
      .registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO },
        CONSULTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(String((erro as BadRequestException).message)).toMatch(/pretensão salarial/i);
  });

  /**
   * NADA É GRAVADO NA RECUSA, e esta é a asserção par da de cima: uma recusa que acontecesse DEPOIS
   * da escrita deixaria a candidatura encerrada sem o valor que o desfecho existe para explicar, e
   * o 400 na tela seria mentira. A conferência roda ANTES de qualquer transação.
   */
  it("a recusa por valor faltando não grava NADA", async () => {
    const b = cenarioVivo();

    await b.service
      .registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO },
        CONSULTOR,
      )
      .catch(() => null);

    expect(b.updates).toHaveLength(0);
    expect(b.inserts).toHaveLength(0);
  });
});

describe("2. o motivo que NÃO pede RECUSA o valor (§A.6, minimização)", () => {
  it("recusa a pretensão enviada num motivo comum, e não grava nada", async () => {
    const b = cenarioVivo();

    const erro = await b.service
      .registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO, pretensaoSalarial: PRETENSAO },
        CONSULTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
    expect(b.updates).toHaveLength(0);
  });

  /**
   * O DESFECHO SEM MARCA SEGUE FUNCIONANDO, E NÃO TOCA A COLUNA. `undefined` é "não mexe", e é
   * diferente de `null` ("apaga"): gravar `null` aqui apagaria, um dia, um valor legítimo de quem
   * tivesse a saída reescrita por outro caminho.
   */
  it("o descarte comum continua passando, e NÃO escreve a coluna da pretensão", async () => {
    const b = cenarioVivo();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO },
      CONSULTOR,
    );

    const gravado = b.updateDa("cand-1")!;
    expect(gravado).toMatchObject({ situacao: "DESCARTADO" });
    expect(gravado).not.toHaveProperty("pretensaoSalarial");
  });

  /**
   * ─ A PONTE A&S PARA ADMISSÃO NÃO É ALCANÇADA POR ESTA RÉGUA (§A.26) ───────────────────────────
   *
   * `ENVIADO_PARA_ADMISSAO` está FORA de `SITUACOES_COM_MOTIVO_DE_CATALOGO`: o motivo dele é PROSA,
   * não classificação. Então ele nunca tem motivo marcado, nunca pede pretensão, e continua
   * passando com a explicação que o consultor escrever. Este caso existe porque alargar a régua
   * silenciosamente derrubaria o envio de TODA pessoa aprovada, que é código validado em produção.
   */
  it("o envio para a admissão segue aceitando prosa, sem pedir pretensão nenhuma", async () => {
    const b = cenarioVivo();

    await b.service.registrarSaida(
      "cand-1",
      {
        situacao: "ENVIADO_PARA_ADMISSAO",
        motivo: "aprovado pelo cliente, começa dia 1",
      },
      CONSULTOR,
    );

    expect(b.situacaoDe("cand-1")).toBe("ENVIADO_PARA_ADMISSAO");
  });
});

describe("3. a LIGAÇÃO é pela MARCA do catálogo, e a comparação por NOME não existe no código", () => {
  /**
   * ─ A VARREDURA, E POR QUE ELA É O CASO MAIS IMPORTANTE DO ARQUIVO ────────────────────────────
   *
   * Os casos acima ficariam VERDES com um `motivo === "Pretensão Salarial"` no service, porque o
   * fake usa exatamente esse nome. O que eles NÃO conseguem medir é o dia em que o diretor
   * renomear a linha: o teste continuaria verde e a produção pararia de pedir o valor, em silêncio.
   *
   * ENTÃO A PROVA É ESTRUTURAL: nenhuma linha de PRODUÇÃO de `as/` compara com o nome. A régua é
   * a mesma da D1 estrutural do expurgo: em vez de confiar que ninguém vai escrever o literal,
   * afirma-se que ele não está escrito.
   */
  it("nenhum arquivo de produção de `as/` compara o motivo com o nome do vocabulário", () => {
    const raiz = join(__dirname, "..");
    const fontes: string[] = [];
    const varrer = (dir: string) => {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const caminho = join(dir, item.name);
        if (item.isDirectory()) varrer(caminho);
        else if (
          item.name.endsWith(".ts") &&
          !item.name.includes(".spec.") &&
          !item.name.includes(".fake") &&
          !item.name.includes("tester-fake")
        ) {
          fontes.push(caminho);
        }
      }
    };
    varrer(raiz);

    /*
     * ─ A RÉGUA PROCURA A COMPARAÇÃO, E NÃO A PALAVRA ────────────────────────────────────────
     *
     * A PRIMEIRA VERSÃO DESTE CASO PROCUROU A PALAVRA "pretensão salarial" no arquivo, e ela
     * acusou TRÊS arquivos que estavam CERTOS: a frase aparece (e deve aparecer) na MENSAGEM de
     * erro que o consultor lê, na mensagem do `@Matches` do DTO e nos comentários que explicam a
     * decisão. Proibir a palavra proibiria o sistema de falar português.
     *
     * O QUE NÃO PODE EXISTIR É A COMPARAÇÃO: um literal com "pretens" dentro, colado num operador
     * de igualdade ou numa busca de coleção. É isso que quebraria quando o diretor renomeasse a
     * linha do catálogo, e é exatamente isso que o padrão abaixo procura.
     */
    const COMPARACAO_POR_NOME = /(===|!==|==\s|!=\s|\.includes\(|\.indexOf\(|\.some\(.*)["'`][^"'`]*pretens/i;

    /*
     * E O COMENTÁRIO É DESCARTADO ANTES DA BUSCA, porque a documentação desta decisão CITA o
     * padrão proibido para explicar por que ele é proibido (`motivo === "Pretensão Salarial"`, no
     * cabeçalho de `exigirPretensaoQuandoOMotivoPede`). Sem este filtro, o teste acusaria o
     * arquivo que faz a coisa CERTA por ele ter escrito o motivo de fazê-la.
     */
    const semComentario = (conteudo: string) =>
      conteudo
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          return !t.startsWith("*") && !t.startsWith("//") && !t.startsWith("/*");
        });

    const culpados = fontes.filter((f) =>
      semComentario(readFileSync(f, "utf8")).some((l) => COMPARACAO_POR_NOME.test(l)),
    );

    expect(
      culpados,
      "o vocabulário do motivo virou literal em código de produção: renomear o motivo na tela passaria a desligar a coleta em silêncio",
    ).toEqual([]);
  });

  /**
   * E A OUTRA METADE DA MESMA PROVA: a régua responde pela MARCA. Com o MESMO nome de motivo, mas
   * SEM a marca no catálogo, o valor passa a ser recusado. Se a decisão fosse por nome, este caso
   * ficaria vermelho.
   */
  it("o mesmo NOME sem a marca no catálogo deixa de pedir o valor", async () => {
    const b = bancoFingido({ candidaturas: [linhaFingida({ situacao: "ATIVO" })] });

    // O motivo comum do catálogo tem `pedePretensao: false`. Mandar o valor com ele é recusado, e é
    // a MARCA que decide isso: os dois são strings do mesmo catálogo ativo.
    const erro = await b.service
      .registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO, pretensaoSalarial: PRETENSAO },
        CONSULTOR,
      )
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(BadRequestException);
  });
});

describe("4. o valor NÃO entra em mensagem de erro (§A.6)", () => {
  /**
   * DADO FINANCEIRO DE PESSOA NÃO VIAJA EM RESPOSTA DE ERRO. Uma frase que repetisse o número o
   * mandaria para o toast da tela, para a área de transferência de quem copia o erro e para
   * qualquer log de cliente HTTP. É a mesma régua que a recusa de CPF duplicado já segue.
   */
  it("a recusa fala do CAMPO e nunca repete o número recebido", async () => {
    const b = cenarioVivo();

    const erro = await b.service
      .registrarSaida(
        "cand-1",
        { situacao: "DESCARTADO", motivo: MOTIVO_DE_DESCARTE_VALIDO, pretensaoSalarial: PRETENSAO },
        CONSULTOR,
      )
      .catch((e: unknown) => e);

    expect(JSON.stringify(erro)).not.toContain(PRETENSAO);
    expect(String((erro as BadRequestException).message)).not.toContain("2500");
  });
});

describe("5. a coluna desce na leitura da candidatura, para a tela poder mostrar o valor", () => {
  it("o item da candidatura carrega `pretensaoSalarial`", async () => {
    const b = cenarioVivo();

    const item = await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO, pretensaoSalarial: PRETENSAO },
      CONSULTOR,
    );

    // O fake devolve a linha JÁ ATUALIZADA na leitura de volta, que é o que o banco faz.
    expect(item).toHaveProperty("pretensaoSalarial");
  });

  /** A tabela escrita é a da CANDIDATURA, e não a do candidato: a pretensão é do PROCESSO. */
  it("o valor é gravado em `as_candidaturas`, nunca em `as_candidatos`", async () => {
    const b = cenarioVivo();

    await b.service.registrarSaida(
      "cand-1",
      { situacao: "DESCARTADO", motivo: MOTIVO_QUE_PEDE_PRETENSAO, pretensaoSalarial: PRETENSAO },
      CONSULTOR,
    );

    const comPretensao = b.updates.filter((u) => "pretensaoSalarial" in u.valores);
    expect(comPretensao).toHaveLength(1);
    expect(comPretensao[0]!.tabela).toBe(asCandidaturas);
  });
});
