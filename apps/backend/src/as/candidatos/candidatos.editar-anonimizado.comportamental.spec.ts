import { HttpException } from "@nestjs/common";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { Papel } from "@ea/shared-types";
import { CandidatosService } from "./candidatos.service";

/**
 * ─ FURO 2 DE LGPD: `editar` REGRAVA DADO PESSOAL EM QUEM JÁ FOI ANONIMIZADO ───────────────────
 *
 * COBERTURA INDEPENDENTE (§A.38) escrita a partir do REQUISITO
 * (`docs/MAPA-ALCANCE-FUNDACAO-PROD-E-2-FUROS.md`, PARTE 2, FURO 2) e ANTES da implementação
 * existir (§A.40, regra 2). Nada do que o `backend` vier a escrever é lido aqui como definição.
 *
 * ┌─ O DEFEITO ────────────────────────────────────────────────────────────────────────────────┐
 * │ `editar` lê a linha, monta o `set` com nome, CPF, e-mail, telefone e data de nascimento e    │
 * │ grava por `where eq(id)`, SEM OLHAR `anonimizado_em`. Uma edição depois do expurgo           │
 * │ RE-IDENTIFICA a pessoa, e nada falha: do ponto de vista do sistema foi um salvamento comum.  │
 * │ O expurgo existe para que aquele dado não esteja mais ali; esta porta o coloca de volta.     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E A RECUSA TEM DE SER VISÍVEL, que é a metade que quase ninguém escreve ───────────────────┐
 * │ A cláusula `and anonimizado_em is null` no `where`, SOZINHA, atualiza ZERO linhas em         │
 * │ silêncio: o método segue, devolve `ficha(id)` (a ficha velha) e o consultor vê a tela        │
 * │ "salvar" sem nada mudar. Salvamento que não salva é pior do que erro, porque ninguém vai     │
 * │ atrás. Por isso são DUAS camadas, e as duas são medidas aqui: a cláusula, que é a que vale   │
 * │ contra a corrida porque o BANCO a avalia no instante da escrita, e a RECUSA explícita,       │
 * │ decidida pela CONTAGEM DE LINHAS AFETADAS e nunca pela leitura de antes.                     │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ─ ESTE ARQUIVO É DE COMPORTAMENTO DE VERDADE, e isso é possível aqui ──────────────────────────
 *
 * Ao contrário do furo 1, cujo filtro mora em SQL cru, a régua do furo 2 mora em TypeScript. Então
 * o que se afirma aqui é o que o serviço FEZ: o que ele mandou gravar, se lançou, e se chegou a
 * montar a resposta. O banco é fingido e ANOTA as escritas; nenhuma afirmação depende de texto de
 * consulta, com uma exceção declarada (a cláusula do `where`, que é a guarda contra a corrida e só
 * existe dentro da condição que vai ao banco).
 *
 * ┌─ O QUE ESTE ARQUIVO NÃO AFIRMA, de propósito ───────────────────────────────────────────────┐
 * │ Edição que NÃO carrega dado pessoal nenhum (só cidade, UF, ou só `bancoTalentos`) não é      │
 * │ objeto do requisito: o mapa de alcance registra, como PROPOSTA e não construção (§A.31), que │
 * │ marcar retenção em quem já foi anonimizado fica como está, dependendo de aval do diretor.    │
 * │ Afirmar aqui que TODA edição é recusada decidiria por ele, e o `tester` não decide escopo.   │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: todo dado é SINTÉTICO. O CPF é um número de teste com dígito válido, e nenhum nome ou
 * e-mail corresponde a pessoa real.
 */

// ── DADOS SINTÉTICOS ────────────────────────────────────────────────────────

const ID_CANDIDATO = "00000000-0000-4000-8000-000000000001";
const ID_AUTOR = "00000000-0000-4000-8000-0000000000a1";
/** CPF de teste, dígito verificador válido, sem dono. */
const CPF_SINTETICO = "11144477735";
const NOME_INVENTADO = "Fulano De Teste Sintetico";
const EMAIL_INVENTADO = "fulano.sintetico@exemplo.invalido";
const TELEFONE_INVENTADO = "11900000000";
const NASCIMENTO_INVENTADO = "1990-01-01";
/** O nome que o expurgo deixa no lugar do nome da pessoa. */
const MARCADOR_DO_EXPURGO = "Candidato Expurgado";

const AUTOR = { id: ID_AUTOR, papel: "COMUM" as Papel };

/** O corpo que RE-IDENTIFICA: ele traz de volta, um a um, os campos que o expurgo apagou. */
const DTO_QUE_REIDENTIFICA = {
  nome: NOME_INVENTADO,
  cpf: CPF_SINTETICO,
  email: EMAIL_INVENTADO,
  telefone: TELEFONE_INVENTADO,
  dataNascimento: NASCIMENTO_INVENTADO,
};

const VALORES_PESSOAIS = [
  NOME_INVENTADO,
  CPF_SINTETICO,
  EMAIL_INVENTADO,
  TELEFONE_INVENTADO,
  NASCIMENTO_INVENTADO,
];

// ── O BANCO FINGIDO, QUE ANOTA O QUE FOI ESCRITO ────────────────────────────

interface Escrita {
  tabela: string;
  valores: Record<string, unknown>;
  where: string;
}

function nomeDaTabela(t: unknown): string {
  try {
    return getTableConfig(t as PgTable).name;
  } catch {
    return "desconhecida";
  }
}

/** Reconstrói o texto de uma condição do drizzle. `JSON.stringify` estoura: a estrutura é circular. */
function textoDoSql(no: unknown): string {
  if (no === null || no === undefined) return "";
  if (typeof no === "string" || typeof no === "number" || typeof no === "boolean") return String(no);
  if (Array.isArray(no)) return no.map(textoDoSql).join(" ");
  const o = no as Record<string, unknown>;
  if (Array.isArray(o.queryChunks)) return (o.queryChunks as unknown[]).map(textoDoSql).join(" ");
  if ("value" in o && "encoder" in o) return textoDoSql(o.value);
  if (Array.isArray(o.value)) return (o.value as unknown[]).map(textoDoSql).join(" ");
  if (typeof o.name === "string") return String(o.name);
  return "";
}

/**
 * ─ O RESULTADO DE UMA ESCRITA, COM A CONTAGEM DE LINHAS AFETADAS ───────────────────────────────
 *
 * O MESMO OBJETO RESPONDE `.count` E `.length`, e isso não é preguiça: o DESENHO É DE QUEM
 * CONSTRÓI. O driver `postgres` devolve um resultado com `count`, e quem preferir pode fechar a
 * escrita com `.returning({ id })` e contar o array. As duas formas cumprem o requisito, e um fake
 * que servisse só uma delas reprovaria uma implementação correta.
 */
function resultadoDaEscrita(linhasAfetadas: number): unknown {
  const linhas = Array.from({ length: linhasAfetadas }, () => ({ id: ID_CANDIDATO }));
  const valor = Object.assign(linhas, { count: linhasAfetadas, rowCount: linhasAfetadas });
  const alvo = (() => undefined) as unknown as object;
  return new Proxy(alvo, {
    get(_t, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(valor).then(ok, err);
      }
      if (prop === "catch") return (f: (e: unknown) => unknown) => Promise.resolve(valor).catch(f);
      if (prop === "finally") return (f: () => void) => Promise.resolve(valor).finally(f);
      return () => resultadoDaEscrita(linhasAfetadas);
    },
    apply() {
      return resultadoDaEscrita(linhasAfetadas);
    },
  });
}

/** Uma cadeia de LEITURA que resolve no resultado dado, aceitando qualquer encadeamento. */
function cadeiaDeLeitura(resultado: unknown[]): unknown {
  const alvo = (() => undefined) as unknown as object;
  return new Proxy(alvo, {
    get(_t, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
          Promise.resolve(resultado).then(ok, err);
      }
      if (prop === "catch") return (f: (e: unknown) => unknown) => Promise.resolve(resultado).catch(f);
      if (prop === "finally") return (f: () => void) => Promise.resolve(resultado).finally(f);
      return () => cadeiaDeLeitura(resultado);
    },
    apply() {
      return cadeiaDeLeitura(resultado);
    },
  });
}

function bancoFingido(candidato: Record<string, unknown>, linhasAfetadas: number) {
  const escritas: Escrita[] = [];
  const db: Record<string, unknown> = {
    query: { asCandidatos: { findFirst: () => Promise.resolve(candidato) } },
    // A busca por CPF duplicado não acha ninguém: o dedup não é o objeto deste arquivo.
    select: () => cadeiaDeLeitura([]),
    execute: () => Promise.resolve([]),
    insert: (t: unknown) => ({
      values: (v: unknown) => {
        const valores = (Array.isArray(v) ? v[0] : v) as Record<string, unknown>;
        escritas.push({ tipo: "insert", tabela: nomeDaTabela(t), valores, where: "" } as Escrita);
        return cadeiaDeLeitura([{ id: ID_CANDIDATO }]);
      },
    }),
    update: (t: unknown) => ({
      set: (v: Record<string, unknown>) => {
        const registro: Escrita = { tabela: nomeDaTabela(t), valores: v, where: "" };
        escritas.push(registro);
        const fechar = resultadoDaEscrita(linhasAfetadas) as Record<string, unknown>;
        return new Proxy(fechar, {
          get(destino, prop, receptor) {
            if (prop === "where") {
              return (cond: unknown) => {
                registro.where = textoDoSql(cond).toLowerCase();
                return resultadoDaEscrita(linhasAfetadas);
              };
            }
            return Reflect.get(destino, prop, receptor) as unknown;
          },
        });
      },
    }),
  };
  db.transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(db);
  return { db, escritas };
}

interface ServicoEditavel {
  editar(id: string, dto: unknown, autor: unknown, ...resto: unknown[]): Promise<unknown>;
}

/** Uma pessoa no banco, já anonimizada ou não. */
function candidatoNoBanco(anonimizado: boolean): Record<string, unknown> {
  return {
    id: ID_CANDIDATO,
    nome: anonimizado ? MARCADOR_DO_EXPURGO : NOME_INVENTADO,
    cpf: null,
    email: null,
    telefone: null,
    dataNascimento: null,
    cidade: "Cidade Sintetica",
    uf: "SP",
    origem: "MANUAL",
    bancoTalentos: false,
    anonimizadoEm: anonimizado ? new Date("2026-01-01T00:00:00.000Z") : null,
    criadoEm: new Date("2023-01-01T00:00:00.000Z"),
    atualizadoEm: new Date("2023-01-01T00:00:00.000Z"),
  };
}

interface Cenario {
  /** A linha está anonimizada no banco quando o serviço a LÊ. */
  anonimizado: boolean;
  /** Quantas linhas o `update` afetou. Zero é a corrida: o expurgo passou no meio do caminho. */
  linhasAfetadas?: number;
  dto?: Record<string, unknown>;
}

async function editar(cenario: Cenario): Promise<{
  escritas: Escrita[];
  erro: unknown;
  chamouFicha: boolean;
}> {
  const { db, escritas } = bancoFingido(
    candidatoNoBanco(cenario.anonimizado),
    cenario.linhasAfetadas ?? (cenario.anonimizado ? 0 : 1),
  );
  const s = new CandidatosService(db as never, {} as never, {} as never);
  // A leitura final (`ficha`) monta a resposta com consultas que este fake não serve, e ela não é o
  // objeto do teste. O que interessa é o que foi ESCRITO, e SE ela chegou a ser chamada.
  const espiaFicha = vi
    .spyOn(s as unknown as { ficha: () => Promise<unknown> }, "ficha")
    .mockResolvedValue({} as never);

  let erro: unknown = null;
  try {
    await (s as unknown as ServicoEditavel).editar(
      ID_CANDIDATO,
      cenario.dto ?? DTO_QUE_REIDENTIFICA,
      AUTOR,
    );
  } catch (e) {
    erro = e;
  }
  return { escritas, erro, chamouFicha: espiaFicha.mock.calls.length > 0 };
}

function escritasNoCandidato(escritas: Escrita[]): Escrita[] {
  return escritas.filter((e) => e.tabela === "as_candidatos");
}

/** Tudo o que foi mandado gravar na pessoa, somado, venha em uma escrita ou em várias. */
function gravadoNoCandidato(escritas: Escrita[]): Record<string, unknown> {
  return escritasNoCandidato(escritas).reduce<Record<string, unknown>>(
    (acc, e) => ({ ...acc, ...e.valores }),
    {},
  );
}

/** O dado pessoal que a tentativa trouxe apareceu em ALGUMA escrita? Esta é a pergunta do furo 2. */
function reidentificou(escritas: Escrita[]): boolean {
  const valores = Object.values(gravadoNoCandidato(escritas)).map((v) =>
    v instanceof Date ? v.toISOString() : String(v),
  );
  return VALORES_PESSOAIS.some((pessoal) => valores.includes(pessoal));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. REGISTRO ANONIMIZADO NÃO VOLTA A RECEBER DADO PESSOAL
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("furo 2: `editar` sobre registro já anonimizado", () => {
  /**
   * A AFIRMAÇÃO CENTRAL DO ARQUIVO, e ela é de comportamento puro: o que o serviço MANDOU GRAVAR.
   * Nenhum dos cinco campos que o expurgo apagou pode voltar para a linha.
   */
  it("NÃO regrava nome, CPF, e-mail, telefone nem data de nascimento", async () => {
    const { escritas } = await editar({ anonimizado: true });
    expect(
      reidentificou(escritas),
      "o expurgo existe para que esse dado não esteja mais ali. Esta porta o coloca de volta, e nada falha: do ponto de vista do sistema foi um salvamento comum.",
    ).toBe(false);
  });

  /**
   * E A TENTATIVA É RECUSADA, com erro que CHEGA à pessoa. Não pode ser 500 (que é defeito), nem
   * um `resolve` silencioso.
   */
  it("a tentativa é RECUSADA de forma visível", async () => {
    const { erro } = await editar({ anonimizado: true });
    expect(
      erro,
      "sem recusa, a cláusula no `where` atualizaria zero linhas em silêncio e a tela mostraria um salvamento que não salvou nada.",
    ).toBeInstanceOf(HttpException);
    const status = (erro as HttpException).getStatus();
    expect(status, "a recusa é uma resposta ao usuário, e não uma falha do servidor.").toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  });

  /**
   * A RECUSA NÃO PODE VIRAR UM "SALVOU" SILENCIOSO: se o método chegasse a montar `ficha(id)`, a
   * tela receberia 200 com a ficha velha, que é exatamente o modo de falha que o mapa descreve.
   */
  it("não devolve ficha nenhuma: o método não segue até a resposta", async () => {
    const { chamouFicha } = await editar({ anonimizado: true });
    expect(chamouFicha).toBe(false);
  });

  /**
   * §A.6 na mensagem: a frase mais natural de escrever aqui carregaria o número. Ela não pode: a
   * mensagem de erro é o lugar de onde o CPF mais facilmente cai num log.
   */
  it("a recusa não carrega dado pessoal na mensagem", async () => {
    const { erro } = await editar({ anonimizado: true });
    // A recusa tem de existir para a mensagem existir: sem isto o caso ficaria verde por vacuidade.
    expect(erro).not.toBeNull();
    const texto = erro instanceof Error ? `${erro.message} ${JSON.stringify(erro)}` : String(erro);
    for (const pessoal of [CPF_SINTETICO, EMAIL_INVENTADO, TELEFONE_INVENTADO]) {
      expect(texto).not.toContain(pessoal);
    }
    expect(texto).not.toContain("111.444.777-35");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. A CORRIDA: A DECISÃO É DA CONTAGEM DE LINHAS, NUNCA DA LEITURA DE ANTES
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("furo 2: a guarda vale no INSTANTE DA ESCRITA", () => {
  /**
   * ─ O CASO QUE UMA GUARDA SÓ EM MEMÓRIA NÃO PEGA ───────────────────────────────────────────────
   *
   * A leitura e a escrita NÃO são atômicas. Aqui a linha é lida como NÃO anonimizada (é o que o
   * consultor viu na tela), e a varredura do expurgo passa entre a leitura e o `update`: a escrita
   * afeta ZERO linhas. Uma implementação que decidisse pela leitura de antes seguiria feliz,
   * devolveria a ficha e ninguém saberia que o salvamento não aconteceu.
   *
   * ESTE É O TESTE QUE SEPARA AS DUAS CAMADAS: quem escrever só o `if` em memória fica vermelho
   * aqui; quem escrever só a cláusula no `where` fica vermelho no bloco 1 (recusa visível).
   */
  it("update que afeta ZERO linhas é RECUSADO, e não tratado como salvamento", async () => {
    const { erro, chamouFicha } = await editar({
      anonimizado: false,
      linhasAfetadas: 0,
    });
    expect(
      erro,
      "zero linha afetada quer dizer que a linha deixou de satisfazer a régua entre a leitura e a escrita. Tratar isso como sucesso é mostrar `salvo` para um salvamento que não existiu.",
    ).toBeInstanceOf(HttpException);
    expect(chamouFicha).toBe(false);
  });

  /**
   * A ÚNICA AFIRMAÇÃO DE FORMA DO ARQUIVO, e ela é declarada: a guarda contra a corrida só existe
   * se a condição FOR AO BANCO, porque é o banco que a avalia no instante da escrita. Isso não tem
   * como ser observado pelo efeito num fake, então se afirma sobre a condição que o serviço montou.
   */
  it("a condição do `update` carrega `anonimizado_em` até o banco", async () => {
    const { escritas } = await editar({ anonimizado: false, linhasAfetadas: 1 });
    const naPessoa = escritasNoCandidato(escritas);
    expect(naPessoa.length).toBeGreaterThan(0);
    expect(
      naPessoa.map((e) => e.where).join(" "),
      "sem a cláusula no `where`, duas requisições simultâneas passam pela conferência em memória juntas e a segunda re-identifica a pessoa que a varredura acabou de expurgar.",
    ).toContain("anonimizado_em");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. O QUE NÃO PODE QUEBRAR (verde hoje, e é essa a função destes casos)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

describe("furo 2: a edição normal continua funcionando", () => {
  it("registro vivo continua sendo editado, e a ficha continua sendo devolvida", async () => {
    const { escritas, erro, chamouFicha } = await editar({
      anonimizado: false,
      linhasAfetadas: 1,
    });
    expect(erro, "quem não foi anonimizado não tem nada a ver com esta guarda.").toBeNull();
    expect(chamouFicha).toBe(true);
    const gravado = gravadoNoCandidato(escritas);
    expect(Object.values(gravado)).toContain(NOME_INVENTADO);
    expect(Object.values(gravado)).toContain(CPF_SINTETICO);
  });

  it("a edição normal grava os cinco campos pessoais que o corpo trouxe", async () => {
    const { escritas } = await editar({ anonimizado: false, linhasAfetadas: 1 });
    expect(
      reidentificou(escritas),
      "esta é a prova de que o teste do bloco 1 mede alguma coisa: com a MESMA tentativa, a pessoa viva recebe o dado e a anonimizada não pode receber.",
    ).toBe(true);
  });
});
