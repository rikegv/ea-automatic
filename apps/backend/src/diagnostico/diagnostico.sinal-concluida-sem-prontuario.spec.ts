import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DiagnosticoService } from "./diagnostico.service";

/**
 * SINAL "CONCLUÍDA SEM PRONTUÁRIO" (decisão do diretor).
 *
 * A ferramenta de criar prontuário sob demanda já existia e funcionava, mas o botão dela morava num
 * card cujo recorte é o OPOSTO da população que ela atende: `regua-sem-pasta` exige farol VIVO e
 * régua FECHADA, enquanto o buraco real é a admissão CONCLUÍDA com a régua ABERTA. Medido na base:
 * 0 de 31 apareciam lá. Este sinal é o card que faltava.
 *
 * POR QUE O TESTE OLHA O SQL, e não o resultado: o recorte inteiro mora DENTRO da consulta, então um
 * banco de mentira que devolve linhas prontas passa igual com ou sem os filtros e não trava nada.
 * Ler o SQL emitido é o que pega o afrouxamento numa refatoração futura.
 *
 * E POR QUE ELE APAGA OS COMENTÁRIOS ANTES DE OLHAR: o comentário que explica a regra repete os
 * mesmos nomes de coluna da regra, então uma asserção sobre o texto cru passaria mesmo com o filtro
 * removido. O teste lê só o SQL executável. (Mesma lição de `fopag-cliente-inativo.spec.ts`.)
 */

/** Reconstrói o texto da consulta a partir dos pedaços do objeto SQL do drizzle. */
function textoDaConsulta(q: unknown): string {
  const chunks = (q as { queryChunks?: Array<{ value?: unknown }> }).queryChunks ?? [];
  return chunks.map((c) => (c?.value !== undefined ? String(c.value) : "")).join("");
}

/** Só o SQL que o banco executa: linhas de comentário (--) fora, espaços colapsados. */
function sqlExecutavel(q: unknown): string {
  return textoDaConsulta(q)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join(" ")
    .replace(/\s+/g, " ");
}

interface LinhaFalsa {
  admissao_id: string;
  candidato: string;
}

function servico(linhas: LinhaFalsa[]) {
  const consultas: unknown[] = [];
  const db = {
    execute: (q: unknown) => {
      consultas.push(q);
      return Promise.resolve(linhas);
    },
  } as never;
  const nada = {} as never;
  const s = new DiagnosticoService(db, nada, nada, nada, nada, nada, nada, nada, nada, nada);
  return { s, consultas };
}

/** O método é privado por desenho; o teste o alcança pela chave, sem afrouxar a visibilidade. */
function rodarSinal(linhas: LinhaFalsa[] = []) {
  const { s, consultas } = servico(linhas);
  const sinal = (
    s as unknown as { sinalConcluidaSemProntuario(): Promise<{ chave: string; rotulo: string; total: number; itens: Array<Record<string, unknown>> }> }
  ).sinalConcluidaSemProntuario();
  return { sinal, consultas };
}

const FONTE = readFileSync(join(__dirname, "diagnostico.service.ts"), "utf8");

describe("sinal concluída sem prontuário: o recorte", () => {
  it("exige as QUATRO condições: farol concluído, origem Pandapé, sem pasta e com NC1", async () => {
    const { sinal, consultas } = rodarSinal();
    await sinal;

    expect(consultas).toHaveLength(1);
    const q = sqlExecutavel(consultas[0]);
    expect(q).toContain("a.farol_global = 'ADMISSAO_CONCLUIDA'");
    expect(q).toContain("a.origem = 'PANDAPE'");
    expect(q).toContain("a.drive_pasta_url IS NULL");
    expect(q).toMatch(/EXISTS \( SELECT 1 FROM nao_conformidades nc WHERE nc\.admissao_id = a\.id AND nc\.tipo = 'NC1' \)/);
  });

  it("NÃO conta a mesma admissão duas vezes: a NC1 entra por EXISTS, nunca por JOIN", async () => {
    const { sinal, consultas } = rodarSinal();
    await sinal;

    const q = sqlExecutavel(consultas[0]);
    // Há mais de uma NC1 por admissão na base (74 marcas para 31 admissões alvo). Um JOIN direto
    // multiplicaria a linha e o card mostraria um número inflado.
    expect(q).not.toMatch(/JOIN nao_conformidades/);
  });

  it("NÃO depende de `drive_falha_motivo`: acender nos dois cards é o comportamento correto", async () => {
    const { sinal, consultas } = rodarSinal();
    await sinal;

    // Nessas admissões a staging já expirou (TTL 48h), então o arquivamento tentará re-baixar do
    // Pandapé e pode gravar motivo de falha, acendendo também `arquivamento-drive-falhou`. Se este
    // sinal olhasse o motivo de falha, sumiria justamente quando o problema piora.
    expect(sqlExecutavel(consultas[0])).not.toContain("drive_falha_motivo");
  });

  it("não trunca a contagem: sem LIMIT, o total é o tamanho real da população", async () => {
    const { sinal, consultas } = rodarSinal();
    await sinal;

    expect(sqlExecutavel(consultas[0])).not.toContain("LIMIT");
  });
});

describe("sinal concluída sem prontuário: a forma do card e do item", () => {
  it("leva a chave, o rótulo em title case e o total igual ao número de linhas", async () => {
    const { sinal } = rodarSinal([
      { admissao_id: "a1", candidato: "Fulano De Tal" },
      { admissao_id: "a2", candidato: "Beltrana Da Silva" },
    ]);
    const r = await sinal;

    expect(r.chave).toBe("concluida-sem-prontuario");
    expect(r.rotulo).toBe("Concluída Sem Prontuário");
    expect(r.total).toBe(2);
    expect(r.itens).toHaveLength(2);
  });

  it("cada item carrega `admissaoId`, que é o que o botão de gerar prontuário consome", async () => {
    const { sinal } = rodarSinal([{ admissao_id: "a1", candidato: "Fulano De Tal" }]);
    const r = await sinal;

    expect(r.itens[0].admissaoId).toBe("a1");
    expect(r.itens[0].candidato).toBe("Fulano De Tal");
    expect(typeof r.itens[0].detalhe).toBe("string");
  });

  it("§A.6: o item leva só o que os irmãos levam, e a consulta não seleciona CPF nem URL", async () => {
    const { sinal, consultas } = rodarSinal([{ admissao_id: "a1", candidato: "Fulano De Tal" }]);
    const r = await sinal;

    // Nome do candidato é aceitável (identifica a admissão na tela); CPF e URL externa, não.
    expect(Object.keys(r.itens[0]).sort()).toEqual(["admissaoId", "candidato", "detalhe"]);
    const q = sqlExecutavel(consultas[0]);
    expect(q).toContain("SELECT a.id AS admissao_id, c.nome AS candidato");
    // O CPF aparece uma única vez, no vínculo entre as tabelas, e nunca na projeção.
    expect(q).not.toMatch(/AS cpf|a\.candidato_cpf AS|c\.cpf AS/);
    // Nenhuma URL é PROJETADA. A `drive_pasta_url` aparece só como filtro (e é referência do Drive,
    // não link externo); o que §A.6 proíbe é a URL viajar para a tela ou para o log.
    expect(q).not.toMatch(/AS [a-z_]*url/i);
  });

  it("§A.11: nem o rótulo nem o detalhe usam o caractere proibido", async () => {
    const { sinal } = rodarSinal([{ admissao_id: "a1", candidato: "Fulano De Tal" }]);
    const r = await sinal;

    // O próprio caractere não é escrito nem aqui: vem pelo ponto de código (§A.11 vale para todo
    // texto do repositório, teste incluído).
    const proibido = String.fromCharCode(0x2014);
    expect(r.rotulo).not.toContain(proibido);
    expect(String(r.itens[0].detalhe)).not.toContain(proibido);
  });
});

describe("o card chega à tela, e os sinais existentes não mudam", () => {
  it("o sinal novo entra na lista que a tela renderiza", () => {
    // Montar o snapshot inteiro exigiria dublar scheduler, IA, Pandapé, Drive e filesystem, o que
    // custa mais do que prova. O que precisa ficar travado é o fio: o card só existe na tela se o
    // sinal estiver na lista `sinais`.
    const lista = FONTE.slice(FONTE.indexOf("const sinais = ["));
    expect(lista.slice(0, lista.indexOf("];"))).toContain("concluidaSemProntuario");
  });

  it("o `regua-sem-pasta` continua exigindo farol VIVO e régua FECHADA", async () => {
    const { s, consultas } = servico([]);
    await (s as unknown as { sinalReguaFechadaSemPasta(): Promise<unknown> }).sinalReguaFechadaSemPasta();

    // O sinal novo ACRESCENTA, não afrouxa o irmão: o card antigo serve a outra pergunta e continua
    // respondendo exatamente a ela (§A.26).
    const q = sqlExecutavel(consultas[0]);
    expect(q).toContain("a.farol_global IN ('EM_ADMISSAO','BANCO_AGUARDAR')");
    expect(q).toContain("faltando = 0");
  });

  it("o `arquivamento-drive-falhou` continua olhando só o motivo de falha registrado", async () => {
    const { s, consultas } = servico([]);
    await (
      s as unknown as { sinalArquivamentoDriveFalhou(): Promise<unknown> }
    ).sinalArquivamentoDriveFalhou();

    const q = sqlExecutavel(consultas[0]);
    expect(q).toContain("a.drive_falha_motivo IS NOT NULL");
    expect(q).not.toContain("ADMISSAO_CONCLUIDA");
  });
});
