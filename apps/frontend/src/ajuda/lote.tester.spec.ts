/**
 * ─ A ASSERÇÃO DE ARRANQUE DO LOTE (veto do `seguranca`, achado 4) ───────────────────────────────
 *
 * ESCRITO PELO `tester`, contra o requisito, com o motor nascendo em paralelo (§A.38, §A.40).
 *
 * ┌─ O FURO, E POR QUE ELE É O MAIS PERIGOSO DE TODOS ───────────────────────────────────────────┐
 * │ A homologação está anonimizada HOJE. Isso é ESTADO, não CONTROLE: ninguém o impõe, e o        │
 * │ re-clone da produção o desfaz em um comando. As travas que o desenho previu (§3.4, item 1)    │
 * │ conferem a URL base e o NOME do database, e as duas continuam VERDADEIRAS numa base           │
 * │ recém-clonada e cheia de gente real. O motor arrancaria feliz, e o gate por tela seria a      │
 * │ única barreira, exatamente no cenário em que ele tem 400 chances de errar uma vez.            │
 * │                                                                                               │
 * │ A trava certa é de POPULAÇÃO, e vem ANTES da primeira captura: se existe UMA linha fora do    │
 * │ padrão sintético em `candidatos` ou em `usuarios`, o lote inteiro não começa. Falha dura, uma │
 * │ vez, no arranque, em vez de 400 decisões individuais.                                          │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE ESTE TESTE NÃO TOCA O BANCO, E ISSO É O PONTO ──────────────────────────────────────┐
 * │ Um teste que consultasse a homologação de verdade ficaria VERDE POR SORTE: verde hoje porque  │
 * │ a base está anonimizada, e mudo no dia do re-clone, que é justamente o dia em que ele tinha   │
 * │ de gritar. Aqui as linhas são INJETADAS, então o teste mede a REGRA, e a regra continua        │
 * │ medida em qualquer estado do banco.                                                            │
 * └───────────────────────────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it, vi } from "vitest";
import {
  conferirBaseAntesDoLote,
  type DependenciasLote,
  executarLote,
  type LinhaPessoa,
  type TabelaDePessoas,
} from "./lote";
import type { AllowlistArnes } from "./pii";

const ALLOWLIST: AllowlistArnes = {
  nomes: ["Mariana Alves Ribeiro", "Carlos Eduardo Nunes"],
  cpfs: ["99900000191", "99900000272"],
  emails: ["mariana.alves@exemplo.invalid", "carlos.nunes@exemplo.invalid"],
};

const SINTETICOS: LinhaPessoa[] = [
  { nome: "Mariana Alves Ribeiro", cpf: "99900000191", email: "mariana.alves@exemplo.invalid" },
  { nome: "Carlos Eduardo Nunes", cpf: "99900000272", email: "carlos.nunes@exemplo.invalid" },
];

const USUARIOS_SINTETICOS: LinhaPessoa[] = [
  { nome: "Usuario De Captura", email: "captura@exemplo.invalid" },
];

const UMA_PESSOA_REAL: LinhaPessoa = {
  nome: "Juliana Petrocelli Barbosa",
  cpf: "12345678909",
  email: "juliana.barbosa@gmail.com",
};

function deps(over: Partial<DependenciasLote> = {}): DependenciasLote {
  return {
    allowlist: ALLOWLIST,
    /**
     * ─ OBRIGATÓRIO NO TIPO, E ESTA É A TERCEIRA VEZ NA MESMA FRENTE ────────────────────────────
     *
     * PARÂMETRO OPCIONAL EM CONTROLE DE SEGURANÇA É FAIL-OPEN SILENCIOSO. Foi assim com o
     * `negados`: enquanto era `negados?`, o caminho que GRAVA descartava a denylist e nada
     * quebrava, nem typecheck nem os testes. Depois com o `contarLinhasDaArea`. Agora aqui.
     *
     * E o motivo de ele ter nascido opcional NÃO foi desenho, foi PROCESSO: torná-lo obrigatório
     * quebraria este stub, e quem constrói não pode editar os meus specs (§A.38). Então a linha
     * abaixo é o que destrava a obrigatoriedade, e é por isso que ela existe mesmo nos testes que
     * não medem coluna nenhuma.
     */
    amostrarColunaDePessoa: vi.fn(async () => []),
    amostrarPessoas: vi.fn(async (tabela: TabelaDePessoas) =>
      tabela === "candidatos" ? SINTETICOS : USUARIOS_SINTETICOS,
    ),
    ...over,
  };
}

describe("conferirBaseAntesDoLote: a base inteira, antes do primeiro print", () => {
  it("APROVA quando toda a população é do padrão sintético", async () => {
    const v = await conferirBaseAntesDoLote(deps());
    expect(v.aprovado).toBe(true);
    expect(v.totalForaDoPadrao).toBe(0);
  });

  it("RECUSA com UMA linha fora do padrão em `candidatos`", async () => {
    const v = await conferirBaseAntesDoLote(
      deps({
        amostrarPessoas: vi.fn(async (t) =>
          t === "candidatos" ? [...SINTETICOS, UMA_PESSOA_REAL] : USUARIOS_SINTETICOS,
        ),
      }),
    );
    expect(v.aprovado).toBe(false);
    expect(v.totalForaDoPadrao).toBeGreaterThan(0);
    expect(v.tabelas).toContain("candidatos");
  });

  /**
   * `usuarios` É A TABELA QUE TODO MUNDO ESQUECE, e ela aparece em print: a tela de Usuários, o
   * seletor de responsável, o "criado por" da trilha e o canto do cabeçalho. São colegas de casa,
   * com nome e e-mail corporativo, e o clone da produção os traz inteiros.
   */
  it("RECUSA com UMA linha fora do padrão em `usuarios`", async () => {
    const v = await conferirBaseAntesDoLote(
      deps({
        amostrarPessoas: vi.fn(async (t) =>
          t === "candidatos"
            ? SINTETICOS
            : [...USUARIOS_SINTETICOS, { nome: "Henrique Vieira", email: "henrique.vieira@soulan.com.br" }],
        ),
      }),
    );
    expect(v.aprovado).toBe(false);
    expect(v.tabelas).toContain("usuarios");
  });

  it("confere as DUAS tabelas, sempre, e não para na primeira", async () => {
    const amostrarPessoas = vi.fn(async (t: TabelaDePessoas) =>
      t === "candidatos" ? SINTETICOS : USUARIOS_SINTETICOS,
    );
    await conferirBaseAntesDoLote(deps({ amostrarPessoas }));
    expect(amostrarPessoas).toHaveBeenCalledWith("candidatos");
    expect(amostrarPessoas).toHaveBeenCalledWith("usuarios");
  });

  /**
   * ─ A TRAVA É DE POPULAÇÃO, NÃO DE NOME DE BANCO ──────────────────────────────────────────────
   *
   * Este é o teste que descreve o cenário real do re-clone: a URL é a da homologação (§A.32), o
   * database se chama `ea_automatic_homolog`, e as duas travas do desenho dizem "pode ir". A base,
   * clonada ontem, está cheia de gente. Se este teste ficar verde com a base suja, o veto do
   * `seguranca` não foi atendido, só reescrito.
   */
  it("URL e nome de database de homologação NÃO salvam base suja", async () => {
    const v = await conferirBaseAntesDoLote({
      ...deps({
        amostrarPessoas: vi.fn(async (t) =>
          t === "candidatos" ? [UMA_PESSOA_REAL] : USUARIOS_SINTETICOS,
        ),
      }),
      baseUrl: "http://10.18.117.235:3120",
      databaseUrl: "postgres://ea:***@127.0.0.1:5433/ea_automatic_homolog",
    });
    expect(v.aprovado).toBe(false);
  });

  /**
   * AMOSTRA VAZIA TAMBÉM RECUSA. Zero linha em `candidatos` não é base limpa: é consulta que
   * falhou, credencial errada ou tabela renomeada. Aprovar aqui é transformar qualquer erro de
   * leitura em licença para capturar (falha ABERTA no dia do defeito).
   */
  it("RECUSA quando a amostra vem vazia: consulta que não devolve nada não é prova de limpeza", async () => {
    const v = await conferirBaseAntesDoLote(deps({ amostrarPessoas: vi.fn(async () => []) }));
    expect(v.aprovado).toBe(false);
  });

  /**
   * O MOTIVO PRECISA SER LEGÍVEL E SEM PII (§A.6). Quem lê o erro tem de entender que o problema é
   * a BASE, e não o artigo que estava capturando. E o nome da pessoa encontrada NÃO pode ir para a
   * mensagem, porque a mensagem vai para o log do CI, que é onde o dado sobrevive.
   */
  it("o motivo aponta a base, sem carregar o nome nem o CPF encontrados", async () => {
    const v = await conferirBaseAntesDoLote(
      deps({ amostrarPessoas: vi.fn(async () => [UMA_PESSOA_REAL]) }),
    );
    const motivo = String(v.motivo ?? "");
    expect(motivo.length).toBeGreaterThan(0);
    expect(motivo).not.toContain("Juliana");
    expect(motivo).not.toContain("12345678909");
    expect(motivo).not.toContain("juliana.barbosa@gmail.com");
  });
});

describe("executarLote: a conferência vem ANTES de qualquer captura", () => {
  const roteiros = [{ slug: "anexar-o-aso" }, { slug: "liberar-da-fila" }];

  it("com a base suja, NENHUMA captura acontece e o lote falha", async () => {
    const capturar = vi.fn(async () => {});
    const d = {
      ...deps({ amostrarPessoas: vi.fn(async () => [UMA_PESSOA_REAL]) }),
      capturar,
    };
    await expect(executarLote(roteiros, d)).rejects.toThrow();
    expect(capturar).not.toHaveBeenCalled();
  });

  it("com a base limpa, o lote roda e captura cada roteiro", async () => {
    const capturar = vi.fn(async () => {});
    await executarLote(roteiros, { ...deps(), capturar });
    expect(capturar).toHaveBeenCalledTimes(2);
  });

  /**
   * A ORDEM É O REQUISITO, e não um detalhe de implementação: conferir a base DEPOIS de capturar o
   * primeiro print já gravou o primeiro print.
   */
  it("a amostragem da base acontece antes da primeira captura", async () => {
    const ordem: string[] = [];
    const amostrarPessoas = vi.fn(async (t: TabelaDePessoas) => {
      ordem.push(`amostra:${t}`);
      return t === "candidatos" ? SINTETICOS : USUARIOS_SINTETICOS;
    });
    const capturar = vi.fn(async () => {
      ordem.push("captura");
    });
    await executarLote(roteiros, { ...deps({ amostrarPessoas }), capturar });
    expect(ordem[0]).toMatch(/^amostra:/);
    expect(ordem.indexOf("captura")).toBeGreaterThan(ordem.lastIndexOf("amostra:usuarios"));
  });
});
