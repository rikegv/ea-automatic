/**
 * MIGRAÇÃO DO LEGADO DO CAGC (cenário 2, etapa 2). RUNNER manual, rodado pela fábrica a pedido do
 * diretor, com PRÉVIA obrigatória antes de gravar.
 *
 * O PROBLEMA. O agrupamento administrativo da Raia (o CAGC) existe hoje escrito à mão dentro do
 * `nome_operacao` do cliente, em NOVE grafias. `CAGC CORIFEU ` (com espaço à direita),
 * `CAGC CORIFEU` e `RAIA CAGC CORIFEU` são, quase certamente, o mesmo grupo repartido em três.
 * Enquanto isso for texto livre, cada leitura por grupo dá um número diferente.
 *
 * O ESCOPO É SÓ O CAGC, e a limitação é deliberada: é o único agrupamento que está escrito no
 * apelido, então é o único que uma varredura consegue propor sem inventar. Bunge, Sonova e Würth
 * também têm vários códigos na mesma razão social, mas nada no dado diz qual é o recorte deles; esses
 * o diretor monta na tela quando souber.
 *
 * O RUNNER PROPÕE, O DIRETOR DECIDE. Sem `APLICAR=1` este script só LÊ e imprime o que faria. E,
 * mesmo com `APLICAR=1`, ele **não funde grafias por conta própria**: a fusão é uma RESOLUÇÃO que o
 * diretor passa explicitamente. É a mesma régua da carga de lojas e da importação de matrículas:
 * importação que grava direto é importação que ninguém confere.
 *
 * O QUE ELE NUNCA FAZ:
 *  - **Não adivinha o ambíguo.** `CAGC CAMP. ` pode ser Campinas ou Campo Grande, e um código com uma
 *    admissão não vale um chute que ninguém vai auditar depois. Sai como PERGUNTA.
 *  - **Não inventa grupo para quem não tem.** Os códigos da Raia sem CAGC no apelido saem numa lista
 *    "sem grupo", para o diretor atribuir na tela.
 *  - **Não toca o `nome_operacao`.** O apelido fica exatamente como está; o grupo passa a ser a
 *    verdade estruturada ao lado dele.
 *  - **Não carimba admissão.** O carimbo é a etapa 3, e depende de o agrupamento estar certo antes.
 *
 * §A.6: a saída tem código de cliente, razão social e apelido, que são dados de cadastro. Nenhum CPF,
 * nenhum nome de candidato, nada em URL.
 *
 * USO:
 *   tsx src/db/carga-grupos-cagc.ts                        # prévia, não grava
 *   RESOLUCOES=/caminho/res.json APLICAR=1 tsx ...         # grava o que o diretor resolveu
 *
 * O arquivo de resoluções é `{ "grafia normalizada": "Nome Final Do Grupo" }`, por exemplo:
 *   { "CAGC CORIFEU": "CAGC Corifeu", "CAGC CAMP.": "CAGC Campinas" }
 * Grafia que não estiver no arquivo NÃO É GRAVADA.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { createDb } from "./client";
import { clientes, grupoClienteMembros, gruposCliente } from "./schema";

const APLICAR = process.env.APLICAR === "1";
const RESOLUCOES = process.env.RESOLUCOES;

/**
 * A NORMALIZAÇÃO DA PROPOSTA: caixa, pontas, espaços repetidos e o prefixo `RAIA `.
 *
 * O prefixo sai porque é a razão social repetida dentro do apelido, e é ele que separa
 * `RAIA CAGC CORIFEU` de `CAGC CORIFEU`. Acento NÃO é removido: as grafias reais não divergem em
 * acento, e tirar aqui criaria diferença entre o que o runner propõe e o que o índice único do banco
 * considera igual.
 */
function grafiaNormalizada(apelido: string): string {
  return apelido
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/^RAIA\s+/, "");
}

interface LinhaCliente {
  codCliente: string;
  razaoSocial: string;
  nomeOperacao: string | null;
  admissoes: number;
  grupoAtual: string | null;
}

/** Uma grafia encontrada no apelido, com os códigos e as admissões que ela carrega. */
interface Grafia {
  grafia: string;
  apelidos: string[];
  clientes: LinhaCliente[];
}

/** `CAMP.` é a única abreviação que não se resolve sozinha: Campinas ou Campo Grande? */
const AMBIGUAS = [/\bCAMP\.?$/];

function ehAmbigua(grafia: string): boolean {
  return AMBIGUAS.some((r) => r.test(grafia));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido");
  const { sql: conexao, db } = createDb(url, 1);

  /*
   * A PRÉVIA RODA ANTES DE O CADASTRO EXISTIR, e tem de rodar: ela é o insumo que o diretor usa para
   * decidir as fusões, e essa decisão vem antes de qualquer gravação. Num banco onde a etapa 1 ainda
   * não subiu, as duas tabelas do grupo não existem, e a consulta de "em qual grupo este CNPJ já
   * está" não tem onde olhar. Em vez de falhar, o runner detecta e segue: ninguém está em grupo
   * nenhum, que é a resposta correta para esse banco.
   */
  const [{ existe }] = await conexao<{ existe: boolean }[]>`
    select to_regclass('public.grupo_cliente_membros') is not null as existe`;
  const cadastroPronto = existe;

  /*
   * AS CONTAGENS SAEM DE UM `group by`, e não de subconsulta correlacionada dentro do `select`.
   *
   * A primeira versão usava subconsulta e devolveu 2.781 admissões para CADA cliente, que é o total
   * da base inteira: a correlação se perdeu na montagem do SQL e a condição virou sempre verdadeira.
   * O erro só apareceu porque o número era absurdo na cara (147 mil admissões num grupo de uma base
   * com 2.790). Agregação explícita não tem como colapsar assim.
   */
  const contagens = await conexao<{ cod_cliente: string; n: number }[]>`
    select cod_cliente, count(*)::int as n from admissoes
    where cod_cliente is not null group by cod_cliente`;
  const admissoesPorCliente = new Map(contagens.map((c) => [c.cod_cliente, c.n]));

  const grupoPorCliente = new Map<string, string>();
  if (cadastroPronto) {
    const atuais = await conexao<{ cod_cliente: string; nome: string }[]>`
      select m.cod_cliente, g.nome from grupo_cliente_membros m
      join grupos_cliente g on g.id = m.grupo_id`;
    for (const a of atuais) grupoPorCliente.set(a.cod_cliente, a.nome);
  }

  // ── LEITURA: todo cliente que menciona CAGC no apelido ──────────────────────
  const crus = await db
    .select({
      codCliente: clientes.codCliente,
      razaoSocial: clientes.razaoSocial,
      nomeOperacao: clientes.nomeOperacao,
    })
    .from(clientes)
    .where(sql`upper(coalesce(${clientes.nomeOperacao}, '')) like '%CAGC%'`);

  const linhas: LinhaCliente[] = crus.map((c) => ({
    ...c,
    admissoes: admissoesPorCliente.get(c.codCliente) ?? 0,
    grupoAtual: grupoPorCliente.get(c.codCliente) ?? null,
  }));

  const porGrafia = new Map<string, Grafia>();
  for (const l of linhas) {
    const g = grafiaNormalizada(l.nomeOperacao ?? "");
    const atual = porGrafia.get(g) ?? { grafia: g, apelidos: [], clientes: [] };
    if (!atual.apelidos.includes(l.nomeOperacao ?? "")) atual.apelidos.push(l.nomeOperacao ?? "");
    atual.clientes.push(l);
    porGrafia.set(g, atual);
  }
  const grafias = [...porGrafia.values()].sort((a, b) => b.clientes.length - a.clientes.length);

  // ── A PRÉVIA ────────────────────────────────────────────────────────────────
  console.log("\n=== FUSÕES PROPOSTAS (o diretor confirma; o runner NÃO funde sozinho) ===\n");
  for (const g of grafias) {
    const codigos = g.clientes.length;
    const adms = g.clientes.reduce((a, c) => a + c.admissoes, 0);
    const marca = ehAmbigua(g.grafia) ? "  <<< AMBÍGUA, PRECISA DE RESPOSTA" : "";
    console.log(`GRUPO PROPOSTO: ${g.grafia}${marca}`);
    console.log(`  vem de: ${g.apelidos.map((a) => JSON.stringify(a)).join(", ")}`);
    console.log(`  ${codigos} código(s) de cliente, ${adms} admissão(ões) no histórico`);
    // As grafias que se juntam aparecem discriminadas: é o que o diretor confere antes de fundir.
    if (g.apelidos.length > 1) {
      for (const ap of g.apelidos) {
        const doApelido = g.clientes.filter((c) => (c.nomeOperacao ?? "") === ap);
        console.log(
          `     ${JSON.stringify(ap)}: ${doApelido.length} código(s), ` +
            `${doApelido.reduce((a, c) => a + c.admissoes, 0)} admissão(ões)`,
        );
      }
    }
    const jaAgrupados = g.clientes.filter((c) => c.grupoAtual);
    if (jaAgrupados.length > 0) {
      console.log(`     ATENÇÃO: ${jaAgrupados.length} já está(ão) em grupo e SAIRIA(M) dele`);
    }
    console.log("");
  }

  // ── OS SEM GRUPO: a Raia que não menciona CAGC no apelido ───────────────────
  const semCagcCru = await db
    .select({ codCliente: clientes.codCliente, nomeOperacao: clientes.nomeOperacao })
    .from(clientes)
    .where(
      sql`${clientes.razaoSocial} = 'RAIA DROGASIL S/A'
          and upper(coalesce(${clientes.nomeOperacao}, '')) not like '%CAGC%'`,
    );
  const semCagc = semCagcCru.map((c) => ({
    ...c,
    admissoes: admissoesPorCliente.get(c.codCliente) ?? 0,
  }));

  console.log("=== SEM GRUPO: Raia sem CAGC no apelido (o runner NÃO adivinha) ===\n");
  console.log(`${semCagc.length} código(s), para o diretor atribuir na tela:\n`);
  for (const c of semCagc) {
    console.log(
      `  ${c.codCliente}  ${JSON.stringify(c.nomeOperacao ?? "(apelido vazio)")}` +
        `  ${c.admissoes} admissão(ões)`,
    );
  }

  console.log("\n=== TOTAIS ===");
  console.log(`grafias distintas: ${grafias.length}`);
  console.log(`códigos com CAGC: ${linhas.length}`);
  console.log(`admissões nesses códigos: ${linhas.reduce((a, c) => a + c.admissoes, 0)}`);
  console.log(`códigos da Raia sem CAGC: ${semCagc.length}`);

  if (!cadastroPronto) {
    console.log(
      "\nNOTA: as tabelas do grupo ainda não existem NESTE banco (a etapa 1 não subiu aqui).",
    );
    console.log("A prévia acima é válida: ela lê o apelido do cliente, que é o legado a migrar.");
  }

  if (!APLICAR) {
    console.log("\nPRÉVIA. Nada foi gravado. Para gravar: RESOLUCOES=<arquivo.json> APLICAR=1");
    await conexao.end();
    return;
  }

  if (!cadastroPronto) {
    throw new Error(
      "Não dá para gravar: as tabelas do grupo não existem neste banco. Suba a etapa 1 antes.",
    );
  }

  // ── GRAVAÇÃO: só o que o diretor resolveu ───────────────────────────────────
  if (!RESOLUCOES) {
    throw new Error("APLICAR=1 exige RESOLUCOES=<arquivo.json>: o runner não funde por conta própria.");
  }
  const resolucoes: Record<string, string> = JSON.parse(readFileSync(RESOLUCOES, "utf8"));

  let gruposCriados = 0;
  let vinculos = 0;
  for (const g of grafias) {
    const nomeFinal = resolucoes[g.grafia];
    if (!nomeFinal) {
      console.log(`PULADA (sem resolução do diretor): ${g.grafia}`);
      continue;
    }
    // O grupo pode já existir de uma rodada anterior ou da tela: reusar em vez de duplicar.
    const existente = await db.query.gruposCliente.findFirst({
      where: eq(gruposCliente.nome, nomeFinal),
    });
    const grupoId =
      existente?.id ??
      (await db.insert(gruposCliente).values({ nome: nomeFinal }).returning())[0].id;
    if (!existente) gruposCriados++;

    for (const c of g.clientes) {
      // UPSERT na chave `cod_cliente`: é o banco que garante um grupo só por cliente.
      await db
        .insert(grupoClienteMembros)
        .values({ codCliente: c.codCliente, grupoId })
        .onConflictDoUpdate({ target: grupoClienteMembros.codCliente, set: { grupoId } });
      vinculos++;
    }
    console.log(`GRAVADO: ${g.grafia} -> "${nomeFinal}" (${g.clientes.length} código(s))`);
  }

  console.log(`\nconcluído. grupos criados: ${gruposCriados}, vínculos gravados: ${vinculos}`);
  console.log("O `nome_operacao` NÃO foi tocado. Nenhuma admissão foi carimbada (isso é a etapa 3).");
  await conexao.end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
