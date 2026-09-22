import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ─ INFRAESTRUTURA DO `tester` PARA A INTEGRACAO DIGAI ──────────────────────────────────────────
 *
 * NENHUMA LINHA DAQUI RODA EM PRODUCAO. O sufixo `.tester-fake` e deliberado e tem motivo
 * registrado nesta casa: na onda B1 o agente que construiu escolheu, de boa-fe, o mesmo nome de
 * arquivo que o `tester` havia escolhido, e sobrescreveu o teste em silencio.
 *
 * ┌─ ESTE ARQUIVO FOI ESCRITO ANTES DO CODIGO (secao A.38 e secao A.40 regra 2) ────────────────┐
 * │ Nada aqui foi lido da implementacao, porque nao ha implementacao: o contrato vem do          │
 * │ REQUISITO (docs/MAPA-ALCANCE-DIGAI.md, docs/PROTOCOLO-LGPD-FABRICA.md e a PARTE 2 do         │
 * │ DIARIO.md). Os NOMES abaixo sao PROPOSTA deste arquivo. Por isso o carregamento e por        │
 * │ importacao dinamica resolvida em tempo de teste, e nao por `import` de topo: enquanto o      │
 * │ modulo nao existir, cada teste falha com UMA FRASE dizendo o que falta, em vez de o arquivo  │
 * │ inteiro morrer na coleta. Se a construcao escolher outros nomes, ajusta-se AQUI, num lugar.  │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * SECAO A.6 e PROTOCOLO LGPD: nenhum dado real entra aqui. Os CPFs sao SINTETICOS, com digito
 * verificador valido (conferidos contra `isValidCpf`), porque um CPF invalido seria recusado antes
 * de o teste chegar na regra que ele quer provar, e o verde viria pelo motivo errado.
 */

// ── 1. O CONTRATO: onde cada peca deve morar ────────────────────────────────

export const CAMINHOS = {
  /** A grade de acesso: allowlist de metodo, de rota, anti-SSRF, anti-PII, inspecao de fonte. */
  grade: "./digai-grade",
  /** O dominio puro: etapas de triagem, situacao de nascimento, leitura do estagio. */
  dominio: "../../domain/digai",
  /** O cliente HTTP autenticado por Bearer, que so fala com a rede ATRAVES da grade. */
  cliente: "./digai.cliente",
  /** A importacao idempotente dos candidatos de triagem para o funil. */
  importacao: "./digai-importacao.service",
  /** O reengajamento (reenvio do link de triagem, do NOSSO lado). */
  reengajar: "./digai-reengajar.service",
  /** Os corpos das rotas (DTOs), inclusive o aceite do lote. */
  dto: "./digai.dto",
  /** A controller, que e onde o RBAC das rotas mora. */
  controller: "./digai.controller",
} as const;

export type PecaDoDigai = keyof typeof CAMINHOS;

/**
 * Carrega uma peca do contrato, ou devolve `null` quando ela ainda nao existe.
 *
 * NAO LANCA de proposito: quem chama transforma a ausencia numa assercao com frase util. O
 * `catch` e estreito por necessidade (um erro de sintaxe DENTRO do modulo tambem chega aqui), e e
 * por isso que a mensagem original e preservada em `erro`: teste que falha por defeito de
 * compilacao nao pode ser confundido com teste que falha por falta de implementacao.
 */
export async function carregar(
  peca: PecaDoDigai,
): Promise<{ mod: Record<string, unknown> | null; erro: string | null }> {
  try {
    const mod = (await import(CAMINHOS[peca])) as Record<string, unknown>;
    return { mod, erro: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const ausente = /Cannot find module|Failed to load url|ERR_MODULE_NOT_FOUND/i.test(msg);
    return { mod: null, erro: ausente ? null : msg };
  }
}

/** Exige a peca inteira. Falha com a frase que diz QUAL arquivo falta. */
export async function exigirPeca(peca: PecaDoDigai): Promise<Record<string, unknown>> {
  const { mod, erro } = await carregar(peca);
  expect(erro, `a peca '${peca}' existe mas NAO CARREGA, e isto e defeito de codigo, nao ausencia de implementacao: ${erro}`).toBeNull();
  expect(
    mod,
    `FALTA IMPLEMENTAR: a peca '${peca}' da integracao Digai, esperada em '${CAMINHOS[peca]}' (relativo a apps/backend/src/as/digai/).`,
  ).not.toBeNull();
  return mod as Record<string, unknown>;
}

/** Exige um export nomeado da peca. */
export async function exigirExport<T = unknown>(peca: PecaDoDigai, nome: string): Promise<T> {
  const mod = await exigirPeca(peca);
  expect(
    mod[nome],
    `FALTA IMPLEMENTAR: '${nome}' nao e exportado por '${CAMINHOS[peca]}'. Presentes hoje: ${Object.keys(mod).join(", ") || "nenhum"}.`,
  ).toBeDefined();
  return mod[nome] as T;
}

// ── 2. DADOS SINTETICOS. ZERO PII REAL ──────────────────────────────────────

/**
 * CPFs SINTETICOS com digito verificador valido. Conferidos contra `isValidCpf` no proprio spec
 * de dominio, porque um numero que o validador recusa faria o teste de "com CPF finalizou" passar
 * pelo caminho errado.
 */
export const CPF_SINTETICO = {
  finalizou: "11122233396",
  outroFinalizou: "22233344405",
  terceiro: "55566677720",
} as const;

/** Um registro de `results` v2 do Digai, com a forma medida na varredura de 16/09 e nada alem. */
export function resultadoDigaiFingido(over: Partial<ResultadoDigai> = {}): ResultadoDigai {
  return {
    userId: "usr-sintetico-1",
    partnerJobId: "1234567",
    name: "Fulano De Teste",
    email: "fulano.teste@exemplo.invalido",
    phoneNumber: "11900000001",
    cpf: null,
    appliedAt: "2026-09-10T12:00:00.000Z",
    stages: [],
    ...over,
  };
}

export interface ResultadoDigai {
  userId: string;
  partnerJobId: string | null;
  name: string | null;
  email: string | null;
  phoneNumber: string | null;
  cpf: string | null;
  appliedAt: string | null;
  stages: unknown[];
}

// ── 3. A CACA AO VALOR REAL (armadilha 2 do protocolo, seccao 1.1) ──────────

/**
 * PROCURA O VALOR REAL NA SAIDA, e nao o placeholder.
 *
 * ┌─ POR QUE ESTA FUNCAO EXISTE, e ela e a licao do veto 4 de 16/09 ───────────────────────────┐
 * │ O teste de mascaramento anterior procurava `<5` na saida e passava, porque o `<5` ESTAVA la │
 * │ e o valor real estava ao lado. Teste que procura o placeholder nao prova mascaramento: prova │
 * │ que alguem imprimiu um placeholder em algum lugar.                                          │
 * └────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * As VARIACOES importam tanto quanto o valor: um CPF vaza formatado, sem mascara, so os digitos,
 * ou dentro de JSON escapado. Procurar so a forma que o teste escreveu deixa tres portas abertas.
 */
export function variacoesDoValor(valor: string): string[] {
  const so = valor.replace(/\D/g, "");
  const formas = new Set<string>([valor, valor.toLowerCase(), valor.toUpperCase()]);
  if (so.length === 11) {
    formas.add(so);
    formas.add(`${so.slice(0, 3)}.${so.slice(3, 6)}.${so.slice(6, 9)}-${so.slice(9)}`);
    formas.add(`${so.slice(0, 3)} ${so.slice(3, 6)} ${so.slice(6, 9)} ${so.slice(9)}`);
  }
  return [...formas].filter((f) => f.length >= 4);
}

/** Devolve as ocorrencias de PII encontradas numa saida qualquer. Vazio = limpo. */
export function piiNaSaida(saida: unknown, valores: readonly string[]): string[] {
  const texto = typeof saida === "string" ? saida : JSON.stringify(saida ?? "");
  const alvo = texto.toLowerCase();
  const achados: string[] = [];
  for (const valor of valores) {
    for (const forma of variacoesDoValor(valor)) {
      if (alvo.includes(forma.toLowerCase())) achados.push(forma);
    }
  }
  return [...new Set(achados)];
}

// ── 4. LEITURA DO FONTE DO MODULO (para as asercoes de forma) ───────────────

export const PASTA_DO_DIGAI = __dirname;

/** Todo o codigo de producao do modulo Digai, concatenado, sem os arquivos de teste. */
export function fonteDoModulo(pasta: string = PASTA_DO_DIGAI): string {
  const pedacos: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        andar(caminho);
        continue;
      }
      if (!nome.endsWith(".ts")) continue;
      if (nome.includes(".spec.") || nome.includes(".tester-fake.") || nome.includes(".fake.")) {
        continue;
      }
      pedacos.push(readFileSync(caminho, "utf8"));
    }
  };
  andar(pasta);
  return pedacos.join("\n");
}

/**
 * O fonte do modulo, EXIGINDO que ele exista.
 *
 * ┌─ POR QUE A EXIGENCIA E PARTE DO TESTE, e nao burocracia ────────────────────────────────────┐
 * │ Toda assercao do tipo "o fonte NAO contem X" e VACUAMENTE VERDADEIRA enquanto nao ha fonte. │
 * │ Um arquivo vazio nao contem atalho de TLS, nao contem token e nao loga CPF, e os tres testes │
 * │ nascem VERDES afirmando garantias que ninguem deu. E o mesmo verde falso do veto 4 de 16/09, │
 * │ por outra porta: o teste procurava a AUSENCIA em vez de o valor.                            │
 * └──────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function fonteExigida(): string {
  const fonte = fonteDoModulo();
  expect(
    fonte.trim().length,
    "FALTA IMPLEMENTAR: nao ha codigo de producao no modulo Digai. Sem fonte, toda assercao de AUSENCIA passa de graca.",
  ).toBeGreaterThan(0);
  return fonte;
}

/** So o SQL/TS que executa: linha de comentario fora, para asercao de forma nao ler comentario. */
export function semComentario(texto: string): string {
  return texto
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

// ── 5. A SUSPENSAO POR AUSENCIA MEDIDA, E A SENTINELA QUE A DESFAZ ──────────

/**
 * POR QUE A MEDIDA E SINCRONA, LENDO O DISCO, e nao o `carregar` assincrono daqui de cima.
 *
 * O vitest monta os `describe` na COLETA, que e sincrona: quando a promessa do `import()` dinamico
 * resolvesse, os blocos ja estariam registrados e a decisao de suspender chegaria tarde. Um
 * `await` de topo resolveria no papel, mas so em ESM puro, e esta casa compila o backend em
 * CommonJS (o proprio arquivo usa `__dirname`). Entao a pergunta "a peca existe?" e respondida do
 * jeito mais honesto que responde a tempo: PROCURANDO O ARQUIVO NO DISCO.
 *
 * A diferenca entre as duas medidas e conhecida e aceita: o disco responde "o arquivo existe", o
 * `carregar` responde "o modulo carrega". Para decidir a SUSPENSAO, existir basta, e e o que se
 * quer: no instante em que a primeira peca aparecer, mesmo quebrada, a suite tem de acordar.
 */
const SUFIXOS_DE_MODULO = [".ts", ".tsx", ".js", "/index.ts", "/index.js"] as const;

/** As pecas do contrato que JA EXISTEM no disco. Vazio = a frente continua pendente. */
export function pecasPresentes(): PecaDoDigai[] {
  return (Object.keys(CAMINHOS) as PecaDoDigai[]).filter((peca) => {
    const base = join(PASTA_DO_DIGAI, CAMINHOS[peca]);
    if (SUFIXOS_DE_MODULO.some((sufixo) => existsSync(`${base}${sufixo}`))) return true;
    return existsSync(base) && statSync(base).isDirectory();
  });
}

/**
 * A medida, tirada UMA VEZ na coleta. Nao ha interruptor para alguem esquecer de virar: a
 * suspensao e DERIVADA da ausencia, e ela se desfaz sozinha quando a ausencia acabar.
 */
export const PECAS_PRESENTES: readonly PecaDoDigai[] = pecasPresentes();

/** `true` enquanto NENHUMA peca do Digai existir. */
export const DIGAI_SUSPENSO = PECAS_PRESENTES.length === 0;

/**
 * O `describe` das suites suspensas: `describe.skip` enquanto nao ha implementacao, `describe` de
 * verdade no minuto em que a primeira peca nascer. Nenhuma assercao foi apagada: elas so esperam.
 */
export const describeSuspenso = DIGAI_SUSPENSO ? describe.skip : describe;

/**
 * A SENTINELA. Roda SEMPRE, inclusive com a suite suspensa, e e a unica coisa que impede este
 * trabalho de dormir para sempre: `skip` puro ninguem lembra de reativar, entao quem avisa nao e a
 * memoria de ninguem, e um teste que FICA VERMELHO no dia em que a implementacao aparecer.
 */
export function sentinelaDoDigai(arquivo: string): void {
  it(`SENTINELA: a implementacao do Digai ainda nao existe, entao esta suite segue suspensa`, () => {
    expect(
      [...PECAS_PRESENTES],
      [
        "A IMPLEMENTACAO DO DIGAI CHEGOU, REATIVE ESTA SUITE REMOVENDO A SUSPENSAO.",
        `Pecas encontradas no disco: ${PECAS_PRESENTES.join(", ")}.`,
        `Como reativar em '${arquivo}': troque 'describeSuspenso' por 'describe', apague o cabecalho de suspensao e remova a chamada de 'sentinelaDoDigai'.`,
        "O contrato escrito neste arquivo continua valendo palavra por palavra: ele foi escrito antes do codigo de proposito (secao A.40, regra 2), e e ele que a construcao tem de satisfazer.",
      ].join(" "),
    ).toEqual([]);
  });
}
