/**
 * CARGA CPF PARA LOJA (cenário 1, fora das telas). RUNNER manual, rodado pela fábrica a pedido do
 * diretor, com PRÉVIA obrigatória antes de gravar.
 *
 * O ESCOPO É A BASE DO DIRETOR, e só ela. Cada CPF que está no arquivo recebe a loja que o arquivo
 * manda, INDEPENDENTE do status da admissão (viva, finalizada, declínio, rescisão: tanto faz). CPF
 * que não está no arquivo NÃO É TOCADO. A carga nunca vincula ninguém que o diretor não mandou.
 *
 * DUAS ETAPAS, e a primeira não escreve: sem `APLICAR=1` este script só LÊ e imprime o que faria.
 * É a mesma régua da importação de matrículas ("importação que grava direto é importação que ninguém
 * confere") e da importação de lojas por planilha.
 *
 * O CASAMENTO DA LOJA TEM TRÊS DESFECHOS, e o do meio é o que importa:
 *  - CLARO: igual depois de normalizar caixa, espaço e acento. Casa sozinho.
 *  - AMBÍGUO: parecido mas não idêntico, ou parecido com mais de uma loja. NÃO ADIVINHA: vai para a
 *    tela com os candidatos, e quem decide é o diretor.
 *  - SEM MATCH: não se parece com nada do catálogo. Vai para a lista de não casadas.
 *
 * §A.6: o CPF NUNCA é impresso inteiro (sai mascarado), nunca vai para URL e não é logado. O NOME do
 * candidato aparece, porque é o que permite conferir que a loja está indo para a pessoa certa, e é
 * saída de tela, não log de servidor.
 *
 * USO:
 *   ARQUIVO=/caminho/base.xlsx tsx src/db/carga-lojas-cpf.ts           # prévia, não grava
 *   ARQUIVO=/caminho/base.xlsx APLICAR=1 tsx src/db/carga-lojas-cpf.ts # grava
 *   Opcionais: COD_CLIENTE (padrão 56842), RESOLUCOES=/caminho/resolucoes.json
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { and, eq, inArray, ne } from "drizzle-orm";
import { createDb } from "./client";
import { admissoes, candidatos, clienteLojas } from "./schema";

const ARQUIVO = process.env.ARQUIVO;
const COD_CLIENTE = process.env.COD_CLIENTE ?? "56842";
const APLICAR = process.env.APLICAR === "1";
/** JSON `{ "nome da base": "id-da-loja" }` com o que o diretor resolveu na validação dos ambíguos. */
const RESOLUCOES = process.env.RESOLUCOES;

/** Só dígitos: "376.143.458-86" e "37614345886" são o mesmo CPF. */
const soDigitos = (v: string) => v.replace(/\D/g, "");

/** CPF mascarado para a saída (§A.6): mostra os 3 primeiros, esconde o resto. */
const mascarar = (cpf: string) => `${cpf.slice(0, 3)}.***.***-**`;

/**
 * Normalização do casamento CLARO: caixa, espaço e ACENTO.
 *
 * Difere de propósito da `nomeLojaNormalizado` do domínio, que NÃO tira acento porque o índice único
 * do banco não tem a extensão `unaccent`. Aqui o problema é outro: a base do diretor foi digitada à
 * mão e traz "Cerqueira" contra "CERQ", "São" contra "SAO". Tirar acento no casamento é o que faz o
 * óbvio casar sozinho; o que sobra vai para validação humana de qualquer jeito.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Distância de edição, para medir o quanto dois nomes se parecem. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let anterior = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const atual = [i];
    for (let j = 1; j <= n; j++) {
      atual[j] = Math.min(
        (anterior[j] ?? 0) + 1,
        (atual[j - 1] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    anterior = atual;
  }
  return anterior[n] ?? 0;
}

/** 0 a 1. Combina distância de edição com palavras em comum, que é o que salva "CERQ" x "CERQUEIRA". */
function similaridade(a: string, b: string): number {
  const maior = Math.max(a.length, b.length);
  const porLetra = maior === 0 ? 0 : 1 - levenshtein(a, b) / maior;
  const pa = new Set(a.split(" ").filter(Boolean));
  const pb = new Set(b.split(" ").filter(Boolean));
  const comuns = [...pa].filter((p) => pb.has(p) || [...pb].some((q) => q.startsWith(p) || p.startsWith(q)));
  const porPalavra = pa.size === 0 ? 0 : comuns.length / Math.max(pa.size, pb.size);
  // A maior das duas: nomes longos com uma abreviação no meio caem na de palavras; erros de
  // digitação caem na de letras.
  return Math.max(porLetra, porPalavra);
}

/** Abaixo disto nem candidato é: o nome não tem nada a ver com a loja. */
const LIMIAR_CANDIDATO = 0.45;

interface Grade {
  cabecalho: string[];
  linhas: string[][];
}

async function lerArquivo(caminho: string): Promise<Grade> {
  const buf = readFileSync(caminho);
  const ehXlsx = buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b;
  let cruas: string[][];
  if (ehXlsx) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    cruas = [];
    ws?.eachRow({ includeEmpty: false }, (row) => {
      const cs: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        cs.push(
          v === null || v === undefined
            ? ""
            : typeof v === "object" && "result" in v
              ? String((v as { result?: unknown }).result ?? "")
              : typeof v === "object" && "text" in v
                ? String((v as { text?: unknown }).text ?? "")
                : String(v),
        );
      });
      cruas.push(cs);
    });
  } else {
    const texto = buf.toString("utf8");
    const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
    const sep = (primeira.match(/;/g) ?? []).length > (primeira.match(/,/g) ?? []).length ? ";" : ",";
    cruas = parse(texto, {
      delimiter: sep,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as string[][];
  }
  const limpas = cruas
    .map((l) => l.map((c) => (c ?? "").trim()))
    .filter((l) => l.some((c) => c !== ""));
  const [cabecalho = [], ...linhas] = limpas;
  return { cabecalho, linhas };
}

async function main(): Promise<void> {
  if (!ARQUIVO) throw new Error("Defina ARQUIVO=/caminho/base.xlsx");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const { sql, db } = createDb(url, 1);

  const grade = await lerArquivo(ARQUIVO);
  const lojas = await db
    .select({ id: clienteLojas.id, nome: clienteLojas.nome, ativo: clienteLojas.ativo })
    .from(clienteLojas)
    .where(eq(clienteLojas.codCliente, COD_CLIENTE));

  console.log(`\nBASE: ${ARQUIVO}`);
  console.log(`CLIENTE: ${COD_CLIENTE} | lojas cadastradas: ${lojas.length}`);
  console.log(`CABEÇALHO: ${grade.cabecalho.join(" | ")}`);
  console.log(`LINHAS: ${grade.linhas.length}\n`);

  // ── Qual coluna é o CPF: a que mais tem células com 11 dígitos. ──
  const colCpf = grade.cabecalho
    .map((_, i) => ({ i, n: grade.linhas.filter((l) => soDigitos(l[i] ?? "").length === 11).length }))
    .sort((a, b) => b.n - a.n)[0];
  if (!colCpf || colCpf.n === 0) throw new Error("Nenhuma coluna com CPF de 11 dígitos.");

  // ── Qual coluna é a LOJA: a que mais se parece com o catálogo deste cliente. É melhor que ler o
  //    cabeçalho, porque não depende de como a coluna foi nomeada.
  const nomesLoja = lojas.map((l) => normalizar(l.nome));
  const colLoja = grade.cabecalho
    .map((_, i) => {
      if (i === colCpf.i) return { i, score: -1 };
      const score = grade.linhas.reduce((acc, l) => {
        const v = normalizar(l[i] ?? "");
        if (!v) return acc;
        return acc + Math.max(0, ...nomesLoja.map((n) => similaridade(v, n)));
      }, 0);
      return { i, score };
    })
    .sort((a, b) => b.score - a.score)[0];
  if (!colLoja || colLoja.score <= 0) throw new Error("Nenhuma coluna se parece com o catálogo de lojas.");

  console.log(`Coluna do CPF ...: [${colCpf.i}] ${grade.cabecalho[colCpf.i]}`);
  console.log(`Coluna da LOJA ..: [${colLoja.i}] ${grade.cabecalho[colLoja.i]}\n`);

  // ── Resolve cada NOME DE LOJA distinto da base, uma vez só. ──
  const resolucoes: Record<string, string> = RESOLUCOES
    ? (JSON.parse(readFileSync(RESOLUCOES, "utf8")) as Record<string, string>)
    : {};

  const nomesDaBase = [...new Set(grade.linhas.map((l) => (l[colLoja.i] ?? "").trim()).filter(Boolean))];
  const decisao = new Map<
    string,
    { tipo: "CLARO" | "AMBIGUO" | "SEM_MATCH"; lojaId?: string; lojaNome?: string; candidatos: { nome: string; id: string; sim: number }[] }
  >();

  for (const bruto of nomesDaBase) {
    if (resolucoes[bruto]) {
      const l = lojas.find((x) => x.id === resolucoes[bruto]);
      decisao.set(bruto, { tipo: "CLARO", lojaId: l?.id, lojaNome: l?.nome, candidatos: [] });
      continue;
    }
    const alvo = normalizar(bruto);
    const exatas = lojas.filter((l) => normalizar(l.nome) === alvo);
    if (exatas.length === 1) {
      decisao.set(bruto, { tipo: "CLARO", lojaId: exatas[0]!.id, lojaNome: exatas[0]!.nome, candidatos: [] });
      continue;
    }
    const candidatos = lojas
      .map((l) => ({ nome: l.nome, id: l.id, sim: similaridade(alvo, normalizar(l.nome)) }))
      .filter((c) => c.sim >= LIMIAR_CANDIDATO)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 4);
    decisao.set(bruto, {
      tipo: candidatos.length > 0 ? "AMBIGUO" : "SEM_MATCH",
      candidatos,
    });
  }

  // ── Casa o CPF com as admissões DESTE cliente. ──
  const cpfs = [...new Set(grade.linhas.map((l) => soDigitos(l[colCpf.i] ?? "")).filter((c) => c.length === 11))];
  const adms = cpfs.length
    ? await db
        .select({
          id: admissoes.id,
          cpf: admissoes.candidatoCpf,
          nome: candidatos.nome,
          farol: admissoes.farolGlobal,
          lojaAtual: admissoes.lojaId,
        })
        .from(admissoes)
        .innerJoin(candidatos, eq(candidatos.cpf, admissoes.candidatoCpf))
        .where(and(inArray(admissoes.candidatoCpf, cpfs), eq(admissoes.codCliente, COD_CLIENTE)))
    : [];
  const porCpf = new Map<string, typeof adms>();
  for (const a of adms) porCpf.set(a.cpf, [...(porCpf.get(a.cpf) ?? []), a]);

  // TRAVA ANTI-CONTAMINAÇÃO, medida e mostrada: quantas admissões destes MESMOS CPFs existem em
  // OUTROS clientes. A consulta acima já as exclui (filtra por `codCliente`), e o número aparece na
  // prévia para o diretor ver que a trava não é promessa, é contagem.
  const foraDoCliente = cpfs.length
    ? await db
        .select({ id: admissoes.id })
        .from(admissoes)
        .where(and(inArray(admissoes.candidatoCpf, cpfs), ne(admissoes.codCliente, COD_CLIENTE)))
    : [];

  // ── Monta o retrato. ──
  const vaiGravar: { admissaoId: string; lojaId: string }[] = [];
  const prontos: string[] = [];
  const paraValidar: string[] = [];
  const semAdmissao: string[] = [];
  const lojaSemCadastro: string[] = [];
  const jaTinhaOutra: string[] = [];

  for (const linha of grade.linhas) {
    const cpf = soDigitos(linha[colCpf.i] ?? "");
    const nomeLoja = (linha[colLoja.i] ?? "").trim();
    if (cpf.length !== 11) continue;
    const achadas = porCpf.get(cpf) ?? [];
    const d = decisao.get(nomeLoja);

    if (achadas.length === 0) {
      semAdmissao.push(`  ${mascarar(cpf)}  loja da base: ${nomeLoja || "(vazia)"}`);
      continue;
    }
    const pessoa = achadas[0]!.nome;
    if (!d || d.tipo === "SEM_MATCH") {
      lojaSemCadastro.push(`  ${pessoa}  (${mascarar(cpf)})  loja da base: "${nomeLoja}"`);
      continue;
    }
    if (d.tipo === "AMBIGUO") {
      const cands = d.candidatos.map((c) => `"${c.nome}" (${Math.round(c.sim * 100)}%)`).join("  ou  ");
      paraValidar.push(`  base: "${nomeLoja}"  ->  ${cands}\n      pessoa: ${pessoa} (${mascarar(cpf)}), ${achadas.length} admissão(ões)`);
      continue;
    }
    for (const a of achadas) {
      if (a.lojaAtual && a.lojaAtual !== d.lojaId) jaTinhaOutra.push(`  ${pessoa} (${mascarar(cpf)})`);
      vaiGravar.push({ admissaoId: a.id, lojaId: d.lojaId! });
    }
    prontos.push(
      `  ${pessoa.padEnd(38)} ${mascarar(cpf)}  ->  ${d.lojaNome}   (${achadas.length} admissão${achadas.length > 1 ? "ões" : ""}: ${achadas.map((a) => a.farol).join(", ")})`,
    );
  }

  const nomesAmbiguos = [...new Set(paraValidar.map((s) => s.split('"')[1]))];
  console.log("──────────────────────────────────────────────────────────────");
  console.log(`CASAM AUTOMÁTICO ....: ${prontos.length} CPFs  ->  ${vaiGravar.length} admissões receberão loja`);
  console.log(`PRECISAM DE VALIDAÇÃO: ${paraValidar.length} linhas, em ${nomesAmbiguos.length} nomes de loja distintos`);
  console.log(`CPF SEM ADMISSÃO ....: ${semAdmissao.length}`);
  console.log(`LOJA SEM CADASTRO ...: ${lojaSemCadastro.length}`);
  if (jaTinhaOutra.length) console.log(`JÁ TINHAM OUTRA LOJA : ${jaTinhaOutra.length} (a carga trocaria)`);
  console.log(`FORA DO CLIENTE .....: ${foraDoCliente.length} admissões destes CPFs em outros clientes, NÃO tocadas`);
  console.log("──────────────────────────────────────────────────────────────\n");

  if (prontos.length) {
    console.log("CASAM AUTOMÁTICO (caixa, espaço e acento apenas):");
    prontos.slice(0, 60).forEach((l) => console.log(l));
    if (prontos.length > 60) console.log(`  ... e mais ${prontos.length - 60}`);
    console.log();
  }
  if (paraValidar.length) {
    console.log("PRECISAM DA SUA VALIDAÇÃO (não adivinho, escolha o certo):");
    paraValidar.slice(0, 40).forEach((l) => console.log(l));
    if (paraValidar.length > 40) console.log(`  ... e mais ${paraValidar.length - 40}`);
    console.log();
  }
  if (lojaSemCadastro.length) {
    console.log("LOJA DA BASE NÃO EXISTE NO CADASTRO:");
    lojaSemCadastro.slice(0, 30).forEach((l) => console.log(l));
    console.log();
  }
  if (semAdmissao.length) {
    console.log(`CPF SEM ADMISSÃO NO CLIENTE ${COD_CLIENTE}:`);
    semAdmissao.slice(0, 30).forEach((l) => console.log(l));
    console.log();
  }

  if (!APLICAR) {
    console.log(">>> PRÉVIA. NADA FOI GRAVADO. Rode com APLICAR=1 depois do OK do diretor. <<<\n");
    await sql.end();
    return;
  }

  // ── Gravação, transacional. Só o que casou de forma CLARA (ou o que o diretor resolveu). ──
  await db.transaction(async (tx) => {
    for (const v of vaiGravar) {
      await tx.update(admissoes).set({ lojaId: v.lojaId }).where(eq(admissoes.id, v.admissaoId));
    }
  });
  console.log(`>>> GRAVADO: ${vaiGravar.length} admissões vinculadas. <<<\n`);
  await sql.end();
}

main().catch((err) => {
  console.error("[carga-lojas-cpf] falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
