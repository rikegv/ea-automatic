import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reversaoDerrubaCadastro } from "../domain/esteira";

/**
 * COBERTURA INDEPENDENTE (§A.38): REABRIR UM DOCUMENTO APROVADO, E A CONSEQUÊNCIA QUE FALTAVA.
 *
 * Escrito a partir do REQUISITO (§A.40, regra 2), e REESCRITO depois da auditoria de mapa, que
 * corrigiu o desenho: a porta JÁ EXISTE.
 *
 * ┌─ O QUE MUDOU, E POR QUE ISTO NÃO TESTA MAIS ROTA NOVA NEM MOTIVO ──────────────────────────┐
 * │ `POST /esteira/auditoria/:admissaoId/descartar` (`reauditoria/documento-arquivo.service.ts`) │
 * │ já devolve o documento a PENDENTE, limpa veredito, apaga a marca de dedup e grava trilha, e │
 * │ já é operacional para qualquer consultor. Rota nova seria a SEGUNDA escritora do mesmo dado, │
 * │ e a guarda nela nasceria contornável pela antiga. O motivo obrigatório saiu do contrato      │
 * │ (§A.31, e texto livre sobre documento de terceiro é coletor de PII).                         │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O BURACO REAL, MEDIDO: O RECUO NÃO EXISTE HOJE ───────────────────────────────────────────┐
 * │ `aplicarPosVeredito` só age com a régua completa, `autoConcluirAuditoria` só escreve         │
 * │ ANALISE_OK, e o farol deriva de `frentes.concluida`. Logo "AUDITORIA = ANALISE_OK, concluída,│
 * │ régua obrigatória INCOMPLETA" já é alcançável em produção, e nesse estado a pendência        │
 * │ reaberta SOME da fila da Esteira, que esconde frente concluída.                              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * §A.6: nenhum CPF, nenhum nome, nenhum arquivo real.
 */

const SRC = join(__dirname, "..");
/*
 * AS PORTAS QUE PRECISAM DA GUARDA SÃO DUAS, E NÃO TRÊS, e a correção é do COORDENADOR ao
 * consolidar. O briefing falava em "três portas" porque a auditoria de mapa listou três caminhos
 * que tocam o documento. Medido depois, no código: `validacao-humana.service.ts` só escreve
 * `estado: "ENTREGUE"`, nos dois ramos do `onConflictDoUpdate`. Ela AVANÇA, nunca devolve o
 * documento a PENDENTE, logo não tem como DES-completar a régua e não há o que guardar nela.
 * Exigir a guarda ali seria exigir proteção contra um movimento que aquela porta não faz.
 *
 * ELA CONTINUA NA LISTA ABAIXO, de propósito, coberta pelo teste "nenhuma porta escreve a própria
 * versão da guarda": se um dia ela passar a recuar, é por ali que a divergência aparece.
 */
const PORTAS_QUE_RECUAM: { nome: string; caminho: string }[] = [
  { nome: "descartar", caminho: join(SRC, "reauditoria", "documento-arquivo.service.ts") },
  { nome: "reauditar", caminho: join(SRC, "reauditoria", "reauditoria.service.ts") },
];

const PORTAS: { nome: string; caminho: string }[] = [
  ...PORTAS_QUE_RECUAM,
  { nome: "validação humana", caminho: join(SRC, "reauditoria", "validacao-humana.service.ts") },
];

// ══ 1. NENHUMA SEGUNDA PORTA ═════════════════════════════════════════════════════════════════

/**
 * O CANÁRIO DA SEGUNDA ESCRITORA. Hoje quem devolve documento a PENDENTE são exatamente dois
 * arquivos. A lista cresceu, ou a rodada abriu a porta nova que a auditoria vetou, ou alguém
 * duplicou o caminho: nos dois casos a guarda do item 3 passa a ter um contorno.
 */
describe("1. quem escreve `documentos_admissao.estado = PENDENTE` continua sendo o mesmo punhado", () => {
  it("nenhum arquivo NOVO passou a devolver documento a PENDENTE", () => {
    const conhecidos = [
      "reauditoria/documento-arquivo.service.ts",
      "admissoes/admissoes.service.ts",
    ].sort();
    const achados = varrer(SRC)
      .filter((f) => !f.includes(".spec."))
      .filter((f) => /estado:\s*["']PENDENTE["']/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(SRC.length + 1))
      .sort();
    expect(
      achados,
      "apareceu uma segunda porta de reabertura: a guarda de uma porta é contornável pela outra",
    ).toEqual(conhecidos);
  });

  it("não nasceu rota de reabertura sob `portal/` (a barreira allowlista aquele prefixo)", () => {
    const controllers = readdirSync(__dirname).filter((f) => f.endsWith(".controller.ts"));
    for (const c of controllers) {
      const fonte = semComentarios(readFileSync(join(__dirname, c), "utf8"));
      expect(fonte, `${c} expôs a reabertura do documento sob o prefixo do candidato`).not.toMatch(
        /reabrir-?documento|reabrirDocumento/i,
      );
    }
  });
});

// ══ 2. O RECUO DA FRENTE ═════════════════════════════════════════════════════════════════════

/** O módulo do recuo, onde quer que ele tenha nascido. */
function moduloDoRecuo(): { caminho: string; fonte: string } | null {
  for (const f of varrer(SRC).filter((x) => !x.includes(".spec."))) {
    const fonte = semComentarios(readFileSync(f, "utf8"));
    /*
     * O RECUO PODE ESCREVER O STATUS PELA CONSTANTE, e não pelo literal, e a primeira versão desta
     * varredura não via isso: ela procurava só `"ANALISE_PENDENTE"` entre aspas e dava FALSO
     * NEGATIVO sobre um recuo que existia e estava correto (`auditoria.service.recuarAuditoria`
     * usa `STATUS_INICIAL_FRENTE.AUDITORIA`, que é o jeito certo, porque o literal repetido é a
     * segunda verdade sobre o status de nascimento da frente). Corrigido pelo COORDENADOR ao
     * consolidar: a asserção continua a mesma, o que mudou foi enxergar as duas grafias.
     */
    const recua =
      /["']ANALISE_PENDENTE["']/.test(fonte) || /STATUS_INICIAL_FRENTE\.AUDITORIA/.test(fonte);
    const desfaz = /concluida\s*:\s*false/.test(fonte) && /dataConclusao\s*:\s*null/.test(fonte);
    if (recua && desfaz) return { caminho: f, fonte };
  }
  return null;
}

const RECUO = moduloDoRecuo();

describe("2. reabrir o último obrigatório aceito FAZ A FRENTE RECUAR", () => {
  it("existe o caminho que devolve a AUDITORIA a ANALISE_PENDENTE", () => {
    expect(
      RECUO,
      "nenhum módulo escreve ANALISE_PENDENTE com `concluida: false` e `dataConclusao: null`: " +
        "sem isso a frente fica concluída com a régua incompleta e a pendência some da fila",
    ).not.toBeNull();
  });

  it("o recuo desfaz a conclusão INTEIRA: status, `concluida` e a data", () => {
    if (!RECUO) return expect.fail("módulo do recuo ausente");
    // As duas grafias valem: o literal, ou a constante do status de nascimento da frente, que é
    // como o recuo ficou escrito (ver a nota em `moduloDoRecuo`).
    expect(RECUO.fonte).toMatch(
      /status\s*:\s*(["']ANALISE_PENDENTE["']|paraStatus|STATUS_INICIAL_FRENTE\.AUDITORIA)/,
    );
    expect(RECUO.fonte).toMatch(/concluida\s*:\s*false/);
    expect(
      RECUO.fonte,
      "data de conclusão que sobrevive ao recuo faz a frente parecer concluída em relatório",
    ).toMatch(/dataConclusao\s*:\s*null/);
  });

  it("o evento sai marcado como REVERSÃO, e não como avanço", () => {
    if (!RECUO) return expect.fail("módulo do recuo ausente");
    expect(RECUO.fonte, "evento de recuo gravado com `reversao: false` mente na trilha").toMatch(
      /reversao\s*:\s*true/,
    );
  });

  it("o CADASTRO já nascido é derrubado junto, pela régua que já existe", () => {
    if (!RECUO) return expect.fail("módulo do recuo ausente");
    expect(
      RECUO.fonte,
      "sem derrubar o Cadastro, o gate da regra 3 fica aberto com a auditoria reaberta",
    ).toMatch(/reversaoDerrubaCadastro|cadastroDerrubado/);
  });

  it("a régua da derrubada é a do domínio, e ela diz o que se espera dela", () => {
    // ANALISE_OK abre o gate; ANALISE_PENDENTE não. Com o Cadastro aberto, o recuo derruba.
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE", true)).toBe(true);
    // Cadastro que não estava aberto não tem o que derrubar.
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_PENDENTE", false)).toBe(
      false,
    );
    // Recuo que não fecha o gate não derruba nada.
    expect(reversaoDerrubaCadastro("AUDITORIA", "ANALISE_OK", "ANALISE_OK", true)).toBe(false);
  });

  it("o farol é recomputado depois do recuo", () => {
    if (!RECUO) return expect.fail("módulo do recuo ausente");
    expect(RECUO.fonte, "o farol deriva de `frentes.concluida`: sem recomputar, ele mente").toMatch(
      /recomputeFarolGlobal|farolAtualizado/,
    );
  });

  it("o recuo é DISPARADO pela porta que reabre o documento, e não fica só disponível", () => {
    if (!RECUO) return expect.fail("módulo do recuo ausente");
    const nomeDoModulo = RECUO.caminho.split("/").pop()!.replace(".ts", "");
    const descartar = semComentarios(readFileSync(PORTAS[0].caminho, "utf8"));
    const chama =
      descartar.includes(nomeDoModulo) ||
      /recuar|reavaliarAuditoria|aplicarRecuo|posReabertura/i.test(descartar);
    expect(chama, "`descartar` reabre o documento e não chama o recuo: o buraco continua").toBe(
      true,
    );
  });

  it("a fila da Esteira continua escondendo frente concluída (é por isso que o recuo importa)", () => {
    const esteira = semComentarios(readFileSync(join(SRC, "esteira", "esteira.service.ts"), "utf8"));
    expect(esteira).toMatch(/eq\s*\(\s*frentesAdmissao\.concluida\s*,\s*false\s*\)/);
  });
});

// ══ 3. A GUARDA, E ELA VALE NAS TRÊS PORTAS ══════════════════════════════════════════════════

/** A função de domínio que decide se ainda se pode mexer no documento. */
async function guardaDeDominio(): Promise<((e: never) => unknown) | null> {
  const candidatos = [
    "reabertura-documento",
    "reabertura",
    "documento-reabertura",
    "guarda-reabertura",
  ];
  for (const base of candidatos) {
    const caminho = join(SRC, "domain", `${base}.ts`);
    if (!existsSync(caminho)) continue;
    const mod = (await import(caminho)) as Record<string, unknown>;
    const fn = Object.values(mod).find((v) => typeof v === "function");
    if (fn) return fn as (e: never) => unknown;
  }
  return null;
}

describe("3. a guarda é por ASSINATURA e por KIT, nunca por farol, e vale nas portas E no efeito", () => {
  it("existe uma função de domínio que decide a reabertura", async () => {
    expect(
      await guardaDeDominio(),
      "guarda escrita dentro de um serviço não é chamável pelas outras duas portas: " +
        "esperada em src/domain (reabertura-documento.ts ou similar)",
    ).not.toBeNull();
  });

  it("ela RECUSA contrato em assinatura e contrato assinado", async () => {
    const guarda = await guardaDeDominio();
    if (!guarda) return expect.fail("guarda de domínio ausente");
    for (const status of ["AGUARDANDO_ASSINATURA", "ASSINADO"]) {
      expect(permitiu(guarda(estado({ clicksignStatus: status }))), `${status} passou`).toBe(false);
    }
  });

  it("envelope MORTO libera: é disso que o reenvio por correção depende (§A.5)", async () => {
    const guarda = await guardaDeDominio();
    if (!guarda) return expect.fail("guarda de domínio ausente");
    for (const status of ["CANCELADO", "SEM_ENVELOPE", null]) {
      expect(permitiu(guarda(estado({ clicksignStatus: status }))), `${status} barrou`).toBe(true);
    }
  });

  it("ela RECUSA quando o KIT já está na fila, mesmo sem envelope ainda", async () => {
    const guarda = await guardaDeDominio();
    if (!guarda) return expect.fail("guarda de domínio ausente");
    const comKit = estado({
      clicksignStatus: "SEM_ENVELOPE",
      kitGerado: true,
      kitAssinaturaPath: "/kits/qualquer.pdf",
      kitAssinaturaEm: new Date(),
    });
    expect(
      permitiu(guarda(comKit)),
      "kit materializado esperando disparo passou: o envelope nasceria com o pacote antigo",
    ).toBe(false);
  });

  it("ela NÃO olha o farol: `ADMISSAO_CONCLUIDA` é flag manual e não prova nada", async () => {
    const guarda = await guardaDeDominio();
    if (!guarda) return expect.fail("guarda de domínio ausente");
    const veredito = guarda(estado({ farolGlobal: "ADMISSAO_CONCLUIDA" }));
    expect(
      permitiu(veredito),
      "a guarda recusou por farol: `ADMISSAO_CONCLUIDA` é manual até a INT-4 e passaria batido " +
        "no caminho inverso, então ele não pode ser o critério",
    ).toBe(true);
  });

  it("ela PERMITE o caso normal", async () => {
    const guarda = await guardaDeDominio();
    if (!guarda) return expect.fail("guarda de domínio ausente");
    expect(permitiu(guarda(estado({})))).toBe(true);
  });

  it("AS PORTAS QUE RECUAM a chamam: guarda em uma porta de duas não é guarda", () => {
    for (const porta of PORTAS_QUE_RECUAM) {
      const fonte = semComentarios(readFileSync(porta.caminho, "utf8"));
      expect(
        /reabertura|podeReabrir|guardaDe/i.test(fonte),
        `a porta "${porta.nome}" (${porta.caminho.split("/").pop()}) não consulta a guarda`,
      ).toBe(true);
    }
  });

  it("nenhuma porta escreve a própria versão da guarda", () => {
    for (const porta of PORTAS) {
      const fonte = semComentarios(readFileSync(porta.caminho, "utf8"));
      expect(
        fonte,
        `a porta "${porta.nome}" compara o status da Clicksign à mão: régua repetida diverge`,
      ).not.toMatch(/clicksignStatus\s*===\s*["']ASSINADO["']/);
    }
  });
});

// ══ 4. IDEMPOTÊNCIA ══════════════════════════════════════════════════════════════════════════

describe("4. reabrir duas vezes não recua duas vezes", () => {
  it("o recuo só age sobre frente CONCLUÍDA: o segundo clique não tem o que desfazer", () => {
    if (!RECUO) return expect.fail("módulo do recuo ausente");
    expect(
      RECUO.fonte,
      "sem checar o estado atual da frente, o segundo descarte grava outro evento de reversão",
    ).toMatch(/concluida|ANALISE_OK/);
  });

  it("o resultado diz se houve recuo, e o contrato tem os cinco campos", () => {
    const contrato = readFileSync(
      join(SRC, "..", "..", "..", "packages", "shared-types", "src", "index.ts"),
      "utf8",
    );
    const bloco = contrato.slice(contrato.indexOf("interface ResultadoDaReaberturaDeDocumento"));
    const corpo = bloco.slice(0, bloco.indexOf("}"));
    for (const campo of [
      "reaberto",
      "frenteRecuou",
      "cadastroDerrubado",
      "farolAtualizado",
      "avisoDrive",
    ]) {
      expect(corpo, `falta ${campo} no resultado`).toMatch(new RegExp(`${campo}\\s*:`));
    }
    expect(corpo, "o motivo saiu do contrato (§A.31) e não pode voltar por aqui").not.toMatch(
      /motivo/,
    );
  });
});

// ══ APOIO ════════════════════════════════════════════════════════════════════════════════════

/**
 * O ESTADO DA ADMISSÃO, em SUPERCONJUNTO de propósito: o batismo dos campos é de quem constrói, e
 * o requisito é o comportamento. Mandar os dois vocabulários deixa o teste falar sobre a REGRA
 * (contrato vivo barra, envelope morto libera) e não sobre o nome da coluna.
 */
function estado(p: Record<string, unknown>): never {
  return {
    clicksignStatus: "SEM_ENVELOPE",
    kitGerado: false,
    kitAssinaturaPath: null,
    kitAssinaturaEm: null,
    farolGlobal: "EM_ADMISSAO",
    ...p,
  } as never;
}

/** Qualquer forma de "sim" que a guarda escolha devolver: booleano ou objeto com veredito. */
function permitiu(veredito: unknown): boolean {
  if (typeof veredito === "boolean") return veredito;
  if (veredito && typeof veredito === "object") {
    const o = veredito as Record<string, unknown>;
    if (typeof o.ok === "boolean") return o.ok;
    if (typeof o.pode === "boolean") return o.pode;
    if (typeof o.permitido === "boolean") return o.permitido;
    if (typeof o.recusado === "boolean") return !o.recusado;
    if ("motivoCodigo" in o) return o.motivoCodigo === null;
  }
  return false;
}

function varrer(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === "dist") continue;
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...varrer(caminho));
    else if (entrada.name.endsWith(".ts")) achados.push(caminho);
  }
  return achados;
}

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
