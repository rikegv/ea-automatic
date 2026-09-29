/**
 * ─ ALVO NÃO ENCONTRADO É FALHA DURA, E NENHUM PNG PARCIAL É GRAVADO (§3.2 item 3, §7 detector 1) ─
 *
 * ESCRITO PELO `tester` CONTRA O REQUISITO, com o motor ainda nascendo (§A.38, §A.40).
 *
 * ┌─ POR QUE ESTE É O DETECTOR DE ARTIGO VELHO, E NÃO UM DETALHE DE ROBUSTEZ ────────────────────┐
 * │ O alvo é descrito por PAPEL e NOME acessível. O dia em que alguém renomeia o botão, o alvo    │
 * │ deixa de resolver, e ESSE é o sinal de que o artigo envelheceu, o único que chega sozinho e   │
 * │ a tempo. Se o motor gravar o print assim mesmo, o manual passa a mostrar uma tela SEM A SETA  │
 * │ e com o passo apontando para um botão que mudou de nome: ensina o errado com a autoridade da  │
 * │ casa, e quem foi ensinado errado não desconfia. Print sem seta é pior que print faltando,     │
 * │ porque parece certo.                                                                          │
 * │                                                                                               │
 * │ O spike (`scratchpad/spike-anotacao.mjs`) só imprime "AVISO" neste caso. Aviso que ninguém lê │
 * │ é a diferença entre detecção e esperança, e é o conserto 3 dos sete da §3.2.                  │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A COSTURA QUE ESTE TESTE EXIGE DO MOTOR, e o porquê ────────────────────────────────────────┐
 * │ `executarCaptura` recebe as dependências por PARÂMETRO (resolver alvo, ler texto, anotar,     │
 * │ capturar, gravar). Sem essa costura, a regra "não grava PNG parcial" só é conferível          │
 * │ subindo um navegador de verdade: vira teste lento, instável e que ninguém roda no gate, e a   │
 * │ regra passa a depender de leitura de código. Com a costura, a regra é medida em milissegundos │
 * │ e QUEBRA quando alguém a afrouxar, que é o ponto inteiro do §A.33 aplicado aqui.              │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it, vi } from "vitest";
import { type DependenciasCaptura, executarCaptura, OPCOES_NAVEGADOR_CAPTURA } from "./captura";
import type { AllowlistArnes } from "./pii";
import type { Alvo, Captura } from "./tipos";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro"],
  cpfs: ["99900000191"],
  emails: ["mariana.alves@exemplo.invalid"],
  telefones: ["(11) 00000-0000"],
};

const TEXTO_LIMPO = "Esteira Admissional · Mariana Alves Ribeiro · 999.000.001-91";

const CAIXA = { x: 100, y: 200, largura: 180, altura: 40 };

const ALVO_BOTAO: Alvo = { papel: "button", nome: "Anexar ASO", texto: "1. Anexar o ASO" };
const ALVO_ABA: Alvo = { papel: "tab", nome: "Exame", texto: "2. Aba Exame" };

// `Captura` (era `Print`): o contrato mudou e os alvos passaram a viver SÓ no roteiro. Anotação de
// tipo, nenhuma asserção deste arquivo mudou.
function print(alvos: Alvo[]): Captura {
  return { arquivo: "01-anexar-aso.png", legenda: "Passo 1: anexe o ASO", alvos };
}

/** Dependências felizes: tudo resolve, a tela é sintética, e gravar funciona. */
function depsFelizes(over: Partial<DependenciasCaptura> = {}): DependenciasCaptura {
  return {
    allowlist: ALLOWLIST,
    // ACRESCENTADO PELO `devops` (só esta linha, nenhuma asserção deste arquivo mudou): `negados`
    // passou a ser OBRIGATÓRIO em `DependenciasCaptura` por exigência do `seguranca`, porque
    // parâmetro opcional em controle de segurança é fail-open silencioso. A lista vazia aqui é
    // DECLARADA de propósito: este arquivo mede as duas regras duras da captura (alvo perdido e
    // nenhum PNG parcial), não a denylist de equipe, e a cobertura dela é do `tester` (§A.38).
    negados: { nomes: [], emails: [] },
    resolverAlvo: vi.fn(async () => CAIXA),
    lerTextoDaTela: vi.fn(async () => TEXTO_LIMPO),
    anotar: vi.fn(async () => {}),
    capturarPng: vi.fn(async () => Buffer.from("png")),
    /**
     * ─ OBRIGATÓRIO NO TIPO, PELO MESMO MOTIVO DO `negados` (terceira vez nesta frente) ─────────
     *
     * PARÂMETRO OPCIONAL EM CONTROLE DE SEGURANÇA É FAIL-OPEN SILENCIOSO: com
     * `contarLinhasDaArea?`, a casca que esquecesse de passá-lo recebia `{ listas: 0, linhas: 0 }`
     * e a régua de lista povoada ficava DESLIGADA em silêncio, exatamente como a denylist ficava
     * quando `negados` era opcional. Ele nasceu opcional por PROCESSO (torná-lo obrigatório
     * quebraria este stub, e quem constrói não pode editar os meus specs, §A.38), e esta linha é o
     * que destrava a obrigatoriedade.
     *
     * DUAS LINHAS É O PADRÃO DA FIXTURE de propósito: a tela povoada é o caso normal, e a lista
     * vazia é a exceção que cada teste declara quando ela é o assunto.
     */
    contarLinhasDaArea: vi.fn(async () => ({ listas: 1, linhas: 2 })),
    gravar: vi.fn(async () => {}),
    ...over,
  };
}

describe("executarCaptura: o caminho que GRAVA (a aprovação gêmea)", () => {
  /**
   * Um motor que nunca grava passa em todo teste de recusa. Esta é a prova de que o caminho bom
   * continua existindo, e ela vem antes das recusas de propósito.
   */
  it("com todos os alvos resolvidos e a tela sintética, grava UMA vez", async () => {
    const deps = depsFelizes();
    await executarCaptura("anexar-o-aso", print([ALVO_BOTAO, ALVO_ABA]), deps);

    expect(deps.capturarPng).toHaveBeenCalledTimes(1);
    expect(deps.gravar).toHaveBeenCalledTimes(1);
    const caminho = String((deps.gravar as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(caminho).toContain("anexar-o-aso");
    expect(caminho).toContain("01-anexar-aso.png");
  });

  it("anota TODOS os alvos do print, não só o primeiro", async () => {
    const deps = depsFelizes();
    await executarCaptura("anexar-o-aso", print([ALVO_BOTAO, ALVO_ABA]), deps);
    expect(deps.resolverAlvo).toHaveBeenCalledTimes(2);
    expect(deps.anotar).toHaveBeenCalledTimes(1);
  });
});

describe("executarCaptura: alvo que não resolve DERRUBA a captura", () => {
  it("rejeita quando o alvo sumiu da tela", async () => {
    const deps = depsFelizes({ resolverAlvo: vi.fn(async () => null) });
    await expect(executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps)).rejects.toThrow();
  });

  /**
   * A MENSAGEM É O PRODUTO DESTE DETECTOR. Quem lê o CI seis meses depois precisa saber, sem abrir
   * nada, QUAL artigo, QUAL print e QUAL elemento morreu. "Alvo não encontrado" sozinho obriga a
   * pessoa a reproduzir a captura para descobrir o que o motor já sabia.
   */
  it("a mensagem nomeia o artigo, o arquivo do print e o alvo", async () => {
    const deps = depsFelizes({ resolverAlvo: vi.fn(async () => null) });
    const erro = await executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps).catch(
      (e: unknown) => e as Error,
    );
    const msg = String((erro as Error).message);
    expect(msg).toContain("anexar-o-aso");
    expect(msg).toContain("01-anexar-aso.png");
    expect(msg).toContain("Anexar ASO");
  });

  it("NÃO grava arquivo nenhum quando o alvo não resolve", async () => {
    const deps = depsFelizes({ resolverAlvo: vi.fn(async () => null) });
    await executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps).catch(() => {});
    expect(deps.capturarPng).not.toHaveBeenCalled();
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  /**
   * ─ O CASO QUE UM MOTOR INGÊNUO DEIXA PASSAR ───────────────────────────────────────────────────
   *
   * Dois alvos, o primeiro resolve e o segundo não. Quem valida alvo a alvo DENTRO do laço de
   * desenho já desenhou a primeira seta quando descobre o problema, e a tentação (ou o `try` mal
   * colocado) é salvar o que deu certo. O resultado é o pior print possível: uma seta certa e uma
   * faltando, com cara de print completo. Todos os alvos resolvem ANTES de qualquer efeito.
   */
  it("com dois alvos e só um resolvendo, não grava PNG PARCIAL", async () => {
    const resolverAlvo = vi.fn(async (a: Alvo) => (a.nome === "Anexar ASO" ? CAIXA : null));
    const deps = depsFelizes({ resolverAlvo });
    await executarCaptura("anexar-o-aso", print([ALVO_BOTAO, ALVO_ABA]), deps).catch(() => {});
    expect(deps.capturarPng).not.toHaveBeenCalled();
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("o alvo que falhou é identificado mesmo sendo o SEGUNDO da lista", async () => {
    const resolverAlvo = vi.fn(async (a: Alvo) => (a.nome === "Anexar ASO" ? CAIXA : null));
    const deps = depsFelizes({ resolverAlvo });
    const erro = await executarCaptura("anexar-o-aso", print([ALVO_BOTAO, ALVO_ABA]), deps).catch(
      (e: unknown) => e as Error,
    );
    expect(String((erro as Error).message)).toContain("Exame");
  });
});

describe("executarCaptura: o gate de PII recusa ANTES de existir arquivo (§A.6, §3.4)", () => {
  it("rejeita quando a tela carrega dado de fora do arnês", async () => {
    const deps = depsFelizes({
      lerTextoDaTela: vi.fn(async () => "Juliana Petrocelli Barbosa · 123.456.789-09"),
    });
    await expect(executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps)).rejects.toThrow();
  });

  /**
   * NÃO BASTA REJEITAR: não pode existir BYTE no disco. O PNG gravado e apagado depois já foi
   * gravado, e se o passo seguinte do lote for um `git add` do diretório, ele entra no commit. A
   * ordem obrigatória é ler o texto, auditar, e só então capturar.
   */
  it("não chega a capturar nem a gravar: a auditoria vem ANTES do screenshot", async () => {
    const deps = depsFelizes({
      lerTextoDaTela: vi.fn(async () => "Juliana Petrocelli Barbosa · 123.456.789-09"),
    });
    await executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps).catch(() => {});
    expect(deps.capturarPng).not.toHaveBeenCalled();
    expect(deps.gravar).not.toHaveBeenCalled();
  });

  it("a mensagem diz o artigo e o print, e o TIPO do achado", async () => {
    const deps = depsFelizes({
      lerTextoDaTela: vi.fn(async () => "Juliana Petrocelli Barbosa · 123.456.789-09"),
    });
    const erro = await executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps).catch(
      (e: unknown) => e as Error,
    );
    const msg = String((erro as Error).message);
    expect(msg).toContain("anexar-o-aso");
    expect(msg).toContain("01-anexar-aso.png");
    expect(msg).toContain("CPF");
  });

  /**
   * A TELA VAZIA TAMBÉM DERRUBA, pelo mesmo motivo do `pii.tester.spec.ts`: tela sem texto é
   * captura que aconteceu antes de a página carregar, e gravar isso é encher o manual de imagem
   * branca com carimbo de gate verde.
   */
  it("tela sem texto nenhum derruba a captura em vez de gravar imagem em branco", async () => {
    const deps = depsFelizes({ lerTextoDaTela: vi.fn(async () => "") });
    await expect(executarCaptura("anexar-o-aso", print([ALVO_BOTAO]), deps)).rejects.toThrow();
    expect(deps.gravar).not.toHaveBeenCalled();
  });
});

/**
 * ─ TRACE E VÍDEO DO PLAYWRIGHT (veto do `seguranca`, achado 5) ─────────────────────────────────
 *
 * ┌─ O ARTEFATO QUE VAZA MAIS QUE O PRÓPRIO PRINT ───────────────────────────────────────────────┐
 * │ O trace do Playwright grava SNAPSHOT DO DOM a cada ação, e o snapshot carrega valor de campo  │
 * │ em texto claro, ou seja, a SENHA digitada no login da captura, mais tudo o que o gate de PII  │
 * │ recusou por tela. O vídeo grava a navegação inteira, inclusive as telas de passagem que nunca │
 * │ viraram print e por isso nunca passaram por gate nenhum.                                      │
 * │                                                                                               │
 * │ Pior: o trace é o primeiro artefato que alguém anexa a um relatório de falha, e ele nasce de  │
 * │ um `trace: "on"` colocado às três da manhã para entender um alvo que não resolvia. Por isso a │
 * │ trava é uma CONSTANTE exportada e conferida, e não uma linha de opção perdida no meio do      │
 * │ motor: aqui, ligar o trace quebra o gate ANTES de existir arquivo.                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
describe("OPCOES_NAVEGADOR_CAPTURA: o motor não produz trace nem vídeo", () => {
  it("não grava vídeo e não grava HAR", () => {
    const o = OPCOES_NAVEGADOR_CAPTURA as Record<string, unknown>;
    expect(o.recordVideo).toBeUndefined();
    expect(o.recordHar).toBeUndefined();
  });

  it("não grava trace", () => {
    const o = OPCOES_NAVEGADOR_CAPTURA as Record<string, unknown>;
    // Aceita as duas formas: ausente, ou explicitamente desligado.
    const trace = (o.trace ?? o.tracing) as unknown;
    expect(trace === undefined || trace === false || trace === "off").toBe(true);
  });

  /**
   * O JSON INTEIRO NÃO PODE MENCIONAR trace, vídeo, HAR NEM DOWNLOAD. É uma varredura burra de
   * propósito: ela pega a opção nova que alguém acrescentar amanhã com outro nome, que é o caminho
   * real pelo qual essa porta se reabre.
   */
  it("nenhuma opção de gravação de artefato aparece nas opções, com nome nenhum", () => {
    const texto = JSON.stringify(OPCOES_NAVEGADOR_CAPTURA ?? {}).toLowerCase();
    for (const proibido of ["video", "trace", "har", "downloadspath"]) {
      expect(texto, `a opção "${proibido}" não pode existir nas opções de captura`).not.toContain(
        proibido,
      );
    }
  });

  /**
   * A CONTRAPARTIDA, para o teste acima não virar um "objeto vazio passa": as opções que o desenho
   * EXIGE precisam estar lá (§3.2, consertos 5 e 6). Sem elas o motor não é determinístico, e o
   * diff do git acusa mudança em print que ninguém mexeu.
   */
  it("as opções que o desenho exige estão presentes: 1600x1000, escala 2 e tema claro", () => {
    const o = OPCOES_NAVEGADOR_CAPTURA as Record<string, unknown>;
    expect(o.viewport).toEqual({ width: 1600, height: 1000 });
    expect(o.deviceScaleFactor).toBe(2);
    expect(o.colorScheme).toBe("light");
  });
});
