import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import {
  decodificarTexto,
  detectarLinhaCabecalho,
  ErroLeituraPlanilha,
  lerPlanilha,
  lerTexto,
  MAX_LINHAS_PLANILHA,
  numeroDaLinhaNoArquivo,
} from "./leitor";

/**
 * ─ COBERTURA INDEPENDENTE DO LEITOR MULTI FORMATO (§A.38) ───────────────────────────────────────────
 *
 * Quem escreveu estes testes NÃO escreveu o `leitor.ts`. O `leitor.spec.ts` (do autor) prova os três
 * casos que motivaram a frente (o `.xls` legado, o cabeçalho na linha 2, as duas abas) e prova bem. O
 * que ele NÃO cobre, e é o que teste do próprio autor pega mal, é o CONTORNO do requisito: o caso
 * NORMAL continuar normal depois da heurística nova, e o caminho de exceção não virar grade errada.
 *
 * Os gaps fechados aqui, cada um com o motivo:
 *   G1. O CASO NORMAL NÃO PODE QUEBRAR. O autor só prova "cabeçalho na linha 1" em CSV; a heurística
 *       roda igual em xlsx e no `.xls`, e é nesses dois que a base real vive.
 *   G2. DUAS linhas de título, e linha em branco no topo: a planilha de ERP não tem só uma linha de
 *       banner, e planilha de gente tem linha vazia de respiro antes da tabela.
 *   G3. LINHA DE DADO MAIS CURTA que o cabeçalho: ela não pode deslocar coluna nem ser promovida a
 *       cabeçalho, e o número da linha no arquivo tem de continuar batendo.
 *   G4. ENCODING que NÃO pode ser corrompido: UTF-8 com muitos acentos (sem BOM e com BOM) tem de
 *       continuar UTF-8. A queda para cp1252 é rede de proteção, não porta de entrada.
 *   G5. SEPARADOR com vírgula DENTRO de campo entre aspas, nos dois sentidos (sep vírgula e sep ponto
 *       e vírgula), mais TSV com célula vazia no meio e arquivo com CRLF sem quebra no fim.
 *   G6. TETO no caminho BINÁRIO (o autor só testou em CSV) e a INVARIANTE da contagem: o que entra
 *       mais o que foi descartado é igual ao que o arquivo tinha.
 *   G7. ARQUIVO MUTILADO (`.xls` truncado ao meio, só o header OLE2, xlsx truncado) é RECUSA, nunca
 *       crash e nunca meia grade.
 *   G8. A ABA PEDIDA no caminho de exceção: aba vazia e aba com conteúdo sem cabeçalho são DUAS
 *       mensagens diferentes, porque são duas correções diferentes para quem enviou o arquivo.
 *
 * FIXTURES SINTÉTICAS (§A.6): nada aqui vem da base real, que tem PII e não entra no repositório.
 */

// ── FIXTURES ─────────────────────────────────────────────────────────────────────────────────────

/** `.xls` LEGADO de verdade (BIFF8/OLE2), o formato da base do diretor. */
function xls(abas: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of Object.entries(abas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), nome);
  }
  return XLSX.write(wb, { bookType: "xls", type: "buffer" }) as Buffer;
}

/** XLSX de verdade (zip/PK) pelo exceljs, inclusive com linha vazia preservada. */
async function xlsx(abas: Record<string, unknown[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [nome, linhas] of Object.entries(abas)) {
    const ws = wb.addWorksheet(nome);
    for (const l of linhas) ws.addRow(l as ExcelJS.CellValue[]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Devolve o erro de leitura, e falha o teste quando a leitura NÃO recusou. */
async function recusaDe(buffer: Buffer, aba?: string): Promise<ErroLeituraPlanilha> {
  try {
    await lerPlanilha(buffer, { aba });
  } catch (err) {
    if (err instanceof ErroLeituraPlanilha) return err;
    throw err;
  }
  throw new Error("a leitura NÃO recusou o arquivo, e devia ter recusado");
}

// ── G1. O CASO NORMAL CONTINUA NORMAL, NOS TRÊS FORMATOS ─────────────────────────────────────────

describe("G1: cabeçalho JÁ na linha 1 continua na linha 1, em xls, xlsx e csv", () => {
  const grade: unknown[][] = [
    ["Nome", "Email", "Cidade", "UF"],
    ["Fulano De Teste", "fulano@exemplo.com", "São Paulo", "SP"],
    ["Ciclana De Teste", "ciclana@exemplo.com", "Santo André", "SP"],
  ];

  it("no `.xls` legado: nenhuma linha de dado é promovida a cabeçalho", async () => {
    const g = await lerPlanilha(xls({ Plan1: grade }));
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade", "UF"]);
    expect(g.linhas).toHaveLength(2);
    expect(g.linhas[0]?.[0]).toBe("Fulano De Teste");
  });

  it("no xlsx: idem, e a primeira pessoa não se perde virando cabeçalho", async () => {
    const g = await lerPlanilha(await xlsx({ Plan1: grade }));
    expect(g.linhaCabecalho).toBe(1);
    expect(g.linhas).toHaveLength(2);
    expect(numeroDaLinhaNoArquivo(g, 0)).toBe(2);
  });

  it("no CSV com duas colunas e duas linhas: o mínimo que ainda é uma tabela", () => {
    const g = lerTexto("Nome;Email\nFulano;f@e.com\n");
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["Nome", "Email"]);
    expect(g.linhas).toEqual([["Fulano", "f@e.com"]]);
  });
});

// ── G2. MAIS DE UMA LINHA ANTES DO CABEÇALHO ─────────────────────────────────────────────────────

describe("G2: o topo da planilha real tem mais que uma linha de título", () => {
  it("DUAS linhas de título antes do cabeçalho: acha a linha 3", async () => {
    const g = await lerPlanilha(
      xls({
        Plan1: [
          ["Grupo Soulan"],
          ["Relatório de Candidatos"],
          ["Nome", "Email", "Cidade", "UF"],
          ["Fulano De Teste", "f@e.com", "São Paulo", "SP"],
        ],
      }),
    );
    expect(g.linhaCabecalho).toBe(3);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade", "UF"]);
    expect(g.linhas).toHaveLength(1);
    // O número que o relatório mostra tem de ser o que a pessoa acha na planilha dela.
    expect(numeroDaLinhaNoArquivo(g, 0)).toBe(4);
  });

  it("LINHA EM BRANCO no topo (o respiro antes da tabela) não conta como cabeçalho", async () => {
    const g = await lerPlanilha(await xlsx({ Plan1: [[], ["Nome", "Email"], ["Fulano", "f@e.com"]] }));
    expect(g.linhaCabecalho).toBe(2);
    expect(g.cabecalho).toEqual(["Nome", "Email"]);
    expect(g.linhas).toEqual([["Fulano", "f@e.com"]]);
  });

  it("título de UMA célula seguido de cabeçalho LARGO: o título perde, como tem de perder", () => {
    expect(detectarLinhaCabecalho([["Dados: Candidatos"], ["A", "B", "C"], ["1", "2", "3"]])).toBe(2);
  });
});

// ── G3. LINHA DE DADO MAIS CURTA QUE O CABEÇALHO ─────────────────────────────────────────────────

describe("G3: linha de dado incompleta não desloca coluna nem vira cabeçalho", () => {
  it("no CSV: a linha curta fica curta, e as células que existem continuam na coluna certa", () => {
    const g = lerTexto("Nome;Email;Cidade;UF\nFulano\nCiclana;c@e.com;Santo André;SP\n");
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade", "UF"]);
    expect(g.linhas).toHaveLength(2);
    expect(g.linhas[0]).toEqual(["Fulano"]);
    // A célula que falta é AUSÊNCIA (índice sem valor), nunca um valor da coluna vizinha.
    expect(g.linhas[0]?.[1]).toBeUndefined();
    expect(g.linhas[1]).toEqual(["Ciclana", "c@e.com", "Santo André", "SP"]);
  });

  it("no xlsx: a PRIMEIRA linha de dado curta não faz a segunda ser lida como cabeçalho", async () => {
    const g = await lerPlanilha(
      await xlsx({ Plan1: [["Nome", "Email", "Cidade"], ["Fulano"], ["Ciclana", "c@e.com", "SP"]] }),
    );
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade"]);
    expect(g.linhas.map((l) => l[0])).toEqual(["Fulano", "Ciclana"]);
    expect(numeroDaLinhaNoArquivo(g, 1)).toBe(3);
  });

  it("linha de dado MAIS LARGA que o cabeçalho: o cabeçalho de cima continua sendo o cabeçalho", () => {
    const g = lerTexto("Nome;Email\nFulano;f@e.com;sobra\nCiclana;c@e.com\n");
    expect(g.linhaCabecalho).toBe(1);
    expect(g.cabecalho).toEqual(["Nome", "Email"]);
    expect(g.linhas).toHaveLength(2);
  });
});

// ── G4. O ENCODING UTF-8 NÃO PODE SER CORROMPIDO PELA REDE DE PROTEÇÃO ───────────────────────────

describe("G4: a queda para cp1252 não corrompe arquivo UTF-8 legítimo", () => {
  const ACENTOS = "Nome;Cidade\nJosé Antônio;São Paulo\nMárcia Gonçalves;Poá\n";

  it("UTF-8 SEM BOM com muitos acentos permanece UTF-8", async () => {
    const g = await lerPlanilha(Buffer.from(ACENTOS, "utf8"));
    expect(g.linhas[0]).toEqual(["José Antônio", "São Paulo"]);
    expect(g.linhas[1]).toEqual(["Márcia Gonçalves", "Poá"]);
    // Nem caractere de substituição, nem mojibake de dupla decodificação.
    const texto = JSON.stringify(g);
    expect(texto).not.toContain("�");
    expect(texto).not.toContain("Ã");
  });

  it("UTF-8 COM BOM e acentos: o BOM sai e os acentos ficam", async () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ACENTOS, "utf8")]);
    const g = await lerPlanilha(buf);
    expect(g.cabecalho).toEqual(["Nome", "Cidade"]);
    expect(g.linhas[0]).toEqual(["José Antônio", "São Paulo"]);
    expect(JSON.stringify(g)).not.toContain("Ã");
  });

  it("cp1252 puro cai na reserva e volta certo, sem caractere de substituição", async () => {
    const g = await lerPlanilha(Buffer.from(ACENTOS, "latin1"));
    expect(g.linhas[0]).toEqual(["José Antônio", "São Paulo"]);
    expect(JSON.stringify(g)).not.toContain("�");
  });

  it("decodificarTexto: UTF-8 de cedilha, til e trema não é confundido com cp1252", () => {
    const original = "Ação;coração;ñandu;Müller;José";
    expect(decodificarTexto(Buffer.from(original, "utf8"))).toBe(original);
  });
});

// ── G5. SEPARADOR E ASPAS ────────────────────────────────────────────────────────────────────────

describe("G5: o separador acerta com vírgula DENTRO de campo entre aspas", () => {
  it("separador VÍRGULA com endereço entre aspas: o endereço não parte no meio", () => {
    const g = lerTexto('Nome,Endereco\n"Fulano De Teste","Av. Roque Petroni, 1089"\n');
    expect(g.cabecalho).toEqual(["Nome", "Endereco"]);
    expect(g.linhas[0]).toEqual(["Fulano De Teste", "Av. Roque Petroni, 1089"]);
  });

  it("separador PONTO E VÍRGULA com várias vírgulas dentro do mesmo campo", () => {
    const g = lerTexto('Nome;Endereco\n"Fulano";"Av. X, 1089, apto 22, Morumbi"\n');
    expect(g.linhas[0]).toEqual(["Fulano", "Av. X, 1089, apto 22, Morumbi"]);
  });

  it("TSV com célula VAZIA no meio: a coluna seguinte não sobe para o lugar dela", async () => {
    const g = await lerPlanilha(Buffer.from("Nome\tEmail\tCidade\nFulano\t\tSão Paulo\n", "utf8"));
    expect(g.cabecalho).toEqual(["Nome", "Email", "Cidade"]);
    expect(g.linhas[0]).toEqual(["Fulano", "", "São Paulo"]);
  });

  it("CRLF do Windows e ARQUIVO SEM quebra de linha no fim: a última pessoa entra", () => {
    const g = lerTexto("Nome;Email\r\nFulano;f@e.com\r\nCiclana;c@e.com");
    expect(g.linhas).toHaveLength(2);
    expect(g.linhas[1]).toEqual(["Ciclana", "c@e.com"]);
  });

  it("linhas em BRANCO no meio do CSV não viram linha de dado vazia", () => {
    const g = lerTexto("Nome;Email\nFulano;f@e.com\n\n\nCiclana;c@e.com\n");
    expect(g.linhas).toEqual([
      ["Fulano", "f@e.com"],
      ["Ciclana", "c@e.com"],
    ]);
  });
});

// ── G6. TETO SEM FALSEAR A CONTAGEM ──────────────────────────────────────────────────────────────

describe("G6: o teto é aplicado e DECLARADO, inclusive no caminho binário", () => {
  it("`.xls` com mais linhas que o teto: corta em 2000 e diz quantas ficaram de fora", async () => {
    const excedente = 5;
    const linhas: unknown[][] = [["Dados: Candidatos"], ["NOME", "COD"]];
    for (let i = 0; i < MAX_LINHAS_PLANILHA + excedente; i += 1) linhas.push([`Pessoa ${i}`, String(i)]);

    const g = await lerPlanilha(xls({ Plan1: linhas }));
    expect(g.linhaCabecalho).toBe(2);
    expect(g.linhas).toHaveLength(MAX_LINHAS_PLANILHA);
    expect(g.descartadasPorTeto).toBe(excedente);
    // A INVARIANTE: o que entrou mais o que foi descartado é o que o arquivo tinha. Sem isto, o teto
    // vira perda silenciosa, que é o mesmo defeito que esta frente existe para matar.
    expect(g.linhas.length + g.descartadasPorTeto).toBe(MAX_LINHAS_PLANILHA + excedente);
  });

  it("planilha que cabe inteira declara ZERO descartadas", () => {
    const g = lerTexto(["NOME", ...Array.from({ length: 10 }, (_, i) => `Pessoa ${i}`)].join("\n"));
    expect(g.linhas).toHaveLength(10);
    expect(g.descartadasPorTeto).toBe(0);
  });
});

// ── G7. ARQUIVO MUTILADO É RECUSA, NUNCA CRASH E NUNCA MEIA GRADE ────────────────────────────────

describe("G7: arquivo mutilado é RECUSA com motivo, não exceção crua nem grade parcial", () => {
  it("`.xls` TRUNCADO na metade: ILEGIVEL", async () => {
    const inteiro = xls({ Plan1: [["Nome", "Email"], ["Fulano", "f@e.com"]] });
    const e = await recusaDe(Buffer.from(inteiro.subarray(0, Math.floor(inteiro.length / 2))));
    expect(e.motivo).toBe("ILEGIVEL");
    expect(e.name).toBe("ErroLeituraPlanilha");
  });

  it("`.xls` com SÓ o cabeçalho OLE2 (o magic byte certo e nada de conteúdo): ILEGIVEL", async () => {
    const inteiro = xls({ Plan1: [["Nome"], ["Fulano"]] });
    const e = await recusaDe(Buffer.from(inteiro.subarray(0, 600)));
    expect(e.motivo).toBe("ILEGIVEL");
  });

  it("xlsx TRUNCADO (zip pela metade): ILEGIVEL", async () => {
    const inteiro = await xlsx({ Plan1: [["Nome"], ["Fulano"]] });
    const e = await recusaDe(Buffer.from(inteiro.subarray(0, Math.floor(inteiro.length / 2))));
    expect(e.motivo).toBe("ILEGIVEL");
  });

  it("arquivo de TEXTO UNICODE (UTF-16, que tem byte NUL) é recusado, nunca lido como lixo", async () => {
    const e = await recusaDe(Buffer.from("Nome\tEmail\nFulano\tf@e.com\n", "utf16le"));
    // O que importa aqui não é qual dos dois motivos: é NÃO devolver grade. Um byte NUL no meio
    // significava, no leitor antigo, uma coluna de mojibake seguindo adiante como se fosse dado.
    expect(["FORMATO_NAO_SUPORTADO", "ILEGIVEL"]).toContain(e.motivo);
    expect(e.message.length).toBeGreaterThan(0);
  });

  it("arquivo de ZERO BYTE é recusado com mensagem, e não lido como planilha vazia de sucesso", async () => {
    const e = await recusaDe(Buffer.alloc(0));
    expect(e).toBeInstanceOf(ErroLeituraPlanilha);
    expect(e.message.length).toBeGreaterThan(0);
  });
});

// ── G8. A ABA PEDIDA, INCLUSIVE NO CAMINHO DE EXCEÇÃO ────────────────────────────────────────────

describe("G8: a aba pedida é honrada, e o que dá errado nela tem mensagem própria", () => {
  const COM_ABAS: Record<string, unknown[][]> = {
    Candidatos: [["Nome", "Email"], ["Fulano", "f@e.com"]],
    Capa: [["Relatório emitido em 01/09/2026"]],
    Vazia: [[]],
  };

  it("o nome da aba é comparado sem caixa e sem espaço nas pontas", async () => {
    const g = await lerPlanilha(xls(COM_ABAS), { aba: "  cANDIDATOS " });
    expect(g.abaUsada).toBe("Candidatos");
    expect(g.cabecalho).toEqual(["Nome", "Email"]);
  });

  it("aba pedida VAZIA: diz VAZIA, e não que falta cabeçalho", async () => {
    expect((await recusaDe(xls(COM_ABAS), "Vazia")).motivo).toBe("VAZIA");
  });

  it("aba pedida COM conteúdo e sem cabeçalho utilizável: diz SEM_CABECALHO", async () => {
    const e = await recusaDe(xls(COM_ABAS), "Capa");
    expect(e.motivo).toBe("SEM_CABECALHO");
    expect(e.message).toContain("cabeçalho");
  });

  it("aba pedida vazia NÃO é substituída em silêncio pela aba boa do lado", async () => {
    // O ponto: com `aba` explícita, a leitura PARA. Se ela caísse na `Candidatos`, o mapa de colunas
    // conferido numa aba seria aplicado na grade de outra.
    await expect(lerPlanilha(xls(COM_ABAS), { aba: "Vazia" })).rejects.toBeInstanceOf(
      ErroLeituraPlanilha,
    );
  });

  it("aba pedida em branco (string vazia) cai na escolha automática, sem recusar", async () => {
    const g = await lerPlanilha(xls(COM_ABAS), { aba: "" });
    expect(g.abaUsada).toBe("Candidatos");
    expect(g.abasDisponiveis).toEqual(["Candidatos", "Capa", "Vazia"]);
  });

  it("planilha com SÓ cabeçalho e nenhum dado: SEM_CABECALHO, e não grade de zero linhas", async () => {
    expect((await recusaDe(xls({ Plan1: [["Nome", "Email"]] }))).motivo).toBe("SEM_CABECALHO");
  });
});
