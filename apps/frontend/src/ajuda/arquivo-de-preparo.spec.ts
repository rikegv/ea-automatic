/**
 * ─ TESTES DA TRAVA DO GESTO `subirArquivo` ─────────────────────────────────────────────────────
 *
 * A trava é de §A.6: o que sobe aparece na tela, a tela vira PNG e o PNG entra no git para sempre.
 * Por isso o `valor` do gesto é só o NOME de um arquivo sintético versionado, e não um caminho.
 *
 * Escrito pelo `devops`, que implementou o gesto. A revisão independente é do `tester` (§A.38).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FalhaDeCaptura,
  PASTA_DOS_ARQUIVOS_DE_PREPARO,
  caminhoDoArquivoDePreparo,
  conferirPrintsUnicos,
  slugDoArquivoDeRoteiro,
} from "./captura";

const RAIZ = path.resolve(fileURLToPath(new URL("../../../../", import.meta.url)));

describe("caminhoDoArquivoDePreparo: só o arquivo sintético versionado", () => {
  it("resolve o nome dentro da pasta única dos arquivos de preparo", () => {
    expect(caminhoDoArquivoDePreparo("lojas-de-exemplo.csv", "teste")).toBe(
      `${PASTA_DOS_ARQUIVOS_DE_PREPARO}/lojas-de-exemplo.csv`,
    );
  });

  it("recusa caminho ABSOLUTO, que é como a planilha real de alguém entraria num print", () => {
    expect(() => caminhoDoArquivoDePreparo("/home/henrique/Downloads/admissoes.xlsx", "teste")).toThrow(
      FalhaDeCaptura,
    );
    expect(() => caminhoDoArquivoDePreparo("~/planilha.xlsx", "teste")).toThrow(FalhaDeCaptura);
  });

  it("recusa subida de diretório, que é o mesmo furo pela porta relativa", () => {
    expect(() => caminhoDoArquivoDePreparo("../../../../../etc/passwd", "teste")).toThrow(
      FalhaDeCaptura,
    );
    expect(() => caminhoDoArquivoDePreparo("./a/../../b.csv", "teste")).toThrow(FalhaDeCaptura);
  });

  it("é FAIL-CLOSED: gesto sem `valor` não sobe nada, em vez de subir o último arquivo", () => {
    expect(() => caminhoDoArquivoDePreparo(undefined, "teste")).toThrow(FalhaDeCaptura);
    expect(() => caminhoDoArquivoDePreparo("   ", "teste")).toThrow(FalhaDeCaptura);
  });

  it("a mensagem diz o CAMINHO CERTO, porque é ela que resolve o erro sem uma segunda rodada", () => {
    try {
      caminhoDoArquivoDePreparo("/tmp/x.csv", "roteiro de teste");
      expect.unreachable();
    } catch (erro) {
      expect(String(erro)).toContain(PASTA_DOS_ARQUIVOS_DE_PREPARO);
      expect(String(erro)).toContain("roteiro de teste");
    }
  });
});

describe("o arquivo sintético da importação de planilha existe de verdade", () => {
  it("está versionado onde o roteiro declara", () => {
    // Arquivo declarado e ausente falha só na hora da captura, e a mensagem que aparece lá parece a
    // do detector de artigo velho. Conferir aqui transforma isso num teste de um segundo.
    expect(existsSync(path.join(RAIZ, caminhoDoArquivoDePreparo("lojas-de-exemplo.csv", "teste")))).toBe(
      true,
    );
  });
});

/*
 * ─ UM ARTIGO, VÁRIOS ROTEIROS ───────────────────────────────────────────────────────────────────
 *
 * A saída para o artigo que ensina DUAS telas foi multi-ARQUIVO, e não um `url` por imagem: nenhum
 * campo novo no contrato (§A.39, dono único), e o preparo do roteiro continua sendo um estado só.
 */
describe("slugDoArquivoDeRoteiro: `<slug>.2.roteiro.ts` é o MESMO artigo, em outra tela", () => {
  it("o arquivo simples é o slug", () => {
    expect(slugDoArquivoDeRoteiro("abrir-o-prontuario-no-drive.roteiro.ts")).toBe(
      "abrir-o-prontuario-no-drive",
    );
  });

  it("o sufixo numérico é continuação, e devolve o MESMO slug", () => {
    expect(slugDoArquivoDeRoteiro("abrir-o-prontuario-no-drive.2.roteiro.ts")).toBe(
      "abrir-o-prontuario-no-drive",
    );
    expect(slugDoArquivoDeRoteiro("x.10.roteiro.ts")).toBe("x");
  });

  it("slug com número no fim NÃO é confundido com continuação, porque o corte é o PONTO", () => {
    expect(slugDoArquivoDeRoteiro("ler-a-fase-2.roteiro.ts")).toBe("ler-a-fase-2");
  });

  it("arquivo que não é roteiro é ignorado, e não vira slug", () => {
    expect(slugDoArquivoDeRoteiro("roteiros-de-prova.ts")).toBe(null);
    expect(slugDoArquivoDeRoteiro("LEIA-ME.md")).toBe(null);
  });
});

describe("conferirPrintsUnicos: o único risco novo do multi-arquivo", () => {
  it("acusa a imagem declarada duas vezes no MESMO artigo", () => {
    const colisoes = conferirPrintsUnicos([
      { slug: "a", capturas: [{ arquivo: "01.png" }, { arquivo: "02.png" }] },
      { slug: "a", capturas: [{ arquivo: "01.png" }] },
    ]);
    expect(colisoes).toEqual([{ slug: "a", arquivo: "01.png", vezes: 2 }]);
  });

  it("o mesmo nome em artigos DIFERENTES é normal: a pasta é por slug", () => {
    expect(
      conferirPrintsUnicos([
        { slug: "a", capturas: [{ arquivo: "01.png" }] },
        { slug: "b", capturas: [{ arquivo: "01.png" }] },
      ]),
    ).toEqual([]);
  });
});
