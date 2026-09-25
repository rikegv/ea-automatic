import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_EVENTOS, montarEventoPortal } from "../domain/portal-evento";
import * as schema from "../db/schema";
import { fonteOuNulo, semComentarios } from "./portal-envio.tester-fake";

/**
 * PORTAL PARA GI, PECAS 1 e 2: OS GANCHOS NA INFRAESTRUTURA QUE JA EXISTE (`tester`, §A.38/§A.40).
 *
 * Companheiro de `portal-dados-gi.contrato.tester.spec.ts`. Aquele arquivo prova o COMPORTAMENTO
 * contra um modulo de dominio a construir (e falha na importacao ate ele existir). ESTE arquivo se
 * ancora SO no que ja existe hoje (o sanitizador da trilha, o schema, o molde do controller de
 * leitura) e por isso ele COLETA e roda: as asseroes ficam VERMELHAS enquanto a peca nao existe, em
 * vez de derrubar a coleta. Fonte ausente vira `expect(...).not.toBeNull()` vermelho, no molde de
 * `admissoes.ponte-substituido-ttl.tester.spec.ts`.
 *
 * §A.6 / §A.11: valores sinteticos, sem travessao.
 */

const NOME_SINTETICO = "Fulano De Tal";
const CPF_SINTETICO = "39053344705";
const NASCIMENTO_SINTETICO = "1990-03-14";
const RG_SINTETICO = "12.345.678-9";
const VALORES_PII = [NOME_SINTETICO, CPF_SINTETICO, NASCIMENTO_SINTETICO, RG_SINTETICO];

/** Acha o arquivo do portal cujo nome menciona `dados-gi`, sem supor o nome exato do construtor. */
function arquivoDoPortalQueMenciona(fragmento: string): string | null {
  const dir = join(__dirname);
  try {
    const alvo = readdirSync(dir).find(
      (nome) => nome.includes(fragmento) && !nome.includes(".spec.") && !nome.includes(".tester-fake."),
    );
    return alvo ?? null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 3: A TRILHA DO ACEITE PASSA PELO SANITIZADOR QUE JA EXISTE, E ELE DESCARTA VALOR
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R3: o evento do aceite do GI existe no catalogo fechado da trilha", () => {
  it("PORTAL_EVENTOS registra um evento de aceite dos dados do GI", () => {
    // Nome final e do construtor; o vocabulario e do requisito. Aceita as variantes plausiveis.
    const temEvento = (PORTAL_EVENTOS as readonly string[]).some((e) =>
      /DADOS_GI|GI_CONFIRM|GI_ACEIT|GI_GRAVAD|GI_VALIDAD/.test(e),
    );
    expect(temEvento).toBe(true);
  });
});

describe("R3: o sanitizador da trilha descarta TODO valor de pessoa (regressao que ja vale hoje)", () => {
  it("montar o evento com o payload CRU do aceite nao deixa nenhum valor atravessar", () => {
    // `montarEventoPortal` aceita qualquer rotulo de tipo em runtime; o ponto e a allowlist de CAMPOS.
    const evento = montarEventoPortal(
      "PORTAL_DADOS_GI_CONFIRMADO" as never,
      {
        jtiLink: "11111111-1111-4111-8111-111111111111",
        // O bloco cru que o servico do aceite tem em maos: rotulos + valores. So os valores sao PII.
        campos: {
          nomeCompleto: { rotulo: "Nome completo", valor: NOME_SINTETICO },
          cpf: { rotulo: "CPF", valor: CPF_SINTETICO },
          rg: { rotulo: "RG", valor: RG_SINTETICO },
        },
        valoresConfirmados: { nomeCompleto: NOME_SINTETICO, cpf: CPF_SINTETICO },
        cpf: CPF_SINTETICO,
        nome: NOME_SINTETICO,
      },
      "pepper-de-teste",
    );
    const alvo = JSON.stringify(evento);
    for (const pii of VALORES_PII) expect(alvo).not.toContain(pii);
    // O que sobra e util: a sessao (jti) e a contagem de campos, nunca o conteudo.
    expect(evento.jtiLink).toBe("11111111-1111-4111-8111-111111111111");
    expect(typeof evento.camposExtraidosN).toBe("number");
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 2: O CONTROLLER DA GRAVACAO SEGUE O MOLDE DO `portal-documentos.controller`
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R2: o endpoint de gravar dados do GI tira a admissao do bilhete, nao do corpo", () => {
  it("existe um controller do portal para os dados do GI", () => {
    const nome = arquivoDoPortalQueMenciona("dados-gi");
    expect(nome).not.toBeNull();
  });

  it("o controller deriva a admissao de `req.portal` e usa o `PortalSessaoGuard`", () => {
    const nome = arquivoDoPortalQueMenciona("dados-gi");
    const fonte = nome ? fonteOuNulo("portal", nome) : null;
    expect(fonte).not.toBeNull();
    const codigo = semComentarios(fonte ?? "");
    expect(codigo).toMatch(/req\.portal/);
    expect(codigo).toMatch(/PortalSessaoGuard/);
  });

  it("o controller NAO le a admissao de `@Body`: nada de admissaoId vindo do corpo", () => {
    const nome = arquivoDoPortalQueMenciona("dados-gi");
    const fonte = nome ? fonteOuNulo("portal", nome) : null;
    expect(fonte).not.toBeNull();
    const codigo = semComentarios(fonte ?? "");
    // O molde do `portal-documentos.controller` NAO tem parametro de admissao: id de admissao e
    // adivinhavel por enumeracao, entao aceita-lo do corpo deixaria gravar dado de outra pessoa.
    expect(codigo).not.toMatch(/admiss[aã]o?Id[^)]*@Body|@Body[^)]*admiss/i);
  });

  // O caminho HTTP ponta a ponta (guard recusa bilhete de outra admissao) precisa do controller e do
  // servico ja construidos: fica em `.todo` ate a peca existir.
  it.todo("POST /portal/dados-gi grava na admissao do bilhete mesmo se o corpo mandar outra");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
// REQUISITO 4: O DADO VALIDADO MORA EM TABELA DEDICADA COM RELOGIO DE EXPURGO
// ════════════════════════════════════════════════════════════════════════════════════════════════

describe("R4: existe a tabela do dado validado (B1) com a coluna de expurgo (B3)", () => {
  /** Acha a tabela do dado do GI no barrel do schema, sem supor o nome exato do construtor. */
  function tabelaDadosGi(): Record<string, unknown> | null {
    const s = schema as unknown as Record<string, unknown>;
    const chave = Object.keys(s).find((k) => /dadosGi|preAdmissaoDados|dadosPreAdmissao/i.test(k));
    return chave ? (s[chave] as Record<string, unknown>) : null;
  }

  it("a tabela do dado validado do GI existe no schema", () => {
    expect(tabelaDadosGi()).not.toBeNull();
  });

  it("a tabela carrega o relogio de expurgo (expurgar_em), como o TTL da staging", () => {
    const t = tabelaDadosGi();
    expect(t).not.toBeNull();
    const colunas = t ? Object.keys(t) : [];
    const temExpurgo = colunas.some((c) => /expurgar/i.test(c));
    expect(temExpurgo).toBe(true);
  });

  it("a rotina de expurgo apaga/nula a linha vencida por `lte(expurgar_em, agora)`", () => {
    // A rotina espelha `admissoes/expurgo.service.ts` (o TTL do CPF de substituicao). Ela pode
    // viver no proprio ExpurgoService ou num vizinho; procuramos pela mencao a tabela + ao relogio.
    const candidatos = ["expurgo.service.ts", "portal-dados-gi.expurgo.service.ts"];
    let achou = false;
    for (const arq of candidatos) {
      const fonte = fonteOuNulo("admissoes", arq) ?? fonteOuNulo("portal", arq);
      if (!fonte) continue;
      const codigo = semComentarios(fonte);
      if (/dadosGi|dados_gi|preAdmissao/i.test(codigo) && /expurgar/i.test(codigo) && /lte\(/.test(codigo)) {
        achou = true;
        break;
      }
    }
    expect(achou).toBe(true);
  });
});
